#!/bin/bash

# Automated verification script for nri-kafka deployment
# This script performs comprehensive checks to verify the deployment is working correctly

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
WARNINGS=0

# Configuration
NAMESPACE_KAFKA="kafka"
NAMESPACE_NEWRELIC="newrelic"
EXPECTED_KAFKA_PODS=3
EXPECTED_ZOOKEEPER_PODS=1
EXPECTED_PRODUCER_PODS=1
EXPECTED_CONSUMER_PODS=2

# Print functions
print_header() {
    echo -e "\n${BLUE}==================== $1 ====================${NC}"
}

print_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

print_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

print_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Check if command exists
check_command() {
    if command -v "$1" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Wait for condition with timeout
wait_for_condition() {
    local condition=$1
    local timeout=$2
    local interval=2
    local elapsed=0

    while [ $elapsed -lt $timeout ]; do
        if eval "$condition"; then
            return 0
        fi
        sleep $interval
        elapsed=$((elapsed + interval))
    done
    return 1
}

# Start verification
echo -e "${BLUE}Starting nri-kafka deployment verification...${NC}"
echo -e "${BLUE}Timestamp: $(date)${NC}"

# Prerequisites check
print_header "Prerequisites Check"

print_test "Checking kubectl availability"
if check_command kubectl; then
    print_pass "kubectl is available"
else
    print_fail "kubectl not found"
    exit 1
fi

print_test "Checking cluster connectivity"
if kubectl cluster-info >/dev/null 2>&1; then
    print_pass "Connected to Kubernetes cluster"
    print_info "Cluster: $(kubectl config current-context)"
else
    print_fail "Not connected to Kubernetes cluster"
    exit 1
fi

# Namespace verification
print_header "Namespace Verification"

print_test "Checking Kafka namespace"
if kubectl get namespace $NAMESPACE_KAFKA >/dev/null 2>&1; then
    print_pass "Kafka namespace exists"
else
    print_fail "Kafka namespace not found"
fi

print_test "Checking New Relic namespace"
if kubectl get namespace $NAMESPACE_NEWRELIC >/dev/null 2>&1; then
    print_pass "New Relic namespace exists"
else
    print_fail "New Relic namespace not found"
fi

# Pod status verification
print_header "Pod Status Verification"

# Kafka pods
print_test "Checking Kafka broker pods"
KAFKA_PODS=$(kubectl get pods -n $NAMESPACE_KAFKA -l app=kafka,component=broker --no-headers 2>/dev/null | grep Running | wc -l)
if [ "$KAFKA_PODS" -eq "$EXPECTED_KAFKA_PODS" ]; then
    print_pass "All $EXPECTED_KAFKA_PODS Kafka broker pods are running"
else
    print_fail "Expected $EXPECTED_KAFKA_PODS Kafka pods, found $KAFKA_PODS running"
    kubectl get pods -n $NAMESPACE_KAFKA -l app=kafka,component=broker
fi

# Zookeeper pods
print_test "Checking Zookeeper pods"
ZOOKEEPER_PODS=$(kubectl get pods -n $NAMESPACE_KAFKA -l app=zookeeper --no-headers 2>/dev/null | grep Running | wc -l)
if [ "$ZOOKEEPER_PODS" -eq "$EXPECTED_ZOOKEEPER_PODS" ]; then
    print_pass "Zookeeper pod is running"
else
    print_fail "Zookeeper pod not running"
fi

# Producer pods
print_test "Checking Kafka producer pods"
PRODUCER_PODS=$(kubectl get pods -n $NAMESPACE_KAFKA -l app=kafka-producer --no-headers 2>/dev/null | grep Running | wc -l)
if [ "$PRODUCER_PODS" -eq "$EXPECTED_PRODUCER_PODS" ]; then
    print_pass "Kafka producer pod is running"
else
    print_fail "Expected $EXPECTED_PRODUCER_PODS producer pods, found $PRODUCER_PODS"
fi

# Consumer pods
print_test "Checking Kafka consumer pods"
CONSUMER_PODS=$(kubectl get pods -n $NAMESPACE_KAFKA -l app=kafka-consumer --no-headers 2>/dev/null | grep Running | wc -l)
if [ "$CONSUMER_PODS" -eq "$EXPECTED_CONSUMER_PODS" ]; then
    print_pass "All $EXPECTED_CONSUMER_PODS Kafka consumer pods are running"
else
    print_fail "Expected $EXPECTED_CONSUMER_PODS consumer pods, found $CONSUMER_PODS"
fi

# New Relic pods
print_test "Checking New Relic Infrastructure pods"
NR_PODS=$(kubectl get pods -n $NAMESPACE_NEWRELIC -l app.kubernetes.io/name=newrelic-infrastructure --no-headers 2>/dev/null | grep Running | wc -l)
if [ "$NR_PODS" -gt 0 ]; then
    print_pass "New Relic Infrastructure pods are running ($NR_PODS pods)"
else
    print_fail "No New Relic Infrastructure pods found running"
fi

# Service verification
print_header "Service Verification"

print_test "Checking Kafka services"
if kubectl get svc -n $NAMESPACE_KAFKA kafka-headless >/dev/null 2>&1; then
    print_pass "Kafka headless service exists"
else
    print_fail "Kafka headless service not found"
fi

# Kafka cluster health
print_header "Kafka Cluster Health"

print_test "Checking Kafka broker connectivity"
for i in 0 1 2; do
    if kubectl exec -n $NAMESPACE_KAFKA kafka-$i -- kafka-broker-api-versions.sh --bootstrap-server localhost:9092 >/dev/null 2>&1; then
        print_pass "Kafka broker $i is healthy"
    else
        print_fail "Kafka broker $i is not responding"
    fi
done

print_test "Listing Kafka topics"
TOPICS=$(kubectl exec -n $NAMESPACE_KAFKA kafka-0 -- kafka-topics.sh --bootstrap-server localhost:9092 --list 2>/dev/null)
if [ -n "$TOPICS" ]; then
    print_pass "Successfully retrieved topic list"
    print_info "Topics: $(echo $TOPICS | tr '\n' ' ')"
else
    print_warn "No topics found or unable to list topics"
fi

print_test "Checking consumer groups"
CONSUMER_GROUPS=$(kubectl exec -n $NAMESPACE_KAFKA kafka-0 -- kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list 2>/dev/null)
if [ -n "$CONSUMER_GROUPS" ]; then
    print_pass "Consumer groups found"
    print_info "Consumer groups: $(echo $CONSUMER_GROUPS | tr '\n' ' ')"
else
    print_warn "No consumer groups found"
fi

# JMX verification
print_header "JMX Connectivity"

print_test "Checking JMX ports on Kafka brokers"
for i in 0 1 2; do
    if kubectl exec -n $NAMESPACE_KAFKA kafka-$i -- netstat -tlnp 2>/dev/null | grep -q 9999; then
        print_pass "JMX port 9999 is listening on kafka-$i"
    else
        print_fail "JMX port 9999 not listening on kafka-$i"
    fi
done

# DNS resolution from New Relic pod
print_header "Network Connectivity"

NR_POD=$(kubectl get pods -n $NAMESPACE_NEWRELIC -l app.kubernetes.io/name=newrelic-infrastructure -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -n "$NR_POD" ]; then
    print_test "Testing DNS resolution from New Relic pod"
    for i in 0 1 2; do
        if kubectl exec -n $NAMESPACE_NEWRELIC $NR_POD -- nslookup kafka-$i.kafka-headless.$NAMESPACE_KAFKA.svc.cluster.local >/dev/null 2>&1; then
            print_pass "DNS resolution successful for kafka-$i"
        else
            print_fail "DNS resolution failed for kafka-$i"
        fi
    done

    print_test "Testing network connectivity to Kafka brokers"
    for i in 0 1 2; do
        if kubectl exec -n $NAMESPACE_NEWRELIC $NR_POD -- nc -zv kafka-$i.kafka-headless.$NAMESPACE_KAFKA.svc.cluster.local 9092 >/dev/null 2>&1; then
            print_pass "Can connect to kafka-$i on port 9092"
        else
            print_fail "Cannot connect to kafka-$i on port 9092"
        fi
    done

    print_test "Testing JMX connectivity from New Relic pod"
    for i in 0 1 2; do
        if kubectl exec -n $NAMESPACE_NEWRELIC $NR_POD -- nc -zv kafka-$i.kafka-headless.$NAMESPACE_KAFKA.svc.cluster.local 9999 >/dev/null 2>&1; then
            print_pass "Can connect to kafka-$i on JMX port 9999"
        else
            print_fail "Cannot connect to kafka-$i on JMX port 9999"
        fi
    done
else
    print_warn "No New Relic pod found for connectivity tests"
fi

# Integration configuration
print_header "Integration Configuration"

print_test "Checking nri-kafka configuration in ConfigMap"
if kubectl get configmap -n $NAMESPACE_NEWRELIC -o yaml 2>/dev/null | grep -q "kafka.*yaml"; then
    print_pass "Kafka integration configuration found in ConfigMap"
else
    print_fail "Kafka integration configuration not found in ConfigMap"
fi

print_test "Checking nri-kafka binary"
if [ -n "$NR_POD" ]; then
    if kubectl exec -n $NAMESPACE_NEWRELIC $NR_POD -c newrelic-infrastructure -- ls /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka >/dev/null 2>&1; then
        print_pass "nri-kafka binary exists"
    else
        print_fail "nri-kafka binary not found"
    fi
fi

# Integration execution
print_header "Integration Execution"

print_test "Checking for Kafka integration in logs"
if [ -n "$NR_POD" ]; then
    KAFKA_LOGS=$(kubectl logs -n $NAMESPACE_NEWRELIC $NR_POD -c newrelic-infrastructure --tail=100 2>/dev/null | grep -i kafka | wc -l)
    if [ "$KAFKA_LOGS" -gt 0 ]; then
        print_pass "Found $KAFKA_LOGS Kafka-related log entries"
        
        # Check for errors
        KAFKA_ERRORS=$(kubectl logs -n $NAMESPACE_NEWRELIC $NR_POD -c newrelic-infrastructure --tail=100 2>/dev/null | grep -i kafka | grep -iE "(error|failed)" | wc -l)
        if [ "$KAFKA_ERRORS" -gt 0 ]; then
            print_warn "Found $KAFKA_ERRORS error entries related to Kafka"
            print_info "Recent errors:"
            kubectl logs -n $NAMESPACE_NEWRELIC $NR_POD -c newrelic-infrastructure --tail=100 2>/dev/null | grep -i kafka | grep -iE "(error|failed)" | tail -3
        fi
    else
        print_fail "No Kafka integration logs found"
    fi
fi

# New Relic data validation
print_header "New Relic Data Validation"

print_test "Checking for successful metric posts"
if [ -n "$NR_POD" ]; then
    SUCCESS_POSTS=$(kubectl logs -n $NAMESPACE_NEWRELIC $NR_POD -c newrelic-infrastructure --tail=200 2>/dev/null | grep "POST" | grep "200" | wc -l)
    if [ "$SUCCESS_POSTS" -gt 0 ]; then
        print_pass "Found $SUCCESS_POSTS successful metric posts"
    else
        print_warn "No successful metric posts found in recent logs"
    fi
fi

# Performance checks
print_header "Performance Checks"

print_test "Checking pod resource usage"
if kubectl top pods -n $NAMESPACE_KAFKA >/dev/null 2>&1; then
    print_pass "Metrics server is available"
    print_info "Kafka namespace resource usage:"
    kubectl top pods -n $NAMESPACE_KAFKA 2>/dev/null | head -10
else
    print_warn "Metrics server not available, skipping resource usage check"
fi

# Summary
print_header "Verification Summary"

echo -e "\n${BLUE}=== SUMMARY ===${NC}"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✓ All tests passed! The deployment appears to be working correctly.${NC}"
    echo -e "\n${BLUE}Next Steps:${NC}"
    echo "1. Check New Relic UI: Infrastructure > Third-party services > Apache Kafka"
    echo "2. Wait 2-5 minutes for metrics to appear"
    echo "3. Run NRQL queries to verify data:"
    echo "   SELECT count(*) FROM KafkaBrokerSample WHERE clusterName = 'YOUR_CLUSTER_NAME' SINCE 30 minutes ago"
    exit 0
else
    echo -e "\n${RED}✗ Some tests failed. Please check the output above for details.${NC}"
    echo -e "\n${YELLOW}Troubleshooting Tips:${NC}"
    echo "1. Check pod logs: kubectl logs -n $NAMESPACE_KAFKA <pod-name>"
    echo "2. Check events: kubectl get events -n $NAMESPACE_KAFKA --sort-by='.lastTimestamp'"
    echo "3. Review the TROUBLESHOOTING.md file for detailed debugging steps"
    exit 1
fi