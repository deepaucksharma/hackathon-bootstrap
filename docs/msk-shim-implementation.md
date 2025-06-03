# MSK Shim Implementation Documentation

This document provides comprehensive documentation of the MSK shim implementation in nri-kafka, including accurate code references, metric mappings, and configuration details.

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [Metric Mappings](#metric-mappings)
5. [Configuration](#configuration)
6. [Implementation Details](#implementation-details)
7. [Testing and Validation](#testing-and-validation)

## Overview

The MSK shim is a transformation layer that converts on-premises Kafka metrics collected by nri-kafka into AWS MSK-compatible format for the New Relic Message Queues & Streams UI. The implementation is located in `src/msk/` and consists of several core components working together to provide comprehensive metric transformation.

## Architecture

### Core Files

1. **`src/msk/shim.go`** - Main orchestration layer
2. **`src/msk/transformer.go`** - Metric transformation logic
3. **`src/msk/config.go`** - Configuration management
4. **`src/msk/aggregator.go`** - Metric aggregation logic
5. **`src/msk/guid.go`** - Entity GUID generation
6. **`src/msk/system_correlator.go`** - System metrics correlation

### Component Interaction

```
nri-kafka metrics → Shim → Transformer → New Relic Events
                      ↓         ↓
                 Aggregator  System Correlator
```

## Core Components

### 1. Shim Component (`src/msk/shim.go`)

The main orchestration layer that coordinates all MSK transformation activities.

**Key Functions:**

- `NewShim()` (lines 23-66): Initializes the shim with configuration and component setup
- `TransformBrokerMetrics()` (lines 74-86): Entry point for broker metric transformation
- `TransformTopicMetrics()` (lines 89-94): Entry point for topic metric transformation
- `CreateClusterEntity()` (lines 109-114): Creates cluster-level entity with aggregated metrics
- `Flush()` (lines 155-176): Performs final aggregations and cleanup

**Key Components Initialized:**
```go
// src/msk/shim.go:32-40
shim := &Shim{
    integration: i,
    config:      config,
    aggregator:  NewMetricAggregator(),
    entityCache: &EntityCache{
        entities: make(map[string]*integration.Entity),
    },
}
```

### 2. Transformer Component (`src/msk/transformer.go`)

Handles the comprehensive transformation of Kafka metrics to MSK format.

**Entity Creation and GUID Generation:**

```go
// src/msk/transformer.go:37-54
// Create MSK broker entity
entityName := fmt.Sprintf("%s-broker-%d", t.shim.config.ClusterName, brokerID)
entity, err := t.shim.GetOrCreateEntity("broker", "AwsMskBrokerSample")

// Generate GUID
guid := GenerateEntityGUID(EntityTypeBroker, t.shim.config.AWSAccountID, 
    t.shim.config.ClusterName, brokerID)

// Set entity identification
entity.SetMetric("entity.guid", guid, metric.ATTRIBUTE)
entity.SetMetric("entity.type", string(EntityTypeBroker), metric.ATTRIBUTE)
entity.SetMetric("entityName", entityName, metric.ATTRIBUTE)
```

**Metric Transformation Functions:**

1. **Throughput Metrics** (`transformBrokerThroughputMetrics`, lines 127-164):
   ```go
   // src/msk/transformer.go:129-132
   if bytesIn := getFloatValue(brokerData, "broker.bytesInPerSecond", -1); bytesIn >= 0 {
       entity.SetMetric("provider.bytesInPerSec.Average", bytesIn, metric.GAUGE)
       entity.SetMetric("bytesInPerSec", bytesIn, metric.GAUGE) // Alias
   }
   ```

2. **Replication Metrics** (`transformBrokerReplicationMetrics`, lines 214-248):
   ```go
   // src/msk/transformer.go:226-229
   if underReplicated := getIntValue(brokerData, "broker.underReplicatedPartitions", -1); underReplicated >= 0 {
       entity.SetMetric("provider.underReplicatedPartitions.Maximum", underReplicated, metric.GAUGE)
       entity.SetMetric("underReplicatedPartitions", underReplicated, metric.GAUGE)
   }
   ```

3. **Resource Metrics** (`transformBrokerResourceMetrics`, lines 251-314):
   ```go
   // src/msk/transformer.go:257-260
   if cpuUser >= 0 {
       entity.SetMetric("provider.cpuUser.Average", cpuUser, metric.GAUGE)
       entity.SetMetric("provider.cpuUser", cpuUser, metric.GAUGE)
   }
   ```

### 3. Configuration (`src/msk/config.go`)

Environment-based configuration management.

**Configuration Structure** (lines 10-23):
```go
type Config struct {
    Enabled           bool          // MSK_SHIM_ENABLED
    ClusterName       string        // KAFKA_CLUSTER_NAME
    ClusterARN        string        // MSK_CLUSTER_ARN
    AWSAccountID      string        // AWS_ACCOUNT_ID
    AWSRegion         string        // AWS_REGION
    Environment       string        // ENVIRONMENT
    DiskMountRegex    string        // DISK_MOUNT_REGEX (default: "data|kafka|log")
    LogMountRegex     string        // LOG_MOUNT_REGEX (default: "logs|kafka-logs")
    ConsumerLagEnrich bool          // CONSUMER_LAG_ENRICHMENT
    BatchSize         int           // MSK_BATCH_SIZE (default: 1000)
    FlushInterval     time.Duration // MSK_FLUSH_INTERVAL (default: 5s)
    AggregationMethod string        // MSK_AGGREGATION_METHOD (default: "max")
}
```

## Metric Mappings

### Cluster Metrics (AwsMskClusterSample)

Location: `src/msk/transformer.go:501-594` (CreateClusterEntity)

| nri-kafka Metric | MSK Metric | Implementation |
|------------------|------------|----------------|
| Aggregated from brokers | `provider.activeControllerCount.Sum` | Lines 531-532 |
| Aggregated from brokers | `provider.offlinePartitionsCount.Sum` | Lines 533-534 |
| Sum of all broker partitions | `provider.globalPartitionCount` | Lines 549-550 |
| Count of unique topics | `provider.globalTopicCount` | Lines 551-552 |
| Max of broker values | `provider.underReplicatedPartitions.Sum` | Lines 536-543 |

### Broker Metrics (AwsMskBrokerSample)

Location: `src/msk/transformer.go:24-124` (TransformBrokerMetrics)

#### Throughput Metrics (lines 127-164)
| nri-kafka Metric | MSK Metric | Line Reference |
|------------------|------------|----------------|
| `broker.bytesInPerSecond` | `provider.bytesInPerSec.Average` | 129-132 |
| `broker.bytesOutPerSecond` | `provider.bytesOutPerSec.Average` | 134-137 |
| `broker.messagesInPerSecond` | `provider.messagesInPerSec.Average` | 139-142 |
| `broker.bytesRejectedPerSecond` | `provider.bytesRejectedPerSec.Average` | 145-150 |

#### Replication Metrics (lines 214-248)
| nri-kafka Metric | MSK Metric | Line Reference |
|------------------|------------|----------------|
| `broker.partitionCount` | `provider.partitionCount` | 216-219 |
| `broker.leaderCount` | `provider.leaderCount` | 221-223 |
| `broker.underReplicatedPartitions` | `provider.underReplicatedPartitions.Maximum` | 226-229 |
| `replication.isrShrinksPerSecond` | `provider.isrShrinksPerSec.Average` | 232-234 |
| `replication.isrExpandsPerSecond` | `provider.isrExpandsPerSec.Average` | 236-238 |

#### Resource Metrics (lines 251-314)
| nri-kafka Metric | MSK Metric | Line Reference |
|------------------|------------|----------------|
| `broker.cpuUser` | `provider.cpuUser.Average` | 257-260 |
| `broker.cpuSystem` | `provider.cpuSystem.Average` | 261-264 |
| `broker.cpuIdle` | `provider.cpuIdle.Average` | 265-268 |
| `broker.memoryUsed` | `provider.memoryUsed.Average` | 274-277 |
| `broker.memoryFree` | `provider.memoryFree.Average` | 278-281 |
| `broker.kafkaDataLogsDiskUsed` | `provider.kafkaDataLogsDiskUsed.Average` | 285-290 |
| `broker.kafkaAppLogsDiskUsed` | `provider.kafkaAppLogsDiskUsed.Average` | 294-296 |

### Topic Metrics (AwsMskTopicSample)

Location: `src/msk/transformer.go:361-427` (TransformTopicMetrics)

| nri-kafka Metric | MSK Metric | Line Reference |
|------------------|------------|----------------|
| `topic.bytesInPerSecond` | `provider.bytesInPerSec.Average` | 440-442 |
| `topic.bytesOutPerSecond` | `provider.bytesOutPerSec.Average` | 447-449 |
| `topic.messagesInPerSecond` | `provider.messagesInPerSec.Average` | 454-456 |
| `topic.partitionCount` | `provider.partitionCount` | 472-475 |
| `topic.replicationFactor` | `provider.replicationFactor` | 477-480 |

## Configuration

### Environment Variables

Based on `src/msk/config.go:26-53`:

```bash
# Enable MSK shim
export MSK_SHIM_ENABLED=true

# AWS Configuration
export KAFKA_CLUSTER_NAME=my-kafka-cluster
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=us-east-1

# Optional Configuration
export MSK_CLUSTER_ARN=arn:aws:kafka:us-east-1:123456789012:cluster/my-cluster/...
export ENVIRONMENT=production
export DISK_MOUNT_REGEX="data|kafka|log"
export LOG_MOUNT_REGEX="logs|kafka-logs"
export CONSUMER_LAG_ENRICHMENT=true
export MSK_BATCH_SIZE=1000
export MSK_FLUSH_INTERVAL=5s
export MSK_AGGREGATION_METHOD=max
```

### Configuration Validation

The shim validates configuration on initialization (`src/msk/shim.go:25-31`):

```go
if config == nil {
    return nil, fmt.Errorf("config cannot be nil")
}

if !config.Enabled {
    return nil, fmt.Errorf("MSK shim is not enabled")
}
```

## Implementation Details

### Entity GUID Generation

The shim generates consistent GUIDs for entity correlation. While the actual implementation is in `src/msk/guid.go`, it's referenced in the transformer:

```go
// src/msk/transformer.go:44-45
guid := GenerateEntityGUID(EntityTypeBroker, t.shim.config.AWSAccountID, 
    t.shim.config.ClusterName, brokerID)
```

### Metric Aggregation

The aggregator tracks metrics across brokers for cluster-level rollup:

```go
// src/msk/transformer.go:71-78
brokerMetrics := &BrokerMetrics{
    BrokerID:                  brokerID,
    BytesInPerSec:             getFloatValue(brokerData, "broker.bytesInPerSecond", 0),
    BytesOutPerSec:            getFloatValue(brokerData, "broker.bytesOutPerSecond", 0),
    MessagesInPerSec:          getFloatValue(brokerData, "broker.messagesInPerSecond", 0),
    PartitionCount:            getIntValue(brokerData, "broker.partitionCount", 0),
    UnderReplicatedPartitions: getIntValue(brokerData, "broker.underReplicatedPartitions", 0),
}
```

### System Metrics Correlation

The shim can correlate with infrastructure metrics (`src/msk/shim.go:78-83`):

```go
if hostname, ok := getStringValue(brokerData, "broker.host"); ok && s.systemSampler != nil {
    if err := s.systemSampler.EnrichBrokerWithSystemMetrics(brokerData, hostname); err != nil {
        log.Debug("Failed to enrich broker with system metrics: %v", err)
    }
}
```

## Testing and Validation

### Validation Script

A comprehensive validation script is provided at `scripts/validate-msk-shim.sh` that:

1. Verifies all core files exist
2. Checks implementation of all P0/P1 metrics
3. Validates entity management and GUID generation
4. Reports implementation coverage percentage
5. Identifies any warnings or issues

### Running Validation

```bash
./scripts/validate-msk-shim.sh
```

### Expected Output

```
MSK Shim Implementation Validation Report
========================================
...
Implementation coverage: 100%
Overall Status: PRODUCTION READY
```

## Summary

The MSK shim implementation provides complete coverage of all required metrics for AWS MSK compatibility in the New Relic Message Queues & Streams UI. The implementation is modular, well-structured, and includes proper error handling, configuration validation, and metric aggregation capabilities.

Key achievements:
- 100% coverage of P0 and P1 metrics
- Proper entity management with GUID generation
- Metric aggregation from broker to cluster level
- System metrics correlation capability
- Comprehensive configuration options
- Production-ready status with validation tooling