#!/usr/bin/env node

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

async function checkEvents() {
  loadEnv();
  
  const accountId = process.env.ACC || process.env.NR_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NR_USER_KEY;
  
  console.log('\n🔍 Checking All Recent Events\n');
  
  const queries = [
    {
      name: 'AwsMskClusterSample (last 30 min)',
      query: `FROM AwsMskClusterSample SELECT entityName, provider.clusterName, timestamp WHERE timestamp > ${Date.now() - 1800000} LIMIT 5`
    },
    {
      name: 'AwsMskBrokerSample (last 30 min)',
      query: `FROM AwsMskBrokerSample SELECT entityName, clusterName, timestamp WHERE timestamp > ${Date.now() - 1800000} LIMIT 5`
    },
    {
      name: 'AwsMskTopicSample (last 30 min)',
      query: `FROM AwsMskTopicSample SELECT entityName, provider.clusterName, timestamp WHERE timestamp > ${Date.now() - 1800000} LIMIT 5`
    },
    {
      name: 'Any event with msk-cluster in name',
      query: `FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample SELECT * WHERE entityName LIKE '%msk-cluster%' SINCE 1 hour ago LIMIT 5`
    }
  ];
  
  for (const queryDef of queries) {
    console.log(`📊 ${queryDef.name}:`);
    
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
        results.forEach(result => {
          console.log('   ', JSON.stringify(result, null, 2));
        });
      } else {
        console.log('   No results');
      }
    } catch (error) {
      console.error('   Error:', error.message);
    }
    console.log();
  }
}

checkEvents();