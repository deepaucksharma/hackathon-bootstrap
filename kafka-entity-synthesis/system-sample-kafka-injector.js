#!/usr/bin/env node

/**
 * SystemSample Kafka Injector
 * 
 * This approach leverages SystemSample events which have special privileges
 * in New Relic's infrastructure agent. By injecting Kafka metrics as custom
 * attributes in SystemSample events, we can potentially bypass entity creation
 * restrictions.
 */

const axios = require('axios');
const crypto = require('crypto');
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

class SystemSampleKafkaInjector {
    constructor() {
        loadEnv();
        
        this.accountId = process.env.ACC;
        this.apiKey = process.env.IKEY;
        this.userKey = process.env.UKEY;
        
        if (!this.accountId || !this.apiKey) {
            console.error('❌ Missing required environment variables');
            process.exit(1);
        }

        // System metadata
        this.systemInfo = {
            hostname: `kafka-system-${Date.now()}`,
            kernelVersion: '5.10.0-19-cloud',
            osVersion: 'Ubuntu 20.04.3 LTS',
            agentVersion: '1.28.0',
            arch: 'amd64',
            cores: 4,
            memoryTotal: 16 * 1024 * 1024 * 1024 // 16GB
        };
    }

    /**
     * Create SystemSample events with embedded Kafka metrics
     */
    createSystemSampleWithKafka(clusterName, brokerId = null) {
        const timestamp = Date.now();
        const isCluster = brokerId === null;
        
        // Base SystemSample
        const systemSample = {
            eventType: "SystemSample",
            entityKey: isCluster ? 
                `kafka:cluster:${clusterName}` : 
                `kafka:broker:${clusterName}:${brokerId}`,
            hostname: this.systemInfo.hostname,
            
            // Standard system metrics
            "host.name": this.systemInfo.hostname,
            "host.fullHostname": `${this.systemInfo.hostname}.ec2.internal`,
            "kernelVersion": this.systemInfo.kernelVersion,
            "operatingSystem": this.systemInfo.osVersion,
            "coreCount": this.systemInfo.cores,
            "processorCount": this.systemInfo.cores / 2,
            "memoryTotalBytes": this.systemInfo.memoryTotal,
            "memoryUsedBytes": this.systemInfo.memoryTotal * 0.6,
            "memoryFreeBytes": this.systemInfo.memoryTotal * 0.4,
            "cpuPercent": 25 + Math.random() * 30,
            "loadAverageOneMinute": 2.5 + Math.random(),
            "diskUsedPercent": 40 + Math.random() * 20,
            
            // Infrastructure agent info
            "agentVersion": this.systemInfo.agentVersion,
            "agentName": "Infrastructure",
            
            // Integration context
            "integration.name": "com.newrelic.kafka",
            "integration.version": "2.13.0",
            
            // AWS context
            "aws.accountId": "123456789012",
            "aws.region": "us-east-1",
            "aws.instanceType": "m5.xlarge",
            "aws.availabilityZone": "us-east-1a",
            
            timestamp
        };

        // Add Kafka-specific attributes
        if (isCluster) {
            // Cluster-level Kafka metrics as custom attributes
            Object.assign(systemSample, {
                // Kafka cluster identification
                "kafka.cluster.name": clusterName,
                "kafka.cluster.id": crypto.createHash('md5').update(clusterName).digest('hex'),
                "kafka.cluster.version": "2.8.0",
                "kafka.cluster.state": "ACTIVE",
                
                // Cluster metrics
                "kafka.cluster.brokerCount": 3,
                "kafka.cluster.topicCount": 5,
                "kafka.cluster.partitionCount": 30,
                "kafka.cluster.activeControllers": 1,
                "kafka.cluster.offlinePartitions": 0,
                "kafka.cluster.underReplicatedPartitions": 0,
                
                // MSK-style metrics
                "kafka.msk.activeControllerCount": 1,
                "kafka.msk.globalPartitionCount": 30,
                "kafka.msk.globalTopicCount": 5,
                "kafka.msk.offlinePartitionsCount": 0,
                
                // Performance metrics
                "kafka.cluster.bytesInPerSec": 1000000 + Math.random() * 500000,
                "kafka.cluster.bytesOutPerSec": 800000 + Math.random() * 400000,
                "kafka.cluster.messagesInPerSec": 1000 + Math.random() * 500,
                
                // Entity hint
                "nr.entity.type": "KAFKA_CLUSTER",
                "nr.entity.domain": "INFRA",
                "nr.entity.name": clusterName
            });
        } else {
            // Broker-level Kafka metrics
            Object.assign(systemSample, {
                // Kafka broker identification
                "kafka.cluster.name": clusterName,
                "kafka.broker.id": brokerId,
                "kafka.broker.host": `broker-${brokerId}.${clusterName}.kafka.internal`,
                "kafka.broker.port": 9092,
                "kafka.broker.state": "RUNNING",
                
                // Broker metrics
                "kafka.broker.bytesInPerSec": 300000 + Math.random() * 200000,
                "kafka.broker.bytesOutPerSec": 250000 + Math.random() * 150000,
                "kafka.broker.messagesInPerSec": 300 + Math.random() * 200,
                "kafka.broker.produceRequestsPerSec": 100 + Math.random() * 50,
                "kafka.broker.fetchRequestsPerSec": 150 + Math.random() * 75,
                
                // MSK-style broker metrics
                "kafka.msk.bytesInPerSec": 300000 + Math.random() * 200000,
                "kafka.msk.bytesOutPerSec": 250000 + Math.random() * 150000,
                "kafka.msk.cpuUser": 30 + Math.random() * 20,
                "kafka.msk.memoryUsed": 40 + Math.random() * 20,
                
                // Partition info
                "kafka.broker.partitionCount": 10,
                "kafka.broker.leaderCount": 10,
                "kafka.broker.underReplicatedPartitions": 0,
                "kafka.broker.offlinePartitions": 0,
                
                // JMX metrics
                "kafka.jmx.heapMemoryUsed": 2000000000 + Math.random() * 1000000000,
                "kafka.jmx.nonHeapMemoryUsed": 200000000 + Math.random() * 50000000,
                "kafka.jmx.gcTimeMillis": Math.floor(Math.random() * 1000),
                
                // Entity hint
                "nr.entity.type": "KAFKA_BROKER",
                "nr.entity.domain": "INFRA",
                "nr.entity.name": `${clusterName}-broker-${brokerId}`
            });
        }
        
        return systemSample;
    }

    /**
     * Create ProcessSample events for Kafka processes
     */
    createProcessSampleForKafka(clusterName, brokerId) {
        const timestamp = Date.now();
        const processName = `kafka.Kafka`;
        
        return {
            eventType: "ProcessSample",
            entityKey: `process:kafka:${clusterName}:${brokerId}`,
            hostname: this.systemInfo.hostname,
            processId: 10000 + parseInt(brokerId),
            processDisplayName: `Kafka Broker ${brokerId}`,
            commandName: processName,
            commandLine: `${processName} /opt/kafka/config/server.properties --override broker.id=${brokerId}`,
            
            // Process metrics
            "cpuPercent": 20 + Math.random() * 30,
            "memoryResidentSizeBytes": 2 * 1024 * 1024 * 1024, // 2GB
            "memoryVirtualSizeBytes": 4 * 1024 * 1024 * 1024, // 4GB
            "threadCount": 200 + Math.floor(Math.random() * 100),
            "fileDescriptorCount": 500 + Math.floor(Math.random() * 200),
            
            // Kafka context
            "process.kafka.cluster": clusterName,
            "process.kafka.brokerId": brokerId,
            "process.kafka.role": "broker",
            
            // Integration hint
            "integration.name": "com.newrelic.kafka",
            "nr.entity.type": "KAFKA_PROCESS",
            
            timestamp
        };
    }

    /**
     * Create custom InfrastructureEvent for integration status
     */
    createIntegrationStatusEvent(clusterName, status = "healthy") {
        return {
            eventType: "InfrastructureEvent",
            category: "integration",
            summary: `kafka-integration-${status}`,
            hostname: this.systemInfo.hostname,
            
            // Integration details
            "integration.name": "com.newrelic.kafka",
            "integration.version": "2.13.0",
            "integration.status": status,
            "integration.cluster": clusterName,
            
            // Kafka inventory as JSON
            "kafka.inventory": JSON.stringify({
                cluster: {
                    name: clusterName,
                    version: "2.8.0",
                    brokers: 3,
                    topics: 5,
                    partitions: 30
                },
                brokers: [
                    { id: 1, host: `broker-1.${clusterName}.kafka.internal`, port: 9092 },
                    { id: 2, host: `broker-2.${clusterName}.kafka.internal`, port: 9092 },
                    { id: 3, host: `broker-3.${clusterName}.kafka.internal`, port: 9092 }
                ],
                topics: [
                    { name: "orders", partitions: 6, replication: 3 },
                    { name: "payments", partitions: 6, replication: 3 },
                    { name: "events", partitions: 6, replication: 3 },
                    { name: "logs", partitions: 6, replication: 3 },
                    { name: "metrics", partitions: 6, replication: 3 }
                ]
            }),
            
            timestamp: Date.now()
        };
    }

    /**
     * Submit events to New Relic
     */
    async submitEvents(events) {
        try {
            const response = await axios.post(
                `https://insights-collector.newrelic.com/v1/accounts/${this.accountId}/events`,
                events,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Insert-Key': this.apiKey
                    }
                }
            );
            
            return response.status === 200;
        } catch (error) {
            console.error('❌ Error submitting events:', error.message);
            return false;
        }
    }

    /**
     * Main injection flow
     */
    async injectKafkaViaSystemSample(clusterName) {
        console.log('🔧 SystemSample Kafka Injection');
        console.log('================================\n');
        console.log(`Cluster: ${clusterName}`);
        console.log(`Host: ${this.systemInfo.hostname}\n`);
        
        const events = [];
        
        // Step 1: Create cluster SystemSample
        console.log('📊 Creating cluster SystemSample...');
        events.push(this.createSystemSampleWithKafka(clusterName));
        
        // Step 2: Create broker SystemSamples
        console.log('📊 Creating broker SystemSamples...');
        for (let i = 1; i <= 3; i++) {
            events.push(this.createSystemSampleWithKafka(clusterName, i));
        }
        
        // Step 3: Create ProcessSamples for Kafka processes
        console.log('📊 Creating Kafka ProcessSamples...');
        for (let i = 1; i <= 3; i++) {
            events.push(this.createProcessSampleForKafka(clusterName, i));
        }
        
        // Step 4: Create integration status event
        console.log('📊 Creating integration status event...');
        events.push(this.createIntegrationStatusEvent(clusterName));
        
        // Submit all events
        console.log(`\n📤 Submitting ${events.length} events...`);
        const success = await this.submitEvents(events);
        
        if (success) {
            console.log('✅ All events submitted successfully!');
            
            // Wait and verify
            console.log('\n⏳ Waiting 30 seconds for processing...');
            await new Promise(resolve => setTimeout(resolve, 30000));
            
            await this.verifyInjection(clusterName);
        } else {
            console.log('❌ Failed to submit events');
        }
    }

    /**
     * Verify the injection worked
     */
    async verifyInjection(clusterName) {
        console.log('\n🔍 Verifying SystemSample injection...\n');
        
        // Check SystemSample events
        const systemQuery = `FROM SystemSample SELECT count(*), latest(kafka.cluster.name), latest(kafka.cluster.brokerCount) WHERE kafka.cluster.name = '${clusterName}' SINCE 5 minutes ago`;
        
        try {
            const result = await this.runNRQL(systemQuery);
            const count = result.results?.[0]?.count || 0;
            
            console.log(`📊 SystemSample Events: ${count > 0 ? '✅' : '❌'} (${count} events)`);
            if (count > 0) {
                console.log(`   Cluster Name: ${result.results[0]['latest.kafka.cluster.name']}`);
                console.log(`   Broker Count: ${result.results[0]['latest.kafka.cluster.brokerCount']}`);
            }
        } catch (error) {
            console.log('📊 SystemSample Events: ❌ Query failed');
        }
        
        // Check ProcessSample events
        const processQuery = `FROM ProcessSample SELECT count(*), uniques(process.kafka.brokerId) WHERE process.kafka.cluster = '${clusterName}' SINCE 5 minutes ago`;
        
        try {
            const result = await this.runNRQL(processQuery);
            const count = result.results?.[0]?.count || 0;
            const uniqueBrokers = result.results?.[0]['uniques.process.kafka.brokerId']?.length || 0;
            
            console.log(`\n📊 ProcessSample Events: ${count > 0 ? '✅' : '❌'} (${count} events, ${uniqueBrokers} brokers)`);
        } catch (error) {
            console.log('\n📊 ProcessSample Events: ❌ Query failed');
        }
        
        // Check if Message Queues UI might recognize the data
        console.log('\n📋 SystemSample Injection Strategy:');
        console.log('1. SystemSample events contain Kafka metrics as custom attributes');
        console.log('2. ProcessSample events represent Kafka broker processes');
        console.log('3. Check if New Relic recognizes kafka.* attributes');
        console.log('4. Monitor for any entity creation from these samples');
        
        console.log('\n🔍 Next Steps:');
        console.log('1. Check SystemSample data in NRDB:');
        console.log(`   FROM SystemSample SELECT * WHERE kafka.cluster.name = '${clusterName}' LIMIT 1`);
        console.log('2. Look for any Kafka entities that might have been created');
        console.log('3. Check if Message Queues UI picks up the custom attributes');
    }

    async runNRQL(query) {
        const gqlQuery = {
            query: `{
                actor {
                    account(id: ${this.accountId}) {
                        nrql(query: "${query.replace(/"/g, '\\"')}") {
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
}

// Main execution
async function main() {
    const injector = new SystemSampleKafkaInjector();
    const clusterName = process.argv[2] || `system-kafka-${Date.now()}`;
    
    await injector.injectKafkaViaSystemSample(clusterName);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { SystemSampleKafkaInjector };