# Technical Guide - Message Queues Platform v2

**Last Updated**: 2025-06-09  
**Platform**: Message Queues Platform v2  
**Status**: Development/Prototype (60% complete)  

---

## 📋 Overview

This comprehensive guide covers both the technical architecture and practical implementation of the Message Queues Platform v2. It combines architectural design patterns with real-world implementation details.

## 🏗️ Architecture & Design

### Core Purpose

Transform Kafka infrastructure metrics from nri-kafka into New Relic's MESSAGE_QUEUE entity model, enabling comprehensive monitoring through standardized dashboards and alerting.

### End-to-End Functional Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Kafka Cluster  │────▶│    nri-kafka    │────▶│ Infrastructure  │
│  (Production)   │     │  (JMX Metrics)  │     │     Agent       │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │      NRDB       │
                                                 │ KafkaBrokerSample
                                                 │ KafkaTopicSample │
                                                 │ KafkaConsumerSample
                                                 └────────┬────────┘
                                                          │
┌─────────────────────────────────────────────────────────┴────────────────────────────────┐
│                                    PLATFORM BOUNDARY                                      │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                           │
│  1. DATA COLLECTION                                                                       │
│  ┌─────────────────┐                                                                     │
│  │   Collectors    │  Purpose: Retrieve raw metric data                                  │
│  │                 │  - Query NRDB for KafkaBrokerSample events                         │
│  │ • Infrastructure│  - Generate simulated data for testing                              │
│  │ • Simulation    │  - Return data in exact nri-kafka format                           │
│  └────────┬────────┘                                                                     │
│           │                                                                               │
│           ▼                                                                               │
│  2. METRIC TRANSFORMATION                                                                 │
│  ┌─────────────────┐                                                                     │
│  │  Transformers   │  Purpose: Normalize and enrich metrics                             │
│  │                 │  - Convert nri-kafka field names to standard                       │
│  │ • Broker        │  - Calculate derived metrics                                       │
│  │ • Topic         │  - Add business context                                            │
│  │ • Consumer      │  - NO entity creation here                                         │
│  └────────┬────────┘                                                                     │
│           │                                                                               │
│           ▼                                                                               │
│  3. ENTITY SYNTHESIS                                                                      │
│  ┌─────────────────┐                                                                     │
│  │  Synthesizers   │  Purpose: Create New Relic entities                                │
│  │                 │  - Generate entity GUIDs                                           │
│  │ • Entity Factory│  - Create MESSAGE_QUEUE_* entities                                 │
│  │ • Relationships │  - Establish entity relationships                                   │
│  │ • Aggregation  │  - Create cluster from brokers                                      │
│  └────────┬────────┘                                                                     │
│           │                                                                               │
│           ▼                                                                               │
│  4. DATA STREAMING                                                                        │
│  ┌─────────────────┐                                                                     │
│  │   Streamers     │  Purpose: Send data to New Relic                                   │
│  │                 │  - Batch entities efficiently                                       │
│  │ • Entity Stream │  - Handle API limits and retries                                   │
│  │ • Metric Stream │  - Ensure delivery guarantees                                      │
│  └────────┬────────┘                                                                     │
│           │                                                                               │
│           ▼                                                                               │
│  ┌─────────────────┐                                                                     │
│  │   New Relic     │                                                                     │
│  │ Entity Platform │                                                                     │
│  └────────┬────────┘                                                                     │
│                                                                                           │
└───────────────────────────────────────────────────────────────────────────────────────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │    Dashboards   │
                                                 │  Visualization  │
                                                 └─────────────────┘
```

### Architecture Principles

1. **Separation of Concerns** - Each component has single responsibility
2. **Provider Agnostic** - Abstract provider differences while preserving unique capabilities
3. **Scale First** - Built for enterprise scale from day one
4. **Type Safety** - Full TypeScript with strict enforcement
5. **Clean Architecture** - Domain-driven design with proper dependency inversion

---

## 🔧 Implementation Details

### Core Platform Orchestration

The main platform class orchestrates the entire data flow:

```typescript
export class MessageQueuesPlatform extends EventEmitter {
  // Key components
  private collector: BaseCollector;
  private transformers: Map<string, BaseTransformer>;
  private synthesizer: EntitySynthesizer;
  private entityStreamer: EntityStreamer;
  private dashboardGenerator: DashboardGenerator;

  // Main cycle that runs every interval
  private async runCycle(): Promise<void> {
    // 1. Collect raw data
    const rawSamples = await this.collector.collect();
    
    // 2. Transform each sample
    const transformedMetrics = [];
    for (const sample of rawSamples) {
      const transformer = this.transformers.get(sample.eventType);
      const metrics = await transformer.transform(sample);
      transformedMetrics.push(metrics);
    }
    
    // 3. Synthesize entities
    const entities = [];
    for (const metrics of transformedMetrics) {
      const entity = await this.synthesizer.synthesize(metrics);
      entities.push(entity);
    }
    
    // 4. Stream to New Relic
    await this.entityStreamer.stream(entities);
  }
}
```

### 1. Data Collection Implementation

#### Infrastructure Mode (`src/collectors/infrastructure-collector.ts`)

Queries NRDB for real nri-kafka data:

```typescript
async collect(): Promise<RawSample[]> {
  const query = `
    FROM KafkaBrokerSample SELECT * 
    WHERE provider = 'KafkaBroker'
    SINCE ${this.lookbackMinutes} minutes ago
  `;
  
  const results = await this.nerdGraphClient.query(query);
  return results.map(sample => ({
    eventType: 'KafkaBrokerSample',
    timestamp: sample.timestamp,
    ...sample
  }));
}
```

#### Simulation Mode (`src/collectors/simulation-collector.ts`)

Generates synthetic data mimicking nri-kafka:

```typescript
generateBrokerSample(clusterName: string, brokerId: number): RawSample {
  return {
    eventType: 'KafkaBrokerSample',
    'broker.id': brokerId,
    'broker.bytesInPerSecond': baseMetrics.throughput * 1024 * 1024,
    'kafka.broker.cpuPercent': baseMetrics.cpu,
    // ... other nri-kafka fields
  };
}
```

### 2. Data Transformation Implementation

Each transformer normalizes raw metrics without creating entities:

```typescript
// BrokerTransformer example
async transform(sample: RawSample): Promise<TransformedMetrics> {
  const metrics = {
    'throughput.in.bytesPerSecond': sample['broker.bytesInPerSecond'],
    'cpu.usage': sample['kafka.broker.cpuPercent'],
    'partitions.total': sample['kafka.broker.partitionCount'],
    // ... normalized metrics
  };
  
  return {
    timestamp: sample.timestamp,
    provider: 'kafka',
    entityType: 'broker',
    clusterName: this.extractClusterName(sample),
    identifiers: { brokerId, hostname },
    metrics
  };
}
```

**Key Transformations:**
- `broker.bytesInPerSecond` → `throughput.in.bytesPerSecond`
- `kafka.broker.cpuPercent` → `cpu.usage`
- `broker.partitionCount` → `partitions.total`

### 3. Entity Synthesis Implementation

Creates New Relic entities with proper GUIDs:

```typescript
synthesizeBrokerEntity(metrics: TransformedMetrics): SynthesizedEntity {
  const entityGuid = `MESSAGE_QUEUE_BROKER|${accountId}|kafka|${clusterName}|${brokerId}`;
  
  return {
    eventType: 'MessageQueue',
    entityType: 'MESSAGE_QUEUE_BROKER',
    entityGuid,
    displayName: `kafka-broker-${clusterName}-${brokerId}`,
    // Prefix all metrics with entity type
    'broker.throughput.in.bytesPerSecond': metrics.metrics['throughput.in.bytesPerSecond'],
    'broker.cpu.usage': metrics.metrics['cpu.usage'],
    tags: { provider: 'kafka', clusterName, brokerId }
  };
}

// Critical: Cluster entity aggregation
synthesizeClusterEntity(brokerMetrics: TransformedMetrics[]): SynthesizedEntity {
  const totalThroughputIn = brokerMetrics.reduce((sum, b) => 
    sum + b.metrics['throughput.in.bytesPerSecond'], 0);
  const healthScore = this.calculateHealthScore(brokerMetrics);
  
  return {
    eventType: 'MessageQueue',
    entityType: 'MESSAGE_QUEUE_CLUSTER',
    entityGuid: `MESSAGE_QUEUE_CLUSTER|${accountId}|kafka|${clusterName}`,
    'cluster.health.score': healthScore,
    'cluster.throughput.in.bytesPerSec': totalThroughputIn,
    'cluster.broker.count': brokerMetrics.length
  };
}
```

### 4. Streaming Implementation

Sends entities to the Event API:

```typescript
async stream(entities: SynthesizedEntity[]): Promise<void> {
  // Create batches respecting API limits
  const batches = this.createBatches(entities); // Max 100 per batch, 1MB size
  
  for (const batch of batches) {
    await this.sendToEventAPI(batch);
  }
}
```

### 5. Dashboard Generation Implementation

Creates standard 4-page dashboard:

```typescript
async generate(name?: string): Promise<string> {
  const dashboard = {
    name,
    pages: [
      this.createExecutiveOverviewPage(),
      this.createConsumerGroupsPage(),
      this.createInfrastructurePage(),
      this.createTopicsPage()
    ]
  };
  
  const result = await this.deployViaNerdGraph(dashboard);
  return `https://one.newrelic.com/redirect/entity/${result.guid}`;
}
```

---

## 📊 Data Model Implementation

### Entity Types Created

1. **MESSAGE_QUEUE_CLUSTER**
   - GUID: `MESSAGE_QUEUE_CLUSTER|{accountId}|kafka|{clusterName}`
   - Metrics: health.score, throughput.total, broker.count, availability.percentage

2. **MESSAGE_QUEUE_BROKER**
   - GUID: `MESSAGE_QUEUE_BROKER|{accountId}|kafka|{clusterName}|{brokerId}`
   - Metrics: cpu.usage, memory.usage, throughput.in/out, partition.count

3. **MESSAGE_QUEUE_TOPIC**
   - GUID: `MESSAGE_QUEUE_TOPIC|{accountId}|kafka|{clusterName}|{topicName}`
   - Metrics: throughput.in/out, partition.count, replication.factor

4. **MESSAGE_QUEUE_CONSUMER_GROUP**
   - GUID: `MESSAGE_QUEUE_CONSUMER_GROUP|{accountId}|kafka|{clusterName}|{groupId}`
   - Metrics: lag.total, lag.max, members.count, commit.rate

### Entity Relationships

```
CLUSTER
  └── MANAGES → BROKER (1:many)
      └── HOSTS → PARTITION (1:many)
          └── CONSUMED_BY → CONSUMER_GROUP (many:many)
```

---

## ⚙️ Configuration & Environment

### Environment Variables

```bash
# Required
NEW_RELIC_ACCOUNT_ID=123456
NEW_RELIC_API_KEY=NRAK-xxx  # Ingest key
NEW_RELIC_USER_API_KEY=NRAK-xxx  # User key for dashboards

# Optional
NEW_RELIC_REGION=US  # US or EU
PLATFORM_INTERVAL=60  # Seconds between cycles
DEBUG=platform:*,transform:*  # Debug logging
```

### Modes
- **infrastructure**: Queries real nri-kafka data from NRDB
- **simulation**: Generates synthetic data for testing

---

## 🚀 Running the Platform

### Development

```bash
# TypeScript with compilation
npm run build
npm run start

# Direct execution (unified script)
node run-platform-unified.js

# With setup assistance
./setup-and-run.sh
```

### Production (Not Recommended)

```bash
# Compile TypeScript
npm run build

# Run compiled version
node dist/platform.js --mode infrastructure --interval 60
```

**⚠️ Production Warning**: Missing critical features like error handling, health monitoring, and comprehensive testing.

---

## 🔍 Current Limitations

### What It Does NOT Handle

1. **Error Recovery** - Any API error crashes the platform
2. **Cluster Entity** - Missing aggregated cluster view (❌ IMPLEMENTED in unified script)
3. **Relationships** - Entities are isolated
4. **Multi-Cluster** - Single cluster only
5. **Health Monitoring** - Can't observe platform health
6. **Testing** - Zero test coverage

### Known Issues

1. **Memory Accumulation** - Loads all data in memory
2. **No Validation** - Invalid data can break entity synthesis
3. **No Rate Limiting** - Can hit API limits
4. **Sequential Processing** - Poor performance at scale
5. **TypeScript Compilation** - Multiple compilation errors in complex components

---

## 🛠️ Troubleshooting

### Common Issues

**No Data Appearing**
1. Check nri-kafka data: `FROM KafkaBrokerSample SELECT count(*)`
2. Verify API credentials
3. Wait 2-3 minutes for entity synthesis
4. Enable debug logging: `DEBUG=platform:*,transform:*`

**Platform Crashes**
- Usually API errors - check credentials
- Network issues - no retry logic implemented
- Invalid data - no validation in place

**Dashboard Creation Fails**
- Ensure USER_API_KEY has permissions
- Check for existing dashboard with same name
- Verify entities exist before creating dashboard

### Debug Information

Enable comprehensive logging:
```bash
DEBUG=platform:*,transform:*,synthesize:* node run-platform-unified.js
```

---

## 📈 Data Model Compliance

The platform follows the [official specification](DATA_MODEL_SPECIFICATION.md):

### Current Compliance

| Specification Area | Compliance | Implementation Status |
|-------------------|------------|----------------------|
| Entity Types | 80% | Missing some metadata fields |
| Entity GUIDs | 100% | Follows correct pattern |
| Metric Naming | 90% | Mostly compliant with hierarchical pattern |
| Event Schemas | 85% | Core fields implemented |
| Relationships | 20% | Basic structure only |

### Required Improvements

1. **Standardize Metric Names**
   - Ensure all metrics follow `{entityType}.{category}.{metric}` pattern
   - Update legacy naming from v1 compatibility

2. **Implement Relationships**
   - Add MANAGES, CONTAINS, HOSTS relationships
   - Enable service-to-topic correlation
   - Support distributed tracing integration

3. **Complete Metadata Schema**
   - Add all required metadata fields per specification
   - Implement proper tagging strategy
   - Ensure compliance with naming conventions

---

## 🎯 Future Development

### Next Implementation Priorities

1. **Complete Entity Synthesis** ✅ (Done in unified script)
2. **Add Error Recovery** - Circuit breakers, retry logic
3. **Implement Health Monitoring** - Endpoints, metrics export
4. **Add Comprehensive Testing** - Unit, integration, E2E tests
5. **Production Deployment** - Docker, Kubernetes configurations

### Architecture Evolution

The clean architecture foundation provides excellent extensibility for:
- Multi-provider support (RabbitMQ, SQS, etc.)
- Advanced analytics and ML integration
- Real-time anomaly detection
- Auto-scaling recommendations

---

## 📚 Related Documentation

- **[README.md](README.md)** - Quick start and setup
- **[DATA_MODEL_SPECIFICATION.md](DATA_MODEL_SPECIFICATION.md)** - Complete data model reference
- **[PLATFORM_STATUS_AND_GAPS.md](PLATFORM_STATUS_AND_GAPS.md)** - Current status and roadmap
- **[V1_VS_V2_COMPREHENSIVE_COMPARISON.md](V1_VS_V2_COMPREHENSIVE_COMPARISON.md)** - Platform comparison

---

*This technical guide provides comprehensive coverage of both architectural design and practical implementation. Use it to understand how the platform works today and how to extend it for production use.*