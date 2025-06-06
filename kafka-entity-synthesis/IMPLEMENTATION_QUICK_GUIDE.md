# MSK Entity Synthesis Implementation Guide

## Critical Discoveries from Testing

Based on extensive testing with the Entity Synthesis & Verification Platform, here are the validated requirements:

### 1. Collector Identity (CRITICAL)
```json
{
  "collector.name": "cloudwatch-metric-streams",  // Working accounts use this
  // Alternative: "cloud-integrations" also works
}
```

### 2. Provider Format (CRITICAL)
```json
{
  "provider": "AwsMsk",  // Generic provider for ALL entity types
  // NOT "AwsMskBroker", "AwsMskCluster", or "AwsMskTopic"
}
```

### 3. Required Fields for Entity Synthesis
```json
{
  "eventType": "AwsMskBrokerSample",  // Must match entity type
  "entityName": "my-cluster-broker-1",
  "entityGuid": "base64-encoded-guid",
  "provider": "AwsMsk",
  "collector.name": "cloudwatch-metric-streams",
  "timestamp": 1234567890000
}
```

### 4. AWS Context Fields
```json
{
  "provider.accountId": "123456789012",
  "provider.region": "us-east-1",
  "provider.clusterName": "my-cluster",
  "provider.brokerId": "1",  // For brokers
  "aws.Namespace": "AWS/Kafka"
}
```

### 5. Metric Aggregations (All 5 Required)
```json
{
  "provider.bytesInPerSec.Average": 1000000,
  "provider.bytesInPerSec.Sum": 60000000,
  "provider.bytesInPerSec.Minimum": 500000,
  "provider.bytesInPerSec.Maximum": 1500000,
  "provider.bytesInPerSec.SampleCount": 60
}
```

## Implementation in nri-kafka

### Update dimensional_transformer.go:
```go
func (t *DimensionalTransformer) buildCommonAttributes() map[string]interface{} {
    return map[string]interface{}{
        "collector.name": "cloudwatch-metric-streams",
        "provider": "AwsMsk",  // Generic, not specific
        "instrumentation.name": "com.newrelic.kafka",
        "instrumentation.source": "msk-shim",
        "aws.Namespace": "AWS/Kafka",
    }
}
```

### Update simple_transformer.go:
```go
func (t *SimpleTransformer) Transform(sample types.KafkaSample) (map[string]interface{}, error) {
    event := map[string]interface{}{
        "eventType": t.getEventType(sample.EntityType),
        "entityName": sample.EntityName,
        "entityGuid": t.generateGUID(sample),
        "provider": "AwsMsk",  // Always use generic
        "collector.name": "cloudwatch-metric-streams",
        // ... rest of fields
    }
}
```

## Verification Steps

1. Build custom nri-kafka with MSK shim enabled
2. Replace nri-kafka in infrastructure bundle
3. Configure kafka-config.yml with MSK settings
4. Run the platform's verification:
   ```bash
   node 1-run-experiment.js experiment experiments/phase-1-baseline/02-golden-broker.yaml
   ```

## Key Learnings

- ❌ `collector.name: "nri-kafka"` - Entities created but NOT visible in UI
- ✅ `collector.name: "cloudwatch-metric-streams"` - Full UI visibility
- ❌ `provider: "AwsMskBroker"` - Too specific, doesn't match UI filters
- ✅ `provider: "AwsMsk"` - Generic provider works for all entity types

This guide is based on validated results from the ESVP testing framework.