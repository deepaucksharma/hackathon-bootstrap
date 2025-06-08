# Dashboard Framework

A generic, reusable framework for building New Relic dashboards with clean separation between framework logic and domain-specific content.

## ✅ Framework Implementation Complete

The dashboard framework has been successfully extracted and implemented with complete separation of concerns:

### 🔧 **Framework Components** (Generic & Reusable)
- `core/dashboard-framework.js` - Main framework orchestrator
- `core/orchestrator.js` - Workflow orchestration engine
- `core/layout-engine.js` - Generic layout optimization
- `core/template-processor.js` - Template processing with variables
- `core/query-builder.js` - NRQL query generation
- `utils/nerdgraph-client.js` - New Relic API client
- `interfaces/content-provider.js` - Content provider interface

### 📊 **Content Implementation** (MESSAGE_QUEUE_* Domain)
- `content/message-queues/message-queues-content-provider.js` - MESSAGE_QUEUE_* specific content
- Templates for clusters, brokers, topics, and queues
- Entity schemas and widget definitions
- Provider-specific configurations (Kafka, RabbitMQ, SQS, etc.)

## Framework Architecture

```
dashboards/
├── framework/                    # 🔧 GENERIC FRAMEWORK
│   ├── core/                     # Core framework components
│   │   ├── orchestrator.js       # Generic workflow orchestration
│   │   ├── metric-discovery.js   # Generic metric discovery
│   │   ├── classifier.js         # Generic metric classification
│   │   ├── query-builder.js      # Generic NRQL generation
│   │   ├── layout-engine.js      # Generic layout optimization
│   │   └── template-processor.js # Generic template engine
│   ├── interfaces/               # Framework interfaces
│   │   ├── dashboard-builder.js  # IDashboardBuilder interface
│   │   ├── template-provider.js  # ITemplateProvider interface
│   │   └── content-provider.js   # IContentProvider interface
│   └── utils/                    # Framework utilities
│       ├── nerdgraph-client.js   # NerdGraph API client
│       ├── validation.js         # Dashboard validation
│       └── responsive-design.js  # Responsive layout utils
│
├── content/                      # 📊 DOMAIN-SPECIFIC CONTENT
│   ├── message-queues/           # MESSAGE_QUEUE_* content
│   │   ├── templates/            # MQ-specific templates
│   │   ├── widgets/              # MQ-specific widgets
│   │   ├── providers/            # MQ provider configs
│   │   └── schemas/              # MQ entity schemas
│   ├── infrastructure/           # System metrics content
│   └── application/              # APM content
│
└── examples/                     # Usage examples
    ├── message-queues-example.js
    ├── infrastructure-example.js
    └── custom-domain-example.js
```

## Quick Start

### 1. **Basic Usage**
```javascript
const DashboardFramework = require('./framework/core/dashboard-framework');
const MessageQueuesContentProvider = require('./content/message-queues/message-queues-content-provider');

// Initialize framework
const framework = new DashboardFramework({
  apiKey: process.env.NEW_RELIC_USER_API_KEY,
  accountId: process.env.NEW_RELIC_ACCOUNT_ID
});

// Set content provider
framework.setContentProvider(new MessageQueuesContentProvider());

// Create dashboard
const result = await framework.buildAndDeploy('cluster-overview', {
  provider: 'kafka',
  environment: 'production'
}, {
  name: 'My Kafka Cluster Dashboard'
});

console.log(`Dashboard created: ${result.permalink}`);
```

### 2. **CLI Usage**
```bash
# List available templates
./cli.js list-templates

# Preview dashboard
./cli.js preview cluster-overview --variables '{"provider":"kafka"}' -o preview.html

# Create dashboard
./cli.js create cluster-overview --name "Production Kafka" --variables '{"provider":"kafka"}'

# Validate template
./cli.js validate topic-analysis

# Get provider information
./cli.js provider-info message-queues
```

## Framework Design Principles

### 1. **Separation of Concerns**
- **Framework**: Generic dashboard building logic
- **Content**: Domain-specific templates and knowledge
- **Interface**: Clean contract between framework and content

### 2. **Interface-Driven Design**
```javascript
// Framework accepts any content provider that implements the interface
class IContentProvider {
  getTemplates() { /* Required */ }
  getTemplate(name) { /* Required */ }
  getVisualizationConfig(type) { /* Required */ }
  getEntityVariables(entityType) { /* Required */ }
  getMetadata() { /* Required */ }
}
```

### 3. **Template-Driven Configuration**
```javascript
// Declarative template definition
const template = {
  name: 'Cluster Overview',
  entityType: 'MESSAGE_QUEUE_CLUSTER',
  variables: [
    { name: 'provider', type: 'ENUM', possibleValues: ['kafka', 'rabbitmq'] }
  ],
  sections: [
    {
      title: 'Health Metrics',
      widgets: [
        {
          type: 'billboard',
          title: 'Health Score',
          query: {
            from: 'MESSAGE_QUEUE_CLUSTER_SAMPLE',
            select: 'latest(cluster.health.score)',
            where: ['provider = {{provider}}']
          }
        }
      ]
    }
  ]
};
```

## Benefits of This Architecture

### ✅ **Framework Benefits**
- **Reusable**: Same framework works for any domain
- **Testable**: Framework logic isolated from content
- **Maintainable**: Clear separation of generic vs. specific code
- **Extensible**: Easy to add new domains

### ✅ **Content Benefits**  
- **Domain-Focused**: MESSAGE_QUEUE_* logic in one place
- **Declarative**: Templates as configuration, not code
- **Versioned**: Content can be versioned independently
- **Shareable**: Content packages can be shared

### ✅ **Usage Benefits**
- **Simple**: Clean API for end users
- **Flexible**: Mix and match framework with different content
- **Consistent**: Same patterns across all domains
- **Performant**: Framework optimizations benefit all domains

## ✅ Implementation Status

### **COMPLETED: Framework Extraction**
- ✅ **Framework Core**: All generic components extracted and implemented
- ✅ **Content Provider**: MESSAGE_QUEUE_* content fully separated
- ✅ **Interface Design**: Clean contract between framework and content
- ✅ **CLI Tool**: Command-line interface for framework usage
- ✅ **Examples**: Comprehensive usage examples and documentation

### **Available Components**

#### Framework Core (Generic)
- `DashboardFramework` - Main orchestrator
- `DashboardOrchestrator` - Workflow engine
- `LayoutEngine` - Responsive layout optimization
- `TemplateProcessor` - Variable substitution and conditionals
- `QueryBuilder` - NRQL query generation
- `NerdGraphClient` - New Relic API client

#### Content Implementation (MESSAGE_QUEUE_*)
- `MessageQueuesContentProvider` - Complete MESSAGE_QUEUE_* implementation
- Templates: cluster-overview, topic-analysis, broker-health, queue-monitoring
- Entity schemas for all MESSAGE_QUEUE_* types
- Provider support: Kafka, RabbitMQ, SQS, Azure Service Bus, Google Pub/Sub

#### Tools & Examples
- `cli.js` - Full-featured command-line interface
- `examples/message-queues-example.js` - Complete usage demonstration
- Validation, preview, and batch creation capabilities

### **Usage Ready**
The framework is now ready for production use with complete separation of concerns:

```javascript
// Generic framework + MESSAGE_QUEUE_* content
const framework = new DashboardFramework(config);
framework.setContentProvider(new MessageQueuesContentProvider());

// Create any MESSAGE_QUEUE_* dashboard
const dashboard = await framework.buildAndDeploy('cluster-overview', variables);
```

### **Extensibility Proven**
The framework architecture enables easy extension to new domains:

```javascript
// Same framework works with any content provider
framework.setContentProvider(new InfrastructureContentProvider());
framework.setContentProvider(new ApplicationContentProvider());
framework.setContentProvider(new CustomDomainContentProvider());
```

This implementation successfully transforms the monolithic dashboard approach into a clean, reusable framework that powers dashboard generation for any domain while keeping MESSAGE_QUEUE_* specifics properly encapsulated.