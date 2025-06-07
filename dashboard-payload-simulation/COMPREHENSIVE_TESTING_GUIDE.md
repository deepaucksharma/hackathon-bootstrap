# Comprehensive Testing Guide for Kafka Entity Synthesis

Based on deep analysis of New Relic's entity definitions and documentation, this guide provides exact testing procedures to ensure successful entity synthesis and UI visibility.

## 🎯 Testing Objectives

1. Verify entities are created with correct domain/type
2. Ensure UI visibility in Queues & Streams
3. Validate relationship formation (MANAGES, PRODUCES, CONSUMES)
4. Confirm health status visualization
5. Test metric aggregation requirements

## 📋 Pre-Test Checklist

### Environment Setup
```bash
# Verify environment variables
echo $NR_ACCOUNT_ID        # Your New Relic account ID
echo $NR_INSERT_KEY        # Insert key with Event API access
echo $NR_QUERY_KEY         # Query key for NRQL
echo $NR_USER_KEY          # User key for NerdGraph
echo $AWS_ACCOUNT_ID       # 12-digit AWS account ID (if using MSK)
```

### Key Requirements Summary
- **Domain**: `INFRA`
- **Types**: `AWS_KAFKA_CLUSTER`, `AWS_KAFKA_BROKER`, `AWS_KAFKA_TOPIC`
- **Collector**: `cloud-integrations` (NOT `nri-kafka` or `cloudwatch-metric-streams`)
- **Provider**: Exact values - `AwsMskCluster`, `AwsMskBroker`, `AwsMskTopic`
- **Identifiers**: 1-50 characters, printable ASCII only

## 🧪 Test Scenarios

### Test 1: Basic Entity Creation
```bash
# Run the entity synthesis rules test
node 1-run-experiment.js experiments/phase-1-baseline-validation/1.4-verify-entity-synthesis-rules.yaml
```

**Expected Results**:
- Entity appears in NerdGraph within 60 seconds
- Domain = `INFRA`, Type = `AWS_KAFKA_BROKER`
- All provider fields present
- Entity GUID follows format: `base64(accountId|INFRA|AWS_KAFKA_BROKER|hash)`

**Verification Query**:
```sql
FROM AwsMskBrokerSample 
SELECT latest(collector.name), latest(provider), latest(entityGuid)
WHERE entityName = 'YOUR_ENTITY_NAME'
SINCE 5 minutes ago
```

### Test 2: UI Visibility Requirements
```bash
# Test with correct collector pipeline
node 1-run-experiment.js experiments/phase-1-baseline-validation/1.1-positive-control.yaml

# Test with wrong collector (should fail UI visibility)
node 1-run-experiment.js experiments/phase-1-baseline-validation/1.2-negative-control-wrong-collector.yaml
```

**Critical Check - MessageQueueSample**:
```sql
FROM MessageQueueSample 
SELECT count(*) 
WHERE entityName = 'YOUR_ENTITY_NAME' OR queue.name = 'YOUR_ENTITY_NAME'
SINCE 10 minutes ago
```

**Result**: Must return count > 0 for UI visibility

### Test 3: Metric Aggregation Requirements
```bash
# Test removing aggregations (should fail)
node 1-run-experiment.js experiments/phase-2-deconstruction-analysis/2.4-remove-metric-aggregations.yaml
```

**Verification**:
```sql
FROM AwsMskBrokerSample 
SELECT latest(provider.bytesInPerSec.Sum) as sum,
       latest(provider.bytesInPerSec.Average) as avg,
       latest(provider.bytesInPerSec.Maximum) as max,
       latest(provider.bytesInPerSec.Minimum) as min,
       latest(provider.bytesInPerSec.SampleCount) as count
WHERE entityName = 'YOUR_ENTITY_NAME'
```

**Result**: All 5 values must be non-null numbers

### Test 4: Health Status Triggers
```bash
# Test unhealthy status
node 1-run-experiment.js experiments/phase-3-component-verification/3.1-trigger-unhealthy-status.yaml
```

**Health Status Rules**:
- `HEALTHY`: All metrics within thresholds
- `UNHEALTHY`: `offlinePartitionsCount > 0` OR `activeControllerCount != 1`
- `WARNING`: `underReplicatedPartitions > 0` OR `consumerLag > 100000`

### Test 5: Relationship Formation
```bash
# Run full relationship test
node 3-run-simulation.js experiments/phase-4-system-simulation/2-test-relationship-formation.yaml
```

**Relationship Verification (NerdGraph)**:
```graphql
{
  actor {
    entity(guid: "YOUR_ENTITY_GUID") {
      relationships {
        source { entity { name type } }
        target { entity { name type } }
        type
      }
    }
  }
}
```

**Expected Relationships**:
- Cluster → MANAGES → Brokers
- Cluster → MANAGES → Topics
- Services → PRODUCES → Topics (if APM instrumented)
- Services → CONSUMES → Topics (if APM instrumented)

### Test 6: Field Length Constraints
```bash
# Test identifier length limits
node 1-run-experiment.js experiments/phase-3-component-verification/3.4-test-identifier-constraints.yaml
```

**Rules**:
- Entity names: 1-50 characters
- Topic names: Should be < 36 chars (unless `encodeIdentifierInGUID: true`)
- Cluster names: Keep under 36 chars for safety

## 🔍 Comprehensive Verification Script

```bash
#!/bin/bash
# Run complete verification

echo "=== Running Comprehensive Kafka Entity Verification ==="

# 1. Test basic entity creation
echo "Test 1: Basic entity creation..."
node 1-run-experiment.js experiments/phase-1-baseline-validation/1.4-verify-entity-synthesis-rules.yaml

# 2. Test UI visibility
echo "Test 2: UI visibility requirements..."
node 2-run-campaign.js phase-1-baseline-validation

# 3. Test field requirements
echo "Test 3: Field requirement analysis..."
node 2-run-campaign.js phase-2-deconstruction-analysis

# 4. Test component behaviors
echo "Test 4: Component behavior verification..."
node 2-run-campaign.js phase-3-component-verification

# 5. Test relationships
echo "Test 5: Relationship formation..."
node 3-run-simulation.js simulations/1-full-cluster-lifecycle.yaml

# 6. Generate results
echo "Generating entity schema from results..."
node 4-generate-entity-schema.js

echo "=== Verification Complete ==="
echo "Check results in: results/"
echo "Entity schema in: config/entity-schema.json"
```

## 📊 Key Metrics to Monitor

### Entity Creation Success
```sql
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample 
SELECT uniqueCount(entityName) as 'Entities Created',
       uniqueCount(entityGuid) as 'Unique GUIDs',
       latest(collector.name) as 'Collector'
WHERE _experimentId IS NOT NULL
SINCE 1 hour ago
FACET eventType
```

### UI Visibility Success
```sql
FROM MessageQueueSample 
SELECT uniqueCount(entityName) as 'Visible Entities'
WHERE entityName LIKE '%experiment%'
SINCE 1 hour ago
```

### Relationship Success
```sql
FROM NerdGraphQuery  -- If available
SELECT count(*) 
WHERE query LIKE '%relationships%' AND response LIKE '%MANAGES%'
SINCE 1 hour ago
```

## ⚠️ Common Issues and Solutions

### Issue: Entity not appearing
**Check**:
1. `collector.name = "cloud-integrations"`?
2. All required fields present?
3. Entity name within 50 chars?
4. Timestamp in milliseconds?

### Issue: Not visible in UI
**Check**:
1. MessageQueueSample has entries?
2. `provider` value exact match?
3. `providerExternalId` present?
4. Account ID mapping correct?

### Issue: No relationships
**Check**:
1. Parent entity exists?
2. `provider.clusterName` matches exactly?
3. Waited 75+ minutes for TTL?
4. Both entities have same account context?

### Issue: Wrong health status
**Check**:
1. All 5 aggregations present for health metrics?
2. Metric values are numbers (not strings)?
3. Alert conditions properly configured?

## 🚀 Next Steps

1. **Run full test suite**: Execute all test phases
2. **Review results**: Check `results/experiment-log.csv`
3. **Apply to nri-kafka**: Implement in MSK shim
4. **Monitor production**: Use verification queries

## 📚 References

- [New Relic Entity Definitions](https://github.com/newrelic/entity-definitions)
- [Entity Synthesis Docs](https://docs.newrelic.com/docs/new-relic-solutions/new-relic-one/core-concepts/what-entity-new-relic/)
- [Queues & Streams UI](https://docs.newrelic.com/docs/infrastructure/infrastructure-integrations/cloud-integrations/aws-integrations-list/aws-msk-monitoring-integration/)

This comprehensive testing approach ensures your Kafka entities will successfully appear in New Relic with full functionality.