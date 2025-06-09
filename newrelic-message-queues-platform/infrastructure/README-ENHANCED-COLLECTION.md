# Enhanced Metric Collection System

This enhanced metric collection system provides comprehensive Kafka monitoring capabilities that align with how nri-kafka collects data, while adding structured metric definitions, concurrent processing, and advanced consumer group lag monitoring.

## Overview

The enhanced collection system consists of three main components:

1. **Structured Metric Definitions** (`core/metrics/metric-definitions.js`)
2. **Enhanced Kafka Collector** (`infrastructure/collectors/enhanced-kafka-collector.js`)
3. **Consumer Offset Collector** (`infrastructure/collectors/consumer-offset-collector.js`)

## Features

### 🏗️ Structured Metric Definitions
- JMX-based metric specifications similar to Kafka MBeans
- Validation rules and processing logic
- Collection strategies (per-broker, per-topic, cluster-aggregate)
- Unit conversions and aggregation methods

### 🚀 Enhanced Kafka Collector
- Concurrent metric collection using worker pools
- Per-broker and per-topic detailed metrics
- Connection verification and health checks
- Comprehensive error handling with circuit breakers
- Metric validation and quality assurance

### 👥 Consumer Offset Collector
- Consumer group discovery and monitoring
- Per-partition lag calculation
- Consumer group state tracking
- Lag trend analysis and severity assessment
- Multiple data source support

## Quick Start

### Basic Usage

```javascript
const { EnhancedKafkaCollector, ConsumerOffsetCollector } = require('./infrastructure/collectors');

// Initialize collectors
const kafkaCollector = new EnhancedKafkaCollector({
  brokerWorkerPoolSize: 5,
  topicWorkerPoolSize: 8,
  enableDetailedTopicMetrics: true,
  metricValidation: true
});

const consumerCollector = new ConsumerOffsetCollector({
  lagWarningThreshold: 1000,
  lagCriticalThreshold: 10000,
  lagTrendAnalysis: true
});

// Initialize and collect metrics
await kafkaCollector.initialize();
await consumerCollector.initialize();

const kafkaMetrics = await kafkaCollector.collectEnhancedKafkaMetrics();
const consumerMetrics = await consumerCollector.collectConsumerGroupMetrics();
```

### Running the Demo

```bash
# Run the enhanced collection demo
node examples/enhanced-collection-example.js

# With custom parameters
node examples/enhanced-collection-example.js --cycles=5 --interval=30 --debug

# Run tests
node infrastructure/test-enhanced-collection.js
```

## Metric Definitions

### Broker Metrics
- **Throughput**: `broker.messagesInPerSecond`, `broker.bytesInPerSecond`
- **Network**: `broker.requestsPerSecond`, `broker.networkProcessorIdlePercent`
- **Health**: `broker.underReplicatedPartitions`, `broker.offlinePartitions`
- **Resources**: `broker.cpu.usage`, `broker.memory.usage`, `broker.disk.usage`

### Topic Metrics
- **Throughput**: `topic.messagesInPerSecond`, `topic.bytesInPerSecond`
- **Configuration**: `topic.partitions.count`, `topic.replicationFactor`
- **Storage**: `topic.sizeBytes`

### Consumer Group Metrics
- **Lag**: `consumerGroup.lag`, `consumerGroup.totalLag`, `consumerGroup.maxLag`
- **State**: `consumerGroup.state`, `consumerGroup.memberCount`
- **Performance**: `consumerGroup.messagesConsumedPerSecond`

### Cluster Metrics
- **Summary**: `cluster.brokerCount`, `cluster.topicCount`, `cluster.totalPartitions`
- **Throughput**: `cluster.throughput.messagesPerSecond`, `cluster.throughput.bytesPerSecond`
- **Health**: `cluster.health.score`, `cluster.underReplicatedPartitions`

## Collection Strategies

### Per-Broker Collection
Collects metrics for each broker individually with high parallelism:
```javascript
// Metrics using per-broker strategy
broker.messagesInPerSecond
broker.bytesInPerSecond
broker.underReplicatedPartitions
broker.cpu.usage
```

### Per-Topic Collection
Collects metrics for each topic across the cluster:
```javascript
// Metrics using per-topic strategy
topic.partitions.count
topic.replicationFactor
```

### Per-Topic-Per-Broker Collection
Detailed collection for each topic on each broker (higher overhead):
```javascript
// Metrics using per-topic-per-broker strategy
topic.messagesInPerSecond (per broker)
topic.bytesInPerSecond (per broker)
topic.sizeBytes (per broker)
```

### Consumer Group Collection
Monitors consumer groups and calculates lag metrics:
```javascript
// Metrics using per-consumer-group strategy
consumerGroup.lag (per partition)
consumerGroup.totalLag
consumerGroup.memberCount
```

### Cluster Aggregate Collection
Calculates cluster-wide aggregations from broker data:
```javascript
// Metrics using cluster-aggregate strategy
cluster.brokerCount
cluster.throughput.messagesPerSecond
cluster.health.score
```

## Configuration

### Enhanced Kafka Collector Configuration

```javascript
const config = {
  // Worker pool sizes
  brokerWorkerPoolSize: 5,        // Concurrent broker collections
  topicWorkerPoolSize: 8,         // Concurrent topic collections
  consumerWorkerPoolSize: 3,      // Concurrent consumer collections
  
  // Feature flags
  enableDetailedTopicMetrics: true,     // Per-topic-per-broker collection
  enableConsumerLagCollection: true,    // Consumer group monitoring
  metricValidation: true,               // Validate collected metrics
  
  // Timeouts and retries
  connectionTimeout: 30000,       // Connection verification timeout
  maxRetries: 3,                  // Max retry attempts
  retryDelay: 2000,              // Base retry delay
  backoffMultiplier: 1.5         // Exponential backoff
};
```

### Consumer Offset Collector Configuration

```javascript
const consumerConfig = {
  // Lag thresholds
  lagWarningThreshold: 1000,      // Messages
  lagCriticalThreshold: 10000,    // Messages
  
  // Collection limits
  maxConsumerGroups: 100,         // Maximum groups to monitor
  consumerPoolSize: 5,           // Worker pool size
  
  // Analysis features
  lagTrendAnalysis: true,         // Track lag trends over time
  partitionLevelDetails: true,    // Per-partition lag details
  stateTrackingWindow: '15 minutes ago'  // State change tracking
};
```

## Architecture

### Component Interaction

```
┌─────────────────────┐    ┌─────────────────────┐
│   Metric            │    │   Enhanced Kafka    │
│   Definitions       │◄───│   Collector         │
│                     │    │                     │
│ • Broker Metrics    │    │ • Worker Pools      │
│ • Topic Metrics     │    │ • Concurrent        │
│ • Consumer Metrics  │    │   Collection        │
│ • Cluster Metrics   │    │ • Health Checks     │
└─────────────────────┘    └─────────────────────┘
           │                          │
           │                          │
           ▼                          ▼
┌─────────────────────┐    ┌─────────────────────┐
│   Collection        │    │   Consumer Offset   │
│   Strategies        │    │   Collector         │
│                     │    │                     │
│ • per-broker        │    │ • Group Discovery   │
│ • per-topic         │    │ • Lag Calculation   │
│ • per-consumer      │    │ • State Tracking    │
│ • cluster-aggregate │    │ • Trend Analysis    │
└─────────────────────┘    └─────────────────────┘
```

### Data Flow

1. **Initialization**
   - Load metric definitions
   - Start worker pools
   - Verify Kafka connection

2. **Collection**
   - Query New Relic for nri-kafka data
   - Process metrics concurrently using worker pools
   - Apply validation and quality checks

3. **Processing**
   - Transform raw data using metric definitions
   - Calculate aggregations and derived metrics
   - Track state changes and trends

4. **Output**
   - Return structured metrics compatible with nri-kafka transformer
   - Provide health and performance statistics
   - Log collection summaries and errors

## Worker Pool Architecture

The system uses specialized worker pools for concurrent processing:

### DataCollectionPool
- Handles metric collection tasks
- Configurable pool sizes per metric type
- Automatic retry and error handling
- Performance monitoring

### Task Distribution
```javascript
// Broker metrics - parallel collection per broker
brokerTasks = brokers.map(broker => ({
  taskFn: () => collectDetailedBrokerMetrics(broker),
  context: { broker: broker.id, cluster: broker.clusterName }
}));

// Topic metrics - parallel collection per topic
topicTasks = topics.map(topic => ({
  taskFn: () => collectTopicMetrics(topic),
  context: { topic: topic.name, cluster: topic.clusterName }
}));
```

## Error Handling and Resilience

### Circuit Breakers
- Protects against cascading failures
- Automatic recovery when services restore
- Configurable failure thresholds

### Retry Logic
- Exponential backoff for transient failures
- Maximum retry limits
- Context-aware error handling

### Graceful Degradation
- Partial failures don't stop entire collection
- Missing metrics logged but don't cause failures
- Health checks identify problematic components

## Performance Considerations

### Concurrency
- Worker pools prevent overwhelming New Relic APIs
- Configurable parallelism based on cluster size
- Batch processing for large topic collections

### Efficiency
- Connection reuse across collections
- Metric validation only when enabled
- Lazy initialization of expensive operations

### Monitoring
- Collection duration tracking
- Worker pool performance metrics
- Error rate monitoring

## Testing

### Unit Tests
```bash
# Run all enhanced collection tests
node infrastructure/test-enhanced-collection.js

# Run with debug output
DEBUG=true node infrastructure/test-enhanced-collection.js
```

### Integration Testing
```bash
# Test with real Kafka data (requires nri-kafka setup)
node examples/enhanced-collection-example.js --cycles=1 --debug

# Test connection verification
node infrastructure/test-infra-collection.js
```

### Load Testing
```bash
# Test with multiple cycles
node examples/enhanced-collection-example.js --cycles=10 --interval=10

# Test worker pool performance
node examples/enhanced-collection-example.js --debug
```

## Troubleshooting

### Common Issues

#### No Data Collected
1. Verify nri-kafka is sending data:
   ```sql
   FROM KafkaBrokerSample SELECT count(*) SINCE 5 minutes ago
   ```
2. Check API credentials and account ID
3. Enable debug logging: `DEBUG=true`

#### High Collection Times
1. Reduce worker pool sizes
2. Disable detailed topic metrics: `enableDetailedTopicMetrics: false`
3. Increase timeout values
4. Check network connectivity to New Relic

#### Consumer Group Issues
1. Verify consumer groups are active
2. Check for KafkaConsumerSample data
3. Adjust lag thresholds if getting too many warnings

#### Worker Pool Errors
1. Check pool status: `collector.getHealthStatus()`
2. Verify task timeout settings
3. Monitor worker pool metrics

### Debug Logging

Enable comprehensive debug logging:
```bash
DEBUG=platform:*,collection:*,worker:* node your-script.js
```

### Health Checks

Monitor collector health:
```javascript
const health = await enhancedCollector.getHealthStatus();
console.log('Collector Health:', health);

const consumerSummary = await consumerCollector.getConsumerGroupLagSummary();
console.log('Consumer Groups:', consumerSummary);
```

## Integration with nri-kafka Transformer

The enhanced collection system is designed to work seamlessly with the existing nri-kafka transformer:

```javascript
const NriKafkaTransformer = require('./transformers/nri-kafka-transformer');

// Collect enhanced metrics
const enhancedMetrics = await enhancedCollector.collectEnhancedKafkaMetrics();

// Transform to MESSAGE_QUEUE entities
const transformer = new NriKafkaTransformer(accountId);
const entities = transformer.transformSamples([
  ...enhancedMetrics.brokerMetrics,
  ...enhancedMetrics.topicMetrics,
  ...enhancedMetrics.consumerGroupMetrics
]);
```

## Future Enhancements

- **Schema Registry Integration**: Monitor schema registry metrics
- **Connect Cluster Support**: Kafka Connect monitoring
- **Stream Processing**: Kafka Streams application metrics
- **Multi-Cluster**: Cross-cluster metric correlation
- **ML-Based Anomaly Detection**: Intelligent alerting
- **Real-time Streaming**: WebSocket-based metric streaming

## Contributing

When adding new metrics or collection strategies:

1. Update metric definitions in `core/metrics/metric-definitions.js`
2. Add corresponding collection logic in the appropriate collector
3. Update tests in `infrastructure/test-enhanced-collection.js`
4. Document new configuration options
5. Add examples demonstrating usage

## License

This enhanced collection system is part of the New Relic Message Queues Platform and follows the same licensing as the main project.