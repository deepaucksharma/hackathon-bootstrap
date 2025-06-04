# MSK Shim Architecture Analysis

## Overview

The New Relic Kafka integration includes an MSK (Amazon Managed Streaming for Apache Kafka) shim layer that intercepts and transforms standard Kafka metrics into AWS MSK-compatible format. The shim provides compatibility with AWS MSK monitoring dashboards while collecting metrics from any Kafka deployment.

## Enhanced Files Discovery

Three files with "_enhanced" suffix were found in the `src/msk/` directory:

1. **transformer_enhanced.go** - Enhanced metric transformation with fallback values
2. **shim_enhanced.go** - Enhanced shim with auto-switching capability  
3. **integration_enhanced.go** - Enhanced integration hooks with metric generation support

## Architecture Components

### 1. Core Shim Layer (`src/msk/shim.go`)

The main `Shim` struct provides:
- Integration with New Relic SDK
- Configuration management via `Config`
- Metric aggregation via `MetricAggregator`
- Entity caching for performance
- Transformer delegation
- Consumer lag enrichment support

Key methods:
- `TransformBrokerMetrics()` - Transforms broker metrics to MSK format
- `TransformTopicMetrics()` - Transforms topic metrics to MSK format
- `ProcessConsumerOffset()` - Processes consumer offset data
- `CreateClusterEntity()` - Creates cluster-level entity with aggregated metrics
- `Flush()` - Finalizes collection and resets aggregator

### 2. Enhanced Shim Layer (`src/msk/shim_enhanced.go`)

The `EnhancedShim` extends the base shim with:
- Auto-detection of missing metrics
- Automatic switching between simple and enhanced transformers
- Metric generation capabilities when real metrics are unavailable
- Support for `MSK_ENHANCED_MODE` environment variable

Key features:
- Monitors metric collection attempts
- Auto-switches to enhanced mode after 5 failed attempts
- Supports both `SimpleTransformer` and `EnhancedTransformer`

### 3. Transformer Layers

#### Simple Transformer (`transformer_simple.go`)
- Basic metric mapping from Kafka to MSK format
- Direct 1:1 metric transformations
- No fallback values

#### Enhanced Transformer (`transformer_enhanced.go`)
- Generates realistic fallback metrics when real data is unavailable
- Provides simulated metrics with realistic variations:
  - Throughput: 50KB-150KB/s for bytes in/out
  - Messages: 100-500 msg/s
  - Latency: 5-20ms for fetch, 3-13ms for produce
  - System: 15-40% CPU, 30-60% memory
  - Consumer lag: 1K-6K messages
- Updates simulated metrics with 5-10% variation on each collection

### 4. Integration Hooks (`src/msk/integration.go`)

The `IntegrationHook` provides:
- Global singleton pattern via `GlobalMSKHook`
- Integration points into the standard Kafka collection flow
- Broker and topic data transformation
- JMX bean validation
- Consumer offset processing

### 5. Metric Interception Flow

1. **Initialization** (in `kafka.go`):
   ```go
   // Set default MSK environment variables
   setDefaultMSKEnvironment()
   
   // Initialize MSK integration hook (always active)
   mskHook := msk.NewIntegrationHook(kafkaIntegration)
   ```

2. **Broker Collection** (in `broker/broker_collection.go`):
   - Standard metrics are collected into a temporary sample
   - If MSK hook is enabled, metrics are transformed:
     ```go
     if msk.GlobalMSKHook != nil && msk.GlobalMSKHook.IsEnabled() {
         // Transform to MSK format
         msk.GlobalMSKHook.TransformBrokerData(broker, brokerData)
     }
     ```

3. **Topic Collection**:
   - Similar interception pattern for topic metrics
   - Metrics collected and transformed if MSK hook is active

4. **Finalization**:
   - Cluster entity created with aggregated metrics
   - MSK hook finalized before publishing

## Key Design Patterns

### 1. Non-Invasive Integration
The MSK shim operates as an interceptor layer that:
- Doesn't modify core collection logic
- Transforms metrics after collection
- Falls back to regular collection on errors

### 2. Entity Model Transformation
- Standard Kafka entities → MSK-specific entities
- Adds AWS-specific attributes (ARN, Account ID, Region)
- Generates consistent GUIDs for entity correlation

### 3. Metric Aggregation
- Broker-level metrics aggregated to cluster level
- Topic metrics aggregated across brokers
- Consumer lag metrics enriched with additional calculations

### 4. Fallback Strategy
The enhanced mode provides:
- Automatic detection of missing metrics
- Realistic metric generation for demos/testing
- Seamless switching between real and simulated data

## Environment Variables

The integration uses several environment variables:

- `MSK_SHIM_ENABLED` - Enables MSK shim (default: true)
- `MSK_ENHANCED_MODE` - Enables enhanced mode with metric generation
- `MSK_GENERATE_METRICS` - Alternative flag for enhanced mode
- `KAFKA_CLUSTER_NAME` - Cluster name (default: "default-kafka-cluster")
- `MSK_CLUSTER_ARN` - AWS MSK cluster ARN
- `AWS_ACCOUNT_ID` - AWS account ID
- `AWS_REGION` - AWS region
- `ENVIRONMENT` - Environment name (default: "production")
- `CONSUMER_LAG_ENRICHMENT` - Enable consumer lag enrichment (default: true)

## Metric Mappings

The shim transforms standard Kafka metrics to MSK-compatible names:

### Broker Metrics
- `broker.bytesInPerSecond` → `aws.msk.BytesInPerSec`
- `broker.bytesOutPerSecond` → `aws.msk.BytesOutPerSec`
- `broker.messagesInPerSecond` → `aws.msk.MessagesInPerSec`
- `replication.unreplicatedPartitions` → `aws.msk.UnderReplicatedPartitions`
- `request.avgTimeFetch` → `aws.msk.FetchConsumerTotalTimeMs`
- `request.avgTimeProduceRequest` → `aws.msk.ProduceTotalTimeMs`
- `system.cpuPercent` → `aws.msk.CpuUser`

### Topic Metrics
- `topic.bytesInPerSecond` → `provider.bytesInPerSec.Sum`
- `topic.bytesOutPerSecond` → `provider.bytesOutPerSec.Sum`
- `topic.messagesInPerSecond` → `aws.msk.MessagesInPerSec`
- `topic.partitionsCount` → `aws.msk.PartitionCount`

## Use Cases

1. **AWS MSK Compatibility**: Enables standard Kafka deployments to report metrics in MSK format
2. **Demo/Testing**: Enhanced mode generates realistic metrics without real Kafka cluster
3. **Migration**: Helps organizations transition between self-managed Kafka and AWS MSK
4. **Unified Monitoring**: Single integration for both standard Kafka and MSK deployments

## Summary

The MSK shim provides a sophisticated interception and transformation layer that:
- Seamlessly integrates with the existing Kafka collection flow
- Transforms metrics to AWS MSK format without modifying core logic
- Provides fallback metric generation for demos and testing
- Supports both real-time collection and simulated data
- Maintains backward compatibility with standard Kafka monitoring

The enhanced files add an additional layer of functionality for scenarios where real metrics may not be available, making the integration more robust and versatile for various deployment scenarios.