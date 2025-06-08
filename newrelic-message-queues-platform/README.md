# New Relic Message Queues Platform

A comprehensive platform for developing, simulating, and managing MESSAGE_QUEUE_* entities in New Relic, with dashboard generation and verification capabilities.

## 🚀 Overview

The New Relic Message Queues Platform provides a complete solution for:

- **Entity Development**: Create and propose new MESSAGE_QUEUE_* entity types
- **Data Simulation**: Generate realistic metrics and events for testing
- **Dashboard Generation**: Build production-ready dashboards automatically
- **Verification**: Validate entity synthesis and dashboard functionality
- **Multi-Provider Support**: Works with Kafka, RabbitMQ, SQS, Azure Service Bus, and more

## 📋 Features

### Three Operating Modes

1. **Mode 1: Entity Proposal & Simulation**
   - Prototype new entity types before official adoption
   - Simulate realistic data patterns
   - Test entity synthesis in New Relic
   
2. **Mode 2: Existing Entity Enhancement**
   - Import official entity definitions from github.com/newrelic/entity-definitions
   - Add custom golden metrics
   - Extend with additional metadata

3. **Mode 3: Hybrid Mode**
   - Combine new proposals with existing definitions
   - Create unified dashboards
   - Maintain compatibility

### Core Capabilities

- ✅ **Entity Factory**: Create MESSAGE_QUEUE_* entities with proper relationships
- ✅ **Data Simulation**: Generate realistic metrics with business patterns
- ✅ **Streaming**: Send events and metrics to New Relic APIs
- ✅ **Dashboard Builder**: Generate dashboards from templates
- ✅ **Verification Framework**: Validate entities, NRQL, and dashboards
- ✅ **CLI Tools**: Command-line interface for all operations
- ✅ **Dry-Run Mode**: Test without sending data to New Relic

## 🛠️ Installation

```bash
# Clone the repository
git clone <repository-url>
cd newrelic-message-queues-platform

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your New Relic credentials
```

## ⚡ Quick Start

### 1. Test the Platform

```bash
# Run comprehensive test suite
node test-suite.js

# Check connectivity
node test-connectivity.js
```

### 2. Simple Streaming Example

```bash
# Stream a single cluster with metrics
node examples/simple-streaming.js
```

### 3. Production Simulation

```bash
# Simulate production environment (dry-run)
node examples/production-streaming.js --dry-run --duration=5 --interval=30

# Stream real data
node examples/production-streaming.js --duration=5
```

### 4. Interactive Showcase

```bash
# Launch interactive demo
node showcase.js
```

## 📊 Entity Model

Based on [New Relic Queues & Streaming Specification](../docs/README.md):

### Core Entity Types

#### MESSAGE_QUEUE_CLUSTER
```yaml
Domain: INFRA
GUID Pattern: {accountId}|INFRA|MESSAGE_QUEUE_CLUSTER|{hash(clusterName)}
Golden Metrics:
  - cluster.health.score (percentage)
  - cluster.throughput.total (messages/second)
  - cluster.error.rate (percentage)
  - cluster.availability (percentage)
Relationships: [CONTAINS → brokers, topics]
```

#### MESSAGE_QUEUE_BROKER  
```yaml
Domain: INFRA
GUID Pattern: {accountId}|INFRA|MESSAGE_QUEUE_BROKER|{hash(clusterId:brokerId)}
Golden Metrics:
  - broker.cpu.usage (percentage)
  - broker.memory.usage (percentage)
  - broker.network.throughput (bytes/second)
  - broker.request.latency (milliseconds)
Relationships: [HOSTS → partitions, SERVES → clients]
```

#### MESSAGE_QUEUE_TOPIC
```yaml
Domain: INFRA  
GUID Pattern: {accountId}|INFRA|MESSAGE_QUEUE_TOPIC|{hash(clusterId:topicName)}
Golden Metrics:
  - topic.throughput.in (messages/second)
  - topic.throughput.out (messages/second)
  - topic.consumer.lag (messages)
  - topic.error.rate (percentage)
Relationships: [PARTITIONED_INTO → partitions]
```

#### MESSAGE_QUEUE_QUEUE
```yaml
Domain: INFRA
GUID Pattern: {accountId}|INFRA|MESSAGE_QUEUE_QUEUE|{hash(provider:region:queueName)}
Golden Metrics:
  - queue.depth (messages)
  - queue.throughput.in (messages/second)
  - queue.throughput.out (messages/second)
  - queue.processing.time (milliseconds)
Relationships: [PROCESSED_BY → consumers]
```

## 🎨 Dashboard Components

### Widget Library
- **Billboard Widgets**: KPI displays with thresholds and trends
- **Chart Widgets**: Time series, area charts, line graphs
- **Table Widgets**: Sortable, filterable entity listings
- **Custom Widgets**: Topology views, status grids, progress rings

### Dashboard Templates
- **Overview Dashboard**: Cross-provider health and performance
- **Cluster Dashboard**: Deep-dive cluster analytics
- **Topic/Queue Dashboard**: Message flow analysis  
- **Performance Dashboard**: Latency and throughput optimization
- **Operations Dashboard**: Alerts, incidents, and SLA tracking

### Responsive Design
- **Mobile First**: Touch-optimized interactions
- **Progressive Enhancement**: Feature detection and graceful degradation
- **Cross-Browser**: Chrome, Firefox, Safari, Edge compatibility
- **Accessibility**: WCAG 2.1 AA compliance

## 🧪 Simulation Scenarios

### Production Patterns
```yaml
business_hours:
  description: "Realistic business hour traffic patterns"
  peak_hours: [9-11, 14-16]
  weekend_reduction: 80%
  holiday_impact: 60%

seasonal_trends:
  description: "Quarterly and annual trends"
  q4_increase: 40%
  summer_decline: 15%
  back_to_school_spike: 25%

error_injection:
  description: "Realistic error scenarios"
  network_blips: 0.1%
  broker_failures: 0.01%
  consumer_lag_spikes: 2%
```

### Multi-Provider Scenarios
```yaml
hybrid_architecture:
  kafka: 60%        # Primary streaming
  rabbitmq: 25%     # Message routing
  sqs: 10%          # Cloud queuing
  service_bus: 5%   # Enterprise messaging

migration_scenario:
  from: rabbitmq
  to: kafka
  completion: 75%
  dual_write_period: 30_days
```

## 🔧 Development Tools

## CLI Tool

The platform includes a comprehensive CLI tool for managing all aspects of the message queue monitoring system:

```bash
# Create and stream topology
./tools/cli/mq-platform.js simulate create-topology --provider kafka --clusters 2 --stream

# Create dashboards
./tools/cli/mq-platform.js dashboard create --template overview --name "Production Overview"

# Verify dashboard functionality
./tools/cli/mq-platform.js verify dashboard --guid "dashboard-guid" --load-test
./tools/cli/mq-platform.js verify batch --guids "guid1,guid2,guid3"

# Interactive mode
./tools/cli/mq-platform.js interactive

# Configuration management
./tools/cli/mq-platform.js config init
./tools/cli/mq-platform.js config validate

# Platform status
./tools/cli/mq-platform.js status
```

## 🔍 Dashboard Verification

The platform includes a comprehensive dashboard verification system that ensures quality, performance, and functionality:

### Verification Categories
- **Structure Validation** (20 pts): Dashboard configuration, layout, variables
- **Widget Functionality** (25 pts): Widget loading, data retrieval, configurations
- **NRQL Query Validation** (25 pts): Query syntax, performance, best practices
- **Performance Benchmarking** (15 pts): Load times, response performance
- **Mobile Compatibility** (10 pts): Responsive design, mobile optimization
- **Accessibility** (5 pts): Compliance with accessibility standards

### Quick Verification
```bash
# Verify a single dashboard
./tools/cli/mq-platform.js verify dashboard --guid "your-dashboard-guid"

# Batch verification with reporting
./tools/cli/mq-platform.js verify batch --file dashboard-list.txt --format html

# Include comprehensive load testing
./tools/cli/mq-platform.js verify dashboard --guid "your-guid" --load-test

# Run verification test suite
./tools/cli/mq-platform.js verify test-framework --performance
```

### Advanced Usage
```javascript
const { VerificationRunner } = require('./verification');

// Programmatic verification
const runner = new VerificationRunner({
  parallelExecutions: 5,
  includeLoadTests: true,
  reportFormats: ['json', 'html']
});

const results = await runner.verifyDashboards(dashboardGuids);
console.log(`Average Score: ${results.summary.averageScore}/100`);
```

For complete verification documentation, see [verification/README.md](verification/README.md).

### CLI Tools
```bash
# Entity management
mq-entity create --type=cluster --provider=kafka --name=prod-kafka-01
mq-entity simulate --count=100 --pattern=realistic

# Dashboard development
mq-dashboard create --template=overview
mq-dashboard validate --performance --mobile
mq-dashboard export --format=json

# Testing and verification  
mq-test run --suite=comprehensive
mq-test performance --duration=10m --users=25
mq-test mobile --devices=ios,android
```

### Configuration Management
```bash
# Environment management
mq-config env --set development
mq-config validate --environment=production
mq-config export --secure

# Template management
mq-template create --type=widget --name=custom-kpi
mq-template apply --dashboard=overview --widgets=all
```

## 📈 Performance Optimization

### Dashboard Performance
- **Load Time Targets**: <2s initial load, <500ms widget refresh
- **Query Optimization**: Efficient NRQL with proper indexing
- **Caching Strategy**: Smart caching for static and dynamic data
- **Lazy Loading**: Progressive widget loading for large dashboards

### Data Streaming
- **Rate Limiting**: Intelligent throttling to prevent API limits
- **Batch Processing**: Efficient bulk data submission
- **Compression**: Data compression for reduced bandwidth
- **Error Recovery**: Automatic retry with exponential backoff

## 🛡️ Security & Compliance

### Data Protection
- **API Key Management**: Secure credential storage and rotation
- **Data Encryption**: Encryption at rest and in transit
- **Access Control**: Role-based permissions and audit logging
- **Compliance**: SOC2, PCI DSS, GDPR compliance features

### Enterprise Integration
- **SSO Integration**: SAML, OIDC, Active Directory
- **Audit Logging**: Comprehensive action logging
- **Data Governance**: Data lineage and classification
- **Backup & Recovery**: Automated backup and disaster recovery

## 📚 Platform Structure

```
newrelic-message-queues-platform/
├── core/                           # Core data model and services
│   ├── entities/                   # MESSAGE_QUEUE_* entity implementations
│   ├── providers/                  # Provider-specific adapters
│   ├── relationships/              # Entity relationship management
│   └── metrics/                    # Golden metrics computation
├── simulation/                     # Data simulation and generation
│   ├── engines/                    # Simulation engines
│   ├── scenarios/                  # Pre-built scenarios
│   ├── patterns/                   # Data pattern libraries
│   └── streaming/                  # Real-time data streaming
├── dashboards/                     # Dashboard building system
│   ├── widgets/                    # Widget library
│   ├── templates/                  # Dashboard templates
│   ├── builders/                   # Dashboard builders
│   └── components/                 # Reusable components
├── verification/                   # Testing and validation
│   ├── tests/                      # Functional tests
│   ├── validators/                 # Data and UI validators
│   ├── benchmarks/                 # Performance benchmarks
│   └── reports/                    # Test reporting
├── tools/                          # Development tools
│   ├── cli/                        # Command-line interface
│   ├── generators/                 # Code generators
│   ├── exporters/                  # Export utilities
│   └── debuggers/                  # Debugging tools
├── config/                         # Configuration management
│   ├── schemas/                    # JSON schemas
│   ├── templates/                  # Configuration templates
│   └── environments/               # Environment configs
└── examples/                       # Example implementations
    ├── basic/                      # Basic usage examples
    ├── advanced/                   # Advanced implementations
    ├── multi-provider/             # Multi-provider setups
    └── production/                 # Production-ready examples
```

## 🎓 Learning Resources

- **[Entity Model Guide](core/entities/README.md)** - Complete entity model documentation
- **[Dashboard Building](dashboards/README.md)** - Dashboard development guide
- **[Simulation Patterns](simulation/README.md)** - Data simulation techniques
- **[Performance Optimization](verification/benchmarks/README.md)** - Performance best practices
- **[Multi-Provider Setup](examples/multi-provider/README.md)** - Hybrid architecture examples

## 🤝 Contributing

1. **Follow Entity Model**: Adhere to MESSAGE_QUEUE_* specifications
2. **Performance First**: Ensure <2s dashboard load times
3. **Mobile Responsive**: Test on mobile devices
4. **Comprehensive Testing**: Include unit, integration, and performance tests
5. **Documentation**: Document all APIs and configuration options

## 📞 Support

- **Documentation**: [Full Documentation](./docs/)
- **Issues**: [GitHub Issues](https://github.com/your-org/nri-kafka/issues)
- **Examples**: [Example Workflows](./examples/)
- **Entity Model**: Refer to [specification](../docs/README.md)

## 🙏 Acknowledgments

Built with ❤️ by the New Relic community. Special thanks to all contributors and the teams maintaining the message queue integrations.

---

**Built for sophisticated message queue monitoring at enterprise scale with New Relic.**