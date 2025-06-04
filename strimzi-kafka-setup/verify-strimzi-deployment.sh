#!/bin/bash

echo "========================================"
echo "Strimzi Kafka Verification"
echo "========================================"

NAMESPACE="strimzi-kafka"

# Function to check status
check_status() {
    if [ $? -eq 0 ]; then
        echo "✓ $1"
    else
        echo "✗ $1"
        return 1
    fi
}

# Check Strimzi Operator
echo ""
echo "1. Checking Strimzi Operator..."
kubectl get deployment -n $NAMESPACE strimzi-cluster-operator &>/dev/null
check_status "Strimzi operator deployed"

# Check Kafka Cluster
echo ""
echo "2. Checking Kafka Cluster..."
kubectl get kafka -n $NAMESPACE production-kafka &>/dev/null
check_status "Kafka cluster created"

# Check Kafka Pods
echo ""
echo "3. Checking Kafka Pods..."
KAFKA_PODS=$(kubectl get pods -n $NAMESPACE -l strimzi.io/name=production-kafka-kafka -o jsonpath='{.items[*].status.phase}' | tr ' ' '\n' | grep -c "Running")
if [ "$KAFKA_PODS" -eq "3" ]; then
    echo "✓ All 3 Kafka brokers running"
else
    echo "✗ Only $KAFKA_PODS/3 Kafka brokers running"
fi

# Check Zookeeper Pods
echo ""
echo "4. Checking Zookeeper Pods..."
ZK_PODS=$(kubectl get pods -n $NAMESPACE -l strimzi.io/name=production-kafka-zookeeper -o jsonpath='{.items[*].status.phase}' | tr ' ' '\n' | grep -c "Running")
if [ "$ZK_PODS" -eq "3" ]; then
    echo "✓ All 3 Zookeeper nodes running"
else
    echo "✗ Only $ZK_PODS/3 Zookeeper nodes running"
fi

# Check Topics
echo ""
echo "5. Checking Kafka Topics..."
TOPICS=$(kubectl get kafkatopic -n $NAMESPACE --no-headers | wc -l)
echo "Found $TOPICS topics"
kubectl get kafkatopic -n $NAMESPACE

# Check Users
echo ""
echo "6. Checking Kafka Users..."
USERS=$(kubectl get kafkauser -n $NAMESPACE --no-headers | wc -l)
echo "Found $USERS users"
kubectl get kafkauser -n $NAMESPACE

# Check New Relic Integration
echo ""
echo "7. Checking New Relic Integration..."
kubectl get deployment -n newrelic nri-kafka-strimzi &>/dev/null
check_status "New Relic integration deployed"

# Check JMX Connectivity
echo ""
echo "8. Testing JMX Connectivity..."
echo "Creating JMX test pod..."

kubectl run jmx-test -n $NAMESPACE \
  --image=quay.io/strimzi/kafka:0.38.0-kafka-3.5.1 \
  --rm -i --restart=Never -- /bin/bash -c "
    echo 'Testing JMX connection to Kafka brokers...'
    for i in 0 1 2; do
        echo -n \"Broker \$i: \"
        timeout 5 bash -c \"</dev/tcp/production-kafka-kafka-\$i.production-kafka-kafka-brokers.$NAMESPACE.svc.cluster.local/9999\" && echo 'JMX port open' || echo 'JMX port closed'
    done
" 2>/dev/null || echo "JMX test completed"

# Check Producer/Consumer
echo ""
echo "9. Checking Test Clients..."
PRODUCER_POD=$(kubectl get pods -n $NAMESPACE -l app=kafka-producer -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -n "$PRODUCER_POD" ]; then
    echo "✓ Producer pod: $PRODUCER_POD"
    echo "Last 5 producer logs:"
    kubectl logs -n $NAMESPACE $PRODUCER_POD --tail=5 2>/dev/null || echo "No logs available yet"
else
    echo "✗ Producer pod not found"
fi

echo ""
CONSUMER_POD=$(kubectl get pods -n $NAMESPACE -l app=kafka-consumer -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -n "$CONSUMER_POD" ]; then
    echo "✓ Consumer pod: $CONSUMER_POD"
    echo "Last 5 consumer logs:"
    kubectl logs -n $NAMESPACE $CONSUMER_POD --tail=5 2>/dev/null || echo "No logs available yet"
else
    echo "✗ Consumer pod not found"
fi

# Check New Relic Logs
echo ""
echo "10. New Relic Integration Logs (last 10 lines)..."
NRI_POD=$(kubectl get pods -n newrelic -l app=nri-kafka-strimzi -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -n "$NRI_POD" ]; then
    kubectl logs -n newrelic $NRI_POD --tail=10 2>/dev/null || echo "No logs available yet"
else
    echo "New Relic integration pod not found"
fi

echo ""
echo "========================================"
echo "Verification Complete"
echo "========================================"
echo ""
echo "Quick Commands:"
echo "---------------"
echo "List topics: kubectl -n $NAMESPACE exec -it production-kafka-kafka-0 -- bin/kafka-topics.sh --bootstrap-server localhost:9092 --list"
echo "Describe cluster: kubectl -n $NAMESPACE describe kafka production-kafka"
echo "Check operator logs: kubectl -n $NAMESPACE logs deployment/strimzi-cluster-operator"
echo "Check NR integration: kubectl -n newrelic logs deployment/nri-kafka-strimzi -f"