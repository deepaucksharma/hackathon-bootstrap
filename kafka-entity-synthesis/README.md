# Kafka Entity Synthesis for New Relic

Make Kafka/MSK entities appear in New Relic's Message Queues UI by sending events in the correct format.

## 🚀 Quick Start

### 1. Setup
```bash
# Clone and setup
cd kafka-entity-synthesis
cp .env.example .env
# Edit .env with your New Relic credentials
```

### 2. Send Events
```bash
# Send MSK events that will appear in the UI
node src/send-events.js

# Options:
node src/send-events.js --cluster-name my-cluster
node src/send-events.js --brokers 5 --topics 10
```

### 3. Validate
```bash
# Check if entities appear in UI (wait 2-5 minutes first)
node src/validate-ui.js

# Validate specific cluster
node src/validate-ui.js --cluster-name my-cluster
```

### 4. View in UI
Open: https://one.newrelic.com/nr1-core/apm-services/message-queues

## 🔑 Key Discovery

After extensive testing, we discovered that MSK entities appear in the UI when sent as **AWS Cloud Integration** events, NOT CloudWatch Metric Streams. The working format uses:

- Event types: `AwsMskClusterSample`, `AwsMskBrokerSample`, `AwsMskTopicSample`
- Collector: `cloud-integrations` (not cloudwatch-metric-streams)
- Provider values: `AwsMskCluster`, `AwsMskBroker`, `AwsMskTopic`
- All metrics with aggregations (.Sum, .Average, .Maximum, .Minimum, .SampleCount)

## 📁 Project Structure

```
├── src/                    # Core implementation
│   ├── send-events.js      # Send MSK events
│   ├── validate-ui.js      # Validate UI visibility
│   ├── analyze-accounts.js # Compare with working accounts
│   └── lib/               # Shared libraries
├── tools/                 # Additional utilities
├── reference/             # Documentation and samples
├── test/                  # Test suite
└── results/               # Test results (gitignored)
```

## 🔧 Available Commands

### Send Events
```bash
node src/send-events.js [options]
  --cluster-name <name>    Custom cluster name
  --brokers <count>        Number of brokers (default: 3)
  --topics <count>         Number of topics (default: 3)
  --dry-run               Show what would be sent without sending
```

### Validate UI
```bash
node src/validate-ui.js [options]
  --cluster-name <name>    Cluster to validate
  --detailed              Show detailed validation results
```

### Analyze Accounts
```bash
node src/analyze-accounts.js [options]
  --accounts <ids>        Comma-separated account IDs to analyze
  --save-samples         Save sample events for reference
```

## 📊 What Gets Created

When you run `send-events.js`, it creates:

1. **Cluster Entity** - Shows cluster health and statistics
2. **Broker Entities** - One per broker with performance metrics
3. **Topic Entities** - One per topic with throughput metrics

All entities include the required fields for UI visibility:
- `provider` and `providerAccountId`
- `collector.name = "cloud-integrations"`
- AWS account information
- Proper entity identification

## 🐛 Troubleshooting

### Entities not appearing in UI?

1. **Wait 2-5 minutes** - Entity synthesis takes time
2. **Check events arrived**:
   ```sql
   FROM AwsMskClusterSample SELECT * 
   WHERE entityName LIKE '%your-cluster%' 
   SINCE 30 minutes ago
   ```
3. **Validate critical fields**:
   ```bash
   node src/validate-ui.js --detailed
   ```
4. **Check account mapping** - Ensure providerAccountId matches your NR account

### Common Issues

- **Wrong event type**: Must be AwsMsk*Sample, not Metric
- **Wrong collector**: Must be "cloud-integrations"
- **Missing fields**: providerExternalId, provider, entityType
- **Wrong provider value**: Must be AwsMskCluster/Broker/Topic

## 📚 Learn More

- [Discovery Insights](reference/DISCOVERY_INSIGHTS.md) - How we figured this out
- [Field Mappings](reference/field-mappings.json) - Complete field reference
- [Troubleshooting Guide](reference/TROUBLESHOOTING.md) - Detailed solutions

## 🤝 Contributing

Found an issue or improvement? Please contribute!

1. Test your changes with `node test/test-all.js`
2. Update documentation as needed
3. Keep the simple, focused approach

## 📝 License

This project is provided as-is for the New Relic community.