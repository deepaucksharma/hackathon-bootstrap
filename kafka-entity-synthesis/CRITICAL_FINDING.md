# CRITICAL FINDING: Entity Synthesis Not Creating MessageQueueSample Events

## Summary

Despite sending perfectly formatted AWS MSK events with all required fields, entities are NOT appearing in the Message Queues UI (MessageQueueSample).

## Evidence

1. **Events ARE being received and stored**:
   - 26,900 AwsMsk* events in NRDB
   - Events have proper entity.guid, entity.name, entity.type
   - collector.name = "cloudwatch-metric-streams" ✅
   - provider = "AwsMsk" ✅
   - All metric aggregations present ✅

2. **Entities ARE being created**:
   - Entity GUIDs are generated
   - Entity type is set to AWS_KAFKA_BROKER
   - All required synthesis fields present

3. **BUT MessageQueueSample is EMPTY**:
   - 0 events in MessageQueueSample
   - No providers listed
   - Message Queues UI shows no Kafka entities

## Root Cause Analysis

This indicates one of the following:

1. **Account Configuration Issue**: The account may not have the proper integrations enabled or configured to trigger MessageQueueSample population

2. **Entity Synthesis Rules**: The entity-definitions rules for AWS MSK may require additional fields or specific conditions not documented

3. **Backend Processing**: There may be a backend process that populates MessageQueueSample that isn't triggered by custom events

## Next Steps

1. **Check with New Relic Support**: This appears to be a platform-level issue, not a data format issue

2. **Alternative Approach**: Since standard Kafka integration works (83K events), consider using standard Kafka event types instead of AwsMsk*

3. **Test in Different Account**: Try the same payloads in a different account that has working AWS MSK entities

## Workaround Strategy

Instead of trying to make AwsMsk* events work, we could:

1. Use standard Kafka event types (KafkaBrokerSample, etc.)
2. Add MSK-specific fields as additional attributes
3. This should trigger the standard Kafka entity synthesis which might populate MessageQueueSample

## Code Evidence

```javascript
// This payload has EVERYTHING but still doesn't work:
{
  "eventType": "AwsMskBrokerSample",
  "entityGuid": "MzYzMDA3MnxJTkZSQXxLQUZLQV9CUk9LRVJ8...",
  "entity.type": "AWS_KAFKA_BROKER",
  "collector.name": "cloudwatch-metric-streams",
  "provider": "AwsMsk",
  // ... all other required fields
}
// Result: Entity created but NOT in MessageQueueSample
```