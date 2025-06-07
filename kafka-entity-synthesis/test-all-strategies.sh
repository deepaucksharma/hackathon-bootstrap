#!/bin/bash

# Test All Strategies Script
# Runs all the different approaches we've created to get entities into the UI

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "🚀 Testing All MSK Entity Synthesis Strategies"
echo "============================================="
echo ""

# Check environment variables
if [[ -z "$NEW_RELIC_ACCOUNT_ID" ]] || [[ -z "$NEW_RELIC_API_KEY" ]]; then
    echo "❌ Error: Please set environment variables:"
    echo "   export NEW_RELIC_ACCOUNT_ID=your_account_id"
    echo "   export NEW_RELIC_API_KEY=your_api_key"
    echo ""
    
    # Try to load from .env in parent directory
    if [ -f "../.env" ]; then
        echo "📝 Found .env file in parent directory, loading..."
        export $(cat ../.env | grep -E '^NEW_RELIC_' | xargs)
    else
        exit 1
    fi
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install axios
fi

# Create results directory
RESULTS_DIR="test-results-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RESULTS_DIR"

echo "📁 Results will be saved to: $RESULTS_DIR"
echo ""

# Function to run a test and capture results
run_test() {
    local test_name=$1
    local script_name=$2
    local args=$3
    
    echo "🧪 Running Test: $test_name"
    echo "================================"
    
    local output_file="$RESULTS_DIR/${test_name}.log"
    local timestamp=$(date +%s)
    
    # Run the test
    if node "$script_name" $args > "$output_file" 2>&1; then
        echo "✅ $test_name completed successfully"
        
        # Extract cluster name from output if possible
        local cluster_name=$(grep -oE "(test-msk-cluster-|ui-test-|hierarchy-test-|stream-test-)[0-9]+" "$output_file" | head -1)
        
        if [ -n "$cluster_name" ]; then
            echo "   Cluster: $cluster_name"
            echo "$cluster_name" > "$RESULTS_DIR/${test_name}.cluster"
            
            # Start verification in background
            nohup node entity-verifier.js "$cluster_name" > "$RESULTS_DIR/${test_name}-verification.log" 2>&1 &
            echo "   Verification started (PID: $!)"
        fi
    else
        echo "❌ $test_name failed (check $output_file for details)"
    fi
    
    echo ""
}

# Test 1: UI Compatible Payload Solution
run_test "ui-compatible-payloads" "ui-compatible-payload-solution.js"

# Wait a bit between tests
sleep 5

# Test 2: Advanced UI Payload Runner (all strategies)
run_test "advanced-strategies" "advanced-ui-payload-runner.js"

# Wait for strategies to complete
sleep 30

# Test 3: Entity Relationship Builder
run_test "entity-hierarchy" "entity-relationship-builder.js"

# Wait a bit
sleep 5

# Test 4: Continuous Metric Streamer
echo "🧪 Running Test: continuous-streaming"
echo "================================"
# Run streamer in background with timeout
timeout 120 node continuous-metric-streamer.js > "$RESULTS_DIR/continuous-streaming.log" 2>&1 &
STREAMER_PID=$!
echo "✅ Continuous streaming started (PID: $STREAMER_PID)"
echo "   Will run for 2 minutes..."
echo ""

# Generate summary report
echo "📊 Generating Summary Report..."
echo "=============================="
echo ""

cat > "$RESULTS_DIR/SUMMARY.md" << EOF
# MSK Entity Synthesis Test Results

**Test Date**: $(date)
**Account ID**: $NEW_RELIC_ACCOUNT_ID

## Tests Executed

### 1. UI Compatible Payloads
- Status: $([ -f "$RESULTS_DIR/ui-compatible-payloads.cluster" ] && echo "✅ Success" || echo "❌ Failed")
- Cluster: $([ -f "$RESULTS_DIR/ui-compatible-payloads.cluster" ] && cat "$RESULTS_DIR/ui-compatible-payloads.cluster" || echo "N/A")

### 2. Advanced Strategies
- Status: $([ -f "$RESULTS_DIR/advanced-strategies.cluster" ] && echo "✅ Success" || echo "❌ Failed")
- Multiple clusters created with different strategies

### 3. Entity Hierarchy
- Status: $([ -f "$RESULTS_DIR/entity-hierarchy.cluster" ] && echo "✅ Success" || echo "❌ Failed")
- Cluster: $([ -f "$RESULTS_DIR/entity-hierarchy.cluster" ] && cat "$RESULTS_DIR/entity-hierarchy.cluster" || echo "N/A")

### 4. Continuous Streaming
- Status: Running in background
- PID: $STREAMER_PID

## Verification URLs

1. **Entity Explorer**:
   https://one.newrelic.com/redirect/entity/$NEW_RELIC_ACCOUNT_ID

2. **Message Queues UI**:
   https://one.newrelic.com/nr1-core/message-queues

3. **NRQL Console**:
   https://one.newrelic.com/data-exploration

## Verification Queries

\`\`\`sql
-- Check all MSK clusters created in this test
FROM AwsMskClusterSample 
SELECT uniques(provider.clusterName) 
WHERE provider.clusterName LIKE '%test-%' 
SINCE 1 hour ago

-- Check for entities
FROM NrIntegrationEntity
SELECT count(*) 
WHERE type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC')
SINCE 1 hour ago
\`\`\`

## Next Steps

1. Wait 5-10 minutes for entity synthesis
2. Check Entity Explorer for created clusters
3. Check Message Queues UI for visibility
4. Review individual test logs in: $RESULTS_DIR

EOF

echo "✅ Summary report saved to: $RESULTS_DIR/SUMMARY.md"
echo ""

# Show summary
cat "$RESULTS_DIR/SUMMARY.md"

echo ""
echo "🎯 All tests completed!"
echo ""
echo "📋 Quick Verification Commands:"
echo ""
echo "1. Check specific cluster:"
echo "   node entity-verifier.js <cluster-name> --continuous"
echo ""
echo "2. View test results:"
echo "   ls -la $RESULTS_DIR/"
echo ""
echo "3. Tail verification logs:"
echo "   tail -f $RESULTS_DIR/*-verification.log"
echo ""
echo "⏰ The continuous streamer will stop automatically in 2 minutes."
echo ""
echo "✨ Check the New Relic UI now to see if entities appear!"