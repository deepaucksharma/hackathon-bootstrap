# Quick Start Guide

Get the New Relic Message Queues Platform running in minutes with real infrastructure data or simulations.

## Prerequisites

- New Relic account with appropriate API keys
- Node.js 14+ installed
- For infrastructure mode: nri-kafka configured on your Kafka hosts
- For simulation mode: No additional requirements

## Installation

```bash
git clone <repository-url>
cd newrelic-message-queues-platform
npm install
```

## Configuration

Create a `.env` file with your New Relic credentials:

```bash
# Required for all modes
NEW_RELIC_ACCOUNT_ID=your-account-id
NEW_RELIC_USER_API_KEY=your-user-api-key  # For dashboards

# Required for simulation mode
NEW_RELIC_INGEST_KEY=your-ingest-key      # For data streaming

# Optional
NEW_RELIC_REGION=US                       # US or EU
DEBUG=platform:*                           # Enable debug logging
```

## Usage Modes

### 1. Infrastructure Mode - Transform Real Data

Use this mode when you have nri-kafka already collecting data from real Kafka clusters.

```bash
# Basic usage - queries and transforms nri-kafka data
node platform.js --mode=infrastructure

# With custom interval
node platform.js --mode=infrastructure --interval=60

# Debug mode to see transformations
DEBUG=transform:* node platform.js --mode=infrastructure
```

**What happens:**
1. Queries KafkaBrokerSample and KafkaTopicSample from your account
2. Transforms them to MESSAGE_QUEUE_* entities
3. Creates cluster-level aggregations
4. Streams transformed entities back to New Relic

### 2. Simulation Mode - Generate Test Data

Use this mode for testing, demos, or when you don't have real infrastructure.

```bash
# Basic Kafka simulation
node platform.js --mode=simulation --provider=kafka

# Advanced simulation with multiple clusters
node platform.js --mode=simulation \
  --provider=kafka \
  --clusters=2 \
  --brokers=3 \
  --topics=10 \
  --duration=300  # Run for 5 minutes
```

**What happens:**
1. Creates simulated Kafka topology
2. Generates realistic metrics with patterns
3. Streams data as MESSAGE_QUEUE_* entities
4. Includes anomalies and business hour variations

### 3. Hybrid Mode - Best of Both

Combines real infrastructure data with simulated components.

```bash
# Automatically detects what's real vs needs simulation
node platform.js --mode=hybrid
```

**What happens:**
1. Queries for existing nri-kafka data
2. Identifies gaps (missing topics, consumer groups, etc.)
3. Simulates only the missing components
4. Provides complete visibility

## Creating Dashboards

### From Templates

```bash
# List available templates
node dashboards/cli.js list-templates

# Create cluster overview dashboard
node dashboards/cli.js create \
  --template=cluster-overview \
  --provider=kafka \
  --name="Kafka Production Overview"

# Generate complete dashboard suite
node dashboards/cli.js generate-suite \
  --provider=kafka \
  --environment=production
```

### Available Templates
- `cluster-overview`: High-level cluster health and performance
- `broker-performance`: Detailed broker metrics and analysis
- `topic-analysis`: Topic throughput, lag, and partition details
- `consumer-groups`: Consumer group lag and performance

## Verification

Ensure everything is working correctly:

```bash
# Verify entity synthesis
node verification/verify-entities.js \
  --type=MESSAGE_QUEUE_BROKER \
  --expected-count=3

# Verify dashboard functionality
node verification/verify-dashboard.js \
  --guid=YOUR_DASHBOARD_GUID

# Run comprehensive platform verification
node verification/verify-platform.js
```

## Common Scenarios

### Scenario 1: Production Kafka Monitoring

```bash
# Step 1: Ensure nri-kafka is configured on Kafka hosts
# Step 2: Start infrastructure mode transformation
node platform.js --mode=infrastructure --interval=60

# Step 3: Create production dashboards
node dashboards/cli.js generate-suite \
  --provider=kafka \
  --environment=production \
  --deploy

# Step 4: Verify data flow
node verification/verify-entities.js --type=MESSAGE_QUEUE_CLUSTER
```

### Scenario 2: Demo Environment Setup

```bash
# Step 1: Create simulated environment
node examples/demo-setup.js \
  --provider=kafka \
  --scale=medium  # 2 clusters, 6 brokers, 20 topics

# Step 2: Stream continuous data
node platform.js --mode=simulation \
  --config=./examples/demo-config.json

# Step 3: Create demo dashboards
node dashboards/cli.js create \
  --template=cluster-overview \
  --name="Kafka Demo Dashboard"
```

### Scenario 3: Testing Dashboard Changes

```bash
# Step 1: Start local simulation
node platform.js --mode=simulation \
  --provider=kafka \
  --fast  # 10-second intervals for rapid testing

# Step 2: Create test dashboard
node dashboards/cli.js create \
  --template=cluster-overview \
  --name="Test Dashboard" \
  --dry-run  # Preview without creating

# Step 3: Deploy when ready
node dashboards/cli.js create \
  --template=cluster-overview \
  --name="Test Dashboard" \
  --deploy
```

## Troubleshooting

### No Data Appearing

1. **Check nri-kafka is working** (infrastructure mode):
   ```nrql
   FROM KafkaBrokerSample SELECT count(*) SINCE 10 minutes ago
   ```

2. **Verify API credentials**:
   ```bash
   node tools/test-connection.js
   ```

3. **Enable debug logging**:
   ```bash
   DEBUG=* node platform.js --mode=infrastructure
   ```

### Entity Synthesis Issues

1. **Check GUID format**:
   ```bash
   node tools/validate-guids.js
   ```

2. **Wait for synthesis** (2-3 minutes):
   ```nrql
   FROM MessageQueue SELECT count(*) 
   WHERE entityType LIKE 'MESSAGE_QUEUE_%' 
   SINCE 5 minutes ago
   ```

### Dashboard Creation Fails

1. **Verify User API key permissions**
2. **Check account ID is correct**
3. **Try with --dry-run first**

## Next Steps

1. **Explore Examples**:
   - `examples/simple-streaming.js` - Basic simulation
   - `examples/infrastructure-mode.js` - Real data transformation
   - `examples/hybrid-setup.js` - Combined approach

2. **Read Documentation**:
   - [Architecture Overview](./ARCHITECTURE.md) - System design
   - [Entity Framework](./ENTITY_FRAMEWORK.md) - Entity model details
   - [API Reference](./API_REFERENCE.md) - Complete API documentation

3. **Customize**:
   - Add custom entity types
   - Create new dashboard templates
   - Implement provider-specific transformations

## Support

- GitHub Issues: Report bugs or request features
- Documentation: Check `/docs` for detailed guides
- Examples: Review `/examples` for common patterns