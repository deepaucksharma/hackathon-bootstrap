# Dashboard Payload Simulation Platform

A comprehensive platform for generating and testing simulated payloads for New Relic Message Queues dashboard implementation using MESSAGE_QUEUE_* entities.

## 🎯 Mission

Create sophisticated New Relic dashboards for message queue monitoring by simulating realistic payload data based on the MESSAGE_QUEUE_* entity model defined in the New Relic Queues & Streaming specification.

## 🔄 Paradigm Shift

**From**: nri-kafka integration → Messages & Queues UI  
**To**: Simulated payloads → Custom Dashboard Implementation

### New Approach
- **Source**: Simulated MESSAGE_QUEUE_* entity payloads
- **Destination**: Custom dashboards per [DASHBOARD_IMPLEMENTATION_GUIDE.md](../docs/DASHBOARD_IMPLEMENTATION_GUIDE.md)
- **Entity Types**: MESSAGE_QUEUE_CLUSTER, MESSAGE_QUEUE_BROKER, MESSAGE_QUEUE_TOPIC, MESSAGE_QUEUE_QUEUE
- **Focus**: Dashboard visualization and user experience

## 🏗️ Core Entity Types

Based on the [New Relic Queues & Streaming specification](../docs/README.md):

```yaml
MESSAGE_QUEUE_CLUSTER:
  domain: INFRA
  guid_pattern: "{accountId}|INFRA|MESSAGE_QUEUE_CLUSTER|{hash(clusterName)}"
  golden_metrics:
    - health.score
    - throughput.total
    - error.rate
    - availability.percentage

MESSAGE_QUEUE_BROKER:
  domain: INFRA
  guid_pattern: "{accountId}|INFRA|MESSAGE_QUEUE_BROKER|{hash(clusterId:brokerId)}"
  golden_metrics:
    - cpu.usage
    - memory.usage
    - network.throughput
    - request.latency

MESSAGE_QUEUE_TOPIC:
  domain: INFRA
  guid_pattern: "{accountId}|INFRA|MESSAGE_QUEUE_TOPIC|{hash(clusterId:topicName)}"
  golden_metrics:
    - throughput.in
    - throughput.out
    - consumer.lag
    - error.rate

MESSAGE_QUEUE_QUEUE:
  domain: INFRA
  guid_pattern: "{accountId}|INFRA|MESSAGE_QUEUE_QUEUE|{hash(provider:region:queueName)}"
  golden_metrics:
    - depth
    - throughput.in
    - throughput.out
    - processing.time
```

## 🚀 Quick Start

### 1. Generate Simulated Payloads
```bash
# Generate basic MESSAGE_QUEUE entity samples
node src/payload-engine.js --entity-type=cluster --count=5

# Generate comprehensive dashboard data
node enhanced-payload-generator.js --scenario=production-cluster
```

### 2. Submit to New Relic
```bash
# Submit simulated data for dashboard testing
node src/submission-engine.js --payload-file=./generated/cluster-payloads.json

# Continuous simulation for dashboard development
node continuous-metric-streamer.js --interval=30s
```

### 3. Verify Dashboard Visibility
```bash
# Verify data appears in dashboards
node src/verification-engine.js --dashboard-type=overview

# Generate verification report
node generate-test-report.js --output=./reports/
```

## 📁 Directory Structure

```
dashboard-payload-simulation/
├── src/                          # Core simulation engines
│   ├── payload-engine.js         # MESSAGE_QUEUE_* payload generation
│   ├── submission-engine.js      # Data submission to New Relic
│   └── verification-engine.js    # Dashboard verification
├── config/                       # Configuration and schemas
│   ├── entity-definitions.json   # MESSAGE_QUEUE_* entity definitions
│   ├── golden-payload-schema.json # Payload validation schema
│   └── dashboard-config.json     # Dashboard-specific configurations
├── templates/                    # Payload templates
│   └── golden-payloads/          # Reference payload structures
├── experiments/                  # Testing scenarios
│   ├── dashboard-widgets/        # Widget-specific tests
│   ├── entity-relationships/     # Relationship validation
│   └── performance-testing/      # Load and performance tests
└── utils/                        # Utilities and helpers
    └── logger.js                 # Logging utility
```

## 🧪 Simulation Scenarios

### Production Cluster Simulation
```javascript
{
  "scenario": "production-cluster",
  "entities": {
    "clusters": 3,
    "brokers_per_cluster": 5,
    "topics_per_cluster": 50,
    "queues_per_cluster": 25
  },
  "metrics": {
    "throughput_pattern": "business_hours",
    "error_injection": "realistic",
    "health_variation": "normal_operations"
  }
}
```

### Multi-Provider Environment
```javascript
{
  "scenario": "multi-provider",
  "providers": ["kafka", "rabbitmq", "sqs", "azure-servicebus"],
  "distribution": {
    "kafka": 60,
    "rabbitmq": 25,
    "sqs": 10,
    "azure-servicebus": 5
  }
}
```

## 📊 Dashboard Integration

This platform generates data specifically for dashboard implementation following the [Dashboard Implementation Guide](../docs/DASHBOARD_IMPLEMENTATION_GUIDE.md):

### Widget Types Supported
- **Billboard Widgets**: Health scores, throughput metrics
- **Chart Widgets**: Time series data, performance trends
- **Table Widgets**: Entity listings, relationship mapping
- **Custom Visualizations**: Topology views, status grids

### Dashboard Variables
- **Account Selection**: Multi-account support
- **Provider Filters**: Cross-provider filtering
- **Time Range**: Custom time window selection
- **Health Status**: Status-based filtering

## 🔍 Verification & Testing

### Entity Synthesis Verification
```bash
# Verify entities are properly synthesized
node entity-synthesis-verification.js --entity-types=all

# Test dashboard widget data availability
node dashboard-widget-validator.js --widget-config=./config/widgets.json
```

### Dashboard Performance Testing
```bash
# Test dashboard load times with various data volumes
node performance-testing/dashboard-load-test.js

# Validate responsive design with mobile simulation
node performance-testing/mobile-optimization-test.js
```

## 🛠️ Configuration

### Environment Variables
```bash
# New Relic Configuration
export NEWRELIC_API_KEY="your-api-key"
export NEWRELIC_ACCOUNT_ID="your-account-id"

# Simulation Configuration
export SIMULATION_MODE="development"  # development, staging, production
export DATA_VOLUME="medium"           # low, medium, high
export REFRESH_INTERVAL="30s"        # Data refresh rate
```

### Config Files
- `config/entity-definitions.json` - MESSAGE_QUEUE_* entity schemas
- `config/dashboard-config.json` - Dashboard-specific settings
- `config/simulation-parameters.json` - Simulation behavior configuration

## 📈 Metrics & Analytics

### Golden Metrics by Entity Type
```javascript
// MESSAGE_QUEUE_CLUSTER
{
  "cluster.health.score": 98.5,
  "cluster.throughput.total": 1250000,
  "cluster.error.rate": 0.15,
  "cluster.availability": 99.98
}

// MESSAGE_QUEUE_BROKER  
{
  "broker.cpu.usage": 65.2,
  "broker.memory.usage": 78.5,
  "broker.network.throughput": 450000,
  "broker.request.latency": 12.5
}
```

## 🎨 Dashboard Features

### Visual Design Elements
- **Color Coding**: Health-based status indicators
- **Progressive Enhancement**: Mobile-responsive layouts
- **Interactive Elements**: Drill-down navigation
- **Real-time Updates**: Live data refresh capabilities

### Navigation Patterns
- **Hierarchical Browsing**: Account → Cluster → Entity
- **Cross-Entity Linking**: Related entity discovery
- **Contextual Filtering**: Smart filter application
- **Breadcrumb Navigation**: Clear navigation paths

## 🚀 Advanced Features

### AI-Driven Simulation
- **Anomaly Injection**: Realistic error scenarios
- **Load Pattern Simulation**: Business-hour variations
- **Seasonal Adjustments**: Holiday and weekend patterns
- **Predictive Scenarios**: Capacity planning simulations

### Multi-Tenancy Support
- **Account Isolation**: Secure data separation
- **Role-Based Access**: Permission-based filtering
- **Cross-Account Analytics**: Enterprise-wide insights
- **Compliance Reporting**: Audit and governance features

## 📚 Documentation

- [Dashboard Implementation Guide](../docs/DASHBOARD_IMPLEMENTATION_GUIDE.md) - Complete dashboard building guide
- [Entity Synthesis Guide](./COMPREHENSIVE_ENTITY_SYNTHESIS_GUIDE.md) - Entity modeling patterns
- [Testing Guide](./COMPREHENSIVE_TESTING_GUIDE.md) - Testing methodologies
- [Performance Guide](./config/performance-optimization.md) - Performance best practices

## 🤝 Contributing

1. Follow the MESSAGE_QUEUE_* entity model specification
2. Ensure dashboard compatibility across all widget types
3. Include performance testing for new features
4. Document simulation scenarios and expected outcomes

## 📞 Support

For technical questions related to dashboard implementation:
- Review the [Dashboard Implementation Guide](../docs/DASHBOARD_IMPLEMENTATION_GUIDE.md)
- Check existing simulation scenarios in `experiments/`
- Consult the verification system documentation

---

**Note**: This platform is designed for dashboard development and testing. It generates simulated data based on realistic message queue patterns to support sophisticated dashboard implementation without requiring actual infrastructure.