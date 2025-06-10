# nri-kafka Infrastructure Mode Setup Guide

## Prerequisites

1. **nri-kafka installed and running** on your Kafka brokers
2. **Valid New Relic credentials** in your `.env` file
3. **KafkaBrokerSample data** flowing to New Relic

## Step 1: Set Up Credentials

1. Copy `.env.real` to `.env`:
   ```bash
   cp .env.real .env
   ```

2. Edit `.env` and replace with your actual credentials:
   - `NEW_RELIC_ACCOUNT_ID`: Your account ID
   - `NEW_RELIC_API_KEY`: Your ingest API key (NRAK-...)
   - `NEW_RELIC_USER_API_KEY`: Your user API key for dashboards
   - `KAFKA_CLUSTER_NAME`: Your actual Kafka cluster name

## Step 2: Verify nri-kafka Data

Run the verification script to ensure nri-kafka is sending data:

```bash
node check-nri-kafka-data.js
```

You should see:
- ✅ KafkaBrokerSample data with broker count
- ✅ KafkaTopicSample data with topic names
- ✅ Cluster names and broker IDs

## Step 3: Run in Infrastructure Mode

### Option A: Using the Unified Runner (Recommended)
```bash
./run-infrastructure-mode.sh
```

This provides:
- Visual progress indicators
- Automatic dashboard creation
- Comprehensive error handling
- Cluster entity aggregation

### Option B: Direct TypeScript Execution
```bash
PLATFORM_MODE=infrastructure npx tsx src/platform.ts --interval 30
```

### Option C: Using the Unified Script
```bash
PLATFORM_MODE=infrastructure node run-platform-unified.js
```

## Step 4: Monitor Progress

The platform will:
1. **Query NRDB** for KafkaBrokerSample, KafkaTopicSample, and KafkaConsumerSample
2. **Transform** nri-kafka metrics to standardized format
3. **Synthesize** MESSAGE_QUEUE entities with proper GUIDs
4. **Stream** entities to New Relic Event API
5. **Create dashboards** automatically after 2 cycles

## Expected Output

```
📥 1. Collecting Data...
   🔍 Querying NRDB for KafkaBrokerSample data...
   ✅ Collected 15 samples (234ms)

🔄 2. Transforming Metrics...
   ✅ Transformed 15 metrics (12ms)

🏗️ 3. Synthesizing Entities...
   ✅ Synthesized 15 entities (8ms)
   ✅ Created cluster entity with health score: 95%

📤 4. Streaming to New Relic...
   ✅ Streamed 16 entities (156ms)

📊 5. Managing Dashboard...
   ✅ Dashboard created successfully (892ms)
   🔗 View at: https://one.newrelic.com/dashboards/YOUR-GUID
```

## Troubleshooting

### No Data Found
1. Check nri-kafka is running: `sudo systemctl status newrelic-infra`
2. Verify Kafka integration: `sudo cat /etc/newrelic-infra/integrations.d/kafka-config.yml`
3. Check logs: `sudo journalctl -u newrelic-infra -f`

### Authentication Errors
1. Verify API key starts with `NRAK-`
2. Check account ID is correct
3. Ensure API key has proper permissions

### Missing Entities
1. Entity synthesis takes 2-3 minutes
2. Check in Entity Explorer: Filter by `entityType = MESSAGE_QUEUE_*`
3. Run NRQL: `FROM MessageQueue SELECT * WHERE entityType LIKE 'MESSAGE_QUEUE_%'`

## Customization

### Adjust Collection Interval
```bash
PLATFORM_INTERVAL=60 ./run-infrastructure-mode.sh
```

### Change Lookback Window
```bash
LOOKBACK_MINUTES=10 ./run-infrastructure-mode.sh
```

### Specify Cluster Name
```bash
KAFKA_CLUSTER_NAME="production-kafka" ./run-infrastructure-mode.sh
```

### Disable Dashboard Creation
```bash
DASHBOARD_ENABLED=false ./run-infrastructure-mode.sh
```

## Next Steps

1. **View Entities**: Go to Entity Explorer and filter by MESSAGE_QUEUE
2. **Check Dashboard**: Click the dashboard link in the output
3. **Set up Alerts**: Use the synthesized entities for alerting
4. **Monitor Continuously**: Keep the platform running for real-time updates

## Architecture

```
nri-kafka → NRDB → Platform → MESSAGE_QUEUE Entities → Dashboards
    ↓         ↓         ↓              ↓                    ↓
 Brokers   Query    Transform      Synthesize          Visualize
 Topics    via      to UDM         with GUIDs         in New Relic
 Consumers NRQL     Format         Entity Platform
```