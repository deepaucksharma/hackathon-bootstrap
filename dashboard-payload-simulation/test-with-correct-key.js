#!/usr/bin/env node

/**
 * Test MSK entity creation with correct API key
 */

require('dotenv').config();
const axios = require('axios');

async function testEventSubmission() {
    const ACCOUNT_ID = process.env.ACC;
    const INGEST_KEY = process.env.IKEY;
    const QUERY_KEY = process.env.QKey;
    const USER_KEY = process.env.UKEY;
    
    const clusterName = `test-key-${Date.now()}`;
    const timestamp = Date.now();
    
    console.log('🔐 Testing API Key Permissions\n');
    console.log(`Cluster: ${clusterName}\n`);
    
    // Create a simple MSK event
    const events = [{
        eventType: 'AwsMskClusterSample',
        entityName: clusterName,
        entityType: 'AWSMSKCLUSTER',
        provider: 'AwsMskCluster',
        'provider.clusterName': clusterName,
        'provider.activeControllerCount.Sum': 1,
        timestamp
    }];
    
    // Test 1: Try with IKEY
    console.log('1️⃣ Testing with IKEY (Ingest Key)...');
    try {
        const response = await axios.post(
            `https://insights-collector.newrelic.com/v1/accounts/${ACCOUNT_ID}/events`,
            events,
            {
                headers: {
                    'Api-Key': INGEST_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('   ✅ Success! Events submitted with IKEY');
        
        // Wait and verify
        console.log('\n   ⏳ Waiting 10 seconds...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Check if event exists
        const queryResponse = await axios.get(
            `https://insights-api.newrelic.com/v1/accounts/${ACCOUNT_ID}/query`,
            {
                params: { 
                    nrql: `FROM AwsMskClusterSample SELECT count(*) WHERE provider.clusterName = '${clusterName}' SINCE 1 minute ago` 
                },
                headers: {
                    'X-Query-Key': QUERY_KEY,
                    'Accept': 'application/json'
                }
            }
        );
        
        const count = queryResponse?.data?.results?.[0]?.count || 0;
        console.log(`   Events found: ${count > 0 ? '✅' : '❌'} (${count})`);
        
        // Check for entity
        const entityResponse = await axios.post(
            'https://api.newrelic.com/graphql',
            {
                query: `{
                    actor {
                        entitySearch(query: "domain='INFRA' AND type='AWSMSKCLUSTER' AND name='${clusterName}'") {
                            count
                        }
                    }
                }`
            },
            {
                headers: {
                    'Api-Key': USER_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        const entityCount = entityResponse?.data?.data?.actor?.entitySearch?.count || 0;
        console.log(`   Entity created: ${entityCount > 0 ? '✅' : '❌'} (${entityCount})\n`);
        
    } catch (error) {
        console.log(`   ❌ Failed: ${error.response?.data?.error || error.message}\n`);
    }
    
    // Test 2: Try different headers
    console.log('2️⃣ Testing with alternative headers...');
    const altClusterName = `test-alt-${Date.now()}`;
    const altEvents = [{
        eventType: 'AwsMskClusterSample',
        entityName: altClusterName,
        entityType: 'AWSMSKCLUSTER',
        provider: 'AwsMskCluster',
        'provider.clusterName': altClusterName,
        timestamp: Date.now()
    }];
    
    try {
        const response = await axios.post(
            `https://insights-collector.newrelic.com/v1/accounts/${ACCOUNT_ID}/events`,
            altEvents,
            {
                headers: {
                    'X-Insert-Key': INGEST_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('   ✅ Success with X-Insert-Key header');
    } catch (error) {
        console.log(`   ❌ Failed with X-Insert-Key: ${error.response?.status || error.message}`);
    }
    
    // Summary
    console.log('\n📋 Summary:');
    console.log('===========\n');
    console.log('The issue is that direct event submission does not trigger entity synthesis.');
    console.log('Events are stored but entities are not created from them.\n');
    console.log('Entities must be created through:');
    console.log('1. Infrastructure agent with nri-kafka integration');
    console.log('2. AWS CloudWatch Metric Streams integration');
    console.log('3. Other official New Relic integrations\n');
    console.log('Direct event submission via API cannot create entities that appear in the UI.');
}

testEventSubmission().catch(console.error);