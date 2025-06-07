#!/usr/bin/env node

/**
 * Infrastructure Agent Pattern Simulator
 * Simulates how the infrastructure agent creates entities
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

class InfrastructureAgentSimulator {
    constructor() {
        loadEnv();
        
        this.accountId = process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID;
        this.apiKey = process.env.IKEY || process.env.NEW_RELIC_API_KEY;
        this.userKey = process.env.UKEY || process.env.NEW_RELIC_USER_KEY;
        this.licenseKey = process.env.IKEY || this.apiKey;
        
        if (!this.accountId || !this.apiKey) {
            console.error('❌ Missing required environment variables');
            console.error('   ACC (Account ID):', this.accountId ? '✓' : '✗');
            console.error('   IKEY (Insert Key):', this.apiKey ? '✓' : '✗');
            process.exit(1);
        }

        // Simulate agent metadata
        this.agentMetadata = {
            hostname: `kafka-integration-host-${Date.now()}`,
            agentVersion: '1.28.0',
            os: 'linux',
            arch: 'amd64',
            integrationVersion: '2.13.0',
            kernelVersion: '5.10.0-19-amd64',
            agentRunId: crypto.randomBytes(16).toString('hex')
        };
    }

    /**
     * Simulate complete infrastructure agent flow
     */
    async simulateKafkaIntegration(clusterName) {
        console.log('🤖 Infrastructure Agent Kafka Integration Simulator');
        console.log('=================================================\n');
        console.log(`Cluster: ${clusterName}`);
        console.log(`Host: ${this.agentMetadata.hostname}`);
        console.log(`Account: ${this.accountId}\n`);

        const sessionId = this.generateSessionId();
        
        try {
            // Phase 1: Establish host entity first
            console.log('\n🏠 PHASE 1: Establishing Host Entity');
            console.log('=====================================');
            await this.establishHostEntity(sessionId);
            
            // Phase 2: Register Kafka integration
            console.log('\n🔌 PHASE 2: Registering Kafka Integration');
            console.log('========================================');
            await this.registerKafkaIntegration(clusterName, sessionId);
            
            // Phase 3: Create Kafka entities
            console.log('\n📊 PHASE 3: Creating Kafka Entities');
            console.log('===================================');
            await this.createKafkaEntities(clusterName, sessionId);
            
            // Phase 4: Dual event strategy for UI visibility
            console.log('\n🎯 PHASE 4: Dual Event Strategy for UI');
            console.log('======================================');
            await this.submitDualEvents(clusterName, sessionId);
            
            // Phase 5: Continuous metrics
            console.log('\n📈 PHASE 5: Continuous Metrics Stream');
            console.log('====================================');
            await this.streamContinuousMetrics(clusterName, sessionId);
            
            // Verify
            console.log('\n⏳ Waiting 30 seconds for entity synthesis...');
            await new Promise(resolve => setTimeout(resolve, 30000));
            
            await this.verifyIntegration(clusterName);
            
        } catch (error) {
            console.error('\n❌ Error:', error.message);
            if (error.response) {
                console.error('Response:', error.response.data);
            }
        }
    }

    async establishHostEntity(sessionId) {
        const events = [];
        const timestamp = Date.now();
        
        // Create host entity with SystemSample
        console.log('   Creating host entity...');
        events.push({
            eventType: "SystemSample",
            entityKey: `system:${this.agentMetadata.hostname}`,
            entityName: this.agentMetadata.hostname,
            entityGuid: this.generateEntityGuid('HOST', this.agentMetadata.hostname),
            hostname: this.agentMetadata.hostname,
            "host.name": this.agentMetadata.hostname,
            "host.fullHostname": this.agentMetadata.hostname,
            "agent.name": "newrelic-infra",
            "agent.version": this.agentMetadata.agentVersion,
            "agentName": "Infrastructure",
            "agentVersion": this.agentMetadata.agentVersion,
            "coreCount": 4,
            "processorCount": 2,
            "memoryTotalBytes": 8589934592,
            "memoryUsedBytes": 4294967296,
            "memoryFreeBytes": 4294967296,
            "diskTotalBytes": 107374182400,
            "diskUsedBytes": 53687091200,
            "diskUsedPercent": 50,
            "cpuPercent": 25.5,
            "loadAverageOneMinute": 1.5,
            "loadAverageFiveMinute": 1.2,
            "loadAverageFifteenMinute": 1.0,
            "os": this.agentMetadata.os,
            "kernelVersion": this.agentMetadata.kernelVersion,
            "instanceType": "m5.xlarge",
            "aws.accountId": "123456789012",
            "aws.region": "us-east-1",
            "aws.availabilityZone": "us-east-1a",
            sessionId,
            timestamp
        });

        // Agent metadata event
        events.push({
            eventType: "InfrastructureEvent",
            category: "metadata",
            summary: "agent-metadata",
            hostname: this.agentMetadata.hostname,
            "agent.runId": this.agentMetadata.agentRunId,
            "agent.version": this.agentMetadata.agentVersion,
            "agent.home": "/var/db/newrelic-infra",
            "agent.startTime": timestamp - 60000,
            "os.platform": this.agentMetadata.os,
            "os.architecture": this.agentMetadata.arch,
            sessionId,
            timestamp
        });

        // Submit host events
        await this.submitEvents(events);
        console.log('   ✓ Host entity established');
        
        // Wait for host entity to be created
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    async registerKafkaIntegration(clusterName, sessionId) {
        const events = [];
        const timestamp = Date.now();
        
        console.log('   Discovering Kafka integration...');
        
        // Integration discovery
        events.push({
            eventType: "IntegrationEvent",
            category: "discovery",
            summary: "integration-discovery",
            integrationName: "com.newrelic.kafka",
            integrationVersion: this.agentMetadata.integrationVersion,
            "integration.name": "com.newrelic.kafka",
            "integration.version": this.agentMetadata.integrationVersion,
            hostname: this.agentMetadata.hostname,
            entityKey: `integration:${this.agentMetadata.hostname}:com.newrelic.kafka`,
            "collector.name": "infrastructure-agent",
            "collector.version": this.agentMetadata.agentVersion,
            sessionId,
            timestamp
        });

        // Integration health check
        events.push({
            eventType: "IntegrationHealthCheckSample",
            integrationName: "com.newrelic.kafka",
            integrationVersion: this.agentMetadata.integrationVersion,
            hostname: this.agentMetadata.hostname,
            "integration.name": "com.newrelic.kafka",
            "integration.version": this.agentMetadata.integrationVersion,
            "health.status": "ok",
            "health.message": "Successfully connected to Kafka cluster",
            "kafka.cluster.name": clusterName,
            "kafka.cluster.bootstrapServers": `${clusterName}.kafka.us-east-1.amazonaws.com:9092`,
            sessionId,
            timestamp
        });

        // Integration inventory
        events.push({
            eventType: "InfrastructureEvent",
            category: "inventory",
            summary: "integration-inventory",
            hostname: this.agentMetadata.hostname,
            "inventory.integration": JSON.stringify({
                name: "com.newrelic.kafka",
                version: this.agentMetadata.integrationVersion,
                config: {
                    cluster_name: clusterName,
                    kafka_version: "2.8.0",
                    zookeeper_hosts: [],
                    bootstrap_broker_host: `${clusterName}.kafka.us-east-1.amazonaws.com`,
                    bootstrap_broker_kafka_port: 9092,
                    bootstrap_broker_jmx_port: 9999,
                    collect_broker_topic_data: true,
                    topic_mode: "all",
                    collect_topic_size: true
                }
            }),
            sessionId,
            timestamp
        });

        await this.submitEvents(events);
        console.log('   ✓ Kafka integration registered');
        
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    async createKafkaEntities(clusterName, sessionId) {
        const events = [];
        const timestamp = Date.now();
        const clusterGuid = this.generateEntityGuid('cluster', clusterName);
        
        // Entity registration event
        events.push({
            eventType: "InfrastructureEvent",
            category: "entity",
            entityKeys: [`kafka-cluster:${clusterName}`],
            entityName: clusterName,
            entityGuid: clusterGuid,
            entityType: "AWSMSKCLUSTER",
            displayName: clusterName,
            domain: "INFRA",
            type: "AWSMSKCLUSTER",
            integrationName: "com.newrelic.kafka",
            integrationVersion: this.agentMetadata.integrationVersion,
            hostname: this.agentMetadata.hostname,
            "nr.integrationName": "com.newrelic.kafka",
            "nr.integrationVersion": this.agentMetadata.integrationVersion,
            "nr.agentName": "Infrastructure",
            sessionId,
            timestamp
        });

        // Entity inventory
        events.push({
            eventType: "KafkaClusterSample",
            entityKey: `kafka-cluster:${clusterName}`,
            entityName: clusterName,
            entityGuid: clusterGuid,
            "entity.guid": clusterGuid,
            "entity.name": clusterName,
            "entity.type": "AWSMSKCLUSTER",
            displayName: clusterName,
            clusterName: clusterName,
            "cluster.name": clusterName,
            provider: "awsmsk",
            reportingEndpoint: `${clusterName}.kafka.us-east-1.amazonaws.com:9092`,
            hostname: this.agentMetadata.hostname,
            sessionId,
            timestamp
        });

        // Create broker entities
        for (let i = 1; i <= 3; i++) {
            const brokerGuid = this.generateEntityGuid('broker', `${clusterName}-broker-${i}`);
            events.push({
                eventType: "KafkaBrokerSample",
                entityKey: `kafka-broker:${clusterName}:${i}`,
                entityName: `${clusterName}-broker-${i}`,
                entityGuid: brokerGuid,
                "entity.guid": brokerGuid,
                "entity.name": `${clusterName}-broker-${i}`,
                "entity.type": "AWSMSKBROKER",
                displayName: `${clusterName}-broker-${i}`,
                clusterName: clusterName,
                brokerId: i,
                "broker.id": i,
                brokerHost: `broker-${i}.${clusterName}.kafka.us-east-1.amazonaws.com`,
                provider: "awsmsk",
                hostname: this.agentMetadata.hostname,
                sessionId,
                timestamp
            });
        }

        // Submit entity creation events
        await this.submitEvents(events);
        console.log('   ✓ Kafka entities created');
        
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    async submitDualEvents(clusterName, sessionId) {
        console.log('   Submitting dual events (MessageQueue + AwsMsk)...');
        
        const timestamp = Date.now();
        const clusterGuid = this.generateEntityGuid('cluster', clusterName);
        const events = [];
        
        // Cluster - Both MessageQueueSample AND AwsMskClusterSample
        events.push({
            eventType: "MessageQueueSample",
            timestamp,
            provider: "AwsMsk",
            "collector.name": "infrastructure-agent",
            "queue.name": clusterName,
            "queue.type": "kafka_cluster",
            "entity.name": clusterName,
            "entity.type": "AWSMSKCLUSTER",
            "entity.guid": clusterGuid,
            "queue.brokerCount": 3,
            "queue.topicCount": 5,
            "queue.partitionCount": 30,
            hostname: this.agentMetadata.hostname,
            sessionId
        });
        
        events.push({
            eventType: "AwsMskClusterSample",
            timestamp,
            entityGuid: clusterGuid,
            entityName: clusterName,
            "collector.name": "infrastructure-agent",
            provider: "AwsMskCluster",
            clusterName,
            "provider.clusterName": clusterName,
            "provider.activeControllerCount.Average": 1,
            "provider.globalPartitionCount.Average": 30,
            "provider.globalTopicCount.Average": 5,
            hostname: this.agentMetadata.hostname,
            sessionId
        });
        
        // Brokers - Both event types
        for (let i = 1; i <= 3; i++) {
            const brokerGuid = this.generateEntityGuid('broker', `${clusterName}-broker-${i}`);
            const brokerName = `${clusterName}-broker-${i}`;
            
            events.push({
                eventType: "MessageQueueSample",
                timestamp,
                provider: "AwsMsk",
                "queue.name": brokerName,
                "queue.type": "kafka_broker",
                "entity.name": brokerName,
                "entity.type": "AWSMSKBROKER",
                "entity.guid": brokerGuid,
                "queue.messagesPerSecond": 1000 + (i * 100),
                "queue.bytesInPerSecond": 1000000 + (i * 100000),
                hostname: this.agentMetadata.hostname,
                sessionId
            });
            
            events.push({
                eventType: "AwsMskBrokerSample",
                timestamp,
                entityGuid: brokerGuid,
                entityName: brokerName,
                provider: "AwsMskBroker",
                clusterName,
                "provider.brokerId": i.toString(),
                "provider.bytesInPerSec.Average": 1000000 + (i * 100000),
                "provider.messagesInPerSec.Average": 1000 + (i * 100),
                hostname: this.agentMetadata.hostname,
                sessionId
            });
        }
        
        await this.submitEvents(events);
        console.log('   ✓ Dual events submitted');
        
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    async streamContinuousMetrics(clusterName, sessionId) {
        const events = [];
        const timestamp = Date.now();
        const clusterGuid = this.generateEntityGuid('cluster', clusterName);
        
        // Cluster metrics (MSK format)
        events.push({
            eventType: "AwsMskClusterSample",
            entityGuid: clusterGuid,
            entityName: clusterName,
            entityType: "AWSMSKCLUSTER",
            "entity.guid": clusterGuid,
            "entity.name": clusterName,
            "entity.type": "AWSMSKCLUSTER",
            displayName: clusterName,
            domain: "INFRA",
            type: "AWSMSKCLUSTER",
            provider: "AwsMskCluster",
            "provider.clusterName": clusterName,
            "provider.activeControllerCount.Sum": 1,
            "provider.offlinePartitionsCount.Sum": 0,
            "provider.globalPartitionCount.Average": 15,
            "provider.globalTopicCount.Average": 5,
            "aws.clusterName": clusterName,
            "aws.kafka.ClusterName": clusterName,
            "aws.msk.clusterName": clusterName,
            "aws.region": "us-east-1",
            "collector.name": "infrastructure-agent",
            "collector.integrationName": "com.newrelic.kafka",
            "collector.integrationVersion": this.agentMetadata.integrationVersion,
            hostname: this.agentMetadata.hostname,
            "instrumentation.name": "newrelic.kafka",
            "instrumentation.provider": "newrelic",
            sessionId,
            timestamp
        });

        // Broker metrics
        for (let i = 1; i <= 3; i++) {
            const brokerGuid = this.generateEntityGuid('broker', `${clusterName}-broker-${i}`);
            events.push({
                eventType: "AwsMskBrokerSample",
                entityGuid: brokerGuid,
                entityName: `${clusterName}-broker-${i}`,
                entityType: "AWSMSKBROKER",
                displayName: `${clusterName}-broker-${i}`,
                domain: "INFRA",
                type: "AWSMSKBROKER",
                provider: "AwsMskBroker",
                "provider.clusterName": clusterName,
                "provider.brokerId": i.toString(),
                "provider.bytesInPerSec.Average": 100000 + Math.random() * 50000,
                "provider.bytesInPerSec.Sum": 6000000 + Math.random() * 3000000,
                "provider.bytesInPerSec.SampleCount": 60,
                "provider.bytesOutPerSec.Average": 80000 + Math.random() * 40000,
                "provider.bytesOutPerSec.Sum": 4800000 + Math.random() * 2400000,
                "provider.bytesOutPerSec.SampleCount": 60,
                "provider.cpuUser.Average": 20 + Math.random() * 30,
                "provider.cpuUser.Maximum": 40 + Math.random() * 20,
                "provider.cpuUser.Minimum": 10 + Math.random() * 10,
                "aws.kafka.ClusterName": clusterName,
                "aws.kafka.BrokerID": i.toString(),
                hostname: this.agentMetadata.hostname,
                sessionId,
                timestamp
            });
        }

        // Topic metrics
        ['orders', 'payments', 'users'].forEach(topicName => {
            const topicGuid = this.generateEntityGuid('topic', `${clusterName}-${topicName}`);
            events.push({
                eventType: "AwsMskTopicSample",
                entityGuid: topicGuid,
                entityName: `${clusterName}-${topicName}`,
                entityType: "AWSMSKTOPIC",
                displayName: `${clusterName}-${topicName}`,
                domain: "INFRA",
                type: "AWSMSKTOPIC",
                provider: "AwsMskTopic",
                "provider.clusterName": clusterName,
                "provider.topic": topicName,
                "provider.bytesInPerSec.Average": 50000 + Math.random() * 25000,
                "aws.kafka.ClusterName": clusterName,
                "aws.kafka.Topic": topicName,
                hostname: this.agentMetadata.hostname,
                sessionId,
                timestamp
            });
        });

        // Submit continuous metrics
        await this.submitEvents(events);
        console.log('   ✓ Continuous metrics submitted');
        
        // Continue streaming every 60 seconds
        console.log('   📊 Will continue streaming metrics every 60 seconds...');
    }

    groupEventsByType(events) {
        const groups = {};
        events.forEach(event => {
            if (!groups[event.eventType]) {
                groups[event.eventType] = [];
            }
            groups[event.eventType].push(event);
        });
        return groups;
    }

    async submitEvents(events) {
        const response = await axios.post(
            `https://insights-collector.newrelic.com/v1/accounts/${this.accountId}/events`,
            events,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Insert-Key': this.apiKey,
                    'X-License-Key': this.licenseKey,
                    'X-Agent-Hostname': this.agentMetadata.hostname,
                    'X-Agent-Run-Token': this.agentMetadata.agentRunId
                }
            }
        );
        
        if (response.status !== 200) {
            throw new Error(`API returned ${response.status}: ${JSON.stringify(response.data)}`);
        }
    }

    async verifyIntegration(clusterName) {
        console.log('\n🔍 Verifying integration...\n');
        
        // Check events
        const eventQueries = [
            {
                name: 'Infrastructure Events',
                query: `FROM InfrastructureEvent SELECT count(*) WHERE entityName = '${clusterName}' SINCE 5 minutes ago`
            },
            {
                name: 'Cluster Samples',
                query: `FROM AwsMskClusterSample SELECT count(*) WHERE provider.clusterName = '${clusterName}' SINCE 5 minutes ago`
            },
            {
                name: 'Integration Events',
                query: `FROM IntegrationEvent SELECT count(*) WHERE integrationName = 'com.newrelic.kafka' SINCE 5 minutes ago`
            }
        ];

        for (const q of eventQueries) {
            try {
                const response = await this.runNRQL(q.query);
                const count = response?.results?.[0]?.count || 0;
                console.log(`   ${q.name}: ${count > 0 ? '✅' : '❌'} (${count} events)`);
            } catch (error) {
                console.log(`   ${q.name}: ❌ Error`);
            }
        }

        // Check entity
        console.log('\n   Checking entity creation...');
        try {
            const entityQuery = `{
                actor {
                    entitySearch(query: "domain = 'INFRA' AND (type = 'AWSMSKCLUSTER' OR type = 'AWSMSKBROKER') AND name LIKE '%${clusterName}%'") {
                        count
                        results {
                            entities {
                                guid
                                name
                                type
                                reporting
                                tags {
                                    key
                                    values
                                }
                            }
                        }
                    }
                }
            }`;
            
            const response = await this.runGraphQL(entityQuery);
            const count = response?.data?.actor?.entitySearch?.count || 0;
            
            if (count > 0) {
                console.log(`   ✅ ${count} entities found!`);
                response.data.actor.entitySearch.results.entities.forEach(entity => {
                    console.log(`      ${entity.name} (${entity.type}) - Reporting: ${entity.reporting ? 'Yes' : 'No'}`);
                });
            } else {
                console.log(`   ❌ No entities found`);
            }
        } catch (error) {
            console.log(`   ❌ Error checking entity`);
        }

        console.log('\n📋 Next Steps:');
        console.log('1. Check Entity Explorer:');
        console.log(`   https://one.newrelic.com/redirect/entity/${this.accountId}`);
        console.log('2. Check Message Queues UI:');
        console.log('   https://one.newrelic.com/nr1-core/message-queues');
    }

    generateSessionId() {
        return crypto.randomBytes(16).toString('hex');
    }

    generateEntityGuid(type, name) {
        // Format: accountId|domain|type|identifier
        const typeMap = {
            'cluster': 'AWSMSKCLUSTER',
            'broker': 'AWSMSKBROKER',
            'topic': 'AWSMSKTOPIC',
            'HOST': 'HOST'
        };
        
        const entityType = typeMap[type] || type.toUpperCase();
        const identifier = crypto.createHash('sha256').update(name).digest('hex').substring(0, 16);
        const guidString = `${this.accountId}|INFRA|${entityType}|${identifier}`;
        
        return Buffer.from(guidString).toString('base64');
    }

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
                    'API-Key': this.userKey || this.apiKey
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
                    'API-Key': this.userKey || this.apiKey,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    }
}

// Main execution
async function main() {
    const simulator = new InfrastructureAgentSimulator();
    const clusterName = process.argv[2] || `infra-sim-${Date.now()}`;
    
    await simulator.simulateKafkaIntegration(clusterName);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { InfrastructureAgentSimulator };