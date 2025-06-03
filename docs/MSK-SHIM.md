# New Relic MSK Shim for nri-kafka

Transform self-managed Kafka metrics to be compatible with New Relic's AWS MSK Message Queues & Streams UI.

## Quick Start

```bash
# Required environment variables
export MSK_SHIM_ENABLED=true
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=us-east-1
export KAFKA_CLUSTER_NAME=production-kafka

# Optional enhancements
export CONSUMER_LAG_ENRICHMENT=true
export SYSTEM_SAMPLE_CORRELATION=true
export DISK_MOUNT_REGEX="data|kafka|storage"
export LOG_MOUNT_REGEX="logs|kafka-logs"

# Run nri-kafka
./bin/nri-kafka -verbose
```

## Architecture

The MSK shim intercepts Kafka metrics and transforms them into AWS MSK-compatible entities:

```
JMX Collection → MSK Shim Transform → New Relic Entities
                      ↓
                Infrastructure Agent (System Metrics)
```

### Entity Types

1. **AwsMskClusterSample** - Cluster-level health and capacity metrics
2. **AwsMskBrokerSample** - Per-broker performance and resource metrics  
3. **AwsMskTopicSample** - Per-topic throughput and configuration

### Entity GUID Format

All entities use the standard New Relic format:
```
{accountId}|INFRA|{entityType}|{base64(identifier)}
```

Examples:
- Cluster: `123456789012|INFRA|AWSMSKCLUSTER|cHJvZHVjdGlvbi1rYWZrYQ==`
- Broker: `123456789012|INFRA|AWSMSKBROKER|cHJvZHVjdGlvbi1rYWZrYS9icm9rZXItMQ==`
- Topic: `123456789012|INFRA|AWSMSKTOPIC|cHJvZHVjdGlvbi1rYWZrYS9vcmRlcnM=`

## Metric Mappings

### Cluster Metrics (AwsMskClusterSample)

| MSK Metric | Source | Aggregation | Notes |
|------------|--------|-------------|-------|
| **Health Indicators** | | | |
| `provider.activeControllerCount.Sum` | `kafka.controller:type=KafkaController,name=ActiveControllerCount` | MAX | Must be exactly 1 |
| `provider.offlinePartitionsCount.Sum` | `kafka.controller:type=KafkaController,name=OfflinePartitionsCount` | MAX | Alert if > 0 |
| `provider.underReplicatedPartitions.Sum` | `kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions` | **MAX** | Fixed from SUM |
| `provider.underMinIsrPartitionCount.Sum` | Calculated from ISR < min.insync.replicas | SUM | Requires Admin API |
| **Capacity** | | | |
| `provider.globalPartitionCount` | Sum of all topic partitions | SUM | |
| `provider.globalTopicCount` | Count of unique topics | COUNT | |
| **Performance** | | | |
| `provider.bytesInPerSec.Sum` | `kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec` | SUM | Cluster throughput |
| `provider.bytesOutPerSec.Sum` | `kafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec` | SUM | |
| `provider.zookeeperNetworkRequestLatencyMsMean.Average` | `kafka.server:type=ZooKeeperClientMetrics,name=ZooKeeperRequestLatencyMs` | AVG | Default: 10ms |

### Broker Metrics (AwsMskBrokerSample)

| MSK Metric | Source | Transform | Notes |
|------------|--------|-----------|-------|
| **Throughput** | | | |
| `provider.bytesInPerSec.Average` | `kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec` | Direct | |
| `provider.bytesOutPerSec.Average` | `kafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec` | Direct | |
| `provider.messagesInPerSec.Average` | `kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec` | Direct | |
| `provider.bytesRejectedPerSec.Average` | `kafka.server:type=BrokerTopicMetrics,name=BytesRejectedPerSec` | Direct | Default: 0 |
| **Latency (per request type)** | | | |
| `provider.fetchConsumerLocalTimeMsMean.Average` | `kafka.network:type=RequestMetrics,name=LocalTimeMs,request=FetchConsumer` | Direct | Broker processing |
| `provider.fetchConsumerRequestQueueTimeMsMean.Average` | `kafka.network:type=RequestMetrics,name=RequestQueueTimeMs,request=FetchConsumer` | Direct | Queue wait |
| `provider.fetchConsumerResponseSendTimeMsMean.Average` | `kafka.network:type=RequestMetrics,name=ResponseSendTimeMs,request=FetchConsumer` | Direct | Response time |
| `provider.fetchConsumerTotalTimeMsMean.Average` | `kafka.network:type=RequestMetrics,name=TotalTimeMs,request=FetchConsumer` | Direct | Total latency |
| `provider.produce*` | Same pattern with `request=Produce` | Direct | All 4 metrics |
| **Resources** | | | |
| `provider.cpuUser.Average` | SystemSample.cpuUserPercent | Correlate | Infra agent |
| `provider.memoryUsed.Average` | SystemSample.memoryUsedPercent | Correlate | |
| `provider.kafkaDataLogsDiskUsed.Average` | StorageSample.diskUsedPercent | Filter by regex | DISK_MOUNT_REGEX |
| `provider.networkRxThroughput.Average` | NetworkSample.receiveBytesPerSecond | Correlate | |
| **Handler Utilization** | | | |
| `provider.requestHandlerAvgIdlePercent.Average` | `kafka.server:type=KafkaRequestHandlerPool,name=RequestHandlerAvgIdlePercent` | × 100 if ≤ 1 | Convert fraction |
| `provider.networkProcessorAvgIdlePercent.Average` | `kafka.network:type=SocketServer,name=NetworkProcessorAvgIdlePercent` | × 100 if ≤ 1 | |
| **Throttling** | | | |
| `provider.produceThrottleTime.Average` | Multiple locations (version-dependent) | Coalesce | See throttle section |
| `provider.fetchThrottleTime.Average` | `kafka.server:type=KafkaRequestHandlerPool,name=FetchThrottleTimeMs` | Direct | |

### Topic Metrics (AwsMskTopicSample)

| MSK Metric | Source | Aggregation | Notes |
|------------|--------|-------------|-------|
| **Throughput** | | | |
| `provider.bytesInPerSec.Average` | `kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec,topic=*` | SUM across brokers | Per-topic total |
| `provider.bytesOutPerSec.Average` | `kafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec,topic=*` | SUM | |
| `provider.messagesInPerSec.Average` | `kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec,topic=*` | SUM | |
| **Configuration** | | | |
| `provider.partitionCount` | Topic metadata | Direct | |
| `provider.replicationFactor` | Topic metadata | Direct | |
| `provider.minInSyncReplicas` | Topic config API | Direct | Requires Admin API |
| **Consumer Lag** | | | |
| `provider.consumerLag` | KafkaOffsetSample | SUM | If enabled |
| `provider.consumerLagSeconds` | consumerLag ÷ messagesPerSec | Calculate | With null guard |

## Critical Implementation Details

### 1. Aggregation Methods (FIXED)

```go
// CORRECT: Use MAX for controller metrics
maxUnderReplicated := 0
for _, broker := range brokers {
    if broker.UnderReplicatedPartitions > maxUnderReplicated {
        maxUnderReplicated = broker.UnderReplicatedPartitions
    }
}
entity.SetMetric("provider.underReplicatedPartitions.Sum", maxUnderReplicated, metric.GAUGE)
```

### 2. Handler Percentage Conversion

```go
// Convert fraction to percentage if needed
if handlerIdle <= 1.0 {
    handlerIdle = handlerIdle * 100  // 0.85 → 85%
}
```

### 3. Throttle Metrics (Version Handling)

Different Kafka versions expose throttle metrics in different locations:

```yaml
# Kafka 2.4+
- object_name: "kafka.server:type=KafkaRequestHandlerPool,name=*ThrottleTimeMs"

# Kafka < 2.4
- object_name: "kafka.server:type=BrokerTopicMetrics,name=*ThrottleTimeMs"

# Request-specific
- object_name: "kafka.network:type=RequestMetrics,name=ThrottleTimeMs,request=*"
```

### 4. Disk Mount Detection

The shim auto-detects Kafka directories in this order:
1. Read `log.dirs` from `/etc/kafka/server.properties`
2. Check common paths: `/var/kafka-logs`, `/data/kafka`
3. Scan `/proc/mounts` for kafka-related paths
4. Use provided DISK_MOUNT_REGEX

### 5. Admin API Fallback

For metrics not available via JMX (e.g., min.insync.replicas in Kafka < 2.7):

```go
if minISR < 0 && adminHelper != nil {
    minISR, _ = adminHelper.GetMinISRForTopic(topicName)
}
```

## Configuration

### Required JMX Beans

Create `jmx-config.yml`:

```yaml
collect:
  # Controller metrics
  - domain: "kafka.controller"
    beans:
      - query: "kafka.controller:type=KafkaController,name=*"
      - query: "kafka.controller:type=ControllerStats,name=*"
  
  # Broker metrics
  - domain: "kafka.server"
    beans:
      - query: "kafka.server:type=BrokerTopicMetrics,name=*"
      - query: "kafka.server:type=BrokerTopicMetrics,name=*,topic=*"
      - query: "kafka.server:type=ReplicaManager,name=*"
      - query: "kafka.server:type=KafkaRequestHandlerPool,name=*"
      - query: "kafka.server:type=ZooKeeperClientMetrics,name=*"
  
  # Network metrics
  - domain: "kafka.network"
    beans:
      - query: "kafka.network:type=RequestMetrics,name=*,request=*"
      - query: "kafka.network:type=SocketServer,name=*"
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MSK_SHIM_ENABLED` | Yes | false | Enable MSK shim |
| `AWS_ACCOUNT_ID` | Yes | - | 12-digit account ID |
| `AWS_REGION` | Yes | - | AWS region (e.g., us-east-1) |
| `KAFKA_CLUSTER_NAME` | Yes | - | Cluster identifier |
| `ENVIRONMENT` | No | - | Environment tag |
| `CONSUMER_LAG_ENRICHMENT` | No | false | Enable consumer lag metrics |
| `SYSTEM_SAMPLE_CORRELATION` | No | true | Correlate system metrics |
| `DISK_MOUNT_REGEX` | No | auto | Regex for data directories |
| `LOG_MOUNT_REGEX` | No | auto | Regex for log directories |
| `AUTO_DETECT_DISK_MOUNTS` | No | true | Auto-detect disk mounts |
| `USE_ADMIN_API` | No | true | Use Admin API for configs |
| `ENABLE_BROKER_TOPIC_METRICS_V2` | No | false | Enable V2 metrics |

## Build & Deploy

### Requirements
- Go 1.20+ (for building)
- JMX enabled on Kafka brokers
- New Relic Infrastructure agent (for system metrics)

### Build Options

#### Docker (Recommended)
```bash
docker build -f Dockerfile.msk -t nri-kafka-msk .
docker run --env-file msk.env nri-kafka-msk
```

#### Local Build
```bash
go mod tidy
make build
# OR
./build-msk.sh
```

### Deployment

1. **Configure Integration**
   ```bash
   cp kafka-msk-config.yml.sample /etc/newrelic-infra/integrations.d/kafka-config.yml
   ```

2. **Set Environment**
   ```bash
   # /etc/newrelic-infra/integrations.d/kafka-env
   MSK_SHIM_ENABLED=true
   AWS_ACCOUNT_ID=123456789012
   AWS_REGION=us-east-1
   KAFKA_CLUSTER_NAME=production
   ```

3. **Restart Agent**
   ```bash
   sudo systemctl restart newrelic-infra
   ```

## Validation

### NRQL Queries

```sql
-- Check entities exist
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
SELECT count(*) WHERE provider.clusterName = 'production'

-- Validate cluster health
FROM AwsMskClusterSample
SELECT latest(provider.activeControllerCount.Sum) as 'Controllers',
       latest(provider.underReplicatedPartitions.Sum) as 'Under-replicated',
       latest(provider.offlinePartitionsCount.Sum) as 'Offline'
WHERE provider.clusterName = 'production'

-- Check broker metrics
FROM AwsMskBrokerSample
SELECT average(provider.bytesInPerSec.Average) as 'Bytes In',
       average(provider.cpuUser.Average) as 'CPU %',
       average(provider.kafkaDataLogsDiskUsed.Average) as 'Disk %'
WHERE provider.clusterName = 'production'
FACET provider.brokerId

-- Verify latency metrics
FROM AwsMskBrokerSample
SELECT average(provider.fetchConsumerTotalTimeMsMean.Average) as 'Fetch Latency',
       average(provider.produceTotalTimeMsMean.Average) as 'Produce Latency'
WHERE provider.clusterName = 'production'
```

### UI Navigation

1. Go to **Message Queues & Streams**
2. Filter: Provider = AWS, Service = Kafka
3. Select your cluster
4. Verify all charts populate

### Expected Metrics

✅ **Cluster View**:
- Active Controllers: 1
- Offline Partitions: 0
- Under-replicated: (actual count)
- Throughput charts

✅ **Broker View**:
- CPU/Memory/Disk utilization
- Request latency breakdown
- Handler utilization
- Network throughput

✅ **Topic View**:
- Top 20 topics by throughput
- Partition counts
- Consumer lag (if enabled)

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| No MSK entities | Shim not enabled | Set `MSK_SHIM_ENABLED=true` |
| Missing latency metrics | RequestMetrics not enabled | Add beans to JMX config |
| Zero disk usage | Wrong mount regex | Check `DISK_MOUNT_REGEX` pattern |
| No system metrics | Hostname mismatch | Verify Infrastructure agent hostname |
| Missing minISR | Admin API disabled | Set `USE_ADMIN_API=true` |
| Zero throttle metrics | Wrong Kafka version beans | Include all throttle bean variants |

### Debug Logging

```bash
# Enable verbose mode
VERBOSE=1 /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka

# Check logs
grep "MSK shim" /var/log/newrelic-infra/newrelic-infra.log
```

### Performance Tuning

- **Memory**: ~50MB overhead per integration instance
- **CPU**: <2% per broker monitored
- **Interval**: 30s recommended (configurable)
- **JMX queries**: Batched for efficiency

## Implementation Files

### Core Components
- `src/msk/shim.go` - Main orchestrator
- `src/msk/transformer.go` - Metric transformation
- `src/msk/guid.go` - Entity GUID generation
- `src/msk/aggregator.go` - Cluster-level aggregation
- `src/msk/config.go` - Configuration management

### Enhancement Components
- `src/msk/system_correlator.go` - System metrics correlation
- `src/msk/consumer_lag_enrichment.go` - Consumer lag calculation
- `src/msk/admin_api_helper.go` - Admin API fallback
- `src/msk/disk_detector.go` - Disk mount auto-detection
- `src/msk/throttle_metrics_helper.go` - Throttle metric handling

### Configuration Files
- `kafka-msk-config.yml.sample` - Integration config example
- `jmx-config-msk.yml` - Required JMX beans

## Version Compatibility

| Component | Version | Notes |
|-----------|---------|-------|
| Kafka | 0.8+ | Some metrics require 2.0+ |
| Go | 1.20+ | For building |
| nri-kafka | 2.0+ | Base integration |
| Infrastructure Agent | 1.20+ | For system metrics |

## Contributing

When adding new metrics:
1. Add to appropriate entity in `transformer.go`
2. Update aggregator if cluster-level
3. Add JMX bean to config if needed
4. Document in this file
5. Add validation test

## Support

- [GitHub Issues](https://github.com/newrelic/nri-kafka/issues)
- [New Relic Support](https://support.newrelic.com)
- [Community Forum](https://forum.newrelic.com)