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
  console.log('🔍 Analyzing working Kafka clusters...\n');
  
  // Get details about standard Kafka clusters
  console.log('Standard Kafka clusters found:');
  const clusterQuery = `FROM KafkaBrokerSample SELECT latest(collector.name), latest(instrumentation.name), count(*), latest(entity.guid), latest(entity.name) FACET clusterName SINCE 1 hour ago LIMIT 10`;
  const clusters = await runQuery(clusterQuery);
  
  clusters.forEach(c => {
    console.log(`\nCluster: ${c.facet[0]}`);
    console.log(`  Events: ${c.count}`);
    console.log(`  collector.name: ${c['latest.collector.name'] || 'NULL'}`);
    console.log(`  instrumentation.name: ${c['latest.instrumentation.name'] || 'NULL'}`);
    console.log(`  entity.guid: ${c['latest.entity.guid'] ? 'Present' : 'Missing'}`);
    console.log(`  entity.name: ${c['latest.entity.name'] || 'NULL'}`);
  });
  
  // Check if these appear in Message Queues
  console.log('\n\nChecking MessageQueueSample for standard Kafka...');
  const mqQuery = `FROM MessageQueueSample SELECT count(*), uniques(entity.name), uniques(provider), uniques(collector.name) WHERE entity.name LIKE '%kafka%' SINCE 1 day ago`;
  const mqResults = await runQuery(mqQuery);
  
  if (mqResults[0]?.count > 0) {
    console.log(`✅ Found ${mqResults[0].count} Kafka events in MessageQueueSample`);
    console.log(`Entities: ${mqResults[0]['uniques.entity.name']?.join(', ')}`);
    console.log(`Providers: ${mqResults[0]['uniques.provider']?.join(', ')}`);
    console.log(`Collectors: ${mqResults[0]['uniques.collector.name']?.join(', ')}`);
  } else {
    console.log('❌ No Kafka entities in MessageQueueSample');
  }
  
  // Check AWS MSK data structure
  console.log('\n\nAnalyzing AWS MSK data structure...');
  const mskQuery = `FROM AwsMskBrokerSample SELECT * WHERE clusterName LIKE 'cw-test%' OR clusterName LIKE 'complete%' SINCE 1 hour ago LIMIT 1`;
  const mskData = await runQuery(mskQuery);
  
  if (mskData.length > 0) {
    console.log('Sample MSK event fields:');
    const event = mskData[0];
    Object.keys(event).sort().forEach(key => {
      if (key !== 'timestamp' && event[key] !== null) {
        console.log(`  ${key}: ${typeof event[key] === 'object' ? JSON.stringify(event[key]) : event[key]}`);
      }
    });
  }
  
  // Compare with standard Kafka structure
  console.log('\n\nComparing with standard Kafka data structure...');
  const stdQuery = `FROM KafkaBrokerSample SELECT * WHERE clusterName IS NOT NULL SINCE 1 hour ago LIMIT 1`;
  const stdData = await runQuery(stdQuery);
  
  if (stdData.length > 0) {
    console.log('Sample standard Kafka event fields:');
    const event = stdData[0];
    const importantFields = ['collector.name', 'entity.guid', 'entity.name', 'entity.type', 'instrumentation.name', 'instrumentation.provider', 'provider'];
    importantFields.forEach(key => {
      if (event[key] !== undefined) {
        console.log(`  ${key}: ${event[key]}`);
      }
    });
  }
}

main().catch(console.error);