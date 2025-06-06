# MSK Metrics Iteration Plan

## Quick Start Checklist

### Iteration 1: Verify Baseline (2 hours)
**Goal**: Confirm CloudWatch emulator is sending metrics

- [ ] Deploy current implementation
- [ ] Check logs for "Emulating CloudWatch metrics" messages
- [ ] Run NRQL: `FROM Metric SELECT count(*) WHERE collector.name = 'cloudwatch-metric-streams' SINCE 10 minutes ago`
- [ ] Document what arrives in NRDB

### Iteration 2: Single Metric Test (4 hours)
**Goal**: Get ONE metric to create an entity

- [ ] Modify CloudWatch emulator to send only `BytesInPerSec`
- [ ] Ensure all required attributes are present
- [ ] Wait 5 minutes for entity synthesis
- [ ] Check for entity: `FROM entity WHERE type = 'AWS_KAFKA_BROKER'`
- [ ] If no entity, compare with working account metric

### Iteration 3: Match Working Account (1 day)
**Goal**: Make our metrics identical to working accounts

- [ ] Extract full metric from account 3001033:
```sql
FROM Metric 
SELECT * 
WHERE collector.name = 'cloudwatch-metric-streams' 
AND metricName = 'BytesInPerSec'
AND aws.accountId = '3001033'
LIMIT 1
```
- [ ] List ALL attributes from working metric
- [ ] Update CloudWatch emulator to match exactly
- [ ] Test again with matched format

### Iteration 4: Critical Metrics Bundle (4 hours)
**Goal**: Add minimum metrics for entity health

Add these metrics in order:
1. [ ] `ActiveControllerCount` (required for cluster)
2. [ ] `OfflinePartitionsCount` (health indicator)
3. [ ] `GlobalPartitionCount` (cluster metric)
4. [ ] `CpuUser` (resource metric)

Test after each addition.

### Iteration 5: Entity Name Experiments (2 hours)
**Goal**: Find correct entity name format

Test these formats:
- [ ] Simple: `test-cluster:broker-1`
- [ ] ARN: `arn:aws:kafka:us-east-1:123456789012:broker/test-cluster/xxx/1`
- [ ] Extract exact format from working account

### Iteration 6: Timing Alignment (2 hours)
**Goal**: Match CloudWatch timing patterns

- [ ] Align timestamps to minute boundaries
- [ ] Send all broker metrics together
- [ ] Test 1-minute vs 5-minute intervals
- [ ] Check if order matters

## Quick Test Scripts

### 1. Check CloudWatch Metrics
```bash
#!/bin/bash
# check-cloudwatch-metrics.sh

echo "Checking CloudWatch emulated metrics..."

# Check if metrics are arriving
NRQL="FROM Metric SELECT count(*), uniqueCount(metricName) WHERE collector.name = 'cloudwatch-metric-streams' AND aws.Namespace = 'AWS/Kafka' SINCE 10 minutes ago"

curl -X POST https://api.newrelic.com/graphql \
  -H "Content-Type: application/json" \
  -H "API-Key: $NEW_RELIC_API_KEY" \
  -d "{
    \"query\": \"{ actor { account(id: 3630072) { nrql(query: \\\"$NRQL\\\") { results } } } }\"
  }"
```

### 2. Toggle Single Metric Mode
```bash
#!/bin/bash
# toggle-single-metric.sh

# Enable single metric mode for testing
kubectl set env deployment/nri-kafka -n newrelic-monitoring \
  CLOUDWATCH_SINGLE_METRIC_MODE=true \
  CLOUDWATCH_TEST_METRIC=BytesInPerSec

# Restart to apply
kubectl rollout restart deployment/nri-kafka -n newrelic-monitoring
```

### 3. Compare with Working Account
```bash
#!/bin/bash
# compare-metrics.sh

# Our metric
echo "=== OUR METRIC ==="
nrql "FROM Metric SELECT * WHERE collector.name = 'cloudwatch-metric-streams' AND metricName = 'BytesInPerSec' AND aws.accountId = '123456789012' LIMIT 1"

echo -e "\n=== WORKING ACCOUNT METRIC ==="
# Working account metric
nrql "FROM Metric SELECT * WHERE collector.name = 'cloudwatch-metric-streams' AND metricName = 'BytesInPerSec' AND aws.accountId = '3001033' LIMIT 1"
```

## Debug Checklist

When metrics don't create entities:

1. **Check Required Fields**
   - [ ] `collector.name` = `cloudwatch-metric-streams` (exact match)
   - [ ] `eventType` = `Metric` (capital M)
   - [ ] `instrumentation.provider` = `cloudwatch`
   - [ ] `aws.Namespace` = `AWS/Kafka`
   - [ ] `entity.type` present and valid

2. **Verify AWS Fields**
   - [ ] `aws.accountId` is 12 digits
   - [ ] `aws.region` is valid AWS region
   - [ ] `aws.Dimensions` array is properly formatted
   - [ ] No spaces in dimension values

3. **Check Metric Values**
   - [ ] All values are valid numbers (not NaN or Inf)
   - [ ] Timestamps in milliseconds
   - [ ] No negative values for counters

4. **Entity Synthesis Timing**
   - [ ] Wait at least 5 minutes
   - [ ] Check for synthesis errors in logs
   - [ ] Verify no duplicate entities

## Success Metrics

Track progress with these queries:

```sql
-- 1. Metric Reception
FROM Metric 
SELECT count(*), uniqueCount(metricName), latest(timestamp)
WHERE collector.name = 'cloudwatch-metric-streams'
FACET aws.kafka.clusterName
SINCE 1 hour ago

-- 2. Entity Creation
FROM entity
SELECT count(*), latest(lastReportingChangeAt)
WHERE type LIKE '%KAFKA%'
AND tags.providerAccountId IS NOT NULL
FACET type
SINCE 1 hour ago

-- 3. UI Visibility Check
-- Go to: One.newrelic.com > APM & Services > Message Queues
-- Look for your cluster name

-- 4. Health Score
FROM Metric
SELECT 
  percentage(count(*), WHERE metricName IS NOT NULL) as 'Data Availability',
  uniqueCount(metricName) as 'Unique Metrics',
  latest(timestamp) as 'Last Update'
WHERE collector.name = 'cloudwatch-metric-streams'
AND aws.kafka.clusterName = 'hackathon-cluster'
SINCE 1 hour ago
```

## Emergency Rollback

If something goes wrong:

```bash
# Disable CloudWatch emulator
kubectl set env deployment/nri-kafka -n newrelic-monitoring \
  CLOUDWATCH_EMULATOR_ENABLED=false

# Or disable dimensional metrics entirely
kubectl set env deployment/nri-kafka -n newrelic-monitoring \
  MSK_USE_DIMENSIONAL=false

# Restart
kubectl rollout restart deployment/nri-kafka -n newrelic-monitoring
```

## Daily Progress Template

### Day X: [Date]

**Goal**: [Specific goal for today]

**Morning**:
- [ ] Check overnight metrics
- [ ] Review any errors in logs
- [ ] Plan today's test

**Tests Run**:
1. Test: [Description]
   - Result: [What happened]
   - Learning: [What we learned]

**NRQL Results**:
```sql
-- Paste key query results here
```

**End of Day**:
- Entities created: Yes/No
- UI visibility: Yes/No
- Next step: [What to try tomorrow]

## Key Learnings Log

### Learning #1: [Date]
**What we tried**: 
**Result**: 
**Why it matters**: 

### Learning #2: [Date]
**What we tried**: 
**Result**: 
**Why it matters**: 

(Continue adding learnings as we progress)