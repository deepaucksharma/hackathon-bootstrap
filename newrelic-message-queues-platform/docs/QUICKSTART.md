# New Relic Message Queues Platform Quick Start Guide

Get up and running with the Message Queues Platform in minutes!

## Prerequisites

1. **New Relic Account** with:
   - Ingest API Key (for sending data)
   - User API Key (for creating dashboards)
   - Account ID

2. **Node.js 14+** installed

3. **Environment Setup**:
   ```bash
   export NEW_RELIC_API_KEY="your-ingest-api-key"
   export NEW_RELIC_USER_API_KEY="your-user-api-key"
   export NEW_RELIC_ACCOUNT_ID="your-account-id"
   ```

## Installation

```bash
# Clone the repository
git clone https://github.com/your-org/nri-kafka.git
cd nri-kafka/newrelic-message-queues-platform

# Install dependencies
npm install

# Verify installation
npx mq-platform --version
```

## Quick Start Scenarios

### 1. 🚀 Simulate Kafka Infrastructure (5 minutes)

Create a simulated Kafka environment and start streaming data immediately:

```bash
# Create and stream a Kafka topology
npx mq-platform simulate stream \
  --provider kafka \
  --clusters 2 \
  --brokers 3 \
  --topics 10 \
  --interval 30

# This will:
# - Create 2 Kafka clusters
# - Add 3 brokers per cluster (6 total)
# - Create 10 topics per cluster (20 total)
# - Stream data every 30 seconds
# - Run continuously (Ctrl+C to stop)
```

### 2. 📊 Generate Dashboards (3 minutes)

Create a complete dashboard suite for your Kafka infrastructure:

```bash
# Generate all Kafka dashboards
npx mq-platform dashboard generate-suite \
  --provider kafka \
  --environment production

# This creates:
# - Cluster Overview Dashboard
# - Broker Performance Dashboard
# - Topic Analysis Dashboard
# - Queue Metrics Dashboard (if applicable)
```

### 3. ✅ Verify Your Setup (5 minutes)

Run comprehensive verification to ensure everything is working:

```bash
# Run platform verification
npx mq-platform verify platform \
  --verify-entities \
  --verify-dashboards \
  --output ./verification-results

# Check the results
cat ./verification-results/latest-summary.json
```

### 4. 🔄 Import Existing Entity Definitions (2 minutes)

Import entity definitions from the official New Relic repository:

```bash
# Import Kafka entity definitions
npx mq-platform entity import \
  --types KAFKACLUSTER,KAFKABROKER,KAFKATOPIC

# List all available entity types
npx mq-platform entity import --list
```

## Common Workflows

### Complete Kafka Monitoring Setup

```bash
# Step 1: Import entity definitions
npx mq-platform entity import --types KAFKACLUSTER,KAFKABROKER,KAFKATOPIC

# Step 2: Create simulated infrastructure
npx mq-platform simulate create-topology \
  --provider kafka \
  --environment production \
  --clusters 3 \
  --stream

# Step 3: Generate dashboards
npx mq-platform dashboard generate-suite \
  --provider kafka \
  --environment production

# Step 4: Start continuous streaming
npx mq-platform simulate stream \
  --provider kafka \
  --interval 30
```

### Test Dashboard with Sample Data

```bash
# Create topology with immediate streaming
npx mq-platform simulate create-topology \
  --provider rabbitmq \
  --environment staging \
  --clusters 1 \
  --brokers 3 \
  --topics 5 \
  --queues 10 \
  --stream \
  --continuous

# Create dashboard
npx mq-platform dashboard create \
  --template overview \
  --provider rabbitmq \
  --environment staging
```

### Dry Run Mode (Preview Without Creating)

```bash
# Preview dashboard without deploying
npx mq-platform dashboard create \
  --template overview \
  --provider kafka \
  --dry-run

# Preview entity import
npx mq-platform entity import \
  --types SQSQUEUE \
  --output preview.json
```

## Interactive Mode

For a guided experience:

```bash
npx mq-platform interactive
```

This will walk you through:
- Setting up configuration
- Creating topologies
- Generating dashboards
- Running verification

## Programmatic Usage

### Basic Example

```javascript
const {
  DataSimulator,
  NewRelicStreamer,
  DashboardGenerator
} = require('newrelic-message-queues-platform');

async function quickStart() {
  // 1. Create simulator
  const simulator = new DataSimulator();
  
  // 2. Generate topology
  const topology = simulator.createTopology({
    provider: 'kafka',
    clusterCount: 1,
    brokersPerCluster: 3,
    topicsPerCluster: 5
  });
  
  // 3. Stream to New Relic
  const streamer = new NewRelicStreamer({
    apiKey: process.env.NEW_RELIC_API_KEY,
    accountId: process.env.NEW_RELIC_ACCOUNT_ID
  });
  
  await streamer.streamEvents([
    ...topology.clusters,
    ...topology.brokers,
    ...topology.topics
  ]);
  
  // 4. Create dashboard
  const generator = new DashboardGenerator({
    apiKey: process.env.NEW_RELIC_USER_API_KEY,
    accountId: process.env.NEW_RELIC_ACCOUNT_ID
  });
  
  const dashboard = await generator.generateOverviewDashboard({
    provider: 'kafka',
    environment: 'production'
  });
  
  console.log(`Dashboard created: ${dashboard.permalink}`);
}

quickStart().catch(console.error);
```

### Advanced Example - Custom Entity

```javascript
async function customEntityExample() {
  const { EntityFactory, NewRelicStreamer } = require('newrelic-message-queues-platform');
  
  // Create custom consumer group entity
  const factory = new EntityFactory();
  const consumerGroup = {
    entityType: 'MESSAGE_QUEUE_CONSUMER_GROUP',
    guid: `MESSAGE_QUEUE_CONSUMER_GROUP|${accountId}|kafka-prod|orders-topic|payments-processor`,
    name: 'payments-processor',
    provider: 'kafka',
    accountId: accountId,
    clusterName: 'kafka-prod',
    topicName: 'orders-topic',
    metrics: {
      'mq.consumerGroup.lag': 150,
      'mq.consumerGroup.members': 5,
      'mq.consumerGroup.messageRate': 1000
    }
  };
  
  // Stream the entity
  const streamer = new NewRelicStreamer({
    apiKey: process.env.NEW_RELIC_API_KEY,
    accountId: accountId
  });
  
  await streamer.streamEvents([consumerGroup]);
}
```

## Troubleshooting

### No Data Appearing

1. Check API key permissions:
   ```bash
   # Verify configuration
   npx mq-platform config validate
   ```

2. Enable debug mode:
   ```bash
   export DEBUG=mq-platform:*
   npx mq-platform simulate stream --verbose
   ```

3. Check streaming stats:
   ```javascript
   const stats = streamer.getStats();
   console.log(stats);
   ```

### Dashboard Creation Fails

1. Verify User API key has dashboard permissions
2. Check account ID is correct
3. Try with `--dry-run` first to preview

### Entity Synthesis Issues

1. Wait 2-3 minutes after streaming
2. Check entity GUIDs are unique
3. Verify required tags are present

## Next Steps

1. **Explore Examples**:
   - [Mode 1: Entity Proposal](../examples/mode1-entity-proposal.js)
   - [Mode 2: Existing Entities](../examples/mode2-existing-entities.js)
   - [Mode 3: Hybrid Mode](../examples/mode3-hybrid.js)

2. **Read Documentation**:
   - [Developer Guide](./DEVELOPER_GUIDE.md)
   - [API Reference](./API_REFERENCE.md)
   - [Architecture Overview](./ARCHITECTURE.md)

3. **Join the Community**:
   - Report issues on GitHub
   - Contribute improvements
   - Share your dashboards

## Support

- **Documentation**: [Full Documentation](./README.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/nri-kafka/issues)
- **Examples**: [Example Workflows](../examples/)

Happy monitoring! 🎉