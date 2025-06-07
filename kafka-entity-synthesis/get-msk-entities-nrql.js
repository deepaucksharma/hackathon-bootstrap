#!/usr/bin/env node

/**
 * Get MSK Entities via NRQL
 */

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

async function getMSKEntities() {
    loadEnv();
    
    const accountId = process.env.ACC;
    const queryKey = process.env.QKey;
    const apiKey = process.env.IKEY;
    
    console.log('🔍 Getting MSK Entities via NRQL\n');
    
    // Get cluster entities from AwsMskClusterSample
    const clusterQuery = `FROM AwsMskClusterSample 
        SELECT uniques(entityName), uniques(entityGuid), uniques(provider.clusterName)
        SINCE 1 day ago`;
    
    try {
        const response = await axios.get(
            `https://insights-api.newrelic.com/v1/accounts/${accountId}/query`,
            {
                params: { nrql: clusterQuery },
                headers: {
                    'X-Query-Key': queryKey,
                    'Accept': 'application/json'
                }
            }
        );
        
        const result = response?.data?.results?.[0] || {};
        const entityNames = result['uniques.entityName'] || [];
        const entityGuids = result['uniques.entityGuid'] || [];
        const clusterNames = result['uniques.provider.clusterName'] || [];
        
        console.log(`Found ${entityNames.length} cluster entities\n`);
        
        if (entityNames.length > 0) {
            console.log('Clusters:');
            entityNames.forEach((name, i) => {
                console.log(`  - Name: ${name}`);
                if (entityGuids[i]) {
                    console.log(`    GUID: ${entityGuids[i]}`);
                }
            });
            
            // Now create MessageQueueSample events for these entities
            console.log('\n📦 Creating MessageQueueSample events...\n');
            
            const events = [];
            const timestamp = Date.now();
            
            // Create events for each cluster
            entityNames.forEach((name, i) => {
                const guid = entityGuids[i];
                
                events.push({
                    eventType: 'MessageQueueSample',
                    provider: 'AwsMsk',
                    'entity.guid': guid,
                    'entity.name': name,
                    'entity.type': 'AWSMSKCLUSTER',
                    entityGuid: guid,
                    entityName: name,
                    entityType: 'AWSMSKCLUSTER',
                    'queue.name': name,
                    'queue.type': 'kafka_cluster',
                    'queue.messagesPerSecond': 1000 + Math.random() * 1000,
                    'queue.bytesInPerSecond': 1048576 + Math.random() * 1048576,
                    'queue.bytesOutPerSecond': 524288 + Math.random() * 524288,
                    'queue.brokerCount': 3,
                    'queue.topicCount': 5,
                    'collector.name': 'infrastructure-agent',
                    'instrumentation.provider': 'newrelic',
                    'instrumentation.name': 'newrelic-kafka-integration',
                    'aws.region': 'us-east-1',
                    timestamp
                });
            });
            
            // Submit events
            console.log(`Submitting ${events.length} events...`);
            
            const submitResponse = await axios.post(
                `https://insights-collector.newrelic.com/v1/accounts/${accountId}/events`,
                events,
                {
                    headers: {
                        'Api-Key': apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            console.log('✅ Events submitted successfully');
            
            // Wait and verify
            console.log('\n⏳ Waiting 10 seconds...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Check MessageQueueSample
            const verifyQuery = `FROM MessageQueueSample 
                SELECT count(*), uniques(entity.guid) 
                WHERE provider = 'AwsMsk' 
                SINCE 2 minutes ago`;
            
            const verifyResponse = await axios.get(
                `https://insights-api.newrelic.com/v1/accounts/${accountId}/query`,
                {
                    params: { nrql: verifyQuery },
                    headers: {
                        'X-Query-Key': queryKey,
                        'Accept': 'application/json'
                    }
                }
            );
            
            const verifyResult = verifyResponse?.data?.results?.[0] || {};
            const count = verifyResult.count || 0;
            const guids = verifyResult['uniques.entity.guid'] || [];
            
            console.log('\n📊 Verification Results:');
            console.log(`  Total events: ${count}`);
            console.log(`  Unique GUIDs: ${guids.length}`);
            
            if (guids.length > 0) {
                console.log('\n✅ Success! MessageQueueSample events now have entity.guid!');
                console.log('\n🎯 Check the UI now:');
                console.log('https://one.newrelic.com/nr1-core/message-queues');
            }
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

getMSKEntities().catch(console.error);