# Kafka Metrics Verification Guide

This guide helps you verify that Kafka metrics are reaching New Relic's NRDB through both the standard integration and MSK shim methods.

## Prerequisites

- New Relic API Key (User API Key with NRQL query permissions)
- New Relic Account ID
- Kafka cluster name (optional, for filtering)

## Verification Scripts

### 1. Shell Script (`verify-nrdb-metrics.sh`)

Basic verification using curl and jq:

```bash
./verify-nrdb-metrics.sh <API_KEY> <ACCOUNT_ID> [CLUSTER_NAME]

# Example:
./verify-nrdb-metrics.sh NRAK-XXXXXXXXXX 1234567 my-kafka-cluster
```

**Features:**
- Checks standard Kafka metrics (KafkaBrokerSample, KafkaTopicSample, etc.)
- Verifies MSK shim metrics (AwsMskClusterSample, AwsMskBrokerSample, etc.)
- Shows key performance metrics
- Provides entity counts and consumer lag analysis

### 2. Node.js Script (`verify-metrics-nodejs.js`)

More detailed verification with JSON output:

```bash
node verify-metrics-nodejs.js --apiKey=<API_KEY> --accountId=<ACCOUNT_ID> [--clusterName=<CLUSTER>]

# Example:
node verify-metrics-nodejs.js --apiKey=NRAK-XXXXXXXXXX --accountId=1234567 --clusterName=production
```

**Features:**
- Saves results to timestamped JSON file
- Provides detailed metric discovery
- Better error handling and formatting
- Comprehensive health summary

### 3. Comparison Script (`verify-metrics-comparison.sh`)

Compares standard vs MSK shim metrics:

```bash
./verify-metrics-comparison.sh <API_KEY> <ACCOUNT_ID> [CLUSTER_NAME]
```

**Features:**
- Side-by-side comparison of both collection methods
- Identifies missing metrics
- Generates detailed comparison report
- Provides specific recommendations

## What to Check

### Standard Kafka Integration Metrics

1. **Event Types:**
   - `KafkaBrokerSample` - Broker-level metrics
   - `KafkaTopicSample` - Topic-level metrics
   - `KafkaOffsetSample` - Consumer lag metrics
   - `KafkaProducerSample` - Producer metrics
   - `KafkaConsumerSample` - Consumer metrics

2. **Key Metrics:**
   - `broker.messagesInPerSecond` - Message throughput
   - `broker.IOInPerSecond` - Network input
   - `broker.IOOutPerSecond` - Network output
   - `consumer.lag` - Consumer lag

### MSK Shim Metrics

1. **Event Types:**
   - `AwsMskClusterSample` - Cluster-level metrics
   - `AwsMskBrokerSample` - Broker-level MSK metrics
   - `AwsMskTopicSample` - Topic-level MSK metrics

2. **Key Metrics:**
   - `aws.msk.MessagesInPerSec` - MSK message rate
   - `aws.msk.BytesInPerSec` - MSK bytes in
   - `aws.msk.BytesOutPerSec` - MSK bytes out
   - `aws.msk.ConsumerLag` - MSK consumer lag

## Troubleshooting

### No Metrics Found

1. **Check Integration Status:**
   ```bash
   # Kubernetes
   kubectl get pods -n <namespace> | grep kafka
   kubectl logs <nri-kafka-pod> -n <namespace>
   
   # Docker
   docker ps | grep nri-kafka
   docker logs <container-id>
   ```

2. **Verify JMX Configuration:**
   - JMX must be enabled on Kafka brokers
   - JMX port must be accessible from the integration
   - Check JMX authentication if enabled

3. **Check Configuration:**
   ```bash
   # Find config file
   find /etc/newrelic-infra -name "kafka-config.yml"
   cat /etc/newrelic-infra/integrations.d/kafka-config.yml
   ```

### MSK Shim Not Working

1. **Verify Environment Variables:**
   ```bash
   # Check if MSK shim is enabled
   MSK_SHIM_ENABLED=true
   AWS_ACCOUNT_ID=123456789012
   AWS_REGION=us-east-1
   KAFKA_CLUSTER_NAME=my-cluster
   ```

2. **Check Logs for MSK Shim:**
   ```bash
   # Look for MSK shim initialization
   kubectl logs <pod> | grep -i "msk"
   ```

### Partial Metrics

1. **Network Issues:**
   - Check connectivity to all brokers
   - Verify security groups/firewall rules

2. **Topic Limits:**
   - Default limit is 10,000 topics
   - Use topic filtering for large clusters

3. **Consumer Groups:**
   - Only active consumer groups are monitored
   - Check if consumers are running

## Using NRQL Directly

You can also query NRDB directly using the New Relic UI:

```sql
-- Check standard metrics
FROM KafkaBrokerSample SELECT count(*) 
WHERE clusterName = 'your-cluster' 
SINCE 5 minutes ago

-- Check MSK metrics
FROM AwsMskBrokerSample SELECT count(*) 
SINCE 5 minutes ago

-- Compare pipelines
FROM KafkaBrokerSample SELECT count(*) 
FACET pipeline 
SINCE 1 hour ago

-- Discover all metrics
FROM KafkaBrokerSample SELECT keyset() 
SINCE 1 hour ago LIMIT 1
```

## Next Steps

# AWS MSK Message Queues - Ultimate NRQL Verification Query List

This document contains a comprehensive list of NRQL queries to verify that all metrics and data points are in place for AWS MSK (both Polling and Metric Streams) to work correctly. 

## Common Patterns Between AWS MSK and Confluent Cloud

Both platforms share similar metric patterns:
- **Throughput Metrics**: bytesInPerSec, bytesOutPerSec (measured in bytes/second)
- **Message Rate Metrics**: messagesInPerSec, messagesOutPerSec (measured in messages/second)
- **Health Metrics**: Partition health, replication status, controller status
- **Entity Hierarchy**: Cluster → Broker → Topic → Partition
- **Aggregation Patterns**: Sum across brokers for cluster totals, average for rates
- **Time Series Data**: All metrics support time-based aggregation and trending

## 1. AWS MSK Polling Data Verification

### 1.1 Verify Cluster Sample Data Exists
```sql
-- Check if AwsMskClusterSample events exist
SELECT count(*) 
FROM AwsMskClusterSample 
SINCE 1 hour ago
```

### 1.2 Verify All Cluster Metrics Are Present
```sql
-- Check all required cluster metrics
SELECT 
  count(provider.activeControllerCount.Sum) as 'Has Active Controller Count',
  count(provider.offlinePartitionsCount.Sum) as 'Has Offline Partitions Count',
  count(provider.globalPartitionCount.Average) as 'Has Global Partition Count'
FROM AwsMskClusterSample 
SINCE 1 hour ago
```

### 1.3 Verify Broker Sample Data Exists
```sql
-- Check if AwsMskBrokerSample events exist
SELECT count(*) 
FROM AwsMskBrokerSample 
SINCE 1 hour ago
```

### 1.4 Verify All Broker Metrics Are Present
```sql
-- Check all required broker metrics
SELECT 
  count(provider.bytesInPerSec.Average) as 'Has Bytes In',
  count(provider.bytesOutPerSec.Average) as 'Has Bytes Out',
  count(provider.messagesInPerSec.Average) as 'Has Messages In',
  count(provider.messagesOutPerSec.Average) as 'Has Messages Out',
  count(provider.underReplicatedPartitions.Sum) as 'Has Under Replicated Partitions',
  count(provider.underMinIsrPartitionCount.Sum) as 'Has Under Min ISR Partitions'
FROM AwsMskBrokerSample 
SINCE 1 hour ago
```

### 1.5 Verify Topic Sample Data Exists
```sql
-- Check if AwsMskTopicSample events exist
SELECT count(*) 
FROM AwsMskTopicSample 
SINCE 1 hour ago
```

### 1.6 Verify All Topic Metrics Are Present
```sql
-- Check all required topic metrics
SELECT 
  count(provider.bytesInPerSec.Sum) as 'Has Bytes In',
  count(provider.bytesOutPerSec.Sum) as 'Has Bytes Out'
FROM AwsMskTopicSample 
SINCE 1 hour ago
```

### 1.7 Verify Cluster Attributes Are Present
```sql
-- Check required cluster attributes
SELECT 
  count(provider.clusterName) as 'Has Cluster Name',
  count(entity.guid) as 'Has Entity GUID',
  count(entityName) as 'Has Entity Name'
FROM AwsMskClusterSample 
SINCE 1 hour ago
```

### 1.8 Verify Broker Attributes Are Present
```sql
-- Check required broker attributes
SELECT 
  count(provider.clusterName) as 'Has Cluster Name',
  count(provider.brokerId) as 'Has Broker ID',
  count(entity.guid) as 'Has Entity GUID'
FROM AwsMskBrokerSample 
SINCE 1 hour ago
```

### 1.9 Verify Topic Attributes Are Present
```sql
-- Check required topic attributes
SELECT 
  count(provider.topic) as 'Has Topic Name',
  count(displayName) as 'Has Display Name',
  count(entity.guid) as 'Has Entity GUID'
FROM AwsMskTopicSample 
SINCE 1 hour ago
```

## 2. AWS MSK Metric Streams Data Verification

### 2.1 Verify Metric Events Exist for AWS Kafka
```sql
-- Check if Metric events exist with AWS Kafka metrics
SELECT count(*) 
FROM Metric 
WHERE metricName LIKE 'aws.kafka%' 
SINCE 1 hour ago
```

### 2.2 Verify Cluster-Level Metrics
```sql
-- Check all required cluster-level metrics from Metric Streams
SELECT 
  filter(count(*), WHERE metricName = 'aws.kafka.ActiveControllerCount') as 'Has Active Controller Count',
  filter(count(*), WHERE metricName = 'aws.kafka.OfflinePartitionsCount') as 'Has Offline Partitions Count',
  filter(count(*), WHERE metricName = 'aws.kafka.GlobalPartitionCount') as 'Has Global Partition Count'
FROM Metric 
WHERE metricName LIKE 'aws.kafka%'
SINCE 1 hour ago
```

### 2.3 Verify Broker-Level Metrics
```sql
-- Check all required broker-level metrics from Metric Streams
SELECT 
  filter(count(*), WHERE metricName = 'aws.kafka.BytesInPerSec.byBroker') as 'Has Broker Bytes In',
  filter(count(*), WHERE metricName = 'aws.kafka.BytesOutPerSec.byBroker') as 'Has Broker Bytes Out',
  filter(count(*), WHERE metricName = 'aws.kafka.MessagesInPerSec.byBroker') as 'Has Broker Messages In',
  filter(count(*), WHERE metricName = 'aws.kafka.MessagesOutPerSec.byBroker') as 'Has Broker Messages Out',
  filter(count(*), WHERE metricName = 'aws.kafka.UnderReplicatedPartitions') as 'Has Under Replicated Partitions',
  filter(count(*), WHERE metricName = 'aws.kafka.UnderMinIsrPartitionCount') as 'Has Under Min ISR Partitions'
FROM Metric 
WHERE metricName LIKE 'aws.kafka%'
SINCE 1 hour ago
```

### 2.4 Verify Topic-Level Metrics
```sql
-- Check all required topic-level metrics from Metric Streams
SELECT 
  filter(count(*), WHERE metricName = 'aws.kafka.BytesInPerSec.byTopic') as 'Has Topic Bytes In',
  filter(count(*), WHERE metricName = 'aws.kafka.BytesOutPerSec.byTopic') as 'Has Topic Bytes Out',
  filter(count(*), WHERE metricName = 'aws.kafka.MessagesInPerSec.byTopic') as 'Has Topic Messages In',
  filter(count(*), WHERE metricName = 'aws.kafka.MessagesOutPerSec.byTopic') as 'Has Topic Messages Out'
FROM Metric 
WHERE metricName LIKE 'aws.kafka%'
SINCE 1 hour ago
```

### 2.5 Verify Metric Streams Attributes
```sql
-- Check required attributes for Metric Streams
SELECT 
  count(aws.kafka.ClusterName OR aws.msk.clusterName) as 'Has Cluster Name',
  count(aws.kafka.BrokerID OR aws.msk.brokerId) as 'Has Broker ID (for broker metrics)',
  count(aws.kafka.Topic OR aws.msk.topic) as 'Has Topic Name (for topic metrics)'
FROM Metric 
WHERE metricName LIKE 'aws.kafka%'
SINCE 1 hour ago
```

## 3. Entity Existence Verification

### 3.1 Verify AWS MSK Cluster Entities
```sql
-- Check if AWS MSK Cluster entities exist
SELECT count(*) 
FROM NrdbQuery 
WHERE query = 'SELECT count(*) FROM AWSMSKCLUSTER'
```

### 3.2 Verify AWS MSK Broker Entities
```sql
-- Check if AWS MSK Broker entities exist
SELECT count(*) 
FROM NrdbQuery 
WHERE query = 'SELECT count(*) FROM AWSMSKBROKER'
```

### 3.3 Verify AWS MSK Topic Entities
```sql
-- Check if AWS MSK Topic entities exist
SELECT count(*) 
FROM NrdbQuery 
WHERE query = 'SELECT count(*) FROM AWSMSKTOPIC'
```

## 4. Data Quality and Completeness Verification

### 4.1 Check for Null/Zero Values in Critical Metrics
```sql
-- Identify clusters with missing critical metrics
SELECT provider.clusterName,
  CASE 
    WHEN provider.activeControllerCount.Sum IS NULL THEN 'Missing Active Controller Count'
    WHEN provider.activeControllerCount.Sum = 0 THEN 'Zero Active Controllers'
    ELSE 'OK'
  END as 'Controller Status',
  CASE 
    WHEN provider.globalPartitionCount.Average IS NULL THEN 'Missing Partition Count'
    WHEN provider.globalPartitionCount.Average = 0 THEN 'Zero Partitions'
    ELSE 'OK'
  END as 'Partition Status'
FROM AwsMskClusterSample 
WHERE provider.activeControllerCount.Sum IS NULL 
   OR provider.activeControllerCount.Sum = 0
   OR provider.globalPartitionCount.Average IS NULL
   OR provider.globalPartitionCount.Average = 0
SINCE 1 hour ago
```

### 4.2 Check for Data Freshness (Polling)
```sql
-- Check how recent the data is for each cluster
SELECT provider.clusterName,
  latest(timestamp) as 'Last Data Point',
  now() - latest(timestamp) as 'Age in Seconds'
FROM AwsMskClusterSample 
FACET provider.clusterName
SINCE 1 hour ago
```

### 4.3 Check for Data Freshness (Metric Streams)
```sql
-- Check how recent the AWS Metric Streams data is
SELECT aws.kafka.ClusterName OR aws.msk.clusterName as 'Cluster',
  latest(timestamp) as 'Last Data Point',
  now() - latest(timestamp) as 'Age in Seconds'
FROM Metric 
WHERE metricName LIKE 'aws.kafka%'
FACET aws.kafka.ClusterName OR aws.msk.clusterName
SINCE 1 hour ago
```

### 4.4 Verify Tag Completeness
```sql
-- Check which clusters have all required tags
SELECT provider.clusterName,
  CASE WHEN tags.environment IS NOT NULL THEN 1 ELSE 0 END as 'Has Environment',
  CASE WHEN tags.department IS NOT NULL THEN 1 ELSE 0 END as 'Has Department',
  CASE WHEN tags.owning_team IS NOT NULL THEN 1 ELSE 0 END as 'Has Owning Team',
  CASE WHEN tags.product IS NOT NULL THEN 1 ELSE 0 END as 'Has Product'
FROM AwsMskClusterSample 
SINCE 1 hour ago
```

### 4.5 Check for Consistent Data Points Across Metrics
```sql
-- Verify that clusters reporting in one metric also report in others
SELECT 
  uniqueCount(provider.clusterName) as 'Clusters in ClusterSample'
FROM AwsMskClusterSample 
SINCE 1 hour ago
```

```sql
SELECT 
  uniqueCount(provider.clusterName) as 'Clusters in BrokerSample'
FROM AwsMskBrokerSample 
SINCE 1 hour ago
```

```sql
SELECT 
  uniqueCount(provider.clusterName) as 'Clusters in TopicSample'
FROM AwsMskTopicSample 
SINCE 1 hour ago
```

## 5. Feature-Specific Verification Queries

### 5.1 Verify Summary Metrics Can Be Calculated
```sql
-- Test the summary calculation query
SELECT 
  uniqueCount(entity.guid) as 'Total Unique Clusters',
  filter(uniqueCount(entity.guid), WHERE provider.offlinePartitionsCount.Sum > 0) as 'Unhealthy Clusters'
FROM AwsMskClusterSample 
SINCE 1 hour ago
```

### 5.2 Verify Throughput Calculations Work
```sql
-- Test throughput aggregation across brokers
SELECT sum(bytesInPerSec) as 'Total Incoming Throughput',
       sum(bytesOutPerSec) as 'Total Outgoing Throughput'
FROM (
  SELECT average(provider.bytesInPerSec.Average) as 'bytesInPerSec',
         average(provider.bytesOutPerSec.Average) as 'bytesOutPerSec'
  FROM AwsMskBrokerSample
  FACET provider.clusterName as cluster, provider.brokerId
  LIMIT MAX
)
SINCE 1 hour ago
```

### 5.3 Verify Topic Health Metrics
```sql
-- Test topic health with proper null handling
SELECT displayName,
  latest(`provider.bytesInPerSec.Sum`) OR 0 AS 'Bytes In',
  latest(`provider.bytesOutPerSec.Sum`) OR 0 AS 'Bytes Out',
  CASE 
    WHEN latest(`provider.bytesInPerSec.Sum`) IS NULL THEN 'No Data'
    WHEN latest(`provider.bytesInPerSec.Sum`) = 0 THEN 'Idle'
    ELSE 'Active'
  END as 'Status'
FROM AwsMskTopicSample
SINCE 1 hour ago
LIMIT 10
```

### 5.4 Verify Entity Relationships
```sql
-- Check that brokers are properly associated with clusters
SELECT provider.clusterName, 
       uniqueCount(provider.brokerId) as 'Broker Count'
FROM AwsMskBrokerSample 
FACET provider.clusterName
SINCE 1 hour ago
```

### 5.5 Verify Metric Streams and Polling Data Alignment
```sql
-- Compare cluster counts between polling and metric streams
SELECT 
  filter(uniqueCount(provider.clusterName), WHERE eventType() = 'AwsMskClusterSample') as 'Clusters (Polling)',
  filter(uniqueCount(aws.kafka.ClusterName OR aws.msk.clusterName), WHERE eventType() = 'Metric' AND metricName LIKE 'aws.kafka%') as 'Clusters (Metric Streams)'
FROM AwsMskClusterSample, Metric
WHERE eventType() IN ('AwsMskClusterSample', 'Metric')
SINCE 1 hour ago
```

## 6. Performance and Scale Verification

### 6.1 Check Data Volume
```sql
-- Verify the system can handle the data volume
SELECT 
  filter(count(*), WHERE eventType() = 'AwsMskClusterSample') as 'Cluster Events',
  filter(count(*), WHERE eventType() = 'AwsMskBrokerSample') as 'Broker Events',
  filter(count(*), WHERE eventType() = 'AwsMskTopicSample') as 'Topic Events',
  filter(count(*), WHERE eventType() = 'Metric' AND metricName LIKE 'aws.kafka%') as 'AWS Metric Events'
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample, Metric
SINCE 1 hour ago
```

### 6.2 Check Query Performance
```sql
-- Test a complex aggregation query performance
SELECT count(*) as 'Event Count',
       beginTimeSeconds,
       endTimeSeconds,
       (endTimeSeconds - beginTimeSeconds) * 1000 as 'Query Duration (ms)'
FROM (
  SELECT latest(`provider.bytesInPerSec.Sum`) AS 'Bytes In', 
         latest(`provider.bytesOutPerSec.Sum`) AS 'Bytes Out'
  FROM AwsMskTopicSample
  FACET `displayName` AS 'topic'
  LIMIT MAX
)
```

## 7. Edge Case Verification

### 7.1 Check for Topics with No Activity
```sql
-- Find topics with zero throughput
SELECT displayName, 
       latest(`provider.bytesInPerSec.Sum`) as 'Bytes In',
       latest(`provider.bytesOutPerSec.Sum`) as 'Bytes Out'
FROM AwsMskTopicSample
WHERE latest(`provider.bytesInPerSec.Sum`) = 0 
  AND latest(`provider.bytesOutPerSec.Sum`) = 0
SINCE 1 hour ago
```

### 7.2 Check for Clusters with Partial Data
```sql
-- Find clusters that have cluster data but no broker data
SELECT c.clusterName 
FROM (
  SELECT uniqueCount(provider.clusterName) as clusterName 
  FROM AwsMskClusterSample 
  FACET provider.clusterName
) as c
WHERE c.clusterName NOT IN (
  SELECT provider.clusterName 
  FROM AwsMskBrokerSample 
  FACET provider.clusterName
)
SINCE 1 hour ago
```

### 7.3 Verify Handling of Special Characters in Names
```sql
-- Check for topics/clusters with special characters
SELECT displayName 
FROM AwsMskTopicSample 
WHERE displayName RLIKE '[^a-zA-Z0-9_.-]'
SINCE 1 hour ago
LIMIT 10
```

## 8. Common Pattern Verification Queries

### 8.1 Verify Common Throughput Pattern
```sql
-- Verify bytesInPerSec/bytesOutPerSec pattern exists across both data sources
SELECT 
  'AWS MSK Polling' as 'Source',
  count(provider.bytesInPerSec.Average) as 'Has Bytes In',
  count(provider.bytesOutPerSec.Average) as 'Has Bytes Out'
FROM AwsMskBrokerSample
SINCE 1 hour ago
```

```sql
SELECT 
  'AWS Metric Streams' as 'Source',
  count(aws.kafka.BytesInPerSec.byBroker) as 'Has Bytes In',
  count(aws.kafka.BytesOutPerSec.byBroker) as 'Has Bytes Out'
FROM Metric
WHERE metricName IN ('aws.kafka.BytesInPerSec.byBroker', 'aws.kafka.BytesOutPerSec.byBroker')
SINCE 1 hour ago
```

### 8.2 Verify Common Message Rate Pattern
```sql
-- Verify messagesInPerSec/messagesOutPerSec pattern
SELECT 
  count(provider.messagesInPerSec.Average) as 'Has Messages In (Polling)',
  count(aws.kafka.MessagesInPerSec.byBroker) as 'Has Messages In (Metric Streams)'
FROM AwsMskBrokerSample, Metric
WHERE eventType() = 'AwsMskBrokerSample' 
   OR (eventType() = 'Metric' AND metricName = 'aws.kafka.MessagesInPerSec.byBroker')
SINCE 1 hour ago
```

### 8.3 Verify Common Entity Hierarchy
```sql
-- Verify Cluster → Broker → Topic hierarchy
SELECT 
  uniqueCount(CASE WHEN eventType() = 'AwsMskClusterSample' THEN provider.clusterName END) as 'Clusters',
  uniqueCount(CASE WHEN eventType() = 'AwsMskBrokerSample' THEN provider.brokerId END) as 'Brokers',
  uniqueCount(CASE WHEN eventType() = 'AwsMskTopicSample' THEN displayName END) as 'Topics'
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
SINCE 1 hour ago
```

### 8.4 Verify Common Aggregation Pattern
```sql
-- Verify sum across brokers for cluster total pattern
SELECT provider.clusterName,
  count(provider.brokerId) as 'Broker Count',
  sum(provider.bytesInPerSec.Average) as 'Total Cluster Bytes In (Sum Pattern)',
  average(provider.bytesInPerSec.Average) as 'Avg Broker Bytes In (Average Pattern)'
FROM AwsMskBrokerSample
FACET provider.clusterName
SINCE 1 hour ago
```

## 9. Home Page Feature Verification Queries

### 9.1 Verify Account-Level Aggregation
```sql
-- Verify account aggregation for home page table
SELECT 
  nr.linkedAccountName as 'Account Name',
  nr.linkedAccountId as 'Account ID',
  uniqueCount(entity.guid) as 'Cluster Count',
  filter(uniqueCount(entity.guid), WHERE provider.offlinePartitionsCount.Sum > 0) as 'Unhealthy Clusters',
  sum(bytesIn) as 'Total Incoming Throughput',
  sum(bytesOut) as 'Total Outgoing Throughput'
FROM (
  SELECT 
    entity.guid,
    nr.linkedAccountName,
    nr.linkedAccountId,
    latest(provider.offlinePartitionsCount.Sum) as offlinePartitions,
    sum(provider.bytesInPerSec.Average) as bytesIn,
    sum(provider.bytesOutPerSec.Average) as bytesOut
  FROM AwsMskBrokerSample
  FACET entity.guid, nr.linkedAccountName, nr.linkedAccountId
) 
FACET nr.linkedAccountName, nr.linkedAccountId
SINCE 1 hour ago
```

### 9.2 Verify Provider Type Detection
```sql
-- Check provider type identification
SELECT 
  CASE 
    WHEN eventType() = 'AwsMskClusterSample' THEN 'AWS MSK'
    WHEN eventType() = 'Metric' AND metricName LIKE 'aws.kafka%' THEN 'AWS MSK (Metric Streams)'
    ELSE 'Unknown'
  END as 'Provider Type',
  count(*) as 'Event Count'
FROM AwsMskClusterSample, Metric
WHERE eventType() = 'AwsMskClusterSample' 
   OR (eventType() = 'Metric' AND metricName LIKE 'aws.kafka%')
FACET cases()
SINCE 1 hour ago
```

### 9.3 Verify Home Page Billboard Metrics
```sql
-- Verify total cluster count across all accounts
SELECT 
  uniqueCount(entity.guid) as 'Total Clusters',
  filter(uniqueCount(entity.guid), WHERE provider.offlinePartitionsCount.Sum > 0 OR provider.underReplicatedPartitions.Sum > 0) as 'Total Unhealthy Clusters'
FROM AwsMskClusterSample
SINCE 1 hour ago
```

### 9.4 Verify Searchable Fields Exist
```sql
-- Verify all searchable fields have data
SELECT 
  count(nr.linkedAccountName) as 'Has Account Name',
  count(provider.clusterName) as 'Has Cluster Name',
  count(entity.guid) as 'Has Entity GUID'
FROM AwsMskClusterSample
SINCE 1 hour ago
```

## 10. Summary Page Feature Verification Queries

### 10.1 Verify Summary Billboard Data
```sql
-- Verify all billboard metrics for summary page
SELECT 
  uniqueCount(CASE WHEN eventType() = 'AwsMskClusterSample' THEN entity.guid END) as 'Total Clusters',
  filter(uniqueCount(CASE WHEN eventType() = 'AwsMskClusterSample' THEN entity.guid END), 
    WHERE provider.offlinePartitionsCount.Sum > 0) as 'Unhealthy Clusters',
  uniqueCount(CASE WHEN eventType() = 'AwsMskTopicSample' THEN displayName END) as 'Total Topics',
  sum(CASE WHEN eventType() = 'AwsMskClusterSample' THEN provider.globalPartitionCount.Average END) as 'Total Partitions',
  uniqueCount(CASE WHEN eventType() = 'AwsMskBrokerSample' THEN provider.brokerId END) as 'Total Brokers'
FROM AwsMskClusterSample, AwsMskTopicSample, AwsMskBrokerSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
SINCE 1 hour ago
```

### 10.2 Verify Time Series Data for Charts
```sql
-- Verify time series data availability for line charts
SELECT 
  sum(provider.bytesInPerSec.Average) as 'Incoming Throughput'
FROM AwsMskBrokerSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
FACET provider.clusterName
TIMESERIES 5 minutes
SINCE 1 hour ago
```

### 10.3 Verify Topic Count by Cluster
```sql
-- Verify data for Topics by Cluster bar chart
SELECT uniqueCount(displayName) as 'Topic Count'
FROM AwsMskTopicSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
FACET provider.clusterName
SINCE 1 hour ago
```

### 10.4 Verify Partition Count by Cluster
```sql
-- Verify data for Partitions by Cluster bar chart
SELECT latest(provider.globalPartitionCount.Average) as 'Partition Count'
FROM AwsMskClusterSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
FACET provider.clusterName
SINCE 1 hour ago
```

### 10.5 Verify Top 20 Topics Data
```sql
-- Verify data for Top 20 topics by throughput
SELECT average(provider.bytesInPerSec.Sum) as 'Avg Throughput'
FROM AwsMskTopicSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
FACET displayName
TIMESERIES 5 minutes
SINCE 1 hour ago
LIMIT 20
```

### 10.6 Verify Message Rate Data
```sql
-- Verify message rate data exists
SELECT 
  sum(provider.messagesInPerSec.Average) as 'Total Messages Produced'
FROM AwsMskBrokerSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
TIMESERIES 5 minutes
SINCE 1 hour ago
```

## 11. Kafka Navigator (Honeycomb View) Verification

### 11.1 Verify Entity Health Status
```sql
-- Verify health status calculation for clusters
SELECT 
  provider.clusterName,
  latest(provider.activeControllerCount.Sum) as 'Active Controllers',
  latest(provider.offlinePartitionsCount.Sum) as 'Offline Partitions',
  CASE 
    WHEN latest(provider.activeControllerCount.Sum) != 1 THEN 'CRITICAL'
    WHEN latest(provider.offlinePartitionsCount.Sum) > 0 THEN 'CRITICAL'
    ELSE 'OK'
  END as 'Health Status'
FROM AwsMskClusterSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
FACET provider.clusterName
SINCE 1 hour ago
```

### 11.2 Verify Broker Health Metrics
```sql
-- Verify broker-level health metrics
SELECT 
  provider.brokerId,
  latest(provider.underReplicatedPartitions.Sum) as 'Under Replicated',
  latest(provider.underMinIsrPartitionCount.Sum) as 'Under Min ISR',
  CASE 
    WHEN latest(provider.underReplicatedPartitions.Sum) > 0 THEN 'WARNING'
    WHEN latest(provider.underMinIsrPartitionCount.Sum) > 0 THEN 'WARNING'
    ELSE 'OK'
  END as 'Health Status'
FROM AwsMskBrokerSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
FACET provider.clusterName, provider.brokerId
SINCE 1 hour ago
```

## 12. Entity Relationships and APM Connection Verification

### 12.1 Verify Topic Entity Relationships
```sql
-- Check for APM entity relationships on topics
SELECT 
  displayName as 'Topic',
  relationships.source.entity.guid as 'Source Entity GUID',
  relationships.target.entity.guid as 'Target Entity GUID',
  relationships.type as 'Relationship Type'
FROM AwsMskTopicSample, Relationship
WHERE entity.guid = relationships.source.entity.guid 
   OR entity.guid = relationships.target.entity.guid
SINCE 1 hour ago
LIMIT 100
```

### 12.2 Verify Producer/Consumer Connections
```sql
-- Check for producer/consumer application connections
SELECT 
  t.displayName as 'Topic',
  count(CASE WHEN r.type = 'PRODUCES' THEN 1 END) as 'Producer Count',
  count(CASE WHEN r.type = 'CONSUMES' THEN 1 END) as 'Consumer Count'
FROM AwsMskTopicSample t, Relationship r
WHERE t.entity.guid = r.target.entity.guid
   AND r.type IN ('PRODUCES', 'CONSUMES')
FACET t.displayName
SINCE 1 day ago
```

## 13. Filter Feature Verification

### 13.1 Verify Dynamic Filter Options
```sql
-- Verify cluster filter options are available
SELECT uniques(provider.clusterName) as 'Available Clusters'
FROM AwsMskClusterSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
SINCE 1 hour ago
```

```sql
-- Verify topic filter options are available
SELECT uniques(displayName) as 'Available Topics'
FROM AwsMskTopicSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
SINCE 1 hour ago
LIMIT 1000
```

### 13.2 Verify Status Filter Logic
```sql
-- Verify healthy vs unhealthy cluster filtering
SELECT 
  provider.clusterName,
  CASE 
    WHEN latest(provider.offlinePartitionsCount.Sum) > 0 THEN 'Unhealthy'
    WHEN latest(provider.underReplicatedPartitions.Sum) > 0 THEN 'Unhealthy'
    ELSE 'Healthy'
  END as 'Status'
FROM AwsMskClusterSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
FACET provider.clusterName
SINCE 1 hour ago
```

## 14. Edge Cases and Error State Verification

### 14.1 Verify Empty Account Handling
```sql
-- Check for accounts with no clusters
SELECT 
  nr.linkedAccountName,
  count(*) as 'Cluster Count'
FROM AwsMskClusterSample
FACET nr.linkedAccountName
HAVING count(*) = 0
SINCE 1 day ago
```

### 14.2 Verify Stale Data Detection
```sql
-- Find clusters with stale data (>10 minutes old)
SELECT 
  provider.clusterName,
  latest(timestamp) as 'Last Update',
  (now() - latest(timestamp))/60 as 'Minutes Since Update'
FROM AwsMskClusterSample
HAVING (now() - latest(timestamp))/60 > 10
SINCE 1 hour ago
```

### 14.3 Verify Partial Data Scenarios
```sql
-- Find topics without throughput data
SELECT 
  displayName,
  count(provider.bytesInPerSec.Sum) as 'Has Bytes In Data',
  count(provider.bytesOutPerSec.Sum) as 'Has Bytes Out Data'
FROM AwsMskTopicSample
WHERE provider.bytesInPerSec.Sum IS NULL 
   OR provider.bytesOutPerSec.Sum IS NULL
SINCE 1 hour ago
```

### 14.4 Verify Large Dataset Handling
```sql
-- Check topic count for pagination requirements
SELECT 
  provider.clusterName,
  uniqueCount(displayName) as 'Topic Count'
FROM AwsMskTopicSample
FACET provider.clusterName
HAVING uniqueCount(displayName) > 100
SINCE 1 hour ago
```

## 15. Metric Calculation Verification

### 15.1 Verify Throughput Formatting Values
```sql
-- Get raw throughput values for formatting verification
SELECT 
  provider.clusterName,
  min(provider.bytesInPerSec.Average) as 'Min Throughput',
  max(provider.bytesInPerSec.Average) as 'Max Throughput',
  average(provider.bytesInPerSec.Average) as 'Avg Throughput'
FROM AwsMskBrokerSample
FACET provider.clusterName
SINCE 1 hour ago
```

### 15.2 Verify Percentage Calculations
```sql
-- Verify percentage calculation for unhealthy clusters
SELECT 
  uniqueCount(entity.guid) as 'Total',
  filter(uniqueCount(entity.guid), WHERE provider.offlinePartitionsCount.Sum > 0) as 'Unhealthy',
  100.0 * filter(uniqueCount(entity.guid), WHERE provider.offlinePartitionsCount.Sum > 0) / uniqueCount(entity.guid) as 'Unhealthy Percentage'
FROM AwsMskClusterSample
SINCE 1 hour ago
```

## 16. Performance and Timeout Verification

### 16.1 Verify Query Complexity Limits
```sql
-- Test complex multi-facet query performance
SELECT 
  count(*) as 'Events'
FROM AwsMskTopicSample
FACET provider.clusterName, displayName, provider.topic, entity.guid
SINCE 1 hour ago
LIMIT MAX
```

### 16.2 Verify Large Result Set Handling
```sql
-- Test large result set query
SELECT *
FROM AwsMskTopicSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
SINCE 5 minutes ago
LIMIT 2000
```

## 17. Complete Feature Coverage Checklist

### Home Page Features ✓
- [x] Account-level aggregation (Section 9.1)
- [x] Provider type detection (Section 9.2)
- [x] Billboard metrics (Section 9.3)
- [x] Searchable fields (Section 9.4)
- [x] Cluster count per account (Section 9.1)
- [x] Health status aggregation (Section 9.1)
- [x] Throughput metrics (Section 9.1)

### Summary Page Features ✓
- [x] Summary billboards (Section 10.1)
- [x] Time series charts (Section 10.2)
- [x] Topic count by cluster (Section 10.3)
- [x] Partition count by cluster (Section 10.4)
- [x] Top 20 topics (Section 10.5)
- [x] Message rate data (Section 10.6)

### Kafka Navigator Features ✓
- [x] Entity health status (Section 11.1)
- [x] Broker health metrics (Section 11.2)
- [x] Cluster health evaluation (Section 11.1)

### Entity Relationships ✓
- [x] Topic relationships (Section 12.1)
- [x] Producer/Consumer connections (Section 12.2)

### Filter Features ✓
- [x] Dynamic filter options (Section 13.1)
- [x] Status filter logic (Section 13.2)

### Edge Cases & Error States ✓
- [x] Empty account handling (Section 14.1)
- [x] Stale data detection (Section 14.2)
- [x] Partial data scenarios (Section 14.3)
- [x] Large dataset handling (Section 14.4)

### Metric Calculations ✓
- [x] Throughput formatting (Section 15.1)
- [x] Percentage calculations (Section 15.2)

### Performance Verification ✓
- [x] Query complexity (Section 16.1)
- [x] Large result sets (Section 16.2)

## Usage Instructions

1. **Replace Placeholders**: Replace 'YOUR_ACCOUNT_ID' with actual account IDs in queries
2. **Run Systematically**: Execute queries in order, starting with basic data verification (Sections 1-3)
3. **Document Results**: Record any queries that return 0 or NULL results
4. **Verify Time Ranges**: Ensure data exists for the specified time ranges
5. **Check All Data Sources**: Run both Polling (Section 1) and Metric Streams (Section 2) queries

## Critical Success Criteria

### Data Availability
- ✓ All event types (AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample) must exist
- ✓ Both Polling and Metric Streams data sources should be active
- ✓ Data freshness should be < 5 minutes for real-time monitoring

### Metric Completeness
- ✓ Throughput metrics (bytesInPerSec, bytesOutPerSec) must be present
- ✓ Message rate metrics (messagesInPerSec) must be available
- ✓ Health metrics (activeControllerCount, offlinePartitionsCount) must be populated
- ✓ Entity attributes (clusterName, brokerId, topic) must be complete

### Feature Functionality
- ✓ Account aggregation must work for home page display
- ✓ Time series data must be available for charts
- ✓ Entity relationships must be queryable for APM integration
- ✓ Filter options must return valid values
- ✓ Health calculations must correctly identify unhealthy clusters

### Performance Requirements
- ✓ Complex queries must complete within timeout limits
- ✓ Large datasets must be paginated appropriately
- ✓ Aggregations must handle null values gracefully

## Troubleshooting Guide

### If Queries Return No Data:
1. Verify AWS MSK integration is configured
2. Check if Metric Streams is enabled for the account
3. Ensure proper permissions for data collection
4. Verify time range contains recent data

### If Metrics Are Missing:
1. Check CloudWatch metric collection settings
2. Verify MSK Enhanced Monitoring is enabled
3. Ensure topic-level metrics are enabled
4. Check for metric filtering in collection

### If Relationships Are Empty:
1. Verify APM agents are configured on Kafka clients
2. Check distributed tracing is enabled
3. Ensure entity synthesis is working correctly
4. Verify relationship indexing is current

## Final Verification

Run this comprehensive check to ensure all features will work:

```sql
-- Final comprehensive verification
SELECT 
  filter(count(*), WHERE eventType() = 'AwsMskClusterSample') as 'Has Cluster Data',
  filter(count(*), WHERE eventType() = 'AwsMskBrokerSample') as 'Has Broker Data',
  filter(count(*), WHERE eventType() = 'AwsMskTopicSample') as 'Has Topic Data',
  filter(count(*), WHERE eventType() = 'Metric' AND metricName LIKE 'aws.kafka%') as 'Has Metric Streams',
  min(timestamp) as 'Oldest Data',
  max(timestamp) as 'Newest Data',
  (now() - max(timestamp))/60 as 'Minutes Since Last Update'
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample, Metric
WHERE timestamp > now() - 3600
```

If all counts are > 0 and 'Minutes Since Last Update' < 10, the feature is ready for use.

## 18. Critical Gaps and Limitations Discovered Through Research

### 18.1 UI Visibility Requirements (CRITICAL GAP)

The guide completely misses the critical AWS fields required for entities to appear in the New Relic UI:

```sql
-- MISSING: Verify critical UI visibility fields
SELECT 
  count(provider) as 'Has Provider Field',
  count(awsAccountId) as 'Has AWS Account ID Field',
  count(awsRegion) as 'Has AWS Region Field',
  count(`instrumentation.provider`) as 'Has Instrumentation Provider',
  count(providerAccountId) as 'Has Provider Account ID',
  count(providerAccountName) as 'Has Provider Account Name',
  count(`collector.name`) as 'Has Collector Name',
  count(`collector.version`) as 'Has Collector Version'
FROM AwsMskClusterSample
SINCE 1 hour ago
```

**Required fields for UI visibility:**
- `provider`: Must be "AwsMskCluster", "AwsMskBroker", or "AwsMskTopic"
- `awsAccountId`: AWS account identifier
- `awsRegion`: AWS region (e.g., "us-east-1")
- `instrumentation.provider`: Must be "aws"
- `providerAccountId`: Same as awsAccountId
- `providerAccountName`: Human-readable account name
- `collector.name`: Integration identifier
- `collector.version`: Integration version

### 18.2 Dimensional Metrics Transformation Verification

The guide lacks verification for dimensional metrics transformation:

```sql
-- Verify dimensional metrics are being created
FROM Metric 
SELECT count(*), uniques(metricName) 
WHERE metricName LIKE 'kafka.%' 
  AND entity.type IN ('AWS_KAFKA_CLUSTER', 'AWS_KAFKA_BROKER', 'AWS_KAFKA_TOPIC')
SINCE 5 minutes ago

-- Verify specific dimensional metrics
FROM Metric
SELECT 
  filter(count(*), WHERE metricName = 'kafka.broker.BytesInPerSec') as 'Broker Bytes In',
  filter(count(*), WHERE metricName = 'kafka.broker.BytesOutPerSec') as 'Broker Bytes Out',
  filter(count(*), WHERE metricName = 'kafka.broker.MessagesInPerSec') as 'Messages In',
  filter(count(*), WHERE metricName = 'kafka.broker.TotalFetchRequestsPerSec') as 'Fetch Requests',
  filter(count(*), WHERE metricName = 'kafka.broker.TotalProduceRequestsPerSec') as 'Produce Requests'
WHERE entity.type = 'AWS_KAFKA_BROKER'
SINCE 5 minutes ago
```

### 18.3 Entity Type Validation

Missing verification that entity types are correctly set:

```sql
-- Verify entity types are AWS_KAFKA_* not just KAFKA_*
FROM Metric
SELECT uniques(entity.type), count(*)
WHERE entity.type LIKE '%KAFKA%'
FACET entity.type
SINCE 1 hour ago

-- This should show AWS_KAFKA_BROKER, AWS_KAFKA_CLUSTER, AWS_KAFKA_TOPIC
-- NOT just KAFKA_BROKER, KAFKA_CLUSTER, KAFKA_TOPIC
```

### 18.4 Provider Field Transformation Verification

No verification that provider.* fields are properly handled:

```sql
-- Verify provider.* fields in AwsMsk samples are being used
SELECT 
  keyset() 
FROM AwsMskBrokerSample 
WHERE provider.bytesInPerSec.Average IS NOT NULL
SINCE 1 hour ago 
LIMIT 1

-- List all provider.* metrics
SELECT 
  uniques(capture(keyset(), r'provider\..*')) as 'Provider Metrics'
FROM AwsMskBrokerSample
SINCE 1 hour ago
```

### 18.5 Automatic NRQL Query Mapping Verification

Missing verification that NRQL queries automatically map to dimensional metrics:

```sql
-- Test 1: Query event samples (may return 0)
SELECT count(*) FROM AwsMskBrokerSample SINCE 5 minutes ago

-- Test 2: Query with metric aggregation (should return data from dimensional metrics)
SELECT average(provider.bytesInPerSec.Average) 
FROM AwsMskBrokerSample 
FACET provider.clusterName 
SINCE 5 minutes ago

-- If Test 1 returns 0 but Test 2 returns data, automatic mapping is working
```

### 18.6 Cross-Account Comparison Methodology

No framework for comparing implementations across accounts:

```sql
-- Compare dimensional metrics across accounts
WITH 
  account1 AS (FROM Metric SELECT count(*) WHERE entity.type LIKE 'AWS_KAFKA_%' AND nr.accountId = 1),
  account3001033 AS (FROM Metric SELECT count(*) WHERE entity.type LIKE 'AWS_KAFKA_%' AND nr.accountId = 3001033),
  account3026020 AS (FROM Metric SELECT count(*) WHERE entity.type LIKE 'AWS_KAFKA_%' AND nr.accountId = 3026020)
SELECT 
  account1.count as 'Account 1 Metrics',
  account3001033.count as 'Account 3001033 Metrics',
  account3026020.count as 'Account 3026020 Metrics'
FROM account1, account3001033, account3026020
SINCE 1 hour ago
```

### 18.7 Environment Variable and Configuration Validation

Missing comprehensive environment variable checks:

```sql
-- Verify MSK configuration attributes
SELECT 
  uniques(MSK_USE_DIMENSIONAL) as 'MSK Use Dimensional',
  uniques(NRI_KAFKA_USE_DIMENSIONAL) as 'NRI Kafka Use Dimensional',
  uniques(NRIA_LICENSE_KEY) as 'License Key Present',
  uniques(AWS_ACCOUNT_ID) as 'AWS Account ID',
  uniques(AWS_REGION) as 'AWS Region'
FROM SystemSample
WHERE hostname LIKE '%kafka%'
SINCE 1 hour ago
```

### 18.8 Entity Name Format Validation

No verification of proper entity name formatting:

```sql
-- Verify entity name format matches expected pattern
SELECT 
  entityName,
  CASE 
    WHEN entityName RLIKE '^[^:]+:broker-[0-9]+$' THEN 'Valid Broker Name'
    WHEN entityName RLIKE '^[^:]+:topic-.+$' THEN 'Valid Topic Name'
    WHEN entityName RLIKE '^[^:]+$' AND eventType() = 'AwsMskClusterSample' THEN 'Valid Cluster Name'
    ELSE 'Invalid Format'
  END as 'Name Validation'
FROM AwsMskBrokerSample, AwsMskTopicSample, AwsMskClusterSample
WHERE entityName IS NOT NULL
SINCE 1 hour ago
LIMIT 100
```

### 18.9 Timestamp Format Validation

Missing verification of proper timestamp formatting:

```sql
-- Verify timestamps are in milliseconds (13 digits)
FROM Metric
SELECT 
  timestamp,
  length(toString(timestamp)) as 'Timestamp Length',
  CASE 
    WHEN length(toString(timestamp)) = 13 THEN 'Valid (Milliseconds)'
    WHEN length(toString(timestamp)) = 10 THEN 'Invalid (Seconds)'
    ELSE 'Invalid (Unknown)'
  END as 'Timestamp Format'
WHERE metricName LIKE 'kafka.%'
SINCE 5 minutes ago
LIMIT 10
```

### 18.10 Binary Deployment Verification

No checks for proper binary deployment:

```sql
-- Verify nri-kafka binary version and architecture
SELECT 
  uniques(`collector.version`) as 'Collector Versions',
  uniques(`collector.name`) as 'Collector Names',
  uniques(architecture) as 'Architectures'
FROM SystemSample
WHERE processDisplayName LIKE '%nri-kafka%'
SINCE 1 hour ago
```

### 18.11 Metric API vs Event API Distinction

Guide doesn't distinguish between these critical data paths:

```sql
-- Compare Event API vs Metric API data
SELECT 
  filter(count(*), WHERE eventType() LIKE 'AwsMsk%Sample') as 'Event API Records',
  filter(count(*), WHERE eventType() = 'Metric' AND metricName LIKE 'kafka.%') as 'Metric API Records'
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample, Metric
SINCE 1 hour ago
```

### 18.12 Consumer Group Metrics Validation

Missing comprehensive consumer group verification:

```sql
-- Verify consumer group dimensional metrics
FROM Metric
SELECT 
  count(*) as 'Total Metrics',
  uniques(metricName) as 'Consumer Metrics'
WHERE metricName LIKE 'kafka.consumerGroup.%'
  OR metricName LIKE 'kafka.consumer.%'
SINCE 1 hour ago

-- Verify consumer group attributes
FROM Metric
SELECT 
  uniques(`consumer.group.id`) as 'Consumer Groups',
  uniques(topic) as 'Topics',
  uniques(`cluster.name`) as 'Clusters'
WHERE entity.type = 'AWS_KAFKA_CONSUMER_GROUP'
SINCE 1 hour ago
```

### 18.13 Batch Processing and Flush Verification

No verification of metric batching:

```sql
-- Check metric batch patterns
FROM Metric
SELECT 
  count(*) as 'Metrics in Batch',
  uniqueCount(timestamp) as 'Unique Timestamps',
  min(timestamp) as 'Batch Start',
  max(timestamp) as 'Batch End',
  max(timestamp) - min(timestamp) as 'Batch Duration (ms)'
WHERE metricName LIKE 'kafka.%'
FACET `cluster.name`, capture(toString(timestamp), r'^(\d{10})')
SINCE 5 minutes ago
```

### 18.14 Error Detection and Troubleshooting

Missing comprehensive error detection:

```sql
-- Detect transformation errors
SELECT 
  count(*) as 'Error Count',
  latest(error.message) as 'Latest Error',
  latest(error.class) as 'Error Type'
FROM NrIntegrationError
WHERE category = 'kafka' 
  OR message LIKE '%kafka%' 
  OR message LIKE '%msk%'
  OR message LIKE '%dimensional%'
SINCE 1 hour ago

-- Check for metric validation failures
FROM Log
SELECT count(*), message
WHERE message LIKE '%Invalid%metric%' 
  OR message LIKE '%Failed to transform%'
  OR message LIKE '%MSK shim%error%'
FACET message
SINCE 1 hour ago
```

### 18.15 GUID Consistency Verification

No verification of consistent entity GUIDs:

```sql
-- Verify GUID consistency across samples
SELECT 
  provider.clusterName,
  provider.brokerId,
  uniqueCount(entity.guid) as 'Unique GUIDs',
  latest(entity.guid) as 'Latest GUID'
FROM AwsMskBrokerSample
FACET provider.clusterName, provider.brokerId
HAVING uniqueCount(entity.guid) > 1
SINCE 1 hour ago
```

### 18.16 Integration Health Score Calculation

Missing detailed health score breakdown:

```sql
-- Calculate detailed health scores
WITH
  availability AS (
    SELECT 
      filter(count(*), WHERE eventType() = 'AwsMskClusterSample') > 0 as hasCluster,
      filter(count(*), WHERE eventType() = 'AwsMskBrokerSample') > 0 as hasBroker,
      filter(count(*), WHERE eventType() = 'AwsMskTopicSample') > 0 as hasTopic
    FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
    SINCE 1 hour ago
  ),
  completeness AS (
    SELECT 
      percentage(count(provider.bytesInPerSec.Average), count(*)) as brokerMetrics,
      percentage(count(provider.messagesInPerSec.Average), count(*)) as messageMetrics
    FROM AwsMskBrokerSample
    SINCE 1 hour ago
  ),
  freshness AS (
    SELECT 
      max(now() - timestamp) / 1000 / 60 as minutesSinceUpdate
    FROM AwsMskClusterSample
    SINCE 1 hour ago
  )
SELECT 
  (availability.hasCluster + availability.hasBroker + availability.hasTopic) / 3 * 100 as 'Availability Score',
  (completeness.brokerMetrics + completeness.messageMetrics) / 2 as 'Completeness Score',
  CASE 
    WHEN freshness.minutesSinceUpdate < 5 THEN 100
    WHEN freshness.minutesSinceUpdate < 10 THEN 80
    ELSE 0
  END as 'Freshness Score'
FROM availability, completeness, freshness
```

### 18.17 Standard Kafka vs MSK Format Validation

No validation of format differences:

```sql
-- Compare standard Kafka vs MSK formatted data
SELECT 
  'Standard Kafka' as 'Format',
  count(broker.messagesInPerSecond) as 'Standard Metric Count'
FROM KafkaBrokerSample
SINCE 1 hour ago
UNION
SELECT 
  'AWS MSK' as 'Format',
  count(provider.messagesInPerSec.Average) as 'MSK Metric Count'
FROM AwsMskBrokerSample
SINCE 1 hour ago
```

### 18.18 Multi-Cluster Isolation Verification

Missing verification of cluster isolation:

```sql
-- Verify metrics are properly isolated by cluster
SELECT 
  provider.clusterName,
  uniqueCount(provider.brokerId) as 'Brokers',
  uniqueCount(displayName) as 'Topics from Broker Sample'
FROM AwsMskBrokerSample
FACET provider.clusterName
SINCE 1 hour ago

-- Cross-check with topic samples
SELECT 
  provider.clusterName,
  uniqueCount(displayName) as 'Topics from Topic Sample'
FROM AwsMskTopicSample  
FACET provider.clusterName
SINCE 1 hour ago
```

### 18.19 Metric Value Validation

No validation of metric value ranges:

```sql
-- Validate metric values are within reasonable ranges
SELECT 
  metricName,
  min(value) as 'Min Value',
  max(value) as 'Max Value',
  average(value) as 'Avg Value',
  CASE 
    WHEN min(value) < 0 THEN 'Has Negative Values'
    WHEN max(value) > 1e12 THEN 'Suspiciously Large'
    WHEN max(value) = 0 AND min(value) = 0 THEN 'All Zeros'
    ELSE 'Normal Range'
  END as 'Value Assessment'
FROM Metric
WHERE metricName LIKE 'kafka.%'
FACET metricName
SINCE 1 hour ago
```

### 18.20 Complete Implementation Verification Framework

```sql
-- Master verification query that checks all critical aspects
WITH 
  ui_fields AS (
    SELECT 
      sum(CASE WHEN provider IS NOT NULL THEN 1 ELSE 0 END) / count(*) * 100 as providerField,
      sum(CASE WHEN awsAccountId IS NOT NULL THEN 1 ELSE 0 END) / count(*) * 100 as awsAccountField,
      sum(CASE WHEN `instrumentation.provider` = 'aws' THEN 1 ELSE 0 END) / count(*) * 100 as instrumentationProvider
    FROM AwsMskClusterSample
    SINCE 1 hour ago
  ),
  dimensional AS (
    SELECT count(*) as dimensionalCount
    FROM Metric
    WHERE metricName LIKE 'kafka.%' AND entity.type LIKE 'AWS_KAFKA_%'
    SINCE 1 hour ago
  ),
  events AS (
    SELECT count(*) as eventCount
    FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
    SINCE 1 hour ago
  )
SELECT 
  ui_fields.providerField as 'UI Provider Field %',
  ui_fields.awsAccountField as 'UI AWS Account Field %',
  ui_fields.instrumentationProvider as 'UI Instrumentation Provider %',
  dimensional.dimensionalCount as 'Dimensional Metrics',
  events.eventCount as 'Event Samples',
  CASE 
    WHEN ui_fields.providerField < 100 THEN 'CRITICAL: Missing UI fields - clusters won\'t appear in UI'
    WHEN dimensional.dimensionalCount = 0 THEN 'WARNING: No dimensional metrics'
    WHEN events.eventCount = 0 THEN 'WARNING: No event samples'
    ELSE 'OK: All systems operational'
  END as 'Status'
FROM ui_fields, dimensional, events
```

## Summary of Critical Gaps

1. **UI Visibility Requirements** - The most critical gap. Without proper AWS fields, entities won't appear in the UI
2. **Dimensional Metrics** - No verification of Event API to Metric API transformation
3. **Entity Type Format** - Must be AWS_KAFKA_* not KAFKA_*
4. **Provider Field Handling** - No verification of provider.* field transformation
5. **Cross-Account Comparison** - No methodology for comparing implementations
6. **Environment Variables** - Missing comprehensive configuration validation
7. **Error Detection** - No systematic error checking framework
8. **Binary Deployment** - No verification of proper binary architecture and deployment
9. **Metric Batching** - No verification of batch processing and flushing
10. **GUID Consistency** - No checks for consistent entity GUIDs
11. **Health Score Details** - Missing breakdown of health score calculation
12. **Multi-Cluster Support** - No verification of proper cluster isolation

These gaps explain why issues like "clusters not showing in UI" weren't caught by the original guide.