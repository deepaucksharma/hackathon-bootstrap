#!/bin/bash

# Deploy Kafka using Strimzi operator - a production-ready solution

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

NAMESPACE="kafka"

echo -e "${BLUE}Deploying Kafka using Strimzi operator...${NC}"

# Create namespace
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Install Strimzi operator
echo -e "${YELLOW}Installing Strimzi operator...${NC}"
kubectl create -f 'https://strimzi.io/install/latest?namespace=kafka' -n kafka

# Wait for operator to be ready
echo -e "${YELLOW}Waiting for Strimzi operator to be ready...${NC}"
kubectl wait --for=condition=ready pod -l name=strimzi-cluster-operator -n kafka --timeout=300s

# Create Kafka cluster with JMX enabled
echo -e "${YELLOW}Creating Kafka cluster...${NC}"
cat <<EOF | kubectl apply -n kafka -f -
apiVersion: kafka.strimzi.io/v1beta2
kind: Kafka
metadata:
  name: my-cluster
spec:
  kafka:
    version: 3.7.0
    replicas: 3
    listeners:
      - name: plain
        port: 9092
        type: internal
        tls: false
    jmxOptions: 
      authentication:
        type: "password"
    config:
      offsets.topic.replication.factor: 3
      transaction.state.log.replication.factor: 3
      transaction.state.log.min.isr: 2
      default.replication.factor: 3
      min.insync.replicas: 2
      inter.broker.protocol.version: "3.7"
    storage:
      type: jbod
      volumes:
      - id: 0
        type: persistent-claim
        size: 10Gi
        deleteClaim: true
    metricsConfig:
      type: jmxPrometheusExporter
      valueFrom:
        configMapKeyRef:
          name: kafka-metrics
          key: kafka-metrics-config.yml
  zookeeper:
    replicas: 3
    storage:
      type: persistent-claim
      size: 5Gi
      deleteClaim: true
    jmxOptions:
      authentication:
        type: "password"
    metricsConfig:
      type: jmxPrometheusExporter
      valueFrom:
        configMapKeyRef:
          name: kafka-metrics
          key: zookeeper-metrics-config.yml
  entityOperator:
    topicOperator: {}
    userOperator: {}
EOF

# Create metrics ConfigMap
cat <<EOF | kubectl apply -n kafka -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: kafka-metrics
data:
  kafka-metrics-config.yml: |
    lowercaseOutputName: true
    rules:
    - pattern: kafka.server<type=(.+), name=(.+), clientId=(.+), topic=(.+), partition=(.*)><>Value
      name: kafka_server_$1_$2
      type: GAUGE
      labels:
       clientId: "$3"
       topic: "$4"
       partition: "$5"
    - pattern: kafka.server<type=(.+), name=(.+), clientId=(.+), brokerHost=(.+), brokerPort=(.+)><>Value
      name: kafka_server_$1_$2
      type: GAUGE
      labels:
       clientId: "$3"
       broker: "$4:$5"
    - pattern: kafka.server<type=(.+), name=(.+)><>OneMinuteRate
      name: kafka_server_$1_$2_1minute_rate
      type: GAUGE
  zookeeper-metrics-config.yml: |
    lowercaseOutputName: true
    rules: []
EOF

# Wait for Kafka to be ready
echo -e "${YELLOW}Waiting for Kafka cluster to be ready...${NC}"
kubectl wait kafka/my-cluster --for=condition=Ready --timeout=300s -n kafka

# Create test topic
echo -e "${YELLOW}Creating test topic...${NC}"
cat <<EOF | kubectl apply -n kafka -f -
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: test-topic
  labels:
    strimzi.io/cluster: my-cluster
spec:
  partitions: 3
  replicas: 3
  config:
    retention.ms: 7200000
    segment.bytes: 1073741824
EOF

# Deploy producers and consumers
echo -e "${YELLOW}Deploying test producers and consumers...${NC}"
kubectl apply -f kafka-producer-consumer.yaml

echo -e "${GREEN}Kafka deployment complete!${NC}"
echo ""
echo "Kafka bootstrap servers: my-cluster-kafka-bootstrap.kafka.svc.cluster.local:9092"
echo "JMX is enabled on port 9999 for each broker"
echo ""
echo "To test Kafka:"
echo "kubectl -n kafka run kafka-producer -ti --image=quay.io/strimzi/kafka:0.39.0-kafka-3.7.0 --rm=true --restart=Never -- bin/kafka-console-producer.sh --bootstrap-server my-cluster-kafka-bootstrap:9092 --topic test-topic"