#!/bin/bash

# Comprehensive nri-kafka troubleshooting script
# This script performs thorough diagnostics of the nri-kafka integration

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Functions
print_header() {
    echo -e "\n${BLUE}==================== $1 ====================${NC}"
}

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

# Start troubleshooting
echo -e "${BLUE}NRI-KAFKA INTEGRATION TROUBLESHOOTING${NC}"
echo -e "${BLUE}Timestamp: $(date)${NC}"

# 1. Basic Connectivity Tests
print_header "Basic Connectivity Tests"

echo -e "\n${YELLOW}Testing Kafka service resolution...${NC}"
if kubectl exec -n newrelic $(kubectl get pods -n newrelic -l app.kubernetes.io/component=kubelet -o jsonpath='{.items[0].metadata.name}') -c agent -- nslookup kafka.kafka.svc.cluster.local &>/dev/null; then
    test_pass "Kafka service DNS resolution"
else
    test_fail "Kafka service DNS resolution"
fi

echo -e "\n${YELLOW}Testing Kafka port connectivity...${NC}"
if kubectl exec -n newrelic $(kubectl get pods -n newrelic -l app.kubernetes.io/component=kubelet -o jsonpath='{.items[0].metadata.name}') -c agent -- nc -zv kafka.kafka.svc.cluster.local 9092 &>/dev/null; then
    test_pass "Kafka port 9092 connectivity"
else
    test_fail "Kafka port 9092 connectivity"
fi

echo -e "\n${YELLOW}Testing JMX port connectivity...${NC}"
if kubectl exec -n newrelic $(kubectl get pods -n newrelic -l app.kubernetes.io/component=kubelet -o jsonpath='{.items[0].metadata.name}') -c agent -- nc -zv kafka.kafka.svc.cluster.local 9999 &>/dev/null; then
    test_pass "JMX port 9999 connectivity"
else
    test_fail "JMX port 9999 connectivity"
fi

# 2. Kafka Health Checks
print_header "Kafka Health Checks"

echo -e "\n${YELLOW}Checking Kafka pods...${NC}"
KAFKA_PODS=$(kubectl get pods -n kafka -l app=kafka -o jsonpath='{.items[*].metadata.name}')
if [ -n "$KAFKA_PODS" ]; then
    test_pass "Kafka pods found: $KAFKA_PODS"
    
    for pod in $KAFKA_PODS; do
        echo -e "\n${YELLOW}Checking JMX on pod $pod...${NC}"
        JMX_CHECK=$(kubectl exec -n kafka $pod -- bash -c "ps aux | grep -o 'jmxremote.port=9999' | head -1" || echo "")
        if [ -n "$JMX_CHECK" ]; then
            test_pass "JMX enabled on $pod"
        else
            test_fail "JMX not properly configured on $pod"
        fi
    done
else
    test_fail "No Kafka pods found"
fi

# 3. New Relic Infrastructure Agent Checks
print_header "New Relic Infrastructure Agent Checks"

echo -e "\n${YELLOW}Checking nri-kafka binary...${NC}"
NRI_POD=$(kubectl get pods -n newrelic -l app.kubernetes.io/component=kubelet -o jsonpath='{.items[0].metadata.name}')
if kubectl exec -n newrelic $NRI_POD -c agent -- ls /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka &>/dev/null; then
    test_pass "nri-kafka binary exists"
    
    # Get version
    VERSION=$(kubectl exec -n newrelic $NRI_POD -c agent -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka --version 2>&1 || echo "unknown")
    echo "  Version: $VERSION"
else
    test_fail "nri-kafka binary not found"
fi

# 4. Manual Integration Tests
print_header "Manual Integration Execution Tests"

echo -e "\n${YELLOW}Test 1: Basic metrics collection...${NC}"
OUTPUT=$(kubectl exec -n newrelic $NRI_POD -c agent -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
    --cluster_name test \
    --bootstrap_broker_host kafka.kafka.svc.cluster.local \
    --bootstrap_broker_jmx_port 9999 \
    --bootstrap_broker_kafka_port 9092 \
    --metrics 2>&1)

if echo "$OUTPUT" | grep -q '"data"'; then
    test_pass "Integration executes successfully"
    
    # Check if data array is empty
    if echo "$OUTPUT" | grep -q '"data": \[\]'; then
        test_warn "Integration returns empty data array"
        echo "  This might indicate connection or authentication issues"
    else
        test_pass "Integration returns data"
    fi
else
    test_fail "Integration execution failed"
    echo "  Error: $OUTPUT"
fi

echo -e "\n${YELLOW}Test 2: Inventory collection...${NC}"
OUTPUT=$(kubectl exec -n newrelic $NRI_POD -c agent -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
    --cluster_name test \
    --bootstrap_broker_host kafka.kafka.svc.cluster.local \
    --bootstrap_broker_jmx_port 9999 \
    --bootstrap_broker_kafka_port 9092 \
    --inventory 2>&1)

if echo "$OUTPUT" | grep -q '"inventory"'; then
    test_pass "Inventory collection works"
else
    test_warn "No inventory data collected"
fi

# 5. Integration Configuration Tests
print_header "Integration Configuration Tests"

echo -e "\n${YELLOW}Checking integration config format...${NC}"
# Check if integrations are configured
CONFIG_CHECK=$(kubectl get configmap -n newrelic -o yaml | grep -c "nri-kafka" || echo "0")
if [ "$CONFIG_CHECK" -gt 0 ]; then
    test_pass "nri-kafka configuration found in ConfigMaps"
else
    test_warn "No nri-kafka configuration found in ConfigMaps"
fi

# 6. Log Analysis
print_header "Log Analysis"

echo -e "\n${YELLOW}Checking infrastructure agent logs for integration errors...${NC}"
ERRORS=$(kubectl logs -n newrelic $NRI_POD -c agent --tail=100 | grep -i "nri-kafka\|integration" | grep -i "error" || echo "")
if [ -z "$ERRORS" ]; then
    test_pass "No integration errors in logs"
else
    test_fail "Found integration errors:"
    echo "$ERRORS"
fi

# 7. Advanced JMX Tests
print_header "Advanced JMX Tests"

echo -e "\n${YELLOW}Testing JMX with authentication disabled...${NC}"
OUTPUT=$(kubectl exec -n newrelic $NRI_POD -c agent -- timeout 10 /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
    --cluster_name test \
    --bootstrap_broker_host kafka.kafka.svc.cluster.local \
    --bootstrap_broker_jmx_port 9999 \
    --bootstrap_broker_kafka_port 9092 \
    --jmx_ssl_enable=false \
    --metrics \
    --verbose 2>&1 || echo "timeout")

if echo "$OUTPUT" | grep -q "timeout"; then
    test_warn "JMX connection timed out - possible authentication issue"
else
    test_pass "JMX connection established"
fi

# 8. Discovery Tests
print_header "Service Discovery Tests"

echo -e "\n${YELLOW}Testing Kubernetes service discovery...${NC}"
if kubectl exec -n newrelic $NRI_POD -c agent -- ls /var/db/newrelic-infra/nri-discovery-kubernetes &>/dev/null; then
    test_pass "Discovery binary exists"
    
    # Test discovery execution
    DISCOVERY_OUT=$(kubectl exec -n newrelic $NRI_POD -c agent -- /var/db/newrelic-infra/nri-discovery-kubernetes --port 10250 --tls 2>&1 || echo "failed")
    if echo "$DISCOVERY_OUT" | grep -q "failed"; then
        test_fail "Discovery execution failed"
    else
        test_pass "Discovery executes"
    fi
else
    test_fail "Discovery binary not found"
fi

# 9. Alternative Connection Methods
print_header "Alternative Connection Methods"

echo -e "\n${YELLOW}Testing direct pod connection...${NC}"
KAFKA_POD_IP=$(kubectl get pod -n kafka -l app=kafka -o jsonpath='{.items[0].status.podIP}')
if [ -n "$KAFKA_POD_IP" ]; then
    OUTPUT=$(kubectl exec -n newrelic $NRI_POD -c agent -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
        --cluster_name test \
        --bootstrap_broker_host $KAFKA_POD_IP \
        --bootstrap_broker_jmx_port 9999 \
        --bootstrap_broker_kafka_port 9092 \
        --metrics 2>&1)
    
    if echo "$OUTPUT" | grep -q '"data"'; then
        test_pass "Direct pod IP connection works"
    else
        test_fail "Direct pod IP connection failed"
    fi
else
    test_fail "Could not get Kafka pod IP"
fi

# 10. Environment Variable Tests
print_header "Environment Variable Tests"

echo -e "\n${YELLOW}Checking integration environment...${NC}"
ENV_VARS=$(kubectl exec -n newrelic $NRI_POD -c agent -- env | grep -E "CLUSTER_NAME|NRIA" || echo "")
if [ -n "$ENV_VARS" ]; then
    echo "Environment variables:"
    echo "$ENV_VARS"
    test_pass "Environment variables set"
else
    test_warn "No relevant environment variables found"
fi

# Summary
print_header "TROUBLESHOOTING SUMMARY"
echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Tests Failed: $TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}All tests passed! The integration should be working.${NC}"
else
    echo -e "\n${RED}Some tests failed. Please review the output above.${NC}"
fi

# Recommendations
print_header "RECOMMENDATIONS"

if echo "$OUTPUT" | grep -q '"data": \[\]'; then
    echo "1. The integration connects but returns no data. Check:"
    echo "   - JMX authentication settings"
    echo "   - Kafka broker logs for JMX errors"
    echo "   - Try running Kafka with KAFKA_JMX_OPTS including:"
    echo "     -Dcom.sun.management.jmxremote.authenticate=false"
fi

echo -e "\n2. Enable debug logging by adding to integration config:"
echo "   NRI_LOG_LEVEL: debug"

echo -e "\n3. Check New Relic UI:"
echo "   - Infrastructure > Third-party services > Kafka"
echo "   - Query: FROM KafkaBrokerSample SELECT *"

echo -e "\n4. Alternative approaches:"
echo "   - Use Prometheus JMX exporter + nri-prometheus"
echo "   - Deploy nri-kafka as a standalone DaemonSet"
echo "   - Use New Relic's Kafka integration via OpenTelemetry"

echo -e "\n${BLUE}Troubleshooting complete!${NC}"