# New Relic Message Queues Simulation Platform Developer Guide

## Table of Contents

1. [Introduction](#introduction)
2. [Architecture Overview](#architecture-overview)
3. [Getting Started](#getting-started)
4. [Core Concepts](#core-concepts)
5. [Platform Modes](#platform-modes)
6. [API Reference](#api-reference)
7. [CLI Usage](#cli-usage)
8. [Examples](#examples)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

## Introduction

The New Relic Message Queues Simulation Platform is a comprehensive framework for simulating message queue environments and testing monitoring solutions on New Relic. It provides tools for entity modeling, data simulation, dashboard generation, and verification.

> **Important**: This platform generates **simulated data** for testing and demonstration purposes. It does not monitor real message queue infrastructure.

### Key Features

- **Entity Modeling**: Define and simulate MESSAGE_QUEUE_* entity types
- **Data Simulation**: Generate realistic message queue metrics and events
- **Dashboard Generation**: Automatically create optimized dashboards
- **Verification Framework**: Validate entity synthesis, dashboards, and user experience
- **Multi-Provider Support**: Works with Kafka, RabbitMQ, SQS, and more

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│               Message Queues Simulation Platform                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   Entity    │  │ Simulation  │  │  Dashboard  │            │
│  │    Layer    │  │   Engine    │  │  Framework  │            │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘            │
│         │                │                 │                    │
│  ┌──────▼───────────────▼─────────────────▼──────┐            │
│  │           Simulation Core Services             │            │
│  │  • Entity Factory    • Data Streaming         │            │
│  │  • Pattern Engine    • Template Processing    │            │
│  └────────────────────────┬───────────────────────┘            │
│                          │                                     │
│  ┌───────────────────────▼───────────────────────┐            │
│  │           Verification Framework              │            │
│  │  • Entity Verifier  • Dashboard Verifier     │            │
│  │  • Browser Tests    • Simulation Tests       │            │
│  └───────────────────────────────────────────────┘            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites

- Node.js 14+ 
- New Relic Account with API access
- Environment variables configured:
  - `NEW_RELIC_API_KEY` - For data ingestion
  - `NEW_RELIC_USER_API_KEY` - For dashboard creation
  - `NEW_RELIC_ACCOUNT_ID` - Your New Relic account ID

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/nri-kafka.git
cd nri-kafka/newrelic-message-queues-platform

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your New Relic credentials
```

### Quick Start

```bash
# Initialize configuration
npx mq-platform config init

# Create and stream a Kafka topology
npx mq-platform simulate create-topology --provider kafka --stream

# Generate dashboards
npx mq-platform dashboard generate-suite --provider kafka --environment production

# Run verification
npx mq-platform verify platform
```

## Core Concepts

### Entity Types

The platform defines four core entity types:

1. **MESSAGE_QUEUE_CLUSTER** - Represents a message queue cluster
2. **MESSAGE_QUEUE_BROKER** - Individual broker/node in a cluster  
3. **MESSAGE_QUEUE_TOPIC** - Topics or exchanges
4. **MESSAGE_QUEUE_QUEUE** - Queues or subscriptions

### Entity Structure

```javascript
{
  entityType: 'MESSAGE_QUEUE_TOPIC',
  guid: 'MESSAGE_QUEUE_TOPIC|123456|kafka-prod|orders',
  name: 'orders',
  provider: 'kafka',
  accountId: 123456,
  clusterName: 'kafka-prod',
  tags: {
    environment: 'production',
    team: 'platform'
  },
  metrics: {
    'mq.topic.messagesIn.rate': 1500,
    'mq.topic.messagesOut.rate': 1450,
    'mq.topic.bytesIn.rate': 150000
  }
}
```

### Metric Naming Convention

All metrics follow the pattern: `mq.{entityType}.{metricName}.{unit}`

Examples:
- `mq.cluster.brokers.count`
- `mq.broker.cpu.percentage`
- `mq.topic.messagesIn.rate`
- `mq.queue.depth.count`

## Platform Modes

### Mode 1: Entity Proposal & Simulation

For prototyping new entity types before official adoption.

```javascript
const { runEntityProposalWorkflow } = require('./examples/mode1-entity-proposal');

await runEntityProposalWorkflow({
  apiKey: process.env.NEW_RELIC_API_KEY,
  userApiKey: process.env.NEW_RELIC_USER_API_KEY,
  accountId: process.env.NEW_RELIC_ACCOUNT_ID
});
```

### Mode 2: Existing Entity Enhancement  

For building dashboards using existing entity definitions.

```javascript
const { runExistingEntityWorkflow } = require('./examples/mode2-existing-entities');

await runExistingEntityWorkflow({
  userApiKey: process.env.NEW_RELIC_USER_API_KEY,
  accountId: process.env.NEW_RELIC_ACCOUNT_ID,
  dryRun: false
});
```

### Mode 3: Hybrid Mode

Combine new proposals with existing entities.

```javascript
const { runHybridWorkflow } = require('./examples/mode3-hybrid');

await runHybridWorkflow({
  apiKey: process.env.NEW_RELIC_API_KEY,
  userApiKey: process.env.NEW_RELIC_USER_API_KEY,
  accountId: process.env.NEW_RELIC_ACCOUNT_ID
});
```

## API Reference

### Core Classes

#### EntityFactory

Creates message queue entities.

```javascript
const { EntityFactory } = require('./core/entities');

const factory = new EntityFactory();

// Create a cluster
const cluster = factory.createCluster({
  name: 'kafka-prod',
  provider: 'kafka',
  accountId: 123456
});

// Create a broker
const broker = factory.createBroker({
  brokerId: 1,
  hostname: 'broker-1.kafka.local',
  clusterName: 'kafka-prod',
  provider: 'kafka',
  accountId: 123456
});
```

#### DataSimulator

Generates realistic message queue data.

```javascript
const DataSimulator = require('./simulation/engines/data-simulator');

const simulator = new DataSimulator({
  businessHoursStart: 9,
  businessHoursEnd: 17,
  anomalyRate: 0.05
});

// Create topology
const topology = simulator.createTopology({
  provider: 'kafka',
  environment: 'production',
  region: 'us-east-1',
  clusterCount: 2,
  brokersPerCluster: 3,
  topicsPerCluster: 10
});

// Update metrics
simulator.updateClusterMetrics(cluster);
```

#### NewRelicStreamer

Streams data to New Relic.

```javascript
const NewRelicStreamer = require('./simulation/streaming/new-relic-streamer');

const streamer = new NewRelicStreamer({
  apiKey: 'your-api-key',
  accountId: 123456,
  batchSize: 50,
  flushInterval: 5000
});

// Stream entities
streamer.streamEvents(entities);
streamer.streamMetrics(entities);

// Get statistics
const stats = streamer.getStats();
console.log(`Events sent: ${stats.events.sent}`);

// Cleanup
await streamer.shutdown();
```

#### DashboardGenerator

Creates New Relic dashboards.

```javascript
const DashboardGenerator = require('./dashboards/lib/dashboard-generator');

const generator = new DashboardGenerator({
  apiKey: 'your-user-api-key',
  accountId: 123456
});

// Generate overview dashboard
const dashboard = await generator.generateOverviewDashboard({
  provider: 'kafka',
  environment: 'production',
  deploy: true
});

console.log(`Dashboard created: ${dashboard.permalink}`);
```

#### VerificationOrchestrator

Runs comprehensive verification.

```javascript
const VerificationOrchestrator = require('./verification/lib/verification-orchestrator');

const orchestrator = new VerificationOrchestrator({
  apiKey: 'api-key',
  userApiKey: 'user-api-key',
  accountId: 123456,
  outputDir: './verification-results'
});

const { verification, reports } = await orchestrator.verifyPlatform({
  verifyEntities: true,
  verifyDashboards: true,
  dashboardGuids: ['ABC123', 'DEF456']
});

console.log(`Overall score: ${verification.summary.overallScore}%`);
```

## CLI Usage

### Global Options

```bash
mq-platform [command] [options]

Options:
  -v, --verbose              Enable verbose output
  --api-key <key>           New Relic API key
  --account-id <id>         New Relic Account ID
  --config <file>           Configuration file path
```

### Simulation Commands

```bash
# Stream simulated data
mq-platform simulate stream \
  --provider kafka \
  --clusters 2 \
  --brokers 3 \
  --topics 10 \
  --interval 30 \
  --duration 60

# Create topology
mq-platform simulate create-topology \
  --provider rabbitmq \
  --environment staging \
  --stream
```

### Dashboard Commands

```bash
# Create single dashboard
mq-platform dashboard create \
  --template overview \
  --provider kafka \
  --environment production

# Generate complete suite
mq-platform dashboard generate-suite \
  --provider kafka \
  --environment production
```

### Entity Commands

```bash
# Import entity definitions
mq-platform entity import \
  --types KAFKACLUSTER,KAFKABROKER,KAFKATOPIC

# List available entity types
mq-platform entity import --list
```

### Verification Commands

```bash
# Verify single dashboard
mq-platform verify dashboard \
  --guid ABC123 \
  --load-test

# Run platform verification
mq-platform verify platform \
  --verify-entities \
  --verify-dashboards \
  --verify-browser
```

## Examples

### Example 1: Create Kafka Infrastructure

```javascript
const platform = require('newrelic-message-queues-platform');

async function setupKafkaMonitoring() {
  // 1. Create topology
  const simulator = new platform.DataSimulator();
  const topology = simulator.createTopology({
    provider: 'kafka',
    clusterCount: 3,
    brokersPerCluster: 5,
    topicsPerCluster: 20
  });

  // 2. Stream data
  const streamer = new platform.NewRelicStreamer({
    apiKey: process.env.NEW_RELIC_API_KEY
  });
  
  await streamer.streamEvents([
    ...topology.clusters,
    ...topology.brokers,
    ...topology.topics
  ]);

  // 3. Create dashboards
  const dashboardGen = new platform.DashboardGenerator({
    userApiKey: process.env.NEW_RELIC_USER_API_KEY
  });
  
  const dashboards = await dashboardGen.generateProviderSuite(
    'kafka',
    'production'
  );

  // 4. Verify
  const verifier = new platform.VerificationOrchestrator();
  const results = await verifier.verifyPlatform({
    dashboardGuids: dashboards.map(d => d.guid)
  });

  return { topology, dashboards, verification: results };
}
```

### Example 2: Custom Entity Type

```javascript
// Define custom entity type
const customEntity = {
  entityType: 'MESSAGE_QUEUE_CONSUMER_GROUP',
  guid: `MESSAGE_QUEUE_CONSUMER_GROUP|${accountId}|${clusterId}|${groupId}`,
  name: groupId,
  provider: 'kafka',
  accountId: accountId,
  clusterName: clusterId,
  metrics: {
    'mq.consumerGroup.lag': 0,
    'mq.consumerGroup.members': 5,
    'mq.consumerGroup.messageRate': 1000
  }
};

// Stream custom entity
streamer.streamEvents([customEntity]);
```

## Best Practices

### 1. Entity Modeling

- Use consistent naming conventions
- Include all required tags (environment, team, region)
- Set appropriate relationships between entities
- Follow the MESSAGE_QUEUE_* type pattern

### 2. Data Simulation

- Use realistic metric ranges
- Include business hour patterns
- Add occasional anomalies
- Maintain metric relationships (e.g., messagesIn ≈ messagesOut)

### 3. Dashboard Design

- Group related metrics
- Use appropriate visualizations
- Include both real-time and historical views
- Add clear widget titles and descriptions

### 4. Verification

- Run verification after each deployment
- Monitor entity synthesis success rate
- Check dashboard load performance
- Test across different browsers

### 5. Production Deployment

- Start with dry-run mode
- Verify in staging environment first
- Monitor API rate limits
- Use batch operations where possible

## Troubleshooting

### Common Issues

#### Entity Synthesis Failures

**Problem**: Entities not appearing in New Relic
**Solution**: 
- Check entity GUIDs are unique
- Verify required tags are present
- Wait 2-3 minutes for synthesis
- Check API key permissions

#### Dashboard Creation Errors

**Problem**: Dashboard deployment fails
**Solution**:
- Verify USER_API_KEY has dashboard permissions
- Check account ID is correct
- Validate NRQL queries syntax
- Ensure widget configuration is valid

#### Streaming Issues

**Problem**: Data not appearing in NRDB
**Solution**:
- Check API key has data ingest permissions
- Verify batch size is under limits
- Monitor API response codes
- Check network connectivity

### Debug Mode

Enable debug logging:

```bash
export DEBUG=mq-platform:*
mq-platform simulate stream --verbose
```

### Support

For issues and questions:
- Check the [GitHub Issues](https://github.com/your-org/nri-kafka/issues)
- Review [New Relic Documentation](https://docs.newrelic.com)
- Contact the platform team

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on contributing to the platform.

## License

This project is licensed under the Apache 2.0 License - see the [LICENSE](../LICENSE) file for details.