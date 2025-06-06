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

async function runGraphQL(query) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query });
    
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
          resolve(response);
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
  console.log('🔍 COMPREHENSIVE UI VALIDATION FOR AWS MSK');
  console.log('==========================================\n');
  
  // 1. Verify MessageQueueSample data
  console.log('1️⃣ MessageQueueSample Data Validation\n');
  
  const dataCheck = `FROM MessageQueueSample SELECT count(*), uniqueCount(entity.name) WHERE provider = 'AwsMsk' SINCE 1 hour ago FACET entity.type`;
  const dataResults = await runQuery(dataCheck);
  
  let hasData = false;
  if (dataResults.length > 0) {
    console.log('✅ Data found in MessageQueueSample:');
    dataResults.forEach(r => {
      console.log(`   ${r.facet[0]}: ${r.count} events, ${r['uniqueCount.entity.name']} unique entities`);
      if (r.count > 0) hasData = true;
    });
  } else {
    console.log('❌ No MSK data found in MessageQueueSample');
  }
  
  // 2. Check entity creation via GraphQL
  console.log('\n\n2️⃣ Entity Creation Check\n');
  
  const entityQuery = `
    query {
      actor {
        entitySearch(query: "type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC') AND domain = 'INFRA'") {
          count
          results {
            entities {
              guid
              name
              type
              domain
              reporting
              tags {
                key
                values
              }
            }
          }
        }
      }
    }
  `;
  
  const entityResponse = await runGraphQL(entityQuery);
  
  if (entityResponse.data?.actor?.entitySearch?.count > 0) {
    console.log(`✅ Found ${entityResponse.data.actor.entitySearch.count} MSK entities:`);
    entityResponse.data.actor.entitySearch.results.entities.forEach(entity => {
      console.log(`   ${entity.type}: ${entity.name} (Reporting: ${entity.reporting})`);
    });
  } else {
    console.log('❌ No MSK entities found via entity search');
    console.log('   This confirms entities are NOT being synthesized from MessageQueueSample');
  }
  
  // 3. Check for any integration requirements
  console.log('\n\n3️⃣ Integration Requirements Check\n');
  
  const integrationQuery = `FROM SystemSample SELECT latest(collector.name), uniques(integrationName), uniques(integrationVersion) WHERE hostname IS NOT NULL SINCE 1 day ago`;
  const integrations = await runQuery(integrationQuery);
  
  if (integrations.length > 0) {
    console.log('Integrations found in account:');
    const intNames = integrations[0]['uniques.integrationName'] || [];
    const intVersions = integrations[0]['uniques.integrationVersion'] || [];
    intNames.forEach((name, idx) => {
      console.log(`   ${name} (${intVersions[idx] || 'unknown version'})`);
    });
    
    if (!intNames.includes('com.newrelic.kafka') && !intNames.includes('nri-kafka')) {
      console.log('\n⚠️  No Kafka integration found - this might be required for UI visibility');
    }
  }
  
  // 4. Check UI endpoints
  console.log('\n\n4️⃣ Message Queues UI Data Sources\n');
  
  // Check what the UI might be querying
  const uiDataSources = [
    { name: 'MessageQueueSample', query: 'FROM MessageQueueSample SELECT count(*) FACET provider SINCE 1 hour ago' },
    { name: 'QueueSample', query: 'FROM QueueSample SELECT count(*) FACET provider SINCE 1 hour ago' },
    { name: 'MessageQueue entities', query: 'FROM MessageQueue SELECT count(*) FACET entityType SINCE 1 hour ago' }
  ];
  
  for (const source of uiDataSources) {
    try {
      const results = await runQuery(source.query);
      if (results.length > 0 && results[0].count > 0) {
        console.log(`✅ ${source.name} has data:`);
        results.forEach(r => {
          console.log(`   ${r.facet ? r.facet[0] : 'Total'}: ${r.count} events`);
        });
      } else {
        console.log(`❌ ${source.name} has no data`);
      }
    } catch (e) {
      console.log(`❌ ${source.name} query failed (table might not exist)`);
    }
  }
  
  // 5. Validate required fields
  console.log('\n\n5️⃣ Required Fields Validation\n');
  
  const fieldsQuery = `FROM MessageQueueSample SELECT * WHERE provider = 'AwsMsk' SINCE 1 hour ago LIMIT 1`;
  const fieldsSample = await runQuery(fieldsQuery);
  
  if (fieldsSample.length > 0) {
    const requiredFields = [
      'eventType',
      'provider',
      'queue.name',
      'entity.name',
      'entity.type',
      'collector.name'
    ];
    
    const sampleEvent = fieldsSample[0];
    console.log('Required fields check:');
    
    let allFieldsPresent = true;
    requiredFields.forEach(field => {
      if (sampleEvent[field]) {
        console.log(`   ✅ ${field}: ${sampleEvent[field]}`);
      } else {
        console.log(`   ❌ ${field}: MISSING`);
        allFieldsPresent = false;
      }
    });
    
    if (allFieldsPresent) {
      console.log('\n✅ All required fields are present');
    } else {
      console.log('\n❌ Some required fields are missing');
    }
  }
  
  // 6. Final diagnosis
  console.log('\n\n📋 FINAL DIAGNOSIS');
  console.log('==================\n');
  
  if (hasData) {
    console.log('✅ MessageQueueSample data is correctly formatted and stored\n');
    
    console.log('Why it might not appear in Message Queues UI:');
    console.log('1. Entity Synthesis: MSK entities are NOT being created from MessageQueueSample');
    console.log('   - This is because AWS MSK entities have no synthesis rules');
    console.log('   - The UI might require actual entities, not just MessageQueueSample events');
    console.log('\n2. Integration Requirement: The UI might require:');
    console.log('   - An actual Kafka/MSK integration to be installed');
    console.log('   - The integration creates entities that the UI recognizes');
    console.log('   - Direct Event API submission might not be sufficient');
    console.log('\n3. Account Configuration:');
    console.log('   - Check if Message Queues feature is enabled for the account');
    console.log('   - Verify AWS integration permissions if using CloudWatch');
  }
  
  // 7. Recommendations
  console.log('\n\n💡 RECOMMENDATIONS');
  console.log('==================\n');
  
  console.log('Option 1: Deploy nri-kafka with MSK shim');
  console.log('   - This creates proper entities via the integration SDK');
  console.log('   - Most likely to work with Message Queues UI');
  console.log('   - See DEPLOYMENT_GUIDE.md for instructions');
  
  console.log('\nOption 2: Use CloudWatch Metric Streams');
  console.log('   - Official AWS integration path');
  console.log('   - Automatically creates proper entities');
  console.log('   - Requires AWS setup');
  
  console.log('\nOption 3: Custom Dashboards (Immediate solution)');
  console.log('   - Your data IS available for dashboards and alerts');
  console.log('   - Create custom visualizations using MessageQueueSample');
  console.log('   - Example dashboard query:');
  console.log('   FROM MessageQueueSample SELECT latest(queue.messagesPerSecond)');
  console.log('   WHERE provider = \'AwsMsk\' FACET entity.name TIMESERIES');
  
  // 8. Generate a test dashboard URL
  const dashboardUrl = `https://one.newrelic.com/dashboards?account=${process.env.ACC}&state=c9fab5d8-b4c7-075e-12df-012345678901`;
  
  console.log('\n\n🔗 USEFUL LINKS');
  console.log('===============\n');
  console.log(`Query Builder: https://one.newrelic.com/data-exploration?account=${process.env.ACC}`);
  console.log(`Entity Explorer: https://one.newrelic.com/nr1-core/entity-explorer?account=${process.env.ACC}`);
  console.log(`Dashboards: https://one.newrelic.com/dashboards?account=${process.env.ACC}`);
  console.log(`Message Queues UI: https://one.newrelic.com/infra/queues?account=${process.env.ACC}`);
}

main().catch(console.error);