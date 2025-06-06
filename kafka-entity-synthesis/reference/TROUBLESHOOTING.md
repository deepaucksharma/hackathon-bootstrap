# Troubleshooting Guide

## Common Issues and Solutions

### 🚫 Entities Not Appearing in UI

#### Symptom
Events are in NRDB but entities don't appear in Message Queues UI.

#### Diagnosis
```bash
# Check if events arrived
FROM AwsMskClusterSample SELECT * SINCE 30 minutes ago

# But UI shows nothing
```

#### Solutions

1. **Wrong Collector Name**
   ```json
   // ❌ Wrong
   "collector.name": "cloudwatch-metric-streams"
   
   // ✅ Correct
   "collector.name": "cloud-integrations"
   ```

2. **Wrong Provider Value**
   ```json
   // ❌ Wrong
   "provider": "AwsMsk"
   
   // ✅ Correct (depends on type)
   "provider": "AwsMskCluster"  // for clusters
   "provider": "AwsMskBroker"   // for brokers
   "provider": "AwsMskTopic"    // for topics
   ```

3. **Missing Critical Fields**
   - Check `providerAccountId` is present and matches your NR account
   - Check `providerExternalId` is present (AWS account ID)
   - Check `instrumentation.provider = "aws"`

4. **Using Wrong Event Type**
   ```json
   // ❌ Wrong
   "eventType": "Metric"
   
   // ✅ Correct
   "eventType": "AwsMskClusterSample"
   ```

### ⏳ Entity Synthesis Delay

#### Symptom
Events exist but entities take too long to appear.

#### Solutions
1. **Normal delay**: Entity synthesis can take 2-5 minutes
2. **Check entity creation**:
   ```sql
   FROM entity 
   WHERE type IN ('AWS_KAFKA_CLUSTER', 'AWS_KAFKA_BROKER') 
   AND name LIKE '%your-cluster%'
   SINCE 1 hour ago
   ```

### 📊 Incomplete Metrics

#### Symptom
Some metrics missing in UI or showing as null.

#### Solutions
1. **Include all aggregations**:
   ```json
   // ❌ Wrong - single value
   "provider.bytesInPerSec": 1000000
   
   // ✅ Correct - all aggregations
   "provider.bytesInPerSec.Sum": 2000000,
   "provider.bytesInPerSec.Average": 1000000,
   "provider.bytesInPerSec.Maximum": 1500000,
   "provider.bytesInPerSec.Minimum": 500000,
   "provider.bytesInPerSec.SampleCount": 2
   ```

2. **Use provider namespace**:
   ```json
   // ❌ Wrong
   "bytesInPerSec.Average": 1000000
   
   // ✅ Correct
   "provider.bytesInPerSec.Average": 1000000
   ```

### 🔍 Validation Failures

#### UI Query Validation Fails
```bash
node src/validate-ui.js --detailed
# Shows: ❌ Cluster List Query
```

**Solution**: Check that events have all required fields:
```sql
FROM AwsMskClusterSample 
SELECT keyset() 
WHERE entityName = 'your-cluster'
LIMIT 1
```

Compare with working account samples in `reference/working-account-samples/`.

### 🚨 Common Mistakes

1. **Sending to Metric API instead of Event API**
   - Use Event API: `insights-collector.newrelic.com`
   - NOT Metric API: `metric-api.newrelic.com`

2. **Missing AWS Account Fields**
   ```json
   // Need ALL of these:
   "awsAccountId": "123456789012",
   "awsRegion": "us-east-1", 
   "providerExternalId": "123456789012"  // Same as awsAccountId
   ```

3. **Incorrect Entity Naming**
   ```json
   // Broker name format: {brokerId}:{clusterName}
   "entityName": "1:my-cluster"  // ✅ Correct
   "entityName": "broker-1"      // ❌ Wrong
   ```

### 📝 Debug Checklist

1. **Events arriving?**
   ```sql
   FROM AwsMskClusterSample SELECT count(*) SINCE 30 minutes ago
   ```

2. **Correct collector?**
   ```sql
   FROM AwsMskBrokerSample 
   SELECT uniques(collector.name) 
   SINCE 30 minutes ago
   -- Should show: ["cloud-integrations"]
   ```

3. **Provider values correct?**
   ```sql
   FROM AwsMskBrokerSample 
   SELECT uniques(provider) 
   SINCE 30 minutes ago
   -- Should show: ["AwsMskBroker"]
   ```

4. **Critical fields present?**
   ```sql
   FROM AwsMskBrokerSample
   SELECT 
     percentage(count(*), WHERE providerAccountId IS NOT NULL) as 'hasAccountId',
     percentage(count(*), WHERE providerExternalId IS NOT NULL) as 'hasExternalId',
     percentage(count(*), WHERE collector.name = 'cloud-integrations') as 'correctCollector'
   SINCE 30 minutes ago
   -- All should be 100%
   ```

### 🆘 Still Not Working?

1. **Compare with working sample**:
   - Check `reference/working-account-samples/` 
   - Compare field by field

2. **Run full validation**:
   ```bash
   node src/validate-ui.js --detailed > validation.log
   ```

3. **Check account mapping**:
   - Ensure `providerAccountId` matches your New Relic account ID
   - Ensure `providerExternalId` is a valid AWS account ID format (12 digits)

4. **Try minimal test**:
   ```bash
   # Send just one cluster
   node src/send-events.js --brokers 1 --topics 1
   ```

### 💡 Pro Tips

1. **Always wait 5 minutes** before declaring failure
2. **Use --detailed flag** for validation to see more info
3. **Check working samples** when in doubt
4. **Save your cluster name** for easier debugging:
   ```bash
   node src/send-events.js --cluster-name debug-test-123
   ```