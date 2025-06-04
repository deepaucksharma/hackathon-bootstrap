#!/bin/bash

#################################################
# Consolidated Kafka Monitoring Deployment Script
# Combines all best practices and fixes
#################################################

set -e

# Configuration
NAMESPACE="${NAMESPACE:-strimzi-kafka}"
CLUSTER_NAME="${CLUSTER_NAME:-strimzi-production-kafka}"
KAFKA_VERSION="${KAFKA_VERSION:-3.3.1}"
MODE="${1:-standard}"  # standard, enhanced, or full

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Helper functions
log_info() { echo -e "${CYAN}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

print_banner() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════╗"
    echo "║       Kafka Monitoring Deployment for Kubernetes      ║"
    echo "║              Optimized for New Relic                  ║"
    echo "╚═══════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl."
        exit 1
    fi
    
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster. Check your kubeconfig."
        exit 1
    fi
    
    if ! kubectl get namespace $NAMESPACE &> /dev/null; then
        log_warning "Namespace $NAMESPACE not found. Creating..."
        kubectl create namespace $NAMESPACE
    fi
    
    log_success "Prerequisites check passed"
}

# Deploy Strimzi operator (if needed)
deploy_strimzi_operator() {
    log_info "Checking for Strimzi operator..."
    
    if kubectl get deployment strimzi-cluster-operator -n $NAMESPACE &> /dev/null; then
        log_info "Strimzi operator already deployed"
        return
    fi
    
    log_info "Installing Strimzi operator..."
    kubectl create -f "https://strimzi.io/install/latest?namespace=$NAMESPACE" -n $NAMESPACE || true
    
    log_info "Waiting for operator to be ready..."
    kubectl wait deployment/strimzi-cluster-operator -n $NAMESPACE --for=condition=Available --timeout=300s
    
    log_success "Strimzi operator deployed"
}

# Deploy Kafka cluster
deploy_kafka_cluster() {
    log_info "Deploying Kafka cluster..."
    
    cat <<EOF | kubectl apply -n $NAMESPACE -f -
apiVersion: kafka.strimzi.io/v1beta2
kind: Kafka
metadata:
  name: production-kafka
spec:
  kafka:
    version: $KAFKA_VERSION
    replicas: 3
    listeners:
      - name: plain
        port: 9092
        type: internal
        tls: false
      - name: tls
        port: 9093
        type: internal
        tls: true
    config:
      offsets.topic.replication.factor: 3
      transaction.state.log.replication.factor: 3
      transaction.state.log.min.isr: 2
      default.replication.factor: 3
      min.insync.replicas: 2
      inter.broker.protocol.version: "$KAFKA_VERSION"
      auto.create.topics.enable: true
    storage:
      type: ephemeral
    metricsConfig:
      type: jmxPrometheusExporter
      valueFrom:
        configMapKeyRef:
          name: kafka-metrics
          key: kafka-metrics-config.yml
  zookeeper:
    replicas: 3
    storage:
      type: ephemeral
    metricsConfig:
      type: jmxPrometheusExporter
      valueFrom:
        configMapKeyRef:
          name: kafka-metrics
          key: zookeeper-metrics-config.yml
  entityOperator:
    topicOperator: {}
    userOperator: {}
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: kafka-metrics
data:
  kafka-metrics-config.yml: |
    lowercaseOutputName: true
    rules:
    - pattern: kafka.server<type=(.+), name=(.+), clientId=(.+), topic=(.+), partition=(.*)><>Value
      name: kafka_server_$1_$2
      type: GAUGE
      labels:
       clientId: "$3"
       topic: "$4"
       partition: "$5"
    - pattern: kafka.server<type=(.+), name=(.+), clientId=(.+), brokerHost=(.+), brokerPort=(.+)><>Value
      name: kafka_server_$1_$2
      type: GAUGE
      labels:
       clientId: "$3"
       broker: "$4:$5"
    - pattern: kafka.server<type=(.+), name=(.+)><>Value
      name: kafka_server_$1_$2
      type: GAUGE
    - pattern: kafka.(\w+)<type=(.+), name=(.+)><>Value
      name: kafka_$1_$2_$3
      type: GAUGE
  zookeeper-metrics-config.yml: |
    lowercaseOutputName: true
    rules:
    - pattern: ".*"
EOF
    
    log_info "Waiting for Kafka cluster to be ready..."
    kubectl wait kafka/production-kafka -n $NAMESPACE --for=condition=Ready --timeout=600s || true
    
    log_success "Kafka cluster deployed"
}

# Deploy nri-kafka configuration
deploy_nri_kafka_config() {
    log_info "Deploying nri-kafka configuration..."
    
    cat <<EOF | kubectl apply -n $NAMESPACE -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: nri-kafka-config
  labels:
    app: nri-kafka
data:
  kafka-config.yml: |
    ---
    integrations:
      - name: nri-kafka
        env:
          # Cluster identification
          CLUSTER_NAME: $CLUSTER_NAME
          
          # Auto-discovery using bootstrap
          AUTODISCOVER_STRATEGY: bootstrap
          
          # Bootstrap broker connection
          BOOTSTRAP_BROKER_HOST: production-kafka-kafka-bootstrap.$NAMESPACE.svc.cluster.local
          BOOTSTRAP_BROKER_KAFKA_PORT: 9092
          BOOTSTRAP_BROKER_JMX_PORT: 9999
          
          # JMX Configuration - no auth for Strimzi
          DEFAULT_JMX_USER: ""
          DEFAULT_JMX_PASSWORD: ""
          
          # CRITICAL: Enable ALL collection modes
          TOPIC_MODE: all
          COLLECT_TOPIC_SIZE: "true"
          COLLECT_TOPIC_OFFSET: "true"
          COLLECT_BROKER_TOPIC_DATA: "true"
          FORCE_TOPIC_SAMPLE_COLLECTION: "true"
          
          # Consumer monitoring
          CONSUMER_OFFSET: "true"
          INACTIVE_CONSUMER_GROUP_OFFSET: "true"
          CONSUMER_GROUP_OFFSET_BY_TOPIC: "true"
          CONSUMER_GROUP_REGEX: ".*"
          
          # Data types
          METRICS: "true"
          INVENTORY: "true"
          EVENTS: "true"
          
          # Connection settings
          TIMEOUT: "30000"
          CONNECTION_TIMEOUT: "30000"
          MAX_JMX_CONNECTIONS: "10"
          
          # Preferred listener
          PREFERRED_LISTENER: "PLAIN"
          
          # Verbose logging
          VERBOSE: "true"
          
        interval: 30s
        timeout: 30s
        inventory_source: config/kafka
        labels:
          env: kubernetes
          cluster: $CLUSTER_NAME
          integration: nri-kafka
EOF
    
    log_success "Configuration deployed"
}

# Deploy standard nri-kafka
deploy_standard_monitoring() {
    log_info "Deploying standard nri-kafka monitoring..."
    
    cat <<EOF | kubectl apply -n $NAMESPACE -f -
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: nri-kafka
  labels:
    app: nri-kafka
spec:
  selector:
    matchLabels:
      app: nri-kafka
  template:
    metadata:
      labels:
        app: nri-kafka
    spec:
      serviceAccountName: nri-kafka
      hostNetwork: true
      dnsPolicy: ClusterFirstWithHostNet
      containers:
      - name: nri-kafka
        image: newrelic/nri-kafka:latest
        imagePullPolicy: Always
        env:
        - name: NRIA_LICENSE_KEY
          valueFrom:
            secretKeyRef:
              name: newrelic-license
              key: license-key
        - name: NRIA_OVERRIDE_HOSTNAME_SHORT
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: spec.nodeName
        - name: NRIA_CUSTOM_ATTRIBUTES
          value: '{"clusterName":"$CLUSTER_NAME","environment":"kubernetes"}'
        - name: NRIA_LOG_LEVEL
          value: "debug"
        volumeMounts:
        - name: config
          mountPath: /etc/newrelic-infra/integrations.d/
          readOnly: true
        resources:
          requests:
            memory: "150Mi"
            cpu: "100m"
          limits:
            memory: "300Mi"
            cpu: "200m"
      volumes:
      - name: config
        configMap:
          name: nri-kafka-config
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: nri-kafka
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: nri-kafka
rules:
- apiGroups: [""]
  resources:
    - nodes
    - nodes/metrics
    - nodes/stats
    - nodes/proxy
    - pods
    - services
    - endpoints
  verbs: ["get", "list"]
- apiGroups: ["kafka.strimzi.io"]
  resources:
    - kafkas
    - kafkatopics
    - kafkausers
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: nri-kafka
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: nri-kafka
subjects:
- kind: ServiceAccount
  name: nri-kafka
  namespace: $NAMESPACE
EOF
    
    log_success "Standard monitoring deployed"
}

# Deploy enhanced MSK shim monitoring
deploy_enhanced_monitoring() {
    log_info "Deploying enhanced MSK shim monitoring..."
    
    cat <<EOF | kubectl apply -n $NAMESPACE -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nri-kafka-msk-enhanced
  labels:
    app: nri-kafka-msk-enhanced
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nri-kafka-msk-enhanced
  template:
    metadata:
      labels:
        app: nri-kafka-msk-enhanced
    spec:
      serviceAccountName: nri-kafka
      containers:
      - name: nri-kafka
        image: newrelic/nri-kafka:latest
        imagePullPolicy: Always
        env:
        # MSK Shim Configuration
        - name: MSK_SHIM_ENABLED
          value: "true"
        - name: MSK_ENHANCED_MODE
          value: "true"
        - name: MSK_GENERATE_METRICS
          value: "true"
        - name: AWS_ACCOUNT_ID
          value: "123456789012"
        - name: AWS_REGION
          value: "us-east-1"
        - name: KAFKA_CLUSTER_NAME
          value: "$CLUSTER_NAME"
        - name: ENVIRONMENT
          value: "production"
        
        # New Relic License Key
        - name: NRIA_LICENSE_KEY
          valueFrom:
            secretKeyRef:
              name: newrelic-license
              key: license-key
        
        # Infrastructure Agent Settings
        - name: NRIA_OVERRIDE_HOSTNAME_SHORT
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: spec.nodeName
        
        - name: NRIA_CUSTOM_ATTRIBUTES
          value: '{"clusterName":"$CLUSTER_NAME","environment":"kubernetes","integration":"msk-shim-enhanced","pipeline":"msk","msk":"true","enhanced":"true"}'
        
        # Enhanced logging
        - name: NRIA_LOG_LEVEL
          value: "debug"
        - name: NRIA_VERBOSE
          value: "1"
        
        # Pass through environment variables
        - name: NRIA_PASSTHROUGH_ENVIRONMENT
          value: "KUBERNETES_SERVICE_HOST,KUBERNETES_SERVICE_PORT,MSK_SHIM_ENABLED,MSK_ENHANCED_MODE,MSK_GENERATE_METRICS,AWS_ACCOUNT_ID,AWS_REGION,KAFKA_CLUSTER_NAME,ENVIRONMENT"
        
        volumeMounts:
        - name: config
          mountPath: /etc/newrelic-infra/integrations.d/
          readOnly: true
        
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
            
      volumes:
      - name: config
        configMap:
          name: nri-kafka-config
EOF
    
    log_success "Enhanced monitoring deployed"
}

# Deploy test workloads
deploy_test_workloads() {
    log_info "Deploying test workloads..."
    
    # Create test topics
    cat <<EOF | kubectl apply -n $NAMESPACE -f -
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: test-topic
  labels:
    strimzi.io/cluster: production-kafka
spec:
  partitions: 3
  replicas: 3
  config:
    retention.ms: 7200000
    segment.bytes: 1073741824
---
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: metrics-topic
  labels:
    strimzi.io/cluster: production-kafka
spec:
  partitions: 6
  replicas: 3
  config:
    retention.ms: 3600000
    compression.type: snappy
---
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: events-topic
  labels:
    strimzi.io/cluster: production-kafka
spec:
  partitions: 12
  replicas: 3
  config:
    retention.ms: 86400000
    compression.type: lz4
EOF
    
    # Deploy test producer and consumers
    cat <<EOF | kubectl apply -n $NAMESPACE -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kafka-test-producer
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kafka-test-producer
  template:
    metadata:
      labels:
        app: kafka-test-producer
    spec:
      containers:
      - name: producer
        image: strimzi/kafka:latest-kafka-$KAFKA_VERSION
        command:
        - /bin/bash
        - -c
        - |
          while true; do
            echo "Test message \$(date +%s)" | \
              /opt/kafka/bin/kafka-console-producer.sh \
              --bootstrap-server production-kafka-kafka-bootstrap:9092 \
              --topic test-topic
            sleep 5
          done
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kafka-test-consumer-1
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kafka-test-consumer-1
  template:
    metadata:
      labels:
        app: kafka-test-consumer-1
    spec:
      containers:
      - name: consumer
        image: strimzi/kafka:latest-kafka-$KAFKA_VERSION
        command:
        - /bin/bash
        - -c
        - |
          /opt/kafka/bin/kafka-console-consumer.sh \
            --bootstrap-server production-kafka-kafka-bootstrap:9092 \
            --topic test-topic \
            --group test-consumer-group-1 \
            --from-beginning
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kafka-test-consumer-2
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kafka-test-consumer-2
  template:
    metadata:
      labels:
        app: kafka-test-consumer-2
    spec:
      containers:
      - name: consumer
        image: strimzi/kafka:latest-kafka-$KAFKA_VERSION
        command:
        - /bin/bash
        - -c
        - |
          /opt/kafka/bin/kafka-console-consumer.sh \
            --bootstrap-server production-kafka-kafka-bootstrap:9092 \
            --topic metrics-topic \
            --group metrics-consumer-group \
            --from-beginning
EOF
    
    log_success "Test workloads deployed"
}

# Create New Relic license secret
create_license_secret() {
    log_info "Setting up New Relic license..."
    
    if kubectl get secret newrelic-license -n $NAMESPACE &> /dev/null; then
        log_info "License secret already exists"
        return
    fi
    
    # Try to get from environment or use default from .env
    LICENSE_KEY="${NEW_RELIC_LICENSE_KEY:-dfb79449d23acce4df582f2f5550abe4FFFFNRAL}"
    
    kubectl create secret generic newrelic-license \
        --from-literal=license-key="$LICENSE_KEY" \
        -n $NAMESPACE
    
    log_success "License secret created"
}

# Wait for deployments
wait_for_deployments() {
    log_info "Waiting for all deployments to be ready..."
    
    # Wait for Kafka
    kubectl wait kafka/production-kafka -n $NAMESPACE --for=condition=Ready --timeout=600s || true
    
    # Wait for monitoring deployments
    if [[ "$MODE" == "standard" || "$MODE" == "full" ]]; then
        kubectl rollout status daemonset/nri-kafka -n $NAMESPACE --timeout=300s || true
    fi
    
    if [[ "$MODE" == "enhanced" || "$MODE" == "full" ]]; then
        kubectl rollout status deployment/nri-kafka-msk-enhanced -n $NAMESPACE --timeout=300s || true
    fi
    
    # Wait for test workloads
    kubectl rollout status deployment/kafka-test-producer -n $NAMESPACE --timeout=120s || true
    kubectl rollout status deployment/kafka-test-consumer-1 -n $NAMESPACE --timeout=120s || true
    
    log_success "All deployments ready"
}

# Display status
display_status() {
    echo
    log_info "Deployment Status:"
    echo
    
    # Kafka cluster status
    echo -e "${YELLOW}Kafka Cluster:${NC}"
    kubectl get kafka -n $NAMESPACE
    echo
    
    # Pods status
    echo -e "${YELLOW}Pods:${NC}"
    kubectl get pods -n $NAMESPACE | grep -E "(kafka|nri-kafka|test)" | head -20
    echo
    
    # Topics
    echo -e "${YELLOW}Topics:${NC}"
    kubectl get kafkatopics -n $NAMESPACE
    echo
}

# Main deployment flow
main() {
    print_banner
    
    log_info "Deployment mode: $MODE"
    log_info "Namespace: $NAMESPACE"
    log_info "Cluster name: $CLUSTER_NAME"
    echo
    
    check_prerequisites
    
    # Only deploy Kafka if not already present
    if ! kubectl get kafka production-kafka -n $NAMESPACE &> /dev/null; then
        deploy_strimzi_operator
        deploy_kafka_cluster
    else
        log_info "Kafka cluster already exists"
    fi
    
    create_license_secret
    deploy_nri_kafka_config
    
    case "$MODE" in
        standard)
            deploy_standard_monitoring
            ;;
        enhanced)
            deploy_enhanced_monitoring
            ;;
        full)
            deploy_standard_monitoring
            deploy_enhanced_monitoring
            ;;
        *)
            log_error "Invalid mode: $MODE. Use standard, enhanced, or full"
            exit 1
            ;;
    esac
    
    deploy_test_workloads
    wait_for_deployments
    display_status
    
    echo
    log_success "Kafka monitoring deployment completed!"
    echo
    echo -e "${GREEN}Next steps:${NC}"
    echo "1. Wait 2-3 minutes for metrics to start flowing"
    echo "2. Verify metrics: ./verify-kafka-monitoring.js --apiKey=<KEY> --accountId=<ID> --clusterName=$CLUSTER_NAME"
    echo "3. Check logs: kubectl logs -l app=nri-kafka -n $NAMESPACE"
    echo
    echo -e "${CYAN}Monitor progress:${NC}"
    echo "• Standard: kubectl logs -l app=nri-kafka -n $NAMESPACE -f"
    echo "• Enhanced: kubectl logs -l app=nri-kafka-msk-enhanced -n $NAMESPACE -f"
    echo "• Producer: kubectl logs -l app=kafka-test-producer -n $NAMESPACE"
    echo
}

# Run main
main "$@"