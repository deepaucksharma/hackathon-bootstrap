#!/usr/bin/env node

/**
 * Exact Working Format Replicator
 * 
 * This approach replicates the EXACT format from working AWS MSK accounts
 * based on the comprehensive analysis. It ensures every field, naming convention,
 * and structure matches what we know works in production.
 */

const https = require('https');
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

class ExactWorkingFormatReplicator {
    constructor() {
        loadEnv();
        
        this.accountId = process.env.ACC;
        this.insertKey = process.env.IKEY;
        this.userKey = process.env.UKEY;
        
        if (!this.accountId || !this.insertKey) {
            console.error('❌ Missing required environment variables');
            process.exit(1);
        }
        
        // AWS context from working accounts
        this.awsAccountId = '123456789012';
        this.awsRegion = 'us-east-1';
    }

    /**
     * Generate entity GUID exactly as working accounts do
     */
    generateEntityGuid(entityType, identifier) {
        // Format: accountId|domain|type|base64(identifier)
        const base64Id = Buffer.from(identifier).toString('base64');
        return `${this.accountId}|INFRA|${entityType}|${base64Id}`;
    }

    /**
     * Create exact cluster event format from working accounts
     */
    createWorkingClusterEvent(clusterName) {
        const timestamp = Date.now();
        const clusterGuid = this.generateEntityGuid('AWSMSKCLUSTER', clusterName);
        const clusterArn = `arn:aws:kafka:${this.awsRegion}:${this.awsAccountId}:cluster/${clusterName}/12345678-1234-1234-1234-123456789012`;
        
        return {
            // Event identification
            eventType: "AwsMskClusterSample",
            timestamp,
            
            // Entity fields (exact order matters)
            entityGuid: clusterGuid,
            entityName: clusterName,
            
            // Provider identification
            provider: "AwsMskCluster", // Note: specific type, not generic "AwsMsk"
            
            // Cluster identification
            clusterName: clusterName,
            "provider.clusterName": clusterName,
            
            // AWS context fields
            "provider.accountId": this.awsAccountId,
            "provider.region": this.awsRegion,
            "provider.awsRegion": this.awsRegion,
            "provider.externalId": clusterArn,
            "provider.clusterArn": clusterArn,
            
            // Legacy AWS fields (some accounts use these)
            "aws.accountId": this.awsAccountId,
            "aws.region": this.awsRegion,
            "aws.availabilityZone": "us-east-1a,us-east-1b,us-east-1c",
            "awsAccountId": this.awsAccountId,
            "awsRegion": this.awsRegion,
            
            // Cluster state
            "provider.clusterState": "ACTIVE",
            "provider.enhancedMonitoring": "PER_BROKER",
            
            // All cluster metrics with proper aggregations
            "provider.activeControllerCount.Average": 1,
            "provider.activeControllerCount.Sum": 1,
            "provider.activeControllerCount.Maximum": 1,
            "provider.activeControllerCount.Minimum": 1,
            "provider.activeControllerCount.SampleCount": 60,
            
            "provider.offlinePartitionsCount.Average": 0,
            "provider.offlinePartitionsCount.Sum": 0,
            "provider.offlinePartitionsCount.Maximum": 0,
            "provider.offlinePartitionsCount.Minimum": 0,
            "provider.offlinePartitionsCount.SampleCount": 60,
            
            "provider.globalPartitionCount.Average": 30,
            "provider.globalPartitionCount.Sum": 30,
            "provider.globalPartitionCount.Maximum": 30,
            "provider.globalPartitionCount.Minimum": 30,
            "provider.globalPartitionCount.SampleCount": 60,
            
            "provider.globalTopicCount.Average": 5,
            "provider.globalTopicCount.Sum": 5,
            "provider.globalTopicCount.Maximum": 5,
            "provider.globalTopicCount.Minimum": 5,
            "provider.globalTopicCount.SampleCount": 60,
            
            // Collector metadata
            "collector.name": "cloudwatch-metric-streams",
            "collector.version": "1.8.0"
        };
    }

    /**
     * Create exact broker event format from working accounts
     */
    createWorkingBrokerEvent(clusterName, brokerId) {
        const timestamp = Date.now();
        const brokerName = `${clusterName}-broker-${brokerId}`;
        const brokerIdentifier = `${clusterName}/broker-${brokerId}`;
        const brokerGuid = this.generateEntityGuid('AWSMSKBROKER', brokerIdentifier);
        const clusterArn = `arn:aws:kafka:${this.awsRegion}:${this.awsAccountId}:cluster/${clusterName}/12345678-1234-1234-1234-123456789012`;
        
        return {
            // Event identification
            eventType: "AwsMskBrokerSample",
            timestamp,
            
            // Entity fields
            entityGuid: brokerGuid,
            entityName: brokerName,
            
            // Provider identification
            provider: "AwsMskBroker", // Specific type
            
            // Broker identification
            clusterName: clusterName,
            "provider.clusterName": clusterName,
            "provider.brokerId": brokerId.toString(),
            
            // AWS context
            "provider.accountId": this.awsAccountId,
            "provider.region": this.awsRegion,
            "provider.awsRegion": this.awsRegion,
            "provider.externalId": `${clusterArn}/broker-${brokerId}`,
            "provider.clusterArn": clusterArn,
            
            // Legacy AWS fields
            "aws.accountId": this.awsAccountId,
            "aws.region": this.awsRegion,
            "aws.availabilityZone": `us-east-1${String.fromCharCode(96 + parseInt(brokerId))}`,
            "aws.kafka.BrokerID": brokerId.toString(),
            "awsAccountId": this.awsAccountId,
            "awsRegion": this.awsRegion,
            "awsMskBrokerId": brokerId.toString(),
            
            // All broker metrics with proper aggregations
            "provider.bytesInPerSec.Average": 1000000 + (parseInt(brokerId) * 100000),
            "provider.bytesInPerSec.Sum": 60000000 + (parseInt(brokerId) * 6000000),
            "provider.bytesInPerSec.Maximum": 1200000 + (parseInt(brokerId) * 120000),
            "provider.bytesInPerSec.Minimum": 800000 + (parseInt(brokerId) * 80000),
            "provider.bytesInPerSec.SampleCount": 60,
            
            "provider.bytesOutPerSec.Average": 800000 + (parseInt(brokerId) * 80000),
            "provider.bytesOutPerSec.Sum": 48000000 + (parseInt(brokerId) * 4800000),
            "provider.bytesOutPerSec.Maximum": 960000 + (parseInt(brokerId) * 96000),
            "provider.bytesOutPerSec.Minimum": 640000 + (parseInt(brokerId) * 64000),
            "provider.bytesOutPerSec.SampleCount": 60,
            
            "provider.messagesInPerSec.Average": 1000 + (parseInt(brokerId) * 100),
            "provider.messagesInPerSec.Sum": 60000 + (parseInt(brokerId) * 6000),
            "provider.messagesInPerSec.Maximum": 1200 + (parseInt(brokerId) * 120),
            "provider.messagesInPerSec.Minimum": 800 + (parseInt(brokerId) * 80),
            "provider.messagesInPerSec.SampleCount": 60,
            
            "provider.cpuUser.Average": 30 + (parseInt(brokerId) * 5),
            "provider.cpuUser.Maximum": 40 + (parseInt(brokerId) * 5),
            "provider.cpuUser.Minimum": 20 + (parseInt(brokerId) * 5),
            
            "provider.memoryUsed.Average": 40 + (parseInt(brokerId) * 5),
            "provider.memoryFree.Average": 60 - (parseInt(brokerId) * 5),
            
            "provider.rootDiskUsed.Average": 30 + (parseInt(brokerId) * 3),
            "provider.networkRxPackets.Average": 10000 + (parseInt(brokerId) * 1000),
            "provider.networkTxPackets.Average": 8000 + (parseInt(brokerId) * 800),
            
            // Important: underReplicatedPartitions uses Maximum
            "provider.underReplicatedPartitions.Maximum": 0,
            
            // Collector metadata
            "collector.name": "cloudwatch-metric-streams",
            "collector.version": "1.8.0"
        };
    }

    /**
     * Create exact topic event format
     */
    createWorkingTopicEvent(clusterName, topicName) {
        const timestamp = Date.now();
        const topicIdentifier = `${clusterName}/${topicName}`;
        const topicGuid = this.generateEntityGuid('AWSMSKTOPIC', topicIdentifier);
        const clusterArn = `arn:aws:kafka:${this.awsRegion}:${this.awsAccountId}:cluster/${clusterName}/12345678-1234-1234-1234-123456789012`;
        
        return {
            // Event identification
            eventType: "AwsMskTopicSample",
            timestamp,
            
            // Entity fields
            entityGuid: topicGuid,
            entityName: topicIdentifier,
            
            // Provider identification
            provider: "AwsMskTopic", // Specific type
            
            // Topic identification
            clusterName: clusterName,
            "provider.clusterName": clusterName,
            "provider.topic": topicName,
            "provider.topicName": topicName,
            
            // AWS context
            "provider.accountId": this.awsAccountId,
            "provider.region": this.awsRegion,
            "provider.awsRegion": this.awsRegion,
            "provider.externalId": `${clusterArn}/topic/${topicName}`,
            
            // Legacy AWS fields
            "aws.accountId": this.awsAccountId,
            "aws.region": this.awsRegion,
            "aws.kafka.Topic": topicName,
            
            // Topic configuration
            "provider.partitionCount": 6,
            "provider.replicationFactor": 3,
            "provider.minInSyncReplicas": 2,
            
            // Topic metrics
            "provider.bytesInPerSec.Average": 50000,
            "provider.bytesInPerSec.Sum": 3000000,
            "provider.bytesInPerSec.SampleCount": 60,
            
            "provider.bytesOutPerSec.Average": 45000,
            "provider.bytesOutPerSec.Sum": 2700000,
            "provider.bytesOutPerSec.SampleCount": 60,
            
            "provider.messagesInPerSec.Average": 100,
            "provider.messagesInPerSec.Sum": 6000,
            "provider.messagesInPerSec.SampleCount": 60,
            
            "provider.fetchMessageConversionsPerSec.Average": 0,
            "provider.produceMessageConversionsPerSec.Average": 0,
            
            // Consumer lag
            "provider.sumOffsetLag.Average": 0,
            "provider.sumOffsetLag.Maximum": 0,
            "provider.estimatedMaxTimeLag.Average": 0,
            
            // Collector metadata
            "collector.name": "cloudwatch-metric-streams",
            "collector.version": "1.8.0"
        };
    }

    /**
     * Submit events exactly as working accounts do
     */
    async submitEvents(events) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(events);
            
            const options = {
                hostname: 'insights-collector.newrelic.com',
                path: `/v1/accounts/${this.accountId}/events`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Insert-Key': this.insertKey,
                    'Content-Length': data.length
                }
            };
            
            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve({ success: true, status: res.statusCode });
                    } else {
                        resolve({ success: false, status: res.statusCode, body });
                    }
                });
            });
            
            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    /**
     * Main replication flow
     */
    async replicateWorkingFormat(clusterName) {
        console.log('🎯 Exact Working Format Replicator');
        console.log('==================================\n');
        console.log(`Account: ${this.accountId}`);
        console.log(`AWS Account: ${this.awsAccountId}`);
        console.log(`AWS Region: ${this.awsRegion}`);
        console.log(`Cluster: ${clusterName}\n`);
        
        const events = [];
        
        // Create cluster event
        console.log('📊 Creating cluster event (exact format)...');
        events.push(this.createWorkingClusterEvent(clusterName));
        
        // Create broker events
        console.log('📊 Creating broker events (exact format)...');
        for (let i = 1; i <= 3; i++) {
            events.push(this.createWorkingBrokerEvent(clusterName, i));
        }
        
        // Create topic events
        console.log('📊 Creating topic events (exact format)...');
        const topics = ['orders', 'payments', 'inventory', 'events', 'logs'];
        for (const topic of topics) {
            events.push(this.createWorkingTopicEvent(clusterName, topic));
        }
        
        // Submit events
        console.log(`\n📤 Submitting ${events.length} events with exact working format...`);
        const result = await this.submitEvents(events);
        
        if (result.success) {
            console.log('✅ Events submitted successfully!');
            console.log(`   Status: ${result.status}`);
            console.log(`   Cluster: 1, Brokers: 3, Topics: ${topics.length}`);
            
            console.log('\n⏳ Waiting 45 seconds for entity synthesis...');
            await new Promise(resolve => setTimeout(resolve, 45000));
            
            await this.verifyReplication(clusterName);
        } else {
            console.log(`❌ Failed to submit events: ${result.status}`);
            if (result.body) {
                console.log(`   Response: ${result.body}`);
            }
        }
    }

    /**
     * Verify the replication worked
     */
    async verifyReplication(clusterName) {
        console.log('\n🔍 Verifying exact format replication...\n');
        
        const https = require('https');
        
        // Helper to run NRQL via GraphQL
        const runQuery = (nrql) => {
            return new Promise((resolve, reject) => {
                const query = {
                    query: `{
                        actor {
                            account(id: ${this.accountId}) {
                                nrql(query: "${nrql.replace(/"/g, '\\\\"')}") {
                                    results
                                }
                            }
                        }
                    }`
                };
                
                const data = JSON.stringify(query);
                
                const options = {
                    hostname: 'api.newrelic.com',
                    path: '/graphql',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'API-Key': this.userKey
                    }
                };
                
                const req = https.request(options, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        try {
                            const response = JSON.parse(body);
                            resolve(response.data?.actor?.account?.nrql?.results || []);
                        } catch (e) {
                            reject(e);
                        }
                    });
                });
                
                req.on('error', reject);
                req.write(data);
                req.end();
            });
        };
        
        // Check cluster
        const clusterResults = await runQuery(
            `FROM AwsMskClusterSample SELECT count(*), latest(entityGuid), latest(provider.externalId) WHERE provider.clusterName = '${clusterName}' SINCE 5 minutes ago`
        );
        
        console.log(`📊 Cluster Events: ${clusterResults[0]?.count > 0 ? '✅' : '❌'} (${clusterResults[0]?.count || 0} events)`);
        if (clusterResults[0]?.count > 0) {
            console.log(`   Entity GUID: ${clusterResults[0]['latest.entityGuid']}`);
            console.log(`   External ID: ${clusterResults[0]['latest.provider.externalId']}`);
        }
        
        // Check brokers
        const brokerResults = await runQuery(
            `FROM AwsMskBrokerSample SELECT count(*), uniques(entityGuid), uniques(provider.brokerId) WHERE provider.clusterName = '${clusterName}' SINCE 5 minutes ago`
        );
        
        console.log(`\n📊 Broker Events: ${brokerResults[0]?.count > 0 ? '✅' : '❌'} (${brokerResults[0]?.count || 0} events)`);
        if (brokerResults[0]?.count > 0) {
            console.log(`   Unique GUIDs: ${brokerResults[0]['uniques.entityGuid']?.length || 0}`);
            console.log(`   Broker IDs: ${brokerResults[0]['uniques.provider.brokerId']?.join(', ')}`);
        }
        
        // Check topics
        const topicResults = await runQuery(
            `FROM AwsMskTopicSample SELECT count(*), uniques(provider.topic) WHERE provider.clusterName = '${clusterName}' SINCE 5 minutes ago`
        );
        
        console.log(`\n📊 Topic Events: ${topicResults[0]?.count > 0 ? '✅' : '❌'} (${topicResults[0]?.count || 0} events)`);
        if (topicResults[0]?.count > 0) {
            console.log(`   Topics: ${topicResults[0]['uniques.provider.topic']?.join(', ')}`);
        }
        
        console.log('\n📋 Key Success Factors:');
        console.log('1. Used exact provider types (AwsMskCluster, AwsMskBroker, AwsMskTopic)');
        console.log('2. Included all AWS context fields (accountId, region, ARNs)');
        console.log('3. Added all metric aggregations (Average, Sum, Maximum, Minimum, SampleCount)');
        console.log('4. Set collector.name to "cloudwatch-metric-streams"');
        console.log('5. Used exact entity naming patterns from working accounts');
        
        console.log('\n🔍 Next Steps:');
        console.log(`1. Check Message Queues UI: https://one.newrelic.com/nr1-core/message-queues/overview?account=${this.accountId}`);
        console.log(`2. Search for: ${clusterName}`);
        console.log('3. If entities appear, the exact format worked!');
    }
}

// Main execution
async function main() {
    const replicator = new ExactWorkingFormatReplicator();
    const clusterName = process.argv[2] || `exact-format-${Date.now()}`;
    
    await replicator.replicateWorkingFormat(clusterName);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { ExactWorkingFormatReplicator };