#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '../.env' });

// Configuration
const ACCOUNT_ID = process.env.ACC || '3630072';
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
    magenta: '\x1b[35m',
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

async function checkKafkaEntityVisibility() {
    console.log(`${colors.cyan}${colors.bright}=== Kafka Entity Visibility Check ===${colors.reset}\n`);

    const results = {
        allKafkaEvents: {},
        entityEvents: {},
        infrastructureEvents: {},
        customEvents: {},
        analysis: {}
    };

    try {
        // 1. Check ALL event types that might contain Kafka data
        console.log(`${colors.blue}1. Searching for ALL Kafka-related events (last 24 hours)...${colors.reset}`);
        
        const eventTypesQuery = `
            SELECT uniques(eventType)
            FROM Log, Metric, Event, InfrastructureEvent
            WHERE eventType LIKE '%kafka%' 
               OR eventType LIKE '%Kafka%' 
               OR eventType LIKE '%msk%' 
               OR eventType LIKE '%Msk%'
               OR eventType LIKE '%message%'
               OR eventType LIKE '%Message%'
               OR eventType LIKE '%queue%'
               OR eventType LIKE '%Queue%'
            SINCE 24 hours ago
        `;
        
        const eventTypesResult = await runQuery(eventTypesQuery);
        
        if (eventTypesResult.results && eventTypesResult.results[0].events && eventTypesResult.results[0].events.length > 0) {
            const eventTypes = eventTypesResult.results[0].events[0]['uniques.eventType'] || [];
            console.log(`${colors.green}Found ${eventTypes.length} Kafka-related event types:${colors.reset}`);
            eventTypes.forEach(type => console.log(`  - ${type}`));
            results.allKafkaEvents.eventTypes = eventTypes;
            
            // Check each event type for data
            for (const eventType of eventTypes) {
                console.log(`\n${colors.blue}Checking ${eventType}...${colors.reset}`);
                const countQuery = `
                    SELECT count(*), latest(timestamp), earliest(timestamp)
                    FROM ${eventType}
                    SINCE 24 hours ago
                `;
                
                try {
                    const countResult = await runQuery(countQuery);
                    if (countResult.results && countResult.results[0].events && countResult.results[0].events.length > 0) {
                        const event = countResult.results[0].events[0];
                        const count = event['count'];
                        const latest = new Date(event['latest.timestamp']).toISOString();
                        const earliest = new Date(event['earliest.timestamp']).toISOString();
                        
                        console.log(`  Count: ${count}`);
                        console.log(`  Time range: ${earliest} to ${latest}`);
                        
                        results.allKafkaEvents[eventType] = {
                            count,
                            latest,
                            earliest
                        };
                        
                        // Get sample event
                        const sampleQuery = `SELECT * FROM ${eventType} LIMIT 1 SINCE 24 hours ago`;
                        const sampleResult = await runQuery(sampleQuery);
                        if (sampleResult.results && sampleResult.results[0].events && sampleResult.results[0].events.length > 0) {
                            const sampleEvent = sampleResult.results[0].events[0];
                            results.allKafkaEvents[eventType].sampleEvent = sampleEvent;
                            
                            // Check for entity fields
                            const entityFields = ['entity.guid', 'entity.name', 'entity.type', 'entityGuid', 'entityName', 'entityType'];
                            const foundEntityFields = entityFields.filter(field => sampleEvent[field]);
                            
                            if (foundEntityFields.length > 0) {
                                console.log(`  ${colors.green}Has entity fields: ${foundEntityFields.join(', ')}${colors.reset}`);
                            } else {
                                console.log(`  ${colors.yellow}No entity fields found${colors.reset}`);
                            }
                        }
                    }
                } catch (e) {
                    console.log(`  ${colors.red}Error querying ${eventType}: ${e.message}${colors.reset}`);
                }
            }
        } else {
            console.log(`${colors.red}No Kafka-related event types found${colors.reset}`);
        }

        // 2. Check Entity table specifically
        console.log(`\n${colors.blue}2. Checking Entity table for Kafka entities...${colors.reset}`);
        
        const entityQuery = `
            SELECT count(*), uniques(type), uniques(domain), uniques(entityType)
            FROM Entity
            WHERE type LIKE '%KAFKA%' 
               OR type LIKE '%MESSAGE%'
               OR domain = 'INFRA'
               OR tags.vendor = 'kafka'
            SINCE 24 hours ago
        `;
        
        const entityResult = await runQuery(entityQuery);
        if (entityResult.results && entityResult.results[0].events && entityResult.results[0].events.length > 0) {
            const event = entityResult.results[0].events[0];
            const count = event['count'];
            const types = event['uniques.type'] || [];
            const domains = event['uniques.domain'] || [];
            const entityTypes = event['uniques.entityType'] || [];
            
            console.log(`${colors.green}Found ${count} entities${colors.reset}`);
            console.log(`  Types: ${types.join(', ') || 'none'}`);
            console.log(`  Domains: ${domains.join(', ') || 'none'}`);
            console.log(`  Entity Types: ${entityTypes.join(', ') || 'none'}`);
            
            results.entityEvents = {
                count,
                types,
                domains,
                entityTypes
            };
        }

        // 3. Check InfrastructureEvent
        console.log(`\n${colors.blue}3. Checking InfrastructureEvent for Kafka data...${colors.reset}`);
        
        const infraQuery = `
            SELECT count(*), uniques(category), uniques(summary)
            FROM InfrastructureEvent
            WHERE category LIKE '%kafka%' 
               OR summary LIKE '%kafka%'
               OR provider.vendor = 'kafka'
            SINCE 24 hours ago
        `;
        
        const infraResult = await runQuery(infraQuery);
        if (infraResult.results && infraResult.results[0].events && infraResult.results[0].events.length > 0) {
            const event = infraResult.results[0].events[0];
            const count = event['count'];
            const categories = event['uniques.category'] || [];
            const summaries = event['uniques.summary'] || [];
            
            console.log(`${colors.green}Found ${count} InfrastructureEvents${colors.reset}`);
            console.log(`  Categories: ${categories.join(', ') || 'none'}`);
            
            results.infrastructureEvents = {
                count,
                categories,
                summaries
            };
        }

        // 4. Check SystemSample and other infrastructure samples
        console.log(`\n${colors.blue}4. Checking infrastructure samples for Kafka processes...${colors.reset}`);
        
        const systemQuery = `
            SELECT count(*), uniques(fullHostname), uniques(hostname)
            FROM SystemSample
            WHERE commandLine LIKE '%kafka%' 
               OR processDisplayName LIKE '%kafka%'
            SINCE 1 hour ago
        `;
        
        const systemResult = await runQuery(systemQuery);
        if (systemResult.results && systemResult.results[0].events && systemResult.results[0].events.length > 0) {
            const event = systemResult.results[0].events[0];
            const count = event['count'];
            const hosts = event['uniques.hostname'] || [];
            
            console.log(`${colors.green}Found ${count} SystemSample events with Kafka processes${colors.reset}`);
            console.log(`  Hosts: ${hosts.join(', ') || 'none'}`);
        }

        // 5. Direct check for specific event types
        console.log(`\n${colors.blue}5. Direct check for known Kafka event types...${colors.reset}`);
        
        const knownEventTypes = [
            'KafkaBrokerSample',
            'KafkaTopicSample',
            'KafkaOffsetSample',
            'KafkaProducerSample',
            'KafkaConsumerSample',
            'AwsMskBrokerSample',
            'AwsMskClusterSample',
            'AwsMskTopicSample',
            'MessageQueueSample',
            'MessageQueueBrokerSample',
            'MessageQueueTopicSample'
        ];
        
        for (const eventType of knownEventTypes) {
            const directQuery = `SELECT count(*) FROM ${eventType} SINCE 24 hours ago`;
            
            try {
                const directResult = await runQuery(directQuery);
                if (directResult.results && directResult.results[0].events && directResult.results[0].events.length > 0) {
                    const count = directResult.results[0].events[0]['count'];
                    if (count > 0) {
                        console.log(`  ${colors.green}✓ ${eventType}: ${count} events${colors.reset}`);
                        results.customEvents[eventType] = count;
                    } else {
                        console.log(`  ${colors.yellow}○ ${eventType}: 0 events${colors.reset}`);
                    }
                }
            } catch (e) {
                console.log(`  ${colors.red}✗ ${eventType}: Not found${colors.reset}`);
            }
        }

        // Analysis
        console.log(`\n${colors.cyan}${colors.bright}=== Analysis ===${colors.reset}`);
        
        const hasAnyKafkaData = Object.keys(results.allKafkaEvents).length > 1 || 
                               Object.keys(results.customEvents).length > 0 ||
                               results.entityEvents.count > 0;
        
        if (hasAnyKafkaData) {
            console.log(`\n${colors.green}Kafka data is being collected!${colors.reset}`);
            
            // Identify which event types have entity fields
            const eventsWithEntityFields = [];
            const eventsWithoutEntityFields = [];
            
            Object.entries(results.allKafkaEvents).forEach(([eventType, data]) => {
                if (data.sampleEvent) {
                    const hasEntityFields = ['entity.guid', 'entity.name', 'entity.type'].some(field => data.sampleEvent[field]);
                    if (hasEntityFields) {
                        eventsWithEntityFields.push(eventType);
                    } else {
                        eventsWithoutEntityFields.push(eventType);
                    }
                }
            });
            
            if (eventsWithEntityFields.length > 0) {
                console.log(`\n${colors.green}Events WITH entity fields (should be visible in UI):${colors.reset}`);
                eventsWithEntityFields.forEach(e => console.log(`  - ${e}`));
            }
            
            if (eventsWithoutEntityFields.length > 0) {
                console.log(`\n${colors.yellow}Events WITHOUT entity fields (won't be visible in UI):${colors.reset}`);
                eventsWithoutEntityFields.forEach(e => console.log(`  - ${e}`));
            }
        } else {
            console.log(`\n${colors.red}No Kafka data found in any event type${colors.reset}`);
        }

        // Save results
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const resultsFile = path.join(__dirname, `kafka-entity-visibility-${timestamp}.json`);
        fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
        console.log(`\n${colors.green}Full results saved to: ${resultsFile}${colors.reset}`);

        // Recommendations
        console.log(`\n${colors.cyan}${colors.bright}=== Recommendations ===${colors.reset}`);
        
        const eventsWithoutEntityFields = [];
        
        if (!hasAnyKafkaData) {
            console.log(`
${colors.yellow}To make events visible in the New Relic UI:${colors.reset}

1. Events must include entity fields:
   - entity.guid: Unique identifier for the entity
   - entity.name: Display name in the UI
   - entity.type: Type of entity (e.g., KAFKA_BROKER, KAFKA_TOPIC)

2. Use recognized event type names:
   - KafkaBrokerSample, KafkaTopicSample for standard Kafka
   - AwsMskBrokerSample, AwsMskTopicSample for MSK

3. Include proper instrumentation metadata:
   - instrumentationName: "nri-kafka"
   - instrumentationVersion: version string
   - provider: "kafka" or "awsMsk"

4. Consider entity synthesis:
   - New Relic may synthesize entities from certain event types
   - Check Entity Synthesis rules in your account
`);
        }

    } catch (error) {
        console.error(`${colors.red}Error during analysis: ${error.message}${colors.reset}`);
        console.error(error.stack);
    }
}

// Run the check
checkKafkaEntityVisibility().catch(console.error);