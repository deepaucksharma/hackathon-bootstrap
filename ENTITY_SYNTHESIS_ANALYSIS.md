# Entity Synthesis Analysis: Events API vs Dimensional Metrics

## The Reality Check

You're absolutely right to question this approach. Here's why entity synthesis through the Events API (using event samples) has limitations:

### 1. **Events API (What We're Using)**
- Creates **event samples** (AwsMskBrokerSample, AwsMskClusterSample)
- These are stored as events, NOT as entities
- They appear in NRDB queries but NOT in curated UIs like Message Queues
- No automatic entity synthesis occurs

### 2. **Dimensional Metrics API (What Actually Works)**
- Creates actual **entities** in New Relic's entity database
- Uses entity.type, entity.name, entity.guid attributes to synthesize entities
- These entities appear in ALL New Relic UIs including Message Queues
- Metrics are associated with entities for proper visualization

## Why Our Hack Has Limitations

We're creating:
1. **Event Samples** (AwsMskBrokerSample) via Infrastructure Agent
2. **Dimensional Metrics** (kafka.broker.*) via Metric API

But here's the problem:
- Event samples alone don't create entities in the Message Queues UI
- Dimensional metrics ARE being sent successfully (202 status)
- BUT the entity synthesis might not work because we're mixing approaches

## The Proper AWS MSK Integration Pattern

Real AWS MSK integrations work because:
1. They use **AWS API polling** to discover MSK clusters
2. They create entities through **New Relic's cloud integration framework**
3. They send metrics via **dimensional metrics API** with proper entity mapping
4. The entities are **pre-created** by the cloud integration, not synthesized from metrics

## What This Means for Our Approach

Our "hack" has fundamental limitations:
1. **No AWS API Access** - We can't discover real MSK clusters
2. **No Cloud Integration** - We're simulating MSK from regular Kafka
3. **Mixed Entity Creation** - Events + dimensional metrics is not standard

## Why It Might Still Not Show in UI

Even with dimensional metrics working:
1. The Message Queues UI might **require** actual AWS cloud integration entities
2. It might validate AWS account ownership
3. It might check for real AWS ARNs and validate them
4. The UI might be filtering out "synthetic" MSK entities

## Potential Solutions

1. **Pure Dimensional Metrics Approach**
   - Stop creating event samples entirely
   - Only send dimensional metrics with all entity attributes
   - Hope the UI accepts synthesized entities

2. **Standard Kafka Integration**
   - Accept that we can't fake AWS MSK
   - Use standard Kafka integration which DOES show in Message Queues UI
   - This is the most reliable approach

3. **Real AWS MSK**
   - The only guaranteed way is to use actual AWS MSK clusters
   - Let New Relic's AWS integration discover them properly

## Recommendation

Given the constraints, the most reliable approach is to:
1. Use standard Kafka integration (not MSK shim)
2. This will show in the Message Queues UI as regular Kafka
3. Stop trying to simulate AWS MSK without actual AWS resources

The entity synthesis via events API is not equivalent to proper cloud integration entity creation.