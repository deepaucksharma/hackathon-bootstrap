# Entity Platform Technical Specification for Kafka

## Overview

This specification defines how New Relic's Entity Platform should handle Kafka entities from multiple sources while maintaining security, consistency, and extensibility.

## Entity Platform Core Components

### 1. Entity Identity Service

**Purpose**: Resolve and maintain unique identities across providers

```typescript
interface EntityIdentity {
  // Unique identifier components
  accountId: string;
  domain: 'INFRA';
  type: EntityType;
  identifier: string;
  
  // Computed GUID
  guid: string; // {accountId}|{domain}|{type}|{base64(identifier)}
  
  // Provider context
  provider: Provider;
  externalId?: string; // ARN for AWS, resourceId for Azure, etc.
}

enum EntityType {
  // Generic Kafka types
  KAFKA_CLUSTER = 'KAFKA_CLUSTER',
  KAFKA_BROKER = 'KAFKA_BROKER',
  KAFKA_TOPIC = 'KAFKA_TOPIC',
  KAFKA_CONSUMER_GROUP = 'KAFKA_CONSUMER_GROUP',
  
  // Provider-specific types (legacy)
  AWSMSKCLUSTER = 'AWSMSKCLUSTER',
  AWSMSKBROKER = 'AWSMSKBROKER',
  AWSMSKTOPIC = 'AWSMSKTOPIC'
}

interface Provider {
  type: 'ohi' | 'aws-msk' | 'azure-eventhubs' | 'confluent-cloud';
  source: 'infrastructure-agent' | 'cloud-integration' | 'api';
  metadata: Record<string, any>;
}
```

### 2. Entity Synthesis Engine

**Purpose**: Create and update entities from incoming events

```typescript
class EntitySynthesisEngine {
  // Main synthesis pipeline
  async synthesizeEntity(event: Event): Promise<Entity> {
    // 1. Extract identity
    const identity = this.extractIdentity(event);
    
    // 2. Validate authorization
    await this.validateAuthorization(identity, event);
    
    // 3. Check for existing entity
    const existing = await this.findEntity(identity);
    
    // 4. Create or update
    if (existing) {
      return this.updateEntity(existing, event);
    } else {
      return this.createEntity(identity, event);
    }
  }
  
  private async validateAuthorization(
    identity: EntityIdentity, 
    event: Event
  ): Promise<void> {
    switch (identity.provider.type) {
      case 'aws-msk':
        // Require AWS integration
        if (!await this.hasAWSIntegration(identity.accountId)) {
          throw new UnauthorizedError('AWS integration required for MSK entities');
        }
        break;
        
      case 'ohi':
        // Require valid agent
        if (!this.isValidAgent(event.metadata.agentId)) {
          throw new UnauthorizedError('Invalid infrastructure agent');
        }
        break;
        
      case 'api':
        // Special permission for synthetic entities
        if (!this.hasSyntheticPermission(identity.accountId)) {
          throw new UnauthorizedError('Synthetic entity creation not allowed');
        }
        break;
    }
  }
}
```

### 3. Relationship Manager

**Purpose**: Automatically create and maintain entity relationships

```typescript
interface EntityRelationship {
  sourceGuid: string;
  targetGuid: string;
  type: RelationshipType;
  metadata?: Record<string, any>;
}

enum RelationshipType {
  CONTAINS = 'CONTAINS',        // Cluster -> Broker
  HOSTS = 'HOSTS',             // Broker -> Topic
  CONSUMES = 'CONSUMES',       // ConsumerGroup -> Topic
  PRODUCES_TO = 'PRODUCES_TO', // Producer -> Topic
  RUNS_ON = 'RUNS_ON',        // Broker -> Host
  MANAGED_BY = 'MANAGED_BY'    // Cluster -> AWS Account
}

class RelationshipManager {
  async createRelationships(entity: Entity, event: Event): Promise<void> {
    const relationships = this.inferRelationships(entity, event);
    
    for (const rel of relationships) {
      await this.createRelationship(rel);
    }
  }
  
  private inferRelationships(entity: Entity, event: Event): EntityRelationship[] {
    const relationships: EntityRelationship[] = [];
    
    switch (entity.type) {
      case EntityType.KAFKA_BROKER:
        // Broker belongs to cluster
        relationships.push({
          sourceGuid: this.getClusterGuid(event),
          targetGuid: entity.guid,
          type: RelationshipType.CONTAINS
        });
        
        // Broker runs on host (OHI only)
        if (event.metadata.hostname) {
          relationships.push({
            sourceGuid: entity.guid,
            targetGuid: this.getHostGuid(event.metadata.hostname),
            type: RelationshipType.RUNS_ON
          });
        }
        break;
        
      case EntityType.KAFKA_TOPIC:
        // Topic belongs to cluster
        relationships.push({
          sourceGuid: this.getClusterGuid(event),
          targetGuid: entity.guid,
          type: RelationshipType.HOSTS
        });
        break;
    }
    
    return relationships;
  }
}
```

### 4. Metric Transformation Service

**Purpose**: Normalize metrics across different providers

```typescript
interface MetricDefinition {
  name: string;
  unit: MetricUnit;
  aggregations?: AggregationType[];
  transform?: (value: any) => number;
}

class MetricTransformationService {
  private metricMappings = new Map<string, Map<Provider, string>>([
    ['throughputIn', new Map([
      ['ohi', 'broker.bytesInPerSec'],
      ['aws-msk', 'provider.bytesInPerSec.Average'],
      ['azure-eventhubs', 'IncomingBytes']
    ])],
    ['consumerLag', new Map([
      ['ohi', 'consumer.totalLag'],
      ['aws-msk', 'provider.sumOffsetLag.Average'],
      ['azure-eventhubs', 'ConsumerLag']
    ])]
  ]);
  
  transformMetrics(
    event: Event, 
    provider: Provider
  ): Record<string, MetricValue> {
    const transformed: Record<string, MetricValue> = {};
    
    for (const [canonical, providerMap] of this.metricMappings) {
      const providerMetric = providerMap.get(provider.type);
      if (providerMetric && event.metrics[providerMetric]) {
        transformed[canonical] = this.normalizeMetric(
          event.metrics[providerMetric],
          canonical
        );
      }
    }
    
    return transformed;
  }
}
```

### 5. Entity Lifecycle Manager

**Purpose**: Handle entity state transitions and cleanup

```typescript
interface EntityState {
  reporting: boolean;
  lastSeen: Date;
  alertSeverity?: 'NOT_ALERTING' | 'WARNING' | 'CRITICAL';
  metadata: Record<string, any>;
}

class EntityLifecycleManager {
  async updateEntityState(entity: Entity, event: Event): Promise<void> {
    // Update last seen
    entity.state.lastSeen = new Date();
    
    // Update reporting status
    entity.state.reporting = this.isReporting(event);
    
    // Check for state transitions
    if (this.shouldMarkStale(entity)) {
      await this.markEntityStale(entity);
    }
    
    // Update alert severity
    entity.state.alertSeverity = await this.calculateAlertSeverity(entity);
  }
  
  private isReporting(event: Event): boolean {
    // Entity is reporting if we received data within threshold
    const threshold = 5 * 60 * 1000; // 5 minutes
    return Date.now() - event.timestamp < threshold;
  }
  
  async cleanupStaleEntities(): Promise<void> {
    const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours
    
    const staleEntities = await this.findEntities({
      lastSeen: { $lt: new Date(Date.now() - staleThreshold) },
      provider: { type: { $in: ['ohi', 'api'] } } // Don't cleanup cloud entities
    });
    
    for (const entity of staleEntities) {
      await this.deleteEntity(entity);
    }
  }
}
```

## Event Processing Pipeline

```typescript
class KafkaEventProcessor {
  constructor(
    private synthesisEngine: EntitySynthesisEngine,
    private relationshipManager: RelationshipManager,
    private metricService: MetricTransformationService,
    private lifecycleManager: EntityLifecycleManager
  ) {}
  
  async processEvent(rawEvent: RawEvent): Promise<void> {
    try {
      // 1. Parse and validate event
      const event = this.parseEvent(rawEvent);
      
      // 2. Synthesize entity
      const entity = await this.synthesisEngine.synthesizeEntity(event);
      
      // 3. Transform metrics
      const metrics = this.metricService.transformMetrics(
        event, 
        entity.identity.provider
      );
      
      // 4. Store metrics
      await this.storeMetrics(entity.guid, metrics);
      
      // 5. Create relationships
      await this.relationshipManager.createRelationships(entity, event);
      
      // 6. Update lifecycle
      await this.lifecycleManager.updateEntityState(entity, event);
      
      // 7. Emit entity change event
      await this.emitEntityChange(entity);
      
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        // Log but don't fail - expected for synthetic attempts
        this.logger.warn('Unauthorized entity creation attempt', { 
          event: rawEvent, 
          error 
        });
      } else {
        throw error;
      }
    }
  }
}
```

## Security Model

### Authorization Levels

```typescript
enum AuthorizationLevel {
  NONE = 0,              // No entity creation allowed
  OHI_ONLY = 1,         // Only OHI entities
  CLOUD_INTEGRATED = 2,  // Cloud provider entities
  SYNTHETIC = 3,         // Test/synthetic entities
  ADMIN = 4              // All operations
}

class SecurityPolicy {
  async getAuthorizationLevel(
    accountId: string, 
    provider: Provider
  ): Promise<AuthorizationLevel> {
    // Check for admin override
    if (await this.isAdminAccount(accountId)) {
      return AuthorizationLevel.ADMIN;
    }
    
    // Check for synthetic permission
    if (await this.hasSyntheticPermission(accountId)) {
      return AuthorizationLevel.SYNTHETIC;
    }
    
    // Check cloud integrations
    switch (provider.type) {
      case 'aws-msk':
        if (await this.hasAWSIntegration(accountId)) {
          return AuthorizationLevel.CLOUD_INTEGRATED;
        }
        break;
        
      case 'ohi':
        if (await this.hasInfrastructureAgent(accountId)) {
          return AuthorizationLevel.OHI_ONLY;
        }
        break;
    }
    
    return AuthorizationLevel.NONE;
  }
}
```

## API Extensions

### Synthetic Entity Creation API

```graphql
# GraphQL mutation for creating synthetic entities (requires permission)
mutation CreateSyntheticKafkaEntity($input: SyntheticKafkaEntityInput!) {
  createSyntheticKafkaEntity(input: $input) {
    entity {
      guid
      name
      type
      reporting
    }
    success
    errors {
      message
      field
    }
  }
}

input SyntheticKafkaEntityInput {
  accountId: Int!
  type: KafkaEntityType!
  name: String!
  clusterName: String!
  metadata: JSON
  ttl: Int # Time to live in seconds
}
```

### Entity Query API

```graphql
# Unified query for all Kafka entities
query GetKafkaEntities($accountId: Int!, $filter: KafkaEntityFilter) {
  actor {
    account(id: $accountId) {
      kafka {
        entities(filter: $filter) {
          nodes {
            guid
            name
            type
            provider
            reporting
            metrics {
              throughputIn
              throughputOut
              consumerLag
            }
            relationships {
              source { guid name }
              target { guid name }
              type
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  }
}
```

## Migration Strategy

### Phase 1: Dual Entity Types
- Keep existing AWSMSK* entity types
- Introduce new KAFKA_* entity types
- Map between them in queries

### Phase 2: Provider Abstraction
- All providers create KAFKA_* entities
- Add provider field to distinguish source
- Update UI to use unified types

### Phase 3: Legacy Deprecation
- Migrate existing entities to new types
- Deprecate provider-specific entity types
- Single UI for all Kafka sources

## Benefits of This Architecture

1. **Flexibility**: Support multiple Kafka providers
2. **Security**: Maintain authorization requirements
3. **Consistency**: Unified metrics and relationships
4. **Extensibility**: Easy to add new providers
5. **Backward Compatibility**: Gradual migration path

## Implementation Priority

1. **High Priority**:
   - Synthetic entity creation for testing
   - Metric normalization service
   - Unified KAFKA_* entity types

2. **Medium Priority**:
   - Cross-provider relationship management
   - Advanced lifecycle management
   - API extensions

3. **Low Priority**:
   - Legacy type deprecation
   - Advanced security policies
   - Multi-cloud provider support