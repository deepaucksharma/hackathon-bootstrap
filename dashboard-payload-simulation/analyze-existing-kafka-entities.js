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
  console.log('🔍 Analyzing Existing Kafka Entities');
  console.log('====================================\n');
  
  // First, find a working Kafka cluster
  console.log('1. Finding existing Kafka clusters...');
  const clusterQuery = `FROM KafkaBrokerSample SELECT uniques(clusterName), count(*) FACET clusterName SINCE 1 day ago LIMIT 10`;
  const clusters = await runQuery(clusterQuery);
  
  if (clusters.length === 0) {
    console.log('❌ No Kafka clusters found');
    return;
  }
  
  const workingCluster = clusters[0].facet[0];
  console.log(`\n✅ Found ${clusters.length} clusters`);
  console.log(`📊 Analyzing cluster: ${workingCluster}\n`);
  
  // Get detailed info about this cluster
  console.log('2. Analyzing broker event structure...');
  const brokerQuery = `FROM KafkaBrokerSample SELECT * WHERE clusterName = '${workingCluster}' SINCE 1 hour ago LIMIT 1`;
  const brokerData = await runQuery(brokerQuery);
  
  if (brokerData.length > 0) {
    const event = brokerData[0];
    console.log('\nKey fields present:');
    const importantFields = [
      'collector.name',
      'instrumentation.name',
      'instrumentation.provider',
      'instrumentation.source',
      'provider',
      'entity.guid',
      'entity.name',
      'entity.type',
      'entityKey',
      'nr.entityType',
      'integrationName',
      'integrationVersion',
      'reportingAgent',
      'reportingEndpoint'
    ];
    
    importantFields.forEach(field => {
      if (event[field] !== undefined && event[field] !== null) {
        console.log(`  ${field}: ${event[field]}`);
      }
    });
    
    // Check for any special attributes
    console.log('\nAdditional attributes:');
    const standardFields = new Set(['timestamp', 'clusterName', 'brokerId', 'brokerDisplayName']);
    Object.keys(event).forEach(key => {
      if (!standardFields.has(key) && !key.startsWith('broker.') && !importantFields.includes(key)) {
        console.log(`  ${key}: ${typeof event[key] === 'object' ? JSON.stringify(event[key]) : event[key]}`);
      }
    });
  }
  
  // Check entity relationships
  console.log('\n3. Checking entity relationships...');
  const relationQuery = `FROM Relationship SELECT * WHERE sourceEntityGuid IN (FROM KafkaBrokerSample SELECT uniques(entity.guid) WHERE clusterName = '${workingCluster}' SINCE 1 day ago LIMIT 1) OR targetEntityGuid IN (FROM KafkaBrokerSample SELECT uniques(entity.guid) WHERE clusterName = '${workingCluster}' SINCE 1 day ago LIMIT 1) SINCE 1 day ago LIMIT 10`;
  const relations = await runQuery(relationQuery);
  
  if (relations.length > 0) {
    console.log(`Found ${relations.length} relationships`);
    relations.forEach(rel => {
      console.log(`  ${rel.relationshipType}: ${rel.sourceEntityType} → ${rel.targetEntityType}`);
    });
  } else {
    console.log('No relationships found');
  }
  
  // Check how these entities appear in MessageQueueSample
  console.log('\n4. Checking MessageQueueSample...');
  const mqQuery = `FROM MessageQueueSample SELECT * WHERE entity.name LIKE '%${workingCluster}%' OR queue.name LIKE '%${workingCluster}%' SINCE 1 day ago LIMIT 1`;
  const mqData = await runQuery(mqQuery);
  
  if (mqData.length > 0) {
    console.log('✅ Found in MessageQueueSample!');
    const event = mqData[0];
    console.log('\nMessageQueueSample structure:');
    Object.keys(event).sort().forEach(key => {
      if (event[key] !== null && key !== 'timestamp') {
        console.log(`  ${key}: ${typeof event[key] === 'object' ? JSON.stringify(event[key]) : event[key]}`);
      }
    });
  } else {
    console.log('❌ Not found in MessageQueueSample');
  }
  
  // Check if there's a specific integration configuration
  console.log('\n5. Checking integration configuration...');
  const configQuery = `FROM SystemSample SELECT latest(collector.name), latest(hostname), uniques(collector.name) WHERE entityGuid IN (FROM KafkaBrokerSample SELECT uniques(entity.guid) WHERE clusterName = '${workingCluster}' SINCE 1 day ago LIMIT 1) SINCE 1 day ago`;
  const configData = await runQuery(configQuery);
  
  if (configData.length > 0) {
    console.log('System configuration:');
    console.log(`  Collectors: ${configData[0]['uniques.collector.name']?.join(', ')}`);
    console.log(`  Hostname: ${configData[0]['latest.hostname']}`);
  }
  
  // Summary
  console.log('\n\n📋 SUMMARY');
  console.log('===========');
  console.log('The working Kafka entities have:');
  console.log('1. Standard event types (KafkaBrokerSample)');
  console.log('2. Specific collector/instrumentation names');
  console.log('3. Entity GUIDs and types are generated');
  console.log('4. May require specific integration setup');
  
  console.log('\n💡 Key insight: The presence in MessageQueueSample seems to require');
  console.log('   proper integration setup, not just event submission.');
}

main().catch(console.error);