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
  const clusterName = `awsmsk-test-${timestamp}`;
  
  console.log('🎯 Testing AWS MSK Entity Types from Official Definitions');
  console.log('=========================================================\n');
  console.log(`Cluster: ${clusterName}\n`);
  
  // Test 1: Using official AWSMSK* entity types with MessageQueueSample
  console.log('📤 Test 1: MessageQueueSample with AWSMSK* entity types');
  
  const mqClusterPayload = {
    "eventType": "MessageQueueSample",
    "timestamp": timestamp,
    "provider": "AwsMsk",
    "collector.name": "cloudwatch-metric-streams",
    
    // Queue fields
    "queue.name": clusterName,
    "queue.type": "kafka_cluster",
    
    // Entity fields with official types
    "entity.name": clusterName,
    "entity.type": "AWSMSKCLUSTER",  // Official type from definitions
    
    // AWS context from definitions
    "aws.accountId": "123456789012",
    "aws.availabilityZone": "us-east-1a",
    "awsAccountId": "123456789012",
    "awsRegion": "us-east-1",
    "awsMskClusterName": clusterName,
    
    // Metrics
    "queue.activeControllers": 1,
    "queue.globalPartitions": 30,
    "queue.offlinePartitions": 0
  };
  
  await submitPayload(mqClusterPayload);
  console.log('  ✓ Cluster submitted');
  
  // Brokers with official types
  for (let i = 1; i <= 3; i++) {
    const mqBrokerPayload = {
      "eventType": "MessageQueueSample",
      "timestamp": timestamp,
      "provider": "AwsMsk",
      "collector.name": "cloudwatch-metric-streams",
      
      "queue.name": `${clusterName}-broker-${i}`,
      "queue.type": "kafka_broker",
      
      "entity.name": `${clusterName}-broker-${i}`,
      "entity.type": "AWSMSKBROKER",  // Official type
      
      // AWS context with relationship fields
      "aws.accountId": "123456789012",
      "aws.availabilityZone": `us-east-1${String.fromCharCode(96 + i)}`,
      "awsAccountId": "123456789012",
      "awsRegion": "us-east-1",
      "awsMskClusterName": clusterName,
      "awsMskBrokerId": i.toString(),
      
      // Metrics
      "queue.incomingMessagesPerSecond": 1000 + (i * 100),
      "queue.networkRxDropped": 0,
      "queue.networkTxDropped": 0
    };
    
    await submitPayload(mqBrokerPayload);
  }
  console.log('  ✓ 3 Brokers submitted');
  
  // Topics with official types
  const topics = ['orders', 'events', 'logs'];
  for (const topicName of topics) {
    const mqTopicPayload = {
      "eventType": "MessageQueueSample",
      "timestamp": timestamp,
      "provider": "AwsMsk",
      "collector.name": "cloudwatch-metric-streams",
      
      "queue.name": `${clusterName}-${topicName}`,
      "queue.type": "kafka_topic",
      
      "entity.name": `${clusterName}-${topicName}`,
      "entity.type": "AWSMSKTOPIC",  // Official type
      
      // AWS context
      "awsAccountId": "123456789012",
      "awsRegion": "us-east-1",
      "awsMskClusterName": clusterName,
      
      // No golden metrics defined for topics in official definitions
      "queue.messagesPerSecond": 500
    };
    
    await submitPayload(mqTopicPayload);
  }
  console.log('  ✓ 3 Topics submitted');
  
  // Test 2: Also submit regular AwsMsk* events for comparison
  console.log('\n📤 Test 2: Standard AwsMsk* events with official field names');
  
  // Cluster event with official field names
  await submitPayload({
    "eventType": "AwsMskClusterSample",
    "timestamp": timestamp,
    "collector.name": "cloudwatch-metric-streams",
    "provider": "AwsMsk",
    
    // Using field names from relationships
    "awsMskClusterName": clusterName,
    "awsAccountId": "123456789012",
    "awsRegion": "us-east-1",
    "aws.accountId": "123456789012",
    "aws.availabilityZone": "us-east-1a",
    
    // Golden metrics from definitions
    "activeControllers": 1,
    "globalPartitions": 30,
    "offlinePartitions": 0
  });
  
  // Broker events
  for (let i = 1; i <= 3; i++) {
    await submitPayload({
      "eventType": "AwsMskBrokerSample",
      "timestamp": timestamp,
      "collector.name": "cloudwatch-metric-streams",
      "provider": "AwsMsk",
      
      "awsMskClusterName": clusterName,
      "awsMskBrokerId": i.toString(),
      "awsAccountId": "123456789012",
      "awsRegion": "us-east-1",
      "aws.accountId": "123456789012",
      "aws.availabilityZone": `us-east-1${String.fromCharCode(96 + i)}`,
      
      // Golden metrics
      "incomingMessagesPerSecond": 1000 + (i * 100),
      "networkRxDropped": 0,
      "networkTxDropped": 0
    });
  }
  
  console.log('  ✓ Standard events submitted');
  
  console.log('\n⏳ Waiting 30s for processing...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  console.log('\n🔍 Checking results...\n');
  
  // Check MessageQueueSample
  const mqQuery = `FROM MessageQueueSample SELECT count(*), uniques(entity.type), uniques(queue.name) WHERE queue.name LIKE '%${clusterName}%' SINCE 5 minutes ago`;
  const mqResults = await runQuery(mqQuery);
  
  console.log(`📊 MessageQueueSample Results:`);
  console.log(`   Events: ${mqResults[0]?.count || 0}`);
  console.log(`   Entity types: ${mqResults[0]['uniques.entity.type']?.join(', ') || 'None'}`);
  console.log(`   Queues: ${mqResults[0]['uniques.queue.name']?.length || 0} unique`);
  
  // Check AwsMsk events
  const mskQuery = `SELECT count(*), uniques(eventType) FROM AwsMskClusterSample, AwsMskBrokerSample WHERE awsMskClusterName = '${clusterName}' SINCE 5 minutes ago`;
  const mskResults = await runQuery(mskQuery);
  
  console.log(`\n📊 AwsMsk Events: ${mskResults[0]?.count || 0}`);
  
  // Check entity creation via NerdGraph
  console.log('\n📊 Checking entity creation...');
  const entityQuery = `
    query {
      actor {
        entitySearch(query: "name LIKE '${clusterName}%'") {
          results {
            entities {
              guid
              name
              type
              domain
            }
          }
        }
      }
    }
  `;
  
  // Note: This would need GraphQL client, so checking via NRQL instead
  const entityCheckQuery = `FROM MessageQueueSample SELECT uniques(entity.guid) WHERE queue.name LIKE '%${clusterName}%' SINCE 5 minutes ago`;
  const entityResults = await runQuery(entityCheckQuery);
  
  console.log(`   Entity GUIDs created: ${entityResults[0]?.['uniques.entity.guid']?.length || 0}`);
  
  console.log('\n\n📋 SUMMARY');
  console.log('===========');
  console.log('Using official AWS MSK entity types from New Relic definitions:');
  console.log('- AWSMSKCLUSTER (not AWS_KAFKA_CLUSTER)');
  console.log('- AWSMSKBROKER (not AWS_KAFKA_BROKER)');
  console.log('- AWSMSKTOPIC (not AWS_KAFKA_TOPIC)');
  console.log('\nWith proper AWS context fields:');
  console.log('- awsMskClusterName, awsMskBrokerId');
  console.log('- aws.accountId, aws.availabilityZone');
}

main().catch(console.error);