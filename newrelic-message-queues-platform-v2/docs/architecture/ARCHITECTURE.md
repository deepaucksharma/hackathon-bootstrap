# Architecture Overview - Message Queues Platform v2

## Design Philosophy

The Message Queues Platform v2 follows Clean Architecture principles with clear separation of concerns, dependency inversion, and domain-driven design.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         External Systems                             │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │ Kafka Cluster│  │   RabbitMQ   │  │   New Relic Platform   │   │
│  │   (nri-kafka)│  │ (Management) │  │   (Entity Synthesis)   │   │
│  └──────┬───────┘  └──────┬───────┘  └────────────▲───────────┘   │
└─────────┼─────────────────┼───────────────────────┼────────────────┘
          │                 │                       │
┌─────────▼─────────────────▼───────────────────────┼────────────────┐
│                    Platform Boundary               │                │
├────────────────────────────────────────────────────┼────────────────┤
│                                                    │                │
│  ┌─────────────────┐                              │                │
│  │   Collectors    │◀─────── Infrastructure ──────┘                │
│  │                 │         Configuration                         │
│  │ • Infrastructure│                                               │
│  │ • Simulation    │         ┌──────────────┐                     │
│  └────────┬────────┘         │ Transformers │                     │
│           │                  │              │                     │
│           ▼                  │ • Normalize  │                     │
│  ┌─────────────────┐         │ • Calculate  │                     │
│  │ Domain Entities │◀────────│ • Enrich     │                     │
│  │                 │         └──────▲───────┘                     │
│  │ • Broker        │                │                             │
│  │ • Topic         │                │                             │
│  │ • Cluster       │         ┌──────┴───────┐                     │
│  │ • Queue         │         │ Synthesizers │                     │
│  │ • Consumer      │         │              │                     │
│  └────────┬────────┘         │ • Create GUID│                     │
│           │                  │ • Add Metadata│                     │
│           ▼                  └──────▲───────┘                     │
│  ┌─────────────────┐                │                             │
│  │   Streamers     │                │                             │
│  │                 │◀───────────────┘                             │
│  │ • Event API     │         ┌──────────────┐                     │
│  │ • Batching      │         │  Dashboards  │                     │
│  │ • Retry Logic   │         │              │                     │
│  └────────┬────────┘         │ • Templates  │                     │
│           │                  │ • Builders   │                     │
│           ▼                  └──────────────┘                     │
└───────────┼────────────────────────────────────────────────────────┘
            │
            ▼
     New Relic Platform
```

## Core Components

### 1. Domain Layer (`src/domain/`)
The heart of the application containing business logic and entities.

```typescript
// Entity definitions
class MessageQueueBroker extends BaseEntity {
  constructor(
    public readonly brokerId: string,
    public readonly clusterName: string,
    public readonly metrics: BrokerMetrics
  ) {
    super('MESSAGE_QUEUE_BROKER', generateGuid(...));
  }
}
```

### 2. Application Layer (`src/application/`)
Use cases and application services orchestrating the domain.

```typescript
// Use case example
class MonitorBrokersUseCase {
  async execute(): Promise<void> {
    const rawData = await this.collector.collect();
    const metrics = await this.transformer.transform(rawData);
    const entities = await this.synthesizer.synthesize(metrics);
    await this.streamer.stream(entities);
  }
}
```

### 3. Infrastructure Layer (`src/infrastructure/`)
External integrations and technical implementations.

```typescript
// NRDB collector implementation
class InfrastructureCollector implements Collector {
  async collect(): Promise<RawSample[]> {
    return await this.nerdGraphClient.query(KAFKA_BROKER_QUERY);
  }
}
```

### 4. Presentation Layer (`src/presentation/`)
API endpoints and user interfaces.

```typescript
// REST API endpoint
router.get('/health', async (req, res) => {
  const status = await healthService.check();
  res.json(status);
});
```

## Data Flow

### 1. Collection Phase
```
External System → Collector → Raw Samples
```
- Query NRDB for infrastructure data
- Generate simulation data for testing
- Validate and sanitize input

### 2. Transformation Phase
```
Raw Samples → Transformer → Normalized Metrics
```
- Standardize field names
- Convert units (bytes → MB/GB)
- Calculate derived metrics
- Apply business rules

### 3. Synthesis Phase
```
Normalized Metrics → Synthesizer → Entity Objects
```
- Create entity GUIDs
- Add metadata and tags
- Establish relationships
- Apply golden metrics

### 4. Streaming Phase
```
Entity Objects → Streamer → New Relic Platform
```
- Batch entities efficiently
- Handle API rate limits
- Implement retry logic
- Confirm delivery

## Design Patterns

### Dependency Injection
All components use constructor injection for testability:

```typescript
class PlatformOrchestrator {
  constructor(
    private collector: Collector,
    private transformer: Transformer,
    private synthesizer: Synthesizer,
    private streamer: Streamer
  ) {}
}
```

### Repository Pattern
Abstract data access behind interfaces:

```typescript
interface BrokerRepository {
  save(broker: MessageQueueBroker): Promise<void>;
  findByCluster(clusterName: string): Promise<MessageQueueBroker[]>;
}
```

### Factory Pattern
Create entities consistently:

```typescript
class EntityFactory {
  createBroker(data: BrokerData): MessageQueueBroker {
    return new MessageQueueBroker(
      data.brokerId,
      data.clusterName,
      this.calculateMetrics(data)
    );
  }
}
```

### Strategy Pattern
Support multiple providers:

```typescript
interface TransformStrategy {
  transform(sample: RawSample): TransformedMetrics;
}

class KafkaTransformStrategy implements TransformStrategy { }
class RabbitMQTransformStrategy implements TransformStrategy { }
```

## Scalability Considerations

### Horizontal Scaling
- Stateless design allows multiple instances
- Partition work by cluster or region
- Use distributed locking for coordination

### Performance Optimization
- Batch API calls (100 entities per request)
- Parallel processing where possible
- Implement caching for static data
- Use streaming for large datasets

### Resource Management
- Connection pooling for external services
- Memory-efficient data structures
- Graceful degradation under load
- Circuit breakers for external calls

## Security Architecture

### Authentication
- API key rotation support
- Secure credential storage
- Environment-based configuration

### Data Protection
- No PII in logs or metrics
- Encrypted API communications
- Audit trail for operations

### Access Control
- Role-based permissions
- Tenant isolation
- API rate limiting

## Extensibility Points

### Adding New Providers
1. Implement collector for data source
2. Create transformer for metrics
3. Define entity mappings
4. Add dashboard templates

### Custom Metrics
1. Extend metric definitions
2. Update transformers
3. Modify entity schemas
4. Update dashboards

### Integration Points
- Webhook notifications
- Custom API endpoints
- External monitoring tools
- CI/CD pipelines

## Technology Stack

### Core Technologies
- **TypeScript** - Type safety and modern JavaScript
- **Node.js 18+** - Runtime environment
- **ES Modules** - Modern module system

### Frameworks & Libraries
- **Fastify** - High-performance web framework
- **Vitest** - Testing framework
- **Zod** - Schema validation
- **Winston** - Logging

### Development Tools
- **ESLint** - Code quality
- **Prettier** - Code formatting
- **tsx** - TypeScript execution
- **nodemon** - Development hot-reload

## Future Architecture Considerations

### Microservices Migration
- Separate collectors into services
- Independent transformer services
- Centralized configuration service
- Event-driven architecture

### Cloud-Native Features
- Kubernetes operators
- Service mesh integration
- Distributed tracing
- Auto-scaling policies

### Advanced Capabilities
- Machine learning integration
- Predictive analytics
- Automated remediation
- Cost optimization engine