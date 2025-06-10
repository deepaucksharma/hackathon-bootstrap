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
- **Multi-Cluster Support**: Monitor multiple Kafka clusters efficiently
- **Custom Metrics**: Define and track custom metrics via YAML/JSON

## Development Philosophy

### Make It Work First, Then Extend
1. **Core Functionality First**: Ensure basic features work reliably before adding complexity
2. **Test with Real Data**: Use actual nri-kafka data to validate transformations
3. **Incremental Improvements**: Small, focused changes that can be tested immediately
4. **Always Have a Backlog**: Maintain 10+ todo items for continuous improvement

### Priority Guidance
- It's a priority to make everything work end to end and our primary focus should be on making end to end functional flows work.

### Security Practices
- .env file has credentials, do not hardcode keys in source code
- Never commit API keys or secrets to the repository
- Use environment variables for all sensitive configuration

## Important Implementation Notes

### Event Type Pattern
The platform uses a dynamic event type pattern: `{entityType}_SAMPLE`
- Example: `MESSAGE_QUEUE_BROKER` → `MESSAGE_QUEUE_BROKER_SAMPLE`
- NOT: `MessageQueueBrokerSample` (this is incorrect documentation)
- See: `docs/EVENT_TYPE_MIGRATION_GUIDE.md` for details

### Entity GUID Pattern
Standardized format: `{entityType}|{accountId}|{provider}|{identifiers}`
- Example: `MESSAGE_QUEUE_BROKER|12345|kafka|prod-cluster|broker-1`
- Consistent across all components (base-entity.js and transformers)

### Advanced Features Available
The platform includes several undocumented but powerful features:
- **Worker Pools**: Parallel processing with configurable pool sizes
- **Circuit Breaker**: Prevents cascading failures with external services
- **Error Recovery**: Exponential backoff and dead letter queue
- **API Server**: REST API for monitoring and control
- **Prometheus Metrics**: Built-in metrics exporter
- **Health Checks**: Comprehensive component health monitoring
- See: `docs/ADVANCED_FEATURES.md` for complete documentation

## Current Todo List (Priority Order)

### ✅ Completed
1. Fixed event type naming to match implementation
2. Standardized entity GUID pattern across components
3. Created end-to-end test for infrastructure mode
4. Documented all advanced features
5. Created migration guide for event type changes

### 🚧 In Progress
- Platform health dashboard implementation
- Performance optimization for large clusters
- Enhanced monitoring capabilities

### 📋 Future Priorities
1. **Platform Health Dashboard** - Monitor the platform itself
2. **Cache Layer** - Reduce NerdGraph API calls
3. **WebSocket Support** - Real-time metric streaming
4. **Alert Templates** - Pre-built alerts for common scenarios
5. **Kubernetes Operator** - Deploy as K8s operator
6. **Cost Analytics** - Track infrastructure costs via metrics
7. **ML Anomaly Detection** - Integrate with Applied Intelligence
8. **Dashboard Versioning** - Track dashboard changes over time
9. **Multi-Account Support** - Cross-account data collection
10. **Performance Benchmarking** - Automated performance tests

## Common Development Tasks

### Testing Infrastructure Mode
```bash
# With real Kafka
docker-compose -f infrastructure/docker-compose.infra.yml up -d
node platform.js --mode infrastructure --interval 30

# With multi-cluster support
node platform.js --mode infrastructure --multi-cluster --cluster-filter "prod-*"
```

### Running Tests
```bash
# Run all tests
npm test

# Run specific test
node test-infrastructure-e2e.js

# Run with debug logging
DEBUG=platform:*,transform:* npm test
```

### Creating Dashboards
```bash
# Standard dashboard creation (RECOMMENDED APPROACH)
export NEW_RELIC_ACCOUNT_ID=your_account_id
export NEW_RELIC_USER_API_KEY=your_api_key

# Create standard 4-page dashboard
node newrelic-message-queues-platform/dashboards/templates/standard-message-queue-dashboard.js

# Create with custom name
node newrelic-message-queues-platform/dashboards/templates/standard-message-queue-dashboard.js "Production Kafka" "Production monitoring"

# Dashboard includes:
# - Executive Overview: Business KPIs, health scores, cost metrics
# - Consumer Groups: Lag analysis, consumer health, performance
# - Infrastructure & Cost: Resource utilization, cost optimization  
# - Topics & Partitions: Topic performance, partition distribution
```

## Key Files to Know

- `platform.js` - Main entry point with all three modes
- `infrastructure/transformers/nri-kafka-transformer.js` - Critical transformation logic
- `core/entities/base-entity.js` - Base entity class with GUID generation
- `dashboards/templates/standard-message-queue-dashboard.js` - Standard dashboard template
- `test-infrastructure-e2e.js` - Comprehensive infrastructure mode test
- `docs/ADVANCED_FEATURES.md` - Documentation for hidden features
- `docs/EVENT_TYPE_MIGRATION_GUIDE.md` - Event type pattern explanation

## Debugging Tips

1. **No data showing?** Check event types match `MESSAGE_QUEUE_*_SAMPLE` pattern
2. **Entity synthesis failing?** Verify GUID format and wait 2-3 minutes
3. **Transformation errors?** Enable debug: `DEBUG=transform:*`
4. **API errors?** Check circuit breaker status in logs

## Important: Do NOT
- Change event type pattern back to old format
- Modify GUID generation without updating all components
- Hardcode API keys or secrets
- Commit .env files
- Add RabbitMQ features (not required per user guidance)