# Unified Kafka/MSK Model Implementation Guide

## Implementation Overview

This guide provides practical implementation details for the unified Kafka/MSK domain model, showing how different components work together to provide seamless monitoring.

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Data Sources                                   │
├─────────────────────┬─────────────────────┬────────────────────────────┤
│   Self-Managed      │      AWS MSK        │     Kafka Clients          │
│     Kafka           │                     │    (Producers/Consumers)    │
│                     │                     │                             │
│  ┌──────────┐      │  ┌──────────────┐  │   ┌────────────────┐       │
│  │   JMX    │      │  │  CloudWatch  │  │   │  APM Agents    │       │
│  │ Metrics  │      │  │   Metrics    │  │   │  (Java, Go,    │       │
│  └────┬─────┘      │  └──────┬───────┘  │   │   Python...)   │       │
│       │            │         │           │   └────────┬───────┘       │
└───────┼────────────┴─────────┼───────────┴────────────┼────────────────┘
        │                      │                         │
┌───────┴────────────┬─────────┴───────────┬────────────┴────────────────┐
│                    │                      │                             │
│   nri-kafka        │  CloudWatch Metric  │    APM Transaction          │
│  Integration       │      Streams         │       Events                │
│                    │                      │                             │
└───────┬────────────┴─────────┬───────────┴────────────┬────────────────┘
        │                      │                         │
        ▼                      ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        New Relic Platform                               │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐     │
│  │KafkaBrokerSample│  │AwsMskClusterSample│  │  TransactionEvent │     │
│  │KafkaTopicSample │  │AwsMskBrokerSample │  │  with Kafka tags  │     │
│  │KafkaOffsetSample│  │AwsMskTopicSample  │  └─────────┬─────────┘     │
│  └────────┬────────┘  └─────────┬─────────┘            │               │
│           │                     │                        │               │
│           └─────────────┬───────┘                        │               │
│                         ▼                                │               │
│  ┌──────────────────────────────────────────────────────┴──────────┐   │
│  │                    Entity Synthesis Engine                       │   │
│  │  ┌────────────┐  ┌─────────────┐  ┌──────────────────────┐    │   │
│  │  │   Rules    │  │   Entity    │  │   Relationship       │    │   │
│  │  │  Engine    │  │  Registry   │  │     Builder          │    │   │
│  │  └────────────┘  └─────────────┘  └──────────────────────┘    │   │
│  └──────────────────────────┬──────────────────────────────────────┘   │
│                             ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Unified Entity Model                         │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐    │   │
│  │  │KAFKACLUSTER │  │AWSMSKCLUSTER │  │ KAFKACONSUMERGROUP │    │   │
│  │  │KAFKABROKER  │  │AWSMSKBROKER  │  └────────────────────┘    │   │
│  │  │KAFKATOPIC   │  │AWSMSKTOPIC   │                             │   │
│  │  └─────────────┘  └──────────────┘                             │   │
│  └──────────────────────────┬──────────────────────────────────────┘   │
│                             ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │               MessageQueueSample Generation                      │   │
│  └──────────────────────────┬──────────────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         User Interface                                   │
├─────────────────────┬──────────────────────┬────────────────────────────┤
│  Message Queues UI  │  Infrastructure UI   │      APM UI                │
│  (Kafka/MSK View)   │  (Entity Explorer)   │  (Service Maps)            │
└─────────────────────┴──────────────────────┴────────────────────────────┘
```

## Implementation Components

### 1. Data Collection Implementation

#### Self-Managed Kafka (nri-kafka)

```yaml
# kafka-config.yml
integrations:
  - name: nri-kafka
    env:
      CLUSTER_NAME: "production-kafka"
      ZOOKEEPER_HOSTS: '[{"host": "zk1.example.com", "port": 2181}]'
      BOOTSTRAP_BROKER_HOST: "kafka1.example.com"
      JMX_HOST: "kafka1.example.com"
      JMX_PORT: 9999
      PRODUCER_CONSUMER_METRICS: true
      TOPIC_LIST: '["critical-events", "user-actions"]'
```

#### AWS MSK (CloudWatch Integration)

```yaml
# CloudWatch Metric Streams Configuration
MetricStreamConfig:
  RoleArn: "arn:aws:iam::123456789:role/NewRelicMetricStream"
  OutputFormat: "opentelemetry0.7"
  FirehoseArn: "arn:aws:firehose:us-east-1:123456789:deliverystream/NewRelicStream"
  IncludeFilters:
    - Namespace: "AWS/Kafka"
      MetricNames:
        - ActiveControllerCount
        - OfflinePartitionsCount
        - BytesInPerSec
        - BytesOutPerSec
```

### 2. Entity Synthesis Implementation

#### Synthesis Rules Engine

```javascript
// synthesis-rules.js
const KAFKA_SYNTHESIS_RULES = [
  {
    name: "kafka-cluster-from-broker",
    input: {
      eventType: "KafkaBrokerSample",
      conditions: [
        "clusterName != null",
        "broker.id == 1"  // Use first broker for cluster entity
      ]
    },
    output: {
      entity: {
        domain: "INFRA",
        type: "KAFKACLUSTER",
        name: "${clusterName}",
        guid: "${accountId}|INFRA|KAFKACLUSTER|${base64(clusterName)}"
      },
      attributes: {
        "kafka.cluster.name": "${clusterName}",
        "kafka.bootstrap.servers": "${broker.host}:${broker.port}",
        "kafka.zookeeper.connect": "${zookeeperHosts}"
      },
      tags: {
        provider: "Kafka",
        environment: "${tags.environment || 'production'}"
      }
    }
  },
  {
    name: "msk-cluster-synthesis",
    input: {
      eventType: "AwsMskClusterSample",
      conditions: [
        "entityGuid != null"
      ]
    },
    output: {
      entity: {
        domain: "INFRA",
        type: "AWSMSKCLUSTER",
        name: "${entityName}",
        guid: "${entityGuid}"
      },
      attributes: {
        "aws.msk.clusterArn": "${provider.clusterArn}",
        "aws.msk.clusterState": "${provider.clusterState}",
        "aws.region": "${aws.region}",
        "aws.accountId": "${aws.accountId}"
      },
      tags: {
        provider: "AwsMsk",
        region: "${aws.region}"
      }
    }
  }
];
```

#### MessageQueueSample Generator

```javascript
// messagequeue-generator.js
class MessageQueueGenerator {
  constructor(entityRegistry) {
    this.entityRegistry = entityRegistry;
  }

  async generateFromEntity(entity, metrics) {
    const baseEvent = {
      eventType: "MessageQueueSample",
      provider: this.getProvider(entity),
      "entity.guid": entity.guid,
      "entity.name": entity.name,
      "entity.type": entity.type,
      timestamp: Date.now()
    };

    switch (entity.type) {
      case "KAFKACLUSTER":
      case "AWSMSKCLUSTER":
        return this.generateClusterEvent(baseEvent, entity, metrics);
      
      case "KAFKABROKER":
      case "AWSMSKBROKER":
        return this.generateBrokerEvent(baseEvent, entity, metrics);
      
      case "KAFKATOPIC":
      case "AWSMSKTOPIC":
        return this.generateTopicEvent(baseEvent, entity, metrics);
      
      default:
        return null;
    }
  }

  generateClusterEvent(base, entity, metrics) {
    return {
      ...base,
      "queue.name": entity.name,
      "queue.type": "kafka",
      "queue.messagesPerSecond": metrics.totalMessagesPerSec || 0,
      "queue.bytesInPerSecond": metrics.totalBytesInPerSec || 0,
      "queue.bytesOutPerSecond": metrics.totalBytesOutPerSec || 0,
      "queue.brokerCount": metrics.brokerCount || 0,
      "queue.topicCount": metrics.topicCount || 0,
      "queue.partitionCount": metrics.partitionCount || 0,
      "queue.underReplicatedPartitions": metrics.underReplicatedPartitions || 0,
      "queue.offlinePartitions": metrics.offlinePartitions || 0,
      "collector.name": this.getCollectorName(entity),
      "instrumentation.provider": "newrelic",
      "instrumentation.name": this.getInstrumentationName(entity)
    };
  }

  getProvider(entity) {
    if (entity.type.startsWith("AWSMSK")) return "AwsMsk";
    if (entity.type.startsWith("KAFKA")) return "Kafka";
    return "Unknown";
  }

  getCollectorName(entity) {
    if (entity.type.startsWith("AWSMSK")) return "cloudwatch-metric-streams";
    return "infrastructure-agent";
  }
}
```

### 3. Query Implementation

#### UI Query Examples

```sql
-- Message Queues UI Main Query
FROM MessageQueueSample
SELECT 
  latest(entity.name) as 'Cluster',
  latest(queue.brokerCount) as 'Brokers',
  latest(queue.topicCount) as 'Topics',
  rate(sum(queue.messagesPerSecond), 1 minute) as 'Messages/min',
  latest(queue.underReplicatedPartitions) as 'Under-replicated',
  latest(queue.offlinePartitions) as 'Offline'
WHERE provider IN ('Kafka', 'AwsMsk')
  AND entity.type IN ('KAFKACLUSTER', 'AWSMSKCLUSTER')
FACET entity.guid
SINCE 1 hour ago

-- Broker Health Query
FROM MessageQueueSample
SELECT 
  latest(entity.name) as 'Broker',
  rate(sum(queue.messagesPerSecond), 1 minute) as 'Msg/min',
  average(queue.requestHandlerIdlePercent) as 'Handler Idle %',
  average(queue.networkProcessorIdlePercent) as 'Network Idle %'
WHERE entity.type IN ('KAFKABROKER', 'AWSMSKBROKER')
FACET entity.guid
TIMESERIES

-- Consumer Lag Monitoring
FROM MessageQueueSample
SELECT 
  max(queue.consumerLag) as 'Max Lag',
  average(queue.consumerLag) as 'Avg Lag'
WHERE entity.type = 'KAFKACONSUMERGROUP'
FACET entity.name, queue.topic
TIMESERIES
```

### 4. Relationship Queries

```graphql
# Get Kafka topology
query KafkaTopology($clusterGuid: EntityGuid!) {
  actor {
    entity(guid: $clusterGuid) {
      name
      type
      relationships {
        type
        target {
          entity {
            guid
            name
            type
            ... on InfrastructureEntity {
              reporting
              alertSeverity
            }
          }
        }
      }
    }
  }
}
```

## Monitoring Scenarios

### Scenario 1: Unified Dashboard

```json
{
  "dashboard": "Kafka/MSK Unified View",
  "widgets": [
    {
      "title": "All Kafka Clusters",
      "nrql": "FROM MessageQueueSample SELECT latest(queue.brokerCount) WHERE entity.type IN ('KAFKACLUSTER', 'AWSMSKCLUSTER') FACET entity.name"
    },
    {
      "title": "Message Throughput",
      "nrql": "FROM MessageQueueSample SELECT rate(sum(queue.messagesPerSecond), 1 minute) WHERE provider IN ('Kafka', 'AwsMsk') FACET provider TIMESERIES"
    },
    {
      "title": "Consumer Lag by Cluster",
      "nrql": "FROM MessageQueueSample SELECT max(queue.consumerLag) WHERE queue.consumerLag > 0 FACET parentCluster TIMESERIES"
    }
  ]
}
```

### Scenario 2: Migration Monitoring

```sql
-- Compare self-managed vs MSK performance
FROM MessageQueueSample
SELECT 
  average(queue.messagesPerSecond) as 'Avg Messages/sec',
  average(queue.bytesInPerSecond/1024/1024) as 'Avg MB/sec In',
  average(queue.bytesOutPerSecond/1024/1024) as 'Avg MB/sec Out'
WHERE entity.type IN ('KAFKACLUSTER', 'AWSMSKCLUSTER')
FACET provider
COMPARE WITH 1 week ago
```

### Scenario 3: Alert Conditions

```yaml
Alerts:
  - name: "Kafka Offline Partitions"
    nrql: |
      FROM MessageQueueSample 
      SELECT latest(queue.offlinePartitions) 
      WHERE entity.type IN ('KAFKACLUSTER', 'AWSMSKCLUSTER')
    threshold: "> 0"
    
  - name: "High Consumer Lag"
    nrql: |
      FROM MessageQueueSample 
      SELECT max(queue.consumerLag) 
      WHERE entity.type = 'KAFKACONSUMERGROUP'
    threshold: "> 10000"
    
  - name: "Broker Disk Usage"
    nrql: |
      FROM MessageQueueSample 
      SELECT average(queue.diskUsagePercent) 
      WHERE entity.type IN ('KAFKABROKER', 'AWSMSKBROKER')
    threshold: "> 85"
```

## Best Practices

1. **Entity Naming**: Use consistent naming patterns
   - Clusters: `<environment>-<purpose>-kafka`
   - Topics: `<domain>.<event-type>.<version>`

2. **Tagging Strategy**: Apply consistent tags
   - `environment`: prod, staging, dev
   - `team`: owner team
   - `cost-center`: for cost allocation

3. **Metric Collection**: Balance granularity vs cost
   - Critical clusters: 30-second intervals
   - Non-critical: 5-minute intervals

4. **Entity Relationships**: Maintain accurate topology
   - Regular validation of relationships
   - Automated cleanup of stale entities

5. **Performance Optimization**:
   - Use MessageQueueSample for UI queries
   - Direct event queries for debugging
   - Cached dashboards for high-traffic views