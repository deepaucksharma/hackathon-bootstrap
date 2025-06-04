#!/bin/bash

set -e

echo "Setting up Kubernetes cluster for Kafka validation..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    print_error "kubectl is not installed. Please install kubectl first."
    exit 1
fi

# Check if a Kubernetes cluster is accessible
if ! kubectl cluster-info &> /dev/null; then
    print_error "No Kubernetes cluster found. Please ensure you have a running cluster (minikube, kind, k3s, etc.)"
    print_status "For minikube: minikube start"
    print_status "For kind: kind create cluster"
    exit 1
fi

print_status "Kubernetes cluster is accessible"

# Build the nri-kafka binary
print_status "Building nri-kafka binary..."
if [ ! -f "go.mod" ]; then
    print_error "Please run this script from the root of the nri-kafka repository"
    exit 1
fi

make clean
make compile

if [ ! -f "bin/nri-kafka" ]; then
    print_error "Failed to build nri-kafka binary"
    exit 1
fi

print_status "nri-kafka binary built successfully"

# Check if New Relic license key is provided
if [ -z "$NEW_RELIC_LICENSE_KEY" ]; then
    print_warning "NEW_RELIC_LICENSE_KEY environment variable not set"
    print_status "Please set it before applying the manifests:"
    print_status "export NEW_RELIC_LICENSE_KEY=your_license_key_here"
    print_status ""
    print_status "Then update the secret in 05-newrelic-kafka-config.yaml"
else
    print_status "New Relic license key found"
    # Update the license key in the manifest
    sed -i "s/YOUR_NEW_RELIC_LICENSE_KEY_HERE/$NEW_RELIC_LICENSE_KEY/g" k8s-validation/05-newrelic-kafka-config.yaml
fi

# Apply Kubernetes manifests
print_status "Applying Kubernetes manifests..."

# Create namespace
kubectl apply -f k8s-validation/01-namespace.yaml

# Deploy Zookeeper
print_status "Deploying Zookeeper..."
kubectl apply -f k8s-validation/02-zookeeper.yaml

# Wait for Zookeeper to be ready
print_status "Waiting for Zookeeper to be ready..."
kubectl wait --for=condition=ready pod -l app=zookeeper -n kafka-validation --timeout=120s

# Deploy Kafka
print_status "Deploying Kafka cluster..."
kubectl apply -f k8s-validation/03-kafka.yaml

# Wait for Kafka to be ready
print_status "Waiting for Kafka brokers to be ready..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=kafka -n kafka-validation --timeout=300s

# Deploy test producer and consumer
print_status "Deploying test producer and consumer..."
kubectl apply -f k8s-validation/04-test-producer-consumer.yaml

# Deploy New Relic infrastructure agent with Kafka integration
if [ ! -z "$NEW_RELIC_LICENSE_KEY" ]; then
    print_status "Deploying New Relic infrastructure agent with Kafka integration..."
    kubectl apply -f k8s-validation/05-newrelic-kafka-config.yaml
else
    print_warning "Skipping New Relic deployment - no license key provided"
fi

print_status "Deployment complete!"
print_status ""
print_status "Useful commands:"
print_status "  - Check pod status: kubectl get pods -n kafka-validation"
print_status "  - View Kafka logs: kubectl logs -l app.kubernetes.io/name=kafka -n kafka-validation"
print_status "  - View producer logs: kubectl logs -l app=kafka-producer -n kafka-validation"
print_status "  - View consumer logs: kubectl logs -l app=kafka-consumer -n kafka-validation"
print_status "  - View New Relic agent logs: kubectl logs -l name=newrelic-infrastructure -n kafka-validation"
print_status ""
print_status "To access Kafka from outside the cluster:"
print_status "  - Kafka bootstrap: localhost:30092"
print_status "  - JMX port: localhost:30099"
print_status ""
print_status "To clean up: kubectl delete namespace kafka-validation"