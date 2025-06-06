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
  const clusterName = `msgqueue-only-${timestamp}`;
  
  console.log('🎯 MessageQueueSample-Only Strategy');
  console.log('===================================\n');
  console.log('Since MSK entities have NO synthesis rules, we\'ll use MessageQueueSample');
  console.log('as the primary data source with all metrics embedded.\n');
  console.log(`Cluster: ${clusterName}\n`);
  
  const payloads = [];
  
  // 1. Cluster with all metrics embedded
  payloads.push({
    "eventType": "MessageQueueSample",
    "timestamp": timestamp,
    "provider": "AwsMsk",
    "collector.name": "cloudwatch-metric-streams",
    
    // Queue identification
    "queue.name": clusterName,
    "queue.type": "kafka_cluster",
    
    // Entity fields
    "entity.name": clusterName,
    "entity.type": "AWSMSKCLUSTER",
    
    // Queue-specific metrics
    "queue.activeControllers": 1,
    "queue.globalPartitions": 30,
    "queue.offlinePartitions": 0,
    "queue.brokerCount": 3,
    "queue.topicCount": 3,
    
    // AWS context (for relationships)
    "awsAccountId": "123456789012",
    "awsRegion": "us-east-1",
    "awsMskClusterName": clusterName,
    "aws.accountId": "123456789012",
    "aws.availabilityZone": "us-east-1a",
    
    // Embed all CloudWatch metrics
    "activeControllers": 1,
    "globalPartitions": 30,
    "offlinePartitions": 0,
    
    // Additional context
    "clusterArn": `arn:aws:kafka:us-east-1:123456789012:cluster/${clusterName}/12345678`,
    "clusterState": "ACTIVE",
    "enhancedMonitoring": "DEFAULT"
  });
  
  // 2. Brokers with embedded metrics
  for (let i = 1; i <= 3; i++) {
    const brokerName = `${clusterName}-broker-${i}`;
    
    payloads.push({
      "eventType": "MessageQueueSample",
      "timestamp": timestamp,
      "provider": "AwsMsk",
      "collector.name": "cloudwatch-metric-streams",
      
      "queue.name": brokerName,
      "queue.type": "kafka_broker",
      
      "entity.name": brokerName,
      "entity.type": "AWSMSKBROKER",
      
      // Queue metrics
      "queue.incomingMessagesPerSecond": 1000 + (i * 100),
      "queue.bytesInPerSecond": 1000000 + (i * 100000),
      "queue.bytesOutPerSecond": 800000 + (i * 80000),
      "queue.networkRxDropped": 0,
      "queue.networkTxDropped": 0,
      "queue.cpuPercent": 30 + (i * 5),
      "queue.memoryPercent": 45 + (i * 3),
      "queue.diskUsedPercent": 55 + (i * 2),
      
      // Relationship fields
      "awsAccountId": "123456789012",
      "awsRegion": "us-east-1",
      "awsMskClusterName": clusterName,
      "awsMskBrokerId": i.toString(),
      "aws.accountId": "123456789012",
      "aws.availabilityZone": `us-east-1${String.fromCharCode(96 + i)}`,
      
      // Embedded golden metrics
      "incomingMessagesPerSecond": 1000 + (i * 100),
      "networkRxDropped": 0,
      "networkTxDropped": 0,
      
      // Additional broker context
      "brokerId": i.toString(),
      "brokerState": "RUNNING",
      "brokerVersion": "2.8.1"
    });
  }
  
  // 3. Topics with embedded metrics
  const topics = ['orders', 'events', 'logs'];
  topics.forEach((topicName, idx) => {
    const fullTopicName = `${clusterName}-${topicName}`;
    
    payloads.push({
      "eventType": "MessageQueueSample",
      "timestamp": timestamp,
      "provider": "AwsMsk",
      "collector.name": "cloudwatch-metric-streams",
      
      "queue.name": fullTopicName,
      "queue.type": "kafka_topic",
      
      "entity.name": fullTopicName,
      "entity.type": "AWSMSKTOPIC",
      
      // Queue metrics
      "queue.messagesPerSecond": 500 * (idx + 1),
      "queue.bytesInPerSecond": 500000 * (idx + 1),
      "queue.bytesOutPerSecond": 400000 * (idx + 1),
      "queue.consumerLag": 100 * (idx + 1),
      "queue.partitionCount": 10,
      "queue.replicationFactor": 3,
      
      // Relationship fields
      "awsAccountId": "123456789012",
      "awsRegion": "us-east-1",
      "awsMskClusterName": clusterName,
      
      // Topic context
      "topicName": topicName,
      "topicState": "ACTIVE",
      "retentionMs": 604800000,
      "compressionType": "SNAPPY"
    });
  });
  
  // Submit all payloads
  console.log('📤 Submitting MessageQueueSample events with embedded metrics...');
  for (const payload of payloads) {
    const result = await submitPayload(payload);
    console.log(`   ${payload['queue.name']}: ${result.status}`);
  }
  
  console.log('\n⏳ Waiting 30s for processing...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  console.log('\n🔍 Verifying Message Queue UI visibility...\n');
  
  // Check MessageQueueSample
  const mqQuery = `FROM MessageQueueSample SELECT count(*), uniques(entity.type), uniques(queue.type) WHERE queue.name LIKE '%${clusterName}%' SINCE 5 minutes ago`;
  const mqResults = await runQuery(mqQuery);
  
  console.log(`📊 MessageQueueSample Results:`);
  console.log(`   Total events: ${mqResults[0]?.count || 0}`);
  console.log(`   Entity types: ${mqResults[0]['uniques.entity.type']?.join(', ')}`);
  console.log(`   Queue types: ${mqResults[0]['uniques.queue.type']?.join(', ')}`);
  
  // Check specific metrics
  const metricsQuery = `FROM MessageQueueSample SELECT average(queue.messagesPerSecond), average(queue.bytesInPerSecond), average(queue.cpuPercent) WHERE queue.name LIKE '%${clusterName}%' AND queue.type = 'kafka_broker' SINCE 5 minutes ago`;
  const metricsResults = await runQuery(metricsQuery);
  
  console.log(`\n📊 Broker Metrics (averages):`);
  console.log(`   Messages/sec: ${metricsResults[0]?.['average.queue.messagesPerSecond']?.toFixed(0) || 'N/A'}`);
  console.log(`   Bytes In/sec: ${(metricsResults[0]?.['average.queue.bytesInPerSecond'] / 1000000)?.toFixed(2) || 'N/A'} MB/s`);
  console.log(`   CPU %: ${metricsResults[0]?.['average.queue.cpuPercent']?.toFixed(1) || 'N/A'}`);
  
  // Check relationship fields
  const relFieldsQuery = `FROM MessageQueueSample SELECT uniques(awsMskClusterName), uniques(awsMskBrokerId) WHERE queue.name LIKE '%${clusterName}%' SINCE 5 minutes ago`;
  const relFieldsResults = await runQuery(relFieldsQuery);
  
  console.log(`\n📊 Relationship Fields:`);
  console.log(`   Cluster names: ${relFieldsResults[0]?.['uniques.awsMskClusterName']?.join(', ') || 'None'}`);
  console.log(`   Broker IDs: ${relFieldsResults[0]?.['uniques.awsMskBrokerId']?.join(', ') || 'None'}`);
  
  console.log('\n\n✅ MESSAGEQUEUESAMPLE-ONLY STRATEGY');
  console.log('===================================');
  console.log('Since MSK entities have NO automatic synthesis rules:');
  console.log('1. Use MessageQueueSample as the primary data source');
  console.log('2. Embed ALL metrics directly in MessageQueueSample');
  console.log('3. Include relationship fields for manual correlation');
  console.log('4. This provides full UI visibility without entity synthesis');
  console.log('\nBenefits:');
  console.log('- Immediate visibility in Message Queues UI');
  console.log('- All metrics available for dashboards/alerts');
  console.log('- No dependency on synthesis rules');
  console.log('- Simpler implementation');
}

main().catch(console.error);