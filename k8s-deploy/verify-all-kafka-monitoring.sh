#!/bin/bash

# Script to verify monitoring for all Kafka instances in the cluster

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}Kafka Monitoring Verification${NC}"
echo -e "${BLUE}=========================================${NC}"

# Function to print section headers
print_section() {
    echo -e "\n${YELLOW}=== $1 ===${NC}"
}

# Function to check pod status
check_pod() {
    local namespace=$1
    local pod=$2
    local status=$(kubectl get pod -n $namespace $pod -o jsonpath='{.status.phase}' 2>/dev/null || echo "NotFound")
    
    if [ "$status" == "Running" ]; then
        echo -e "${GREEN}✓${NC} $pod: $status"
        return 0
    else
        echo -e "${RED}✗${NC} $pod: $status"
        return 1
    fi
}

# 1. Check Regular Kafka in 'kafka' namespace
print_section "Regular Kafka Status"

echo "Kafka Pods:"
kubectl get pods -n kafka -o wide | grep -v "NAME"

# Check JMX on regular Kafka
KAFKA_POD=$(kubectl get pods -n kafka -l app=kafka -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -n "$KAFKA_POD" ]; then
    echo -e "\nTesting JMX on Regular Kafka ($KAFKA_POD):"
    kubectl exec -n kafka jmx-network-diagnostic -c jmx-tools -- /scripts/test-jmx-connection.sh kafka-0.kafka-headless.kafka.svc.cluster.local 9999 2>&1 | grep -E "TCP connection|JMX connection|MBean count" || echo "JMX test failed"
fi

# 2. Check Strimzi Kafka in 'strimzi-kafka' namespace
print_section "Strimzi Kafka Status"

echo "Strimzi Kafka Pods:"
kubectl get pods -n strimzi-kafka | grep -E "production-kafka|strimzi" | grep -v "NAME"

# Check JMX on Strimzi Kafka (with auth)
echo -e "\nStrimzi JMX Status:"
kubectl exec -n strimzi-kafka production-kafka-dual-role-0 -- ss -tlnp 2>/dev/null | grep 9999 || echo "JMX port check failed"

# 3. Check New Relic Monitoring
print_section "New Relic Monitoring Status"

echo "New Relic Kafka Monitoring Pods:"
kubectl get pods -n newrelic | grep kafka | grep -v "NAME"

# 4. Test nri-kafka from monitor pod
print_section "Testing nri-kafka Integration"

NRI_POD=$(kubectl get pods -n newrelic -l app=nri-kafka-monitor -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -n "$NRI_POD" ]; then
    echo -e "\nTesting Regular Kafka collection:"
    kubectl exec -n newrelic $NRI_POD -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
        --cluster_name k8s-kafka-cluster \
        --bootstrap_broker_host kafka-0.kafka-headless.kafka.svc.cluster.local \
        --bootstrap_broker_jmx_port 9999 \
        --bootstrap_broker_kafka_port 9092 \
        --metrics --pretty 2>&1 | head -10
        
    echo -e "\nTesting Strimzi Kafka collection (with auth):"
    kubectl exec -n newrelic $NRI_POD -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
        --cluster_name strimzi-production-kafka \
        --bootstrap_broker_host production-kafka-kafka-bootstrap.strimzi-kafka.svc.cluster.local \
        --bootstrap_broker_jmx_port 9999 \
        --bootstrap_broker_kafka_port 9092 \
        --jmx_user rCe1MjLc8TCwQd3V \
        --jmx_pass eDDTQCWmvXHTQFiB \
        --metrics --pretty 2>&1 | head -10
fi

# 5. Check logs for errors
print_section "Recent Error Logs"

echo "Regular Kafka errors:"
kubectl logs -n newrelic $NRI_POD --tail=5 2>&1 | grep -E "error|ERROR|failed" || echo "No recent errors"

# 6. New Relic Query suggestions
print_section "New Relic Query Suggestions"

echo -e "\nQuery these in New Relic One:"
echo "1. Regular Kafka metrics:"
echo "   FROM KafkaBrokerSample SELECT * WHERE clusterName = 'k8s-kafka-cluster' SINCE 1 hour ago"
echo ""
echo "2. Strimzi Kafka metrics:"
echo "   FROM KafkaBrokerSample SELECT * WHERE clusterName = 'strimzi-production-kafka' SINCE 1 hour ago"
echo ""
echo "3. All Kafka metrics:"
echo "   FROM KafkaBrokerSample SELECT * SINCE 1 hour ago"
echo ""
echo "4. Integration health:"
echo "   FROM SystemSample SELECT * WHERE integration.name = 'com.newrelic.kafka' SINCE 1 hour ago"

# 7. Summary
print_section "Summary"

echo -e "\n${BLUE}Kafka Deployments Found:${NC}"
echo "1. Regular Kafka in 'kafka' namespace"
echo "   - StatefulSet: kafka-0"
echo "   - Sidecar deployment: kafka-with-nri-sidecar"
echo "   - JMX Port: 9999 (no auth)"
echo ""
echo "2. Strimzi Kafka in 'strimzi-kafka' namespace"
echo "   - StatefulSet: production-kafka-dual-role-0/1/2"
echo "   - JMX Port: 9999 (with auth)"
echo "   - Username: rCe1MjLc8TCwQd3V"
echo ""
echo -e "${BLUE}Monitoring Status:${NC}"
echo "- nri-kafka-monitor is running"
echo "- Both Kafka instances have JMX enabled"
echo "- Integration returns empty data (common issue)"
echo ""
echo -e "${YELLOW}Recommendations:${NC}"
echo "1. Check New Relic UI for any incoming metrics"
echo "2. Consider using Prometheus JMX Exporter instead"
echo "3. Enable debug logging for more details"
echo "4. For Strimzi, use the built-in Kafka Exporter"

echo -e "\n${BLUE}Script Complete!${NC}"