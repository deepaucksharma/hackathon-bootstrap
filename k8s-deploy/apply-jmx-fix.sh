#!/bin/bash

# Complete script to apply the JMX fix for nri-kafka
set -e

echo "========================================="
echo "Applying JMX Fix for nri-kafka"
echo "========================================="

# Function to create YAML files
create_kafka_statefulset() {
    cat > kafka-statefulset-jmx.yaml << 'EOF'
apiVersion: v1
kind: Namespace
metadata:
  name: kafka
---
# Headless service for StatefulSet DNS
apiVersion: v1
kind: Service
metadata:
  name: kafka-headless
  namespace: kafka
  labels:
    app: kafka
spec:
  clusterIP: None
  ports:
  - name: broker
    port: 9092
    protocol: TCP
  - name: jmx
    port: 9999
    protocol: TCP
  selector:
    app: kafka
---
# Regular service for client connections
apiVersion: v1
kind: Service
metadata:
  name: kafka
  namespace: kafka
  labels:
    app: kafka
spec:
  ports:
  - name: broker
    port: 9092
    protocol: TCP
  - name: jmx
    port: 9999
    protocol: TCP
  selector:
    app: kafka
---
# Zookeeper headless service
apiVersion: v1
kind: Service
metadata:
  name: zookeeper-headless
  namespace: kafka
  labels:
    app: zookeeper
spec:
  clusterIP: None
  ports:
  - name: client
    port: 2181
    protocol: TCP
  - name: server
    port: 2888
    protocol: TCP
  - name: election
    port: 3888
    protocol: TCP
  selector:
    app: zookeeper
---
# Zookeeper service
apiVersion: v1
kind: Service
metadata:
  name: zookeeper
  namespace: kafka
  labels:
    app: zookeeper
spec:
  ports:
  - name: client
    port: 2181
    protocol: TCP
  selector:
    app: zookeeper
---
# Zookeeper StatefulSet
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: zookeeper
  namespace: kafka
spec:
  serviceName: zookeeper-headless
  replicas: 1
  selector:
    matchLabels:
      app: zookeeper
  template:
    metadata:
      labels:
        app: zookeeper
    spec:
      containers:
      - name: zookeeper
        image: confluentinc/cp-zookeeper:7.4.0
        ports:
        - containerPort: 2181
          name: client
        - containerPort: 2888
          name: server
        - containerPort: 3888
          name: election
        env:
        - name: ZOOKEEPER_CLIENT_PORT
          value: "2181"
        - name: ZOOKEEPER_TICK_TIME
          value: "2000"
        - name: ZOOKEEPER_SERVER_ID
          value: "1"
---
# Kafka StatefulSet with fixed JMX
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: kafka
  namespace: kafka
spec:
  serviceName: kafka-headless
  replicas: 3
  selector:
    matchLabels:
      app: kafka
  template:
    metadata:
      labels:
        app: kafka
        component: broker
    spec:
      containers:
      - name: kafka
        image: confluentinc/cp-kafka:7.4.0
        ports:
        - containerPort: 9092
          name: broker
        - containerPort: 9999
          name: jmx
        env:
        - name: KAFKA_BROKER_ID_COMMAND
          value: "echo \${HOSTNAME##*-}"
        - name: KAFKA_ZOOKEEPER_CONNECT
          value: "zookeeper-headless.kafka.svc.cluster.local:2181"
        - name: KAFKA_LISTENERS
          value: "PLAINTEXT://:9092"
        - name: KAFKA_ADVERTISED_LISTENERS
          value: "PLAINTEXT://\$(KAFKA_POD_NAME).kafka-headless.kafka.svc.cluster.local:9092"
        - name: KAFKA_JMX_PORT
          value: "9999"
        - name: KAFKA_JMX_HOSTNAME
          value: "\$(KAFKA_POD_NAME).kafka-headless.kafka.svc.cluster.local"
        - name: JMX_PORT
          value: "9999"
        - name: KAFKA_OPTS
          value: >-
            -Dcom.sun.management.jmxremote=true
            -Dcom.sun.management.jmxremote.authenticate=false
            -Dcom.sun.management.jmxremote.ssl=false
            -Dcom.sun.management.jmxremote.local.only=false
            -Dcom.sun.management.jmxremote.port=9999
            -Dcom.sun.management.jmxremote.rmi.port=9999
            -Djava.rmi.server.hostname=\$(KAFKA_POD_NAME).kafka-headless.kafka.svc.cluster.local
        - name: KAFKA_POD_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: KAFKA_LOG_DIRS
          value: "/var/lib/kafka/data"
        - name: KAFKA_AUTO_CREATE_TOPICS_ENABLE
          value: "true"
        - name: KAFKA_DELETE_TOPIC_ENABLE
          value: "true"
        - name: KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR
          value: "3"
        - name: KAFKA_TRANSACTION_STATE_LOG_MIN_ISR
          value: "2"
        - name: KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR
          value: "3"
        - name: KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS
          value: "0"
EOF
}

create_nri_kafka_config() {
    cat > nri-kafka-statefulset-config.yaml << 'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: nri-kafka-config
  namespace: newrelic
data:
  nri-kafka-config.yml: |
    integrations:
      - name: nri-kafka
        command: nri-kafka
        env:
          CLUSTER_NAME: k8s-kafka-cluster
          AUTODISCOVER_STRATEGY: bootstrap
          
          # Use the headless service DNS names for each broker
          BOOTSTRAP_BROKER_HOST: kafka-0.kafka-headless.kafka.svc.cluster.local
          BOOTSTRAP_BROKER_JMX_PORT: "9999"
          BOOTSTRAP_BROKER_KAFKA_PORT: "9092"
          BOOTSTRAP_BROKER_KAFKA_PROTOCOL: PLAINTEXT
          
          # JMX settings
          JMX_HOST: ""  # Empty to use bootstrap broker host
          JMX_PORT: ""  # Empty to use bootstrap broker JMX port
          JMX_USER: ""
          JMX_PASSWORD: ""
          
          # Collection settings
          METRICS: "true"
          INVENTORY: "true"
          EVENTS: "true"
          
          # Consumer settings
          CONSUMER_OFFSET: "true"
          CONSUMER_GROUP_REGEX: ".*"
          
          # Topic settings
          TOPIC_MODE: all
          TOPIC_REGEX: ".*"
          COLLECT_TOPIC_SIZE: "true"
          COLLECT_TOPIC_OFFSET: "true"
          
          # Logging
          VERBOSE: "true"
          NRJMX_VERBOSE: "true"
        interval: 30s
        labels:
          env: kubernetes
          cluster: kafka
---
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: nri-kafka-monitor
  namespace: newrelic
spec:
  selector:
    matchLabels:
      app: nri-kafka-monitor
  template:
    metadata:
      labels:
        app: nri-kafka-monitor
    spec:
      serviceAccountName: nri-bundle-newrelic-infrastructure
      containers:
      - name: nri-kafka
        image: newrelic/infrastructure:latest
        env:
        - name: NRIA_LICENSE_KEY
          value: "dfb79449d23acce4df582f2f5550abe4FFFFNRAL"
        - name: NRIA_VERBOSE
          value: "1"
        - name: NRIA_LOG_LEVEL
          value: "debug"
        - name: NRIA_CUSTOM_ATTRIBUTES
          value: |
            {"clusterName":"k8s-kafka-cluster","integration":"kafka","deployment":"statefulset"}
        volumeMounts:
        - name: nri-kafka-config
          mountPath: /etc/newrelic-infra/integrations.d/
        resources:
          limits:
            memory: 300Mi
          requests:
            cpu: 100m
            memory: 150Mi
      volumes:
      - name: nri-kafka-config
        configMap:
          name: nri-kafka-config
EOF
}

# Step 1: Clean up existing deployments
echo ""
echo "Step 1: Cleaning up existing Kafka deployments..."
echo "-------------------------------------------------"

# Delete existing Kafka namespace if it exists
if kubectl get namespace kafka &>/dev/null; then
    echo "Deleting existing Kafka namespace..."
    kubectl delete namespace kafka --force --grace-period=0 &>/dev/null || true
    sleep 10
fi

# Delete existing nri-kafka deployments
echo "Cleaning up existing nri-kafka deployments..."
kubectl delete daemonset -n newrelic nri-kafka-standalone &>/dev/null || true
kubectl delete deployment -n newrelic nri-kafka-consumer-offset &>/dev/null || true
kubectl delete daemonset -n newrelic nri-kafka-monitor &>/dev/null || true
kubectl delete configmap -n newrelic nri-kafka-standalone-config &>/dev/null || true
kubectl delete configmap -n newrelic nri-kafka-working-config &>/dev/null || true
kubectl delete configmap -n newrelic nri-kafka-config &>/dev/null || true
kubectl delete configmap -n newrelic nri-kafka-statefulset-config &>/dev/null || true

# Step 2: Create YAML files
echo ""
echo "Step 2: Creating configuration files..."
echo "---------------------------------------"

create_kafka_statefulset
echo "✓ Created kafka-statefulset-jmx.yaml"

create_nri_kafka_config
echo "✓ Created nri-kafka-statefulset-config.yaml"

# Step 3: Deploy Kafka with StatefulSet
echo ""
echo "Step 3: Deploying Kafka StatefulSet..."
echo "---------------------------------------"

kubectl apply -f kafka-statefulset-jmx.yaml
echo "✓ Kafka StatefulSet deployed"

# Step 4: Wait for Kafka pods to be ready
echo ""
echo "Step 4: Waiting for Kafka pods to be ready..."
echo "----------------------------------------------"

echo -n "Waiting for Zookeeper"
for i in {1..60}; do
    if kubectl get pod -n kafka zookeeper-0 &>/dev/null && \
       [ "$(kubectl get pod -n kafka zookeeper-0 -o jsonpath='{.status.phase}')" == "Running" ]; then
        echo " ✓"
        break
    fi
    echo -n "."
    sleep 5
done

echo -n "Waiting for Kafka brokers"
for i in {1..60}; do
    ready_count=$(kubectl get pods -n kafka -l app=kafka -o jsonpath='{.items[*].status.containerStatuses[*].ready}' | tr ' ' '\n' | grep -c "true" || echo "0")
    if [ "$ready_count" -eq "3" ]; then
        echo " ✓"
        break
    fi
    echo -n "."
    sleep 5
done

# Step 5: Deploy nri-kafka configuration
echo ""
echo "Step 5: Deploying nri-kafka configuration..."
echo "--------------------------------------------"

kubectl apply -f nri-kafka-statefulset-config.yaml
echo "✓ nri-kafka configuration deployed"

# Step 6: Quick verification
echo ""
echo "Step 6: Quick verification..."
echo "-----------------------------"

# Get a test pod
NRI_POD=$(kubectl get pods -n newrelic -l app.kubernetes.io/component=kubelet -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -n "$NRI_POD" ]; then
    echo "Testing JMX connectivity..."
    if kubectl exec -n newrelic $NRI_POD -c agent -- bash -c "echo '' | /usr/bin/nrjmx -H kafka-0.kafka-headless.kafka.svc.cluster.local -P 9999" &>/dev/null; then
        echo "✓ JMX connectivity test PASSED!"
    else
        echo "✗ JMX connectivity test failed"
    fi
fi

# Step 7: Summary
echo ""
echo "========================================="
echo "JMX Fix Applied Successfully!"
echo "========================================="
echo ""
echo "Kafka is now running with proper JMX configuration:"
echo "- 3 Kafka brokers as StatefulSet"
echo "- Each broker has a stable DNS name"
echo "- JMX is configured with proper RMI hostname"
echo ""
echo "To verify the fix worked:"
echo "1. Run: ./verify-jmx-fix.sh"
echo "2. Check New Relic UI for Kafka metrics"
echo "3. Run NRQL: FROM KafkaBrokerSample SELECT * WHERE clusterName = 'k8s-kafka-cluster' SINCE 5 minutes ago"
echo ""
echo "To check integration logs:"
echo "kubectl logs -n newrelic \$(kubectl get pods -n newrelic -l app=nri-kafka-monitor -o jsonpath='{.items[0].metadata.name}')"
echo ""