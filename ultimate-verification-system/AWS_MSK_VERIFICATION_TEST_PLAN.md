# AWS MSK New Relic Integration Test Plan

## Overview

This test plan provides a systematic approach to verify that AWS MSK metrics are correctly flowing into New Relic's NRDB. It's organized by priority and feature area, with clear pass/fail criteria for each test.

## Prerequisites

- New Relic API Key with NRQL query permissions
- New Relic Account ID
- AWS Account ID
- Kafka cluster name (optional, for filtering)

## Test Execution Order

Tests should be executed in this order:
1. Critical UI Visibility Tests (MUST PASS)
2. Basic Data Availability Tests
3. Metric Completeness Tests
4. Feature Functionality Tests
5. Performance and Edge Case Tests

---

## 1. CRITICAL UI VISIBILITY TESTS (Priority: P0)

These tests MUST pass for clusters to appear in the New Relic UI.

### Test 1.1: Verify Required UI Fields

```sql
-- CRITICAL: Check UI visibility fields
SELECT 
  count(*) as 'Total Samples',
  percentage(count(provider), count(*)) as 'Has Provider %',
  percentage(count(awsAccountId), count(*)) as 'Has AWS Account ID %',
  percentage(count(awsRegion), count(*)) as 'Has AWS Region %',
  percentage(count(`instrumentation.provider`), count(*)) as 'Has Instrumentation Provider %',
  percentage(count(providerAccountId), count(*)) as 'Has Provider Account ID %'
FROM AwsMskClusterSample
SINCE 1 hour ago
```

**Pass Criteria:** All percentages must be 100%
**Impact if Failed:** Clusters won't appear in UI

### Test 1.2: Verify Entity Type Format

```sql
-- CRITICAL: Verify entity types are AWS_KAFKA_* format
FROM Metric
SELECT uniques(entity.type) as 'Entity Types', count(*)
WHERE entity.type LIKE '%KAFKA%'
FACET entity.type
SINCE 1 hour ago
```

**Pass Criteria:** Must show AWS_KAFKA_CLUSTER, AWS_KAFKA_BROKER, AWS_KAFKA_TOPIC (NOT just KAFKA_*)
**Impact if Failed:** Entities won't be recognized as AWS MSK

### Test 1.3: Verify Dimensional Metrics Exist

```sql
-- CRITICAL: Check dimensional metrics transformation
FROM Metric 
SELECT count(*) as 'Dimensional Metrics Count', uniques(metricName) as 'Unique Metrics'
WHERE metricName LIKE 'kafka.%' 
  AND entity.type IN ('AWS_KAFKA_CLUSTER', 'AWS_KAFKA_BROKER', 'AWS_KAFKA_TOPIC')
SINCE 5 minutes ago
```

**Pass Criteria:** Count > 0, should see metrics like kafka.broker.BytesInPerSec
**Impact if Failed:** No metrics will be available for querying

---

## 2. BASIC DATA AVAILABILITY TESTS (Priority: P0)

### Test 2.1: Verify Event Samples Exist

```sql
-- Check all event types exist
SELECT 
  filter(count(*), WHERE eventType() = 'AwsMskClusterSample') as 'Cluster Samples',
  filter(count(*), WHERE eventType() = 'AwsMskBrokerSample') as 'Broker Samples',
  filter(count(*), WHERE eventType() = 'AwsMskTopicSample') as 'Topic Samples'
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
SINCE 1 hour ago
```

**Pass Criteria:** All counts > 0
**Impact if Failed:** No data available for that entity type

### Test 2.2: Check Data Freshness

```sql
-- Verify data is recent
SELECT 
  max(timestamp) as 'Latest Data',
  (now() - max(timestamp))/1000/60 as 'Minutes Since Update'
FROM AwsMskClusterSample
SINCE 1 hour ago
```

**Pass Criteria:** Minutes Since Update < 10
**Impact if Failed:** Stale or no recent data

### Test 2.3: Verify Metric Streams Data (if enabled)

```sql
-- Check AWS Metric Streams integration
SELECT count(*) as 'Metric Streams Events'
FROM Metric 
WHERE metricName LIKE 'aws.kafka%' 
SINCE 1 hour ago
```

**Pass Criteria:** Count > 0 if Metric Streams is enabled
**Impact if Failed:** No CloudWatch metrics integration

---

## 3. METRIC COMPLETENESS TESTS (Priority: P1)

### Test 3.1: Verify Cluster Metrics

```sql
-- Check all required cluster metrics
SELECT 
  count(provider.activeControllerCount.Sum) as 'Active Controller Metric',
  count(provider.offlinePartitionsCount.Sum) as 'Offline Partitions Metric',
  count(provider.globalPartitionCount.Average) as 'Global Partition Count'
FROM AwsMskClusterSample 
SINCE 1 hour ago
```

**Pass Criteria:** All counts > 0
**Impact if Failed:** Missing critical health metrics

### Test 3.2: Verify Broker Metrics

```sql
-- Check all required broker metrics
SELECT 
  percentage(count(provider.bytesInPerSec.Average), count(*)) as 'Has Bytes In %',
  percentage(count(provider.bytesOutPerSec.Average), count(*)) as 'Has Bytes Out %',
  percentage(count(provider.messagesInPerSec.Average), count(*)) as 'Has Messages In %',
  percentage(count(provider.underReplicatedPartitions.Sum), count(*)) as 'Has Under Replicated %'
FROM AwsMskBrokerSample 
SINCE 1 hour ago
```

**Pass Criteria:** All percentages > 90%
**Impact if Failed:** Missing throughput or health metrics

### Test 3.3: Verify Topic Metrics

```sql
-- Check topic-level metrics
SELECT 
  percentage(count(provider.bytesInPerSec.Sum), count(*)) as 'Has Topic Bytes In %',
  percentage(count(provider.bytesOutPerSec.Sum), count(*)) as 'Has Topic Bytes Out %',
  uniqueCount(displayName) as 'Total Topics'
FROM AwsMskTopicSample 
SINCE 1 hour ago
```

**Pass Criteria:** Percentages > 90%, Total Topics > 0
**Impact if Failed:** No topic-level monitoring

---

## 4. ENTITY ATTRIBUTE TESTS (Priority: P1)

### Test 4.1: Verify Cluster Attributes

```sql
-- Check required cluster attributes
SELECT 
  percentage(count(provider.clusterName), count(*)) as 'Has Cluster Name %',
  percentage(count(entity.guid), count(*)) as 'Has Entity GUID %',
  percentage(count(entityName), count(*)) as 'Has Entity Name %',
  uniques(provider.clusterName) as 'Cluster Names'
FROM AwsMskClusterSample 
SINCE 1 hour ago
```

**Pass Criteria:** All percentages = 100%
**Impact if Failed:** Can't identify or filter clusters

### Test 4.2: Verify Broker Attributes

```sql
-- Check broker identification
SELECT 
  provider.clusterName,
  count(distinct provider.brokerId) as 'Broker Count',
  count(*) as 'Sample Count'
FROM AwsMskBrokerSample
FACET provider.clusterName
SINCE 1 hour ago
```

**Pass Criteria:** Broker Count > 0 for each cluster
**Impact if Failed:** Can't identify individual brokers

---

## 5. FEATURE FUNCTIONALITY TESTS (Priority: P1)

### Test 5.1: Home Page Aggregation

```sql
-- Verify account-level aggregation works
SELECT 
  nr.linkedAccountName as 'Account',
  uniqueCount(entity.guid) as 'Clusters',
  filter(uniqueCount(entity.guid), WHERE provider.offlinePartitionsCount.Sum > 0) as 'Unhealthy'
FROM AwsMskClusterSample
FACET nr.linkedAccountName
SINCE 1 hour ago
```

**Pass Criteria:** Returns data grouped by account
**Impact if Failed:** Home page won't show data

### Test 5.2: Summary Page Metrics

```sql
-- Test summary calculations
SELECT 
  uniqueCount(entity.guid) as 'Total Clusters',
  sum(provider.globalPartitionCount.Average) as 'Total Partitions',
  filter(uniqueCount(entity.guid), WHERE provider.offlinePartitionsCount.Sum > 0) as 'Unhealthy Clusters'
FROM AwsMskClusterSample 
SINCE 1 hour ago
```

**Pass Criteria:** All values > 0
**Impact if Failed:** Summary page metrics incorrect

### Test 5.3: Time Series Data

```sql
-- Verify time series for charts
SELECT sum(provider.bytesInPerSec.Average) as 'Throughput'
FROM AwsMskBrokerSample
TIMESERIES 5 minutes
SINCE 1 hour ago
```

**Pass Criteria:** Returns time series data points
**Impact if Failed:** Charts won't render

---

## 6. DATA QUALITY TESTS (Priority: P2)

### Test 6.1: Check for Null Values

```sql
-- Identify clusters with missing critical metrics
SELECT provider.clusterName,
  CASE 
    WHEN provider.activeControllerCount.Sum IS NULL THEN 'Missing Controller'
    WHEN provider.activeControllerCount.Sum = 0 THEN 'No Active Controller'
    ELSE 'OK'
  END as 'Status'
FROM AwsMskClusterSample 
WHERE provider.activeControllerCount.Sum IS NULL 
   OR provider.activeControllerCount.Sum = 0
SINCE 1 hour ago
```

**Pass Criteria:** No results or only expected cases
**Impact if Failed:** Incomplete health monitoring

### Test 6.2: Verify Metric Value Ranges

```sql
-- Check for suspicious metric values
SELECT 
  metricName,
  min(value) as 'Min',
  max(value) as 'Max',
  CASE 
    WHEN min(value) < 0 THEN 'FAIL: Negative Values'
    WHEN max(value) > 1e12 THEN 'WARN: Very Large Values'
    WHEN max(value) = 0 THEN 'INFO: All Zeros'
    ELSE 'PASS'
  END as 'Status'
FROM Metric
WHERE metricName LIKE 'kafka.%'
FACET metricName
SINCE 1 hour ago
```

**Pass Criteria:** No FAIL status
**Impact if Failed:** Incorrect metric values

---

## 7. ENTITY RELATIONSHIP TESTS (Priority: P2)

### Test 7.1: Check APM Relationships

```sql
-- Look for producer/consumer relationships
SELECT 
  count(*) as 'Relationship Count',
  uniques(relationships.type) as 'Relationship Types'
FROM AwsMskTopicSample, Relationship
WHERE entity.guid = relationships.source.entity.guid 
   OR entity.guid = relationships.target.entity.guid
SINCE 1 hour ago
```

**Pass Criteria:** Count > 0 if APM agents are configured
**Impact if Failed:** No application topology visibility

---

## 8. PERFORMANCE TESTS (Priority: P3)

### Test 8.1: Query Performance

```sql
-- Test complex aggregation performance
SELECT count(*) as 'Result Count',
       beginTimeSeconds,
       endTimeSeconds,
       (endTimeSeconds - beginTimeSeconds) * 1000 as 'Duration MS'
FROM (
  SELECT latest(`provider.bytesInPerSec.Sum`) as bytes
  FROM AwsMskTopicSample
  FACET displayName
  LIMIT MAX
)
```

**Pass Criteria:** Duration MS < 5000
**Impact if Failed:** Poor UI performance

### Test 8.2: Large Dataset Handling

```sql
-- Check topic count for scale
SELECT 
  provider.clusterName,
  uniqueCount(displayName) as 'Topic Count'
FROM AwsMskTopicSample
FACET provider.clusterName
SINCE 1 hour ago
ORDER BY uniqueCount(displayName) DESC
```

**Pass Criteria:** Query completes successfully
**Impact if Failed:** Issues with large clusters

---

## 9. CRITICAL GAP VALIDATION (Priority: P0)

### Test 9.1: Verify GUID Consistency

```sql
-- Check for GUID stability
SELECT 
  provider.clusterName,
  provider.brokerId,
  uniqueCount(entity.guid) as 'GUID Count'
FROM AwsMskBrokerSample
FACET provider.clusterName, provider.brokerId
HAVING uniqueCount(entity.guid) > 1
SINCE 1 hour ago
```

**Pass Criteria:** No results (each broker has one GUID)
**Impact if Failed:** Entity tracking issues

### Test 9.2: Verify Automatic Query Mapping

```sql
-- Test event sample to dimensional metric mapping
-- Query 1: Direct event query (may return 0)
SELECT count(*) as 'Event Count' FROM AwsMskBrokerSample SINCE 5 minutes ago
```

```sql
-- Query 2: Metric aggregation (should work via dimensional metrics)
SELECT average(provider.bytesInPerSec.Average) as 'Avg Bytes In'
FROM AwsMskBrokerSample 
SINCE 5 minutes ago
```

**Pass Criteria:** Query 2 returns data even if Query 1 returns 0
**Impact if Failed:** Queries won't work as expected

---

## 10. COMPREHENSIVE HEALTH CHECK

### Test 10.1: Master Validation Query

```sql
-- Complete system health check
WITH 
  ui_ready AS (
    SELECT 
      percentage(count(provider), count(*)) = 100 
      AND percentage(count(awsAccountId), count(*)) = 100 as ready
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
  ui_ready.ready as 'UI Fields Ready',
  metrics_ready.ready as 'Dimensional Metrics Ready',
  fresh_data.ready as 'Data is Fresh',
  CASE 
    WHEN ui_ready.ready AND metrics_ready.ready AND fresh_data.ready THEN 'PASS: System Ready'
    ELSE 'FAIL: Check individual components'
  END as 'Overall Status'
FROM ui_ready, metrics_ready, fresh_data
```

**Pass Criteria:** Overall Status = "PASS: System Ready"

---

## Test Execution Checklist

- [ ] Run all P0 (Critical) tests first
- [ ] Document any failures with exact error messages
- [ ] If P0 tests fail, do not proceed to other tests
- [ ] Run P1 tests to verify functionality
- [ ] Run P2/P3 tests for completeness
- [ ] Save test results with timestamps
- [ ] Compare results across environments

## Troubleshooting Guide

### If Critical UI Tests Fail:
1. Check integration configuration for proper AWS field mapping
2. Verify dimensional metrics are enabled (MSK_USE_DIMENSIONAL=true)
3. Check integration version supports AWS MSK

### If Data Availability Tests Fail:
1. Verify AWS MSK integration is running
2. Check network connectivity to brokers
3. Verify JMX is enabled and accessible
4. Check integration logs for errors

### If Metric Completeness Tests Fail:
1. Verify MSK Enhanced Monitoring is enabled
2. Check topic-level metrics are enabled
3. Verify proper IAM permissions

### If Relationship Tests Fail:
1. Ensure APM agents are configured on Kafka clients
2. Verify distributed tracing is enabled
3. Check entity synthesis settings

## Success Criteria Summary

**Minimum for Production:**
- All P0 tests PASS
- All P1 tests PASS with >90% success rate
- Data freshness < 10 minutes
- No FAIL status in data quality tests

**Optimal State:**
- All tests PASS
- Data freshness < 5 minutes
- Relationships detected with APM
- Query performance < 2 seconds