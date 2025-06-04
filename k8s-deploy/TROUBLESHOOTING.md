# nri-kafka Kubernetes Deployment - Verification & Troubleshooting Guide

## Table of Contents
1. [Initial Verification](#initial-verification)
2. [Component Health Checks](#component-health-checks)
3. [Connectivity Tests](#connectivity-tests)
4. [Integration Verification](#integration-verification)
5. [New Relic Data Validation](#new-relic-data-validation)
6. [Common Issues & Solutions](#common-issues--solutions)
7. [Debug Commands](#debug-commands)
8. [Log Analysis](#log-analysis)

## Initial Verification

### 1. Check All Pods Are Running
```bash
# Check Kafka namespace
kubectl get pods -n kafka -o wide

# Expected output: All pods should be in Running state
# - kafka-0, kafka-1, kafka-2 (3/3 Running)
# - zookeeper-0 (1/1 Running)
# - kafka-producer-* (1/1 Running)
# - kafka-consumer-* (2 instances, 1/1 Running each)

# Check New Relic namespace
kubectl get pods -n newrelic -o wide

# Expected: newrelic-bundle-* pods all Running
```

### 2. Check Pod Events for Errors
```bash
# Check Kafka pods
kubectl describe pods -n kafka | grep -A 5 Events

# Check New Relic pods
kubectl describe pods -n newrelic | grep -A 5 Events
```

### 3. Verify Services
```bash
# Kafka services
kubectl get svc -n kafka

# Should see:
# - kafka (ClusterIP)
# - kafka-headless (ClusterIP None)
# - zookeeper (ClusterIP None)
```

## Component Health Checks

### Kafka Cluster Health
```bash
# Check Kafka broker IDs
for i in 0 1 2; do
  echo "Checking kafka-$i:"
  kubectl exec -n kafka kafka-$i -- kafka-broker-api-versions.sh --bootstrap-server localhost:9092
done

# List all topics
kubectl exec -n kafka kafka-0 -- kafka-topics.sh --bootstrap-server kafka-0.kafka-headless:9092 --list

# Check cluster metadata
kubectl exec -n kafka kafka-0 -- kafka-metadata.sh --snapshot /bitnami/kafka/data/__cluster_metadata-0/00000000000000000000.log
```

### JMX Connectivity
```bash
# Test JMX port accessibility from New Relic pod
kubectl exec -n newrelic -it $(kubectl get pods -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure -o jsonpath='{.items[0].metadata.name}') -- /bin/sh -c "nc -zv kafka-0.kafka-headless.kafka.svc.cluster.local 9999"

# Check JMX metrics are exposed
kubectl exec -n kafka kafka-0 -- /bin/bash -c "echo 'beans' | java -jar /opt/bitnami/kafka/bin/jmxterm.jar -l localhost:9999 -n" | grep kafka
```

### Consumer Group Status
```bash
# List consumer groups
kubectl exec -n kafka kafka-0 -- kafka-consumer-groups.sh --bootstrap-server kafka-0.kafka-headless:9092 --list

# Check consumer group details
kubectl exec -n kafka kafka-0 -- kafka-consumer-groups.sh --bootstrap-server kafka-0.kafka-headless:9092 --group test-consumer-group --describe
```

## Connectivity Tests

### DNS Resolution
```bash
# Test from New Relic pod
NR_POD=$(kubectl get pods -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure -o jsonpath='{.items[0].metadata.name}')

# Test DNS resolution
kubectl exec -n newrelic $NR_POD -- nslookup kafka-0.kafka-headless.kafka.svc.cluster.local
kubectl exec -n newrelic $NR_POD -- nslookup kafka-1.kafka-headless.kafka.svc.cluster.local
kubectl exec -n newrelic $NR_POD -- nslookup kafka-2.kafka-headless.kafka.svc.cluster.local
```

### Network Connectivity
```bash
# Test Kafka port (9092)
for i in 0 1 2; do
  kubectl exec -n newrelic $NR_POD -- nc -zv kafka-$i.kafka-headless.kafka.svc.cluster.local 9092
done

# Test JMX port (9999)
for i in 0 1 2; do
  kubectl exec -n newrelic $NR_POD -- nc -zv kafka-$i.kafka-headless.kafka.svc.cluster.local 9999
done
```

## Integration Verification

### Check nri-kafka Configuration
```bash
# View the integration configuration
kubectl get configmap -n newrelic -o yaml | grep -A 50 "kafka.*yaml:"

# Check if nri-kafka binary exists in the container
kubectl exec -n newrelic $NR_POD -c newrelic-infrastructure -- ls -la /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka
```

### Test nri-kafka Manually
```bash
# Run nri-kafka test inside the New Relic pod
kubectl exec -n newrelic $NR_POD -c newrelic-infrastructure -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
  -cluster_name test \
  -autodiscover_strategy bootstrap \
  -bootstrap_broker_host kafka-0.kafka-headless.kafka.svc.cluster.local \
  -bootstrap_broker_jmx_port 9999 \
  -metrics true \
  -pretty
```

### Check Discovery Results
```bash
# See what nri-discovery-kubernetes finds
kubectl exec -n newrelic $NR_POD -c newrelic-infrastructure -- /var/db/newrelic-infra/nri-discovery-kubernetes --port 10250 --tls | jq '.[] | select(.labels."app.kubernetes.io/component" == "kafka")'
```

## New Relic Data Validation

### 1. Check Infrastructure Agent Logs for Kafka Integration
```bash
# Look for kafka integration execution
kubectl logs -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure -c newrelic-infrastructure | grep -i "kafka" | tail -50

# Check for integration errors
kubectl logs -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure -c newrelic-infrastructure | grep -E "(error|ERROR)" | grep -i kafka
```

### 2. Verify Metrics Are Being Sent
```bash
# Check for successful metric posts
kubectl logs -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure -c newrelic-infrastructure | grep "POST" | grep "200"
```

### 3. In New Relic UI
1. Go to **Infrastructure > Third-party services**
2. Look for **Apache Kafka** tile
3. Check for:
   - Cluster name matches your configuration
   - Brokers are listed (should see 3)
   - Topics are visible
   - Consumer groups appear

### 4. Query Data in New Relic
Run these NRQL queries in New Relic Query Builder:
```sql
-- Check if Kafka broker metrics are coming in
SELECT count(*) FROM KafkaBrokerSample WHERE clusterName = 'YOUR_CLUSTER_NAME' SINCE 30 minutes ago

-- Check topic metrics
SELECT count(*) FROM KafkaTopicSample WHERE clusterName = 'YOUR_CLUSTER_NAME' SINCE 30 minutes ago

-- Check consumer offset metrics
SELECT count(*) FROM KafkaConsumerSample WHERE clusterName = 'YOUR_CLUSTER_NAME' SINCE 30 minutes ago

-- View broker details
SELECT * FROM KafkaBrokerSample WHERE clusterName = 'YOUR_CLUSTER_NAME' LIMIT 10

-- Check for any Kafka-related events
SELECT * FROM InfrastructureEvent WHERE category = 'kafka' SINCE 1 hour ago
```

## Common Issues & Solutions

### Issue 1: No Kafka Metrics in New Relic

**Symptoms**: No data appears in New Relic Kafka dashboards

**Debug Steps**:
```bash
# 1. Check if integration is running
kubectl logs -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure -c newrelic-infrastructure | grep "Executing integration"

# 2. Look for connection errors
kubectl logs -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure -c newrelic-infrastructure | grep -i "connection refused"

# 3. Verify license key
kubectl get secret -n newrelic newrelic-bundle-newrelic-infrastructure-license -o yaml | base64 -d
```

### Issue 2: JMX Connection Refused

**Symptoms**: "Connection refused" errors in logs

**Solutions**:
```bash
# 1. Check JMX is enabled on Kafka
kubectl exec -n kafka kafka-0 -- env | grep JMX

# 2. Test JMX locally on Kafka pod
kubectl exec -n kafka kafka-0 -- bash -c "echo 'help' | java -jar /opt/bitnami/kafka/bin/jmxterm.jar -l localhost:9999 -n"

# 3. Check if JMX port is listening
kubectl exec -n kafka kafka-0 -- netstat -tlnp | grep 9999
```

### Issue 3: DNS Resolution Failures

**Symptoms**: "no such host" errors

**Solutions**:
```bash
# 1. Check CoreDNS is running
kubectl get pods -n kube-system -l k8s-app=kube-dns

# 2. Test DNS from within cluster
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup kafka-0.kafka-headless.kafka.svc.cluster.local

# 3. Check service endpoints
kubectl get endpoints -n kafka
```

### Issue 4: Consumer Lag Not Showing

**Symptoms**: No consumer lag metrics

**Debug**:
```bash
# 1. Verify consumers are running
kubectl exec -n kafka kafka-0 -- kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list

# 2. Check if consumers are active
kubectl exec -n kafka kafka-0 -- kafka-consumer-groups.sh --bootstrap-server localhost:9092 --group test-consumer-group --describe --state

# 3. Manually check lag
kubectl exec -n kafka kafka-0 -- kafka-consumer-groups.sh --bootstrap-server localhost:9092 --group test-consumer-group --describe
```

## Debug Commands

### Quick Debug Script
```bash
#!/bin/bash
# Save as debug-nri-kafka.sh

echo "=== Checking Pod Status ==="
kubectl get pods -n kafka
kubectl get pods -n newrelic

echo -e "\n=== Checking Kafka Cluster Health ==="
kubectl exec -n kafka kafka-0 -- kafka-broker-api-versions.sh --bootstrap-server localhost:9092 2>/dev/null | head -5

echo -e "\n=== Checking Topics ==="
kubectl exec -n kafka kafka-0 -- kafka-topics.sh --bootstrap-server localhost:9092 --list 2>/dev/null

echo -e "\n=== Checking Consumer Groups ==="
kubectl exec -n kafka kafka-0 -- kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list 2>/dev/null

echo -e "\n=== Checking nri-kafka Logs ==="
kubectl logs -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure -c newrelic-infrastructure --tail=20 | grep -i kafka

echo -e "\n=== Testing JMX Connectivity ==="
NR_POD=$(kubectl get pods -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n newrelic $NR_POD -- nc -zv kafka-0.kafka-headless.kafka.svc.cluster.local 9999 2>&1
```

### Enable Debug Logging
```bash
# Edit the ConfigMap to enable debug logging
kubectl edit configmap -n newrelic newrelic-bundle-newrelic-infrastructure

# Add to the infrastructure agent config:
# log:
#   level: debug
```

## Log Analysis

### Key Log Patterns to Search
```bash
# Success patterns
kubectl logs -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure | grep -E "(KafkaBrokerSample|KafkaTopicSample|KafkaConsumerSample)"

# Error patterns
kubectl logs -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure | grep -E "(error|failed|refused|timeout)" | grep -i kafka

# Integration execution
kubectl logs -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure | grep "Integration health check finished with success"
```

### Export Logs for Analysis
```bash
# Export last hour of logs
kubectl logs -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure -c newrelic-infrastructure --since=1h > nri-kafka-logs.txt

# Analyze log patterns
grep -i kafka nri-kafka-logs.txt | grep -o "level=[^ ]*" | sort | uniq -c
```

## Performance Verification

### Check Resource Usage
```bash
# Kafka pods resource usage
kubectl top pods -n kafka

# New Relic pods resource usage
kubectl top pods -n newrelic

# Check if pods are being OOM killed
kubectl get events -n kafka --field-selector reason=OOMKilled
kubectl get events -n newrelic --field-selector reason=OOMKilled
```

### Metrics Collection Frequency
```bash
# Check how often integration runs
kubectl logs -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure -c newrelic-infrastructure | grep "Executing integration" | grep kafka | tail -10
```

## Advanced Troubleshooting

### Packet Capture
```bash
# Capture JMX traffic (requires privileged container)
kubectl exec -n newrelic $NR_POD -c newrelic-infrastructure -- tcpdump -i any -w /tmp/jmx.pcap host kafka-0.kafka-headless.kafka.svc.cluster.local and port 9999 -c 100

# Copy capture file
kubectl cp newrelic/$NR_POD:/tmp/jmx.pcap ./jmx.pcap -c newrelic-infrastructure
```

### Strace Integration Execution
```bash
# Trace system calls during integration execution
kubectl exec -n newrelic $NR_POD -c newrelic-infrastructure -- strace -f -e network /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka -cluster_name test -bootstrap_broker_host kafka-0.kafka-headless.kafka.svc.cluster.local -bootstrap_broker_jmx_port 9999 -metrics true
```