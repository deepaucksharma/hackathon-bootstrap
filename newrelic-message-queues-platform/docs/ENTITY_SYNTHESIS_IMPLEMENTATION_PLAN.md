# Entity Synthesis Implementation Plan

This document outlines specific code changes needed to align our entity synthesis implementation with New Relic's entity definitions standards.

## Priority 1: Core Entity Structure Updates

### 1.1 Update Entity Type Definitions

**File**: `core/entity-synthesis/entity-synthesis-engine.js`

```javascript
// Add after line 24 in constructor
// Enhanced entity type definitions with domain support
this.entityDomains = {
  INFRA: ['MESSAGE_QUEUE_BROKER', 'MESSAGE_QUEUE_CLUSTER'],
  EXT: ['MESSAGE_QUEUE_TOPIC', 'MESSAGE_QUEUE_CONSUMER_GROUP', 'MESSAGE_QUEUE_QUEUE']
};

// Add provider-specific entity types
this.providerEntityTypes = {
  'aws.msk': {
    CLUSTER: 'AWS-MSK-CLUSTER',
    BROKER: 'AWS-MSK-BROKER', 
    TOPIC: 'AWS-MSK-TOPIC'
  },
  'confluent.cloud': {
    CLUSTER: 'EXT-CONFLUENT-CLOUD-CLUSTER'
  }
};
```

### 1.2 Add Synthesis Metadata

**Update** `createClusterEntity()` method:

```javascript
createClusterEntity(clusterData) {
  const clusterName = clusterData.clusterName;
  const provider = clusterData.provider || this.config.provider;
  
  // Determine entity type based on provider
  const entityType = this.getEntityTypeForProvider(provider, 'CLUSTER');
  const domain = this.getEntityDomain(entityType);
  
  const guid = this.generateGuid(entityType, clusterName);
  
  const entity = {
    // Core entity fields
    eventType: 'MessageQueue',
    timestamp: Date.now(),
    'entity.guid': guid,
    'entity.name': clusterName,
    'entity.type': entityType,
    entityGuid: guid,
    entityType: entityType,
    
    // Synthesis metadata
    'nr.synthesis.source': 'nri-kafka',
    'nr.synthesis.id': clusterName,
    'nr.synthesis.name': clusterName,
    'instrumentation.provider': this.getInstrumentationProvider(provider),
    'telemetry.sdk.name': 'newrelic-kafka-integration',
    'telemetry.sdk.version': '3.0.0',
    'synthesis.rules.matched': `${provider}-cluster-rule-v1`,
    'nr.encodeIdentifierInGUID': true,
    'nr.legacyFeatures.overrideGuidType': true,
    
    // Configuration
    configuration: {
      entityExpirationTime: 'EIGHT_DAYS',
      alertable: true
    },
    
    // ... rest of existing fields ...
  };
  
  // Apply golden tags
  this.applyGoldenTags(entity, clusterData);
  
  return entity;
}
```

### 1.3 Implement Golden Tags System

**Add new method**:

```javascript
applyGoldenTags(entity, rawData) {
  const goldenTags = [];
  const tags = entity.tags || {};
  
  // Standard golden tags based on entity type
  const GOLDEN_TAG_DEFINITIONS = {
    MESSAGE_QUEUE_CLUSTER: [
      'environment',
      'mq.provider',
      'cloud.provider',
      'cloud.region',
      'k8s.cluster.name'
    ],
    MESSAGE_QUEUE_BROKER: [
      'environment', 
      'mq.provider',
      'mq.cluster.name',
      'hostname',
      'cloud.availability_zone'
    ],
    MESSAGE_QUEUE_TOPIC: [
      'environment',
      'mq.provider', 
      'mq.cluster.name',
      'topic.classification'
    ],
    MESSAGE_QUEUE_CONSUMER_GROUP: [
      'environment',
      'mq.provider',
      'mq.cluster.name',
      'consumer.type'
    ]
  };
  
  // Apply golden tags for entity type
  const applicableTags = GOLDEN_TAG_DEFINITIONS[entity.entityType] || [];
  
  applicableTags.forEach(tagName => {
    if (tags[tagName]) {
      goldenTags.push(tagName);
    }
  });
  
  // Cloud provider detection
  if (rawData['aws.region'] || rawData['aws.awsRegion']) {
    tags['cloud.provider'] = 'aws';
    tags['cloud.region'] = rawData['aws.region'] || rawData['aws.awsRegion'];
    tags['aws.region'] = tags['cloud.region'];
    
    if (rawData['aws.availabilityZone']) {
      tags['cloud.availability_zone'] = rawData['aws.availabilityZone'];
    }
  }
  
  // Kubernetes detection  
  if (rawData['k8s.cluster.name']) {
    tags['k8s.cluster.name'] = rawData['k8s.cluster.name'];
    tags['k8s.namespace.name'] = rawData['k8s.namespace.name'];
  }
  
  // Message queue specific tags
  tags['mq.provider'] = entity.provider;
  tags['mq.cluster.name'] = entity.clusterName;
  
  entity.tags = tags;
  entity.goldenTags = goldenTags;
}
```

## Priority 2: Golden Metrics Implementation

### 2.1 Add Golden Metrics Definitions

**Create new file**: `core/entity-synthesis/golden-metrics-definitions.js`

```javascript
module.exports = {
  MESSAGE_QUEUE_CLUSTER: [
    {
      name: 'health.score',
      title: 'Health Score',
      unit: 'PERCENTAGE',
      query: {
        select: 'latest(cluster.health.score)',
        from: 'MessageQueue',
        where: "entity.type = 'MESSAGE_QUEUE_CLUSTER'"
      }
    },
    {
      name: 'throughput.total',
      title: 'Total Throughput',
      unit: 'BYTES_PER_SECOND',
      query: {
        select: 'sum(cluster.throughput.total)',
        from: 'MessageQueue'
      }
    },
    {
      name: 'availability',
      title: 'Availability',
      unit: 'PERCENTAGE',
      query: {
        select: 'average(cluster.availability)',
        from: 'MessageQueue'
      }
    }
  ],
  
  MESSAGE_QUEUE_BROKER: [
    {
      name: 'cpu.usage',
      title: 'CPU Usage',
      unit: 'PERCENTAGE',
      query: {
        select: 'average(broker.cpu.usage)',
        from: 'MessageQueue',
        where: "entity.type = 'MESSAGE_QUEUE_BROKER'"
      }
    },
    {
      name: 'network.throughput',
      title: 'Network Throughput',
      unit: 'BYTES_PER_SECOND',
      query: {
        select: 'sum(broker.network.throughput)',
        from: 'MessageQueue'
      }
    },
    {
      name: 'request.latency',
      title: 'Request Latency',
      unit: 'MS',
      query: {
        select: 'average(broker.request.latency)',
        from: 'MessageQueue'
      }
    }
  ],
  
  MESSAGE_QUEUE_TOPIC: [
    {
      name: 'throughput.in',
      title: 'Messages In Rate',
      unit: 'COUNT_PER_MINUTE',
      query: {
        select: 'rate(sum(topic.throughput.in), 1 minute)',
        from: 'MessageQueue'
      }
    },
    {
      name: 'consumer.lag',
      title: 'Consumer Lag',
      unit: 'COUNT',
      query: {
        select: 'sum(topic.consumer.lag)',
        from: 'MessageQueue'
      }
    },
    {
      name: 'throughput.out',
      title: 'Messages Out Rate',
      unit: 'COUNT_PER_MINUTE',
      query: {
        select: 'rate(sum(topic.throughput.out), 1 minute)',
        from: 'MessageQueue'
      }
    }
  ]
};
```

### 2.2 Attach Golden Metrics to Entities

**Update entity creation methods**:

```javascript
// Import golden metrics
const GOLDEN_METRICS = require('./golden-metrics-definitions');

// In entity creation methods, add:
entity['nr.goldenMetrics'] = GOLDEN_METRICS[entityType];

// Also add summary metrics (top 3)
entity['nr.summaryMetrics'] = GOLDEN_METRICS[entityType].slice(0, 3).map(m => m.name);
```

## Priority 3: Enhanced Relationship Management

### 3.1 Update Relationship Creation

**Update** `addRelationship()` method:

```javascript
addRelationship(sourceGuid, type, targetGuid, metadata = {}) {
  const relationshipId = `${sourceGuid}-${type}-${targetGuid}`;
  
  // Determine relationship rule name
  const ruleName = this.getRelationshipRuleName(
    this.getEntityTypeFromGuid(sourceGuid),
    type,
    this.getEntityTypeFromGuid(targetGuid)
  );
  
  this.relationships.set(relationshipId, {
    source: sourceGuid,
    type: type,
    target: targetGuid,
    metadata: {
      createdAt: new Date().toISOString(),
      expires: 'P75M', // 75 minutes default
      origin: 'nri-kafka',
      version: '1',
      synthesisRule: ruleName,
      ...metadata
    }
  });
}

// Helper method
getRelationshipRuleName(sourceType, relationshipType, targetType) {
  const ruleMap = {
    'MESSAGE_QUEUE_CLUSTER-CONTAINS-MESSAGE_QUEUE_BROKER': 'CLUSTER_CONTAINS_BROKERS_V1',
    'MESSAGE_QUEUE_CLUSTER-CONTAINS-MESSAGE_QUEUE_TOPIC': 'CLUSTER_CONTAINS_TOPICS_V1',
    'MESSAGE_QUEUE_BROKER-MANAGES-MESSAGE_QUEUE_TOPIC': 'BROKER_MANAGES_TOPICS_V1',
    'MESSAGE_QUEUE_CONSUMER_GROUP-CONSUMES_FROM-MESSAGE_QUEUE_TOPIC': 'CONSUMER_READS_TOPIC_V1'
  };
  
  const key = `${sourceType}-${relationshipType}-${targetType}`;
  return ruleMap[key] || 'GENERIC_RELATIONSHIP_V1';
}
```

## Priority 4: Provider-Specific Enhancements

### 4.1 Add Provider Detection

**Add new method**:

```javascript
detectProvider(rawData) {
  // AWS MSK detection
  if (rawData.clusterArn && rawData.clusterArn.includes(':kafka:')) {
    return 'aws.msk';
  }
  
  // Confluent Cloud detection
  if (rawData.clusterId && rawData.provider === 'confluent') {
    return 'confluent.cloud';
  }
  
  // Azure Event Hubs detection
  if (rawData.eventHubNamespace) {
    return 'azure.eventhubs';
  }
  
  // Default to kafka
  return rawData.provider || 'kafka';
}
```

### 4.2 Provider-Specific Entity Types

```javascript
getEntityTypeForProvider(provider, baseType) {
  const providerTypes = this.providerEntityTypes[provider];
  if (providerTypes && providerTypes[baseType]) {
    return providerTypes[baseType];
  }
  
  // Default MESSAGE_QUEUE types
  return `MESSAGE_QUEUE_${baseType}`;
}
```

## Priority 5: OpenTelemetry Compatibility

### 5.1 Add OTLP Resource Attributes

**Update entity creation**:

```javascript
// Add to all entity creation methods
entity['otel.resource.attributes'] = {
  'service.name': `${provider}-${entityType.toLowerCase().replace('_', '-')}`,
  'service.namespace': entity.clusterName,
  'service.instance.id': entity.entityGuid,
  'telemetry.sdk.name': 'opentelemetry',
  'telemetry.sdk.language': 'javascript',
  'telemetry.sdk.version': '1.0.0',
  'deployment.environment': entity.environment || 'production'
};

// Map metrics to OTLP conventions
const OTLP_METRIC_MAPPING = {
  'broker.cpu.usage': 'process.cpu.utilization',
  'broker.memory.usage': 'process.memory.utilization',
  'broker.network.throughput': 'system.network.io',
  'topic.throughput.in': 'messaging.kafka.messages.produced',
  'topic.throughput.out': 'messaging.kafka.messages.consumed',
  'consumerGroup.lag': 'messaging.kafka.consumer.lag'
};
```

## Implementation Timeline

### Week 1: Core Updates
1. Update entity type definitions
2. Add synthesis metadata
3. Implement golden tags system
4. Update GUID generation

### Week 2: Metrics and Relationships
1. Implement golden metrics definitions
2. Enhance relationship management
3. Add relationship expiration
4. Update validation logic

### Week 3: Provider Support
1. Add provider detection
2. Implement provider-specific types
3. Add AWS MSK support
4. Add Confluent Cloud support

### Week 4: Standards Compliance
1. Add OpenTelemetry compatibility
2. Implement configuration standards
3. Add legacy features support
4. Complete testing and validation

## Testing Checklist

- [ ] Verify GUID format: `{accountId}|{DOMAIN}|{TYPE}|{hash}`
- [ ] Test synthesis metadata presence
- [ ] Validate golden tags application
- [ ] Confirm golden metrics attachment
- [ ] Test relationship metadata
- [ ] Verify provider detection
- [ ] Test OpenTelemetry attributes
- [ ] Validate entity expiration settings

## Migration Considerations

1. **Backward Compatibility**: Maintain support for existing entity GUIDs
2. **Gradual Rollout**: Use feature flags for new functionality
3. **Data Migration**: Script to update existing entities with new metadata
4. **Monitoring**: Track entity creation success rates

This implementation plan ensures our entity synthesis fully aligns with New Relic's entity definitions standards while maintaining backward compatibility and supporting multiple message queue providers.