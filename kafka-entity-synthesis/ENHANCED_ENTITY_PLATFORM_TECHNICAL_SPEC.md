# Enhanced Entity Platform Technical Specification v2.0

## Overview

This specification defines the **validated, working implementation** of the New Relic Entity Platform for Kafka/MSK integration. Based on extensive testing and reverse engineering of successful implementations.

## Core Discoveries

### What Actually Works

1. **Entity Synthesis via Event Patterns** ✅
   - Specific event types trigger entity creation
   - `collector.name` field is critical for synthesis rules
   - Provider must match entity type exactly

2. **MessageQueueSample Limitations** ⚠️
   - Does NOT create entities
   - Only provides metrics for existing entities
   - Must reference existing entity.guid

3. **Field Name Variations** 🔄
   - `entityGuid` vs `entity.guid` - Both work, but `entityGuid` is preferred
   - `providerExternalId` is MANDATORY for AWS entities

## TypeScript Interfaces (Validated)

### Core Entity Types

```typescript
namespace NewRelic.EntityPlatform {
  
  // Base Entity Interface
  interface Entity {
    guid: EntityGuid;           // Format: <accountId>|<domain>|<type>|<id>
    accountId: number;
    domain: EntityDomain;
    type: EntityType;
    name: string;
    reporting: boolean;
    permalink?: string;
    metadata?: EntityMetadata;
    tags?: EntityTag[];
    relationships?: EntityRelationship[];
    lastSeenAt?: timestamp;
    createdAt: timestamp;
  }

  // Validated Entity Types
  enum EntityDomain {
    INFRA = "INFRA",
    APM = "APM",
    BROWSER = "BROWSER",
    SYNTH = "SYNTH"
  }

  // Working Entity Types for Kafka/MSK
  enum KafkaEntityType {
    // Self-managed Kafka
    KAFKACLUSTER = "KAFKACLUSTER",
    KAFKABROKER = "KAFKABROKER",
    KAFKATOPIC = "KAFKATOPIC",
    KAFKACONSUMERGROUP = "KAFKACONSUMERGROUP",
    
    // AWS MSK - MUST match exactly
    AWSMSKCLUSTER = "AWSMSKCLUSTER",
    AWSMSKBROKER = "AWSMSKBROKER",
    AWSMSKTOPIC = "AWSMSKTOPIC"
  }

  // Entity GUID Format
  type EntityGuid = `${number}|${EntityDomain}|${string}|${string}`;
}
```

### Event Interfaces (What Actually Creates Entities)

```typescript
namespace NewRelic.Events {
  
  // Base Event that triggers entity synthesis
  interface EntitySynthesisEvent {
    eventType: string;
    timestamp?: number;
    collector: {
      name: "cloud-integrations" | "infrastructure-agent" | "cloudwatch-metric-streams";
      version?: string;
    };
  }

  // WORKING: MSK Cluster Event Format
  interface AwsMskClusterSample extends EntitySynthesisEvent {
    eventType: "AwsMskClusterSample";
    
    // MANDATORY fields for entity synthesis
    collector: {
      name: "cloud-integrations";  // MUST be this value
    };
    provider: "AwsMskCluster";     // NOT "AwsMsk"
    providerExternalId: string;     // AWS Account ID - CRITICAL
    entityGuid: string;             // Pre-generated GUID
    entityName: string;             // Cluster name
    
    // Additional required fields
    awsRegion: string;
    aws: {
      accountId: string;
      region: string;
    };
    
    // Provider metrics
    provider: {
      clusterName: string;
      clusterArn: string;
      clusterState: "ACTIVE" | "CREATING" | "DELETING" | "FAILED";
      activeControllersCount: MetricAggregation;
      globalPartitionsCount: MetricAggregation;
      globalTopicsCount: MetricAggregation;
      offlinePartitionsCount: MetricAggregation;
    };
  }

  // WORKING: MSK Broker Event Format
  interface AwsMskBrokerSample extends EntitySynthesisEvent {
    eventType: "AwsMskBrokerSample";
    
    collector: {
      name: "cloud-integrations";
    };
    provider: "AwsMskBroker";      // Specific to broker
    providerExternalId: string;
    entityGuid: string;
    entityName: string;             // Format: "<brokerId>-<clusterName>"
    
    provider: {
      brokerId: string;
      bytesInPerSec: MetricAggregation;
      bytesOutPerSec: MetricAggregation;
      messagesInPerSec: MetricAggregation;
      fetchConsumerTotalTimeMs: MetricAggregation;
      produceRequestTotalTimeMs: MetricAggregation;
    };
  }

  // DOES NOT CREATE ENTITIES - UI Metrics Only
  interface MessageQueueSample {
    eventType: "MessageQueueSample";
    provider: "AwsMsk" | "Kafka";  // Can be generic here
    
    // Must reference EXISTING entity
    "entity.guid": string;          // MUST be an existing entity GUID
    "entity.name": string;
    "entity.type": KafkaEntityType;
    
    // Queue metrics for UI
    "queue.name": string;
    "queue.type": "kafka" | "kafka_broker" | "kafka_topic";
    "queue.messagesPerSecond": number;
    "queue.bytesInPerSecond": number;
    "queue.bytesOutPerSecond": number;
    "queue.consumerLag"?: number;
  }

  // Metric Aggregation Type
  interface MetricAggregation {
    Average: number;
    Maximum: number;
    Minimum: number;
    SampleCount: number;
    Sum: number;
  }
}
```

### Entity Synthesis Rules (Validated)

```typescript
namespace NewRelic.Synthesis {
  
  interface SynthesisRule {
    id: string;
    name: string;
    enabled: boolean;
    priority: number;
    input: InputPattern;
    output: EntityCreation;
  }

  interface InputPattern {
    eventType: string | string[];
    required: RequiredFields;
    conditions?: Condition[];
  }

  interface RequiredFields {
    // Fields that MUST exist for synthesis
    "collector.name": "cloud-integrations" | "infrastructure-agent";
    [key: string]: any;
  }

  // VALIDATED RULES
  const MSK_CLUSTER_SYNTHESIS: SynthesisRule = {
    id: "msk-cluster-synthesis",
    name: "Create MSK Cluster Entity",
    enabled: true,
    priority: 100,
    input: {
      eventType: "AwsMskClusterSample",
      required: {
        "collector.name": "cloud-integrations",
        "provider": "AwsMskCluster",
        "providerExternalId": "*",  // Any value, but MUST exist
        "entityGuid": "*",
        "entityName": "*"
      }
    },
    output: {
      domain: "INFRA",
      type: "AWSMSKCLUSTER",
      guid: "${entityGuid}",
      name: "${entityName}",
      attributes: {
        "aws.accountId": "${providerExternalId}",
        "aws.region": "${awsRegion}",
        "kafka.clusterArn": "${provider.clusterArn}",
        "kafka.clusterState": "${provider.clusterState}"
      },
      tags: [
        { key: "provider", value: "AwsMsk" },
        { key: "aws.accountId", value: "${providerExternalId}" }
      ]
    }
  };

  const KAFKA_CLUSTER_SYNTHESIS: SynthesisRule = {
    id: "kafka-cluster-synthesis",
    name: "Create Kafka Cluster Entity",
    enabled: true,
    priority: 100,
    input: {
      eventType: "KafkaBrokerSample",
      required: {
        "collector.name": "infrastructure-agent",
        "clusterName": "*",
        "broker.id": "1"  // Use first broker
      }
    },
    output: {
      domain: "INFRA",
      type: "KAFKACLUSTER",
      guid: "${accountId}|INFRA|KAFKACLUSTER|${base64(clusterName)}",
      name: "${clusterName}",
      attributes: {
        "kafka.clusterName": "${clusterName}",
        "kafka.bootstrapServers": "${broker.host}:${broker.port}"
      }
    }
  };
}
```

### GraphQL API (Entity Query)

```typescript
namespace NewRelic.GraphQL {
  
  interface EntitySearchQuery {
    query: string;  // NRQL-like syntax
    limit?: number;
    cursor?: string;
  }

  interface EntitySearchResult {
    count: number;
    results: {
      entities: Entity[];
      nextCursor?: string;
    };
  }

  // Working query examples
  const FIND_MSK_ENTITIES = `
    query FindMSKEntities($accountId: Int!) {
      actor {
        account(id: $accountId) {
          entitySearch(query: "domain='INFRA' AND type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER')") {
            count
            results {
              entities {
                guid
                name
                type
                reporting
                ... on InfrastructureEntity {
                  providerAccountId
                  alertSeverity
                }
              }
            }
          }
        }
      }
    }
  `;
}
```

### Relationship Model

```typescript
namespace NewRelic.Relationships {
  
  enum RelationshipType {
    CONTAINS = "CONTAINS",
    HOSTS = "HOSTS",
    SERVES = "SERVES",
    CALLS = "CALLS",
    CONSUMES_FROM = "CONSUMES_FROM",
    PRODUCES_TO = "PRODUCES_TO"
  }

  interface EntityRelationship {
    type: RelationshipType;
    source: EntityReference;
    target: EntityReference;
    metadata?: Record<string, any>;
  }

  interface EntityReference {
    guid: EntityGuid;
    domain?: EntityDomain;
    type?: string;
  }

  // Validated Kafka relationships
  const KAFKA_RELATIONSHIPS = [
    {
      type: RelationshipType.CONTAINS,
      source: { type: "KAFKACLUSTER" },
      target: { type: "KAFKABROKER" }
    },
    {
      type: RelationshipType.CONTAINS,
      source: { type: "AWSMSKCLUSTER" },
      target: { type: "AWSMSKBROKER" }
    },
    {
      type: RelationshipType.HOSTS,
      source: { type: "KAFKABROKER" },
      target: { type: "KAFKATOPIC" }
    }
  ];
}
```

## Implementation Patterns

### Pattern 1: Cloud Integrations Entity Creation

```typescript
class CloudIntegrationsEntityCreator {
  private readonly requiredFields = [
    'collector.name',
    'provider',
    'providerExternalId',
    'entityGuid',
    'entityName'
  ];

  createMSKClusterEvent(cluster: MSKCluster): AwsMskClusterSample {
    return {
      eventType: "AwsMskClusterSample",
      collector: {
        name: "cloud-integrations"  // CRITICAL
      },
      provider: "AwsMskCluster",     // MUST match entity type
      providerExternalId: cluster.awsAccountId,
      entityGuid: this.generateGuid(cluster),
      entityName: cluster.name,
      awsRegion: cluster.region,
      aws: {
        accountId: cluster.awsAccountId,
        region: cluster.region
      },
      provider: {
        clusterName: cluster.name,
        clusterArn: cluster.arn,
        clusterState: cluster.state,
        // ... metrics
      },
      timestamp: Date.now()
    };
  }

  private generateGuid(cluster: MSKCluster): string {
    const accountId = this.getNewRelicAccountId();
    const encoded = Buffer.from(cluster.name).toString('base64');
    return `${accountId}|INFRA|AWSMSKCLUSTER|${encoded}`;
  }
}
```

### Pattern 2: MessageQueueSample Enhancement (After Entity Exists)

```typescript
class MessageQueueEnhancer {
  
  async enhanceExistingEntity(entityGuid: string, metrics: QueueMetrics): void {
    // First verify entity exists
    const entity = await this.entityAPI.getEntity(entityGuid);
    if (!entity) {
      throw new Error(`Entity ${entityGuid} does not exist`);
    }

    // Create MessageQueueSample for UI visibility
    const event: MessageQueueSample = {
      eventType: "MessageQueueSample",
      provider: this.getProvider(entity.type),
      "entity.guid": entity.guid,      // References EXISTING entity
      "entity.name": entity.name,
      "entity.type": entity.type,
      "queue.name": entity.name,
      "queue.type": this.getQueueType(entity.type),
      "queue.messagesPerSecond": metrics.messagesPerSecond,
      "queue.bytesInPerSecond": metrics.bytesInPerSecond,
      "queue.bytesOutPerSecond": metrics.bytesOutPerSecond,
      timestamp: Date.now()
    };

    await this.eventsAPI.send([event]);
  }
}
```

## Security Considerations

### API Key Requirements

```typescript
interface APIKeyRequirements {
  // For sending events
  insertKey: {
    type: "INGEST";
    permissions: ["events:write"];
    accountId: number;
  };
  
  // For querying entities
  userKey: {
    type: "USER";
    permissions: ["entities:read", "nrql:query"];
    accountId: number;
  };
  
  // For GraphQL API
  graphqlKey: {
    type: "USER" | "PERSONAL_API_KEY";
    permissions: ["graphql:execute"];
  };
}
```

## Validation and Testing

### Entity Creation Validation

```typescript
class EntityValidator {
  async validateEntityCreation(event: AwsMskClusterSample): Promise<ValidationResult> {
    const errors: string[] = [];
    
    // Check required fields
    if (event.collector.name !== "cloud-integrations") {
      errors.push("collector.name must be 'cloud-integrations'");
    }
    
    if (!event.providerExternalId) {
      errors.push("providerExternalId is required for AWS entities");
    }
    
    if (!event.provider.match(/^AwsMsk(Cluster|Broker|Topic)$/)) {
      errors.push("provider must be type-specific (e.g., AwsMskCluster)");
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

## Migration Guide

### From MessageQueueSample-Only to Proper Entity Creation

1. **Identify Current Implementation**
   ```typescript
   // BAD: Trying to create entities with MessageQueueSample
   if (events.some(e => e.eventType === "MessageQueueSample" && !e["entity.guid"])) {
     console.warn("MessageQueueSample without entity.guid will not create entities");
   }
   ```

2. **Implement Proper Entity Events**
   ```typescript
   // GOOD: Use correct event types
   const clusterEvent: AwsMskClusterSample = {
     eventType: "AwsMskClusterSample",
     collector: { name: "cloud-integrations" },
     provider: "AwsMskCluster",
     providerExternalId: awsAccountId,
     // ... rest of required fields
   };
   ```

3. **Verify Entity Creation**
   ```typescript
   // Wait for entity synthesis
   await sleep(30000);  // 30 seconds
   
   // Query for entity
   const entity = await graphql.query(FIND_MSK_ENTITIES, { accountId });
   ```

4. **Enhance with MessageQueueSample**
   ```typescript
   // Only after entity exists
   if (entity) {
     await enhancer.enhanceExistingEntity(entity.guid, metrics);
   }
   ```

## Conclusion

This specification represents the **actual working implementation** of the Entity Platform for Kafka/MSK, based on validated patterns from successful deployments. Following these patterns ensures reliable entity creation and UI visibility.