# Documentation Index - Message Queues Platform v2

## 📚 Documentation Structure

### Getting Started
- **[README.md](README.md)** - Project overview and main documentation
- **[QUICK_START.md](QUICK_START.md)** - 5-minute setup guide
- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Developer setup and guidelines

### Technical Documentation
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture and design patterns
- **[TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md)** - Detailed implementation guide
- **[DATA_MODEL_SPECIFICATION.md](DATA_MODEL_SPECIFICATION.md)** - v3.0 entity data model

### Platform Features
- **[DASHBOARD_SYSTEM.md](DASHBOARD_SYSTEM.md)** - Dashboard generation framework
- **[Entity Definitions](newrelic-entity-definitions/)** - MESSAGE_QUEUE entity specifications
- **[PROJECT_STATUS.md](PROJECT_STATUS.md)** - Current status and roadmap

### Archived Documentation
- **[archive/](archive/)** - Historical documentation and analyses
- **[archive/outdated-docs/](archive/outdated-docs/)** - Superseded documentation

## 🗺️ Documentation Map

```
Documentation Root
├── User Documentation
│   ├── README.md (Start Here)
│   ├── QUICK_START.md
│   └── Troubleshooting (in README)
│
├── Technical Documentation
│   ├── ARCHITECTURE.md
│   ├── TECHNICAL_GUIDE.md
│   └── DATA_MODEL_SPECIFICATION.md
│
├── Developer Documentation
│   ├── DEVELOPMENT.md
│   ├── Entity Definitions/
│   └── API Reference (in TECHNICAL_GUIDE)
│
└── Project Management
    ├── PROJECT_STATUS.md
    └── Roadmap (in PROJECT_STATUS)
```

## 📖 Reading Order

### For New Users
1. [README.md](README.md) - Understand the platform
2. [QUICK_START.md](QUICK_START.md) - Get running quickly
3. [DASHBOARD_SYSTEM.md](DASHBOARD_SYSTEM.md) - Create dashboards

### For Developers
1. [ARCHITECTURE.md](ARCHITECTURE.md) - Understand the design
2. [DEVELOPMENT.md](DEVELOPMENT.md) - Setup development environment
3. [TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md) - Deep dive into implementation
4. [Entity Definitions](newrelic-entity-definitions/) - Understand data model

### For Contributors
1. [DEVELOPMENT.md](DEVELOPMENT.md) - Coding standards
2. [PROJECT_STATUS.md](PROJECT_STATUS.md) - Current gaps and priorities
3. [DATA_MODEL_SPECIFICATION.md](DATA_MODEL_SPECIFICATION.md) - Data model compliance

## 🔍 Quick Links

### Configuration
- [Environment Variables](README.md#configuration)
- [Provider Configuration](TECHNICAL_GUIDE.md#configuration--environment)

### Troubleshooting
- [Common Issues](README.md#troubleshooting)
- [Debug Commands](QUICK_START.md#common-issues)

### Entity Types
- [MESSAGE_QUEUE_CLUSTER](newrelic-entity-definitions/docs/entities/README.md#message_queue_cluster)
- [MESSAGE_QUEUE_BROKER](newrelic-entity-definitions/docs/entities/README.md#message_queue_broker)
- [MESSAGE_QUEUE_TOPIC](newrelic-entity-definitions/docs/entities/README.md#message_queue_topic)

### API Reference
- [REST Endpoints](TECHNICAL_GUIDE.md#api-endpoints)
- [GraphQL Queries](DATA_MODEL_SPECIFICATION.md#sample-queries)

## 📝 Documentation Standards

### File Naming
- Use UPPER_CASE for top-level docs
- Use lower-case for subdirectories
- Use descriptive names

### Content Structure
- Start with purpose/overview
- Include practical examples
- Add troubleshooting section
- Keep updated with code

### Maintenance
- Review quarterly
- Update with major changes
- Archive outdated content
- Track in git history