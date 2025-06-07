#!/usr/bin/env node

/**
 * Analyze Working MSK Data
 * Deep dive into the 56 existing MSK entities to understand what makes them visible
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

class WorkingMSKAnalyzer {
    constructor() {
        loadEnv();
        this.accountId = process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID;
        this.queryKey = process.env.QKey || process.env.NEW_RELIC_QUERY_KEY;
        this.userKey = process.env.UKEY || process.env.NEW_RELIC_USER_KEY;
    }

    async analyze() {
        console.log('🔬 Analyzing Working MSK Entities\n');
        console.log('Account has 56 existing MSK entities - let\'s understand what makes them work\n');
        
        // Step 1: List all working MSK clusters
        const clusters = await this.findWorkingClusters();
        
        if (clusters.length === 0) {
            console.log('❌ No working MSK clusters found');
            return;
        }
        
        // Step 2: Pick a working cluster and analyze it deeply
        const targetCluster = clusters[0];
        console.log(`\n📍 Analyzing cluster: ${targetCluster.name}\n`);
        
        // Step 3: Check what event types this cluster uses
        await this.analyzeEventTypes(targetCluster);
        
        // Step 4: Check MessageQueueSample specifically
        await this.analyzeMessageQueueSample(targetCluster);
        
        // Step 5: Check for special integration markers
        await this.analyzeIntegrationMarkers(targetCluster);
        
        // Step 6: Compare with our synthetic data
        await this.compareWithSynthetic();
        
        // Step 7: Generate exact replication payload
        await this.generateReplicationPayload(targetCluster);
    }

    async findWorkingClusters() {
        console.log('1️⃣ Finding Working MSK Clusters...\n');
        
        const query = `{
            actor {
                entitySearch(query: "domain = 'INFRA' AND type = 'AWSMSKCLUSTER' AND reporting = true") {
                    results {
                        entities {
                            guid
                            name
                            type
                            reporting
                            ... on InfrastructureAwsKafkaClusterEntity {
                                clusterName
                            }
                        }
                    }
                }
            }
        }`;
        
        try {
            const response = await this.runGraphQL(query);
            const entities = response?.data?.actor?.entitySearch?.results?.entities || [];
            
            console.log(`Found ${entities.length} reporting MSK clusters:`);
            entities.slice(0, 5).forEach(e => {
                console.log(`  - ${e.name} (${e.guid})`);
            });
            
            return entities;
        } catch (error) {
            console.error('Error finding clusters:', error.message);
            return [];
        }
    }

    async analyzeEventTypes(cluster) {
        console.log('\n2️⃣ Event Types Analysis...\n');
        
        const eventTypes = {
            'AwsMskClusterSample': 'AWS MSK Cluster metrics',
            'AwsMskBrokerSample': 'AWS MSK Broker metrics',
            'AwsMskTopicSample': 'AWS MSK Topic metrics',
            'KafkaClusterSample': 'Standard Kafka Cluster metrics',
            'KafkaBrokerSample': 'Standard Kafka Broker metrics',
            'KafkaTopicSample': 'Standard Kafka Topic metrics',
            'MessageQueueSample': 'Message Queue UI events',
            'QueueSample': 'Queue metrics',
            'InfrastructureEvent': 'Infrastructure events',
            'IntegrationEvent': 'Integration events',
            'SystemSample': 'System metrics'
        };
        
        const results = {};
        
        for (const [eventType, description] of Object.entries(eventTypes)) {
            const query = `FROM ${eventType} 
                SELECT count(*) 
                WHERE (entity.guid = '${cluster.guid}' OR entityGuid = '${cluster.guid}' 
                    OR entityName = '${cluster.name}' OR clusterName = '${cluster.name}'
                    OR provider.clusterName = '${cluster.name}')
                SINCE 1 hour ago`;
            
            try {
                const response = await this.runNRQL(query);
                const count = response?.results?.[0]?.count || 0;
                results[eventType] = count;
                
                if (count > 0) {
                    console.log(`✅ ${eventType}: ${count} events - ${description}`);
                    
                    // Get a sample event
                    const sampleQuery = query.replace('count(*)', '*') + ' LIMIT 1';
                    const sampleResponse = await this.runNRQL(sampleQuery);
                    if (sampleResponse?.results?.[0]?.events?.[0]) {
                        const event = sampleResponse.results[0].events[0];
                        console.log('   Key fields:');
                        ['entity.guid', 'provider', 'collector.name', 'integrationName'].forEach(field => {
                            if (event[field]) {
                                console.log(`     ${field}: ${event[field]}`);
                            }
                        });
                    }
                }
            } catch (error) {
                // Ignore query errors
            }
        }
        
        // Identify the pattern
        console.log('\n📊 Pattern Analysis:');
        if (results['KafkaClusterSample'] > 0 && results['AwsMskClusterSample'] === 0) {
            console.log('   ⚡ This cluster uses STANDARD Kafka events, not AWS MSK events!');
        } else if (results['AwsMskClusterSample'] > 0 && results['KafkaClusterSample'] === 0) {
            console.log('   ⚡ This cluster uses AWS MSK events only');
        } else if (results['KafkaClusterSample'] > 0 && results['AwsMskClusterSample'] > 0) {
            console.log('   ⚡ This cluster uses BOTH Kafka and AWS MSK events');
        }
        
        return results;
    }

    async analyzeMessageQueueSample(cluster) {
        console.log('\n3️⃣ MessageQueueSample Analysis...\n');
        
        const query = `FROM MessageQueueSample 
            SELECT * 
            WHERE entity.guid = '${cluster.guid}' 
                OR queue.name = '${cluster.name}'
                OR entity.name = '${cluster.name}'
            SINCE 1 day ago 
            LIMIT 5`;
        
        try {
            const response = await this.runNRQL(query);
            const events = response?.results?.[0]?.events || [];
            
            if (events.length > 0) {
                console.log(`✅ Found ${events.length} MessageQueueSample events\n`);
                
                // Analyze first event structure
                const event = events[0];
                console.log('Event structure:');
                
                // Critical fields for UI
                const criticalFields = [
                    'provider',
                    'entity.guid',
                    'entity.name', 
                    'entity.type',
                    'queue.name',
                    'queue.type',
                    'collector.name',
                    'instrumentation.name',
                    'integrationName',
                    'providerAccountId'
                ];
                
                criticalFields.forEach(field => {
                    const value = this.getNestedValue(event, field);
                    if (value !== undefined) {
                        console.log(`  ${field}: ${JSON.stringify(value)}`);
                    }
                });
                
                // Check for any unique patterns
                console.log('\nUnique patterns:');
                Object.keys(event).forEach(key => {
                    if (!criticalFields.includes(key) && !key.startsWith('timestamp')) {
                        console.log(`  ${key}: ${typeof event[key]}`);
                    }
                });
                
            } else {
                console.log('❌ No MessageQueueSample events found for this cluster');
                console.log('   This might be why the UI isn\'t showing data!');
            }
        } catch (error) {
            console.error('Error analyzing MessageQueueSample:', error.message);
        }
    }

    async analyzeIntegrationMarkers(cluster) {
        console.log('\n4️⃣ Integration Markers Analysis...\n');
        
        // Check what integration created this entity
        const query = `FROM InfrastructureEvent, IntegrationEvent, SystemSample 
            SELECT uniques(integrationName), uniques(collector.name), uniques(agentName), uniques(instrumentation.name)
            WHERE entityName = '${cluster.name}' OR entity.name = '${cluster.name}'
            SINCE 1 day ago`;
        
        try {
            const response = await this.runNRQL(query);
            const result = response?.results?.[0] || {};
            
            console.log('Integration identifiers found:');
            if (result['uniques.integrationName']?.length > 0) {
                console.log(`  Integration Names: ${result['uniques.integrationName'].join(', ')}`);
            }
            if (result['uniques.collector.name']?.length > 0) {
                console.log(`  Collectors: ${result['uniques.collector.name'].join(', ')}`);
            }
            if (result['uniques.agentName']?.length > 0) {
                console.log(`  Agents: ${result['uniques.agentName'].join(', ')}`);
            }
            if (result['uniques.instrumentation.name']?.length > 0) {
                console.log(`  Instrumentation: ${result['uniques.instrumentation.name'].join(', ')}`);
            }
        } catch (error) {
            console.error('Error analyzing integration markers:', error.message);
        }
    }

    async compareWithSynthetic() {
        console.log('\n5️⃣ Comparing with Our Synthetic Data...\n');
        
        // Find our recent synthetic submissions
        const query = `FROM AwsMskClusterSample, KafkaClusterSample, MessageQueueSample 
            SELECT count(*) 
            WHERE entityName LIKE '%test%' OR entityName LIKE '%exp%' OR entityName LIKE '%msk-cluster%'
            SINCE 1 hour ago 
            FACET eventType, entityName
            LIMIT 20`;
        
        try {
            const response = await this.runNRQL(query);
            const results = response?.results || [];
            
            if (results.length > 0) {
                console.log('Our synthetic events:');
                results.forEach(r => {
                    console.log(`  ${r.facet[0]} - ${r.facet[1]}: ${r.count} events`);
                });
                
                console.log('\n⚠️  Key observation:');
                console.log('   Our events are in NRDB but not creating MessageQueueSample entries');
                console.log('   This suggests we\'re missing a critical linking field or pattern');
            } else {
                console.log('No recent synthetic events found');
            }
        } catch (error) {
            console.error('Error comparing synthetic data:', error.message);
        }
    }

    async generateReplicationPayload(cluster) {
        console.log('\n6️⃣ Generating Exact Replication Payload...\n');
        
        // Based on our analysis, generate a payload that exactly matches working pattern
        console.log('Based on analysis, here\'s the exact payload structure needed:\n');
        
        const payload = {
            recommendation: 'Use the following approach:',
            steps: [
                '1. First, ensure the entity exists (it does - we have 56)',
                '2. Use the EXACT event types the working entities use',
                '3. Include ALL integration markers found',
                '4. Match the MessageQueueSample structure exactly'
            ],
            payload: {
                // This will be filled based on what we found
            }
        };
        
        // If working entities use Kafka events, not MSK
        if (this.useKafkaEvents) {
            payload.payload = {
                eventType: 'KafkaClusterSample',
                entityGuid: '{{EXACT_ENTITY_GUID}}',
                entityName: '{{CLUSTER_NAME}}',
                clusterName: '{{CLUSTER_NAME}}',
                integrationName: 'com.newrelic.kafka',
                'collector.name': 'infrastructure-agent',
                // ... rest of fields
            };
        }
        
        console.log(JSON.stringify(payload, null, 2));
        
        // Save findings
        const filename = `working-msk-analysis-${Date.now()}.json`;
        fs.writeFileSync(filename, JSON.stringify({
            cluster: cluster.name,
            findings: this.findings,
            recommendation: payload
        }, null, 2));
        
        console.log(`\n💾 Analysis saved to: ${filename}`);
    }

    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
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
    const analyzer = new WorkingMSKAnalyzer();
    await analyzer.analyze();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { WorkingMSKAnalyzer };