# Entity Definitions Documentation - Message Queues Platform

Welcome to the documentation for Message Queue entity definitions. This documentation covers the complete entity model for monitoring message queue infrastructure in New Relic.

## Documentation Structure

### Entity Documentation
- [Entity Overview](entities/README.md) - Introduction to message queue entities
- [GUID Specification](entities/guid_spec.md) - How entity GUIDs are constructed
- [Synthesis Rules](entities/synthesis.md) - Creating entities from telemetry
- [Golden Metrics](entities/golden_metrics.md) - Key performance indicators
- [Golden Tags](entities/golden_tags.md) - Important metadata tags
- [Summary Metrics](entities/summary_metrics.md) - Explorer list view metrics
- [Entity Summary](entities/entity_summary.md) - Dashboard templates
- [Lifecycle](entities/lifecycle.md) - Entity creation and expiration

### Relationship Documentation
- [Relationships Overview](relationships/README.md) - Entity relationships and topology

## Quick Reference

### Entity Types

| Entity Type | Domain | Description |
|-------------|--------|-------------|
| MESSAGE_QUEUE_CLUSTER | INFRA | Message queue cluster |
| MESSAGE_QUEUE_BROKER | INFRA | Individual broker/node |
| MESSAGE_QUEUE_TOPIC | INFRA | Message topic or stream |
| MESSAGE_QUEUE_QUEUE | INFRA | Message queue |
| MESSAGE_QUEUE_CONSUMER_GROUP | INFRA | Consumer group |

### Key Concepts

1. **Entity Synthesis** - How entities are created from telemetry data
2. **Golden Metrics** - The most important metrics for each entity type
3. **Entity Relationships** - How entities connect to form topologies
4. **Lifecycle Management** - How long entities persist after they stop reporting

## Getting Started

1. Start with the [Entity Overview](entities/README.md) to understand the entity model
2. Review [Synthesis Rules](entities/synthesis.md) to learn how entities are created
3. Configure [Golden Metrics](entities/golden_metrics.md) for operational visibility
4. Set up [Entity Summaries](entities/entity_summary.md) for dashboard views

## For Contributors

When contributing entity definitions:
- Follow the established patterns in existing definitions
- Ensure proper GUID generation per the [specification](entities/guid_spec.md)
- Define meaningful golden metrics and tags
- Include comprehensive documentation
- Test synthesis rules with sample telemetry