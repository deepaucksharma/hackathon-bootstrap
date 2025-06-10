# New Relic Message Queues Platform V2 Documentation

## 📚 Documentation Structure

Welcome to the comprehensive documentation for the New Relic Message Queues Platform V2. This index provides a structured guide to all available documentation.

### 🏗️ Architecture & Design
- [**Platform Architecture**](./architecture/ARCHITECTURE.md) - Core platform design and components
- [**Data Model Specification**](./reference/DATA_MODEL_SPECIFICATION.md) - Entity types and data structures
- [**Dashboard System**](../DASHBOARD_SYSTEM.md) - Dashboard generation and management

### 📖 Guides
- [**Operations Guide**](./guides/OPERATIONS_GUIDE.md) - **📌 Complete guide for setup, running, and testing**
- [**Script Reference**](./SCRIPT_REFERENCE.md) - **📌 Quick reference for all scripts and commands**
- [**Technical Guide**](./guides/TECHNICAL_GUIDE.md) - In-depth technical implementation details
- [**Quick Start Guide**](../QUICK_START.md) - Get up and running quickly
- [**Development Guide**](../DEVELOPMENT.md) - Development setup and best practices
- [**NRI-Kafka Setup Guide**](./guides/NRI_KAFKA_SETUP_GUIDE.md) - Integration with New Relic Infrastructure
- [**Production Implementation Plan**](./guides/V2_PRODUCTION_IMPLEMENTATION_PLAN.md) - Deployment strategy

### 🔧 Implementation Guides
- [**Circuit Breaker Pattern**](../IMPLEMENTATION_GUIDES/01-CIRCUIT-BREAKER.md) - Fault tolerance implementation
- [**Error Recovery Manager**](../IMPLEMENTATION_GUIDES/02-ERROR-RECOVERY-MANAGER.md) - Error handling and recovery

### 📋 Entity Definitions
- [**Entity Types Overview**](../newrelic-entity-definitions/docs/README.md) - New Relic entity type specifications
- [**Entity Synthesis**](../newrelic-entity-definitions/docs/entities/synthesis.md) - How entities are created
- [**GUID Specification**](../newrelic-entity-definitions/docs/entities/guid_spec.md) - Entity GUID format and generation
- [**Golden Metrics**](../newrelic-entity-definitions/docs/entities/golden_metrics.md) - Key metrics for each entity type
- [**Summary Metrics**](../newrelic-entity-definitions/docs/entities/summary_metrics.md) - Entity summary calculations

### 🚀 Getting Started

1. **New to the platform?** Start with the [Quick Start Guide](../QUICK_START.md)
2. **Setting up development?** Check the [Development Guide](../DEVELOPMENT.md)
3. **Understanding the architecture?** Read the [Platform Architecture](./architecture/ARCHITECTURE.md)
4. **Implementing features?** Review the [Technical Guide](./guides/TECHNICAL_GUIDE.md)

### 📊 Key Features

- **Entity Synthesis**: Transform raw metrics into New Relic entities
- **Multi-Provider Support**: Kafka, RabbitMQ, SQS, and more
- **Dashboard Generation**: Automatic dashboard creation from entity data
- **Fault Tolerance**: Circuit breakers and error recovery
- **Clean Architecture**: Domain-driven design with dependency injection

### 🔗 External Resources

- [New Relic Entity Definitions](https://github.com/newrelic/entity-definitions)
- [nri-kafka Documentation](https://docs.newrelic.com/docs/infrastructure/host-integrations/host-integrations-list/kafka-monitoring-integration/)
- [Message Queues PRD](../../docs/MESSAGE_QUEUES_PRD.md)

### 📝 Platform Status

- **Version**: 2.0.0
- **Status**: Production Ready
- **Last Updated**: June 2025

For questions or contributions, please refer to the [README](../README.md).