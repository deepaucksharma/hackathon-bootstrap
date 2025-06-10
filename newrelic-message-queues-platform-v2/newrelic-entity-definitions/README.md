# Entity Definitions - Message Queues Platform

This repository holds the entity type definitions for the New Relic Message Queues Platform implementation, following the New Relic entity definitions standards.

## Overview

This implementation defines the complete data model for New Relic's Queues & Streaming platform, providing a unified observability solution for heterogeneous messaging architectures.

## Entity Types

The Message Queues Platform defines the following entity types:

### Core Entity Types

| Entity Type | Domain | Description |
|-------------|--------|-------------|
| MESSAGE_QUEUE_CLUSTER | INFRA | Represents a message queue cluster (Kafka, RabbitMQ, etc.) |
| MESSAGE_QUEUE_BROKER | INFRA | Individual broker/node within a cluster |
| MESSAGE_QUEUE_TOPIC | INFRA | Message topic or stream |
| MESSAGE_QUEUE_QUEUE | INFRA | Message queue (RabbitMQ, SQS, etc.) |
| MESSAGE_QUEUE_CONSUMER_GROUP | INFRA | Consumer group managing consumption |

### Entity Hierarchy

```
ACCOUNT
  └── CLUSTER
      ├── BROKER/NODE
      │   └── PARTITION
      ├── TOPIC/QUEUE
      │   └── PARTITION
      └── CONSUMER_GROUP
          └── CONSUMER
```

## Supported Technologies

| Technology | Provider | Integration Method | Maturity |
|------------|----------|-------------------|----------|
| Apache Kafka | Self-Managed | On-Host (JMX) | GA |
| Amazon MSK | AWS | CloudWatch Metrics | GA |
| Confluent Cloud | Confluent | REST API | GA |
| RabbitMQ | Self-Managed | Management API | GA |
| Amazon SQS | AWS | CloudWatch | GA |
| Azure Service Bus | Azure | Azure Monitor | Preview |
| Google Cloud Pub/Sub | GCP | Cloud Monitoring | Preview |

## Getting Started

For detailed documentation on entity definitions:
- [Entity Model](docs/entities/README.md)
- [Synthesis Rules](docs/entities/synthesis.md)
- [GUID Specification](docs/entities/guid_spec.md)
- [Golden Metrics](docs/entities/golden_metrics.md)
- [Entity Summary](docs/entities/entity_summary.md)

## Design Principles

1. **Unified Model**: Single conceptual model across all messaging technologies
2. **Provider Agnostic**: Abstract provider differences while preserving unique capabilities
3. **Scale First**: Built for enterprise scale from day one
4. **Intelligence Native**: AI/ML capabilities built into the platform
5. **Open Standards**: Embrace industry standards (OpenTelemetry, W3C trace context)

## Implementation Status

| Entity Type | Status | Compliance |
|-------------|--------|------------|
| MESSAGE_QUEUE_CLUSTER | ✅ Complete | 100% |
| MESSAGE_QUEUE_BROKER | ✅ Complete | 95% |
| MESSAGE_QUEUE_TOPIC | ✅ Complete | 90% |
| MESSAGE_QUEUE_QUEUE | ⚠️ Basic | 70% |
| MESSAGE_QUEUE_CONSUMER_GROUP | ⚠️ Basic | 65% |

## Contributing

When contributing entity definitions:
1. Follow the New Relic entity definition standards
2. Ensure proper GUID generation
3. Include all required metadata fields
4. Define appropriate golden metrics
5. Add comprehensive test coverage

## License

This project follows the same licensing as the New Relic entity definitions repository.