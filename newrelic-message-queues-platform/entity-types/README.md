# Message Queue Entity Definitions

This directory contains New Relic entity definition files for MESSAGE_QUEUE entities, following the standards from the [New Relic entity-definitions repository](https://github.com/newrelic/entity-definitions).

## Entity Types

### Infrastructure Domain (INFRA)

#### 1. INFRA-MESSAGE_QUEUE_CLUSTER
- **Purpose**: Represents message queue clusters (Kafka, MSK, Confluent Cloud)
- **Key Metrics**: Health score, throughput, availability, broker count
- **Expiration**: 8 days (long-lived infrastructure)
- **Synthesis**: Based on KafkaClusterSample, AwsMskClusterSample events

#### 2. INFRA-MESSAGE_QUEUE_BROKER
- **Purpose**: Represents individual message brokers within a cluster
- **Key Metrics**: CPU usage, memory usage, network throughput, request latency
- **Expiration**: 8 days (long-lived infrastructure)
- **Synthesis**: Based on KafkaBrokerSample, AwsMskBrokerSample events

### External Domain (EXT)

#### 3. EXT-MESSAGE_QUEUE_TOPIC
- **Purpose**: Represents topics/channels for message routing
- **Key Metrics**: Messages in/out rate, consumer lag, bytes throughput
- **Expiration**: 8 days (topics are persistent)
- **Synthesis**: Based on KafkaTopicSample, AwsMskTopicSample events

#### 4. EXT-MESSAGE_QUEUE_CONSUMER_GROUP
- **Purpose**: Represents consumer groups that process messages
- **Key Metrics**: Total lag, message rate, member count
- **Expiration**: 4 hours (consumer groups are ephemeral)
- **Synthesis**: Based on KafkaConsumerSample, AwsMskConsumerGroupSample events

#### 5. EXT-MESSAGE_QUEUE_QUEUE
- **Purpose**: Represents queues (RabbitMQ, SQS, ActiveMQ)
- **Key Metrics**: Queue depth, publish/delivery rate, consumer count
- **Expiration**: 8 days (queues are persistent)
- **Synthesis**: Based on RabbitmqQueueSample, QueueSample, ActiveMQQueueSample events

## File Structure

Each entity type contains:

### 1. `definition.yml`
Core entity definition including:
- Domain and type specification
- Synthesis rules for creating entities from telemetry
- Golden tags (most important attributes)
- Configuration (alertability, expiration time)

### 2. `golden_metrics.yml`
Key performance indicators:
- Metric definitions with NRQL queries
- Units and display titles
- Support for multiple data sources

### 3. `summary_metrics.yml`
Metrics for entity list view:
- Maximum 3 metrics recommended
- References to golden metrics
- Optimized for quick overview

### 4. `dashboard.json`
Entity summary dashboard:
- JSON format for New Relic dashboards
- Default visualizations for the entity type
- Multiple widgets showing key metrics

## Golden Tags

Common golden tags across all MESSAGE_QUEUE entities:
- `account`, `accountId` - Account identification
- `mq.provider` - Message queue provider (kafka, rabbitmq, sqs, etc.)
- `mq.cluster.name` - Cluster name for grouping
- `environment` - Deployment environment
- `cloud.provider`, `cloud.region` - Cloud infrastructure tags
- `k8s.cluster.name`, `k8s.namespace.name` - Kubernetes tags
- `instrumentation.provider` - Data source (nri-kafka, etc.)

## Synthesis Rules

Each entity type supports multiple synthesis rules for different data sources:

### Standard Integration Support
- **nri-kafka**: Native Kafka integration
- **AWS MSK**: Managed Streaming for Kafka
- **RabbitMQ**: RabbitMQ integration
- **AWS SQS**: Simple Queue Service
- **ActiveMQ**: ActiveMQ integration

### OpenTelemetry Compatibility
All entity types include OpenTelemetry synthesis rules using:
- Standard OTLP metric names
- Service namespace mapping
- Telemetry SDK attributes

## Provider-Specific Synthesis

The definitions support provider-specific entity creation:
- **AWS MSK**: Uses ARN as identifier, includes AWS-specific tags
- **Confluent Cloud**: Uses cluster ID, cloud-native tags
- **Azure Event Hubs**: Azure-specific attributes
- **Generic Kafka**: Standard Kafka deployments

## Usage

These entity definitions enable:

1. **Automatic Entity Creation**: Telemetry data matching synthesis rules creates entities
2. **Golden Metrics**: Pre-defined key metrics for each entity type
3. **Entity Relationships**: Parent-child relationships between clusters, brokers, topics
4. **Dashboards**: Default visualizations for entity monitoring
5. **Alerting**: All entities are alertable for incident management

## Contributing

When adding new entity types or modifying existing ones:
1. Follow the New Relic entity definition standards
2. Include all four files (definition, golden_metrics, summary_metrics, dashboard)
3. Use appropriate domain (INFRA for infrastructure, EXT for logical entities)
4. Set appropriate expiration times
5. Include synthesis rules for common data sources
6. Add OpenTelemetry compatibility where applicable

## Testing

To validate entity definitions:
1. Check YAML syntax is valid
2. Verify NRQL queries in golden_metrics.yml
3. Ensure dashboard JSON is properly formatted
4. Test synthesis rules with sample data
5. Validate entity relationships