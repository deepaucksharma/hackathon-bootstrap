# Documentation Consolidation Plan

## Overview

This plan outlines the consolidation of 30+ scattered markdown files into a unified, well-organized documentation structure. The current documentation has significant redundancy, outdated content, and poor organization that makes it difficult for users and developers to find information.

## Current State Analysis

### Documentation Inventory
- **Total .md files**: 35+
- **Redundant topics**: 15+ (multiple files covering same content)
- **Outdated files**: 10+ (describing unimplemented features)
- **Scattered locations**: 6 different directories

### Key Problems
1. **3 different project overviews** in different locations
2. **3 infrastructure integration guides** with conflicting information
3. **Mixed v1.0 and v2.0 documentation** (v2.0 was never completed)
4. **No clear navigation** or central index
5. **Audience confusion** - developer and user docs mixed together

## Proposed Consolidated Structure

```
/docs/
├── README.md                          # Main documentation hub
├── getting-started/
│   ├── README.md                      # Quick start guide (5 min to first success)
│   ├── installation.md                # Installation and prerequisites
│   ├── configuration.md               # Configuration reference
│   └── first-dashboard.md             # Tutorial: Create first dashboard
│
├── user-guide/
│   ├── README.md                      # User guide index
│   ├── platform-modes.md              # Understanding Simulation/Infrastructure/Hybrid
│   ├── working-with-dashboards.md     # Dashboard creation and management
│   ├── cli-reference.md               # Complete CLI command reference
│   ├── monitoring-kafka.md            # Kafka-specific monitoring guide
│   └── troubleshooting.md             # Common issues and solutions
│
├── developer-guide/
│   ├── README.md                      # Developer guide index
│   ├── architecture.md                # System architecture overview
│   ├── entity-framework.md            # MESSAGE_QUEUE entity model
│   ├── extending-platform.md          # Adding new providers/features
│   ├── api-reference.md               # API documentation
│   ├── testing.md                     # Testing strategies and tools
│   └── contributing.md                # Contribution guidelines
│
├── operations/
│   ├── README.md                      # Operations guide index
│   ├── infrastructure-setup.md        # Setting up with real Kafka
│   ├── docker-deployment.md           # Docker and local testing
│   ├── production-deployment.md       # Production best practices
│   ├── performance-tuning.md          # Optimization guide
│   └── monitoring-platform.md         # Monitoring the platform itself
│
├── reference/
│   ├── README.md                      # Reference index
│   ├── metrics-catalog.md             # All metrics with descriptions
│   ├── entity-reference.md            # Entity types and relationships
│   ├── dashboard-templates.md         # Available templates
│   ├── configuration-reference.md     # All config options
│   └── glossary.md                    # Terms and definitions
│
├── archive/
│   ├── v2-vision/                     # Archived v2.0 attempt
│   └── legacy/                        # Other outdated docs
│
└── CLAUDE.md                          # AI assistant instructions (keep at root)
```

## Consolidation Actions

### Phase 1: Immediate Consolidation (Week 1)

#### 1. Create Documentation Hub
```markdown
# docs/README.md

# New Relic Message Queues Platform Documentation

Welcome to the comprehensive documentation for the New Relic Message Queues Platform.

## Quick Links

### 🚀 Getting Started
- [Quick Start Guide](getting-started/README.md) - Get running in 5 minutes
- [Installation](getting-started/installation.md) - Detailed setup instructions
- [Configuration](getting-started/configuration.md) - Configure the platform

### 📖 User Guide  
- [Platform Modes](user-guide/platform-modes.md) - Simulation vs Infrastructure vs Hybrid
- [Working with Dashboards](user-guide/working-with-dashboards.md) - Create and manage dashboards
- [CLI Reference](user-guide/cli-reference.md) - All commands and options

### 🔧 Developer Guide
- [Architecture Overview](developer-guide/architecture.md) - System design and components
- [Entity Framework](developer-guide/entity-framework.md) - MESSAGE_QUEUE entity model
- [API Reference](developer-guide/api-reference.md) - Programmatic access

### 🏗️ Operations
- [Infrastructure Setup](operations/infrastructure-setup.md) - Connect to real Kafka
- [Production Deployment](operations/production-deployment.md) - Deploy to production

### 📚 Reference
- [Metrics Catalog](reference/metrics-catalog.md) - All available metrics
- [Configuration Reference](reference/configuration-reference.md) - All config options
```

#### 2. Merge Project Overviews
**Source files to merge:**
- `/docs/README.md` (Ultimate Data Model Spec)
- `/newrelic-message-queues-platform/README.md`
- `/newrelic-message-queues-platform/PROJECT_OVERVIEW.md`

**Target:** `/docs/getting-started/README.md`

#### 3. Consolidate Infrastructure Guides
**Source files to merge:**
- `/newrelic-message-queues-platform/INFRASTRUCTURE_INTEGRATION_COMPLETE.md`
- `/newrelic-message-queues-platform/INFRASTRUCTURE_SETUP_GUIDE.md`
- `/newrelic-message-queues-platform/docs/INFRASTRUCTURE_INTEGRATION.md`

**Target:** `/docs/operations/infrastructure-setup.md`

#### 4. Unify Architecture Documentation
**Source files to merge:**
- `/newrelic-message-queues-platform/docs/ARCHITECTURE.md`
- `/vision/TECHNICAL_ARCHITECTURE_V2.md` (extract only implemented parts)

**Target:** `/docs/developer-guide/architecture.md`

### Phase 2: Content Reorganization (Week 2)

#### 1. Create User-Focused Documentation
- Extract user-relevant content from developer docs
- Create clear tutorials and how-tos
- Add practical examples

#### 2. Separate Reference Documentation
- Move API details to reference section
- Create comprehensive configuration reference
- Build metrics catalog with examples

#### 3. Archive Outdated Content
- Move v2.0 vision docs to archive
- Update vision docs to reflect current state
- Remove future tense from completed features

### Phase 3: Enhancement and Maintenance (Week 3)

#### 1. Add Navigation
- Add breadcrumbs to each page
- Include "Next Steps" sections
- Cross-reference related topics

#### 2. Standardize Format
```markdown
# Document Title

> **Purpose**: One-line description of what this document covers
> **Audience**: Who should read this
> **Prerequisites**: What you need before reading

## Overview
Brief introduction to the topic

## Main Content
Organized sections with clear headings

## Examples
Practical, working examples

## Next Steps
- Link to related documentation
- Suggested next topics

## Reference
- Related commands
- Configuration options
- API endpoints
```

#### 3. Create Maintenance Tools
- Documentation template
- Link checker script
- Version synchronization tool

## Migration Plan

### Week 1: Structure and Core Docs
1. Create new directory structure
2. Write main README hub
3. Merge redundant documentation
4. Create getting started guide

### Week 2: Reorganize by Audience  
1. Separate user and developer docs
2. Create operations guides
3. Build reference section
4. Archive outdated content

### Week 3: Polish and Tools
1. Add navigation elements
2. Standardize formatting
3. Create maintenance tools
4. Update all internal links

## Success Metrics

1. **Findability**: Users can find any topic in <3 clicks
2. **Accuracy**: All documentation reflects current implementation
3. **Completeness**: No missing critical topics
4. **Maintainability**: Clear ownership and update process

## Sample Consolidated Document

Here's an example of how the consolidated Platform Modes documentation would look:

```markdown
# Platform Modes

> **Purpose**: Understand the three operating modes of the Message Queues Platform
> **Audience**: Platform operators and developers
> **Prerequisites**: [Platform installed](../getting-started/installation.md)

## Overview

The New Relic Message Queues Platform operates in three distinct modes, each designed for specific use cases:

- **Simulation Mode**: Generate synthetic data for testing and demos
- **Infrastructure Mode**: Transform real Kafka metrics from nri-kafka
- **Hybrid Mode**: Combine real and simulated data for complete coverage

## Mode Comparison

| Feature | Simulation | Infrastructure | Hybrid |
|---------|------------|----------------|--------|
| Data Source | Synthetic | Real nri-kafka | Both |
| Use Case | Testing/Demos | Production | Gap filling |
| Requirements | None | Active Kafka + nri-kafka | Both |
| Entity Coverage | Complete | Depends on infrastructure | Complete |

## Simulation Mode

### When to Use
- Development and testing
- Demos and POCs
- No Kafka infrastructure available

### How to Enable
```bash
node platform.js --mode=simulation
```

### Configuration
```bash
# Environment variables
export SIMULATION_CLUSTERS=2
export SIMULATION_BROKERS_PER_CLUSTER=3
export SIMULATION_TOPICS=10
```

### Example Output
The simulation creates realistic Kafka patterns including:
- Normal operations
- Peak traffic periods  
- Degraded performance
- Failure scenarios

[Continue with detailed examples...]

## Next Steps
- [Configure Infrastructure Mode](../operations/infrastructure-setup.md)
- [Create Your First Dashboard](working-with-dashboards.md)
- [Understand Entity Types](../reference/entity-reference.md)
```

## Implementation Priority

1. **Critical** (Do First):
   - Create main documentation hub
   - Consolidate getting started guide
   - Merge infrastructure setup guides
   
2. **Important** (Do Second):
   - Separate user and developer docs
   - Create CLI reference
   - Build troubleshooting guide

3. **Nice to Have** (Do Last):
   - Archive old vision docs
   - Add navigation helpers
   - Create maintenance tools

This consolidation will transform the chaotic documentation into a well-organized, maintainable knowledge base that serves all stakeholders effectively.