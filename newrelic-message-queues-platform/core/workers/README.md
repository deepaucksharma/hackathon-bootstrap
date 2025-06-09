# Worker Pool Module

A generic, high-performance worker pool implementation for concurrent task execution in the New Relic Message Queues Platform.

## Overview

The worker pool module provides concurrent processing capabilities for:
- Infrastructure data collection from multiple brokers/topics/consumers
- Simulation data generation for multiple entities
- General-purpose task parallelization with configurable pool sizes

## Features

- **Configurable Pool Sizes**: Set the number of worker threads based on workload
- **Channel-based Task Distribution**: Efficient task queuing and distribution
- **Graceful Shutdown**: Complete active tasks before stopping
- **Error Handling and Recovery**: Automatic retry logic with configurable attempts
- **Performance Metrics**: Track throughput, latency, and success rates
- **Event-driven Monitoring**: Real-time visibility into worker pool operations
- **Specialized Pools**: Purpose-built pools for data collection and simulation

## Components

### Base WorkerPool
The core worker pool implementation with:
- Configurable worker count and queue size
- Task timeout and retry logic
- Event emission for monitoring
- Graceful shutdown handling

### DataCollectionPool
Specialized for infrastructure data collection:
- Batch processing of multiple items
- Stream collection with batching
- Optimized for I/O-bound tasks like API calls

### SimulationPool
Designed for data generation tasks:
- Pluggable data generators
- Entity-based generation patterns
- Anomaly generation capabilities

## Usage

### Basic Worker Pool

```javascript
const { WorkerPool } = require('./worker-pool');

const pool = new WorkerPool({
  poolSize: 5,
  taskTimeout: 30000,
  retryAttempts: 3
});

await pool.start();

// Submit a single task
const result = await pool.submit(async () => {
  return await fetchData();
});

// Submit batch of tasks
const tasks = items.map(item => ({
  taskFn: async () => processItem(item),
  context: { item }
}));

const results = await pool.submitBatch(tasks);

await pool.stop();
```

### Data Collection Pool

```javascript
const { DataCollectionPool } = require('./worker-pool');

const collector = new DataCollectionPool({
  poolSize: 10,
  batchSize: 100
});

await collector.start();

// Collect data for multiple brokers
const brokers = ['broker1', 'broker2', 'broker3'];
const results = await collector.collectBatch(brokers, async (broker) => {
  return await fetchBrokerMetrics(broker);
});

await collector.stop();
```

### Simulation Pool

```javascript
const { SimulationPool } = require('./worker-pool');

const generator = new SimulationPool({
  poolSize: 8
});

await generator.start();

// Register data generators
generator.registerGenerator('MESSAGE_QUEUE_BROKER', async (entity) => {
  return generateBrokerMetrics(entity);
});

// Generate data for entities
const entities = [
  { entityType: 'MESSAGE_QUEUE_BROKER', entityGuid: 'broker1' },
  { entityType: 'MESSAGE_QUEUE_BROKER', entityGuid: 'broker2' }
];

const results = await generator.generateBatch(entities, 'MESSAGE_QUEUE_BROKER');

await generator.stop();
```

## Configuration Options

### WorkerPool Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | 'WorkerPool' | Pool name for logging/metrics |
| `poolSize` | number | 5 | Number of worker threads |
| `maxQueueSize` | number | 1000 | Maximum queued tasks |
| `taskTimeout` | number | 30000 | Task timeout in milliseconds |
| `retryAttempts` | number | 3 | Retry failed tasks |
| `retryDelay` | number | 1000 | Delay between retries |

### DataCollectionPool Additional Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `batchSize` | number | 100 | Items per batch |

## Events

The worker pools emit events for monitoring:

- `started` - Pool has started
- `stopping` - Pool shutdown initiated
- `stopped` - Pool has stopped
- `taskQueued` - Task added to queue
- `taskStarted` - Task execution began
- `taskCompleted` - Task finished successfully
- `taskFailed` - Task failed after retries
- `taskRetrying` - Task being retried

```javascript
pool.on('taskCompleted', (data) => {
  console.log(`Task ${data.taskId} completed in ${data.duration}ms`);
});

pool.on('taskFailed', (data) => {
  console.error(`Task ${data.taskId} failed: ${data.error}`);
});
```

## Metrics

Access real-time metrics via `getStatus()`:

```javascript
const status = pool.getStatus();
console.log({
  isRunning: status.isRunning,
  poolSize: status.poolSize,
  idleWorkers: status.idleWorkers,
  busyWorkers: status.busyWorkers,
  queueLength: status.queueLength,
  activeTasks: status.activeTasks,
  metrics: {
    tasksProcessed: status.metrics.tasksProcessed,
    tasksFailed: status.metrics.tasksFailed,
    avgProcessingTime: status.metrics.avgProcessingTime
  }
});
```

## Examples

See the `examples/` directory for complete implementations:

- **Infrastructure Collection**: Concurrent collection from multiple Kafka brokers, topics, and consumer groups
- **Simulation Generation**: Parallel generation of realistic message queue metrics with anomaly patterns

## Testing

Run the comprehensive test suite:

```bash
npm test core/workers/worker-pool.test.js
```

Tests cover:
- Basic worker pool operations
- Concurrent task processing
- Error handling and retries
- Graceful shutdown
- Event emissions
- Specialized pool functionality

## Performance Considerations

### Pool Size Guidelines

- **CPU-bound tasks**: Pool size = CPU cores
- **I/O-bound tasks**: Pool size = 2-4x CPU cores
- **Mixed workloads**: Start with 2x CPU cores, adjust based on metrics

### Memory Usage

- Each worker maintains minimal overhead
- Queue size affects memory usage for pending tasks
- Monitor `queueHighWaterMark` metric for queue sizing

### Timeout Settings

- Set timeouts based on expected task duration
- Infrastructure collection: 30-60 seconds
- Simulation generation: 5-15 seconds
- Consider network latency for remote operations

## Integration with Platform

The worker pools integrate seamlessly with the message queues platform:

### Infrastructure Mode
```javascript
// Use DataCollectionPool for concurrent broker data collection
const brokerPool = new DataCollectionPool({
  poolSize: 10,
  taskTimeout: 60000
});

// Collect from multiple brokers simultaneously
const brokerData = await brokerPool.collectBatch(brokers, collectBrokerMetrics);
```

### Simulation Mode
```javascript
// Use SimulationPool for entity data generation
const simPool = new SimulationPool({
  poolSize: 8
});

// Generate data for multiple entities concurrently
const entityData = await simPool.generateBatch(entities, 'MESSAGE_QUEUE_BROKER');
```

### Hybrid Mode
```javascript
// Use both pools for gap filling
const missingData = await simPool.generateBatch(missingEntities, entityType);
const realData = await collectionPool.collectBatch(realEntities, collector);
```

## Best Practices

1. **Start with Conservative Pool Sizes**: Begin with smaller pools and scale up based on performance metrics
2. **Monitor Queue Lengths**: High queue lengths indicate bottlenecks
3. **Handle Errors Gracefully**: Implement proper error handling in task functions
4. **Use Timeouts**: Always set appropriate timeouts for tasks
5. **Clean Shutdown**: Always call `stop()` to ensure graceful cleanup
6. **Event Monitoring**: Use events for operational visibility
7. **Batch When Possible**: Use batch operations for better efficiency

## Troubleshooting

### High Queue Lengths
- Increase pool size for I/O-bound tasks
- Optimize task functions for performance
- Consider breaking large tasks into smaller ones

### Task Timeouts
- Increase timeout values for complex operations
- Check network connectivity for remote calls
- Monitor for resource contention

### Memory Issues
- Reduce queue size if memory usage is high
- Ensure task functions don't leak memory
- Monitor worker pool metrics regularly

### Poor Performance
- Profile task functions for bottlenecks
- Adjust pool size based on workload type
- Consider using multiple specialized pools