#!/usr/bin/env node

const https = require('https');
require('dotenv').config({ path: '../.env' });

const config = {
  accountId: parseInt(process.env.ACC),
  apiKey: process.env.UKEY || process.env.QKey
};

async function makeGraphQLRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.newrelic.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': config.apiKey
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.errors) {
            console.error('GraphQL errors:', JSON.stringify(result.errors, null, 2));
          }
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({ query, variables }));
    req.end();
  });
}

async function checkAllData() {
  console.log('🔍 Checking for ANY AWS MSK data in the account...\n');
  
  // Check for any AwsMskBrokerSample
  const brokerQuery = `
    query($accountId: Int!) {
      actor {
        account(id: $accountId) {
          nrql(query: "SELECT count(*) FROM AwsMskBrokerSample SINCE 7 days ago") {
            results
          }
        }
      }
    }
  `;

  const brokerResult = await makeGraphQLRequest(brokerQuery, { accountId: config.accountId });
  console.log('AwsMskBrokerSample count (7 days):', brokerResult.data?.actor?.account?.nrql?.results?.[0]?.count || 0);

  // Check for any AwsMskClusterSample
  const clusterQuery = `
    query($accountId: Int!) {
      actor {
        account(id: $accountId) {
          nrql(query: "SELECT count(*) FROM AwsMskClusterSample SINCE 7 days ago") {
            results
          }
        }
      }
    }
  `;

  const clusterResult = await makeGraphQLRequest(clusterQuery, { accountId: config.accountId });
  console.log('AwsMskClusterSample count (7 days):', clusterResult.data?.actor?.account?.nrql?.results?.[0]?.count || 0);

  // Check for any AwsMskTopicSample
  const topicQuery = `
    query($accountId: Int!) {
      actor {
        account(id: $accountId) {
          nrql(query: "SELECT count(*) FROM AwsMskTopicSample SINCE 7 days ago") {
            results
          }
        }
      }
    }
  `;

  const topicResult = await makeGraphQLRequest(topicQuery, { accountId: config.accountId });
  console.log('AwsMskTopicSample count (7 days):', topicResult.data?.actor?.account?.nrql?.results?.[0]?.count || 0);

  // Check for any Metric events
  console.log('\n🔍 Checking for Metric events...\n');
  
  const metricQuery = `
    query($accountId: Int!) {
      actor {
        account(id: $accountId) {
          nrql(query: "SELECT count(*), uniques(collector.name), uniques(metricName) FROM Metric WHERE metricName LIKE '%kafka%' OR metricName LIKE '%msk%' SINCE 1 hour ago") {
            results
          }
        }
      }
    }
  `;

  const metricResult = await makeGraphQLRequest(metricQuery, { accountId: config.accountId });
  const metricData = metricResult.data?.actor?.account?.nrql?.results?.[0];
  
  if (metricData) {
    console.log('Kafka/MSK related metrics (1 hour):');
    console.log('  Count:', metricData.count || 0);
    console.log('  Collectors:', metricData['uniques.collector.name'] || []);
    console.log('  Metric names:', metricData['uniques.metricName'] || []);
  }

  // Check for any entities
  console.log('\n🔍 Checking for AWS MSK entities...\n');
  
  const entityQuery = `
    query {
      actor {
        entitySearch(query: "type IN ('AWSMSKBROKER', 'AWSMSKCLUSTER', 'AWSMSKTOPIC')") {
          results {
            entities {
              guid
              name
              type
            }
          }
        }
      }
    }
  `;

  const entityResult = await makeGraphQLRequest(entityQuery);
  const entities = entityResult.data?.actor?.entitySearch?.results?.entities || [];
  
  if (entities.length > 0) {
    console.log(`Found ${entities.length} AWS MSK entities:`);
    entities.forEach(e => console.log(`  - ${e.type}: ${e.name}`));
  } else {
    console.log('No AWS MSK entities found');
  }

  // Check the latest AwsMskBrokerSample events
  console.log('\n🔍 Checking latest AwsMskBrokerSample events...\n');
  
  const latestQuery = `
    query($accountId: Int!) {
      actor {
        account(id: $accountId) {
          nrql(query: "SELECT * FROM AwsMskBrokerSample SINCE 7 days ago LIMIT 1") {
            results
          }
        }
      }
    }
  `;

  const latestResult = await makeGraphQLRequest(latestQuery, { accountId: config.accountId });
  const latestEvent = latestResult.data?.actor?.account?.nrql?.results?.[0];
  
  if (latestEvent) {
    console.log('Sample AwsMskBrokerSample event:');
    console.log(JSON.stringify(latestEvent, null, 2));
  } else {
    console.log('No AwsMskBrokerSample events found');
  }
}

checkAllData().catch(console.error);