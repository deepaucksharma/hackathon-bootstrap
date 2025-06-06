#!/usr/bin/env node

/**
 * Verify entity creation in New Relic
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

async function verifyWithNRQL(entityName) {
  loadEnv();
  
  const accountId = process.env.ACC || process.env.NR_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NR_USER_KEY;
  
  console.log(`\n🔍 Verifying entity: ${entityName}`);
  console.log(`   Account: ${accountId}`);
  
  // Try multiple queries
  const queries = [
    {
      name: "Check AwsMskBrokerSample events",
      query: `FROM AwsMskBrokerSample SELECT count(*) WHERE entityName LIKE '%${entityName.split(':')[1]}%' SINCE 10 minutes ago`
    },
    {
      name: "Check MessageQueueSample",
      query: `FROM MessageQueueSample SELECT count(*) WHERE entityName LIKE '%kafka%' OR queue.name LIKE '%kafka%' SINCE 10 minutes ago`
    },
    {
      name: "Check all AWS MSK events",
      query: `FROM AwsMskBrokerSample, AwsMskClusterSample, AwsMskTopicSample SELECT count(*) SINCE 10 minutes ago FACET eventType`
    },
    {
      name: "Check recent events with collector info",
      query: `FROM AwsMskBrokerSample SELECT latest(collector.name), latest(provider), latest(entityGuid) SINCE 10 minutes ago LIMIT 5`
    }
  ];

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
      console.log('   Results:', JSON.stringify(results, null, 2));
    } catch (error) {
      if (error.response?.status === 401) {
        console.error('   ❌ Authentication failed. Check your API key (UKEY)');
      } else {
        console.error('   ❌ Error:', error.message);
      }
    }
  }
}

// Check for entity name argument
const entityName = process.argv[2];
if (entityName) {
  verifyWithNRQL(entityName);
} else {
  console.log('Usage: node verify-entity.js <entityName>');
  console.log('Example: node verify-entity.js "1:test-cluster-123456"');
  
  // Run a general check
  console.log('\nRunning general MSK entity check...');
  verifyWithNRQL('test-cluster');
}