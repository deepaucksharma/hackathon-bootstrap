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
  const uniqueId = `complete-test-${timestamp}`;
  const clusterName = `complete-cluster-${timestamp}`;
  
  // Complete payload with ALL fields from comprehensive guide
  const completePayload = {
    // Core event fields
    "eventType": "AwsMskBrokerSample",
    "timestamp": timestamp,
    "entityName": `${clusterName}-broker-1`,
    "entityGuid": Buffer.from(`${process.env.ACC}|INFRA|KAFKA_BROKER|${uniqueId}`).toString('base64'),
    
    // Critical synthesis fields
    "collector.name": "cloudwatch-metric-streams",
    "provider": "AwsMsk",
    "clusterName": clusterName,
    "broker.id": "1",
    
    // Provider fields
    "provider.accountId": "123456789012",
    "provider.region": "us-east-1",
    "provider.clusterName": clusterName,
    "provider.brokerId": "1",
    "provider.clusterArn": `arn:aws:kafka:us-east-1:123456789012:cluster/${clusterName}/${uniqueId}`,
    
    // Account linking
    "providerAccountId": process.env.ACC,
    "providerAccountName": "Test Account",
    "providerExternalId": `arn:aws:kafka:us-east-1:123456789012:broker/${clusterName}/${uniqueId}/1`,
    
    // AWS context
    "awsAccountId": "123456789012",
    "awsRegion": "us-east-1",
    "aws.Namespace": "AWS/Kafka",
    "aws.kafka.clusterName": clusterName,
    "aws.kafka.brokerId": "1",
    
    // Entity fields
    "entity.type": "AWS_KAFKA_BROKER",
    "entity.name": `${clusterName}-broker-1`,
    
    // Instrumentation
    "instrumentation.name": "com.newrelic.kafka",
    "instrumentation.source": "msk-shim",
    "instrumentation.provider": "aws",
    
    // All metric aggregations
    "provider.bytesInPerSec.Sum": 60000000.0,
    "provider.bytesInPerSec.Average": 1000000.0,
    "provider.bytesInPerSec.Maximum": 1500000.0,
    "provider.bytesInPerSec.Minimum": 500000.0,
    "provider.bytesInPerSec.SampleCount": 60,
    
    "provider.bytesOutPerSec.Sum": 48000000.0,
    "provider.bytesOutPerSec.Average": 800000.0,
    "provider.bytesOutPerSec.Maximum": 1200000.0,
    "provider.bytesOutPerSec.Minimum": 400000.0,
    "provider.bytesOutPerSec.SampleCount": 60,
    
    "provider.messagesInPerSec.Average": 1000.0,
    "provider.cpuUser.Average": 35.5,
    
    // Additional metadata
    "dataSourceName": "cloudwatch-metric-streams",
    "integrationName": "com.newrelic.kafka",
    "integrationVersion": "1.0.0"
  };
  
  console.log('🚀 Testing Complete Payload');
  console.log('==========================\n');
  
  console.log('📤 Submitting comprehensive payload...');
  console.log(`Cluster: ${clusterName}`);
  
  const submission = await submitPayload(completePayload);
  console.log(`✅ Status: ${submission.status}`);
  
  if (submission.status !== 200 && submission.status !== 202) {
    console.error('❌ Submission failed:', submission.body);
    return;
  }
  
  console.log('\n⏳ Waiting 45s for entity synthesis...');
  await new Promise(resolve => setTimeout(resolve, 45000));
  
  console.log('\n🔍 Running comprehensive checks...\n');
  
  // Check 1: Event storage
  const eventQuery = `FROM AwsMskBrokerSample SELECT count(*), latest(collector.name), latest(provider), latest(providerAccountId) WHERE clusterName = '${clusterName}' SINCE 5 minutes ago`;
  const events = await runQuery(eventQuery);
  console.log(`📊 Events in NRDB: ${events[0]?.count || 0}`);
  if (events[0]?.count > 0) {
    console.log(`   collector.name: ${events[0]['latest.collector.name']}`);
    console.log(`   provider: ${events[0]['latest.provider']}`);
    console.log(`   providerAccountId: ${events[0]['latest.providerAccountId']}`);
  }
  
  // Check 2: MessageQueueSample
  const uiQuery = `FROM MessageQueueSample SELECT count(*), latest(provider), latest(queue.name) WHERE entity.name LIKE '%${clusterName}%' OR queue.name LIKE '%${clusterName}%' SINCE 5 minutes ago`;
  const uiEvents = await runQuery(uiQuery);
  console.log(`\n📊 MessageQueueSample events: ${uiEvents[0]?.count || 0}`);
  if (uiEvents[0]?.count > 0) {
    console.log(`   provider: ${uiEvents[0]['latest.provider']}`);
    console.log(`   queue.name: ${uiEvents[0]['latest.queue.name']}`);
  }
  
  // Check 3: Entity details
  const entityQuery = `FROM AwsMskBrokerSample SELECT uniques(entityGuid), uniques(entityName), uniques(entity.type), uniques(entity.name) WHERE clusterName = '${clusterName}' SINCE 5 minutes ago`;
  const entities = await runQuery(entityQuery);
  console.log(`\n📊 Entity synthesis:`);
  console.log(`   Unique GUIDs: ${entities[0]?.['uniques.entityGuid']?.length || 0}`);
  console.log(`   Entity names: ${entities[0]?.['uniques.entityName']?.join(', ') || 'None'}`);
  console.log(`   Entity types: ${entities[0]?.['uniques.entity.type']?.join(', ') || 'None'}`);
  
  // Final verdict
  if (uiEvents[0]?.count > 0) {
    console.log('\n✅ SUCCESS! Entity is visible in Message Queues UI');
  } else if (events[0]?.count > 0) {
    console.log('\n⚠️  Events stored but NOT visible in UI');
    console.log('   This suggests entity synthesis is not triggering properly');
  } else {
    console.log('\n❌ No events found');
  }
}

main().catch(console.error);