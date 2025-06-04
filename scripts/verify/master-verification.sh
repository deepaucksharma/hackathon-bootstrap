#!/bin/bash

# Master Verification Script for Kafka Monitoring with New Relic
# This script consolidates all verification checks from multiple scripts
# Supports both standard Kafka and Strimzi deployments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
WARNINGS=0

# Configuration
KAFKA_NAMESPACE="${KAFKA_NAMESPACE:-kafka}"
STRIMZI_NAMESPACE="${STRIMZI_NAMESPACE:-strimzi-kafka}"
NEWRELIC_NAMESPACE="${NEWRELIC_NAMESPACE:-newrelic}"
DEPLOYMENT_TYPE="${DEPLOYMENT_TYPE:-auto}" # auto, kafka, strimzi, both
VERBOSE="${VERBOSE:-false}"
TEST_MODE="${TEST_MODE:-basic}" # basic, full, troubleshoot

# Test result tracking
declare -A TEST_RESULTS
declare -A TEST_MESSAGES

# Helper functions
print_header() {
    echo -e "\n${BLUE}===================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===================================================${NC}"
}

print_test() {
    echo -n "  - $1: "
}

pass_test() {
    echo -e "${GREEN}PASSED${NC}"
    ((PASSED_TESTS++))
    ((TOTAL_TESTS++))
    TEST_RESULTS["$1"]="PASSED"
    TEST_MESSAGES["$1"]="$2"
}

fail_test() {
    echo -e "${RED}FAILED${NC}"
    ((FAILED_TESTS++))
    ((TOTAL_TESTS++))
    TEST_RESULTS["$1"]="FAILED"
    TEST_MESSAGES["$1"]="$2"
    if [ "$VERBOSE" == "true" ]; then
        echo "    Error: $2"
    fi
}

warn_test() {
    echo -e "${YELLOW}WARNING${NC}"
    ((WARNINGS++))
    ((TOTAL_TESTS++))
    TEST_RESULTS["$1"]="WARNING"
    TEST_MESSAGES["$1"]="$2"
    if [ "$VERBOSE" == "true" ]; then
        echo "    Warning: $2"
    fi
}

skip_test() {
    echo -e "${YELLOW}SKIPPED${NC}"
    TEST_RESULTS["$1"]="SKIPPED"
    TEST_MESSAGES["$1"]="$2"
}

# Detect deployment type
detect_deployment() {
    if [ "$DEPLOYMENT_TYPE" == "auto" ]; then
        local has_kafka=false
        local has_strimzi=false
        
        if kubectl get namespace $KAFKA_NAMESPACE &>/dev/null && \
           kubectl get pods -n $KAFKA_NAMESPACE -l app=kafka 2>/dev/null | grep -q kafka; then
            has_kafka=true
        fi
        
        if kubectl get namespace $STRIMZI_NAMESPACE &>/dev/null && \
           kubectl get kafka -n $STRIMZI_NAMESPACE 2>/dev/null | grep -q kafka; then
            has_strimzi=true
        fi
        
        if $has_kafka && $has_strimzi; then
            DEPLOYMENT_TYPE="both"
        elif $has_kafka; then
            DEPLOYMENT_TYPE="kafka"
        elif $has_strimzi; then
            DEPLOYMENT_TYPE="strimzi"
        else
            echo -e "${RED}No Kafka deployment detected${NC}"
            exit 1
        fi
    fi
    echo -e "Detected deployment type: ${GREEN}$DEPLOYMENT_TYPE${NC}"
}

# Prerequisites check
check_prerequisites() {
    print_header "Prerequisites Check"
    
    print_test "kubectl availability"
    if command -v kubectl &> /dev/null; then
        pass_test "kubectl" "kubectl is available"
    else
        fail_test "kubectl" "kubectl not found in PATH"
        return 1
    fi
    
    print_test "Kubernetes cluster connectivity"
    if kubectl cluster-info &> /dev/null; then
        pass_test "cluster-connectivity" "Connected to cluster"
    else
        fail_test "cluster-connectivity" "Cannot connect to Kubernetes cluster"
        return 1
    fi
    
    print_test "Required permissions"
    if kubectl auth can-i get pods --all-namespaces &> /dev/null; then
        pass_test "permissions" "Sufficient permissions"
    else
        warn_test "permissions" "May have limited permissions"
    fi
}

# Namespace verification
check_namespaces() {
    print_header "Namespace Verification"
    
    print_test "New Relic namespace"
    if kubectl get namespace $NEWRELIC_NAMESPACE &> /dev/null; then
        pass_test "newrelic-namespace" "Namespace $NEWRELIC_NAMESPACE exists"
    else
        fail_test "newrelic-namespace" "Namespace $NEWRELIC_NAMESPACE not found"
    fi
    
    if [ "$DEPLOYMENT_TYPE" == "kafka" ] || [ "$DEPLOYMENT_TYPE" == "both" ]; then
        print_test "Kafka namespace"
        if kubectl get namespace $KAFKA_NAMESPACE &> /dev/null; then
            pass_test "kafka-namespace" "Namespace $KAFKA_NAMESPACE exists"
        else
            fail_test "kafka-namespace" "Namespace $KAFKA_NAMESPACE not found"
        fi
    fi
    
    if [ "$DEPLOYMENT_TYPE" == "strimzi" ] || [ "$DEPLOYMENT_TYPE" == "both" ]; then
        print_test "Strimzi namespace"
        if kubectl get namespace $STRIMZI_NAMESPACE &> /dev/null; then
            pass_test "strimzi-namespace" "Namespace $STRIMZI_NAMESPACE exists"
        else
            fail_test "strimzi-namespace" "Namespace $STRIMZI_NAMESPACE not found"
        fi
    fi
}

# Check Kafka deployment
check_kafka_deployment() {
    local namespace=$1
    local deployment_name=$2
    
    print_header "Kafka Deployment Check - $deployment_name"
    
    print_test "Kafka pods"
    local kafka_pods=$(kubectl get pods -n $namespace -l app=kafka -o name 2>/dev/null | wc -l)
    if [ $kafka_pods -gt 0 ]; then
        pass_test "kafka-pods-$namespace" "$kafka_pods Kafka pods found"
    else
        fail_test "kafka-pods-$namespace" "No Kafka pods found"
        return 1
    fi
    
    print_test "Kafka pod status"
    local not_ready=$(kubectl get pods -n $namespace -l app=kafka -o json 2>/dev/null | \
        jq -r '.items[] | select(.status.phase != "Running") | .metadata.name' | wc -l)
    if [ $not_ready -eq 0 ]; then
        pass_test "kafka-ready-$namespace" "All Kafka pods are running"
    else
        fail_test "kafka-ready-$namespace" "$not_ready pods not ready"
    fi
    
    print_test "Kafka services"
    local services=$(kubectl get svc -n $namespace -l app=kafka -o name 2>/dev/null | wc -l)
    if [ $services -gt 0 ]; then
        pass_test "kafka-services-$namespace" "$services Kafka services found"
    else
        fail_test "kafka-services-$namespace" "No Kafka services found"
    fi
}

# Check Strimzi specific
check_strimzi_deployment() {
    print_header "Strimzi Deployment Check"
    
    print_test "Strimzi operator"
    if kubectl get deployment -n $STRIMZI_NAMESPACE strimzi-cluster-operator &>/dev/null; then
        local ready=$(kubectl get deployment -n $STRIMZI_NAMESPACE strimzi-cluster-operator -o jsonpath='{.status.readyReplicas}')
        if [ "$ready" -ge 1 ]; then
            pass_test "strimzi-operator" "Strimzi operator is running"
        else
            fail_test "strimzi-operator" "Strimzi operator not ready"
        fi
    else
        fail_test "strimzi-operator" "Strimzi operator not found"
    fi
    
    print_test "Kafka CRD"
    if kubectl get crd kafkas.kafka.strimzi.io &>/dev/null; then
        pass_test "kafka-crd" "Kafka CRD is installed"
    else
        fail_test "kafka-crd" "Kafka CRD not found"
    fi
    
    print_test "Kafka custom resource"
    local kafka_cr=$(kubectl get kafka -n $STRIMZI_NAMESPACE -o name 2>/dev/null | wc -l)
    if [ $kafka_cr -gt 0 ]; then
        pass_test "kafka-cr" "$kafka_cr Kafka cluster(s) defined"
    else
        fail_test "kafka-cr" "No Kafka clusters found"
    fi
}

# JMX connectivity tests
check_jmx_connectivity() {
    local namespace=$1
    local pod_selector=$2
    
    print_header "JMX Connectivity Check - $namespace"
    
    # Get first Kafka pod
    local kafka_pod=$(kubectl get pods -n $namespace -l $pod_selector -o name 2>/dev/null | head -1 | cut -d'/' -f2)
    
    if [ -z "$kafka_pod" ]; then
        fail_test "jmx-pod-$namespace" "No Kafka pod found"
        return 1
    fi
    
    print_test "JMX port (9999) listening"
    if kubectl exec -n $namespace $kafka_pod -- bash -c "ss -tlnp 2>/dev/null | grep -q 9999" 2>/dev/null; then
        pass_test "jmx-port-$namespace" "JMX port 9999 is listening"
    else
        fail_test "jmx-port-$namespace" "JMX port 9999 not listening"
    fi
    
    print_test "JMX local connectivity"
    if kubectl exec -n $namespace $kafka_pod -- bash -c "timeout 5 bash -c '</dev/tcp/localhost/9999' 2>/dev/null" 2>/dev/null; then
        pass_test "jmx-local-$namespace" "JMX locally accessible"
    else
        fail_test "jmx-local-$namespace" "JMX not accessible locally"
    fi
    
    print_test "JMX configuration"
    local jmx_opts=$(kubectl exec -n $namespace $kafka_pod -- printenv KAFKA_JMX_OPTS 2>/dev/null || echo "")
    if [[ "$jmx_opts" == *"jmxremote"* ]]; then
        pass_test "jmx-config-$namespace" "JMX configuration found"
        if [ "$VERBOSE" == "true" ]; then
            echo "    JMX_OPTS: $jmx_opts"
        fi
    else
        fail_test "jmx-config-$namespace" "JMX configuration not found in KAFKA_JMX_OPTS"
    fi
}

# New Relic integration checks
check_newrelic_integration() {
    print_header "New Relic Integration Check"
    
    print_test "New Relic Infrastructure pods"
    local nr_pods=$(kubectl get pods -n $NEWRELIC_NAMESPACE -l app.kubernetes.io/name=newrelic-infrastructure -o name 2>/dev/null | wc -l)
    if [ $nr_pods -gt 0 ]; then
        pass_test "nr-pods" "$nr_pods New Relic pods found"
    else
        fail_test "nr-pods" "No New Relic Infrastructure pods found"
        return 1
    fi
    
    print_test "nri-kafka pods"
    local nri_kafka_pods=$(kubectl get pods -n $NEWRELIC_NAMESPACE -l app.kubernetes.io/name=nri-kafka -o name 2>/dev/null | wc -l)
    if [ $nri_kafka_pods -gt 0 ]; then
        pass_test "nri-kafka-pods" "$nri_kafka_pods nri-kafka pods found"
    else
        warn_test "nri-kafka-pods" "No dedicated nri-kafka pods (may be bundled)"
    fi
    
    print_test "nri-kafka configuration"
    if kubectl get configmap -n $NEWRELIC_NAMESPACE -o name 2>/dev/null | grep -q kafka; then
        pass_test "nri-kafka-config" "Kafka configuration found"
    else
        fail_test "nri-kafka-config" "No Kafka configuration found"
    fi
}

# Test nri-kafka execution
test_nri_kafka_execution() {
    local namespace=$1
    local kafka_host=$2
    
    print_header "nri-kafka Execution Test - $namespace"
    
    # Find a New Relic pod
    local nr_pod=$(kubectl get pods -n $NEWRELIC_NAMESPACE -l app.kubernetes.io/name=newrelic-infrastructure -o name 2>/dev/null | head -1 | cut -d'/' -f2)
    
    if [ -z "$nr_pod" ]; then
        fail_test "nri-kafka-exec-$namespace" "No New Relic pod found"
        return 1
    fi
    
    print_test "nri-kafka binary"
    if kubectl exec -n $NEWRELIC_NAMESPACE $nr_pod -- ls /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka &>/dev/null; then
        pass_test "nri-kafka-binary-$namespace" "nri-kafka binary found"
    else
        fail_test "nri-kafka-binary-$namespace" "nri-kafka binary not found"
        return 1
    fi
    
    print_test "Manual nri-kafka execution"
    local output=$(kubectl exec -n $NEWRELIC_NAMESPACE $nr_pod -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
        -cluster_name test \
        -kafka_version "3.0.0" \
        -bootstrap_broker_host "$kafka_host" \
        -bootstrap_broker_kafka_port 9092 \
        -bootstrap_broker_jmx_port 9999 \
        -collect_broker_topic_data true \
        -pretty 2>&1 | head -20)
    
    if [[ "$output" == *"\"name\":\"com.newrelic.kafka\""* ]]; then
        pass_test "nri-kafka-exec-$namespace" "nri-kafka executed successfully"
    else
        fail_test "nri-kafka-exec-$namespace" "nri-kafka execution failed"
        if [ "$VERBOSE" == "true" ]; then
            echo "    Output: $output"
        fi
    fi
}

# Kafka functionality tests
test_kafka_functionality() {
    local namespace=$1
    local bootstrap_server=$2
    
    print_header "Kafka Functionality Test - $namespace"
    
    local kafka_pod=$(kubectl get pods -n $namespace -l app=kafka -o name 2>/dev/null | head -1 | cut -d'/' -f2)
    
    if [ -z "$kafka_pod" ]; then
        fail_test "kafka-func-$namespace" "No Kafka pod found"
        return 1
    fi
    
    print_test "List topics"
    if kubectl exec -n $namespace $kafka_pod -- kafka-topics.sh --bootstrap-server $bootstrap_server --list &>/dev/null; then
        pass_test "kafka-topics-$namespace" "Can list topics"
    else
        fail_test "kafka-topics-$namespace" "Cannot list topics"
    fi
    
    if [ "$TEST_MODE" == "full" ] || [ "$TEST_MODE" == "troubleshoot" ]; then
        print_test "Create test topic"
        local test_topic="test-$(date +%s)"
        if kubectl exec -n $namespace $kafka_pod -- kafka-topics.sh --bootstrap-server $bootstrap_server \
            --create --topic $test_topic --partitions 1 --replication-factor 1 &>/dev/null; then
            pass_test "kafka-create-topic-$namespace" "Can create topics"
            
            print_test "Produce message"
            if echo "test message" | kubectl exec -i -n $namespace $kafka_pod -- kafka-console-producer.sh \
                --broker-list $bootstrap_server --topic $test_topic &>/dev/null; then
                pass_test "kafka-produce-$namespace" "Can produce messages"
            else
                fail_test "kafka-produce-$namespace" "Cannot produce messages"
            fi
            
            print_test "Consume message"
            if kubectl exec -n $namespace $kafka_pod -- timeout 5 kafka-console-consumer.sh \
                --bootstrap-server $bootstrap_server --topic $test_topic --from-beginning --max-messages 1 2>/dev/null | grep -q "test message"; then
                pass_test "kafka-consume-$namespace" "Can consume messages"
            else
                fail_test "kafka-consume-$namespace" "Cannot consume messages"
            fi
            
            # Cleanup
            kubectl exec -n $namespace $kafka_pod -- kafka-topics.sh --bootstrap-server $bootstrap_server \
                --delete --topic $test_topic &>/dev/null
        else
            fail_test "kafka-create-topic-$namespace" "Cannot create topics"
        fi
    fi
}

# Advanced troubleshooting
advanced_troubleshooting() {
    print_header "Advanced Troubleshooting"
    
    if [ "$TEST_MODE" != "troubleshoot" ]; then
        skip_test "advanced-troubleshooting" "Run with TEST_MODE=troubleshoot to enable"
        return
    fi
    
    # Check logs for errors
    print_test "New Relic logs analysis"
    local nr_errors=$(kubectl logs -n $NEWRELIC_NAMESPACE -l app.kubernetes.io/name=newrelic-infrastructure --tail=1000 2>/dev/null | \
        grep -i "kafka" | grep -iE "(error|fail|timeout|refused)" | wc -l)
    if [ $nr_errors -eq 0 ]; then
        pass_test "nr-logs" "No Kafka-related errors in New Relic logs"
    else
        warn_test "nr-logs" "$nr_errors Kafka-related errors found in logs"
    fi
    
    # Network policy check
    print_test "Network policies"
    local policies=$(kubectl get networkpolicies --all-namespaces 2>/dev/null | wc -l)
    if [ $policies -gt 1 ]; then
        warn_test "network-policies" "$((policies-1)) network policies found - may affect connectivity"
    else
        pass_test "network-policies" "No restrictive network policies"
    fi
    
    # Resource usage
    print_test "Resource usage"
    if kubectl top nodes &>/dev/null; then
        local high_cpu=$(kubectl top pods --all-namespaces 2>/dev/null | awk 'NR>1 && $3>80 {print $2}' | wc -l)
        local high_mem=$(kubectl top pods --all-namespaces 2>/dev/null | awk 'NR>1 && $4>80 {print $2}' | wc -l)
        if [ $high_cpu -eq 0 ] && [ $high_mem -eq 0 ]; then
            pass_test "resource-usage" "No pods with high resource usage"
        else
            warn_test "resource-usage" "$high_cpu pods with high CPU, $high_mem with high memory"
        fi
    else
        skip_test "resource-usage" "Metrics server not available"
    fi
}

# Generate report
generate_report() {
    print_header "Verification Summary"
    
    echo -e "\nTotal Tests: $TOTAL_TESTS"
    echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
    echo -e "${RED}Failed: $FAILED_TESTS${NC}"
    echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
    
    if [ $FAILED_TESTS -gt 0 ]; then
        echo -e "\n${RED}Failed Tests:${NC}"
        for test in "${!TEST_RESULTS[@]}"; do
            if [ "${TEST_RESULTS[$test]}" == "FAILED" ]; then
                echo "  - $test: ${TEST_MESSAGES[$test]}"
            fi
        done
    fi
    
    if [ $WARNINGS -gt 0 ]; then
        echo -e "\n${YELLOW}Warnings:${NC}"
        for test in "${!TEST_RESULTS[@]}"; do
            if [ "${TEST_RESULTS[$test]}" == "WARNING" ]; then
                echo "  - $test: ${TEST_MESSAGES[$test]}"
            fi
        done
    fi
    
    # Recommendations
    echo -e "\n${BLUE}Recommendations:${NC}"
    if [[ "${TEST_RESULTS[jmx-port-kafka]}" == "FAILED" ]] || [[ "${TEST_RESULTS[jmx-port-strimzi-kafka]}" == "FAILED" ]]; then
        echo "  - Check JMX configuration in Kafka deployment"
        echo "  - Ensure KAFKA_JMX_OPTS environment variable is set correctly"
    fi
    
    if [[ "${TEST_RESULTS[nri-kafka-exec-kafka]}" == "FAILED" ]] || [[ "${TEST_RESULTS[nri-kafka-exec-strimzi-kafka]}" == "FAILED" ]]; then
        echo "  - Review nri-kafka configuration"
        echo "  - Check network connectivity between New Relic and Kafka pods"
        echo "  - Verify JMX authentication settings"
    fi
    
    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "\n${GREEN}✓ All tests passed! Kafka monitoring is properly configured.${NC}"
        
        echo -e "\n${BLUE}Next Steps:${NC}"
        echo "  1. Check New Relic UI for Kafka metrics"
        echo "  2. Run NRQL query: FROM KafkaBrokerSample SELECT * SINCE 5 minutes ago"
        echo "  3. Set up alerts for critical Kafka metrics"
    else
        echo -e "\n${RED}✗ Some tests failed. Please address the issues above.${NC}"
        echo -e "\nFor detailed troubleshooting, run: ${YELLOW}VERBOSE=true TEST_MODE=troubleshoot $0${NC}"
    fi
}

# Main execution
main() {
    echo -e "${BLUE}Master Kafka Monitoring Verification Script${NC}"
    echo -e "Test Mode: $TEST_MODE | Verbose: $VERBOSE"
    echo -e "================================================\n"
    
    # Check prerequisites
    check_prerequisites || exit 1
    
    # Detect deployment type
    detect_deployment
    
    # Check namespaces
    check_namespaces
    
    # Check deployments based on type
    if [ "$DEPLOYMENT_TYPE" == "kafka" ] || [ "$DEPLOYMENT_TYPE" == "both" ]; then
        check_kafka_deployment $KAFKA_NAMESPACE "Standard Kafka"
        check_jmx_connectivity $KAFKA_NAMESPACE "app=kafka"
        
        if [ "$TEST_MODE" != "basic" ]; then
            test_kafka_functionality $KAFKA_NAMESPACE "localhost:9092"
            test_nri_kafka_execution $KAFKA_NAMESPACE "kafka-0.kafka-headless.$KAFKA_NAMESPACE.svc.cluster.local"
        fi
    fi
    
    if [ "$DEPLOYMENT_TYPE" == "strimzi" ] || [ "$DEPLOYMENT_TYPE" == "both" ]; then
        check_strimzi_deployment
        check_kafka_deployment $STRIMZI_NAMESPACE "Strimzi Kafka"
        check_jmx_connectivity $STRIMZI_NAMESPACE "strimzi.io/cluster=kafka"
        
        if [ "$TEST_MODE" != "basic" ]; then
            test_kafka_functionality $STRIMZI_NAMESPACE "localhost:9092"
            test_nri_kafka_execution $STRIMZI_NAMESPACE "kafka-kafka-brokers.$STRIMZI_NAMESPACE.svc.cluster.local"
        fi
    fi
    
    # Check New Relic integration
    check_newrelic_integration
    
    # Advanced troubleshooting if requested
    advanced_troubleshooting
    
    # Generate final report
    generate_report
    
    # Exit with appropriate code
    if [ $FAILED_TESTS -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# Run main function
main "$@"