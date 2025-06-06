#!/usr/bin/env node

/**
 * Minimal Payload Test Script
 * Sends hardcoded CloudWatch-style metrics to make MSK appear in UI
 * No Kafka infrastructure needed!
 */

const https = require('https');

// Configuration
const LICENSE_KEY = process.env.NEW_RELIC_LICENSE_KEY;
const CLUSTER_NAME = 'test-msk-cluster';
const AWS_ACCOUNT_ID = '123456789012';
const AWS_REGION = 'us-east-1';

if (!LICENSE_KEY) {
  console.error('❌ Error: NEW_RELIC_LICENSE_KEY environment variable not set');
  console.error('   Run: export NEW_RELIC_LICENSE_KEY=your_license_key_here');
  process.exit(1);
}

// Helper to generate entity GUID
function generateEntityGUID(entityType, clusterName, resourceId) {
  const entityIdentifier = `${entityType}:${clusterName}:${resourceId || ''}`;
  const hash = entityIdentifier.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  const guidString = `${AWS_ACCOUNT_ID}|INFRA|NA|${Math.abs(hash)}`;
  return Buffer.from(guidString).toString('base64');
}

// Create a single metric
function createMetric(name, value, entityType, entityName, brokerId = null) {
  const timestamp = Date.now();
  
  const attributes = {
    // CRITICAL: Identify as CloudWatch
    "collector.name": "cloudwatch-metric-streams",
    "eventType": "Metric",
    "instrumentation.provider": "cloudwatch",
    "instrumentation.source": "cloudwatch",
    
    // AWS namespace
    "aws.Namespace": "AWS/Kafka",
    "aws.MetricName": name,
    
    // AWS account info (all variations for compatibility)
    "aws.accountId": AWS_ACCOUNT_ID,
    "aws.region": AWS_REGION,
    "awsAccountId": AWS_ACCOUNT_ID,
    "awsRegion": AWS_REGION,
    
    // CRITICAL: Provider account mapping - WITHOUT THIS, NO UI!
    "provider": "AwsMsk",
    "providerAccountId": AWS_ACCOUNT_ID,
    "providerExternalId": AWS_ACCOUNT_ID,
    "providerAccountName": "Test MSK Account",
    
    // Cluster info
    "aws.kafka.clusterName": CLUSTER_NAME,
    "clusterName": CLUSTER_NAME,
    
    // Entity identification
    "entity.type": entityType,
    "entity.name": entityName,
    "entity.guid": generateEntityGUID(entityType, CLUSTER_NAME, brokerId),
    
    // Dimensions (CloudWatch format)
    "aws.Dimensions": [
      {"Name": "ClusterName", "Value": CLUSTER_NAME}
    ]
  };
  
  // Add broker-specific attributes
  if (brokerId) {
    attributes["aws.kafka.brokerId"] = brokerId;
    attributes["aws.Dimensions"].push({"Name": "BrokerID", "Value": brokerId});
  }
  
  return {
    name,
    type: "gauge",
    value,
    timestamp,
    attributes
  };
}

// Send metrics to New Relic
async function sendMetrics(metrics) {
  const payload = JSON.stringify([{ metrics }]);
  
  const options = {
    hostname: 'metric-api.newrelic.com',
    port: 443,
    path: '/metric/v1',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': LICENSE_KEY,
      'Content-Length': Buffer.byteLength(payload)
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 202) {
          resolve({ status: res.statusCode, data });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Main function
async function main() {
  console.log('🚀 MSK Minimal Payload Test');
  console.log('===========================\n');
  console.log(`Cluster: ${CLUSTER_NAME}`);
  console.log(`Account: ${AWS_ACCOUNT_ID}`);
  console.log(`Region: ${AWS_REGION}\n`);
  
  try {
    // Step 1: Send cluster metrics
    console.log('1️⃣  Sending cluster metrics...');
    const clusterMetrics = [
      createMetric('ActiveControllerCount', 1, 'AWS_KAFKA_CLUSTER', CLUSTER_NAME),
      createMetric('OfflinePartitionsCount', 0, 'AWS_KAFKA_CLUSTER', CLUSTER_NAME),
      createMetric('GlobalPartitionCount', 30, 'AWS_KAFKA_CLUSTER', CLUSTER_NAME),
      createMetric('GlobalTopicCount', 10, 'AWS_KAFKA_CLUSTER', CLUSTER_NAME)
    ];
    
    await sendMetrics(clusterMetrics);
    console.log('✅ Cluster metrics sent\n');
    
    // Step 2: Send broker metrics
    console.log('2️⃣  Sending broker metrics...');
    const brokerMetrics = [];
    
    for (let i = 1; i <= 3; i++) {
      const brokerId = i.toString();
      const brokerName = `${CLUSTER_NAME}:broker-${brokerId}`;
      
      brokerMetrics.push(
        createMetric('BytesInPerSec', 1000000 * i, 'AWS_KAFKA_BROKER', brokerName, brokerId),
        createMetric('BytesOutPerSec', 800000 * i, 'AWS_KAFKA_BROKER', brokerName, brokerId),
        createMetric('MessagesInPerSec', 1000 * i, 'AWS_KAFKA_BROKER', brokerName, brokerId),
        createMetric('CpuUser', 20 + (i * 5), 'AWS_KAFKA_BROKER', brokerName, brokerId),
        createMetric('UnderReplicatedPartitions', 0, 'AWS_KAFKA_BROKER', brokerName, brokerId)
      );
    }
    
    await sendMetrics(brokerMetrics);
    console.log('✅ Broker metrics sent\n');
    
    // Step 3: Send topic metrics
    console.log('3️⃣  Sending topic metrics...');
    const topics = ['orders', 'payments', 'inventory'];
    const topicMetrics = [];
    
    topics.forEach(topicName => {
      topicMetrics.push(
        createMetric('MessagesInPerSec', 500, 'AWS_KAFKA_TOPIC', `topic:${topicName}`, topicName),
        createMetric('BytesInPerSec', 50000, 'AWS_KAFKA_TOPIC', `topic:${topicName}`, topicName),
        createMetric('BytesOutPerSec', 45000, 'AWS_KAFKA_TOPIC', `topic:${topicName}`, topicName)
      );
    });
    
    await sendMetrics(topicMetrics);
    console.log('✅ Topic metrics sent\n');
    
    // Success!
    console.log('🎉 All metrics sent successfully!\n');
    console.log('📊 Next steps:');
    console.log('1. Wait 2-3 minutes for entity synthesis');
    console.log('2. Check NRDB with this query:\n');
    console.log(`   FROM Metric SELECT count(*) WHERE collector.name = 'cloudwatch-metric-streams' AND aws.kafka.clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago\n`);
    console.log('3. Check entities with this query:\n');
    console.log(`   FROM entity SELECT name, type WHERE type LIKE '%KAFKA%' AND name LIKE '%${CLUSTER_NAME}%' SINCE 10 minutes ago\n`);
    console.log('4. Navigate to Message Queues UI:');
    console.log('   https://one.newrelic.com/nr1-core/apm-services/message-queues\n');
    console.log('5. Your cluster should appear in the list! 🎯');
    
  } catch (error) {
    console.error('❌ Error sending metrics:', error.message);
    process.exit(1);
  }
}

// Run it!
main();