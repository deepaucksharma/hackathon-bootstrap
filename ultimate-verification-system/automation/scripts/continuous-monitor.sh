#!/bin/bash

# continuous-monitor.sh - Run verification every 5 minutes and alert on failures
# Usage: ./continuous-monitor.sh

# Configuration - Set these environment variables
API_KEY="${NR_API_KEY:-}"
AWS_ACCOUNT="${AWS_ACCOUNT_ID:-}"
NR_ACCOUNT="${NR_ACCOUNT_ID:-}"
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"
CHECK_INTERVAL="${CHECK_INTERVAL:-300}"  # 5 minutes default
LOG_FILE="${LOG_FILE:-/var/log/kafka-ui-verification.log}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check required variables
if [ -z "$API_KEY" ] || [ -z "$AWS_ACCOUNT" ] || [ -z "$NR_ACCOUNT" ]; then
    echo -e "${RED}Error: Required environment variables not set${NC}"
    echo "Please set: NR_API_KEY, AWS_ACCOUNT_ID, NR_ACCOUNT_ID"
    exit 1
fi

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
RUNNER_PATH="${SCRIPT_DIR}/../../verification/test-runners/ultimate-verification-runner.js"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# State tracking
LAST_STATUS="UNKNOWN"
CONSECUTIVE_FAILURES=0
LAST_ALERT_TIME=0

# Function to send Slack alert
send_slack_alert() {
    local status=$1
    local message=$2
    local color="#36a64f"  # green
    
    if [ "$status" = "FAIL" ]; then
        color="#ff0000"  # red
    elif [ "$status" = "WARN" ]; then
        color="#ffaa00"  # yellow
    fi
    
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -s -X POST -H 'Content-type: application/json' \
            --data "{
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"title\": \"Kafka UI Verification $status\",
                    \"text\": \"$message\",
                    \"fields\": [
                        {\"title\": \"Environment\", \"value\": \"AWS: $AWS_ACCOUNT\", \"short\": true},
                        {\"title\": \"Time\", \"value\": \"$(date)\", \"short\": true}
                    ],
                    \"footer\": \"Kafka UI Monitor\",
                    \"ts\": $(date +%s)
                }]
            }" \
            "$SLACK_WEBHOOK" > /dev/null
    fi
}

# Function to log message
log_message() {
    local level=$1
    local message=$2
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message" >> "$LOG_FILE"
    
    case $level in
        ERROR)
            echo -e "${RED}[$level]${NC} $message"
            ;;
        WARN)
            echo -e "${YELLOW}[$level]${NC} $message"
            ;;
        INFO)
            echo -e "${GREEN}[$level]${NC} $message"
            ;;
        *)
            echo "[$level] $message"
            ;;
    esac
}

# Function to run verification
run_verification() {
    local start_time=$(date +%s)
    
    log_message "INFO" "Running verification..."
    
    # Run the verification
    local output_file="/tmp/kafka-verification-$(date +%s).json"
    
    if node "$RUNNER_PATH" \
        --apiKey="$API_KEY" \
        --accountId="$AWS_ACCOUNT" \
        --nrAccountId="$NR_ACCOUNT" \
        --provider=awsMsk \
        > "$output_file" 2>&1; then
        
        EXIT_CODE=0
    else
        EXIT_CODE=$?
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Parse results
    if [ $EXIT_CODE -eq 0 ]; then
        local passed=$(jq -r '.summary.passed // 0' "$output_file" 2>/dev/null)
        local failed=$(jq -r '.summary.failed // 0' "$output_file" 2>/dev/null)
        local total=$(jq -r '.summary.total // 0' "$output_file" 2>/dev/null)
        
        log_message "INFO" "Verification PASSED - $passed/$total tests passed in ${duration}s"
        
        # Reset failure counter
        CONSECUTIVE_FAILURES=0
        
        # Send recovery alert if previously failed
        if [ "$LAST_STATUS" = "FAIL" ]; then
            send_slack_alert "INFO" "✅ Kafka UI verification recovered! All $total tests now passing."
        fi
        
        LAST_STATUS="PASS"
        
    else
        local failures=$(jq -r '.summary.failed // "Unknown"' "$output_file" 2>/dev/null)
        local error_msg=$(jq -r '.error // "Check logs for details"' "$output_file" 2>/dev/null)
        
        log_message "ERROR" "Verification FAILED - Exit code: $EXIT_CODE, Failures: $failures"
        
        CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
        
        # Determine alert frequency based on consecutive failures
        local current_time=$(date +%s)
        local time_since_last_alert=$((current_time - LAST_ALERT_TIME))
        
        # Alert immediately for first failure, then every 30 minutes
        if [ $CONSECUTIVE_FAILURES -eq 1 ] || [ $time_since_last_alert -gt 1800 ]; then
            local message="❌ Verification failed with $failures test failures.\n"
            message+="Consecutive failures: $CONSECUTIVE_FAILURES\n"
            message+="Error: $error_msg"
            
            send_slack_alert "FAIL" "$message"
            LAST_ALERT_TIME=$current_time
        fi
        
        LAST_STATUS="FAIL"
    fi
    
    # Clean up old output files (keep last 10)
    ls -t /tmp/kafka-verification-*.json 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null
    
    # Archive result
    if [ -f "$output_file" ]; then
        cp "$output_file" "/tmp/kafka-verification-latest.json"
    fi
}

# Function to check system health
check_system_health() {
    # Check if runner exists
    if [ ! -f "$RUNNER_PATH" ]; then
        log_message "ERROR" "Verification runner not found at: $RUNNER_PATH"
        exit 1
    fi
    
    # Check if node is available
    if ! command -v node &> /dev/null; then
        log_message "ERROR" "Node.js is not installed"
        exit 1
    fi
    
    # Check if jq is available
    if ! command -v jq &> /dev/null; then
        log_message "WARN" "jq is not installed - JSON parsing will be limited"
    fi
    
    log_message "INFO" "System health check passed"
}

# Signal handlers
cleanup() {
    log_message "INFO" "Monitoring stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Main execution
main() {
    log_message "INFO" "Starting continuous Kafka UI monitoring"
    log_message "INFO" "Check interval: ${CHECK_INTERVAL}s"
    log_message "INFO" "AWS Account: $AWS_ACCOUNT"
    log_message "INFO" "NR Account: $NR_ACCOUNT"
    
    # Initial system check
    check_system_health
    
    # Run initial verification
    run_verification
    
    # Main monitoring loop
    while true; do
        sleep "$CHECK_INTERVAL"
        run_verification
    done
}

# Run main function
main