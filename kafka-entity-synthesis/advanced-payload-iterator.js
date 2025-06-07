#!/usr/bin/env node

/**
 * Advanced Payload Iterator
 * Systematically test different payload combinations to find what lights up the UI
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

class AdvancedPayloadIterator {
    constructor() {
        loadEnv();
        this.accountId = process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID;
        this.apiKey = process.env.IKEY || process.env.NEW_RELIC_API_KEY;
        this.queryKey = process.env.QKey || process.env.NEW_RELIC_QUERY_KEY;
        this.userKey = process.env.UKEY || process.env.NEW_RELIC_USER_KEY;
        
        this.iterations = [];
        this.results = [];
    }

    async runIterations() {
        console.log('🔄 Advanced Payload Iterator\n');
        console.log('Testing different payload combinations to light up the UI\n');
        
        // First, find a target entity
        const targetEntity = await this.findTargetEntity();
        if (!targetEntity) {
            console.error('❌ No MSK entities found to target');
            return;
        }
        
        console.log(`Target Entity: ${targetEntity.name} (${targetEntity.guid})\n`);
        
        // Define iterations
        this.defineIterations(targetEntity);
        
        // Run each iteration
        for (let i = 0; i < this.iterations.length; i++) {
            const iteration = this.iterations[i];
            console.log(`\n🧪 Iteration ${i + 1}: ${iteration.name}`);
            console.log(`   ${iteration.description}`);
            
            try {
                const result = await this.runIteration(iteration, targetEntity);
                this.results.push(result);
                
                // Wait between iterations
                if (i < this.iterations.length - 1) {
                    console.log('   ⏳ Waiting 15 seconds...');
                    await new Promise(resolve => setTimeout(resolve, 15000));
                }
            } catch (error) {
                console.error(`   ❌ Error: ${error.message}`);
                this.results.push({ iteration: iteration.name, error: error.message });
            }
        }
        
        // Analyze results
        await this.analyzeResults();
    }

    async findTargetEntity() {
        // Find an existing MSK entity to target
        const query = `{
            actor {
                entitySearch(query: "domain = 'INFRA' AND type = 'AWSMSKCLUSTER'") {
                    results {
                        entities {
                            guid
                            name
                            type
                            tags {
                                key
                                values
                            }
                        }
                    }
                }
            }
        }`;
        
        try {
            const response = await this.runGraphQL(query);
            const entities = response?.data?.actor?.entitySearch?.results?.entities || [];
            return entities[0]; // Return first entity
        } catch (error) {
            return null;
        }
    }

    defineIterations(targetEntity) {
        // Each iteration tests a different hypothesis
        
        this.iterations = [
            {
                name: 'Standard Kafka Events',
                description: 'Use KafkaClusterSample instead of AwsMskClusterSample',
                createPayload: (entity) => [{
                    eventType: 'KafkaClusterSample',
                    entityGuid: entity.guid,
                    entityName: entity.name,
                    entityType: 'AWSMSKCLUSTER',
                    'entity.guid': entity.guid,
                    'entity.name': entity.name,
                    'entity.type': 'AWSMSKCLUSTER',
                    clusterName: entity.name,
                    provider: 'awsmsk',
                    'cluster.bytesInPerSec': 1000000,
                    'cluster.bytesOutPerSec': 800000,
                    'cluster.messagesInPerSec': 1000,
                    reportingEndpoint: `${entity.name}.kafka.us-east-1.amazonaws.com:9092`,
                    integrationName: 'com.newrelic.kafka',
                    integrationVersion: '2.13.0',
                    timestamp: Date.now()
                }]
            },
            
            {
                name: 'MessageQueueSample Only',
                description: 'Send only MessageQueueSample with exact entity matching',
                createPayload: (entity) => [{
                    eventType: 'MessageQueueSample',
                    provider: 'AwsMsk',
                    'entity.guid': entity.guid,
                    'entity.name': entity.name,
                    'entity.type': 'AWSMSKCLUSTER',
                    entityGuid: entity.guid,
                    entityName: entity.name,
                    entityType: 'AWSMSKCLUSTER',
                    'queue.name': entity.name,
                    'queue.type': 'kafka',
                    'queue.messagesPerSecond': 1000,
                    'queue.bytesInPerSecond': 1000000,
                    'queue.bytesOutPerSecond': 800000,
                    'queue.consumerLag': 0,
                    'queue.partitionCount': 10,
                    'queue.replicationFactor': 3,
                    'collector.name': 'infrastructure-agent',
                    'instrumentation.name': 'newrelic-kafka-integration',
                    timestamp: Date.now()
                }]
            },
            
            {
                name: 'Dual Event Strategy',
                description: 'Send both Kafka and MSK events together',
                createPayload: (entity) => [
                    {
                        eventType: 'KafkaClusterSample',
                        entityGuid: entity.guid,
                        entityName: entity.name,
                        clusterName: entity.name,
                        provider: 'awsmsk',
                        'cluster.bytesInPerSec': 1000000,
                        timestamp: Date.now()
                    },
                    {
                        eventType: 'AwsMskClusterSample',
                        entityGuid: entity.guid,
                        entityName: entity.name,
                        provider: 'AwsMskCluster',
                        'provider.clusterName': entity.name,
                        'provider.activeControllerCount.Sum': 1,
                        timestamp: Date.now()
                    }
                ]
            },
            
            {
                name: 'Infrastructure Event Pattern',
                description: 'Mimic infrastructure agent event pattern',
                createPayload: (entity) => [
                    {
                        eventType: 'InfrastructureEvent',
                        category: 'kafka-metrics',
                        entityGuid: entity.guid,
                        entityName: entity.name,
                        entityType: 'AWSMSKCLUSTER',
                        integrationName: 'com.newrelic.kafka',
                        integrationVersion: '2.13.0',
                        timestamp: Date.now()
                    },
                    {
                        eventType: 'KafkaClusterSample',
                        entityGuid: entity.guid,
                        entityName: entity.name,
                        clusterName: entity.name,
                        integrationName: 'com.newrelic.kafka',
                        'collector.name': 'infrastructure-agent',
                        timestamp: Date.now()
                    }
                ]
            },
            
            {
                name: 'Provider Account Matching',
                description: 'Include providerAccountId and AWS context',
                createPayload: (entity) => [{
                    eventType: 'MessageQueueSample',
                    provider: 'AwsMsk',
                    providerAccountId: '123456789012', // Should match actual AWS account
                    'entity.guid': entity.guid,
                    'entity.name': entity.name,
                    'entity.type': 'AWSMSKCLUSTER',
                    'queue.name': entity.name,
                    'aws.region': 'us-east-1',
                    'aws.accountId': '123456789012',
                    'aws.kafka.clusterName': entity.name,
                    'queue.messagesPerSecond': 1000,
                    timestamp: Date.now()
                }]
            },
            
            {
                name: 'SystemSample Association',
                description: 'Link to host via SystemSample',
                createPayload: (entity) => [
                    {
                        eventType: 'SystemSample',
                        entityKey: `kafka:${entity.name}`,
                        entityGuid: entity.guid,
                        entityName: entity.name,
                        hostname: `kafka-host-${Date.now()}`,
                        'agent.name': 'Infrastructure',
                        timestamp: Date.now()
                    },
                    {
                        eventType: 'KafkaClusterSample',
                        entityGuid: entity.guid,
                        entityName: entity.name,
                        hostname: `kafka-host-${Date.now()}`,
                        timestamp: Date.now()
                    }
                ]
            },
            
            {
                name: 'Exact Field Replication',
                description: 'Copy exact field structure from working MSK entity',
                createPayload: (entity) => [{
                    eventType: 'AwsMskClusterSample',
                    entityGuid: entity.guid,
                    entityName: entity.name,
                    entityType: 'AWSMSKCLUSTER',
                    'entity.guid': entity.guid,
                    'entity.name': entity.name,
                    'entity.type': 'AWSMSKCLUSTER',
                    provider: 'AwsMskCluster',
                    'provider.clusterName': entity.name,
                    'provider.activeControllerCount.Sum': 1,
                    'provider.offlinePartitionsCount.Sum': 0,
                    'provider.globalPartitionCount.Average': 10,
                    'provider.globalTopicCount.Average': 3,
                    'aws.clusterName': entity.name,
                    'aws.kafka.ClusterName': entity.name,
                    'aws.region': 'us-east-1',
                    'collector.name': 'cloudwatch-metric-streams',
                    'instrumentation.name': 'cloudwatch',
                    'instrumentation.provider': 'aws',
                    timestamp: Date.now()
                }]
            },
            
            {
                name: 'Consumer Group Addition',
                description: 'Add consumer group data for completeness',
                createPayload: (entity) => [
                    {
                        eventType: 'KafkaConsumerSample',
                        entityGuid: entity.guid,
                        clusterName: entity.name,
                        consumerGroup: 'test-consumer-group',
                        'consumer.lag': 0,
                        'consumer.messagesPerSecond': 500,
                        timestamp: Date.now()
                    },
                    {
                        eventType: 'KafkaClusterSample',
                        entityGuid: entity.guid,
                        entityName: entity.name,
                        'cluster.consumerGroupCount': 1,
                        timestamp: Date.now()
                    }
                ]
            }
        ];
    }

    async runIteration(iteration, targetEntity) {
        const payload = iteration.createPayload(targetEntity);
        
        // Submit events
        console.log(`   Submitting ${payload.length} events...`);
        const response = await axios.post(
            `https://insights-collector.newrelic.com/v1/accounts/${this.accountId}/events`,
            payload,
            {
                headers: {
                    'Api-Key': this.apiKey,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (response.status !== 200) {
            throw new Error(`API returned ${response.status}`);
        }
        
        console.log('   ✅ Events submitted');
        
        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Verify
        const verification = await this.verifyIteration(iteration, targetEntity);
        
        return {
            iteration: iteration.name,
            eventsSubmitted: payload.length,
            verification
        };
    }

    async verifyIteration(iteration, targetEntity) {
        const results = {
            eventsInNRDB: false,
            visibleInUI: false,
            messageQueueSample: 0
        };
        
        // Check if events made it to NRDB
        const eventTypes = ['KafkaClusterSample', 'AwsMskClusterSample', 'MessageQueueSample'];
        for (const eventType of eventTypes) {
            const query = `FROM ${eventType} SELECT count(*) WHERE entity.guid = '${targetEntity.guid}' OR entityGuid = '${targetEntity.guid}' SINCE 2 minutes ago`;
            try {
                const response = await this.runNRQL(query);
                const count = response?.results?.[0]?.count || 0;
                if (count > 0) {
                    results.eventsInNRDB = true;
                    if (eventType === 'MessageQueueSample') {
                        results.messageQueueSample = count;
                    }
                }
            } catch (error) {
                // Ignore
            }
        }
        
        console.log(`   Events in NRDB: ${results.eventsInNRDB ? '✅' : '❌'}`);
        console.log(`   MessageQueueSample: ${results.messageQueueSample}`);
        
        return results;
    }

    async analyzeResults() {
        console.log('\n\n📊 Analysis Summary');
        console.log('==================\n');
        
        const successful = this.results.filter(r => r.verification?.eventsInNRDB);
        const withMessageQueue = this.results.filter(r => r.verification?.messageQueueSample > 0);
        
        console.log(`Total iterations: ${this.results.length}`);
        console.log(`Successful submissions: ${successful.length}`);
        console.log(`With MessageQueueSample: ${withMessageQueue.length}`);
        
        console.log('\n📋 Iteration Results:');
        this.results.forEach((result, i) => {
            console.log(`\n${i + 1}. ${result.iteration}`);
            if (result.error) {
                console.log(`   ❌ Error: ${result.error}`);
            } else {
                console.log(`   Events submitted: ${result.eventsSubmitted}`);
                console.log(`   In NRDB: ${result.verification.eventsInNRDB ? '✅' : '❌'}`);
                console.log(`   MessageQueueSample: ${result.verification.messageQueueSample}`);
            }
        });
        
        console.log('\n\n💡 Recommendations:');
        console.log('===================\n');
        
        if (withMessageQueue.length === 0) {
            console.log('❌ No MessageQueueSample events were created');
            console.log('   This suggests a fundamental issue with entity association');
        } else {
            console.log('✅ MessageQueueSample events were created');
            console.log('   If UI still not showing, check:');
            console.log('   1. Entity GUID exact match');
            console.log('   2. Provider field requirements');
            console.log('   3. Additional UI-specific filters');
        }
        
        console.log('\n🔍 Next Steps:');
        console.log('1. Check Message Queues UI after each successful iteration');
        console.log('2. Run NRQL to verify MessageQueueSample data:');
        console.log(`   FROM MessageQueueSample SELECT * WHERE provider = 'AwsMsk' SINCE 1 hour ago`);
        console.log('3. If data exists but UI empty, the issue is UI-specific filtering');
        
        // Save results
        const filename = `iteration-results-${Date.now()}.json`;
        fs.writeFileSync(filename, JSON.stringify(this.results, null, 2));
        console.log(`\n💾 Results saved to: ${filename}`);
    }

    async runNRQL(query) {
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
        return response.data;
    }

    async runGraphQL(query) {
        const response = await axios.post(
            'https://api.newrelic.com/graphql',
            { query },
            {
                headers: {
                    'Api-Key': this.userKey,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    }
}

// Main
async function main() {
    const iterator = new AdvancedPayloadIterator();
    await iterator.runIterations();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { AdvancedPayloadIterator };