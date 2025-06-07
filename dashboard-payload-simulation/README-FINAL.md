# Kafka Entity Synthesis for New Relic

A comprehensive solution for monitoring self-managed Kafka clusters in New Relic using MSK event format.

## 🚨 The Problem

Self-managed Kafka clusters cannot appear in New Relic's Message Queues UI due to entity synthesis requiring AWS cloud integration for security validation.

## ✅ Our Solution

We've built a complete monitoring solution that:
- Ingests Kafka metrics in AWS MSK format
- Creates custom dashboards for visualization
- Configures alerts for critical metrics
- Provides health monitoring tools
- Includes production deployment scripts

## 📁 Repository Structure

```
kafka-entity-synthesis/
├── Core Components
│   ├── exact-working-format-replicator.js      # One-time event submission
│   ├── continuous-exact-format-streamer.js     # Production streaming
│   ├── monitor-kafka-health.js                 # Health monitoring
│   └── kafka-alerts-config.js                  # Alert configuration
│
├── Alternative Approaches
│   ├── infrastructure-agent-simulator.js       # Agent simulation attempt
│   ├── system-sample-kafka-injector.js        # SystemSample injection
│   ├── apm-service-bridge.js                  # APM visibility
│   └── graphql-entity-creator.js              # GraphQL exploration
│
├── Configuration
│   ├── custom-kafka-dashboard.json            # Import-ready dashboard
│   ├── kafka-streamer.service                 # Systemd service file
│   └── setup-systemd.sh                       # Production setup script
│
├── Documentation
│   ├── README.md                              # This file
│   ├── DEPLOYMENT_RUNBOOK.md                  # Step-by-step deployment
│   ├── KNOWLEDGE_BASE_ARTICLE.md              # Comprehensive KB article
│   ├── NEW_RELIC_SUPPORT_SUMMARY.md           # Support ticket details
│   └── UNIFIED_KAFKA_DOMAIN_MODEL.md          # Proposed solution architecture
│
└── Support Materials
    ├── support-email-template.md              # Email to support
    ├── community-forum-post.md                # Community post
    └── NEW_RELIC_SUPPORT_TICKET.md           # Detailed ticket
```

## 🚀 Quick Start

### Prerequisites

1. New Relic account with API keys
2. Node.js 14+ installed
3. Create `.env` file:

```bash
IKEY=your_insert_key
ACC=your_account_id
UKEY=your_user_key
```

### Basic Usage

1. **Test event submission:**
   ```bash
   node exact-working-format-replicator.js your-cluster-name
   ```

2. **Start continuous streaming:**
   ```bash
   node continuous-exact-format-streamer.js your-cluster-name
   ```

3. **Create alerts:**
   ```bash
   node kafka-alerts-config.js your-cluster-name
   ```

4. **Import dashboard:**
   - Go to https://one.newrelic.com/dashboards
   - Import `custom-kafka-dashboard.json`
   - Update accountId

### Production Deployment

Use the automated deployment script:
```bash
./deploy-kafka-monitoring.sh -c production-kafka -s -a -b
```

Or set up systemd service:
```bash
sudo ./setup-systemd.sh production-kafka
```

## 📊 What You Get

### Custom Dashboard
- Cluster health overview
- Broker performance metrics
- Topic throughput and lag
- Consumer group monitoring
- Data freshness indicators

### Comprehensive Alerts
- Offline partitions
- Missing active controller
- High CPU/Memory usage
- Under-replicated partitions
- Consumer lag thresholds
- Data staleness

### Health Monitoring
- Automated health checks
- Data freshness validation
- Metric completeness verification
- Event volume monitoring

## 🔍 How It Works

1. **Event Format**: Replicates exact AWS MSK event structure
2. **Entity GUIDs**: Uses proper format but entities aren't created
3. **Data Storage**: Events stored in NRDB and queryable
4. **Visualization**: Custom dashboards query the events
5. **Alerting**: Conditions based on AwsMsk*Sample events

## ⚠️ Limitations

- ❌ No entities in Message Queues UI
- ❌ No automatic entity relationships
- ❌ No native UI features
- ✅ Full metrics and alerting capability
- ✅ Complete dashboard functionality

## 🎯 Proposed Solutions

### 1. MSK Format in nri-kafka
```yaml
integrations:
  - name: nri-kafka
    config:
      msk_format_enabled: true
      msk_cluster_name: "my-kafka"
```

### 2. Generic Kafka Entities
- KAFKA_CLUSTER (not AWSMSKCLUSTER)
- KAFKA_BROKER (not AWSMSKBROKER)
- KAFKA_TOPIC (not AWSMSKTOPIC)

## 📚 Documentation

- [Deployment Runbook](DEPLOYMENT_RUNBOOK.md) - Step-by-step deployment guide
- [Knowledge Base Article](KNOWLEDGE_BASE_ARTICLE.md) - Comprehensive reference
- [Support Summary](NEW_RELIC_SUPPORT_SUMMARY.md) - Technical findings
- [Domain Model](UNIFIED_KAFKA_DOMAIN_MODEL.md) - Proposed architecture

## 🤝 Contributing

This is a community workaround. Contributions welcome:
1. Test with your Kafka setup
2. Report issues or improvements
3. Share your experience
4. Upvote the feature request

## 📞 Support

- **New Relic Support**: Reference this repository in tickets
- **Community**: Post in New Relic forums
- **Issues**: Use GitHub issues for bugs

## 🙏 Acknowledgments

This solution was developed through extensive reverse engineering and testing. Special thanks to the New Relic community for insights and feedback.

---

**Note**: This is a workaround solution. We hope New Relic will provide native support for self-managed Kafka clusters in the Message Queues UI.

**Keywords**: new-relic, kafka, msk, monitoring, entity-synthesis, message-queues