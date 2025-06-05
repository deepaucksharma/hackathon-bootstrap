# AWS MSK NRQL Quick Reference Guide

## 🚨 Most Critical Queries (Run These First!)

### 1. Are My Clusters Visible in the UI?
```sql
-- If this returns < 100% for any field, clusters won't appear in UI!
SELECT 
  percentage(count(provider), count(*)) as 'Has Provider %',
  percentage(count(awsAccountId), count(*)) as 'Has AWS Account %',
  percentage(count(`instrumentation.provider`), count(*)) as 'Has Instrumentation %'
FROM AwsMskClusterSample
SINCE 1 hour ago
```

### 2. Do I Have Dimensional Metrics?
```sql
-- If this returns 0, no metrics will work!
FROM Metric 
SELECT count(*) as 'Dimensional Metrics Count'
WHERE metricName LIKE 'kafka.%' 
  AND entity.type LIKE 'AWS_KAFKA_%'
SINCE 5 minutes ago
```

### 3. Is My Data Fresh?
```sql
-- If > 10 minutes, data is stale
SELECT 
  (now() - max(timestamp))/1000/60 as 'Minutes Since Update'
FROM AwsMskClusterSample
SINCE 1 hour ago
```

## 📊 Basic Health Checks

### Check All Data Types Exist
```sql
SELECT 
  filter(count(*), WHERE eventType() = 'AwsMskClusterSample') as 'Clusters',
  filter(count(*), WHERE eventType() = 'AwsMskBrokerSample') as 'Brokers',
  filter(count(*), WHERE eventType() = 'AwsMskTopicSample') as 'Topics'
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
SINCE 1 hour ago
```

### Find Unhealthy Clusters
```sql
SELECT 
  provider.clusterName,
  latest(provider.offlinePartitionsCount.Sum) as 'Offline Partitions',
  latest(provider.underReplicatedPartitions.Sum) as 'Under Replicated'
FROM AwsMskClusterSample
WHERE provider.offlinePartitionsCount.Sum > 0 
   OR provider.underReplicatedPartitions.Sum > 0
SINCE 1 hour ago
```

### Check Throughput by Cluster
```sql
SELECT 
  provider.clusterName,
  sum(provider.bytesInPerSec.Average) as 'Bytes In/sec',
  sum(provider.bytesOutPerSec.Average) as 'Bytes Out/sec'
FROM AwsMskBrokerSample
FACET provider.clusterName
SINCE 1 hour ago
```

## 🔍 Troubleshooting Queries

### Why Don't I See Any Data?
```sql
-- Check if integration is sending any data
SELECT count(*) as 'Events in Last Hour'
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
SINCE 1 hour ago
```

### Which Metrics Are Missing?
```sql
-- Check broker metric completeness
SELECT 
  percentage(count(provider.bytesInPerSec.Average), count(*)) as 'Has Bytes In %',
  percentage(count(provider.messagesInPerSec.Average), count(*)) as 'Has Messages In %',
  percentage(count(provider.underReplicatedPartitions.Sum), count(*)) as 'Has Health Metrics %'
FROM AwsMskBrokerSample 
SINCE 1 hour ago
```

### Entity Type Verification
```sql
-- Must show AWS_KAFKA_*, not just KAFKA_*
FROM Metric
SELECT uniques(entity.type) as 'Entity Types'
WHERE entity.type LIKE '%KAFKA%'
SINCE 1 hour ago
```

## 📈 Performance Monitoring

### Message Rate Across All Clusters
```sql
SELECT sum(provider.messagesInPerSec.Average) as 'Total Messages/sec'
FROM AwsMskBrokerSample
TIMESERIES 5 minutes
SINCE 1 hour ago
```

### Top 10 Topics by Throughput
```sql
SELECT average(provider.bytesInPerSec.Sum + provider.bytesOutPerSec.Sum) as 'Total Throughput'
FROM AwsMskTopicSample
FACET displayName
SINCE 1 hour ago
LIMIT 10
```

### Broker Load Distribution
```sql
SELECT 
  provider.brokerId,
  average(provider.bytesInPerSec.Average) as 'Avg Bytes In',
  average(provider.bytesOutPerSec.Average) as 'Avg Bytes Out'
FROM AwsMskBrokerSample
FACET provider.clusterName, provider.brokerId
SINCE 1 hour ago
```

## 🏠 Home Page Queries

### Account Summary
```sql
SELECT 
  nr.linkedAccountName as 'Account',
  uniqueCount(entity.guid) as 'Total Clusters',
  filter(uniqueCount(entity.guid), WHERE provider.offlinePartitionsCount.Sum > 0) as 'Unhealthy'
FROM AwsMskClusterSample
FACET nr.linkedAccountName
SINCE 1 hour ago
```

### Cluster Summary
```sql
SELECT 
  provider.clusterName,
  latest(provider.globalPartitionCount.Average) as 'Partitions',
  uniqueCount(provider.brokerId) as 'Brokers',
  sum(provider.bytesInPerSec.Average) as 'Throughput In'
FROM AwsMskBrokerSample
FACET provider.clusterName
SINCE 1 hour ago
```

## 🚑 Emergency Diagnostics

### Complete System Check
```sql
WITH 
  ui_ready AS (
    SELECT percentage(count(provider), count(*)) = 100 as ready
    FROM AwsMskClusterSample SINCE 1 hour ago
  ),
  metrics_ready AS (
    SELECT count(*) > 0 as ready
    FROM Metric WHERE metricName LIKE 'kafka.%' SINCE 5 minutes ago
  ),
  fresh_data AS (
    SELECT (now() - max(timestamp))/1000/60 < 10 as ready
    FROM AwsMskClusterSample SINCE 1 hour ago
  )
SELECT 
  CASE 
    WHEN ui_ready.ready AND metrics_ready.ready AND fresh_data.ready THEN '✅ ALL SYSTEMS GO'
    WHEN NOT ui_ready.ready THEN '❌ UI FIELDS MISSING'
    WHEN NOT metrics_ready.ready THEN '❌ NO DIMENSIONAL METRICS'
    WHEN NOT fresh_data.ready THEN '❌ STALE DATA'
    ELSE '❌ MULTIPLE ISSUES'
  END as 'System Status'
FROM ui_ready, metrics_ready, fresh_data
```

### Find Integration Errors
```sql
SELECT count(*), latest(error.message) as 'Latest Error'
FROM NrIntegrationError
WHERE category = 'kafka' 
   OR message LIKE '%kafka%' 
   OR message LIKE '%msk%'
SINCE 1 hour ago
```

## 💡 Common Issues and Solutions

| Symptom | Query to Run | Solution |
|---------|--------------|----------|
| No clusters in UI | Check UI fields query (#1) | Ensure provider, awsAccountId fields are populated |
| No metrics | Check dimensional metrics (#2) | Enable MSK_USE_DIMENSIONAL=true |
| Old data | Check data freshness (#3) | Verify integration is running, check network/JMX access |
| Missing metrics | Check metric completeness | Enable MSK Enhanced Monitoring |
| Wrong entity types | Check entity type format | Update integration to latest version |

## 🔧 Integration Configuration Check

### Verify Configuration
```sql
-- Check integration configuration
SELECT 
  latest(MSK_USE_DIMENSIONAL) as 'Dimensional Enabled',
  latest(AWS_ACCOUNT_ID) as 'AWS Account',
  latest(AWS_REGION) as 'Region',
  latest(`collector.version`) as 'Integration Version'
FROM SystemSample
WHERE processDisplayName LIKE '%kafka%'
SINCE 1 hour ago
```

## 📝 Notes

1. **Replace placeholders**: Add `WHERE nr.accountId = YOUR_ACCOUNT_ID` to queries
2. **Cluster filtering**: Add `AND provider.clusterName = 'YOUR_CLUSTER'` to filter
3. **Time ranges**: Adjust `SINCE` clause based on your needs
4. **Metric Streams**: Some queries apply only if AWS Metric Streams is enabled

## 🆘 If Nothing Works

1. Check integration logs: `kubectl logs <nri-kafka-pod> -n <namespace>`
2. Verify JMX is enabled on Kafka brokers
3. Check network connectivity from integration to brokers
4. Ensure proper IAM permissions for CloudWatch/MSK access
5. Verify integration binary architecture matches system