#!/bin/bash

# Test script for verify-kafka-metrics.js
# This script tests various scenarios to ensure the verification script works correctly

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VERIFY_SCRIPT="$SCRIPT_DIR/verify-kafka-metrics.js"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

echo "=================================================="
echo "Kafka Metrics Verification Script Test Suite"
echo "=================================================="
echo ""

# Function to run a test
run_test() {
    local test_name="$1"
    local test_cmd="$2"
    local expected_exit_code="${3:-0}"
    
    echo -n "Testing: $test_name... "
    
    # Create temp file for output
    local output_file=$(mktemp)
    
    # Run the command
    set +e
    eval "$test_cmd" > "$output_file" 2>&1
    local exit_code=$?
    set -e
    
    # Check result
    if [ $exit_code -eq $expected_exit_code ]; then
        echo -e "${GREEN}PASSED${NC}"
        ((TESTS_PASSED++))
        
        # Show output in verbose mode
        if [ "$VERBOSE" == "true" ]; then
            echo "Output:"
            cat "$output_file" | head -20
            echo "..."
        fi
    else
        echo -e "${RED}FAILED${NC}"
        echo "Expected exit code: $expected_exit_code, Got: $exit_code"
        echo "Output:"
        cat "$output_file" | head -50
        ((TESTS_FAILED++))
    fi
    
    # Cleanup
    rm -f "$output_file"
    echo ""
}

# Test 1: Missing arguments
echo "=== Scenario 1: Missing Arguments ==="
run_test "No arguments" "$VERIFY_SCRIPT" 1
run_test "Only API key" "$VERIFY_SCRIPT test-api-key" 1

# Test 2: Invalid API key (should fail with auth error)
echo "=== Scenario 2: Invalid Credentials ==="
run_test "Invalid API key" "$VERIFY_SCRIPT INVALID-KEY 123456" 1

# Test 3: Environment variables
echo "=== Scenario 3: Environment Variables ==="
run_test "Env vars only" "NRAK_API_KEY=INVALID ACC=123456 $VERIFY_SCRIPT" 1

# Test 4: Output formats
echo "=== Scenario 4: Output Formats ==="
if [ -n "$NRAK_API_KEY" ] && [ -n "$ACC" ]; then
    echo "Using real credentials for output format tests..."
    
    run_test "Console output only" "OUTPUT_FORMAT=console $VERIFY_SCRIPT $NRAK_API_KEY $ACC"
    run_test "JSON output only" "OUTPUT_FORMAT=json $VERIFY_SCRIPT $NRAK_API_KEY $ACC"
    run_test "HTML output only" "OUTPUT_FORMAT=html $VERIFY_SCRIPT $NRAK_API_KEY $ACC"
    run_test "Markdown output only" "OUTPUT_FORMAT=markdown $VERIFY_SCRIPT $NRAK_API_KEY $ACC"
    
    # Check if files were created
    if ls kafka-verification-*.json >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} JSON files created successfully"
        ls -la kafka-verification-*.json | tail -5
    fi
    
    if ls kafka-verification-*.html >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} HTML files created successfully"
        ls -la kafka-verification-*.html | tail -5
    fi
    
    if ls kafka-verification-*.md >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Markdown files created successfully"
        ls -la kafka-verification-*.md | tail -5
    fi
else
    echo -e "${YELLOW}Skipping output format tests - no real credentials provided${NC}"
fi

# Test 5: Time ranges
echo "=== Scenario 5: Time Ranges ==="
if [ -n "$NRAK_API_KEY" ] && [ -n "$ACC" ]; then
    run_test "5 minutes time range" "TIME_RANGE='5 minutes ago' OUTPUT_FORMAT=console $VERIFY_SCRIPT $NRAK_API_KEY $ACC"
    run_test "1 day time range" "TIME_RANGE='SINCE 1 day ago' OUTPUT_FORMAT=console $VERIFY_SCRIPT $NRAK_API_KEY $ACC"
else
    echo -e "${YELLOW}Skipping time range tests - no real credentials provided${NC}"
fi

# Test 6: Cluster filtering
echo "=== Scenario 6: Cluster Filtering ==="
if [ -n "$NRAK_API_KEY" ] && [ -n "$ACC" ]; then
    run_test "With cluster filter" "OUTPUT_FORMAT=console $VERIFY_SCRIPT $NRAK_API_KEY $ACC test-cluster"
    run_test "Cluster via env var" "CLUSTER_NAME=test-cluster OUTPUT_FORMAT=console $VERIFY_SCRIPT $NRAK_API_KEY $ACC"
else
    echo -e "${YELLOW}Skipping cluster filter tests - no real credentials provided${NC}"
fi

# Test 7: Category filtering
echo "=== Scenario 7: Category Filtering ==="
if [ -n "$NRAK_API_KEY" ] && [ -n "$ACC" ]; then
    run_test "Single category" "CATEGORIES='MSK Polling Data' OUTPUT_FORMAT=console $VERIFY_SCRIPT $NRAK_API_KEY $ACC"
    run_test "Multiple categories" "CATEGORIES='MSK Polling Data,Health Metrics' OUTPUT_FORMAT=console $VERIFY_SCRIPT $NRAK_API_KEY $ACC"
else
    echo -e "${YELLOW}Skipping category filter tests - no real credentials provided${NC}"
fi

# Test 8: Performance settings
echo "=== Scenario 8: Performance Settings ==="
if [ -n "$NRAK_API_KEY" ] && [ -n "$ACC" ]; then
    run_test "High concurrency" "CONCURRENCY=10 OUTPUT_FORMAT=console $VERIFY_SCRIPT $NRAK_API_KEY $ACC"
    run_test "Low concurrency" "CONCURRENCY=1 OUTPUT_FORMAT=console $VERIFY_SCRIPT $NRAK_API_KEY $ACC"
    run_test "Max retries" "MAX_RETRIES=5 OUTPUT_FORMAT=console $VERIFY_SCRIPT $NRAK_API_KEY $ACC"
else
    echo -e "${YELLOW}Skipping performance tests - no real credentials provided${NC}"
fi

# Test 9: Verbose mode
echo "=== Scenario 9: Verbose Mode ==="
if [ -n "$NRAK_API_KEY" ] && [ -n "$ACC" ]; then
    run_test "Verbose enabled" "VERBOSE=true OUTPUT_FORMAT=console CATEGORIES='Data Quality' $VERIFY_SCRIPT $NRAK_API_KEY $ACC"
else
    echo -e "${YELLOW}Skipping verbose mode test - no real credentials provided${NC}"
fi

# Test 10: Exit codes based on health
echo "=== Scenario 10: Exit Codes ==="
if [ -n "$NRAK_API_KEY" ] && [ -n "$ACC" ]; then
    # This might pass or fail depending on actual data
    echo "Testing exit code based on health score..."
    set +e
    CATEGORIES='Summary Verification' OUTPUT_FORMAT=console $VERIFY_SCRIPT $NRAK_API_KEY $ACC
    EXIT_CODE=$?
    set -e
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Script exited with 0 (health >= 90%)"
    else
        echo -e "${YELLOW}✓${NC} Script exited with 1 (health < 90% or error)"
    fi
else
    echo -e "${YELLOW}Skipping exit code test - no real credentials provided${NC}"
fi

# Summary
echo ""
echo "=================================================="
echo "Test Summary"
echo "=================================================="
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "\n${RED}Some tests failed!${NC}"
    exit 1
fi