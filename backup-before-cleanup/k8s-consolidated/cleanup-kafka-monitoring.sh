#!/bin/bash

# Cleanup script for Kafka monitoring
# Removes all deployed resources

set -e

NAMESPACE="${NAMESPACE:-strimzi-kafka}"
REMOVE_KAFKA="${1:-monitoring}"  # monitoring, kafka, or all

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${YELLOW}=== Kafka Monitoring Cleanup ===${NC}"
echo "Namespace: $NAMESPACE"
echo "Remove: $REMOVE_KAFKA"
echo

if [[ "$REMOVE_KAFKA" == "all" ]]; then
    echo -e "${RED}WARNING: This will remove the entire Kafka cluster and all data!${NC}"
    echo -n "Are you sure? (yes/no): "
    read confirmation
    if [[ "$confirmation" != "yes" ]]; then
        echo "Cleanup cancelled"
        exit 0
    fi
fi

# Remove monitoring components
if [[ "$REMOVE_KAFKA" == "monitoring" || "$REMOVE_KAFKA" == "all" ]]; then
    echo -e "${YELLOW}Removing monitoring components...${NC}"
    
    # Remove deployments
    kubectl delete deployment nri-kafka-msk-enhanced -n $NAMESPACE 2>/dev/null || true
    kubectl delete daemonset nri-kafka -n $NAMESPACE 2>/dev/null || true
    
    # Remove test workloads
    kubectl delete deployment -l app=kafka-test-producer -n $NAMESPACE 2>/dev/null || true
    kubectl delete deployment -l app=kafka-test-consumer -n $NAMESPACE 2>/dev/null || true
    kubectl delete deployment kafka-producer-high-throughput -n $NAMESPACE 2>/dev/null || true
    kubectl delete deployment kafka-consumer-group-1 -n $NAMESPACE 2>/dev/null || true
    kubectl delete deployment kafka-consumer-group-2 -n $NAMESPACE 2>/dev/null || true
    kubectl delete deployment kafka-consumer-lag-simulator -n $NAMESPACE 2>/dev/null || true
    kubectl delete job kafka-initial-data-loader -n $NAMESPACE 2>/dev/null || true
    
    # Remove configs
    kubectl delete configmap nri-kafka-config -n $NAMESPACE 2>/dev/null || true
    kubectl delete configmap nri-kafka-config-complete -n $NAMESPACE 2>/dev/null || true
    kubectl delete configmap nri-kafka-msk-enhanced-config -n $NAMESPACE 2>/dev/null || true
    
    # Remove RBAC
    kubectl delete clusterrolebinding nri-kafka 2>/dev/null || true
    kubectl delete clusterrole nri-kafka 2>/dev/null || true
    kubectl delete serviceaccount nri-kafka -n $NAMESPACE 2>/dev/null || true
    
    echo -e "${GREEN}Monitoring components removed${NC}"
fi

# Remove Kafka cluster
if [[ "$REMOVE_KAFKA" == "kafka" || "$REMOVE_KAFKA" == "all" ]]; then
    echo -e "${YELLOW}Removing Kafka cluster...${NC}"
    
    # Remove topics
    kubectl delete kafkatopics --all -n $NAMESPACE 2>/dev/null || true
    
    # Remove Kafka cluster
    kubectl delete kafka production-kafka -n $NAMESPACE 2>/dev/null || true
    
    # Remove metrics configmap
    kubectl delete configmap kafka-metrics -n $NAMESPACE 2>/dev/null || true
    
    echo -e "${GREEN}Kafka cluster removed${NC}"
fi

# Remove Strimzi operator (only with 'all')
if [[ "$REMOVE_KAFKA" == "all" ]]; then
    echo -e "${YELLOW}Removing Strimzi operator...${NC}"
    kubectl delete deployment strimzi-cluster-operator -n $NAMESPACE 2>/dev/null || true
    kubectl delete -f "https://strimzi.io/install/latest?namespace=$NAMESPACE" -n $NAMESPACE 2>/dev/null || true
    echo -e "${GREEN}Strimzi operator removed${NC}"
fi

# Clean up secrets (but preserve license key)
echo -e "${YELLOW}Cleaning up...${NC}"
kubectl delete secret -l app=nri-kafka -n $NAMESPACE 2>/dev/null || true

# Show remaining resources
echo
echo -e "${YELLOW}Remaining resources in namespace $NAMESPACE:${NC}"
kubectl get all -n $NAMESPACE

echo
echo -e "${GREEN}Cleanup complete!${NC}"