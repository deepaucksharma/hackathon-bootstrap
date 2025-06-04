#!/bin/bash

# Test different Kafka images to find working JMX configuration

echo "Testing different Kafka images for JMX compatibility..."

# Function to deploy and test Kafka
test_kafka_image() {
    local IMAGE="$1"
    local NAME="$2"
    local CONFIG="$3"
    
    echo -e "\n=== Testing $NAME ($IMAGE) ==="
    
    # Deploy test pod
    kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: kafka-test-$NAME
  namespace: kafka
  labels:
    app: kafka
    test: $NAME
spec:
  containers:
  - name: kafka
    image: $IMAGE
    ports:
    - containerPort: 9092
    - containerPort: 9999
    env:
    $CONFIG
    resources:
      limits:
        memory: "1Gi"
      requests:
        memory: "512Mi"
EOF

    # Wait for pod to start
    echo -n "Waiting for pod to start..."
    for i in {1..30}; do
        if kubectl get pod -n kafka kafka-test-$NAME -o jsonpath='{.status.phase}' 2>/dev/null | grep -q "Running"; then
            echo " Started!"
            break
        fi
        echo -n "."
        sleep 2
    done
    
    # Check if JMX is listening
    echo "Checking JMX port..."
    kubectl exec -n kafka kafka-test-$NAME -- bash -c "ss -tlnp | grep 9999 || netstat -tlnp | grep 9999" 2>/dev/null || echo "JMX port not found"
    
    # Test JMX connection
    NRI_POD=$(kubectl get pods -n newrelic -l app.kubernetes.io/component=kubelet -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    if [ -n "$NRI_POD" ]; then
        echo "Testing nri-kafka connection..."
        kubectl exec -n newrelic $NRI_POD -c agent -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
            --cluster_name test \
            --bootstrap_broker_host kafka-test-$NAME.kafka.svc.cluster.local \
            --bootstrap_broker_jmx_port 9999 \
            --bootstrap_broker_kafka_port 9092 \
            --metrics --pretty 2>&1 | grep -E "data|error" | head -10
    fi
    
    # Cleanup
    kubectl delete pod -n kafka kafka-test-$NAME --force --grace-period=0 2>/dev/null
}

# Test 1: Bitnami Kafka with different JMX config
test_kafka_image "bitnami/kafka:3.5.1" "bitnami" '
    - name: KAFKA_CFG_BROKER_ID
      value: "1"
    - name: KAFKA_CFG_LISTENERS
      value: "PLAINTEXT://:9092"
    - name: KAFKA_CFG_ADVERTISED_LISTENERS
      value: "PLAINTEXT://localhost:9092"
    - name: KAFKA_CFG_ZOOKEEPER_CONNECT
      value: "zookeeper:2181"
    - name: KAFKA_ENABLE_KRAFT
      value: "no"
    - name: JMX_PORT
      value: "9999"
    - name: KAFKA_JMX_OPTS
      value: "-Dcom.sun.management.jmxremote -Dcom.sun.management.jmxremote.authenticate=false -Dcom.sun.management.jmxremote.ssl=false -Dcom.sun.management.jmxremote.port=9999 -Dcom.sun.management.jmxremote.rmi.port=9999 -Djava.rmi.server.hostname=localhost"'

# Test 2: Confluent Kafka
test_kafka_image "confluentinc/cp-kafka:7.4.0" "confluent" '
    - name: KAFKA_BROKER_ID
      value: "1"
    - name: KAFKA_ZOOKEEPER_CONNECT
      value: "zookeeper:2181"
    - name: KAFKA_ADVERTISED_LISTENERS
      value: "PLAINTEXT://localhost:9092"
    - name: KAFKA_LISTENERS
      value: "PLAINTEXT://0.0.0.0:9092"
    - name: KAFKA_JMX_PORT
      value: "9999"
    - name: KAFKA_JMX_HOSTNAME
      value: "localhost"
    - name: KAFKA_OPTS
      value: "-Djava.rmi.server.hostname=localhost"'

# Test 3: Strimzi Kafka
test_kafka_image "quay.io/strimzi/kafka:0.38.0-kafka-3.5.1" "strimzi" '
    - name: KAFKA_BROKER_ID
      value: "1"
    - name: KAFKA_ZOOKEEPER_CONNECT
      value: "zookeeper:2181"
    - name: KAFKA_LISTENERS
      value: "PLAINTEXT://:9092"
    - name: KAFKA_ADVERTISED_LISTENERS
      value: "PLAINTEXT://localhost:9092"
    - name: KAFKA_JMX_ENABLED
      value: "true"
    - name: KAFKA_JMX_PORT
      value: "9999"'

# Test 4: Apache Kafka (official)
test_kafka_image "apache/kafka:3.6.0" "apache" '
    - name: KAFKA_NODE_ID
      value: "1"
    - name: KAFKA_PROCESS_ROLES
      value: "broker"
    - name: KAFKA_LISTENERS
      value: "PLAINTEXT://:9092"
    - name: KAFKA_ADVERTISED_LISTENERS
      value: "PLAINTEXT://localhost:9092"
    - name: KAFKA_CONTROLLER_QUORUM_VOTERS
      value: "1@localhost:9093"
    - name: KAFKA_JMX_PORT
      value: "9999"
    - name: KAFKA_JMX_OPTS
      value: "-Dcom.sun.management.jmxremote=true -Dcom.sun.management.jmxremote.authenticate=false -Dcom.sun.management.jmxremote.ssl=false"'

echo -e "\n=== Image Testing Complete ==="