#!/usr/bin/env node

/**
 * Check all MSK entities and patterns
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

async function checkAllMSK() {
  loadEnv();
  
  const accountId = process.env.ACC || process.env.NR_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NR_USER_KEY;
  
  console.log(`\n🔍 Comprehensive MSK Entity Check`);
  console.log(`   Account: ${accountId}`);
  console.log('=' .repeat(60));
  
  const queries = [
    {
      name: "All AwsMskBrokerSample events (last hour)",
      query: `FROM AwsMskBrokerSample SELECT count(*), uniqueCount(entityName), latest(collector.name), latest(provider) SINCE 1 hour ago`
    },
    {
      name: "Recent broker entities",
      query: `FROM AwsMskBrokerSample SELECT entityName, collector.name, provider, timestamp WHERE entityName IS NOT NULL SINCE 1 hour ago LIMIT 10`
    },
    {
      name: "Collector name distribution",
      query: `FROM AwsMskBrokerSample SELECT count(*) SINCE 1 hour ago FACET collector.name`
    },
    {
      name: "Provider distribution",
      query: `FROM AwsMskBrokerSample SELECT count(*) SINCE 1 hour ago FACET provider`
    },
    {
      name: "Check MessageQueueSample for ANY Kafka",
      query: `FROM MessageQueueSample SELECT count(*), uniqueCount(entityName) WHERE provider LIKE '%kafka%' OR provider LIKE '%msk%' OR entityName LIKE '%kafka%' SINCE 1 day ago`
    },
    {
      name: "Check for entity synthesis indicators",
      query: `FROM AwsMskBrokerSample SELECT latest(entityGuid), latest(entityId), latest(entityName), latest(providerExternalId) WHERE entityName IS NOT NULL SINCE 1 hour ago LIMIT 5`
    },
    {
      name: "Check required fields presence",
      query: `FROM AwsMskBrokerSample SELECT count(*) WHERE collector.name IS NOT NULL AND provider IS NOT NULL AND entityName IS NOT NULL AND providerExternalId IS NOT NULL SINCE 1 hour ago`
    },
    {
      name: "Check metric aggregations",
      query: `FROM AwsMskBrokerSample SELECT latest(provider.bytesInPerSec.Average), latest(provider.bytesInPerSec.Sum), latest(provider.bytesInPerSec.SampleCount) WHERE provider.bytesInPerSec.Average IS NOT NULL SINCE 1 hour ago LIMIT 1`
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
      if (results && results.length > 0) {
        results.forEach((result, index) => {
          if (results.length > 1) {
            console.log(`   [${index + 1}]`, JSON.stringify(result, null, 2));
          } else {
            console.log('   ', JSON.stringify(result, null, 2));
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
  console.log('📌 Key Findings:');
  console.log('- Check if any events have entityGuid (indicates synthesis)');
  console.log('- Verify collector.name values (cloud-integrations or cloudwatch-metric-streams)');
  console.log('- Look for MessageQueueSample entries (UI visibility indicator)');
  console.log('- Ensure all 5 metric aggregations are present');
}

// Run the check
checkAllMSK().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});