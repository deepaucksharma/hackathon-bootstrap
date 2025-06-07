# Debugging Strategy: Why Isn't the UI Lighting Up?

## Current Situation
- ✅ Events are being submitted successfully
- ✅ Events are queryable in NRDB
- ❌ UI is not showing the data
- 🔍 56 existing MSK entities in the account

## Systematic Debugging Steps

### 1. Run Working MSK Analysis
```bash
node analyze-working-msk-data.js
```
This will tell us:
- What event types the working entities use
- Whether they use MessageQueueSample
- What integration created them

### 2. Run Advanced Payload Iterator
```bash
node advanced-payload-iterator.js
```
This will test 8 different payload combinations:
- Standard Kafka events vs AWS MSK events
- MessageQueueSample variations
- Different provider values
- Integration markers

### 3. Run MessageQueue Focused Test
```bash
node message-queue-focused-test.js
```
This specifically tests MessageQueueSample creation with different field combinations.

### 4. Check Debug UI Visibility
```bash
node debug-ui-visibility.js
```
This compares working vs non-working providers in the account.

## Critical Questions to Answer

### Q1: Are the 56 MSK entities actually showing in the UI?
Check: https://one.newrelic.com/nr1-core/message-queues
- If YES: The issue is with our event association
- If NO: The entities themselves aren't properly configured for UI

### Q2: What integration created the 56 entities?
Run this NRQL:
```sql
FROM InfrastructureEvent 
SELECT uniques(integrationName), uniques(collector.name) 
WHERE entityType = 'AWSMSKCLUSTER' 
SINCE 1 week ago
```

### Q3: Do working entities have MessageQueueSample events?
Run this NRQL:
```sql
FROM MessageQueueSample 
SELECT count(*), uniques(entity.name) 
WHERE provider = 'AwsMsk' 
SINCE 1 week ago
```

## Most Likely Issues

### 1. Wrong Event Type
The working entities might use `KafkaClusterSample` instead of `AwsMskClusterSample`.

### 2. Missing MessageQueueSample
The UI might specifically require MessageQueueSample events, not just metric events.

### 3. Entity Association Failure
Our events might not be properly associating with the existing entities due to:
- Wrong GUID format
- Missing linking fields
- Provider mismatch

### 4. Integration Requirement
The UI might only show data from specific integrations (not Event API).

## Immediate Action Items

1. **Verify Entity Visibility**
   ```sql
   -- Check if any MSK entity shows in UI
   FROM MessageQueueSample 
   SELECT uniques(entity.name), count(*) 
   WHERE entity.type = 'AWSMSKCLUSTER' 
   FACET provider 
   SINCE 1 day ago
   ```

2. **Find Working Pattern**
   Pick one of the 56 entities that IS showing in the UI (if any) and analyze:
   ```sql
   -- Replace 'working-cluster-name' with actual name
   FROM AwsMskClusterSample, KafkaClusterSample, MessageQueueSample 
   SELECT count(*) 
   WHERE entity.name = 'working-cluster-name' 
   FACET eventType 
   SINCE 1 hour ago
   ```

3. **Test Exact Replication**
   Once we identify the working pattern, create an exact replica for our target cluster.

## If Nothing Works

If after all testing the UI still doesn't light up:

1. **The 56 entities might not be UI-visible either** - Check if ANY MSK data shows in Message Queues UI
2. **Account-level configuration issue** - The Message Queues UI might need specific feature flags
3. **Integration-only limitation** - Direct event submission might be completely blocked for UI

## Production Solution

Given the challenges, the recommended production approach remains:

1. **Deploy Infrastructure Agent with nri-kafka**
   ```yaml
   integrations:
     - name: nri-kafka
       env:
         MSK_MODE: true
         CLUSTER_NAME: "your-cluster"
   ```

2. **Use AWS CloudWatch Metric Streams**
   - Set up official AWS integration
   - This creates entities properly

3. **Custom nri-kafka Binary**
   - Use the MSK shim implementation
   - Deploy on infrastructure with Kafka access

The synthetic approach is valuable for understanding but has fundamental limitations for UI activation.