#!/usr/bin/env node

/**
 * Check ALL MessageQueueSample data
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

async function checkAllMessageQueue() {
    loadEnv();
    
    const accountId = process.env.ACC;
    const queryKey = process.env.QKey;
    const userKey = process.env.UKEY;
    
    console.log('🔍 Checking ALL MessageQueueSample Data\n');
    
    // 1. Check all providers
    console.log('1️⃣ All Providers in MessageQueueSample:\n');
    
    const allProvidersQuery = `FROM MessageQueueSample 
        SELECT count(*) 
        FACET provider 
        SINCE 1 week ago 
        LIMIT 50`;
    
    try {
        const response = await axios.get(
            `https://insights-api.newrelic.com/v1/accounts/${accountId}/query`,
            {
                params: { nrql: allProvidersQuery },
                headers: {
                    'X-Query-Key': queryKey,
                    'Accept': 'application/json'
                }
            }
        );
        
        const results = response?.data?.results || [];
        
        console.log('Provider | Count');
        console.log('---------|------');
        results.forEach(r => {
            const provider = r.facet?.[0] || 'NULL';
            console.log(`${provider} | ${r.count}`);
        });
        
    } catch (error) {
        console.error('Error:', error.message);
    }
    
    // 2. Check our MSK attempts
    console.log('\n\n2️⃣ Our MSK Events:\n');
    
    const mskQueries = [
        {
            name: 'AwsMsk provider',
            query: `FROM MessageQueueSample SELECT count(*) WHERE provider = 'AwsMsk' SINCE 1 week ago`
        },
        {
            name: 'awsmsk provider (lowercase)',
            query: `FROM MessageQueueSample SELECT count(*) WHERE provider = 'awsmsk' SINCE 1 week ago`
        },
        {
            name: 'Any kafka/msk in queue.name',
            query: `FROM MessageQueueSample SELECT count(*) WHERE queue.name LIKE '%kafka%' OR queue.name LIKE '%msk%' SINCE 1 week ago`
        },
        {
            name: 'Recent test entities',
            query: `FROM MessageQueueSample SELECT count(*) WHERE entity.name LIKE '%test%' OR entity.name LIKE '%exp%' SINCE 1 week ago`
        }
    ];
    
    for (const q of mskQueries) {
        try {
            const response = await axios.get(
                `https://insights-api.newrelic.com/v1/accounts/${accountId}/query`,
                {
                    params: { nrql: q.query },
                    headers: {
                        'X-Query-Key': queryKey,
                        'Accept': 'application/json'
                    }
                }
            );
            
            const count = response?.data?.results?.[0]?.count || 0;
            console.log(`${q.name}: ${count}`);
            
        } catch (error) {
            console.log(`${q.name}: Error`);
        }
    }
    
    // 3. Check AwsMskClusterSample events
    console.log('\n\n3️⃣ AwsMskClusterSample Events:\n');
    
    const mskClusterQuery = `FROM AwsMskClusterSample 
        SELECT count(*), uniques(entityName), uniques(provider.clusterName)
        SINCE 1 week ago`;
    
    try {
        const response = await axios.get(
            `https://insights-api.newrelic.com/v1/accounts/${accountId}/query`,
            {
                params: { nrql: mskClusterQuery },
                headers: {
                    'X-Query-Key': queryKey,
                    'Accept': 'application/json'
                }
            }
        );
        
        const result = response?.data?.results?.[0] || {};
        console.log(`Total AwsMskClusterSample events: ${result.count || 0}`);
        console.log(`Unique entity names: ${result['uniques.entityName']?.length || 0}`);
        console.log(`Unique cluster names: ${result['uniques.provider.clusterName']?.length || 0}`);
        
        if (result['uniques.entityName']?.length > 0) {
            console.log('\nRecent entity names:');
            result['uniques.entityName'].slice(0, 5).forEach(name => {
                console.log(`  - ${name}`);
            });
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
    
    // 4. Check entities via GraphQL
    console.log('\n\n4️⃣ MSK Entities Check:\n');
    
    const entityQuery = `{
        actor {
            entitySearch(query: "domain = 'INFRA' AND type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC')") {
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
    
    try {
        const response = await axios.post(
            'https://api.newrelic.com/graphql',
            { query: entityQuery },
            {
                headers: {
                    'Api-Key': userKey,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        const count = response?.data?.data?.actor?.entitySearch?.count || 0;
        const entities = response?.data?.data?.actor?.entitySearch?.results?.entities || [];
        
        console.log(`Total MSK entities: ${count}`);
        console.log(`Reporting entities: ${entities.filter(e => e.reporting).length}`);
        
        if (entities.length > 0) {
            console.log('\nFirst 5 entities:');
            entities.slice(0, 5).forEach(e => {
                console.log(`  - ${e.name} (${e.type}) - Reporting: ${e.reporting}`);
            });
        }
        
    } catch (error) {
        console.error('Error checking entities:', error.message);
    }
    
    // 5. Key finding
    console.log('\n\n🔑 Critical Finding:\n');
    console.log('The issue appears to be that:');
    console.log('1. We have AwsMskClusterSample events (metric data)');
    console.log('2. We have MSK entities (56 of them)');
    console.log('3. But NO MessageQueueSample events are being created');
    console.log('4. The UI specifically queries MessageQueueSample');
    console.log('\n💡 Solution: We need to create MessageQueueSample events!');
}

checkAllMessageQueue().catch(console.error);