#!/bin/bash

# Verify Kafka MSK monitoring deployment

set -e

echo "================================================"
echo "Kafka MSK Monitoring Deployment Verification"
echo "================================================"
echo "Time: $(date)"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Verification functions
verify_kubernetes() {
    echo -e "${BLUE}=== Kubernetes Environment ===${NC}"
    
    # Check context
    echo -e "\n${YELLOW}Current context:${NC}"
    kubectl config current-context
    
    # Check nodes
    echo -e "\n${YELLOW}Nodes:${NC}"
    kubectl get nodes -o wide
    
    # Check namespaces
    echo -e "\n${YELLOW}Namespaces:${NC}"
    kubectl get namespaces | grep -E "(kafka|newrelic|strimzi)" || echo "No relevant namespaces found"
}

verify_kafka_deployment() {
    echo -e "\n${BLUE}=== Kafka Deployment ===${NC}"
    
    # Check Kafka pods
    echo -e "\n${YELLOW}Kafka pods:${NC}"
    kubectl get pods -n kafka -o wide 2>/dev/null || echo "Kafka namespace not found"
    
    # Check Kafka services
    echo -e "\n${YELLOW}Kafka services:${NC}"
    kubectl get svc -n kafka 2>/dev/null || echo "No Kafka services found"
    
    # Check StatefulSet
    echo -e "\n${YELLOW}Kafka StatefulSet:${NC}"
    kubectl get statefulset -n kafka 2>/dev/null || echo "No StatefulSet found"
    
    # Check PVCs
    echo -e "\n${YELLOW}Persistent Volume Claims:${NC}"
    kubectl get pvc -n kafka 2>/dev/null || echo "No PVCs found"
}

verify_monitoring_deployment() {
    echo -e "\n${BLUE}=== Monitoring Deployment ===${NC}"
    
    # Check monitoring pods
    echo -e "\n${YELLOW}New Relic pods:${NC}"
    kubectl get pods -n newrelic -o wide 2>/dev/null || echo "New Relic namespace not found"
    
    # Check DaemonSet
    echo -e "\n${YELLOW}nri-kafka DaemonSet:${NC}"
    kubectl get daemonset -n newrelic 2>/dev/null || echo "No DaemonSet found"
    
    # Check ConfigMap
    echo -e "\n${YELLOW}Configuration:${NC}"
    kubectl get configmap -n newrelic 2>/dev/null || echo "No ConfigMaps found"
    
    # Check ServiceAccount and RBAC
    echo -e "\n${YELLOW}ServiceAccount and RBAC:${NC}"
    kubectl get serviceaccount,clusterrole,clusterrolebinding | grep nri-kafka || echo "RBAC not configured"
}

verify_jmx_connectivity() {
    echo -e "\n${BLUE}=== JMX Connectivity ===${NC}"
    
    # Test JMX port on each Kafka broker
    echo -e "\n${YELLOW}Testing JMX ports:${NC}"
    
    # Get Kafka pods
    KAFKA_PODS=$(kubectl get pods -n kafka -l app=kafka -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")
    
    if [ -n "$KAFKA_PODS" ]; then
        for pod in $KAFKA_PODS; do
            echo -n "Testing JMX on $pod... "
            if kubectl exec -n kafka $pod -- nc -zv localhost 9999 2>&1 | grep -q "succeeded"; then
                echo -e "${GREEN}✓ Connected${NC}"
            else
                echo -e "${RED}✗ Failed${NC}"
            fi
        done
    else
        echo "No Kafka pods found to test"
    fi
}

verify_kafka_functionality() {
    echo -e "\n${BLUE}=== Kafka Functionality ===${NC}"
    
    # List topics
    echo -e "\n${YELLOW}Kafka topics:${NC}"
    kubectl exec -n kafka kafka-0 -- kafka-topics.sh --list --bootstrap-server localhost:9092 2>/dev/null || echo "Could not list topics"
    
    # Check consumer groups
    echo -e "\n${YELLOW}Consumer groups:${NC}"
    kubectl exec -n kafka kafka-0 -- kafka-consumer-groups.sh --list --bootstrap-server localhost:9092 2>/dev/null || echo "Could not list consumer groups"
    
    # Check test workloads
    echo -e "\n${YELLOW}Test workloads:${NC}"
    kubectl get deployments -n kafka 2>/dev/null | grep -E "(producer|consumer)" || echo "No test workloads found"
}

verify_logs() {
    echo -e "\n${BLUE}=== Recent Logs ===${NC}"
    
    # Check nri-kafka logs
    echo -e "\n${YELLOW}nri-kafka logs (last 20 lines):${NC}"
    kubectl logs -l app=nri-kafka -n newrelic --tail=20 2>/dev/null || echo "No nri-kafka logs found"
    
    # Check for errors
    echo -e "\n${YELLOW}Checking for errors:${NC}"
    kubectl logs -l app=nri-kafka -n newrelic --tail=100 2>/dev/null | grep -i error | tail -5 || echo "No recent errors found"
}

verify_msk_shim() {
    echo -e "\n${BLUE}=== MSK Shim Verification ===${NC}"
    
    # Check MSK environment variables
    echo -e "\n${YELLOW}MSK configuration in pods:${NC}"
    POD=$(kubectl get pods -n newrelic -l app=nri-kafka -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    
    if [ -n "$POD" ]; then
        echo "Checking environment variables in pod $POD:"
        kubectl exec -n newrelic $POD -- env | grep -E "(MSK_|AWS_|KAFKA_CLUSTER)" | sort || echo "No MSK variables found"
    else
        echo "No nri-kafka pod found"
    fi
    
    # Check for MSK metrics in logs
    echo -e "\n${YELLOW}Checking for MSK metrics in logs:${NC}"
    kubectl logs -l app=nri-kafka -n newrelic --tail=100 2>/dev/null | grep -E "(MSK|aws:|entity.type.*KAFKA)" | tail -5 || echo "No MSK-related logs found"
}

# Summary function
show_summary() {
    echo -e "\n${BLUE}=== Verification Summary ===${NC}"
    
    # Count running pods
    KAFKA_RUNNING=$(kubectl get pods -n kafka --field-selector=status.phase=Running 2>/dev/null | grep -c "Running" || echo "0")
    NR_RUNNING=$(kubectl get pods -n newrelic --field-selector=status.phase=Running 2>/dev/null | grep -c "Running" || echo "0")
    
    echo -e "\nKafka pods running: ${KAFKA_RUNNING}"
    echo -e "New Relic pods running: ${NR_RUNNING}"
    
    # Overall status
    if [ "$KAFKA_RUNNING" -gt 0 ] && [ "$NR_RUNNING" -gt 0 ]; then
        echo -e "\n${GREEN}✓ Deployment appears healthy${NC}"
    else
        echo -e "\n${RED}✗ Deployment has issues${NC}"
    fi
    
    # Next steps
    echo -e "\n${YELLOW}Next steps:${NC}"
    if [ "$KAFKA_RUNNING" -eq 0 ]; then
        echo "- Fix Kafka deployment issues"
    fi
    if [ "$NR_RUNNING" -eq 0 ]; then
        echo "- Fix monitoring deployment issues"
    fi
    echo "- Check NRDB for metrics: ./check-nrdb-metrics.sh"
    echo "- Monitor logs: kubectl logs -f -l app=nri-kafka -n newrelic"
    echo "- Troubleshoot issues: ./troubleshoot.sh"
}

# Main execution
main() {
    verify_kubernetes
    verify_kafka_deployment
    verify_monitoring_deployment
    verify_jmx_connectivity
    verify_kafka_functionality
    verify_logs
    verify_msk_shim
    show_summary
}

# Run verification
main