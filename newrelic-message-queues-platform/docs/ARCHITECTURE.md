# Platform Architecture

## Overview

The New Relic Message Queues Platform is a comprehensive monitoring solution designed to synthesize message queue infrastructure data into New Relic's Unified Data Model (UDM). This document provides a detailed architectural overview of the platform.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           New Relic Message Queues Platform                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│  │   API Server    │  │  Health Check   │  │   Prometheus    │           │
│  │   (Express)     │  │    Service      │  │    Exporter     │           │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘           │
│           │                     │                     │                     │
│  ┌────────┴─────────────────────┴─────────────────────┴────────┐          │
│  │                     Platform Core (EventEmitter)              │          │
│  └───────────────────────────┬──────────────────────────────────┘          │
│                              │                                              │
│  ┌───────────────────────────┼───────────────────────────────┐            │
│  │                           │                               │            │
│  │  ┌─────────────┐  ┌──────┴──────┐  ┌─────────────┐     │            │
│  │  │ Simulation  │  │Infrastructure│  │   Hybrid    │     │            │
│  │  │    Mode     │  │    Mode     │  │    Mode     │     │            │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │            │
│  │         │                 │                 │             │            │
│  │  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐     │            │
│  │  │    Data     │  │   Infra     │  │   Hybrid    │     │            │
│  │  │ Simulator   │  │ Collector   │  │  Manager    │     │            │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │            │
│  │                                                          │            │
│  └──────────────────────────────────────────────────────────┘            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐      │
│  │                        Entity Factory                            │      │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  │      │
│  │  │  Cluster  │  │  Broker   │  │   Topic   │  │ Consumer  │  │      │
│  │  │  Entity   │  │  Entity   │  │  Entity   │  │  Group    │  │      │
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────┘  │      │
│  └─────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐      │
│  │                     New Relic Streamer                          │      │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  │      │
│  │  │  Events   │  │  Metrics  │  │   Logs    │  │  Circuit   │  │      │
│  │  │  API      │  │   API     │  │   API     │  │  Breaker   │  │      │
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────┘  │      │
│  └─────────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                        ┌─────────────────────────┐
                        │     New Relic One       │
                        │  ┌─────────────────┐   │
                        │  │ Entity Explorer │   │
                        │  └─────────────────┘   │
                        │  ┌─────────────────┐   │
                        │  │   Dashboards    │   │
                        │  └─────────────────┘   │
                        └─────────────────────────┘
```

## Core Components

### 1. Platform Core

The platform core is an EventEmitter-based orchestrator that manages:
- Component lifecycle
- Mode selection and configuration
- Error recovery and resilience
- Event propagation

**Key Classes:**
- `MessageQueuesPlatform`: Main platform class
- `ConfigManager`: Centralized configuration management
- `ErrorRecoveryManager`: Circuit breakers and error handling

### 2. Operating Modes

#### Simulation Mode
- Generates synthetic message queue data
- Useful for testing and demonstrations
- Configurable topology (clusters, brokers, topics)
- Realistic metric generation

#### Infrastructure Mode
- Collects real data from message queue systems
- Integrates with nri-kafka and other collectors
- Transforms infrastructure data to UDM entities
- Enhanced collection with worker pools

#### Hybrid Mode
- Combines real and simulated data
- Enriches infrastructure data with synthetic metrics
- Useful for filling gaps in monitoring coverage

### 3. Entity Model

The platform implements New Relic's entity model for message queues:

```
MESSAGE_QUEUE_CLUSTER
├── MESSAGE_QUEUE_BROKER
├── MESSAGE_QUEUE_TOPIC
└── MESSAGE_QUEUE_CONSUMER_GROUP
```

Each entity includes:
- **Identity**: GUID, name, type
- **Metrics**: Golden signals and specific metrics
- **Tags**: Metadata and classification
- **Relationships**: Entity hierarchy

### 4. Data Flow

```
Data Sources → Collection → Transformation → Synthesis → Streaming → New Relic
     │              │             │              │            │           │
     │              │             │              │            │           │
  Kafka API    Collectors    Transformers    Entities    Streamer    Platform
```

## Technical Architecture

### 1. Dependency Injection

The platform uses a factory pattern for dependency injection:

```javascript
class EntityFactory {
  createCluster(data) → MessageQueueCluster
  createBroker(data) → MessageQueueBroker
  createTopic(data) → MessageQueueTopic
  createConsumerGroup(data) → MessageQueueConsumerGroup
}
```

### 2. Event-Driven Architecture

```javascript
Platform Events:
- 'started': Platform initialization complete
- 'stopped': Platform shutdown complete
- 'cycle.started': Data collection cycle started
- 'cycle.completed': Data collection cycle completed
- 'error': Error occurred
- 'component.error': Component-specific error
- 'circuit.opened': Circuit breaker opened
- 'circuit.closed': Circuit breaker closed
```

### 3. Resilience Patterns

#### Circuit Breaker
```javascript
class CircuitBreaker {
  - CLOSED → OPEN (on failure threshold)
  - OPEN → HALF_OPEN (after timeout)
  - HALF_OPEN → CLOSED (on success)
  - HALF_OPEN → OPEN (on failure)
}
```

#### Retry Logic
```javascript
Exponential Backoff:
- Initial delay: 1000ms
- Max delay: 16000ms
- Max retries: 3
- Backoff multiplier: 2
```

### 4. Streaming Architecture

#### Batching Strategy
```javascript
Batch Configuration:
- Size: 100 entities
- Interval: 5000ms
- Compression: gzip
- Format: JSON
```

#### Flow Control
```javascript
Queue Management:
- Max queue size: 10000
- High water mark: 8000
- Low water mark: 2000
- Pressure relief: Drop oldest
```

## Security Architecture

### 1. Secrets Management

```
┌─────────────────┐
│ Secrets Manager │
├─────────────────┤
│ Backends:       │
│ - Environment   │
│ - File          │
│ - Vault         │
│ - AWS Secrets   │
└────────┬────────┘
         │
    AES-256-GCM
         │
         ▼
┌─────────────────┐
│ Encrypted Store │
└─────────────────┘
```

### 2. Network Security

- **TLS**: All external communications
- **mTLS**: Optional for Kafka connections
- **Network Policies**: Kubernetes network isolation
- **RBAC**: Role-based access control

### 3. Container Security

- **Non-root user**: UID 1000
- **Read-only filesystem**: With exceptions for /tmp
- **No privileged operations**: Dropped all capabilities
- **Security scanning**: Trivy, Snyk integration

## Scalability Architecture

### 1. Horizontal Scaling

```yaml
Scaling Dimensions:
- Replicas: 1-20 pods
- CPU: 100m-4000m per pod
- Memory: 128Mi-4Gi per pod
- Network: 10-100 Mbps per pod
```

### 2. Performance Optimization

#### Worker Pools
```javascript
Configuration:
- Broker workers: 5 concurrent
- Topic workers: 8 concurrent
- Consumer workers: 3 concurrent
- Queue depth: 1000 per worker
```

#### Caching Strategy
```javascript
Cache Layers:
- Entity cache: 5 minutes TTL
- Metric aggregation: 1 minute window
- API response: 30 seconds TTL
```

### 3. Load Distribution

```
                    Load Balancer
                         │
        ┌────────────────┼────────────────┐
        │                │                │
    Region 1         Region 2         Region 3
        │                │                │
   ┌────┴────┐      ┌────┴────┐     ┌────┴────┐
   │ Replica │      │ Replica │     │ Replica │
   │ Set 1   │      │ Set 2   │     │ Set 3   │
   └─────────┘      └─────────┘     └─────────┘
```

## Monitoring Architecture

### 1. Metrics Pipeline

```
Platform Metrics → Prometheus Exporter → /metrics endpoint
       │                                      │
       ▼                                      ▼
Internal Metrics                        Prometheus
       │                                      │
       ▼                                      ▼
Health Checks                            Grafana
```

### 2. Health Check System

```javascript
Health Check Hierarchy:
├── Liveness (Critical only)
│   ├── Config validation
│   └── Secrets availability
├── Readiness (All checks)
│   ├── Platform initialization
│   ├── Streaming connectivity
│   └── Resource availability
└── Startup (Bootstrap checks)
    └── Initial configuration
```

### 3. Observability Stack

- **Metrics**: Prometheus + Grafana
- **Logs**: Structured JSON logging
- **Traces**: OpenTelemetry (future)
- **Events**: New Relic Events API

## Data Architecture

### 1. Entity Data Model

```javascript
MessageQueueCluster {
  guid: String (unique identifier)
  entityType: "MESSAGE_QUEUE_CLUSTER"
  name: String
  provider: String (kafka|rabbitmq|sqs)
  metrics: {
    "cluster.health.score": Number,
    "cluster.brokers.count": Number,
    "cluster.topics.count": Number
  }
  tags: Map<String, String>
  relationships: Array<Relationship>
}
```

### 2. Metric Aggregation

```
Raw Metrics → Window Aggregation → Statistical Summary → Export
    │               (1 min)              (p50,p95,p99)      │
    │                                                        │
    └────────────────── Rate Calculation ───────────────────┘
                         (per second)
```

### 3. Data Retention

```yaml
Retention Policies:
- Real-time cache: 5 minutes
- Aggregated metrics: 1 hour
- Platform logs: 7 days
- Audit logs: 90 days
```

## Deployment Architecture

### 1. Container Strategy

```dockerfile
Multi-stage Build:
├── Dependencies (cached)
├── Build (compiled)
└── Runtime (minimal)
    └── Distroless base
```

### 2. Kubernetes Architecture

```yaml
Namespace: message-queues
├── Deployment (stateless)
├── Service (ClusterIP)
├── ConfigMap (configuration)
├── Secret (credentials)
├── HPA (autoscaling)
├── PDB (disruption budget)
└── ServiceMonitor (metrics)
```

### 3. CI/CD Pipeline

```
Code → Build → Test → Scan → Package → Deploy → Monitor
 │       │       │      │       │         │        │
Git   Docker  Jest  Security  Helm    K8s/ECS  Prometheus
```

## Integration Architecture

### 1. New Relic Integration

```javascript
APIs Used:
- Events API: Entity synthesis
- Metrics API: Numeric data
- Logs API: Platform logs
- NerdGraph: Dashboard creation
```

### 2. Message Queue Integration

```javascript
Supported Providers:
├── Kafka
│   ├── Admin API
│   ├── JMX metrics
│   └── Consumer API
├── RabbitMQ
│   ├── Management API
│   └── Prometheus plugin
└── AWS SQS
    └── CloudWatch API
```

### 3. Extension Points

```javascript
Plugin Interface:
- Provider: Message queue type
- Collector: Data collection
- Transformer: Data transformation
- Enricher: Metric enrichment
```

## Future Architecture

### 1. Planned Enhancements

- **GraphQL API**: For flexible querying
- **WebSocket**: Real-time updates
- **gRPC**: High-performance streaming
- **WASM**: Custom metric calculations

### 2. Scalability Roadmap

- **Federation**: Multi-region deployment
- **Sharding**: Entity-based data partitioning
- **Edge Computing**: Local data aggregation
- **Serverless**: Lambda-based collectors

### 3. Integration Roadmap

- **OpenTelemetry**: Native OTLP support
- **Prometheus**: Remote write receiver
- **Grafana**: Native data source
- **Terraform**: Infrastructure as code

## Architecture Decisions

### 1. Technology Choices

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Runtime | Node.js | Event-driven, ecosystem |
| API | Express | Simple, well-supported |
| Metrics | Prometheus | Industry standard |
| Container | Docker | Portability |
| Orchestration | Kubernetes | Scalability |

### 2. Design Patterns

- **Factory Pattern**: Entity creation
- **Observer Pattern**: Event system
- **Circuit Breaker**: Fault tolerance
- **Singleton**: Configuration management
- **Strategy Pattern**: Mode selection

### 3. Trade-offs

| Decision | Benefit | Trade-off |
|----------|---------|-----------|
| Stateless | Scalability | No local cache |
| JSON | Simplicity | Size overhead |
| REST | Compatibility | Not real-time |
| Node.js | Development speed | Memory usage |

## Conclusion

The New Relic Message Queues Platform architecture is designed for:
- **Scalability**: Horizontal scaling to thousands of entities
- **Reliability**: Circuit breakers and retry logic
- **Security**: Defense in depth approach
- **Flexibility**: Multiple modes and providers
- **Observability**: Comprehensive monitoring

This architecture enables organizations to gain deep insights into their message queue infrastructure while maintaining operational excellence.