#!/usr/bin/env node

/**
 * Simple test runner for Entity Synthesis Platform
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

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
  
  // Map to expected names
  process.env.NEW_RELIC_ACCOUNT_ID = process.env.NR_ACCOUNT_ID || process.env.ACC;
  process.env.NEW_RELIC_INSERT_KEY = process.env.NR_INSERT_KEY || process.env.IKEY;
  process.env.NEW_RELIC_USER_KEY = process.env.NR_USER_KEY || process.env.UKEY;
  process.env.NEW_RELIC_QUERY_KEY = process.env.NR_QUERY_KEY || process.env.QKey;
}

// Simple payload based on our validated schema
function createTestPayload() {
  const timestamp = Date.now();
  const clusterName = `test-cluster-${timestamp}`;
  
  return {
    eventType: "AwsMskBrokerSample",
    timestamp: timestamp,
    entityName: `1:${clusterName}`,
    entityGuid: Buffer.from(`${process.env.NEW_RELIC_ACCOUNT_ID}|INFRA|AWS_KAFKA_BROKER|${timestamp}`).toString('base64'),
    entityId: timestamp,
    
    // Critical for UI visibility
    "collector.name": "cloud-integrations",
    "instrumentation.provider": "aws",
    provider: "AwsMskBroker",
    
    // Account mapping
    providerAccountId: process.env.NEW_RELIC_ACCOUNT_ID,
    providerAccountName: "Test Account",
    providerExternalId: "123456789012",
    
    // AWS context
    awsAccountId: "123456789012",
    awsRegion: "us-east-1",
    
    // Entity specific
    "provider.brokerId": "1",
    "provider.clusterName": clusterName,
    
    // Metrics with all 5 aggregations
    "provider.bytesInPerSec.Sum": 150000.0,
    "provider.bytesInPerSec.Average": 2500.0,
    "provider.bytesInPerSec.Maximum": 5000.0,
    "provider.bytesInPerSec.Minimum": 1000.0,
    "provider.bytesInPerSec.SampleCount": 60
  };
}

// Submit to New Relic
async function submitPayload(payload) {
  const url = `https://insights-collector.newrelic.com/v1/accounts/${process.env.NEW_RELIC_ACCOUNT_ID}/events`;
  
  try {
    const response = await axios.post(url, [payload], {
      headers: {
        'Content-Type': 'application/json',
        'X-Insert-Key': process.env.NEW_RELIC_INSERT_KEY
      }
    });
    
    return {
      success: true,
      status: response.status,
      statusText: response.statusText
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: error.response?.status
    };
  }
}

// Verify entity creation
async function verifyEntity(entityName) {
  const query = `
    FROM AwsMskBrokerSample 
    SELECT count(*) 
    WHERE entityName = '${entityName}' 
    SINCE 5 minutes ago
  `;
  
  const nrqlUrl = `https://api.newrelic.com/graphql`;
  const graphqlQuery = {
    query: `
      {
        actor {
          account(id: ${process.env.NEW_RELIC_ACCOUNT_ID}) {
            nrql(query: "${query.replace(/\n/g, ' ').replace(/"/g, '\\"')}") {
              results
            }
          }
        }
      }
    `
  };
  
  try {
    const response = await axios.post(nrqlUrl, graphqlQuery, {
      headers: {
        'Content-Type': 'application/json',
        'API-Key': process.env.NEW_RELIC_QUERY_KEY || process.env.NEW_RELIC_USER_KEY
      }
    });
    
    const count = response.data?.data?.actor?.account?.nrql?.results?.[0]?.count || 0;
    return {
      found: count > 0,
      count: count
    };
  } catch (error) {
    console.error('Verification error:', error.message);
    return { found: false, error: error.message };
  }
}

// Main execution
async function main() {
  console.log('🚀 Entity Synthesis Simple Test');
  console.log('================================\n');
  
  // Load environment
  loadEnv();
  
  // Check required vars
  const required = ['NEW_RELIC_ACCOUNT_ID', 'NEW_RELIC_INSERT_KEY'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.error('Please check your .env file');
    process.exit(1);
  }
  
  console.log('✅ Environment configured');
  console.log(`   Account: ${process.env.NEW_RELIC_ACCOUNT_ID}`);
  
  // Create payload
  console.log('\n📦 Creating test payload...');
  const payload = createTestPayload();
  console.log(`   Entity: ${payload.entityName}`);
  console.log(`   Type: ${payload.eventType}`);
  
  // Submit
  console.log('\n📤 Submitting to New Relic...');
  const result = await submitPayload(payload);
  
  if (result.success) {
    console.log(`   ✅ Success: ${result.status} ${result.statusText}`);
    
    // Wait a bit for processing
    console.log('\n⏳ Waiting 30 seconds for entity synthesis...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Verify
    console.log('\n🔍 Verifying entity creation...');
    const verification = await verifyEntity(payload.entityName);
    
    if (verification.found) {
      console.log(`   ✅ Entity created successfully!`);
      console.log(`   Count: ${verification.count} events`);
      console.log('\n🎉 Test PASSED!');
    } else {
      console.log(`   ❌ Entity not found`);
      console.log('\n😞 Test FAILED - Entity not synthesized');
    }
  } else {
    console.log(`   ❌ Failed: ${result.error}`);
    console.log(`   Status: ${result.status}`);
    console.log('\n😞 Test FAILED - Submission error');
  }
  
  console.log('\n📊 Next steps:');
  console.log('   1. Check Entity Explorer for the entity');
  console.log('   2. Check Queues & Streams UI for visibility');
  console.log('   3. Run more comprehensive tests');
}

// Run the test
main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});