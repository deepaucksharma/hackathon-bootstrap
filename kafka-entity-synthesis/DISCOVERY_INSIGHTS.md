# Discovery Insights: How We Solved Kafka UI Visibility

## 🔍 The Journey

### Initial Attempts (What Didn't Work)

1. **CloudWatch Metric Streams Format**
   - Sent metrics with `collector.name: "cloudwatch-metric-streams"`
   - Used Metric API with dimensional metrics
   - Result: Metrics arrived but no UI entities

2. **Standard Kafka Integration**
   - Tried KafkaBrokerSample, KafkaTopicSample
   - Used various provider values
   - Result: Events created but wrong entity types

3. **Custom Entity Synthesis**
   - Attempted to force entity creation
   - Used entity.type fields
   - Result: Partial success but inconsistent

### The Breakthrough

By analyzing working accounts (1, 3001033, 3026020), we discovered:

## 🎯 Key Discovery: Cloud Integrations Format

Working MSK entities use **AWS Cloud Integrations** (polling), not CloudWatch Metric Streams!

### Evidence from Working Accounts

```json
{
  "collector.name": "cloud-integrations",      // NOT "cloudwatch-metric-streams"
  "collector.version": "release-1973",
  "instrumentation.provider": "aws",
  "provider": "AwsMskCluster",                 // Specific provider values
  "providerAccountId": "1",
  "providerExternalId": "463657938898",       // AWS Account ID
  "dataSourceId": "299257",
  "dataSourceName": "Managed Kafka"
}
```

### Critical Differences

| Aspect | What We Tried | What Actually Works |
|--------|---------------|-------------------|
| API | Metric API | Event API |
| Event Type | Metric | AwsMsk*Sample |
| Collector | cloudwatch-metric-streams | cloud-integrations |
| Provider | AwsMsk | AwsMskCluster/Broker/Topic |
| Metrics | Simple values | Aggregated (.Sum, .Average, etc) |

## 📋 Required Event Structure

### 1. Event Types (NOT Metric)
- `AwsMskClusterSample`
- `AwsMskBrokerSample`
- `AwsMskTopicSample`

### 2. Critical Fields
```javascript
{
  // Identity
  "entityName": "cluster-name",
  "entityGuid": "base64-guid",
  "entityId": "numeric-id",
  
  // Provider - ALL REQUIRED
  "provider": "AwsMskCluster",         // Specific per type
  "providerAccountId": "nr-account",
  "providerAccountName": "name",
  "providerExternalId": "aws-account", // Critical!
  
  // Collector - MUST MATCH
  "collector.name": "cloud-integrations",
  "instrumentation.provider": "aws",
  
  // Metrics - WITH AGGREGATIONS
  "provider.metricName.Sum": value,
  "provider.metricName.Average": value,
  "provider.metricName.Maximum": value,
  "provider.metricName.Minimum": value,
  "provider.metricName.SampleCount": count
}
```

## 🔄 Why This Works

1. **UI Expects Cloud Integration Format**
   - Message Queues UI queries for specific collector.name
   - Looks for aggregated metrics (not raw values)
   - Requires exact provider values

2. **Entity Synthesis Rules**
   - Triggered by AwsMsk*Sample event types
   - Maps provider field to entity type
   - Uses providerExternalId for account mapping

3. **Query Pattern Match**
   ```sql
   -- UI runs queries like:
   FROM AwsMskClusterSample 
   WHERE providerAccountId IS NOT NULL
   AND collector.name = 'cloud-integrations'
   ```

## 💡 Lessons Learned

1. **Don't Assume CloudWatch Format**
   - Even though MSK uses CloudWatch, NR UI expects polling format
   - Historic reasons: Cloud integrations came first

2. **Provider Field Variations Matter**
   - AwsMskCluster ≠ AwsMsk
   - Each entity type has specific provider value

3. **Event Type Drives Processing**
   - AwsMsk*Sample triggers MSK pipeline
   - Metric type goes to different pipeline

4. **Account Mapping is Critical**
   - providerExternalId links to AWS account
   - providerAccountId must match NR account

## 🚀 The Solution

Send events (not metrics) in cloud integration format:
```bash
# What works
node src/send-events.js

# Creates events that:
# - Use Event API
# - Have collector.name = "cloud-integrations"
# - Include all required provider fields
# - Use aggregated metric format
```

## 📊 Validation

After sending, validate with:
```sql
-- Check events arrived
FROM AwsMskClusterSample SELECT * SINCE 30 minutes ago

-- Check critical fields
FROM AwsMskBrokerSample 
SELECT provider, collector.name, providerExternalId
WHERE provider = 'AwsMskBroker'

-- Check UI visibility
FROM MessageQueueSample
WHERE provider = 'AwsMsk'
```

## 🎯 Summary

The key to MSK UI visibility is mimicking AWS Cloud Integration format, not CloudWatch Metric Streams. This counterintuitive discovery explains why standard approaches failed and provides a reliable solution.