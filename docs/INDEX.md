# Documentation Index

## Overview Documents

- **[Main Documentation Hub](README.md)** - Entry point for all documentation
- **[Technical Specification](TECHNICAL_SPECIFICATION.md)** - Complete technical architecture and Unified Data Model (UDM) specification

## Getting Started

- **[Quick Start Guide](getting-started/README.md)** - Get up and running in 5 minutes
- **[Platform Modes](user-guide/platform-modes.md)** - Understanding Infrastructure, Simulation, and Hybrid modes

## Developer Documentation

- **[Developer Guide](developer-guide/README.md)** - API reference and development patterns
- **[Architecture Overview](developer-guide/architecture.md)** - System design and components
- **[Entity Framework](developer-guide/entity-framework.md)** - MESSAGE_QUEUE entity model
- **[API Reference](developer-guide/api-reference.md)** - Detailed API documentation

## User Guides

- **[Platform Modes Explained](user-guide/platform-modes.md)** - When to use each mode
- **[Working with Dashboards](user-guide/working-with-dashboards.md)** - Dashboard creation and customization
- **[CLI Reference](user-guide/cli-reference.md)** - Command-line interface documentation
- **[Troubleshooting Guide](user-guide/troubleshooting.md)** - Common issues and solutions

## Operations & Infrastructure

- **[Infrastructure Setup](operations/infrastructure-setup.md)** - Configure nri-kafka for real monitoring
- **[Configuration Reference](reference/configuration-reference.md)** - All configuration options
- **[Metrics Reference](reference/metrics-reference.md)** - Complete metrics catalog

## Project Documentation

- **[Vision Document](project/vision.md)** - Long-term platform vision
- **[Implementation Results](project/implementation-results.md)** - Current implementation status

## Key Concepts

### Unified Data Model (UDM)
The platform implements a canonical data model for all message queue telemetry:
- **MessageQueueBrokerSample** - Broker performance metrics
- **MessageQueueTopicSample** - Topic health and metadata  
- **MessageQueueOffsetSample** - Consumer group lag data

### Platform Modes
1. **Infrastructure Mode** - Transform real nri-kafka data to UDM
2. **Simulation Mode** - Generate UDM-compliant test data
3. **Hybrid Mode** - Combine real and simulated data

### Entity Types
- **MESSAGE_QUEUE_BROKER** - Individual broker instances
- **MESSAGE_QUEUE_TOPIC** - Topics with partition info
- **MESSAGE_QUEUE_CONSUMER** - Consumer groups with lag metrics

## Navigation

### By Role
- **Platform Operators**: Start with [Getting Started](getting-started/README.md) → [Platform Modes](user-guide/platform-modes.md)
- **Developers**: Review [Technical Spec](TECHNICAL_SPECIFICATION.md) → [Developer Guide](developer-guide/README.md)
- **Infrastructure Teams**: See [Infrastructure Setup](operations/infrastructure-setup.md) → [Configuration](reference/configuration-reference.md)

### By Task
- **Set up monitoring**: [Quick Start](getting-started/README.md) → [Infrastructure Setup](operations/infrastructure-setup.md)
- **Create dashboards**: [Dashboard Guide](user-guide/working-with-dashboards.md) → [CLI Reference](user-guide/cli-reference.md)
- **Troubleshoot issues**: [Troubleshooting](user-guide/troubleshooting.md) → [Configuration Reference](reference/configuration-reference.md)
- **Extend the platform**: [Developer Guide](developer-guide/README.md) → [API Reference](developer-guide/api-reference.md)