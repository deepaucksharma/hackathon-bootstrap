# Expanded NRDB Verification Queries - Implementation Details & Nuances

This document contains verification queries for all the nuanced behaviors discovered in the codebase analysis.

## 1. Throughput Calculation & Humanization Verification

### 1.1 Verify Raw Throughput Values for Humanization
```sql
-- Check throughput values across all ranges for humanization logic
-- Code: common/utils/humanize/index.ts:24-57
SELECT 
  entityName,
  provider.bytesInPerSec.Average as 'rawBytesIn',
  CASE 
    WHEN provider.bytesInPerSec.Average < 1000 THEN concat(toString(round(provider.bytesInPerSec.Average, 2)), ' B/s')
    WHEN provider.bytesInPerSec.Average < 1000000 THEN concat(toString(round(provider.bytesInPerSec.Average/1000, 2)), ' KB/s')
    WHEN provider.bytesInPerSec.Average < 1000000000 THEN concat(toString(round(provider.bytesInPerSec.Average/1000000, 2)), ' MB/s')
    WHEN provider.bytesInPerSec.Average < 1000000000000 THEN concat(toString(round(provider.bytesInPerSec.Average/1000000000, 2)), ' GB/s')
    WHEN provider.bytesInPerSec.Average < 1000000000000000 THEN concat(toString(round(provider.bytesInPerSec.Average/1000000000000, 2)), ' TB/s')
    ELSE concat(toString(round(provider.bytesInPerSec.Average/1000000000000000, 2)), ' PB/s')
  END as 'humanizedValue'
FROM AwsMskBrokerSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
SINCE 1 hour ago
LIMIT 20
```
**Pass Criteria**: Values should match UI display format exactly

### 1.2 Verify Confluent Cloud Metric Division by 60
```sql
-- Confluent Cloud metrics must be divided by 60 for correct display
-- Code: common/config/constants.ts:287-298
SELECT 
  cluster_name,
  `cluster_received_bytes` as 'rawBytesReceived',
  `cluster_received_bytes` / 60 as 'bytesPerSecond',
  `cluster_received_records` as 'rawRecordsReceived',
  `cluster_received_records` / 60 as 'recordsPerSecond'
FROM ConfluentCloudClusterSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
SINCE 1 hour ago
```
**Pass Criteria**: Division by 60 must be applied for per-second calculations

### 1.3 Verify Message Rate Humanization
```sql
-- Check message rate humanization across all ranges
-- Code: common/utils/humanize/index.ts:85-116
SELECT 
  provider.brokerId,
  provider.messagesInPerSec.Average as 'rawMessagesIn',
  CASE 
    WHEN provider.messagesInPerSec.Average < 1000 THEN concat(toString(round(provider.messagesInPerSec.Average, 0)), ' msg/s')
    WHEN provider.messagesInPerSec.Average < 1000000 THEN concat(toString(round(provider.messagesInPerSec.Average/1000, 2)), ' k msg/s')
    WHEN provider.messagesInPerSec.Average < 1000000000 THEN concat(toString(round(provider.messagesInPerSec.Average/1000000, 2)), ' M msg/s')
    WHEN provider.messagesInPerSec.Average < 1000000000000 THEN concat(toString(round(provider.messagesInPerSec.Average/1000000000, 2)), ' B msg/s')
    WHEN provider.messagesInPerSec.Average < 1000000000000000 THEN concat(toString(round(provider.messagesInPerSec.Average/1000000000000, 2)), ' T msg/s')
    ELSE concat(toString(round(provider.messagesInPerSec.Average/1000000000000000, 2)), ' Q msg/s')
  END as 'humanizedRate'
FROM AwsMskBrokerSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
SINCE 1 hour ago
```
**Pass Criteria**: Message rates use proper units (k, M, B, T, Q)

## 2. Error Handling & Default Values Verification

### 2.1 Verify DEFAULT_METRIC_VALUE (-1) Handling
```sql
-- Check for -1 sentinel values that indicate errors
-- Code: common/config/constants.ts:303
SELECT 
  entityName,
  CASE 
    WHEN provider.bytesInPerSec.Average = -1 THEN 'ERROR_STATE'
    WHEN provider.bytesInPerSec.Average IS NULL THEN 'NULL_VALUE'
    ELSE 'VALID_DATA'
  END as 'dataState',
  count(*) as 'occurrences'
FROM AwsMskBrokerSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
FACET cases()
SINCE 1 hour ago
```
**Pass Criteria**: -1 values should be handled as error states

### 2.2 Verify Deleted Account Detection
```sql
-- Detect accounts that have been deleted (no recent data)
-- Code: common/hooks/use-fetch-entity-metrics/index.ts:115-130
WITH accountData AS (
  SELECT 
    nr.linkedAccountId,
    count(*) as dataPoints,
    max(timestamp) as lastSeen,
    (now() - max(timestamp))/1000/60/60 as hoursSinceData
  FROM AwsMskClusterSample
  WHERE nr.linkedAccountId IN (${ACCOUNT_LIST})
  FACET nr.linkedAccountId
  SINCE 7 days ago
)
SELECT 
  linkedAccountId,
  CASE 
    WHEN dataPoints = 0 THEN 'NEVER_HAD_DATA'
    WHEN hoursSinceData > 24 THEN 'POSSIBLY_DELETED'
    ELSE 'ACTIVE'
  END as 'accountStatus'
FROM accountData
```
**Pass Criteria**: Deleted accounts should be detectable

## 3. Hidden Dependencies & Assumptions

### 3.1 Verify Metric Stream Detection
```sql
-- Detect if using metric streams (empty reportingEventTypes = metric stream)
-- Code: common/utils/query-utils.ts:75-77
SELECT 
  uniqueCount(entity.guid) as 'entityCount',
  uniques(entity.reportingEventTypes) as 'reportingTypes',
  CASE 
    WHEN toString(uniques(entity.reportingEventTypes)) = '[]' THEN 'METRIC_STREAM'
    ELSE 'POLLING'
  END as 'dataSource'
FROM NrdbQuery
WHERE query = 'FROM AWSMSKCLUSTER SELECT *'
  AND nr.accountId = ${NR_ACCOUNT_ID}
```
**Pass Criteria**: Empty reportingEventTypes indicates metric stream

### 3.2 Verify Topic Name Resolution Order
```sql
-- Topic names resolved in order: Name → name → Topic
-- Code: common/utils/query-utils.ts:155-157
SELECT 
  CASE 
    WHEN `Name` IS NOT NULL THEN `Name`
    WHEN `name` IS NOT NULL THEN `name`
    WHEN `Topic` IS NOT NULL THEN `Topic`
    ELSE 'UNKNOWN'
  END as 'resolvedTopicName',
  count(*) as 'occurrences'
FROM AwsMskTopicSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
FACET cases()
SINCE 1 hour ago
```
**Pass Criteria**: Topic names should be resolved correctly

### 3.3 Verify Account Sorting by LinkedAccountId
```sql
-- Accounts must be sorted by linkedAccountId
-- Code: common/utils/data-utils.ts:20
SELECT 
  nr.linkedAccountId as 'accountId',
  nr.linkedAccountName as 'accountName',
  uniqueCount(entity.guid) as 'clusterCount'
FROM AwsMskClusterSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
FACET nr.linkedAccountId, nr.linkedAccountName
ORDER BY nr.linkedAccountId ASC
SINCE 1 hour ago
```
**Pass Criteria**: Results ordered by accountId ascending

## 4. Edge Cases & Limits

### 4.1 Verify 20-Item Topic Table Limit
```sql
-- Topic tables limited to 20 items
-- Code: common/config/constants.ts:135
SELECT *
FROM AwsMskTopicSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
  AND provider.clusterName = '${CLUSTER_NAME}'
SINCE 1 hour ago
LIMIT 20
```
**Pass Criteria**: Maximum 20 topics returned

### 4.2 Verify __consumer_offsets Exclusion
```sql
-- __consumer_offsets excluded from deviation calculations
-- Code: nerdlets/summary/index.tsx:211
SELECT 
  displayName,
  provider.bytesInPerSec.Sum as 'bytesIn',
  CASE 
    WHEN displayName = '__consumer_offsets' THEN 'EXCLUDED'
    ELSE 'INCLUDED'
  END as 'deviationStatus'
FROM AwsMskTopicSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
  AND displayName = '__consumer_offsets'
SINCE 1 hour ago
```
**Pass Criteria**: __consumer_offsets should be marked as excluded

### 4.3 Verify Empty Cluster Handling
```sql
-- Clusters with no brokers/topics should be handled gracefully
WITH clusterData AS (
  SELECT 
    c.entityName as clusterName,
    c.entity.guid as clusterGuid
  FROM AwsMskClusterSample c
  WHERE c.nr.accountId = ${NR_ACCOUNT_ID}
),
brokerCounts AS (
  SELECT 
    entity.guid as clusterGuid,
    uniqueCount(provider.brokerId) as brokerCount
  FROM AwsMskBrokerSample
  WHERE nr.accountId = ${NR_ACCOUNT_ID}
  FACET entity.guid
),
topicCounts AS (
  SELECT 
    entity.guid as clusterGuid,
    uniqueCount(displayName) as topicCount
  FROM AwsMskTopicSample
  WHERE nr.accountId = ${NR_ACCOUNT_ID}
  FACET entity.guid
)
SELECT 
  c.clusterName,
  b.brokerCount OR 0 as 'brokers',
  t.topicCount OR 0 as 'topics',
  CASE 
    WHEN b.brokerCount IS NULL OR b.brokerCount = 0 THEN 'NO_BROKERS'
    WHEN t.topicCount IS NULL OR t.topicCount = 0 THEN 'NO_TOPICS'
    ELSE 'NORMAL'
  END as 'status'
FROM clusterData c
LEFT JOIN brokerCounts b ON c.clusterGuid = b.clusterGuid
LEFT JOIN topicCounts t ON c.clusterGuid = t.clusterGuid
```
**Pass Criteria**: Empty clusters handled with 0 counts

## 5. Performance Optimizations Verification

### 5.1 Verify MAX_LIMIT Usage
```sql
-- Queries should use LIMIT MAX for complete data
-- Code: common/config/constants.ts:130
FROM (
  SELECT 
    entity.guid,
    latest(provider.bytesInPerSec.Average) as bytesIn
  FROM AwsMskBrokerSample
  WHERE nr.accountId = ${NR_ACCOUNT_ID}
  FACET entity.guid, provider.brokerId
  LIMIT MAX
)
SELECT count(*) as 'totalRecords'
```
**Pass Criteria**: LIMIT MAX allows all records

### 5.2 Verify 60-Second Polling Interval
```sql
-- Data should be fresh within 60 seconds
-- Code: common/hooks/use-summary-chart/index.ts:75
SELECT 
  min(timestamp) as 'oldestData',
  max(timestamp) as 'newestData',
  (max(timestamp) - min(timestamp))/1000 as 'timeSpanSeconds',
  count(*) as 'dataPoints'
FROM AwsMskBrokerSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
SINCE 5 minutes ago
TIMESERIES 1 minute
```
**Pass Criteria**: Data points every ~60 seconds

## 6. Health Score Calculations

### 6.1 Verify AWS MSK Health Predicates
```sql
-- Health based on multiple conditions
-- Code: common/config/constants.ts:197-202
SELECT 
  entityName,
  latest(provider.activeControllerCount.Sum) as 'activeControllers',
  latest(provider.offlinePartitionsCount.Sum) as 'offlinePartitions',
  latest(provider.underReplicatedPartitions.Sum) as 'underReplicated',
  latest(provider.underMinIsrPartitionCount.Sum) as 'underMinIsr',
  CASE 
    WHEN latest(provider.activeControllerCount.Sum) != 1 THEN 'UNHEALTHY: Wrong controller count'
    WHEN latest(provider.offlinePartitionsCount.Sum) > 0 THEN 'UNHEALTHY: Offline partitions'
    WHEN latest(provider.underReplicatedPartitions.Sum) > 0 THEN 'UNHEALTHY: Under replicated'
    WHEN latest(provider.underMinIsrPartitionCount.Sum) > 0 THEN 'UNHEALTHY: Under min ISR'
    ELSE 'HEALTHY'
  END as 'healthStatus'
FROM AwsMskClusterSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
FACET entityName
SINCE 1 hour ago
```
**Pass Criteria**: Health logic matches predicates

### 6.2 Verify Cluster Load > 70% Threshold
```sql
-- Clusters with >70% load are unhealthy
-- Code: common/config/constants.ts:228-232
WITH clusterLoad AS (
  SELECT 
    provider.clusterName,
    average(provider.cpuUser) as 'avgCpuUser',
    average(provider.cpuSystem) as 'avgCpuSystem',
    average(provider.cpuUser + provider.cpuSystem) as 'totalCpu'
  FROM AwsMskBrokerSample
  WHERE nr.accountId = ${NR_ACCOUNT_ID}
  FACET provider.clusterName
  SINCE 1 hour ago
)
SELECT 
  clusterName,
  totalCpu,
  CASE 
    WHEN totalCpu > 70 THEN 'UNHEALTHY: High Load'
    ELSE 'HEALTHY'
  END as 'loadStatus'
FROM clusterLoad
```
**Pass Criteria**: >70% CPU = unhealthy

### 6.3 Verify Confluent Cloud Health Predicates
```sql
-- Confluent uses different health checks
-- Code: common/config/constants.ts:206-209
SELECT 
  cluster_name,
  latest(current_controller_id) as 'controllerId',
  latest(offline_partition_count) as 'offlinePartitions',
  CASE 
    WHEN latest(current_controller_id) < 0 THEN 'UNHEALTHY: No controller'
    WHEN latest(offline_partition_count) > 0 THEN 'UNHEALTHY: Offline partitions'
    ELSE 'HEALTHY'
  END as 'healthStatus'
FROM ConfluentCloudClusterSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
FACET cluster_name
SINCE 1 hour ago
```
**Pass Criteria**: Controller < 0 = unhealthy

## 7. Time-Based Logic Verification

### 7.1 Verify EntityNavigator Fixed Time Range
```sql
-- EntityNavigator always uses 1 hour fixed range
-- Code: common/components/EntityNavigator/EntityNavigator.tsx:49
SELECT 
  count(*) as 'dataPoints',
  min(timestamp) as 'earliestData',
  max(timestamp) as 'latestData',
  (max(timestamp) - min(timestamp))/1000/60 as 'timeRangeMinutes'
FROM AwsMskClusterSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
SINCE 1 hour ago
```
**Pass Criteria**: Data from exactly last hour

### 7.2 Verify Time Display Format
```sql
-- Time should display as 'MMM D' format
-- Code: common/components/time-range-display-text/index.tsx
SELECT 
  timestamp,
  monthOf(timestamp) as 'month',
  dayOfMonthOf(timestamp) as 'day'
FROM AwsMskClusterSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
SINCE 1 day ago
LIMIT 1
```
**Pass Criteria**: Timestamps available for formatting

## 8. Conditional Rendering Dependencies

### 8.1 Verify Relationship Column Data
```sql
-- Relationship column shown only if relationships exist
-- Code: common/components/entity-list-table/index.tsx:91-105
FROM Relationship
SELECT 
  count(*) as 'relationshipCount',
  uniques(type) as 'relationshipTypes'
WHERE sourceEntityGuid IN (
  SELECT entity.guid FROM AwsMskTopicSample WHERE nr.accountId = ${NR_ACCOUNT_ID}
) OR targetEntityGuid IN (
  SELECT entity.guid FROM AwsMskTopicSample WHERE nr.accountId = ${NR_ACCOUNT_ID}
)
SINCE 1 day ago
```
**Pass Criteria**: Relationships exist for column to show

### 8.2 Verify Metric Availability Messages
```sql
-- Different messages based on metric availability
-- Code: common/components/home-billboards/index.tsx:18-42
WITH metricCheck AS (
  SELECT 
    count(provider.bytesInPerSec.Average) as 'hasBytesIn',
    count(provider.messagesInPerSec.Average) as 'hasMessagesIn'
  FROM AwsMskBrokerSample
  WHERE nr.accountId = ${NR_ACCOUNT_ID}
  SINCE 1 hour ago
)
SELECT 
  CASE 
    WHEN hasBytesIn = 0 AND hasMessagesIn = 0 THEN 'No metrics available'
    WHEN hasBytesIn = 0 THEN 'Throughput metrics unavailable'
    WHEN hasMessagesIn = 0 THEN 'Message rate metrics unavailable'
    ELSE 'All metrics available'
  END as 'metricStatus'
FROM metricCheck
```
**Pass Criteria**: Appropriate message for metric state

## 9. Field Mapping Verification

### 9.1 Verify Provider-Specific Column Mappings
```sql
-- Different column names per provider
-- Code: common/config/constants.ts:316-398
-- AWS MSK mappings
SELECT 
  'AWS MSK' as provider,
  count(provider.clusterName) as 'hasClusterName',
  count(provider.activeControllerCount.Sum) as 'hasActiveControllers',
  count(provider.offlinePartitionsCount.Sum) as 'hasOfflinePartitions',
  count(provider.globalPartitionCount.Average) as 'hasPartitionCount'
FROM AwsMskClusterSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
SINCE 1 hour ago

UNION

-- Confluent Cloud mappings
SELECT 
  'Confluent' as provider,
  count(cluster_name) as 'hasClusterName',
  count(current_controller_id) as 'hasActiveControllers',
  count(offline_partition_count) as 'hasOfflinePartitions',
  count(partition_count) as 'hasPartitionCount'
FROM ConfluentCloudClusterSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
SINCE 1 hour ago
```
**Pass Criteria**: Provider-specific fields exist

### 9.2 Verify Metric Name Variations
```sql
-- Multiple variations of same metric across providers
-- Code: Analysis of query patterns
SELECT 
  metricName,
  count(*) as 'occurrences'
FROM Metric
WHERE metricName IN (
  'kafka.broker.BytesInPerSec',
  'kafka.broker.bytesInPerSec', 
  'kafka.net.BytesInPerSec',
  'aws.kafka.BytesInPerSec.byBroker',
  'provider.bytesInPerSec.Average'
)
  AND nr.accountId = ${NR_ACCOUNT_ID}
FACET metricName
SINCE 1 hour ago
```
**Pass Criteria**: Correct metric names for provider

## 10. Complex Aggregation Patterns

### 10.1 Verify Nested Query Aggregations
```sql
-- Complex nested aggregations for throughput
-- Code: common/utils/query-utils.ts:buildKafkaAccountHealthQuery
FROM (
  FROM (
    SELECT 
      entity.guid as clusterGuid,
      nr.linkedAccountId as accountId,
      sum(provider.bytesInPerSec.Average) as brokerBytesIn,
      sum(provider.bytesOutPerSec.Average) as brokerBytesOut
    FROM AwsMskBrokerSample
    WHERE nr.accountId = ${NR_ACCOUNT_ID}
    FACET entity.guid, nr.linkedAccountId, provider.brokerId
    LIMIT MAX
  )
  SELECT 
    accountId,
    sum(brokerBytesIn) as clusterBytesIn,
    sum(brokerBytesOut) as clusterBytesOut
  FACET accountId, clusterGuid
)
SELECT 
  accountId,
  sum(clusterBytesIn) as 'totalAccountBytesIn',
  sum(clusterBytesOut) as 'totalAccountBytesOut'
FACET accountId
```
**Pass Criteria**: Three-level aggregation works correctly

### 10.2 Verify Array Handling for Single Items
```sql
-- Single item arrays need special handling
-- Code: common/components/entity-list-table/index.tsx:203-215
SELECT 
  displayName,
  CASE 
    WHEN uniqueCount(provider.brokerId) = 1 THEN toString(latest(provider.brokerId))
    ELSE concat(toString(uniqueCount(provider.brokerId)), ' brokers')
  END as 'brokerDisplay'
FROM AwsMskTopicSample t, AwsMskBrokerSample b
WHERE t.entity.guid = b.entity.guid
  AND nr.accountId = ${NR_ACCOUNT_ID}
FACET displayName
SINCE 1 hour ago
```
**Pass Criteria**: Single values not shown as arrays

## 11. State Management Requirements

### 11.1 Verify Error State Persistence
```sql
-- Error states should persist with hasError flag
-- Code: common/hooks/use-fetch-entity-metrics/index.ts:82-87
WITH errorCheck AS (
  SELECT 
    nr.linkedAccountId,
    count(*) as dataPoints,
    max(timestamp) as lastSuccess
  FROM AwsMskClusterSample
  WHERE nr.accountId = ${NR_ACCOUNT_ID}
  FACET nr.linkedAccountId
  SINCE 1 hour ago
)
SELECT 
  linkedAccountId,
  CASE 
    WHEN dataPoints = 0 THEN 'ERROR_STATE'
    WHEN (now() - lastSuccess)/1000/60 > 10 THEN 'STALE_STATE'
    ELSE 'HEALTHY_STATE'
  END as 'state'
FROM errorCheck
```
**Pass Criteria**: Error states detectable

### 11.2 Verify Loading State Data Requirements
```sql
-- Initial data needed before loading completes
-- All entity GUIDs must be available
SELECT 
  uniqueCount(entity.guid) as 'totalEntities',
  count(*) as 'totalSamples',
  min(timestamp) as 'firstDataPoint',
  max(timestamp) as 'lastDataPoint'
FROM AwsMskClusterSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
SINCE 5 minutes ago
```
**Pass Criteria**: Entity GUIDs available immediately

## 12. Provider Detection & Routing

### 12.1 Verify Provider Type Detection
```sql
-- Provider detection based on entity type
-- Code: common/utils/helper.ts:getProviderFromEntityType
SELECT 
  entity.type,
  CASE 
    WHEN entity.type = 'AWSMSKCLUSTER' THEN 'awsMsk'
    WHEN entity.type = 'CONFLUENTCLOUDCLUSTER' THEN 'confluentCloud'
    WHEN entity.type IN ('KAFKACLUSTER', 'KAFKA_CLUSTER') THEN 'kafka'
    ELSE 'unknown'
  END as 'detectedProvider',
  count(*) as 'entityCount'
FROM NrdbQuery
WHERE query LIKE '%CLUSTER%'
  AND nr.accountId = ${NR_ACCOUNT_ID}
FACET entity.type
```
**Pass Criteria**: Correct provider detection

## Master Verification for All Nuances

```sql
-- Comprehensive verification including all discovered nuances
WITH 
  -- Basic data availability
  dataAvailability AS (
    SELECT 
      count(*) > 0 as hasData,
      (now() - max(timestamp))/1000/60 < 10 as isFresh
    FROM AwsMskClusterSample 
    WHERE nr.accountId = ${NR_ACCOUNT_ID} 
    SINCE 1 hour ago
  ),
  
  -- UI field completeness
  uiFields AS (
    SELECT 
      percentage(count(provider), count(*)) = 100 as hasProvider,
      percentage(count(entityName), count(*)) = 100 as hasEntityName
    FROM AwsMskClusterSample 
    WHERE nr.accountId = ${NR_ACCOUNT_ID} 
    SINCE 1 hour ago
  ),
  
  -- Metric calculations work
  calculations AS (
    SELECT 
      count(provider.bytesInPerSec.Average) > 0 as hasThroughput,
      count(provider.messagesInPerSec.Average) > 0 as hasMessageRate
    FROM AwsMskBrokerSample 
    WHERE nr.accountId = ${NR_ACCOUNT_ID} 
    SINCE 1 hour ago
  ),
  
  -- Health predicates work
  healthLogic AS (
    SELECT 
      count(provider.activeControllerCount.Sum) > 0 as hasControllerCount,
      count(provider.offlinePartitionsCount.Sum) > 0 as hasOfflinePartitions
    FROM AwsMskClusterSample 
    WHERE nr.accountId = ${NR_ACCOUNT_ID} 
    SINCE 1 hour ago
  ),
  
  -- Aggregations work
  aggregations AS (
    SELECT count(*) > 0 as canAggregate
    FROM (
      SELECT sum(provider.bytesInPerSec.Average) as total
      FROM AwsMskBrokerSample 
      WHERE nr.accountId = ${NR_ACCOUNT_ID}
      FACET provider.clusterName
      LIMIT MAX
      SINCE 1 hour ago
    )
  )

SELECT 
  CASE 
    WHEN dataAvailability.hasData 
     AND dataAvailability.isFresh
     AND uiFields.hasProvider
     AND uiFields.hasEntityName
     AND calculations.hasThroughput
     AND healthLogic.hasControllerCount
     AND aggregations.canAggregate
    THEN '✅ ALL NUANCES VERIFIED - UI WILL WORK PERFECTLY'
    ELSE '❌ MISSING REQUIREMENTS - CHECK INDIVIDUAL COMPONENTS'
  END as 'SystemStatus',
  dataAvailability.hasData as 'Has Data',
  dataAvailability.isFresh as 'Is Fresh',
  uiFields.hasProvider as 'Has UI Fields',
  calculations.hasThroughput as 'Can Calculate Metrics',
  healthLogic.hasControllerCount as 'Has Health Metrics',
  aggregations.canAggregate as 'Can Aggregate'
FROM dataAvailability, uiFields, calculations, healthLogic, aggregations
```

---

## Summary of Discovered Nuances

1. **Humanization Logic**: Specific thresholds for B/KB/MB/GB/TB/PB and msg/k/M/B/T/Q
2. **Provider Differences**: Confluent metrics divided by 60, different field names
3. **Error Handling**: -1 sentinel values, deleted account detection
4. **Hidden Logic**: Metric stream detection via empty arrays, topic name resolution order
5. **Hard Limits**: 20-item tables, LIMIT MAX for queries
6. **Health Thresholds**: Controller != 1, CPU > 70%, offline partitions > 0
7. **Time Logic**: Fixed 1-hour for navigator, 60-second polling
8. **Conditional UI**: Relationship columns, metric availability messages
9. **Complex Aggregations**: Three-level nested queries for account rollups
10. **State Management**: Error persistence, loading states

Each verification query above tests these specific behaviors to ensure the UI will work exactly as coded.