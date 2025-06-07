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

async function findWorkingEntities() {
  loadEnv();
  
  const accountId = process.env.ACC || process.env.NR_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NR_USER_KEY;
  
  console.log('🔍 Finding Real Working MSK Entities');
  console.log('===================================\n');
  
  // First, find entities that exist in Entity table
  console.log('1️⃣ Finding MSK entities in Entity table...');
  const entityQuery = `FROM Entity SELECT name, guid, type, reporting WHERE type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC') AND name NOT LIKE '%ui-compatible%' LIMIT 10 SINCE 7 days ago`;
  const entities = await runQuery(entityQuery, accountId, apiKey);
  
  if (entities.length > 0) {
    console.log(`✅ Found ${entities.length} MSK entities in Entity table\n`);
    
    // For each entity, find its corresponding sample events
    for (const entity of entities) {
      console.log(`📊 Entity: ${entity.name}`);
      console.log(`   Type: ${entity.type}`);
      console.log(`   GUID: ${entity.guid}`);
      console.log(`   Reporting: ${entity.reporting ? 'Yes' : 'No'}`);
      
      // Map entity type to event type
      const eventType = {
        'AWSMSKCLUSTER': 'AwsMskClusterSample',
        'AWSMSKBROKER': 'AwsMskBrokerSample',
        'AWSMSKTOPIC': 'AwsMskTopicSample'
      }[entity.type];
      
      if (eventType) {
        // Find corresponding events
        const eventQuery = `FROM ${eventType} SELECT * WHERE entityGuid = '${entity.guid}' LIMIT 1 SINCE 1 day ago`;
        const events = await runQuery(eventQuery, accountId, apiKey);
        
        if (events.length > 0) {
          console.log('\n   ✅ Found corresponding event:');
          const event = events[0];
          
          // Show key fields
          console.log(`   Provider: ${event.provider}`);
          console.log(`   Collector: ${event['collector.name']}`);
          
          // List all fields
          const fields = Object.keys(event).sort();
          console.log(`   Total fields: ${fields.length}`);
          
          // Show fields we're interested in
          const criticalFields = [
            'provider',
            'collector.name',
            'entityName',
            'entityGuid',
            'providerAccountId',
            'providerAccountName',
            'providerExternalId',
            'awsAccountId',
            'awsRegion',
            'integrationName',
            'integrationVersion',
            'tags.Name',
            'tags.aws:cloudformation:stack-name'
          ];
          
          console.log('\n   Critical fields:');
          criticalFields.forEach(field => {
            const value = event[field];
            if (value !== undefined) {
              console.log(`     ${field}: ${JSON.stringify(value)}`);
            }
          });
          
          // Save for detailed analysis
          const filename = `working-entity-${entity.type}-${Date.now()}.json`;
          fs.writeFileSync(filename, JSON.stringify({entity, event}, null, 2));
          console.log(`\n   📁 Saved to: ${filename}`);
        } else {
          console.log('   ❌ No corresponding events found');
        }
      }
      console.log('\n' + '='.repeat(50) + '\n');
    }
  } else {
    console.log('❌ No MSK entities found in Entity table');
    console.log('\n💡 This suggests the account may not have working MSK integration');
    console.log('   or all existing entities are from our tests.\n');
    
    // Try to find any AwsMsk events that aren't from our tests
    console.log('2️⃣ Looking for any MSK events not from our tests...');
    const anyEventsQuery = `FROM AwsMskBrokerSample, AwsMskClusterSample, AwsMskTopicSample SELECT count(*) WHERE entityName NOT LIKE '%ui-compatible%' AND entityName NOT LIKE '%test%' SINCE 7 days ago FACET eventType`;
    const anyEvents = await runQuery(anyEventsQuery, accountId, apiKey);
    
    if (anyEvents.length > 0) {
      console.log('\n📊 Found other MSK events:');
      anyEvents.forEach(result => {
        console.log(`   ${result.eventType}: ${result.count} events`);
      });
    }
  }
}

findWorkingEntities();