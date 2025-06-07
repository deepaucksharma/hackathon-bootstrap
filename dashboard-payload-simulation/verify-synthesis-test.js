#!/usr/bin/env node

/**
 * Verify the synthesis test entities
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Load environment
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+?)[=:](.*)/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        process.env[key] = value;
      }
    });
  }
}

async function verifySynthesisTest() {
  loadEnv();
  
  const accountId = process.env.ACC || process.env.NR_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NR_USER_KEY;
  
  console.log(`\n🔍 Verifying Synthesis Test Entities`);
  console.log('=' .repeat(60));
  
  const queries = [
    {
      name: "Check Cluster Entity",
      query: `FROM AwsMskClusterSample SELECT count(*), latest(entityGuid), latest(provider) WHERE entityName LIKE 'synthesis-test-%' SINCE 10 minutes ago`
    },
    {
      name: "Check Broker Entity",
      query: `FROM AwsMskBrokerSample SELECT count(*), latest(entityGuid), latest(provider), latest(provider.clusterName) WHERE entityName LIKE '%synthesis-test-%' SINCE 10 minutes ago`
    },
    {
      name: "Check Topic Entity",
      query: `FROM AwsMskTopicSample SELECT count(*), latest(entityGuid), latest(provider), latest(provider.clusterName) WHERE entityName = 'test-topic' SINCE 10 minutes ago`
    },
    {
      name: "Check All Entity Types",
      query: `FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample SELECT count(*) WHERE entityName LIKE '%synthesis-test-%' OR entityName = 'test-topic' SINCE 10 minutes ago FACET eventType`
    },
    {
      name: "Check Entity Explorer (via NerdGraph simulation)",
      query: `FROM AwsMskBrokerSample SELECT uniqueCount(entityGuid), uniqueCount(entityName) WHERE entityGuid IS NOT NULL SINCE 1 hour ago`
    },
    {
      name: "Check MessageQueueSample Again",
      query: `FROM MessageQueueSample SELECT count(*) WHERE entityName LIKE '%synthesis%' OR queue.name LIKE '%synthesis%' SINCE 1 hour ago`
    }
  ];

  let foundEntities = false;
  
  for (const queryDef of queries) {
    console.log(`\n📊 ${queryDef.name}:`);
    
    const graphqlQuery = {
      query: `
        {
          actor {
            account(id: ${accountId}) {
              nrql(query: "${queryDef.query.replace(/"/g, '\\"')}") {
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
      
      const results = response.data?.data?.actor?.account?.nrql?.results;
      if (results && results.length > 0) {
        results.forEach((result, index) => {
          console.log('   ', JSON.stringify(result, null, 2));
          if (result.count > 0 || result['uniqueCount.entityGuid'] > 0) {
            foundEntities = true;
          }
        });
      } else {
        console.log('   No results found');
      }
    } catch (error) {
      console.error('   ❌ Error:', error.message);
    }
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('📌 Summary:');
  if (foundEntities) {
    console.log('✅ Entities are being created and have GUIDs');
    console.log('⚠️  MessageQueueSample still not populated (UI visibility issue)');
    console.log('\n🔍 Next steps:');
    console.log('1. Check Entity Explorer in New Relic UI manually');
    console.log('2. Try using the specific entity GUIDs to query');
    console.log('3. Consider that MessageQueueSample might require additional setup');
  } else {
    console.log('❌ No synthesis test entities found');
  }
}

// Run verification
verifySynthesisTest().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});