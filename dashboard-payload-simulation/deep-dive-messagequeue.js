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
  console.log('🔍 DEEP DIVE: MessageQueueSample Analysis');
  console.log('=========================================\n');
  
  // 1. Get raw sample of ANY MessageQueueSample event
  console.log('1️⃣ Raw MessageQueueSample Event (ANY provider):');
  const rawQuery = `FROM MessageQueueSample SELECT * SINCE 7 days ago LIMIT 1`;
  const rawResults = await runQuery(rawQuery);
  
  if (rawResults.length > 0) {
    console.log('\nRaw event:');
    console.log(JSON.stringify(rawResults[0], null, 2));
  } else {
    console.log('❌ No MessageQueueSample events found at all');
  }
  
  // 2. Check what that provider "A" really is
  console.log('\n\n2️⃣ Investigating Provider "A":');
  const providerAQuery = `FROM MessageQueueSample SELECT provider, queue.name, entity.type, collector.name WHERE provider = 'A' OR provider LIKE 'A%' SINCE 7 days ago LIMIT 5`;
  const providerA = await runQuery(providerAQuery);
  
  if (providerA.length > 0) {
    console.log('Found events with provider starting with "A":');
    providerA.forEach((event, idx) => {
      console.log(`\nEvent ${idx + 1}:`);
      console.log(`  provider: "${event.provider}"`);
      console.log(`  queue.name: ${event['queue.name']}`);
      console.log(`  entity.type: ${event['entity.type']}`);
      console.log(`  collector.name: ${event['collector.name']}`);
    });
  }
  
  // 3. Get exact provider values (including potential truncation)
  console.log('\n\n3️⃣ All Unique Provider Values:');
  const uniqueProvidersQuery = `FROM MessageQueueSample SELECT uniques(provider) SINCE 7 days ago`;
  const uniqueProviders = await runQuery(uniqueProvidersQuery);
  
  if (uniqueProviders[0]?.['uniques.provider']) {
    console.log('Providers found:');
    uniqueProviders[0]['uniques.provider'].forEach(p => {
      console.log(`  - "${p}"`);
    });
  }
  
  // 4. Check our MSK events
  console.log('\n\n4️⃣ Our MSK Events Analysis:');
  const mskQuery = `FROM MessageQueueSample SELECT provider, queue.name, entity.type, entity.name, queue.type WHERE provider = 'AwsMsk' SINCE 1 hour ago LIMIT 5`;
  const mskResults = await runQuery(mskQuery);
  
  if (mskResults.length > 0) {
    console.log('Our MSK events:');
    mskResults.forEach((event, idx) => {
      console.log(`\nEvent ${idx + 1}:`);
      Object.keys(event).forEach(key => {
        console.log(`  ${key}: ${event[key]}`);
      });
    });
  } else {
    console.log('❌ No AwsMsk events found');
  }
  
  // 5. Check if there's a specific account or integration requirement
  console.log('\n\n5️⃣ Account and Integration Analysis:');
  const accountQuery = `FROM MessageQueueSample SELECT count(*), uniques(providerAccountId), uniques(providerAccountName) FACET provider SINCE 7 days ago`;
  const accountResults = await runQuery(accountQuery);
  
  if (accountResults.length > 0) {
    console.log('Provider Account Details:');
    accountResults.forEach(r => {
      console.log(`\n${r.facet[0]}:`);
      console.log(`  Events: ${r.count}`);
      console.log(`  Account IDs: ${r['uniques.providerAccountId']?.join(', ') || 'None'}`);
      console.log(`  Account Names: ${r['uniques.providerAccountName']?.join(', ') || 'None'}`);
    });
  }
  
  // 6. Check for any special fields that might be required
  console.log('\n\n6️⃣ Required Fields Analysis:');
  
  // Get all fields from working provider
  const fieldsQuery = `FROM MessageQueueSample SELECT keyset() WHERE provider != 'AwsMsk' SINCE 7 days ago LIMIT 1`;
  const fieldsResults = await runQuery(fieldsQuery);
  
  // Get all fields from our MSK events  
  const mskFieldsQuery = `FROM MessageQueueSample SELECT keyset() WHERE provider = 'AwsMsk' SINCE 1 hour ago LIMIT 1`;
  const mskFieldsResults = await runQuery(mskFieldsQuery);
  
  if (fieldsResults.length > 0 && mskFieldsResults.length > 0) {
    const workingFields = fieldsResults[0]['keyset()'] || [];
    const mskFields = mskFieldsResults[0]['keyset()'] || [];
    
    console.log('\nFields in working provider but NOT in our MSK:');
    workingFields.filter(f => !mskFields.includes(f)).forEach(f => {
      console.log(`  ❌ ${f}`);
    });
  }
  
  // 7. Final check - is the UI looking for specific event patterns?
  console.log('\n\n7️⃣ UI Visibility Pattern Check:');
  
  // Check if there's a pattern in queue.name or entity.name
  const patternQuery = `FROM MessageQueueSample SELECT count(*) WHERE queue.name IS NOT NULL FACET capture(queue.name, r'^([^-]+)') as 'prefix' SINCE 7 days ago LIMIT 10`;
  const patternResults = await runQuery(patternQuery);
  
  if (patternResults.length > 0) {
    console.log('\nQueue name patterns:');
    patternResults.forEach(r => {
      console.log(`  ${r.facet[0]}: ${r.count} events`);
    });
  }
  
  console.log('\n\n🎯 FINAL DIAGNOSIS:');
  console.log('==================');
  console.log('Based on the analysis above, the issue might be:');
  console.log('1. The provider value must match exactly what the UI expects');
  console.log('2. There might be required fields we\'re missing');
  console.log('3. The UI might require a specific integration to be installed');
  console.log('\n📌 Check the raw event structure above and compare with our events');
}

main().catch(console.error);