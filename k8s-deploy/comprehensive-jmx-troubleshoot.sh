#!/bin/bash

# Comprehensive JMX Troubleshooting Script for nri-kafka
# This script tests all possible scenarios for JMX connection issues

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}Comprehensive JMX Troubleshooting${NC}"
echo -e "${BLUE}=========================================${NC}"

# Function to print section headers
print_section() {
    echo -e "\n${YELLOW}=== $1 ===${NC}"
}

# Function to run test and capture result
run_test() {
    local test_name="$1"
    local command="$2"
    echo -n "Testing: $test_name... "
    if eval "$command" &>/dev/null; then
        echo -e "${GREEN}[PASS]${NC}"
        return 0
    else
        echo -e "${RED}[FAIL]${NC}"
        return 1
    fi
}

# SCENARIO 1: Basic Kubernetes Health
print_section "SCENARIO 1: Kubernetes Cluster Health"

run_test "Kubernetes API accessibility" "kubectl cluster-info"
run_test "Kafka namespace exists" "kubectl get namespace kafka"
run_test "NewRelic namespace exists" "kubectl get namespace newrelic"

# Check node resources
echo -e "\nNode Resources:"
kubectl top nodes 2>/dev/null || echo "Metrics server not installed"

# SCENARIO 2: Kafka Pod Health
print_section "SCENARIO 2: Kafka Pod Health"

echo "Kafka pods status:"
kubectl get pods -n kafka -o wide

# Get Kafka pod details
KAFKA_PODS=$(kubectl get pods -n kafka -l app=kafka -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
if [ -z "$KAFKA_PODS" ]; then
    # Try deployment
    KAFKA_PODS=$(kubectl get pods -n kafka -o jsonpath='{.items[?(@.metadata.labels.app=="kafka")].metadata.name}')
fi

if [ -n "$KAFKA_PODS" ]; then
    for pod in $KAFKA_PODS; do
        echo -e "\nPod: $pod"
        echo "Events:"
        kubectl describe pod -n kafka $pod | grep -A10 "Events:" | tail -10
        
        echo "Container Status:"
        kubectl get pod -n kafka $pod -o jsonpath='{.status.containerStatuses[*].state}' | jq . 2>/dev/null || \
        kubectl get pod -n kafka $pod -o jsonpath='{.status.containerStatuses[*].state}'
    done
else
    echo -e "${RED}No Kafka pods found!${NC}"
fi

# SCENARIO 3: Network Connectivity
print_section "SCENARIO 3: Network Connectivity Tests"

# Get a New Relic pod for testing
NRI_POD=$(kubectl get pods -n newrelic -l app.kubernetes.io/component=kubelet -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || \
          kubectl get pods -n newrelic -l app=nri-kafka-monitor -o jsonpath='{.items[0].metadata.name}')

if [ -n "$NRI_POD" ]; then
    echo "Using New Relic pod: $NRI_POD"
    
    # Test basic connectivity
    run_test "DNS resolution for kafka service" \
        "kubectl exec -n newrelic $NRI_POD -c agent -- nslookup kafka.kafka.svc.cluster.local 2>/dev/null || kubectl exec -n newrelic $NRI_POD -- nslookup kafka.kafka.svc.cluster.local"
    
    run_test "Port 9092 connectivity" \
        "kubectl exec -n newrelic $NRI_POD -c agent -- nc -zv kafka.kafka.svc.cluster.local 9092 2>&1 || kubectl exec -n newrelic $NRI_POD -- nc -zv kafka.kafka.svc.cluster.local 9092"
    
    run_test "Port 9999 (JMX) connectivity" \
        "kubectl exec -n newrelic $NRI_POD -c agent -- nc -zv kafka.kafka.svc.cluster.local 9999 2>&1 || kubectl exec -n newrelic $NRI_POD -- nc -zv kafka.kafka.svc.cluster.local 9999"
fi

# SCENARIO 4: JMX Configuration Analysis
print_section "SCENARIO 4: JMX Configuration Analysis"

if [ -n "$KAFKA_PODS" ]; then
    for pod in $KAFKA_PODS; do
        echo -e "\nAnalyzing JMX config for pod: $pod"
        
        # Check JMX environment variables
        echo "JMX Environment Variables:"
        kubectl exec -n kafka $pod -- env | grep -E "JMX|RMI|jmx" || echo "No JMX env vars found"
        
        # Check Java process for JMX options
        echo -e "\nJMX Options in Java Process:"
        kubectl exec -n kafka $pod -- bash -c "ps aux | grep java" 2>/dev/null | grep -o 'jmxremote[^ ]*' | tr ' ' '\n' || \
        kubectl exec -n kafka $pod -- sh -c "ps aux | grep java" 2>/dev/null | grep -o 'jmxremote[^ ]*' | tr ' ' '\n' || \
        echo "Could not extract JMX options"
    done
fi

# SCENARIO 5: Service Discovery
print_section "SCENARIO 5: Service Discovery & DNS"

echo "Kafka services:"
kubectl get svc -n kafka

echo -e "\nEndpoints:"
kubectl get endpoints -n kafka

# Test headless service DNS
if [ -n "$NRI_POD" ]; then
    echo -e "\nTesting headless service DNS:"
    for i in 0 1 2; do
        run_test "DNS for kafka-$i.kafka-headless" \
            "kubectl exec -n newrelic $NRI_POD -c agent -- nslookup kafka-$i.kafka-headless.kafka.svc.cluster.local 2>/dev/null || kubectl exec -n newrelic $NRI_POD -- nslookup kafka-$i.kafka-headless.kafka.svc.cluster.local"
    done
fi

# SCENARIO 6: RMI Deep Dive
print_section "SCENARIO 6: RMI/JMX Deep Analysis"

# Create diagnostic pod if it doesn't exist
if ! kubectl get pod -n kafka jmx-debug &>/dev/null; then
    echo "Creating JMX debug pod..."
    kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: jmx-debug
  namespace: kafka
spec:
  containers:
  - name: debug
    image: openjdk:11
    command: ["sleep", "3600"]
    resources:
      limits:
        memory: "256Mi"
      requests:
        memory: "128Mi"
EOF
    sleep 20
fi

# Test with JConsole-like tool
echo -e "\nTesting JMX with Java tools:"
kubectl exec -n kafka jmx-debug -- bash -c "
    cd /tmp
    # Create a simple JMX test
    cat > JMXTest.java << 'JAVA'
import javax.management.*;
import javax.management.remote.*;
import java.util.*;

public class JMXTest {
    public static void main(String[] args) {
        if (args.length != 2) {
            System.out.println(\"Usage: java JMXTest <host> <port>\");
            return;
        }
        
        try {
            String host = args[0];
            String port = args[1];
            String url = \"service:jmx:rmi:///jndi/rmi://\" + host + \":\" + port + \"/jmxrmi\";
            
            System.out.println(\"Connecting to: \" + url);
            
            JMXServiceURL serviceUrl = new JMXServiceURL(url);
            JMXConnector jmxConnector = JMXConnectorFactory.connect(serviceUrl, null);
            MBeanServerConnection mbeanConn = jmxConnector.getMBeanServerConnection();
            
            System.out.println(\"Successfully connected!\");
            System.out.println(\"MBean count: \" + mbeanConn.getMBeanCount());
            
            // List domains
            String[] domains = mbeanConn.getDomains();
            System.out.println(\"\\nDomains:\");
            for (String domain : domains) {
                System.out.println(\"  - \" + domain);
            }
            
            jmxConnector.close();
        } catch (Exception e) {
            System.out.println(\"Connection failed: \" + e.getMessage());
            e.printStackTrace();
        }
    }
}
JAVA
    
    # Compile and run
    javac JMXTest.java 2>/dev/null
    
    # Test each Kafka broker
    for broker in kafka.kafka.svc.cluster.local kafka-0.kafka-headless.kafka.svc.cluster.local; do
        echo \"\\nTesting JMX connection to \$broker:\"
        java JMXTest \$broker 9999 2>&1 || true
    done
" 2>/dev/null || echo "JMX test failed to execute"

# SCENARIO 7: Container Runtime Analysis
print_section "SCENARIO 7: Container Runtime & Networking"

# Check CNI plugin
echo "CNI Configuration:"
kubectl get nodes -o jsonpath='{.items[0].status.nodeInfo.containerRuntimeVersion}'

# Check network policies
echo -e "\nNetwork Policies in kafka namespace:"
kubectl get networkpolicies -n kafka 2>/dev/null || echo "No network policies"

echo -e "\nNetwork Policies in newrelic namespace:"
kubectl get networkpolicies -n newrelic 2>/dev/null || echo "No network policies"

# SCENARIO 8: Integration Binary Analysis
print_section "SCENARIO 8: nri-kafka Integration Analysis"

if [ -n "$NRI_POD" ]; then
    echo "Checking nri-kafka binary:"
    
    # Check binary exists and version
    kubectl exec -n newrelic $NRI_POD -c agent -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka --version 2>&1 || \
    kubectl exec -n newrelic $NRI_POD -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka --version 2>&1 || \
    echo "Could not get version"
    
    # Test with debug output
    echo -e "\nTesting nri-kafka with debug logging:"
    kubectl exec -n newrelic $NRI_POD -c agent -- bash -c "
        NRI_LOG_LEVEL=debug /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
            --cluster_name test \
            --bootstrap_broker_host kafka.kafka.svc.cluster.local \
            --bootstrap_broker_jmx_port 9999 \
            --bootstrap_broker_kafka_port 9092 \
            --metrics \
            --verbose 2>&1 | head -50
    " 2>/dev/null || echo "Debug test failed"
fi

# SCENARIO 9: Alternative Connectivity Tests
print_section "SCENARIO 9: Alternative Connectivity Methods"

# Test with curl to JMX port
if [ -n "$NRI_POD" ]; then
    echo "Testing raw TCP connection to JMX:"
    kubectl exec -n newrelic $NRI_POD -c agent -- bash -c "timeout 5 bash -c 'echo > /dev/tcp/kafka.kafka.svc.cluster.local/9999'" 2>&1 && echo "TCP connection successful" || echo "TCP connection failed"
fi

# SCENARIO 10: Kafka Image Analysis
print_section "SCENARIO 10: Kafka Image & Configuration"

if [ -n "$KAFKA_PODS" ]; then
    for pod in $KAFKA_PODS; do
        echo -e "\nAnalyzing Kafka pod: $pod"
        
        # Check Kafka version
        echo "Kafka version:"
        kubectl exec -n kafka $pod -- kafka-broker-api-versions --version 2>/dev/null || \
        kubectl exec -n kafka $pod -- /opt/kafka/bin/kafka-broker-api-versions.sh --version 2>/dev/null || \
        kubectl exec -n kafka $pod -- /opt/bitnami/kafka/bin/kafka-broker-api-versions.sh --version 2>/dev/null || \
        echo "Could not determine Kafka version"
        
        # Check if JMX is actually listening
        echo -e "\nChecking JMX listener:"
        kubectl exec -n kafka $pod -- bash -c "netstat -tlnp | grep 9999" 2>/dev/null || \
        kubectl exec -n kafka $pod -- sh -c "netstat -tlnp | grep 9999" 2>/dev/null || \
        kubectl exec -n kafka $pod -- bash -c "ss -tlnp | grep 9999" 2>/dev/null || \
        echo "Could not check JMX listener"
    done
fi

# SCENARIO 11: Complete Fix Attempt
print_section "SCENARIO 11: Attempting Complete Fix"

echo "Deploying known-working Kafka configuration..."
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: kafka-jmx-fix
  namespace: kafka
data:
  start-kafka.sh: |
    #!/bin/bash
    # Set broker ID from hostname
    export KAFKA_BROKER_ID=${HOSTNAME##*-}
    
    # Configure JMX with explicit settings
    export JMX_PORT=9999
    export KAFKA_JMX_OPTS="-Dcom.sun.management.jmxremote \
      -Dcom.sun.management.jmxremote.authenticate=false \
      -Dcom.sun.management.jmxremote.ssl=false \
      -Dcom.sun.management.jmxremote.local.only=false \
      -Dcom.sun.management.jmxremote.port=9999 \
      -Dcom.sun.management.jmxremote.rmi.port=9999 \
      -Djava.rmi.server.hostname=localhost \
      -Dcom.sun.management.jmxremote.host=0.0.0.0"
    
    # Start Kafka
    exec /opt/bitnami/scripts/kafka/run.sh
---
apiVersion: v1
kind: Pod
metadata:
  name: kafka-jmx-test
  namespace: kafka
  labels:
    app: kafka
    test: jmx
spec:
  containers:
  - name: kafka
    image: bitnami/kafka:3.5.1
    ports:
    - containerPort: 9092
    - containerPort: 9999
    env:
    - name: KAFKA_CFG_BROKER_ID
      value: "99"
    - name: KAFKA_CFG_LISTENERS
      value: PLAINTEXT://:9092
    - name: KAFKA_CFG_ADVERTISED_LISTENERS
      value: PLAINTEXT://kafka-jmx-test.kafka.svc.cluster.local:9092
    - name: KAFKA_CFG_ZOOKEEPER_CONNECT
      value: zookeeper:2181
    - name: JMX_PORT
      value: "9999"
    volumeMounts:
    - name: start-script
      mountPath: /opt/bitnami/scripts/kafka/run.sh
      subPath: start-kafka.sh
  volumes:
  - name: start-script
    configMap:
      name: kafka-jmx-fix
      defaultMode: 0755
EOF

# Wait for test pod
sleep 30

# Test the new pod
echo -e "\nTesting JMX on fixed pod:"
if [ -n "$NRI_POD" ]; then
    kubectl exec -n newrelic $NRI_POD -c agent -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
        --cluster_name test \
        --bootstrap_broker_host kafka-jmx-test.kafka.svc.cluster.local \
        --bootstrap_broker_jmx_port 9999 \
        --bootstrap_broker_kafka_port 9092 \
        --metrics --pretty 2>&1 | head -20 || echo "Test failed"
fi

# SUMMARY
print_section "TROUBLESHOOTING SUMMARY"

echo -e "\n${BLUE}Key Findings:${NC}"
echo "1. Check if Kafka pods are actually running and healthy"
echo "2. Verify JMX is listening on port 9999 inside the container"
echo "3. Ensure RMI hostname is resolvable from client pods"
echo "4. Check for network policies blocking connections"
echo "5. Verify the Kafka image supports JMX configuration"

echo -e "\n${BLUE}Recommended Solutions:${NC}"
echo "1. Use localhost connections (sidecar pattern)"
echo "2. Use Prometheus JMX Exporter instead"
echo "3. Configure Kafka to push metrics directly"
echo "4. Use service mesh for better network control"
echo "5. Deploy a custom JMX proxy service"

echo -e "\n${BLUE}Script Complete!${NC}"