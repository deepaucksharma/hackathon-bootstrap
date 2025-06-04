# NRI-Kafka Troubleshooting Runbook

## Overview
This runbook documents comprehensive troubleshooting approaches for the New Relic Infrastructure Kafka integration (nri-kafka) in Kubernetes environments.

## Key Findings

### 1. Integration Status
- ✅ nri-kafka binary is installed and accessible in New Relic Infrastructure pods
- ✅ JMX port (9999) is accessible from New Relic pods
- ✅ Integration executes without errors
- ❌ Integration returns empty data array
- ⚠️ JMX connection appears successful but no metrics are collected

### 2. Root Cause Analysis

The nri-kafka integration is failing to collect metrics despite:
- Proper network connectivity
- JMX port being open and accessible
- Correct configuration format

Possible reasons:
1. **JMX Authentication**: Even with authentication disabled, there may be RMI-specific issues
2. **JMX/RMI Hostname Issues**: The Java RMI server hostname might not be resolving correctly
3. **Integration Version Compatibility**: The nri-kafka version might have compatibility issues with Kafka 3.5.1

### 3. Troubleshooting Steps Performed

#### A. Basic Connectivity Tests
```bash
# Test DNS resolution
kubectl exec -n newrelic $NRI_POD -c agent -- nslookup kafka.kafka.svc.cluster.local

# Test port connectivity
kubectl exec -n newrelic $NRI_POD -c agent -- nc -zv kafka.kafka.svc.cluster.local 9999
```
**Result**: ✅ All connectivity tests passed

#### B. Manual Integration Execution
```bash
kubectl exec -n newrelic $NRI_POD -c agent -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
    --cluster_name test \
    --bootstrap_broker_host kafka.kafka.svc.cluster.local \
    --bootstrap_broker_jmx_port 9999 \
    --bootstrap_broker_kafka_port 9092 \
    --metrics \
    --verbose
```
**Result**: Returns `{"data": []}` - connection successful but no metrics

#### C. Configuration Approaches Tested

1. **Inline Configuration (values-nri-bundle.yaml)**
   - Status: Applied successfully
   - Result: Integration not executing

2. **ConfigMap Mount (values-nri-bundle-v3.yaml)**
   - Status: Applied successfully
   - Result: Integration executing but returning empty data

3. **Standalone DaemonSet (nri-kafka-standalone.yaml)**
   - Status: Running
   - Result: Integration executing every 30s but no metrics collected

### 4. Alternative Approaches

#### A. Prometheus JMX Exporter
Created deployment for Prometheus JMX exporter as an alternative:
- File: `kafka-jmx-prometheus.yaml`
- Status: Deployment created
- Can be scraped by nri-prometheus

#### B. Direct JMX Tools Testing
- JMXTerm connection attempts showed connectivity works
- Suggests the issue is specific to nri-kafka integration

### 5. Verification Commands

```bash
# Check integration execution
kubectl logs -n newrelic $(kubectl get pods -n newrelic -l app.kubernetes.io/component=kubelet -o jsonpath='{.items[0].metadata.name}') -c agent | grep -i nri-kafka

# Test manual execution
./test-nri-kafka-params.sh

# Comprehensive troubleshooting
./troubleshoot-nri-kafka.sh

# Verify JMX configuration
./verify-kafka-jmx.sh
```

### 6. Recommendations

1. **Check New Relic UI**
   - Navigate to Infrastructure > Third-party services
   - Query: `FROM KafkaBrokerSample SELECT *`
   - Check for any Kafka entities

2. **Enable NRJMX Debug Logging**
   Add to integration config:
   ```yaml
   env:
     NRJMX_VERBOSE: "true"
     NRJMX_LOG_LEVEL: "DEBUG"
   ```

3. **Try Legacy Discovery**
   The autodiscover_strategy might need to be set to zookeeper with proper zookeeper configuration

4. **Use Alternative Monitoring**
   - Deploy Prometheus JMX exporter + nri-prometheus
   - Use Kafka's built-in metrics reporters
   - Consider OpenTelemetry collector with Kafka receiver

### 7. Files Created

1. **troubleshoot-nri-kafka.sh** - Comprehensive troubleshooting script
2. **test-nri-kafka-params.sh** - Test various parameter combinations
3. **verify-kafka-jmx.sh** - Verify JMX configuration
4. **nri-kafka-configmap.yaml** - ConfigMap for integration config
5. **nri-kafka-standalone.yaml** - Standalone DaemonSet deployment
6. **kafka-jmx-prometheus.yaml** - Prometheus JMX exporter deployment
7. **values-nri-bundle-v3.yaml** - Helm values with proper v3 configuration

### 8. Next Steps

1. **Check with nrjmx directly**:
   ```bash
   kubectl exec -n newrelic $NRI_POD -c agent -- /usr/bin/nrjmx \
       -hostname kafka.kafka.svc.cluster.local \
       -port 9999 \
       -verbose
   ```

2. **Try with explicit JMX URL**:
   ```bash
   --jmx_remote_url "service:jmx:rmi:///jndi/rmi://kafka.kafka.svc.cluster.local:9999/jmxrmi"
   ```

3. **Consider MSK compatibility**:
   The codebase shows MSK (AWS Managed Streaming for Kafka) shim implementation. This might be interfering with standard Kafka monitoring.

### 9. Conclusion

While the infrastructure is properly set up and the integration is executing, the nri-kafka integration is not collecting metrics from the Kafka broker. This appears to be a JMX/RMI connection issue specific to how nri-kafka connects to Kafka's JMX interface.

The recommended approach is to:
1. Use the Prometheus JMX exporter with nri-prometheus for immediate monitoring
2. Continue investigating the JMX connection issue with debug logging
3. Consider using Kafka's native metrics reporting to New Relic's Metric API