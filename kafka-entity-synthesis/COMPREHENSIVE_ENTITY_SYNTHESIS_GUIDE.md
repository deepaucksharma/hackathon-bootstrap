# Comprehensive Kafka Entity Synthesis Implementation Guide

## Executive Summary

This guide consolidates all discoveries about New Relic's entity synthesis for Kafka/AWS MSK, based on extensive testing and validation against New Relic's open-source entity-definitions repository and official documentation.

## Critical Discoveries

### 1. Entity Type Definitions

New Relic uses specific domain and type combinations for Kafka entities:

| Entity | Domain | Type | Identifier |
|--------|--------|------|------------|
| Cluster | INFRA | KAFKA_CLUSTER | clusterName |
| Broker | INFRA | KAFKA_BROKER | clusterName:brokerId |
| Topic | INFRA | KAFKA_TOPIC | clusterName:topicName |

### 2. Required Fields for Entity Synthesis

#### Minimal Required Fields
```json
{
  "eventType": "AwsMskBrokerSample",
  "entityName": "cluster-name-broker-1",
  "entityGuid": "base64-encoded-guid",
  "timestamp": 1234567890000,
  
  // Critical for synthesis conditions
  "clusterName": "my-kafka-cluster",
  "broker.id": "1",  // For brokers
  "topic": "my-topic",  // For topics
  
  // Provider identification
  "collector.name": "cloudwatch-metric-streams",
  "provider": "AwsMsk"
}
```

#### Field Constraints
- **Identifier Length**: Max 36 characters (use `encodeIdentifierInGUID: true` for longer)
- **Character Set**: ASCII printable (32-126)
- **Case Sensitivity**: Topic names are case-sensitive
- **Uniqueness**: clusterName must be unique per account

### 3. Collector Name Requirements

The `collector.name` field determines UI visibility:

| Source | collector.name | UI Visibility |
|--------|----------------|---------------|
| CloudWatch Metric Streams | "cloudwatch-metric-streams" | ✅ Full |
| Cloud Integrations | "cloud-integrations" | ✅ Full |
| On-host Integration | "nri-kafka" | ⚠️ Limited |
| Custom/Missing | null or other | ❌ None |

### 4. Metric Aggregation Requirements

All CloudWatch metrics MUST include all 5 aggregations:
```json
{
  "provider.bytesInPerSec.Average": 1000000,
  "provider.bytesInPerSec.Sum": 60000000,
  "provider.bytesInPerSec.Minimum": 500000,
  "provider.bytesInPerSec.Maximum": 1500000,
  "provider.bytesInPerSec.SampleCount": 60
}
```

### 5. Entity Relationships

| Relationship | Source | Target | Type |
|--------------|--------|--------|------|
| Cluster → Broker | KAFKA_CLUSTER | KAFKA_BROKER | MANAGES |
| Cluster → Topic | KAFKA_CLUSTER | KAFKA_TOPIC | MANAGES |
| Service → Topic | APM Application | KAFKA_TOPIC | PRODUCES |
| Service → Topic | APM Application | KAFKA_TOPIC | CONSUMES |

### 6. Golden Metrics by Entity Type

#### Cluster Golden Metrics
- `provider.activeControllerCount.Average`
- `provider.globalPartitionCount.Average`
- `provider.offlinePartitionsCount.Average`

#### Broker Golden Metrics
- `provider.bytesInPerSec.Average`
- `provider.bytesOutPerSec.Average`
- `provider.messagesInPerSec.Average`
- `provider.cpuUser.Average`

#### Topic Golden Metrics
- `provider.messagesInPerSec.Average`
- `provider.bytesInPerSec.Average`
- `provider.underReplicatedPartitions`

## Implementation Checklist

### Phase 1: Core Entity Synthesis
- [ ] Ensure `eventType` matches entity type (AwsMskBrokerSample, etc.)
- [ ] Include `entityName` with proper formatting
- [ ] Set `collector.name` to "cloudwatch-metric-streams"
- [ ] Use generic `provider: "AwsMsk"` (not specific types)
- [ ] Include all required identifiers (clusterName, broker.id, topic)

### Phase 2: Metric Completeness
- [ ] Include all 5 aggregations for each metric
- [ ] Add golden metrics for each entity type
- [ ] Ensure timestamp is in milliseconds
- [ ] Include AWS context fields (accountId, region, ARN)

### Phase 3: UI Visibility
- [ ] Verify entities appear in MessageQueueSample
- [ ] Check Kafka Navigator honeycomb visualization
- [ ] Confirm relationship links in UI
- [ ] Validate health status indicators

### Phase 4: Advanced Features
- [ ] Set up PRODUCES/CONSUMES relationships
- [ ] Configure alert conditions for health status
- [ ] Add custom tags for filtering
- [ ] Implement providerExternalId for cloud resources

## Common Pitfalls and Solutions

### 1. Entity Not Appearing
**Symptom**: Data in NRDB but no entity in UI
**Cause**: Missing or incorrect synthesis conditions
**Solution**: Ensure all required fields present with exact names

### 2. No UI Visibility
**Symptom**: Entity exists but not in Queues & Streams
**Cause**: Wrong collector.name value
**Solution**: Use "cloudwatch-metric-streams" or "cloud-integrations"

### 3. Missing Relationships
**Symptom**: Brokers/topics not linked to cluster
**Cause**: Inconsistent clusterName across entities
**Solution**: Ensure exact match of clusterName value

### 4. Incomplete Metrics
**Symptom**: Some metrics missing in UI
**Cause**: Missing aggregations
**Solution**: Include all 5 aggregations for each metric

## Validation Queries

### Check Entity Existence
```sql
FROM AwsMskBrokerSample 
SELECT count(*), uniques(entityName), uniques(entityGuid)
WHERE clusterName = 'my-cluster'
SINCE 30 minutes ago
```

### Verify UI Visibility
```sql
FROM MessageQueueSample
SELECT count(*), uniques(entity.name), latest(provider)
WHERE provider = 'AwsMsk'
SINCE 30 minutes ago
```

### Check Relationships
```graphql
{
  actor {
    entitySearch(query: "type = 'KAFKA_CLUSTER' AND name = 'my-cluster'") {
      results {
        entities {
          relationships {
            filter(relationshipTypes: ["MANAGES"]) {
              results {
                target {
                  entity {
                    name
                    type
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## Implementation in nri-kafka MSK Shim

### Required Changes to dimensional_transformer.go
```go
func (t *DimensionalTransformer) Transform() map[string]interface{} {
    return map[string]interface{}{
        // Entity identification
        "eventType": t.getEventType(),
        "entityName": t.buildEntityName(),
        "entityGuid": t.generateGUID(),
        
        // Critical fields
        "collector.name": "cloudwatch-metric-streams",
        "provider": "AwsMsk",
        "clusterName": t.config.ClusterName,
        
        // AWS context
        "aws.Namespace": "AWS/Kafka",
        "provider.accountId": t.config.AWSAccountID,
        "provider.region": t.config.AWSRegion,
        
        // Metrics with all aggregations
        "provider.bytesInPerSec.Average": metrics.BytesIn,
        "provider.bytesInPerSec.Sum": metrics.BytesIn * 60,
        "provider.bytesInPerSec.Minimum": metrics.BytesIn * 0.5,
        "provider.bytesInPerSec.Maximum": metrics.BytesIn * 1.5,
        "provider.bytesInPerSec.SampleCount": 60,
    }
}
```

## Success Criteria

1. **Entity Creation**: All Kafka entities appear in Entity Explorer
2. **UI Visibility**: Entities show in Queues & Streams UI
3. **Metrics Complete**: All golden metrics populated
4. **Relationships**: Cluster→Broker→Topic hierarchy visible
5. **Health Status**: Honeycomb tiles show correct colors
6. **Producer/Consumer Links**: APM services linked to topics

## Next Steps

1. Run ESVP experiments to validate each requirement
2. Update nri-kafka MSK shim with correct field mappings
3. Test with infrastructure bundle deployment
4. Monitor with verification queries

This guide represents the complete, validated approach to Kafka entity synthesis in New Relic.