# 🚀 MSK Entity Synthesis Quick Start Guide

Get AWS MSK entities into New Relic Message Queues UI in **under 5 minutes**!

## Prerequisites

- Node.js installed
- New Relic Account ID
- New Relic Ingest API Key

## 🎯 Fastest Path to Success

### 1️⃣ Clone and Setup (30 seconds)

```bash
# Clone the repository (or copy the kafka-entity-synthesis folder)
cd kafka-entity-synthesis

# Install dependency
npm install axios
```

### 2️⃣ Set Credentials (30 seconds)

```bash
export NEW_RELIC_ACCOUNT_ID=YOUR_ACCOUNT_ID
export NEW_RELIC_API_KEY=YOUR_INGEST_API_KEY
```

Or create a `.env` file:
```bash
echo "NEW_RELIC_ACCOUNT_ID=YOUR_ACCOUNT_ID" > .env
echo "NEW_RELIC_API_KEY=YOUR_INGEST_API_KEY" >> .env
```

### 3️⃣ Deploy MSK Entities (1 minute)

**Option A: One-Command Deployment** ⭐ RECOMMENDED
```bash
./deploy-msk-entities.sh --dev --cluster-name my-test-cluster
```

**Option B: Interactive Orchestrator**
```bash
node unified-msk-orchestrator.js --interactive
# Then type: create complete my-test-cluster
```

**Option C: Direct Execution**
```bash
node unified-msk-orchestrator.js complete my-test-cluster
```

### 4️⃣ Verify Success (2-3 minutes)

Wait 30-60 seconds for entity synthesis, then:

```bash
# Automated verification
node ui-validation-automator.js my-test-cluster --max-retries 5
```

### 5️⃣ View in UI

Open these links in your browser:

1. **Message Queues UI**: 
   ```
   https://one.newrelic.com/nr1-core/message-queues
   ```

2. **Entity Explorer**:
   ```
   https://one.newrelic.com/redirect/entity/YOUR_ACCOUNT_ID
   ```
   Navigate to: Infrastructure → Third-party services → Message queues → Kafka → AWS MSK

## 🎮 Super Quick Test Commands

### Create Test Cluster in 10 seconds
```bash
# Set your credentials first!
export NEW_RELIC_ACCOUNT_ID=YOUR_ACCOUNT_ID
export NEW_RELIC_API_KEY=YOUR_API_KEY

# Run this one-liner
curl -sSL https://raw.githubusercontent.com/.../quick-test.sh | bash
```

### Manual Quick Test
```bash
# Create a simple cluster
node -e "
const axios = require('axios');
const events = [{
  eventType: 'AwsMskClusterSample',
  entityName: 'quick-test-cluster',
  entityType: 'AWSMSKCLUSTER',
  'provider.clusterName': 'quick-test-cluster',
  'provider.activeControllerCount.Sum': 1,
  timestamp: Date.now()
}];
axios.post(
  'https://insights-collector.newrelic.com/v1/accounts/${process.env.NEW_RELIC_ACCOUNT_ID}/events',
  events,
  { headers: { 'Api-Key': process.env.NEW_RELIC_API_KEY } }
).then(() => console.log('✅ Cluster created!')).catch(e => console.error('❌', e.message));
"
```

## 📊 Quick Verification Queries

Run these in the [NRQL console](https://one.newrelic.com/data-exploration):

```sql
-- Check if your cluster exists
FROM AwsMskClusterSample 
SELECT * 
WHERE provider.clusterName LIKE '%test%' 
SINCE 10 minutes ago

-- See all MSK entities
FROM NrIntegrationEntity 
SELECT name, type, reporting 
WHERE type LIKE '%MSK%' 
SINCE 1 hour ago
```

## 🔧 Troubleshooting Quick Fixes

### Nothing showing up?
```bash
# Run all strategies automatically
node advanced-ui-payload-runner.js
```

### Want continuous metrics?
```bash
# Start metric streaming
node continuous-metric-streamer.js
# Type: start my-test-cluster
```

### Need to see what's there?
```bash
# Visualize existing entities
node msk-entity-visualizer.js
```

## 🏃‍♂️ Even Faster: Copy-Paste Script

Save this as `quick-msk.js` and run it:

```javascript
#!/usr/bin/env node
const axios = require('axios');

const ACCOUNT_ID = process.env.NEW_RELIC_ACCOUNT_ID;
const API_KEY = process.env.NEW_RELIC_API_KEY;

if (!ACCOUNT_ID || !API_KEY) {
  console.error('❌ Set NEW_RELIC_ACCOUNT_ID and NEW_RELIC_API_KEY');
  process.exit(1);
}

const clusterName = `quick-msk-${Date.now()}`;
const events = [];

// Create cluster
events.push({
  eventType: 'AwsMskClusterSample',
  entityName: clusterName,
  entityType: 'AWSMSKCLUSTER',
  domain: 'INFRA',
  'provider.clusterName': clusterName,
  'provider.activeControllerCount.Sum': 1,
  'provider.offlinePartitionsCount.Sum': 0,
  'aws.kafka.ClusterName': clusterName,
  timestamp: Date.now()
});

// Create 3 brokers
for (let i = 1; i <= 3; i++) {
  events.push({
    eventType: 'AwsMskBrokerSample',
    entityName: `${clusterName}-broker-${i}`,
    entityType: 'AWSMSKBROKER',
    'provider.clusterName': clusterName,
    'provider.brokerId': i.toString(),
    'provider.bytesInPerSec.Average': 100000,
    'aws.kafka.ClusterName': clusterName,
    'aws.kafka.BrokerID': i.toString(),
    timestamp: Date.now()
  });
}

// Create 3 topics
['orders', 'users', 'events'].forEach(topic => {
  events.push({
    eventType: 'AwsMskTopicSample',
    entityName: `${clusterName}-${topic}`,
    entityType: 'AWSMSKTOPIC',
    'provider.clusterName': clusterName,
    'provider.topic': topic,
    'provider.bytesInPerSec.Average': 50000,
    'aws.kafka.ClusterName': clusterName,
    'aws.kafka.Topic': topic,
    timestamp: Date.now()
  });
});

// Submit events
axios.post(
  `https://insights-collector.newrelic.com/v1/accounts/${ACCOUNT_ID}/events`,
  events,
  { headers: { 'Api-Key': API_KEY, 'Content-Type': 'application/json' } }
)
.then(() => {
  console.log(`✅ Created MSK cluster: ${clusterName}`);
  console.log('\n⏳ Wait 30-60 seconds for entity synthesis...\n');
  console.log('Then check:');
  console.log(`1. Message Queues: https://one.newrelic.com/nr1-core/message-queues`);
  console.log(`2. Entity Explorer: https://one.newrelic.com/redirect/entity/${ACCOUNT_ID}`);
  console.log(`\n🔍 Or run: node entity-verifier.js ${clusterName}`);
})
.catch(error => {
  console.error('❌ Error:', error.response?.data || error.message);
});
```

Run it:
```bash
node quick-msk.js
```

## 🎉 Success Indicators

You'll know it worked when:

1. ✅ Entity verifier shows "fully operational"
2. ✅ Cluster appears in Message Queues UI
3. ✅ Entity Explorer shows your cluster
4. ✅ NRQL queries return data

## 💡 Pro Tips

1. **Use descriptive cluster names** - Makes them easier to find
2. **Start metric streaming immediately** - Keeps entities "alive"
3. **Run verification continuously** - Catches issues early
4. **Check all 3 entity types** - Cluster, Broker, Topic

## 🆘 Still Having Issues?

1. Check the [comprehensive guide](FINAL_SOLUTION_DOCUMENTATION.md)
2. Run the test report generator: `node generate-test-report.js`
3. Review logs in `deployment-logs-*` directories

## 🚀 What's Next?

Once you see entities in the UI:

1. **Add more clusters**: Run the deployment script with different names
2. **Enable streaming**: Keep metrics flowing with `continuous-metric-streamer.js`
3. **Set up monitoring**: Create alerts for your MSK entities
4. **Production deployment**: Use `--prod` flag for production settings

---

**Remember**: The first entity might take 2-5 minutes to appear. Be patient! ⏰

**Quick Help**: If nothing appears after 5 minutes, run:
```bash
./test-all-strategies.sh
```

This will try every possible approach to get your entities into the UI! 🎯