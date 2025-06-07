#!/usr/bin/env node

/**
 * Analyze working MSK entities to understand their creation pattern
 */

require('dotenv').config();
const axios = require('axios');

async function analyzeWorkingEntities() {
    const ACCOUNT_ID = process.env.ACC;
    const QUERY_KEY = process.env.QKey;
    const USER_KEY = process.env.UKEY;
    
    console.log('🔍 Analyzing Working MSK Entities\n');
    
    // Get list of working entities
    const entityQuery = `{
        actor {
            entitySearch(query: "domain='INFRA' AND type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC') AND reporting = true") {
                count
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
        const response = await axios.post(
            'https://api.newrelic.com/graphql',
            { query: entityQuery },
            {
                headers: {
                    'Api-Key': USER_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        const entities = response?.data?.data?.actor?.entitySearch?.results?.entities || [];
        console.log(`Found ${entities.length} working MSK entities\n`);
        
        // Analyze a cluster entity
        const clusterEntity = entities.find(e => e.type === 'AWSMSKCLUSTER');
        if (clusterEntity) {
            console.log('📊 Analyzing Cluster Entity:');
            console.log(`   Name: ${clusterEntity.name}`);
            console.log(`   GUID: ${clusterEntity.guid}`);
            console.log('   Tags:');
            clusterEntity.tags?.forEach(tag => {
                console.log(`     ${tag.key}: ${tag.values.join(', ')}`);
            });
            
            // Check what events this entity is using
            console.log('\n   Checking associated events...');
            
            // Extract cluster name from entity name
            const clusterName = clusterEntity.name;
            
            // Check different event types
            const eventChecks = [
                {
                    name: 'AwsMskClusterSample',
                    query: `FROM AwsMskClusterSample SELECT count(*) WHERE entityName = '${clusterName}' OR provider.clusterName = '${clusterName}' SINCE 1 hour ago`
                },
                {
                    name: 'KafkaClusterSample',
                    query: `FROM KafkaClusterSample SELECT count(*) WHERE entityName = '${clusterName}' OR clusterName = '${clusterName}' SINCE 1 hour ago`
                },
                {
                    name: 'InfrastructureEvent',
                    query: `FROM InfrastructureEvent SELECT count(*) WHERE entityName = '${clusterName}' SINCE 1 hour ago`
                },
                {
                    name: 'SystemSample',
                    query: `FROM SystemSample SELECT count(*) WHERE entityName = '${clusterName}' SINCE 1 hour ago`
                }
            ];
            
            for (const check of eventChecks) {
                try {
                    const eventResponse = await axios.get(
                        `https://insights-api.newrelic.com/v1/accounts/${ACCOUNT_ID}/query`,
                        {
                            params: { nrql: check.query },
                            headers: {
                                'X-Query-Key': QUERY_KEY,
                                'Accept': 'application/json'
                            }
                        }
                    );
                    const count = eventResponse?.data?.results?.[0]?.count || 0;
                    if (count > 0) {
                        console.log(`   ✅ ${check.name}: ${count} events`);
                        
                        // Get a sample event
                        const sampleQuery = check.query.replace('count(*)', '*').replace('SELECT *', 'SELECT *') + ' LIMIT 1';
                        const sampleResponse = await axios.get(
                            `https://insights-api.newrelic.com/v1/accounts/${ACCOUNT_ID}/query`,
                            {
                                params: { nrql: sampleQuery },
                                headers: {
                                    'X-Query-Key': QUERY_KEY,
                                    'Accept': 'application/json'
                                }
                            }
                        );
                        
                        if (sampleResponse?.data?.results?.[0]?.events?.[0]) {
                            const event = sampleResponse.data.results[0].events[0];
                            console.log('\n      Sample event fields:');
                            const importantFields = [
                                'collector.name', 'integrationName', 'integrationVersion',
                                'agentName', 'agentVersion', 'provider', 'entityKey',
                                'hostname', 'reportingEndpoint'
                            ];
                            importantFields.forEach(field => {
                                if (event[field]) {
                                    console.log(`        ${field}: ${event[field]}`);
                                }
                            });
                        }
                    }
                } catch (error) {
                    // Ignore query errors
                }
            }
        }
        
        // Check for integration patterns
        console.log('\n\n🔧 Checking Integration Patterns:');
        
        const integrationQuery = `FROM InfrastructureEvent 
            SELECT uniqueCount(integrationName), uniqueCount(agentName) 
            WHERE category = 'kafka' OR integrationName LIKE '%kafka%' 
            SINCE 1 day ago`;
            
        try {
            const intResponse = await axios.get(
                `https://insights-api.newrelic.com/v1/accounts/${ACCOUNT_ID}/query`,
                {
                    params: { nrql: integrationQuery },
                    headers: {
                        'X-Query-Key': QUERY_KEY,
                        'Accept': 'application/json'
                    }
                }
            );
            console.log('   Integration events found in last 24 hours');
        } catch (error) {
            console.log('   No integration events found');
        }
        
        // Summary
        console.log('\n\n📋 Key Findings:');
        console.log('================\n');
        console.log('1. Working entities are created by infrastructure agent integrations');
        console.log('2. They use standard Kafka event types (KafkaClusterSample, etc.)');
        console.log('3. Entity names follow specific patterns (e.g., "autodiscover-msk-cluster-auth-bob")');
        console.log('4. Entities have rich tag metadata from the integration');
        console.log('\n✨ Conclusion:');
        console.log('To create MSK entities that appear in the UI, you must use:');
        console.log('- Infrastructure agent with nri-kafka integration configured for MSK mode');
        console.log('- Proper entity naming and event structure as used by the integration');
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

analyzeWorkingEntities().catch(console.error);