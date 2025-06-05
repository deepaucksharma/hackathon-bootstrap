# Production Troubleshooting Guide for Message Queues UI

This guide provides solutions to real-world issues based on codebase analysis and discovered edge cases.

## Quick Diagnosis Flowchart

```
┌─────────────────────────┐
│ Clusters not showing?   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Run: Master Verification│───── FAIL ──→ Check UI Fields (Section 1)
└───────────┬─────────────┘
            │ PASS
            ▼
┌─────────────────────────┐
│ Metrics showing as 0?   │───── YES ───→ Check Metrics (Section 2)
└───────────┬─────────────┘
            │ NO
            ▼
┌─────────────────────────┐
│ Data stale/missing?     │───── YES ───→ Check Freshness (Section 3)
└───────────┬─────────────┘
            │ NO
            ▼
┌─────────────────────────┐
│ UI errors/timeouts?     │───── YES ───→ Check Performance (Section 4)
└───────────┬─────────────┘
            │ NO
            ▼
        ✅ System OK
```

## Section 1: Clusters Not Appearing in UI

### Issue 1.1: No AWS MSK Clusters Visible

**Symptoms**: 
- Infrastructure > Third-party services shows no Kafka/MSK
- Home page table is empty
- Account shows in list but with 0 clusters

**Root Cause Verification**:
```sql
-- Check UI visibility fields
SELECT 
  count(*) as 'Total Samples',
  percentage(count(provider), count(*)) as 'Has Provider %',
  percentage(count(awsAccountId), count(*)) as 'Has AWS Account %',
  percentage(count(`instrumentation.provider`), count(*)) as 'Has Inst Provider %'
FROM AwsMskClusterSample
WHERE awsAccountId = 'YOUR_AWS_ACCOUNT'
SINCE 1 hour ago
```

**If any field < 100%**, the issue is missing UI fields.

**Solution**:
1. Check integration configuration:
```bash
sudo cat /etc/newrelic-infra/integrations.d/kafka-config.yml | grep -E "MSK_USE_DIMENSIONAL|labels"
```

2. Must see:
```yaml
env:
  MSK_USE_DIMENSIONAL: true
  NRI_KAFKA_USE_DIMENSIONAL: true
labels:
  provider: AwsMskCluster
  instrumentation.provider: aws
```

3. If missing, add these fields and restart:
```bash
sudo systemctl restart newrelic-infra
```

4. Verify fix worked (wait 2-3 minutes):
```sql
SELECT provider, awsAccountId, `instrumentation.provider`
FROM AwsMskClusterSample
WHERE awsAccountId = 'YOUR_AWS_ACCOUNT'
SINCE 5 minutes ago
LIMIT 1
```

### Issue 1.2: Entity Type Mismatch

**Symptoms**:
- Queries return data but UI still empty
- Entity types show as KAFKA_CLUSTER instead of AWS_KAFKA_CLUSTER

**Root Cause Verification**:
```sql
FROM Metric
SELECT uniques(entity.type) as 'Entity Types'
WHERE entity.type LIKE '%KAFKA%'
SINCE 1 hour ago
```

**If shows KAFKA_* instead of AWS_KAFKA_***, entity synthesis is wrong.

**Solution**:
1. Check integration version:
```bash
/var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka --version
```

2. Must be >= 3.2.0 for proper AWS MSK support

3. Upgrade if needed:
```bash
sudo apt-get update && sudo apt-get install --only-upgrade nri-kafka
```

## Section 2: Metrics Showing as 0 or -1

### Issue 2.1: Throughput Shows 0 B/s

**Symptoms**:
- Cluster appears but throughput shows "0 B/s"
- Message rate shows "0 msg/s"
- But cluster is actually active

**Root Cause Verification**:
```sql
-- Check raw metric values
SELECT 
  provider.brokerId,
  provider.bytesInPerSec.Average,
  provider.messagesInPerSec.Average,
  CASE 
    WHEN provider.bytesInPerSec.Average = -1 THEN 'ERROR_VALUE'
    WHEN provider.bytesInPerSec.Average IS NULL THEN 'NULL_VALUE'
    WHEN provider.bytesInPerSec.Average = 0 THEN 'ZERO_VALUE'
    ELSE 'HAS_DATA'
  END as 'Status'
FROM AwsMskBrokerSample
WHERE provider.clusterName = 'YOUR_CLUSTER'
SINCE 30 minutes ago
```

**If shows ERROR_VALUE or NULL_VALUE**, JMX collection is failing.

**Solution**:
1. Test JMX connectivity:
```bash
# Install JMX client
sudo apt-get install -y jmxterm

# Test each broker
echo "get -b kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec OneMinuteRate" | \
  java -jar jmxterm.jar -l b-1.cluster.kafka.region.amazonaws.com:9999
```

2. Common JMX issues:
   - **Connection refused**: JMX not enabled on broker
   - **Authentication failed**: JMX credentials wrong
   - **Timeout**: Security group blocking port 9999

3. Enable JMX on MSK:
   - MSK Console > Cluster > Configuration
   - Add: `jmx.port=9999`
   - Reboot brokers

### Issue 2.2: Confluent Cloud Metrics Not Divided by 60

**Symptoms**:
- Confluent Cloud throughput seems 60x too high
- Shows bytes/minute instead of bytes/second

**Root Cause**: UI expects per-second values but Confluent provides per-minute

**Verification**:
```sql
-- Check if division is happening
SELECT 
  cluster_name,
  `cluster_received_bytes` as 'Raw (per minute)',
  `cluster_received_bytes` / 60 as 'Per Second'
FROM ConfluentCloudClusterSample
SINCE 10 minutes ago
```

**Solution**: 
This is handled in the UI code (common/config/constants.ts:287-298). If not working:
1. Check integration version supports Confluent Cloud
2. Verify provider detection is working correctly

## Section 3: Stale or Missing Data

### Issue 3.1: Data Older Than 10 Minutes

**Symptoms**:
- UI shows "No data available" 
- Last update time > 10 minutes ago
- Verification shows stale data

**Root Cause Verification**:
```sql
-- Check data freshness for all entities
SELECT 
  eventType(),
  max(timestamp) as 'Last Update',
  (now() - max(timestamp))/1000/60 as 'Minutes Ago'
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
WHERE provider.clusterName = 'YOUR_CLUSTER'
FACET eventType()
SINCE 1 hour ago
```

**Common Causes & Solutions**:

1. **Integration stopped**:
```bash
# Check if running
sudo systemctl status newrelic-infra
ps aux | grep nri-kafka

# Check last execution
sudo journalctl -u newrelic-infra --since "10 minutes ago" | grep -i kafka
```

2. **Network connectivity lost**:
```bash
# Test Kafka connectivity
timeout 5 bash -c 'cat < /dev/null > /dev/tcp/broker-hostname/9092'
echo $?  # Should be 0

# Test New Relic API
curl -I https://api.newrelic.com
```

3. **Integration in error loop**:
```bash
# Look for repeated errors
sudo tail -f /var/log/newrelic-infra/newrelic-infra.log | grep -i "error\|fail\|timeout"
```

### Issue 3.2: Partial Data (Some Brokers Missing)

**Symptoms**:
- Only some brokers reporting
- Throughput seems too low
- Broker count doesn't match actual

**Verification**:
```sql
-- Compare expected vs actual brokers
SELECT 
  uniqueCount(provider.brokerId) as 'Reporting Brokers',
  uniques(provider.brokerId) as 'Broker IDs'
FROM AwsMskBrokerSample
WHERE provider.clusterName = 'YOUR_CLUSTER'
SINCE 30 minutes ago
```

**Solution**:
1. Check BROKERS configuration has all brokers:
```yaml
BROKERS: >-
  [
    {"host": "b-1.cluster", "port": 9999},
    {"host": "b-2.cluster", "port": 9999},
    {"host": "b-3.cluster", "port": 9999}
  ]
```

2. Verify each broker individually:
```bash
for i in 1 2 3; do
  echo "Testing broker $i"
  nc -zv b-$i.cluster.kafka.region.amazonaws.com 9999
done
```

## Section 4: UI Performance Issues

### Issue 4.1: Queries Timing Out

**Symptoms**:
- UI shows "Request timeout"
- Charts not loading
- Table data incomplete

**Root Cause**: Too much data for query limits

**Verification**:
```sql
-- Check data volume
SELECT 
  uniqueCount(displayName) as 'Total Topics',
  uniqueCount(provider.brokerId) as 'Total Brokers',
  count(*) as 'Total Data Points'
FROM AwsMskTopicSample, AwsMskBrokerSample
WHERE nr.accountId = YOUR_ACCOUNT
SINCE 1 hour ago
```

**If Topics > 10,000 or Data Points > 1,000,000**:

**Solution**:
1. Limit data collection in integration:
```yaml
env:
  TOPIC_MODE: LIST
  TOPIC_LIST: "important-topic-1,important-topic-2"
  # OR use regex
  TOPIC_REGEX: "^production-.*"
  CONSUMER_GROUP_REGEX: "^app-.*"
```

2. Increase query limits:
```yaml
env:
  TOPIC_BUCKET_SIZE: 20000  # Default is 10000
```

### Issue 4.2: Home Page Slow to Load

**Symptoms**:
- Home page takes >5 seconds to load
- Multiple accounts with many clusters

**Root Cause**: Complex aggregation queries

**Quick Fix - Add account filter**:
```javascript
// In browser console on Message Queues home page
nerdlet.setFilter({
  accountId: 'specific-account-id'
})
```

**Permanent Fix**: 
Contact New Relic support to optimize account query limits.

## Section 5: Data Calculation Issues

### Issue 5.1: Health Status Always Shows Healthy

**Symptoms**:
- Clusters with offline partitions show as healthy
- Under-replicated partitions not detected

**Verification**:
```sql
-- Check health metric values
SELECT 
  entityName,
  latest(provider.activeControllerCount.Sum) as 'Controllers',
  latest(provider.offlinePartitionsCount.Sum) as 'Offline',
  latest(provider.underReplicatedPartitions.Sum) as 'UnderRep'
FROM AwsMskClusterSample
WHERE provider.offlinePartitionsCount.Sum > 0 
   OR provider.underReplicatedPartitions.Sum > 0
SINCE 1 hour ago
```

**If shows partitions > 0 but UI shows healthy**:

**Root Cause**: Health calculation using wrong fields

**Solution**: 
1. Verify using correct provider fields
2. Check for field name changes in integration version
3. May need to update to latest integration

### Issue 5.2: Throughput Calculations Wrong

**Symptoms**:
- Account total doesn't match sum of clusters
- Cluster total doesn't match sum of brokers

**Verification**:
```sql
-- Verify aggregation math
FROM (
  SELECT 
    provider.clusterName,
    provider.brokerId,
    provider.bytesInPerSec.Average as brokerBytes
  FROM AwsMskBrokerSample
  WHERE nr.accountId = YOUR_ACCOUNT
  LIMIT MAX
)
SELECT 
  sum(brokerBytes) as 'Calculated Total',
  uniqueCount(provider.brokerId) as 'Broker Count'
```

**Solution**:
Aggregation requires proper LIMIT MAX in nested queries. Check integration sends all broker data.

## Section 6: Edge Cases

### Issue 6.1: Special Characters in Names

**Symptoms**:
- Topics with special characters don't appear
- Queries fail with syntax errors

**Test Query**:
```sql
SELECT displayName
FROM AwsMskTopicSample
WHERE displayName RLIKE '[^a-zA-Z0-9_.-]'
SINCE 1 hour ago
```

**Solution**:
Use quotes in queries for special characters:
```sql
WHERE displayName = 'my-topic@prod#1'
```

### Issue 6.2: __consumer_offsets Topic Issues

**Symptoms**:
- Internal topic affecting metrics
- Deviation calculations skewed

**Verification**:
```sql
SELECT 
  displayName,
  provider.bytesInPerSec.Sum
FROM AwsMskTopicSample
WHERE displayName = '__consumer_offsets'
SINCE 1 hour ago
```

**Note**: This is excluded by design in UI calculations (nerdlets/summary/index.tsx:211)

## Monitoring Integration Health

### Create These Alerts:

1. **Integration Stopped**:
```sql
SELECT count(*)
FROM SystemSample
WHERE processDisplayName = 'nri-kafka'
```
Alert when < 1 for 5 minutes

2. **Data Freshness**:
```sql
SELECT (now() - max(timestamp))/1000/60 as minutesSinceUpdate
FROM AwsMskClusterSample
```
Alert when > 10 minutes

3. **Dimensional Metrics Missing**:
```sql
FROM Metric SELECT count(*)
WHERE metricName LIKE 'kafka.%'
```
Alert when = 0 for 5 minutes

## Emergency Recovery Procedures

### Complete Integration Reset:
```bash
# 1. Stop integration
sudo systemctl stop newrelic-infra

# 2. Clear cache
sudo rm -rf /var/db/newrelic-infra/data/*

# 3. Validate configuration
sudo newrelic-infra-ctl validate-config

# 4. Test configuration
sudo NRI_KAFKA_USE_DIMENSIONAL=true /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka --pretty

# 5. Restart
sudo systemctl start newrelic-infra

# 6. Monitor logs
sudo journalctl -fu newrelic-infra
```

### Quick Verification:
```bash
# Wait 3-5 minutes then run
./verify-single-cluster.sh API_KEY NR_ACCOUNT CLUSTER_NAME
```

## Contact Support When

1. Integration version issues preventing upgrades
2. Account-level query limits causing timeouts  
3. Entity synthesis not creating correct types
4. Metric stream configuration questions
5. Performance issues with >100 clusters

Include output from:
- Master verification query
- Integration logs (last 1000 lines)
- Configuration file (sanitized)
- `nri-kafka --version` output