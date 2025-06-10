# Event Type Migration Guide

## Overview

The Message Queues Platform uses a dynamic event type naming convention that differs from what may be documented in some places. This guide explains the actual implementation and how to work with it.

## Event Type Naming Convention

### Actual Implementation (Current)
The platform generates event types dynamically based on the entity type:
```javascript
eventType = `${entityType}_SAMPLE`
```

Examples:
- `MESSAGE_QUEUE_BROKER` → `MESSAGE_QUEUE_BROKER_SAMPLE`
- `MESSAGE_QUEUE_TOPIC` → `MESSAGE_QUEUE_TOPIC_SAMPLE`
- `MESSAGE_QUEUE_CONSUMER` → `MESSAGE_QUEUE_CONSUMER_SAMPLE`
- `MESSAGE_QUEUE_CLUSTER` → `MESSAGE_QUEUE_CLUSTER_SAMPLE`

### Incorrect Documentation (Old)
Some documentation may reference these event types:
- ❌ `MessageQueueBrokerSample`
- ❌ `MessageQueueTopicSample`
- ❌ `MessageQueueOffsetSample`

## Impact on Queries

### NRQL Queries
When querying data, use the correct event types:

```sql
-- Correct
FROM MESSAGE_QUEUE_BROKER_SAMPLE SELECT *

-- Incorrect
FROM MessageQueueBrokerSample SELECT *
```

### Dashboard Templates
Dashboard templates should use the correct event types in their NRQL queries. The platform automatically handles this in the query builder.

## Code References

### Where Event Types are Generated
- **File**: `core/entities/base-entity.js`
- **Line**: 124
- **Method**: `toEventPayload()`

```javascript
eventType: `${this.entityType}_SAMPLE`
```

### Entity Types
The base entity types are defined in:
- `MESSAGE_QUEUE_BROKER` - Kafka brokers
- `MESSAGE_QUEUE_TOPIC` - Topics across brokers
- `MESSAGE_QUEUE_CONSUMER` - Consumer groups
- `MESSAGE_QUEUE_CLUSTER` - Cluster-level aggregation
- `MESSAGE_QUEUE_QUEUE` - Queue entities (for RabbitMQ, SQS)

## Migration Steps

If you have existing queries or dashboards using the old event types:

1. **Update NRQL Queries**
   ```sql
   -- Old
   FROM MessageQueueBrokerSample SELECT count(*)
   
   -- New
   FROM MESSAGE_QUEUE_BROKER_SAMPLE SELECT count(*)
   ```

2. **Update Dashboard JSON**
   Search and replace in dashboard configurations:
   - `"MessageQueueBrokerSample"` → `"MESSAGE_QUEUE_BROKER_SAMPLE"`
   - `"MessageQueueTopicSample"` → `"MESSAGE_QUEUE_TOPIC_SAMPLE"`
   - `"MessageQueueOffsetSample"` → `"MESSAGE_QUEUE_CONSUMER_SAMPLE"`

3. **Update Alert Conditions**
   Any alerts based on these event types need to be updated with the correct event names.

## Verification

To verify data is flowing with correct event types:

```sql
-- Check all MESSAGE_QUEUE event types
FROM MessageQueue 
SELECT uniques(eventType) 
WHERE entityType LIKE 'MESSAGE_QUEUE_%' 
SINCE 1 hour ago

-- Check specific entity type
FROM MESSAGE_QUEUE_BROKER_SAMPLE 
SELECT count(*) 
SINCE 5 minutes ago
```

## Why This Pattern?

The `{entityType}_SAMPLE` pattern:
1. **Consistency**: All entity types follow the same pattern
2. **Predictability**: Event type can be derived from entity type
3. **Flexibility**: New entity types automatically get correct event types
4. **Clarity**: Clear relationship between entity and its telemetry

## Future Considerations

The platform may evolve to support custom event types per provider, but currently all providers use the same pattern. Any changes will be backward compatible.