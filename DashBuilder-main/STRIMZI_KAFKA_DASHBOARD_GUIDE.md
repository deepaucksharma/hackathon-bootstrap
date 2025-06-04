# Strimzi Kafka Dashboard Guide

This guide explains how to verify Kafka metrics from your Strimzi deployment and create a comprehensive monitoring dashboard in New Relic.

## Scripts Overview

### 1. verify-strimzi-kafka-metrics.js
This script verifies what Kafka metrics are available from your Strimzi deployment.

### 2. deploy-strimzi-kafka-dashboard.js
This script creates a comprehensive Kafka monitoring dashboard tailored for Strimzi deployments.

## Prerequisites

1. Set your New Relic API key:
```bash
export UKEY="your-new-relic-api-key"
# or
export NEW_RELIC_API_KEY="your-new-relic-api-key"
```

2. Set your account ID (optional, defaults to 3630072):
```bash
export ACC="your-account-id"
# or
export NEW_RELIC_ACCOUNT_ID="your-account-id"
```

3. Install dependencies:
```bash
cd /Users/deepaksharma/syc/hackathon-bootstrap/DashBuilder-main
npm install
```

## Usage

### Step 1: Verify Available Metrics

Run the verification script to check what Kafka metrics are available:

```bash
./verify-strimzi-kafka-metrics.js
```

This script will:
- Check if KafkaBrokerSample data exists for clusterName containing 'strimzi'
- List all available metrics in each Kafka event type
- Check for consumer/producer metrics
- Check for topic metrics and consumer lag
- Verify if any MSK entity types exist
- Test sample queries for broker health, request performance, and replication metrics

The results will be saved to a timestamped JSON file for reference.

### Step 2: Deploy the Dashboard

Once you've verified metrics are available, deploy the dashboard:

```bash
./deploy-strimzi-kafka-dashboard.js
```

This will create a dashboard with the following pages:

1. **Cluster Overview** - Overall health and performance metrics
2. **Broker Details** - Individual broker performance
3. **Topics & Partitions** - Topic health and partition status
4. **Consumer Lag** - Consumer group performance and lag monitoring
5. **Performance Analysis** - Detailed latency and throughput metrics
6. **MSK Compatibility** - MSK-compatible metrics if available

## Dashboard Features

### Cluster Overview Page
- Active brokers and topics count
- Under-replicated partitions
- Average consumer lag
- Broker throughput (messages/sec, MB in/out)
- Request performance by type
- Replication health metrics
- Failed request rates
- Log flush and network metrics

### Broker Details Page
- Per-broker status table
- Message rate by broker
- Request latency by broker
- Leader election rates

### Topics & Partitions Page
- Topic health status table
- Topics with replication issues
- Topics with non-preferred leaders
- Under-replicated partitions trend

### Consumer Lag Page
- Consumer group lag summary table
- Lag trends by consumer group
- Maximum lag metrics
- Total lag across all groups

### Performance Analysis Page
- Request latency percentiles (p99)
- Handler utilization
- Request queue performance
- Request rates by type
- Expired request monitoring

### MSK Compatibility Page
- Checks for AWS MSK entity types
- MSK-compatible metrics from standard Kafka samples

## NRQL Queries Used

The dashboard uses various NRQL queries to monitor:

1. **Cluster Health**:
```sql
SELECT uniqueCount(displayName) AS 'Active Brokers' 
FROM KafkaBrokerSample 
WHERE clusterName LIKE '%strimzi%' 
SINCE 10 minutes ago
```

2. **Broker Throughput**:
```sql
SELECT average(broker.messagesInPerSecond) AS 'Messages/sec',
       average(broker.IOInPerSecond)/1024/1024 AS 'MB In/sec',
       average(broker.IOOutPerSecond)/1024/1024 AS 'MB Out/sec'
FROM KafkaBrokerSample 
WHERE clusterName LIKE '%strimzi%' 
TIMESERIES AUTO
```

3. **Consumer Lag**:
```sql
SELECT latest(consumerGroup) AS 'Consumer Group',
       latest(topic) AS 'Topic',
       max(consumer.lag) AS 'Max Partition Lag',
       sum(consumer.lag) AS 'Total Lag'
FROM KafkaOffsetSample 
WHERE clusterName LIKE '%strimzi%' 
FACET consumerGroup, topic 
SINCE 10 minutes ago
```

4. **Replication Health**:
```sql
SELECT sum(replication.unreplicatedPartitions) AS 'Unreplicated Partitions',
       average(replication.isrExpandsPerSecond) AS 'ISR Expands/sec',
       average(replication.isrShrinksPerSecond) AS 'ISR Shrinks/sec'
FROM KafkaBrokerSample 
WHERE clusterName LIKE '%strimzi%' 
TIMESERIES AUTO
```

## Customization

The dashboard queries use `WHERE clusterName LIKE '%strimzi%'` to filter for Strimzi deployments. If your cluster has a specific name, you can modify the scripts to use exact matching:

```javascript
// Change from:
WHERE clusterName LIKE '%strimzi%'

// To:
WHERE clusterName = 'strimzi-production-kafka'
```

## Troubleshooting

1. **No data appearing**: 
   - Run the verification script first to ensure metrics are being collected
   - Check that your nri-kafka integration is properly configured
   - Verify the clusterName in your metrics matches the filter

2. **API errors**:
   - Ensure your API key is set correctly
   - Verify the account ID is correct
   - Check API key permissions

3. **Missing metrics**:
   - Some metrics may not be available depending on your Kafka/Strimzi configuration
   - Consumer/Producer samples may be empty if JMX metrics are not properly exposed

## Output Files

- `strimzi-kafka-metrics-verification-[timestamp].json` - Verification results
- `strimzi-kafka-dashboard-info.json` - Dashboard deployment information including GUID and URL