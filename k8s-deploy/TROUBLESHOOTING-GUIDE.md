# Comprehensive Kafka Monitoring Troubleshooting Guide

This guide consolidates all troubleshooting procedures for the New Relic Kafka integration in Kubernetes.

## Table of Contents
- [Quick Health Check](#quick-health-check)
- [Common Issues and Solutions](#common-issues-and-solutions)
- [Detailed Troubleshooting Steps](#detailed-troubleshooting-steps)
- [Root Cause Analysis](#root-cause-analysis)
- [Alternative Monitoring Approaches](#alternative-monitoring-approaches)
- [Production Recommendations](#production-recommendations)

## Quick Health Check

Run these commands to quickly assess the health of your Kafka monitoring setup:

```bash
# 1. Check if all pods are running
kubectl get pods -l app=kafka
kubectl get pods -l app.kubernetes.io/name=nri-kafka

# 2. Verify JMX connectivity
kubectl exec -it kafka-0 -- nc -zv localhost 9999

# 3. Check integration logs
kubectl logs -l app.kubernetes.io/name=nri-kafka --tail=50 | grep -E "(error|warn|connected)"

# 4. Verify metrics in New Relic
# Run this NRQL query in New Relic:
# FROM KafkaBrokerSample SELECT count(*) SINCE 5 minutes ago
```

## Common Issues and Solutions

### 1. No Metrics in New Relic

**Symptoms:**
- NRQL queries return no results
- Integration logs show connection errors

**Solutions:**
```bash
# Check if integration is running
kubectl get pods -l app.kubernetes.io/name=nri-kafka

# Verify configuration
kubectl describe configmap nri-kafka-config

# Check for errors
kubectl logs -l app.kubernetes.io/name=nri-kafka --tail=100
```

### 2. JMX Connection Failures

**Symptoms:**
- "Connection refused" errors
- "JMX connection failed" in logs

**Solutions:**
```bash
# Test JMX port from integration pod
kubectl exec -it $(kubectl get pod -l app.kubernetes.io/name=nri-kafka -o name | head -1) -- \
  nc -zv kafka-0.kafka-headless 9999

# Check Kafka JMX configuration
kubectl exec kafka-0 -- env | grep JMX

# Verify JMX is listening
kubectl exec kafka-0 -- ss -tlnp | grep 9999
```

### 3. Consumer Offset Monitoring Issues

**Symptoms:**
- No consumer offset metrics
- Timeout errors for consumer groups

**Solutions:**
```bash
# Enable consumer offset collection
# In nri-kafka config, ensure:
CONSUMER_OFFSET: "true"
CONSUMER_GROUPS: '[".*"]'

# Check Kafka consumer groups
kubectl exec kafka-0 -- kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list
```

### 4. Topic Metrics Missing

**Symptoms:**
- KafkaTopicSample has no data
- Specific topics not appearing

**Solutions:**
```bash
# Verify topic collection settings
# In config:
COLLECT_BROKER_TOPIC_DATA: "true"
TOPIC_MODE: "all"

# List topics manually
kubectl exec kafka-0 -- kafka-topics.sh --bootstrap-server localhost:9092 --list
```

## Detailed Troubleshooting Steps

### Step 1: Verify Kafka Cluster Health

```bash
# Check Kafka broker status
kubectl exec kafka-0 -- kafka-broker-api-versions.sh --bootstrap-server localhost:9092

# Verify cluster metadata
kubectl exec kafka-0 -- kafka-metadata.sh --snapshot /var/kafka-logs/__cluster_metadata-0/00000000000000000000.log

# Check replication status
kubectl exec kafka-0 -- kafka-topics.sh --bootstrap-server localhost:9092 --describe
```

### Step 2: Validate Network Connectivity

```bash
# Test connectivity between components
# From nri-kafka to Kafka
kubectl exec -it $(kubectl get pod -l app.kubernetes.io/name=nri-kafka -o name | head -1) -- \
  ping kafka-0.kafka-headless

# Test all required ports
for port in 9092 9093 9999; do
  kubectl exec -it $(kubectl get pod -l app.kubernetes.io/name=nri-kafka -o name | head -1) -- \
    nc -zv kafka-0.kafka-headless $port
done
```

### Step 3: Debug JMX Configuration

```bash
# Get full JMX configuration
kubectl exec kafka-0 -- ps aux | grep kafka | grep -o 'jmxremote[^ ]*' | tr ' ' '\n'

# Test JMX with jmxterm (if available)
kubectl exec -it kafka-0 -- bash
# Inside container:
wget https://github.com/jiaqi/jmxterm/releases/download/v1.0.4/jmxterm-1.0.4-uber.jar
java -jar jmxterm-1.0.4-uber.jar
# In jmxterm:
open localhost:9999
domains
```

### Step 4: Analyze Integration Behavior

```bash
# Get detailed logs
kubectl logs -l app.kubernetes.io/name=nri-kafka --tail=200 > nri-kafka-logs.txt

# Check for specific errors
grep -E "(ERROR|WARN|timeout|refused|failed)" nri-kafka-logs.txt

# Monitor real-time
kubectl logs -l app.kubernetes.io/name=nri-kafka -f | grep -v DEBUG
```

## Root Cause Analysis

### Common Root Causes

1. **JMX Authentication Mismatch**
   - Kafka expects authentication but integration doesn't provide credentials
   - Solution: Disable JMX authentication or configure credentials

2. **Network Policies**
   - Kubernetes NetworkPolicies blocking JMX port
   - Solution: Add explicit allow rules for port 9999

3. **DNS Resolution Issues**
   - Integration can't resolve Kafka service names
   - Solution: Use FQDN or IP addresses

4. **Resource Constraints**
   - Integration pod running out of memory
   - Solution: Increase resource limits

### Diagnostic Commands

```bash
# Check resource usage
kubectl top pods -l app.kubernetes.io/name=nri-kafka

# Verify DNS resolution
kubectl exec -it $(kubectl get pod -l app.kubernetes.io/name=nri-kafka -o name | head -1) -- \
  nslookup kafka-0.kafka-headless

# Check network policies
kubectl get networkpolicies -o wide

# Review events
kubectl get events --sort-by='.lastTimestamp' | grep -E "(kafka|nri)"
```

## Alternative Monitoring Approaches

### 1. Prometheus JMX Exporter

If direct JMX fails, use Prometheus as an intermediary:

```yaml
# Deploy JMX exporter alongside Kafka
- name: jmx-exporter
  image: sscaling/jmx-prometheus-exporter:0.12.0
  args:
    - "5556"
    - /etc/jmx-config/config.yaml
```

### 2. Kafka Exporter

Alternative lightweight exporter:

```bash
helm install kafka-exporter prometheus-community/kafka-exporter \
  --set kafkaServer=kafka-0.kafka-headless:9092
```

### 3. Custom Metrics Collection

Write custom collection script:

```python
# Example using kafka-python
from kafka import KafkaAdminClient
admin = KafkaAdminClient(bootstrap_servers='kafka:9092')
metrics = admin.metrics()
# Send to New Relic via Metrics API
```

## Production Recommendations

### 1. Monitoring Configuration

```yaml
# Recommended production settings
CLUSTER_NAME: "prod-kafka-cluster"
AUTODISCOVER_STRATEGY: "bootstrap"
COLLECT_BROKER_TOPIC_DATA: "true"
TOPIC_MODE: "regex"
TOPIC_REGEX: '["^((?!__).)*$"]'  # Exclude internal topics
COLLECT_TOPIC_SIZE: "true"
CONSUMER_OFFSET: "true"
CONSUMER_GROUPS_REGEX: '[".*"]'
```

### 2. Resource Allocation

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "100m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

### 3. High Availability

- Deploy integration as DaemonSet for broker-local collection
- Use affinity rules to co-locate with Kafka brokers
- Implement proper health checks and readiness probes

### 4. Security Best Practices

- Enable JMX authentication in production
- Use TLS for JMX connections
- Implement RBAC for integration service account
- Rotate credentials regularly

## Troubleshooting Checklist

- [ ] All Kafka brokers are running and healthy
- [ ] JMX is enabled on all brokers (port 9999)
- [ ] Network connectivity exists between integration and brokers
- [ ] Integration configuration is correct and complete
- [ ] No resource constraints (CPU/memory)
- [ ] DNS resolution works correctly
- [ ] No interfering network policies
- [ ] Correct RBAC permissions
- [ ] Recent data visible in New Relic
- [ ] No errors in integration logs

## Additional Resources

- [New Relic Kafka Integration Docs](https://docs.newrelic.com/docs/integrations/host-integrations/host-integrations-list/kafka-monitoring-integration/)
- [Kafka Monitoring Best Practices](https://kafka.apache.org/documentation/#monitoring)
- [Kubernetes Troubleshooting Guide](https://kubernetes.io/docs/tasks/debug-application-cluster/)