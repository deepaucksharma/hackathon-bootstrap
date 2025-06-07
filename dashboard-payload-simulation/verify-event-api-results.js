#!/usr/bin/env node

const https = require('https');
require('dotenv').config({ path: '../.env' });

const config = {
  accountId: parseInt(process.env.ACC),
  apiKey: process.env.UKEY || process.env.QKey
};

async function makeNRQLRequest(query) {
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

    const graphqlQuery = {
      query: `
        query($accountId: Int!, $nrqlQuery: Nrql!) {
          actor {
            account(id: $accountId) {
              nrql(query: $nrqlQuery) {
                results
              }
            }
          }
        }
      `,
      variables: {
        accountId: config.accountId,
        nrqlQuery: query
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.data?.actor?.account?.nrql?.results || []);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(graphqlQuery));
    req.end();
  });
}

async function makeGraphQLRequest(query) {
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
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({ query }));
    req.end();
  });
}

async function verifyEventAPIResults() {
  const clusterName = 'event-api-test-1749192803753';
  
  console.log('='.repeat(80));
  console.log('Event API Results Verification');
  console.log(`Cluster: ${clusterName}`);
  console.log('='.repeat(80));
  
  // Wait a moment for events to be processed
  console.log('\n⏳ Waiting 5 seconds for event processing...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Check for broker events
  console.log('📊 Checking for AwsMskBrokerSample events...');
  const brokerResults = await makeNRQLRequest(
    `SELECT * FROM AwsMskBrokerSample WHERE awsMskClusterName = '${clusterName}' SINCE 10 minutes ago`
  );
  
  if (brokerResults.length > 0) {
    console.log(`✅ Found ${brokerResults.length} broker events`);
    console.log('\nSample event:');
    console.log(JSON.stringify(brokerResults[0], null, 2));
  } else {
    console.log('❌ No broker events found');
  }
  
  // Check for cluster events
  console.log('\n\n📊 Checking for AwsMskClusterSample events...');
  const clusterResults = await makeNRQLRequest(
    `SELECT * FROM AwsMskClusterSample WHERE awsMskClusterName = '${clusterName}' SINCE 10 minutes ago`
  );
  
  if (clusterResults.length > 0) {
    console.log(`✅ Found ${clusterResults.length} cluster events`);
  } else {
    console.log('❌ No cluster events found');
  }
  
  // Check for topic events
  console.log('\n📊 Checking for AwsMskTopicSample events...');
  const topicResults = await makeNRQLRequest(
    `SELECT * FROM AwsMskTopicSample WHERE awsMskClusterName = '${clusterName}' SINCE 10 minutes ago`
  );
  
  if (topicResults.length > 0) {
    console.log(`✅ Found ${topicResults.length} topic events`);
  } else {
    console.log('❌ No topic events found');
  }
  
  // Check for entity creation
  console.log('\n\n📊 Checking for entity synthesis...');
  const entityQuery = `
    {
      actor {
        entitySearch(query: "type IN ('AWSMSKBROKER', 'AWSMSKCLUSTER', 'AWSMSKTOPIC') AND tags.awsMskClusterName = '${clusterName}'") {
          results {
            entities {
              guid
              name
              type
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
  
  const entityResult = await makeGraphQLRequest(entityQuery);
  const entities = entityResult.data?.actor?.entitySearch?.results?.entities || [];
  
  if (entities.length > 0) {
    console.log(`✅ Found ${entities.length} entities`);
    entities.forEach(e => {
      console.log(`  - ${e.type}: ${e.name}`);
    });
    
    // Check UI link for cluster
    const clusterEntity = entities.find(e => e.type === 'AWSMSKCLUSTER');
    if (clusterEntity) {
      console.log(`\n🌐 View cluster in UI: https://one.newrelic.com/redirect/entity/${clusterEntity.guid}`);
    }
  } else {
    console.log('❌ No entities found');
    
    // Try alternative entity search
    console.log('\n📊 Trying alternative entity search...');
    const altEntityQuery = `
      {
        actor {
          entitySearch(query: "name LIKE '${clusterName}%'") {
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
    
    const altResult = await makeGraphQLRequest(altEntityQuery);
    const altEntities = altResult.data?.actor?.entitySearch?.results?.entities || [];
    
    if (altEntities.length > 0) {
      console.log(`Found ${altEntities.length} entities with name matching:`);
      altEntities.forEach(e => {
        console.log(`  - ${e.type}: ${e.name}`);
      });
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✨ Verification complete!');
  console.log('='.repeat(80));
}

verifyEventAPIResults().catch(console.error);