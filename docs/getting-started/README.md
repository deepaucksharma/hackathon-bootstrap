# Getting Started with Message Queues Platform

> **Time to Success**: 5 minutes  
> **Prerequisites**: New Relic account with API access  
> **Difficulty**: Beginner

This guide gets you from zero to monitoring Kafka in New Relic in under 5 minutes using simulation mode.

> **📋 Reference**: For complete technical details, see the [Technical Specification](../TECHNICAL_SPECIFICATION.md).

## Step 1: Quick Setup (2 minutes)

### Clone and Install
```bash
# Clone the repository
git clone https://github.com/newrelic/nri-kafka.git
cd nri-kafka/newrelic-message-queues-platform

# Install dependencies
npm install
```

### Set Environment Variables
```bash
# Required: Your New Relic credentials
export NEW_RELIC_INGEST_KEY="your_ingest_key_here"  # For sending data
export NEW_RELIC_USER_API_KEY="your_user_api_key_here"  # For dashboards
export NEW_RELIC_ACCOUNT_ID="your_account_id_here"

# Optional: Enable debug output
export DEBUG="platform:*"
```

**Where to find these:**
- Ingest Key: For sending telemetry data (License Key or Ingest - Insert Key)
- User API Key: For creating dashboards (must have dashboard permissions)
- Account ID: Look at the URL when in New Relic (e.g., `https://one.newrelic.com/accounts/1234567/`)

## Step 2: Start Simulation Mode (1 minute)

The fastest way to see the platform working is simulation mode - no Kafka infrastructure required:

```bash
# Start the platform in simulation mode
node platform.js --mode=simulation --duration=300
```

You should see output like:
```
✅ Platform starting in simulation mode
✅ Generated 2 clusters, 6 brokers, 20 topics
🚀 Streaming MESSAGE_QUEUE entities to New Relic...
📊 Sent 150 entity events successfully
```

## Step 3: Verify in New Relic (2 minutes)

1. **Go to Entity Explorer**: [New Relic One > Explorer](https://one.newrelic.com/launcher/nr1-core.explorer)

2. **Filter by MESSAGE_QUEUE**: In the entity filter, type "MESSAGE_QUEUE"

3. **You should see**:
   - `MESSAGE_QUEUE_CLUSTER` entities (your simulated clusters)
   - `MESSAGE_QUEUE_BROKER` entities (individual brokers)
   - `MESSAGE_QUEUE_TOPIC` entities (topics with metrics)

4. **Click on any entity** to see:
   - Golden metrics (throughput, error rate, response time)
   - Detailed attributes (cluster name, broker ID, etc.)
   - Related entities (cluster → brokers → topics)

## Step 4: Create Your First Dashboard

Generate a pre-built dashboard to visualize your data:

```bash
# Create a cluster overview dashboard
node dashboards/cli.js create --template=cluster-overview --provider=kafka
```

This creates a dashboard with:
- Cluster health overview
- Broker performance metrics
- Topic throughput analysis
- Consumer lag tracking

**Find your dashboard**: [New Relic One > Dashboards](https://one.newrelic.com/launcher/dashboards.dashboards)

## 🎉 Success! What You've Accomplished

In 5 minutes, you've:
- ✅ Installed the Message Queues Platform
- ✅ Generated realistic Kafka simulation data
- ✅ Created MESSAGE_QUEUE entities in New Relic
- ✅ Built a monitoring dashboard

## Next Steps

### For Development/Testing
Continue with simulation mode to:
- [Test different failure scenarios](../user-guide/platform-modes.md#simulation-scenarios)
- [Create custom dashboards](../user-guide/working-with-dashboards.md)
- [Explore the CLI](../user-guide/cli-reference.md)

### For Production Monitoring
Upgrade to infrastructure mode to monitor real Kafka:
- [Set up nri-kafka integration](../operations/infrastructure-setup.md) on your Kafka hosts
- [Configure infrastructure mode](../user-guide/platform-modes.md#infrastructure-mode) to transform real data
- The platform will transform nri-kafka data to UDM events automatically

### For Advanced Use Cases
Try hybrid mode:
- [Combine real and simulated data](../user-guide/platform-modes.md#hybrid-mode)
- [Fill gaps in infrastructure coverage](../operations/infrastructure-setup.md#gap-detection)

## Troubleshooting Quick Start

### No entities appearing in New Relic?

**Check 1**: Verify API credentials
```bash
# Test API access
curl -H "Api-Key: $NEW_RELIC_API_KEY" \
     "https://api.newrelic.com/graphql" \
     -d '{"query": "{ actor { user { email } } }"}'
```

**Check 2**: Wait for entity synthesis
- It takes 2-3 minutes for entities to appear
- Check for platform errors in logs

**Check 3**: Verify account ID
- Must be numeric (e.g., "1234567", not "your_account_id_here")
- Check the URL when logged into New Relic

### Platform not starting?

**Check 1**: Node.js version
```bash
node --version  # Should be 14+ 
```

**Check 2**: Dependencies installed
```bash
npm install --verbose
```

**Check 3**: Environment variables set
```bash
echo "API Key: $NEW_RELIC_API_KEY"
echo "Account: $NEW_RELIC_ACCOUNT_ID"
```

### Dashboard not creating?

**Check 1**: User API Key permissions
- Must be a "User Key", not "Ingest Key"
- Check in [API Keys UI](https://one.newrelic.com/launcher/api-keys-ui.api-keys-launcher)

**Check 2**: Wait for entities
- Dashboards need entities to exist first
- Run simulation for 2-3 minutes before creating dashboard

### Still having issues?
- [Full Troubleshooting Guide](../user-guide/troubleshooting.md)
- [Common Configuration Issues](../reference/configuration-reference.md#troubleshooting)
- [Open a GitHub Issue](https://github.com/newrelic/nri-kafka/issues)

## Understanding What Happened

### Simulation Mode & UDM
- Generated UDM-compliant events (MessageQueueBrokerSample, etc.)
- Simulated realistic Kafka metrics following the Unified Data Model
- Created patterns matching real infrastructure behavior

### Entity Synthesis
- New Relic synthesized MESSAGE_QUEUE_* entities from UDM events
- Entity GUIDs follow pattern: `{entityType}|{accountId}|{provider}|{identifiers}`
- Automatic relationship mapping between entities

### Dashboard Creation
- Templates use NRQL queries against UDM events and entities
- Pre-built visualizations for common operational views
- Consistent metrics across all message queue providers

### Three Operating Modes
The platform supports three modes:
1. **Simulation** (used here): Generate test data without infrastructure
2. **Infrastructure**: Transform real nri-kafka data to UDM
3. **Hybrid**: Combine real and simulated data

## Configuration Reference

For the quick start, only these variables are needed:

```bash
# Required
NEW_RELIC_INGEST_KEY="your-license-key"   # License/Ingest key for data
NEW_RELIC_USER_API_KEY="nrak-..."        # User API Key for dashboards
NEW_RELIC_ACCOUNT_ID="1234567"           # Numeric account ID

# Optional
NEW_RELIC_REGION="US"                    # US or EU
DEBUG="platform:*"                       # Enable debug logging
PLATFORM_MODE="simulation"               # simulation|infrastructure|hybrid
```

[**→ Full Configuration Options**](../reference/configuration-reference.md)

---

**Next**: [Understand Platform Modes](../user-guide/platform-modes.md) | [Create Dashboards](../user-guide/working-with-dashboards.md) | [CLI Reference](../user-guide/cli-reference.md)