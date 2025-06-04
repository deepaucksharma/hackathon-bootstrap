#!/bin/bash

# Deploy everything for Kafka MSK monitoring on Minikube

set -e

echo "============================================"
echo "Kafka MSK Monitoring Deployment for Minikube"
echo "============================================"
echo "Time: $(date)"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"
    
    # Check if Minikube is running
    if ! minikube status > /dev/null 2>&1; then
        echo -e "${RED}Error: Minikube is not running${NC}"
        echo "Please start Minikube with: minikube start --cpus=4 --memory=8192"
        exit 1
    fi
    
    # Check kubectl context
    if [[ $(kubectl config current-context) != "minikube" ]]; then
        echo -e "${YELLOW}Switching to minikube context...${NC}"
        kubectl config use-context minikube
    fi
    
    echo -e "${GREEN}✓ Prerequisites satisfied${NC}"
}

# Deploy Kafka
deploy_kafka() {
    echo -e "\n${BLUE}Deploying Kafka...${NC}"
    
    # Apply Kafka manifests
    kubectl apply -f ../kafka/
    
    # Wait for Kafka to be ready
    echo "Waiting for Kafka StatefulSet..."
    kubectl wait --for=condition=ready pod/kafka-0 -n kafka --timeout=300s || {
        echo -e "${YELLOW}Kafka pod not ready yet, continuing...${NC}"
    }
    
    echo -e "${GREEN}✓ Kafka deployment initiated${NC}"
}

# Deploy Strimzi (optional)
deploy_strimzi() {
    echo -e "\n${BLUE}Deploying Strimzi operator (optional)...${NC}"
    
    # Create namespace
    kubectl create namespace strimzi-kafka --dry-run=client -o yaml | kubectl apply -f -
    
    # Install Strimzi operator
    kubectl create -f 'https://strimzi.io/install/latest?namespace=strimzi-kafka' -n strimzi-kafka 2>/dev/null || {
        echo -e "${YELLOW}Strimzi operator may already exist${NC}"
    }
    
    # Apply Strimzi Kafka cluster if file exists
    if [ -f "../strimzi/02-kafka-cluster.yaml" ]; then
        echo "Waiting for Strimzi operator..."
        sleep 30
        kubectl apply -f ../strimzi/02-kafka-cluster.yaml
    fi
    
    echo -e "${GREEN}✓ Strimzi deployment initiated${NC}"
}

# Deploy monitoring
deploy_monitoring() {
    echo -e "\n${BLUE}Deploying New Relic monitoring...${NC}"
    
    # Apply monitoring manifests
    kubectl apply -f ../monitoring/
    
    # Wait for nri-kafka to be ready
    echo "Waiting for nri-kafka DaemonSet..."
    kubectl wait --for=condition=ready pod -l app=nri-kafka -n newrelic --timeout=120s || {
        echo -e "${YELLOW}nri-kafka pods not ready yet, continuing...${NC}"
    }
    
    echo -e "${GREEN}✓ Monitoring deployment initiated${NC}"
}

# Create test topics
create_test_topics() {
    echo -e "\n${BLUE}Creating test topics...${NC}"
    
    # Wait a bit for Kafka to fully start
    sleep 10
    
    kubectl exec -n kafka kafka-0 -- kafka-topics.sh \
        --create --if-not-exists \
        --topic test-events \
        --partitions 3 \
        --replication-factor 1 \
        --bootstrap-server localhost:9092 2>/dev/null || true
    
    echo -e "${GREEN}✓ Test topics created${NC}"
}

# Show status
show_status() {
    echo -e "\n${BLUE}=== Deployment Status ===${NC}"
    
    echo -e "\n${YELLOW}Kafka Namespace:${NC}"
    kubectl get pods -n kafka
    
    echo -e "\n${YELLOW}Monitoring Namespace:${NC}"
    kubectl get pods -n newrelic
    
    echo -e "\n${YELLOW}Services:${NC}"
    kubectl get svc -n kafka
    
    # Test JMX connectivity
    echo -e "\n${YELLOW}Testing JMX connectivity:${NC}"
    kubectl exec -n kafka kafka-0 -- nc -zv localhost 9999 2>&1 || echo "JMX test failed"
}

# Main execution
main() {
    check_prerequisites
    
    # Deploy components
    deploy_kafka
    deploy_monitoring
    
    # Optional: Deploy Strimzi
    if [[ "$1" == "--with-strimzi" ]]; then
        deploy_strimzi
    fi
    
    # Wait for basic stability
    echo -e "\n${YELLOW}Waiting for pods to stabilize...${NC}"
    sleep 30
    
    # Create test topics
    create_test_topics
    
    # Show final status
    show_status
    
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}Deployment Complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    
    echo -e "\n${YELLOW}Next steps:${NC}"
    echo "1. Check logs: kubectl logs -l app=nri-kafka -n newrelic"
    echo "2. Verify metrics: ./check-nrdb-metrics.sh"
    echo "3. Monitor pods: watch kubectl get pods --all-namespaces"
    echo "4. Access Minikube dashboard: minikube dashboard"
    
    echo -e "\n${YELLOW}Useful commands:${NC}"
    echo "- Kafka logs: kubectl logs kafka-0 -n kafka"
    echo "- Producer logs: kubectl logs -l app=kafka-producer -n kafka"
    echo "- Consumer logs: kubectl logs -l app=kafka-consumer -n kafka"
    echo "- JMX test: kubectl exec -n kafka kafka-0 -- nc -zv localhost 9999"
}

# Run main function
main "$@"