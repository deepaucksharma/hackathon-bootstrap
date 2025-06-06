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

async function main() {
  console.log('🔬 MATCH WORKING PROVIDER STRUCTURE');
  console.log('===================================\n');
  
  // First, let's get the full provider name and a sample event
  const sampleQuery = `FROM MessageQueueSample SELECT * WHERE provider != 'AwsMsk' AND provider IS NOT NULL SINCE 1 day ago LIMIT 1`;
  const sampleResults = await runQuery(sampleQuery);
  
  if (sampleResults.length === 0) {
    console.log('❌ No working provider found to match');
    return;
  }
  
  const workingEvent = sampleResults[0];
  const workingProvider = workingEvent.provider;
  
  console.log(`✅ Found working provider: ${workingProvider}`);
  console.log('\n📋 Working Event Structure:');
  console.log('==========================');
  
  // Display all fields from working event
  Object.keys(workingEvent).sort().forEach(key => {
    if (key !== 'timestamp') {
      console.log(`${key}: ${JSON.stringify(workingEvent[key])}`);
    }
  });
  
  // Now create a matching event for MSK
  const timestamp = Date.now();
  const clusterName = `match-test-${timestamp}`;
  
  console.log('\n\n🎯 Creating Matching MSK Event...\n');
  
  // Build event matching the working structure
  const matchingEvent = {
    "eventType": "MessageQueueSample",
    "timestamp": timestamp,
    "provider": workingProvider // First test: use the SAME provider name
  };
  
  // Copy all non-timestamp fields from working event
  Object.keys(workingEvent).forEach(key => {
    if (key !== 'timestamp' && key !== 'provider') {
      // Replace queue/entity names with our test names
      if (key === 'queue.name' || key === 'entity.name') {
        matchingEvent[key] = clusterName;
      } else if (key === 'entity.type' && workingEvent[key].includes('KAFKA')) {
        matchingEvent[key] = 'AWSMSKCLUSTER';
      } else {
        matchingEvent[key] = workingEvent[key];
      }
    }
  });
  
  // Submit with working provider name
  console.log(`📤 Test 1: Using provider="${workingProvider}"`);
  let result = await submitPayload(matchingEvent);
  console.log(`Status: ${result.status}`);
  
  // Now try with AwsMsk but exact same structure
  matchingEvent.provider = 'AwsMsk';
  console.log(`\n📤 Test 2: Using provider="AwsMsk" with same structure`);
  result = await submitPayload(matchingEvent);
  console.log(`Status: ${result.status}`);
  
  // Try different provider variations
  const providerVariations = [
    'AWS/Kafka',
    'aws-msk',
    'AWS_MSK',
    'Kafka',
    'kafka',
    'AmazonMSK'
  ];
  
  console.log('\n📤 Test 3: Trying provider variations...');
  for (const provider of providerVariations) {
    matchingEvent.provider = provider;
    matchingEvent['queue.name'] = `${clusterName}-${provider.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    result = await submitPayload(matchingEvent);
    console.log(`  ${provider}: ${result.status}`);
  }
  
  // Wait and check
  console.log('\n⏳ Waiting 30s...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  // Check results
  console.log('\n🔍 Checking which providers show up...\n');
  
  const checkQuery = `FROM MessageQueueSample SELECT count(*), uniques(queue.name) WHERE queue.name LIKE '%${clusterName}%' SINCE 5 minutes ago FACET provider`;
  const checkResults = await runQuery(checkQuery);
  
  console.log('Provider | Events | Queue Names');
  console.log('---------|--------|-------------');
  checkResults.forEach(r => {
    console.log(`${r.facet[0]} | ${r.count} | ${r['uniques.queue.name']?.join(', ')}`);
  });
  
  // Get all unique providers in the account
  console.log('\n\n📊 ALL Providers in MessageQueueSample:');
  const allProvidersQuery = `FROM MessageQueueSample SELECT count(*) FACET provider SINCE 7 days ago`;
  const allProviders = await runQuery(allProvidersQuery);
  
  console.log('\nProvider | Total Events (7 days)');
  console.log('---------|--------------------');
  allProviders.forEach(p => {
    console.log(`${p.facet[0] || 'NULL'} | ${p.count}`);
  });
  
  console.log('\n\n💡 KEY FINDINGS:');
  console.log('================');
  console.log(`1. Working provider "${workingProvider}" has specific structure`);
  console.log('2. Check which provider variations were accepted above');
  console.log('3. The UI might be filtering by specific provider values');
  console.log('\n🎯 NEXT STEP: Use the provider name that shows the most events');
}

main().catch(console.error);