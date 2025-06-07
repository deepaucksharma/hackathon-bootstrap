#!/usr/bin/env node

/**
 * Verify MessageQueueSample events
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

async function verifyMessageQueue() {
  loadEnv();
  
  const accountId = process.env.ACC || process.env.NR_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NR_USER_KEY;
  
  console.log(`\n🔍 Verifying MessageQueueSample Events`);
  console.log('=' .repeat(60));
  
  const queries = [
    {
      name: "Check MessageQueueSample events",
      query: `FROM MessageQueueSample SELECT count(*) WHERE provider = 'AwsMsk' SINCE 10 minutes ago`
    },
    {
      name: "List all AwsMsk queues",
      query: `FROM MessageQueueSample SELECT queue.name, queue.type, entity.type, timestamp WHERE provider = 'AwsMsk' SINCE 10 minutes ago LIMIT 10`
    },
    {
      name: "Check queue metrics",
      query: `FROM MessageQueueSample SELECT latest(queue.messagesPerSecond), latest(queue.bytesPerSecond), latest(queue.consumerLag) WHERE provider = 'AwsMsk' SINCE 10 minutes ago FACET queue.name`
    },
    {
      name: "Check all MessageQueueSample providers",
      query: `FROM MessageQueueSample SELECT count(*) SINCE 1 hour ago FACET provider`
    },
    {
      name: "Verify entity fields",
      query: `FROM MessageQueueSample SELECT latest(entity.guid), latest(entity.type), latest(entity.name) WHERE provider = 'AwsMsk' SINCE 10 minutes ago LIMIT 5`
    }
  ];

  let foundQueues = false;
  
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
          if (result.count > 0 || result['queue.name']) {
            foundQueues = true;
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
  if (foundQueues) {
    console.log('✅ MessageQueueSample events found!');
    console.log('🎉 This confirms the solution for UI visibility');
    console.log('\n🚀 Next steps:');
    console.log('1. Check Message Queues UI in New Relic');
    console.log('2. Implement dual event submission in nri-kafka');
    console.log('3. Submit both MessageQueueSample (for UI) and AwsMsk*Sample (for metrics)');
  } else {
    console.log('⏳ No MessageQueueSample events found yet');
    console.log('Wait a bit more and try again');
  }
}

// Run verification
verifyMessageQueue().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});