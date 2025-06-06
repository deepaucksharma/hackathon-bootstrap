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
  const clusterName = `msk-workaround-${timestamp}`;
  
  console.log('🔄 Testing Standard Kafka Workaround');
  console.log('====================================\n');
  console.log('Strategy: Use standard Kafka event types with MSK fields\n');
  
  // Test 1: Standard KafkaBrokerSample with MSK fields
  const brokerPayload = {
    // Standard Kafka event type
    "eventType": "KafkaBrokerSample",
    "timestamp": timestamp,
    
    // Standard Kafka fields
    "clusterName": clusterName,
    "brokerId": 1,
    "brokerDisplayName": `${clusterName}-broker-1`,
    
    // Try different collector names
    "collector.name": "nri-kafka",
    "instrumentation.name": "nri-kafka",
    "instrumentation.provider": "newrelic",
    
    // Add MSK-specific attributes
    "provider": "AwsMsk",
    "awsRegion": "us-east-1",
    "awsAccountId": "123456789012",
    "mskClusterArn": `arn:aws:kafka:us-east-1:123456789012:cluster/${clusterName}/12345678`,
    
    // Standard metrics
    "broker.bytesInPerSecond": 1000000.0,
    "broker.bytesOutPerSecond": 800000.0,
    "broker.messagesInPerSecond": 1000.0,
    "broker.IOWaitPercent": 5.2,
    "broker.userPercent": 35.5,
    
    // MSK-specific metrics as custom attributes
    "msk.cpuUser.Average": 35.5,
    "msk.bytesInPerSec.Average": 1000000.0,
    "msk.bytesOutPerSec.Average": 800000.0
  };
  
  console.log('📤 Test 1: Standard Kafka broker with MSK attributes');
  console.log(`Cluster: ${clusterName}`);
  const submission1 = await submitPayload(brokerPayload);
  console.log(`Status: ${submission1.status}`);
  
  // Test 2: Try with cloud-integrations collector
  const cloudBrokerPayload = {
    ...brokerPayload,
    "collector.name": "cloud-integrations",
    "clusterName": `${clusterName}-cloud`,
    "brokerDisplayName": `${clusterName}-cloud-broker-1`
  };
  
  console.log('\n📤 Test 2: With cloud-integrations collector');
  const submission2 = await submitPayload(cloudBrokerPayload);
  console.log(`Status: ${submission2.status}`);
  
  // Test 3: Hybrid approach - both event types
  const mskPayload = {
    "eventType": "AwsMskBrokerSample",
    "timestamp": timestamp,
    "entityName": `${clusterName}-hybrid-broker-1`,
    "collector.name": "cloudwatch-metric-streams",
    "provider": "AwsMsk",
    "clusterName": `${clusterName}-hybrid`,
    "broker.id": "1",
    "provider.brokerId": "1",
    "provider.clusterName": `${clusterName}-hybrid`,
    "provider.bytesInPerSec.Average": 1000000.0,
    "provider.bytesOutPerSec.Average": 800000.0,
    "provider.cpuUser.Average": 35.5
  };
  
  const standardPayload = {
    "eventType": "KafkaBrokerSample",
    "timestamp": timestamp,
    "clusterName": `${clusterName}-hybrid`,
    "brokerId": 1,
    "brokerDisplayName": `${clusterName}-hybrid-broker-1`,
    "collector.name": "nri-kafka",
    "instrumentation.name": "nri-kafka",
    "broker.bytesInPerSecond": 1000000.0,
    "broker.bytesOutPerSecond": 800000.0,
    "broker.messagesInPerSecond": 1000.0
  };
  
  console.log('\n📤 Test 3: Hybrid approach - both event types');
  await submitPayload(mskPayload);
  await submitPayload(standardPayload);
  console.log('Submitted both MSK and standard events');
  
  console.log('\n⏳ Waiting 45s for entity synthesis...');
  await new Promise(resolve => setTimeout(resolve, 45000));
  
  console.log('\n🔍 Checking results...\n');
  
  // Check standard Kafka events
  const standardQuery = `FROM KafkaBrokerSample SELECT count(*), uniques(clusterName), latest(collector.name), latest(provider) WHERE clusterName LIKE '${clusterName}%' SINCE 5 minutes ago`;
  const standardResults = await runQuery(standardQuery);
  console.log(`📊 Standard Kafka events: ${standardResults[0]?.count || 0}`);
  if (standardResults[0]?.count > 0) {
    console.log(`   Clusters: ${standardResults[0]['uniques.clusterName']?.join(', ')}`);
    console.log(`   collector.name: ${standardResults[0]['latest.collector.name']}`);
    console.log(`   provider: ${standardResults[0]['latest.provider']}`);
  }
  
  // Check MSK events
  const mskQuery = `FROM AwsMskBrokerSample SELECT count(*), uniques(clusterName) WHERE clusterName LIKE '${clusterName}%' SINCE 5 minutes ago`;
  const mskResults = await runQuery(mskQuery);
  console.log(`\n📊 MSK events: ${mskResults[0]?.count || 0}`);
  
  // Check MessageQueueSample
  const uiQuery = `FROM MessageQueueSample SELECT count(*), uniques(entity.name), uniques(provider), uniques(collector.name) WHERE entity.name LIKE '%${clusterName}%' OR queue.name LIKE '%${clusterName}%' SINCE 5 minutes ago`;
  const uiResults = await runQuery(uiQuery);
  console.log(`\n📊 MessageQueueSample events: ${uiResults[0]?.count || 0}`);
  if (uiResults[0]?.count > 0) {
    console.log(`   ✅ SUCCESS! Entities visible in UI`);
    console.log(`   Entities: ${uiResults[0]['uniques.entity.name']?.join(', ')}`);
    console.log(`   Providers: ${uiResults[0]['uniques.provider']?.join(', ')}`);
    console.log(`   Collectors: ${uiResults[0]['uniques.collector.name']?.join(', ')}`);
  } else {
    console.log('   ❌ Still not visible in MessageQueueSample');
  }
  
  // Check entity creation
  const entityQuery = `FROM KafkaBrokerSample SELECT uniques(entity.guid), uniques(entity.name), uniques(entity.type) WHERE clusterName LIKE '${clusterName}%' SINCE 5 minutes ago`;
  const entityResults = await runQuery(entityQuery);
  console.log(`\n📊 Entity synthesis (standard):`)
  console.log(`   Unique GUIDs: ${entityResults[0]?.['uniques.entity.guid']?.length || 0}`);
  console.log(`   Entity types: ${entityResults[0]?.['uniques.entity.type']?.join(', ') || 'None'}`);
}

main().catch(console.error);