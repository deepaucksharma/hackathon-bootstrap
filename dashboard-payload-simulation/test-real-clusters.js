#!/usr/bin/env node

/**
 * Test with Real Kafka Clusters
 * 
 * This script tests our entity synthesis with actual cluster names
 * from the environment, including Strimzi and standard Kafka deployments
 */

const { ExactWorkingFormatReplicator } = require('./exact-working-format-replicator.js');
const { ContinuousExactFormatStreamer } = require('./continuous-exact-format-streamer.js');
const { AutomatedVerificationSuite } = require('./automated-verification-suite.js');

async function main() {
    console.log('🎯 Testing Entity Synthesis with Real Clusters');
    console.log('=============================================\n');
    
    // Common cluster names in the environment
    const realClusters = [
        'kafka',                          // Standard Kafka deployment
        'strimzi-kafka-cluster',         // Common Strimzi name
        'my-cluster',                    // Another common name
        'production-kafka',              // Production naming
        'strimzi-production-kafka'       // From earlier references
    ];
    
    const replicator = new ExactWorkingFormatReplicator();
    
    console.log('📊 Submitting events for real clusters...\n');
    
    for (const clusterName of realClusters) {
        console.log(`\n🚀 Testing cluster: ${clusterName}`);
        console.log('-'.repeat(40));
        
        try {
            // Submit events
            await replicator.replicateWorkingFormat(clusterName);
            
            // Wait a bit between clusters
            await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error) {
            console.error(`❌ Error with ${clusterName}:`, error.message);
        }
    }
    
    // Wait for entity synthesis
    console.log('\n⏳ Waiting 60 seconds for entity synthesis...');
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    // Run verification
    console.log('\n🔍 Running verification...\n');
    const verifier = new AutomatedVerificationSuite();
    await verifier.runVerification(realClusters);
    
    // Also check what's actually in NRDB
    console.log('\n📊 Checking all MSK data in NRDB...');
    const allClustersQuery = `FROM AwsMskClusterSample SELECT uniques(provider.clusterName) SINCE 1 hour ago`;
    const results = await verifier.runQuery(allClustersQuery);
    
    if (results[0]) {
        const clusters = results[0]['uniques.provider.clusterName'] || [];
        console.log(`\nFound ${clusters.length} clusters with recent data:`, clusters.join(', '));
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };