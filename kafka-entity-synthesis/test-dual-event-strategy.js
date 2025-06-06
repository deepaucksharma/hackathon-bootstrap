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

// Generate entity GUID based on New Relic format
function generateEntityGuid(domain, type, accountId, identifier) {
  // Format: accountId|domain|type|identifier
  const guidString = `${accountId}|${domain}|${type}|${identifier}`;
  return Buffer.from(guidString).toString('base64');
}

async function main() {
  const timestamp = Date.now();
  const clusterName = `dual-test-${timestamp}`;
  const accountId = process.env.ACC;
  
  console.log('🎯 Testing Dual Event Strategy for Entity Synthesis');
  console.log('===================================================\n');
  console.log(`Cluster: ${clusterName}\n`);
  
  // Strategy: Submit BOTH event types with matching identifiers
  
  console.log('📤 Submitting dual events for complete entity synthesis...\n');
  
  // 1. CLUSTER - Both MessageQueueSample AND AwsMskClusterSample
  const clusterGuid = generateEntityGuid('INFRA', 'AWSMSKCLUSTER', accountId, clusterName);
  
  // MessageQueueSample for UI
  await submitPayload({
    "eventType": "MessageQueueSample",
    "timestamp": timestamp,
    "provider": "AwsMsk",
    "collector.name": "cloudwatch-metric-streams",
    
    // Queue fields
    "queue.name": clusterName,
    "queue.type": "kafka_cluster",
    
    // Entity fields
    "entity.name": clusterName,
    "entity.type": "AWSMSKCLUSTER",
    "entity.guid": clusterGuid,
    
    // AWS context
    "aws.accountId": "123456789012",
    "aws.availabilityZone": "us-east-1a",
    "awsAccountId": "123456789012",
    "awsRegion": "us-east-1",
    "awsMskClusterName": clusterName,
    
    // Queue metrics
    "queue.activeControllers": 1,
    "queue.globalPartitions": 30,
    "queue.offlinePartitions": 0,
    "queue.brokerCount": 3
  });
  
  // AwsMskClusterSample for entity synthesis
  await submitPayload({
    "eventType": "AwsMskClusterSample",
    "timestamp": timestamp,
    "entityName": clusterName,
    "entityGuid": clusterGuid,
    "collector.name": "cloudwatch-metric-streams",
    "provider": "AwsMsk",
    
    // Required synthesis fields from config
    "clusterName": clusterName,
    
    // AWS context
    "awsMskClusterName": clusterName,
    "awsAccountId": "123456789012",
    "awsRegion": "us-east-1",
    "aws.accountId": "123456789012",
    "aws.availabilityZone": "us-east-1a",
    "aws.Namespace": "AWS/Kafka",
    
    // Provider fields
    "provider.accountId": "123456789012",
    "provider.region": "us-east-1",
    "provider.clusterArn": `arn:aws:kafka:us-east-1:123456789012:cluster/${clusterName}/12345678`,
    
    // Golden metrics with all aggregations
    "provider.activeControllerCount.Average": 1,
    "provider.activeControllerCount.Sum": 1,
    "provider.activeControllerCount.Minimum": 1,
    "provider.activeControllerCount.Maximum": 1,
    "provider.activeControllerCount.SampleCount": 1,
    
    "provider.globalPartitionCount.Average": 30,
    "provider.globalPartitionCount.Sum": 30,
    "provider.globalPartitionCount.Minimum": 30,
    "provider.globalPartitionCount.Maximum": 30,
    "provider.globalPartitionCount.SampleCount": 1,
    
    "provider.offlinePartitionsCount.Average": 0,
    "provider.offlinePartitionsCount.Sum": 0,
    "provider.offlinePartitionsCount.Minimum": 0,
    "provider.offlinePartitionsCount.Maximum": 0,
    "provider.offlinePartitionsCount.SampleCount": 1
  });
  
  console.log('✓ Cluster events submitted (MessageQueueSample + AwsMskClusterSample)');
  
  // 2. BROKERS - Both event types
  for (let i = 1; i <= 3; i++) {
    const brokerIdentifier = `${clusterName}:${i}`;
    const brokerGuid = generateEntityGuid('INFRA', 'AWSMSKBROKER', accountId, brokerIdentifier);
    const brokerName = `${clusterName}-broker-${i}`;
    
    // MessageQueueSample
    await submitPayload({
      "eventType": "MessageQueueSample",
      "timestamp": timestamp,
      "provider": "AwsMsk",
      "collector.name": "cloudwatch-metric-streams",
      
      "queue.name": brokerName,
      "queue.type": "kafka_broker",
      
      "entity.name": brokerName,
      "entity.type": "AWSMSKBROKER",
      "entity.guid": brokerGuid,
      
      // Relationship fields
      "awsAccountId": "123456789012",
      "awsRegion": "us-east-1",
      "awsMskClusterName": clusterName,
      "awsMskBrokerId": i.toString(),
      
      // Metrics
      "queue.incomingMessagesPerSecond": 1000 + (i * 100),
      "queue.bytesInPerSecond": 1000000 + (i * 100000),
      "queue.bytesOutPerSecond": 800000 + (i * 80000)
    });
    
    // AwsMskBrokerSample
    await submitPayload({
      "eventType": "AwsMskBrokerSample",
      "timestamp": timestamp,
      "entityName": brokerName,
      "entityGuid": brokerGuid,
      "collector.name": "cloudwatch-metric-streams",
      "provider": "AwsMsk",
      
      // Required synthesis fields
      "clusterName": clusterName,
      "provider.brokerId": i.toString(),
      
      // AWS context
      "awsMskClusterName": clusterName,
      "awsMskBrokerId": i.toString(),
      "awsAccountId": "123456789012",
      "awsRegion": "us-east-1",
      "aws.accountId": "123456789012",
      "aws.availabilityZone": `us-east-1${String.fromCharCode(96 + i)}`,
      "aws.Namespace": "AWS/Kafka",
      "aws.kafka.brokerId": i.toString(),
      
      // Provider fields
      "provider.accountId": "123456789012",
      "provider.region": "us-east-1",
      "provider.clusterArn": `arn:aws:kafka:us-east-1:123456789012:cluster/${clusterName}/12345678`,
      
      // Golden metrics with aggregations
      "provider.bytesInPerSec.Average": 1000000 + (i * 100000),
      "provider.bytesInPerSec.Sum": 60000000 + (i * 6000000),
      "provider.bytesInPerSec.Minimum": 800000 + (i * 80000),
      "provider.bytesInPerSec.Maximum": 1200000 + (i * 120000),
      "provider.bytesInPerSec.SampleCount": 60,
      
      "provider.messagesInPerSec.Average": 1000 + (i * 100),
      "provider.messagesInPerSec.Sum": 60000 + (i * 6000),
      "provider.messagesInPerSec.Minimum": 800 + (i * 80),
      "provider.messagesInPerSec.Maximum": 1200 + (i * 120),
      "provider.messagesInPerSec.SampleCount": 60,
      
      "provider.cpuUser.Average": 30 + (i * 5)
    });
  }
  
  console.log('✓ 3 Broker events submitted (dual events each)');
  
  console.log('\n⏳ Waiting 45s for entity synthesis...');
  await new Promise(resolve => setTimeout(resolve, 45000));
  
  console.log('\n🔍 Checking comprehensive results...\n');
  
  // 1. Check MessageQueueSample
  const mqQuery = `FROM MessageQueueSample SELECT count(*), uniques(entity.type), uniques(entity.guid) WHERE queue.name LIKE '%${clusterName}%' SINCE 5 minutes ago`;
  const mqResults = await runQuery(mqQuery);
  
  console.log(`📊 MessageQueueSample:`);
  console.log(`   Events: ${mqResults[0]?.count || 0}`);
  console.log(`   Entity types: ${mqResults[0]['uniques.entity.type']?.join(', ') || 'None'}`);
  console.log(`   Entity GUIDs: ${mqResults[0]['uniques.entity.guid']?.length || 0}`);
  
  // 2. Check AwsMsk events
  const mskQuery = `SELECT count(*), uniques(entityGuid), uniques(entityName) FROM AwsMskClusterSample, AwsMskBrokerSample WHERE clusterName = '${clusterName}' SINCE 5 minutes ago`;
  const mskResults = await runQuery(mskQuery);
  
  console.log(`\n📊 AwsMsk Events:`);
  console.log(`   Events: ${mskResults[0]?.count || 0}`);
  console.log(`   Entity GUIDs: ${mskResults[0]['uniques.entityGuid']?.length || 0}`);
  console.log(`   Entity names: ${mskResults[0]['uniques.entityName']?.join(', ')}`);
  
  // 3. Check if entities are synthesized
  const synthQuery = `FROM AwsMskBrokerSample SELECT latest(entity.guid), latest(entity.name), latest(entity.type) WHERE clusterName = '${clusterName}' SINCE 5 minutes ago FACET entityName LIMIT 10`;
  const synthResults = await runQuery(synthQuery);
  
  console.log(`\n📊 Entity Synthesis Check:`);
  if (synthResults.length > 0 && synthResults[0]['latest.entity.guid']) {
    console.log('   ✅ Entities ARE being synthesized!');
    synthResults.forEach(r => {
      console.log(`   ${r.facet[0]}: ${r['latest.entity.type'] || 'Type not set'}`);
    });
  } else {
    console.log('   ❌ No entity synthesis detected');
  }
  
  // 4. Check relationships
  const relQuery = `FROM Relationship SELECT count(*), uniques(relationshipType) WHERE sourceEntityGuid IN (SELECT uniques(entityGuid) FROM AwsMskClusterSample WHERE clusterName = '${clusterName}' SINCE 5 minutes ago) OR targetEntityGuid IN (SELECT uniques(entityGuid) FROM AwsMskBrokerSample WHERE clusterName = '${clusterName}' SINCE 5 minutes ago) SINCE 5 minutes ago`;
  const relResults = await runQuery(relQuery);
  
  console.log(`\n📊 Relationships:`);
  console.log(`   Count: ${relResults[0]?.count || 0}`);
  console.log(`   Types: ${relResults[0]['uniques.relationshipType']?.join(', ') || 'None'}`);
  
  console.log('\n\n✅ DUAL EVENT STRATEGY SUMMARY');
  console.log('==============================');
  console.log('For complete entity synthesis and UI visibility:');
  console.log('1. Submit MessageQueueSample for Message Queues UI visibility');
  console.log('2. Submit AwsMsk*Sample for entity synthesis and metrics');
  console.log('3. Use matching entity GUIDs and names across both event types');
  console.log('4. Include all required synthesis fields from entity definitions');
  console.log('5. Ensure relationships fields match across related entities');
}

main().catch(console.error);