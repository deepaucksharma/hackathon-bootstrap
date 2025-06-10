# Relationship Documentation - Message Queues Platform

This documentation covers the relationships between message queue entities, enabling topology visualization and dependency tracking.

## Overview

Relationships connect message queue entities to provide a complete view of the messaging infrastructure and its connections to applications and services.

## Relationship Types

### Infrastructure Relationships

| Type | Description | Source → Target | Cardinality |
|------|-------------|-----------------|-------------|
| MANAGES | Administrative ownership | Cluster → Broker | 1:N |
| CONTAINS | Physical containment | Cluster → Topic | 1:N |
| HOSTS | Infrastructure hosting | Broker → Partition | 1:N |

### Application Relationships

| Type | Description | Source → Target | Cardinality |
|------|-------------|-----------------|-------------|
| PRODUCES_TO | Producer relationship | Service → Topic | N:N |
| CONSUMES_FROM | Consumer relationship | Service → Topic | N:N |
| CONNECTS_TO | Network connection | Application → Broker | N:N |

### Messaging Relationships

| Type | Description | Source → Target | Cardinality |
|------|-------------|-----------------|-------------|
| ROUTES_TO | Message routing | Exchange → Queue | N:N |
| SUBSCRIBES_TO | Subscription | Consumer Group → Topic | N:N |
| REPLICATES_TO | Data replication | Broker → Broker | N:N |

## Relationship Discovery

### Automatic Discovery

Relationships are automatically discovered through:

1. **Entity Synthesis** - Relationships inferred from entity attributes
2. **Distributed Tracing** - Producer/consumer relationships from traces
3. **Topology Analysis** - Infrastructure relationships from configuration

### Relationship Rules

#### Cluster to Broker
```yaml
kafka_cluster_to_broker:
  rule: "Broker reports clusterName matching cluster entity"
  relationship: "MANAGES"
  source:
    entityType: MESSAGE_QUEUE_CLUSTER
    attribute: clusterName
  target:
    entityType: MESSAGE_QUEUE_BROKER
    attribute: clusterName
```

#### Topic to Consumer Group
```yaml
topic_to_consumer_group:
  rule: "Consumer group reports topic in subscription list"
  relationship: "SUBSCRIBES_TO"
  source:
    entityType: MESSAGE_QUEUE_CONSUMER_GROUP
    attribute: topics[]
  target:
    entityType: MESSAGE_QUEUE_TOPIC
    attribute: topic
```

#### Service to Topic (from traces)
```yaml
service_to_topic:
  rule: "Trace contains messaging span with destination"
  relationship: "PRODUCES_TO or CONSUMES_FROM"
  source:
    entityType: APM_APPLICATION
    span.kind: "producer" or "consumer"
  target:
    entityType: MESSAGE_QUEUE_TOPIC
    span.destination: topic name
```

## Relationship Implementation

### Relationship Synthesis

Currently implemented relationships:

```typescript
// Example: Cluster manages Brokers
function synthesizeClusterBrokerRelationships(
  cluster: ClusterEntity,
  brokers: BrokerEntity[]
): Relationship[] {
  return brokers
    .filter(broker => broker.clusterName === cluster.clusterName)
    .map(broker => ({
      source: cluster.guid,
      target: broker.guid,
      type: 'MANAGES'
    }));
}
```

### Future Relationship Types

Planned relationship implementations:

1. **Cross-Region Replication**
   - Source cluster → Target cluster
   - Track replication lag and status

2. **Dead Letter Queue Relationships**
   - Source queue → DLQ
   - Track error routing

3. **Schema Registry Relationships**
   - Topic → Schema
   - Version compatibility tracking

## Relationship Visualization

### Entity Maps

Relationships enable topology visualization:

```
┌─────────────────┐
│   Cluster       │
└────────┬────────┘
         │ MANAGES
    ┌────┴────┬────────┬────────┐
    ▼         ▼        ▼        ▼
┌────────┐┌────────┐┌────────┐┌────────┐
│Broker 1││Broker 2││Broker 3││Broker 4│
└────────┘└────────┘└────────┘└────────┘
    │         │        │        │
    │ HOSTS   │ HOSTS  │ HOSTS  │ HOSTS
    ▼         ▼        ▼        ▼
 [Partitions][Parts][Parts][Partitions]
```

### Service Dependencies

```
┌─────────────┐      PRODUCES_TO      ┌─────────────┐
│  Service A  │────────────────────▶│   Topic X   │
└─────────────┘                      └──────┬──────┘
                                            │
                                 CONSUMES_FROM │
                                            ▼
┌─────────────┐      PRODUCES_TO      ┌─────────────┐
│  Service B  │◀───────────────────│  Service C  │
└─────────────┘                      └─────────────┘
```

## Querying Relationships

### NRQL Examples

Find all topics for a cluster:
```sql
FROM Relationship 
SELECT targetEntityGuid, targetEntityName 
WHERE sourceEntityGuid = 'CLUSTER_GUID' 
  AND relationshipType = 'CONTAINS'
```

Find all consumers of a topic:
```sql
FROM Relationship 
SELECT sourceEntityGuid, sourceEntityName 
WHERE targetEntityGuid = 'TOPIC_GUID' 
  AND relationshipType IN ('CONSUMES_FROM', 'SUBSCRIBES_TO')
```

Service communication through topics:
```sql
FROM Relationship 
SELECT sourceEntityName as Producer, 
       targetEntityName as Topic
WHERE relationshipType = 'PRODUCES_TO'
  AND targetEntityType = 'MESSAGE_QUEUE_TOPIC'
```

## Best Practices

### Relationship Design

1. **Keep relationships meaningful** - Only create relationships that provide operational value
2. **Avoid redundancy** - Don't duplicate relationships that can be inferred
3. **Maintain consistency** - Use standard relationship types across providers
4. **Consider cardinality** - Design for the expected relationship scale

### Performance Considerations

1. **Limit relationship depth** - Avoid deep traversal requirements
2. **Index key attributes** - Ensure relationship attributes are indexed
3. **Batch relationship updates** - Update relationships in bulk when possible
4. **Cache relationship data** - For frequently accessed topologies

### Relationship Governance

1. **Document relationships** - Maintain clear documentation
2. **Version relationships** - Track changes to relationship definitions
3. **Monitor relationship health** - Detect broken or stale relationships
4. **Audit relationship changes** - Track topology modifications

## Troubleshooting Relationships

### Missing Relationships

Common causes:
- Entities not reporting required attributes
- Synthesis rules too restrictive
- Timing issues between entity creation
- Missing distributed tracing instrumentation

### Debugging Queries

```sql
-- Check if entities have required attributes
FROM MessageQueue 
SELECT entityGuid, clusterName, broker.id 
WHERE entityType = 'MESSAGE_QUEUE_BROKER' 
  AND clusterName IS NULL

-- Verify relationship creation
FROM NrAuditEvent 
SELECT timestamp, description 
WHERE targetType = 'RELATIONSHIP' 
  AND actionName = 'create'
SINCE 1 hour ago
```

## Future Enhancements

### Planned Features

1. **Dynamic relationship discovery** from metrics patterns
2. **Relationship quality scoring** based on data consistency
3. **Temporal relationships** for time-bound connections
4. **Relationship templates** for common patterns
5. **Bi-directional relationship validation**

### API Enhancements

Future GraphQL support:
```graphql
query GetEntityRelationships($guid: String!) {
  entity(guid: $guid) {
    relationships {
      source { guid, name, type }
      target { guid, name, type }
      type
      metadata {
        strength
        lastUpdated
        attributes
      }
    }
  }
}
```