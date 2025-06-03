# MSK Shim Reference Guide

## Overview

Transforms on-premises Kafka metrics for New Relic's AWS MSK Message Queues & Streams UI.

**Key Features:**
- Complete P0/P1 metric coverage with correct aggregation (MAX for controllers, SUM for throughput)
- Consumer lag enrichment and system metrics correlation
- V2 metrics support for enhanced monitoring

## Quick Start

### 1. Environment Variables
```bash
export MSK_SHIM_ENABLED="true"
export AWS_ACCOUNT_ID="123456789012"
export AWS_REGION="us-east-1"
export KAFKA_CLUSTER_NAME="my-kafka"
```

### 2. Configuration
```bash
cp kafka-msk-config.yml.sample /etc/newrelic-infra/integrations.d/kafka-config.yml
cp jmx-config-msk.yml /etc/newrelic-infra/integrations.d/jmx-config.yml
```

### 3. Build & Deploy
```bash
docker build -t nri-kafka-msk .
docker run --env-file msk.env nri-kafka-msk
```

## Architecture

```
JMX → MSK Shim → New Relic Entities (Cluster/Broker/Topic)
         ↓
   Infrastructure Agent (System Metrics)
```

## Critical Implementation Details

### Aggregation Methods
- **underReplicatedPartitions**: MAX (not SUM) - Fixed in transformer.go:536-543
- **activeControllerCount**: MAX (ensures exactly 1)
- **bytesInPerSec**: SUM (cluster total)

### Required JMX Beans
```yaml
# Critical for MSK compatibility
- kafka.server:type=BrokerTopicMetrics,name=*
- kafka.controller:type=KafkaController,name=*
- kafka.network:type=RequestMetrics,name=*,request=*
- kafka.server:type=ReplicaManager,name=*
```

### Entity GUIDs
Format: `{accountId}|INFRA|{entityType}|{base64(identifier)}`
- Cluster: `123456789012|INFRA|AWS_MSK_CLUSTER|{base64(clusterName)}`
- Broker: `123456789012|INFRA|AWS_MSK_BROKER|{base64(clusterName/broker-{id})}`
- Topic: `123456789012|INFRA|AWS_MSK_TOPIC|{base64(clusterName/topicName)}`

## Metric Coverage

### Cluster Metrics (AwsMskClusterSample)
| Priority | Metric | Source | Aggregation |
|----------|--------|--------|-------------|
| P0 | activeControllerCount | KafkaController | MAX |
| P0 | offlinePartitionsCount | KafkaController | MAX |
| P0 | underReplicatedPartitions | ReplicaManager | MAX |
| P0 | bytesInPerSec.Sum | BrokerTopicMetrics | SUM |
| P1 | globalPartitionCount | Topic metadata | SUM |

### Broker Metrics (AwsMskBrokerSample)
| Category | Metrics | Status |
|----------|---------|--------|
| Throughput | bytesIn/Out, messagesIn, bytesRejected | ✅ |
| Latency | 8 RequestMetrics (Local, Queue, Send, Total) × 2 types | ✅ |
| Resources | CPU, Memory, Disk (data/log), Network | ✅ |
| Replication | ISR shrinks/expands, leader elections | ✅ |
| Throttling | Produce, Fetch, Request throttle times | ✅ |

### Topic Metrics (AwsMskTopicSample)
| Metric | Aggregation | Implementation |
|--------|-------------|----------------|
| bytesInPerSec | SUM across brokers | ✅ |
| partitionCount | Direct from metadata | ✅ |
| consumerLag | Per consumer group | ✅ (if enabled) |

## Integration Points

1. **Main (kafka.go)**
   ```go
   mskHook := msk.NewIntegrationHook(kafkaIntegration)
   ```

2. **Broker Collection**
   ```go
   mskHook.TransformBrokerData(broker, metricsMap)
   ```

3. **Finalization**
   ```go
   mskHook.Finalize() // Creates cluster entity
   ```

## Configuration Options

### Required
- `MSK_SHIM_ENABLED`: Enable the shim
- `AWS_ACCOUNT_ID`: 12-digit account ID
- `AWS_REGION`: AWS region code
- `KAFKA_CLUSTER_NAME`: Cluster identifier

### Optional
- `CONSUMER_LAG_ENRICHMENT`: Enable consumer lag (default: false)
- `SYSTEM_SAMPLE_CORRELATION`: Correlate system metrics (default: true)
- `DISK_MOUNT_REGEX`: Pattern for data disks (default: "data|kafka")
- `LOG_MOUNT_REGEX`: Pattern for log disks (default: "logs|kafka-logs")
- `ENABLE_BROKER_TOPIC_METRICS_V2`: V2 metrics (default: false)

## Validation

### NRQL Queries
```sql
-- Check entities
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
SELECT count(*) WHERE provider.clusterName = 'my-kafka'

-- Verify health
FROM AwsMskClusterSample SELECT 
  latest(provider.activeControllerCount.Sum),
  latest(provider.underReplicatedPartitions.Sum)
WHERE provider.clusterName = 'my-kafka'
```

### UI Navigation
1. Message Queues & Streams → AWS → Kafka
2. Find your cluster by name
3. Verify all charts populate

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No entities | Check MSK_SHIM_ENABLED=true |
| Missing latency | Enable RequestMetrics beans |
| Wrong aggregation | Update to latest version |
| No system metrics | Check Infrastructure agent |

## Files Structure

### Production Files
- `src/msk/shim.go` - Main orchestrator (enhanced)
- `src/msk/transformer.go` - Metric transformation (comprehensive)
- `src/msk/system_correlator.go` - System metrics (enhanced)
- `src/msk/config.go` - Configuration management
- `src/msk/guid.go` - Entity GUID generation
- `src/msk/aggregator.go` - Metric aggregation

### Reference Files (not for production)
- `src/msk/*_v2.go` - Reference implementations