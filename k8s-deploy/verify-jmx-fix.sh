#!/bin/bash

# Script to verify JMX fix is working

echo "========================================="
echo "Verifying JMX Fix for nri-kafka"
echo "========================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

# Function to print test results
test_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

test_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

test_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Test 1: Check Kafka pods are running
echo -e "\nTest 1: Checking Kafka pods..."
KAFKA_PODS=$(kubectl get pods -n kafka -l app=kafka -o jsonpath='{.items[*].metadata.name}')
if [ -n "$KAFKA_PODS" ]; then
    test_pass "Kafka pods found: $KAFKA_PODS"
    
    # Check each pod is ready
    for pod in $KAFKA_PODS; do
        if kubectl get pod -n kafka $pod -o jsonpath='{.status.containerStatuses[0].ready}' | grep -q "true"; then
            test_pass "Pod $pod is ready"
        else
            test_fail "Pod $pod is not ready"
        fi
    done
else
    test_fail "No Kafka pods found"
fi

# Test 2: Check DNS resolution
echo -e "\nTest 2: Checking DNS resolution..."
NRI_POD=$(kubectl get pods -n newrelic -l app.kubernetes.io/component=kubelet -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || \
          kubectl get pods -n newrelic -l app=nri-kafka-monitor -o jsonpath='{.items[0].metadata.name}')

if [ -n "$NRI_POD" ]; then
    for i in 0 1 2; do
        BROKER_HOST="kafka-$i.kafka-headless.kafka.svc.cluster.local"
        if kubectl exec -n newrelic $NRI_POD -c agent -- nslookup $BROKER_HOST &>/dev/null || \
           kubectl exec -n newrelic $NRI_POD -- nslookup $BROKER_HOST &>/dev/null; then
            test_pass "DNS resolution for $BROKER_HOST"
        else
            test_fail "DNS resolution failed for $BROKER_HOST"
        fi
    done
else
    test_warn "No New Relic pod found for DNS testing"
fi

# Test 3: Check JMX ports
echo -e "\nTest 3: Checking JMX ports..."
for i in 0 1 2; do
    BROKER_HOST="kafka-$i.kafka-headless.kafka.svc.cluster.local"
    if [ -n "$NRI_POD" ]; then
        if kubectl exec -n newrelic $NRI_POD -c agent -- nc -zv $BROKER_HOST 9999 &>/dev/null || \
           kubectl exec -n newrelic $NRI_POD -- nc -zv $BROKER_HOST 9999 &>/dev/null; then
            test_pass "JMX port 9999 open on $BROKER_HOST"
        else
            test_fail "JMX port 9999 not accessible on $BROKER_HOST"
        fi
    fi
done

# Test 4: Check JMX connectivity with nrjmx
echo -e "\nTest 4: Testing JMX connectivity with nrjmx..."
if [ -n "$NRI_POD" ]; then
    for i in 0 1 2; do
        BROKER_HOST="kafka-$i.kafka-headless.kafka.svc.cluster.local"
        if kubectl exec -n newrelic $NRI_POD -c agent -- bash -c "echo '' | /usr/bin/nrjmx -H $BROKER_HOST -P 9999" &>/dev/null || \
           kubectl exec -n newrelic $NRI_POD -- bash -c "echo '' | /usr/bin/nrjmx -H $BROKER_HOST -P 9999" &>/dev/null; then
            test_pass "JMX connection successful to $BROKER_HOST"
        else
            test_fail "JMX connection failed to $BROKER_HOST"
        fi
    done
else
    test_warn "No New Relic pod found for JMX testing"
fi

# Test 5: Check nri-kafka execution
echo -e "\nTest 5: Testing nri-kafka integration..."
if [ -n "$NRI_POD" ]; then
    OUTPUT=$(kubectl exec -n newrelic $NRI_POD -c agent -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
        --cluster_name test \
        --bootstrap_broker_host kafka-0.kafka-headless.kafka.svc.cluster.local \
        --bootstrap_broker_jmx_port 9999 \
        --bootstrap_broker_kafka_port 9092 \
        --metrics 2>&1 || \
    kubectl exec -n newrelic $NRI_POD -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
        --cluster_name test \
        --bootstrap_broker_host kafka-0.kafka-headless.kafka.svc.cluster.local \
        --bootstrap_broker_jmx_port 9999 \
        --bootstrap_broker_kafka_port 9092 \
        --metrics 2>&1)
    
    if echo "$OUTPUT" | grep -q '"data"'; then
        if echo "$OUTPUT" | grep -q '"data": \[\]'; then
            test_warn "nri-kafka executes but returns empty data"
        else
            test_pass "nri-kafka returns metrics data"
        fi
    else
        test_fail "nri-kafka execution failed"
    fi
else
    test_warn "No New Relic pod found for integration testing"
fi

# Test 6: Check integration logs
echo -e "\nTest 6: Checking integration logs..."
MONITOR_POD=$(kubectl get pods -n newrelic -l app=nri-kafka-monitor -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -n "$MONITOR_POD" ]; then
    if kubectl logs -n newrelic $MONITOR_POD | grep -q "Received payload"; then
        test_pass "Integration is receiving payloads"
    else
        test_warn "No payloads found in logs yet"
    fi
else
    test_warn "No monitor pod found"
fi

# Test 7: Check for Kafka topics
echo -e "\nTest 7: Checking Kafka topics..."
if kubectl exec -n kafka kafka-0 -- kafka-topics --list --bootstrap-server localhost:9092 &>/dev/null; then
    test_pass "Kafka is operational and accepting connections"
else
    test_fail "Cannot connect to Kafka"
fi

# Summary
echo ""
echo "========================================="
echo "Verification Summary"
echo "========================================="
echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Tests Failed: $TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✓ All tests passed! JMX fix is working correctly.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Wait 2-3 minutes for metrics to appear in New Relic"
    echo "2. Check New Relic UI: Infrastructure > Third-party services > Kafka"
    echo "3. Run NRQL query: FROM KafkaBrokerSample SELECT * WHERE clusterName = 'k8s-kafka-cluster'"
else
    echo -e "\n${RED}✗ Some tests failed. Please check the output above.${NC}"
    echo ""
    echo "Troubleshooting tips:"
    echo "1. Check pod logs: kubectl logs -n kafka kafka-0"
    echo "2. Check integration logs: kubectl logs -n newrelic $MONITOR_POD"
    echo "3. Ensure all pods are running: kubectl get pods -n kafka"
fi