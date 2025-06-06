# Critical Patterns from Working MSK Accounts

## 🔑 Key Differences Between Working and Non-Working Accounts

### Working Accounts (1, 3026020) Use:
1. **collector.name**: `"cloud-integrations"` (NOT "cloudwatch-metric-streams")
2. **provider**: 
   - Cluster: `"AwsMskCluster"`
   - Broker: `"AwsMskBroker"`
   - Topic: `"AwsMskTopic"`
3. **instrumentation.provider**: `"aws"`
4. **collector.version**: `"release-1973"`

### Critical Fields Present in Working Accounts:

#### For AwsMskClusterSample:
```json
{
  "timestamp": 1749177600000,
  "entityName": "autodiscover-msk-cluster-auth-bob",
  "entityGuid": "MXxJTkZSQXxOQXw0OTMyMDg4ODM2MDk5MDg4NTUx",
  "entityId": "4932088836099088551",
  
  // CRITICAL: Provider fields
  "provider": "AwsMskCluster",
  "providerAccountId": "1",
  "providerAccountName": "Ducksboard", 
  "providerExternalId": "463657938898",  // AWS Account ID
  
  // CRITICAL: Collector info
  "collector.name": "cloud-integrations",
  "collector.version": "release-1973",
  "instrumentation.provider": "aws",
  
  // AWS fields
  "awsAccountId": "463657938898",
  "awsRegion": "us-east-1",
  
  // Data source
  "dataSourceId": "299257",
  "dataSourceName": "Managed Kafka",
  
  // Display
  "displayName": "autodiscover-msk-cluster-auth-bob",
  
  // Metrics in provider.* namespace
  "provider.globalTopicCount.Average": 1,
  "provider.globalPartitionCount.Maximum": 52,
  "provider.activeControllerCount.Average": 0.5,
  "provider.offlinePartitionsCount.Average": 0,
  "provider.clusterName": "autodiscover-msk-cluster-auth-bob",
  "provider.awsRegion": "us-east-1"
}
```

#### For AwsMskBrokerSample:
```json
{
  "timestamp": 1749177600000,
  "entityName": "3:pchawla-test",
  "entityGuid": "MXxJTkZSQXxOQXwyMTg1NzM5MDUxMzUwNTY2NTQ1",
  
  // CRITICAL: Provider value different!
  "provider": "AwsMskBroker",  // NOT "AwsMsk"
  "providerAccountId": "1",
  "providerAccountName": "Ducksboard",
  "providerExternalId": "463657938898",
  
  // Same collector pattern
  "collector.name": "cloud-integrations",
  "instrumentation.provider": "aws",
  
  // All metrics in provider.* namespace with .Sum, .Average, etc.
  "provider.bytesInPerSec.Sum": 0,
  "provider.bytesInPerSec.Average": 0,
  "provider.bytesInPerSec.Maximum": 0,
  "provider.bytesInPerSec.Minimum": 0,
  "provider.bytesInPerSec.SampleCount": 2,
  
  // Broker identifier
  "provider.brokerId": "3",
  "provider.clusterName": "pchawla-test"
}
```

## 🚨 Major Discovery: CloudWatch Integration vs Metric Streams

The working accounts are using **AWS Cloud Integrations** (polling), NOT CloudWatch Metric Streams!

### Evidence:
1. `collector.name: "cloud-integrations"` (not "cloudwatch-metric-streams")
2. `collector.version: "release-1973"`
3. Metrics have aggregated values (.Sum, .Average, .Maximum, .Minimum, .SampleCount)
4. `dataSourceId` and `dataSourceName` fields present

### This Explains Why Our Approach Wasn't Working:
- We were trying to emulate CloudWatch Metric Streams format
- But the UI expects Cloud Integrations format
- Different collector.name means different processing pipeline

## 📝 Correct Payload Format for UI Visibility

Based on the working accounts, here's what we need:

### 1. Event Types (NOT Metric type):
- `AwsMskClusterSample`
- `AwsMskBrokerSample` 
- `AwsMskTopicSample`

### 2. Required Fields:
```javascript
{
  // Identity
  "entityName": "cluster-name",
  "entityGuid": "base64-encoded-guid",
  "entityId": "numeric-id",
  
  // Provider - CRITICAL!
  "provider": "AwsMskCluster|AwsMskBroker|AwsMskTopic",
  "providerAccountId": "new-relic-account-id",
  "providerAccountName": "account-name",
  "providerExternalId": "aws-account-id",
  
  // Collector
  "collector.name": "cloud-integrations",
  "instrumentation.provider": "aws",
  
  // AWS
  "awsAccountId": "12-digit-aws-account",
  "awsRegion": "us-east-1",
  
  // Metrics in provider.* namespace with aggregations
  "provider.metricName.Sum": value,
  "provider.metricName.Average": value,
  "provider.metricName.Maximum": value,
  "provider.metricName.Minimum": value,
  "provider.metricName.SampleCount": count
}
```

## 🎯 Action Items

1. **Stop using Metric event type** - Use AwsMsk*Sample event types
2. **Change collector.name** to "cloud-integrations"
3. **Use correct provider values**: AwsMskCluster, AwsMskBroker, AwsMskTopic
4. **Include all aggregation types** for each metric
5. **Add dataSourceId/dataSourceName** if possible

## 🔄 Next Steps

1. Create new payload sender that mimics cloud-integrations format
2. Send events (not metrics) to Event API
3. Use the exact field structure from working accounts
4. Test with proper event types and collector name