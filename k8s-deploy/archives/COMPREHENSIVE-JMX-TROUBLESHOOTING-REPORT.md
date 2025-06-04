# Comprehensive JMX Troubleshooting Report

## Executive Summary

After extensive testing and troubleshooting of JMX connectivity for nri-kafka in Kubernetes, we have identified the core issues and confirmed working solutions.

### ✅ Key Findings

1. **JMX is working** - The JMX/RMI connection successfully establishes when using the correct hostname
2. **StatefulSet DNS works** - Using `kafka-0.kafka-headless.kafka.svc.cluster.local` allows successful JMX connections
3. **Sidecar pattern works** - Localhost connections from sidecar containers bypass RMI hostname issues
4. **Integration returns empty data** - Despite successful JMX connections, nri-kafka returns empty data arrays

## Detailed Analysis

### 1. Current Deployment Status

```
NAME                                      READY   STATUS    RESTARTS
kafka-0                                   1/1     Running   0          StatefulSet with stable DNS
kafka-with-nri-sidecar-78f6f9cf76-f5whd   2/2     Running   0          Sidecar pattern deployment
zookeeper-689d5d6fd6-pfkzn                1/1     Running   0          ZooKeeper instance
```

### 2. JMX Configuration Analysis

#### StatefulSet Pod (kafka-0)
- **JMX Port**: 9999 (confirmed)
- **RMI Hostname**: `kafka-0.kafka-headless.kafka.svc.cluster.local`
- **JMX Options**: Authentication disabled, SSL disabled, RMI port specified
- **Environment Variables**:
  ```
  JMX_PORT=9999
  KAFKA_JMX_OPTS=-Dcom.sun.management.jmxremote -Dcom.sun.management.jmxremote.authenticate=false -Dcom.sun.management.jmxremote.ssl=false -Dcom.sun.management.jmxremote.port=9999 -Dcom.sun.management.jmxremote.rmi.port=9999 -Djava.rmi.server.hostname=kafka-0.kafka-headless.kafka.svc.cluster.local
  ```

### 3. Connectivity Test Results

#### ✅ Successful Tests

1. **TCP Connectivity**
   - Port 9999 is open and accessible
   - Connection established from diagnostic pod to Kafka

2. **JMX/RMI Connection**
   - Successfully connected using full FQDN
   - Retrieved MBean count: 966
   - Found Kafka MBeans (topics, partitions, etc.)

3. **RMI Registry**
   - Registry accessible at port 9999
   - Found `jmxrmi` entry of type `RMIServerImpl_Stub`

4. **Sidecar Connectivity**
   - Localhost connection from sidecar: SUCCESS
   - Port 9999 accessible via localhost/::1

#### ❌ Failed Tests

1. **nri-kafka Data Collection**
   - Integration runs successfully but returns empty data
   - This occurs even with working JMX connections

2. **Different Kafka Images**
   - Bitnami Kafka: JMX port not listening (configuration issue)
   - Confluent Kafka: JMX port not listening
   - Strimzi Kafka: JMX port not listening
   - Apache Kafka: JMX port not listening

### 4. Root Cause Analysis

#### Primary Issue: nri-kafka Integration Behavior

Despite successful JMX connections, the nri-kafka integration returns empty data. This suggests:

1. **Integration Logic Issue**: The integration may require specific Kafka configurations or versions
2. **Bootstrap Discovery**: The autodiscovery mechanism might not be finding all brokers
3. **Metric Collection**: The integration might be filtering out metrics or encountering parsing issues

#### Secondary Issue: JMX Configuration Complexity

Different Kafka distributions require different JMX configurations:
- Bitnami uses `JMX_PORT` and `KAFKA_JMX_OPTS`
- Confluent uses `KAFKA_JMX_PORT` and `KAFKA_JMX_HOSTNAME`
- Each has different startup scripts and configuration mechanisms

### 5. Working Solutions

#### Solution 1: StatefulSet with Stable DNS
```yaml
# Works with proper DNS resolution
- name: KAFKA_JMX_OPTS
  value: "-Djava.rmi.server.hostname=kafka-0.kafka-headless.kafka.svc.cluster.local"
```

#### Solution 2: Sidecar Pattern
```yaml
# Bypasses RMI hostname issues
- name: KAFKA_JMX_OPTS
  value: "-Djava.rmi.server.hostname=localhost"
```

### 6. Recommendations

#### Immediate Actions

1. **Check New Relic UI** for any incoming Kafka metrics
2. **Enable debug logging** in nri-kafka for more detailed output
3. **Test with different nri-kafka versions** if available

#### Alternative Approaches

1. **Prometheus JMX Exporter**
   - Deploy JMX exporter as sidecar
   - Use nri-prometheus to collect metrics
   - More reliable in Kubernetes environments

2. **Direct Kafka Metrics API**
   - Use Kafka's metrics reporter API
   - Push metrics directly to New Relic

3. **OpenTelemetry Collector**
   - Use Kafka receiver
   - Export to New Relic OTLP endpoint

### 7. Verification Commands

```bash
# Check if metrics are being sent to New Relic
kubectl logs -n newrelic nri-kafka-monitor-kgtc5 | grep -E "metric|data|error"

# Test JMX from diagnostic pod
kubectl exec -n kafka jmx-network-diagnostic -c jmx-tools -- \
  /scripts/test-jmx-connection.sh kafka-0.kafka-headless.kafka.svc.cluster.local 9999

# Check integration health
kubectl exec -n kafka kafka-with-nri-sidecar-78f6f9cf76-f5whd -c nri-kafka -- \
  /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
  --cluster_name test --bootstrap_broker_host localhost \
  --bootstrap_broker_jmx_port 9999 --verbose --metrics
```

### 8. New Relic Queries

```sql
-- Check for any Kafka data
FROM KafkaBrokerSample SELECT * WHERE clusterName = 'k8s-kafka-cluster' SINCE 1 hour ago

-- Check integration execution
FROM SystemSample SELECT * WHERE `integration.name` = 'nri-kafka' SINCE 1 hour ago

-- Check for errors
FROM InfrastructureError SELECT * WHERE message LIKE '%kafka%' SINCE 1 hour ago
```

## Conclusion

JMX connectivity is successfully established in our Kubernetes environment using both StatefulSet DNS and sidecar patterns. However, the nri-kafka integration is not collecting metrics despite successful connections. This appears to be an integration-specific issue rather than a JMX/RMI problem.

The recommended path forward is to:
1. Use alternative monitoring solutions (Prometheus JMX Exporter)
2. Investigate nri-kafka debug logs for specific collection issues
3. Consider using Kafka's native metrics reporting capabilities

---
Generated: $(date)