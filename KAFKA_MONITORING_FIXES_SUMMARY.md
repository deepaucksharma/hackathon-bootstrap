# Kafka Monitoring Fixes Summary

## Issues Identified and Fixed

### 1. ❌ Topic Collection Disabled
**Problem**: `TOPIC_MODE` was not set, defaulting to "None"
**Fix**: Set `TOPIC_MODE: all` in ConfigMap

### 2. ❌ Missing Broker Host Information
**Problem**: broker_host field was null
**Fix**: Ensure `BOOTSTRAP_BROKER_HOST` is correctly set to Strimzi service

### 3. ❌ No Consumer Offset Monitoring
**Problem**: Consumer offset collection was disabled
**Fix**: Enable multiple consumer offset settings:
- `CONSUMER_OFFSET: "true"`
- `INACTIVE_CONSUMER_GROUP_OFFSET: "true"`
- `CONSUMER_GROUP_OFFSET_BY_TOPIC: "true"`

### 4. ❌ Zero Throughput Metrics
**Problem**: No traffic in the cluster
**Fix**: Deploy test producer/consumer pods to generate traffic

### 5. ✅ MSK Shim Implementation
**Status**: Working correctly, transforming metrics to AWS MSK format

## Files to Apply

### 1. Fixed ConfigMap (`kafka-fixed-config.yaml`)
Key changes:
- `CLUSTER_NAME: strimzi-production-kafka` (matches actual cluster)
- `TOPIC_MODE: all` (enables topic collection)
- `COLLECT_TOPIC_SIZE: "true"`
- `COLLECT_TOPIC_OFFSET: "true"`
- `CONSUMER_OFFSET: "true"`
- `FORCE_TOPIC_SAMPLE_COLLECTION: "true"`

### 2. MSK Shim Deployment (`kafka-msk-shim-deployment.yaml`)
Key settings:
- `MSK_SHIM_ENABLED: "true"`
- `KAFKA_CLUSTER_NAME: strimzi-production-kafka` (must match ConfigMap)
- Proper RBAC permissions for Strimzi resources

### 3. Test Topics (`kafka-test-topics.yaml`)
Creates:
- `test-topic`: 3 partitions, 3 replicas
- `metrics-topic`: 6 partitions, 3 replicas

### 4. Test Clients (`kafka-test-clients.yaml`)
Deploys:
- `kafka-test-producer`: Sends messages every 5 seconds
- `kafka-test-consumer`: Consumes from beginning with group ID

## Manual Application Steps

```bash
# 1. Apply fixed configuration
kubectl apply -f k8s-fixes/kafka-fixed-config.yaml -n strimzi-kafka

# 2. Deploy MSK shim
kubectl apply -f k8s-fixes/kafka-msk-shim-deployment.yaml -n strimzi-kafka

# 3. Create test topics (if using Strimzi operator)
kubectl apply -f k8s-fixes/kafka-test-topics.yaml -n strimzi-kafka

# 4. Deploy test clients for traffic
kubectl apply -f k8s-fixes/kafka-test-clients.yaml -n strimzi-kafka

# 5. Restart existing nri-kafka pods to pick up new config
kubectl rollout restart deployment/nri-kafka -n strimzi-kafka

# 6. Monitor logs
kubectl logs -f -l app=nri-kafka-msk-shim-fixed -n strimzi-kafka
```

## Verification After Fixes

1. **Wait 3-5 minutes** for metrics to flow

2. **Check metrics collection**:
```bash
node verify-metrics-nodejs.js \
  --apiKey=YOUR_NEW_RELIC_API_KEY \
  --accountId=YOUR_ACCOUNT_ID \
  --clusterName=strimzi-production-kafka
```

3. **Expected Results**:
- ✅ KafkaTopicSample count > 0
- ✅ broker_host field populated
- ✅ Consumer groups detected
- ✅ Throughput metrics > 0
- ✅ MSK entities created

## Environment Variables for MSK Shim

The MSK shim requires these environment variables:
- `MSK_SHIM_ENABLED=true`
- `AWS_ACCOUNT_ID=123456789012` (dummy value OK)
- `AWS_REGION=us-east-1`
- `KAFKA_CLUSTER_NAME=strimzi-production-kafka`

## Key Code Insights

1. **MSK Shim Architecture** (`src/msk/`):
   - `shim.go`: Main orchestrator
   - `transformer_simple.go`: Metric transformation logic
   - `config.go`: Environment-based configuration
   - `integration.go`: Hooks into nri-kafka flow

2. **Metric Transformation**:
   - Standard metrics → AWS MSK format
   - Adds `provider.` prefix to all metrics
   - Creates AWS-compatible entity GUIDs
   - Aggregates broker metrics to cluster level

3. **Entity Creation**:
   - AwsMskClusterSample (cluster-level)
   - AwsMskBrokerSample (broker-level)
   - AwsMskTopicSample (topic-level)

## Troubleshooting

If metrics still don't appear:

1. **Check JMX connectivity**:
```bash
kubectl exec -it <kafka-pod> -n strimzi-kafka -- \
  java -jar jmxterm.jar --url service:jmx:rmi:///jndi/rmi://localhost:9999/jmxrmi
```

2. **Verify Kafka is healthy**:
```bash
kubectl get kafka -n strimzi-kafka
kubectl get pods -n strimzi-kafka
```

3. **Check nri-kafka logs for errors**:
```bash
kubectl logs -l app=nri-kafka -n strimzi-kafka | grep -E "ERROR|WARN"
```

4. **Ensure topics exist**:
```bash
kubectl get kafkatopics -n strimzi-kafka
```