#!/bin/bash

# Debug script for nri-kafka integration
# This script runs various test configurations to diagnose empty data issues

set -e

echo "=== NRI-Kafka Debug Script ==="
echo "This script will test various configurations to diagnose why nri-kafka returns empty data"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if nri-kafka is built
if [ ! -f "./nri-kafka" ]; then
    echo -e "${YELLOW}Building nri-kafka...${NC}"
    make build
fi

# Function to run a test configuration
run_test() {
    local config_file=$1
    local test_name=$2
    
    echo ""
    echo -e "${GREEN}=== Running Test: $test_name ===${NC}"
    echo "Config file: $config_file"
    echo ""
    
    # Run with verbose output and pretty print
    ./nri-kafka -verbose -pretty -config_path "$config_file" 2>&1 | tee "debug-output-${test_name}.log"
    
    # Check if output contains data
    if grep -q '"data":\[\]' "debug-output-${test_name}.log"; then
        echo -e "${RED}❌ Test returned empty data array${NC}"
    else
        echo -e "${GREEN}✓ Test returned data${NC}"
    fi
    
    # Extract key information
    echo ""
    echo "Key information from output:"
    echo "- Errors:"
    grep -i "error" "debug-output-${test_name}.log" | head -5 || echo "  No errors found"
    echo "- Warnings:"
    grep -i "warn" "debug-output-${test_name}.log" | head -5 || echo "  No warnings found"
    echo "- JMX connections:"
    grep -i "jmx" "debug-output-${test_name}.log" | grep -i "connect" | head -5 || echo "  No JMX connection logs found"
    echo "- Broker discovery:"
    grep -i "broker" "debug-output-${test_name}.log" | grep -E "(found|discover|connect)" | head -5 || echo "  No broker discovery logs found"
    
    echo ""
    echo "----------------------------------------"
}

# Function to test direct JMX connection
test_jmx_connection() {
    echo ""
    echo -e "${GREEN}=== Testing Direct JMX Connection ===${NC}"
    
    # Test with nrjmx directly if available
    if command -v nrjmx &> /dev/null; then
        echo "Testing JMX connection with nrjmx..."
        echo "query kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec" | nrjmx -hostname localhost -port 9999 -verbose || echo "nrjmx connection failed"
    else
        echo "nrjmx not found in PATH"
    fi
    
    # Test with telnet/nc
    echo ""
    echo "Testing port connectivity to localhost:9999..."
    timeout 2 nc -zv localhost 9999 2>&1 || echo "Port 9999 is not reachable"
    
    echo "----------------------------------------"
}

# Function to analyze Kafka broker
analyze_kafka() {
    echo ""
    echo -e "${GREEN}=== Analyzing Kafka Environment ===${NC}"
    
    # Check if Kafka is running
    echo "Checking for Kafka processes..."
    ps aux | grep -E "(kafka|zookeeper)" | grep -v grep | head -5 || echo "No Kafka/Zookeeper processes found"
    
    # Check listening ports
    echo ""
    echo "Checking listening ports..."
    netstat -an | grep -E "(9092|9999|2181)" | grep LISTEN || echo "No expected ports are listening"
    
    echo "----------------------------------------"
}

# Main execution
echo "Starting debug tests..."

# First, analyze the environment
analyze_kafka

# Test JMX connection
test_jmx_connection

# Run each test configuration
run_test "debug-configs/kafka-debug-jmx-only.yml" "jmx-only"
run_test "debug-configs/kafka-debug-bootstrap.yml" "bootstrap-minimal"
run_test "debug-configs/kafka-debug-zookeeper.yml" "zookeeper-discovery"
run_test "debug-configs/kafka-debug-full.yml" "full-collection"
run_test "debug-configs/kafka-debug-consumer-offset.yml" "consumer-offset"

# Summary
echo ""
echo -e "${GREEN}=== Debug Summary ===${NC}"
echo "Log files created:"
ls -la debug-output-*.log 2>/dev/null || echo "No log files created"

echo ""
echo "Next steps:"
echo "1. Review the log files for detailed error messages"
echo "2. Check if JMX is properly configured on your Kafka brokers"
echo "3. Verify that the JMX port (9999) is accessible"
echo "4. Ensure Kafka metrics MBeans are exposed"

# Analyze common issues
echo ""
echo -e "${YELLOW}=== Common Issues Analysis ===${NC}"

# Check for MBean pattern issues
if grep -q "Can't find raw metrics" debug-output-*.log 2>/dev/null; then
    echo "- MBean patterns may not match your Kafka version"
    echo "  Try adjusting KAFKA_VERSION in the configuration"
fi

# Check for authentication issues
if grep -q "Authentication failed" debug-output-*.log 2>/dev/null; then
    echo "- JMX authentication may be required"
    echo "  Set BOOTSTRAP_BROKER_JMX_USER and BOOTSTRAP_BROKER_JMX_PASSWORD"
fi

# Check for connection issues
if grep -q "Connection refused" debug-output-*.log 2>/dev/null; then
    echo "- JMX port may not be open or accessible"
    echo "  Verify JMX is enabled in Kafka with proper port configuration"
fi

echo ""
echo "Debug session complete!"