# Message Queues Platform v2

A clean, ground-up implementation of the Message Queues monitoring platform with proper separation of concerns between data collection, transformation, entity synthesis, and visualization.

## Architecture

The platform follows a clear data flow with distinct responsibilities for each component:

```
nri-kafka → Collectors → Transformers → Synthesizers → New Relic
                                                     ↓
                                              Dashboard Generator
```

### Key Design Principles

1. **Clear Separation of Concerns**
   - Collectors: Only retrieve raw data (nri-kafka format)
   - Transformers: Only normalize metrics (no entity creation)
   - Synthesizers: Only create entities (no metric manipulation)
   - Streamers: Only send data to New Relic

2. **Data Model Compliance**
   - Strict adherence to MESSAGE_QUEUE_* entity specifications
   - Proper GUID generation: `{entityType}|{accountId}|{provider}|{identifiers}`
   - Standardized metric naming

3. **Mode Flexibility**
   - Infrastructure: Real data from nri-kafka
   - Simulation: Synthetic data mimicking nri-kafka format
   - Both modes use identical transformation pipeline

## Quick Start

### 1. Setup

```bash
# Clone and navigate to v2
cd newrelic-message-queues-platform-v2

# Install simple dependencies
cp package-simple.json package.json
npm install

# Create .env file
cp .env.example .env
# Edit .env with your New Relic credentials
```

### 2. Run in Simulation Mode

```bash
# Using the run script
./run.sh simulation 60

# Or directly
npm run dev:simulation -- --interval 60

# With dashboard creation
npm run dev:simulation -- --interval 60 --dashboard
```

### 3. Run in Infrastructure Mode

```bash
# Requires nri-kafka sending data to New Relic
./run.sh infrastructure 60

# Or directly
npm run dev:infrastructure -- --interval 60
```

## Component Overview

### Collectors (`src/collectors/`)
- **InfrastructureCollector**: Queries NRDB for KafkaBrokerSample, KafkaTopicSample, KafkaConsumerSample
- **SimulationCollector**: Generates synthetic data in exact nri-kafka format

### Transformers (`src/transformers/`)
- **BrokerTransformer**: Normalizes broker metrics
- **TopicTransformer**: Normalizes topic metrics  
- **ConsumerTransformer**: Normalizes consumer metrics

### Synthesizers (`src/synthesizers/`)
- **EntitySynthesizer**: Creates MESSAGE_QUEUE entities with proper GUIDs

### Streamers (`src/streaming/`)
- **EntityStreamer**: Sends entities to Event API
- **MetricStreamer**: (Optional) Sends custom metrics to Metric API

### Dashboard Generator (`src/dashboards/`)
- Creates 4-page dashboard based on product specifications
- Queries MESSAGE_QUEUE entities

## Data Flow Examples

### 1. Raw Data (from nri-kafka)
```json
{
  "eventType": "KafkaBrokerSample",
  "broker.bytesInPerSecond": 1024000,
  "kafka.broker.cpuPercent": 45.2,
  "clusterName": "prod-kafka"
}
```

### 2. Transformed Metrics
```json
{
  "entityType": "broker",
  "clusterName": "prod-kafka",
  "metrics": {
    "throughput.in.bytesPerSecond": 1024000,
    "cpu.usage": 45.2
  }
}
```

### 3. Synthesized Entity
```json
{
  "eventType": "MessageQueue",
  "entityType": "MESSAGE_QUEUE_BROKER",
  "entityGuid": "MESSAGE_QUEUE_BROKER|123456|kafka|prod-kafka|1",
  "broker.throughput.in.bytesPerSecond": 1024000,
  "broker.cpu.usage": 45.2
}
```

## Environment Variables

```bash
# Required
NEW_RELIC_ACCOUNT_ID=your_account_id
NEW_RELIC_API_KEY=your_ingest_key

# Optional
NEW_RELIC_USER_API_KEY=your_user_key  # For dashboard creation
NEW_RELIC_REGION=US                   # US or EU
PLATFORM_MODE=simulation               # simulation or infrastructure
PLATFORM_INTERVAL=60                   # Collection interval in seconds
```

## Development

### TypeScript Compilation
```bash
# Compile TypeScript
npm run build

# Run compiled version
npm start
```

### Direct TypeScript Execution
```bash
# Run with ts-node
npm run dev

# Run specific mode
npm run dev:infrastructure
npm run dev:simulation
```

## Key Differences from v1

1. **Clean Separation**: Transformation and entity synthesis are completely separate
2. **No Mixed Concerns**: Each component has a single responsibility
3. **Simplified Architecture**: Easier to understand and maintain
4. **TypeScript**: Type safety throughout the codebase
5. **Standard Patterns**: Follows established software design principles

## Monitoring the Platform

The platform logs key events:
- Collection cycles
- Transformation counts
- Entity synthesis
- Streaming results

Enable debug logging:
```bash
DEBUG=* npm run dev
```

## Troubleshooting

### No Data in Infrastructure Mode
1. Verify nri-kafka is installed and running
2. Check data exists: `FROM KafkaBrokerSample SELECT count(*) SINCE 5 minutes ago`
3. Verify API credentials are correct
4. Check debug logs for query errors

### Entity Synthesis Issues
1. Check GUID format in Entity Explorer
2. Verify all required fields are present
3. Wait 2-3 minutes for synthesis
4. Check New Relic Logs for errors

### Dashboard Creation Fails
1. Ensure USER_API_KEY has dashboard permissions
2. Verify account ID matches data account
3. Check for existing dashboard with same name

## Next Steps

1. Add comprehensive error handling
2. Implement retry logic for API calls
3. Add health monitoring endpoints
4. Create unit and integration tests
5. Add performance metrics
6. Implement configuration validation