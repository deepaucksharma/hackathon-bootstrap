#!/usr/bin/env node

/**
 * Check if entities were created for MSK cluster 'msk-cluster-1749192934433'
 * Uses NerdGraph entitySearch query
 */

const https = require('https');

// Configuration - Replace with your actual API key
const CONFIG = {
  apiKey: process.env.NEWRELIC_API_KEY || process.env.NEWRELIC_USER_API_KEY || 'YOUR_API_KEY_HERE',
  accountId: process.env.NEWRELIC_ACCOUNT_ID || 'YOUR_ACCOUNT_ID_HERE',
  nerdGraphUrl: 'https://api.newrelic.com/graphql'
};

// NerdGraph query to search for entities with the cluster name
const query = `
{
  actor {
    entitySearch(query: "name LIKE 'msk-cluster-1749192934433' OR tags.ClusterArn LIKE '%msk-cluster-1749192934433%'") {
      count
      results {
        entities {
          guid
          name
          type
          entityType
          tags {
            key
            values
          }
          ... on ApmApplicationEntityOutline {
            alertSeverity
            reporting
          }
          ... on InfrastructureHostEntityOutline {
            alertSeverity
            reporting
          }
          ... on GenericEntityOutline {
            alertSeverity
            reporting
          }
        }
      }
    }
  }
}
`;

// Function to make the NerdGraph request
function queryNerdGraph(query) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ query });
    
    const options = {
      hostname: 'api.newrelic.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': CONFIG.apiKey,
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });
    
    req.on('error', (e) => {
      reject(new Error(`Request failed: ${e.message}`));
    });
    
    req.write(postData);
    req.end();
  });
}

// Main function
async function checkEntities() {
  console.log('Checking for entities with cluster name: msk-cluster-1749192934433\n');
  
  if (CONFIG.apiKey === 'YOUR_API_KEY_HERE') {
    console.error('ERROR: Please set NEWRELIC_API_KEY or NEWRELIC_USER_API_KEY environment variable');
    console.error('Example: NEWRELIC_API_KEY=your_key_here node check-msk-cluster-entities.js');
    process.exit(1);
  }
  
  try {
    const response = await queryNerdGraph(query);
    
    if (response.errors) {
      console.error('GraphQL Errors:', JSON.stringify(response.errors, null, 2));
      return;
    }
    
    const searchResults = response.data?.actor?.entitySearch;
    
    if (!searchResults) {
      console.error('No search results returned');
      return;
    }
    
    console.log(`Total entities found: ${searchResults.count}\n`);
    
    if (searchResults.count === 0) {
      console.log('No entities found for cluster msk-cluster-1749192934433');
      console.log('\nPossible reasons:');
      console.log('- The cluster data hasn\'t been ingested yet');
      console.log('- The cluster name doesn\'t match exactly');
      console.log('- The integration isn\'t configured properly');
      console.log('- Check if data is being sent to the correct account');
    } else {
      console.log('Entities found:');
      console.log('==============\n');
      
      searchResults.results.entities.forEach((entity, index) => {
        console.log(`Entity ${index + 1}:`);
        console.log(`  GUID: ${entity.guid}`);
        console.log(`  Name: ${entity.name}`);
        console.log(`  Type: ${entity.type}`);
        console.log(`  Entity Type: ${entity.entityType}`);
        console.log(`  Reporting: ${entity.reporting || 'N/A'}`);
        console.log(`  Alert Severity: ${entity.alertSeverity || 'N/A'}`);
        
        if (entity.tags && entity.tags.length > 0) {
          console.log('  Tags:');
          entity.tags.forEach(tag => {
            console.log(`    ${tag.key}: ${tag.values.join(', ')}`);
          });
        }
        console.log('');
      });
    }
    
    // Also check for any MSK-specific entity types
    console.log('\nChecking for MSK-specific entity types...\n');
    
    const mskTypeQuery = `
    {
      actor {
        entitySearch(query: "type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC', 'AWS_MSK_CLUSTER', 'AWS_MSK_BROKER', 'AWS_MSK_TOPIC')") {
          count
          results {
            entities {
              guid
              name
              type
              entityType
            }
          }
        }
      }
    }
    `;
    
    const mskTypeResponse = await queryNerdGraph(mskTypeQuery);
    
    if (mskTypeResponse.data?.actor?.entitySearch?.count > 0) {
      console.log(`Found ${mskTypeResponse.data.actor.entitySearch.count} MSK-type entities:`);
      mskTypeResponse.data.actor.entitySearch.results.entities.forEach(entity => {
        console.log(`  - ${entity.name} (${entity.type})`);
      });
    } else {
      console.log('No MSK-specific entity types found in the account');
    }
    
  } catch (error) {
    console.error('Error checking entities:', error.message);
  }
}

// Run the check
checkEntities();