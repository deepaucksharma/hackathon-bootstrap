#!/usr/bin/env node

/**
 * Create MessageQueueSample continuously for MSK clusters
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ContinuousMessageQueueSubmitter {
    constructor() {
        this.accountId = process.env.ACC;
        this.apiKey = process.env.IKEY;
        this.queryKey = process.env.QKey;
        this.knownClusters = [
            {
                entityName: 'continuous-test-cluster',
                entityGuid: `${process.env.ACC}|INFRA|AWSMSKCLUSTER|Y29udGludW91cy10ZXN0LWNsdXN0ZXI=`,
                clusterName: 'continuous-test-cluster',
                brokerCount: 3
            },
            {
                entityName: 'exact-msk-test',
                entityGuid: `${process.env.ACC}|INFRA|AWSMSKCLUSTER|ZXhhY3QtbXNrLXRlc3Q=`,
                clusterName: 'exact-msk-test',
                brokerCount: 3
            },
            {
                entityName: 'infra-sim-v2',
                entityGuid: 'MzYzMDA3MnxJTkZSQXxBV1NNU0tDTFVTVEVSfDlhNWFjMDM2N2JkZjVjYzA=', // Note: This GUID appears to be base64 encoded differently
                clusterName: 'infra-sim-v2',
                brokerCount: 3
            }
        ];
    }

    async submitBatch() {
        const events = [];
        const timestamp = Date.now();
        
        // Create events for each cluster
        for (const cluster of this.knownClusters) {
            // Cluster-level MessageQueueSample
            events.push({
                eventType: 'MessageQueueSample',
                provider: 'AwsMsk',
                'entity.guid': cluster.entityGuid,
                'entity.name': cluster.entityName,
                'entity.type': 'AWSMSKCLUSTER',
                entityGuid: cluster.entityGuid,
                entityName: cluster.entityName,
                entityType: 'AWSMSKCLUSTER',
                'queue.name': cluster.clusterName,
                'queue.type': 'kafka',
                'queue.messagesPerSecond': 1000 + Math.random() * 2000,
                'queue.bytesInPerSecond': 1048576 + Math.random() * 2097152,
                'queue.bytesOutPerSecond': 524288 + Math.random() * 1048576,
                'queue.brokerCount': cluster.brokerCount,
                'queue.topicCount': 5 + Math.floor(Math.random() * 10),
                'queue.consumerLag': Math.floor(Math.random() * 100),
                'collector.name': 'cloudwatch-metric-streams',
                'instrumentation.provider': 'newrelic',
                'instrumentation.name': 'newrelic-kafka',
                timestamp
            });
            
            // Broker-level events
            for (let i = 1; i <= cluster.brokerCount; i++) {
                const brokerName = `${i}:${cluster.clusterName}`;
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
                    'queue.messagesPerSecond': 300 + Math.random() * 700,
                    'queue.bytesInPerSecond': 524288 + Math.random() * 1048576,
                    'queue.bytesOutPerSecond': 262144 + Math.random() * 524288,
                    'queue.consumerLag': Math.floor(Math.random() * 50),
                    'collector.name': 'cloudwatch-metric-streams',
                    parentCluster: cluster.clusterName,
                    parentClusterGuid: cluster.entityGuid,
                    brokerId: i,
                    timestamp
                });
            }
            
            // Topic events
            const topics = ['__consumer_offsets', '__amazon_msk_canary', 'test-topic-1', 'production-events', 'metrics-topic'];
            topics.forEach((topicName, idx) => {
                const fullTopicName = `${cluster.clusterName}:${topicName}`;
                const topicGuid = `${cluster.entityGuid.split('|')[0]}|INFRA|AWSMSKTOPIC|${Buffer.from(fullTopicName).toString('base64')}`;
                
                events.push({
                    eventType: 'MessageQueueSample',
                    provider: 'AwsMsk',
                    'entity.guid': topicGuid,
                    'entity.name': fullTopicName,
                    'entity.type': 'AWSMSKTOPIC',
                    entityGuid: topicGuid,
                    entityName: fullTopicName,
                    entityType: 'AWSMSKTOPIC',
                    'queue.name': topicName,
                    'queue.type': 'kafka_topic',
                    'queue.messagesPerSecond': 50 + Math.random() * 450,
                    'queue.bytesInPerSecond': 51200 + Math.random() * 204800,
                    'queue.partitionCount': 3,
                    'queue.replicationFactor': 3,
                    'collector.name': 'cloudwatch-metric-streams',
                    parentCluster: cluster.clusterName,
                    parentClusterGuid: cluster.entityGuid,
                    timestamp
                });
            });
        }
        
        // Submit events
        try {
            const response = await axios.post(
                `https://insights-collector.newrelic.com/v1/accounts/${this.accountId}/events`,
                events,
                {
                    headers: {
                        'Api-Key': this.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            console.log(`✅ Submitted ${events.length} events at ${new Date().toISOString()}`);
            return true;
        } catch (error) {
            console.error(`❌ Error submitting: ${error.message}`);
            return false;
        }
    }

    async verify() {
        console.log('\n🔍 Verifying MessageQueueSample data...');
        
        const query = `FROM MessageQueueSample 
            SELECT count(*), uniques(entity.guid), uniques(entity.name) 
            WHERE provider = 'AwsMsk' 
            AND entity.guid IS NOT NULL
            SINCE 5 minutes ago`;
        
        try {
            const response = await axios.get(
                `https://insights-api.newrelic.com/v1/accounts/${this.accountId}/query`,
                {
                    params: { nrql: query },
                    headers: {
                        'X-Query-Key': this.queryKey,
                        'Accept': 'application/json'
                    }
                }
            );
            
            const result = response?.data?.results?.[0] || {};
            const count = result.count || 0;
            const guidCount = result['uniques.entity.guid']?.length || 0;
            const nameCount = result['uniques.entity.name']?.length || 0;
            
            console.log(`  Total events: ${count}`);
            console.log(`  Unique entity GUIDs: ${guidCount}`);
            console.log(`  Unique entity names: ${nameCount}`);
            
            if (guidCount > 0) {
                console.log('\n✅ MessageQueueSample events with entity.guid are being created!');
                return true;
            }
            
            return false;
        } catch (error) {
            console.error(`  Error verifying: ${error.message}`);
            return false;
        }
    }

    async runContinuous(intervalSeconds = 30) {
        console.log(`🚀 Starting continuous MessageQueueSample submission\n`);
        console.log(`Submitting events every ${intervalSeconds} seconds`);
        console.log('Press Ctrl+C to stop\n');
        
        // Initial submission
        await this.submitBatch();
        
        // Verify after 15 seconds
        setTimeout(() => this.verify(), 15000);
        
        // Set up continuous submission
        setInterval(async () => {
            await this.submitBatch();
        }, intervalSeconds * 1000);
        
        // Periodic verification
        setInterval(async () => {
            await this.verify();
        }, 300000); // Every 5 minutes
    }

    async runOnce() {
        console.log('🎯 Running single MessageQueueSample submission\n');
        
        const success = await this.submitBatch();
        
        if (success) {
            console.log('\n⏳ Waiting 15 seconds for processing...');
            await new Promise(resolve => setTimeout(resolve, 15000));
            
            const verified = await this.verify();
            
            if (verified) {
                console.log('\n🎆 Success! Check the UI now:');
                console.log('  https://one.newrelic.com/nr1-core/message-queues');
                console.log('\nLook for these clusters:');
                this.knownClusters.forEach(c => {
                    console.log(`  - ${c.clusterName}`);
                });
            }
        }
    }
}

// Main
async function main() {
    const submitter = new ContinuousMessageQueueSubmitter();
    
    const args = process.argv.slice(2);
    
    if (args.includes('--continuous') || args.includes('-c')) {
        const intervalArg = args.find(arg => arg.startsWith('--interval='));
        const interval = intervalArg ? parseInt(intervalArg.split('=')[1]) : 30;
        await submitter.runContinuous(interval);
    } else {
        await submitter.runOnce();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { ContinuousMessageQueueSubmitter };