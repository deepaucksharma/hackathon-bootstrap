#!/usr/bin/env node

// Test script to verify the MSK integration is producing the correct output format
// This runs locally without needing NRDB access

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function testMSKOutput() {
    console.log('================================================');
    console.log('LOCAL MSK OUTPUT VERIFICATION');
    console.log('================================================\n');

    console.log('1. Checking Latest Pod Output');
    console.log('=============================\n');

    try {
        // Get the latest pod
        const { stdout: podName } = await execPromise(
            'kubectl get pods -l app=nri-kafka-msk-custom -n newrelic --sort-by=.metadata.creationTimestamp -o jsonpath="{.items[-1].metadata.name}"'
        );

        if (!podName) {
            console.error('❌ No nri-kafka-msk-custom pod found');
            return;
        }

        console.log(`📦 Pod: ${podName}\n`);

        // Check if MSK shim initialized
        console.log('2. MSK Shim Initialization');
        console.log('==========================\n');

        const { stdout: initLogs } = await execPromise(
            `kubectl logs ${podName} -n newrelic | grep -i "msk shim\\|initializing msk" | head -5`
        );

        if (initLogs) {
            console.log('✅ MSK Shim Initialized:');
            console.log(initLogs);
        } else {
            console.log('❌ No MSK initialization logs found');
        }

        // Extract and analyze JSON output
        console.log('\n3. JSON Output Analysis');
        console.log('======================\n');

        const { stdout: jsonOutput } = await execPromise(
            `kubectl logs ${podName} -n newrelic | grep '^{.*"name":"com.newrelic.kafka".*}$' | tail -1`
        );

        if (!jsonOutput) {
            console.error('❌ No JSON output found');
            return;
        }

        const data = JSON.parse(jsonOutput);
        console.log(`✅ Found integration output with ${data.data.length} entities\n`);

        // Analyze entities
        const entityTypes = {};
        const mskEntities = [];
        const standardEntities = [];

        data.data.forEach(entity => {
            const eventType = entity.metrics?.[0]?.event_type || 'Unknown';
            entityTypes[eventType] = (entityTypes[eventType] || 0) + 1;

            if (eventType.startsWith('AwsMsk')) {
                mskEntities.push(entity);
            } else {
                standardEntities.push(entity);
            }
        });

        console.log('4. Entity Type Summary');
        console.log('=====================\n');
        
        Object.entries(entityTypes).forEach(([type, count]) => {
            const icon = type.startsWith('AwsMsk') ? '✅' : '📊';
            console.log(`${icon} ${type}: ${count} entities`);
        });

        // Verify MSK entities
        console.log('\n5. MSK Entity Verification');
        console.log('=========================\n');

        if (mskEntities.length > 0) {
            console.log(`✅ Found ${mskEntities.length} MSK entities\n`);

            // Check first MSK broker entity
            const mskBroker = mskEntities.find(e => e.entity.type === 'AwsMskBrokerSample');
            if (mskBroker) {
                console.log('📊 Sample MSK Broker Entity:');
                console.log(`   Name: ${mskBroker.entity.name}`);
                console.log(`   Type: ${mskBroker.entity.type}`);
                
                const metrics = mskBroker.metrics[0];
                console.log(`   Entity GUID: ${metrics['entity.guid']}`);
                console.log(`   Cluster: ${metrics['provider.clusterName']}`);
                console.log(`   Broker ID: ${metrics['provider.brokerId']}`);
                console.log(`   Region: ${metrics['provider.region']}`);
                
                // Check for MSK-specific metrics
                const mskMetrics = Object.keys(metrics).filter(k => k.includes('aws.msk'));
                console.log(`\n   MSK Metrics (${mskMetrics.length} found):`);
                mskMetrics.slice(0, 5).forEach(m => {
                    console.log(`     - ${m}: ${metrics[m]}`);
                });
            }

            // Check cluster entity
            const mskCluster = mskEntities.find(e => e.entity.type === 'AwsMskClusterSample');
            if (mskCluster) {
                console.log('\n📊 MSK Cluster Entity:');
                console.log(`   Name: ${mskCluster.entity.name}`);
                console.log(`   GUID: ${mskCluster.metrics[0]['entity.guid']}`);
            }
        } else {
            console.log('❌ No MSK entities found in output');
        }

        // Verify GUID format
        console.log('\n6. Entity GUID Format Check');
        console.log('===========================\n');

        const guids = mskEntities
            .map(e => e.metrics[0]['entity.guid'])
            .filter(Boolean);

        if (guids.length > 0) {
            console.log('📋 MSK Entity GUIDs:');
            guids.forEach(guid => {
                const parts = guid.split('|');
                const valid = parts.length === 4 && 
                             parts[1] === 'INFRA' && 
                             parts[2].startsWith('AWSMSK');
                
                console.log(`   ${valid ? '✅' : '❌'} ${guid}`);
                if (valid) {
                    console.log(`      Account: ${parts[0]}, Type: ${parts[2]}`);
                }
            });
        }

        // Summary
        console.log('\n\n================================================');
        console.log('VERIFICATION SUMMARY');
        console.log('================================================\n');

        const hasMSKEntities = mskEntities.length > 0;
        const hasValidGUIDs = guids.length > 0 && guids.every(g => {
            const parts = g.split('|');
            return parts.length === 4 && parts[1] === 'INFRA' && parts[2].startsWith('AWSMSK');
        });

        console.log(`MSK Shim Active: ${hasMSKEntities ? '✅ YES' : '❌ NO'}`);
        console.log(`MSK Entities Created: ${hasMSKEntities ? '✅ YES' : '❌ NO'}`);
        console.log(`Valid GUID Format: ${hasValidGUIDs ? '✅ YES' : '❌ NO'}`);
        console.log(`Total MSK Entities: ${mskEntities.length}`);

        if (hasMSKEntities && hasValidGUIDs) {
            console.log('\n✨ SUCCESS! MSK shim is working correctly.');
            console.log('   The integration is transforming data to AWS MSK format.');
            console.log('   You can now verify this data in New Relic NRDB.');
        } else {
            console.log('\n⚠️  Issues detected. Check the output above for details.');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.stderr) {
            console.error('   stderr:', error.stderr);
        }
    }
}

// Run the test
console.log('Testing MSK integration output locally...\n');
testMSKOutput().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});