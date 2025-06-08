# Technical Architecture v2.0

## Overview

This document provides the detailed technical architecture for the New Relic Message Queues Platform v2.0, focusing on the dual-mode design that supports both simulation and real infrastructure monitoring.

## System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Message Queues Platform v2.0                     │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                          Presentation Layer                        │ │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────┐  │ │
│  │  │   CLI    │  │    API    │  │    UI    │  │  Dashboards     │  │ │
│  │  └─────────┘  └──────────┘  └──────────┘  └─────────────────┘  │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                    │                                   │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                         Orchestration Layer                        │ │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │ │
│  │  │  Streaming  │  │   Scheduler   │  │   Mode Controller     │  │ │
│  │  │ Orchestrator│  │              │  │ (Sim/Infra/Hybrid)   │  │ │
│  │  └─────────────┘  └──────────────┘  └────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                    │                                   │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                          Foundation Layer                          │ │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │ │
│  │  │Transformers │  │  Aggregators  │  │    Hook System       │  │ │
│  │  │            │  │              │  │  ┌────┐ ┌────┐ ┌────┐ │  │ │
│  │  │ ┌───────┐  │  │ ┌──────────┐ │  │  │ MW │ │ MW │ │ MW │ │  │ │
│  │  │ │ Kafka │  │  │ │  Metric  │ │  │  └────┘ └────┘ └────┘ │  │ │
│  │  │ ├───────┤  │  │ │Aggregator│ │  │                       │  │ │
│  │  │ │RabbitMQ│  │  │ └──────────┘ │  │  ┌─────────────────┐ │  │ │
│  │  │ ├───────┤  │  │              │  │  │   Enrichers     │ │  │ │
│  │  │ │  SQS  │  │  │ ┌──────────┐ │  │  └─────────────────┘ │  │ │
│  │  │ └───────┘  │  │ │  Cluster │ │  │                       │  │ │
│  │  │            │  │ │Aggregator│ │  │                       │  │ │
│  │  └─────────────┘  │ └──────────┘ │  └────────────────────────┘  │ │
│  │                   └──────────────┘                               │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                    │                                   │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                          Data Source Layer                         │ │
│  ├────────────────────────────┬────────────────────────────────────┤ │
│  │      Simulation Mode       │       Infrastructure Mode          │ │
│  │  ┌──────────────────────┐  │  ┌──────────────────────────────┐ │ │
│  │  │   Pattern Engine     │  │  │     Discovery Service        │ │ │
│  │  │  ┌──────────────┐   │  │  │  ┌─────────┐ ┌──────────┐  │ │ │
│  │  │  │Business Hours│   │  │  │  │   K8s   │ │  Docker  │  │ │ │
│  │  │  ├──────────────┤   │  │  │  ├─────────┤ ├──────────┤  │ │ │
│  │  │  │   Seasonal   │   │  │  │  │   ECS   │ │  Consul  │  │ │ │
│  │  │  ├──────────────┤   │  │  │  └─────────┘ └──────────┘  │ │ │
│  │  │  │   Anomaly    │   │  │  └──────────────────────────────┘ │ │
│  │  │  └──────────────┘   │  │                                   │ │
│  │  └──────────────────────┘  │  ┌──────────────────────────────┐ │ │
│  │                            │  │       SHIM Layer             │ │ │
│  │  ┌──────────────────────┐  │  │  ┌─────────────────────────┐ │ │ │
│  │  │   Scenario Engine    │  │  │  │  Provider Abstraction   │ │ │ │
│  │  └──────────────────────┘  │  │  └─────────────────────────┘ │ │ │
│  │                            │  └──────────────────────────────┘ │ │
│  └────────────────────────────┴────────────────────────────────────┘ │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Foundation Layer

The Foundation Layer is the core of v2.0, providing a clean, extensible architecture for data transformation.

#### 1.1 Transformers

**Purpose**: Convert raw metrics from any source into standardized MESSAGE_QUEUE_* entities.

**Key Classes**:
- `BaseTransformer`: Abstract base class with lifecycle hooks
- `MessageQueueTransformer`: Main transformer for queue metrics
- `KafkaTransformer`, `RabbitMQTransformer`: Provider-specific implementations

**Design Patterns**:
- Template Method Pattern for transformation lifecycle
- Strategy Pattern for provider-specific logic
- Chain of Responsibility for middleware

#### 1.2 Aggregators

**Purpose**: Collect and aggregate metrics at different levels (broker, topic, cluster).

**Key Features**:
- Thread-safe operations using mutex locks
- Time-window based aggregations
- Automatic rollup calculations
- Health score computation

**Implementation**:
```javascript
class MetricAggregator {
  constructor() {
    this.mutex = new Mutex();
    this.brokerMetrics = new Map();
    this.topicMetrics = new Map();
    this.clusterMetrics = {};
  }
  
  async addBrokerMetrics(brokerId, metrics) {
    const release = await this.mutex.acquire();
    try {
      // Thread-safe metric addition
    } finally {
      release();
    }
  }
}
```

#### 1.3 Hook System

**Purpose**: Provide extensibility points throughout the transformation pipeline.

**Components**:
- **Middleware**: Validation, rate limiting, metrics collection
- **Enrichers**: Add computed metrics, relationships, metadata
- **Fallback Handlers**: Graceful degradation on errors

### 2. Infrastructure Integration

#### 2.1 Discovery Service

**Purpose**: Automatically discover message queue infrastructure.

**Supported Platforms**:
- Kubernetes (StatefulSets, Deployments, Services)
- Docker (Containers, Networks)
- Cloud Platforms (ECS, AKS, GKE)

**Discovery Flow**:
```
1. Provider Detection → 2. Resource Discovery → 3. Entity Mapping → 4. Change Tracking
```

#### 2.2 SHIM Layer

**Purpose**: Transform infrastructure-specific data into unified entity model.

**Key Responsibilities**:
- Provider detection
- Data validation
- Caching for performance
- Error recovery

**Example Transformation**:
```
Kubernetes StatefulSet → MESSAGE_QUEUE_BROKER entities
Docker Container → MESSAGE_QUEUE_BROKER entity
ECS Task → MESSAGE_QUEUE_CLUSTER entity
```

### 3. Data Flow

#### 3.1 Simulation Mode Flow
```
Pattern Engine → Scenario Application → Entity Creation → Metric Generation 
→ Foundation Transform → Streaming → New Relic
```

#### 3.2 Infrastructure Mode Flow
```
Discovery → SHIM Transform → Foundation Transform → Aggregation 
→ Enrichment → Streaming → New Relic
```

#### 3.3 Hybrid Mode Flow
```
Both flows run simultaneously with:
- Comparison dashboards
- Validation metrics
- Automatic fallback
```

## Technical Decisions

### 1. Language & Runtime
- **Node.js 18+**: Async/await, ESM support
- **TypeScript**: Type safety for critical paths
- **No transpilation**: Direct execution for performance

### 2. Dependencies
- **Minimal core dependencies**: Only essential packages
- **Optional providers**: Loaded on-demand
- **Peer dependencies**: For framework flexibility

### 3. Performance Targets
- **Transformation latency**: <100ms per entity
- **Discovery interval**: 30s default, configurable
- **Memory usage**: <500MB for 10K entities
- **CPU usage**: <10% steady state

### 4. Security
- **No hardcoded credentials**: Environment variables only
- **Encrypted communication**: TLS for all external calls
- **RBAC support**: Integration with New Relic permissions
- **Audit logging**: All configuration changes tracked

## Deployment Architecture

### 1. Containerized Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
CMD ["node", "cli/mq-platform.js", "run"]
```

### 2. Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mq-platform
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: platform
        image: newrelic/mq-platform:2.0
        env:
        - name: PLATFORM_MODE
          value: "infrastructure"
        - name: NEW_RELIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: newrelic-secret
              key: api-key
```

### 3. Helm Chart
```
mq-platform/
├── Chart.yaml
├── values.yaml
├── templates/
│   ├── deployment.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   └── rbac.yaml
```

## Integration Points

### 1. New Relic APIs
- **Entity API**: Entity creation and updates
- **Metric API**: Metric ingestion
- **Events API**: Event streaming
- **NerdGraph**: Dashboard creation

### 2. Infrastructure APIs
- **Kubernetes API**: Resource discovery
- **Docker API**: Container metrics
- **Prometheus**: Metric collection
- **Cloud APIs**: AWS, Azure, GCP

### 3. Message Queue APIs
- **Kafka Admin API**: Topic/broker discovery
- **RabbitMQ Management**: Queue statistics
- **AWS SQS**: Queue attributes
- **Azure Service Bus**: Namespace metrics

## Monitoring & Observability

### 1. Internal Metrics
```javascript
{
  "platform.mode": "infrastructure",
  "platform.entities.discovered": 150,
  "platform.transform.latency.ms": 45,
  "platform.streaming.rate": 1000,
  "platform.errors.count": 0
}
```

### 2. Health Checks
- **/health**: Basic health status
- **/ready**: Readiness for traffic
- **/metrics**: Prometheus-format metrics

### 3. Logging
- Structured JSON logging
- Log levels: ERROR, WARN, INFO, DEBUG
- Correlation IDs for tracing

## Error Handling

### 1. Graceful Degradation
- Fallback to simulation on infrastructure errors
- Cached data usage during outages
- Partial failure handling

### 2. Circuit Breakers
- Provider-level circuit breakers
- Automatic recovery attempts
- Configurable thresholds

### 3. Retry Logic
- Exponential backoff
- Jitter for distributed systems
- Maximum retry limits

## Testing Strategy

### 1. Unit Tests
- 90%+ coverage for Foundation layer
- Mock infrastructure providers
- Property-based testing for transformers

### 2. Integration Tests
- Real Kubernetes cluster tests
- Docker environment tests
- End-to-end streaming tests

### 3. Performance Tests
- Load testing with 10K+ entities
- Memory leak detection
- Latency benchmarks

## Configuration Management

### 1. Configuration Schema
- JSON Schema validation
- Environment variable overrides
- Default values for all settings

### 2. Configuration Sources
1. Default configuration
2. Environment-specific files
3. Environment variables
4. Runtime API updates

### 3. Hot Reloading
- Configuration watch mode
- Graceful reconfiguration
- No data loss during reload

## Conclusion

The v2.0 architecture provides a robust, scalable platform for message queue monitoring that works across development and production environments. The dual-mode design ensures teams can prototype with simulations and seamlessly transition to real infrastructure monitoring without changing their dashboards or alerting.