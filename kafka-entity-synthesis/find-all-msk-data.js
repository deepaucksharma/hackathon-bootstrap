#!/usr/bin/env node

/**
 * Find ALL MSK data in the account
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

async function findAllMSKData() {
    loadEnv();
    
    const accountId = process.env.ACC;
    const queryKey = process.env.QKey;
    
    console.log('🔍 Finding ALL MSK Data\n');
    
    // 1. Check AwsMskClusterSample
    console.log('1️⃣ AwsMskClusterSample data:\n');
    
    const clusterQueries = [
        {
            name: 'Total count',
            query: 'FROM AwsMskClusterSample SELECT count(*) SINCE 1 week ago'
        },
        {
            name: 'Recent clusters',
            query: 'FROM AwsMskClusterSample SELECT entityName, entityGuid, provider.clusterName SINCE 1 day ago LIMIT 5'
        },
        {
            name: 'Unique clusters',
            query: 'FROM AwsMskClusterSample SELECT uniques(entityName), uniques(provider.clusterName) SINCE 1 week ago'
        }
    ];
    
    for (const q of clusterQueries) {
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
            
            console.log(`${q.name}:`);
            
            if (q.name === 'Total count') {
                const count = response?.data?.results?.[0]?.count || 0;
                console.log(`  ${count} events\n`);
            } else if (q.name === 'Recent clusters') {
                const events = response?.data?.results?.[0]?.events || [];
                if (events.length > 0) {
                    events.forEach(e => {
                        console.log(`  - entityName: ${e.entityName}`);
                        console.log(`    entityGuid: ${e.entityGuid}`);
                        console.log(`    clusterName: ${e['provider.clusterName']}\n`);
                    });
                } else {
                    console.log('  No recent events\n');
                }
            } else if (q.name === 'Unique clusters') {
                const result = response?.data?.results?.[0] || {};
                const entityNames = result['uniques.entityName'] || [];
                const clusterNames = result['uniques.provider.clusterName'] || [];
                console.log(`  Entity names: ${entityNames.length}`);
                if (entityNames.length > 0) {
                    entityNames.slice(0, 3).forEach(name => console.log(`    - ${name}`));
                }
                console.log(`  Cluster names: ${clusterNames.length}`);
                if (clusterNames.length > 0) {
                    clusterNames.slice(0, 3).forEach(name => console.log(`    - ${name}`));
                }
                console.log();
            }
            
        } catch (error) {
            console.log(`  Error: ${error.message}\n`);
        }
    }
    
    // 2. Check other MSK event types
    console.log('2️⃣ Other MSK event types:\n');
    
    const otherQueries = [
        'FROM AwsMskBrokerSample SELECT count(*) SINCE 1 week ago',
        'FROM AwsMskTopicSample SELECT count(*) SINCE 1 week ago',
        'FROM KafkaBrokerSample SELECT count(*) SINCE 1 week ago',
        'FROM KafkaTopicSample SELECT count(*) SINCE 1 week ago'
    ];
    
    for (const query of otherQueries) {
        try {
            const response = await axios.get(
                `https://insights-api.newrelic.com/v1/accounts/${accountId}/query`,
                {
                    params: { nrql: query },
                    headers: {
                        'X-Query-Key': queryKey,
                        'Accept': 'application/json'
                    }
                }
            );
            
            const count = response?.data?.results?.[0]?.count || 0;
            const eventType = query.match(/FROM (\w+)/)[1];
            console.log(`${eventType}: ${count} events`);
            
        } catch (error) {
            console.log(`${query}: Error`);
        }
    }
    
    // 3. Search for any events with kafka in the name
    console.log('\n3️⃣ Events with "kafka" in entityName:\n');
    
    const kafkaSearchQuery = `FROM Transaction, SystemSample, ProcessSample, NetworkSample, StorageSample 
        SELECT count(*) 
        WHERE entityName LIKE '%kafka%' 
        SINCE 1 day ago 
        FACET eventType 
        LIMIT 20`;
    
    try {
        const response = await axios.get(
            `https://insights-api.newrelic.com/v1/accounts/${accountId}/query`,
            {
                params: { nrql: kafkaSearchQuery },
                headers: {
                    'X-Query-Key': queryKey,
                    'Accept': 'application/json'
                }
            }
        );
        
        const results = response?.data?.results || [];
        if (results.length > 0) {
            results.forEach(r => {
                const eventType = r.facet[0];
                console.log(`  ${eventType}: ${r.count} events`);
            });
        } else {
            console.log('  No kafka-related events found');
        }
    } catch (error) {
        console.log(`  Error: ${error.message}`);
    }
}

findAllMSKData().catch(console.error);