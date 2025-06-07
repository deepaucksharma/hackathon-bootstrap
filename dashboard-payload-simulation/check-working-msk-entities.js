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
  console.log('🔍 Looking for ANY working MSK entities in the account...\n');
  
  // Check MessageQueueSample for any MSK entities
  console.log('Checking MessageQueueSample for MSK entities...');
  const msQuery = `FROM MessageQueueSample SELECT count(*), uniques(provider), uniques(entity.name), uniques(queue.name) WHERE provider LIKE '%msk%' OR provider LIKE '%Msk%' OR provider LIKE '%kafka%' OR provider LIKE '%Kafka%' SINCE 7 days ago LIMIT 100`;
  const msResults = await runQuery(msQuery);
  
  if (msResults[0]?.count > 0) {
    console.log(`✅ Found ${msResults[0].count} MSK/Kafka events in MessageQueueSample!`);
    console.log(`Providers: ${msResults[0]['uniques.provider']?.join(', ')}`);
    console.log(`Entity names: ${msResults[0]['uniques.entity.name']?.slice(0, 5).join(', ')}...`);
    console.log(`Queue names: ${msResults[0]['uniques.queue.name']?.slice(0, 5).join(', ')}...`);
  } else {
    console.log('❌ No MSK/Kafka entities found in MessageQueueSample');
  }
  
  // Check for any Kafka entities via GraphQL
  console.log('\nChecking for Kafka entities via entity search...');
  const entitySearchQuery = `
    query {
      actor {
        entitySearch(query: "type LIKE '%KAFKA%'") {
          results {
            entities {
              guid
              name
              type
              domain
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
  
  // Check AwsMsk* event types
  console.log('\nChecking AwsMsk* event types...');
  const awsQuery = `FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample SELECT count(*), uniques(eventType) SINCE 7 days ago`;
  const awsResults = await runQuery(awsQuery);
  
  if (awsResults[0]?.count > 0) {
    console.log(`✅ Found ${awsResults[0].count} AWS MSK events`);
    console.log(`Event types: ${awsResults[0]['uniques.eventType']?.join(', ')}`);
  } else {
    console.log('❌ No AWS MSK events found');
  }
  
  // Check standard Kafka event types
  console.log('\nChecking standard Kafka event types...');
  const kafkaQuery = `FROM KafkaBrokerSample, KafkaTopicSample, KafkaOffsetSample SELECT count(*), uniques(eventType), uniques(clusterName) SINCE 7 days ago`;
  const kafkaResults = await runQuery(kafkaQuery);
  
  if (kafkaResults[0]?.count > 0) {
    console.log(`✅ Found ${kafkaResults[0].count} standard Kafka events`);
    console.log(`Event types: ${kafkaResults[0]['uniques.eventType']?.join(', ')}`);
    console.log(`Clusters: ${kafkaResults[0]['uniques.clusterName']?.join(', ')}`);
  } else {
    console.log('❌ No standard Kafka events found');
  }
  
  // Check all Message Queue providers
  console.log('\nAll Message Queue providers in use:');
  const providerQuery = `FROM MessageQueueSample SELECT uniques(provider) SINCE 7 days ago`;
  const providers = await runQuery(providerQuery);
  console.log(`Providers: ${providers[0]?.['uniques.provider']?.join(', ') || 'None'}`);
}

main().catch(console.error);