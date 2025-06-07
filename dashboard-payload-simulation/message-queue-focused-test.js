#!/usr/bin/env node

/**
 * MessageQueueSample Focused Test
 * Theory: The UI specifically queries MessageQueueSample events
 * Let's test different MessageQueueSample payloads
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

class MessageQueueFocusedTest {
    constructor() {
        loadEnv();
        this.accountId = process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID;
        this.apiKey = process.env.IKEY || process.env.NEW_RELIC_API_KEY;
        this.queryKey = process.env.QKey || process.env.NEW_RELIC_QUERY_KEY;
        this.userKey = process.env.UKEY || process.env.NEW_RELIC_USER_KEY;
    }

    async runTests() {
        console.log('🎯 MessageQueueSample Focused Testing\n');
        
        // First, check what MessageQueueSample events exist
        await this.analyzeExistingMessageQueueSamples();
        
        // Find a target MSK entity
        const targetEntity = await this.findTargetEntity();
        if (!targetEntity) {
            console.error('❌ No MSK entities found');
            return;
        }
        
        console.log(`\n🎯 Target Entity: ${targetEntity.name}\n`);
        
        // Run focused tests
        await this.runMessageQueueTests(targetEntity);
    }

    async analyzeExistingMessageQueueSamples() {
        console.log('1️⃣ Analyzing Existing MessageQueueSample Events...\n');
        
        // Check all providers
        const providersQuery = `FROM MessageQueueSample 
            SELECT count(*), latest(entity.type), latest(queue.type), latest(collector.name)
            FACET provider 
            SINCE 1 day ago`;
        
        try {
            const response = await this.runNRQL(providersQuery);
            const results = response?.results || [];
            
            console.log('MessageQueueSample by Provider:');
            console.log('Provider | Count | Entity Type | Queue Type | Collector');
            console.log('---------|-------|-------------|------------|----------');
            
            results.forEach(r => {
                const provider = r.facet[0] || 'NULL';
                const count = r.count || 0;
                const entityType = r['latest.entity.type'] || 'N/A';
                const queueType = r['latest.queue.type'] || 'N/A';
                const collector = r['latest.collector.name'] || 'N/A';
                
                console.log(`${provider} | ${count} | ${entityType} | ${queueType} | ${collector}`);
            });
            
            // Check specifically for AWS MSK
            const mskQuery = `FROM MessageQueueSample 
                SELECT count(*), uniques(entity.name), uniques(entity.guid)
                WHERE provider = 'AwsMsk' OR provider = 'awsmsk' OR provider = 'AWS_MSK'
                SINCE 1 week ago`;
            
            const mskResponse = await this.runNRQL(mskQuery);
            const mskResult = mskResponse?.results?.[0] || {};
            
            console.log('\n\nAWS MSK Specific:');
            console.log(`Total events: ${mskResult.count || 0}`);
            console.log(`Unique entities: ${mskResult['uniques.entity.name']?.length || 0}`);
            
            if (mskResult['uniques.entity.name']?.length > 0) {
                console.log('Entity names:');
                mskResult['uniques.entity.name'].slice(0, 5).forEach(name => {
                    console.log(`  - ${name}`);
                });
            }
            
        } catch (error) {
            console.error('Error analyzing MessageQueueSample:', error.message);
        }
    }

    async findTargetEntity() {
        const query = `{
            actor {
                entitySearch(query: "domain = 'INFRA' AND type = 'AWSMSKCLUSTER' LIMIT 1") {
                    results {
                        entities {
                            guid
                            name
                            type
                        }
                    }
                }
            }
        }`;
        
        try {
            const response = await this.runGraphQL(query);
            const entities = response?.data?.actor?.entitySearch?.results?.entities || [];
            return entities[0];
        } catch (error) {
            return null;
        }
    }

    async runMessageQueueTests(targetEntity) {
        console.log('\n2️⃣ Running MessageQueueSample Tests...\n');
        
        const tests = [
            {
                name: 'Minimal MessageQueueSample',
                description: 'Absolute minimum fields',
                payload: {
                    eventType: 'MessageQueueSample',
                    provider: 'AwsMsk',
                    'entity.guid': targetEntity.guid,
                    'queue.name': targetEntity.name,
                    timestamp: Date.now()
                }
            },
            {
                name: 'Complete MessageQueueSample',
                description: 'All possible fields',
                payload: {
                    eventType: 'MessageQueueSample',
                    provider: 'AwsMsk',
                    providerAccountId: this.accountId,
                    'entity.guid': targetEntity.guid,
                    'entity.name': targetEntity.name,
                    'entity.type': 'AWSMSKCLUSTER',
                    entityGuid: targetEntity.guid,
                    entityName: targetEntity.name,
                    entityType: 'AWSMSKCLUSTER',
                    'queue.name': targetEntity.name,
                    'queue.type': 'kafka',
                    'queue.messagesPerSecond': 1000.5,
                    'queue.bytesInPerSecond': 1048576.0,
                    'queue.bytesOutPerSecond': 524288.0,
                    'queue.consumerLag': 0,
                    'queue.partitionCount': 10,
                    'queue.replicationFactor': 3,
                    'queue.brokerCount': 3,
                    'queue.topicCount': 5,
                    'collector.name': 'infrastructure-agent',
                    'instrumentation.name': 'newrelic-kafka-integration',
                    'instrumentation.provider': 'newrelic',
                    integrationName: 'com.newrelic.kafka',
                    integrationVersion: '2.13.0',
                    hostname: 'kafka-integration-host',
                    timestamp: Date.now()
                }
            },
            {
                name: 'Alternative Provider Formats',
                description: 'Test different provider values',
                payload: {
                    eventType: 'MessageQueueSample',
                    provider: 'awsmsk', // lowercase
                    'entity.guid': targetEntity.guid,
                    'queue.name': targetEntity.name,
                    'queue.type': 'kafka_msk',
                    timestamp: Date.now()
                }
            },
            {
                name: 'With AWS Context',
                description: 'Include AWS-specific fields',
                payload: {
                    eventType: 'MessageQueueSample',
                    provider: 'AwsMsk',
                    'entity.guid': targetEntity.guid,
                    'queue.name': targetEntity.name,
                    'aws.region': 'us-east-1',
                    'aws.accountId': '123456789012',
                    'aws.service': 'kafka',
                    'aws.msk.clusterName': targetEntity.name,
                    'aws.msk.clusterArn': `arn:aws:kafka:us-east-1:123456789012:cluster/${targetEntity.name}/12345678-1234-1234-1234-123456789012`,
                    timestamp: Date.now()
                }
            }
        ];
        
        for (let i = 0; i < tests.length; i++) {
            const test = tests[i];
            console.log(`Test ${i + 1}: ${test.name}`);
            console.log(`  ${test.description}`);
            
            try {
                // Submit event
                const response = await axios.post(
                    `https://insights-collector.newrelic.com/v1/accounts/${this.accountId}/events`,
                    [test.payload],
                    {
                        headers: {
                            'Api-Key': this.apiKey,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                
                console.log('  ✅ Event submitted');
                
                // Wait a bit
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Verify
                const verifyQuery = `FROM MessageQueueSample 
                    SELECT count(*) 
                    WHERE entity.guid = '${targetEntity.guid}'
                    SINCE 1 minute ago`;
                
                const verifyResponse = await this.runNRQL(verifyQuery);
                const count = verifyResponse?.results?.[0]?.count || 0;
                
                console.log(`  📊 Events in NRDB: ${count}`);
                
            } catch (error) {
                console.log(`  ❌ Error: ${error.message}`);
            }
            
            console.log('');
        }
        
        // Final check
        await this.finalVerification(targetEntity);
    }

    async finalVerification(targetEntity) {
        console.log('\n3️⃣ Final Verification...\n');
        
        // Check total MessageQueueSample events
        const totalQuery = `FROM MessageQueueSample 
            SELECT count(*), latest(provider), latest(queue.type), latest(collector.name)
            WHERE entity.guid = '${targetEntity.guid}' OR queue.name = '${targetEntity.name}'
            SINCE 10 minutes ago`;
        
        try {
            const response = await this.runNRQL(totalQuery);
            const result = response?.results?.[0] || {};
            
            console.log('MessageQueueSample Summary:');
            console.log(`  Total events: ${result.count || 0}`);
            console.log(`  Provider: ${result['latest.provider'] || 'N/A'}`);
            console.log(`  Queue type: ${result['latest.queue.type'] || 'N/A'}`);
            console.log(`  Collector: ${result['latest.collector.name'] || 'N/A'}`);
            
            if (result.count > 0) {
                console.log('\n✅ MessageQueueSample events exist!');
                console.log('\n🔍 UI Check:');
                console.log('1. Go to: https://one.newrelic.com/nr1-core/message-queues');
                console.log('2. Look for AWS MSK or Kafka section');
                console.log(`3. Search for: ${targetEntity.name}`);
                console.log('\nIf not visible, the issue is UI-specific filtering/requirements');
                
                // Additional debug query
                console.log('\n📊 Debug Query for NRQL Console:');
                console.log('```');
                console.log(`FROM MessageQueueSample SELECT * WHERE entity.guid = '${targetEntity.guid}' SINCE 1 hour ago`);
                console.log('```');
            } else {
                console.log('\n❌ No MessageQueueSample events created');
                console.log('This indicates a fundamental issue with event acceptance');
            }
            
        } catch (error) {
            console.error('Error in final verification:', error.message);
        }
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
    const tester = new MessageQueueFocusedTest();
    await tester.runTests();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { MessageQueueFocusedTest };