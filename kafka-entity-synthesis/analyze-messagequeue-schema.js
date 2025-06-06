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
  console.log('🔍 Analyzing MessageQueueSample Schema');
  console.log('======================================\n');
  
  // First, check if there are ANY MessageQueueSample events
  console.log('1. Checking for ANY MessageQueueSample events...');
  const countQuery = `FROM MessageQueueSample SELECT count(*), uniques(provider) SINCE 7 days ago`;
  const countResults = await runQuery(countQuery);
  
  if (countResults[0]?.count === 0) {
    console.log('❌ No MessageQueueSample events found in this account');
    console.log('\nTrying to find accounts with MessageQueueSample data...');
    
    // Look for any queue-related metrics
    const queueQuery = `FROM AwsMskTopicSample SELECT count(*), uniques(eventType) WHERE topic.name IS NOT NULL SINCE 7 days ago`;
    const queueResults = await runQuery(queueQuery);
    console.log(`\nAwsMskTopicSample events: ${queueResults[0]?.count || 0}`);
    
    return;
  }
  
  console.log(`✅ Found ${countResults[0].count} MessageQueueSample events`);
  console.log(`Providers: ${countResults[0]['uniques.provider']?.join(', ')}`);
  
  // Get a sample event to analyze structure
  console.log('\n2. Analyzing MessageQueueSample structure...');
  const sampleQuery = `FROM MessageQueueSample SELECT * SINCE 7 days ago LIMIT 1`;
  const sampleResults = await runQuery(sampleQuery);
  
  if (sampleResults.length > 0) {
    const event = sampleResults[0];
    console.log('\nKey fields found:');
    
    // Group fields by category
    const queueFields = [];
    const entityFields = [];
    const providerFields = [];
    const metricFields = [];
    const otherFields = [];
    
    Object.keys(event).forEach(key => {
      if (key.startsWith('queue.')) queueFields.push(key);
      else if (key.startsWith('entity.')) entityFields.push(key);
      else if (key.startsWith('provider.') || key === 'provider') providerFields.push(key);
      else if (key.includes('PerSecond') || key.includes('Count') || key.includes('Size')) metricFields.push(key);
      else if (key !== 'timestamp') otherFields.push(key);
    });
    
    console.log('\n📌 Queue fields:');
    queueFields.forEach(field => {
      console.log(`  ${field}: ${event[field]}`);
    });
    
    console.log('\n📌 Entity fields:');
    entityFields.forEach(field => {
      console.log(`  ${field}: ${event[field]}`);
    });
    
    console.log('\n📌 Provider fields:');
    providerFields.forEach(field => {
      console.log(`  ${field}: ${event[field]}`);
    });
    
    console.log('\n📌 Other important fields:');
    otherFields.forEach(field => {
      console.log(`  ${field}: ${event[field]}`);
    });
  }
  
  // Check what makes a queue visible
  console.log('\n3. Analyzing queue visibility requirements...');
  const visibilityQuery = `FROM MessageQueueSample SELECT uniques(queue.name), uniques(entity.name), count(*) FACET provider SINCE 1 day ago LIMIT 20`;
  const visibilityResults = await runQuery(visibilityQuery);
  
  console.log('\nQueues by provider:');
  visibilityResults.forEach(result => {
    console.log(`\n${result.facet[0]}:`);
    console.log(`  Events: ${result.count}`);
    console.log(`  Queue names: ${result['uniques.queue.name']?.slice(0, 3).join(', ')}...`);
    console.log(`  Entity names: ${result['uniques.entity.name']?.slice(0, 3).join(', ')}...`);
  });
  
  // Check if there's a specific pattern for Kafka
  console.log('\n4. Looking for Kafka-specific patterns...');
  const kafkaQuery = `FROM MessageQueueSample SELECT * WHERE provider LIKE '%kafka%' OR provider LIKE '%Kafka%' OR queue.name LIKE '%kafka%' SINCE 7 days ago LIMIT 1`;
  const kafkaResults = await runQuery(kafkaQuery);
  
  if (kafkaResults.length > 0) {
    console.log('✅ Found Kafka queue example!');
    const event = kafkaResults[0];
    console.log('\nKafka MessageQueueSample structure:');
    Object.keys(event).sort().forEach(key => {
      if (event[key] !== null && key !== 'timestamp') {
        console.log(`  ${key}: ${event[key]}`);
      }
    });
  } else {
    console.log('❌ No Kafka queues found in MessageQueueSample');
  }
  
  // Summary of requirements
  console.log('\n\n📋 KEY INSIGHTS');
  console.log('================');
  console.log('MessageQueueSample requires:');
  console.log('1. queue.name field (critical for UI display)');
  console.log('2. entity.name and entity.guid fields');
  console.log('3. provider field matching known providers');
  console.log('4. Proper collector.name or instrumentation setup');
  console.log('\n💡 The missing piece might be the queue.name field!');
}

main().catch(console.error);