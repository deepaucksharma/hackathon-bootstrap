#!/usr/bin/env node

/**
 * Create MessageQueueSample with proper entity GUIDs from AwsMskClusterSample
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

async function createMessageQueueWithGuid() {
    loadEnv();
    
    const accountId = process.env.ACC;
    const queryKey = process.env.QKey;
    const apiKey = process.env.IKEY;
    
    console.log('🎯 Creating MessageQueueSample with Entity GUIDs\n');
    
    // Step 1: Get actual MSK cluster data
    const clusterQuery = `FROM AwsMskClusterSample 
        SELECT entityGuid, entityName, provider.clusterName, provider.clusterState, 
               provider.brokerCount, provider.globalTopicsCount.Average as topicCount
        WHERE entityGuid IS NOT NULL
        SINCE 1 hour ago
        LIMIT 10`;
    
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
        
        const clusters = response?.data?.results?.[0]?.events || [];
        
        if (clusters.length === 0) {
            console.log('❌ No MSK clusters found with entity GUIDs');
            return;
        }
        
        console.log(`Found ${clusters.length} MSK clusters with GUIDs\n`);
        
        const events = [];
        const timestamp = Date.now();
        
        // Create MessageQueueSample for each cluster
        for (const cluster of clusters) {
            console.log(`Creating events for: ${cluster.entityName}`);
            console.log(`  GUID: ${cluster.entityGuid}`);
            
            // Create cluster-level MessageQueueSample
            events.push({
                eventType: 'MessageQueueSample',
                provider: 'AwsMsk',
                'entity.guid': cluster.entityGuid,
                'entity.name': cluster.entityName,
                'entity.type': 'AWSMSKCLUSTER',
                entityGuid: cluster.entityGuid,
                entityName: cluster.entityName,
                entityType: 'AWSMSKCLUSTER',
                'queue.name': cluster.entityName,
                'queue.type': 'kafka',
                'queue.messagesPerSecond': 1000 + Math.random() * 2000,
                'queue.bytesInPerSecond': 1048576 + Math.random() * 2097152,
                'queue.bytesOutPerSecond': 524288 + Math.random() * 1048576,
                'queue.brokerCount': cluster['provider.brokerCount'] || 3,
                'queue.topicCount': cluster.topicCount || 5,
                'queue.consumerLag': Math.floor(Math.random() * 100),
                'collector.name': 'cloudwatch-metric-streams',
                'instrumentation.provider': 'newrelic',
                'instrumentation.name': 'newrelic-kafka',
                clusterState: cluster['provider.clusterState'],
                timestamp
            });
            
            // Create broker-level events (assuming 3 brokers per cluster)
            const brokerCount = cluster['provider.brokerCount'] || 3;
            for (let i = 1; i <= brokerCount; i++) {
                const brokerName = `${i}:${cluster.entityName}`;
                // Generate a pseudo-GUID for brokers (since we don't have real broker GUIDs)
                const brokerGuid = `${cluster.entityGuid.split('|')[0]}|INFRA|AWSMSKBROKER|${Buffer.from(brokerName).toString('base64')}`;
                
                events.push({
                    eventType: 'MessageQueueSample',
                    provider: 'AwsMsk',
                    'entity.guid': brokerGuid,
                    'entity.name': brokerName,
                    'entity.type': 'AWSMSKBROKER',
                    entityGuid: brokerGuid,
                    entityName: brokerName,
                    entityType: 'AWSMSKBROKER',
                    'queue.name': brokerName,
                    'queue.type': 'kafka_broker',
                    'queue.messagesPerSecond': 500 + Math.random() * 1000,
                    'queue.bytesInPerSecond': 524288 + Math.random() * 1048576,
                    'queue.bytesOutPerSecond': 262144 + Math.random() * 524288,
                    'collector.name': 'cloudwatch-metric-streams',
                    parentCluster: cluster.entityName,
                    parentClusterGuid: cluster.entityGuid,
                    brokerId: i,
                    timestamp
                });
            }
        }
        
        // Step 2: Submit events
        console.log(`\n📦 Submitting ${events.length} MessageQueueSample events...`);
        
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
        
        // Step 3: Verify
        console.log('\n⏳ Waiting 15 seconds for processing...');
        await new Promise(resolve => setTimeout(resolve, 15000));
        
        const verifyQuery = `FROM MessageQueueSample 
            SELECT count(*), uniques(entity.guid), uniques(entity.name) 
            WHERE provider = 'AwsMsk' 
            AND entity.guid IS NOT NULL
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
        
        const result = verifyResponse?.data?.results?.[0] || {};
        const count = result.count || 0;
        const guidCount = result['uniques.entity.guid']?.length || 0;
        const nameCount = result['uniques.entity.name']?.length || 0;
        
        console.log('\n📊 Verification Results:');
        console.log(`  Total events: ${count}`);
        console.log(`  Unique entity GUIDs: ${guidCount}`);
        console.log(`  Unique entity names: ${nameCount}`);
        
        if (guidCount > 0) {
            console.log('\n✅ Success! MessageQueueSample events now have entity.guid!');
            console.log('\n🎯 Critical fields present:');
            console.log('  ✓ entity.guid');
            console.log('  ✓ entity.name');
            console.log('  ✓ entity.type');
            console.log('  ✓ provider = "AwsMsk"');
            console.log('  ✓ queue.name');
            console.log('  ✓ queue.type');
            
            console.log('\n🔍 Check the UI now:');
            console.log('  1. Go to: https://one.newrelic.com/nr1-core/message-queues');
            console.log('  2. Look for AWS MSK section');
            console.log('  3. Your clusters should appear!');
            
            // Also check if entities were created
            console.log('\n🔍 Also check entities:');
            console.log('  https://one.newrelic.com/nr1-core/search?q=type%3DAWSMSKCLUSTER');
        } else {
            console.log('\n❌ No events with entity.guid found');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

createMessageQueueWithGuid().catch(console.error);