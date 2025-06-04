#!/bin/bash

# Script to generate test traffic on Kafka cluster
# This will help verify if metrics start flowing with actual data

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

NAMESPACE=${NAMESPACE:-strimzi-kafka}
TOPIC=${TOPIC:-test-metrics}
MESSAGES=${MESSAGES:-1000}

echo -e "${GREEN}=== Kafka Test Traffic Generator ===${NC}"
echo "Namespace: $NAMESPACE"
echo "Topic: $TOPIC"
echo ""

# Create test topic if not exists
echo -e "${BLUE}Creating test topic...${NC}"
cat <<EOF | kubectl apply -f -
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: $TOPIC
  namespace: $NAMESPACE
  labels:
    strimzi.io/cluster: production-kafka
spec:
  partitions: 3
  replicas: 2
  config:
    retention.ms: 3600000  # 1 hour
    segment.ms: 300000     # 5 minutes
EOF

echo -e "${GREEN}✓ Topic created/updated${NC}"
sleep 5

# Create producer job
echo -e "\n${BLUE}Creating producer job...${NC}"
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: kafka-producer-test-$(date +%s)
  namespace: $NAMESPACE
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: producer
        image: quay.io/strimzi/kafka:latest-kafka-3.9.0
        command:
        - sh
        - -c
        - |
          echo "Producing $MESSAGES messages to $TOPIC..."
          for i in \$(seq 1 $MESSAGES); do
            echo "test-message-\$i: Generated at \$(date)" | \
              bin/kafka-console-producer.sh \
                --bootstrap-server production-kafka-kafka-bootstrap:9092 \
                --topic $TOPIC
            if [ \$((i % 100)) -eq 0 ]; then
              echo "Produced \$i messages..."
            fi
          done
          echo "Done producing $MESSAGES messages"
EOF

# Create consumer deployment
echo -e "\n${BLUE}Creating consumer deployment...${NC}"
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kafka-consumer-test
  namespace: $NAMESPACE
spec:
  replicas: 2
  selector:
    matchLabels:
      app: kafka-consumer-test
  template:
    metadata:
      labels:
        app: kafka-consumer-test
    spec:
      containers:
      - name: consumer
        image: quay.io/strimzi/kafka:latest-kafka-3.9.0
        command:
        - sh
        - -c
        - |
          echo "Starting consumer for topic $TOPIC..."
          bin/kafka-console-consumer.sh \
            --bootstrap-server production-kafka-kafka-bootstrap:9092 \
            --topic $TOPIC \
            --group test-consumer-group-\$HOSTNAME \
            --from-beginning
EOF

echo -e "${GREEN}✓ Producer and consumer created${NC}"

# Create performance test producer
echo -e "\n${BLUE}Creating performance test producer...${NC}"
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: kafka-perf-test-$(date +%s)
  namespace: $NAMESPACE
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: perf-producer
        image: quay.io/strimzi/kafka:latest-kafka-3.9.0
        command:
        - bin/kafka-producer-perf-test.sh
        - --topic
        - $TOPIC-perf
        - --num-records
        - "10000"
        - --record-size
        - "1024"
        - --throughput
        - "100"
        - --producer-props
        - bootstrap.servers=production-kafka-kafka-bootstrap:9092
EOF

echo -e "${GREEN}✓ Performance test started${NC}"

# Wait and check status
echo -e "\n${YELLOW}Waiting for traffic to generate...${NC}"
sleep 10

# Check producer status
echo -e "\n${BLUE}Producer jobs status:${NC}"
kubectl get jobs -n $NAMESPACE | grep kafka-producer

# Check consumer status
echo -e "\n${BLUE}Consumer deployment status:${NC}"
kubectl get deployment kafka-consumer-test -n $NAMESPACE

# Check topic status
echo -e "\n${BLUE}Topic status:${NC}"
kubectl get kafkatopics -n $NAMESPACE | grep $TOPIC

# Show recent logs
echo -e "\n${BLUE}Recent producer logs:${NC}"
kubectl logs -n $NAMESPACE -l job-name --tail=10 2>/dev/null || echo "No logs yet"

echo -e "\n${GREEN}=== Test Traffic Generation Complete ===${NC}"
echo ""
echo "Next steps:"
echo "1. Wait 2-3 minutes for metrics to update"
echo "2. Run verification: node comprehensive-verification.js"
echo "3. Check for non-zero throughput metrics"
echo ""
echo "To check producer logs:"
echo "  kubectl logs -n $NAMESPACE -l job-name --tail=50"
echo ""
echo "To check consumer logs:"
echo "  kubectl logs -n $NAMESPACE -l app=kafka-consumer-test --tail=50"
echo ""
echo "To cleanup test resources:"
echo "  kubectl delete jobs -n $NAMESPACE -l job-name"
echo "  kubectl delete deployment kafka-consumer-test -n $NAMESPACE"