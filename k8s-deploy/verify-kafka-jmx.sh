#!/bin/bash

# Verify Kafka JMX metrics are exposed correctly

echo "=== Verifying Kafka JMX Configuration ==="

# Check Kafka pods
echo -e "\n1. Checking Kafka pods:"
kubectl get pods -n kafka -l app=kafka

# Check JMX configuration in Kafka process
echo -e "\n2. Checking JMX configuration in Kafka process:"
KAFKA_POD=$(kubectl get pods -n kafka -l app=kafka -o jsonpath='{.items[0].metadata.name}')
echo "Using pod: $KAFKA_POD"
kubectl exec -n kafka $KAFKA_POD -- ps aux | grep -o 'jmxremote[^ ]*' | tr ' ' '\n'

# Test JMX port from within the Kafka pod
echo -e "\n3. Testing JMX port from within Kafka pod:"
kubectl exec -n kafka $KAFKA_POD -- bash -c "echo 'test' | timeout 2 nc localhost 9999" && echo "JMX port is open locally" || echo "JMX port not accessible locally"

# Create a debug pod to test JMX connectivity
echo -e "\n4. Creating debug pod with JMX tools:"
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: jmx-debug
  namespace: kafka
spec:
  containers:
  - name: debug
    image: openjdk:11-jre-slim
    command: ["sleep", "3600"]
EOF

# Wait for debug pod
sleep 10

# Install JMX tools in debug pod
echo -e "\n5. Installing JMX tools in debug pod:"
kubectl exec -n kafka jmx-debug -- apt-get update -qq
kubectl exec -n kafka jmx-debug -- apt-get install -y -qq netcat-openbsd curl wget

# Test connectivity from debug pod
echo -e "\n6. Testing JMX connectivity from debug pod:"
kubectl exec -n kafka jmx-debug -- nc -zv kafka.kafka.svc.cluster.local 9999

# Download JMXTerm for detailed testing
echo -e "\n7. Testing with JMXTerm:"
kubectl exec -n kafka jmx-debug -- wget -q https://github.com/jiaqi/jmxterm/releases/download/v1.0.2/jmxterm-1.0.2-uber.jar -O /tmp/jmxterm.jar

# Test JMX connection with JMXTerm
echo -e "\n8. Connecting to JMX with JMXTerm:"
kubectl exec -n kafka jmx-debug -- bash -c "echo 'domains' | java -jar /tmp/jmxterm.jar -l kafka.kafka.svc.cluster.local:9999 -n" 2>&1 | head -20

# Check for common JMX issues
echo -e "\n9. Checking for common JMX issues:"

# Check if RMI hostname is set correctly
echo "RMI hostname configuration:"
kubectl exec -n kafka $KAFKA_POD -- bash -c "env | grep -i rmi"

# Check network policies
echo -e "\n10. Checking network policies:"
kubectl get networkpolicies -n kafka

# Test from New Relic pod with curl
echo -e "\n11. Testing JMX from New Relic pod:"
NRI_POD=$(kubectl get pods -n newrelic -l app.kubernetes.io/component=kubelet -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n newrelic $NRI_POD -c agent -- nc -zv kafka.kafka.svc.cluster.local 9999

# Clean up debug pod
echo -e "\n12. Cleaning up debug pod:"
kubectl delete pod -n kafka jmx-debug --force --grace-period=0

echo -e "\n=== JMX Verification Complete ==="