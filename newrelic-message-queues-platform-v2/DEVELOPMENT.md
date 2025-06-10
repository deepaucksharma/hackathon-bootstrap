# Development Guide - Message Queues Platform v2

## Development Setup

### Prerequisites

- Node.js 18+ (for ES modules support)
- npm 8+
- Git
- IDE with TypeScript support (VS Code recommended)

### Initial Setup

```bash
# Clone repository
git clone <repository>
cd newrelic-message-queues-platform-v2

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your credentials

# Build TypeScript
npm run build

# Run in development mode
npm run dev
```

## Project Structure

```
src/
├── application/          # Use cases and orchestration
│   ├── interfaces/      # Port interfaces
│   ├── services/        # Application services
│   └── use-cases/       # Business use cases
├── domain/              # Core business logic
│   ├── entities/        # Domain entities
│   ├── repositories/    # Repository interfaces
│   └── value-objects/   # Value objects
├── infrastructure/      # External integrations
│   ├── config/         # Configuration
│   ├── external/       # External APIs
│   └── repositories/   # Repository implementations
├── presentation/        # User interfaces
│   ├── cli/           # CLI commands
│   ├── http/          # REST API
│   └── websocket/     # Real-time updates
└── shared/             # Shared utilities
    ├── errors/        # Error definitions
    ├── types/         # Type definitions
    └── utils/         # Utility functions
```

## Development Workflow

### 1. Feature Development

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes
# Add tests
# Run tests
npm test

# Commit changes
git add .
git commit -m "feat: add your feature"

# Push and create PR
git push origin feature/your-feature-name
```

### 2. Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test src/domain/entities/broker.test.ts

# Run in watch mode
npm run test:watch
```

### 3. Debugging

```bash
# Enable debug logging
DEBUG=platform:*,transform:*,synthesize:* npm run dev

# Use VS Code debugger
# Launch configuration in .vscode/launch.json
```

## Coding Standards

### TypeScript Guidelines

```typescript
// Use interfaces for contracts
interface Collector {
  collect(): Promise<RawSample[]>;
}

// Use classes for implementations
class InfrastructureCollector implements Collector {
  constructor(private readonly config: Config) {}
  
  async collect(): Promise<RawSample[]> {
    // Implementation
  }
}

// Use enums for constants
enum EntityType {
  BROKER = 'MESSAGE_QUEUE_BROKER',
  TOPIC = 'MESSAGE_QUEUE_TOPIC',
  CLUSTER = 'MESSAGE_QUEUE_CLUSTER'
}

// Use type aliases for complex types
type MetricValue = number | null;
type MetricTimestamp = number;
type Metric = [MetricValue, MetricTimestamp];
```

### Error Handling

```typescript
// Define custom errors
class CollectionError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'CollectionError';
  }
}

// Use try-catch with proper error handling
try {
  const data = await collector.collect();
} catch (error) {
  if (error instanceof CollectionError) {
    logger.error('Collection failed', { error });
    // Handle specific error
  } else {
    // Handle unexpected error
    throw error;
  }
}
```

### Logging

```typescript
// Use structured logging
logger.info('Processing metrics', {
  entityType: 'BROKER',
  count: metrics.length,
  clusterId: 'prod-kafka'
});

// Log levels
logger.debug('Detailed information');
logger.info('General information');
logger.warn('Warning messages');
logger.error('Error messages', { error });
```

## Adding New Features

### 1. Adding a New Entity Type

```typescript
// 1. Define the entity in domain/entities/
export class MessageQueueExchange extends BaseEntity {
  constructor(
    public readonly exchangeName: string,
    public readonly vhost: string,
    public readonly type: string
  ) {
    super('MESSAGE_QUEUE_EXCHANGE', generateGuid(...));
  }
}

// 2. Create transformer in transformers/
export class ExchangeTransformer extends BaseTransformer {
  transform(sample: RawSample): TransformedMetrics {
    // Transform logic
  }
}

// 3. Update synthesizer
// 4. Add to entity factory
// 5. Create tests
```

### 2. Adding a New Provider

```typescript
// 1. Create collector
export class RabbitMQCollector implements Collector {
  async collect(): Promise<RawSample[]> {
    // Query RabbitMQ management API
  }
}

// 2. Create transformer
export class RabbitMQTransformer implements Transformer {
  transform(sample: RawSample): TransformedMetrics {
    // Transform RabbitMQ metrics
  }
}

// 3. Register in container
container.register('rabbitmqCollector', RabbitMQCollector);
```

### 3. Adding a New Metric

```typescript
// 1. Define in golden metrics
export const GOLDEN_METRICS = {
  messageRate: {
    name: 'queue.message.rate',
    unit: 'messages/sec',
    calculate: (metrics) => metrics.messagesIn / metrics.timeDelta
  }
};

// 2. Update transformer to calculate
// 3. Add to entity
// 4. Update dashboard template
```

## Testing Strategy

### Unit Tests

```typescript
// Test individual components
describe('BrokerTransformer', () => {
  it('should transform Kafka metrics correctly', () => {
    const sample = createMockSample();
    const result = transformer.transform(sample);
    
    expect(result.metrics['throughput.in']).toBe(1048576);
    expect(result.entityType).toBe('broker');
  });
});
```

### Integration Tests

```typescript
// Test component interactions
describe('Data Pipeline', () => {
  it('should process data end-to-end', async () => {
    const collector = new MockCollector();
    const transformer = new BrokerTransformer();
    const synthesizer = new EntitySynthesizer();
    
    const raw = await collector.collect();
    const transformed = transformer.transform(raw[0]);
    const entity = synthesizer.synthesize(transformed);
    
    expect(entity.entityGuid).toMatch(/MESSAGE_QUEUE_BROKER/);
  });
});
```

### E2E Tests

```typescript
// Test complete scenarios
describe('Platform E2E', () => {
  it('should create entities in New Relic', async () => {
    // Run platform
    await platform.start();
    
    // Wait for processing
    await sleep(5000);
    
    // Query New Relic
    const entities = await queryEntities();
    expect(entities).toHaveLength(3);
  });
});
```

## Performance Optimization

### Memory Management

```typescript
// Use streams for large datasets
async function* streamData(): AsyncGenerator<RawSample> {
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const batch = await fetchBatch(offset, limit);
    if (batch.length === 0) break;
    
    for (const item of batch) {
      yield item;
    }
    
    offset += limit;
  }
}
```

### Parallel Processing

```typescript
// Process in parallel with concurrency limit
const results = await pLimit(10, samples.map(sample => 
  () => transformer.transform(sample)
));
```

## Deployment

### Local Development

```bash
# Run with hot reload
npm run dev

# Run specific mode
npm run dev:simulation
npm run dev:infrastructure
```

### Production Build

```bash
# Build TypeScript
npm run build

# Run production
NODE_ENV=production node dist/main.js
```

### Docker

```bash
# Build image
docker build -t message-queues-platform:latest .

# Run container
docker run -d \
  --env-file .env \
  --name mq-platform \
  message-queues-platform:latest
```

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| TypeScript errors | Version mismatch | Run `npm run build:clean` |
| Module not found | Import paths | Check tsconfig paths |
| API errors | Invalid credentials | Verify .env values |
| No data | Wrong mode | Check PLATFORM_MODE |

### Debug Commands

```bash
# Check configuration
npm run config:validate

# Test API connection
npm run test:api

# Verify entity synthesis
npm run verify:entities

# Generate test data
npm run generate:test-data
```

## Contributing

### Code Review Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] TypeScript builds without errors
- [ ] Linting passes
- [ ] No hardcoded values
- [ ] Error handling in place
- [ ] Logging added for debugging
- [ ] Performance impact considered

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings
```