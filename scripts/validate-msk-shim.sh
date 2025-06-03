#!/bin/bash

# MSK Shim Validation Script
# This script validates the MSK shim implementation against the documented requirements

set -e

echo "MSK Shim Implementation Validation Report"
echo "========================================"
echo "Generated on: $(date)"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
TOTAL_METRICS=0
IMPLEMENTED_METRICS=0
MISSING_METRICS=0
WARNINGS=0

# Function to check if a metric is implemented
check_metric() {
    local metric_name=$1
    local entity_type=$2
    local priority=$3
    local file_path=$4
    local search_pattern=$5
    
    TOTAL_METRICS=$((TOTAL_METRICS + 1))
    
    if grep -q "$search_pattern" "$file_path" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $entity_type::$metric_name (Priority: $priority) - IMPLEMENTED"
        IMPLEMENTED_METRICS=$((IMPLEMENTED_METRICS + 1))
        return 0
    else
        echo -e "${RED}✗${NC} $entity_type::$metric_name (Priority: $priority) - MISSING"
        MISSING_METRICS=$((MISSING_METRICS + 1))
        return 1
    fi
}

# Function to check for warnings
check_warning() {
    local condition=$1
    local message=$2
    
    if [ "$condition" = "true" ]; then
        echo -e "${YELLOW}⚠${NC} WARNING: $message"
        WARNINGS=$((WARNINGS + 1))
    fi
}

echo "1. Checking MSK Shim Core Files"
echo "-------------------------------"

# Check if core files exist
if [ -f "src/msk/shim.go" ]; then
    echo -e "${GREEN}✓${NC} src/msk/shim.go exists"
else
    echo -e "${RED}✗${NC} src/msk/shim.go missing"
fi

if [ -f "src/msk/transformer.go" ]; then
    echo -e "${GREEN}✓${NC} src/msk/transformer.go exists"
else
    echo -e "${RED}✗${NC} src/msk/transformer.go missing"
fi

if [ -f "src/msk/config.go" ]; then
    echo -e "${GREEN}✓${NC} src/msk/config.go exists"
else
    echo -e "${RED}✗${NC} src/msk/config.go missing"
fi

echo ""
echo "2. Validating Cluster Metrics (AwsMskClusterSample)"
echo "---------------------------------------------------"

TRANSFORMER_FILE="src/msk/transformer.go"

# P0 Cluster Metrics
check_metric "activeControllerCount" "Cluster" "P0" "$TRANSFORMER_FILE" "provider.activeControllerCount"
check_metric "offlinePartitionsCount" "Cluster" "P0" "$TRANSFORMER_FILE" "provider.offlinePartitionsCount"
check_metric "globalPartitionCount" "Cluster" "P0" "$TRANSFORMER_FILE" "provider.globalPartitionCount"
check_metric "globalTopicCount" "Cluster" "P1" "$TRANSFORMER_FILE" "provider.globalTopicCount"

echo ""
echo "3. Validating Broker Metrics (AwsMskBrokerSample)"
echo "-------------------------------------------------"

# P0 Broker Metrics - Throughput
check_metric "bytesInPerSec" "Broker" "P0" "$TRANSFORMER_FILE" "provider.bytesInPerSec"
check_metric "bytesOutPerSec" "Broker" "P0" "$TRANSFORMER_FILE" "provider.bytesOutPerSec"
check_metric "messagesInPerSec" "Broker" "P0" "$TRANSFORMER_FILE" "provider.messagesInPerSec"

# P0 Broker Metrics - Health
check_metric "underReplicatedPartitions" "Broker" "P0" "$TRANSFORMER_FILE" "provider.underReplicatedPartitions"
check_metric "partitionCount" "Broker" "P1" "$TRANSFORMER_FILE" "provider.partitionCount"
check_metric "leaderCount" "Broker" "P1" "$TRANSFORMER_FILE" "provider.leaderCount"

# P0 Broker Metrics - Resources
check_metric "cpuUser" "Broker" "P0" "$TRANSFORMER_FILE" "provider.cpuUser"
check_metric "cpuSystem" "Broker" "P0" "$TRANSFORMER_FILE" "provider.cpuSystem"
check_metric "cpuIdle" "Broker" "P0" "$TRANSFORMER_FILE" "provider.cpuIdle"
check_metric "memoryUsed" "Broker" "P1" "$TRANSFORMER_FILE" "provider.memoryUsed"
check_metric "memoryFree" "Broker" "P1" "$TRANSFORMER_FILE" "provider.memoryFree"

# P1 Broker Metrics - Disk
check_metric "kafkaDataLogsDiskUsed" "Broker" "P1" "$TRANSFORMER_FILE" "provider.kafkaDataLogsDiskUsed"
check_metric "kafkaAppLogsDiskUsed" "Broker" "P1" "$TRANSFORMER_FILE" "provider.kafkaAppLogsDiskUsed"
check_metric "rootDiskUsed" "Broker" "P1" "$TRANSFORMER_FILE" "provider.rootDiskUsed"

# P0 Broker Metrics - Network
check_metric "networkRxDropped" "Broker" "P0" "$TRANSFORMER_FILE" "provider.networkRxDropped"
check_metric "networkTxDropped" "Broker" "P0" "$TRANSFORMER_FILE" "provider.networkTxDropped"

# P2 Broker Metrics - Latency (Missing)
echo ""
echo "Checking P2 Latency Metrics (Expected to be missing):"
check_metric "fetchConsumerLocalTimeMsMean" "Broker" "P2" "$TRANSFORMER_FILE" "provider.fetchConsumerLocalTimeMsMean"
check_metric "produceLocalTimeMsMean" "Broker" "P2" "$TRANSFORMER_FILE" "provider.produceLocalTimeMsMean"

echo ""
echo "4. Validating Topic Metrics (AwsMskTopicSample)"
echo "-----------------------------------------------"

# P0 Topic Metrics
check_metric "bytesInPerSec" "Topic" "P0" "$TRANSFORMER_FILE" "transformTopicThroughputMetrics"
check_metric "bytesOutPerSec" "Topic" "P0" "$TRANSFORMER_FILE" "transformTopicThroughputMetrics"
check_metric "messagesInPerSec" "Topic" "P0" "$TRANSFORMER_FILE" "transformTopicThroughputMetrics"

echo ""
echo "5. Checking Configuration and Entity Management"
echo "-----------------------------------------------"

# Check entity GUID generation
if grep -q "GenerateEntityGUID" "$TRANSFORMER_FILE" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Entity GUID generation implemented"
else
    echo -e "${RED}✗${NC} Entity GUID generation missing"
fi

# Check aggregator implementation
if grep -q "MetricAggregator" "src/msk/shim.go" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Metric aggregator implemented"
else
    echo -e "${RED}✗${NC} Metric aggregator missing"
fi

# Check system correlator
if grep -q "SystemSampleCorrelator" "src/msk/shim.go" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} System sample correlator implemented"
else
    echo -e "${RED}✗${NC} System sample correlator missing"
fi

echo ""
echo "6. Checking for Implementation Warnings"
echo "--------------------------------------"

# Check for hardcoded values
HARDCODED_COUNT=$(grep -c "10.0\|0.0" "$TRANSFORMER_FILE" 2>/dev/null || echo "0")
check_warning "[ $HARDCODED_COUNT -gt 5 ]" "Multiple hardcoded default values found ($HARDCODED_COUNT occurrences)"

# Check for TODO comments
TODO_COUNT=$(grep -c "TODO\|FIXME" src/msk/*.go 2>/dev/null || echo "0")
check_warning "[ $TODO_COUNT -gt 0 ]" "Found $TODO_COUNT TODO/FIXME comments in MSK shim code"

# Check for proper error handling
ERROR_HANDLING=$(grep -c "if err != nil" src/msk/*.go 2>/dev/null || echo "0")
check_warning "[ $ERROR_HANDLING -lt 10 ]" "Limited error handling found (only $ERROR_HANDLING error checks)"

echo ""
echo "7. Implementation Coverage Summary"
echo "---------------------------------"

# Calculate percentages
if [ $TOTAL_METRICS -gt 0 ]; then
    COVERAGE=$((IMPLEMENTED_METRICS * 100 / TOTAL_METRICS))
else
    COVERAGE=0
fi

echo "Total metrics checked: $TOTAL_METRICS"
echo "Implemented metrics: $IMPLEMENTED_METRICS"
echo "Missing metrics: $MISSING_METRICS"
echo "Warnings: $WARNINGS"
echo ""
echo "Implementation coverage: ${COVERAGE}%"

# Determine overall status
if [ $COVERAGE -ge 90 ] && [ $WARNINGS -lt 5 ]; then
    echo -e "${GREEN}Overall Status: PRODUCTION READY${NC}"
elif [ $COVERAGE -ge 70 ] && [ $WARNINGS -lt 10 ]; then
    echo -e "${YELLOW}Overall Status: BETA READY (needs improvement)${NC}"
else
    echo -e "${RED}Overall Status: NOT READY FOR PRODUCTION${NC}"
fi

echo ""
echo "8. Recommendations"
echo "-----------------"

if [ $MISSING_METRICS -gt 0 ]; then
    echo "- Implement missing P0/P1 metrics for production readiness"
fi

if [ $WARNINGS -gt 0 ]; then
    echo "- Address warnings to improve code quality"
fi

if grep -q "TODO\|FIXME" src/msk/*.go 2>/dev/null; then
    echo "- Complete TODO/FIXME items before production deployment"
fi

echo ""
echo "Validation completed at $(date)"