#!/bin/bash

# Check New Relic for Kafka MSK metrics

set -e

echo "=========================================="
echo "New Relic Kafka MSK Metrics Verification"
echo "=========================================="
echo "Time: $(date)"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
CLUSTER_NAME="${CLUSTER_NAME:-minikube-kafka}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-123456789012}"
AWS_REGION="${AWS_REGION:-us-east-1}"

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"
    
    # Check if nri-kafka is running
    if ! kubectl get pods -n newrelic -l app=nri-kafka --field-selector=status.phase=Running 2>/dev/null | grep -q Running; then
        echo -e "${RED}Warning: nri-kafka pods are not running${NC}"
        echo "Run './deploy-all.sh' first"
    fi
    
    # Check environment
    echo -e "\n${YELLOW}Current configuration:${NC}"
    echo "Cluster Name: $CLUSTER_NAME"
    echo "AWS Account ID: $AWS_ACCOUNT_ID"
    echo "AWS Region: $AWS_REGION"
}

# Check local metrics generation
check_local_metrics() {
    echo -e "\n${BLUE}=== Local Metrics Generation ===${NC}"
    
    # Get nri-kafka pod
    POD=$(kubectl get pods -n newrelic -l app=nri-kafka -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    
    if [ -z "$POD" ]; then
        echo -e "${RED}No nri-kafka pod found${NC}"
        return
    fi
    
    # Check recent logs for metrics
    echo -e "\n${YELLOW}Recent metric samples from logs:${NC}"
    kubectl logs -n newrelic $POD --tail=200 | grep -E "(metric_data|entity.type)" | tail -10 || echo "No metrics found in logs"
    
    # Check for MSK entities
    echo -e "\n${YELLOW}MSK entity creation:${NC}"
    kubectl logs -n newrelic $POD --tail=200 | grep -E "(KAFKA_BROKER|KAFKA_TOPIC|KAFKA_CLUSTER)" | tail -5 || echo "No MSK entities found"
    
    # Check for errors
    echo -e "\n${YELLOW}Recent errors:${NC}"
    kubectl logs -n newrelic $POD --tail=100 | grep -i error | tail -5 || echo "No recent errors"
}

# Simulate NRQL queries locally
simulate_nrql_queries() {
    echo -e "\n${BLUE}=== Simulated NRQL Queries ===${NC}"
    
    echo -e "\n${YELLOW}What metrics would be visible in NRDB:${NC}"
    
    # Broker metrics
    echo -e "\n1. ${GREEN}Broker Metrics:${NC}"
    echo "   SELECT * FROM KafkaBrokerSample WHERE"
    echo "   aws.accountId = '$AWS_ACCOUNT_ID' AND"
    echo "   aws.region = '$AWS_REGION' AND"
    echo "   entityName LIKE '%$CLUSTER_NAME%'"
    echo "   Expected metrics: broker.IOInPerSec, broker.IOOutPerSec, broker.messagesInPerSec"
    
    # Topic metrics
    echo -e "\n2. ${GREEN}Topic Metrics:${NC}"
    echo "   SELECT * FROM KafkaTopicSample WHERE"
    echo "   aws.accountId = '$AWS_ACCOUNT_ID' AND"
    echo "   clusterName = '$CLUSTER_NAME'"
    echo "   Expected metrics: topic.retentionSizeOrTime, topic.partitions, topic.replicationFactor"
    
    # Cluster metrics
    echo -e "\n3. ${GREEN}Cluster Metrics:${NC}"
    echo "   SELECT * FROM KafkaClusterSample WHERE"
    echo "   entityName = 'kafka-cluster:$CLUSTER_NAME' AND"
    echo "   environment = 'minikube'"
    echo "   Expected metrics: cluster.brokerCount, cluster.topicCount, cluster.partitionCount"
    
    # Consumer metrics
    echo -e "\n4. ${GREEN}Consumer Group Metrics:${NC}"
    echo "   SELECT * FROM KafkaConsumerSample WHERE"
    echo "   clusterName = '$CLUSTER_NAME'"
    echo "   Expected metrics: consumer.lag, consumer.totalLag, consumer.messageRate"
}

# Check metric flow
check_metric_flow() {
    echo -e "\n${BLUE}=== Metric Flow Analysis ===${NC}"
    
    POD=$(kubectl get pods -n newrelic -l app=nri-kafka -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    
    if [ -n "$POD" ]; then
        # Check JMX collection
        echo -e "\n${YELLOW}JMX metric collection:${NC}"
        kubectl logs -n newrelic $POD --tail=100 | grep -i "jmx" | tail -5 || echo "No JMX logs found"
        
        # Check MSK transformation
        echo -e "\n${YELLOW}MSK transformation:${NC}"
        kubectl logs -n newrelic $POD --tail=100 | grep -i "transform" | tail -5 || echo "No transformation logs found"
        
        # Check entity creation
        echo -e "\n${YELLOW}Entity creation:${NC}"
        kubectl logs -n newrelic $POD --tail=100 | grep -E "(Creating|Created).*entity" | tail -5 || echo "No entity creation logs found"
    fi
}

# Generate test metrics
generate_test_metrics() {
    echo -e "\n${BLUE}=== Generating Test Metrics ===${NC}"
    
    # Create test topic if not exists
    echo -e "\n${YELLOW}Creating test topic...${NC}"
    kubectl exec -n kafka kafka-0 -- kafka-topics.sh \
        --create --if-not-exists \
        --topic metrics-test \
        --partitions 3 \
        --replication-factor 1 \
        --bootstrap-server localhost:9092 2>/dev/null || true
    
    # Send test messages
    echo -e "\n${YELLOW}Sending test messages...${NC}"
    for i in {1..10}; do
        echo "test-message-$i" | kubectl exec -i -n kafka kafka-0 -- \
            kafka-console-producer.sh \
            --broker-list localhost:9092 \
            --topic metrics-test 2>/dev/null || true
    done
    
    echo -e "${GREEN}✓ Test messages sent${NC}"
}

# Check network connectivity
check_connectivity() {
    echo -e "\n${BLUE}=== Network Connectivity ===${NC}"
    
    POD=$(kubectl get pods -n newrelic -l app=nri-kafka -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    
    if [ -n "$POD" ]; then
        echo -e "\n${YELLOW}Testing connectivity from nri-kafka pod:${NC}"
        
        # Test DNS resolution
        echo -n "DNS resolution (google.com): "
        if kubectl exec -n newrelic $POD -- nslookup google.com >/dev/null 2>&1; then
            echo -e "${GREEN}✓ OK${NC}"
        else
            echo -e "${RED}✗ Failed${NC}"
        fi
        
        # Test external connectivity
        echo -n "External connectivity: "
        if kubectl exec -n newrelic $POD -- wget -q --spider --timeout=5 https://www.google.com 2>/dev/null; then
            echo -e "${GREEN}✓ OK${NC}"
        else
            echo -e "${YELLOW}⚠ Limited (expected in isolated environments)${NC}"
        fi
        
        # Test New Relic endpoint
        echo -n "New Relic endpoint: "
        if kubectl exec -n newrelic $POD -- wget -q --spider --timeout=5 https://infrastructure-api.newrelic.com 2>/dev/null; then
            echo -e "${GREEN}✓ Reachable${NC}"
        else
            echo -e "${YELLOW}⚠ Not reachable (check firewall/proxy)${NC}"
        fi
    fi
}

# Show troubleshooting steps
show_troubleshooting() {
    echo -e "\n${BLUE}=== Troubleshooting Guide ===${NC}"
    
    echo -e "\n${YELLOW}If metrics are not appearing in NRDB:${NC}"
    echo "1. Check license key is valid:"
    echo "   kubectl get daemonset -n newrelic nri-kafka -o yaml | grep NRIA_LICENSE_KEY"
    echo ""
    echo "2. Check network connectivity:"
    echo "   - Minikube may need proxy configuration"
    echo "   - Run: minikube ssh -- curl https://infrastructure-api.newrelic.com"
    echo ""
    echo "3. Enable verbose logging:"
    echo "   kubectl set env daemonset/nri-kafka -n newrelic NRIA_LOG_LEVEL=trace"
    echo ""
    echo "4. Check for configuration issues:"
    echo "   kubectl describe configmap nri-kafka-config -n newrelic"
    echo ""
    echo "5. Verify MSK shim is enabled:"
    echo "   kubectl logs -l app=nri-kafka -n newrelic | grep 'MSK.*enabled'"
    echo ""
    echo "6. Force metric collection:"
    echo "   kubectl delete pods -l app=nri-kafka -n newrelic"
}

# Summary
show_summary() {
    echo -e "\n${BLUE}=== Summary ===${NC}"
    
    # Get pod status
    RUNNING=$(kubectl get pods -n newrelic -l app=nri-kafka --field-selector=status.phase=Running 2>/dev/null | grep -c Running || echo "0")
    
    if [ "$RUNNING" -gt 0 ]; then
        echo -e "\n${GREEN}✓ nri-kafka is running${NC}"
        echo -e "${YELLOW}Metrics should appear in NRDB if network connectivity allows${NC}"
    else
        echo -e "\n${RED}✗ nri-kafka is not running properly${NC}"
        echo "Run './troubleshoot.sh' for detailed diagnostics"
    fi
    
    echo -e "\n${YELLOW}Entity GUIDs to look for in New Relic:${NC}"
    echo "- Cluster: MSK_CLUSTER|$AWS_ACCOUNT_ID|$AWS_REGION|$CLUSTER_NAME"
    echo "- Broker: MSK_BROKER|$AWS_ACCOUNT_ID|$AWS_REGION|$CLUSTER_NAME|{broker-id}"
    echo "- Topic: MSK_TOPIC|$AWS_ACCOUNT_ID|$AWS_REGION|$CLUSTER_NAME|{topic-name}"
}

# Main execution
main() {
    check_prerequisites
    check_local_metrics
    simulate_nrql_queries
    check_metric_flow
    generate_test_metrics
    check_connectivity
    show_troubleshooting
    show_summary
}

# Run checks
main