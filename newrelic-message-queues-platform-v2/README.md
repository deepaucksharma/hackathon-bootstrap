# New Relic Message Queues Platform v2

[![Version](https://img.shields.io/badge/version-2.0.0--alpha-blue.svg)](package.json)
[![Status](https://img.shields.io/badge/status-development-yellow.svg)]()
[![Entity Types](https://img.shields.io/badge/entities-5%20types-green.svg)](newrelic-entity-definitions/)
[![Architecture](https://img.shields.io/badge/architecture-clean-brightgreen.svg)](TECHNICAL_GUIDE.md)

A modern TypeScript implementation for monitoring message queue infrastructure through New Relic's entity platform. Transform metrics from Kafka, RabbitMQ, and other messaging systems into standardized MESSAGE_QUEUE entities with comprehensive dashboards.

## 🎯 Purpose

Transform message queue infrastructure metrics into New Relic's MESSAGE_QUEUE entity model, enabling unified monitoring across heterogeneous messaging architectures through standardized dashboards and intelligent alerting.

## 🚀 Quick Start

```bash
# Clone and setup
git clone <repository>
cd newrelic-message-queues-platform-v2
npm install

# Configure (copy and edit .env)
cp .env.example .env

# Run simulation mode (no infrastructure needed)
npm run dev:simulation

# Run with real Kafka data
npm run dev:infrastructure

# Create dashboards
npm run dashboard:create
```

## 📋 Documentation

- **[Technical Guide](TECHNICAL_GUIDE.md)** - Architecture and implementation details
- **[Entity Definitions](newrelic-entity-definitions/)** - MESSAGE_QUEUE entity specifications
- **[Data Model](DATA_MODEL_SPECIFICATION.md)** - Complete v3.0 data model reference
- **[Project Status](PROJECT_STATUS.md)** - Current state and roadmap
- **[Dashboard System](DASHBOARD_SYSTEM.md)** - Dashboard generation framework

## 🏗️ Core Functionality

### What It Does

The platform provides end-to-end monitoring for message queue infrastructure by:

1. **Collecting** real-time metrics from messaging infrastructure (Kafka, RabbitMQ, SQS)
2. **Transforming** provider-specific metrics into standardized format
3. **Synthesizing** MESSAGE_QUEUE entities with proper GUIDs and metadata
4. **Streaming** entities to New Relic for platform integration
5. **Generating** comprehensive 4-page dashboards automatically

### Supported Entity Types

| Entity Type | Description | Status |
|-------------|-------------|--------|
| MESSAGE_QUEUE_CLUSTER | Cluster-level aggregation | ✅ Complete |
| MESSAGE_QUEUE_BROKER | Individual broker/node | ✅ Complete |
| MESSAGE_QUEUE_TOPIC | Topics and streams | ✅ Complete |
| MESSAGE_QUEUE_QUEUE | Queues (RabbitMQ/SQS) | ⚠️ Basic |
| MESSAGE_QUEUE_CONSUMER_GROUP | Consumer groups | ⚠️ Basic |

### Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Collectors    │────▶│  Transformers   │────▶│  Synthesizers   │
│ • Infrastructure│     │ • Standardize   │     │ • Create GUIDs  │
│ • Simulation    │     │ • Calculate     │     │ • Add Metadata  │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                          │
                        ┌─────────────────┐     ┌─────────▼────────┐
                        │   Dashboards    │◀────│    Streamers     │
                        │ • 4-page layout │     │ • Event API      │
                        │ • Golden metrics│     │ • Batching       │
                        └─────────────────┘     └──────────────────┘
```

## ⚙️ Configuration

### Environment Variables

```bash
# Required
NEW_RELIC_ACCOUNT_ID=123456
NEW_RELIC_API_KEY=NRAK-xxx         # Ingest key
NEW_RELIC_USER_API_KEY=NRAK-xxx    # User key for dashboards

# Optional
NEW_RELIC_REGION=US                # US or EU (default: US)
PLATFORM_MODE=simulation           # infrastructure or simulation
PLATFORM_INTERVAL=60               # Collection interval in seconds
DEBUG=platform:*,transform:*       # Debug logging
```

### Supported Providers

| Provider | Integration Method | Status |
|----------|-------------------|---------|
| Apache Kafka | nri-kafka (JMX) | ✅ Full Support |
| Amazon MSK | CloudWatch | 🔧 In Progress |
| Confluent Cloud | REST API | 🔧 In Progress |
| RabbitMQ | Management API | 📋 Planned |
| Amazon SQS | CloudWatch | 📋 Planned |

## 🏃 Running the Platform

### Development Mode

```bash
# Simulation mode (no infrastructure needed)
npm run dev:simulation

# Infrastructure mode (with real Kafka)
npm run dev:infrastructure

# TypeScript development with hot reload
npm run dev
```

### Production Mode

```bash
# Build TypeScript
npm run build

# Run compiled version
node dist/platform.js --mode infrastructure

# Or use the unified script (recommended)
node run-platform-unified.js
```

### Dashboard Creation

```bash
# Create standard 4-page dashboard
npm run dashboard:create

# Custom dashboard name
npm run dashboard:create -- "Production Kafka" "Production monitoring"
```

## 📊 Dashboard Features

The platform generates a comprehensive 4-page dashboard:

1. **Executive Overview**
   - Cluster health score
   - Total throughput trends
   - Error rates and availability
   - Top topics by volume

2. **Consumer Groups**
   - Consumer lag analysis
   - Consumption rates
   - Group membership
   - Rebalancing history

3. **Infrastructure & Cost**
   - Broker resource utilization
   - Network I/O patterns
   - Disk usage trends
   - Cost optimization metrics

4. **Topics & Partitions**
   - Topic throughput
   - Partition distribution
   - Replication health
   - Message flow visualization

## 🔍 Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| No entities appearing | API credentials incorrect | Verify credentials in .env |
| Platform crashes | Network/API errors | Check logs, verify connectivity |
| Dashboard creation fails | Missing permissions | Ensure USER_API_KEY has dashboard access |
| No data from Kafka | nri-kafka not configured | Check `FROM KafkaBrokerSample SELECT count(*)` |

### Debug Commands

```bash
# Enable detailed logging
DEBUG=platform:*,transform:*,synthesize:* npm run dev

# Check entity synthesis
npm run verify:entities

# Test API connectivity
npm run test:api
```

## 🛠️ Development

### Project Structure

```
src/
├── collectors/          # Data collection (NRDB, simulation)
├── transformers/        # Metric normalization
├── synthesizers/        # Entity creation
├── streamers/          # New Relic API integration
├── dashboards/         # Dashboard generation
│   ├── templates/      # Standard dashboard templates
│   └── builders/       # Dashboard construction
├── domain/             # Entity definitions
│   └── entities/       # MESSAGE_QUEUE_* types
└── infrastructure/     # Configuration, providers
```

### Adding a New Provider

1. Create collector in `src/collectors/`
2. Add transformer in `src/transformers/`
3. Update entity synthesis rules
4. Add provider-specific dashboard widgets
5. Document in entity definitions

### Testing

```bash
# Run all tests (when implemented)
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e
```

## 📈 Metrics Reference

### Cluster Metrics
- `cluster.health.score` - Overall cluster health (0-100)
- `cluster.throughput.total` - Combined in/out throughput
- `cluster.availability.percentage` - Uptime percentage
- `cluster.error.rate` - Error rate across all operations

### Broker Metrics
- `broker.cpu.usage` - CPU utilization percentage
- `broker.memory.usage` - Memory utilization percentage
- `broker.network.throughput` - Network I/O bytes/sec
- `broker.disk.usage` - Disk utilization percentage

### Topic Metrics
- `topic.messages.in.rate` - Incoming message rate
- `topic.messages.out.rate` - Outgoing message rate
- `topic.consumer.lag.sum` - Total consumer lag
- `topic.partition.count` - Number of partitions

## 🚀 Roadmap

### Near Term (v2.1)
- [ ] Complete error handling and recovery
- [ ] Add comprehensive test coverage
- [ ] Implement health monitoring endpoints
- [ ] Add RabbitMQ support

### Medium Term (v2.2)
- [ ] Multi-cluster support
- [ ] Entity relationship management
- [ ] Custom metric definitions
- [ ] Alert template library

### Long Term (v3.0)
- [ ] Auto-scaling recommendations
- [ ] Cost optimization insights
- [ ] ML-based anomaly detection
- [ ] Kubernetes operator

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## 📄 License

This project is licensed under the Apache 2.0 License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- New Relic Entity Platform team for entity synthesis capabilities
- nri-kafka maintainers for Kafka integration
- Clean Architecture principles by Robert C. Martin

---

**Status**: Alpha Development | **Version**: 2.0.0-alpha | **Last Updated**: 2024-01