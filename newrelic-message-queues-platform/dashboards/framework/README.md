# Dashboard Framework Architecture

After analyzing the current dashboards folder, I've identified the need to separate the **generic framework** from **content-specific implementations**. This creates a clean separation of concerns and reusable components.

## Current State Analysis

The dashboards folder currently contains:

### 🔧 **Framework Components** (Generic & Reusable)
- `lib/dashboard-orchestrator.js` - Workflow orchestration
- `lib/metric-discovery.js` - Metric discovery engine
- `lib/metric-classifier.js` - Intelligent metric classification
- `lib/query-builder.js` - NRQL query generation
- `lib/layout-optimizer.js` - Widget positioning
- `lib/template-engine.js` - Template processing engine

### 📊 **Content Components** (Domain-Specific)
- `builders/dashboard-builder.js` - MESSAGE_QUEUE_* specific builder
- Templates with hardcoded MESSAGE_QUEUE_* queries
- Widget definitions with domain-specific logic
- Provider-specific configurations

## Proposed Framework Structure

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

## Framework Design Principles

### 1. **Separation of Concerns**
```javascript
// Framework provides the engine
const DashboardFramework = require('./framework');

// Content provides the domain knowledge
const MessageQueuesContent = require('./content/message-queues');

// Usage combines both
const dashboard = new DashboardFramework({
  contentProvider: new MessageQueuesContent(),
  nerdGraphClient: new NerdGraphClient(config)
});
```

### 2. **Interface-Driven Design**
```javascript
// IContentProvider interface
class IContentProvider {
  getTemplates() { throw new Error('Not implemented'); }
  getEntitySchemas() { throw new Error('Not implemented'); }
  getWidgetDefinitions() { throw new Error('Not implemented'); }
  getQueryPatterns() { throw new Error('Not implemented'); }
}

// MESSAGE_QUEUE_* implementation
class MessageQueuesContentProvider extends IContentProvider {
  getTemplates() {
    return {
      'cluster-overview': { /* MESSAGE_QUEUE_CLUSTER template */ },
      'topic-analysis': { /* MESSAGE_QUEUE_TOPIC template */ }
    };
  }
}
```

### 3. **Configuration-Driven Templates**
```javascript
// Template definition (content)
const clusterTemplate = {
  name: 'Cluster Overview',
  entityType: 'MESSAGE_QUEUE_CLUSTER',
  sections: [
    {
      title: 'Health KPIs',
      widgets: [
        {
          type: 'billboard',
          title: 'Health Score',
          query: {
            from: 'MESSAGE_QUEUE_CLUSTER_SAMPLE',
            select: 'latest(cluster.health.score)',
            where: ['provider = {{provider}}'],
            since: '{{timeRange}}'
          },
          thresholds: [
            { alertSeverity: 'CRITICAL', value: 60 },
            { alertSeverity: 'WARNING', value: 80 }
          ]
        }
      ]
    }
  ]
};

// Framework processes template generically
const dashboard = framework.buildDashboard(clusterTemplate, variables);
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

## Migration Strategy

1. **Extract Framework Core** (Phase 1)
   - Move generic logic to `framework/core/`
   - Create interfaces in `framework/interfaces/`
   - Build framework utilities

2. **Create Content Packages** (Phase 2)
   - Extract MESSAGE_QUEUE_* specifics to `content/message-queues/`
   - Convert hardcoded templates to configuration
   - Create provider-specific content

3. **Update Integration Points** (Phase 3)
   - Update CLI to use framework + content
   - Update examples and documentation
   - Ensure backward compatibility

4. **Add New Domains** (Phase 4)
   - Create `content/infrastructure/` for system metrics
   - Create `content/application/` for APM metrics
   - Demonstrate framework reusability

This architecture transforms the current monolithic approach into a clean, reusable framework that can power dashboard generation for any domain while keeping MESSAGE_QUEUE_* specifics properly encapsulated.