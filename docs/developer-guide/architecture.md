# Architecture Overview

## Platform Design Philosophy

The New Relic Message Queues Platform follows a hybrid architecture that combines:
1. **Real infrastructure monitoring** using nri-kafka and New Relic Infrastructure agent
2. **Entity transformation** to standardize data as MESSAGE_QUEUE_* entities
3. **Simulation capabilities** for testing and development scenarios
4. **Dashboard generation** from reusable templates

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
- Collects JMX metrics from Kafka brokers
- Auto-discovers brokers via Zookeeper
- Sends data to New Relic as KafkaBrokerSample, KafkaTopicSample events
- Handles authentication, retries, and error recovery

#### Simulation Engine
- Generates realistic metric patterns for testing
- Supports multiple providers (Kafka, RabbitMQ, SQS)
- Configurable anomaly injection
- Business hour and seasonal patterns

### 2. Transformation Layer

#### NRI-Kafka Transformer
```javascript
// Transforms infrastructure agent data to entities
class NriKafkaTransformer {
  transform(sample) {
    if (sample.eventType === 'KafkaBrokerSample') {
      return this.transformBroker(sample);
    } else if (sample.eventType === 'KafkaTopicSample') {
      return this.transformTopic(sample);
    }
  }
  
  transformBroker(sample) {
    return {
      entityType: 'MESSAGE_QUEUE_BROKER',
      entityGuid: this.generateGuid(sample),
      metrics: this.mapBrokerMetrics(sample),
      tags: this.extractTags(sample)
    };
  }
}
```

### 3. Entity Framework

#### Entity Types
- **MESSAGE_QUEUE_CLUSTER**: Aggregated cluster-level view
- **MESSAGE_QUEUE_BROKER**: Individual broker instances
- **MESSAGE_QUEUE_TOPIC**: Topic-level metrics
- **MESSAGE_QUEUE_CONSUMER_GROUP**: Consumer group performance

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

### Infrastructure Mode
```
1. Kafka Broker → JMX Metrics
2. nri-kafka → Collect Metrics
3. Infrastructure Agent → Send to New Relic
4. Platform → Query via NerdGraph
5. Transformer → Convert to MESSAGE_QUEUE entities
6. Dashboard → Display entity metrics
```

### Simulation Mode
```
1. Simulation Engine → Generate metrics
2. Entity Factory → Create entities
3. Metric Calculator → Apply patterns
4. Streaming Client → Send to New Relic
5. Dashboard → Display simulated data
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

- **Runtime**: Node.js 14+
- **Entity Storage**: In-memory with New Relic backend
- **API Communication**: HTTPS with retry logic
- **Dashboard Rendering**: New Relic One platform
- **Testing**: Jest, Playwright for browser tests
- **Configuration**: Environment variables, YAML