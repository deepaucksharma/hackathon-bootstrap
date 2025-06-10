# Quick Start Guide - Message Queues Platform v2

Get up and running with the Message Queues Platform in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- New Relic account with API keys
- (Optional) Kafka cluster with nri-kafka for infrastructure mode

## 1. Installation

```bash
# Clone repository
git clone <repository>
cd newrelic-message-queues-platform-v2

# Install dependencies
npm install
```

## 2. Configuration

Create `.env` file:

```bash
# Required
NEW_RELIC_ACCOUNT_ID=your_account_id
NEW_RELIC_API_KEY=your_ingest_key
NEW_RELIC_USER_API_KEY=your_user_key

# Optional
PLATFORM_MODE=simulation  # or 'infrastructure'
PLATFORM_INTERVAL=60      # seconds
```

## 3. Run the Platform

### Simulation Mode (No Infrastructure Needed)

```bash
# Start generating test data
npm run dev:simulation

# What happens:
# 1. Creates synthetic Kafka cluster (3 brokers, 10 topics)
# 2. Generates realistic metrics
# 3. Streams entities to New Relic
# 4. Entities appear in 2-3 minutes
```

### Infrastructure Mode (Real Kafka Data)

```bash
# Verify Kafka data exists
node -e "console.log('Checking for Kafka data...')"

# Start platform
npm run dev:infrastructure

# What happens:
# 1. Queries NRDB for KafkaBrokerSample data
# 2. Transforms to MESSAGE_QUEUE entities
# 3. Streams to New Relic
```

## 4. Create Dashboard

```bash
# Generate standard 4-page dashboard
npm run dashboard:create

# Output: Dashboard URL
# https://one.newrelic.com/redirect/entity/DASHBOARD_GUID
```

## 5. Verify Success

### Check Entities
```sql
FROM MessageQueue 
SELECT count(*) 
WHERE entityType LIKE 'MESSAGE_QUEUE_%' 
SINCE 5 minutes ago
```

### View in UI
1. Go to Entity Explorer
2. Filter by "Message Queue"
3. See your entities!

## Common Issues

| Problem | Solution |
|---------|----------|
| No entities appearing | Check API keys in .env |
| Platform crashes | Enable debug: `DEBUG=platform:*` |
| No Kafka data | Verify nri-kafka is configured |

## Next Steps

- Read [Technical Guide](TECHNICAL_GUIDE.md) for architecture details
- Explore [Entity Definitions](newrelic-entity-definitions/)
- Check [Project Status](PROJECT_STATUS.md) for roadmap

---

Need help? Check the [full documentation](README.md) or open an issue!