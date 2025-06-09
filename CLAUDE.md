# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the New Relic Message Queues Platform implementing a Unified Data Model (UDM) that bridges nri-kafka (real infrastructure data) with the MESSAGE_QUEUE_* entity framework, while maintaining simulation capabilities for testing.

> **📋 Reference**: See the [Technical Specification](docs/TECHNICAL_SPECIFICATION.md) for complete architecture details.

### Current Architecture
- **Infrastructure Mode**: Transforms real nri-kafka data → UDM → MESSAGE_QUEUE entities
- **Simulation Mode**: Generates UDM-compliant test data for development/demos
- **Hybrid Mode**: Combines real and simulated data for complete coverage
- **Dashboard CI/CD**: Automated dashboard build, deploy, and verification pipeline

## Development Philosophy

### Make It Work First, Then Extend
1. **Core Functionality First**: Ensure basic features work reliably before adding complexity
2. **Test with Real Data**: Use actual nri-kafka data to validate transformations
3. **Incremental Improvements**: Small, focused changes that can be tested immediately
4. **Always Have a Backlog**: Maintain 10+ todo items for continuous improvement

## Build and Development Commands

### Core Platform Commands
```bash
# Install dependencies
cd newrelic-message-queues-platform
npm install

# Run platform in different modes
node platform.js --mode=infrastructure    # Transform real nri-kafka data
node platform.js --mode=simulation       # Generate test data
node platform.js --mode=hybrid          # Combine real + simulated

# Run tests
npm test                    # Run all tests
npm test:coverage          # Run tests with coverage report
npm test:e2e               # Run end-to-end tests for all modes
npm test:integration       # Run integration tests (requires live services)
npm test EntityFactory     # Run specific test file

# Linting
npm run lint              # Run ESLint
npm run lint -- --fix     # Auto-fix issues
```

### Testing Infrastructure Mode
```bash
# 1. Start local Kafka (requires Docker)
docker-compose -f infrastructure/docker-compose.infra.yml up -d

# 2. Wait for Kafka to be ready
docker-compose logs -f kafka

# 3. Test infrastructure collection
node infrastructure/test-infra-collection.js

# 4. Run platform in infrastructure mode
DEBUG=platform:*,transform:* node platform.js --mode=infrastructure --interval=30
```

### Dashboard Operations
```bash
# Create dashboard from template
node dashboards/cli.js create --template=cluster-overview --provider=kafka

# List available templates
node dashboards/cli.js list-templates

# Generate dashboard suite
node dashboards/cli.js generate-suite --provider=kafka --environment=production
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
```

### Verification Commands
```bash
# Verify entity synthesis
node verification/verify-entities.js --type=MESSAGE_QUEUE_BROKER

# Verify dashboard
node verification/verify-dashboard.js --guid=YOUR_DASHBOARD_GUID

# Run platform verification
node verification/verify-platform.js
```

## Recent Accomplishments

### Unified Data Model (UDM) Implementation ✅
- Defined canonical schema for all MQ telemetry (MessageQueueBrokerSample, MessageQueueTopicSample, MessageQueueOffsetSample)
- Implemented proper entity GUID generation: `{entityType}|{accountId}|{provider}|{identifiers}`
- Created UDM transformation layer for nri-kafka data
- Aligned simulation engine to generate UDM-compliant events

### Infrastructure Mode Improvements ✅
- Added consumer offset collection via Kafka Admin API (--consumer_offset mode)
- Created docker-compose setup for local Kafka testing
- Built integration tests with 28 test cases
- Added performance benchmarking (400K+ samples/second capability)

### Dashboard CI/CD Platform ✅
- Built automated dashboard generation from templates
- Added API validation for all NRQL queries
- Implemented browser-based render validation with Playwright
- Created end-to-end deployment pipeline

### Hybrid Mode Implementation ✅
- Created HybridModeManager for gap detection and filling
- Built GapDetector to identify missing entities and stale metrics
- Added InfraEntitySimulator wrapper for safe metric updates
- Integrated comprehensive ConfigValidator with helpful error messages

## Current Focus Areas

### 2. Testing & Validation
- Create integration tests with sample nri-kafka data
- Build end-to-end test suite for all modes
- Add performance benchmarking
- Test with various scales (1 broker to 100+ brokers)

### 3. Dashboard Integration
- Ensure dashboards work with infrastructure-generated entities
- Create infrastructure-specific templates
- Test dashboard deployment end-to-end
- Optimize NRQL queries for performance

## Key Files and Their Purpose

### Core Platform
- `platform.js` - Main entry point supporting all three modes with ConfigValidator integration
- `core/entities/` - Entity definitions implementing UDM schema
- `core/config-validator.js` - Comprehensive configuration validation with helpful errors
- `core/hybrid-mode-manager.js` - Orchestrates gap detection and entity combination
- `core/gap-detector.js` - Analyzes gaps between infrastructure and desired topology
- `infrastructure/transformers/nri-kafka-transformer.js` - Transforms nri-kafka → UDM events
- `infrastructure/collectors/infra-agent-collector.js` - Queries NRDB for KafkaBrokerSample data

### Simulation (Keep Working)
- `simulation/engines/data-simulator.js` - Generates UDM-compliant realistic patterns
- `simulation/streaming/new-relic-streamer.js` - Streams UDM events to New Relic

### Dashboard CI/CD
- `dashboards/cli.js` - CLI for dashboard operations
- `dashboards/framework/` - Core dashboard engine (build, validate, deploy)
- `dashboards/templates/` - Infrastructure and platform dashboard templates
- `dashboards/content/message-queues/message-queues-content-provider.js` - Dashboard content definition
- `tools/testing/build-and-verify-dashboards.js` - End-to-end dashboard pipeline

### Verification
- `verification/verify-entities.js` - Validates entity synthesis
- `verification/verify-platform.js` - Comprehensive platform tests
- `tools/testing/programmatic-dashboard-deploy.js` - Dashboard deployment with validation

## Common Development Patterns

### Testing Infrastructure Mode
```javascript
// 1. Create test data that mimics nri-kafka output
const kafkaSample = {
  eventType: 'KafkaBrokerSample',
  'broker.id': 1,
  'broker.bytesInPerSecond': 1024000,
  'kafka.broker.logFlushRate': 0.5,
  clusterName: 'test-kafka'
};

// 2. Test transformation to UDM
const transformer = new NriKafkaTransformer();
const udmEvent = transformer.transformBroker(kafkaSample);

// 3. Verify UDM compliance
console.log(udmEvent.eventType); // 'MessageQueueBrokerSample'
console.log(udmEvent['broker.throughput.in.bytesPerSecond']); // 1024000
console.log(udmEvent.entityGuid); // MESSAGE_QUEUE_BROKER|123456|kafka|test-kafka|1
```

### Adding New Features
1. Start with failing test
2. Implement minimal code to pass
3. Test with real data if possible
4. Refactor for clarity
5. Update documentation

## Troubleshooting Common Issues

### No Data in Infrastructure Mode
1. Check nri-kafka is sending data: `FROM KafkaBrokerSample SELECT count(*) SINCE 5 minutes ago`
2. Verify API credentials are correct
3. Enable debug logging: `DEBUG=platform:*,transform:*`
4. Check entity synthesis: `FROM MessageQueue SELECT count(*) WHERE entityType LIKE 'MESSAGE_QUEUE_%'`

### Entity Synthesis Failing
1. Verify GUID format exactly matches pattern
2. Check all required tags are present
3. Wait 2-3 minutes for synthesis
4. Use correct event type: 'MessageQueue'

### Dashboard Creation Issues
1. Ensure data has been streaming for 5+ minutes
2. Verify User API key has dashboard permissions
3. Try with --dry-run first
4. Check account ID matches data account

## Architecture Decisions

### Why nri-kafka Instead of Custom JMX?
- Battle-tested in production
- Handles all edge cases
- Maintained by New Relic
- No JMX complexity to manage

### Why Keep Simulation Mode?
- Essential for testing without infrastructure
- Enables demos and training
- Allows load testing
- Development doesn't require Kafka

### Why MESSAGE_QUEUE Entities?
- Standardized across all queue types
- Enables consistent dashboards
- Future-proof for other providers
- Clear golden metrics

## Next Priorities (Always 10+)

Current active tasks:
1. **Platform Health Dashboard** - Create dashboard to monitor the platform itself
2. **RabbitMQ Provider** - Extend UDM for RabbitMQ, add nri-rabbitmq transformer
3. **Performance Optimization** - Implement data caching for NerdGraph queries
4. **Alert Templates** - Pre-built alerts based on UDM metrics
5. **Multi-Account Support** - Handle cross-account data collection
6. **Kubernetes Operator** - Deploy platform as K8s operator
7. **API Rate Limiting** - Smart throttling for API calls
8. **Cost Analytics** - Track infrastructure costs via metrics
9. **ML Anomaly Detection** - Integrate with New Relic Applied Intelligence
10. **ActiveMQ Support** - Add provider and UDM extensions
11. **Dashboard Versioning** - Track dashboard changes over time
12. **Automated Testing** - CI/CD pipeline for PRs

## Development Workflow

1. **Pick High Priority Todo**: Focus on items that make core features work
2. **Test Locally First**: Use docker-compose for local Kafka testing
3. **Verify with Real Data**: Always test transformations with actual samples
4. **Add Tests**: Every fix should include a test
5. **Document Changes**: Update relevant docs immediately

## Important Reminders

- **Test with real nri-kafka data** before claiming infrastructure mode works
- **Entity GUIDs must be exact** for synthesis to work
- **Don't over-engineer** - make it work first, optimize later
- **Keep simulation working** - it's essential for testing
- **Always maintain the todo list** with at least 10 items