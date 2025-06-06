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
  console.log('🔍 DEBUG: Why aren\'t MSK entities showing in Message Queues UI?');
  console.log('==============================================================\n');
  
  // Load last cluster info
  let clusterName = 'ui-visible-cluster-1749191778735'; // default
  try {
    const clusterInfo = JSON.parse(fs.readFileSync('last-cluster-info.json', 'utf8'));
    clusterName = clusterInfo.clusterName;
    console.log(`Using cluster: ${clusterName}\n`);
  } catch (e) {
    console.log(`Using default cluster: ${clusterName}\n`);
  }
  
  // 1. Check what providers are visible in UI
  console.log('1️⃣ ALL Message Queue Providers in Account:');
  const providersQuery = `FROM MessageQueueSample SELECT uniques(provider), count(*) FACET provider SINCE 1 day ago`;
  const providers = await runQuery(providersQuery);
  
  if (providers.length > 0) {
    console.log('Provider | Events');
    console.log('---------|--------');
    providers.forEach(p => {
      console.log(`${p.facet[0] || 'NULL'} | ${p.count}`);
    });
  } else {
    console.log('❌ No providers found');
  }
  
  // 2. Compare our events with working events
  console.log('\n2️⃣ Field Comparison - Our MSK vs Any Working Provider:');
  
  // Get our MSK event
  const ourEventQuery = `FROM MessageQueueSample SELECT * WHERE queue.name LIKE '%${clusterName}%' SINCE 1 hour ago LIMIT 1`;
  const ourEvents = await runQuery(ourEventQuery);
  
  // Get any working provider event
  const workingQuery = `FROM MessageQueueSample SELECT * WHERE provider != 'AwsMsk' AND provider IS NOT NULL SINCE 1 day ago LIMIT 1`;
  const workingEvents = await runQuery(workingQuery);
  
  if (ourEvents.length > 0 && workingEvents.length > 0) {
    const ourFields = Object.keys(ourEvents[0]).sort();
    const workingFields = Object.keys(workingEvents[0]).sort();
    
    console.log('\nFields in our MSK events:');
    ourFields.forEach(f => console.log(`  ✓ ${f}: ${typeof ourEvents[0][f]}`));
    
    console.log('\nFields in working events:');
    workingFields.forEach(f => console.log(`  ✓ ${f}: ${typeof workingEvents[0][f]}`));
    
    console.log('\nMissing in our events:');
    workingFields.filter(f => !ourFields.includes(f)).forEach(f => {
      console.log(`  ❌ ${f}`);
    });
    
    console.log('\nExtra in our events:');
    ourFields.filter(f => !workingFields.includes(f)).forEach(f => {
      console.log(`  ➕ ${f}`);
    });
  }
  
  // 3. Check entity.guid format
  console.log('\n3️⃣ Entity GUID Analysis:');
  const guidQuery = `FROM MessageQueueSample SELECT latest(entity.guid), latest(entity.name), latest(entity.type) WHERE queue.name LIKE '%${clusterName}%' SINCE 1 hour ago FACET queue.name LIMIT 10`;
  const guidResults = await runQuery(guidQuery);
  
  if (guidResults.length > 0) {
    guidResults.forEach(r => {
      console.log(`\n${r.facet[0]}:`);
      console.log(`  entity.guid: ${r['latest.entity.guid'] || 'NULL'}`);
      console.log(`  entity.name: ${r['latest.entity.name'] || 'NULL'}`);
      console.log(`  entity.type: ${r['latest.entity.type'] || 'NULL'}`);
    });
  }
  
  // 4. Check if there's a specific integration requirement
  console.log('\n4️⃣ Integration Source Analysis:');
  const sourceQuery = `FROM MessageQueueSample SELECT count(*), uniques(collector.name), uniques(instrumentation.name), uniques(integrationName) FACET provider SINCE 1 day ago`;
  const sourceResults = await runQuery(sourceQuery);
  
  sourceResults.forEach(r => {
    console.log(`\n${r.facet[0]}:`);
    console.log(`  Events: ${r.count}`);
    console.log(`  Collectors: ${r['uniques.collector.name']?.join(', ') || 'None'}`);
    console.log(`  Instrumentation: ${r['uniques.instrumentation.name']?.join(', ') || 'None'}`);
    console.log(`  Integration: ${r['uniques.integrationName']?.join(', ') || 'None'}`);
  });
  
  // 5. Check for any filters or requirements
  console.log('\n5️⃣ Special Requirements Check:');
  
  // Check if providerAccountId is required
  const accountQuery = `FROM MessageQueueSample SELECT count(*), uniques(providerAccountId) FACET provider SINCE 1 day ago`;
  const accountResults = await runQuery(accountQuery);
  
  console.log('\nProvider Account IDs:');
  accountResults.forEach(r => {
    console.log(`  ${r.facet[0]}: ${r['uniques.providerAccountId']?.join(', ') || 'None'}`);
  });
  
  // 6. Try different event type
  console.log('\n6️⃣ Event Type Analysis:');
  const eventTypeQuery = `SELECT count(*), uniques(provider) FROM MessageQueueSample, QueueSample, MessageQueue WHERE provider LIKE '%kafka%' OR provider LIKE '%msk%' SINCE 1 day ago FACET eventType`;
  const eventTypeResults = await runQuery(eventTypeQuery);
  
  if (eventTypeResults.length > 0) {
    console.log('\nEvent types with Kafka/MSK data:');
    eventTypeResults.forEach(r => {
      console.log(`  ${r.facet[0]}: ${r.count} events`);
    });
  }
  
  // 7. Final recommendations
  console.log('\n\n💡 DEBUGGING INSIGHTS:');
  console.log('======================');
  
  // Check if we have any working providers
  const hasWorkingProviders = providers.filter(p => p.facet[0] !== 'AwsMsk' && p.count > 0).length > 0;
  
  if (!hasWorkingProviders) {
    console.log('❌ No working Message Queue providers found in this account');
    console.log('   This might indicate:');
    console.log('   - Message Queues UI requires specific integrations');
    console.log('   - Account might not have the feature enabled');
    console.log('   - Need to use a specific integration (not just Event API)');
  } else {
    console.log('✅ Other providers are working, so the issue is MSK-specific');
    console.log('   Try:');
    console.log('   1. Match the exact field structure of working providers');
    console.log('   2. Check if specific integration is required');
    console.log('   3. Verify account has MSK integration enabled');
  }
  
  // Direct UI check
  console.log('\n🌐 DIRECT UI CHECK:');
  console.log('==================');
  console.log('1. In New Relic UI, go to Query Builder');
  console.log('2. Run this query:');
  console.log(`\nFROM MessageQueueSample SELECT * WHERE provider = 'AwsMsk' SINCE 1 hour ago LIMIT 10\n`);
  console.log('3. If you see data here but not in Message Queues UI, it confirms');
  console.log('   that the UI has additional requirements beyond just MessageQueueSample events.');
}

main().catch(console.error);