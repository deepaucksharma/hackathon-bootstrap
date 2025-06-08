# New Relic Message Queues Platform Architecture

## Overview

The New Relic Message Queues Platform is designed as a modular, extensible system for developing and validating message queue monitoring solutions. It follows a layered architecture that separates concerns and enables independent evolution of components.

## Architecture Principles

1. **Modularity**: Each component has a single responsibility and clear interfaces
2. **Extensibility**: New providers and entity types can be added without core changes
3. **Testability**: Components are independently testable with minimal dependencies
4. **Observability**: The platform itself is observable and provides comprehensive metrics
5. **Developer Experience**: APIs are intuitive and consistent across modules

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         External Systems                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  New Relic  │  │    GitHub    │  │   Browser    │  │     CLI     │ │
│  │   Platform  │  │Entity Defs   │  │   Testing    │  │   Users     │ │
│  └──────▲──────┘  └──────▲───────┘  └──────▲───────┘  └──────▲──────┘ │
└─────────┼────────────────┼──────────────────┼──────────────────┼───────┘
          │                │                  │                  │
┌─────────┼────────────────┼──────────────────┼──────────────────┼───────┐
│         │                │                  │                  │        │
│  ┌──────▼────────────────▼──────────────────▼──────────────────▼──────┐│
│  │                          Platform API Layer                          ││
│  │  • REST API Server  • GraphQL Interface  • CLI Commands             ││
│  └──────┬───────────────────────────────────────────────────┬──────────┘│
│         │                                                   │           │
│  ┌──────▼────────────────────────┐  ┌──────────────────────▼──────────┐│
│  │     Core Platform Services     │  │    Verification Framework       ││
│  │                                │  │                                 ││
│  │  ┌──────────┐  ┌────────────┐ │  │  ┌──────────┐  ┌─────────────┐ ││
│  │  │ Entity   │  │ Dashboard  │ │  │  │ Entity   │  │  Browser    │ ││
│  │  │ Factory  │  │ Framework  │ │  │  │ Verifier │  │  Verifier   │ ││
│  │  └──────────┘  └────────────┘ │  │  └──────────┘  └─────────────┘ ││
│  │                                │  │                                 ││
│  │  ┌──────────┐  ┌────────────┐ │  │  ┌──────────┐  ┌─────────────┐ ││
│  │  │   Data   │  │  Metric    │ │  │  │  NRQL    │  │    E2E      │ ││
│  │  │Simulator │  │  Engine    │ │  │  │ Verifier │  │  Verifier   │ ││
│  │  └──────────┘  └────────────┘ │  │  └──────────┘  └─────────────┘ ││
│  └────────────────────────────────┘  └─────────────────────────────────┘│
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                      Data & Integration Layer                        ││
│  │                                                                      ││
│  │  ┌────────────┐  ┌─────────────┐  ┌──────────┐  ┌───────────────┐ ││
│  │  │   Event    │  │   Metric    │  │ NerdGraph│  │    Entity     │ ││
│  │  │    API     │  │     API     │  │   API    │  │   Importer    │ ││
│  │  └────────────┘  └─────────────┘  └──────────┘  └───────────────┘ ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                        Storage & Persistence                         ││
│  │                                                                      ││
│  │  ┌────────────┐  ┌─────────────┐  ┌──────────┐  ┌───────────────┐ ││
│  │  │  Entity    │  │  Template   │  │  Report  │  │ Configuration │ ││
│  │  │ Registry   │  │    Store    │  │  Store   │  │    Store      │ ││
│  │  └────────────┘  └─────────────┘  └──────────┘  └───────────────┘ ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### 1. Entity Layer

The Entity Layer provides the foundation for message queue entity modeling.

```
Entity Layer
├── BaseEntity (Abstract)
│   ├── Properties: entityType, guid, name, provider, metrics, tags
│   └── Methods: updateMetrics(), toNRDBEvent(), toMetricData()
│
├── Message Queue Entities
│   ├── MessageQueueCluster
│   ├── MessageQueueBroker
│   ├── MessageQueueTopic
│   └── MessageQueueQueue
│
├── EntityFactory
│   ├── createCluster()
│   ├── createBroker()
│   ├── createTopic()
│   └── createQueue()
│
└── EntityImporter
    ├── importFromGitHub()
    ├── mapToMessageQueueType()
    └── extractGoldenMetrics()
```

**Key Design Decisions:**
- Entities are immutable after creation (except metrics)
- GUIDs follow New Relic's entity synthesis format
- All entities inherit from BaseEntity for consistency
- Factory pattern ensures valid entity creation

### 2. Simulation Engine

The Simulation Engine generates realistic message queue behavior.

```
Simulation Engine
├── DataSimulator
│   ├── Topology Generation
│   │   ├── createTopology()
│   │   ├── generateClusterName()
│   │   └── assignRelationships()
│   │
│   ├── Metric Generation
│   │   ├── updateClusterMetrics()
│   │   ├── updateBrokerMetrics()
│   │   ├── updateTopicMetrics()
│   │   └── updateQueueMetrics()
│   │
│   └── Pattern Simulation
│       ├── businessHourPattern()
│       ├── weekendPattern()
│       ├── anomalyInjection()
│       └── seasonalVariation()
│
└── MetricEngine
    ├── Metric Calculations
    ├── Rate Limiting
    └── Correlation Management
```

**Simulation Patterns:**
- Business hours: 3x traffic during 9 AM - 5 PM
- Weekend: 40% reduction in traffic
- Anomalies: 5% chance of spikes/drops
- Seasonal: Monthly and quarterly patterns

### 3. Streaming Infrastructure

Handles data transmission to New Relic with reliability and performance.

```
Streaming Infrastructure
├── NewRelicStreamer
│   ├── Event Streaming
│   │   ├── batchEvents()
│   │   ├── compressPayload()
│   │   └── sendEventBatch()
│   │
│   ├── Metric Streaming
│   │   ├── convertToMetricFormat()
│   │   ├── aggregateMetrics()
│   │   └── sendMetricBatch()
│   │
│   └── Reliability
│       ├── retryWithBackoff()
│       ├── circuitBreaker()
│       └── deadLetterQueue()
│
└── StreamingOrchestrator
    ├── Scheduling
    ├── Rate Control
    └── Statistics Tracking
```

**Reliability Features:**
- Automatic retry with exponential backoff
- Circuit breaker for API protection
- Dead letter queue for failed transmissions
- Batch optimization for efficiency

### 4. Dashboard Framework

Modular system for dashboard generation and management.

```
Dashboard Framework
├── DashboardFramework (Core)
│   ├── buildDashboard()
│   ├── deployDashboard()
│   └── validateDashboard()
│
├── Content Providers
│   ├── MessageQueuesContentProvider
│   │   ├── getTemplateVariables()
│   │   ├── getWidgetDefinitions()
│   │   └── getQueryDefinitions()
│   │
│   └── ContentProvider (Interface)
│
├── Template System
│   ├── TemplateProcessor
│   │   ├── loadTemplate()
│   │   ├── processVariables()
│   │   └── validateOutput()
│   │
│   └── Templates
│       ├── cluster-overview.json
│       ├── broker-performance.json
│       ├── topic-analysis.json
│       └── queue-metrics.json
│
└── Layout Engine
    ├── LayoutOptimizer
    ├── ResponsiveGrid
    └── WidgetPlacer
```

**Dashboard Features:**
- Template-based generation
- Dynamic query building
- Responsive layouts
- Provider-specific optimizations

### 5. Verification Framework

Comprehensive testing and validation system.

```
Verification Framework
├── VerificationOrchestrator
│   ├── Workflow Management
│   ├── Parallel Execution
│   └── Report Aggregation
│
├── Entity Verification
│   ├── EntityVerifier
│   │   ├── verifySynthesis()
│   │   ├── verifyAttributes()
│   │   ├── verifyGoldenMetrics()
│   │   └── verifyRelationships()
│   │
│   └── Entity Tests
│       ├── Count Verification
│       ├── Attribute Validation
│       └── Data Freshness
│
├── Dashboard Verification
│   ├── DashboardVerifier
│   │   ├── verifyStructure()
│   │   ├── verifyWidgets()
│   │   ├── verifyQueries()
│   │   └── verifyPerformance()
│   │
│   └── NRQL Validation
│       ├── Syntax Check
│       ├── Data Availability
│       └── Performance Analysis
│
├── Browser Verification
│   ├── BrowserVerifier
│   │   ├── loadDashboard()
│   │   ├── testInteractions()
│   │   ├── captureMetrics()
│   │   └── crossBrowserTest()
│   │
│   └── Playwright Integration
│       ├── Multi-browser Support
│       ├── Visual Testing
│       └── Performance Metrics
│
└── Report Generation
    ├── ReportGenerator
    │   ├── HTML Reports
    │   ├── Markdown Reports
    │   └── JSON Reports
    │
    └── Report Templates
```

### 6. CLI Architecture

Command-line interface with modular command structure.

```
CLI Architecture
├── Command Parser (Commander.js)
│   ├── Global Options
│   ├── Command Registry
│   └── Help System
│
├── Command Modules
│   ├── simulate/
│   │   ├── stream.js
│   │   └── create-topology.js
│   │
│   ├── dashboard/
│   │   ├── create.js
│   │   ├── generate-suite.js
│   │   └── list-templates.js
│   │
│   ├── entity/
│   │   ├── import.js
│   │   └── create.js
│   │
│   └── verify/
│       ├── platform.js
│       ├── dashboard.js
│       └── batch.js
│
└── Interactive Mode
    ├── Inquirer Integration
    ├── Workflow Guides
    └── Configuration Wizard
```

## Data Flow

### 1. Entity Creation Flow

```
User Input → EntityFactory → Entity Instance
                ↓
         Validation & GUID Generation
                ↓
         Tag Assignment & Metadata
                ↓
         Metric Initialization
                ↓
         Entity Registry Storage
```

### 2. Streaming Flow

```
Entity Collection → Batch Aggregation → Compression
                           ↓
                    API Authentication
                           ↓
                    Payload Transmission
                           ↓
                    Retry Logic (if needed)
                           ↓
                    Statistics Update
```

### 3. Dashboard Generation Flow

```
Template Selection → Variable Resolution → Widget Generation
                            ↓
                     Query Construction
                            ↓
                     Layout Optimization
                            ↓
                     NerdGraph Deployment
                            ↓
                     Verification Trigger
```

### 4. Verification Flow

```
Test Configuration → Parallel Test Execution → Result Collection
                              ↓
                      Score Calculation
                              ↓
                      Recommendation Engine
                              ↓
                      Report Generation
                              ↓
                      Output & Notifications
```

## Security Architecture

### API Key Management
- Separate keys for ingestion and management
- Environment variable storage
- No hardcoded credentials
- Key rotation support

### Data Privacy
- No PII in simulated data
- Configurable data retention
- Audit logging for actions
- Secure credential storage

### Network Security
- HTTPS for all API calls
- Certificate validation
- Request signing
- Rate limiting compliance

## Scalability Considerations

### Horizontal Scaling
- Stateless service design
- Distributed simulation possible
- Parallel verification execution
- Load balancer ready

### Performance Optimization
- Batch API operations
- Efficient data structures
- Lazy loading of templates
- Caching of common queries

### Resource Management
- Memory-efficient streaming
- Configurable batch sizes
- Graceful degradation
- Resource pooling

## Extension Points

### Adding New Providers

1. Implement provider-specific entity mappings
2. Create metric generation patterns
3. Define dashboard templates
4. Add verification rules

```javascript
// Example: Adding Azure Service Bus
class AzureServiceBusProvider extends BaseProvider {
  getEntityMappings() {
    return {
      namespace: 'MESSAGE_QUEUE_CLUSTER',
      topic: 'MESSAGE_QUEUE_TOPIC',
      subscription: 'MESSAGE_QUEUE_QUEUE'
    };
  }
  
  generateMetrics(entity) {
    // Provider-specific metric generation
  }
}
```

### Custom Entity Types

1. Extend BaseEntity class
2. Define GUID format
3. Implement metric schema
4. Create factory method

```javascript
class MessageQueueConsumerGroup extends BaseEntity {
  constructor(config) {
    super({
      ...config,
      entityType: 'MESSAGE_QUEUE_CONSUMER_GROUP'
    });
  }
  
  getRequiredTags() {
    return ['groupId', 'topicName'];
  }
}
```

### Dashboard Templates

1. Create JSON template
2. Define variable schema
3. Add to template registry
4. Implement content provider

```json
{
  "name": "consumer-group-monitor",
  "variables": {
    "groupId": "{{groupId}}",
    "environment": "{{environment}}"
  },
  "widgets": [...]
}
```

## Deployment Architecture

### Development Environment
```
Local Development
├── Node.js Runtime
├── Environment Variables
├── Local File Storage
└── Direct API Access
```

### Production Deployment
```
Production Environment
├── Container/Kubernetes
├── Secret Management
├── Persistent Volumes
├── Load Balancer
└── Monitoring & Logging
```

### CI/CD Pipeline
```
GitHub → Build → Test → Package → Deploy
          ↓       ↓       ↓         ↓
        Lint   Unit   Docker    Staging
              Tests   Image    Production
```

## Monitoring & Observability

The platform itself should be monitored:

1. **Metrics**
   - API call success/failure rates
   - Streaming throughput
   - Verification pass rates
   - Dashboard generation time

2. **Logging**
   - Structured JSON logging
   - Log levels (debug, info, warn, error)
   - Correlation IDs
   - Performance metrics

3. **Alerting**
   - API failures
   - Verification failures
   - Performance degradation
   - Resource exhaustion

## Future Architecture Considerations

1. **Multi-Region Support**
   - Region-aware streaming
   - Cross-region replication
   - Latency optimization

2. **Plugin System**
   - Dynamic provider loading
   - Custom verification rules
   - Third-party integrations

3. **API Gateway**
   - Rate limiting
   - Authentication
   - Request routing
   - API versioning

4. **Event-Driven Architecture**
   - Webhook notifications
   - Event streaming
   - Async processing
   - State machines