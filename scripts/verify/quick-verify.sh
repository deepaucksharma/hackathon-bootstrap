#!/bin/bash

# Quick Verification Script - Simplified version for rapid checks
# Usage: ./quick-verify.sh [kafka|strimzi|both]

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
TYPE="${1:-auto}"
KAFKA_NS="${KAFKA_NAMESPACE:-kafka}"
STRIMZI_NS="${STRIMZI_NAMESPACE:-strimzi-kafka}"
NR_NS="${NEWRELIC_NAMESPACE:-newrelic}"

echo -e "${GREEN}Quick Kafka Monitoring Verification${NC}\n"

# Auto-detect if not specified
if [ "$TYPE" == "auto" ]; then
    if kubectl get pods -n $KAFKA_NS -l app=kafka &>/dev/null; then
        TYPE="kafka"
    fi
    if kubectl get kafka -n $STRIMZI_NS &>/dev/null; then
        if [ "$TYPE" == "kafka" ]; then
            TYPE="both"
        else
            TYPE="strimzi"
        fi
    fi
fi

echo "Checking $TYPE deployment(s)..."
echo "================================"

# Function to check deployment
check_deployment() {
    local ns=$1
    local name=$2
    local selector=$3
    
    echo -e "\n${GREEN}$name ($ns):${NC}"
    
    # Pod status
    echo -n "  Pods: "
    local ready=$(kubectl get pods -n $ns -l $selector -o json 2>/dev/null | \
        jq -r '.items[] | select(.status.phase == "Running") | .metadata.name' | wc -l)
    local total=$(kubectl get pods -n $ns -l $selector -o json 2>/dev/null | \
        jq -r '.items[].metadata.name' | wc -l)
    
    if [ $ready -eq $total ] && [ $total -gt 0 ]; then
        echo -e "${GREEN}$ready/$total running${NC}"
    else
        echo -e "${RED}$ready/$total running${NC}"
    fi
    
    # JMX check
    echo -n "  JMX: "
    local pod=$(kubectl get pods -n $ns -l $selector -o name 2>/dev/null | head -1 | cut -d'/' -f2)
    if [ -n "$pod" ]; then
        if kubectl exec -n $ns $pod -- nc -zv localhost 9999 &>/dev/null 2>&1; then
            echo -e "${GREEN}Connected (port 9999)${NC}"
        else
            echo -e "${RED}Not accessible${NC}"
        fi
    else
        echo -e "${RED}No pod found${NC}"
    fi
}

# Check deployments
if [ "$TYPE" == "kafka" ] || [ "$TYPE" == "both" ]; then
    check_deployment $KAFKA_NS "Standard Kafka" "app=kafka"
fi

if [ "$TYPE" == "strimzi" ] || [ "$TYPE" == "both" ]; then
    check_deployment $STRIMZI_NS "Strimzi Kafka" "strimzi.io/cluster=kafka"
fi

# Check New Relic
echo -e "\n${GREEN}New Relic ($NR_NS):${NC}"

# Infrastructure pods
echo -n "  Infrastructure: "
nr_ready=$(kubectl get pods -n $NR_NS -l app.kubernetes.io/name=newrelic-infrastructure \
    --field-selector=status.phase=Running -o name 2>/dev/null | wc -l)
if [ $nr_ready -gt 0 ]; then
    echo -e "${GREEN}$nr_ready pods running${NC}"
else
    echo -e "${RED}Not found${NC}"
fi

# nri-kafka check
echo -n "  nri-kafka: "
nr_pod=$(kubectl get pods -n $NR_NS -l app.kubernetes.io/name=newrelic-infrastructure -o name 2>/dev/null | head -1 | cut -d'/' -f2)
if [ -n "$nr_pod" ]; then
    if kubectl exec -n $NR_NS $nr_pod -- ls /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka &>/dev/null 2>&1; then
        echo -e "${GREEN}Binary found${NC}"
    else
        echo -e "${RED}Binary not found${NC}"
    fi
else
    echo -e "${RED}No pod to check${NC}"
fi

# Quick metrics check
echo -n "  Recent logs: "
errors=$(kubectl logs -n $NR_NS -l app.kubernetes.io/name=newrelic-infrastructure --tail=100 2>/dev/null | \
    grep -i kafka | grep -iE "(error|fail)" | wc -l)
if [ $errors -eq 0 ]; then
    echo -e "${GREEN}No errors${NC}"
else
    echo -e "${YELLOW}$errors error(s) found${NC}"
fi

echo -e "\n================================"
echo -e "${GREEN}Quick Check Complete${NC}"
echo -e "\nFor detailed analysis, run:"
echo -e "  ${YELLOW}./master-verification.sh${NC}"
echo -e "\nTo check metrics in New Relic:"
echo -e "  ${YELLOW}FROM KafkaBrokerSample SELECT * SINCE 5 minutes ago${NC}"