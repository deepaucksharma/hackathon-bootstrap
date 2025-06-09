# Infrastructure Mode Testing Guide

This directory contains tools and configurations for testing the Message Queues Platform in infrastructure mode with real Kafka clusters.

## Quick Start

### Prerequisites
- Docker and Docker Compose installed
- New Relic account with API access
- Environment variables configured:
  ```bash
  export NEW_RELIC_ACCOUNT_ID=your_account_id
  export NEW_RELIC_API_KEY=your_ingest_key
  ```

### 1. Start Local Kafka Cluster

```bash
# Start Kafka with JMX metrics exposed
docker-compose up -d

# Wait for initialization (about 30 seconds)
docker-compose logs -f kafka-init

# Verify Kafka is running
docker-compose ps
```

### 2. Test Infrastructure Mode

```bash
# Test with simulated nri-kafka data
node test-local-kafka.js

# Test in dry-run mode (no data sent to New Relic)
DRY_RUN=true node test-local-kafka.js

# Test with multi-broker simulation
MULTI_BROKER=true node test-local-kafka.js
```

### 3. Verify in New Relic

After running the test, wait 2-3 minutes for entity synthesis, then:

1. Go to New Relic One
2. Navigate to Explorer or use this NRQL query:
   ```sql
   FROM MessageQueue 
   SELECT count(*) 
   WHERE entityType LIKE 'MESSAGE_QUEUE_%' 
   SINCE 5 minutes ago
   ```

## Overview

The infrastructure integration provides:

1. **Data Collection**: Query nri-kafka data from New Relic via NerdGraph
2. **Transformation**: Convert nri-kafka samples to MESSAGE_QUEUE_* entities  
3. **Streaming**: Send transformed entities as events and metrics to New Relic
4. **Integration**: Seamless integration with the existing platform

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Kafka Broker  │────▶│   nri-kafka      │────▶│  Infrastructure │
│   (Minikube)    │ JMX │  Integration     │     │     Agent       │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                           │
                        ┌──────────────────────────────────┘
                        ▼
             ┌──────────────────┐                 ┌──────────────────┐
             │ InfraAgent       │                 │ NriKafka         │
             │ Collector        │                 │ Transformer      │
             └────────┬─────────┘                 └────────┬─────────┘
                      │                                     │
                      └──────────────┬──────────────────────┘
                                     ▼
                        ┌────────────────────────┐
                        │  MESSAGE_QUEUE_*       │
                        │     Entities           │
                        └───────────┬────────────┘
                                    │
                        ┌───────────▼────────────┐
                        │   Events & Metrics     │
                        │   Streamed to NR       │
                        └────────────────────────┘
```

## Components

### 1. InfraAgentCollector (`collectors/infra-agent-collector.js`)

Queries New Relic for nri-kafka data using NerdGraph:

```javascript
const collector = new InfraAgentCollector({
  accountId: 'YOUR_ACCOUNT_ID',
  apiKey: 'YOUR_USER_API_KEY',
  region: 'US'
});

// Collect Kafka metrics
const samples = await collector.collectKafkaMetrics('5 minutes ago');
```

**Features:**
- Automatic broker and topic metric collection
- Configurable time windows
- Built-in error handling and retries
- Debug logging support

### 2. NriKafkaTransformer (`transformers/nri-kafka-transformer.js`)

Transforms nri-kafka samples to MESSAGE_QUEUE entities:

```javascript
const transformer = new NriKafkaTransformer(accountId);

// Transform samples
const entities = transformer.transformSamples(samples);

// Each entity includes:
// - entityType: MESSAGE_QUEUE_BROKER, MESSAGE_QUEUE_TOPIC, MESSAGE_QUEUE_CLUSTER
// - entityGuid: Proper New Relic entity GUID
// - metrics: Standardized metric names
// - relationships: Entity relationships
```

**Transformation Map:**

| nri-kafka Sample | MESSAGE_QUEUE Entity | Metrics Included |
|------------------|---------------------|------------------|
| `KafkaBrokerSample` | `MESSAGE_QUEUE_BROKER` | bytesIn/Out, messagesIn, requestsPerSec, CPU, memory |
| `KafkaTopicSample` | `MESSAGE_QUEUE_TOPIC` | bytesIn/Out, messagesIn, partitions, replication, lag |
| Aggregated | `MESSAGE_QUEUE_CLUSTER` | brokerCount, total throughput, health score |

## Setup Instructions

### 1. Prerequisites

1. **Minikube Kafka Setup**: Deploy the Kafka environment
   ```bash
   cd ../minikube-consolidated
   ./scripts/deploy-all.sh
   ```

2. **New Relic Credentials**: Set environment variables
   ```bash
   export NEW_RELIC_ACCOUNT_ID="your-account-id"
   export NEW_RELIC_USER_API_KEY="your-user-api-key"  
   export NEW_RELIC_INGEST_KEY="your-ingest-key"
   ```

3. **Verify nri-kafka Data**: Check data is flowing
   ```bash
   cd ../minikube-consolidated
   ./scripts/check-nrdb-metrics.sh
   ```

### 2. Test Infrastructure Integration

Run the integration test to verify transformation:
```bash
node infrastructure/test-integration.js
```

This test:
- Shows mock nri-kafka data
- Demonstrates transformation to MESSAGE_QUEUE entities
- Validates entity structure
- Shows sample events and metrics

### 3. Test with Real Data

Test the full pipeline with real nri-kafka data:
```bash
node test-infrastructure-mode.js
```

This test:
- Connects to New Relic
- Collects real nri-kafka data
- Transforms and streams entities
- Runs for several collection cycles

### 4. Run Platform in Infrastructure Mode

Start the platform to continuously collect and stream data:
```bash
# Infrastructure mode only
node platform.js --mode infrastructure --account-id YOUR_ACCOUNT_ID

# Hybrid mode (infrastructure + simulation)
node platform.js --mode hybrid --interval 60

# Test mode (no data sent to New Relic)
node platform.js --mode infrastructure --dry-run
```

## Configuration Options

### Infrastructure Mode Config

```javascript
const platform = new MessageQueuesPlatform({
  mode: 'infrastructure',
  accountId: 'YOUR_ACCOUNT_ID',
  apiKey: 'YOUR_USER_API_KEY',
  infrastructure: {
    enabled: true,
    interval: 60000, // Collection interval (ms)
    clusters: ['minikube-kafka'] // Optional: specific clusters
  }
});
```

### Hybrid Mode Config

```javascript
const platform = new MessageQueuesPlatform({
  mode: 'hybrid',
  infrastructure: {
    enabled: true,
    interval: 60000
  },
  streaming: {
    enabled: true,
    interval: 30000 // Simulation interval
  }
});
```

## Entity Schema

### MESSAGE_QUEUE_BROKER

```javascript
{
  entityType: 'MESSAGE_QUEUE_BROKER',
  entityGuid: 'ACCOUNT_ID|INFRA|MESSAGE_QUEUE_BROKER|hash',
  displayName: 'Kafka Broker 1',
  provider: 'kafka',
  brokerId: '1',
  clusterName: 'minikube-kafka',
  metrics: {
    'broker.bytesInPerSecond': 1024.5,
    'broker.bytesOutPerSecond': 2048.7,
    'broker.messagesInPerSecond': 150.2,
    // ... more metrics
  },
  tags: {
    'broker.id': '1',
    'cluster.name': 'minikube-kafka',
    'kafka.version': '2.8.0'
  }
}
```

### MESSAGE_QUEUE_TOPIC

```javascript
{
  entityType: 'MESSAGE_QUEUE_TOPIC',
  entityGuid: 'ACCOUNT_ID|INFRA|MESSAGE_QUEUE_TOPIC|hash',
  displayName: 'events',
  provider: 'kafka',
  topicName: 'events',
  clusterName: 'minikube-kafka',
  metrics: {
    'topic.bytesInPerSecond': 512.3,
    'topic.partitionCount': 3,
    'topic.replicationFactor': 1,
    'topic.consumerLag': 150
  }
}
```

### MESSAGE_QUEUE_CLUSTER

```javascript
{
  entityType: 'MESSAGE_QUEUE_CLUSTER',
  entityGuid: 'ACCOUNT_ID|INFRA|MESSAGE_QUEUE_CLUSTER|hash',
  displayName: 'Kafka Cluster: minikube-kafka',
  provider: 'kafka',
  clusterName: 'minikube-kafka',
  metrics: {
    'cluster.brokerCount': 1,
    'cluster.bytesInPerSecond': 1024.5,
    'cluster.messagesPerSecond': 150.2,
    'cluster.health.score': 95
  }
}
```

## Troubleshooting

### No nri-kafka Data Found

```bash
# Check if nri-kafka is running
kubectl logs -l app=nri-kafka -n newrelic

# Verify Kafka connectivity
kubectl exec -n kafka kafka-0 -- nc -zv localhost 9999

# Check New Relic integration
node infrastructure/test-integration.js
```

### Transformation Issues

```bash
# Enable debug logging
DEBUG=infrastructure node test-infrastructure-mode.js

# Check transformer directly
node infrastructure/test-integration.js
```

### Platform Startup Issues

```bash
# Test with dry-run first
node platform.js --mode infrastructure --dry-run

# Check credentials
echo $NEW_RELIC_ACCOUNT_ID
echo $NEW_RELIC_USER_API_KEY
```

### Performance Issues

```bash
# Reduce collection frequency
node platform.js --mode infrastructure --interval 120

# Use hybrid mode with longer intervals
node platform.js --mode hybrid --interval 90
```

## Development

### Adding New Metric Transformations

1. **Update Transformer**: Add new metric mappings in `transformers/nri-kafka-transformer.js`
2. **Test**: Add test cases to `test-integration.js`
3. **Validate**: Run integration tests

### Supporting Additional Event Types

1. **Extend Collector**: Add new NRQL queries in `collectors/infra-agent-collector.js`
2. **Transform**: Add transformation logic for new event types
3. **Entity Types**: Define new MESSAGE_QUEUE_* entity types if needed

### Custom Entity Relationships

```javascript
// In transformer
relationships: [{
  type: 'BELONGS_TO',
  targetEntityGuid: this.generateGuid('MESSAGE_QUEUE_CLUSTER', clusterName)
}, {
  type: 'SERVES',
  targetEntityGuid: this.generateGuid('MESSAGE_QUEUE_TOPIC', topicName)
}]
```

## Docker Compose Services

### Core Services
- **zookeeper**: Kafka coordination (port 2181)
- **kafka**: Single broker with JMX metrics (ports 9092, 9999)
- **kafka-ui**: Web UI for monitoring (port 8080)

### Test Data Generation
- **kafka-init**: Creates test topics (user-events, order-events, system-logs)
- **kafka-producer**: Continuously produces test messages
- **kafka-consumer-1**: Analytics consumer group
- **kafka-consumer-2**: Order processor consumer group

## Test Scripts

### test-local-kafka.js
Integration test that simulates nri-kafka data collection:
- Generates realistic Kafka metrics
- Transforms to MESSAGE_QUEUE entities
- Streams to New Relic (unless DRY_RUN=true)
- Provides sample NRQL queries for verification

### test-infrastructure-mode.js
Unit tests for the transformer:
- Tests entity GUID generation
- Validates metric transformations
- Tests error handling
- Benchmarks performance

## Local Testing Troubleshooting

### Kafka Won't Start
```bash
# Check logs
docker-compose logs kafka

# Ensure ports are free
lsof -i :9092
lsof -i :2181

# Clean up and retry
docker-compose down -v
docker-compose up -d
```

### JMX Connection Issues
```bash
# Test JMX connectivity
docker run --rm --network infrastructure_kafka-network \
  sscaling/jmx-client:latest \
  -h kafka -p 9999
```

### No Data in New Relic
1. Check environment variables are set correctly
2. Verify API key has ingest permissions
3. Look for errors in test script output
4. Wait 2-3 minutes for entity synthesis
5. Check Event API limits haven't been exceeded

### Entity Not Appearing
- Ensure GUID format is correct (check logs)
- Verify account ID matches your New Relic account
- Check for transformation errors in output
- Use NRQL to query raw MessageQueue events

## Integration with Minikube Setup

This infrastructure integration is designed to work seamlessly with the minikube setup:

1. **Deploy Minikube**: Use `minikube-consolidated/scripts/deploy-all.sh`
2. **Wait for Data**: Allow 5-10 minutes for metrics to flow
3. **Verify**: Use `minikube-consolidated/scripts/check-nrdb-metrics.sh`
4. **Transform**: Run this infrastructure mode to transform the data

The result is real Kafka metrics transformed into standardized MESSAGE_QUEUE entities for consistent observability across different Kafka deployments.