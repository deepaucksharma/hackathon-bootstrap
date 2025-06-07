#!/usr/bin/env node

/**
 * Enhanced Infrastructure Agent Simulator v2
 * Based on comprehensive audit recommendations
 * 
 * Key Improvements:
 * 1. Proper ARN/ExternalId handling for all entities
 * 2. Metric value randomization for realism
 * 3. Continuous streaming with proper intervals
 * 4. Robust error handling and monitoring
 * 5. Alignment with exact NRDB patterns
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Load environment variables
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

class EnhancedInfrastructureSimulator {
    constructor() {
        loadEnv();
        
        this.accountId = process.env.ACC;
        this.apiKey = process.env.IKEY;
        this.userKey = process.env.UKEY;
        this.awsAccountId = process.env.AWS_ACCOUNT_ID || '123456789012';
        this.awsRegion = process.env.AWS_REGION || 'us-east-1';
        
        if (!this.accountId || !this.apiKey) {
            console.error('❌ Missing required environment variables');
            process.exit(1);
        }

        // Enhanced metadata with ARN support
        this.metadata = {
            hostname: `kafka-host-${Date.now()}`,
            agentVersion: '1.28.0',
            integrationVersion: '2.13.0',
            collectorName: 'New Relic Infrastructure',
            agentRunId: crypto.randomBytes(16).toString('hex'),
            kafkaVersion: '2.8.0'
        };

        // Track metrics for randomization
        this.metricRanges = {
            bytesInPerSec: { min: 500000, max: 2000000 },
            bytesOutPerSec: { min: 400000, max: 1800000 },
            messagesInPerSec: { min: 500, max: 2000 },
            cpuUser: { min: 10, max: 70 },
            memoryUsed: { min: 30, max: 80 },
            diskUsed: { min: 20, max: 60 },
            activeControllers: { value: 1 },
            offlinePartitions: { value: 0 }
        };
    }

    /**
     * Generate AWS ARN for entities
     */
    generateArn(resourceType, resourceName) {
        const arnTemplates = {
            cluster: `arn:aws:kafka:${this.awsRegion}:${this.awsAccountId}:cluster/${resourceName}/${crypto.randomBytes(8).toString('hex')}`,
            broker: `arn:aws:kafka:${this.awsRegion}:${this.awsAccountId}:broker/${resourceName}`,
            topic: `arn:aws:kafka:${this.awsRegion}:${this.awsAccountId}:topic/${resourceName}`
        };
        
        return arnTemplates[resourceType] || null;
    }

    /**
     * Generate entity GUID following exact NRDB pattern
     */
    generateEntityGuid(type, identifier) {
        const typeMap = {
            'cluster': 'AWSMSKCLUSTER',
            'broker': 'AWSMSKBROKER', 
            'topic': 'AWSMSKTOPIC',
            'host': 'HOST'
        };
        
        const entityType = typeMap[type] || type.toUpperCase();
        const base64Id = Buffer.from(identifier).toString('base64');
        
        return `${this.accountId}|INFRA|${entityType}|${base64Id}`;
    }

    /**
     * Get randomized metric value within realistic range
     */
    getMetricValue(metricName, aggregation = 'Average') {
        const range = this.metricRanges[metricName];
        if (!range) return Math.random() * 1000;
        
        if (range.value !== undefined) return range.value;
        
        const value = range.min + Math.random() * (range.max - range.min);
        
        // Generate aggregations
        const aggregations = {
            Average: value,
            Sum: value * 60, // Assuming 60 data points per minute
            Maximum: value * 1.2,
            Minimum: value * 0.8,
            SampleCount: 60
        };
        
        return aggregations[aggregation] || value;
    }

    /**
     * Create integration payload following exact Infrastructure format
     */
    createIntegrationPayload(clusterName, events) {
        return {
            "protocol_version": "3",
            "integration": {
                "name": "com.newrelic.kafka",
                "version": this.metadata.integrationVersion
            },
            "data": events.map(event => ({
                "entity": {
                    "name": event.entityName,
                    "type": event.eventType,
                    "id_attributes": [
                        {
                            "key": "clusterName",
                            "value": clusterName
                        }
                    ]
                },
                "metrics": [event],
                "inventory": {},
                "events": []
            }))
        };
    }

    /**
     * Submit events using Infrastructure Integration format
     */
    async submitIntegrationPayload(payload) {
        try {
            const response = await axios.post(
                `https://insights-collector.newrelic.com/v1/accounts/${this.accountId}/events`,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Insert-Key': this.apiKey,
                        'X-License-Key': this.apiKey,
                        'X-Agent-Hostname': this.metadata.hostname,
                        'X-Agent-Run-Token': this.metadata.agentRunId,
                        'X-Integration-Version': this.metadata.integrationVersion
                    }
                }
            );
            
            if (response.status !== 200) {
                throw new Error(`API returned ${response.status}`);
            }
            
            return { success: true, status: response.status };
        } catch (error) {
            console.error('❌ Submission error:', error.message);
            if (error.response) {
                console.error('Response:', error.response.data);
            }
            return { success: false, error: error.message };
        }
    }

    /**
     * Create comprehensive MSK events with all required fields
     */
    async streamMskMetrics(clusterName) {
        console.log('🚀 Starting Enhanced MSK Metrics Stream');
        console.log('=====================================\n');
        
        const clusterArn = this.generateArn('cluster', clusterName);
        const clusterGuid = this.generateEntityGuid('cluster', clusterName);
        const timestamp = Date.now();
        
        // Phase 1: Create cluster event
        console.log('📊 Phase 1: Cluster Metrics');
        const clusterEvent = {
            eventType: "AwsMskClusterSample",
            event_type: "AwsMskClusterSample",
            entityName: clusterName,
            entityGuid: clusterGuid,
            "entity.guid": clusterGuid,
            "entity.name": clusterName,
            "entity.type": "AWSMSKCLUSTER",
            
            // Identity fields
            clusterName: clusterName,
            "provider.clusterName": clusterName,
            "provider.accountId": this.awsAccountId,
            "provider.awsRegion": this.awsRegion,
            "provider.externalId": clusterArn,
            "provider.clusterArn": clusterArn,
            
            // AWS context
            "aws.accountId": this.awsAccountId,
            "aws.region": this.awsRegion,
            "aws.kafka.ClusterName": clusterName,
            "awsAccountId": this.awsAccountId,
            "awsRegion": this.awsRegion,
            
            // Cluster metrics with all aggregations
            "provider.activeControllerCount.Average": this.getMetricValue('activeControllers'),
            "provider.activeControllerCount.Sum": this.getMetricValue('activeControllers'),
            "provider.activeControllerCount.Maximum": this.getMetricValue('activeControllers'),
            "provider.activeControllerCount.Minimum": this.getMetricValue('activeControllers'),
            "provider.activeControllerCount.SampleCount": 60,
            
            "provider.offlinePartitionsCount.Average": 0,
            "provider.offlinePartitionsCount.Sum": 0,
            "provider.offlinePartitionsCount.Maximum": 0,
            "provider.offlinePartitionsCount.Minimum": 0,
            "provider.offlinePartitionsCount.SampleCount": 60,
            
            "provider.globalPartitionCount.Average": 30,
            "provider.globalPartitionCount.Sum": 30,
            "provider.globalTopicCount.Average": 5,
            "provider.globalTopicCount.Sum": 5,
            
            // Metadata
            timestamp,
            "collector.name": this.metadata.collectorName,
            "integration.name": "com.newrelic.kafka",
            "integration.version": this.metadata.integrationVersion
        };
        
        // Phase 2: Create broker events
        console.log('📊 Phase 2: Broker Metrics');
        const brokerEvents = [];
        
        for (let i = 1; i <= 3; i++) {
            const brokerId = i.toString();
            const brokerName = `${clusterName}-broker-${i}`;
            const brokerIdentifier = `${clusterName}/broker-${i}`;
            const brokerGuid = this.generateEntityGuid('broker', brokerIdentifier);
            const brokerArn = `${clusterArn}/broker-${i}`;
            
            const brokerEvent = {
                eventType: "AwsMskBrokerSample",
                event_type: "AwsMskBrokerSample",
                entityName: brokerName,
                entityGuid: brokerGuid,
                "entity.guid": brokerGuid,
                "entity.name": brokerName,
                "entity.type": "AWSMSKBROKER",
                
                // Identity fields
                clusterName: clusterName,
                "provider.clusterName": clusterName,
                "provider.brokerId": brokerId,
                "provider.accountId": this.awsAccountId,
                "provider.awsRegion": this.awsRegion,
                "provider.externalId": brokerArn,
                "provider.brokerArn": brokerArn,
                
                // AWS context
                "aws.accountId": this.awsAccountId,
                "aws.region": this.awsRegion,
                "aws.kafka.ClusterName": clusterName,
                "aws.kafka.BrokerID": brokerId,
                "awsAccountId": this.awsAccountId,
                "awsRegion": this.awsRegion,
                "awsMskBrokerId": brokerId,
                
                // Broker metrics with realistic variations
                "provider.bytesInPerSec.Average": this.getMetricValue('bytesInPerSec', 'Average'),
                "provider.bytesInPerSec.Sum": this.getMetricValue('bytesInPerSec', 'Sum'),
                "provider.bytesInPerSec.Maximum": this.getMetricValue('bytesInPerSec', 'Maximum'),
                "provider.bytesInPerSec.Minimum": this.getMetricValue('bytesInPerSec', 'Minimum'),
                "provider.bytesInPerSec.SampleCount": 60,
                
                "provider.bytesOutPerSec.Average": this.getMetricValue('bytesOutPerSec', 'Average'),
                "provider.bytesOutPerSec.Sum": this.getMetricValue('bytesOutPerSec', 'Sum'),
                "provider.bytesOutPerSec.Maximum": this.getMetricValue('bytesOutPerSec', 'Maximum'),
                "provider.bytesOutPerSec.Minimum": this.getMetricValue('bytesOutPerSec', 'Minimum'),
                "provider.bytesOutPerSec.SampleCount": 60,
                
                "provider.messagesInPerSec.Average": this.getMetricValue('messagesInPerSec', 'Average'),
                "provider.messagesInPerSec.Sum": this.getMetricValue('messagesInPerSec', 'Sum'),
                "provider.messagesInPerSec.Maximum": this.getMetricValue('messagesInPerSec', 'Maximum'),
                "provider.messagesInPerSec.Minimum": this.getMetricValue('messagesInPerSec', 'Minimum'),
                "provider.messagesInPerSec.SampleCount": 60,
                
                "provider.cpuUser.Average": this.getMetricValue('cpuUser'),
                "provider.memoryUsed.Average": this.getMetricValue('memoryUsed'),
                "provider.diskUsed.Average": this.getMetricValue('diskUsed'),
                
                // Additional MSK metrics
                "provider.underReplicatedPartitions.Maximum": 0,
                "provider.producerRequestTime.Average": 2.5 + Math.random() * 2,
                "provider.consumerRequestTime.Average": 1.5 + Math.random() * 1,
                
                // Metadata
                timestamp,
                "collector.name": this.metadata.collectorName,
                "integration.name": "com.newrelic.kafka",
                "integration.version": this.metadata.integrationVersion
            };
            
            brokerEvents.push(brokerEvent);
        }
        
        // Phase 3: Create topic events
        console.log('📊 Phase 3: Topic Metrics');
        const topicEvents = [];
        const topics = ['orders', 'payments', 'inventory', 'events', 'logs'];
        
        for (const topicName of topics) {
            const topicIdentifier = `${clusterName}/${topicName}`;
            const topicGuid = this.generateEntityGuid('topic', topicIdentifier);
            const topicArn = `${clusterArn}/topic/${topicName}`;
            
            const topicEvent = {
                eventType: "AwsMskTopicSample",
                event_type: "AwsMskTopicSample",
                entityName: topicIdentifier,
                entityGuid: topicGuid,
                "entity.guid": topicGuid,
                "entity.name": topicIdentifier,
                "entity.type": "AWSMSKTOPIC",
                
                // Identity fields
                clusterName: clusterName,
                "provider.clusterName": clusterName,
                "provider.topic": topicName,
                "provider.accountId": this.awsAccountId,
                "provider.awsRegion": this.awsRegion,
                "provider.externalId": topicArn,
                
                // AWS context
                "aws.accountId": this.awsAccountId,
                "aws.region": this.awsRegion,
                "aws.kafka.ClusterName": clusterName,
                "aws.kafka.Topic": topicName,
                
                // Topic metrics
                "provider.bytesInPerSec.Average": this.getMetricValue('bytesInPerSec', 'Average') / 5,
                "provider.bytesOutPerSec.Average": this.getMetricValue('bytesOutPerSec', 'Average') / 5,
                "provider.messagesInPerSec.Average": this.getMetricValue('messagesInPerSec', 'Average') / 5,
                "provider.partitionCount": 3 + Math.floor(Math.random() * 3),
                "provider.replicationFactor": 3,
                "provider.sumOffsetLag.Average": Math.random() * 100,
                
                // Metadata
                timestamp,
                "collector.name": this.metadata.collectorName,
                "integration.name": "com.newrelic.kafka",
                "integration.version": this.metadata.integrationVersion
            };
            
            topicEvents.push(topicEvent);
        }
        
        // Submit all events
        console.log('\n📤 Submitting all events...');
        
        // Submit using integration format
        const allEvents = [clusterEvent, ...brokerEvents, ...topicEvents];
        const integrationPayload = this.createIntegrationPayload(clusterName, allEvents);
        
        const result = await this.submitIntegrationPayload(integrationPayload);
        
        if (result.success) {
            console.log('✅ All events submitted successfully!');
            console.log(`   Total events: ${allEvents.length}`);
            console.log(`   Cluster: 1, Brokers: ${brokerEvents.length}, Topics: ${topicEvents.length}`);
        } else {
            console.log('❌ Failed to submit events');
        }
        
        return result.success;
    }

    /**
     * Verify entity creation and metrics
     */
    async verifyEntities(clusterName) {
        console.log('\n🔍 Verifying Entity Creation...\n');
        
        // Check cluster events in NRDB
        const clusterQuery = `FROM AwsMskClusterSample SELECT count(*), latest(entity.guid), latest(provider.externalId) WHERE provider.clusterName = '${clusterName}' SINCE 5 minutes ago`;
        
        try {
            const clusterResult = await this.runNRQL(clusterQuery);
            const count = clusterResult.results?.[0]?.count || 0;
            
            console.log(`📊 Cluster Events: ${count > 0 ? '✅' : '❌'} (${count} events)`);
            if (count > 0) {
                console.log(`   Entity GUID: ${clusterResult.results[0]['latest.entity.guid']}`);
                console.log(`   External ID: ${clusterResult.results[0]['latest.provider.externalId']}`);
            }
        } catch (error) {
            console.log('📊 Cluster Events: ❌ Query failed');
        }
        
        // Check broker events
        const brokerQuery = `FROM AwsMskBrokerSample SELECT count(*), uniques(entity.guid), uniques(provider.brokerId) WHERE provider.clusterName = '${clusterName}' SINCE 5 minutes ago`;
        
        try {
            const brokerResult = await this.runNRQL(brokerQuery);
            const count = brokerResult.results?.[0]?.count || 0;
            const uniqueBrokers = brokerResult.results?.[0]['uniques.provider.brokerId']?.length || 0;
            
            console.log(`\n📊 Broker Events: ${count > 0 ? '✅' : '❌'} (${count} events, ${uniqueBrokers} unique brokers)`);
        } catch (error) {
            console.log('\n📊 Broker Events: ❌ Query failed');
        }
        
        // Check topic events
        const topicQuery = `FROM AwsMskTopicSample SELECT count(*), uniques(provider.topic) WHERE provider.clusterName = '${clusterName}' SINCE 5 minutes ago`;
        
        try {
            const topicResult = await this.runNRQL(topicQuery);
            const count = topicResult.results?.[0]?.count || 0;
            const uniqueTopics = topicResult.results?.[0]['uniques.provider.topic']?.length || 0;
            
            console.log(`\n📊 Topic Events: ${count > 0 ? '✅' : '❌'} (${count} events, ${uniqueTopics} unique topics)`);
        } catch (error) {
            console.log('\n📊 Topic Events: ❌ Query failed');
        }
        
        // Check entity search
        console.log('\n🔍 Checking Entity Creation...');
        try {
            const entityQuery = `{
                actor {
                    entitySearch(query: "domain = 'INFRA' AND (type = 'AWSMSKCLUSTER' OR type = 'AWSMSKBROKER' OR type = 'AWSMSKTOPIC') AND name LIKE '%${clusterName}%'") {
                        count
                        results {
                            entities {
                                guid
                                name
                                type
                                reporting
                            }
                        }
                    }
                }
            }`;
            
            const entityResult = await this.runGraphQL(entityQuery);
            const entityCount = entityResult?.data?.actor?.entitySearch?.count || 0;
            
            if (entityCount > 0) {
                console.log(`✅ ${entityCount} entities found!`);
                entityResult.data.actor.entitySearch.results.entities.forEach(entity => {
                    console.log(`   ${entity.name} (${entity.type}) - Reporting: ${entity.reporting ? 'Yes' : 'No'}`);
                });
            } else {
                console.log('❌ No entities found in Entity Search');
            }
        } catch (error) {
            console.log('❌ Entity search failed');
        }
        
        console.log('\n📋 Next Steps:');
        console.log(`1. Check Message Queues UI: https://one.newrelic.com/nr1-core/message-queues/overview?account=${this.accountId}`);
        console.log(`2. Search for cluster: ${clusterName}`);
        console.log('3. Look for broker and topic data under the cluster');
    }

    /**
     * Run continuous streaming
     */
    async runContinuousStream(clusterName, intervalMinutes = 5) {
        console.log(`\n🔄 Starting continuous streaming (every ${intervalMinutes} minutes)...`);
        
        // Initial submission
        await this.streamMskMetrics(clusterName);
        
        // Verify after 30 seconds
        setTimeout(async () => {
            await this.verifyEntities(clusterName);
        }, 30000);
        
        // Set up continuous streaming
        setInterval(async () => {
            console.log(`\n⏰ Streaming metrics at ${new Date().toISOString()}`);
            await this.streamMskMetrics(clusterName);
        }, intervalMinutes * 60 * 1000);
        
        console.log('\n✅ Continuous streaming active. Press Ctrl+C to stop.');
    }

    // Helper methods
    async runNRQL(query) {
        const gqlQuery = {
            query: `{
                actor {
                    account(id: ${this.accountId}) {
                        nrql(query: "${query.replace(/"/g, '\\"').replace(/\n/g, ' ')}") {
                            results
                        }
                    }
                }
            }`
        };
        
        const response = await axios.post(
            'https://api.newrelic.com/graphql',
            gqlQuery,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'API-Key': this.userKey
                }
            }
        );
        
        return response.data?.data?.actor?.account?.nrql || { results: [] };
    }

    async runGraphQL(query) {
        const response = await axios.post(
            'https://api.newrelic.com/graphql',
            { query },
            {
                headers: {
                    'API-Key': this.userKey,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        return response.data;
    }
}

// Main execution
async function main() {
    const simulator = new EnhancedInfrastructureSimulator();
    const clusterName = process.argv[2] || `enhanced-msk-${Date.now()}`;
    const continuous = process.argv[3] === '--continuous';
    
    console.log('🚀 Enhanced Infrastructure MSK Simulator v2');
    console.log('==========================================');
    console.log(`Account: ${simulator.accountId}`);
    console.log(`AWS Account: ${simulator.awsAccountId}`);
    console.log(`AWS Region: ${simulator.awsRegion}`);
    console.log(`Cluster: ${clusterName}`);
    console.log(`Mode: ${continuous ? 'Continuous' : 'Single Run'}\n`);
    
    if (continuous) {
        await simulator.runContinuousStream(clusterName);
    } else {
        const success = await simulator.streamMskMetrics(clusterName);
        if (success) {
            setTimeout(async () => {
                await simulator.verifyEntities(clusterName);
            }, 30000);
        }
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { EnhancedInfrastructureSimulator };