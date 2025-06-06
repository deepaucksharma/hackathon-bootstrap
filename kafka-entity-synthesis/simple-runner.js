#!/usr/bin/env node

/**
 * Simple runner for testing entity synthesis
 */

const https = require('https');
const fs = require('fs');
const yaml = require('js-yaml');

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

// Simple payload for broker
const brokerPayload = {
  eventType: "AwsMskBrokerSample",
  entityName: `test-cluster-${Date.now()}-broker-1`,
  entityGuid: Buffer.from(`${process.env.ACC}|INFRA|KAFKA_BROKER|test-${Date.now()}`).toString('base64'),
  timestamp: Date.now(),
  
  // Critical fields for synthesis
  "collector.name": "cloudwatch-metric-streams",
  "provider": "AwsMsk",
  "clusterName": `test-cluster-${Date.now()}`,
  "broker.id": "1",
  "provider.brokerId": "1",
  
  // AWS context
  "provider.accountId": "123456789012",
  "provider.region": "us-east-1",
  "aws.Namespace": "AWS/Kafka",
  
  // Metrics with all aggregations
  "provider.bytesInPerSec.Average": 1000000,
  "provider.bytesInPerSec.Sum": 60000000,
  "provider.bytesInPerSec.Minimum": 500000,
  "provider.bytesInPerSec.Maximum": 1500000,
  "provider.bytesInPerSec.SampleCount": 60,
  
  "provider.bytesOutPerSec.Average": 800000,
  "provider.bytesOutPerSec.Sum": 48000000,
  "provider.bytesOutPerSec.Minimum": 400000,
  "provider.bytesOutPerSec.Maximum": 1200000,
  "provider.bytesOutPerSec.SampleCount": 60,
  
  "provider.messagesInPerSec.Average": 1000,
  "provider.cpuUser.Average": 35.5
};

// Submit to New Relic
async function submitPayload(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify([payload]); // Event API expects array
    
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

// Query New Relic
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
        'API-Key': process.env.UKEY,
        'Content-Length': data.length
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

// Main
async function main() {
  console.log('🚀 Simple Entity Synthesis Test');
  console.log('==============================\n');
  
  console.log('📤 Submitting broker payload...');
  const clusterName = brokerPayload.clusterName;
  const entityName = brokerPayload.entityName;
  
  const submission = await submitPayload(brokerPayload);
  console.log(`✅ Status: ${submission.status}`);
  
  if (submission.status !== 200 && submission.status !== 202) {
    console.error('❌ Submission failed:', submission.body);
    return;
  }
  
  console.log('\n⏳ Waiting 30s for entity synthesis...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  console.log('\n🔍 Checking for entity...');
  
  // Check 1: Event in NRDB
  const eventQuery = `FROM AwsMskBrokerSample SELECT count(*) WHERE clusterName = '${clusterName}' SINCE 5 minutes ago`;
  const events = await runQuery(eventQuery);
  console.log(`📊 Events found: ${events[0]?.count || 0}`);
  
  // Check 2: MessageQueueSample (UI visibility)
  const uiQuery = `FROM MessageQueueSample SELECT count(*) WHERE entity.name LIKE '%${clusterName}%' SINCE 5 minutes ago`;
  const uiEvents = await runQuery(uiQuery);
  console.log(`📊 UI events found: ${uiEvents[0]?.count || 0}`);
  
  // Check 3: Entity existence
  const entityQuery = `FROM AwsMskBrokerSample SELECT uniques(entityGuid), uniques(entityName) WHERE clusterName = '${clusterName}' SINCE 5 minutes ago`;
  const entities = await runQuery(entityQuery);
  console.log(`📊 Unique entities: ${entities[0]?.['uniques.entityName']?.length || 0}`);
  
  if (uiEvents[0]?.count > 0) {
    console.log('\n✅ SUCCESS! Entity is visible in Message Queues UI');
  } else if (events[0]?.count > 0) {
    console.log('\n⚠️  Events received but not visible in UI - check collector.name');
  } else {
    console.log('\n❌ No events found - check submission');
  }
}

main().catch(console.error);