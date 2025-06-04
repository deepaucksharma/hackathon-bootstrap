#!/bin/bash

# Test script to generate Kafka activity and verify metrics collection
# This helps ensure nri-kafka has data to collect and send to New Relic

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

NAMESPACE="kafka"

echo -e "${BLUE}Starting Kafka metrics test...${NC}"

# Create test topics if they don't exist
echo -e "\n${YELLOW}Creating test topics...${NC}"
for topic in metrics-test-1 metrics-test-2 metrics-test-3; do
    kubectl exec -n $NAMESPACE kafka-0 -- kafka-topics.sh \
        --bootstrap-server localhost:9092 \
        --create --topic $topic \
        --partitions 3 \
        --replication-factor 2 \
        --if-not-exists 2>/dev/null || echo "Topic $topic already exists"
done

# Start background producers
echo -e "\n${YELLOW}Starting message producers...${NC}"
for i in {1..3}; do
    kubectl exec -n $NAMESPACE kafka-0 -- bash -c "
        for j in {1..100}; do 
            echo 'Message-$i-$j-$(date +%s)' | kafka-console-producer.sh --broker-list localhost:9092 --topic metrics-test-$i >/dev/null 2>&1
            sleep 0.1
        done
    " &
    echo "Started producer for metrics-test-$i"
done

# Start background consumers
echo -e "\n${YELLOW}Starting message consumers...${NC}"
for i in {1..3}; do
    kubectl exec -n $NAMESPACE kafka-0 -- bash -c "
        timeout 30 kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic metrics-test-$i --group test-group-$i >/dev/null 2>&1
    " &
    echo "Started consumer for metrics-test-$i (group: test-group-$i)"
done

# Wait for some activity
echo -e "\n${YELLOW}Generating traffic for 30 seconds...${NC}"
sleep 30

# Check metrics
echo -e "\n${BLUE}Checking Kafka metrics...${NC}"

# Topic statistics
echo -e "\n${YELLOW}Topic Statistics:${NC}"
kubectl exec -n $NAMESPACE kafka-0 -- kafka-topics.sh --bootstrap-server localhost:9092 --describe | grep "metrics-test"

# Consumer group status
echo -e "\n${YELLOW}Consumer Group Status:${NC}"
kubectl exec -n $NAMESPACE kafka-0 -- kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list | grep "test-group"

# Consumer lag
echo -e "\n${YELLOW}Consumer Lag:${NC}"
for i in {1..3}; do
    echo -e "\nGroup: test-group-$i"
    kubectl exec -n $NAMESPACE kafka-0 -- kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group test-group-$i 2>/dev/null || true
done

# JMX metrics sample
echo -e "\n${YELLOW}Sample JMX Metrics:${NC}"
kubectl exec -n $NAMESPACE kafka-0 -- bash -c "
    echo 'get -b kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec OneMinuteRate' | 
    java -jar /opt/bitnami/kafka/bin/jmxterm.jar -l localhost:9999 -n 2>/dev/null | grep -v '^Welcome' | grep -v '^$'
"

# Check New Relic integration logs
echo -e "\n${YELLOW}Recent nri-kafka logs:${NC}"
NR_POD=$(kubectl get pods -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -n "$NR_POD" ]; then
    kubectl logs -n newrelic $NR_POD -c newrelic-infrastructure --tail=20 | grep -i kafka || echo "No recent Kafka logs found"
else
    echo "New Relic pod not found"
fi

# Cleanup
echo -e "\n${YELLOW}Cleaning up test topics...${NC}"
for topic in metrics-test-1 metrics-test-2 metrics-test-3; do
    kubectl exec -n $NAMESPACE kafka-0 -- kafka-topics.sh --bootstrap-server localhost:9092 --delete --topic $topic 2>/dev/null || true
done

echo -e "\n${GREEN}Test completed!${NC}"
echo -e "\n${BLUE}Next steps:${NC}"
echo "1. Wait 2-3 minutes for metrics to appear in New Relic"
echo "2. Check New Relic UI: Infrastructure > Third-party services > Apache Kafka"
echo "3. Run this NRQL query:"
echo "   SELECT count(*) FROM KafkaBrokerSample WHERE clusterName = 'my-k8s-cluster' SINCE 10 minutes ago"