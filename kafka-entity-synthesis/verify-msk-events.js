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

async function verify() {
  loadEnv();
  
  const accountId = process.env.ACC || process.env.NR_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NR_USER_KEY;
  const clusterName = 'msk-cluster-1749192934433';
  
  console.log(`\n🔍 Verifying MSK Events for: ${clusterName}\n`);
  
  const query = `FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample 
    SELECT count(*) 
    WHERE provider.clusterName = '${clusterName}' OR entityName LIKE '%${clusterName}%' 
    SINCE 10 minutes ago 
    FACET eventType`;
  
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
    
    const results = response.data?.data?.actor?.account?.nrql?.results;
    if (results && results.length > 0) {
      console.log('✅ Found MSK Events:');
      results.forEach(result => {
        console.log(`   ${result.facet}: ${result.count} events`);
      });
      
      // Check for entities
      console.log('\n🔍 Checking for entity synthesis...');
      const entityQuery = `FROM Entity WHERE name LIKE '%${clusterName}%' SINCE 10 minutes ago`;
      const entityGraphQL = {
        query: `
          {
            actor {
              account(id: ${accountId}) {
                nrql(query: "${entityQuery.replace(/"/g, '\\"')}") {
                  results
                }
              }
            }
          }
        `
      };
      
      const entityResponse = await axios.post(
        'https://api.newrelic.com/graphql',
        entityGraphQL,
        {
          headers: {
            'Content-Type': 'application/json',
            'API-Key': apiKey
          }
        }
      );
      
      const entityResults = entityResponse.data?.data?.actor?.account?.nrql?.results;
      if (entityResults && entityResults.length > 0 && entityResults[0].count > 0) {
        console.log(`✅ Found ${entityResults[0].count} entities!`);
        console.log('\n🎉 Success! Entities should be visible in the UI');
      } else {
        console.log('⏳ No entities yet - may take 2-5 minutes for synthesis');
      }
    } else {
      console.log('❌ No MSK events found');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

verify();