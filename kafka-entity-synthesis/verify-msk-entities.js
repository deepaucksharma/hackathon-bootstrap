#!/usr/bin/env node

/**
 * MSK Entity Verification Script
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

async function verifyMSKEntities(clusterName) {
    loadEnv();
    
    const accountId = process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID;
    const queryKey = process.env.QKey || process.env.NEW_RELIC_QUERY_KEY;
    const userKey = process.env.UKEY || process.env.NEW_RELIC_USER_KEY;
    
    if (!accountId || !queryKey) {
        console.error('❌ Missing credentials in .env file');
        return;
    }
    
    console.log(`🔍 Verifying MSK Entities for: ${clusterName}\n`);
    
    // Check events
    console.log('📊 Checking Events:');
    const eventTypes = ['AwsMskClusterSample', 'AwsMskBrokerSample', 'AwsMskTopicSample'];
    let totalEvents = 0;
    
    for (const eventType of eventTypes) {
        try {
            const query = `FROM ${eventType} SELECT count(*) WHERE provider.clusterName = '${clusterName}' OR entityName LIKE '${clusterName}%' SINCE 10 minutes ago`;
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
            totalEvents += count;
            console.log(`   ${eventType}: ${count > 0 ? '✅' : '❌'} (${count} events)`);
        } catch (error) {
            console.log(`   ${eventType}: ❌ Error querying`);
        }
    }
    
    // Check entities
    console.log('\n🔮 Checking Entities:');
    if (userKey) {
        try {
            const entityQuery = `{
                actor {
                    entitySearch(query: "domain='INFRA' AND (type='AWSMSKCLUSTER' OR type='AWSMSKBROKER' OR type='AWSMSKTOPIC') AND name LIKE '${clusterName}%'") {
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
            
            const entities = response?.data?.data?.actor?.entitySearch?.results?.entities || [];
            const count = response?.data?.data?.actor?.entitySearch?.count || 0;
            
            if (count > 0) {
                console.log(`   ✅ Found ${count} entities:`);
                entities.forEach(entity => {
                    console.log(`      - ${entity.type}: ${entity.name} (${entity.reporting ? 'reporting' : 'not reporting'})`);
                });
            } else {
                console.log(`   ❌ No entities found`);
            }
        } catch (error) {
            console.log(`   ❌ Error checking entities (check UKEY in .env)`);
        }
    } else {
        console.log('   ⚠️  Skipping entity check (no UKEY in .env)');
    }
    
    // Summary
    console.log('\n📋 Summary:');
    if (totalEvents > 0) {
        console.log('   ✅ Events are being collected');
        console.log('   ℹ️  Entities may take up to 60 seconds to appear');
        console.log('\n🔗 Check your data:');
        console.log(`   NRQL Console: https://one.newrelic.com/data-exploration`);
        console.log(`   Query: FROM AwsMskClusterSample SELECT * WHERE provider.clusterName = '${clusterName}'`);
    } else {
        console.log('   ❌ No events found');
        console.log('   Make sure the entity creator is running');
    }
}

// Main
const clusterName = process.argv[2];
if (!clusterName) {
    console.log('Usage: node verify-msk-entities.js <cluster-name>');
    process.exit(1);
}

verifyMSKEntities(clusterName).catch(console.error);