# MSK Metrics Reverse Engineering Guide

## Executive Summary

This guide documents our journey to achieve AWS MSK metrics visibility in New Relic's Message Queues UI through reverse engineering CloudWatch Metric Streams format. Despite having 98.9% metric coverage, our custom nri-kafka integration doesn't appear in the UI because New Relic's entity synthesis requires metrics to come from CloudWatch Metric Streams.

## Problem Statement

### Current State
- **Metric Coverage**: 98.9% in account 3630072
- **UI Visibility**: 0% - No entities appear in Message Queues UI
- **Root Cause**: New Relic entity synthesis requires `collector.name = 'cloudwatch-metric-streams'`

### Key Discovery
From entity definition files:
```yaml
conditions:
  - EventType = 'Metric'
  - EntityType IN ('AWSMSKTOPIC', 'AWS_MSK_TOPIC')
  - CollectorName = 'cloudwatch-metric-streams'
```

## Solution: CloudWatch Emulator Approach

### Core Concept
Since we know:
1. What data exists in NRDB (from working accounts)
2. Entity synthesis requirements (from entity definitions)
3. The end result we need

We can reverse engineer the CloudWatch Metric Streams format and emulate it.

## Implementation Phases

### Phase 1: Analysis & Discovery ✅
**Status**: Complete

**What We Learned**:
1. Entity synthesis requires CloudWatch as the collector
2. Events API doesn't create UI-visible entities
3. Dimensional metrics API accepts our metrics but doesn't solve UI visibility
4. Missing critical fields: `providerExternalId`, proper AWS account IDs
5. Mock data (account 3630072) vs real AWS accounts (12-digit IDs)

**Key Files Analyzed**:
- Entity definitions in New Relic
- Working account metrics (3001033, 1, 3026020)
- Our account metrics (3630072)

### Phase 2: Initial Implementation ✅
**Status**: Complete

**What We Built**:
1. CloudWatch Emulator (`src/msk/cloudwatch_emulator.go`)
2. Integration with MSK shim
3. Proper AWS field mapping
4. Dimensional metrics support

**Key Components**:
```go
// CloudWatchEmulator structure
type CloudWatchEmulator struct {
    metricClient *MetricAPIClient
    config       *Config
}

// Critical attributes for entity synthesis
attributes := map[string]interface{}{
    "collector.name": "cloudwatch-metric-streams",
    "eventType": "Metric",
    "instrumentation.provider": "cloudwatch",
    "aws.Namespace": "AWS/Kafka",
    // ... AWS dimensions
}
```

### Phase 3: Iterative Testing (Next Steps)

## Reverse Engineering Plan - Step by Step

### Step 1: Baseline Testing
**Goal**: Verify current metric submission works

```bash
# 1. Deploy current implementation
cd minikube-consolidated
kubectl apply -f monitoring/

# 2. Verify metrics are being sent
kubectl logs -n newrelic-monitoring deployment/nri-kafka -f | grep "CloudWatch"

# 3. Check NRDB for our metrics
```

**NRQL Validation**:
```sql
-- Check if CloudWatch emulator metrics arrive
FROM Metric
SELECT count(*)
WHERE collector.name = 'cloudwatch-metric-streams'
AND aws.Namespace = 'AWS/Kafka'
SINCE 10 minutes ago
```

### Step 2: Single Metric Test
**Goal**: Get one metric to create an entity

**Implementation**:
```go
// Start with just BytesInPerSec for one broker
func testSingleMetric() {
    metric := MetricData{
        Name: "BytesInPerSec",
        Value: 1000.0,
        Timestamp: time.Now().Unix() * 1000,
        Attributes: map[string]interface{}{
            "collector.name": "cloudwatch-metric-streams",
            "entity.type": "AWS_KAFKA_BROKER",
            "entity.name": "test-cluster:broker-1",
            "aws.accountId": "123456789012",
            "aws.region": "us-east-1",
            "aws.kafka.clusterName": "test-cluster",
            "aws.kafka.brokerId": "1",
            "aws.Dimensions": []map[string]string{
                {"Name": "ClusterName", "Value": "test-cluster"},
                {"Name": "BrokerID", "Value": "1"},
            },
        },
    }
    
    // Send and verify
    client.SendMetric(metric)
}
```

**Validation**:
```sql
-- Check if entity was created
FROM entity
WHERE type = 'AWS_KAFKA_BROKER'
AND name LIKE '%test-cluster%'
```

### Step 3: Analyze Working Account Format
**Goal**: Match exact format from working accounts

```sql
-- Extract exact metric structure from working account
FROM Metric
SELECT *
WHERE collector.name = 'cloudwatch-metric-streams'
AND metricName = 'BytesInPerSec'
AND aws.accountId = '1' -- Working account
LIMIT 1
```

**Compare attributes**:
- List all attributes from working account
- Compare with our emulated metrics
- Adjust emulator to match exactly

### Step 4: Incremental Metric Addition
**Goal**: Add metrics one by one until entity appears

**Order of metrics to test**:
1. `BytesInPerSec` - Basic throughput
2. `ActiveControllerCount` - Cluster health
3. `OfflinePartitionsCount` - Critical health metric
4. `CpuUser`, `CpuSystem`, `CpuIdle` - Resource metrics
5. `MemoryUsed`, `MemoryFree` - Memory metrics

**Test Script**:
```bash
#!/bin/bash
# test-metric-addition.sh

METRICS=(
    "BytesInPerSec"
    "ActiveControllerCount"
    "OfflinePartitionsCount"
    "CpuUser"
    "MemoryUsed"
)

for metric in "${METRICS[@]}"; do
    echo "Testing with metric: $metric"
    
    # Enable only this metric in CloudWatch emulator
    kubectl set env deployment/nri-kafka -n newrelic-monitoring \
        CLOUDWATCH_METRIC_FILTER="$metric"
    
    # Wait for metrics
    sleep 60
    
    # Check entity creation
    ./check-entity-creation.sh
    
    if [ $? -eq 0 ]; then
        echo "SUCCESS: Entity created with $metric"
        break
    fi
done
```

### Step 5: Dimension Testing
**Goal**: Determine minimal required dimensions

**Test variations**:
```go
// Test 1: Minimal dimensions
dimensions := []map[string]string{
    {"Name": "ClusterName", "Value": clusterName},
}

// Test 2: Standard dimensions
dimensions := []map[string]string{
    {"Name": "ClusterName", "Value": clusterName},
    {"Name": "BrokerID", "Value": brokerId},
}

// Test 3: Full dimensions (matching CloudWatch)
dimensions := []map[string]string{
    {"Name": "ClusterName", "Value": clusterName},
    {"Name": "BrokerID", "Value": brokerId},
    {"Name": "ClientAuth", "Value": "TLS"},
    {"Name": "EnhancedMonitoring", "Value": "DEFAULT"},
}
```

### Step 6: Timing and Batching
**Goal**: Match CloudWatch timing patterns

**Test scenarios**:
1. Single metric per request
2. Batch all metrics for one broker
3. Align timestamps to minute boundaries
4. Test different flush intervals

```go
// Timing alignment test
func alignTimestamp(t time.Time) time.Time {
    // CloudWatch often aligns to minute boundaries
    return t.Truncate(time.Minute)
}

// Batch pattern test
func sendBrokerMetricBatch(brokerId string) {
    timestamp := alignTimestamp(time.Now())
    
    metrics := []string{
        "BytesInPerSec",
        "BytesOutPerSec",
        "MessagesInPerSec",
        "CpuUser",
        "CpuSystem",
        "CpuIdle",
    }
    
    batch := make([]MetricData, 0, len(metrics))
    for _, metricName := range metrics {
        batch = append(batch, createMetric(metricName, timestamp))
    }
    
    client.SendBatch(batch)
}
```

### Step 7: Entity Name Format Testing
**Goal**: Find the exact entity name format that works

**Test variations**:
```go
// Format 1: Simple
entityName := fmt.Sprintf("%s:broker-%s", clusterName, brokerId)

// Format 2: ARN-style
entityName := fmt.Sprintf("arn:aws:kafka:%s:%s:broker/%s/%s/%s", 
    region, accountId, clusterName, clusterId, brokerId)

// Format 3: FQDN-style
entityName := fmt.Sprintf("broker-%s.%s.kafka.%s.amazonaws.com", 
    brokerId, clusterName, region)

// Format 4: Match working account exactly
// (Extract from working account first)
```

## Monitoring and Validation

### Real-time Monitoring
```bash
# Watch CloudWatch emulator logs
kubectl logs -n newrelic-monitoring deployment/nri-kafka -f | grep -E "(CloudWatch|Emulating)"

# Monitor metric submission
watch -n 5 'kubectl exec -n newrelic-monitoring deployment/nri-kafka -- \
    curl -s http://localhost:8080/metrics | grep cloudwatch'
```

### NRQL Queries for Validation

```sql
-- 1. Check CloudWatch metrics arrival
FROM Metric
SELECT count(*), latest(collector.name)
WHERE aws.Namespace = 'AWS/Kafka'
FACET metricName
SINCE 10 minutes ago

-- 2. Verify entity synthesis
FROM entity
SELECT count(*)
WHERE type LIKE '%KAFKA%'
AND providerAccountId IS NOT NULL
SINCE 1 hour ago

-- 3. Compare with working account
FROM Metric
SELECT *
WHERE collector.name = 'cloudwatch-metric-streams'
AND metricName = 'BytesInPerSec'
COMPARE WITH 1 hour ago

-- 4. Check for synthesis errors
FROM Log
SELECT message
WHERE message LIKE '%synthesis%'
OR message LIKE '%entity%creation%'
SINCE 1 hour ago
```

### Success Criteria

1. **Metrics in NRDB**: CloudWatch-emulated metrics appear with correct attributes
2. **Entity Creation**: AWS_KAFKA_* entities appear in entity table
3. **UI Visibility**: Entities appear in Message Queues UI
4. **Health Scores**: Achieve 90%+ across all categories

## Troubleshooting Guide

### Issue: Metrics sent but no entities created
**Check**:
1. Verify `collector.name` is exactly `cloudwatch-metric-streams`
2. Ensure `eventType` is `Metric` not `Event`
3. Check all required AWS dimensions are present
4. Verify timestamps are in milliseconds

### Issue: Entities created but not in UI
**Check**:
1. Entity type matches expected values
2. Provider account mapping is correct
3. All required relationships are present
4. Entity GUID format is valid

### Issue: 403 errors from API
**Check**:
1. Using license key, not user API key
2. API key has metric submission permissions
3. Account ID matches API key

## Configuration Reference

### Environment Variables
```bash
# Core settings
MSK_ENABLED=true
MSK_USE_DIMENSIONAL=true
NEW_RELIC_API_KEY=<license-key>

# AWS settings (use real format)
AWS_ACCOUNT_ID=123456789012
AWS_REGION=us-east-1

# CloudWatch emulator settings
CLOUDWATCH_EMULATOR_ENABLED=true
CLOUDWATCH_METRIC_FILTER=all  # or specific metric names
CLOUDWATCH_BATCH_SIZE=20
CLOUDWATCH_FLUSH_INTERVAL=60s
```

### Verification Commands
```bash
# Check current configuration
kubectl describe deployment/nri-kafka -n newrelic-monitoring | grep -A 20 "Environment:"

# Verify metrics are being sent
kubectl exec -n newrelic-monitoring deployment/nri-kafka -- \
    grep -c "CloudWatch" /var/log/nri-kafka.log

# Test single metric submission
kubectl exec -n newrelic-monitoring deployment/nri-kafka -- \
    /usr/bin/nri-kafka --test_cloudwatch_single_metric
```

## Next Iteration Plan

### Week 1: Baseline and Single Metric
- Day 1-2: Deploy and verify baseline
- Day 3-4: Single metric testing
- Day 5: Document findings

### Week 2: Format Matching
- Day 1-2: Analyze working account format
- Day 3-4: Adjust emulator to match
- Day 5: Test and validate

### Week 3: Full Implementation
- Day 1-2: Add all required metrics
- Day 3-4: Test batching and timing
- Day 5: Final validation

### Week 4: Production Ready
- Day 1-2: Performance testing
- Day 3-4: Documentation and cleanup
- Day 5: Deployment plan

## Lessons Learned

1. **Entity Synthesis is Strict**: New Relic's entity synthesis has specific requirements that must be met exactly
2. **CloudWatch is Special**: The CloudWatch Metric Streams collector has special handling in New Relic
3. **Events vs Metrics**: Event API creates samples but not UI-visible entities
4. **Dimensional Metrics**: Accept metrics but don't solve the UI visibility problem
5. **Reverse Engineering Works**: With access to working examples and persistence, we can emulate the required format

## Resources

- [New Relic Entity Synthesis Docs](https://docs.newrelic.com/docs/new-relic-one/use-new-relic-one/core-concepts/what-entity-new-relic/)
- [CloudWatch Metric Streams](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Metric-Streams.html)
- [MSK Metrics Reference](https://docs.aws.amazon.com/msk/latest/developerguide/monitoring.html)
- Working implementation reference accounts: 3001033, 1, 3026020