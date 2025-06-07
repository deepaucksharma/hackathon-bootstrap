#!/usr/bin/env node

/**
 * Query entities using NerdGraph
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

async function queryEntitiesViaGuid(guid) {
  const apiKey = process.env.UKEY || process.env.NR_USER_KEY;
  
  const query = `
    {
      actor {
        entity(guid: "${guid}") {
          name
          guid
          type
          domain
          entityType
          reporting
          tags {
            key
            values
          }
          relationships {
            source {
              entity {
                guid
                name
                type
              }
            }
            target {
              entity {
                guid
                name
                type
              }
            }
            type
          }
          ... on ApmApplicationEntity {
            alertSeverity
          }
          ... on InfrastructureAwsKafkaBrokerEntity {
            alertSeverity
            reporting
          }
        }
      }
    }
  `;
  
  try {
    const response = await axios.post(
      'https://api.newrelic.com/graphql',
      { query },
      {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': apiKey
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error querying entity:', error.message);
    return null;
  }
}

async function searchKafkaEntities() {
  const apiKey = process.env.UKEY || process.env.NR_USER_KEY;
  
  const query = `
    {
      actor {
        entitySearch(
          query: "domain = 'INFRA' AND type IN ('AWS_KAFKA_CLUSTER', 'AWS_KAFKA_BROKER', 'AWS_KAFKA_TOPIC', 'KAFKA_CLUSTER', 'KAFKA_BROKER', 'KAFKA_TOPIC')"
        ) {
          count
          results {
            entities {
              guid
              name
              type
              domain
              entityType
              reporting
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
  
  try {
    const response = await axios.post(
      'https://api.newrelic.com/graphql',
      { query },
      {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': apiKey
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error searching entities:', error.message);
    return null;
  }
}

async function main() {
  loadEnv();
  
  console.log('🔍 Querying Kafka Entities via NerdGraph');
  console.log('=' .repeat(60));
  
  // Search for Kafka entities
  console.log('\n📊 Searching for Kafka entities...');
  const searchResult = await searchKafkaEntities();
  
  if (searchResult?.data?.actor?.entitySearch?.results?.entities) {
    const entities = searchResult.data.actor.entitySearch.results.entities;
    console.log(`\nFound ${entities.length} Kafka entities:\n`);
    
    entities.forEach((entity, index) => {
      console.log(`[${index + 1}] ${entity.name}`);
      console.log(`    Type: ${entity.type}`);
      console.log(`    GUID: ${entity.guid}`);
      console.log(`    Reporting: ${entity.reporting}`);
      if (entity.tags && entity.tags.length > 0) {
        console.log(`    Tags:`);
        entity.tags.forEach(tag => {
          console.log(`      - ${tag.key}: ${tag.values.join(', ')}`);
        });
      }
      console.log('');
    });
    
    // Query details for first entity if found
    if (entities.length > 0) {
      console.log('\n📋 Detailed view of first entity:');
      console.log('-' .repeat(60));
      const detailResult = await queryEntitiesViaGuid(entities[0].guid);
      if (detailResult?.data?.actor?.entity) {
        console.log(JSON.stringify(detailResult.data.actor.entity, null, 2));
      }
    }
  } else {
    console.log('No Kafka entities found');
  }
  
  // Also try our specific GUIDs from earlier tests
  console.log('\n📋 Checking our test entity GUIDs:');
  const testGuids = [
    'MzYzMDA3MnxJTkZSQXxBV1NfS0FGS0FfQ0xVU1RFUnxmMTcxMjc5NmYxNzE3ZjBl', // Cluster
    'MzYzMDA3MnxJTkZSQXxBV1NfS0FGS0FfQlJPS0VSfDVlNmNmZWFjOWFjNDA0M2I=', // Broker
    'MzYzMDA3MnxJTkZSQXxBV1NfS0FGS0FfVE9QSUN8MjRkZGU2MjY4ZmI2NWM2OA==' // Topic
  ];
  
  for (const guid of testGuids) {
    console.log(`\nChecking GUID: ${guid.substring(0, 20)}...`);
    const result = await queryEntitiesViaGuid(guid);
    if (result?.data?.actor?.entity) {
      const entity = result.data.actor.entity;
      console.log(`✅ Found: ${entity.name} (${entity.type})`);
    } else {
      console.log('❌ Not found or no access');
    }
  }
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});