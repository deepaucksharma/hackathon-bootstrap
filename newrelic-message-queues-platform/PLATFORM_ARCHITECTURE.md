# Message Queues Platform Architecture

## Overview

This platform monitors Kafka clusters using nri-kafka and the New Relic Infrastructure agent, transforms the data according to our data model, performs entity synthesis, and creates dashboards based on product specifications.

## Architecture Components

### 1. Data Collection Layer

```
┌─────────────────────┐     ┌──────────────────────┐
│   Kafka Cluster     │────▶│    nri-kafka         │
│  (JMX/Admin API)    │     │  (Infrastructure     │
└─────────────────────┘     │      Agent)          │
                            └──────────┬───────────┘
                                       │
                            ┌──────────▼───────────┐
                            │   KafkaBrokerSample  │
                            │   KafkaTopicSample   │
                            │   KafkaConsumerSample│
                            └──────────────────────┘
```

**Real Infrastructure Mode**: 
- Collects actual metrics from Kafka via nri-kafka
- Sends events: KafkaBrokerSample, KafkaTopicSample, KafkaConsumerSample

**Simulation Mode**:
- Generates synthetic data mimicking nri-kafka format
- Same event types and structure as real data

### 2. Transformation Layer

```
┌──────────────────────┐     ┌─────────────────────┐
│  Raw nri-kafka Data  │────▶│  Metric Transformer │
│  (KafkaBrokerSample) │     │  (Standardization)  │
└──────────────────────┘     └──────────┬──────────┘
                                        │
                            ┌───────────▼──────────┐
                            │  Transformed Metrics │
                            │  (Standard Format)   │
                            └───────────────────────┘
```

**Responsibilities**:
- Convert nri-kafka specific field names to standard metrics
- Apply business logic and calculations
- Maintain metric lineage and metadata
- NO entity creation - only metric transformation

### 3. Entity Synthesis Layer

```
┌─────────────────────┐     ┌────────────────────────┐
│ Transformed Metrics │────▶│   Entity Synthesizer   │
│  (Standard Format)  │     │  (New Relic Platform)  │
└─────────────────────┘     └───────────┬────────────┘
                                        │
                           ┌────────────▼────────────┐
                           │  MESSAGE_QUEUE_BROKER   │
                           │  MESSAGE_QUEUE_TOPIC    │
                           │  MESSAGE_QUEUE_CLUSTER  │
                           │  MESSAGE_QUEUE_CONSUMER │
                           └─────────────────────────┘
```

**Responsibilities**:
- Create entities following New Relic's entity platform rules
- Generate proper entity GUIDs
- Establish entity relationships
- Send entity synthesis events to New Relic

### 4. Dashboard Layer

```
┌─────────────────────┐     ┌────────────────────────┐
│ MESSAGE_QUEUE_*     │────▶│  Dashboard Generator   │
│    Entities         │     │  (Product Specs)       │
└─────────────────────┘     └───────────┬────────────┘
                                        │
                           ┌────────────▼────────────┐
                           │  Executive Overview     │
                           │  Consumer Groups        │
                           │  Infrastructure & Cost  │
                           │  Topics & Partitions    │
                           └─────────────────────────┘
```

**Based on Product Specifications**:
- Business KPIs and health scores
- Consumer lag analysis
- Cost analytics
- Performance monitoring

## Data Flow

### Infrastructure Mode (Real Data)
1. **Collection**: nri-kafka collects JMX metrics from Kafka brokers
2. **Ingestion**: Infrastructure agent sends KafkaBrokerSample events to New Relic
3. **Query**: Platform queries NRDB for recent samples
4. **Transform**: Convert nri-kafka metrics to standard format
5. **Synthesize**: Create MESSAGE_QUEUE entities with proper GUIDs
6. **Dashboard**: Query entities and display in dashboards

### Simulation Mode (Test Data)
1. **Generate**: Create synthetic KafkaBrokerSample events
2. **Transform**: Same transformation logic as real data
3. **Synthesize**: Same entity synthesis process
4. **Dashboard**: Same dashboard functionality

## Key Design Principles

### 1. Separation of Concerns
- **Metric Collection**: Only responsible for getting raw data
- **Transformation**: Only converts metrics, no entity logic
- **Entity Synthesis**: Only creates entities, no metric manipulation
- **Dashboards**: Only visualization, no data processing

### 2. Data Model Compliance
- All entities follow MESSAGE_QUEUE_* naming convention
- Standardized metrics across all entity types
- Consistent GUID format: `{entityType}|{accountId}|{provider}|{identifiers}`

### 3. Mode Flexibility
- Infrastructure mode for production monitoring
- Simulation mode for testing and demos
- Hybrid mode to fill gaps in real data

## Implementation Structure

```
newrelic-message-queues-platform/
├── collectors/              # Data collection from nri-kafka
│   ├── infrastructure.js    # Query NRDB for real data
│   └── simulation.js        # Generate synthetic data
├── transformers/            # Metric transformation
│   ├── base-transformer.js  # Common transformation logic
│   └── nri-kafka.js        # nri-kafka specific transforms
├── synthesizers/            # Entity synthesis
│   ├── entity-factory.js    # Create entities with GUIDs
│   └── relationship.js      # Entity relationships
├── dashboards/              # Dashboard generation
│   ├── templates/           # Dashboard templates
│   └── generator.js         # Dashboard creation logic
└── platform.js              # Main orchestrator
```

## Metric Transformation Examples

### nri-kafka → Standard Metrics

```javascript
// Input: KafkaBrokerSample
{
  "event_type": "KafkaBrokerSample",
  "broker.id": 1,
  "broker.bytesInPerSecond": 1024000,
  "kafka.broker.logFlushRate": 0.5
}

// Output: Transformed Metrics
{
  "brokerId": 1,
  "throughput.in.bytesPerSecond": 1024000,
  "disk.logFlushRate": 0.5,
  "provider": "kafka"
}
```

## Entity Synthesis Examples

### Transformed Metrics → Entity

```javascript
// Input: Transformed Metrics
{
  "brokerId": 1,
  "clusterName": "prod-kafka",
  "throughput.in.bytesPerSecond": 1024000
}

// Output: MESSAGE_QUEUE_BROKER Entity
{
  "eventType": "MessageQueue",
  "entityType": "MESSAGE_QUEUE_BROKER",
  "entityGuid": "MESSAGE_QUEUE_BROKER|123456|kafka|prod-kafka|1",
  "displayName": "Kafka Broker prod-kafka-1",
  "broker.throughput.in.bytesPerSecond": 1024000,
  "tags": {
    "provider": "kafka",
    "clusterName": "prod-kafka",
    "brokerId": "1"
  }
}
```

## Next Steps

1. Implement clear separation between transformation and synthesis
2. Ensure simulation mode generates exact nri-kafka format
3. Build entity synthesis as independent module
4. Create dashboards matching product specifications
5. Add comprehensive testing for each layer