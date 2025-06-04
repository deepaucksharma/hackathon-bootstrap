#!/bin/bash

# Comprehensive Health Check for Strimzi Kafka Deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="strimzi-kafka"
NR_NAMESPACE="newrelic"
KAFKA_CLUSTER="production-kafka"

# Helper functions
print_header() {
    echo -e "\n${BLUE}==== $1 ====${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

check_command() {
    if command -v "$1" &> /dev/null; then
        return 0
    else
        print_error "$1 command not found"
        return 1
    fi
}

# Pre-flight checks
print_header "Pre-flight Checks"
check_command kubectl || exit 1
kubectl cluster-info &>/dev/null || { print_error "Cannot connect to Kubernetes cluster"; exit 1; }
print_success "Connected to Kubernetes cluster"

# Check namespaces
print_header "Namespace Verification"
if kubectl get namespace $NAMESPACE &>/dev/null; then
    print_success "Strimzi namespace exists: $NAMESPACE"
else
    print_error "Strimzi namespace not found: $NAMESPACE"
    exit 1
fi

if kubectl get namespace $NR_NAMESPACE &>/dev/null; then
    print_success "New Relic namespace exists: $NR_NAMESPACE"
else
    print_warning "New Relic namespace not found: $NR_NAMESPACE"
fi

# Check Strimzi Operator
print_header "Strimzi Operator Status"
OPERATOR_READY=$(kubectl get deployment -n $NAMESPACE strimzi-cluster-operator -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [ "$OPERATOR_READY" -ge 1 ]; then
    print_success "Strimzi operator is running ($OPERATOR_READY replicas ready)"
    
    # Check operator logs for errors
    ERROR_COUNT=$(kubectl logs -n $NAMESPACE deployment/strimzi-cluster-operator --tail=100 2>/dev/null | grep -c ERROR || echo "0")
    if [ "$ERROR_COUNT" -gt 0 ]; then
        print_warning "Found $ERROR_COUNT errors in operator logs (last 100 lines)"
    fi
else
    print_error "Strimzi operator is not running"
fi

# Check CRDs
print_header "Custom Resource Definitions"
REQUIRED_CRDS=("kafkas.kafka.strimzi.io" "kafkatopics.kafka.strimzi.io" "kafkausers.kafka.strimzi.io")
for crd in "${REQUIRED_CRDS[@]}"; do
    if kubectl get crd "$crd" &>/dev/null; then
        print_success "CRD exists: $crd"
    else
        print_error "CRD missing: $crd"
    fi
done

# Check Kafka Cluster
print_header "Kafka Cluster Status"
KAFKA_STATUS=$(kubectl get kafka -n $NAMESPACE $KAFKA_CLUSTER -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "Unknown")
if [ "$KAFKA_STATUS" == "True" ]; then
    print_success "Kafka cluster is ready"
else
    print_error "Kafka cluster is not ready (status: $KAFKA_STATUS)"
    kubectl get kafka -n $NAMESPACE $KAFKA_CLUSTER -o jsonpath='{.status.conditions[*]}' | jq '.' 2>/dev/null || true
fi

# Check Kafka Brokers
print_header "Kafka Broker Status"
EXPECTED_BROKERS=3
RUNNING_BROKERS=$(kubectl get pods -n $NAMESPACE -l strimzi.io/name=${KAFKA_CLUSTER}-kafka -o jsonpath='{.items[*].status.phase}' | tr ' ' '\n' | grep -c "Running" || echo "0")
if [ "$RUNNING_BROKERS" -eq "$EXPECTED_BROKERS" ]; then
    print_success "All $EXPECTED_BROKERS Kafka brokers are running"
else
    print_error "Only $RUNNING_BROKERS/$EXPECTED_BROKERS Kafka brokers are running"
fi

# Check individual broker health
for i in 0 1 2; do
    POD_NAME="${KAFKA_CLUSTER}-kafka-$i"
    if kubectl get pod -n $NAMESPACE "$POD_NAME" &>/dev/null; then
        READY=$(kubectl get pod -n $NAMESPACE "$POD_NAME" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}')
        RESTARTS=$(kubectl get pod -n $NAMESPACE "$POD_NAME" -o jsonpath='{.status.containerStatuses[0].restartCount}')
        if [ "$READY" == "True" ]; then
            print_success "Broker $i: Ready (Restarts: $RESTARTS)"
        else
            print_error "Broker $i: Not ready (Restarts: $RESTARTS)"
        fi
    else
        print_error "Broker $i: Pod not found"
    fi
done

# Check Zookeeper
print_header "Zookeeper Status"
EXPECTED_ZK=3
RUNNING_ZK=$(kubectl get pods -n $NAMESPACE -l strimzi.io/name=${KAFKA_CLUSTER}-zookeeper -o jsonpath='{.items[*].status.phase}' | tr ' ' '\n' | grep -c "Running" || echo "0")
if [ "$RUNNING_ZK" -eq "$EXPECTED_ZK" ]; then
    print_success "All $EXPECTED_ZK Zookeeper nodes are running"
else
    print_error "Only $RUNNING_ZK/$EXPECTED_ZK Zookeeper nodes are running"
fi

# Check Storage
print_header "Persistent Storage"
PVC_COUNT=$(kubectl get pvc -n $NAMESPACE | grep -c "$KAFKA_CLUSTER" || echo "0")
BOUND_PVC=$(kubectl get pvc -n $NAMESPACE -o jsonpath='{.items[*].status.phase}' | tr ' ' '\n' | grep -c "Bound" || echo "0")
print_success "PVCs: $BOUND_PVC bound out of $PVC_COUNT total"

# Check Topics
print_header "Kafka Topics"
TOPICS=$(kubectl get kafkatopic -n $NAMESPACE --no-headers 2>/dev/null | wc -l || echo "0")
if [ "$TOPICS" -gt 0 ]; then
    print_success "Found $TOPICS topics"
    kubectl get kafkatopic -n $NAMESPACE -o wide | head -5
else
    print_warning "No topics found"
fi

# Check Users
print_header "Kafka Users"
USERS=$(kubectl get kafkauser -n $NAMESPACE --no-headers 2>/dev/null | wc -l || echo "0")
if [ "$USERS" -gt 0 ]; then
    print_success "Found $USERS users"
    kubectl get kafkauser -n $NAMESPACE
else
    print_warning "No users found"
fi

# Check JMX Configuration
print_header "JMX Configuration"
for i in 0 1 2; do
    POD_NAME="${KAFKA_CLUSTER}-kafka-$i"
    JMX_PORT=$(kubectl get pod -n $NAMESPACE "$POD_NAME" -o jsonpath='{.spec.containers[0].ports[?(@.name=="jmx")].containerPort}' 2>/dev/null || echo "")
    if [ "$JMX_PORT" == "9999" ]; then
        print_success "Broker $i: JMX port configured (9999)"
    else
        print_error "Broker $i: JMX port not configured"
    fi
done

# Check JMX connectivity
print_header "JMX Connectivity Test"
kubectl run jmx-connectivity-test --rm -i --restart=Never \
  --image=busybox \
  -n $NAMESPACE -- sh -c "
    for i in 0 1 2; do
        echo -n \"Broker \$i JMX: \"
        timeout 2 nc -zv ${KAFKA_CLUSTER}-kafka-\$i.${KAFKA_CLUSTER}-kafka-brokers 9999 2>&1 || echo 'Connection failed'
    done
" 2>/dev/null || print_warning "JMX connectivity test failed"

# Check Test Clients
print_header "Test Client Status"
PRODUCER_RUNNING=$(kubectl get pods -n $NAMESPACE -l app=kafka-producer -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "Not found")
CONSUMER_RUNNING=$(kubectl get pods -n $NAMESPACE -l app=kafka-consumer -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "Not found")

if [ "$PRODUCER_RUNNING" == "Running" ]; then
    print_success "Producer is running"
    # Check recent logs
    PRODUCE_COUNT=$(kubectl logs -n $NAMESPACE -l app=kafka-producer --tail=10 2>/dev/null | grep -c "Message at" || echo "0")
    if [ "$PRODUCE_COUNT" -gt 0 ]; then
        print_success "Producer is actively sending messages"
    fi
else
    print_warning "Producer status: $PRODUCER_RUNNING"
fi

if [ "$CONSUMER_RUNNING" == "Running" ]; then
    print_success "Consumer is running"
else
    print_warning "Consumer status: $CONSUMER_RUNNING"
fi

# Check New Relic Integration
print_header "New Relic Integration"
if kubectl get namespace $NR_NAMESPACE &>/dev/null; then
    NRI_RUNNING=$(kubectl get pods -n $NR_NAMESPACE -l app=nri-kafka-strimzi -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "Not found")
    if [ "$NRI_RUNNING" == "Running" ]; then
        print_success "New Relic integration is running"
        
        # Check for recent errors
        ERROR_COUNT=$(kubectl logs -n $NR_NAMESPACE -l app=nri-kafka-strimzi --tail=50 2>/dev/null | grep -ci "error\|failed" || echo "0")
        if [ "$ERROR_COUNT" -gt 0 ]; then
            print_warning "Found $ERROR_COUNT error messages in New Relic logs (last 50 lines)"
        else
            print_success "No recent errors in New Relic logs"
        fi
    else
        print_error "New Relic integration status: $NRI_RUNNING"
    fi
else
    print_warning "New Relic namespace not found"
fi

# Performance Metrics
print_header "Quick Performance Check"
# Check under-replicated partitions
kubectl exec -n $NAMESPACE ${KAFKA_CLUSTER}-kafka-0 -- \
    /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
    --describe --under-replicated-partitions 2>/dev/null | grep -q "Topic:" && \
    print_warning "Found under-replicated partitions" || \
    print_success "No under-replicated partitions"

# Resource Usage
print_header "Resource Usage"
echo -e "\nTop 5 pods by CPU usage:"
kubectl top pods -n $NAMESPACE --no-headers 2>/dev/null | sort -k3 -rn | head -5 || print_warning "Metrics server not available"

echo -e "\nTop 5 pods by memory usage:"
kubectl top pods -n $NAMESPACE --no-headers 2>/dev/null | sort -k4 -rn | head -5 || print_warning "Metrics server not available"

# Recent Events
print_header "Recent Warning Events"
WARNING_EVENTS=$(kubectl get events -n $NAMESPACE --field-selector type=Warning --sort-by='.lastTimestamp' 2>/dev/null | tail -5 | grep -c Warning || echo "0")
if [ "$WARNING_EVENTS" -gt 0 ]; then
    print_warning "Found $WARNING_EVENTS warning events"
    kubectl get events -n $NAMESPACE --field-selector type=Warning --sort-by='.lastTimestamp' | tail -5
else
    print_success "No recent warning events"
fi

# Summary
print_header "Health Check Summary"
echo -e "\nDeployment Status:"
echo "- Strimzi Operator: $([ "$OPERATOR_READY" -ge 1 ] && echo "✓ Running" || echo "✗ Not Running")"
echo "- Kafka Cluster: $([ "$KAFKA_STATUS" == "True" ] && echo "✓ Ready" || echo "✗ Not Ready")"
echo "- Kafka Brokers: $RUNNING_BROKERS/$EXPECTED_BROKERS running"
echo "- Zookeeper Nodes: $RUNNING_ZK/$EXPECTED_ZK running"
echo "- Topics: $TOPICS created"
echo "- Users: $USERS created"
echo "- Test Producer: $([ "$PRODUCER_RUNNING" == "Running" ] && echo "✓ Running" || echo "⚠ $PRODUCER_RUNNING")"
echo "- Test Consumer: $([ "$CONSUMER_RUNNING" == "Running" ] && echo "✓ Running" || echo "⚠ $CONSUMER_RUNNING")"
echo "- New Relic Integration: $([ "$NRI_RUNNING" == "Running" ] && echo "✓ Running" || echo "⚠ $NRI_RUNNING")"

# Overall health
echo -e "\nOverall Health: "
if [ "$OPERATOR_READY" -ge 1 ] && [ "$KAFKA_STATUS" == "True" ] && [ "$RUNNING_BROKERS" -eq "$EXPECTED_BROKERS" ] && [ "$RUNNING_ZK" -eq "$EXPECTED_ZK" ]; then
    print_success "HEALTHY - All core components are running"
else
    print_error "UNHEALTHY - Some components are not running properly"
fi

# Recommendations
if [ "$WARNING_EVENTS" -gt 0 ] || [ "$ERROR_COUNT" -gt 0 ]; then
    echo -e "\n${YELLOW}Recommendations:${NC}"
    echo "1. Check recent events: kubectl get events -n $NAMESPACE --sort-by='.lastTimestamp'"
    echo "2. Check operator logs: kubectl logs -n $NAMESPACE deployment/strimzi-cluster-operator --tail=100"
    echo "3. Check broker logs: kubectl logs -n $NAMESPACE ${KAFKA_CLUSTER}-kafka-0"
    [ "$NRI_RUNNING" == "Running" ] && echo "4. Check New Relic logs: kubectl logs -n $NR_NAMESPACE deployment/nri-kafka-strimzi --tail=100"
fi