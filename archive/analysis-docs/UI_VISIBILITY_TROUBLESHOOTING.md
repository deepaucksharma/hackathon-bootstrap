# UI Visibility Troubleshooting - Why Account 3630072 Doesn't Show in Message Queues UI

## Critical Issue
Account 3630072 has 98.9% metric coverage but DOES NOT appear in the New Relic Message Queues UI, while other accounts (1, 3001033, 3026020) do appear.

## Key Differences to Investigate

### 1. Entity Type and Synthesis
The UI requires specific entity types and proper entity synthesis. Let's check:

```sql
-- Check entity types in each account
-- Account 3630072 (Not showing in UI)
FROM AwsMskClusterSample SELECT 
  uniques(entity.type) as 'Entity Types',
  uniques(provider) as 'Provider Values',
  uniques(instrumentation.provider) as 'Instrumentation Provider',
  uniques(providerAccountId) as 'Provider Account IDs'
WHERE nr.accountId = 3630072
SINCE 1 hour ago

-- Compare with working account (e.g., 1)
FROM AwsMskClusterSample SELECT 
  uniques(entity.type) as 'Entity Types',
  uniques(provider) as 'Provider Values',
  uniques(instrumentation.provider) as 'Instrumentation Provider',
  uniques(providerAccountId) as 'Provider Account IDs'
WHERE nr.accountId = 1
SINCE 1 hour ago
```

### 2. Required Fields for UI Visibility

Based on METRICS_VERIFICATION_GUIDE.md Section 18.1, these fields are CRITICAL for UI visibility:

```sql
-- Check critical UI fields in account 3630072
FROM AwsMskClusterSample SELECT 
  count(*) as 'Total Events',
  percentage(count(provider), count(*)) as '% with provider field',
  percentage(count(awsAccountId), count(*)) as '% with awsAccountId',
  percentage(count(awsRegion), count(*)) as '% with awsRegion',
  percentage(count(`instrumentation.provider`), count(*)) as '% with instrumentation.provider',
  percentage(count(providerAccountId), count(*)) as '% with providerAccountId',
  percentage(count(providerAccountName), count(*)) as '% with providerAccountName'
WHERE nr.accountId = 3630072
SINCE 1 hour ago
```

### 3. Entity GUID Format
The UI might require specific GUID formats:

```sql
-- Check entity GUID patterns
FROM AwsMskClusterSample SELECT 
  latest(entity.guid) as 'Sample GUID',
  latest(entityGuid) as 'Entity GUID Alt',
  latest(entity.name) as 'Entity Name',
  latest(entityName) as 'Entity Name Alt'
WHERE nr.accountId = 3630072
SINCE 1 hour ago
LIMIT 5
```

### 4. AWS Integration vs Custom Integration
The UI might only show entities from official AWS integrations:

```sql
-- Check integration source
FROM AwsMskClusterSample SELECT 
  uniques(`collector.name`) as 'Collector Names',
  uniques(`instrumentation.name`) as 'Instrumentation Names',
  uniques(`instrumentation.provider`) as 'Instrumentation Providers',
  uniques(source) as 'Sources'
WHERE nr.accountId IN (3630072, 1, 3001033, 3026020)
FACET nr.accountId
SINCE 1 hour ago
```

### 5. Dimensional Metrics Check
The UI might be looking for dimensional metrics, not event samples:

```sql
-- Check for dimensional metrics in account 3630072
FROM Metric SELECT 
  count(*) as 'Metric Count',
  uniques(metricName) as 'Metric Names'
WHERE entity.type = 'AWS_KAFKA_CLUSTER'
  AND nr.accountId = 3630072
SINCE 1 hour ago

-- Compare with working account
FROM Metric SELECT 
  count(*) as 'Metric Count',
  uniques(metricName) as 'Metric Names'
WHERE entity.type = 'AWS_KAFKA_CLUSTER'
  AND nr.accountId = 1
SINCE 1 hour ago
```

## Hypothesis: The UI requires BOTH conditions:

1. **Proper AWS fields** (awsAccountId, awsRegion, etc.)
2. **Dimensional metrics** via Metric API, not just Event samples

## Verification Queries

### Query 1: Check if we're sending metrics as Events instead of Metrics
```sql
-- Our account (3630072) - might be sending Events
SELECT count(*) FROM AwsMskClusterSample WHERE nr.accountId = 3630072 SINCE 1 hour ago

-- Working accounts - might be sending Metrics
SELECT count(*) FROM Metric 
WHERE metricName LIKE 'aws.kafka%' 
  AND nr.accountId IN (1, 3001033, 3026020)
FACET nr.accountId
SINCE 1 hour ago
```

### Query 2: Check entity.type format
```sql
-- The entity.type might need to be exactly 'AWS_KAFKA_CLUSTER' not 'aws_kafka_cluster'
FROM AwsMskClusterSample, Metric
SELECT 
  uniques(entity.type) as 'Entity Types in Events',
  uniques(CASE WHEN eventType() = 'Metric' THEN entity.type ELSE null END) as 'Entity Types in Metrics'
WHERE nr.accountId = 3630072
SINCE 1 hour ago
```

### Query 3: Check for AWS account mapping
```sql
-- UI might require proper AWS account mapping
FROM AwsMskClusterSample SELECT 
  latest(awsAccountId) as 'AWS Account ID',
  latest(providerAccountId) as 'Provider Account ID',
  latest(linkedAccountId) as 'Linked Account ID',
  latest(trustedAccountId) as 'Trusted Account ID'
WHERE nr.accountId = 3630072
SINCE 1 hour ago
```

## Action Items

### 1. Compare Integration Type
```bash
# Check how other accounts are collecting MSK data
# They might be using AWS integration, not custom nri-kafka
```

### 2. Check Entity Registration
```sql
-- Check if entities are registered in entity database
FROM NrdbQuery SELECT count(*) 
WHERE query = 'SELECT count(*) FROM AWS_KAFKA_CLUSTER WHERE nr.accountId = 3630072'
```

### 3. Verify Metric Transformation
Our MSK shim might be creating Event samples when it should be creating Metrics:

```go
// Current (might be wrong):
integration.Entity("cluster", "AWS_KAFKA_CLUSTER")
entity.AddEvent(createAwsMskClusterSample())

// Should be (for UI visibility):
entity.AddMetric(gauge("aws.kafka.ActiveControllerCount", value))
```

### 4. Check for Required Tags
```sql
-- UI might require specific tags
FROM AwsMskClusterSample SELECT 
  keyset() 
WHERE nr.accountId = 3630072
SINCE 1 hour ago
LIMIT 1

-- Compare with working account
FROM AwsMskClusterSample SELECT 
  keyset() 
WHERE nr.accountId = 1
SINCE 1 hour ago
LIMIT 1
```

## Most Likely Root Cause

Based on the investigation, the issue is likely:

1. **We're sending Event samples (AwsMskClusterSample) instead of Metrics**
2. **Missing required AWS fields for entity synthesis**
3. **Entity type case sensitivity (AWS_KAFKA_CLUSTER vs aws_kafka_cluster)**
4. **Missing instrumentation.provider = "aws" field**

## Fix Implementation

### Option 1: Use Dimensional Metrics (Recommended)
Update the MSK shim to send metrics via the Metric API:

```go
// In dimensional_transformer.go
func (t *DimensionalTransformer) Transform(sample *types.MskSample) error {
    // Send as metric, not event
    metric := telemetry.Metric{
        Name: "aws.kafka.ActiveControllerCount",
        Type: telemetry.Gauge,
        Value: sample.ActiveControllerCount,
        Attributes: map[string]interface{}{
            "entity.type": "AWS_KAFKA_CLUSTER",
            "entity.name": sample.ClusterName,
            "awsAccountId": sample.AWSAccountID,
            "awsRegion": sample.AWSRegion,
            "instrumentation.provider": "aws",
        },
    }
    return t.client.Send(metric)
}
```

### Option 2: Add Missing Fields
Ensure all events have required fields:

```go
sample := types.MskClusterSample{
    EventType: "AwsMskClusterSample",
    Provider: "AwsMskCluster",
    AwsAccountId: awsAccountID,
    AwsRegion: awsRegion,
    InstrumentationProvider: "aws",
    ProviderAccountId: awsAccountID,
    EntityType: "AWS_KAFKA_CLUSTER", // Must be uppercase
}
```

## Immediate Test

Run this query to see the exact differences:

```sql
-- Side-by-side comparison
WITH 
  our_account AS (
    FROM AwsMskClusterSample 
    SELECT keyset() as fields 
    WHERE nr.accountId = 3630072 
    SINCE 1 hour ago 
    LIMIT 1
  ),
  working_account AS (
    FROM AwsMskClusterSample 
    SELECT keyset() as fields 
    WHERE nr.accountId = 1 
    SINCE 1 hour ago 
    LIMIT 1
  )
SELECT 
  our_account.fields as 'Our Fields (3630072)',
  working_account.fields as 'Working Fields (1)'
FROM our_account, working_account
```