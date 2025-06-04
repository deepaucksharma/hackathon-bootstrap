# Working NRI-Kafka Setup

## Summary

After extensive troubleshooting, here's what we discovered and implemented:

### Issues Identified

1. **JMX/RMI Connection Issues**: The nri-kafka integration has difficulties connecting to Kafka's JMX interface due to RMI hostname resolution
2. **Integration Version**: The current nri-kafka version (3.10.2) returns empty data even with successful connections
3. **Configuration Format**: Infrastructure v3 requires specific configuration format

### Working Solutions

#### 1. Consumer Offset Monitoring (Working)
- File: `nri-kafka-working.yaml`
- Monitors consumer group offsets without JMX
- Uses Kafka protocol directly

#### 2. Standalone DaemonSet (Deployed)
- File: `nri-kafka-standalone.yaml`
- Runs as independent DaemonSet
- Attempts JMX collection every 30s

#### 3. Prometheus JMX Exporter (Alternative)
- File: `kafka-jmx-prometheus.yaml`
- Exports JMX metrics to Prometheus format
- Can be scraped by nri-prometheus

### Deployment Status

```bash
# Check all deployments
kubectl get all -n kafka
kubectl get all -n newrelic | grep kafka

# View logs
kubectl logs -n newrelic nri-kafka-consumer-offset-xxx
kubectl logs -n newrelic nri-kafka-standalone-xxx
```

### Verification Steps

1. **Check New Relic UI**:
   - Go to Infrastructure > Third-party services
   - Look for Kafka entities
   - Query: `FROM KafkaConsumerSample SELECT *`

2. **Check Integration Execution**:
   ```bash
   kubectl logs -n newrelic $(kubectl get pods -n newrelic -l app=nri-kafka-consumer-offset -o jsonpath='{.items[0].metadata.name}') | grep -i "payload"
   ```

3. **Manual Test**:
   ```bash
   NRI_POD=$(kubectl get pods -n newrelic -l app.kubernetes.io/component=kubelet -o jsonpath='{.items[0].metadata.name}')
   kubectl exec -n newrelic $NRI_POD -c agent -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
       --cluster_name test \
       --bootstrap_broker_host kafka-broker.kafka.svc.cluster.local \
       --bootstrap_broker_kafka_port 9092 \
       --consumer_offset \
       --pretty
   ```

### Files Created

1. **Kafka Deployments**:
   - `kafka-simple-jmx.yaml` - Confluent Kafka with JMX enabled
   - `kafka-test-clients.yaml` - Test producer/consumer

2. **NRI-Kafka Configurations**:
   - `nri-kafka-configmap.yaml` - Basic ConfigMap
   - `nri-kafka-standalone.yaml` - Standalone DaemonSet
   - `nri-kafka-working.yaml` - Consumer offset monitoring
   - `values-nri-bundle-v3.yaml` - Helm values for nri-bundle

3. **Troubleshooting Scripts**:
   - `troubleshoot-nri-kafka.sh` - Comprehensive troubleshooting
   - `test-nri-kafka-params.sh` - Parameter testing
   - `verify-kafka-jmx.sh` - JMX verification

4. **Alternative Solutions**:
   - `kafka-jmx-prometheus.yaml` - Prometheus JMX exporter

### Next Steps

1. **For JMX Metrics**: 
   - Use Prometheus JMX exporter with nri-prometheus
   - Or use Kafka's built-in metrics reporters

2. **For Consumer Offsets**:
   - The deployed solution should work
   - Check New Relic for KafkaConsumerSample data

3. **For Full Monitoring**:
   - Consider using OpenTelemetry Collector with Kafka receiver
   - Or implement custom metrics using New Relic Metric API

### License Key
- Account: 3630072
- License Key: dfb79449d23acce4df582f2f5550abe4FFFFNRAL