# Entity Synthesis Alignment Guide

This guide outlines how our MESSAGE_QUEUE entity synthesis implementation should align with New Relic's entity definitions standards to ensure full compatibility and consistency with the New Relic Entity Platform.

## 1. Domain and Entity Type Standards

### Current Implementation
Our entities use the INFRA domain with MESSAGE_QUEUE prefix:
- `INFRA|MESSAGE_QUEUE_CLUSTER`
- `INFRA|MESSAGE_QUEUE_BROKER`
- `INFRA|MESSAGE_QUEUE_TOPIC`
- `INFRA|MESSAGE_QUEUE_CONSUMER_GROUP`
- `INFRA|MESSAGE_QUEUE_QUEUE`

### Alignment Recommendations

#### A. Consider EXT Domain for Non-Native Entities
Based on New Relic standards, entities that are not native infrastructure components often use the EXT domain:
- `EXT-CONFLUENT-CLOUD-CLUSTER` for Confluent Cloud
- `EXT-PIXIE-REDIS` for Redis via Pixie
- `EXT-SERVICE` for generic services

**Recommendation**: Consider using `EXT-MESSAGE_QUEUE_*` for message queue entities that are not directly infrastructure components.

#### B. AWS-Specific Entity Pattern
For AWS MSK, follow the AWS entity pattern:
- Use `AWS-MSK-CLUSTER`, `AWS-MSK-BROKER`, `AWS-MSK-TOPIC` instead of generic MESSAGE_QUEUE entities
- This aligns with existing patterns like `AWS-CLOUDFRONT`, `AWS-S3`

## 2. Synthesis Rules Alignment

### Standard Pattern from New Relic
```yaml
synthesis:
  rules:
    - identifier: [unique_identifier]
      name: [display_name]
      encodeIdentifierInGUID: true
      conditions:
        - attribute: eventType
          value: KafkaBrokerSample
        - attribute: provider
          value: kafka
      tags:
        broker.id:
          entityTagName: brokerId
        cluster.name:
          entityTagName: clusterName
        hostname:
        instrumentation.provider:
      legacyFeatures:
        overrideGuidType: true
```

### Implementation Updates Needed

```javascript
// Current implementation in entity-synthesis-engine.js
createBrokerEntity(brokerData) {
  // Add synthesis metadata
  const entity = {
    // ... existing fields ...
    
    // Add synthesis metadata for New Relic compatibility
    'nr.synthesis.source': 'nri-kafka',
    'instrumentation.provider': 'nri-kafka',
    'telemetry.sdk.name': 'newrelic-kafka-integration',
    'telemetry.sdk.version': '3.0.0',
    
    // Ensure conditions are traceable
    'synthesis.rules.matched': 'kafka-broker-rule-v1',
    
    // Add legacy features support
    'nr.legacyFeatures.overrideGuidType': true,
    'nr.encodeIdentifierInGUID': true
  };
}
```

## 3. Golden Metrics Standardization

### New Relic Golden Metrics Pattern
```yaml
golden_metrics:
  - title: "Response Time"
    unit: MS
    queries:
      - select: "average(broker.request.latency)"
        where: "provider = 'kafka'"
        facet: ["entity.name"]
        
  - title: "Throughput"
    unit: REQUESTS_PER_MINUTE
    queries:
      - select: "rate(sum(broker.messages.in), 1 minute)"
        
  - title: "Error Rate"
    unit: PERCENTAGE
    queries:
      - select: "(sum(broker.errors) / sum(broker.requests)) * 100"
```

### Implementation Updates

```javascript
// Add golden metrics metadata to entities
const GOLDEN_METRICS = {
  MESSAGE_QUEUE_BROKER: {
    cpuUsage: {
      title: 'CPU Usage',
      unit: 'PERCENTAGE',
      query: 'average(broker.cpu.usage)',
      eventType: 'MessageQueue'
    },
    throughput: {
      title: 'Network Throughput',
      unit: 'BYTES_PER_SECOND',
      query: 'sum(broker.network.throughput)',
      eventType: 'MessageQueue'
    },
    requestLatency: {
      title: 'Request Latency',
      unit: 'MS',
      query: 'average(broker.request.latency)',
      eventType: 'MessageQueue'
    }
  },
  MESSAGE_QUEUE_TOPIC: {
    messagesIn: {
      title: 'Messages In Rate',
      unit: 'COUNT_PER_MINUTE',
      query: 'rate(sum(topic.throughput.in), 1 minute)',
      eventType: 'MessageQueue'
    },
    consumerLag: {
      title: 'Consumer Lag',
      unit: 'COUNT',
      query: 'sum(topic.consumer.lag)',
      eventType: 'MessageQueue'
    }
  }
};

// Add to entity creation
entity['nr.goldenMetrics'] = GOLDEN_METRICS[entityType];
```

## 4. Relationship Definitions

### New Relic Relationship Pattern
```yaml
relationships:
  - name: "MESSAGE_QUEUE_CLUSTER_CONTAINS_BROKERS"
    version: "1"
    origins: ["nri-kafka"]
    conditions:
      - attribute: eventType
        value: MessageQueue
    relationship:
      expires: P75M
      relationshipType: CONTAINS
      source:
        extractGuid:
          attribute: cluster.guid
      target:
        extractGuid:
          attribute: broker.guid
```

### Implementation Updates

```javascript
// Enhance relationship creation with metadata
addRelationship(sourceGuid, type, targetGuid) {
  const relationshipId = `${sourceGuid}-${type}-${targetGuid}`;
  
  this.relationships.set(relationshipId, {
    source: sourceGuid,
    type: type,
    target: targetGuid,
    metadata: {
      createdAt: new Date().toISOString(),
      expires: 'P75M', // 75 minutes
      origin: 'nri-kafka',
      version: '1',
      synthesisRule: this.getRelationshipRule(type)
    }
  });
}

// Define standard relationship rules
const RELATIONSHIP_RULES = {
  CONTAINS: {
    cluster_to_broker: 'MESSAGE_QUEUE_CLUSTER_CONTAINS_BROKERS',
    cluster_to_topic: 'MESSAGE_QUEUE_CLUSTER_CONTAINS_TOPICS'
  },
  MANAGES: {
    broker_to_topic: 'MESSAGE_QUEUE_BROKER_MANAGES_TOPICS'
  },
  CONSUMES_FROM: {
    consumer_to_topic: 'MESSAGE_QUEUE_CONSUMER_CONSUMES_FROM_TOPIC'
  }
};
```

## 5. Tag Standardization

### New Relic Golden Tags Pattern
Based on the entity definitions, we should implement standard golden tags:

```javascript
const GOLDEN_TAGS = {
  // Cloud provider tags
  'cloud.provider': ['aws', 'azure', 'gcp'],
  'cloud.account.id': true,
  'cloud.region': true,
  'cloud.availability_zone': true,
  
  // Kubernetes tags
  'k8s.cluster.name': true,
  'k8s.namespace.name': true,
  'k8s.deployment.name': true,
  
  // Message queue specific
  'mq.provider': ['kafka', 'rabbitmq', 'sqs', 'msk'],
  'mq.cluster.name': true,
  'mq.environment': ['production', 'staging', 'development'],
  
  // Standard infrastructure
  'environment': true,
  'instrumentation.provider': true,
  'service.name': true
};

// Implement in entity creation
function applyGoldenTags(entity, rawData) {
  const goldenTags = {};
  
  // Apply cloud tags
  if (rawData['aws.region']) {
    goldenTags['cloud.provider'] = 'aws';
    goldenTags['cloud.region'] = rawData['aws.region'];
    goldenTags['aws.region'] = rawData['aws.region'];
  }
  
  // Apply k8s tags if present
  if (rawData['k8s.cluster.name']) {
    goldenTags['k8s.cluster.name'] = rawData['k8s.cluster.name'];
  }
  
  // Apply message queue tags
  goldenTags['mq.provider'] = entity.provider;
  goldenTags['mq.cluster.name'] = entity.clusterName;
  goldenTags['environment'] = entity.environment || 'production';
  
  entity.goldenTags = goldenTags;
  entity.tags = { ...entity.tags, ...goldenTags };
}
```

## 6. Entity Configuration Standards

### Expiration Times
```javascript
const ENTITY_EXPIRATION = {
  MESSAGE_QUEUE_CLUSTER: 'EIGHT_DAYS',     // Long-lived infrastructure
  MESSAGE_QUEUE_BROKER: 'EIGHT_DAYS',      // Long-lived infrastructure
  MESSAGE_QUEUE_TOPIC: 'EIGHT_DAYS',       // Topics are persistent
  MESSAGE_QUEUE_CONSUMER_GROUP: 'FOUR_HOURS', // Consumer groups are ephemeral
  MESSAGE_QUEUE_QUEUE: 'EIGHT_DAYS'        // Queues are persistent
};

// Apply to entities
entity.configuration = {
  entityExpirationTime: ENTITY_EXPIRATION[entityType],
  alertable: true
};
```

### Entity Metadata Standards
```javascript
// Add standard New Relic entity metadata
entity['nr.entityType'] = entityType;
entity['nr.domain'] = 'INFRA';
entity['nr.reporting'] = true;
entity['nr.alertable'] = true;
entity['nr.relationships'] = ['CONTAINS', 'MANAGES', 'CONSUMES_FROM'];
```

## 7. Event Type Compatibility

### Map to Standard Event Types
```javascript
const EVENT_TYPE_MAPPING = {
  // For AWS MSK
  'AwsMskClusterSample': 'MESSAGE_QUEUE_CLUSTER',
  'AwsMskBrokerSample': 'MESSAGE_QUEUE_BROKER',
  'AwsMskTopicSample': 'MESSAGE_QUEUE_TOPIC',
  
  // For standard Kafka
  'KafkaClusterSample': 'MESSAGE_QUEUE_CLUSTER',
  'KafkaBrokerSample': 'MESSAGE_QUEUE_BROKER',
  'KafkaTopicSample': 'MESSAGE_QUEUE_TOPIC',
  'KafkaConsumerSample': 'MESSAGE_QUEUE_CONSUMER_GROUP'
};
```

## 8. Multi-Provider Support

### Provider-Specific Synthesis Rules
```javascript
const PROVIDER_SYNTHESIS_RULES = {
  kafka: {
    identifierAttributes: {
      cluster: 'clusterName',
      broker: ['clusterName', 'brokerId', 'hostname'],
      topic: ['clusterName', 'topicName']
    },
    conditions: {
      broker: [
        { attribute: 'eventType', value: 'KafkaBrokerSample' },
        { attribute: 'broker.id', present: true }
      ]
    }
  },
  msk: {
    identifierAttributes: {
      cluster: 'clusterArn',
      broker: ['clusterArn', 'brokerId'],
      topic: ['clusterArn', 'topicName']
    },
    conditions: [
      { attribute: 'provider', value: 'aws.msk' },
      { attribute: 'aws.service', value: 'MSK' }
    ]
  },
  confluent: {
    identifierAttributes: {
      cluster: 'clusterId',
      broker: ['clusterId', 'brokerId'],
      topic: ['clusterId', 'topicName']
    },
    conditions: [
      { attribute: 'provider', value: 'confluent.cloud' }
    ]
  }
};
```

## 9. OpenTelemetry Compatibility

### OTLP Support
```javascript
// Add OpenTelemetry compatibility
entity['otel.resource.attributes'] = {
  'service.name': `${provider}-${entityType.toLowerCase()}`,
  'service.namespace': clusterName,
  'service.instance.id': entity.entityGuid,
  'telemetry.sdk.name': 'opentelemetry',
  'telemetry.sdk.language': 'javascript',
  'telemetry.sdk.version': '1.0.0'
};

// OTLP metric names
const OTLP_METRICS = {
  'broker.cpu.usage': 'process.cpu.utilization',
  'broker.memory.usage': 'process.memory.utilization',
  'broker.network.throughput': 'system.network.io',
  'topic.throughput.in': 'messaging.publish.messages',
  'topic.throughput.out': 'messaging.receive.messages',
  'consumerGroup.lag': 'messaging.consumer.lag'
};
```

## 10. Implementation Checklist

### Phase 1: Core Alignment
- [ ] Update entity domain consideration (INFRA vs EXT)
- [ ] Implement synthesis metadata fields
- [ ] Add golden metrics definitions
- [ ] Standardize relationship metadata
- [ ] Implement golden tags

### Phase 2: Standards Compliance
- [ ] Add entity configuration (expiration, alertable)
- [ ] Implement provider-specific synthesis rules
- [ ] Add OpenTelemetry compatibility
- [ ] Standardize event type mappings

### Phase 3: Advanced Features
- [ ] Multi-cloud support (AWS, Azure, GCP tags)
- [ ] Kubernetes integration tags
- [ ] TTL support for tags
- [ ] Legacy features compatibility

### Phase 4: Validation
- [ ] Validate GUID format compliance
- [ ] Test synthesis rule matching
- [ ] Verify relationship expiration
- [ ] Confirm golden metrics queries

## Example: Fully Aligned Entity

```javascript
{
  // Core entity fields
  "eventType": "MessageQueue",
  "timestamp": 1749510363521,
  "entity.guid": "123456|INFRA|MESSAGE_QUEUE_BROKER|f069097ced1b3fc738e80c852c5a2626",
  "entity.name": "production-kafka-broker-1",
  "entity.type": "MESSAGE_QUEUE_BROKER",
  
  // Standard identifiers
  "provider": "kafka",
  "clusterName": "production-kafka",
  "brokerId": 1,
  "hostname": "broker-1.kafka.prod",
  
  // Golden metrics
  "broker.cpu.usage": 45.2,
  "broker.memory.usage": 62.1,
  "broker.network.throughput": 125000000,
  "broker.request.latency": 1.2,
  
  // Golden tags
  "goldenTags": {
    "environment": "production",
    "cloud.provider": "aws",
    "cloud.region": "us-east-1",
    "mq.provider": "kafka",
    "instrumentation.provider": "nri-kafka"
  },
  
  // Synthesis metadata
  "nr.synthesis.source": "nri-kafka",
  "synthesis.rules.matched": "kafka-broker-rule-v1",
  "nr.encodeIdentifierInGUID": true,
  
  // Configuration
  "configuration": {
    "entityExpirationTime": "EIGHT_DAYS",
    "alertable": true
  },
  
  // OpenTelemetry compatibility
  "otel.resource.attributes": {
    "service.name": "kafka-message-queue-broker",
    "service.namespace": "production-kafka",
    "service.instance.id": "123456|INFRA|MESSAGE_QUEUE_BROKER|f069097ced1b3fc738e80c852c5a2626"
  }
}
```

This alignment ensures our MESSAGE_QUEUE entities are fully compatible with New Relic's Entity Platform while maintaining flexibility for different message queue providers.