# Architecture Overview

> **📋 Note**: This document provides a high-level architectural overview. For the complete technical specification including the Unified Data Model (UDM) details, see the [Technical Specification](../TECHNICAL_SPECIFICATION.md).

## Platform Design Philosophy

The New Relic Message Queues Platform implements a Unified Data Model (UDM) architecture that combines:
1. **Real infrastructure monitoring** using nri-kafka and New Relic Infrastructure agent
2. **UDM transformation** to standardize all MQ telemetry into canonical event types
3. **Entity synthesis** creating MESSAGE_QUEUE_* entities from UDM events
4. **Simulation capabilities** generating UDM-compliant data for testing
5. **Dashboard CI/CD** with automated build, deploy, and verification

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Data Sources Layer                           │
├─────────────────────────┬───────────────────────────────────────┤
│   Real Infrastructure   │          Simulation Engine            │
│                         │                                       │
│  ┌─────────────────┐   │   ┌─────────────────────────────┐   │
│  │   nri-kafka     │   │   │   Pattern Generators        │   │
│  │   Integration   │   │   │   - Business Hours          │   │
│  └────────┬────────┘   │   │   - Anomaly Injection       │   │
│           │             │   │   - Seasonal Variations      │   │
│  ┌────────▼────────┐   │   └─────────────┬───────────────┘   │
│  │  Infrastructure │   │                   │                   │
│  │     Agent       │   │                   │                   │
│  └────────┬────────┘   │                   │                   │
└───────────┼─────────────┴───────────────────┼─────────────────┘
            │                                   │
┌───────────▼───────────────────────────────────▼─────────────────┐
│                    Transformation Layer                          │
│                                                                  │
│  ┌─────────────────────────┐    ┌─────────────────────────┐   │
│  │  NRI-Kafka Transformer  │    │  Simulation Transformer  │   │
│  │                         │    │                         │   │
│  │  KafkaBrokerSample  →  │    │  Raw Metrics →         │   │
│  │  MESSAGE_QUEUE_BROKER   │    │  MESSAGE_QUEUE_*       │   │
│  └─────────────────────────┘    └─────────────────────────┘   │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
┌─────────────────────────────────────▼───────────────────────────┐
│                      Entity Framework                            │
│                                                                  │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐      │
│  │MESSAGE_QUEUE_ │  │MESSAGE_QUEUE_ │  │MESSAGE_QUEUE_ │      │
│  │   CLUSTER     │  │    BROKER     │  │    TOPIC      │      │
│  └───────────────┘  └───────────────┘  └───────────────┘      │
│                                                                  │
│  - Entity Relationships                                          │
│  - Golden Metrics                                               │
│  - Tag Management                                               │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
┌─────────────────────────────────────▼───────────────────────────┐
│                    Application Layer                             │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐   │
│  │    Dashboard    │  │  Verification   │  │     API      │   │
│  │    Generator    │  │    Framework    │  │   Service    │   │
│  └─────────────────┘  └─────────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Data Sources Layer

#### Real Infrastructure (nri-kafka)
- Collects metrics via JMX (default mode) or Admin API (consumer offset mode)
- Auto-discovers brokers and topics
- Outputs KafkaBrokerSample, KafkaTopicSample, KafkaConsumerSample events
- Integrates with newrelic-infra-agent for data transport
- Supports MSK shim for AWS-specific transformations

#### Simulation Engine
- Generates realistic metric patterns for testing
- Supports multiple providers (Kafka, RabbitMQ, SQS)
- Configurable anomaly injection
- Business hour and seasonal patterns

### 2. Transformation Layer

#### UDM Transformation Layer
```javascript
// Transforms nri-kafka data to Unified Data Model (UDM) events
class NriKafkaTransformer {
  transform(sample) {
    if (sample.eventType === 'KafkaBrokerSample') {
      return this.transformToUDM(sample, 'MessageQueueBrokerSample');
    } else if (sample.eventType === 'KafkaTopicSample') {
      return this.transformToUDM(sample, 'MessageQueueTopicSample');
    } else if (sample.eventType === 'KafkaConsumerSample') {
      return this.transformToUDM(sample, 'MessageQueueOffsetSample');
    }
  }
  
  transformToUDM(sample, udmEventType) {
    return {
      eventType: udmEventType,
      entityGuid: this.generateGuid(sample),
      // Map to UDM attributes like broker.throughput.in.bytesPerSecond
      ...this.mapToUDMAttributes(sample),
      timestamp: Date.now()
    };
  }
}
```

### 3. Entity Framework (UDM-Based)

#### Entity Types
Entities are synthesized from UDM events:

| Entity Type | UDM Event Source | Key Attributes |
|-------------|------------------|----------------|
| MESSAGE_QUEUE_BROKER | MessageQueueBrokerSample | broker.id, broker.hostname, throughput metrics |
| MESSAGE_QUEUE_TOPIC | MessageQueueTopicSample | topic.name, partition counts, replication |
| MESSAGE_QUEUE_CONSUMER | MessageQueueOffsetSample | consumer.group.id, lag metrics |

#### Entity Relationships
```
CLUSTER
  └── BROKER (1:N)
        └── TOPIC (1:N)
              └── CONSUMER_GROUP (1:N)
```

#### Golden Metrics
Each entity type has defined golden metrics:
- **Cluster**: Total throughput, broker count, health score
- **Broker**: Messages/sec, bytes in/out, CPU/memory usage
- **Topic**: Message rate, lag, partition count
- **Consumer Group**: Lag, consumption rate, member count

### 4. Application Layer

#### Dashboard Generator
- Template-based dashboard creation
- Provider-specific optimizations
- NRQL query generation with entity awareness
- Layout optimization for different screen sizes

#### Verification Framework
- Entity synthesis validation
- Dashboard functionality testing
- Cross-browser compatibility checks
- Performance benchmarking

## Data Flow

### Infrastructure Mode (UDM Flow)
```
1. Kafka Broker → JMX/Admin API Metrics
2. nri-kafka → Collect raw metrics
3. nri-kafka → Transform to UDM events
4. Infrastructure Agent → Send UDM events to NRDB
5. New Relic → Synthesize MESSAGE_QUEUE entities
6. Platform → Query entities via NerdGraph
7. Dashboard → Display unified metrics
```

### Simulation Mode (UDM-Native)
```
1. Simulation Engine → Generate UDM-compliant events
2. Pattern Engine → Apply realistic patterns
3. Streaming Client → Send MessageQueue*Sample events
4. New Relic → Synthesize entities from UDM events
5. Dashboard → Display simulated data (identical to real)
```

### Hybrid Mode
```
1. Discover real infrastructure
2. Query nri-kafka data for discovered components
3. Identify missing components
4. Generate simulated data for gaps
5. Merge real + simulated data
6. Stream unified dataset
```

## Design Patterns

### Factory Pattern
Used for entity creation with consistent validation:
```javascript
const factory = new EntityFactory();
const broker = factory.createBroker({
  brokerId: 1,
  clusterName: 'prod-kafka',
  hostname: 'broker-1.kafka.local'
});
```

### Observer Pattern
Event-driven architecture for component communication:
```javascript
platform.on('metrics.updated', (data) => {
  dashboard.refresh(data);
  verifier.validate(data);
});
```

### Strategy Pattern
Different collection strategies based on environment:
```javascript
const strategy = environment === 'kubernetes' 
  ? new KubernetesDiscovery()
  : new DockerDiscovery();
```

### Template Method
Base entity class defines lifecycle, subclasses implement specifics:
```javascript
class BaseEntity {
  create() {
    this.validate();
    this.generateGuid();
    this.initializeMetrics();
    this.setupRelationships();
  }
}
```

## Scalability Considerations

### Metric Collection
- Batch processing to reduce API calls
- Configurable collection intervals
- Circuit breaker for API protection
- Exponential backoff for retries

### Entity Management
- In-memory entity registry with O(1) lookups
- Lazy loading of relationships
- Efficient GUID generation and validation
- Periodic cleanup of stale entities

### Dashboard Performance
- NRQL query optimization
- Widget count limitations
- Faceted queries for aggregation
- Time window optimization

## Security Architecture

### API Key Management
- Environment variable storage
- Separate keys for different operations
- Key rotation support
- Minimal permission principle

### Data Protection
- No sensitive data in metrics
- HTTPS for all API communication
- Input validation on all endpoints
- Rate limiting on API endpoints

## Extension Points

### Adding New Providers
1. Implement provider-specific transformer
2. Define entity mappings
3. Create dashboard templates
4. Add simulation patterns

### Custom Metrics
1. Extend entity metric definitions
2. Update transformation logic
3. Modify dashboard queries
4. Add validation rules

## Technology Stack

### Platform Components
- **Runtime**: Node.js 14+ (simulation, dashboard CI/CD)
- **Data Collection**: Go-based nri-kafka integration
- **Entity Storage**: New Relic NRDB with UDM events
- **API Communication**: NerdGraph, Event API, Query API
- **Dashboard Platform**: New Relic One

### Development & Testing
- **Unit Testing**: Jest with comprehensive mocks
- **Integration Testing**: Docker Compose for local Kafka
- **E2E Testing**: Playwright for dashboard validation
- **Configuration**: Environment variables, JSON/YAML configs

### Key Libraries
- **Metrics Collection**: Shopify/sarama (Go), JMX client
- **Data Streaming**: New Relic SDK
- **Dashboard Generation**: Custom framework with NRQL builders
- **Validation**: JSON Schema, custom validators