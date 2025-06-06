#!/usr/bin/env node

/**
 * Test MessageQueueSample for UI visibility
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

// Load environment
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+?)[=:](.*)/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        process.env[key] = value;
      }
    });
  }
  
  process.env.NEW_RELIC_ACCOUNT_ID = process.env.NR_ACCOUNT_ID || process.env.ACC;
  process.env.NEW_RELIC_INSERT_KEY = process.env.NR_INSERT_KEY || process.env.IKEY;
}

// Generate entity GUID
function generateEntityGuid(accountId, entityType, identifier) {
  const hash = crypto.createHash('sha256').update(identifier).digest('hex').substring(0, 16);
  const guidString = `${accountId}|INFRA|${entityType}|${hash}`;
  return Buffer.from(guidString).toString('base64');
}

// Create MessageQueueSample events
function createMessageQueueEvents() {
  const timestamp = Date.now();
  const clusterName = `mq-test-cluster-${timestamp}`;
  const accountId = process.env.NEW_RELIC_ACCOUNT_ID;
  
  const events = [];
  
  // 1. Cluster as a Queue
  events.push({
    eventType: "MessageQueueSample",
    timestamp: timestamp,
    provider: "AwsMsk",
    "collector.name": "cloudwatch-metric-streams",
    
    // Queue identification
    "queue.name": clusterName,
    "queue.type": "kafka_cluster",
    
    // Entity fields
    "entity.name": clusterName,
    "entity.type": "AWS_KAFKA_CLUSTER",
    "entity.guid": generateEntityGuid(accountId, "AWS_KAFKA_CLUSTER", clusterName),
    
    // Queue metrics
    "queue.messagesPerSecond": 5000.0,
    "queue.bytesPerSecond": 5000000.0,
    "queue.brokerCount": 3,
    "queue.topicCount": 10,
    
    // AWS context
    awsRegion: "us-east-1",
    awsAccountId: "123456789012",
    providerAccountId: accountId
  });
  
  // 2. Broker as a Queue
  events.push({
    eventType: "MessageQueueSample",
    timestamp: timestamp,
    provider: "AwsMsk",
    "collector.name": "cloudwatch-metric-streams",
    
    // Queue identification
    "queue.name": `${clusterName}-broker-1`,
    "queue.type": "kafka_broker",
    
    // Entity fields
    "entity.name": `1:${clusterName}`,
    "entity.type": "AWS_KAFKA_BROKER",
    "entity.guid": generateEntityGuid(accountId, "AWS_KAFKA_BROKER", `${clusterName}:1`),
    
    // Queue metrics
    "queue.messagesPerSecond": 2000.0,
    "queue.bytesPerSecond": 2000000.0,
    "queue.cpuPercent": 35.5,
    "queue.memoryPercent": 45.2,
    "queue.diskUsedPercent": 55.0,
    
    // Relationship
    "queue.clusterName": clusterName,
    
    // AWS context
    awsRegion: "us-east-1",
    awsAccountId: "123456789012",
    providerAccountId: accountId
  });
  
  // 3. Topic as a Queue
  events.push({
    eventType: "MessageQueueSample",
    timestamp: timestamp,
    provider: "AwsMsk",
    "collector.name": "cloudwatch-metric-streams",
    
    // Queue identification
    "queue.name": `${clusterName}-orders`,
    "queue.type": "kafka_topic",
    
    // Entity fields
    "entity.name": "orders",
    "entity.type": "AWS_KAFKA_TOPIC",
    "entity.guid": generateEntityGuid(accountId, "AWS_KAFKA_TOPIC", `${clusterName}:orders`),
    
    // Queue metrics
    "queue.messagesPerSecond": 1000.0,
    "queue.bytesPerSecond": 1000000.0,
    "queue.consumerLag": 500,
    "queue.partitionCount": 10,
    "queue.replicationFactor": 3,
    
    // Relationship
    "queue.clusterName": clusterName,
    
    // AWS context
    awsRegion: "us-east-1",
    awsAccountId: "123456789012",
    providerAccountId: accountId
  });
  
  return events;
}

// Submit to New Relic
async function submitPayload(events) {
  const url = `https://insights-collector.newrelic.com/v1/accounts/${process.env.NEW_RELIC_ACCOUNT_ID}/events`;
  
  try {
    const response = await axios.post(url, events, {
      headers: {
        'Content-Type': 'application/json',
        'X-Insert-Key': process.env.NEW_RELIC_INSERT_KEY
      }
    });
    
    return {
      success: true,
      status: response.status,
      statusText: response.statusText
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: error.response?.status
    };
  }
}

// Main execution
async function main() {
  console.log('🚀 MessageQueueSample UI Visibility Test');
  console.log('========================================\n');
  
  loadEnv();
  
  console.log('✅ Environment configured');
  console.log(`   Account: ${process.env.NEW_RELIC_ACCOUNT_ID}`);
  
  // Create events
  console.log('\n📦 Creating MessageQueueSample events...');
  const events = createMessageQueueEvents();
  console.log(`   Created ${events.length} events:`);
  events.forEach(e => {
    console.log(`   - ${e["queue.type"]}: ${e["queue.name"]}`);
  });
  
  // Submit
  console.log('\n📤 Submitting to New Relic...');
  const result = await submitPayload(events);
  
  if (result.success) {
    console.log(`   ✅ Success: ${result.status} ${result.statusText}`);
    
    console.log('\n🎉 MessageQueueSample events submitted!');
    console.log('\n📊 To verify UI visibility:');
    console.log('1. Wait 30-60 seconds');
    console.log('2. Go to New Relic > Message Queues');
    console.log('3. Look for provider "AwsMsk"');
    console.log('4. Check for these queues:');
    events.forEach(e => {
      console.log(`   - ${e["queue.name"]}`);
    });
    
    console.log('\n🔍 To verify via NRQL:');
    console.log('FROM MessageQueueSample SELECT * WHERE provider = \'AwsMsk\' SINCE 10 minutes ago');
  } else {
    console.log(`   ❌ Failed: ${result.error}`);
  }
}

// Run the test
main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});