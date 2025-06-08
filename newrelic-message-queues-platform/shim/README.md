# SHIM Layer (Strategic Hardware Interface Module)

The SHIM layer transforms infrastructure-specific data from various discovery sources into unified MESSAGE_QUEUE entities. It acts as a bridge between raw infrastructure data and the Foundation layer's transformation pipeline.

## Architecture

```
Infrastructure Data → SHIM Adapters → Unified Entities → Foundation Layer
     (K8s, Docker)     (Provider-specific)  (MESSAGE_QUEUE_*)   (Processing)
```

## Components

### 1. Base SHIM Adapter (`base-shim-adapter.js`)
Abstract base class that provides:
- Retry logic with exponential backoff
- Event-driven architecture
- Batch transformation support
- Health monitoring
- Entity factory integration

### 2. Provider Adapters
- **KafkaShimAdapter**: Transforms Kafka infrastructure data
- **RabbitMQShimAdapter**: Transforms RabbitMQ infrastructure data
- Additional adapters can be added by extending BaseShimAdapter

### 3. SHIM Orchestrator (`shim-orchestrator.js`)
Manages multiple adapters and provides:
- Concurrent transformation handling
- Error recovery and circuit breaking
- Foundation layer integration
- Batch and stream processing
- Health monitoring across all adapters

### 4. SHIM Validator (`validators/shim-validator.js`)
Ensures data integrity with:
- Infrastructure data validation
- Transformation result validation
- Cross-validation of entities and relationships
- Detailed error and warning reporting

## Usage

### Basic Usage

```javascript
const { createOrchestrator } = require('./shim');

// Create orchestrator
const orchestrator = createOrchestrator({
  enabledProviders: ['kafka', 'rabbitmq'],
  validation: { enabled: true }
});

// Transform infrastructure data
const result = await orchestrator.transform('kafka', {
  kubernetes: { /* K8s discovery data */ },
  kafka: { /* Kafka metrics data */ }
});

// Result contains:
// - entities: Array of MESSAGE_QUEUE entities
// - metrics: Array of metric data points
// - relationships: Array of entity relationships
```

### Quick Transform

```javascript
const { quickTransform } = require('./shim');

const result = await quickTransform('kafka', infrastructureData, {
  validate: true,
  autoShutdown: true
});
```

### Batch Processing

```javascript
const batchResult = await orchestrator.batchTransform([
  { provider: 'kafka', data: kafkaData },
  { provider: 'rabbitmq', data: rabbitmqData }
]);
```

### Stream Processing

```javascript
async function* dataStream() {
  yield { provider: 'kafka', data: kafkaData1 };
  yield { provider: 'kafka', data: kafkaData2 };
  yield { provider: 'rabbitmq', data: rabbitmqData };
}

const stats = await orchestrator.streamTransform(
  dataStream(),
  (error, result, item) => {
    if (error) {
      console.error(`Failed to transform ${item.provider}:`, error);
    } else {
      console.log(`Transformed ${result.entities.length} entities`);
    }
  }
);
```

## Infrastructure Data Formats

### Kafka Infrastructure Data

```javascript
{
  kubernetes: {
    statefulsets: [/* Kafka StatefulSet data */],
    services: [/* Kafka Service data */],
    configmaps: [/* Topic configurations */]
  },
  docker: {
    containers: [/* Kafka container data */]
  },
  kafka: {
    clusters: [/* Cluster metadata */],
    brokers: [/* Broker instances */],
    topics: [/* Topic configurations */],
    partitions: [/* Partition details */]
  },
  jmx: {
    mbeans: [/* JMX metrics */]
  }
}
```

### RabbitMQ Infrastructure Data

```javascript
{
  kubernetes: {
    statefulsets: [/* RabbitMQ StatefulSet data */],
    services: [/* RabbitMQ Service data */]
  },
  docker: {
    containers: [/* RabbitMQ container data */]
  },
  rabbitmq: {
    overview: {/* Cluster overview */},
    nodes: [/* Node/broker data */],
    vhosts: [/* Virtual hosts */],
    queues: [/* Queue configurations */],
    exchanges: [/* Exchange data */]
  },
  prometheus: {
    metrics: [/* Prometheus metrics */]
  }
}
```

## Entity Mapping

### Kafka Mappings
- Kubernetes StatefulSet → MESSAGE_QUEUE_CLUSTER
- Kafka Broker → MESSAGE_QUEUE_BROKER
- Kafka Topic → MESSAGE_QUEUE_TOPIC
- Topic Partitions → Metrics and relationships

### RabbitMQ Mappings
- RabbitMQ Cluster → MESSAGE_QUEUE_CLUSTER
- RabbitMQ Node → MESSAGE_QUEUE_BROKER
- RabbitMQ Queue → MESSAGE_QUEUE_QUEUE
- Virtual Hosts → Entity metadata

## Event System

The SHIM layer emits various events for monitoring and integration:

```javascript
orchestrator.on('transformation:complete', (event) => {
  console.log(`Transformed ${event.entityCount} entities`);
});

orchestrator.on('transformation:error', (event) => {
  console.error(`Error in ${event.provider}:`, event.error);
});

orchestrator.on('adapter:transformation:retry', (event) => {
  console.warn(`Retrying ${event.provider}, attempt ${event.attempt}`);
});
```

## Foundation Layer Integration

```javascript
// Connect to Foundation layer
orchestrator.connectToFoundation(foundationTransformer);

// All transformations will automatically flow to Foundation layer
await orchestrator.transform('kafka', data);
```

## Error Handling

The SHIM layer implements robust error handling:
- Automatic retry with exponential backoff
- Circuit breaker pattern for failing adapters
- Detailed error context and recovery suggestions
- Graceful degradation for partial failures

## Adding New Providers

1. Create adapter class extending BaseShimAdapter:

```javascript
class MyProviderShimAdapter extends BaseShimAdapter {
  async _initializeProvider() { /* Provider setup */ }
  async _extractComponents(data) { /* Extract components */ }
  async _mapToEntities(components) { /* Map to entities */ }
  async _extractMetrics(components) { /* Extract metrics */ }
  async _buildRelationships(entities) { /* Build relationships */ }
  _validateInfrastructureData(data) { /* Validate input */ }
}
```

2. Register with orchestrator:

```javascript
orchestrator.registerAdapter('myprovider', MyProviderShimAdapter);
```

## Performance Considerations

- Batch processing for large datasets
- Configurable concurrency limits
- Memory-efficient streaming support
- Caching of entity mappings
- Parallel adapter execution

## Validation

Enable strict validation for production:

```javascript
const validator = createValidator({
  strictMode: true,
  validateMetrics: true,
  validateRelationships: true
});

const validation = validator.validateTransformationResult(result);
if (!validation.valid) {
  console.error(validator.createReport(validation));
}
```

## Testing

Run the integration example:

```bash
node shim/integration-example.js
```

This demonstrates:
- Multi-provider transformation
- Validation and error handling
- Foundation layer integration
- Batch processing
- Health monitoring