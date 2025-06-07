#!/usr/bin/env node

/**
 * Quick MSK Entity Creator
 * The fastest way to get MSK entities into New Relic UI
 */

const axios = require('axios');

// Configuration
const ACCOUNT_ID = process.env.NEW_RELIC_ACCOUNT_ID;
const API_KEY = process.env.NEW_RELIC_API_KEY;

// Validation
if (!ACCOUNT_ID || !API_KEY) {
  console.error('❌ Error: Missing credentials');
  console.error('');
  console.error('Please set environment variables:');
  console.error('  export NEW_RELIC_ACCOUNT_ID=your_account_id');
  console.error('  export NEW_RELIC_API_KEY=your_api_key');
  console.error('');
  console.error('Or create a .env file with these values.');
  process.exit(1);
}

// Generate cluster name
const clusterName = process.argv[2] || `quick-msk-${Date.now()}`;
const timestamp = Date.now();

console.log('🚀 Quick MSK Entity Creator');
console.log('==========================');
console.log('');
console.log(`Account ID: ${ACCOUNT_ID}`);
console.log(`Cluster Name: ${clusterName}`);
console.log('');

// Create events
const events = [];

// 1. Cluster entity
events.push({
  eventType: 'AwsMskClusterSample',
  entityGuid: generateGuid('cluster', clusterName),
  entityName: clusterName,
  entityType: 'AWSMSKCLUSTER',
  domain: 'INFRA',
  type: 'AWSMSKCLUSTER',
  provider: 'AwsMskCluster',
  'provider.clusterName': clusterName,
  'provider.activeControllerCount.Sum': 1,
  'provider.offlinePartitionsCount.Sum': 0,
  'provider.globalPartitionCount.Average': 9,
  'provider.globalTopicCount.Average': 3,
  'aws.clusterName': clusterName,
  'aws.kafka.ClusterName': clusterName,
  'aws.msk.clusterName': clusterName,
  'aws.region': 'us-east-1',
  'collector.name': 'cloudwatch-metric-streams',
  timestamp
});

// 2. Broker entities (3 brokers)
for (let i = 1; i <= 3; i++) {
  const brokerName = `${clusterName}-broker-${i}`;
  events.push({
    eventType: 'AwsMskBrokerSample',
    entityGuid: generateGuid('broker', brokerName),
    entityName: brokerName,
    entityType: 'AWSMSKBROKER',
    displayName: brokerName,
    domain: 'INFRA',
    type: 'AWSMSKBROKER',
    provider: 'AwsMskBroker',
    'provider.clusterName': clusterName,
    'provider.brokerId': i.toString(),
    'provider.bytesInPerSec.Average': 100000 + Math.random() * 50000,
    'provider.bytesOutPerSec.Average': 80000 + Math.random() * 40000,
    'provider.cpuUser.Average': 20 + Math.random() * 30,
    'provider.underReplicatedPartitions.Sum': 0,
    'provider.underMinIsrPartitionCount.Sum': 0,
    'aws.clusterName': clusterName,
    'aws.kafka.ClusterName': clusterName,
    'aws.msk.clusterName': clusterName,
    'aws.kafka.BrokerID': i.toString(),
    'aws.msk.brokerId': i.toString(),
    'collector.name': 'cloudwatch-metric-streams',
    timestamp
  });
}

// 3. Topic entities
const topics = ['orders', 'payments', 'users'];
topics.forEach(topicName => {
  const fullTopicName = `${clusterName}-${topicName}`;
  events.push({
    eventType: 'AwsMskTopicSample',
    entityGuid: generateGuid('topic', fullTopicName),
    entityName: fullTopicName,
    entityType: 'AWSMSKTOPIC',
    displayName: fullTopicName,
    domain: 'INFRA',
    type: 'AWSMSKTOPIC',
    provider: 'AwsMskTopic',
    'provider.clusterName': clusterName,
    'provider.topic': topicName,
    'provider.brokerId': '1',
    'provider.bytesInPerSec.Average': 50000 + Math.random() * 25000,
    'provider.bytesOutPerSec.Average': 40000 + Math.random() * 20000,
    'provider.messagesInPerSec.Average': 1000 + Math.random() * 500,
    'aws.clusterName': clusterName,
    'aws.kafka.ClusterName': clusterName,
    'aws.kafka.Topic': topicName,
    'aws.msk.topic': topicName,
    'collector.name': 'cloudwatch-metric-streams',
    timestamp
  });
});

// 4. Add some metric events for good measure
events.push({
  eventType: 'Metric',
  metricName: 'aws.kafka.ActiveControllerCount',
  'entity.guid': generateGuid('cluster', clusterName),
  'entity.name': clusterName,
  'entity.type': 'AWSMSKCLUSTER',
  'aws.kafka.ClusterName': clusterName,
  value: 1,
  timestamp
});

// Helper function
function generateGuid(type, name) {
  const components = [ACCOUNT_ID, 'INFRA', type.toUpperCase(), name];
  return Buffer.from(components.join('|'))
    .toString('base64')
    .replace(/[+/=]/g, '')
    .substring(0, 32);
}

// Submit events
console.log(`📤 Submitting ${events.length} events...`);

axios.post(
  `https://insights-collector.newrelic.com/v1/accounts/${ACCOUNT_ID}/events`,
  events,
  {
    headers: {
      'Api-Key': API_KEY,
      'Content-Type': 'application/json'
    }
  }
)
.then(response => {
  console.log('✅ Events submitted successfully!');
  console.log('');
  console.log('⏳ Entity synthesis in progress...');
  console.log('   Please wait 30-60 seconds for entities to appear.');
  console.log('');
  console.log('📊 Check your entities here:');
  console.log('');
  console.log('1. Message Queues UI:');
  console.log(`   https://one.newrelic.com/nr1-core/message-queues`);
  console.log('');
  console.log('2. Entity Explorer:');
  console.log(`   https://one.newrelic.com/redirect/entity/${ACCOUNT_ID}`);
  console.log('   Navigate to: Infrastructure → Third-party services → AWS MSK');
  console.log('');
  console.log('3. NRQL Query Console:');
  console.log('   https://one.newrelic.com/data-exploration');
  console.log(`   Query: FROM AwsMskClusterSample SELECT * WHERE provider.clusterName = '${clusterName}'`);
  console.log('');
  console.log('🔍 To verify entity creation, run:');
  console.log(`   node entity-verifier.js ${clusterName}`);
  console.log('');
  console.log('📈 To start continuous metrics, run:');
  console.log(`   node continuous-metric-streamer.js`);
  console.log(`   Then type: start ${clusterName}`);
  console.log('');
  console.log('✨ Done! Your cluster name is: ' + clusterName);
})
.catch(error => {
  console.error('❌ Error submitting events:');
  console.error('');
  
  if (error.response) {
    console.error('Status:', error.response.status);
    console.error('Response:', error.response.data);
    
    if (error.response.status === 403) {
      console.error('');
      console.error('🔑 Authentication issue. Please check:');
      console.error('   1. Your API key is valid');
      console.error('   2. The key has ingest permissions');
      console.error('   3. The account ID is correct');
    }
  } else {
    console.error(error.message);
  }
  
  process.exit(1);
});