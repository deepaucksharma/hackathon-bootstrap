# New Relic Message Queues Platform Documentation

> **Platform Version**: 1.1.0  
> **Last Updated**: January 2025  
> **Status**: Production Ready

Welcome to the New Relic Message Queues Platform - a comprehensive solution for monitoring Kafka and other message queue systems in New Relic.

> **📋 Technical Specification**: For the complete technical architecture and implementation details, see the [Technical Specification](TECHNICAL_SPECIFICATION.md).

## 🎯 What is This Platform?

The Message Queues Platform bridges the gap between your Kafka infrastructure and New Relic's powerful monitoring capabilities. It transforms raw Kafka metrics into New Relic's MESSAGE_QUEUE entity model, enabling rich dashboards, alerting, and analysis.

### Key Features
- ✅ **Three Operating Modes**: Simulation, Infrastructure, and Hybrid
- ✅ **Real-Time Monitoring**: Stream metrics from actual Kafka clusters via nri-kafka
- ✅ **Entity Synthesis**: Creates MESSAGE_QUEUE_* entities for unified monitoring
- ✅ **Dashboard Generator**: Pre-built templates for instant visibility
- ✅ **Consumer Lag Tracking**: Monitor consumer group performance
- ✅ **Multi-Provider Ready**: Designed to support Kafka, RabbitMQ, and more

## 🚀 Quick Start

Get up and running in 5 minutes:

```bash
# Clone the repository
git clone https://github.com/newrelic/nri-kafka.git
cd nri-kafka/newrelic-message-queues-platform

# Install dependencies
npm install

# Run in simulation mode (no Kafka required)
NEW_RELIC_API_KEY=your_key NEW_RELIC_ACCOUNT_ID=your_account \
node platform.js --mode=simulation

# Create your first dashboard
node dashboards/cli.js create --template=cluster-overview --provider=kafka
```

[**→ Detailed Getting Started Guide**](getting-started/README.md)

## 📚 Documentation by Role

### For Platform Operators
- [**Getting Started Guide**](getting-started/README.md) - Installation and first steps
- [**Platform Modes Explained**](user-guide/platform-modes.md) - When to use each mode
- [**Dashboard Creation**](user-guide/working-with-dashboards.md) - Build custom dashboards
- [**CLI Reference**](user-guide/cli-reference.md) - All commands and options
- [**Troubleshooting**](user-guide/troubleshooting.md) - Common issues and solutions

### For Developers
- [**Technical Specification**](TECHNICAL_SPECIFICATION.md) - Complete technical architecture
- [**Architecture Overview**](developer-guide/architecture.md) - System design and components
- [**Entity Framework**](developer-guide/entity-framework.md) - MESSAGE_QUEUE entity model
- [**API Reference**](developer-guide/api-reference.md) - Programmatic access

### For Infrastructure Teams
- [**Infrastructure Setup**](operations/infrastructure-setup.md) - Connect to real Kafka
- [**Configuration Reference**](reference/configuration-reference.md) - All configuration options
- [**Metrics Reference**](reference/metrics-reference.md) - Complete metrics catalog

## 🔧 Platform Modes

### Simulation Mode
Perfect for testing and demos without real infrastructure:
```bash
node platform.js --mode=simulation
```
- Generates realistic Kafka patterns
- No infrastructure required
- Great for development and POCs

### Infrastructure Mode
For production monitoring of real Kafka clusters:
```bash
node platform.js --mode=infrastructure
```
- Requires active nri-kafka integration
- Transforms real metrics to MESSAGE_QUEUE entities
- Production-ready monitoring

### Hybrid Mode
Best of both worlds - fills gaps in infrastructure data:
```bash
node platform.js --mode=hybrid
```
- Combines real and simulated data
- Ensures complete entity coverage
- Ideal for partial deployments

[**→ Detailed Mode Comparison**](user-guide/platform-modes.md)

## 📊 Available Dashboards

Pre-built dashboard templates ready to use:

| Template | Description | Use Case |
|----------|-------------|----------|
| `cluster-overview` | Cluster health and performance | Operations monitoring |
| `broker-details` | Individual broker metrics | Performance analysis |
| `topic-analysis` | Topic throughput and partitions | Capacity planning |
| `consumer-groups` | Consumer lag and performance | Application monitoring |

[**→ Dashboard Template Catalog**](reference/dashboard-templates.md)

## 🔍 Key Metrics

The platform tracks essential Kafka metrics:

- **Throughput**: Messages and bytes in/out per second
- **Latency**: Request and response times
- **Saturation**: Disk usage, partition counts
- **Errors**: Under-replicated partitions, offline brokers
- **Consumer Lag**: Per consumer group and topic

[**→ Complete Metrics Reference**](reference/metrics-catalog.md)

## 🛠️ Configuration

Essential environment variables:

```bash
# Required
NEW_RELIC_API_KEY=your_api_key
NEW_RELIC_ACCOUNT_ID=your_account_id

# Mode Selection
PLATFORM_MODE=simulation|infrastructure|hybrid

# Optional
NEW_RELIC_REGION=US|EU
DEBUG=platform:*,transform:*
```

[**→ Full Configuration Reference**](reference/configuration-reference.md)

## 📋 Common Tasks

### Monitor a Kafka Cluster
```bash
# Start infrastructure mode
node platform.js --mode=infrastructure --interval=30

# Create monitoring dashboard
node dashboards/cli.js create --template=cluster-overview
```

### Test with Simulated Data
```bash
# Generate test data
node platform.js --mode=simulation --duration=300

# View in New Relic
# Go to Entity Explorer > MESSAGE_QUEUE
```

### Debug Data Collection
```bash
# Enable debug logging
DEBUG=* node platform.js --mode=infrastructure

# Test infrastructure connection
node test-infrastructure-mode.js
```

## 🚨 Troubleshooting

### No Data Appearing?
1. Check nri-kafka is sending data: `FROM KafkaBrokerSample SELECT count(*)`
2. Verify API credentials are correct
3. Wait 2-3 minutes for entity synthesis
4. [**→ Full Troubleshooting Guide**](user-guide/troubleshooting.md)

### Common Issues
- [Entity synthesis failing](user-guide/troubleshooting.md#entity-synthesis)
- [No infrastructure data](user-guide/troubleshooting.md#no-infrastructure-data)
- [Dashboard creation errors](user-guide/troubleshooting.md#dashboard-errors)

## 🗺️ Project Status

### ✅ Completed Features
- Three operating modes (Simulation, Infrastructure, Hybrid)
- Unified Data Model (UDM) implementation
- Entity synthesis for MESSAGE_QUEUE_* types
- Dashboard CI/CD platform with verification
- Consumer lag tracking via Admin API
- Integration with nri-kafka for production data
- Comprehensive testing and verification suite

### 🚧 In Progress
- RabbitMQ provider support
- Advanced anomaly detection
- Automated alerting templates

### 📅 Roadmap
- Multi-provider architecture expansion
- ML-based anomaly detection
- Cost optimization features
- Kubernetes operator

[**→ Full Roadmap**](project/roadmap.md)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](developer-guide/contributing.md) for:
- Code style guidelines
- Testing requirements
- Pull request process
- Development setup

## 📞 Support

- **Documentation Issues**: [Open a GitHub issue](https://github.com/newrelic/nri-kafka/issues)
- **Platform Questions**: [New Relic Explorers Hub](https://discuss.newrelic.com)
- **Security Issues**: [security@newrelic.com](mailto:security@newrelic.com)

## 📄 License

This project is licensed under the Apache 2.0 License. See [LICENSE](../LICENSE) for details.

---

> **Note**: This documentation is for the Message Queues Platform extension. For the core nri-kafka integration documentation, see [nri-kafka README](../README.md).