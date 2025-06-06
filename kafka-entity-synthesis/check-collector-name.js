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
  console.log('🔍 Checking recent AwsMskBrokerSample events...\n');
  
  // Get recent events
  const query = `FROM AwsMskBrokerSample SELECT latest(collector.name), latest(provider), count(*), uniques(entityName), latest(timestamp) SINCE 1 hour ago LIMIT 10`;
  const results = await runQuery(query);
  
  console.log('Recent events:');
  results.forEach(r => {
    console.log(`  Entity: ${r['uniques.entityName']?.[0] || 'N/A'}`);
    console.log(`  collector.name: ${r['latest.collector.name'] || 'NULL'}`);
    console.log(`  provider: ${r['latest.provider'] || 'NULL'}`);
    console.log(`  count: ${r.count}`);
    console.log('---');
  });
  
  // Check MessageQueueSample
  console.log('\nChecking MessageQueueSample...');
  const uiQuery = `FROM MessageQueueSample SELECT count(*), uniques(provider), uniques(entity.name) WHERE provider = 'AwsMsk' SINCE 1 hour ago`;
  const uiResults = await runQuery(uiQuery);
  
  if (uiResults[0]?.count > 0) {
    console.log(`✅ Found ${uiResults[0].count} events in MessageQueueSample`);
    console.log(`Entities: ${uiResults[0]['uniques.entity.name']?.join(', ')}`);
  } else {
    console.log('❌ No events in MessageQueueSample');
  }
}

main().catch(console.error);