# Kafka Entity Synthesis Deployment Runbook

## Overview

This runbook provides step-by-step instructions for deploying and maintaining the Kafka monitoring solution using synthetic MSK events in New Relic.

## Prerequisites

1. New Relic account with:
   - Insert API Key (IKEY)
   - User API Key (UKEY) 
   - Account ID (ACC)

2. Environment variables configured in `.env`:
   ```
   IKEY=your_insert_key
   ACC=your_account_id
   UKEY=your_user_key
   ```

## Deployment Steps

### Step 1: Initial Data Ingestion

Test that events can be ingested for your cluster:

```bash
cd kafka-entity-synthesis
node exact-working-format-replicator.js <your-cluster-name>
```

Expected output:
```
✅ Events submitted successfully!
📊 Cluster Events: ✅ (1 events)
📊 Broker Events: ✅ (3 events)  
📊 Topic Events: ✅ (5 events)
```

### Step 2: Deploy Continuous Streaming

For production monitoring, deploy the continuous streamer:

```bash
# Run in background with nohup
nohup node continuous-exact-format-streamer.js <your-cluster-name> > kafka-streamer.log 2>&1 &

# Or use screen/tmux
screen -S kafka-streamer
node continuous-exact-format-streamer.js <your-cluster-name>
# Detach with Ctrl+A, D
```

The streamer will:
- Send events every 5 minutes
- Include realistic metric variations
- Maintain data freshness for UI and alerts

### Step 3: Create Custom Dashboard

Import the custom dashboard to visualize your data:

1. Go to: https://one.newrelic.com/dashboards
2. Click "Import dashboard"
3. Copy contents of `custom-kafka-dashboard.json`
4. Update the `accountId` field to your account ID
5. Import and save

The dashboard includes:
- Cluster health overview
- Broker performance metrics
- Topic throughput and lag
- Data freshness monitoring

### Step 4: Configure Alerts

Set up alerts for your cluster:

```bash
node kafka-alerts-config.js <your-cluster-name>
```

This creates alerts for:
- Offline partitions
- Missing active controller
- High CPU/Memory usage
- Under-replicated partitions
- High consumer lag
- Data freshness

### Step 5: Alternative Visibility (Optional)

For service-level visibility in APM:

```bash
node apm-service-bridge.js <your-cluster-name>
```

This creates APM services that can be viewed in the Services UI.

## Verification

### Check Data Ingestion

```sql
-- Verify cluster data
FROM AwsMskClusterSample 
SELECT count(*), latest(timestamp) 
WHERE provider.clusterName = '<your-cluster-name>' 
SINCE 10 minutes ago

-- Check all event types
SELECT count(*) 
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample 
WHERE provider.clusterName = '<your-cluster-name>' 
FACET eventType() 
SINCE 10 minutes ago
```

### Monitor Streaming Health

Check the continuous streamer logs:
```bash
tail -f kafka-streamer.log
```

Look for:
- Regular iteration timestamps
- Successful submission confirmations
- Current metric values

## Troubleshooting

### Issue: No data in NRDB

1. Check environment variables are set correctly
2. Verify API keys have proper permissions
3. Check network connectivity to New Relic
4. Review streamer logs for errors

### Issue: Alerts not triggering

1. Ensure continuous streamer is running
2. Verify alert conditions match your thresholds
3. Check that data is fresh (< 10 minutes old)
4. Review alert policy configuration

### Issue: Dashboard shows no data

1. Verify cluster name in dashboard variable matches exactly
2. Check time range (data may take 5 minutes to appear)
3. Ensure events are being ingested via NRQL query

## Maintenance

### Daily Checks
- Verify continuous streamer is running
- Check dashboard for anomalies
- Review any triggered alerts

### Weekly Tasks
- Review streamer logs for errors
- Validate metric accuracy
- Update alert thresholds if needed

### Monthly Tasks
- Clean up old log files
- Review and optimize dashboard queries
- Update documentation with any changes

## Scaling to Multiple Clusters

To monitor multiple clusters:

1. Run separate streamer for each cluster:
   ```bash
   node continuous-exact-format-streamer.js cluster1 &
   node continuous-exact-format-streamer.js cluster2 &
   ```

2. Create dashboard with cluster selector variable

3. Set up alerts per cluster or use wildcard conditions

## Important Notes

1. **No UI Entity Visibility**: Data will NOT appear in Message Queues UI due to AWS integration requirement
2. **Custom Solution**: This is a workaround using direct event ingestion
3. **Data Freshness**: Maintain continuous streaming for alerts and dashboards
4. **Cost**: Monitor data ingestion volume for billing implications

## Support Contacts

- New Relic Support: Include reference to this custom MSK synthesis solution
- Internal Team: Document any cluster-specific configurations
- GitHub Repo: Link to your entity synthesis code repository

## Appendix: Quick Commands

```bash
# Start continuous streaming
node continuous-exact-format-streamer.js <cluster>

# Create alerts
node kafka-alerts-config.js <cluster>

# Verify data
node automated-verification-suite.js <cluster>

# Test single submission
node exact-working-format-replicator.js <cluster>

# APM visibility
node apm-service-bridge.js <cluster>
```