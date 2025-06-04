#!/bin/bash

# Automated Troubleshooter for Strimzi Kafka

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
NAMESPACE="strimzi-kafka"
NR_NAMESPACE="newrelic"
KAFKA_CLUSTER="production-kafka"
LOG_DIR="/tmp/strimzi-troubleshoot-$(date +%Y%m%d-%H%M%S)"

# Create log directory
mkdir -p "$LOG_DIR"
echo "Collecting diagnostics in: $LOG_DIR"

# Helper functions
print_header() {
    echo -e "\n${BLUE}==== $1 ====${NC}"
}

print_diagnosis() {
    echo -e "${YELLOW}[DIAGNOSIS] $1${NC}"
}

print_fix() {
    echo -e "${GREEN}[FIX ATTEMPT] $1${NC}"
}

print_error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

collect_logs() {
    local component=$1
    local label=$2
    echo "Collecting logs for $component..."
    kubectl logs -n $NAMESPACE -l "$label" --all-containers --tail=1000 > "$LOG_DIR/${component}-logs.txt" 2>&1 || true
    kubectl logs -n $NAMESPACE -l "$label" --all-containers --tail=100 --previous > "$LOG_DIR/${component}-logs-previous.txt" 2>&1 || true
}

# Collect initial diagnostics
print_header "Collecting Diagnostics"

# Cluster info
kubectl cluster-info > "$LOG_DIR/cluster-info.txt" 2>&1
kubectl get nodes -o wide > "$LOG_DIR/nodes.txt" 2>&1
kubectl top nodes > "$LOG_DIR/node-resources.txt" 2>&1 || true

# Namespace resources
kubectl get all -n $NAMESPACE -o wide > "$LOG_DIR/namespace-resources.txt" 2>&1
kubectl get events -n $NAMESPACE --sort-by='.lastTimestamp' > "$LOG_DIR/events.txt" 2>&1

# Collect component logs
collect_logs "operator" "name=strimzi-cluster-operator"
collect_logs "kafka" "strimzi.io/name=${KAFKA_CLUSTER}-kafka"
collect_logs "zookeeper" "strimzi.io/name=${KAFKA_CLUSTER}-zookeeper"

# Kafka resource details
kubectl get kafka -n $NAMESPACE $KAFKA_CLUSTER -o yaml > "$LOG_DIR/kafka-resource.yaml" 2>&1
kubectl describe kafka -n $NAMESPACE $KAFKA_CLUSTER > "$LOG_DIR/kafka-describe.txt" 2>&1

# Storage info
kubectl get pvc -n $NAMESPACE -o wide > "$LOG_DIR/pvcs.txt" 2>&1
kubectl get pv | grep $NAMESPACE > "$LOG_DIR/pvs.txt" 2>&1 || true

# Troubleshooting common issues
print_header "Automated Troubleshooting"

# 1. Check Operator Issues
print_diagnosis "Checking Strimzi Operator..."
OPERATOR_READY=$(kubectl get deployment -n $NAMESPACE strimzi-cluster-operator -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [ "$OPERATOR_READY" -eq 0 ]; then
    print_error "Strimzi operator is not running"
    
    # Check for common operator issues
    if kubectl logs -n $NAMESPACE deployment/strimzi-cluster-operator --tail=50 2>&1 | grep -q "permission denied"; then
        print_diagnosis "Operator has permission issues"
        print_fix "Checking RBAC permissions..."
        kubectl auth can-i --list --as=system:serviceaccount:${NAMESPACE}:strimzi-cluster-operator -n $NAMESPACE > "$LOG_DIR/operator-permissions.txt"
    fi
    
    # Try restarting operator
    print_fix "Attempting to restart operator..."
    kubectl rollout restart deployment/strimzi-cluster-operator -n $NAMESPACE
    sleep 10
fi

# 2. Check Kafka Broker Issues
print_diagnosis "Checking Kafka Brokers..."
BROKER_ISSUES=0
for i in 0 1 2; do
    POD_NAME="${KAFKA_CLUSTER}-kafka-$i"
    if ! kubectl get pod -n $NAMESPACE "$POD_NAME" &>/dev/null; then
        print_error "Broker $i pod does not exist"
        BROKER_ISSUES=$((BROKER_ISSUES + 1))
        continue
    fi
    
    # Check pod status
    PHASE=$(kubectl get pod -n $NAMESPACE "$POD_NAME" -o jsonpath='{.status.phase}')
    if [ "$PHASE" != "Running" ]; then
        print_error "Broker $i is in phase: $PHASE"
        BROKER_ISSUES=$((BROKER_ISSUES + 1))
        
        # Check for specific issues
        kubectl describe pod -n $NAMESPACE "$POD_NAME" > "$LOG_DIR/broker-${i}-describe.txt"
        
        # Check for pending due to resources
        if kubectl describe pod -n $NAMESPACE "$POD_NAME" | grep -q "Insufficient"; then
            print_diagnosis "Broker $i has insufficient resources"
            kubectl describe node > "$LOG_DIR/node-describe.txt"
        fi
        
        # Check for image pull issues
        if kubectl describe pod -n $NAMESPACE "$POD_NAME" | grep -q "ImagePullBackOff\|ErrImagePull"; then
            print_diagnosis "Broker $i has image pull issues"
            print_fix "Check image availability and pull secrets"
        fi
        
        # Check for PVC issues
        if kubectl describe pod -n $NAMESPACE "$POD_NAME" | grep -q "persistentvolumeclaim.*not found"; then
            print_diagnosis "Broker $i has PVC issues"
            kubectl get pvc -n $NAMESPACE | grep "kafka-$i" || print_error "PVC not found for broker $i"
        fi
    else
        # Check restart count
        RESTARTS=$(kubectl get pod -n $NAMESPACE "$POD_NAME" -o jsonpath='{.status.containerStatuses[0].restartCount}')
        if [ "$RESTARTS" -gt 5 ]; then
            print_error "Broker $i has restarted $RESTARTS times"
            BROKER_ISSUES=$((BROKER_ISSUES + 1))
            
            # Get crash logs
            kubectl logs -n $NAMESPACE "$POD_NAME" --previous > "$LOG_DIR/broker-${i}-crash-logs.txt" 2>&1 || true
        fi
    fi
done

# 3. Check Zookeeper Issues
print_diagnosis "Checking Zookeeper..."
ZK_READY=$(kubectl get pods -n $NAMESPACE -l strimzi.io/name=${KAFKA_CLUSTER}-zookeeper -o jsonpath='{.items[*].status.phase}' | grep -c "Running" || echo "0")
if [ "$ZK_READY" -lt 3 ]; then
    print_error "Only $ZK_READY/3 Zookeeper nodes are running"
    
    # Check Zookeeper quorum
    for i in 0 1 2; do
        if kubectl exec -n $NAMESPACE ${KAFKA_CLUSTER}-zookeeper-$i -- echo ruok 2>&1 | grep -q "imok"; then
            echo "Zookeeper $i is healthy"
        else
            print_error "Zookeeper $i is not responding"
        fi
    done
fi

# 4. Check JMX Configuration
print_diagnosis "Checking JMX Configuration..."
JMX_SECRET=$(kubectl get secret -n $NAMESPACE ${KAFKA_CLUSTER}-cluster-operator-certs -o jsonpath='{.data.cluster-operator\.password}' 2>/dev/null | base64 -d)
if [ -z "$JMX_SECRET" ]; then
    print_error "JMX secret not found"
    print_fix "JMX authentication may not be properly configured"
fi

# 5. Check New Relic Integration
if kubectl get namespace $NR_NAMESPACE &>/dev/null; then
    print_diagnosis "Checking New Relic Integration..."
    NRI_POD=$(kubectl get pods -n $NR_NAMESPACE -l app=nri-kafka-strimzi -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    
    if [ -n "$NRI_POD" ]; then
        # Check for connection issues
        if kubectl logs -n $NR_NAMESPACE "$NRI_POD" --tail=50 | grep -q "connection refused\|timeout"; then
            print_error "New Relic integration has connection issues"
            
            # Test connectivity
            print_fix "Testing Zookeeper connectivity from New Relic pod..."
            kubectl exec -n $NR_NAMESPACE "$NRI_POD" -- nc -zv production-kafka-zookeeper-client.strimzi-kafka.svc.cluster.local 2181 || \
                print_error "Cannot connect to Zookeeper from New Relic pod"
        fi
        
        # Collect NR logs
        kubectl logs -n $NR_NAMESPACE "$NRI_POD" --tail=500 > "$LOG_DIR/newrelic-logs.txt" 2>&1
    fi
fi

# 6. Performance Issues
print_diagnosis "Checking for Performance Issues..."

# Check for under-replicated partitions
kubectl exec -n $NAMESPACE ${KAFKA_CLUSTER}-kafka-0 -- \
    /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
    --describe --under-replicated-partitions > "$LOG_DIR/under-replicated-partitions.txt" 2>&1 || true

if [ -s "$LOG_DIR/under-replicated-partitions.txt" ]; then
    print_error "Found under-replicated partitions"
    print_fix "This may indicate broker performance issues or network problems"
fi

# Check consumer lag
kubectl exec -n $NAMESPACE ${KAFKA_CLUSTER}-kafka-0 -- \
    /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
    --list > "$LOG_DIR/consumer-groups.txt" 2>&1 || true

# Generate fix recommendations
print_header "Generating Recommendations"

RECOMMENDATIONS="$LOG_DIR/recommendations.txt"
echo "Troubleshooting Recommendations" > "$RECOMMENDATIONS"
echo "==============================" >> "$RECOMMENDATIONS"
echo "Generated at: $(date)" >> "$RECOMMENDATIONS"
echo "" >> "$RECOMMENDATIONS"

# Operator recommendations
if [ "$OPERATOR_READY" -eq 0 ]; then
    echo "OPERATOR ISSUES:" >> "$RECOMMENDATIONS"
    echo "1. Check operator logs: kubectl logs -n $NAMESPACE deployment/strimzi-cluster-operator" >> "$RECOMMENDATIONS"
    echo "2. Verify RBAC permissions are correctly configured" >> "$RECOMMENDATIONS"
    echo "3. Try deleting and recreating the operator deployment" >> "$RECOMMENDATIONS"
    echo "" >> "$RECOMMENDATIONS"
fi

# Broker recommendations
if [ "$BROKER_ISSUES" -gt 0 ]; then
    echo "BROKER ISSUES:" >> "$RECOMMENDATIONS"
    echo "1. Check node resources: kubectl describe nodes" >> "$RECOMMENDATIONS"
    echo "2. Verify storage class is available: kubectl get storageclass" >> "$RECOMMENDATIONS"
    echo "3. Check PVC status: kubectl get pvc -n $NAMESPACE" >> "$RECOMMENDATIONS"
    echo "4. Review broker logs for JVM issues or configuration errors" >> "$RECOMMENDATIONS"
    echo "5. Consider scaling down to 1 broker temporarily for debugging" >> "$RECOMMENDATIONS"
    echo "" >> "$RECOMMENDATIONS"
fi

# Storage recommendations
PVC_PENDING=$(kubectl get pvc -n $NAMESPACE -o jsonpath='{.items[?(@.status.phase!="Bound")].metadata.name}' | wc -w)
if [ "$PVC_PENDING" -gt 0 ]; then
    echo "STORAGE ISSUES:" >> "$RECOMMENDATIONS"
    echo "1. $PVC_PENDING PVCs are not bound" >> "$RECOMMENDATIONS"
    echo "2. Check available storage: kubectl get pv" >> "$RECOMMENDATIONS"
    echo "3. Verify storage class provisioner is running" >> "$RECOMMENDATIONS"
    echo "4. Check node disk space: kubectl get nodes -o custom-columns=NAME:.metadata.name,DISK:.status.allocatable.ephemeral-storage" >> "$RECOMMENDATIONS"
    echo "" >> "$RECOMMENDATIONS"
fi

# Network recommendations
echo "NETWORK CHECKS:" >> "$RECOMMENDATIONS"
echo "1. Test DNS resolution: kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup ${KAFKA_CLUSTER}-kafka-bootstrap.$NAMESPACE.svc.cluster.local" >> "$RECOMMENDATIONS"
echo "2. Check service endpoints: kubectl get endpoints -n $NAMESPACE" >> "$RECOMMENDATIONS"
echo "3. Verify network policies: kubectl get networkpolicy -n $NAMESPACE" >> "$RECOMMENDATIONS"
echo "" >> "$RECOMMENDATIONS"

# Generate diagnostic archive
print_header "Creating Diagnostic Archive"
ARCHIVE_NAME="strimzi-diagnostics-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$ARCHIVE_NAME" -C "$(dirname "$LOG_DIR")" "$(basename "$LOG_DIR")"
echo "Diagnostic archive created: $ARCHIVE_NAME"

# Summary
print_header "Troubleshooting Summary"
echo "Diagnostics collected in: $LOG_DIR"
echo "Archive created: $ARCHIVE_NAME"
echo ""
echo "Key findings:"
[ "$OPERATOR_READY" -eq 0 ] && echo "- Strimzi operator is not running"
[ "$BROKER_ISSUES" -gt 0 ] && echo "- $BROKER_ISSUES Kafka brokers have issues"
[ "$ZK_READY" -lt 3 ] && echo "- Zookeeper cluster is not fully operational"
[ "$PVC_PENDING" -gt 0 ] && echo "- $PVC_PENDING PVCs are pending"
echo ""
echo "See $RECOMMENDATIONS for detailed recommendations"

# Offer to show logs
echo ""
echo "To view recent error logs, run:"
echo "grep -i error $LOG_DIR/*.txt | head -20"