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

async function compare() {
  loadEnv();
  
  const accountId = process.env.ACC || process.env.NR_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NR_USER_KEY;
  
  console.log('🔍 Comparing with Working MSK Entities');
  console.log('=====================================\n');
  
  // First, get a working entity
  console.log('1️⃣ Finding a working MSK entity...');
  const workingEntitiesQuery = `FROM AwsMskBrokerSample SELECT * WHERE entityName IS NOT NULL LIMIT 1 SINCE 1 day ago`;
  const workingEntities = await runQuery(workingEntitiesQuery, accountId, apiKey);
  
  if (workingEntities.length > 0) {
    console.log('✅ Found working entity:');
    const workingEntity = workingEntities[0];
    console.log(`   Entity: ${workingEntity.entityName}`);
    console.log(`   Provider: ${workingEntity.provider}`);
    console.log(`   Collector: ${workingEntity['collector.name']}`);
    
    // Get all fields from working entity
    const workingFields = Object.keys(workingEntity).sort();
    console.log(`\n   Total fields: ${workingFields.length}`);
    
    // Now get our event
    console.log('\n2️⃣ Getting our ui-compatible event...');
    const ourQuery = `FROM AwsMskBrokerSample SELECT * WHERE provider.clusterName = 'ui-compatible-cluster-1749258070413' LIMIT 1 SINCE 30 minutes ago`;
    const ourEvents = await runQuery(ourQuery, accountId, apiKey);
    
    if (ourEvents.length > 0) {
      console.log('✅ Found our event');
      const ourEvent = ourEvents[0];
      const ourFields = Object.keys(ourEvent).sort();
      console.log(`   Total fields: ${ourFields.length}`);
      
      // Compare fields
      console.log('\n3️⃣ Field Comparison:');
      console.log('===================');
      
      const missingInOurs = workingFields.filter(f => !ourFields.includes(f));
      const extraInOurs = ourFields.filter(f => !workingFields.includes(f));
      
      if (missingInOurs.length > 0) {
        console.log('\n❌ CRITICAL: Fields in working entity but MISSING in ours:');
        missingInOurs.forEach(field => {
          const value = workingEntity[field];
          console.log(`   ${field}: ${JSON.stringify(value)}`);
        });
      }
      
      if (extraInOurs.length > 0) {
        console.log('\n➕ Extra fields in our event:');
        extraInOurs.forEach(field => {
          console.log(`   ${field}: ${JSON.stringify(ourEvent[field])}`);
        });
      }
      
      // Check specific critical fields
      console.log('\n4️⃣ Critical Field Values:');
      console.log('========================');
      
      const criticalFields = [
        'provider',
        'collector.name',
        'entityName',
        'entityGuid',
        'providerAccountId',
        'providerAccountName',
        'providerExternalId',
        'awsAccountId',
        'awsRegion'
      ];
      
      console.log('\nWorking Entity:');
      criticalFields.forEach(field => {
        if (workingEntity[field] !== undefined) {
          console.log(`   ${field}: ${JSON.stringify(workingEntity[field])}`);
        }
      });
      
      console.log('\nOur Event:');
      criticalFields.forEach(field => {
        if (ourEvent[field] !== undefined) {
          console.log(`   ${field}: ${JSON.stringify(ourEvent[field])}`);
        } else {
          console.log(`   ${field}: ❌ MISSING`);
        }
      });
      
      // Entity check
      console.log('\n5️⃣ Entity Creation Check:');
      const entityQuery = `FROM Entity WHERE name LIKE '%${workingEntity.entityName}%' SINCE 1 day ago`;
      const entities = await runQuery(entityQuery, accountId, apiKey);
      if (entities.length > 0 && entities[0].count > 0) {
        console.log(`✅ Working entity has ${entities[0].count} entities in Entity table`);
      } else {
        console.log('❌ Working entity has NO entities in Entity table');
      }
      
    } else {
      console.log('❌ Our event not found');
    }
  } else {
    console.log('❌ No working MSK entities found in this account');
  }
  
  console.log('\n📌 Recommendations:');
  console.log('==================');
  console.log('1. Add any missing critical fields identified above');
  console.log('2. Ensure provider value matches exactly (case-sensitive)');
  console.log('3. Check if providerExternalId is required');
  console.log('4. Verify collector.name value matches working entities');
}

compare();