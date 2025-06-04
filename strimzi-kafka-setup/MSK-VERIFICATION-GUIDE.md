# MSK Data Verification Guide

This guide provides multiple ways to verify that MSK-transformed data is appearing in New Relic NRDB.

## Prerequisites

Set your New Relic User API Key:
```bash
export UKEY=NRAK-XXXXXXXXXXXXXXXXXXXXXXXXX
export ACC=3630072  # Your account ID (optional, defaults to 3630072)
```

## Verification Scripts

### 1. Quick Check (Shell Script)
Fast command-line check for MSK entities:

```bash
./quick-msk-check.sh
```

**What it checks:**
- Entity counts for last hour
- Recent data (last 5 minutes)  
- Cluster health metrics
- Sample entity GUID format

### 2. Complete MSK Verification (Node.js)
Comprehensive verification with detailed results:

```bash
node verify-msk-entities-complete.js
```

**What it checks:**
- All MSK entity types (Cluster, Broker, Topic)
- Cluster health metrics
- Broker performance metrics
- Latency metrics
- Entity GUID validation
- Available metric names
- Saves results to timestamped JSON file

### 3. Test Suite Verification (DashBuilder)
Run from DashBuilder directory with test suite format:

```bash
cd ../DashBuilder-main
node verify-strimzi-msk-data.js
```

**Features:**
- Organized test suites
- Pass/fail status for each test
- Expected vs actual validation
- Summary report with success rate

### 4. Kafka vs MSK Comparison
Compare standard Kafka entities with MSK entities:

```bash
node compare-kafka-msk-data.js
```

**What it compares:**
- Entity counts (Kafka vs MSK)
- Metric values comparison
- Entity attributes
- Data freshness

## Manual NRQL Queries

You can also run these queries directly in New Relic Query Builder:

### Check Entity Existence
```sql
-- Count of each entity type
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
SELECT count(*) WHERE provider.clusterName = 'strimzi-production-kafka'
```

### Cluster Health
```sql
FROM AwsMskClusterSample
SELECT latest(provider.activeControllerCount.Sum) as 'Controllers',
       latest(provider.underReplicatedPartitions.Sum) as 'Under-replicated',
       latest(provider.offlinePartitionsCount.Sum) as 'Offline'
WHERE provider.clusterName = 'strimzi-production-kafka'
```

### Broker Metrics
```sql
FROM AwsMskBrokerSample
SELECT average(provider.bytesInPerSec.Average) as 'Bytes In',
       average(provider.cpuUser.Average) as 'CPU %',
       average(provider.kafkaDataLogsDiskUsed.Average) as 'Disk %'
WHERE provider.clusterName = 'strimzi-production-kafka'
FACET provider.brokerId
```

### Latency Metrics
```sql
FROM AwsMskBrokerSample
SELECT average(provider.fetchConsumerTotalTimeMsMean.Average) as 'Fetch Latency',
       average(provider.produceTotalTimeMsMean.Average) as 'Produce Latency'
WHERE provider.clusterName = 'strimzi-production-kafka'
```

### Entity GUIDs
```sql
FROM AwsMskBrokerSample 
SELECT uniques(entity.guid) 
WHERE provider.clusterName = 'strimzi-production-kafka' 
SINCE 1 hour ago
```

## Expected Results

### ✅ Success Indicators

1. **Entity Counts**
   - AwsMskClusterSample: > 0 samples
   - AwsMskBrokerSample: > 0 samples (should see 3 brokers)
   - AwsMskTopicSample: > 0 samples (if topics exist)

2. **Entity GUIDs Format**
   - Cluster: `123456789012|INFRA|AWSMSKCLUSTER|<base64>`
   - Broker: `123456789012|INFRA|AWSMSKBROKER|<base64>`
   - Topic: `123456789012|INFRA|AWSMSKTOPIC|<base64>`

3. **Metrics Present**
   - `aws.msk.broker.*` metrics populated
   - `provider.*` attributes set correctly
   - Both standard and MSK entities exist

### ❌ Failure Indicators

1. **No MSK Entities**
   - Count queries return 0
   - Only KafkaBrokerSample entities exist

2. **Wrong GUID Format**
   - GUIDs don't start with account ID
   - Missing INFRA|AWSMSK* pattern

3. **Missing Metrics**
   - No `aws.msk.*` prefixed metrics
   - No `provider.*` attributes

## UI Navigation

Once data is verified:

1. Go to **New Relic One**
2. Navigate to **Message Queues & Streams**
3. Filter by:
   - Provider: AWS
   - Service: Kafka
4. Select cluster: `strimzi-production-kafka`

## Troubleshooting

### No Data Appearing

1. Check pod logs:
```bash
kubectl logs -l app=nri-kafka-msk-custom -n newrelic | grep -i "msk\|transform"
```

2. Verify MSK initialization:
```bash
kubectl logs -l app=nri-kafka-msk-custom -n newrelic | grep "Initializing MSK shim"
```

3. Check for errors:
```bash
kubectl logs -l app=nri-kafka-msk-custom -n newrelic | grep -i error
```

### Data in Wrong Format

1. Ensure using v3 image:
```bash
kubectl get deployment nri-kafka-msk-custom -n newrelic -o yaml | grep image:
```

2. Verify environment variables:
```bash
kubectl describe deployment nri-kafka-msk-custom -n newrelic | grep -A 20 "Environment:"
```

## Next Steps

After verification succeeds:

1. **Create Dashboards**: Use DashBuilder to create custom dashboards
2. **Set Alerts**: Configure alerts on MSK metrics
3. **Monitor**: Use AWS MSK UI in New Relic

## Support

- Check logs in `/Users/deepaksharma/syc/hackathon-bootstrap/strimzi-kafka-setup/`
- JSON results saved with timestamps for troubleshooting
- Re-run scripts after making changes to verify fixes