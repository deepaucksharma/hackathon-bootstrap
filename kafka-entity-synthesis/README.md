# Entity Synthesis & Verification Platform (ESVP)

A comprehensive platform for discovering and validating the exact payload format required for New Relic entity synthesis of AWS MSK/Kafka entities in the Message Queues UI.

## 🚨 CRITICAL DISCOVERY: MessageQueueSample is Required for UI Visibility

**The Message Queues UI specifically looks for `eventType: "MessageQueueSample"` events**, not the standard entity event types (AwsMskBrokerSample, KafkaBrokerSample, etc.).

### Quick Solution
```javascript
{
  "eventType": "MessageQueueSample",  // MUST be this
  "provider": "AwsMsk",
  "collector.name": "cloudwatch-metric-streams",
  "queue.name": "my-cluster-topic-1",  // Required for UI
  "entity.type": "AWS_KAFKA_TOPIC",
  "entity.name": "my-cluster-topic-1",
  "queue.messagesPerSecond": 1000
}
```

**See [MESSAGEQUEUE_UI_SOLUTION.md](./MESSAGEQUEUE_UI_SOLUTION.md) for the complete solution.**

## 🎯 Mission

Transform Kafka clusters into first-class citizens in New Relic by implementing validated entity synthesis based on New Relic's open-source entity-definitions repository.

## 🔬 Critical Discoveries

### Entity Type Definitions
- **Domain**: INFRA
- **Types**: KAFKA_CLUSTER, KAFKA_BROKER, KAFKA_TOPIC
- **Identifiers**: 
  - Cluster: `clusterName` (max 36 chars)
  - Broker: `clusterName:brokerId`
  - Topic: `clusterName:topicName`

### UI Visibility Requirements
The `collector.name` field is CRITICAL for UI visibility:
- ✅ `"cloudwatch-metric-streams"` - Full visibility
- ✅ `"cloud-integrations"` - Full visibility  
- ⚠️ `"nri-kafka"` - Limited visibility
- ❌ Other/missing - No UI visibility

### Required Fields
```json
{
  "eventType": "AwsMskBrokerSample",
  "entityName": "my-cluster-broker-1",
  "entityGuid": "base64-encoded-guid",
  "timestamp": 1234567890000,
  "collector.name": "cloudwatch-metric-streams",
  "provider": "AwsMsk",
  "clusterName": "my-cluster",
  "broker.id": "1"  // For brokers only
}
```

### Metric Aggregations
ALL CloudWatch metrics MUST include all 5 aggregations:
```json
{
  "provider.bytesInPerSec.Average": 1000000,
  "provider.bytesInPerSec.Sum": 60000000,
  "provider.bytesInPerSec.Minimum": 500000,
  "provider.bytesInPerSec.Maximum": 1500000,
  "provider.bytesInPerSec.SampleCount": 60
}
```

## 🚀 Quick Start

1. **Setup environment**:
   ```bash
   export ACC=your_account_id
   export IKEY=your_insert_key
   export UKEY=your_user_key
   export QKey=your_query_key
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run baseline validation**:
   ```bash
   ./quick-test.sh
   ```

4. **Run comprehensive experiments**:
   ```bash
   node 1-run-experiment.js phase phase-1-baseline
   ```

## 📋 Platform Components

### Core Engines
- **Capture Engine**: Fetches working payloads from reference accounts
- **Payload Engine**: Generates test payloads with controlled modifications
- **Submission Engine**: Submits to New Relic Event API
- **Verification Engine**: 20+ verification checks including UI visibility

### Experiment Phases
1. **Phase 1 - Baseline**: Validate golden payloads and negative controls
2. **Phase 2 - Deconstruction**: Identify minimal required fields
3. **Phase 3 - Component Tests**: Test field variations and constraints
4. **Phase 4 - Advanced**: Validate relationships and complex scenarios

### Verification Checks
- `entityShouldExist` - Entity created in NerdGraph
- `entityShouldBeInUi` - Visible in MessageQueueSample
- `entityShouldHaveCorrectType` - Correct domain:type
- `metricShouldBePopulated` - Metrics have values
- `allAggregationsShouldExist` - All 5 aggregations present
- `clusterShouldHaveBrokers` - MANAGES relationships exist
- `shouldAppearInMessageQueues` - UI visibility check

## 🔍 Entity Relationships

| Relationship | Source → Target | Type | TTL |
|--------------|----------------|------|-----|
| Cluster → Broker | KAFKA_CLUSTER → KAFKA_BROKER | MANAGES | 75 min |
| Cluster → Topic | KAFKA_CLUSTER → KAFKA_TOPIC | MANAGES | 75 min |
| Service → Topic | APM_APPLICATION → KAFKA_TOPIC | PRODUCES | 75 min |
| Service → Topic | APM_APPLICATION → KAFKA_TOPIC | CONSUMES | 75 min |

## 📊 Golden Metrics

### Cluster
- `provider.activeControllerCount.Average`
- `provider.globalPartitionCount.Average`
- `provider.offlinePartitionsCount.Average`

### Broker
- `provider.bytesInPerSec.Average`
- `provider.bytesOutPerSec.Average`
- `provider.messagesInPerSec.Average`
- `provider.cpuUser.Average`

### Topic
- `provider.messagesInPerSec.Average`
- `provider.bytesInPerSec.Average`
- `provider.underReplicatedPartitions`

## 🛠️ Implementation in nri-kafka

Update your MSK shim with these critical changes:

```go
// dimensional_transformer.go
func buildCommonAttributes() map[string]interface{} {
    return map[string]interface{}{
        "collector.name": "cloudwatch-metric-streams",
        "provider": "AwsMsk",  // Generic, not specific types
        "aws.Namespace": "AWS/Kafka",
    }
}
```

## ✅ Success Criteria

1. **Entities Created**: All Kafka entities appear in Entity Explorer
2. **UI Visibility**: Entities show in Queues & Streams UI
3. **Metrics Complete**: All golden metrics with 5 aggregations
4. **Relationships**: Cluster→Broker→Topic hierarchy visible
5. **Health Status**: Honeycomb tiles show correct colors
6. **APM Links**: Producer/Consumer services linked to topics

## 📚 Documentation

- [Comprehensive Entity Synthesis Guide](COMPREHENSIVE_ENTITY_SYNTHESIS_GUIDE.md)
- [Implementation Quick Guide](IMPLEMENTATION_QUICK_GUIDE.md) 
- [Entity Synthesis Master Plan](ENTITY_SYNTHESIS_MASTER_PLAN.md)
- [Experiment Library](experiments/README.md)

## 🔧 Troubleshooting

### Entity not appearing
- Check `collector.name` value
- Verify all required fields present
- Ensure identifier < 36 chars

### No UI visibility
- Must use `cloudwatch-metric-streams` or `cloud-integrations`
- Check MessageQueueSample for events

### Missing metrics
- Include all 5 aggregations
- Verify golden metrics included

### No relationships
- Ensure consistent `clusterName` across entities
- Wait for TTL (75 minutes)
- Check relationship queries

## 🎯 Next Steps

1. Run comprehensive validation simulation:
   ```bash
   node 2-run-simulation.js simulations/3-comprehensive-entity-synthesis.yaml
   ```

2. Update nri-kafka MSK shim with validated field mappings

3. Deploy with infrastructure bundle and verify

4. Monitor with included verification queries

This platform represents the complete, validated approach to Kafka entity synthesis in New Relic, based on extensive testing and analysis of New Relic's entity-definitions repository.