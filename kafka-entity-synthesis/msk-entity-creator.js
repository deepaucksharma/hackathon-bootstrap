#!/usr/bin/env node

/**
 * MSK Entity Creator - Working Implementation
 * Uses infrastructure agent patterns to create entities
 */

const axios = require('axios');
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

class MSKEntityCreator {
    constructor() {
        loadEnv();
        
        this.accountId = process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID;
        this.apiKey = process.env.IKEY || process.env.NEW_RELIC_API_KEY;
        this.queryKey = process.env.QKey || process.env.NEW_RELIC_QUERY_KEY;
        this.userKey = process.env.UKEY || process.env.NEW_RELIC_USER_KEY;
        
        if (!this.accountId || !this.apiKey) {
            console.error('❌ Missing required environment variables');
            console.error('   Please ensure .env file contains:');
            console.error('   ACC=your_account_id');
            console.error('   IKEY=your_ingest_key');
            process.exit(1);
        }
    }

    async createMSKCluster(clusterName, options = {}) {
        console.log('🚀 MSK Entity Creator');
        console.log('====================\n');
        console.log(`Creating MSK cluster: ${clusterName}\n`);

        const {
            brokerCount = 3,
            topics = ['orders', 'payments', 'inventory'],
            region = 'us-east-1'
        } = options;

        try {
            // Step 1: Create Infrastructure Context
            console.log('1️⃣ Creating infrastructure context...');
            await this.createInfrastructureContext(clusterName);
            
            // Step 2: Create MSK Entities
            console.log('\n2️⃣ Creating MSK entities...');
            await this.createMSKEntities(clusterName, brokerCount, topics, region);
            
            // Step 3: Start Metric Stream
            console.log('\n3️⃣ Starting metric stream...');
            await this.startMetricStream(clusterName, brokerCount, topics);
            
            // Step 4: Verify
            console.log('\n4️⃣ Verifying entity creation...');
            await new Promise(resolve => setTimeout(resolve, 15000));
            const verified = await this.verifyEntities(clusterName);
            
            if (verified) {
                console.log('\n✅ Success! MSK entities created.');
                console.log('\n📊 View your entities:');
                console.log(`   Message Queues: https://one.newrelic.com/nr1-core/message-queues`);
                console.log(`   Entity Explorer: https://one.newrelic.com/redirect/entity/${this.accountId}`);
                console.log(`   NRQL: FROM AwsMskClusterSample SELECT * WHERE provider.clusterName = '${clusterName}'`);
            } else {
                console.log('\n⚠️  Entities not yet visible. They may take up to 60 seconds to appear.');
                console.log('   Run the verification script to check status:');
                console.log(`   node verify-msk-entities.js ${clusterName}`);
            }
            
            return { success: verified, clusterName };
            
        } catch (error) {
            console.error('\n❌ Error:', error.message);
            return { success: false, error: error.message };
        }
    }

    async createInfrastructureContext(clusterName) {
        const hostname = `msk-integration-${clusterName}`;
        const timestamp = Date.now();
        
        const events = [
            // System context
            {
                eventType: "SystemSample",
                entityKey: `system:${hostname}`,
                hostname: hostname,
                "os.type": "linux",
                "agent.name": "Infrastructure",
                "agent.version": "1.28.0",
                timestamp
            },
            // Integration registration
            {
                eventType: "IntegrationEvent",
                integrationName: "com.newrelic.msk",
                integrationVersion: "2.13.0",
                hostname: hostname,
                category: "register",
                timestamp
            }
        ];
        
        await this.submitEvents(events);
        console.log('   ✓ Infrastructure context established');
    }

    async createMSKEntities(clusterName, brokerCount, topics, region) {
        const timestamp = Date.now();
        const events = [];
        
        // Cluster entity
        const clusterGuid = this.generateGuid('AWSMSKCLUSTER', clusterName);
        events.push({
            eventType: "InfrastructureEvent",
            category: "entity",
            entityKeys: [`msk:cluster:${clusterName}`],
            entityGuid: clusterGuid,
            entityName: clusterName,
            entityType: "AWSMSKCLUSTER",
            integrationName: "com.newrelic.msk",
            integrationVersion: "2.13.0",
            reportingEndpoint: `${clusterName}.kafka.${region}.amazonaws.com:9092`,
            timestamp
        });
        
        // Initial cluster sample
        events.push({
            eventType: "AwsMskClusterSample",
            entityGuid: clusterGuid,
            entityName: clusterName,
            entityType: "AWSMSKCLUSTER",
            provider: "AwsMskCluster",
            "provider.clusterName": clusterName,
            "provider.activeControllerCount.Sum": 1,
            "provider.offlinePartitionsCount.Sum": 0,
            "provider.globalPartitionCount.Average": brokerCount * topics.length,
            "provider.globalTopicCount.Average": topics.length,
            "aws.region": region,
            timestamp
        });
        
        // Broker entities
        for (let i = 1; i <= brokerCount; i++) {
            const brokerGuid = this.generateGuid('AWSMSKBROKER', `${clusterName}-broker-${i}`);
            events.push({
                eventType: "AwsMskBrokerSample",
                entityGuid: brokerGuid,
                entityName: `${clusterName}-broker-${i}`,
                entityType: "AWSMSKBROKER",
                provider: "AwsMskBroker",
                "provider.clusterName": clusterName,
                "provider.brokerId": i.toString(),
                "provider.bytesInPerSec.Average": 100000 + Math.random() * 50000,
                "provider.bytesOutPerSec.Average": 80000 + Math.random() * 40000,
                "provider.cpuUser.Average": 15 + Math.random() * 25,
                timestamp
            });
        }
        
        // Topic entities
        topics.forEach(topicName => {
            const topicGuid = this.generateGuid('AWSMSKTOPIC', `${clusterName}-${topicName}`);
            events.push({
                eventType: "AwsMskTopicSample",
                entityGuid: topicGuid,
                entityName: `${clusterName}-${topicName}`,
                entityType: "AWSMSKTOPIC",
                provider: "AwsMskTopic",
                "provider.clusterName": clusterName,
                "provider.topic": topicName,
                "provider.bytesInPerSec.Average": 50000 + Math.random() * 25000,
                "provider.messagesInPerSec.Average": 1000 + Math.random() * 500,
                timestamp
            });
        });
        
        await this.submitEvents(events);
        console.log(`   ✓ Created ${1} cluster, ${brokerCount} brokers, ${topics.length} topics`);
    }

    async startMetricStream(clusterName, brokerCount, topics) {
        // Submit a continuous stream of metrics
        const submitMetrics = async () => {
            const timestamp = Date.now();
            const events = [];
            
            // Cluster metrics
            events.push({
                eventType: "AwsMskClusterSample",
                entityName: clusterName,
                provider: "AwsMskCluster",
                "provider.clusterName": clusterName,
                "provider.activeControllerCount.Sum": 1,
                "provider.globalPartitionCount.Average": brokerCount * topics.length + Math.floor(Math.random() * 5),
                "provider.messagesInPerSec.Average": 5000 + Math.random() * 2000,
                timestamp
            });
            
            // Broker metrics
            for (let i = 1; i <= brokerCount; i++) {
                events.push({
                    eventType: "AwsMskBrokerSample",
                    entityName: `${clusterName}-broker-${i}`,
                    provider: "AwsMskBroker",
                    "provider.clusterName": clusterName,
                    "provider.brokerId": i.toString(),
                    "provider.bytesInPerSec.Average": 100000 + Math.random() * 50000,
                    "provider.cpuUser.Average": 15 + Math.random() * 25,
                    "provider.networkRxPackets.Average": 1000 + Math.random() * 500,
                    timestamp
                });
            }
            
            await this.submitEvents(events);
        };
        
        // Submit initial metrics
        await submitMetrics();
        console.log('   ✓ Metric stream started');
        
        // Continue streaming every 60 seconds
        setInterval(submitMetrics, 60000);
    }

    async verifyEntities(clusterName) {
        // Check for events
        const eventQuery = `FROM AwsMskClusterSample SELECT count(*) WHERE provider.clusterName = '${clusterName}' SINCE 2 minutes ago`;
        
        try {
            const response = await axios.get(
                `https://insights-api.newrelic.com/v1/accounts/${this.accountId}/query`,
                {
                    params: { nrql: eventQuery },
                    headers: {
                        'X-Query-Key': this.queryKey,
                        'Accept': 'application/json'
                    }
                }
            );
            
            const eventCount = response?.data?.results?.[0]?.count || 0;
            console.log(`   Events: ${eventCount > 0 ? '✓' : '✗'} (${eventCount} found)`);
            
            // Check for entity
            const entityQuery = `{
                actor {
                    entitySearch(query: "domain='INFRA' AND type='AWSMSKCLUSTER' AND name='${clusterName}'") {
                        count
                    }
                }
            }`;
            
            const entityResponse = await axios.post(
                'https://api.newrelic.com/graphql',
                { query: entityQuery },
                {
                    headers: {
                        'Api-Key': this.userKey,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            const entityCount = entityResponse?.data?.data?.actor?.entitySearch?.count || 0;
            console.log(`   Entity: ${entityCount > 0 ? '✓' : '✗'} (${entityCount} found)`);
            
            return eventCount > 0;
            
        } catch (error) {
            console.log('   Unable to verify (API key may lack permissions)');
            return false;
        }
    }

    async submitEvents(events) {
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
        
        if (response.status !== 200) {
            throw new Error(`API returned ${response.status}`);
        }
    }

    generateGuid(type, name) {
        const components = [this.accountId, 'INFRA', type, name];
        return Buffer.from(components.join('|'))
            .toString('base64')
            .replace(/[+/=]/g, '')
            .substring(0, 32);
    }
}

// CLI Interface
async function main() {
    const creator = new MSKEntityCreator();
    
    const clusterName = process.argv[2] || `msk-cluster-${Date.now()}`;
    const options = {
        brokerCount: parseInt(process.argv[3]) || 3,
        topics: process.argv[4] ? process.argv[4].split(',') : ['orders', 'payments', 'inventory'],
        region: process.argv[5] || 'us-east-1'
    };
    
    console.log('Usage: node msk-entity-creator.js [cluster-name] [broker-count] [topics] [region]');
    console.log('Example: node msk-entity-creator.js my-cluster 3 orders,payments us-east-1\n');
    
    await creator.createMSKCluster(clusterName, options);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { MSKEntityCreator };