# Advanced Features Documentation

This document covers the advanced features implemented in the Message Queues Platform that are available but not prominently documented elsewhere.

## Table of Contents

1. [Worker Pool System](#worker-pool-system)
2. [Circuit Breaker Pattern](#circuit-breaker-pattern)
3. [Error Recovery Manager](#error-recovery-manager)
4. [Platform Monitor](#platform-monitor)
5. [Pipeline Validator](#pipeline-validator)
6. [API Server](#api-server)
7. [Prometheus Metrics](#prometheus-metrics)
8. [Health Check Service](#health-check-service)

## Worker Pool System

### Overview

The platform includes a sophisticated worker pool system for parallel processing of data collection and transformation tasks.

### Location
- Core implementation: `core/workers/worker-pool.js`
- Usage examples: `core/workers/examples/`

### Features

- **Configurable Pool Sizes**: Separate pools for brokers, topics, and consumers
- **Task Distribution**: Automatic load balancing across workers
- **Error Isolation**: Worker failures don't affect the entire pool
- **Performance Monitoring**: Built-in metrics tracking

### Configuration

```javascript
// Platform configuration
const platform = new Platform({
  mode: 'infrastructure',
  brokerWorkerPoolSize: 5,      // Default: 5 workers
  topicWorkerPoolSize: 8,       // Default: 8 workers  
  consumerWorkerPoolSize: 3,    // Default: 3 workers
});
```

### CLI Usage

```bash
# Configure worker pool sizes
node platform.js --mode infrastructure \
  --broker-workers 10 \
  --topic-workers 15 \
  --consumer-workers 5
```

### Implementation Example

```javascript
const WorkerPool = require('./core/workers/worker-pool');

const pool = new WorkerPool({
  workerCount: 5,
  taskTimeout: 30000,
  retryAttempts: 3
});

// Submit tasks
await pool.submit('transformBrokerData', brokerSample);
await pool.submit('transformTopicData', topicSample);

// Monitor performance
const stats = pool.getStats();
console.log(`Completed: ${stats.completedTasks}, Failed: ${stats.failedTasks}`);
```

## Circuit Breaker Pattern

### Overview

Implements the circuit breaker pattern to prevent cascading failures when external services (New Relic APIs) become unavailable.

### Location
- Core implementation: `core/circuit-breaker.js`

### Features

- **Failure Threshold**: Configurable failure rate before opening
- **Timeout Period**: Configurable cool-down period
- **Half-Open State**: Gradual recovery testing
- **Metrics Integration**: Tracks success/failure rates

### States

1. **CLOSED**: Normal operation, requests pass through
2. **OPEN**: Failures detected, requests fail fast
3. **HALF_OPEN**: Testing recovery, limited requests allowed

### Configuration

```javascript
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,      // Open after 5 consecutive failures
  timeoutPeriod: 30000,     // Stay open for 30 seconds
  monitoringPeriod: 60000   // Reset counters every minute
});
```

### Usage Example

```javascript
// Wrap API calls with circuit breaker
const result = await circuitBreaker.execute(async () => {
  return await nerdGraphClient.query(nrql);
});

if (result.success) {
  console.log('Data:', result.data);
} else {
  console.log('Circuit breaker prevented call:', result.error);
}
```

## Error Recovery Manager

### Overview

Comprehensive error recovery and retry logic with exponential backoff and dead letter queue support.

### Location
- Core implementation: `core/error-recovery-manager.js`

### Features

- **Exponential Backoff**: Intelligent retry timing
- **Dead Letter Queue**: Persistent storage for failed operations
- **Error Classification**: Different strategies for different error types
- **Recovery Reporting**: Detailed recovery metrics

### Error Types Handled

1. **Transient**: Network timeouts, temporary API errors
2. **Rate Limiting**: API quota exceeded
3. **Authentication**: Invalid credentials
4. **Permanent**: Data validation errors

### Configuration

```javascript
const errorRecovery = new ErrorRecoveryManager({
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true
});
```

### Usage

```javascript
// Automatically retries with exponential backoff
const result = await errorRecovery.executeWithRetry(async () => {
  return await riskyOperation();
});

// Manual error handling
errorRecovery.handleError(error, context);
const recoveryPlan = errorRecovery.getRecoveryPlan(error);
```

## Platform Monitor

### Overview

Real-time monitoring and health checking for the platform itself.

### Location
- Core implementation: `core/platform-monitor.js`

### Monitoring Capabilities

- **Resource Usage**: CPU, memory, disk utilization
- **API Performance**: Response times, error rates
- **Data Pipeline**: Throughput, transformation success rates
- **Component Health**: Individual service status

### Metrics Collected

```javascript
{
  platform: {
    uptime: 3600000,           // Milliseconds
    memoryUsage: {
      rss: 134217728,          // Bytes
      heapUsed: 67108864,
      heapTotal: 134217728
    },
    cpuUsage: 15.5             // Percentage
  },
  pipeline: {
    samplesProcessed: 1500,
    entitiesCreated: 450,
    transformationErrors: 2,
    averageProcessingTime: 125  // Milliseconds
  },
  apis: {
    nerdGraph: {
      totalRequests: 25,
      successRate: 96.0,        // Percentage
      averageResponseTime: 250   // Milliseconds
    }
  }
}
```

### Usage

```javascript
const monitor = new PlatformMonitor();
monitor.start();

// Get current health status
const health = monitor.getHealthStatus();
console.log(`Platform Status: ${health.status}`);

// Get detailed metrics
const metrics = monitor.getMetrics();
```

## Pipeline Validator

### Overview

Validates data pipeline integrity and performance characteristics.

### Location
- Core implementation: `core/pipeline-validator.js`

### Validation Types

1. **Data Quality**: Schema validation, required fields
2. **Performance**: Throughput thresholds, latency limits
3. **Consistency**: Entity relationships, GUID uniqueness
4. **Completeness**: Expected vs. actual entity counts

### Configuration

```javascript
const validator = new PipelineValidator({
  maxLatency: 5000,           // Milliseconds
  minThroughput: 100,         // Entities per minute
  requiredFields: ['entityGuid', 'eventType'],
  customValidators: [
    (entity) => entity.entityGuid.split('|').length >= 4
  ]
});
```

### Usage

```javascript
// Validate single entity
const result = validator.validateEntity(entity);
if (!result.isValid) {
  console.log('Validation errors:', result.errors);
}

// Validate entire pipeline run
const pipelineResult = validator.validatePipeline(entities, metrics);
```

## API Server

### Overview

REST API server for platform monitoring and control.

### Location
- Core implementation: `api/server.js` (Note: This may be in a different location)
- Integration: Referenced in `platform.js`

### Available Endpoints

```
GET  /health              - Platform health status
GET  /metrics             - Prometheus metrics
GET  /stats               - Platform statistics
POST /simulate/start      - Start data simulation
POST /simulate/stop       - Stop data simulation
GET  /entities            - List current entities
GET  /pipeline/status     - Pipeline status
```

### Configuration

```javascript
// Enable API server
const platform = new Platform({
  apiEnabled: true,
  apiPort: 3000,
  apiHost: '0.0.0.0'
});
```

### CLI Usage

```bash
# Start with custom API settings
node platform.js --api-port 8080 --api-host localhost

# Disable API server
node platform.js --no-api
```

## Prometheus Metrics

### Overview

Integration with Prometheus for metrics collection and monitoring.

### Location
- Core implementation: `core/metrics/prometheus-exporter.js`

### Exported Metrics

```
# Platform metrics
platform_uptime_seconds
platform_memory_usage_bytes
platform_cpu_usage_percent

# Pipeline metrics  
pipeline_samples_processed_total
pipeline_entities_created_total
pipeline_transformation_errors_total
pipeline_processing_time_seconds

# API metrics
api_requests_total
api_request_duration_seconds
api_errors_total
```

### Usage

```bash
# Access metrics endpoint
curl http://localhost:3000/metrics

# Configure with custom endpoint
export PROMETHEUS_ENDPOINT="http://prometheus:9090"
```

## Health Check Service

### Overview

Comprehensive health checking for all platform components.

### Location
- Core implementation: `core/health/health-check.js`

### Health Check Categories

1. **Core Platform**: Main process status
2. **External Dependencies**: New Relic API connectivity
3. **Data Pipeline**: Transformation pipeline health
4. **Resource Usage**: System resource availability

### Health Status Response

```javascript
{
  status: "healthy|degraded|unhealthy",
  timestamp: "2025-01-09T10:30:00Z",
  checks: {
    platform: { status: "healthy", latency: 15 },
    newrelic_api: { status: "healthy", latency: 250 },
    data_pipeline: { status: "healthy", throughput: 150 },
    memory_usage: { status: "healthy", usage: 65.5 }
  },
  summary: {
    total: 4,
    healthy: 4,
    degraded: 0,
    unhealthy: 0
  }
}
```

### Usage

```javascript
const healthCheck = getHealthCheckService();

// Single check
const status = await healthCheck.checkComponent('newrelic_api');

// Full health assessment
const overall = await healthCheck.getOverallHealth();
```

## Configuration Summary

All advanced features can be configured through environment variables or CLI options:

```bash
# Worker pools
--broker-workers 10
--topic-workers 15  
--consumer-workers 5

# API server
--api-port 3000
--api-host 0.0.0.0
--no-api

# Enhanced features
--no-enhanced-collector
--no-consumer-lag
--no-detailed-topics
```

## Best Practices

1. **Worker Pool Sizing**: Start with defaults, scale based on load
2. **Circuit Breaker**: Monitor failure rates and adjust thresholds
3. **Error Recovery**: Review dead letter queue regularly
4. **Health Monitoring**: Set up alerts on health check endpoints
5. **Prometheus Integration**: Use for production monitoring
6. **API Security**: Restrict API access in production environments

## Troubleshooting

### Common Issues

1. **Worker Pool Exhaustion**: Increase pool sizes or reduce task load
2. **Circuit Breaker Stuck Open**: Check external service availability
3. **High Error Recovery Activity**: Investigate root cause of failures
4. **API Server Not Starting**: Check port availability and permissions

### Debug Commands

```bash
# Enable debug logging for advanced features
DEBUG=platform:*,worker:*,circuit:*,monitor:* node platform.js

# Check component health
curl http://localhost:3000/health

# View detailed metrics
curl http://localhost:3000/metrics
```