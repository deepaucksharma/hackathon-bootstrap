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
  const clusterName = `msk-solution-${timestamp}`;
  
  console.log('✅ MessageQueueSample Solution Test');
  console.log('===================================\n');
  console.log(`Cluster: ${clusterName}\n`);
  
  // Create a complete MSK cluster with MessageQueueSample events
  const payloads = [];
  
  // 1. Cluster-level queue
  payloads.push({
    "eventType": "MessageQueueSample",
    "timestamp": timestamp,
    "provider": "AwsMsk",
    "collector.name": "cloudwatch-metric-streams",
    
    // Queue identification
    "queue.name": clusterName,
    "queue.type": "kafka_cluster",
    
    // Entity fields for cluster
    "entity.name": clusterName,
    "entity.type": "AWS_KAFKA_CLUSTER",
    "entity.guid": Buffer.from(`${process.env.ACC}|INFRA|KAFKA_CLUSTER|${clusterName}`).toString('base64'),
    
    // Cluster metrics
    "queue.messagesPerSecond": 5000.0,
    "queue.bytesPerSecond": 5000000.0,
    "queue.activeConnections": 25,
    "queue.brokerCount": 3,
    
    // AWS context
    "awsRegion": "us-east-1",
    "awsAccountId": "123456789012",
    "providerAccountId": process.env.ACC
  });
  
  // 2. Broker-level queues
  for (let i = 1; i <= 3; i++) {
    payloads.push({
      "eventType": "MessageQueueSample",
      "timestamp": timestamp,
      "provider": "AwsMsk",
      "collector.name": "cloudwatch-metric-streams",
      
      // Queue identification
      "queue.name": `${clusterName}-broker-${i}`,
      "queue.type": "kafka_broker",
      
      // Entity fields for broker
      "entity.name": `${clusterName}-broker-${i}`,
      "entity.type": "AWS_KAFKA_BROKER",
      "entity.guid": Buffer.from(`${process.env.ACC}|INFRA|KAFKA_BROKER|${clusterName}-broker-${i}`).toString('base64'),
      
      // Broker metrics
      "queue.messagesPerSecond": 1500.0 + (i * 100),
      "queue.bytesPerSecond": 1500000.0 + (i * 100000),
      "queue.cpuPercent": 30.5 + (i * 5),
      "queue.memoryPercent": 45.2 + (i * 3),
      "queue.diskUsedPercent": 55.0 + (i * 2),
      
      // Relationships
      "clusterName": clusterName,
      "brokerId": i,
      
      // AWS context
      "awsRegion": "us-east-1",
      "awsAccountId": "123456789012",
      "providerAccountId": process.env.ACC
    });
  }
  
  // 3. Topic-level queues
  const topics = ['orders', 'events', 'logs'];
  topics.forEach((topicName, idx) => {
    payloads.push({
      "eventType": "MessageQueueSample",
      "timestamp": timestamp,
      "provider": "AwsMsk",
      "collector.name": "cloudwatch-metric-streams",
      
      // Queue identification
      "queue.name": `${clusterName}-${topicName}`,
      "queue.type": "kafka_topic",
      
      // Entity fields for topic
      "entity.name": `${clusterName}-${topicName}`,
      "entity.type": "AWS_KAFKA_TOPIC",
      "entity.guid": Buffer.from(`${process.env.ACC}|INFRA|KAFKA_TOPIC|${clusterName}-${topicName}`).toString('base64'),
      
      // Topic metrics
      "queue.messagesPerSecond": 500.0 * (idx + 1),
      "queue.bytesPerSecond": 500000.0 * (idx + 1),
      "queue.consumerLag": 1000 * (idx + 1),
      "queue.partitionCount": 10,
      "queue.replicationFactor": 3,
      
      // Relationships
      "clusterName": clusterName,
      "topicName": topicName,
      
      // AWS context
      "awsRegion": "us-east-1",
      "awsAccountId": "123456789012",
      "providerAccountId": process.env.ACC
    });
  });
  
  // Submit all payloads
  console.log('📤 Submitting MessageQueueSample events...');
  for (const payload of payloads) {
    const result = await submitPayload(payload);
    console.log(`   ${payload['queue.name']}: ${result.status}`);
  }
  
  // Also submit corresponding AwsMsk events for completeness
  console.log('\n📤 Submitting corresponding AwsMsk events...');
  
  // Cluster event
  await submitPayload({
    "eventType": "AwsMskClusterSample",
    "timestamp": timestamp,
    "entityName": clusterName,
    "collector.name": "cloudwatch-metric-streams",
    "provider": "AwsMsk",
    "clusterName": clusterName,
    "provider.activeControllerCount.Average": 1,
    "provider.offlinePartitionsCount.Average": 0,
    "provider.globalPartitionCount.Average": 30
  });
  
  // Broker events
  for (let i = 1; i <= 3; i++) {
    await submitPayload({
      "eventType": "AwsMskBrokerSample",
      "timestamp": timestamp,
      "entityName": `${clusterName}-broker-${i}`,
      "collector.name": "cloudwatch-metric-streams",
      "provider": "AwsMsk",
      "clusterName": clusterName,
      "broker.id": i.toString(),
      "provider.brokerId": i.toString(),
      "provider.cpuUser.Average": 30.5 + (i * 5),
      "provider.bytesInPerSec.Average": 1500000.0 + (i * 100000),
      "provider.bytesOutPerSec.Average": 1200000.0 + (i * 80000)
    });
  }
  
  console.log('\n⏳ Waiting 30s for processing...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  console.log('\n🔍 Verifying results...\n');
  
  // Check MessageQueueSample
  const mqQuery = `FROM MessageQueueSample SELECT count(*), uniques(queue.name), uniques(queue.type), uniques(entity.type) WHERE queue.name LIKE '%${clusterName}%' SINCE 5 minutes ago`;
  const mqResults = await runQuery(mqQuery);
  
  console.log(`📊 MessageQueueSample Summary:`);
  console.log(`   Total events: ${mqResults[0]?.count || 0}`);
  console.log(`   Queue names: ${mqResults[0]['uniques.queue.name']?.length || 0} unique`);
  console.log(`   Queue types: ${mqResults[0]['uniques.queue.type']?.join(', ')}`);
  console.log(`   Entity types: ${mqResults[0]['uniques.entity.type']?.join(', ')}`);
  
  // Get detailed view
  const detailQuery = `FROM MessageQueueSample SELECT queue.name, entity.type, queue.messagesPerSecond, queue.bytesPerSecond WHERE queue.name LIKE '%${clusterName}%' SINCE 5 minutes ago LIMIT 20`;
  const details = await runQuery(detailQuery);
  
  console.log('\n📊 Queue Details:');
  details.forEach(d => {
    console.log(`   ${d['queue.name']} (${d['entity.type']}): ${d['queue.messagesPerSecond']} msg/s, ${(d['queue.bytesPerSecond']/1000000).toFixed(2)} MB/s`);
  });
  
  // Check AwsMsk events
  const mskQuery = `SELECT count(*), uniques(eventType) FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample WHERE clusterName = '${clusterName}' SINCE 5 minutes ago`;
  const mskResults = await runQuery(mskQuery);
  
  console.log(`\n📊 AwsMsk Events: ${mskResults[0]?.count || 0}`);
  console.log(`   Event types: ${mskResults[0]['uniques.eventType']?.join(', ')}`);
  
  console.log('\n\n✅ SOLUTION SUMMARY');
  console.log('===================');
  console.log('To make Kafka entities appear in Message Queues UI:');
  console.log('1. Submit events with eventType: "MessageQueueSample"');
  console.log('2. Include queue.name field (required for UI)');
  console.log('3. Set provider: "AwsMsk" for AWS MSK');
  console.log('4. Include entity.type and entity.name');
  console.log('5. Add queue-specific metrics (messagesPerSecond, bytesPerSecond, etc.)');
  console.log('\nThe Message Queues UI specifically looks for MessageQueueSample events!');
}

main().catch(console.error);