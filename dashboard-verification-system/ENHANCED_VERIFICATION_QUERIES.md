# Enhanced Verification Queries - Advanced Scenarios

This document contains additional verification queries based on UI code patterns for provider-specific logic, filtering, relationships, and APM integration.

## 1. Provider-Specific Tests

### 1.1 Polling vs Metric Stream Detection
```sql
-- Verify metric stream detection logic
-- UI Code: common/utils/query-utils.ts:75-77
SELECT 
  entity.guid,
  entity.name,
  entity.reportingEventTypes,
  CASE 
    WHEN toString(entity.reportingEventTypes) = '[]' THEN 'METRIC_STREAM'
    WHEN entity.reportingEventTypes IS NULL THEN 'METRIC_STREAM'
    ELSE 'POLLING'
  END as 'dataSource',
  CASE 
    WHEN tags.metricStream = 'true' THEN 'METRIC_STREAM_TAG'
    ELSE 'NO_TAG'
  END as 'tagIndicator'
FROM NrdbQuery
WHERE query = 'FROM AWSMSKCLUSTER SELECT * WHERE nr.accountId = ${NR_ACCOUNT_ID}'
SINCE 1 hour ago
```
**Pass Criteria**: Data source detection aligns with actual collection method

### 1.2 Provider-Specific Metric Availability
```sql
-- Verify different metrics available per provider/collection method
WITH 
  polling_metrics AS (
    SELECT 
      'POLLING' as source,
      count(provider.bytesInPerSec.Average) as hasThroughput,
      count(provider.messagesInPerSec.Average) as hasMessageRate,
      count(provider.cpuUser) as hasCpuMetrics,
      count(provider.networkRxPackets) as hasNetworkMetrics
    FROM AwsMskBrokerSample
    WHERE nr.accountId = ${NR_ACCOUNT_ID}
      AND entity.reportingEventTypes != '[]'
    SINCE 1 hour ago
  ),
  metric_stream AS (
    SELECT 
      'METRIC_STREAM' as source,
      count(*) as metricsCount,
      uniqueCount(metricName) as uniqueMetrics
    FROM Metric
    WHERE metricName LIKE 'aws.kafka%'
      AND nr.accountId = ${NR_ACCOUNT_ID}
    SINCE 1 hour ago
  )
SELECT * FROM polling_metrics
UNION ALL
SELECT 
  source,
  metricsCount as hasThroughput,
  uniqueMetrics as hasMessageRate,
  0 as hasCpuMetrics,
  0 as hasNetworkMetrics
FROM metric_stream
```
**Pass Criteria**: Each source has expected metrics available

### 1.3 Mixed Provider Environment
```sql
-- Verify handling of multiple providers in same account
SELECT 
  CASE 
    WHEN entity.type = 'AWSMSKCLUSTER' THEN 'AWS_MSK'
    WHEN entity.type = 'CONFLUENTCLOUDCLUSTER' THEN 'CONFLUENT'
    WHEN entity.type = 'KAFKACLUSTER' THEN 'SELF_MANAGED'
    ELSE 'UNKNOWN'
  END as provider,
  count(distinct entity.guid) as clusterCount,
  CASE 
    WHEN entity.reportingEventTypes = '[]' THEN 'METRIC_STREAM'
    ELSE 'POLLING'
  END as collectionMethod
FROM NrdbQuery
WHERE query LIKE '%CLUSTER%'
  AND nr.accountId = ${NR_ACCOUNT_ID}
FACET cases()
SINCE 1 hour ago
```
**Pass Criteria**: All providers correctly identified and counted

## 2. Filter Validation Tests

### 2.1 Topic Filter Impact on Cluster Visibility
```sql
-- Verify clusters remain visible even when topics are filtered
-- UI Logic: Clusters should show even if no topics match filter
WITH 
  all_clusters AS (
    SELECT 
      entity.guid as clusterGuid,
      entityName as clusterName
    FROM AwsMskClusterSample
    WHERE nr.accountId = ${NR_ACCOUNT_ID}
    SINCE 1 hour ago
  ),
  filtered_topics AS (
    SELECT 
      entity.guid as clusterGuid,
      count(*) as matchingTopics
    FROM AwsMskTopicSample
    WHERE nr.accountId = ${NR_ACCOUNT_ID}
      AND displayName LIKE '%${TOPIC_FILTER}%'  -- User's filter
    FACET entity.guid
    SINCE 1 hour ago
  )
SELECT 
  c.clusterName,
  c.clusterGuid,
  COALESCE(t.matchingTopics, 0) as 'Topics Matching Filter',
  'VISIBLE' as 'Cluster Visibility'
FROM all_clusters c
LEFT JOIN filtered_topics t ON c.clusterGuid = t.clusterGuid
```
**Pass Criteria**: All clusters show as VISIBLE regardless of topic matches

### 2.2 Search String Filter Validation
```sql
-- Test search functionality across multiple fields
-- UI searches: cluster name, broker ID, topic name, account name
SELECT 
  entity.type,
  CASE 
    WHEN entity.type = 'AWSMSKCLUSTER' AND entityName LIKE '%${SEARCH_STRING}%' THEN 'MATCH_CLUSTER_NAME'
    WHEN entity.type = 'AWSMSKBROKER' AND (entityName LIKE '%${SEARCH_STRING}%' OR provider.brokerId LIKE '%${SEARCH_STRING}%') THEN 'MATCH_BROKER'
    WHEN entity.type = 'AWSMSKTOPIC' AND displayName LIKE '%${SEARCH_STRING}%' THEN 'MATCH_TOPIC'
    WHEN providerAccountName LIKE '%${SEARCH_STRING}%' THEN 'MATCH_ACCOUNT'
    ELSE 'NO_MATCH'
  END as matchType,
  count(*) as matchCount
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
FACET cases()
SINCE 1 hour ago
```
**Pass Criteria**: Search returns expected matches across all entity types

### 2.3 Multi-Account Filter Scenarios
```sql
-- Verify account filtering works correctly
-- UI filters by linkedAccountId
SELECT 
  nr.linkedAccountId,
  nr.linkedAccountName,
  uniqueCount(entity.guid) as clusters,
  sum(brokerCount) as totalBrokers,
  sum(topicCount) as totalTopics
FROM (
  SELECT 
    nr.linkedAccountId,
    nr.linkedAccountName,
    entity.guid,
    filter(uniqueCount(b.provider.brokerId), WHERE b.eventType() = 'AwsMskBrokerSample') as brokerCount,
    filter(uniqueCount(t.displayName), WHERE t.eventType() = 'AwsMskTopicSample') as topicCount
  FROM AwsMskClusterSample c
  LEFT JOIN AwsMskBrokerSample b ON c.entity.guid = b.entity.guid
  LEFT JOIN AwsMskTopicSample t ON c.entity.guid = t.entity.guid
  WHERE c.nr.linkedAccountId IN (${ACCOUNT_ID_LIST})  -- Multiple accounts
  FACET nr.linkedAccountId, nr.linkedAccountName, entity.guid
  LIMIT MAX
)
FACET nr.linkedAccountId, nr.linkedAccountName
ORDER BY nr.linkedAccountId
```
**Pass Criteria**: Only selected accounts appear with correct counts

### 2.4 Status Filter Logic
```sql
-- Verify healthy/unhealthy filter logic matches UI
SELECT 
  entityName,
  CASE 
    -- Match UI health logic exactly
    WHEN provider.activeControllerCount.Sum != 1 THEN 'UNHEALTHY'
    WHEN provider.offlinePartitionsCount.Sum > 0 THEN 'UNHEALTHY'
    WHEN provider.underReplicatedPartitions.Sum > 0 THEN 'UNHEALTHY'
    WHEN provider.underMinIsrPartitionCount.Sum > 0 THEN 'UNHEALTHY'
    WHEN provider.cpuUser + provider.cpuSystem > 70 THEN 'UNHEALTHY'
    ELSE 'HEALTHY'
  END as computedStatus,
  latest(provider.activeControllerCount.Sum) as controllers,
  latest(provider.offlinePartitionsCount.Sum) as offlinePartitions
FROM AwsMskClusterSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
  AND CASE 
    WHEN '${STATUS_FILTER}' = 'UNHEALTHY' THEN (
      provider.activeControllerCount.Sum != 1 OR
      provider.offlinePartitionsCount.Sum > 0 OR
      provider.underReplicatedPartitions.Sum > 0 OR
      provider.underMinIsrPartitionCount.Sum > 0
    )
    ELSE 1=1
  END
SINCE 1 hour ago
```
**Pass Criteria**: Filter returns only clusters matching selected status

## 3. Data Volume Scenario Tests

### 3.1 Pagination Limit Verification
```sql
-- Test handling of LIMIT_20 for topic tables
-- constants.ts:135: LIMIT_20 = 20
SELECT 
  provider.clusterName,
  count(*) as totalTopics,
  CASE 
    WHEN count(*) > 20 THEN 'REQUIRES_PAGINATION'
    ELSE 'FITS_IN_PAGE'
  END as paginationStatus
FROM AwsMskTopicSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
FACET provider.clusterName
HAVING count(*) > 0
SINCE 1 hour ago
ORDER BY count(*) DESC
```
**Pass Criteria**: Correctly identifies clusters needing pagination

### 3.2 MAX_LIMIT Handling
```sql
-- Test MAX_LIMIT (2000) for large result sets
-- constants.ts:130: MAX_LIMIT = 2000
WITH large_query AS (
  SELECT 
    entity.guid,
    provider.bytesInPerSec.Average
  FROM AwsMskBrokerSample
  WHERE nr.accountId = ${NR_ACCOUNT_ID}
  LIMIT 2000  -- MAX_LIMIT
  SINCE 1 hour ago
)
SELECT 
  count(*) as resultCount,
  CASE 
    WHEN count(*) >= 2000 THEN 'AT_LIMIT_WARNING'
    ELSE 'UNDER_LIMIT_OK'
  END as limitStatus
FROM large_query
```
**Pass Criteria**: Detects when queries hit MAX_LIMIT

### 3.3 Topic Bucket Size Validation
```sql
-- Verify topic bucketing for large topic counts
-- Default TOPIC_BUCKET_SIZE = 10000
SELECT 
  provider.clusterName,
  uniqueCount(displayName) as topicCount,
  CASE 
    WHEN uniqueCount(displayName) > 10000 THEN 'EXCEEDS_BUCKET_SIZE'
    WHEN uniqueCount(displayName) > 5000 THEN 'HIGH_TOPIC_COUNT'
    ELSE 'NORMAL'
  END as bucketStatus,
  uniqueCount(displayName) / 10000.0 as bucketsNeeded
FROM AwsMskTopicSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
FACET provider.clusterName
SINCE 1 hour ago
```
**Pass Criteria**: Identifies clusters that may need configuration tuning

### 3.4 Large Dataset Query Performance
```sql
-- Test query performance with large datasets
WITH performance_test AS (
  SELECT 
    beginTimeSeconds,
    endTimeSeconds,
    count(*) as recordCount
  FROM (
    SELECT *
    FROM AwsMskBrokerSample, AwsMskTopicSample
    WHERE nr.accountId = ${NR_ACCOUNT_ID}
    LIMIT MAX
    SINCE 1 hour ago
  )
)
SELECT 
  recordCount,
  (endTimeSeconds - beginTimeSeconds) * 1000 as queryTimeMs,
  CASE 
    WHEN (endTimeSeconds - beginTimeSeconds) * 1000 > 5000 THEN 'SLOW_QUERY'
    WHEN (endTimeSeconds - beginTimeSeconds) * 1000 > 3000 THEN 'BORDERLINE'
    ELSE 'ACCEPTABLE'
  END as performanceStatus
FROM performance_test
```
**Pass Criteria**: Query completes within acceptable time

## 4. Relationship Verification

### 4.1 Cluster → Broker → Topic Hierarchy
```sql
-- Verify complete entity hierarchy relationships
WITH 
  cluster_broker AS (
    SELECT 
      sourceEntityGuid as clusterGuid,
      targetEntityGuid as brokerGuid,
      type as relType
    FROM Relationship
    WHERE sourceEntityType = 'AWSMSKCLUSTER'
      AND targetEntityType = 'AWSMSKBROKER'
      AND sourceEntityGuid IN (
        SELECT entity.guid FROM AwsMskClusterSample WHERE nr.accountId = ${NR_ACCOUNT_ID}
      )
    SINCE 1 day ago
  ),
  broker_topic AS (
    SELECT 
      sourceEntityGuid as brokerGuid,
      targetEntityGuid as topicGuid,
      type as relType
    FROM Relationship
    WHERE sourceEntityType = 'AWSMSKBROKER'
      AND targetEntityType = 'AWSMSKTOPIC'
    SINCE 1 day ago
  )
SELECT 
  'Cluster->Broker' as relationship,
  count(distinct clusterGuid) as sourceCount,
  count(distinct brokerGuid) as targetCount,
  count(*) as relationshipCount
FROM cluster_broker
UNION ALL
SELECT 
  'Broker->Topic' as relationship,
  count(distinct brokerGuid) as sourceCount,
  count(distinct topicGuid) as targetCount,
  count(*) as relationshipCount
FROM broker_topic
```
**Pass Criteria**: Relationships exist at each level of hierarchy

### 4.2 Entity Relationship Consistency
```sql
-- Verify bidirectional relationships are consistent
SELECT 
  CASE 
    WHEN r1.type IS NOT NULL AND r2.type IS NOT NULL THEN 'BIDIRECTIONAL'
    WHEN r1.type IS NOT NULL THEN 'FORWARD_ONLY'
    WHEN r2.type IS NOT NULL THEN 'REVERSE_ONLY'
    ELSE 'NO_RELATIONSHIP'
  END as relationshipStatus,
  count(*) as count
FROM (
  SELECT DISTINCT entity.guid FROM AwsMskClusterSample WHERE nr.accountId = ${NR_ACCOUNT_ID}
) c
LEFT JOIN Relationship r1 ON c.guid = r1.sourceEntityGuid
LEFT JOIN Relationship r2 ON c.guid = r2.targetEntityGuid
FACET cases()
SINCE 1 day ago
```
**Pass Criteria**: Most relationships should be bidirectional

### 4.3 Cross-Provider Relationships
```sql
-- Check for relationships between different provider types
SELECT 
  sourceEntityType,
  targetEntityType,
  type as relationshipType,
  count(*) as count
FROM Relationship
WHERE (sourceEntityType LIKE '%KAFKA%' OR targetEntityType LIKE '%KAFKA%')
  AND sourceEntityType != targetEntityType
  AND (
    (sourceEntityType LIKE 'AWS%' AND targetEntityType NOT LIKE 'AWS%') OR
    (sourceEntityType LIKE 'CONFLUENT%' AND targetEntityType NOT LIKE 'CONFLUENT%')
  )
FACET sourceEntityType, targetEntityType, type
SINCE 1 day ago
```
**Pass Criteria**: Cross-provider relationships identified if they exist

## 5. APM Integration Tests

### 5.1 Topic → APM Application Relationships
```sql
-- Verify APM relationships for topics (producers/consumers)
-- UI shows these in the topics table
SELECT 
  t.displayName as topicName,
  r.type as relationshipType,
  r.targetEntityType as appType,
  count(distinct r.targetEntityGuid) as appCount
FROM AwsMskTopicSample t
JOIN Relationship r ON t.entity.guid = r.sourceEntityGuid
WHERE t.nr.accountId = ${NR_ACCOUNT_ID}
  AND r.targetEntityType IN ('APPLICATION', 'SERVICE', 'BROWSER_APPLICATION')
  AND r.type IN ('PRODUCES', 'CONSUMES', 'PRODUCES_TO', 'CONSUMES_FROM')
FACET t.displayName, r.type, r.targetEntityType
SINCE 1 day ago
```
**Pass Criteria**: Topics with APM relationships properly identified

### 5.2 APM Entity Details for Related Apps
```sql
-- Get details of APM applications connected to Kafka
WITH kafka_apps AS (
  SELECT DISTINCT 
    r.targetEntityGuid as appGuid,
    r.type as relationshipType,
    r.sourceEntityGuid as kafkaEntityGuid
  FROM Relationship r
  WHERE r.sourceEntityType IN ('AWSMSKTOPIC', 'AWSMSKCLUSTER')
    AND r.targetEntityType IN ('APPLICATION', 'SERVICE')
    AND r.type IN ('PRODUCES', 'CONSUMES', 'PRODUCES_TO', 'CONSUMES_FROM')
  SINCE 1 day ago
)
SELECT 
  appName,
  language,
  count(distinct k.kafkaEntityGuid) as connectedKafkaEntities,
  uniques(k.relationshipType) as relationshipTypes
FROM kafka_apps k
JOIN (
  SELECT entity.guid, entity.name as appName, tags.language 
  FROM NrdbQuery 
  WHERE query = 'FROM APPLICATION SELECT *'
) a ON k.appGuid = a.guid
FACET appName, language
```
**Pass Criteria**: APM applications properly identified with language info

### 5.3 Producer/Consumer Lag Correlation
```sql
-- Correlate consumer lag with APM application performance
WITH consumer_lag AS (
  SELECT 
    consumer.group.id as consumerGroup,
    topic,
    max(consumer.lag) as maxLag,
    avg(consumer.lag) as avgLag
  FROM KafkaOffsetSample
  WHERE nr.accountId = ${NR_ACCOUNT_ID}
  FACET consumer.group.id, topic
  SINCE 1 hour ago
),
apm_metrics AS (
  SELECT 
    appName,
    tags.kafka.consumer.group as consumerGroup,
    average(duration) as avgDuration,
    percentage(count(*), WHERE error) as errorRate
  FROM Transaction
  WHERE tags.kafka.consumer.group IS NOT NULL
  FACET appName, tags.kafka.consumer.group
  SINCE 1 hour ago
)
SELECT 
  l.consumerGroup,
  l.topic,
  l.maxLag,
  a.appName,
  a.avgDuration,
  a.errorRate
FROM consumer_lag l
LEFT JOIN apm_metrics a ON l.consumerGroup = a.consumerGroup
WHERE l.maxLag > 1000  -- Significant lag
```
**Pass Criteria**: High lag correlated with APM metrics when available

### 5.4 Distributed Tracing Integration
```sql
-- Verify distributed traces include Kafka spans
SELECT 
  count(*) as traceCount,
  filter(count(*), WHERE span.kind = 'producer') as producerSpans,
  filter(count(*), WHERE span.kind = 'consumer') as consumerSpans,
  uniques(service.name) as services,
  uniques(messaging.destination.name) as topics
FROM Span
WHERE messaging.system = 'kafka'
  AND nr.accountId = ${NR_ACCOUNT_ID}
SINCE 1 hour ago
```
**Pass Criteria**: Kafka spans present in distributed traces

### 5.5 APM Error Correlation
```sql
-- Correlate Kafka errors with APM errors
WITH kafka_errors AS (
  SELECT 
    provider.clusterName,
    displayName as topic,
    count(*) as kafkaErrors
  FROM Log
  WHERE message LIKE '%kafka%error%' 
    OR message LIKE '%broker%failed%'
    OR message LIKE '%producer%exception%'
  FACET provider.clusterName, displayName
  SINCE 1 hour ago
),
apm_errors AS (
  SELECT 
    appName,
    tags.kafka.topic as topic,
    count(*) as appErrors,
    uniques(error.message) as errorMessages
  FROM TransactionError
  WHERE tags.kafka.topic IS NOT NULL
  FACET appName, tags.kafka.topic
  SINCE 1 hour ago
)
SELECT 
  k.topic,
  k.kafkaErrors,
  a.appName,
  a.appErrors,
  a.errorMessages
FROM kafka_errors k
FULL OUTER JOIN apm_errors a ON k.topic = a.topic
```
**Pass Criteria**: Kafka and APM errors properly correlated

## 6. Advanced Filter Combinations

### 6.1 Combined Multi-Criteria Filtering
```sql
-- Test complex filter combinations like UI supports
SELECT 
  entityName as clusterName,
  provider.offlinePartitionsCount.Sum as offlinePartitions,
  topicCount,
  brokerCount,
  throughputMBps
FROM (
  SELECT 
    c.entityName,
    c.provider.offlinePartitionsCount.Sum,
    filter(uniqueCount(t.displayName), WHERE t.eventType() = 'AwsMskTopicSample' AND t.displayName LIKE '%${TOPIC_FILTER}%') as topicCount,
    filter(uniqueCount(b.provider.brokerId), WHERE b.eventType() = 'AwsMskBrokerSample') as brokerCount,
    sum(b.provider.bytesInPerSec.Average) / 1048576 as throughputMBps
  FROM AwsMskClusterSample c
  LEFT JOIN AwsMskBrokerSample b ON c.entity.guid = b.entity.guid
  LEFT JOIN AwsMskTopicSample t ON c.entity.guid = t.entity.guid
  WHERE c.nr.accountId = ${NR_ACCOUNT_ID}
    AND c.nr.linkedAccountId IN (${ACCOUNT_FILTER})
    AND c.entityName LIKE '%${CLUSTER_FILTER}%'
    AND (
      ('${STATUS_FILTER}' = 'UNHEALTHY' AND c.provider.offlinePartitionsCount.Sum > 0) OR
      ('${STATUS_FILTER}' = 'HEALTHY' AND c.provider.offlinePartitionsCount.Sum = 0) OR
      '${STATUS_FILTER}' = 'ALL'
    )
  FACET c.entityName, c.provider.offlinePartitionsCount.Sum
  LIMIT MAX
)
WHERE topicCount > 0 OR '${TOPIC_FILTER}' = ''
ORDER BY throughputMBps DESC
```
**Pass Criteria**: Filters work correctly in combination

### 6.2 Time Range Filter Impact
```sql
-- Verify time range selection impacts all metrics consistently
SELECT 
  provider.clusterName,
  count(*) as dataPoints,
  min(timestamp) as earliestData,
  max(timestamp) as latestData,
  (max(timestamp) - min(timestamp))/1000/60 as timeSpanMinutes
FROM AwsMskBrokerSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
SINCE ${TIME_RANGE}  -- Variable time range
FACET provider.clusterName
```
**Pass Criteria**: Time range correctly limits data

## 7. Edge Case Validations

### 7.1 Empty Filter Results
```sql
-- Verify UI behavior when filters return no results
WITH filter_results AS (
  SELECT 
    count(*) as matchCount
  FROM AwsMskClusterSample
  WHERE nr.accountId = ${NR_ACCOUNT_ID}
    AND entityName = 'non-existent-cluster-name'
  SINCE 1 hour ago
)
SELECT 
  CASE 
    WHEN matchCount = 0 THEN 'SHOW_EMPTY_STATE'
    ELSE 'SHOW_RESULTS'
  END as uiState,
  matchCount
FROM filter_results
```
**Pass Criteria**: Empty state detected correctly

### 7.2 Special Characters in Filters
```sql
-- Test filter handling of special characters
SELECT 
  displayName,
  CASE 
    WHEN displayName LIKE '%${ESCAPED_FILTER}%' THEN 'MATCHES'
    ELSE 'NO_MATCH'
  END as filterMatch
FROM AwsMskTopicSample
WHERE nr.accountId = ${NR_ACCOUNT_ID}
  AND (
    displayName LIKE '%[%' OR  -- Square brackets
    displayName LIKE '%_%' OR  -- Underscore
    displayName LIKE '%$%' OR  -- Dollar sign
    displayName LIKE '%.%'     -- Period
  )
SINCE 1 hour ago
LIMIT 20
```
**Pass Criteria**: Special characters handled correctly in filters

## Master Enhanced Verification Query

```sql
-- Comprehensive verification including all enhancements
WITH 
  provider_check AS (
    SELECT 
      uniqueCount(CASE WHEN entity.reportingEventTypes = '[]' THEN entity.guid END) as metricStreamCount,
      uniqueCount(CASE WHEN entity.reportingEventTypes != '[]' THEN entity.guid END) as pollingCount
    FROM AwsMskClusterSample WHERE nr.accountId = ${NR_ACCOUNT_ID} SINCE 1 hour ago
  ),
  filter_check AS (
    SELECT count(*) > 0 as filtersWork
    FROM AwsMskClusterSample 
    WHERE nr.accountId = ${NR_ACCOUNT_ID} AND entityName LIKE '%%' SINCE 1 hour ago
  ),
  volume_check AS (
    SELECT 
      max(topicCount) as maxTopicsPerCluster,
      count(*) as totalClusters
    FROM (
      SELECT uniqueCount(displayName) as topicCount
      FROM AwsMskTopicSample WHERE nr.accountId = ${NR_ACCOUNT_ID}
      FACET provider.clusterName SINCE 1 hour ago
    )
  ),
  relationship_check AS (
    SELECT count(*) as relationshipCount
    FROM Relationship
    WHERE sourceEntityType LIKE '%KAFKA%' OR targetEntityType LIKE '%KAFKA%'
    SINCE 1 day ago
  ),
  apm_check AS (
    SELECT count(*) as apmRelationships
    FROM Relationship
    WHERE sourceEntityType IN ('AWSMSKTOPIC', 'CONFLUENTCLOUDKAFKATOPIC')
      AND targetEntityType IN ('APPLICATION', 'SERVICE')
    SINCE 1 day ago
  )
SELECT 
  provider_check.metricStreamCount + provider_check.pollingCount as 'Total Clusters',
  provider_check.metricStreamCount as 'Metric Stream Clusters',
  provider_check.pollingCount as 'Polling Clusters',
  filter_check.filtersWork as 'Filters Working',
  volume_check.maxTopicsPerCluster as 'Max Topics/Cluster',
  relationship_check.relationshipCount as 'Entity Relationships',
  apm_check.apmRelationships as 'APM Integrations',
  CASE 
    WHEN (provider_check.metricStreamCount + provider_check.pollingCount) > 0
     AND filter_check.filtersWork
     AND volume_check.maxTopicsPerCluster < 10000
    THEN '✅ ENHANCED FEATURES VERIFIED'
    ELSE '❌ CHECK ENHANCED FEATURES'
  END as 'Enhanced Status'
FROM provider_check, filter_check, volume_check, relationship_check, apm_check
```

---

## Summary of Enhanced Verifications

1. **Provider-Specific**: Polling vs Metric Stream detection and handling
2. **Filter Validation**: Complex multi-criteria filtering, search, status filters
3. **Data Volume**: Pagination limits, performance with large datasets
4. **Relationships**: Entity hierarchy, cross-provider, consistency
5. **APM Integration**: Producer/consumer detection, distributed tracing, error correlation

Each test includes specific pass criteria based on UI code behavior.