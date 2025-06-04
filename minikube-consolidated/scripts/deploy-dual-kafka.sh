#!/bin/bash

set -e

echo "🚀 Deploying Dual Kafka Setup in Minikube"
echo "=========================================="

# Create namespaces
echo "📁 Creating namespaces..."
kubectl create namespace kafka --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace strimzi-kafka --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace newrelic --dry-run=client -o yaml | kubectl apply -f -

# Deploy Original Kafka
echo "☕ Deploying Original Kafka cluster..."
kubectl apply -f ../kafka/

# Install Strimzi Operator
echo "🔧 Installing Strimzi Kafka Operator..."
kubectl apply -f 'https://strimzi.io/install/latest?namespace=strimzi-kafka' -n strimzi-kafka

# Wait for Strimzi operator
echo "⏳ Waiting for Strimzi operator to be ready..."
kubectl rollout status deployment/strimzi-cluster-operator -n strimzi-kafka --timeout=300s

# Deploy Strimzi Kafka Cluster
echo "🏭 Deploying Strimzi Kafka cluster..."
kubectl apply -f - <<EOF
apiVersion: kafka.strimzi.io/v1beta2
kind: Kafka
metadata:
  name: strimzi-kafka-cluster
  namespace: strimzi-kafka
spec:
  kafka:
    version: 3.4.0
    replicas: 3
    listeners:
      - name: plain
        port: 9092
        type: internal
        tls: false
    config:
      offsets.topic.replication.factor: 3
      transaction.state.log.replication.factor: 3
      transaction.state.log.min.isr: 2
      default.replication.factor: 3
      min.insync.replicas: 2
      inter.broker.protocol.version: "3.4"
    storage:
      type: ephemeral
    jmxOptions: {}
  zookeeper:
    replicas: 3
    storage:
      type: ephemeral
    jmxOptions: {}
  entityOperator:
    topicOperator: {}
    userOperator: {}
---
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: strimzi-events
  namespace: strimzi-kafka
  labels:
    strimzi.io/cluster: strimzi-kafka-cluster
spec:
  partitions: 3
  replicas: 3
---
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: strimzi-metrics
  namespace: strimzi-kafka
  labels:
    strimzi.io/cluster: strimzi-kafka-cluster
spec:
  partitions: 6
  replicas: 3
---
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: strimzi-logs
  namespace: strimzi-kafka
  labels:
    strimzi.io/cluster: strimzi-kafka-cluster
spec:
  partitions: 3
  replicas: 3
EOF

# Deploy NewRelic monitoring
echo "📊 Deploying NewRelic monitoring for dual clusters..."
kubectl apply -f ../monitoring/

# Wait for Kafka clusters to be ready
echo "⏳ Waiting for Kafka clusters to be ready..."
kubectl wait --for=condition=Ready kafka/strimzi-kafka-cluster -n strimzi-kafka --timeout=600s

echo "✅ Dual Kafka setup complete!"
echo ""
echo "🔍 Cluster Information:"
echo "----------------------"
echo "Original Kafka: kafka namespace"
echo "  - Brokers: kafka-0.kafka-headless.kafka.svc.cluster.local:9092"
echo "  - JMX: 9999"
echo ""
echo "Strimzi Kafka: strimzi-kafka namespace"  
echo "  - Brokers: strimzi-kafka-cluster-kafka-bootstrap.strimzi-kafka.svc.cluster.local:9092"
echo "  - JMX: 9999"
echo ""
echo "NewRelic Monitoring: newrelic namespace"
echo "  - DaemonSet: nri-kafka-dual-cluster"
echo ""
echo "🧪 Next steps:"
echo "1. Generate test traffic: ./generate-traffic.sh"
echo "2. Verify metrics: node ../../verify-kafka-metrics.js"