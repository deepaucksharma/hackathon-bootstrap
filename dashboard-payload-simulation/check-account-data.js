#!/usr/bin/env node

const https = require('https');
require('dotenv').config({ path: '../.env' });

// Configuration
const ACCOUNT_ID = process.env.ACC;
const API_KEY = process.env.QKey || process.env.UKEY;
const NRDB_ENDPOINT = `https://insights-api.newrelic.com/v1/accounts/${ACCOUNT_ID}/query`;

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

async function runQuery(nrql) {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-Query-Key': API_KEY
            }
        };

        const url = `${NRDB_ENDPOINT}?nrql=${encodeURIComponent(nrql)}`;
        
        console.log(`${colors.blue}Running query: ${nrql}${colors.reset}`);
        
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.error) {
                        reject(new Error(result.error));
                    } else {
                        resolve(result);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function checkAccountData() {
    console.log(`${colors.cyan}${colors.bright}=== New Relic Account Data Check ===${colors.reset}`);
    console.log(`Account ID: ${ACCOUNT_ID}\n`);

    try {
        // 1. Check what event types exist
        console.log(`${colors.cyan}1. All event types in the account:${colors.reset}`);
        const eventTypesQuery = `SHOW EVENT TYPES SINCE 7 days ago`;
        
        const eventTypesResult = await runQuery(eventTypesQuery);
        if (eventTypesResult.results && eventTypesResult.results.length > 0) {
            console.log(`Raw result:`, JSON.stringify(eventTypesResult.results[0], null, 2));
            
            // Handle different response formats
            let eventTypes = [];
            if (eventTypesResult.results[0].eventTypes) {
                eventTypes = eventTypesResult.results[0].eventTypes;
            } else if (eventTypesResult.results[0].events) {
                eventTypes = eventTypesResult.results[0].events;
            } else {
                eventTypes = eventTypesResult.results;
            }
            
            console.log(`Found ${eventTypes.length} event types`);
            
            // Filter for relevant ones
            const relevantTypes = eventTypes.filter(type => {
                const typeName = type.eventType || type;
                if (typeof typeName !== 'string') return false;
                
                return typeName.toLowerCase().includes('kafka') ||
                       typeName.toLowerCase().includes('msk') ||
                       typeName.toLowerCase().includes('message') ||
                       typeName.toLowerCase().includes('queue') ||
                       typeName === 'InfrastructureEvent' ||
                       typeName === 'SystemSample';
            });
            
            console.log(`\n${colors.green}Relevant event types:${colors.reset}`);
            relevantTypes.forEach(type => {
                const typeName = type.eventType || type;
                console.log(`  - ${typeName}`);
            });
            
            // Check each relevant type for recent data
            console.log(`\n${colors.cyan}2. Checking recent data for each relevant type:${colors.reset}`);
            
            for (const type of relevantTypes) {
                const typeName = type.eventType || type;
                const countQuery = `SELECT count(*) FROM ${typeName} SINCE 1 hour ago`;
                try {
                    const countResult = await runQuery(countQuery);
                    if (countResult.results && countResult.results[0].events && countResult.results[0].events.length > 0) {
                        const count = countResult.results[0].events[0]['count'];
                        if (count > 0) {
                            console.log(`  ${colors.green}✓ ${typeName}: ${count} events in last hour${colors.reset}`);
                            
                            // Get a sample
                            const sampleQuery = `SELECT * FROM ${typeName} LIMIT 1 SINCE 1 hour ago`;
                            const sampleResult = await runQuery(sampleQuery);
                            if (sampleResult.results && sampleResult.results[0].events && sampleResult.results[0].events.length > 0) {
                                const sample = sampleResult.results[0].events[0];
                                console.log(`    Sample fields: ${Object.keys(sample).slice(0, 10).join(', ')}...`);
                            }
                        } else {
                            console.log(`  ${colors.yellow}○ ${typeName}: No recent events${colors.reset}`);
                        }
                    }
                } catch (e) {
                    console.log(`  ${colors.red}✗ ${typeName}: Error - ${e.message}${colors.reset}`);
                }
            }
        }

        // 3. Check Entity table
        console.log(`\n${colors.cyan}3. Checking Entity table:${colors.reset}`);
        const entityQuery = `SELECT count(*), uniques(type) FROM Entity SINCE 1 hour ago`;
        
        const entityResult = await runQuery(entityQuery);
        if (entityResult.results && entityResult.results[0].events && entityResult.results[0].events.length > 0) {
            const event = entityResult.results[0].events[0];
            const count = event['count'];
            const types = event['uniques.type'] || [];
            
            console.log(`Total entities: ${count}`);
            console.log(`Entity types: ${types.join(', ')}`);
            
            // Check for Kafka entities specifically
            const kafkaEntityQuery = `
                SELECT count(*), uniques(name)
                FROM Entity
                WHERE type IN ('KAFKA_BROKER', 'KAFKA_CLUSTER', 'KAFKA_TOPIC', 
                              'AWS_MSK_BROKER', 'AWS_MSK_CLUSTER', 'AWS_MSK_TOPIC',
                              'MESSAGE_QUEUE_BROKER', 'MESSAGE_QUEUE_CLUSTER', 'MESSAGE_QUEUE_TOPIC')
                SINCE 1 hour ago
            `;
            
            const kafkaEntityResult = await runQuery(kafkaEntityQuery);
            if (kafkaEntityResult.results && kafkaEntityResult.results[0].events && kafkaEntityResult.results[0].events.length > 0) {
                const kafkaCount = kafkaEntityResult.results[0].events[0]['count'];
                if (kafkaCount > 0) {
                    console.log(`${colors.green}Found ${kafkaCount} Kafka-related entities!${colors.reset}`);
                }
            }
        }

        // 4. Check for any infrastructure integrations
        console.log(`\n${colors.cyan}4. Checking for infrastructure integrations:${colors.reset}`);
        const infraQuery = `
            SELECT count(*), uniques(integrationName), uniques(integrationVersion)
            FROM SystemSample
            WHERE integrationName IS NOT NULL
            SINCE 1 hour ago
        `;
        
        const infraResult = await runQuery(infraQuery);
        if (infraResult.results && infraResult.results[0].events && infraResult.results[0].events.length > 0) {
            const event = infraResult.results[0].events[0];
            const integrations = event['uniques.integrationName'] || [];
            
            console.log(`Active integrations: ${integrations.join(', ') || 'none'}`);
        }

    } catch (error) {
        console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
        console.error(error.stack);
    }
}

// Run the check
checkAccountData().catch(console.error);