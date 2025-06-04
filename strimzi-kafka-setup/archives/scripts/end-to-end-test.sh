#!/bin/bash

# End-to-End Test for Strimzi Kafka Deployment

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
NAMESPACE="strimzi-kafka"
NR_NAMESPACE="newrelic"
KAFKA_CLUSTER="production-kafka"
TEST_TOPIC="e2e-test-topic"
TEST_MESSAGES=10

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
print_test() {
    echo -e "\n${BLUE}[TEST] $1${NC}"
}

print_pass() {
    echo -e "${GREEN}✓ PASS: $1${NC}"
    ((TESTS_PASSED++))
}

print_fail() {
    echo -e "${RED}✗ FAIL: $1${NC}"
    ((TESTS_FAILED++))
}

print_info() {
    echo -e "${YELLOW}ℹ INFO: $1${NC}"
}

# Cleanup function
cleanup() {
    print_info "Cleaning up test resources..."
    kubectl delete kafkatopic $TEST_TOPIC -n $NAMESPACE 2>/dev/null || true
    kubectl delete pod e2e-test-producer -n $NAMESPACE --force --grace-period=0 2>/dev/null || true
    kubectl delete pod e2e-test-consumer -n $NAMESPACE --force --grace-period=0 2>/dev/null || true
}

# Set trap for cleanup
trap cleanup EXIT

# Start tests
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}    Strimzi Kafka End-to-End Test Suite${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"

# Test 1: Cluster Health
print_test "Cluster Health Check"

# Check operator
if kubectl get deployment -n $NAMESPACE strimzi-cluster-operator &>/dev/null; then
    OPERATOR_READY=$(kubectl get deployment -n $NAMESPACE strimzi-cluster-operator -o jsonpath='{.status.readyReplicas}')
    if [ "$OPERATOR_READY" -ge 1 ]; then
        print_pass "Strimzi operator is running"
    else
        print_fail "Strimzi operator is not ready"
    fi
else
    print_fail "Strimzi operator deployment not found"
fi

# Check Kafka cluster
KAFKA_STATUS=$(kubectl get kafka -n $NAMESPACE $KAFKA_CLUSTER -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "False")
if [ "$KAFKA_STATUS" == "True" ]; then
    print_pass "Kafka cluster is ready"
else
    print_fail "Kafka cluster is not ready"
fi

# Check all brokers
EXPECTED_BROKERS=3
RUNNING_BROKERS=0
for i in 0 1 2; do
    if kubectl get pod -n $NAMESPACE ${KAFKA_CLUSTER}-kafka-$i &>/dev/null; then
        PHASE=$(kubectl get pod -n $NAMESPACE ${KAFKA_CLUSTER}-kafka-$i -o jsonpath='{.status.phase}')
        if [ "$PHASE" == "Running" ]; then
            ((RUNNING_BROKERS++))
        fi
    fi
done

if [ "$RUNNING_BROKERS" -eq "$EXPECTED_BROKERS" ]; then
    print_pass "All $EXPECTED_BROKERS Kafka brokers are running"
else
    print_fail "Only $RUNNING_BROKERS/$EXPECTED_BROKERS Kafka brokers are running"
fi

# Test 2: Topic Operations
print_test "Topic Operations"

# Create test topic
cat <<EOF | kubectl apply -f -
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: $TEST_TOPIC
  namespace: $NAMESPACE
  labels:
    strimzi.io/cluster: $KAFKA_CLUSTER
spec:
  partitions: 3
  replicas: 2
  config:
    retention.ms: 3600000
EOF

# Wait for topic creation
sleep 5

# Verify topic was created
if kubectl get kafkatopic $TEST_TOPIC -n $NAMESPACE &>/dev/null; then
    print_pass "Test topic created successfully"
else
    print_fail "Test topic creation failed"
fi

# Check topic in Kafka
TOPIC_EXISTS=$(kubectl exec -n $NAMESPACE ${KAFKA_CLUSTER}-kafka-0 -- \
    /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list 2>/dev/null | grep -c "^${TEST_TOPIC}$" || echo "0")

if [ "$TOPIC_EXISTS" -eq 1 ]; then
    print_pass "Topic exists in Kafka cluster"
else
    print_fail "Topic not found in Kafka cluster"
fi

# Test 3: Authentication
print_test "Authentication and Authorization"

# Check if users exist
for user in producer-user consumer-user admin-user; do
    if kubectl get kafkauser $user -n $NAMESPACE &>/dev/null; then
        print_pass "User $user exists"
    else
        print_fail "User $user not found"
    fi
done

# Test 4: Message Production
print_test "Message Production"

# Get producer password
PRODUCER_PASSWORD=$(kubectl get secret producer-user -n $NAMESPACE -o jsonpath='{.data.password}' | base64 -d)

# Create producer test pod
kubectl run e2e-test-producer -n $NAMESPACE \
    --image=quay.io/strimzi/kafka:0.38.0-kafka-3.5.1 \
    --restart=Never \
    --command -- sleep 300 &

# Wait for pod to be ready
sleep 5

# Produce test messages
print_info "Producing $TEST_MESSAGES test messages..."
kubectl exec -n $NAMESPACE e2e-test-producer -- bash -c "
for i in {1..$TEST_MESSAGES}; do
    echo \"Test message \$i from e2e test at \$(date)\"
done | /opt/kafka/bin/kafka-console-producer.sh \
    --bootstrap-server ${KAFKA_CLUSTER}-kafka-bootstrap:9092 \
    --topic $TEST_TOPIC \
    --producer-property security.protocol=SASL_PLAINTEXT \
    --producer-property sasl.mechanism=SCRAM-SHA-512 \
    --producer-property sasl.jaas.config='org.apache.kafka.common.security.scram.ScramLoginModule required username=\"producer-user\" password=\"$PRODUCER_PASSWORD\";'
" 2>/dev/null

if [ $? -eq 0 ]; then
    print_pass "Successfully produced $TEST_MESSAGES messages"
else
    print_fail "Failed to produce messages"
fi

# Test 5: Message Consumption
print_test "Message Consumption"

# Get consumer password
CONSUMER_PASSWORD=$(kubectl get secret consumer-user -n $NAMESPACE -o jsonpath='{.data.password}' | base64 -d)

# Create consumer test pod
kubectl run e2e-test-consumer -n $NAMESPACE \
    --image=quay.io/strimzi/kafka:0.38.0-kafka-3.5.1 \
    --restart=Never \
    --command -- sleep 300 &

# Wait for pod to be ready
sleep 5

# Consume messages
print_info "Consuming messages from test topic..."
CONSUMED_MESSAGES=$(kubectl exec -n $NAMESPACE e2e-test-consumer -- timeout 10 bash -c "
/opt/kafka/bin/kafka-console-consumer.sh \
    --bootstrap-server ${KAFKA_CLUSTER}-kafka-bootstrap:9092 \
    --topic $TEST_TOPIC \
    --from-beginning \
    --max-messages $TEST_MESSAGES \
    --group e2e-test-group \
    --consumer-property security.protocol=SASL_PLAINTEXT \
    --consumer-property sasl.mechanism=SCRAM-SHA-512 \
    --consumer-property sasl.jaas.config='org.apache.kafka.common.security.scram.ScramLoginModule required username=\"consumer-user\" password=\"$CONSUMER_PASSWORD\";'
" 2>/dev/null | wc -l || echo "0")

if [ "$CONSUMED_MESSAGES" -eq "$TEST_MESSAGES" ]; then
    print_pass "Successfully consumed all $TEST_MESSAGES messages"
else
    print_fail "Only consumed $CONSUMED_MESSAGES/$TEST_MESSAGES messages"
fi

# Test 6: Consumer Group
print_test "Consumer Group Operations"

# Check consumer group
GROUP_EXISTS=$(kubectl exec -n $NAMESPACE ${KAFKA_CLUSTER}-kafka-0 -- \
    /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list 2>/dev/null | grep -c "e2e-test-group" || echo "0")

if [ "$GROUP_EXISTS" -eq 1 ]; then
    print_pass "Consumer group created successfully"
    
    # Check consumer lag
    kubectl exec -n $NAMESPACE ${KAFKA_CLUSTER}-kafka-0 -- \
        /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
        --describe --group e2e-test-group 2>/dev/null | grep -E "TOPIC|$TEST_TOPIC" || true
else
    print_fail "Consumer group not found"
fi

# Test 7: JMX Connectivity
print_test "JMX Monitoring"

# Test JMX port connectivity
JMX_SUCCESS=0
for i in 0 1 2; do
    if kubectl exec -n $NAMESPACE e2e-test-producer -- \
        timeout 2 bash -c "</dev/tcp/${KAFKA_CLUSTER}-kafka-$i.${KAFKA_CLUSTER}-kafka-brokers/9999" 2>/dev/null; then
        ((JMX_SUCCESS++))
    fi
done

if [ "$JMX_SUCCESS" -eq 3 ]; then
    print_pass "JMX ports are accessible on all brokers"
else
    print_fail "JMX ports accessible on only $JMX_SUCCESS/3 brokers"
fi

# Test 8: New Relic Integration
print_test "New Relic Integration"

if kubectl get namespace $NR_NAMESPACE &>/dev/null; then
    NRI_POD=$(kubectl get pods -n $NR_NAMESPACE -l app=nri-kafka-strimzi -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    
    if [ -n "$NRI_POD" ]; then
        # Check if pod is running
        NRI_STATUS=$(kubectl get pod -n $NR_NAMESPACE $NRI_POD -o jsonpath='{.status.phase}')
        if [ "$NRI_STATUS" == "Running" ]; then
            print_pass "New Relic integration is running"
            
            # Check for successful metrics collection
            METRICS_COLLECTED=$(kubectl logs -n $NR_NAMESPACE $NRI_POD --tail=100 2>/dev/null | grep -c "KafkaBrokerSample" || echo "0")
            if [ "$METRICS_COLLECTED" -gt 0 ]; then
                print_pass "New Relic is collecting Kafka metrics"
            else
                print_fail "No Kafka metrics found in New Relic logs"
            fi
        else
            print_fail "New Relic integration is not running (status: $NRI_STATUS)"
        fi
    else
        print_fail "New Relic integration pod not found"
    fi
else
    print_info "New Relic namespace not found - skipping integration tests"
fi

# Test 9: Performance Benchmark
print_test "Performance Benchmark"

print_info "Running producer performance test..."
kubectl exec -n $NAMESPACE e2e-test-producer -- \
    /opt/kafka/bin/kafka-producer-perf-test.sh \
    --topic $TEST_TOPIC \
    --num-records 1000 \
    --record-size 1024 \
    --throughput 100 \
    --producer-props \
        bootstrap.servers=${KAFKA_CLUSTER}-kafka-bootstrap:9092 \
        security.protocol=SASL_PLAINTEXT \
        sasl.mechanism=SCRAM-SHA-512 \
        "sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required username=\"producer-user\" password=\"$PRODUCER_PASSWORD\";" \
    2>&1 | grep -E "records sent|throughput" || print_fail "Performance test failed"

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    print_pass "Performance test completed successfully"
else
    print_fail "Performance test failed"
fi

# Test 10: Cluster Resilience
print_test "Cluster Resilience"

# Check for under-replicated partitions
URP=$(kubectl exec -n $NAMESPACE ${KAFKA_CLUSTER}-kafka-0 -- \
    /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
    --describe --under-replicated-partitions 2>/dev/null | grep -c "Topic:" || echo "0")

if [ "$URP" -eq 0 ]; then
    print_pass "No under-replicated partitions"
else
    print_fail "Found $URP under-replicated partitions"
fi

# Summary
echo -e "\n${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                    TEST SUMMARY${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo -e "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"

if [ "$TESTS_FAILED" -eq 0 ]; then
    echo -e "\n${GREEN}✓ ALL TESTS PASSED!${NC}"
    echo -e "${GREEN}Your Strimzi Kafka deployment is fully functional.${NC}"
    exit 0
else
    echo -e "\n${RED}✗ SOME TESTS FAILED${NC}"
    echo -e "${YELLOW}Please check the failed tests above for details.${NC}"
    exit 1
fi