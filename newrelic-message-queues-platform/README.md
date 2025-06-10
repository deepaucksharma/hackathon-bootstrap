# New Relic Message Queues Platform v3.0

A unified, enterprise-grade platform for monitoring Apache Kafka and message queue systems with New Relic's v3.0 data model specification.

## 🚀 Quick Start

### Single Command Deployment

```bash
# Quick start - deploys everything and starts monitoring
node launch.js quick-start
```

### Interactive Mode

```bash
# Launch interactive menu
node launch.js
```

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║    🚀 New Relic Message Queues Platform                     ║
║                                                              ║
║    Version: 3.0.0                                           ║
║    Unified platform for Kafka monitoring with v3.0 data    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

🎯 Available Actions:

  1. Quick Start (Deploy Everything)
  2. Deploy Minikube + Kafka
  3. Start Monitoring Only
  4. Generate Dashboards Only
  5. Full Demo (Deploy + Monitor + Dashboards)
  6. Status Check
  7. Clean Up Everything
  8. Show Help
  q. Quit
```

## 📋 Available Commands

| Command | Description | Usage |
|---------|-------------|-------|
| `quick-start` | Deploy everything and start monitoring | `node launch.js quick-start` |
| `deploy` | Deploy minikube + Kafka infrastructure | `node launch.js deploy` |
| `monitor` | Start monitoring platform only | `node launch.js monitor` |
| `dashboards` | Generate New Relic dashboards | `node launch.js dashboards --open` |
| `demo` | Run full demo with all features | `node launch.js demo` |
| `status` | Show current platform status | `node launch.js status` |
| `cleanup` | Clean up all deployments | `node launch.js cleanup` |
| `help` | Show detailed help | `node launch.js help` |

## 🛠️ Prerequisites

### Required Tools
- **Node.js** (v14 or higher)
- **kubectl** (Kubernetes CLI)
- **minikube** (Local Kubernetes cluster)
- **Docker** (Container runtime)

### Install Prerequisites

```bash
# macOS
brew install kubectl minikube docker

# Ubuntu/Debian
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64

# Windows (using Chocolatey)
choco install kubernetes-cli minikube docker-desktop
```

### New Relic Configuration

Set up your New Relic credentials (optional for demo mode):

```bash
export NEW_RELIC_ACCOUNT_ID="your-account-id"
export NEW_RELIC_USER_API_KEY="your-user-api-key"
export NEW_RELIC_INGEST_KEY="your-ingest-license-key"
```

> **Note:** Platform runs in demo mode with mock data if credentials are not provided.

## 🏗️ Architecture

### Components

```
┌─────────────────┬─────────────────┬─────────────────┐
│   Deployment    │   Monitoring    │   Dashboards    │
├─────────────────┼─────────────────┼─────────────────┤
│ • Minikube      │ • Data Collector│ • Real-time     │
│ • Kafka Cluster │ • v3.0 Transform│ • Golden Metrics│
│ • Zookeeper     │ • NR Streaming  │ • Alerts        │
│ • nri-kafka     │ • Entity Synth  │ • Topology      │
└─────────────────┴─────────────────┴─────────────────┘
```

### Data Flow

```
Kafka JMX → nri-kafka → Platform → v3.0 Entities → New Relic → Dashboards
```

## 📊 Features

### ✅ Complete v3.0 Data Model Support
- **Entity Types**: MESSAGE_QUEUE_BROKER, MESSAGE_QUEUE_TOPIC, MESSAGE_QUEUE_CONSUMER_GROUP, MESSAGE_QUEUE_CLUSTER
- **GUID Format**: `{accountId}|INFRA|{entityType}|{uniqueHash}`
- **Comprehensive Metadata**: Provider, environment, configuration details
- **Golden Metrics**: UI-ready metrics for key performance indicators
- **Structured Tags**: Categorized operational tags

### ✅ Infrastructure Deployment
- **Automated Minikube Setup**: Multi-node Kafka cluster
- **Kafka Configuration**: Production-ready settings with JMX
- **Monitoring Integration**: nri-kafka DaemonSet deployment
- **Service Discovery**: Automatic broker and topic detection

### ✅ Real-time Monitoring
- **Live Data Collection**: 30-second intervals (configurable)
- **Entity Synthesis**: Automatic relationship mapping
- **Health Monitoring**: Cluster, broker, and consumer group health
- **Performance Metrics**: Throughput, latency, resource utilization

### ✅ Dashboard Generation
- **Comprehensive Dashboards**: Cluster overview, broker details, topic analysis
- **Interactive Charts**: Real-time updates and drill-down capabilities
- **Alert Templates**: Pre-configured alerting rules
- **Export Options**: JSON, permalink, and screenshot export

## 🎬 Demo Scenarios

### 1. Local Development Demo
```bash
# Start local demo with mock data
node launch.js demo
```

### 2. Full Infrastructure Demo
```bash
# Deploy complete infrastructure
node launch.js deploy
node launch.js monitor --background
node launch.js dashboards --open
```

### 3. Monitoring Only Demo
```bash
# Connect to existing Kafka cluster
NEW_RELIC_ACCOUNT_ID=your-id node launch.js monitor
```

## 📈 Monitoring Coverage

### Broker Metrics
- Throughput (messages/bytes per second)
- Resource utilization (CPU, memory, disk)
- Request latency (produce/fetch)
- Partition and replication health

### Topic Metrics
- Message rates and retention
- Partition distribution
- Consumer lag analysis
- Size and growth trends

### Consumer Group Metrics
- Lag monitoring and trends
- Member stability
- Offset commit rates
- Processing performance

### Cluster Metrics
- Overall health scoring
- Broker availability
- Replication status
- Network performance

## 🔧 Configuration

### Platform Configuration
The platform uses environment variables and command-line options:

```bash
# Environment Variables
NEW_RELIC_ACCOUNT_ID=123456
NEW_RELIC_USER_API_KEY=NRAK-...
NEW_RELIC_INGEST_KEY=...

# Command-line Options
node launch.js monitor --dry-run          # Test mode
node launch.js dashboards --output=./out  # Custom output
node launch.js demo                        # Full demonstration
```

### Kafka Configuration
Deployed Kafka cluster includes:
- **Replicas**: 3 brokers (configurable)
- **JMX**: Enabled on port 9999
- **Auto-create Topics**: Enabled
- **Default Replication**: Factor 2
- **Partitions**: 12 default (configurable)

## 🐛 Troubleshooting

### Common Issues

1. **Minikube not starting**
   ```bash
   # Check system resources
   node launch.js status
   
   # Clean up and retry
   node launch.js cleanup
   node launch.js quick-start
   ```

2. **No data in New Relic**
   ```bash
   # Verify credentials
   echo $NEW_RELIC_ACCOUNT_ID
   
   # Test with dry-run
   node launch.js monitor --dry-run
   ```

3. **Dashboard generation fails**
   ```bash
   # Check API permissions
   node launch.js dashboards --dry-run
   ```

### Debug Mode
```bash
# Enable debug logging
DEBUG=true node launch.js [command]

# Check platform status
node launch.js status
```

## 📝 Development

### Project Structure
```
newrelic-message-queues-platform/
├── launch.js                    # 🚀 Unified entry point
├── platform.js                  # Core platform logic
├── core/                        # Entity and metric definitions
├── dashboards/                  # Dashboard generation
├── infrastructure/              # Data collection and transformation
├── simulation/                  # Data streaming to New Relic
└── archive/                     # Legacy test files
```

### Automatic Documentation
The platform automatically generates beautiful documentation every time it runs:

```bash
# View documentation features
node tools/show-auto-docs.js

# Generate docs with platform run
node platform.js --mode simulation --no-continuous

# Disable automatic docs
node platform.js --mode simulation --no-auto-docs
```

**Generated Files:**
- `CURRENT_DATA_MODEL.md` - Live execution data model
- `docs/LIVE_DATA_TRANSFORMATION_PIPELINE.md` - Complete transformation pipeline

### Extending the Platform
1. **Add New Entity Types**: Extend `core/entities/`
2. **Custom Metrics**: Add to `core/metrics/`
3. **Dashboard Templates**: Create in `dashboards/builders/`
4. **Data Sources**: Implement in `infrastructure/collectors/`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Test with `node launch.js demo`
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Documentation**: [Wiki](https://github.com/your-repo/wiki)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/discussions)

---

**Made with ❤️ for the New Relic community**

*Unified platform for enterprise-grade Kafka monitoring with v3.0 data model compliance*