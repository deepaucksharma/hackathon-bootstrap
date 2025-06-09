# New Relic Message Queues Platform

A comprehensive platform for monitoring message queue infrastructure using New Relic's ecosystem, combining real infrastructure data from nri-kafka with simulation capabilities for testing and development.

## 🎯 Platform Goals

1. **Real Infrastructure Monitoring**: Leverage nri-kafka and New Relic Infrastructure agent for production Kafka monitoring
2. **Entity Framework**: Transform infrastructure data into MESSAGE_QUEUE_* entities for consistent observability
3. **Simulation Support**: Maintain simulation capabilities for testing, demos, and development
4. **Dashboard Generation**: Create standardized dashboards from templates
5. **Hybrid Mode**: Combine real and simulated data for comprehensive coverage

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Kafka Broker  │────▶│   nri-kafka      │────▶│  Infrastructure │
│   (Real)        │ JMX │  Integration     │     │     Agent       │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                           │
                        ┌──────────────────────────────────┘
                        ▼
             ┌──────────────────┐                 ┌──────────────────┐
             │ Entity Transform │                 │    Simulation    │
             │     Layer        │                 │     Engine       │
             └────────┬─────────┘                 └────────┬─────────┘
                      │                                     │
                      └──────────────┬──────────────────────┘
                                     ▼
                        ┌────────────────────────┐
                        │  MESSAGE_QUEUE_*       │
                        │     Entities           │
                        └───────────┬────────────┘
                                    │
                        ┌───────────▼────────────┐
                        │   Dashboard Builder    │
                        │   & Verification       │
                        └────────────────────────┘
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file:

```bash
NEW_RELIC_ACCOUNT_ID=your_account_id
NEW_RELIC_INGEST_KEY=your_ingest_key
NEW_RELIC_USER_API_KEY=your_user_api_key
```

### 3. Run Platform

```bash
# Simulation mode (default) - generates test data
node platform.js --mode simulation

# Infrastructure mode - transforms real nri-kafka data
node platform.js --mode infrastructure

# Hybrid mode - combines real and simulated data
node platform.js --mode hybrid
```

### 4. Test Locally with Docker

```bash
# Start local Kafka cluster
cd infrastructure
docker-compose up -d

# Test with simulated nri-kafka data
DRY_RUN=true node test-local-kafka.js

# Run platform with real credentials
node ../platform.js --mode infrastructure --interval 30
```

## 📚 Platform Modes

### 1. **Simulation Mode**: Generates realistic message queue data for testing and demos
   - Creates complete Kafka topology (clusters, brokers, topics, consumer groups)
   - Simulates realistic metrics with patterns (business hours, anomalies)
   - Perfect for development and testing without real infrastructure

### 2. **Infrastructure Mode**: Transforms real nri-kafka data to MESSAGE_QUEUE entities
   - Queries KafkaBrokerSample, KafkaTopicSample, KafkaConsumerSample from NRDB
   - Transforms to standardized MESSAGE_QUEUE_* entity types
   - Builds entity relationships automatically
   - Requires nri-kafka integration on your Kafka hosts

### 3. **Hybrid Mode**: Combines real and simulated data for complete coverage
   - Uses real infrastructure data where available
   - Fills gaps with simulated entities (missing topics, consumer groups)
   - Ensures complete visibility even with partial instrumentation

## 📁 Project Structure

```
newrelic-message-queues-platform/
├── core/                    # Core framework components
│   ├── entities/           # Entity definitions and factory
│   └── relationships/      # Entity relationship management
├── simulation/             # Data simulation engines
│   ├── engines/           # Pattern and anomaly generators
│   └── streaming/         # New Relic data streaming
├── infrastructure/         # Infrastructure mode components
│   ├── collectors/        # nri-kafka data collection
│   ├── transformers/      # Data transformation pipeline
│   └── docker-compose.yml # Local Kafka setup
├── dashboards/            # Dashboard generation framework
│   ├── framework/        # Core dashboard engine
│   ├── templates/        # Reusable templates
│   └── cli.js           # Dashboard CLI tool
├── examples/             # Example usage and patterns
└── docs/                # Documentation
```

## 🔧 Key Features

### Real Infrastructure Integration
- Leverages battle-tested nri-kafka for JMX metrics
- Queries Infrastructure agent data via NerdGraph
- Transforms KafkaBrokerSample → MESSAGE_QUEUE_BROKER
- Aggregates cluster-level metrics

### Entity Framework
- Consistent MESSAGE_QUEUE_* entity model
- Proper entity relationships and synthesis
- Golden metrics for each entity type
- Tag-based filtering and grouping

### Dashboard Generation
- Template-based dashboard creation
- Provider-specific optimizations
- NRQL query builders with entity awareness
- Responsive layout engine

### Simulation Engine
- Realistic traffic patterns (business hours, seasonality)
- Anomaly injection for testing
- Multiple provider support
- API and WebSocket control interface

## 📊 Entity Types

| Entity Type | Source | Description |
|------------|--------|-------------|
| MESSAGE_QUEUE_CLUSTER | Aggregated | Cluster-level metrics and health |
| MESSAGE_QUEUE_BROKER | KafkaBrokerSample | Individual broker performance |
| MESSAGE_QUEUE_TOPIC | KafkaTopicSample | Topic-level throughput and lag |
| MESSAGE_QUEUE_CONSUMER_GROUP | KafkaConsumerSample | Consumer group lag and performance |

## 🛠️ Common Commands

### Testing
```bash
# Run unit tests
npm test

# Test infrastructure mode
node test-infrastructure-pipeline.js

# Test with local Kafka
DRY_RUN=true node infrastructure/test-local-kafka.js
```

### Dashboard Operations
```bash
# List available templates
node dashboards/cli.js list-templates

# Create dashboard from template
node dashboards/cli.js create --template=cluster-overview --provider=kafka

# Generate complete dashboard suite
node dashboards/cli.js generate-suite --provider=kafka --environment=production
```

### Platform Operations
```bash
# Start infrastructure monitoring
node platform.js --mode infrastructure --interval 60

# Run in debug mode
DEBUG=platform:*,transform:* node platform.js --mode infrastructure

# Run simulation with custom topology
node platform.js --mode simulation --clusters 2 --brokers 3 --topics 10
```

## 🔍 Troubleshooting

| Issue | Solution |
|-------|----------|
| No KafkaBrokerSample data | Verify nri-kafka is installed and configured correctly |
| Entity synthesis failing | Check GUID format matches pattern, wait 2-3 minutes |
| Dashboard queries empty | Ensure data has been streaming for 5+ minutes |
| Transformation errors | Enable debug logging: `DEBUG=transform:*` |

## 🚦 Current Status & Roadmap

### ✅ Completed
- [x] nri-kafka data transformation with proper entity GUIDs
- [x] MESSAGE_QUEUE entity framework (CLUSTER, BROKER, TOPIC, CONSUMER_GROUP)
- [x] Entity relationship mapping with bidirectional tracking
- [x] Dashboard generation from templates
- [x] Simulation engine with realistic patterns
- [x] Infrastructure mode with NerdGraph integration
- [x] Hybrid mode with gap detection and filling
- [x] End-to-end test suite for all modes
- [x] Docker-compose setup for local testing

### 🚧 In Progress
- [ ] Gap detection for hybrid mode (identify missing entities)
- [ ] Configuration validation with helpful error messages
- [ ] Health checks and monitoring for the platform itself

### 📋 Future
- [ ] Data caching to reduce NerdGraph query load
- [ ] Support for multiple Kafka clusters in infrastructure mode
- [ ] Dashboard template validation framework
- [ ] Automated anomaly detection
- [ ] Platform health dashboard

## 📚 Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [Developer Guide](docs/DEVELOPER_GUIDE.md)
- [Infrastructure Setup Guide](INFRASTRUCTURE_SETUP_GUIDE.md)
- [Entity Framework](docs/ENTITY_FRAMEWORK.md)
- [API Reference](docs/API_REFERENCE.md)
- [Quick Start Guide](docs/QUICKSTART.md)

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## 📄 License

Apache License 2.0
## 📚 Documentation

**New unified documentation location**: [/docs/README.md](../docs/README.md)

- [Getting Started](../docs/getting-started/README.md)
- [User Guide](../docs/user-guide/README.md)
- [Developer Guide](../docs/developer-guide/README.md)
- [Operations](../docs/operations/README.md)
