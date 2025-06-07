# Iteration Strategy: Systematic Approach to UI Visibility

## 🎯 Goal
Light up the Message Queues UI using the 56 existing MSK entities.

## 🔄 Iteration Framework

### Iteration 1: Discovery & Analysis
**Objective**: Understand what makes entities UI-visible

```bash
# Quick diagnosis of current state
./quick-diagnosis.sh
```

**Key Questions**:
1. Do ANY of the 56 entities show in the UI?
2. What event types do they use?
3. Do they have MessageQueueSample events?

**Next 5 Tasks**:
- [ ] Run working MSK analysis
- [ ] Check MessageQueueSample patterns
- [ ] Verify UI visibility of existing entities
- [ ] Identify integration markers
- [ ] Document event type patterns

### Iteration 2: Targeted Testing
**Objective**: Test specific hypotheses based on findings

```bash
# If working entities use Kafka events:
node advanced-payload-iterator.js

# If MessageQueueSample is missing:
node message-queue-focused-test.js
```

**Next 5 Tasks**:
- [ ] Test identified event type pattern
- [ ] Verify MessageQueueSample creation
- [ ] Check entity GUID association
- [ ] Test integration name requirements
- [ ] Validate collector.name patterns

### Iteration 3: Exact Replication
**Objective**: Copy working pattern exactly

```sql
-- Find a working entity's complete pattern
FROM AwsMskClusterSample, KafkaClusterSample, MessageQueueSample 
SELECT * 
WHERE entity.name = 'working-entity-name' 
LIMIT 10
```

**Next 5 Tasks**:
- [ ] Extract complete event structure from working entity
- [ ] Replicate with exact field matching
- [ ] Test with multiple entities
- [ ] Verify UI appearance
- [ ] Document working pattern

### Iteration 4: Optimization
**Objective**: Streamline to minimal required fields

**Next 5 Tasks**:
- [ ] Identify minimal field set for UI visibility
- [ ] Create optimized payload generator
- [ ] Test across multiple clusters
- [ ] Build continuous submission script
- [ ] Document production approach

### Iteration 5: Production Ready
**Objective**: Create sustainable solution

**Next 5 Tasks**:
- [ ] Build automated submission pipeline
- [ ] Add monitoring and alerting
- [ ] Create deployment documentation
- [ ] Test failover scenarios
- [ ] Plan migration to official integration

## 🔍 Decision Tree

```
Start -> Run quick-diagnosis.sh
         |
         v
Are any of the 56 entities visible in UI?
         |
    +----+----+
    |         |
   YES        NO
    |         |
    v         v
Analyze    The entities
working    themselves aren't
pattern    UI-compatible
    |         |
    v         v
Copy      Need official
exact     integration
pattern   

```

## 📊 Success Metrics

### Level 1: Event Visibility
- [ ] Events appear in NRDB
- [ ] Events are queryable
- [ ] Events have correct structure

### Level 2: Entity Association  
- [ ] Events link to existing entities
- [ ] Entity GUID matches
- [ ] No new entities created

### Level 3: UI Visibility
- [ ] Entity appears in Message Queues UI
- [ ] Metrics are displayed
- [ ] Real-time updates work

### Level 4: Production Ready
- [ ] Automated submission
- [ ] Multiple cluster support
- [ ] Monitoring in place

## 🚀 Quick Start Commands

```bash
# 1. Initial diagnosis
./quick-diagnosis.sh

# 2. Based on findings, run ONE of:

# If entities use Kafka events:
node advanced-payload-iterator.js

# If MessageQueueSample is key:
node message-queue-focused-test.js

# If you found a working pattern:
node analyze-working-msk-data.js

# 3. Check UI after each test:
# https://one.newrelic.com/nr1-core/message-queues

# 4. Verify with NRQL:
# FROM MessageQueueSample SELECT * WHERE provider = 'AwsMsk' SINCE 1 hour ago
```

## 💡 Key Insights Applied

1. **Entity Creation**: Not possible via API - work with existing 56 entities
2. **Event Types**: Could be Kafka* OR AwsMsk* - test both
3. **MessageQueueSample**: Likely required for UI - focus here
4. **Integration Markers**: Copy exact values from working entities

## 🎬 Next Action

```bash
# Start here - this runs all analysis scripts
./quick-diagnosis.sh
```

Then based on output, follow the decision tree above.

Remember: We're not creating entities, we're lighting up existing ones!