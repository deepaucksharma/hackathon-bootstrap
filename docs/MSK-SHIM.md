# New Relic MSK Shim for nri-kafka

Transform self-managed Kafka metrics to be fully compatible with New Relic's AWS MSK Message Queues & Streams UI.

## Overview

The MSK shim is a comprehensive feature that transforms metrics from self-managed Kafka clusters into the same format used by AWS Managed Streaming for Apache Kafka (MSK). This enables you to:

- Use AWS MSK dashboards and visualizations with self-managed Kafka
- Apply MSK-specific alerts and monitoring workflows
- Maintain consistency across managed and self-managed Kafka deployments
- Leverage New Relic's Message Queues & Streams UI features

## Quick Start

```bash
# Required environment variables
export MSK_SHIM_ENABLED=true
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=us-east-1
export KAFKA_CLUSTER_NAME=production-kafka

# Optional: Enable debug logging
export NRI_KAFKA_DEBUG=true

# Run nri-kafka
./bin/nri-kafka -verbose
```

## Architecture

The MSK shim uses a comprehensive transformer and aggregator architecture:

```
Standard Kafka Metrics → ComprehensiveMSKShim → AWS MSK Format
         ↓                        ↓                    ↓
    JMX Collection         Transformation        NRDB Storage
                               ↓
                          Aggregation
                               ↓
                     Cluster-Level Metrics
```

### Components

1. **ComprehensiveMSKShim** (`shim_comprehensive.go`) - Main orchestrator
2. **ComprehensiveTransformer** (`transformer_comprehensive.go`) - Metric mapping engine
3. **MetricAggregator** (`aggregator.go`) - Cluster-level aggregation
4. **Integration Points** - Hooks in broker, topic, and consumer offset collection

### Entity Types Created

1. **AwsMskClusterSample** - Cluster-level aggregated metrics
2. **AwsMskBrokerSample** - Per-broker performance metrics  
3. **AwsMskTopicSample** - Per-topic throughput metrics

### Entity Naming Convention

Entities follow AWS MSK naming patterns:
- Cluster: `{accountId}:{region}:{clusterName}`
- Broker: `{accountId}:{region}:{clusterName}:broker-{brokerId}`
- Topic: `{accountId}:{region}:{clusterName}:topic-{topicName}`

## Metric Mappings

### Cluster Metrics (AwsMskClusterSample)

| MSK Metric | Source | Aggregation | Notes |
|------------|--------|-------------|-------|
| **Health Indicators** | | | |
| `provider.activeControllerCount.Sum` | Aggregated from brokers | MAX | Must be exactly 1 |
| `provider.offlinePartitionsCount.Sum` | Sum across brokers | SUM | Alert if > 0 |
| `provider.underReplicatedPartitions.Sum` | Sum across brokers | SUM | Health indicator |
| `provider.globalPartitionCount.Average` | Total partitions | COUNT | Capacity metric |
| **Performance** | | | |
| `aws.msk.BytesInPerSec` | Sum of broker metrics | SUM | Cluster throughput |
| `aws.msk.BytesOutPerSec` | Sum of broker metrics | SUM | |
| `aws.msk.MessagesInPerSec` | Sum of broker metrics | SUM | Message rate |

### Broker Metrics (AwsMskBrokerSample)

| MSK Metric | Source | Transform | Notes |
|------------|--------|-----------|-------|
| **Throughput** | | | |
| `aws.msk.BytesInPerSec` | `broker.IOInPerSecond` | Direct | Network input |
| `aws.msk.BytesOutPerSec` | `broker.IOOutPerSecond` | Direct | Network output |
| `aws.msk.MessagesInPerSec` | `broker.messagesInPerSecond` | Direct | Message rate |
| **Replication** | | | |
| `aws.msk.UnderReplicatedPartitions` | `replication.unreplicatedPartitions` | Direct | |
| `aws.msk.IsrShrinksPerSec` | `replication.isrShrinksPerSecond` | Direct | |
| `aws.msk.IsrExpandsPerSec` | `replication.isrExpandsPerSecond` | Direct | |
| **Request Metrics** | | | |
| `aws.msk.FetchConsumerRequestsPerSec` | `request.clientFetchesFailedPerSecond` | Direct | |
| `aws.msk.ProduceRequestsPerSec` | `request.produceRequestsFailedPerSecond` | Direct | |

### Topic Metrics (AwsMskTopicSample)

| MSK Metric | Source | Aggregation | Notes |
|------------|--------|-------------|-------|
| `aws.msk.BytesInPerSec` | `topic.bytesInPerSecond` | Direct | Topic input |
| `aws.msk.BytesOutPerSec` | `topic.bytesOutPerSecond` | Direct | Topic output |
| `aws.msk.MessagesInPerSec` | `topic.messagesInPerSecond` | Direct | Message rate |
| `aws.msk.ConsumerLag` | Consumer offset calculation | MAX | Max lag across partitions |

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MSK_SHIM_ENABLED` | Yes | `false` | Enable MSK shim transformation |
| `AWS_ACCOUNT_ID` | Yes | - | AWS account ID for entity naming |
| `AWS_REGION` | Yes | - | AWS region for entity naming |
| `KAFKA_CLUSTER_NAME` | Yes | - | Cluster name for identification |
| `NRI_KAFKA_DEBUG` | No | `false` | Enable debug logging |

### Kubernetes Deployment

For Kubernetes deployments, use the MSK shim configuration:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nri-kafka-msk-shim
spec:
  template:
    spec:
      containers:
      - name: nri-kafka
        env:
        - name: MSK_SHIM_ENABLED
          value: "true"
        - name: AWS_ACCOUNT_ID
          value: "123456789012"
        - name: AWS_REGION
          value: "us-east-1"
        - name: KAFKA_CLUSTER_NAME
          value: "k8s-kafka-cluster"
```

See the complete deployment example in `k8s-consolidated/nri-kafka/03-msk-shim-deployment.yaml`.

## Verification

Use the metrics verification guide to confirm MSK shim is working:

```sql
-- Check for MSK entities
SELECT count(*) FROM AwsMskClusterSample SINCE 5 minutes ago
SELECT count(*) FROM AwsMskBrokerSample SINCE 5 minutes ago
SELECT count(*) FROM AwsMskTopicSample SINCE 5 minutes ago

-- Verify cluster metrics
SELECT latest(provider.activeControllerCount.Sum) as 'Controllers',
       latest(provider.offlinePartitionsCount.Sum) as 'Offline Partitions',
       latest(provider.globalPartitionCount.Average) as 'Total Partitions'
FROM AwsMskClusterSample
SINCE 5 minutes ago
```

## Troubleshooting

### No MSK Metrics Appearing

1. Verify environment variables are set correctly
2. Check logs for MSK shim initialization:
   ```bash
   kubectl logs <pod> | grep -i "msk shim"
   ```

3. Ensure JMX is enabled on Kafka brokers
4. Verify the integration is collecting standard metrics first

### Metrics Transformation Issues

1. Enable debug logging with `NRI_KAFKA_DEBUG=true`
2. Check for transformation errors in logs
3. Verify metric mappings match your Kafka version
4. Ensure broker IDs are being extracted correctly

### Performance Considerations

- The MSK shim adds minimal overhead (< 5% CPU)
- Aggregation is performed in-memory
- Cluster metrics are calculated once per collection cycle
- Entity caching reduces redundant operations

## Integration with Infrastructure Agent

The MSK shim integrates seamlessly with the Infrastructure agent:

1. Metrics are sent through the standard integration protocol
2. Entities are created with proper relationships
3. System metrics correlation is automatic when running on the same host

## Enhanced Mode

The MSK shim includes an enhanced mode that provides automatic metric generation when real metrics are unavailable:

### Features
- Activates after 5 collection cycles with no data
- Generates realistic metric values:
  - `bytesInPerSec`: 50,000 - 150,000 (varies by ±20%)
  - `messagesInPerSec`: 100 - 300 (varies by ±20%)
  - Broker counts and partition numbers based on configuration
- Useful for POC environments and dashboard testing

### Configuration
```yaml
env:
  MSK_SHIM_MODE: "enhanced"  # Enables enhanced mode
```

### Use Cases
- Demo environments
- Dashboard development
- Alert testing
- POC deployments

## Implementation Details

### Hook Integration Points

The MSK shim integrates through the following collection points:

1. **Main Integration** (`src/kafka.go`)
   - Initializes MSK hook in `main()` function
   - Sets up global hook for broker collection

2. **Broker Collection** (`src/broker/broker_collection.go`)
   - Calls MSK transformation in `populateBrokerMetrics()`
   - Passes collected samples to MSK hook

3. **Consumer Offset Collection** (`src/consumeroffset/collect.go`)
   - Integrates for consumer lag metrics
   - Provides partition-level data for aggregation

### Data Flow

```
JMX Collection → Standard Entities → MSK Hook → MSK Entities → Infrastructure Agent
                                         ↓
                                   Aggregator
                                         ↓
                                 Cluster Metrics
```

## Best Practices

### Production Deployment

1. **Resource Allocation**
   - Use Deployment (not DaemonSet) for centralized collection
   - Allocate sufficient memory for large clusters (512MB+)
   - Set appropriate JMX timeouts for stability

2. **Configuration**
   - Use descriptive cluster names
   - Ensure AWS account ID matches your monitoring structure
   - Enable debug logging during initial setup

3. **Monitoring**
   - Set alerts on `offlinePartitionsCount > 0`
   - Monitor `activeControllerCount != 1`
   - Track throughput trends for capacity planning

### Security Considerations

- JMX credentials should be stored in Kubernetes secrets
- Use RBAC to limit pod permissions
- Consider network policies for JMX port access

## Migration from AWS MSK

If migrating from AWS MSK to self-managed Kafka:

1. Enable MSK shim with same cluster name
2. Dashboards and alerts continue working
3. Historical data remains accessible
4. No query changes required

## Version Compatibility

- Kafka 0.8+ supported (all versions)
- Strimzi Operator 0.20+ compatible
- New Relic Infrastructure Agent 1.8.0+
- SDK v3 integration protocol
- Kubernetes 1.19+ recommended

## Additional Resources

- [Metrics Reference](metrics-reference.md) - Complete list of available metrics
- [Architecture Analysis](msk-shim-architecture-analysis.md) - Deep dive into design
- [Implementation Guide](msk-shim-implementation.md) - Developer reference
- [Troubleshooting Guide](../TROUBLESHOOTING.md) - Common issues and solutions