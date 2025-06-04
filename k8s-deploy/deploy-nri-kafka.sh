#!/bin/bash

# Deploy nri-kafka OHI in Kubernetes with New Relic Infrastructure Bundle
# This script deploys Kafka with JMX enabled and configures New Relic monitoring

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration variables
NAMESPACE_KAFKA="kafka"
NAMESPACE_NEWRELIC="newrelic"

# Load license key from .env file if it exists
if [ -f "../.env" ]; then
    export $(grep -v '^#' ../.env | grep IKEY | xargs)
    NR_LICENSE_KEY="${IKEY:-${NEW_RELIC_LICENSE_KEY:-}}"
else
    NR_LICENSE_KEY="${NEW_RELIC_LICENSE_KEY:-}"
fi

CLUSTER_NAME="${CLUSTER_NAME:-my-k8s-cluster}"

# Function to print colored output
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to wait for pods to be ready
wait_for_pods() {
    local namespace=$1
    local label=$2
    local expected_count=$3
    local timeout=300
    local interval=5
    local elapsed=0

    print_message "$YELLOW" "Waiting for pods with label $label in namespace $namespace to be ready..."
    
    while [ $elapsed -lt $timeout ]; do
        ready_count=$(kubectl get pods -n "$namespace" -l "$label" -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}' | grep -o "True" | wc -l)
        
        if [ "$ready_count" -eq "$expected_count" ]; then
            print_message "$GREEN" "All $expected_count pods are ready!"
            return 0
        fi
        
        echo -n "."
        sleep $interval
        elapsed=$((elapsed + interval))
    done
    
    print_message "$RED" "Timeout waiting for pods to be ready"
    return 1
}

# Check prerequisites
print_message "$YELLOW" "Checking prerequisites..."

if ! command_exists kubectl; then
    print_message "$RED" "kubectl is not installed. Please install kubectl first."
    exit 1
fi

if ! command_exists helm; then
    print_message "$RED" "helm is not installed. Please install helm first."
    exit 1
fi

# Check if connected to a cluster
if ! kubectl cluster-info >/dev/null 2>&1; then
    print_message "$RED" "Not connected to a Kubernetes cluster. Please configure kubectl."
    exit 1
fi

# Check for New Relic license key
if [ -z "$NR_LICENSE_KEY" ]; then
    print_message "$RED" "NEW_RELIC_LICENSE_KEY environment variable is not set."
    print_message "$YELLOW" "Please set it with: export NEW_RELIC_LICENSE_KEY=your-license-key"
    exit 1
fi

print_message "$GREEN" "Prerequisites check passed!"

# Create namespaces
print_message "$YELLOW" "Creating namespaces..."
kubectl create namespace $NAMESPACE_KAFKA --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace $NAMESPACE_NEWRELIC --dry-run=client -o yaml | kubectl apply -f -

# Deploy Kafka cluster
print_message "$YELLOW" "Deploying Kafka cluster with JMX enabled..."
kubectl apply -f kafka-deployment.yaml

# Wait for Kafka to be ready
wait_for_pods $NAMESPACE_KAFKA "app=kafka" 3
wait_for_pods $NAMESPACE_KAFKA "app=zookeeper" 1

# Deploy Kafka producers and consumers
print_message "$YELLOW" "Deploying Kafka producers and consumers..."
kubectl apply -f kafka-producer-consumer.yaml

# Wait for producers and consumers to be ready
wait_for_pods $NAMESPACE_KAFKA "app=kafka-producer" 1
wait_for_pods $NAMESPACE_KAFKA "app=kafka-consumer" 2

# Create ConfigMap for nri-kafka
print_message "$YELLOW" "Creating ConfigMap for nri-kafka configuration..."
kubectl apply -f nri-kafka-config.yaml

# Add New Relic Helm repository
print_message "$YELLOW" "Adding New Relic Helm repository..."
helm repo add newrelic https://helm-charts.newrelic.com
helm repo update

# Create values file with actual license key and cluster name
print_message "$YELLOW" "Creating Helm values file..."
sed "s/YOUR_NEW_RELIC_LICENSE_KEY/$NR_LICENSE_KEY/g; s/YOUR_CLUSTER_NAME/$CLUSTER_NAME/g; s/\${CLUSTER_NAME}/$CLUSTER_NAME/g" values-nri-bundle.yaml > values-nri-bundle-configured.yaml

# Install or upgrade nri-bundle
print_message "$YELLOW" "Installing New Relic Infrastructure Bundle with nri-kafka..."
helm upgrade --install newrelic-bundle newrelic/nri-bundle \
    --namespace $NAMESPACE_NEWRELIC \
    --values values-nri-bundle-configured.yaml \
    --wait

# Wait for New Relic pods to be ready
print_message "$YELLOW" "Waiting for New Relic Infrastructure pods..."
sleep 10
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=newrelic-infrastructure -n $NAMESPACE_NEWRELIC --timeout=300s

# Verify deployment
print_message "$GREEN" "Deployment completed! Verifying installation..."

echo ""
print_message "$YELLOW" "Kafka Cluster Status:"
kubectl get pods -n $NAMESPACE_KAFKA

echo ""
print_message "$YELLOW" "New Relic Infrastructure Status:"
kubectl get pods -n $NAMESPACE_NEWRELIC

echo ""
print_message "$GREEN" "To check nri-kafka logs:"
echo "kubectl logs -n $NAMESPACE_NEWRELIC -l app.kubernetes.io/name=newrelic-infrastructure -c newrelic-infrastructure | grep -i kafka"

echo ""
print_message "$GREEN" "To test Kafka functionality:"
echo "# Create a test topic:"
echo "kubectl exec -n $NAMESPACE_KAFKA kafka-0 -- kafka-topics.sh --bootstrap-server kafka-0.kafka-headless:9092 --create --topic test-topic --partitions 3 --replication-factor 2"
echo ""
echo "# Send a test message:"
echo "kubectl exec -n $NAMESPACE_KAFKA kafka-0 -- bash -c 'echo \"Hello Kafka\" | kafka-console-producer.sh --broker-list kafka-0.kafka-headless:9092 --topic test-topic'"
echo ""
echo "# Consume the test message:"
echo "kubectl exec -n $NAMESPACE_KAFKA kafka-0 -- kafka-console-consumer.sh --bootstrap-server kafka-0.kafka-headless:9092 --topic test-topic --from-beginning --max-messages 1"

echo ""
print_message "$GREEN" "Your Kafka metrics should start appearing in New Relic within a few minutes!"
print_message "$YELLOW" "Check your New Relic account under Infrastructure > Third-party services > Kafka"

# Clean up temporary file
rm -f values-nri-bundle-configured.yaml