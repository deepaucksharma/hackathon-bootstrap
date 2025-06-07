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
  const clusterName = 'ui-compatible-cluster-1749258070413';
  
  console.log('🔍 Verifying UI-Compatible Events');
  console.log('=================================\n');
  
  const queries = [
    {
      name: 'Cluster Health',
      query: `FROM AwsMskClusterSample SELECT latest(provider.activeControllerCount.Sum), latest(provider.offlinePartitionsCount.Sum) WHERE provider.clusterName = '${clusterName}' SINCE 10 minutes ago`
    },
    {
      name: 'Broker Throughput',
      query: `FROM AwsMskBrokerSample SELECT sum(provider.bytesInPerSec.Average), count(*) WHERE provider.clusterName = '${clusterName}' SINCE 10 minutes ago`
    },
    {
      name: 'Topics',
      query: `FROM AwsMskTopicSample SELECT uniques(displayName) WHERE provider.clusterName = '${clusterName}' SINCE 10 minutes ago`
    },
    {
      name: 'Event Count by Type',
      query: `FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample SELECT count(*) WHERE provider.clusterName = '${clusterName}' SINCE 10 minutes ago FACET eventType`
    },
    {
      name: 'Entity Search',
      query: `FROM Entity WHERE type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC') AND name LIKE '%${clusterName}%' SINCE 10 minutes ago`
    },
    {
      name: 'Check Provider Field',
      query: `FROM AwsMskBrokerSample SELECT uniques(provider) WHERE provider.clusterName = '${clusterName}' SINCE 10 minutes ago`
    }
  ];
  
  let foundEvents = false;
  let foundEntities = false;
  
  for (const queryDef of queries) {
    console.log(`📊 ${queryDef.name}:`);
    const results = await runQuery(queryDef.query, accountId, apiKey);
    
    if (results.length > 0) {
      results.forEach(result => {
        console.log('   ', JSON.stringify(result, null, 2));
      });
      
      if (queryDef.name.includes('Event Count')) {
        foundEvents = true;
      }
      if (queryDef.name === 'Entity Search' && results[0].count > 0) {
        foundEntities = true;
      }
    } else {
      console.log('   No results');
    }
    console.log();
  }
  
  console.log('📌 Summary:');
  console.log('==========');
  if (foundEvents) {
    console.log('✅ Events are in NRDB');
  } else {
    console.log('❌ Events not found in NRDB');
  }
  
  if (foundEntities) {
    console.log('✅ Entities have been created!');
    console.log('🎉 Check the Message Queues UI now!');
  } else {
    console.log('⏳ Entities not created yet');
    console.log('   May need more time or missing fields');
  }
}

verify();