# Foundation Layer

The Foundation Layer is the core transformation infrastructure for the Message Queues Platform v2.0. It provides a flexible, extensible system for transforming infrastructure data from various message queue providers into standardized MESSAGE_QUEUE entities.

## Architecture Overview

The Foundation Layer consists of several key components:

### 1. Transformers
- **BaseTransformer**: Abstract base class implementing the Template Method pattern
- **MessageQueueTransformer**: Main orchestrator that coordinates provider-specific transformers
- **Provider Transformers**: Specialized transformers for each message queue provider (Kafka, RabbitMQ, etc.)

### 2. Aggregators
- **BaseAggregator**: Abstract base class for thread-safe metric aggregation
- **MetricAggregator**: Specialized aggregator for MESSAGE_QUEUE metrics with golden metric support

### 3. Hook System
- **HookManager**: Flexible hook system for lifecycle events and middleware support

## Quick Start

```javascript
const { createTransformer } = require('@newrelic/message-queues-platform/foundation');

// Create a configured transformer
const transformer = createTransformer({
  enableValidation: true,
  generateRelationships: true,
  kafka: {
    includeInternalTopics: false
  }
});

// Transform infrastructure data
const kafkaData = {
  provider: 'kafka',
  clusterId: 'prod-cluster',
  brokers: [...],
  topics: [...]
};

const result = await transformer.transform(kafkaData);
console.log(result.entities); // MESSAGE_QUEUE entities
```

## Core Concepts

### Transformation Pipeline

The transformation process follows a consistent pipeline:

1. **Validation**: Ensures data integrity and required fields
2. **Transformation**: Converts provider-specific data to MESSAGE_QUEUE format
3. **Enrichment**: Adds golden metrics and additional metadata
4. **Optimization**: Cleans and optimizes the data structure

### Provider Auto-Detection

The system can automatically detect the message queue provider based on data patterns:

```javascript
const data = {
  kafkaVersion: '3.5.0',
  brokers: [...] // Automatically detected as Kafka
};

const result = await transformer.transform(data);
```

### Lifecycle Hooks

Register hooks to tap into the transformation process:

```javascript
transformer.registerHook('pre-transform', async (data) => {
  console.log('Starting transformation for:', data.provider);
  return data;
});

transformer.registerHook('post-enrich', async (data) => {
  // Add custom enrichment
  data.customMetadata = { processed: true };
  return data;
});
```

## Provider-Specific Features

### Kafka Transformer

- Handles cluster, broker, and topic transformations
- Calculates Kafka-specific metrics (under-replicated partitions, ISR status)
- Filters internal topics by default
- Enriches with controller information

### RabbitMQ Transformer

- Maps nodes to brokers, exchanges to topics
- Handles vhost information
- Calculates RabbitMQ-specific health metrics
- Filters system queues and exchanges

## Aggregation System

The aggregation system provides thread-safe metric aggregation with windowing:

```javascript
const { MetricAggregator } = require('@newrelic/message-queues-platform/foundation');

const aggregator = new MetricAggregator({
  windowSize: 60000, // 1 minute windows
  aggregationFunctions: ['sum', 'avg', 'min', 'max', 'p95']
});

await aggregator.start();

// Aggregate entities
const aggregated = await aggregator.aggregate(entities);
console.log(aggregated.goldenMetrics); // RED and USE metrics
```

## Hook System

The hook system provides powerful extension capabilities:

```javascript
const { HookManager } = require('@newrelic/message-queues-platform/foundation');

const hooks = new HookManager();

// Register a hook with priority
hooks.registerHook('pre-validate', validateCustomFields, {
  priority: 10, // Lower numbers run first
  name: 'custom-validator'
});

// Register middleware
hooks.use(async (data, next) => {
  // Process data
  data.timestamp = Date.now();
  next(data);
});
```

## Advanced Usage

### Batch Transformation

Process multiple infrastructure snapshots efficiently:

```javascript
const batchData = [kafkaData1, kafkaData2, rabbitMQData];
const { results, errors } = await transformer.transformBatch(batchData);

console.log(`Processed: ${results.length}, Failed: ${errors.length}`);
```

### Custom Provider

Add support for a new message queue provider:

```javascript
class CustomMQTransformer extends BaseTransformer {
  async performTransformation(data) {
    // Custom transformation logic
    return {
      clusters: [...],
      brokers: [...],
      topics: [...],
      queues: [...]
    };
  }
}

transformer.registerProvider('custommq', new CustomMQTransformer());
```

### Performance Insights

Get performance insights from aggregated metrics:

```javascript
const insights = await aggregator.getPerformanceInsights();

if (insights.issues.length > 0) {
  console.log('Performance issues detected:');
  insights.issues.forEach(issue => {
    console.log(`- ${issue.severity}: ${issue.message}`);
  });
}
```

## Configuration Options

### Transformer Configuration

```javascript
{
  // Core settings
  batchSize: 1000,              // Max items per batch
  enableValidation: true,       // Enable data validation
  enableOptimization: true,     // Enable output optimization
  generateRelationships: true,  // Auto-generate entity relationships
  
  // Provider detection
  autoDetectProvider: true,     // Auto-detect provider from data
  
  // Enrichment
  enrichWithMetadata: true,     // Add golden metrics
  aggregationInterval: 60000,   // Aggregation window (ms)
  
  // Provider-specific
  kafka: {
    includeInternalTopics: false,
    defaultPartitionCount: 12,
    defaultReplicationFactor: 3
  },
  rabbitmq: {
    includeSystemQueues: false,
    includeSystemExchanges: false,
    mapExchangesToTopics: true
  }
}
```

### Aggregator Configuration

```javascript
{
  windowSize: 60000,            // Window size in ms
  maxWindows: 60,               // Keep 1 hour of history
  flushInterval: 10000,         // Auto-flush interval
  enableCompression: true,      // Compress old windows
  includeHistory: true,         // Include historical data
  aggregationFunctions: [       // Functions to apply
    'sum', 'avg', 'min', 'max', 
    'count', 'p50', 'p95', 'p99'
  ]
}
```

## Error Handling

The system provides comprehensive error handling:

```javascript
try {
  const result = await transformer.transform(data);
} catch (error) {
  if (error.message.includes('validation')) {
    // Handle validation errors
  } else if (error.message.includes('provider')) {
    // Handle provider detection errors
  }
}

// For batch operations
const { results, errors } = await transformer.transformBatch(batch);
errors.forEach(({ index, error, data }) => {
  console.error(`Item ${index} failed:`, error.message);
});
```

## Metrics and Monitoring

Track transformation performance:

```javascript
const stats = transformer.getStatistics();
console.log('Transformation metrics:', {
  transformed: stats.transformed,
  failed: stats.failed,
  successRate: stats.successRate,
  duration: stats.duration,
  entitiesCreated: stats.entitiesCreated
});
```

## Testing

The foundation layer is designed for testability:

```javascript
// Mock a provider transformer
const mockTransformer = new BaseTransformer();
mockTransformer.performTransformation = jest.fn().mockResolvedValue({
  clusters: [{ name: 'test-cluster' }]
});

transformer.registerProvider('mock', mockTransformer);

// Test with mock data
const result = await transformer.transform({ provider: 'mock' });
expect(mockTransformer.performTransformation).toHaveBeenCalled();
```

## Best Practices

1. **Always validate input data** - Enable validation in production
2. **Use batch transformation** - For processing multiple data points efficiently
3. **Register cleanup hooks** - For resource cleanup and logging
4. **Monitor transformation metrics** - Track success rates and performance
5. **Handle errors gracefully** - Implement proper error handling for production
6. **Leverage the hook system** - For custom validation and enrichment
7. **Configure provider-specific options** - Optimize for your use case

## Examples

See the `examples/` directory for more detailed examples:
- `basic-transformation.js` - Simple transformation example
- `advanced-hooks.js` - Advanced hook usage
- `custom-provider.js` - Adding a custom provider
- `production-pipeline.js` - Production-ready pipeline