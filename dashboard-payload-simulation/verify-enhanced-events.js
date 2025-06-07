const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load environment
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+?)[=:](.*)/)
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        process.env[key] = value;
      }
    });
  }
}

async function runQuery(query, accountId, apiKey) {
  const graphqlQuery = {
    query: `
      {
        actor {
          account(id: ${accountId}) {
            nrql(query: "${query.replace(/"/g, '\\"')}") {
              results
            }
          }
        }
      }
    `
  };
  
  try {
    const response = await axios.post(
      'https://api.newrelic.com/graphql',
      graphqlQuery,
      {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': apiKey
        }
      }
    );
    
    return response.data?.data?.actor?.account?.nrql?.results || [];
  } catch (error) {
    console.error('Query error:', error.message);
    return [];
  }
}

async function verify() {
  loadEnv();
  
  const accountId = process.env.ACC || process.env.NR_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NR_USER_KEY;
  const clusterName = 'enhanced-cluster-1749259099359';
  
  console.log('🔍 Verifying Enhanced Events');
  console.log('============================\n');
  
  // Check events
  console.log('1️⃣ Checking enhanced events...');
  const eventsQuery = `FROM AwsMskBrokerSample SELECT count(*), uniques(provider), uniques(providerAccountName), uniques(integrationName) WHERE provider.clusterName = '${clusterName}' SINCE 10 minutes ago`;
  const events = await runQuery(eventsQuery, accountId, apiKey);
  
  if (events.length > 0 && events[0].count > 0) {
    console.log(`✅ Found ${events[0].count} enhanced events`);
    console.log(`   Provider: ${events[0]['uniques.provider'].join(', ')}`);
    console.log(`   Account Name: ${events[0]['uniques.providerAccountName'].join(', ')}`);
    console.log(`   Integration: ${events[0]['uniques.integrationName'].join(', ')}`);
    
    // Get one event to check all fields
    const sampleQuery = `FROM AwsMskBrokerSample SELECT * WHERE provider.clusterName = '${clusterName}' LIMIT 1 SINCE 10 minutes ago`;
    const sample = await runQuery(sampleQuery, accountId, apiKey);
    
    if (sample.length > 0) {
      console.log('\n   Key fields present:');
      const keyFields = ['entityGuid', 'entity.guid', 'providerAccountName', 'providerExternalId', 'integrationName', 'integrationVersion'];
      keyFields.forEach(field => {
        console.log(`   ${field}: ${sample[0][field] ? '✅' : '❌'}`);
      });
    }
  } else {
    console.log('❌ No enhanced events found');
  }
  
  // Check entities
  console.log('\n\n2️⃣ Checking for entity creation...');
  const entityQuery = `FROM Entity SELECT count(*), uniques(type), uniques(name) WHERE name LIKE '%${clusterName}%' SINCE 10 minutes ago`;
  const entities = await runQuery(entityQuery, accountId, apiKey);
  
  if (entities.length > 0 && entities[0].count > 0) {
    console.log(`✅ ENTITIES CREATED\! Count: ${entities[0].count}`);
    console.log(`   Types: ${entities[0]['uniques.type'].join(', ')}`);
    console.log(`   Names: ${entities[0]['uniques.name'].join(', ')}`);
    console.log('\n🎉 SUCCESS\! Check the Message Queues UI now\!');
  } else {
    console.log('❌ No entities created yet');
    
    // Check if entity synthesis might be delayed
    console.log('\n3️⃣ Checking entity synthesis delay...');
    const delayQuery = `FROM AwsMskBrokerSample SELECT min(timestamp), max(timestamp) WHERE provider.clusterName = '${clusterName}' SINCE 10 minutes ago`;
    const delay = await runQuery(delayQuery, accountId, apiKey);
    
    if (delay.length > 0) {
      const minTime = new Date(delay[0]['min.timestamp']);
      const maxTime = new Date(delay[0]['max.timestamp']);
      const now = new Date();
      const timeSinceFirst = Math.round((now - minTime) / 1000);
      
      console.log(`   First event: ${minTime.toISOString()}`);
      console.log(`   Time elapsed: ${timeSinceFirst} seconds`);
      
      if (timeSinceFirst < 300) {
        console.log('   ⏳ Entity synthesis can take up to 5 minutes. Keep waiting...');
      } else {
        console.log('   ❌ More than 5 minutes have passed. Entity synthesis likely failed.');
      }
    }
  }
  
  // Final check - are ANY entities being created in this account?
  console.log('\n\n4️⃣ Checking overall entity creation in account...');
  const anyEntitiesQuery = `FROM Entity SELECT count(*), uniques(type) WHERE type LIKE 'AWS%' SINCE 1 hour ago`;
  const anyEntities = await runQuery(anyEntitiesQuery, accountId, apiKey);
  
  if (anyEntities.length > 0 && anyEntities[0].count > 0) {
    console.log(`📊 Other AWS entities in account: ${anyEntities[0].count}`);
    console.log(`   Types: ${anyEntities[0]['uniques.type'].join(', ')}`);
  } else {
    console.log('❌ NO AWS entities are being created in this account\!');
    console.log('   This suggests AWS cloud integration is not configured.');
  }
}

verify();