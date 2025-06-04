# Kafka Monitoring Solution Summary

## Problem Analysis

After extensive debugging, we've identified the core issues preventing nri-kafka from collecting metrics:

### 1. RMI Hostname Resolution Issue
- JMX connection succeeds initially
- RMI negotiation fails because Kafka returns "localhost" as the RMI hostname
- External clients cannot resolve "localhost" to the correct pod

### 2. Data Type Parsing Errors
- Kafka 3.5 uses `java.util.concurrent.TimeUnit` enums for certain attributes
- nri-kafka cannot parse these data types
- Results in warnings but shouldn't prevent all metric collection

### 3. Integration Behavior
- Despite successful JMX connections, nri-kafka returns empty data
- The integration appears to fail silently when encountering parsing errors

## Working Solutions

### Solution 1: Use Strimzi's Built-in Kafka Exporter

For the Strimzi Kafka deployment, there's already a Prometheus exporter running:

```bash
# Port forward to test
kubectl port-forward -n strimzi-kafka deployment/production-kafka-kafka-exporter 9308:9308

# Check metrics
curl http://localhost:9308/metrics | grep kafka_
```

Configure nri-prometheus to scrape these metrics:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nri-prometheus-config
  namespace: newrelic
data:
  config.yaml: |
    scrape_configs:
    - job_name: strimzi-kafka
      static_configs:
      - targets:
        - production-kafka-kafka-exporter.strimzi-kafka.svc.cluster.local:9308
```

### Solution 2: Deploy JMX Exporter for Regular Kafka

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: kafka-jmx-exporter-config
  namespace: kafka
data:
  config.yml: |
    startDelaySeconds: 0
    hostPort: localhost:9999
    ssl: false
    lowercaseOutputName: true
    lowercaseOutputLabelNames: true
    
    whitelistObjectNames:
    - "kafka.server:type=BrokerTopicMetrics,*"
    - "kafka.controller:type=KafkaController,*"
    - "kafka.server:type=KafkaRequestHandlerPool,*"
    - "kafka.network:type=RequestMetrics,*"
    - "kafka.server:type=KafkaServer,*"
    - "kafka.log:type=LogManager,*"
    
    blacklistObjectNames:
    - "kafka.server:type=*,name=*PerSec*,topic=*,partition=*"
    
    rules:
    - pattern: kafka.server<type=(.+), name=(.+), clientId=(.+), topic=(.+), partition=(.*)><>Value
      name: kafka_server_$1_$2
      type: GAUGE
      labels:
        clientId: "$3"
        topic: "$4"
        partition: "$5"
    - pattern: kafka.server<type=(.+), name=(.+), topic=(.+), partition=(.*)><>Value
      name: kafka_server_$1_$2
      type: GAUGE
      labels:
        topic: "$3"
        partition: "$4"
    - pattern: kafka.server<type=(.+), name=(.+)><>Value
      name: kafka_server_$1_$2
      type: GAUGE
    - pattern: kafka.(\w+)<type=(.+), name=(.+)><>Value
      name: kafka_$1_$2_$3
      type: GAUGE
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kafka-jmx-prometheus
  namespace: kafka
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kafka-jmx-prometheus
  template:
    metadata:
      labels:
        app: kafka-jmx-prometheus
    spec:
      containers:
      - name: kafka
        image: bitnami/kafka:3.5.1
        ports:
        - containerPort: 9092
        - containerPort: 9999
        env:
        - name: KAFKA_CFG_BROKER_ID
          value: "500"
        - name: KAFKA_CFG_LISTENERS
          value: PLAINTEXT://:9092
        - name: KAFKA_CFG_ADVERTISED_LISTENERS
          value: PLAINTEXT://kafka-jmx-prometheus:9092
        - name: KAFKA_CFG_ZOOKEEPER_CONNECT
          value: zookeeper:2181
        - name: JMX_PORT
          value: "9999"
        - name: KAFKA_JMX_OPTS
          value: "-Dcom.sun.management.jmxremote -Dcom.sun.management.jmxremote.authenticate=false -Dcom.sun.management.jmxremote.ssl=false -Dcom.sun.management.jmxremote.port=9999 -Dcom.sun.management.jmxremote.rmi.port=9999 -Djava.rmi.server.hostname=localhost"
      
      - name: jmx-exporter
        image: prom/jmx_exporter:0.19.0
        ports:
        - containerPort: 9308
          name: metrics
        command:
        - java
        - -jar
        - /jmx_prometheus_httpserver.jar
        - "9308"
        - /etc/jmx-exporter/config.yml
        volumeMounts:
        - name: config
          mountPath: /etc/jmx-exporter
      volumes:
      - name: config
        configMap:
          name: kafka-jmx-exporter-config
```

### Solution 3: Use OpenTelemetry Collector

Deploy OpenTelemetry Collector with Kafka receiver:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: otel-collector-config
  namespace: newrelic
data:
  config.yaml: |
    receivers:
      kafkametrics:
        brokers:
          - kafka-0.kafka-headless.kafka.svc.cluster.local:9092
        protocol_version: 3.5.0
        scrapers:
          - brokers
          - topics
          - consumers
    
    processors:
      batch:
        timeout: 10s
    
    exporters:
      otlp:
        endpoint: otlp.nr-data.net:4317
        headers:
          api-key: ${NEW_RELIC_LICENSE_KEY}
    
    service:
      pipelines:
        metrics:
          receivers: [kafkametrics]
          processors: [batch]
          exporters: [otlp]
```

## Recommended Approach

1. **For Strimzi Kafka**: Use the existing Kafka Exporter with nri-prometheus
2. **For Regular Kafka**: Deploy JMX Exporter as a sidecar
3. **Alternative**: Use OpenTelemetry Collector for both

## Verification

After implementing one of these solutions, verify metrics in New Relic:

```sql
-- Prometheus metrics
FROM Metric SELECT * WHERE metricName LIKE 'kafka_%' SINCE 1 hour ago

-- OpenTelemetry metrics
FROM Metric SELECT * WHERE otel.scope.name = 'otelcol/kafkametricsreceiver' SINCE 1 hour ago
```

## Conclusion

The nri-kafka integration has known issues with:
- RMI hostname resolution in Kubernetes
- Parsing newer Kafka metric data types
- Silent failures when encountering errors

Using Prometheus exporters or OpenTelemetry provides more reliable Kafka monitoring in Kubernetes environments.