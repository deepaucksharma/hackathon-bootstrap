# Message Queues Platform Documentation

Welcome to the New Relic Message Queues Platform documentation. This platform provides comprehensive observability for message queue infrastructure including Kafka, RabbitMQ, SQS, and other messaging systems.

## 📚 Documentation Index

### Getting Started
- **[Platform Guide](../PLATFORM_GUIDE.md)** - Complete overview and quick start guide
- **[Data Model Specification](DATA_MODEL.md)** - Official v3.0 data model reference

### Implementation Status
- **[Implementation Validation Report](IMPLEMENTATION_VALIDATION_REPORT.md)** - Detailed compliance assessment
- **[Platform Implementation Summary](PLATFORM_IMPLEMENTATION_SUMMARY.md)** - Current status and action plan
- **[Live Data Transformation Pipeline](LIVE_DATA_TRANSFORMATION_PIPELINE.md)** - Real-time data flow documentation

### Component Documentation
- **[Dashboard Implementation Guide](DASHBOARD_IMPLEMENTATION_GUIDE.md)** - Dashboard system architecture
- **[Dashboard Generation Complete](../dashboards/DASHBOARD_GENERATION_COMPLETE.md)** - Dashboard features and usage
- **[Metrics Reference](metrics-reference.md)** - Complete metrics catalog

### Technical Specifications
- **[Ultra Detailed Product Specification](ULTRA_DETAILED_PRODUCT_SPECIFICATION.md)** - Comprehensive technical spec
- **[Message Queues PRD](MESSAGE_QUEUES_PRD.md)** - Product requirements document

## 🚀 Quick Links

### Check Platform Status
```bash
# Platform health
curl http://localhost:3333/health

# Entity summary
curl http://localhost:3333/api/entities/summary

# View sample entities
curl http://localhost:3333/api/entities | jq '.[0:3]'
```

### Dashboard Management
```bash
# Validate configuration
node dashboards/cli/dashboard-cli.js validate

# Generate dashboard
node dashboards/cli/dashboard-cli.js generate --name "My Dashboard"

# Check generator health
node dashboards/cli/dashboard-cli.js health
```

## 📊 Current Status

### Platform Metrics
- **Version**: 1.0.0
- **Entity Types**: 5 implemented, 3 streaming
- **Compliance**: 60% (v3.0 specification)
- **Dashboard Widgets**: 31 across 5 pages

### Known Issues
1. **GUID Format**: Non-compliant with v3.0 specification
2. **Entity Generation**: Consumer Groups and Queues not streaming
3. **Pattern Inconsistency**: Consumer Group implementation differs

### Action Items
- [ ] Fix GUID generation to v3.0 format
- [ ] Enable all 5 entity types in simulation
- [ ] Standardize entity implementation patterns
- [ ] Update documentation post-fixes

## 🔧 Development

### Project Structure
```
newrelic-message-queues-platform/
├── core/               # Core platform components
├── dashboards/         # Dashboard generation system
├── simulation/         # Data simulation engine
├── infrastructure/     # Real data collection
├── verification/       # Testing and verification
└── docs/              # This documentation
```

### Key Commands
```bash
# Run platform
node platform.js --mode simulation

# Run with debug
DEBUG=platform:* node platform.js

# Save data model
node platform.js --save-data-model ./output.json

# Run verification
node verification/runners/verification-runner.js
```

## 📞 Support

For issues or questions:
1. Check the [Implementation Validation Report](IMPLEMENTATION_VALIDATION_REPORT.md)
2. Review the [Platform Guide](../PLATFORM_GUIDE.md)
3. Examine platform logs for detailed error information

---

*Documentation last updated: 2025-06-09*