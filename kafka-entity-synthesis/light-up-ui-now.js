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
  console.log('🚀 LIGHT UP THE MESSAGE QUEUES UI - FINAL ATTEMPT');
  console.log('=================================================\n');
  
  const timestamp = Date.now();
  const clusterName = `ui-visible-cluster-${timestamp}`;
  
  console.log(`Account: ${process.env.ACC}`);
  console.log(`Cluster: ${clusterName}\n`);
  
  // Create a complete MSK deployment with MessageQueueSample
  const events = [];
  
  // 1. Cluster Event
  events.push({
    "eventType": "MessageQueueSample",
    "timestamp": timestamp,
    
    // Provider MUST be exactly this
    "provider": "AwsMsk",
    
    // Collector name - try both options
    "collector.name": "cloudwatch-metric-streams",
    
    // Queue identification - CRITICAL for UI
    "queue.name": clusterName,
    "queue.type": "kafka_cluster",
    
    // Entity identification - Use official types
    "entity.name": clusterName,
    "entity.type": "AWSMSKCLUSTER",
    
    // AWS Context
    "awsAccountId": "123456789012",
    "awsRegion": "us-east-1", 
    "awsMskClusterName": clusterName,
    
    // Metrics visible in UI
    "queue.activeControllers": 1,
    "queue.globalPartitions": 30,
    "queue.offlinePartitions": 0,
    "queue.brokerCount": 3,
    "queue.topicCount": 5,
    
    // Additional context
    "clusterState": "ACTIVE",
    "clusterArn": `arn:aws:kafka:us-east-1:123456789012:cluster/${clusterName}/12345678-1234-1234-1234-123456789012`,
    
    // Try adding more fields that might help
    "providerAccountId": process.env.ACC,
    "providerAccountName": "Test Account"
  });
  
  // 2. Broker Events
  for (let i = 1; i <= 3; i++) {
    events.push({
      "eventType": "MessageQueueSample",
      "timestamp": timestamp + i,
      
      "provider": "AwsMsk",
      "collector.name": "cloudwatch-metric-streams",
      
      "queue.name": `${clusterName}-broker-${i}`,
      "queue.type": "kafka_broker",
      
      "entity.name": `${clusterName}-broker-${i}`,
      "entity.type": "AWSMSKBROKER",
      
      // Relationships
      "awsAccountId": "123456789012",
      "awsRegion": "us-east-1",
      "awsMskClusterName": clusterName,
      "awsMskBrokerId": i.toString(),
      
      // Metrics
      "queue.messagesPerSecond": 1000 + (i * 100),
      "queue.bytesInPerSecond": 1000000 + (i * 100000),
      "queue.bytesOutPerSecond": 800000 + (i * 80000),
      "queue.cpuPercent": 30 + (i * 5),
      "queue.memoryPercent": 45 + (i * 3),
      "queue.diskUsedPercent": 55 + (i * 2),
      "queue.networkRxDropped": 0,
      "queue.networkTxDropped": 0,
      
      // Broker specific
      "brokerId": i,
      "brokerState": "RUNNING",
      "aws.availabilityZone": `us-east-1${String.fromCharCode(96 + i)}`
    });
  }
  
  // 3. Topic Events
  const topics = ['orders', 'payments', 'events', 'logs', 'analytics'];
  topics.forEach((topicName, idx) => {
    events.push({
      "eventType": "MessageQueueSample",
      "timestamp": timestamp + 10 + idx,
      
      "provider": "AwsMsk",
      "collector.name": "cloudwatch-metric-streams",
      
      "queue.name": `${clusterName}-${topicName}`,
      "queue.type": "kafka_topic",
      
      "entity.name": `${clusterName}-${topicName}`,
      "entity.type": "AWSMSKTOPIC",
      
      // Relationships
      "awsAccountId": "123456789012",
      "awsRegion": "us-east-1",
      "awsMskClusterName": clusterName,
      
      // Topic metrics
      "queue.messagesPerSecond": 500 * (idx + 1),
      "queue.bytesInPerSecond": 500000 * (idx + 1),
      "queue.bytesOutPerSecond": 400000 * (idx + 1),
      "queue.consumerLag": 100 * (idx + 1),
      "queue.partitionCount": 10 + (idx * 5),
      "queue.replicationFactor": 3,
      
      // Topic specific
      "topicName": topicName,
      "retentionMs": 604800000,
      "compressionType": "snappy"
    });
  });
  
  // Submit all events
  console.log('📤 Submitting events to light up the UI...\n');
  
  for (const event of events) {
    const result = await submitPayload(event);
    console.log(`✓ ${event['queue.name']}: ${result.status}`);
    
    if (result.status !== 200 && result.status !== 202) {
      console.error(`  Error: ${result.body}`);
    }
  }
  
  console.log(`\n📊 Total events sent: ${events.length}`);
  console.log('\n⏳ Waiting 30 seconds for processing...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  // Comprehensive verification
  console.log('\n🔍 VERIFICATION RESULTS\n');
  
  // 1. Check MessageQueueSample
  const mqQuery = `FROM MessageQueueSample SELECT count(*), uniques(entity.type), uniques(queue.type) WHERE queue.name LIKE '%${clusterName}%' SINCE 5 minutes ago`;
  const mqResults = await runQuery(mqQuery);
  
  console.log('1️⃣ MessageQueueSample Status:');
  if (mqResults[0]?.count > 0) {
    console.log(`   ✅ Events found: ${mqResults[0].count}`);
    console.log(`   Entity types: ${mqResults[0]['uniques.entity.type']?.join(', ')}`);
    console.log(`   Queue types: ${mqResults[0]['uniques.queue.type']?.join(', ')}`);
  } else {
    console.log('   ❌ No events found in MessageQueueSample');
  }
  
  // 2. Check for any MSK events
  const anyMskQuery = `FROM MessageQueueSample SELECT count(*) WHERE provider = 'AwsMsk' SINCE 1 hour ago`;
  const anyMskResults = await runQuery(anyMskQuery);
  console.log(`\n2️⃣ Total AwsMsk events in last hour: ${anyMskResults[0]?.count || 0}`);
  
  // 3. List all queue names
  const queueNamesQuery = `FROM MessageQueueSample SELECT uniques(queue.name) WHERE queue.name LIKE '%${clusterName}%' SINCE 5 minutes ago`;
  const queueNames = await runQuery(queueNamesQuery);
  if (queueNames[0]?.['uniques.queue.name']?.length > 0) {
    console.log(`\n3️⃣ Queue names created:`);
    queueNames[0]['uniques.queue.name'].forEach(name => {
      console.log(`   - ${name}`);
    });
  }
  
  // 4. Check specific metrics
  const metricsQuery = `FROM MessageQueueSample SELECT latest(queue.messagesPerSecond), latest(queue.cpuPercent), latest(queue.consumerLag) WHERE queue.name LIKE '%${clusterName}%' SINCE 5 minutes ago FACET queue.type`;
  const metricsResults = await runQuery(metricsQuery);
  
  if (metricsResults.length > 0) {
    console.log(`\n4️⃣ Metrics by queue type:`);
    metricsResults.forEach(m => {
      console.log(`   ${m.facet[0]}:`);
      console.log(`     Messages/s: ${m['latest.queue.messagesPerSecond'] || 'N/A'}`);
      console.log(`     CPU %: ${m['latest.queue.cpuPercent'] || 'N/A'}`);
      console.log(`     Consumer Lag: ${m['latest.queue.consumerLag'] || 'N/A'}`);
    });
  }
  
  // 5. Direct link to UI
  console.log('\n\n🌐 CHECK THE UI NOW:');
  console.log('====================');
  console.log(`1. Go to: https://one.newrelic.com/nr1-core?account=${process.env.ACC}`);
  console.log('2. Navigate to: Infrastructure > Third-party services > Message queues');
  console.log('3. Look for: AWS MSK in the providers list');
  console.log(`4. Search for: ${clusterName}`);
  
  console.log('\n📋 TROUBLESHOOTING:');
  console.log('===================');
  console.log('If entities are NOT visible:');
  console.log('1. Check if you see "AwsMsk" in the provider filter');
  console.log('2. Try refreshing the page (Ctrl+F5)');
  console.log('3. Check the time range (set to "Last 30 minutes")');
  console.log('4. Try the direct NRQL query below in Query Builder:');
  console.log(`\nFROM MessageQueueSample SELECT * WHERE queue.name LIKE '%${clusterName}%' SINCE 10 minutes ago\n`);
  
  // Save cluster info for follow-up
  const clusterInfo = {
    clusterName,
    timestamp,
    eventsSubmitted: events.length,
    accountId: process.env.ACC
  };
  
  fs.writeFileSync('last-cluster-info.json', JSON.stringify(clusterInfo, null, 2));
  console.log(`\n💾 Cluster info saved to: last-cluster-info.json`);
  console.log('\n✨ Script complete! Check the UI now.');
}

main().catch(console.error);