# NRI-Kafka Troubleshooting Guide

This guide helps diagnose and resolve issues when nri-kafka returns empty data despite successful JMX connections.

## Problem: Empty Data Array Despite 966 MBeans

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

## Reporting Issues

When reporting issues, include:
1. Output from `./debug-kafka.sh`
2. List of available MBeans from `./test-jmx-mbeans.sh`
3. Kafka version and deployment type (standalone/Docker/K8s/MSK)
4. Full verbose output from a minimal test run