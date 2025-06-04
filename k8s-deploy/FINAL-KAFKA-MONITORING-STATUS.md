# Final Kafka Monitoring Status Report

## Current State

### Kafka Deployments
1. **Regular Kafka** (kafka namespace)
   - Running: kafka-0 (StatefulSet)
   - JMX: Enabled on port 9999 (no auth)
   - Status: ✅ Running

2. **Strimzi Kafka** (strimzi-kafka namespace)
   - Running: production-kafka-dual-role-0/1/2
   - JMX: Enabled on port 9999 (with auth)
   - Kafka Exporter: production-kafka-kafka-exporter
   - Status: ✅ Running

### Monitoring Attempts
1. **nri-kafka direct integration**
   - Result: Returns empty data despite successful JMX connections
   - Root Cause: RMI hostname resolution issues and data type parsing errors

2. **Debug Analysis Findings**
   - JMX connects successfully (966 MBeans found)
   - RMI fails due to "localhost" hostname in RMI stub
   - TimeUnit data types cannot be parsed by nri-kafka
   - Integration fails silently when encountering these issues

## Immediate Actions Required

### 1. Configure nri-prometheus for Strimzi Kafka

The Strimzi Kafka already has a Prometheus exporter running. Configure the existing nri-prometheus to scrape it:

```bash
# Edit the nri-prometheus configuration
kubectl edit configmap -n newrelic nri-bundle-nri-prometheus-config

# Add this scrape config:
scrape_configs:
- job_name: strimzi-kafka
  static_configs:
  - targets:
    - production-kafka-kafka-exporter.strimzi-kafka.svc.cluster.local:9308
    labels:
      kafka_cluster: strimzi-production
```

### 2. Deploy JMX Exporter for Regular Kafka

```bash
# Use the official Prometheus JMX exporter
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: jmx-config
  namespace: kafka
data:
  config.yaml: |
    hostPort: localhost:9999
    ssl: false
    lowercaseOutputName: true
    lowercaseOutputLabelNames: true
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kafka-prometheus-jmx
  namespace: kafka
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kafka-prometheus-jmx
  template:
    metadata:
      labels:
        app: kafka-prometheus-jmx
    spec:
      containers:
      - name: jmx-exporter
        image: bitnami/jmx-exporter:0.18.0
        ports:
        - containerPort: 5556
        env:
        - name: SERVICE_PORT
          value: "5556"
        args:
        - "5556"
        - /opt/bitnami/jmx-exporter/example_configs/kafka-2_8_0.yml
        - localhost:9999
EOF
```

## New Relic Queries to Verify

Once configured, check for metrics:

```sql
-- Check for Prometheus metrics
FROM Metric SELECT * WHERE job = 'strimzi-kafka' SINCE 1 hour ago

-- Check for any Kafka-related metrics
FROM Metric SELECT * WHERE metricName LIKE '%kafka%' SINCE 1 hour ago

-- Check integration status
FROM SystemSample SELECT * WHERE `integration.name` LIKE '%prometheus%' SINCE 1 hour ago
```

## Summary

- ❌ nri-kafka direct integration doesn't work due to RMI issues
- ✅ Strimzi Kafka has Prometheus exporter ready to use
- ✅ Regular Kafka can use JMX Exporter
- ✅ nri-prometheus is already running and can scrape both

The path forward is to use Prometheus exporters with the existing nri-prometheus integration for reliable Kafka monitoring in Kubernetes.