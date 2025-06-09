# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the New Relic Message Queues Platform that bridges nri-kafka (real infrastructure data) with the MESSAGE_QUEUE_* entity framework, while maintaining simulation capabilities for testing.

### Current Architecture
- **Infrastructure Mode**: Transforms real nri-kafka data → MESSAGE_QUEUE entities
- **Simulation Mode**: Generates test data for development/demos
- **Hybrid Mode**: Combines real and simulated data for complete coverage

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

### Infrastructure Mode Improvements ✅
- Fixed entity GUID generation to match New Relic standards: `{entityType}|{accountId}|{provider}|{identifiers}`
- Added comprehensive error handling and retry logic
- Created docker-compose setup for local Kafka testing
- Built integration tests with 28 test cases
- Added performance benchmarking (400K+ samples/second capability)

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
- `core/entities/` - Entity definitions and factory
- `core/config-validator.js` - Comprehensive configuration validation with helpful errors
- `core/hybrid-mode-manager.js` - Orchestrates gap detection and entity combination
- `core/gap-detector.js` - Analyzes gaps between infrastructure and desired topology
- `infrastructure/transformers/nri-kafka-transformer.js` - Transforms nri-kafka data (GUID fix applied)
- `infrastructure/collectors/infra-agent-collector.js` - Queries NRDB for data

### Simulation (Keep Working)
- `simulation/engines/data-simulator.js` - Generates realistic patterns
- `simulation/streaming/new-relic-streamer.js` - Streams data to New Relic

### Dashboards
- `dashboards/cli.js` - CLI for dashboard operations
- `dashboards/framework/` - Core dashboard framework
- `dashboards/templates/` - Reusable dashboard templates

### Verification
- `verification/verify-entities.js` - Validates entity synthesis
- `verification/verify-platform.js` - Comprehensive platform tests

## Common Development Patterns

### Testing Infrastructure Mode
```javascript
// 1. Create test data that mimics nri-kafka
const sampleData = {
  eventType: 'KafkaBrokerSample',
  'broker.id': 1,
  'broker.bytesInPerSecond': 1024000,
  clusterName: 'test-kafka'
};

// 2. Test transformation
const transformer = new NriKafkaTransformer();
const entity = transformer.transformBroker(sampleData);

// 3. Verify entity structure
console.log(entity.entityGuid); // Should match pattern
console.log(entity.metrics);    // Should have all required metrics
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
1. **End-to-End Test Suite** (IN PROGRESS) - Comprehensive tests for all three modes
2. **Health Checks** - Add monitoring for the platform itself
3. **Data Caching** - Reduce NerdGraph query load
4. **RabbitMQ Support** - Add nri-rabbitmq integration
5. **Migration Guide** - Document path from simulation to infrastructure
6. **Deployment Scripts** - Automate platform deployment
7. **Performance Metrics** - Monitor platform performance
8. **Troubleshooting Guide** - Common infrastructure issues
9. **Entity Relationships** - Complete cluster-broker-topic mapping
10. **Consumer Group Lag** - Support from infrastructure data
11. **Alert Conditions** - Infrastructure-based alerting

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