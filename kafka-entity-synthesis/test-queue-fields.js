#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

// Load environment
const envPath = '../.env';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+?)[=:](.*)/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      process.env[key] = value;
    }
  });
}

// Submit to New Relic
async function submitPayload(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify([payload]);
    
    const options = {
      hostname: 'insights-collector.newrelic.com',
      path: `/v1/accounts/${process.env.ACC}/events`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Insert-Key': process.env.IKEY,
        'Content-Length': data.length
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body
        });
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runQuery(nrql) {
  return new Promise((resolve, reject) => {
    const query = {
      query: `{ actor { account(id: ${process.env.ACC}) { nrql(query: "${nrql.replace(/"/g, '\\"').replace(/\n/g, ' ')}") { results } } } }`
    };
    
    const data = JSON.stringify(query);
    
    const options = {
      hostname: 'api.newrelic.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': process.env.UKEY
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve(response.data?.actor?.account?.nrql?.results || []);
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const timestamp = Date.now();
  const clusterName = `queue-test-${timestamp}`;
  
  console.log('🎯 Testing Queue-Specific Fields');
  console.log('=================================\n');
  
  // Test 1: MessageQueueSample event directly
  console.log('📤 Test 1: Direct MessageQueueSample event');
  const queuePayload = {
    "eventType": "MessageQueueSample",
    "timestamp": timestamp,
    "provider": "AwsMsk",
    "collector.name": "cloudwatch-metric-streams",
    
    // Queue specific fields
    "queue.name": `${clusterName}-topic-1`,
    "queue.messagesPerSecond": 1000.0,
    "queue.bytesPerSecond": 1000000.0,
    "queue.consumerLag": 500,
    
    // Entity fields
    "entity.name": `${clusterName}-broker-1`,
    "entity.type": "AWS_KAFKA_BROKER",
    "entity.guid": Buffer.from(`${process.env.ACC}|INFRA|KAFKA_BROKER|${clusterName}`).toString('base64'),
    
    // AWS context
    "awsRegion": "us-east-1",
    "awsAccountId": "123456789012"
  };
  
  const result1 = await submitPayload(queuePayload);
  console.log(`Status: ${result1.status}`);
  
  // Test 2: AwsMskTopicSample with queue fields
  console.log('\n📤 Test 2: AwsMskTopicSample with queue.name');
  const topicPayload = {
    "eventType": "AwsMskTopicSample",
    "timestamp": timestamp,
    "entityName": `${clusterName}-topic-2`,
    "collector.name": "cloudwatch-metric-streams",
    "provider": "AwsMsk",
    
    // Standard MSK fields
    "clusterName": clusterName,
    "topic.name": `${clusterName}-topic-2`,
    "provider.topicName": `${clusterName}-topic-2`,
    
    // Add queue.name field
    "queue.name": `${clusterName}-topic-2`,
    
    // Metrics
    "provider.messagesInPerSec.Average": 1000.0,
    "provider.bytesInPerSec.Average": 1000000.0,
    "provider.bytesOutPerSec.Average": 800000.0
  };
  
  const result2 = await submitPayload(topicPayload);
  console.log(`Status: ${result2.status}`);
  
  // Test 3: AwsMskBrokerSample with queue context
  console.log('\n📤 Test 3: AwsMskBrokerSample with queue context');
  const brokerQueuePayload = {
    "eventType": "AwsMskBrokerSample",
    "timestamp": timestamp,
    "entityName": `${clusterName}-broker-1`,
    "collector.name": "cloudwatch-metric-streams",
    "provider": "AwsMsk",
    
    // Standard fields
    "clusterName": clusterName,
    "broker.id": "1",
    "provider.brokerId": "1",
    
    // Try to add queue context
    "queue.name": `${clusterName}-broker-queue`,
    "queue.type": "kafka",
    
    // Entity type that might work for queues
    "entity.type": "QUEUE",
    "entity.name": `${clusterName}-broker-queue`,
    
    // Metrics
    "provider.bytesInPerSec.Average": 1000000.0,
    "provider.bytesOutPerSec.Average": 800000.0,
    "provider.cpuUser.Average": 35.5
  };
  
  const result3 = await submitPayload(brokerQueuePayload);
  console.log(`Status: ${result3.status}`);
  
  // Test 4: Try with KafkaTopicSample
  console.log('\n📤 Test 4: KafkaTopicSample with queue fields');
  const kafkaTopicPayload = {
    "eventType": "KafkaTopicSample",
    "timestamp": timestamp,
    
    // Standard Kafka fields
    "clusterName": clusterName,
    "topic": `${clusterName}-kafka-topic`,
    "topicDisplayName": `${clusterName}-kafka-topic`,
    
    // Queue fields
    "queue.name": `${clusterName}-kafka-topic`,
    "queue.messagesPerSecond": 1000.0,
    
    // Try different collectors
    "collector.name": "cloud-integrations",
    "instrumentation.name": "com.newrelic.kafka",
    "provider": "AwsMsk",
    
    // Metrics
    "topic.messagesInPerSecond": 1000.0,
    "topic.bytesInPerSecond": 1000000.0,
    "topic.bytesOutPerSecond": 800000.0
  };
  
  const result4 = await submitPayload(kafkaTopicPayload);
  console.log(`Status: ${result4.status}`);
  
  console.log('\n⏳ Waiting 45s for processing...');
  await new Promise(resolve => setTimeout(resolve, 45000));
  
  console.log('\n🔍 Checking results...\n');
  
  // Check MessageQueueSample
  const mqQuery = `FROM MessageQueueSample SELECT count(*), uniques(queue.name), uniques(entity.name), uniques(provider) WHERE queue.name LIKE '%${clusterName}%' OR entity.name LIKE '%${clusterName}%' SINCE 5 minutes ago`;
  const mqResults = await runQuery(mqQuery);
  
  console.log(`📊 MessageQueueSample events: ${mqResults[0]?.count || 0}`);
  if (mqResults[0]?.count > 0) {
    console.log(`   ✅ SUCCESS! Found in MessageQueueSample`);
    console.log(`   Queue names: ${mqResults[0]['uniques.queue.name']?.join(', ')}`);
    console.log(`   Entity names: ${mqResults[0]['uniques.entity.name']?.join(', ')}`);
    console.log(`   Providers: ${mqResults[0]['uniques.provider']?.join(', ')}`);
  }
  
  // Check all event types
  const allQuery = `SELECT count(*), uniques(eventType) FROM MessageQueueSample, AwsMskBrokerSample, AwsMskTopicSample, KafkaTopicSample WHERE entityName LIKE '%${clusterName}%' OR queue.name LIKE '%${clusterName}%' OR topic LIKE '%${clusterName}%' SINCE 5 minutes ago`;
  const allResults = await runQuery(allQuery);
  
  console.log(`\n📊 Total events created: ${allResults[0]?.count || 0}`);
  console.log(`   Event types: ${allResults[0]['uniques.eventType']?.join(', ')}`);
  
  // Check if queue.name field was stored
  const queueFieldQuery = `FROM AwsMskTopicSample, AwsMskBrokerSample SELECT latest(queue.name), count(*) WHERE clusterName = '${clusterName}' SINCE 5 minutes ago`;
  const queueFieldResults = await runQuery(queueFieldQuery);
  
  if (queueFieldResults[0]?.['latest.queue.name']) {
    console.log(`\n✅ queue.name field was stored: ${queueFieldResults[0]['latest.queue.name']}`);
  }
}

main().catch(console.error);