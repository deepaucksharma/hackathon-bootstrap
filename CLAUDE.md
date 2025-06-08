# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

### Core Platform Commands
```bash
# Install dependencies
cd newrelic-message-queues-platform
npm install

# Run tests
npm test                    # Run all tests
npm test:coverage          # Run tests with coverage report
npm test -- --watch       # Run tests in watch mode
npm test EntityFactory    # Run specific test file

# Linting
npm run lint              # Run ESLint
npm run lint -- --fix     # Auto-fix linting issues

# Development
npm run dev               # Start with nodemon (auto-reload)
npm start                 # Start the platform

# Verification
npm run verify            # Run verification framework
node verification/runners/verification-runner.js --dashboard-guid <guid>

# Simulation
npm run simulate          # Stream simulated data
node examples/production-streaming.js --dry-run --duration=5

# Dashboard operations
npm run dashboard         # Create dashboard
node tools/cli/mq-platform.js dashboard create --template=overview
```

### CLI Tool Commands
```bash
# Main CLI tool
./tools/cli/mq-platform.js <command> [options]

# Simulation commands
mq-platform.js simulate create-topology --provider kafka --clusters 2
mq-platform.js simulate stream --duration 5 --interval 30

# Dashboard commands  
mq-platform.js dashboard create --template overview --name "Production Overview"
mq-platform.js dashboard list-templates
mq-platform.js dashboard generate-suite --output ./dashboards

# Verification commands
mq-platform.js verify dashboard --guid <dashboard-guid>
mq-platform.js verify batch --guids guid1,guid2,guid3
mq-platform.js verify platform --comprehensive

# Entity management
mq-platform.js entity create --type cluster --provider kafka
mq-platform.js entity import --source github --repo newrelic/entity-definitions

# Interactive mode
mq-platform.js interactive
```

### Quick Development Tasks
```bash
# Test connectivity to New Relic
node test-connectivity.js

# Run the interactive showcase
node showcase.js

# Verify platform installation
node test-suite.js

# Create and verify dashboards offline
node verify-dashboards-offline.js
```

## High-Level Architecture

### Platform Structure
The platform is organized into distinct layers with clear separation of concerns:

1. **Core Layer** (`core/`)
   - **Entities**: MESSAGE_QUEUE_* entity definitions with BaseEntity abstraction
   - **Relationships**: Bidirectional relationship management between entities
   - **Metrics**: Golden metric calculations and aggregation
   - **Providers**: Provider-specific adapters (Kafka, RabbitMQ, SQS, etc.)

2. **Simulation Layer** (`simulation/`)
   - **Engines**: DataSimulator generates realistic patterns (business hours, anomalies)
   - **Streaming**: NewRelicStreamer handles reliable data transmission with retry logic
   - **Patterns**: Configurable data patterns for different scenarios
   - **Scenarios**: Pre-built simulation scenarios (production, development, chaos)

3. **Dashboard Layer** (`dashboards/`)
   - **Framework**: Generic dashboard framework with content provider pattern
   - **Builders**: Dashboard generation from templates with variable substitution
   - **Templates**: JSON-based dashboard definitions
   - **Components**: Reusable widget and layout components

4. **Verification Layer** (`verification/`)
   - **Orchestrator**: Coordinates multi-stage verification workflows
   - **Verifiers**: Entity, Dashboard, NRQL, and Browser verification
   - **Reports**: HTML, Markdown, and JSON report generation
   - **Browser Testing**: Playwright-based cross-browser validation

### Key Design Patterns

1. **Factory Pattern**: EntityFactory creates valid entities with proper GUIDs and relationships
2. **Template Method**: BaseEntity defines entity lifecycle, subclasses implement specifics
3. **Content Provider**: Dashboard framework uses pluggable content providers for different domains
4. **Builder Pattern**: DashboardBuilder constructs dashboards from templates and variables
5. **Strategy Pattern**: Different simulation patterns can be applied dynamically

### Data Flow Architecture

#### Entity Creation and Streaming
```
User Input → EntityFactory → Entity Instance → DataSimulator → Metrics
                                                      ↓
                                            NewRelicStreamer
                                                      ↓
                                              Event/Metric API
```

#### Dashboard Generation
```
Template + Variables → DashboardFramework → ContentProvider → NRQL Generation
                                                    ↓
                                              Layout Engine
                                                    ↓
                                             NerdGraph API
```

#### Verification Pipeline
```
Dashboard GUID → VerificationOrchestrator → Parallel Verifiers → Score Calculation
                            ↓                         ↓
                     Entity Verifier          Browser Verifier
                     NRQL Verifier           Performance Tests
                            ↓                         ↓
                        Report Generator → HTML/JSON/Markdown
```

### Critical Integration Points

1. **New Relic APIs**
   - Event API: High-volume event ingestion (batch size: 1000)
   - Metric API: Dimensional metrics with 1-minute resolution
   - NerdGraph: Dashboard CRUD operations
   - Entity Synthesis: GUID format must match pattern

2. **Environment Configuration**
   - Required: `NEW_RELIC_ACCOUNT_ID`, `NEW_RELIC_USER_API_KEY`
   - Optional: `NEW_RELIC_INGEST_KEY`, `NEW_RELIC_REGION`
   - Config precedence: ENV vars → config files → defaults

3. **Provider-Specific Logic**
   - Each provider (Kafka, RabbitMQ, etc.) has unique entity mappings
   - Metric names and calculations vary by provider
   - Dashboard templates are provider-aware

### Performance Considerations

1. **Streaming Optimization**
   - Batch events/metrics for efficient API usage
   - Implement exponential backoff for retries
   - Use circuit breaker pattern for API protection

2. **Memory Management**
   - Entity registry uses Maps for O(1) lookups
   - Streaming uses chunking to avoid memory spikes
   - Verification runs tests in parallel with controlled concurrency

3. **Dashboard Performance**
   - NRQL queries optimized with proper time windows
   - Widget count limited to prevent UI slowness
   - Layout engine ensures responsive design

### Extension Points

1. **Adding New Providers**
   - Extend BaseEntity for provider-specific entities
   - Implement provider adapter in `core/providers/`
   - Create dashboard templates in `dashboards/templates/`
   - Add simulation patterns in `simulation/patterns/`

2. **Custom Entity Types**
   - Define new entity type constant
   - Implement entity class extending BaseEntity
   - Add factory method in EntityFactory
   - Create golden metrics definition

3. **Dashboard Templates**
   - JSON format with variable substitution
   - Widget definitions with NRQL queries
   - Layout specifications for responsive grid
   - Provider-specific optimizations

### Testing Strategy

1. **Unit Tests** (`__tests__/`)
   - Mock external dependencies
   - Test individual components in isolation
   - Focus on business logic and calculations

2. **Integration Tests**
   - Test API interactions with mock servers
   - Verify entity relationships
   - Dashboard generation end-to-end

3. **Verification Tests**
   - Automated dashboard validation
   - Cross-browser compatibility
   - Performance benchmarking

### Common Development Patterns

1. **Entity Creation**
   ```javascript
   const factory = new EntityFactory();
   const cluster = factory.createCluster({
     name: 'prod-kafka-01',
     provider: 'kafka',
     region: 'us-east-1'
   });
   ```

2. **Metric Simulation**
   ```javascript
   const simulator = new DataSimulator();
   simulator.updateClusterMetrics(cluster);
   ```

3. **Dashboard Generation**
   ```javascript
   const framework = new DashboardFramework({ apiKey, accountId });
   framework.setContentProvider(new MessageQueuesContentProvider());
   const dashboard = await framework.buildAndDeploy('cluster-overview', variables);
   ```

### v2.0 Evolution Context

The platform is evolving from simulation-only (v1.0) to support real infrastructure monitoring (v2.0):

1. **Dual-Mode Architecture**: Simulation mode + Infrastructure mode
2. **Foundation Layer**: New transformation pipeline for real metrics
3. **Discovery Service**: Auto-discovery of Kubernetes/Docker resources
4. **SHIM Layer**: Transforms infrastructure data to MESSAGE_QUEUE entities

Implementation follows two parallel tracks over 8 weeks:
- Track 1: Infrastructure & Foundation (Backend)
- Track 2: Simulation & Dashboard Enhancement (Frontend)

See `vision/IMPLEMENTATION_PLAN_V2.md` for detailed roadmap.