#!/bin/bash

# Consolidated deployment script for Kafka monitoring
# This script deploys both Kafka cluster and New Relic monitoring

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
NAMESPACE=${NAMESPACE:-strimzi-kafka}
STRIMZI_VERSION=${STRIMZI_VERSION:-0.44.0}

# Functions
print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl is not installed"
        exit 1
    fi
    print_success "kubectl found"
    
    if ! kubectl cluster-info &> /dev/null; then
        print_error "Not connected to a Kubernetes cluster"
        exit 1
    fi
    print_success "Connected to Kubernetes cluster"
}

# Create namespace
create_namespace() {
    print_header "Creating Namespace"
    
    if kubectl get namespace $NAMESPACE &> /dev/null; then
        print_warning "Namespace $NAMESPACE already exists"
    else
        kubectl create namespace $NAMESPACE
        print_success "Created namespace $NAMESPACE"
    fi
}

# Install Strimzi operator
install_strimzi() {
    print_header "Installing Strimzi Operator"
    
    if kubectl get deployment -n $NAMESPACE strimzi-cluster-operator &> /dev/null; then
        print_warning "Strimzi operator already installed"
    else
        kubectl create -f "https://strimzi.io/install/latest?namespace=$NAMESPACE" -n $NAMESPACE
        print_success "Strimzi operator installed"
        
        echo "Waiting for operator to be ready..."
        kubectl wait --for=condition=ready --timeout=300s pod -l name=strimzi-cluster-operator -n $NAMESPACE
        print_success "Strimzi operator is ready"
    fi
}

# Deploy Kafka cluster
deploy_kafka() {
    print_header "Deploying Kafka Cluster"
    
    kubectl apply -f ../kafka/01-kafka-cluster.yaml
    print_success "Kafka cluster deployment started"
    
    echo "Waiting for Kafka to be ready (this may take several minutes)..."
    kubectl wait kafka/production-kafka --for=condition=Ready --timeout=600s -n $NAMESPACE
    print_success "Kafka cluster is ready"
}

# Deploy NRI-Kafka monitoring
deploy_monitoring() {
    print_header "Deploying New Relic Kafka Monitoring"
    
    # Apply ConfigMap
    kubectl apply -f ../nri-kafka/01-configmap.yaml
    print_success "ConfigMap applied"
    
    # Deploy standard integration
    kubectl apply -f ../nri-kafka/02-standard-deployment.yaml
    print_success "Standard NRI-Kafka deployment applied"
    
    # Deploy MSK shim
    kubectl apply -f ../nri-kafka/03-msk-shim-deployment.yaml
    print_success "MSK shim deployment applied"
    
    echo "Waiting for pods to be ready..."
    sleep 10
    kubectl wait --for=condition=ready --timeout=300s pod -l app=nri-kafka -n $NAMESPACE || true
    kubectl wait --for=condition=ready --timeout=300s pod -l app=nri-kafka-msk-shim -n $NAMESPACE || true
}

# Create test topics
create_test_topics() {
    print_header "Creating Test Topics"
    
    cat <<EOF | kubectl apply -f -
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: test-topic
  namespace: $NAMESPACE
  labels:
    strimzi.io/cluster: production-kafka
spec:
  partitions: 3
  replicas: 3
---
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: monitoring-test
  namespace: $NAMESPACE
  labels:
    strimzi.io/cluster: production-kafka
spec:
  partitions: 1
  replicas: 2
EOF
    print_success "Test topics created"
}

# Verify deployment
verify_deployment() {
    print_header "Verifying Deployment"
    
    echo -e "\n${YELLOW}Kafka Pods:${NC}"
    kubectl get pods -n $NAMESPACE | grep production-kafka
    
    echo -e "\n${YELLOW}Monitoring Pods:${NC}"
    kubectl get pods -n $NAMESPACE | grep nri-kafka
    
    echo -e "\n${YELLOW}Services:${NC}"
    kubectl get svc -n $NAMESPACE | grep kafka
    
    echo -e "\n${YELLOW}Topics:${NC}"
    kubectl get kafkatopics -n $NAMESPACE
}

# Test JMX connectivity
test_jmx() {
    print_header "Testing JMX Connectivity"
    
    # Get first Kafka broker pod
    BROKER_POD=$(kubectl get pods -n $NAMESPACE -l strimzi.io/name=production-kafka-kafka -o jsonpath='{.items[0].metadata.name}')
    
    if [ -n "$BROKER_POD" ]; then
        echo "Testing JMX port on $BROKER_POD..."
        kubectl exec -n $NAMESPACE $BROKER_POD -- bash -c "netstat -tlnp | grep 9999" || print_warning "JMX port check failed"
    fi
}

# Show next steps
show_next_steps() {
    print_header "Deployment Complete!"
    
    echo -e "\n${GREEN}Next Steps:${NC}"
    echo "1. Wait 3-5 minutes for metrics to start flowing"
    echo "2. Check logs for any errors:"
    echo "   kubectl logs -l app=nri-kafka -n $NAMESPACE --tail=50"
    echo "   kubectl logs -l app=nri-kafka-msk-shim -n $NAMESPACE --tail=50"
    echo ""
    echo "3. Verify metrics in New Relic:"
    echo "   cd /home/deepak/src/nri-kafka"
    echo "   node verify-metrics-nodejs.js --apiKey=<NRAK-KEY> --accountId=3630072 --clusterName=kafka-k8s-monitoring"
    echo ""
    echo "4. Access Kafka:"
    echo "   kubectl -n $NAMESPACE run kafka-client --rm -ti --image=quay.io/strimzi/kafka:latest-kafka-3.9.0 -- bin/kafka-console-consumer.sh --bootstrap-server production-kafka-kafka-bootstrap:9092 --topic test-topic"
    echo ""
    echo "5. View dashboards in New Relic One"
}

# Main execution
main() {
    echo -e "${GREEN}=== Kafka Monitoring Deployment Script ===${NC}"
    echo "Namespace: $NAMESPACE"
    echo "Strimzi Version: $STRIMZI_VERSION"
    
    check_prerequisites
    create_namespace
    install_strimzi
    deploy_kafka
    deploy_monitoring
    create_test_topics
    verify_deployment
    test_jmx
    show_next_steps
}

# Run main function
main