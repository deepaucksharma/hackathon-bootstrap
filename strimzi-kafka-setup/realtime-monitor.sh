#!/bin/bash

# Real-time Monitoring Dashboard for Strimzi Kafka

set -euo pipefail

# Configuration
NAMESPACE="strimzi-kafka"
NR_NAMESPACE="newrelic"
KAFKA_CLUSTER="production-kafka"
REFRESH_INTERVAL=5

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Terminal setup
clear
trap 'echo -e "\n${NC}Monitoring stopped."; exit 0' INT TERM

# Helper functions
move_cursor() {
    echo -en "\033[$1;$2H"
}

clear_line() {
    echo -en "\033[K"
}

print_header() {
    echo -e "${BLUE}$1${NC}"
}

print_metric() {
    local label=$1
    local value=$2
    local status=${3:-"ok"}
    
    case $status in
        "ok"|"good")
            echo -e "${label}: ${GREEN}${value}${NC}"
            ;;
        "warning")
            echo -e "${label}: ${YELLOW}${value}${NC}"
            ;;
        "error"|"critical")
            echo -e "${label}: ${RED}${value}${NC}"
            ;;
        *)
            echo -e "${label}: ${value}"
            ;;
    esac
}

get_pod_status() {
    local selector=$1
    local namespace=${2:-$NAMESPACE}
    kubectl get pods -n "$namespace" -l "$selector" -o jsonpath='{.items[*].status.phase}' 2>/dev/null | tr ' ' '\n' | grep -c "Running" || echo "0"
}

get_pod_restarts() {
    local selector=$1
    local namespace=${2:-$NAMESPACE}
    kubectl get pods -n "$namespace" -l "$selector" -o jsonpath='{.items[*].status.containerStatuses[*].restartCount}' 2>/dev/null | tr ' ' '\n' | awk '{sum+=$1} END {print sum+0}'
}

format_bytes() {
    local bytes=$1
    if [ "$bytes" -ge 1073741824 ]; then
        echo "$(awk "BEGIN {printf \"%.2f\", $bytes/1073741824}")Gi"
    elif [ "$bytes" -ge 1048576 ]; then
        echo "$(awk "BEGIN {printf \"%.2f\", $bytes/1048576}")Mi"
    elif [ "$bytes" -ge 1024 ]; then
        echo "$(awk "BEGIN {printf \"%.2f\", $bytes/1024}")Ki"
    else
        echo "${bytes}B"
    fi
}

# Main monitoring loop
while true; do
    clear
    
    # Header
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║              Strimzi Kafka Real-time Monitoring Dashboard            ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo "Last updated: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    
    # Cluster Overview
    print_header "▶ CLUSTER OVERVIEW"
    
    # Operator status
    OPERATOR_READY=$(kubectl get deployment -n $NAMESPACE strimzi-cluster-operator -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    OPERATOR_STATUS=$([[ "$OPERATOR_READY" -ge 1 ]] && echo "ok" || echo "error")
    print_metric "  Strimzi Operator" "$([[ "$OPERATOR_READY" -ge 1 ]] && echo "Running" || echo "Not Running")" "$OPERATOR_STATUS"
    
    # Kafka cluster status
    KAFKA_STATUS=$(kubectl get kafka -n $NAMESPACE $KAFKA_CLUSTER -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "False")
    KAFKA_STATUS_COLOR=$([[ "$KAFKA_STATUS" == "True" ]] && echo "ok" || echo "error")
    print_metric "  Kafka Cluster" "$([[ "$KAFKA_STATUS" == "True" ]] && echo "Ready" || echo "Not Ready")" "$KAFKA_STATUS_COLOR"
    
    echo ""
    
    # Kafka Brokers
    print_header "▶ KAFKA BROKERS"
    RUNNING_BROKERS=$(get_pod_status "strimzi.io/name=${KAFKA_CLUSTER}-kafka")
    BROKER_RESTARTS=$(get_pod_restarts "strimzi.io/name=${KAFKA_CLUSTER}-kafka")
    BROKER_STATUS=$([[ "$RUNNING_BROKERS" -eq 3 ]] && echo "ok" || echo "warning")
    print_metric "  Running" "$RUNNING_BROKERS/3" "$BROKER_STATUS"
    print_metric "  Total Restarts" "$BROKER_RESTARTS" $([[ "$BROKER_RESTARTS" -gt 10 ]] && echo "warning" || echo "ok")
    
    # Individual broker status
    for i in 0 1 2; do
        POD_NAME="${KAFKA_CLUSTER}-kafka-$i"
        if kubectl get pod -n $NAMESPACE "$POD_NAME" &>/dev/null; then
            READY=$(kubectl get pod -n $NAMESPACE "$POD_NAME" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
            RESTARTS=$(kubectl get pod -n $NAMESPACE "$POD_NAME" -o jsonpath='{.status.containerStatuses[0].restartCount}' 2>/dev/null || echo "0")
            STATUS=$([[ "$READY" == "True" ]] && echo "ok" || echo "error")
            print_metric "  Broker-$i" "$([[ "$READY" == "True" ]] && echo "Ready" || echo "Not Ready") (Restarts: $RESTARTS)" "$STATUS"
        else
            print_metric "  Broker-$i" "Not Found" "error"
        fi
    done
    
    echo ""
    
    # Zookeeper
    print_header "▶ ZOOKEEPER ENSEMBLE"
    RUNNING_ZK=$(get_pod_status "strimzi.io/name=${KAFKA_CLUSTER}-zookeeper")
    ZK_RESTARTS=$(get_pod_restarts "strimzi.io/name=${KAFKA_CLUSTER}-zookeeper")
    ZK_STATUS=$([[ "$RUNNING_ZK" -eq 3 ]] && echo "ok" || echo "warning")
    print_metric "  Running" "$RUNNING_ZK/3" "$ZK_STATUS"
    print_metric "  Total Restarts" "$ZK_RESTARTS" $([[ "$ZK_RESTARTS" -gt 5 ]] && echo "warning" || echo "ok")
    
    echo ""
    
    # Topics and Partitions
    print_header "▶ TOPICS & PARTITIONS"
    TOPIC_COUNT=$(kubectl get kafkatopic -n $NAMESPACE --no-headers 2>/dev/null | wc -l || echo "0")
    print_metric "  Topics" "$TOPIC_COUNT" "ok"
    
    # Get partition count if possible
    if [ "$RUNNING_BROKERS" -gt 0 ]; then
        PARTITION_INFO=$(kubectl exec -n $NAMESPACE ${KAFKA_CLUSTER}-kafka-0 -- \
            /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list 2>/dev/null | wc -l || echo "N/A")
        print_metric "  Active Topics" "$PARTITION_INFO" "ok"
        
        # Check for under-replicated partitions
        URP=$(kubectl exec -n $NAMESPACE ${KAFKA_CLUSTER}-kafka-0 -- \
            /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
            --describe --under-replicated-partitions 2>/dev/null | grep -c "Topic:" || echo "0")
        URP_STATUS=$([[ "$URP" -eq 0 ]] && echo "ok" || echo "warning")
        print_metric "  Under-replicated" "$URP" "$URP_STATUS"
    fi
    
    echo ""
    
    # Storage
    print_header "▶ STORAGE"
    PVC_TOTAL=$(kubectl get pvc -n $NAMESPACE 2>/dev/null | grep -c "$KAFKA_CLUSTER" || echo "0")
    PVC_BOUND=$(kubectl get pvc -n $NAMESPACE -o jsonpath='{.items[*].status.phase}' 2>/dev/null | tr ' ' '\n' | grep -c "Bound" || echo "0")
    PVC_STATUS=$([[ "$PVC_TOTAL" -eq "$PVC_BOUND" ]] && echo "ok" || echo "warning")
    print_metric "  PVCs" "$PVC_BOUND/$PVC_TOTAL Bound" "$PVC_STATUS"
    
    # Storage usage (if metrics available)
    if command -v kubectl top &>/dev/null && kubectl top pod -n $NAMESPACE &>/dev/null; then
        echo ""
        print_header "▶ RESOURCE USAGE"
        
        # Get top consumers
        TOP_CPU=$(kubectl top pod -n $NAMESPACE --no-headers 2>/dev/null | sort -k3 -rn | head -1)
        TOP_MEM=$(kubectl top pod -n $NAMESPACE --no-headers 2>/dev/null | sort -k4 -rn | head -1)
        
        if [ -n "$TOP_CPU" ]; then
            CPU_POD=$(echo "$TOP_CPU" | awk '{print $1}')
            CPU_VAL=$(echo "$TOP_CPU" | awk '{print $3}')
            print_metric "  Highest CPU" "$CPU_POD ($CPU_VAL)" "ok"
        fi
        
        if [ -n "$TOP_MEM" ]; then
            MEM_POD=$(echo "$TOP_MEM" | awk '{print $1}')
            MEM_VAL=$(echo "$TOP_MEM" | awk '{print $4}')
            print_metric "  Highest Memory" "$MEM_POD ($MEM_VAL)" "ok"
        fi
    fi
    
    echo ""
    
    # Test Clients
    print_header "▶ TEST CLIENTS"
    PRODUCER_STATUS=$(kubectl get pods -n $NAMESPACE -l app=kafka-producer -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "Not Found")
    CONSUMER_STATUS=$(kubectl get pods -n $NAMESPACE -l app=kafka-consumer -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "Not Found")
    
    PROD_COLOR=$([[ "$PRODUCER_STATUS" == "Running" ]] && echo "ok" || echo "warning")
    CONS_COLOR=$([[ "$CONSUMER_STATUS" == "Running" ]] && echo "ok" || echo "warning")
    
    print_metric "  Producer" "$PRODUCER_STATUS" "$PROD_COLOR"
    print_metric "  Consumer" "$CONSUMER_STATUS" "$CONS_COLOR"
    
    # Message rate (if producer is running)
    if [[ "$PRODUCER_STATUS" == "Running" ]]; then
        MSG_COUNT=$(kubectl logs -n $NAMESPACE -l app=kafka-producer --tail=20 2>/dev/null | grep -c "Message at" || echo "0")
        print_metric "  Messages (last 20 logs)" "$MSG_COUNT" "ok"
    fi
    
    echo ""
    
    # New Relic Integration
    if kubectl get namespace $NR_NAMESPACE &>/dev/null; then
        print_header "▶ NEW RELIC INTEGRATION"
        NRI_STATUS=$(kubectl get pods -n $NR_NAMESPACE -l app=nri-kafka-strimzi -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "Not Found")
        NRI_COLOR=$([[ "$NRI_STATUS" == "Running" ]] && echo "ok" || echo "error")
        print_metric "  Status" "$NRI_STATUS" "$NRI_COLOR"
        
        if [[ "$NRI_STATUS" == "Running" ]]; then
            ERROR_COUNT=$(kubectl logs -n $NR_NAMESPACE -l app=nri-kafka-strimzi --tail=50 2>/dev/null | grep -ci "error" || echo "0")
            ERROR_COLOR=$([[ "$ERROR_COUNT" -eq 0 ]] && echo "ok" || echo "warning")
            print_metric "  Recent Errors" "$ERROR_COUNT" "$ERROR_COLOR"
        fi
    fi
    
    echo ""
    
    # Recent Events
    print_header "▶ RECENT EVENTS"
    RECENT_WARNINGS=$(kubectl get events -n $NAMESPACE --field-selector type=Warning --sort-by='.lastTimestamp' 2>/dev/null | tail -3)
    if [ -n "$RECENT_WARNINGS" ] && [ "$(echo "$RECENT_WARNINGS" | wc -l)" -gt 1 ]; then
        echo "$RECENT_WARNINGS" | tail -3 | while read -r line; do
            if [[ "$line" != *"LAST SEEN"* ]] && [ -n "$line" ]; then
                EVENT_TIME=$(echo "$line" | awk '{print $1}')
                EVENT_MSG=$(echo "$line" | awk '{for(i=6;i<=NF;i++) printf "%s ", $i; print ""}')
                echo -e "  ${YELLOW}⚠${NC} $EVENT_TIME: ${EVENT_MSG:0:60}..."
            fi
        done
    else
        echo -e "  ${GREEN}✓${NC} No recent warnings"
    fi
    
    echo ""
    echo "─────────────────────────────────────────────────────────────────────"
    echo "Press Ctrl+C to exit | Refreshing every ${REFRESH_INTERVAL}s"
    
    sleep $REFRESH_INTERVAL
done