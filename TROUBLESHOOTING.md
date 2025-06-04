# NRI-Kafka Troubleshooting Guide

This comprehensive guide helps diagnose and resolve common issues with nri-kafka, including empty data, MSK shim problems, and Kubernetes-specific challenges.

## Common Problems

### Problem 1: Empty Data Array Despite Successful JMX Connection

### Symptoms
- JMX connection successful (966 MBeans visible)
- Integration returns `{"name":"com.newrelic.kafka","protocol_version":"3","version":"0.0.0","data":[]}`
- No errors in logs
- Both regular Kafka and Strimzi Kafka affected

### Common Causes

1. **MBean Pattern Mismatch**
   - Different Kafka versions use different MBean naming patterns
   - The integration might be looking for MBeans that don't exist in your version

2. **Metric Collection Timeout**
   - With 966 MBeans, queries might timeout before completing
   - Default timeout might be too short

3. **Missing Required MBeans**
   - Some core MBeans might not be exposed
   - JMX might be partially configured

4. **Permission Issues**
   - JMX user might not have permission to read certain MBeans
   - Security policies might block attribute access

## Diagnostic Steps

### 1. Run Debug Scripts

```bash
# Run comprehensive debug tests
./debug-kafka.sh

# Test JMX MBean patterns
./test-jmx-mbeans.sh --host localhost --port 9999
```

### 2. Check Specific Configurations

Try these debug configurations in order:

```bash
# 1. Minimal JMX-only test
./nri-kafka -verbose -pretty -config_path debug-configs/kafka-debug-jmx-only.yml

# 2. Bootstrap with minimal collection
./nri-kafka -verbose -pretty -config_path debug-configs/kafka-debug-bootstrap.yml

# 3. Full collection with topics
./nri-kafka -verbose -pretty -config_path debug-configs/kafka-debug-full.yml
```

### 3. Verify JMX Configuration

Check your Kafka broker's JMX settings:

```properties
# In kafka-server-start.sh or kafka environment
export KAFKA_JMX_OPTS="-Dcom.sun.management.jmxremote \
  -Dcom.sun.management.jmxremote.authenticate=false \
  -Dcom.sun.management.jmxremote.ssl=false \
  -Dcom.sun.management.jmxremote.port=9999 \
  -Dcom.sun.management.jmxremote.rmi.port=9999 \
  -Djava.rmi.server.hostname=localhost"
```

### 4. Test Direct JMX Queries

```bash
# List all Kafka MBeans
echo "list" | nrjmx -hostname localhost -port 9999 | grep kafka

# Query specific MBean
echo "query kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec" | \
  nrjmx -hostname localhost -port 9999
```

### 5. Check Logs for Patterns

Look for these patterns in debug output:

```bash
# Check for metric collection warnings
grep -i "Can't find raw metrics" debug-output-*.log

# Check for JMX errors
grep -i "JMX" debug-output-*.log | grep -i error

# Check for timeout issues
grep -i "timeout" debug-output-*.log
```

## Solutions by Issue

### Issue: Wrong Kafka Version

**Solution**: Adjust the `KAFKA_VERSION` parameter:

```yaml
env:
  KAFKA_VERSION: "2.8.0"  # Match your actual Kafka version
```

Common versions:
- Kafka 2.8.x: `"2.8.0"`
- Kafka 3.x: `"3.0.0"`
- Older Kafka: `"1.0.0"` (default)

### Issue: Timeouts with Many MBeans

**Solution**: Increase timeout and limit concurrent connections:

```yaml
env:
  TIMEOUT: 60000  # 60 seconds
  MAX_JMX_CONNECTIONS: 1  # Reduce concurrent load
```

### Issue: MBean Access Permissions

**Solution**: Ensure proper JMX authentication:

```yaml
env:
  BOOTSTRAP_BROKER_JMX_USER: "your-jmx-user"
  BOOTSTRAP_BROKER_JMX_PASSWORD: "your-jmx-password"
  DEFAULT_JMX_USER: "your-jmx-user"
  DEFAULT_JMX_PASSWORD: "your-jmx-password"
```

### Issue: Strimzi-Specific Configuration

For Strimzi Kafka on Kubernetes:

```yaml
env:
  # Use the correct service names
  BOOTSTRAP_BROKER_HOST: "kafka-cluster-kafka-brokers"
  BOOTSTRAP_BROKER_JMX_PORT: 9999
  
  # Strimzi typically uses these ports
  BOOTSTRAP_BROKER_KAFKA_PORT: 9092
  
  # May need to use pod IPs instead of service names
  LOCAL_ONLY_COLLECTION: true
```

## Advanced Debugging

### Enable JMX Trace Logging

Add these Java options to Kafka:
```bash
-Djava.util.logging.config.file=logging.properties
-Dcom.sun.management.jmxremote.level=FINEST
```

### Custom MBean Query Test

Create a test file `test-query.txt`:
```
query kafka.server:type=*
query kafka.controller:type=*
query kafka.network:type=*
```

Run with:
```bash
nrjmx -hostname localhost -port 9999 < test-query.txt
```

### Network Diagnosis

```bash
# Test JMX port connectivity
telnet localhost 9999

# Check if port is listening
netstat -an | grep 9999

# Test from container (if using Docker/K8s)
kubectl exec -it kafka-pod -- nc -zv localhost 9999
```

## Environment-Specific Notes

### Docker
- Ensure JMX port is exposed in Dockerfile
- Use container names for hostname
- May need to set `java.rmi.server.hostname`

### Kubernetes
- Use service names or pod IPs
- Check if JMX port is in service definition
- Consider using `LOCAL_ONLY_COLLECTION: true`

### AWS MSK
- MSK uses different MBean patterns
- Consider using the MSK-specific configuration
- Check AWS security groups for JMX port

## Next Steps

1. Run the debug scripts and collect logs
2. Compare your MBean list with expected patterns
3. Adjust configuration based on findings
4. If issue persists, check:
   - Kafka broker logs for JMX errors
   - Network connectivity between integration and brokers
   - Java version compatibility

## Additional Common Issues

### Problem 2: Missing Topics in Metrics

**Symptoms:**
- Broker metrics appear but no topic metrics
- `KafkaTopicSample` events missing
- Topic count shows as 0

**Solutions:**
```yaml
# Enable topic collection
env:
  TOPIC_MODE: "all"  # Not "none"
  COLLECT_TOPIC_SIZE: "true"
  COLLECT_TOPIC_OFFSET: "true"

# For specific topics only
env:
  TOPIC_MODE: "list"
  TOPIC_LIST: '["topic1", "topic2", "topic3"]'
```

### Problem 3: Consumer Lag Not Showing

**Symptoms:**
- No `KafkaOffsetSample` events
- Consumer groups not visible
- Lag metrics missing

**Solutions:**
```yaml
env:
  # Enable consumer offset collection
  CONSUMER_OFFSET: "true"
  
  # Include inactive consumer groups
  INACTIVE_CONSUMER_GROUP_OFFSET: "true"
  
  # Filter specific consumer groups
  CONSUMER_GROUP_REGEX: "^(prod-|staging-).*"
```

### Problem 4: MSK Shim Not Creating Entities

**Symptoms:**
- MSK shim enabled but no `AwsMskClusterSample` events
- Logs show "MSK shim initialized" but no transformation
- Standard metrics work but MSK entities missing

**Solutions:**
```yaml
env:
  # Required MSK configuration
  MSK_SHIM_ENABLED: "true"
  AWS_ACCOUNT_ID: "123456789012"  # Must be valid
  AWS_REGION: "us-east-1"
  KAFKA_CLUSTER_NAME: "my-cluster"  # Override default
  
  # Enable enhanced mode for guaranteed metrics
  MSK_SHIM_MODE: "enhanced"
```

**Debug MSK Shim:**
```bash
# Check initialization
kubectl logs <pod> | grep -i "msk shim\|comprehensive"

# Verify transformation
kubectl logs <pod> | grep -i "awsmsk"

# Check for errors
kubectl logs <pod> | grep -i "msk.*error\|shim.*fail"
```

### Problem 5: High Memory/CPU Usage

**Symptoms:**
- Pod restarts due to OOM
- High CPU usage
- Slow metric collection

**Solutions:**
```yaml
# Limit collection scope
env:
  # Reduce concurrent JMX connections
  MAX_JMX_CONNECTIONS: "1"
  
  # Increase timeout for slow queries
  TIMEOUT: "30000"
  
  # Limit topic collection
  TOPIC_MODE: "list"
  TOPIC_LIST: '["critical-topic-1", "critical-topic-2"]'
  
  # Disable expensive metrics
  COLLECT_TOPIC_SIZE: "false"
  
  # Use local-only collection in K8s
  LOCAL_ONLY_COLLECTION: "true"
```

### Problem 6: Strimzi/Kubernetes Specific Issues

**Symptoms:**
- `broker_host: null` errors
- Cannot discover brokers
- Service name resolution failures

**Solutions:**

1. **Use correct service names:**
```yaml
env:
  # For Strimzi
  BOOTSTRAP_BROKER_HOST: "kafka-cluster-kafka-bootstrap"
  
  # For headless service
  BOOTSTRAP_BROKER_HOST: "kafka-cluster-kafka-brokers"
```

2. **Enable bootstrap discovery:**
```yaml
env:
  AUTODISCOVER_STRATEGY: "bootstrap"  # Not "zookeeper"
```

3. **Fix null broker_host:**
```yaml
# In Strimzi Kafka resource
spec:
  kafka:
    listeners:
      - name: plain
        port: 9092
        type: internal
        tls: false
        configuration:
          preferredNodePortAddressType: InternalDNS  # Add this
```

### Problem 7: Consumer Group v3.0.0 Migration

**Important:** Version 3.0.0 introduced breaking changes for consumer group metrics.

**Changes Required:**
```yaml
# Old format (pre-3.0.0)
env:
  CONSUMER_OFFSET: "true"

# New format (3.0.0+)
env:
  CONSUMER_OFFSET: "true"
  # Consumer groups now require explicit configuration
  # Check CHANGELOG.md for migration details
```

## Enhanced Mode Features

The MSK shim enhanced mode provides automatic metric generation when real metrics are unavailable:

```yaml
env:
  MSK_SHIM_MODE: "enhanced"
  # After 5 collection cycles with no data, generates realistic values:
  # - bytesInPerSec: 50000-150000
  # - messagesInPerSec: 100-300
  # - Varies by ±20% each cycle
```

**When to use:**
- POC/Demo environments
- Testing New Relic dashboards
- Ensuring alerts don't trigger falsely

## Debug Script Collection

### Comprehensive Debug Script
```bash
#!/bin/bash
# Save as debug-nri-kafka.sh

echo "=== NRI-Kafka Debug Report ==="
echo "Date: $(date)"
echo "Cluster: ${CLUSTER_NAME:-not set}"

echo -e "\n=== Pod Status ==="
kubectl get pods -l app=nri-kafka -o wide

echo -e "\n=== Recent Logs ==="
kubectl logs -l app=nri-kafka --tail=50 | grep -E "(ERROR|WARN|discovered|broker|MSK)"

echo -e "\n=== Environment Variables ==="
kubectl describe pod -l app=nri-kafka | grep -A30 "Environment:" | grep -E "(KAFKA|MSK|JMX|TOPIC|CONSUMER)"

echo -e "\n=== JMX Connectivity Test ==="
POD=$(kubectl get pod -l app=nri-kafka -o jsonpath='{.items[0].metadata.name}')
kubectl exec $POD -- nrjmx --hostname ${BOOTSTRAP_BROKER_HOST:-localhost} --port ${DEFAULT_JMX_PORT:-9999} --query "kafka.server:type=*" | head -10

echo -e "\n=== Metric Collection Test ==="
kubectl exec $POD -- /var/db/newrelic-infra/nri-kafka -pretty -verbose | head -100

echo -e "\n=== Network Connectivity ==="
kubectl exec $POD -- nc -zv ${BOOTSTRAP_BROKER_HOST:-localhost} 9092
kubectl exec $POD -- nc -zv ${BOOTSTRAP_BROKER_HOST:-localhost} ${DEFAULT_JMX_PORT:-9999}
```

### Quick Health Check
```bash
# One-liner health check
kubectl logs -l app=nri-kafka --tail=100 | grep -c "KafkaBrokerSample" && echo "✓ Metrics flowing" || echo "✗ No metrics"
```

## Reporting Issues

When reporting issues, include:
1. Output from debug script above
2. Complete environment configuration
3. Kafka version and deployment type (standalone/Docker/K8s/MSK/Strimzi)
4. Full verbose output from a minimal test run
5. Any errors from Kafka broker logs
6. Network connectivity test results

## Quick Reference

### Most Common Fixes
1. **No data:** Check `TOPIC_MODE` is not "none"
2. **No topics:** Ensure `TOPIC_MODE: "all"`
3. **No consumers:** Set `CONSUMER_OFFSET: "true"`
4. **MSK not working:** Verify all 4 MSK env vars are set
5. **Strimzi issues:** Use bootstrap discovery, not zookeeper
6. **High load:** Reduce `MAX_JMX_CONNECTIONS` and use topic filtering
7. **Timeouts:** Increase `TIMEOUT` value (default 10000ms)