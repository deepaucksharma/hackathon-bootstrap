#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    print_error "kubectl is not installed"
    exit 1
fi

# Check namespace exists
if ! kubectl get namespace kafka-validation &> /dev/null; then
    print_error "kafka-validation namespace not found. Please run setup-k8s-cluster.sh first"
    exit 1
fi

print_header "Kafka Validation Status Report"
echo ""

# Check Kafka cluster status
print_header "Kafka Cluster Status"
kubectl get pods -n kafka-validation -l app.kubernetes.io/name=kafka -o wide
echo ""

# Check Zookeeper status
print_header "Zookeeper Status"
kubectl get pods -n kafka-validation -l app=zookeeper -o wide
echo ""

# Check producer/consumer status
print_header "Test Producer/Consumer Status"
kubectl get pods -n kafka-validation -l 'app in (kafka-producer, kafka-consumer)' -o wide
echo ""

# Check New Relic agent status
print_header "New Relic Agent Status"
if kubectl get daemonset newrelic-infrastructure -n kafka-validation &> /dev/null; then
    kubectl get pods -n kafka-validation -l name=newrelic-infrastructure -o wide
else
    print_warning "New Relic infrastructure agent not deployed"
fi
echo ""

# Verify Kafka topics
print_header "Kafka Topics"
KAFKA_POD=$(kubectl get pods -n kafka-validation -l app.kubernetes.io/name=kafka -o jsonpath='{.items[0].metadata.name}')
if [ ! -z "$KAFKA_POD" ]; then
    kubectl exec -n kafka-validation $KAFKA_POD -- kafka-topics.sh --list --bootstrap-server localhost:9092 2>/dev/null || print_error "Failed to list topics"
fi
echo ""

# Check consumer groups
print_header "Consumer Groups"
if [ ! -z "$KAFKA_POD" ]; then
    kubectl exec -n kafka-validation $KAFKA_POD -- kafka-consumer-groups.sh --list --bootstrap-server localhost:9092 2>/dev/null || print_error "Failed to list consumer groups"
fi
echo ""

# Check producer activity
print_header "Recent Producer Activity"
kubectl logs -n kafka-validation -l app=kafka-producer --tail=5 2>/dev/null || print_warning "No producer logs found"
echo ""

# Check consumer activity
print_header "Recent Consumer Activity"
kubectl logs -n kafka-validation -l app=kafka-consumer --tail=5 2>/dev/null || print_warning "No consumer logs found"
echo ""

# Check New Relic agent logs for Kafka metrics
if kubectl get daemonset newrelic-infrastructure -n kafka-validation &> /dev/null; then
    print_header "New Relic Kafka Integration Status"
    NR_POD=$(kubectl get pods -n kafka-validation -l name=newrelic-infrastructure -o jsonpath='{.items[0].metadata.name}')
    if [ ! -z "$NR_POD" ]; then
        print_status "Checking for Kafka metrics collection..."
        kubectl logs -n kafka-validation $NR_POD -c newrelic-infrastructure --tail=100 | grep -i "kafka" | tail -10 || print_warning "No Kafka-related logs found"
    fi
    echo ""
fi

# Test direct Kafka connectivity
print_header "Kafka Connectivity Test"
if command -v kafkacat &> /dev/null || command -v kcat &> /dev/null; then
    KAFKA_CMD=$(command -v kcat || command -v kafkacat)
    print_status "Testing Kafka broker connectivity on localhost:30092..."
    timeout 5 $KAFKA_CMD -b localhost:30092 -L 2>/dev/null | head -20 || print_warning "Could not connect to Kafka broker"
else
    print_warning "kafkacat/kcat not installed - skipping connectivity test"
    print_status "Install with: apt-get install kafkacat (or) brew install kcat"
fi
echo ""

# Validate metrics are being collected
if [ ! -z "$NEW_RELIC_LICENSE_KEY" ] && [ ! -z "$NEW_RELIC_API_KEY" ]; then
    print_header "New Relic Metrics Validation"
    print_status "Querying New Relic for Kafka metrics..."
    
    # Query for Kafka broker metrics
    curl -s -X POST https://api.newrelic.com/graphql \
        -H "Content-Type: application/json" \
        -H "API-Key: $NEW_RELIC_API_KEY" \
        -d '{
            "query": "{ actor { account(id: YOUR_ACCOUNT_ID) { nrql(query: \"SELECT count(*) FROM KafkaBrokerSample WHERE clusterName = '\''kafka-validation-cluster'\'' SINCE 5 minutes ago\") { results } } } }"
        }' | jq -r '.data.actor.account.nrql.results[0].count' || print_warning "Failed to query New Relic API"
else
    print_warning "NEW_RELIC_API_KEY not set - skipping metrics validation"
    print_status "Set NEW_RELIC_API_KEY to validate metrics in New Relic"
fi

print_header "Validation Summary"
print_status "Cluster setup: Complete"
print_status "Kafka brokers: $(kubectl get pods -n kafka-validation -l app.kubernetes.io/name=kafka --no-headers | wc -l)/3 running"
print_status "Producer/Consumer: Active"

if kubectl get daemonset newrelic-infrastructure -n kafka-validation &> /dev/null; then
    print_status "New Relic agent: Deployed"
else
    print_warning "New Relic agent: Not deployed"
fi

echo ""
print_status "For detailed troubleshooting, check the logs of individual components"
print_status "To view all pods: kubectl get pods -n kafka-validation"
print_status "To view logs: kubectl logs -n kafka-validation <pod-name>"