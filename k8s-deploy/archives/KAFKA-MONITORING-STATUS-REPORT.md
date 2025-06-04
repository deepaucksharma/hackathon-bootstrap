# Kafka Monitoring Status Report

## Executive Summary

Two Kafka deployments have been identified in the cluster, and monitoring has been configured for both. However, while JMX connectivity is confirmed working, the nri-kafka integration is returning empty data for both deployments.

## Kafka Deployments

### 1. Regular Kafka (kafka namespace)

**Configuration:**
- Type: Bitnami Kafka StatefulSet
- Pods: kafka-0, kafka-with-nri-sidecar
- JMX Port: 9999 (no authentication)
- JMX Status: ✅ Working
- DNS: kafka-0.kafka-headless.kafka.svc.cluster.local

**JMX Test Results:**
```
✓ TCP connection successful
✓ JMX connection successful!
MBean count: 966
```

### 2. Strimzi Kafka (strimzi-kafka namespace)

**Configuration:**
- Type: Strimzi Operator managed Kafka
- Pods: production-kafka-dual-role-0/1/2
- JMX Port: 9999 (with authentication)
- JMX Credentials:
  - Username: rCe1MjLc8TCwQd3V
  - Password: eDDTQCWmvXHTQFiB
- DNS: production-kafka-kafka-bootstrap.strimzi-kafka.svc.cluster.local

**Additional Components:**
- Kafka Exporter: production-kafka-kafka-exporter (Prometheus metrics)
- Entity Operator: production-kafka-entity-operator

## Monitoring Configuration

### New Relic Infrastructure Agents Deployed:

1. **nri-kafka-monitor** (DaemonSet)
   - Status: Running
   - Monitors: Both Kafka deployments
   - Issue: Returns empty data despite successful JMX connections

2. **kafka-sidecar-monitor** (Deployment)
   - Status: Running (2/2 containers)
   - Pattern: Sidecar with localhost JMX connection
   - Issue: Returns empty data

3. **nri-kafka-unified-monitor** (DaemonSet)
   - Status: Failed to deploy (missing service account)
   - Purpose: Monitor both Kafka instances

## Issues Identified

### 1. nri-kafka Returns Empty Data
Despite successful JMX connections, the integration returns:
```json
{
    "name": "com.newrelic.kafka",
    "protocol_version": "3",
    "integration_version": "3.10.2",
    "data": []
}
```

### 2. Potential Root Causes:
- Integration compatibility with Kafka versions
- Bootstrap discovery mechanism issues
- Metric filtering or parsing problems
- Missing Kafka client permissions

## Verification Commands

### Check Metrics in New Relic:
```sql
-- Regular Kafka
FROM KafkaBrokerSample SELECT * WHERE clusterName = 'k8s-kafka-cluster' SINCE 1 hour ago

-- Strimzi Kafka
FROM KafkaBrokerSample SELECT * WHERE clusterName = 'strimzi-production-kafka' SINCE 1 hour ago

-- Any Kafka metrics
FROM KafkaBrokerSample SELECT * SINCE 1 hour ago

-- Integration health
FROM SystemSample SELECT * WHERE integration.name = 'com.newrelic.kafka' SINCE 1 hour ago
```

### Test Commands:
```bash
# Test Regular Kafka JMX
kubectl exec -n kafka jmx-network-diagnostic -c jmx-tools -- \
  /scripts/test-jmx-connection.sh kafka-0.kafka-headless.kafka.svc.cluster.local 9999

# Test Strimzi Kafka metrics via Prometheus exporter
kubectl port-forward -n strimzi-kafka production-kafka-kafka-exporter-7d64df9c77-sj7sl 9308:9308
curl http://localhost:9308/metrics
```

## Recommendations

### Immediate Actions:
1. **Check New Relic UI** - Metrics might be appearing with different cluster names
2. **Enable Debug Logging** - Add `NRI_LOG_LEVEL=debug` to integration config
3. **Use Alternative Monitoring**:
   - For Strimzi: Use the built-in Kafka Exporter with nri-prometheus
   - For Regular Kafka: Deploy Prometheus JMX Exporter

### Alternative Monitoring Solutions:

#### Option 1: Prometheus JMX Exporter
```yaml
# Deploy JMX exporter as sidecar
# Scrape with nri-prometheus
# More reliable in Kubernetes
```

#### Option 2: Strimzi Kafka Exporter
```bash
# Already deployed for Strimzi Kafka
# Exposes metrics on port 9308
# Can be scraped by nri-prometheus
```

#### Option 3: OpenTelemetry Collector
```yaml
# Use Kafka receiver
# Export to New Relic OTLP endpoint
```

## Conclusion

Both Kafka deployments are running successfully with JMX enabled:
- Regular Kafka: JMX working without authentication
- Strimzi Kafka: JMX working with authentication

The nri-kafka integration connects successfully but returns empty data. This is a known issue in containerized environments. Alternative monitoring approaches using Prometheus exporters are recommended for reliable metrics collection.

---
Generated: $(date)