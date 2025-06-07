#!/usr/bin/env node

require('dotenv').config({ path: '../.env' });
const https = require('https');

// Configuration
const config = {
  accountId: process.env.ACC,
  apiKey: process.env.UKEY || process.env.QKey,
  clusterName: 'msk-cluster-1749192934433'
};

// NRQL queries to check for our events
const queries = [
  {
    name: 'AwsMskClusterSample',
    nrql: `SELECT count(*) FROM AwsMskClusterSample WHERE provider.clusterName = '${config.clusterName}' OR entityName = '${config.clusterName}' SINCE 5 minutes ago`
  },
  {
    name: 'AwsMskBrokerSample',
    nrql: `SELECT count(*) FROM AwsMskBrokerSample WHERE provider.clusterName = '${config.clusterName}' OR entityName LIKE '%${config.clusterName}%' SINCE 5 minutes ago`
  },
  {
    name: 'AwsMskTopicSample',
    nrql: `SELECT count(*) FROM AwsMskTopicSample WHERE provider.clusterName = '${config.clusterName}' OR entityName LIKE '%${config.clusterName}%' SINCE 5 minutes ago`
  }
];

async function runNrqlQuery(query) {
  const options = {
    hostname: 'api.newrelic.com',
    path: `/graphql`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'API-Key': config.apiKey
    }
  };

  const graphqlQuery = {
    query: `
      {
        actor {
          account(id: ${config.accountId}) {
            nrql(query: "${query}") {
              results
            }
          }
        }
      }
    `
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.errors) {
            reject(new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`));
          } else {
            resolve(result.data.actor.account.nrql.results);
          }
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

async function checkEvents() {
  console.log(`\nChecking for MSK events with cluster name: ${config.clusterName}`);
  console.log('='.repeat(80));

  if (!config.apiKey) {
    console.error('ERROR: UKEY or QKey environment variable is required');
    process.exit(1);
  }

  for (const query of queries) {
    try {
      console.log(`\nChecking ${query.name}...`);
      const results = await runNrqlQuery(query.nrql);
      
      if (results && results.length > 0) {
        const count = results[0].count || 0;
        if (count > 0) {
          console.log(`✅ Found ${count} ${query.name} events`);
        } else {
          console.log(`❌ No ${query.name} events found`);
        }
      } else {
        console.log(`❌ No results for ${query.name}`);
      }
    } catch (error) {
      console.error(`❌ Error checking ${query.name}: ${error.message}`);
    }
  }

  // Also check for recent events without filtering by cluster name
  console.log('\n' + '-'.repeat(80));
  console.log('Checking for ANY recent MSK events (last 5 minutes):');
  
  const generalQueries = [
    `SELECT count(*) FROM AwsMskClusterSample SINCE 5 minutes ago`,
    `SELECT count(*) FROM AwsMskBrokerSample SINCE 5 minutes ago`,
    `SELECT count(*) FROM AwsMskTopicSample SINCE 5 minutes ago`
  ];

  for (let i = 0; i < generalQueries.length; i++) {
    try {
      const results = await runNrqlQuery(generalQueries[i]);
      const eventType = queries[i].name;
      
      if (results && results.length > 0) {
        const count = results[0].count || 0;
        console.log(`${eventType}: ${count} total events`);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  }

  // Show sample cluster names if any events exist
  console.log('\n' + '-'.repeat(80));
  console.log('Sample data from recent events:');
  
  try {
    // Check cluster sample data
    const clusterDataQuery = `SELECT * FROM AwsMskClusterSample SINCE 5 minutes ago LIMIT 1`;
    const clusterResults = await runNrqlQuery(clusterDataQuery);
    
    if (clusterResults && clusterResults.length > 0) {
      console.log('\nSample AwsMskClusterSample event:');
      console.log(JSON.stringify(clusterResults[0], null, 2));
    }
    
    // Check for different field names
    const fieldQueries = [
      `SELECT uniques(clusterName) FROM AwsMskClusterSample SINCE 5 minutes ago`,
      `SELECT uniques(awsAccountId) FROM AwsMskClusterSample SINCE 5 minutes ago`,
      `SELECT uniques(awsRegion) FROM AwsMskClusterSample SINCE 5 minutes ago`,
      `SELECT uniques(entityName) FROM AwsMskClusterSample SINCE 5 minutes ago`
    ];
    
    for (const query of fieldQueries) {
      try {
        const results = await runNrqlQuery(query);
        console.log(`\nQuery: ${query}`);
        console.log('Result:', JSON.stringify(results, null, 2));
      } catch (e) {
        console.error(`Error: ${e.message}`);
      }
    }
  } catch (error) {
    console.error(`Error getting sample data: ${error.message}`);
  }
}

// Run the check
checkEvents().catch(console.error);