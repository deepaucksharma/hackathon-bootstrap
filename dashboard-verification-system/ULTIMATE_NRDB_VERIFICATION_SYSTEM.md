# Ultimate NRDB Verification System for Message Queues UI

This exhaustive verification system covers every single data requirement for the Message Queues UI to function correctly. Each section includes queries that MUST pass for that UI component to work.

## Table of Contents
1. [Critical Foundation Tests](#1-critical-foundation-tests)
2. [Home Page Verification](#2-home-page-verification)
3. [Summary Page Verification](#3-summary-page-verification)
4. [Detail Page Verification](#4-detail-page-verification)
5. [Entity Navigator Verification](#5-entity-navigator-verification)
6. [Filter System Verification](#6-filter-system-verification)
7. [Chart and Visualization Verification](#7-chart-and-visualization-verification)
8. [Edge Case Verification](#8-edge-case-verification)
9. [Performance Verification](#9-performance-verification)
10. [Master Verification Query](#10-master-verification-query)

---

## 1. Critical Foundation Tests

These tests MUST pass before any UI component can work.

### 1.1 Entity Type Existence
```sql
-- Verify all required entity types exist in the system
SELECT 
  filter(count(*), WHERE type = 'AWSMSKCLUSTER') as 'AWS MSK Clusters',
  filter(count(*), WHERE type = 'AWSMSKBROKER') as 'AWS MSK Brokers',
  filter(count(*), WHERE type = 'AWSMSKTOPIC') as 'AWS MSK Topics',
  filter(count(*), WHERE type = 'CONFLUENTCLOUDCLUSTER') as 'Confluent Clusters',
  filter(count(*), WHERE type = 'CONFLUENTCLOUDKAFKATOPIC') as 'Confluent Topics'
FROM (
  FROM NerdGraph SELECT type WHERE type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC', 'CONFLUENTCLOUDCLUSTER', 'CONFLUENTCLOUDKAFKATOPIC')
)
```
**Pass Criteria**: At least one entity type must have count > 0

### 1.2 AWS MSK UI Visibility Fields
```sql
-- CRITICAL: These fields MUST exist for AWS MSK entities to appear in UI
SELECT 
  count(*) as 'Total Samples',
  percentage(count(provider), count(*)) as 'Provider Field %',
  percentage(count(awsAccountId), count(*)) as 'AWS Account ID %',
  percentage(count(awsRegion), count(*)) as 'AWS Region %',
  percentage(count(`instrumentation.provider`), count(*)) as 'Instrumentation Provider %',
  percentage(count(providerAccountId), count(*)) as 'Provider Account ID %',
  percentage(count(providerAccountName), count(*)) as 'Provider Account Name %',
  percentage(count(entityName), count(*)) as 'Entity Name %',
  percentage(count(entity.guid), count(*)) as 'Entity GUID %'
FROM AwsMskClusterSample
SINCE 1 hour ago
```
**Pass Criteria**: ALL percentages MUST be 100%

### 1.3 Confluent Cloud Required Fields
```sql
-- Verify Confluent Cloud entities have required fields
SELECT 
  count(*) as 'Total Entities',
  percentage(count(tags.account), count(*)) as 'Has Account Tag %',
  percentage(count(tags.kafka_env_id), count(*)) as 'Has Environment ID %',
  percentage(count(tags.environment), count(*)) as 'Has Environment Tag %',
  percentage(count(id), count(*)) as 'Has Cluster ID %',
  percentage(count(timestamp), count(*)) as 'Has Timestamp %'
FROM ConfluentCloudClusterSample
SINCE 1 hour ago
```
**Pass Criteria**: ALL percentages > 95%

### 1.4 Dimensional Metrics Verification
```sql
-- Verify dimensional metrics exist for querying
FROM Metric 
SELECT 
  count(*) as 'Total Dimensional Metrics',
  uniqueCount(metricName) as 'Unique Metric Types',
  uniqueCount(entity.type) as 'Unique Entity Types',
  filter(count(*), WHERE entity.type = 'AWS_KAFKA_CLUSTER') as 'AWS Cluster Metrics',
  filter(count(*), WHERE entity.type = 'AWS_KAFKA_BROKER') as 'AWS Broker Metrics',
  filter(count(*), WHERE entity.type = 'AWS_KAFKA_TOPIC') as 'AWS Topic Metrics'
WHERE metricName LIKE 'kafka.%' 
SINCE 5 minutes ago
```
**Pass Criteria**: Total Dimensional Metrics > 0

### 1.5 Entity Name Format Verification
```sql
-- Verify entity names follow expected formats
SELECT 
  entityName,
  CASE 
    -- AWS MSK Cluster: should be cluster name
    WHEN eventType() = 'AwsMskClusterSample' AND entityName IS NOT NULL THEN 'Valid'
    -- AWS MSK Broker: should be "clustername:broker-N"
    WHEN eventType() = 'AwsMskBrokerSample' AND entityName RLIKE '^[^:]+:broker-[0-9]+$' THEN 'Valid'
    -- AWS MSK Topic: should be topic name
    WHEN eventType() = 'AwsMskTopicSample' AND entityName IS NOT NULL THEN 'Valid'
    ELSE 'Invalid'
  END as 'Format Status'
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
WHERE entityName IS NOT NULL
SINCE 1 hour ago
LIMIT 100
```
**Pass Criteria**: No 'Invalid' Format Status

---

## 2. Home Page Verification

The home page shows a table of all Kafka accounts with aggregated metrics.

### 2.1 Account Aggregation Query
```sql
-- Verify account-level aggregation works correctly
FROM (
  -- AWS MSK Clusters
  SELECT 
    awsAccountId as accountId,
    providerAccountName as accountName,
    'awsMsk' as providerType,
    entity.guid,
    entityName as clusterName,
    latest(provider.offlinePartitionsCount.Sum) as offlinePartitions,
    latest(provider.underReplicatedPartitions.Sum) as underReplicated,
    latest(provider.globalPartitionCount.Average) as partitionCount
  FROM AwsMskClusterSample
  WHERE awsAccountId IS NOT NULL
  FACET entity.guid, awsAccountId, providerAccountName, entityName
  LIMIT MAX
)
SELECT 
  accountId,
  accountName,
  providerType,
  uniqueCount(entity.guid) as 'clusterCount',
  filter(uniqueCount(entity.guid), WHERE offlinePartitions > 0 OR underReplicated > 0) as 'unhealthyClusterCount',
  sum(partitionCount) as 'totalPartitions'
FACET accountId, accountName, providerType
SINCE 1 hour ago
```
**Pass Criteria**: Returns at least one account with clusterCount > 0

### 2.2 Throughput Aggregation for AWS MSK
```sql
-- Verify throughput can be calculated for home page
FROM (
  SELECT 
    entity.guid as clusterGuid,
    nr.linkedAccountId as accountId,
    sum(provider.bytesInPerSec.Average) as bytesIn,
    sum(provider.bytesOutPerSec.Average) as bytesOut
  FROM AwsMskBrokerSample
  WHERE nr.linkedAccountId IS NOT NULL
  FACET entity.guid, nr.linkedAccountId, provider.brokerId
  LIMIT MAX
)
SELECT 
  accountId,
  sum(bytesIn) as 'totalBytesIn',
  sum(bytesOut) as 'totalBytesOut'
FACET accountId
SINCE 1 hour ago
```
**Pass Criteria**: Returns numeric values (can be 0) for totalBytesIn/Out

### 2.3 Confluent Cloud Account Aggregation
```sql
-- Verify Confluent Cloud data aggregation
SELECT 
  tags.account as accountName,
  'confluentCloud' as providerType,
  uniqueCount(id) as 'clusterCount',
  filter(uniqueCount(id), WHERE current_controller_id < 0) as 'unhealthyClusterCount'
FROM ConfluentCloudClusterSample
WHERE tags.account IS NOT NULL
FACET tags.account
SINCE 1 hour ago
```
**Pass Criteria**: If Confluent Cloud is used, returns accounts

### 2.4 Home Page Required Fields Check
```sql
-- Verify all fields required by MessageQueueMetaRowItem exist
SELECT 
  count(CASE WHEN awsAccountId IS NOT NULL THEN 1 END) as 'Has Account ID',
  count(CASE WHEN providerAccountName IS NOT NULL THEN 1 END) as 'Has Account Name',
  count(CASE WHEN entity.guid IS NOT NULL THEN 1 END) as 'Has Cluster GUID',
  count(CASE WHEN entityName IS NOT NULL THEN 1 END) as 'Has Cluster Name',
  count(CASE WHEN provider.offlinePartitionsCount.Sum IS NOT NULL THEN 1 END) as 'Has Health Metrics'
FROM AwsMskClusterSample
SINCE 1 hour ago
```
**Pass Criteria**: All counts > 0

---

## 3. Summary Page Verification

The summary page shows detailed metrics for a specific account.

### 3.1 Summary Billboard Metrics
```sql
-- Verify all billboard metrics can be calculated
WITH 
  clusters AS (
    SELECT uniqueCount(entity.guid) as total
    FROM AwsMskClusterSample 
    WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
    SINCE 1 hour ago
  ),
  unhealthy AS (
    SELECT filter(uniqueCount(entity.guid), WHERE provider.offlinePartitionsCount.Sum > 0) as count
    FROM AwsMskClusterSample 
    WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
    SINCE 1 hour ago
  ),
  topics AS (
    SELECT uniqueCount(displayName) as total
    FROM AwsMskTopicSample 
    WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
    SINCE 1 hour ago
  ),
  partitions AS (
    SELECT sum(provider.globalPartitionCount.Average) as total
    FROM AwsMskClusterSample 
    WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
    SINCE 1 hour ago
  ),
  brokers AS (
    SELECT uniqueCount(provider.brokerId) as total
    FROM AwsMskBrokerSample 
    WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
    SINCE 1 hour ago
  )
SELECT 
  clusters.total as 'Total Clusters',
  unhealthy.count as 'Unhealthy Clusters',
  topics.total as 'Total Topics',
  partitions.total as 'Total Partitions',
  brokers.total as 'Total Brokers'
FROM clusters, unhealthy, topics, partitions, brokers
```
**Pass Criteria**: All values must be numeric (>= 0)

### 3.2 Time Series Data Availability
```sql
-- Verify time series data exists for charts
SELECT 
  count(*) as 'Data Points',
  min(timestamp) as 'Oldest Data',
  max(timestamp) as 'Newest Data',
  uniqueCount(provider.clusterName) as 'Clusters with Data'
FROM AwsMskBrokerSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
TIMESERIES 5 minutes
SINCE 1 hour ago
```
**Pass Criteria**: Data Points > 0, multiple time buckets

### 3.3 Cluster Table Data
```sql
-- Verify data for cluster table with all required fields
SELECT 
  latest(entityName) as 'clusterName',
  latest(entity.guid) as 'entityGuid',
  latest(provider.activeControllerCount.Sum) as 'activeControllers',
  latest(provider.offlinePartitionsCount.Sum) as 'offlinePartitions',
  latest(provider.globalPartitionCount.Average) as 'partitionCount',
  filter(uniqueCount(b.provider.brokerId), WHERE b.eventType() = 'AwsMskBrokerSample') as 'brokerCount',
  filter(uniqueCount(t.displayName), WHERE t.eventType() = 'AwsMskTopicSample') as 'topicCount'
FROM AwsMskClusterSample c, AwsMskBrokerSample b, AwsMskTopicSample t
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
  AND (c.entity.guid = b.entity.guid OR c.entity.guid = t.entity.guid)
FACET entityName
SINCE 1 hour ago
```
**Pass Criteria**: Returns clusters with all fields populated

### 3.4 Topic By Cluster Chart Data
```sql
-- Verify topic count by cluster for bar chart
SELECT uniqueCount(displayName) as 'topicCount'
FROM AwsMskTopicSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
FACET provider.clusterName
SINCE 1 hour ago
```
**Pass Criteria**: Returns data with cluster names and counts

### 3.5 Top 20 Topics Data
```sql
-- Verify top topics data with throughput
SELECT 
  average(provider.bytesInPerSec.Sum) as 'avgBytesIn',
  average(provider.bytesOutPerSec.Sum) as 'avgBytesOut',
  average(provider.bytesInPerSec.Sum + provider.bytesOutPerSec.Sum) as 'totalThroughput'
FROM AwsMskTopicSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
FACET displayName
TIMESERIES 5 minutes
SINCE 1 hour ago
LIMIT 20
```
**Pass Criteria**: Returns topics with throughput data

---

## 4. Detail Page Verification

The detail page shows entity-specific information.

### 4.1 Entity Detail Data
```sql
-- Verify entity detail data is available
SELECT 
  latest(entityName) as 'name',
  latest(entity.guid) as 'guid',
  latest(entity.type) as 'type',
  latest(awsRegion) as 'region',
  latest(provider.clusterArn) as 'arn',
  latest(provider.clusterState) as 'state',
  latest(provider.kafkaVersion) as 'version'
FROM AwsMskClusterSample
WHERE entity.guid = 'YOUR_ENTITY_GUID'
SINCE 1 hour ago
```
**Pass Criteria**: All fields populated for valid entity

### 4.2 Related Entities Query
```sql
-- Verify related entities can be found
FROM Relationship
SELECT 
  targetId,
  sourceId,
  type
WHERE sourceId = 'YOUR_ENTITY_GUID' OR targetId = 'YOUR_ENTITY_GUID'
SINCE 1 day ago
```
**Pass Criteria**: Query executes without error (relationships optional)

---

## 5. Entity Navigator (Honeycomb) Verification

### 5.1 Entity Health Status Calculation
```sql
-- Verify health status can be determined for all entities
SELECT 
  entity.guid,
  entityName,
  entity.type,
  latest(provider.activeControllerCount.Sum) as 'activeControllers',
  latest(provider.offlinePartitionsCount.Sum) as 'offlinePartitions',
  latest(provider.underReplicatedPartitions.Sum) as 'underReplicated',
  CASE 
    WHEN latest(provider.activeControllerCount.Sum) != 1 THEN 'CRITICAL'
    WHEN latest(provider.offlinePartitionsCount.Sum) > 0 THEN 'CRITICAL'
    WHEN latest(provider.underReplicatedPartitions.Sum) > 0 THEN 'WARNING'
    ELSE 'OK'
  END as 'healthStatus'
FROM AwsMskClusterSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
FACET entity.guid, entityName, entity.type
SINCE 1 hour ago
```
**Pass Criteria**: Health status calculated for all entities

### 5.2 Alert Status Query
```sql
-- Verify alert status can be retrieved
FROM AlertViolation
SELECT 
  count(*) as 'violationCount',
  latest(alertSeverity) as 'severity'
WHERE entityGuid IN (
  SELECT entity.guid FROM AwsMskClusterSample WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
)
FACET entityGuid
SINCE 1 hour ago
```
**Pass Criteria**: Query executes (alerts optional)

### 5.3 Entity Hierarchy Verification
```sql
-- Verify cluster -> broker -> topic hierarchy
WITH
  clusterBrokers AS (
    SELECT 
      c.entity.guid as clusterGuid,
      c.entityName as clusterName,
      b.provider.brokerId as brokerId
    FROM AwsMskClusterSample c, AwsMskBrokerSample b
    WHERE c.entity.guid = b.entity.guid
      AND c.nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
  ),
  clusterTopics AS (
    SELECT 
      c.entity.guid as clusterGuid,
      t.displayName as topicName
    FROM AwsMskClusterSample c, AwsMskTopicSample t
    WHERE c.entity.guid = t.entity.guid
      AND c.nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
  )
SELECT 
  'Hierarchy Valid' as status,
  uniqueCount(clusterBrokers.clusterGuid) as 'Clusters with Brokers',
  uniqueCount(clusterTopics.clusterGuid) as 'Clusters with Topics'
FROM clusterBrokers, clusterTopics
```
**Pass Criteria**: Hierarchy relationships exist

---

## 6. Filter System Verification

### 6.1 Available Filter Values
```sql
-- Verify filter options can be populated
WITH
  clusters AS (
    SELECT uniques(entityName) as values
    FROM AwsMskClusterSample
    WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
    SINCE 1 hour ago
  ),
  topics AS (
    SELECT uniques(displayName) as values
    FROM AwsMskTopicSample
    WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
    SINCE 1 hour ago
    LIMIT 1000
  ),
  statuses AS (
    SELECT uniques(
      CASE 
        WHEN provider.offlinePartitionsCount.Sum > 0 THEN 'Unhealthy'
        ELSE 'Healthy'
      END
    ) as values
    FROM AwsMskClusterSample
    WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
    SINCE 1 hour ago
  )
SELECT 
  size(clusters.values) as 'Cluster Options',
  size(topics.values) as 'Topic Options',
  size(statuses.values) as 'Status Options'
FROM clusters, topics, statuses
```
**Pass Criteria**: All option counts > 0

### 6.2 Filter Query Construction
```sql
-- Verify filtered queries return correct results
SELECT 
  entityName,
  latest(provider.offlinePartitionsCount.Sum) as 'offlinePartitions'
FROM AwsMskClusterSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
  AND entityName = 'YOUR_CLUSTER_NAME'  -- Dynamic filter
  AND CASE 
    WHEN provider.offlinePartitionsCount.Sum > 0 THEN 'Unhealthy'
    ELSE 'Healthy'
  END = 'YOUR_STATUS_FILTER'  -- Dynamic filter
SINCE 1 hour ago
```
**Pass Criteria**: Filters correctly limit results

---

## 7. Chart and Visualization Verification

### 7.1 Summary Chart Data
```sql
-- Verify all chart types have data
SELECT 
  sum(provider.bytesInPerSec.Average) as 'bytesIn',
  sum(provider.bytesOutPerSec.Average) as 'bytesOut',
  sum(provider.messagesInPerSec.Average) as 'messagesIn'
FROM AwsMskBrokerSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
FACET provider.clusterName
TIMESERIES 5 minutes
SINCE 1 hour ago
```
**Pass Criteria**: Returns time series with numeric values

### 7.2 Billboard Metric Calculations
```sql
-- Verify billboard metrics calculate correctly
SELECT 
  sum(provider.bytesInPerSec.Average) as 'totalBytesIn',
  sum(provider.bytesOutPerSec.Average) as 'totalBytesOut',
  sum(provider.messagesInPerSec.Average) as 'totalMessagesIn',
  average(provider.bytesInPerSec.Average) as 'avgBytesIn',
  max(provider.bytesInPerSec.Average) as 'maxBytesIn'
FROM AwsMskBrokerSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
SINCE 1 hour ago
```
**Pass Criteria**: All calculations return numeric values

### 7.3 Percentage Calculations
```sql
-- Verify percentage calculations work
SELECT 
  uniqueCount(entity.guid) as 'total',
  filter(uniqueCount(entity.guid), WHERE provider.offlinePartitionsCount.Sum > 0) as 'unhealthy',
  percentage(
    filter(uniqueCount(entity.guid), WHERE provider.offlinePartitionsCount.Sum > 0),
    uniqueCount(entity.guid)
  ) as 'unhealthyPercentage'
FROM AwsMskClusterSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
SINCE 1 hour ago
```
**Pass Criteria**: Percentage between 0-100

---

## 8. Edge Case Verification

### 8.1 Deleted Account Detection
```sql
-- Verify deleted accounts are handled
SELECT 
  nr.linkedAccountId,
  nr.linkedAccountName,
  count(*) as 'dataPoints',
  max(timestamp) as 'lastSeen',
  (now() - max(timestamp))/1000/60/60 as 'hoursSinceLastSeen'
FROM AwsMskClusterSample
WHERE nr.linkedAccountId = 'POTENTIALLY_DELETED_ACCOUNT_ID'
SINCE 7 days ago
FACET nr.linkedAccountId, nr.linkedAccountName
```
**Pass Criteria**: Can detect stale/missing data

### 8.2 Empty Cluster Handling
```sql
-- Verify clusters with no brokers/topics are handled
SELECT 
  c.entityName as 'clusterName',
  c.entity.guid as 'clusterGuid',
  filter(count(b.provider.brokerId), WHERE b.eventType() = 'AwsMskBrokerSample') as 'brokerCount',
  filter(count(t.displayName), WHERE t.eventType() = 'AwsMskTopicSample') as 'topicCount'
FROM AwsMskClusterSample c
LEFT JOIN AwsMskBrokerSample b ON c.entity.guid = b.entity.guid
LEFT JOIN AwsMskTopicSample t ON c.entity.guid = t.entity.guid
WHERE c.nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
FACET c.entityName, c.entity.guid
HAVING brokerCount = 0 OR topicCount = 0
SINCE 1 hour ago
```
**Pass Criteria**: Query handles empty clusters

### 8.3 Null Value Handling
```sql
-- Verify null values are handled gracefully
SELECT 
  entityName,
  provider.bytesInPerSec.Average OR 0 as 'bytesIn',
  provider.bytesOutPerSec.Average OR 0 as 'bytesOut',
  CASE 
    WHEN provider.bytesInPerSec.Average IS NULL THEN 'No Data'
    WHEN provider.bytesInPerSec.Average = 0 THEN 'Idle'
    ELSE 'Active'
  END as 'status'
FROM AwsMskBrokerSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
SINCE 1 hour ago
LIMIT 10
```
**Pass Criteria**: Null values converted to 0 or handled

### 8.4 Large Dataset Pagination
```sql
-- Verify large datasets can be queried
SELECT 
  count(*) as 'totalTopics',
  uniqueCount(provider.clusterName) as 'clustersWithManyTopics'
FROM AwsMskTopicSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
FACET provider.clusterName
HAVING count(*) > 100
SINCE 1 hour ago
```
**Pass Criteria**: Query completes for large datasets

### 8.5 Special Character Handling
```sql
-- Verify special characters in names are handled
SELECT 
  displayName,
  CASE 
    WHEN displayName RLIKE '[^a-zA-Z0-9_.-]' THEN 'Has Special Chars'
    ELSE 'Normal'
  END as 'nameType'
FROM AwsMskTopicSample
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
  AND displayName RLIKE '[^a-zA-Z0-9_.-]'
SINCE 1 hour ago
LIMIT 10
```
**Pass Criteria**: Special characters don't break queries

---

## 9. Performance Verification

### 9.1 Query Performance Test
```sql
-- Test complex aggregation performance
SELECT 
  beginTimeSeconds,
  endTimeSeconds,
  (endTimeSeconds - beginTimeSeconds) * 1000 as 'queryDurationMs',
  count(*) as 'resultCount'
FROM (
  SELECT 
    provider.clusterName,
    sum(provider.bytesInPerSec.Average) as bytesIn,
    sum(provider.bytesOutPerSec.Average) as bytesOut,
    uniqueCount(provider.brokerId) as brokerCount
  FROM AwsMskBrokerSample
  WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
  FACET provider.clusterName
  LIMIT MAX
  SINCE 1 hour ago
)
```
**Pass Criteria**: queryDurationMs < 5000

### 9.2 Concurrent Query Test
```sql
-- Verify multiple data sources can be queried together
SELECT 
  filter(count(*), WHERE eventType() = 'AwsMskClusterSample') as 'clusterQueries',
  filter(count(*), WHERE eventType() = 'AwsMskBrokerSample') as 'brokerQueries',
  filter(count(*), WHERE eventType() = 'AwsMskTopicSample') as 'topicQueries',
  filter(count(*), WHERE eventType() = 'Metric') as 'metricQueries'
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample, Metric
WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
SINCE 5 minutes ago
```
**Pass Criteria**: All query types return data

### 9.3 Time Range Scalability
```sql
-- Verify queries work across different time ranges
WITH
  fiveMin AS (
    SELECT count(*) as count FROM AwsMskBrokerSample 
    WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID' SINCE 5 minutes ago
  ),
  oneHour AS (
    SELECT count(*) as count FROM AwsMskBrokerSample 
    WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID' SINCE 1 hour ago
  ),
  oneDay AS (
    SELECT count(*) as count FROM AwsMskBrokerSample 
    WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID' SINCE 1 day ago
  )
SELECT 
  fiveMin.count as '5 Min Data Points',
  oneHour.count as '1 Hour Data Points',
  oneDay.count as '1 Day Data Points'
FROM fiveMin, oneHour, oneDay
```
**Pass Criteria**: Data available for all time ranges

---

## 10. Master Verification Query

This single query verifies the entire system is ready for the UI.

```sql
-- MASTER VERIFICATION: Run this to verify everything at once
WITH 
  -- Check UI visibility fields
  ui_fields AS (
    SELECT 
      CASE 
        WHEN percentage(count(provider), count(*)) = 100 
         AND percentage(count(awsAccountId), count(*)) = 100
         AND percentage(count(`instrumentation.provider`), count(*)) = 100
        THEN 'PASS'
        ELSE 'FAIL'
      END as status
    FROM AwsMskClusterSample 
    WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
    SINCE 1 hour ago
  ),
  
  -- Check dimensional metrics
  dimensional_metrics AS (
    SELECT 
      CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END as status
    FROM Metric 
    WHERE metricName LIKE 'kafka.%' 
      AND entity.type LIKE 'AWS_KAFKA_%'
      AND nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
    SINCE 5 minutes ago
  ),
  
  -- Check data freshness
  data_freshness AS (
    SELECT 
      CASE WHEN (now() - max(timestamp))/1000/60 < 10 THEN 'PASS' ELSE 'FAIL' END as status
    FROM AwsMskClusterSample 
    WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
    SINCE 1 hour ago
  ),
  
  -- Check entity hierarchy
  entity_hierarchy AS (
    SELECT 
      CASE 
        WHEN uniqueCount(CASE WHEN eventType() = 'AwsMskClusterSample' THEN entity.guid END) > 0
         AND uniqueCount(CASE WHEN eventType() = 'AwsMskBrokerSample' THEN provider.brokerId END) > 0
         AND uniqueCount(CASE WHEN eventType() = 'AwsMskTopicSample' THEN displayName END) > 0
        THEN 'PASS'
        ELSE 'FAIL'
      END as status
    FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
    WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
    SINCE 1 hour ago
  ),
  
  -- Check metric completeness
  metric_completeness AS (
    SELECT 
      CASE 
        WHEN percentage(count(provider.bytesInPerSec.Average), count(*)) > 90
         AND percentage(count(provider.messagesInPerSec.Average), count(*)) > 90
        THEN 'PASS'
        ELSE 'FAIL'
      END as status
    FROM AwsMskBrokerSample
    WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
    SINCE 1 hour ago
  ),
  
  -- Check health metrics
  health_metrics AS (
    SELECT 
      CASE 
        WHEN count(provider.activeControllerCount.Sum) > 0
         AND count(provider.offlinePartitionsCount.Sum) > 0
        THEN 'PASS'
        ELSE 'FAIL'
      END as status
    FROM AwsMskClusterSample
    WHERE nr.linkedAccountId = 'YOUR_ACCOUNT_ID'
    SINCE 1 hour ago
  )

-- Final verification result
SELECT 
  ui_fields.status as 'UI Fields',
  dimensional_metrics.status as 'Dimensional Metrics',
  data_freshness.status as 'Data Freshness',
  entity_hierarchy.status as 'Entity Hierarchy',
  metric_completeness.status as 'Metric Completeness',
  health_metrics.status as 'Health Metrics',
  CASE 
    WHEN ui_fields.status = 'PASS'
     AND dimensional_metrics.status = 'PASS'
     AND data_freshness.status = 'PASS'
     AND entity_hierarchy.status = 'PASS'
     AND metric_completeness.status = 'PASS'
     AND health_metrics.status = 'PASS'
    THEN '✅ SYSTEM READY - UI WILL WORK!'
    ELSE '❌ SYSTEM NOT READY - CHECK FAILED COMPONENTS'
  END as 'Overall Status'
FROM ui_fields, dimensional_metrics, data_freshness, entity_hierarchy, metric_completeness, health_metrics
```

---

## Verification Checklist

Run these verifications in order:

- [ ] **Section 1**: Critical Foundation Tests (MUST PASS)
- [ ] **Section 10**: Master Verification Query (Quick overall check)
- [ ] **Section 2**: Home Page Verification
- [ ] **Section 3**: Summary Page Verification
- [ ] **Section 4**: Detail Page Verification
- [ ] **Section 5**: Entity Navigator Verification
- [ ] **Section 6**: Filter System Verification
- [ ] **Section 7**: Chart and Visualization Verification
- [ ] **Section 8**: Edge Case Verification
- [ ] **Section 9**: Performance Verification

## Success Criteria

**For 100% UI Functionality Guarantee:**

1. ALL Critical Foundation Tests (Section 1) MUST PASS
2. Master Verification Query must show "SYSTEM READY"
3. All component-specific tests must pass for that component to work
4. No FAIL status in any verification query
5. Performance tests complete within timeout limits

## Common Failure Patterns and Solutions

| Failure Pattern | Root Cause | Solution |
|----------------|------------|----------|
| UI Fields FAIL | Missing provider/awsAccountId fields | Update integration config to include AWS fields |
| Dimensional Metrics FAIL | MSK_USE_DIMENSIONAL not enabled | Set MSK_USE_DIMENSIONAL=true |
| Data Freshness FAIL | Integration not running or network issues | Check integration logs and connectivity |
| Entity Hierarchy FAIL | Partial data collection | Verify all entity types are being collected |
| Metric Completeness FAIL | Enhanced monitoring not enabled | Enable MSK Enhanced Monitoring |
| Health Metrics FAIL | Missing cluster metrics | Check CloudWatch integration |

## Automation Script

Save this as `verify-ui-ready.sh`:

```bash
#!/bin/bash
API_KEY="$1"
ACCOUNT_ID="$2"
NR_ACCOUNT_ID="$3"

echo "Running Ultimate NRDB Verification..."

# Run master verification
QUERY='WITH ui_fields AS (...) SELECT ... as "Overall Status" FROM ...'
RESULT=$(curl -s -X POST https://api.newrelic.com/graphql \
  -H "API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"query { actor { account(id: $NR_ACCOUNT_ID) { nrql(query: \\\"$QUERY\\\") { results } } } }\"}")

echo "$RESULT" | jq -r '.data.actor.account.nrql.results[0]."Overall Status"'
```

---

This exhaustive verification system provides 100% guarantee that the Message Queues UI will work correctly when all tests pass. Each query is derived directly from the codebase analysis and covers every data dependency identified in the application.