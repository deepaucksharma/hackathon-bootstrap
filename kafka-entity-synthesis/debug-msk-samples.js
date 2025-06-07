#!/usr/bin/env node

/**
 * Debug MSK Sample Events
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

async function debugMSKSamples() {
    loadEnv();
    
    const accountId = process.env.ACC;
    const queryKey = process.env.QKey;
    
    console.log('🔍 Debugging MSK Sample Events\n');
    
    // Check all event types
    const queries = [
        {
            name: 'AwsMskClusterSample',
            query: 'FROM AwsMskClusterSample SELECT count(*) SINCE 1 week ago'
        },
        {
            name: 'AwsMskBrokerSample',
            query: 'FROM AwsMskBrokerSample SELECT count(*) SINCE 1 week ago'
        },
        {
            name: 'AwsMskTopicSample',
            query: 'FROM AwsMskTopicSample SELECT count(*) SINCE 1 week ago'
        },
        {
            name: 'Sample AwsMskClusterSample event',
            query: 'FROM AwsMskClusterSample SELECT * SINCE 1 week ago LIMIT 1'
        }
    ];
    
    for (const q of queries) {
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
            
            if (q.name.includes('Sample')) {
                const events = response?.data?.results?.[0]?.events || [];
                if (events.length > 0) {
                    console.log(`\n${q.name}:`);
                    const event = events[0];
                    Object.keys(event).sort().forEach(key => {
                        console.log(`  ${key}: ${JSON.stringify(event[key])}`);
                    });
                }
            } else {
                const count = response?.data?.results?.[0]?.count || 0;
                console.log(`${q.name}: ${count} events`);
            }
            
        } catch (error) {
            console.log(`${q.name}: Error - ${error.message}`);
        }
    }
    
    // Check for any kafka-related events
    console.log('\n📦 Checking for any Kafka-related events:\n');
    
    const kafkaQuery = `FROM Transaction, SystemSample, ProcessSample, NetworkSample, StorageSample, ContainerSample 
        SELECT count(*) 
        WHERE appName LIKE '%kafka%' OR entityName LIKE '%kafka%' OR provider.clusterName LIKE '%kafka%'
        SINCE 1 week ago 
        FACET eventType`;
    
    try {
        const response = await axios.get(
            `https://insights-api.newrelic.com/v1/accounts/${accountId}/query`,
            {
                params: { nrql: kafkaQuery },
                headers: {
                    'X-Query-Key': queryKey,
                    'Accept': 'application/json'
                }
            }
        );
        
        const results = response?.data?.results || [];
        if (results.length > 0) {
            console.log('Kafka-related events by type:');
            results.forEach(r => {
                const eventType = r.facet[0];
                console.log(`  ${eventType}: ${r.count}`);
            });
        }
    } catch (error) {
        console.error('Error checking kafka events:', error.message);
    }
}

debugMSKSamples().catch(console.error);