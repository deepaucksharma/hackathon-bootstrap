#!/bin/bash

set -e

echo "========================================"
echo "Deploying Strimzi Kafka Cluster"
echo "========================================"

# Function to wait for resource
wait_for_resource() {
    local resource=$1
    local namespace=$2
    local timeout=${3:-300}
    
    echo "Waiting for $resource in namespace $namespace..."
    kubectl wait --for=condition=ready --timeout=${timeout}s $resource -n $namespace
}

# Step 1: Install Strimzi Operator
echo ""
echo "Step 1: Installing Strimzi Operator..."
echo "--------------------------------------"

STRIMZI_VERSION="0.38.0"
NAMESPACE="strimzi-kafka"

kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
kubectl create -f "https://strimzi.io/install/latest?namespace=$NAMESPACE" -n $NAMESPACE

wait_for_resource "pod -l name=strimzi-cluster-operator" $NAMESPACE

# Step 2: Deploy Kafka Cluster
echo ""
echo "Step 2: Deploying Kafka Cluster..."
echo "----------------------------------"

kubectl apply -f kafka-cluster-strimzi.yaml

# Wait for Kafka to be ready
echo "Waiting for Kafka cluster to be ready (this may take several minutes)..."
kubectl wait kafka/production-kafka --for=condition=Ready --timeout=600s -n $NAMESPACE

# Step 3: Create Topics
echo ""
echo "Step 3: Creating Kafka Topics..."
echo "--------------------------------"

kubectl apply -f kafka-topics.yaml

# Step 4: Create Users
echo ""
echo "Step 4: Creating Kafka Users..."
echo "-------------------------------"

kubectl apply -f kafka-users.yaml

# Step 5: Deploy New Relic Integration
echo ""
echo "Step 5: Deploying New Relic Integration..."
echo "-----------------------------------------"

# Create newrelic namespace if it doesn't exist
kubectl create namespace newrelic --dry-run=client -o yaml | kubectl apply -f -

# Get JMX password
JMX_PASSWORD=$(kubectl get secret production-kafka-cluster-operator-certs -n $NAMESPACE -o jsonpath='{.data.cluster-operator\.password}' | base64 -d)

# Create secret with JMX credentials
kubectl create secret generic kafka-jmx-secret \
  --from-literal=username=cluster-operator \
  --from-literal=password="$JMX_PASSWORD" \
  -n newrelic --dry-run=client -o yaml | kubectl apply -f -

# Apply New Relic configuration
kubectl apply -f nri-kafka-strimzi-config.yaml

# Step 6: Deploy Test Clients
echo ""
echo "Step 6: Deploying Test Clients..."
echo "---------------------------------"

kubectl apply -f kafka-test-clients-strimzi.yaml

# Step 7: Verify Deployment
echo ""
echo "Step 7: Verifying Deployment..."
echo "-------------------------------"

echo "Kafka Pods:"
kubectl get pods -n $NAMESPACE -l strimzi.io/cluster=production-kafka

echo ""
echo "Kafka Topics:"
kubectl get kafkatopic -n $NAMESPACE

echo ""
echo "Kafka Users:"
kubectl get kafkauser -n $NAMESPACE

echo ""
echo "========================================"
echo "Strimzi Kafka Deployment Complete!"
echo "========================================"
echo ""
echo "Kafka Bootstrap: production-kafka-kafka-bootstrap.$NAMESPACE.svc.cluster.local:9092"
echo "Zookeeper: production-kafka-zookeeper-client.$NAMESPACE.svc.cluster.local:2181"
echo ""
echo "To test the cluster:"
echo "kubectl -n $NAMESPACE run kafka-test -ti --image=quay.io/strimzi/kafka:0.38.0-kafka-3.5.1 --rm=true --restart=Never -- bin/kafka-topics.sh --bootstrap-server production-kafka-kafka-bootstrap:9092 --list"
echo ""
echo "To check New Relic integration:"
echo "kubectl logs -n newrelic deployment/nri-kafka-strimzi"
echo ""
echo "NRQL Query:"
echo "FROM KafkaBrokerSample SELECT * WHERE clusterName = 'strimzi-production-kafka' SINCE 5 minutes ago"