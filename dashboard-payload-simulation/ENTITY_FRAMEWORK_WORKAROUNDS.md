# Entity Framework Workaround Strategies

## Overview
After extensive testing, we discovered that New Relic's entity synthesis requires AWS cloud integration and won't create entities from synthetic events alone. This document explores creative workarounds to bypass these limitations.

## Workaround Strategies

### 1. Infrastructure Agent Pattern (Most Promising)
**File**: `infrastructure-agent-simulator.js`

**Approach**: Simulate the infrastructure agent's complete flow including:
- Agent connect events
- Integration discovery
- Host entity creation first
- Then Kafka integration events

**Why it might work**: Infrastructure agent has different permissions and might bypass AWS checks.

```javascript
// Simulate agent registration
{
  "eventType": "SystemSample",
  "entityKey": "host:kafka-server",
  "hostname": "kafka-server",
  "collector.name": "infrastructure-agent",
  "agent.version": "1.28.0"
}
```

### 2. Dual Event Strategy
**File**: `test-dual-event-strategy.js`

**Approach**: Send both MessageQueueSample AND AwsMsk*Sample events simultaneously
- MessageQueueSample for UI visibility
- AwsMsk*Sample for entity creation
- Link them via shared identifiers

**Enhancement**: Add timing delays between events to simulate real integration behavior.

### 3. SystemSample Injection
**New Approach**: Use Infrastructure's SystemSample events

```javascript
{
  "eventType": "SystemSample",
  "entityKey": "kafka:cluster:my-cluster",
  "hostname": "kafka-broker-1",
  "collector.name": "infrastructure-agent",
  "integration.name": "com.newrelic.kafka",
  "integration.version": "2.13.0",
  // Inject Kafka metrics as custom attributes
  "kafka.cluster.name": "my-cluster",
  "kafka.broker.id": "1",
  "kafka.bytesInPerSec": 1000000
}
```

### 4. ProcessSample Hijacking
**New Approach**: Use ProcessSample events to create process entities that look like Kafka

```javascript
{
  "eventType": "ProcessSample",
  "entityKey": "process:kafka-broker",
  "processDisplayName": "Kafka Broker",
  "commandLine": "kafka.Kafka /etc/kafka/server.properties",
  "collector.name": "infrastructure-agent",
  // Add Kafka metrics
  "kafka.metrics.bytesIn": 1000000
}
```

### 5. GraphQL Mutation Hack
**Exploratory**: Try undocumented GraphQL mutations

```graphql
mutation CreateEntity {
  entityCreate(input: {
    domain: "INFRA",
    type: "KAFKA_BROKER",
    name: "my-broker",
    tags: [
      {key: "clusterName", value: "my-cluster"},
      {key: "brokerId", value: "1"}
    ]
  }) {
    entity {
      guid
      name
    }
  }
}
```

### 6. APM Service Bridge
**File**: Create new approach using APM

**Approach**: Create APM service entities that represent Kafka components
- Use APM's more flexible entity creation
- Link them using PRODUCES/CONSUMES relationships
- Leverage distributed tracing

```javascript
{
  "eventType": "Transaction",
  "appName": "kafka-broker-1",
  "name": "WebTransaction/Kafka/Broker",
  "duration": 0.1,
  "kafka.cluster": "my-cluster",
  "kafka.role": "broker"
}
```

### 7. Custom Integration Registration
**New Approach**: Register a custom integration that mimics AWS

```javascript
{
  "eventType": "IntegrationProviderSample",
  "provider.name": "CustomKafkaProvider",
  "provider.type": "kafka",
  "integration.name": "custom-kafka",
  "integration.version": "1.0.0",
  "collector.name": "custom-integration"
}
```

### 8. Inventory Event Manipulation
**New Approach**: Use inventory events which have different rules

```javascript
{
  "eventType": "InfrastructureEvent",
  "category": "inventory",
  "summary": "kafka-cluster-inventory",
  "kafka/cluster": {
    "name": "my-cluster",
    "brokers": ["broker-1", "broker-2"],
    "topics": ["topic-1", "topic-2"]
  }
}
```

### 9. Mock AWS Integration Response
**Advanced**: Simulate AWS integration responses

1. Create events that look like they came from AWS integration
2. Include AWS-specific fields like assumeRole results
3. Use exact collector.name from real AWS integrations

```javascript
{
  "eventType": "AwsMskBrokerSample",
  "collector.name": "cloudwatch-metric-streams",
  "collector.version": "1.8.0",
  "aws.assumeRoleSuccess": true,
  "aws.integrationConfig": {
    "services": ["kafka"],
    "accountId": "123456789012"
  }
}
```

### 10. Legacy Event Types
**Exploration**: Try older event formats

```javascript
{
  "eventType": "KafkaBrokerSample", // Without Aws prefix
  "collector.name": "nri-kafka",
  "integration.name": "com.newrelic.kafka",
  "integration.version": "1.0.0"
}
```

## Implementation Priority

1. **Infrastructure Agent Pattern** - Most likely to succeed
2. **SystemSample Injection** - Uses existing entity types
3. **APM Service Bridge** - Different entity creation path
4. **Mock AWS Integration** - If we can reverse-engineer the exact format

## Testing Strategy

1. Start with Infrastructure Agent simulator
2. Layer in SystemSample events
3. Add timing delays to simulate real behavior
4. Monitor Entity table after each approach
5. Check for any partial entity creation

## Key Insights

- Entity synthesis has multiple paths (AWS, Infrastructure, APM)
- Infrastructure agent has special privileges
- SystemSample events create host entities reliably
- APM creates entities more freely
- Timing and order of events matters

## Next Steps

1. Enhance infrastructure-agent-simulator.js with full flow
2. Create SystemSample injector
3. Build APM service bridge
4. Test each approach with 5-minute wait
5. Combine successful approaches
EOF < /dev/null