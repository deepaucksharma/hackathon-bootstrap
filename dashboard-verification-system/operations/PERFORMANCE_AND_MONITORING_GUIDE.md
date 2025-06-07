# Performance Optimization & Monitoring Guide

This guide provides performance tuning and monitoring strategies based on codebase analysis and discovered patterns.

## Performance Baseline Metrics

### Expected Query Performance
Based on codebase patterns, these are expected query times:

| Query Type | Expected Time | Max Acceptable | Data Volume |
|------------|--------------|----------------|-------------|
| Home page load | <2s | 5s | <50 accounts |
| Summary page | <1s | 3s | <20 clusters |
| Topic table | <500ms | 2s | <10k topics |
| Time series | <1s | 3s | 1hr, 5min buckets |
| Entity Navigator | <2s | 5s | <100 entities |

### Verification Query:
```sql
-- Test query performance
SELECT 
  beginTimeSeconds,
  endTimeSeconds,
  (endTimeSeconds - beginTimeSeconds) * 1000 as 'queryMs',
  count(*) as 'results'
FROM (
  SELECT *
  FROM AwsMskBrokerSample
  WHERE nr.accountId = YOUR_ACCOUNT
  FACET provider.clusterName, provider.brokerId
  LIMIT MAX
  SINCE 1 hour ago
)
```

## Integration Performance Tuning

### 1. Memory Optimization

Based on data volume, adjust integration memory:

```yaml
# For <10 clusters, <1k topics
env:
  JVM_OPTS: "-Xmx256m -Xms128m"
  
# For 10-50 clusters, 1k-10k topics  
env:
  JVM_OPTS: "-Xmx512m -Xms256m"
  
# For >50 clusters, >10k topics
env:
  JVM_OPTS: "-Xmx1024m -Xms512m"
```

Monitor memory usage:
```bash
ps aux | grep nri-kafka | awk '{print $4"%"}'
```

### 2. Collection Optimization

#### Reduce Collection Scope:
```yaml
env:
  # Exclude internal topics (saves ~20% processing)
  TOPIC_REGEX: "^(?!__consumer_offsets|__transaction_state).*"
  
  # Only active consumer groups
  CONSUMER_GROUP_REGEX: "^(app-|service-|consumer-).*"
  
  # Increase bucket size for large clusters
  TOPIC_BUCKET_SIZE: 20000  # Default: 10000
```

#### Optimize Collection Frequency:
```yaml
# Standard metrics every 60s
interval: 60s

# For large clusters, consider 120s
interval: 120s
```

### 3. Query Optimization Patterns

Based on codebase query patterns, optimize as follows:

#### Use Nested Queries for Aggregation:
```sql
-- GOOD: Nested query with LIMIT MAX
FROM (
  SELECT 
    sum(provider.bytesInPerSec.Average) as bytesIn
  FROM AwsMskBrokerSample
  FACET provider.clusterName, provider.brokerId
  LIMIT MAX
)
SELECT sum(bytesIn) as totalBytes

-- BAD: Direct aggregation (may hit limits)
SELECT sum(provider.bytesInPerSec.Average)
FROM AwsMskBrokerSample
```

#### Pre-filter Data:
```sql
-- GOOD: Filter early
FROM AwsMskTopicSample
WHERE provider.clusterName = 'production'
  AND provider.bytesInPerSec.Sum > 0
SELECT *

-- BAD: Filter after fetch
FROM AwsMskTopicSample
SELECT *
WHERE provider.clusterName = 'production'
```

## Monitoring the Monitor

### 1. Integration Health Dashboard

Create a dashboard with these queries:

#### Integration Status:
```sql
-- Integration process health
SELECT 
  latest(timestamp) as lastReport,
  (now() - latest(timestamp))/1000/60 as minutesSinceReport,
  uniqueCount(hostname) as hostCount
FROM SystemSample
WHERE processDisplayName = 'nri-kafka'
FACET hostname
SINCE 1 hour ago
```

#### Data Collection Rate:
```sql
-- Events per minute by type
SELECT rate(count(*), 1 minute) as 'Events/min'
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
FACET eventType()
TIMESERIES 5 minutes
SINCE 1 hour ago
```

#### Dimensional Metrics Health:
```sql
-- Dimensional metrics collection
SELECT 
  rate(count(*), 1 minute) as 'Metrics/min',
  uniqueCount(metricName) as 'Unique Metrics'
FROM Metric
WHERE metricName LIKE 'kafka.%'
TIMESERIES 5 minutes
SINCE 1 hour ago
```

### 2. Performance Monitoring

#### Query Performance Tracking:
```sql
-- Track slow queries
FROM NrdbQuery
SELECT 
  query,
  durationMs,
  resultCount
WHERE durationMs > 3000
  AND query LIKE '%kafka%'
SINCE 1 hour ago
```

#### UI Load Time Monitoring:
```javascript
// Add to UI pages for timing
const startTime = performance.now();
// ... page load ...
const loadTime = performance.now() - startTime;
console.log(`Page load time: ${loadTime}ms`);
```

### 3. Data Quality Monitoring

#### Field Completeness:
```sql
-- Monitor critical field presence
SELECT 
  eventType(),
  percentage(count(provider), count(*)) as 'Provider %',
  percentage(count(entity.guid), count(*)) as 'GUID %',
  percentage(count(awsAccountId), count(*)) as 'Account %'
FROM AwsMskClusterSample, AwsMskBrokerSample
FACET eventType()
SINCE 1 hour ago
```

#### Metric Value Monitoring:
```sql
-- Detect anomalous values
SELECT 
  provider.clusterName,
  average(provider.bytesInPerSec.Average) as avgBytes,
  max(provider.bytesInPerSec.Average) as maxBytes,
  stddev(provider.bytesInPerSec.Average) as stdDev
FROM AwsMskBrokerSample
FACET provider.clusterName
HAVING stdDev > avgBytes * 2  -- High variance
SINCE 1 hour ago
```

## Alert Configuration

### Critical Alerts

#### 1. Integration Failure:
```sql
-- No data from integration
SELECT count(*)
FROM AwsMskClusterSample
WHERE nr.accountId = YOUR_ACCOUNT
```
**Condition**: = 0 for 10 minutes
**Priority**: Critical

#### 2. Dimensional Metrics Loss:
```sql
FROM Metric
SELECT count(*)
WHERE metricName LIKE 'kafka.%'
  AND entity.type LIKE 'AWS_KAFKA_%'
```
**Condition**: = 0 for 5 minutes
**Priority**: Critical

#### 3. UI Field Degradation:
```sql
SELECT percentage(count(provider), count(*))
FROM AwsMskClusterSample
```
**Condition**: < 100 for 15 minutes
**Priority**: High

### Warning Alerts

#### 1. High Query Times:
```sql
FROM NrdbQuery
SELECT max(durationMs)
WHERE query LIKE '%AwsMsk%'
```
**Condition**: > 5000 for 5 minutes
**Priority**: Medium

#### 2. Data Staleness:
```sql
SELECT (now() - max(timestamp))/1000/60
FROM AwsMskClusterSample
WHERE provider.clusterName = 'production'
```
**Condition**: > 5 for 10 minutes
**Priority**: Medium

## Scaling Strategies

### For Growing Environments

#### 1. Multiple Integration Instances:
```yaml
# Cluster Group 1 (Region: us-east-1)
- name: nri-kafka-east
  env:
    CLUSTER_NAME: production-east
    # First 50 brokers
    
# Cluster Group 2 (Region: us-west-2)  
- name: nri-kafka-west
  env:
    CLUSTER_NAME: production-west
    # Next 50 brokers
```

#### 2. Topic Partitioning:
```yaml
# Integration 1: Critical topics
TOPIC_REGEX: "^(orders|payments|users).*"

# Integration 2: Analytics topics
TOPIC_REGEX: "^(analytics|metrics|logs).*"

# Integration 3: Everything else
TOPIC_REGEX: "^(?!(orders|payments|users|analytics|metrics|logs)).*"
```

### For Large Topic Counts (>10k)

1. **Use Topic Sampling**:
```yaml
env:
  TOPIC_MODE: REGEX
  TOPIC_REGEX: ".*"
  TOPIC_SAMPLE_SIZE: 1000  # Random sample
```

2. **Increase Limits**:
```yaml
env:
  TOPIC_BUCKET_SIZE: 50000
  REQUEST_TIMEOUT_MS: 120000
  METADATA_TIMEOUT_MS: 30000
```

3. **Consider Metric Streams**:
- For AWS MSK, enable CloudWatch Metric Streams
- Reduces load on JMX collection

## Performance Testing

### Load Test Your Configuration:

```bash
#!/bin/bash
# performance-test.sh

echo "Starting performance test..."

# Record start time
START=$(date +%s)

# Run integration once
sudo -E /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
  -verbose \
  -pretty \
  > /tmp/kafka-perf-test.json

# Record end time
END=$(date +%s)
DURATION=$((END - START))

# Analyze results
echo "Collection took: ${DURATION}s"
echo "Metrics collected: $(grep -c metricName /tmp/kafka-perf-test.json)"
echo "Entities found: $(grep -c entity.guid /tmp/kafka-perf-test.json)"

# Check for errors
if grep -q "error" /tmp/kafka-perf-test.json; then
  echo "ERRORS FOUND:"
  grep -A2 -B2 "error" /tmp/kafka-perf-test.json
fi
```

### Benchmark Queries:

```sql
-- Test home page aggregation performance
WITH timer AS (
  SELECT beginTimeSeconds, endTimeSeconds
  FROM (
    -- Your home page query here
    SELECT uniqueCount(entity.guid) as clusters
    FROM AwsMskClusterSample
    FACET nr.linkedAccountId
    LIMIT MAX
  )
)
SELECT 
  (endTimeSeconds - beginTimeSeconds) * 1000 as 'Query Time (ms)'
FROM timer
```

## Optimization Checklist

- [ ] Set appropriate JVM memory limits
- [ ] Configure topic/consumer group filters
- [ ] Enable dimensional metrics
- [ ] Set proper collection intervals
- [ ] Configure bucket sizes for scale
- [ ] Monitor integration health
- [ ] Set up critical alerts
- [ ] Test query performance
- [ ] Document scaling triggers
- [ ] Plan for growth

## Capacity Planning

### Metrics to Track:

1. **Integration Host Metrics**:
   - CPU usage of nri-kafka process
   - Memory usage trends
   - Network bandwidth to Kafka/New Relic

2. **Data Volume Metrics**:
   - Events per minute growth
   - Unique entity count trends
   - Topic count growth rate

3. **Query Performance Trends**:
   - Average query time by type
   - 95th percentile query times
   - Timeout frequency

### When to Scale:

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Integration CPU | >50% | >80% | Add instance |
| Integration Memory | >75% | >90% | Increase heap |
| Query Time | >3s | >5s | Optimize queries |
| Topic Count | >5k | >10k | Filter topics |
| Events/min | >10k | >20k | Increase interval |

## Advanced Monitoring

### Custom Metrics:

```yaml
# Add custom metrics to integration
env:
  CUSTOM_METRICS: |
    - query: "kafka.server:type=BrokerTopicMetrics,name=TotalFetchRequestsPerSec"
      metric_name: "broker.fetch.rate"
    - query: "kafka.server:type=BrokerTopicMetrics,name=TotalProduceRequestsPerSec"  
      metric_name: "broker.produce.rate"
```

### Distributed Tracing:

For APM correlation, ensure:
1. Kafka clients have APM agents
2. Distributed tracing enabled
3. Entity synthesis configured

This enables the relationship column in topic tables and shows producer/consumer applications.