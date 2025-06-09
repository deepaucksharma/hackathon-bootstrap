# New Relic Message Queues Simulation Platform API Reference

## Table of Contents

- [Core Entities](#core-entities)
- [Simulation Engine](#simulation-engine)
- [Streaming API](#streaming-api)
- [Dashboard Framework](#dashboard-framework)
- [Verification System](#verification-system)
- [CLI Commands](#cli-commands)

## Core Entities

### EntityFactory

Factory class for creating message queue entities.

#### Constructor

```javascript
new EntityFactory(config)
```

**Parameters:**
- `config` (Object): Configuration object
  - `defaultProvider` (String): Default provider name
  - `defaultAccountId` (Number): Default New Relic account ID

#### Methods

##### createCluster(config)

Creates a MESSAGE_QUEUE_CLUSTER entity.

```javascript
const cluster = factory.createCluster({
  name: 'kafka-prod-cluster',
  provider: 'kafka',
  accountId: 123456,
  region: 'us-east-1',
  environment: 'production',
  team: 'platform-engineering'
});
```

**Parameters:**
- `config` (Object): Cluster configuration
  - `name` (String, required): Cluster name
  - `provider` (String): Provider type (default: 'kafka')
  - `accountId` (Number): New Relic account ID
  - `region` (String): AWS/Cloud region
  - `environment` (String): Environment name
  - `team` (String): Owning team
  - `metadata` (Object): Additional metadata

**Returns:** MESSAGE_QUEUE_CLUSTER entity object

##### createBroker(config)

Creates a MESSAGE_QUEUE_BROKER entity.

```javascript
const broker = factory.createBroker({
  brokerId: 1,
  hostname: 'broker-1.kafka.local',
  clusterName: 'kafka-prod-cluster',
  provider: 'kafka',
  accountId: 123456,
  port: 9092,
  rack: 'rack-1'
});
```

**Parameters:**
- `config` (Object): Broker configuration
  - `brokerId` (Number, required): Broker ID
  - `hostname` (String, required): Broker hostname
  - `clusterName` (String, required): Parent cluster name
  - `provider` (String): Provider type
  - `accountId` (Number): Account ID
  - `port` (Number): Broker port
  - `rack` (String): Rack identifier

**Returns:** MESSAGE_QUEUE_BROKER entity object

##### createTopic(config)

Creates a MESSAGE_QUEUE_TOPIC entity.

```javascript
const topic = factory.createTopic({
  topic: 'orders-events',
  clusterName: 'kafka-prod-cluster',
  provider: 'kafka',
  accountId: 123456,
  partitions: 12,
  replicationFactor: 3,
  retentionMs: 604800000
});
```

**Parameters:**
- `config` (Object): Topic configuration
  - `topic` (String, required): Topic name
  - `clusterName` (String, required): Parent cluster name
  - `provider` (String): Provider type
  - `accountId` (Number): Account ID
  - `partitions` (Number): Number of partitions
  - `replicationFactor` (Number): Replication factor
  - `retentionMs` (Number): Retention in milliseconds

**Returns:** MESSAGE_QUEUE_TOPIC entity object

##### createQueue(config)

Creates a MESSAGE_QUEUE_QUEUE entity.

```javascript
const queue = factory.createQueue({
  queueName: 'task-queue',
  provider: 'sqs',
  accountId: 123456,
  region: 'us-east-1',
  queueType: 'standard',
  visibilityTimeout: 30
});
```

**Parameters:**
- `config` (Object): Queue configuration
  - `queueName` (String, required): Queue name
  - `provider` (String): Provider type
  - `accountId` (Number): Account ID
  - `region` (String): AWS/Cloud region
  - `queueType` (String): Queue type (standard/fifo)
  - `visibilityTimeout` (Number): Visibility timeout in seconds

**Returns:** MESSAGE_QUEUE_QUEUE entity object

### BaseEntity

Base class for all message queue entities.

#### Properties

- `entityType` (String): Entity type identifier
- `guid` (String): Globally unique identifier
- `name` (String): Entity name
- `provider` (String): Message queue provider
- `accountId` (Number): New Relic account ID
- `tags` (Object): Entity tags
- `metrics` (Object): Entity metrics
- `metadata` (Object): Additional metadata

#### Methods

##### updateMetrics(metrics)

Updates entity metrics.

```javascript
entity.updateMetrics({
  'mq.topic.messagesIn.rate': 1500,
  'mq.topic.bytesIn.rate': 150000
});
```

##### addTags(tags)

Adds tags to the entity.

```javascript
entity.addTags({
  criticality: 'high',
  sla: 'tier-1'
});
```

##### toNRDBEvent()

Converts entity to New Relic event format.

```javascript
const event = entity.toNRDBEvent();
// Returns: { eventType: 'MessageQueue', ... }
```

## Simulation Engine

### DataSimulator

Simulates realistic message queue data.

#### Constructor

```javascript
new DataSimulator(config)
```

**Parameters:**
- `config` (Object): Configuration
  - `businessHoursStart` (Number): Business hours start (0-23)
  - `businessHoursEnd` (Number): Business hours end (0-23)
  - `anomalyRate` (Number): Anomaly probability (0-1)
  - `seasonalityEnabled` (Boolean): Enable seasonal patterns
  - `seed` (Number): Random seed for reproducibility

#### Methods

##### createTopology(config)

Creates a complete message queue topology.

```javascript
const topology = simulator.createTopology({
  provider: 'kafka',
  environment: 'production',
  region: 'us-east-1',
  clusterCount: 2,
  brokersPerCluster: 3,
  topicsPerCluster: 10,
  queuesPerCluster: 5,
  clusterConfig: {
    team: 'data-platform',
    criticality: 'high'
  }
});
```

**Parameters:**
- `config` (Object): Topology configuration
  - `provider` (String): Provider type
  - `environment` (String): Environment name
  - `region` (String): Region
  - `clusterCount` (Number): Number of clusters
  - `brokersPerCluster` (Number): Brokers per cluster
  - `topicsPerCluster` (Number): Topics per cluster
  - `queuesPerCluster` (Number): Queues per cluster
  - `clusterConfig` (Object): Additional cluster config

**Returns:** Object with `clusters`, `brokers`, `topics`, `queues` arrays

##### updateClusterMetrics(cluster)

Updates cluster metrics with realistic values.

```javascript
simulator.updateClusterMetrics(cluster);
```

##### updateBrokerMetrics(broker)

Updates broker metrics with realistic values.

```javascript
simulator.updateBrokerMetrics(broker);
```

##### updateTopicMetrics(topic)

Updates topic metrics with realistic values.

```javascript
simulator.updateTopicMetrics(topic);
```

##### startContinuousSimulation(intervalMs)

Starts continuous metric updates.

```javascript
simulator.startContinuousSimulation(30000); // Update every 30 seconds
```

##### stopContinuousSimulation()

Stops continuous simulation.

```javascript
simulator.stopContinuousSimulation();
```

## Streaming API

### NewRelicStreamer

Streams data to New Relic APIs.

#### Constructor

```javascript
new NewRelicStreamer(config)
```

**Parameters:**
- `config` (Object): Configuration
  - `apiKey` (String, required): New Relic API key
  - `accountId` (Number, required): Account ID
  - `region` (String): API region ('US' or 'EU')
  - `batchSize` (Number): Batch size (default: 100)
  - `flushInterval` (Number): Flush interval in ms (default: 10000)
  - `retryAttempts` (Number): Retry attempts (default: 3)
  - `timeout` (Number): Request timeout in ms (default: 30000)

#### Methods

##### streamEvents(entities)

Streams entities as custom events.

```javascript
await streamer.streamEvents(entities);
```

**Parameters:**
- `entities` (Array): Array of entity objects

**Returns:** Promise<void>

##### streamMetrics(entities)

Streams entity metrics to Metric API.

```javascript
await streamer.streamMetrics(entities);
```

**Parameters:**
- `entities` (Array): Array of entity objects

**Returns:** Promise<void>

##### flush()

Manually flushes pending batches.

```javascript
await streamer.flush();
```

##### flushAll()

Flushes all pending data.

```javascript
await streamer.flushAll();
```

##### getStats()

Gets streaming statistics.

```javascript
const stats = streamer.getStats();
// {
//   events: { sent: 1000, failed: 0, pending: 50 },
//   metrics: { sent: 5000, failed: 0, pending: 200 },
//   errors: []
// }
```

##### shutdown()

Gracefully shuts down the streamer.

```javascript
await streamer.shutdown();
```

## Dashboard Framework

### DashboardGenerator

High-level dashboard generation interface.

#### Constructor

```javascript
new DashboardGenerator(config)
```

**Parameters:**
- `config` (Object): Configuration
  - `apiKey` (String, required): User API key
  - `accountId` (Number, required): Account ID
  - `defaultProvider` (String): Default provider
  - `defaultEnvironment` (String): Default environment

#### Methods

##### generateOverviewDashboard(options)

Generates cluster overview dashboard.

```javascript
const dashboard = await generator.generateOverviewDashboard({
  provider: 'kafka',
  environment: 'production',
  name: 'Kafka Production Overview',
  deploy: true
});
```

**Parameters:**
- `options` (Object): Dashboard options
  - `provider` (String): Provider type
  - `environment` (String): Environment
  - `name` (String): Dashboard name
  - `deploy` (Boolean): Deploy to New Relic
  - `customQueries` (Array): Additional queries

**Returns:** Dashboard object with `guid`, `name`, `permalink`

##### generateClusterDashboard(clusterName, options)

Generates cluster-specific dashboard.

```javascript
const dashboard = await generator.generateClusterDashboard('kafka-prod', {
  provider: 'kafka',
  deploy: true
});
```

##### generateTopicDashboard(options)

Generates topic analysis dashboard.

```javascript
const dashboard = await generator.generateTopicDashboard({
  provider: 'kafka',
  environment: 'production',
  topicFilter: 'orders-*'
});
```

##### generateProviderSuite(provider, environment, options)

Generates complete dashboard suite.

```javascript
const results = await generator.generateProviderSuite('kafka', 'production', {
  deploy: true,
  includeAlerts: true
});
```

**Returns:** Object with `dashboards` array and `errors` array

### DashboardBuilder

Low-level dashboard building interface.

#### Methods

##### buildDashboard(config)

Builds dashboard configuration.

```javascript
const dashboardConfig = builder.buildDashboard({
  name: 'Custom Dashboard',
  permissions: 'PUBLIC_READ_WRITE',
  pages: [{
    name: 'Overview',
    widgets: [...]
  }]
});
```

##### createWidget(config)

Creates widget configuration.

```javascript
const widget = builder.createWidget({
  title: 'Message Rate',
  row: 1,
  column: 1,
  width: 6,
  height: 3,
  visualization: 'line',
  query: 'SELECT rate(sum(mq.topic.messagesIn.rate), 1 minute) FROM MessageQueue TIMESERIES'
});
```

## Verification System

### VerificationOrchestrator

Orchestrates platform verification.

#### Constructor

```javascript
new VerificationOrchestrator(config)
```

**Parameters:**
- `config` (Object): Configuration
  - `apiKey` (String): Ingest API key
  - `userApiKey` (String): User API key
  - `accountId` (Number): Account ID
  - `outputDir` (String): Output directory
  - `runBrowserTests` (Boolean): Enable browser tests
  - `browsers` (Array): Browsers to test

#### Methods

##### verifyPlatform(options)

Runs comprehensive platform verification.

```javascript
const { verification, reports } = await orchestrator.verifyPlatform({
  verifyEntities: true,
  verifyDashboards: true,
  runE2E: false,
  dashboardGuids: ['ABC123', 'DEF456'],
  entityConfig: {
    entityTypes: ['MESSAGE_QUEUE_CLUSTER', 'MESSAGE_QUEUE_TOPIC'],
    expectedCounts: {
      'MESSAGE_QUEUE_CLUSTER': 2,
      'MESSAGE_QUEUE_TOPIC': 20
    }
  }
});
```

**Parameters:**
- `options` (Object): Verification options
  - `verifyEntities` (Boolean): Run entity verification
  - `verifyDashboards` (Boolean): Run dashboard verification
  - `runE2E` (Boolean): Run end-to-end tests
  - `dashboardGuids` (Array): Dashboard GUIDs to verify
  - `entityConfig` (Object): Entity verification config

**Returns:** Object with `verification` results and `reports` paths

### EntityVerifier

Verifies entity synthesis.

#### Methods

##### verifyEntitySynthesis(entityType, expectedCount, options)

Verifies entities are synthesized correctly.

```javascript
const result = await verifier.verifyEntitySynthesis(
  'MESSAGE_QUEUE_CLUSTER',
  2,
  {
    timeout: 60000,
    checkGoldenMetrics: true,
    checkRelationships: true
  }
);
```

**Returns:** Verification result object

### DashboardVerifier

Verifies dashboard functionality.

#### Methods

##### verifyDashboard(dashboardGuid, options)

Verifies a single dashboard.

```javascript
const result = await verifier.verifyDashboard('ABC123', {
  checkQueries: true,
  checkWidgets: true,
  loadTest: false
});
```

**Returns:** Dashboard verification result

### BrowserVerifier

Browser-based dashboard testing.

#### Methods

##### verifyDashboard(dashboardUrl, options)

Runs browser tests on dashboard.

```javascript
const results = await browserVerifier.verifyDashboard(
  'https://one.newrelic.com/dashboards/abc123',
  {
    browsers: ['chromium', 'firefox'],
    viewport: { width: 1920, height: 1080 },
    screenshots: true
  }
);
```

**Returns:** Browser test results

## CLI Commands

### Global Command Structure

```bash
mq-platform [command] [subcommand] [options]
```

### Command Reference

#### simulate

Simulation and data generation commands.

##### simulate stream

```bash
mq-platform simulate stream [options]

Options:
  -p, --provider <provider>      Provider (kafka, rabbitmq, sqs)
  -c, --clusters <count>         Number of clusters
  -b, --brokers <count>          Brokers per cluster
  -t, --topics <count>           Topics per cluster
  -e, --environment <env>        Environment name
  -r, --region <region>          Region
  -i, --interval <seconds>       Streaming interval
  -d, --duration <minutes>       Duration (omit for continuous)
  --events                       Stream as events
  --metrics                      Stream as metrics
```

##### simulate create-topology

```bash
mq-platform simulate create-topology [options]

Options:
  -p, --provider <provider>      Provider
  -c, --clusters <count>         Number of clusters
  -b, --brokers <count>          Brokers per cluster
  -t, --topics <count>           Topics per cluster
  -q, --queues <count>           Queues per cluster
  -e, --environment <env>        Environment
  -r, --region <region>          Region
  --stream                       Stream immediately
  --continuous                   Start continuous streaming
```

#### dashboard

Dashboard creation and management.

##### dashboard create

```bash
mq-platform dashboard create [options]

Options:
  -t, --template <template>      Template (overview, cluster, topics, brokers, queues)
  -n, --name <name>              Dashboard name
  -p, --provider <provider>      Provider
  -e, --environment <env>        Environment
  -c, --cluster <cluster>        Cluster name (for cluster template)
  --dry-run                      Preview without creating
  --no-deploy                    Build without deploying
```

##### dashboard generate-suite

```bash
mq-platform dashboard generate-suite [options]

Options:
  -p, --provider <provider>      Provider (required)
  -e, --environment <env>        Environment (required)
  --dry-run                      Preview dashboards
```

#### entity

Entity management commands.

##### entity import

```bash
mq-platform entity import [options]

Options:
  -t, --types <types>            Entity types to import (comma-separated)
  -o, --output <file>            Export to file
  --list                         List available types
```

#### verify

Verification commands.

##### verify platform

```bash
mq-platform verify platform [options]

Options:
  --verify-entities              Verify entity synthesis
  --verify-dashboards            Verify dashboards
  --verify-browser               Run browser tests
  --verify-e2e                   Run end-to-end tests
  -d, --dashboard-guids <guids>  Dashboard GUIDs (comma-separated)
  -u, --dashboard-urls <urls>    Dashboard URLs for browser testing
  -o, --output <dir>             Output directory
  --browsers <browsers>          Browsers to test (chromium,firefox,webkit)
```

##### verify dashboard

```bash
mq-platform verify dashboard [options]

Options:
  -g, --guid <guid>              Dashboard GUID (required)
  -l, --load-test                Include load testing
  -f, --format <format>          Report format (json, html, csv)
  -o, --output <dir>             Output directory
```

#### config

Configuration management.

##### config init

```bash
mq-platform config init
```

Interactive configuration setup.

##### config validate

```bash
mq-platform config validate
```

Validates current configuration.

### Environment Variables

The CLI respects these environment variables:

- `NEW_RELIC_API_KEY` - API key for data ingestion
- `NEW_RELIC_USER_API_KEY` - User API key for dashboards
- `NEW_RELIC_ACCOUNT_ID` - New Relic account ID
- `NEW_RELIC_REGION` - API region (US or EU)
- `DEBUG` - Enable debug logging (e.g., `DEBUG=mq-platform:*`)

### Exit Codes

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - API error
- `4` - Verification failure