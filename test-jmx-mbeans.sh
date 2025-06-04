#!/bin/bash

# Script to test JMX MBean queries for Kafka debugging
# This helps identify which MBeans are available and their patterns

set -e

echo "=== JMX MBean Test Script for Kafka ==="
echo "This script tests various MBean patterns to identify available metrics"
echo ""

# Common Kafka MBean patterns to test
MBEAN_PATTERNS=(
    # Broker metrics
    "kafka.server:type=BrokerTopicMetrics,name=*"
    "kafka.server:type=ReplicaManager,name=*"
    "kafka.server:type=KafkaRequestHandlerPool,name=*"
    "kafka.controller:type=KafkaController,name=*"
    "kafka.server:type=kafka-metrics-count"
    
    # Network metrics
    "kafka.network:type=RequestMetrics,name=*,request=*"
    "kafka.network:type=SocketServer,name=*"
    
    # Log metrics
    "kafka.log:type=LogManager,name=*"
    "kafka.log:type=Log,name=*,topic=*,partition=*"
    
    # Cluster metrics
    "kafka.cluster:type=Partition,name=*,topic=*,partition=*"
    
    # JVM metrics
    "java.lang:type=Memory"
    "java.lang:type=OperatingSystem"
    "java.lang:type=GarbageCollector,name=*"
    
    # Producer/Consumer metrics
    "kafka.producer:type=producer-metrics,client-id=*"
    "kafka.consumer:type=consumer-metrics,client-id=*"
)

# Function to test an MBean pattern
test_mbean() {
    local pattern=$1
    echo ""
    echo "Testing pattern: $pattern"
    
    if command -v nrjmx &> /dev/null; then
        # Create a temporary query file
        echo "query $pattern" > /tmp/jmx_query.txt
        
        # Run the query
        nrjmx -hostname ${JMX_HOST:-localhost} -port ${JMX_PORT:-9999} \
              ${JMX_USER:+-username $JMX_USER} \
              ${JMX_PASSWORD:+-password $JMX_PASSWORD} \
              -verbose < /tmp/jmx_query.txt 2>&1 | head -20
        
        rm -f /tmp/jmx_query.txt
    else
        echo "nrjmx not found. Please ensure it's in your PATH"
    fi
}

# Function to list all MBeans
list_all_mbeans() {
    echo ""
    echo "=== Listing All Available MBeans ==="
    
    if command -v nrjmx &> /dev/null; then
        echo "list" | nrjmx -hostname ${JMX_HOST:-localhost} -port ${JMX_PORT:-9999} \
                          ${JMX_USER:+-username $JMX_USER} \
                          ${JMX_PASSWORD:+-password $JMX_PASSWORD} \
                          -verbose 2>&1 | grep -E "(kafka|java.lang)" | sort | uniq | head -50
    else
        echo "nrjmx not found"
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --host)
            JMX_HOST="$2"
            shift 2
            ;;
        --port)
            JMX_PORT="$2"
            shift 2
            ;;
        --user)
            JMX_USER="$2"
            shift 2
            ;;
        --password)
            JMX_PASSWORD="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--host HOST] [--port PORT] [--user USER] [--password PASSWORD]"
            exit 1
            ;;
    esac
done

# Display connection info
echo "JMX Connection Details:"
echo "- Host: ${JMX_HOST:-localhost}"
echo "- Port: ${JMX_PORT:-9999}"
echo "- User: ${JMX_USER:-<none>}"
echo ""

# First, list all available MBeans
list_all_mbeans

# Test each MBean pattern
echo ""
echo "=== Testing Common Kafka MBean Patterns ==="
for pattern in "${MBEAN_PATTERNS[@]}"; do
    test_mbean "$pattern"
done

# Test specific queries that nri-kafka uses
echo ""
echo "=== Testing nri-kafka Specific Queries ==="

# Test the exact queries from the broker metrics definitions
echo ""
echo "Testing broker metric queries:"
test_mbean "kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec"
test_mbean "kafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec"
test_mbean "kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec"
test_mbean "kafka.server:type=ReplicaManager,name=PartitionCount"
test_mbean "kafka.controller:type=KafkaController,name=OfflinePartitionsCount"

echo ""
echo "=== Summary ==="
echo "Review the output above to identify:"
echo "1. Which MBeans are actually available in your Kafka instance"
echo "2. The exact naming patterns used by your Kafka version"
echo "3. Any authentication or connection errors"
echo ""
echo "If MBeans are found but nri-kafka returns empty data, the issue may be:"
echo "- MBean attribute names don't match expected patterns"
echo "- The integration is looking for the wrong MBean names for your Kafka version"
echo "- Timeout issues when querying many MBeans"