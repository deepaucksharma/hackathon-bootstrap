#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '../.env' });

// Configuration
const ACCOUNT_ID = process.env.ACC;
const API_KEY = process.env.QKey;
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

async function checkMessageQueueSamples() {
    console.log(`${colors.cyan}${colors.bright}=== MessageQueueSample Visibility Check ===${colors.reset}\n`);

    const results = {
        messageQueueSamples: {},
        relatedEvents: {},
        uiFields: {},
        workingKafkaEntities: {},
        analysis: {}
    };

    try {
        // 1. Query MessageQueueSample to see all fields and values
        console.log(`${colors.blue}1. Checking MessageQueueSample events...${colors.reset}`);
        const mqQuery = `
            SELECT *
            FROM MessageQueueSample
            WHERE vendor = 'kafka'
            LIMIT 5
            SINCE 30 minutes ago
        `;
        
        const mqResult = await runQuery(mqQuery);
        results.messageQueueSamples.raw = mqResult;
        
        if (mqResult.results && mqResult.results.length > 0 && mqResult.results[0].events && mqResult.results[0].events.length > 0) {
            console.log(`${colors.green}✓ Found ${mqResult.results[0].events.length} MessageQueueSample events${colors.reset}`);
            
            // Analyze fields
            const sampleEvent = mqResult.results[0].events[0];
            const fields = Object.keys(sampleEvent).sort();
            results.messageQueueSamples.fields = fields;
            results.messageQueueSamples.sampleEvent = sampleEvent;
            
            console.log(`\nSample event fields (${fields.length}):`);
            fields.forEach(field => {
                const value = sampleEvent[field];
                console.log(`  ${colors.cyan}${field}${colors.reset}: ${JSON.stringify(value)}`);
            });
        } else {
            console.log(`${colors.red}✗ No MessageQueueSample events found${colors.reset}`);
        }

        // 2. Check if these entities appear in other event types
        console.log(`\n${colors.blue}2. Checking for related events...${colors.reset}`);
        
        // Check Entity table
        const entityQuery = `
            SELECT *
            FROM Entity
            WHERE type IN ('KAFKA_BROKER', 'KAFKA_CLUSTER', 'KAFKA_TOPIC', 'MESSAGE_QUEUE_BROKER', 'MESSAGE_QUEUE_CLUSTER')
            LIMIT 10
            SINCE 30 minutes ago
        `;
        
        const entityResult = await runQuery(entityQuery);
        results.relatedEvents.entities = entityResult;
        
        if (entityResult.results && entityResult.results[0].events && entityResult.results[0].events.length > 0) {
            console.log(`${colors.green}✓ Found ${entityResult.results[0].events.length} Entity events${colors.reset}`);
            entityResult.results[0].events.forEach((event, idx) => {
                console.log(`  Entity ${idx + 1}: type=${event.type}, name=${event.name}, guid=${event.guid}`);
            });
        } else {
            console.log(`${colors.yellow}⚠ No Entity events found${colors.reset}`);
        }

        // Check Relationship table
        const relationshipQuery = `
            SELECT *
            FROM Relationship
            WHERE sourceEntityType IN ('KAFKA_BROKER', 'KAFKA_CLUSTER', 'KAFKA_TOPIC', 'MESSAGE_QUEUE_BROKER', 'MESSAGE_QUEUE_CLUSTER')
               OR targetEntityType IN ('KAFKA_BROKER', 'KAFKA_CLUSTER', 'KAFKA_TOPIC', 'MESSAGE_QUEUE_BROKER', 'MESSAGE_QUEUE_CLUSTER')
            LIMIT 10
            SINCE 30 minutes ago
        `;
        
        const relationshipResult = await runQuery(relationshipQuery);
        results.relatedEvents.relationships = relationshipResult;
        
        if (relationshipResult.results && relationshipResult.results[0].events && relationshipResult.results[0].events.length > 0) {
            console.log(`${colors.green}✓ Found ${relationshipResult.results[0].events.length} Relationship events${colors.reset}`);
        } else {
            console.log(`${colors.yellow}⚠ No Relationship events found${colors.reset}`);
        }

        // 3. Query for UI-specific fields that might be missing
        console.log(`\n${colors.blue}3. Checking UI-specific fields...${colors.reset}`);
        
        const uiFieldsToCheck = [
            'entity.guid',
            'entity.name',
            'entity.type',
            'entityName',
            'entityType',
            'entityGuid',
            'nr.entityType',
            'displayName',
            'tags',
            'provider',
            'providerAccountId',
            'providerAccountName',
            'vendor',
            'instrumentationName',
            'instrumentationVersion'
        ];
        
        console.log('Checking for presence of UI-critical fields:');
        for (const field of uiFieldsToCheck) {
            const fieldQuery = `
                SELECT count(*)
                FROM MessageQueueSample
                WHERE vendor = 'kafka' AND ${field} IS NOT NULL
                SINCE 30 minutes ago
            `;
            
            try {
                const fieldResult = await runQuery(fieldQuery);
                const count = fieldResult.results[0].events[0]['count'];
                results.uiFields[field] = count;
                
                if (count > 0) {
                    console.log(`  ${colors.green}✓ ${field}: ${count} events${colors.reset}`);
                } else {
                    console.log(`  ${colors.red}✗ ${field}: NOT FOUND${colors.reset}`);
                }
            } catch (e) {
                console.log(`  ${colors.yellow}⚠ ${field}: Error checking${colors.reset}`);
            }
        }

        // 4. Compare with working Kafka entities
        console.log(`\n${colors.blue}4. Checking for working Kafka entities...${colors.reset}`);
        
        // Check standard Kafka events
        const kafkaEventTypes = ['KafkaBrokerSample', 'KafkaTopicSample', 'KafkaOffsetSample'];
        
        for (const eventType of kafkaEventTypes) {
            const kafkaQuery = `
                SELECT count(*), uniques(entity.guid), uniques(entity.type)
                FROM ${eventType}
                SINCE 30 minutes ago
            `;
            
            try {
                const kafkaResult = await runQuery(kafkaQuery);
                if (kafkaResult.results && kafkaResult.results[0].events && kafkaResult.results[0].events.length > 0) {
                    const event = kafkaResult.results[0].events[0];
                    const count = event['count'];
                    const guids = event['uniques.entity.guid'] || [];
                    const types = event['uniques.entity.type'] || [];
                    
                    results.workingKafkaEntities[eventType] = {
                        count,
                        guids: guids.length,
                        types
                    };
                    
                    if (count > 0) {
                        console.log(`${colors.green}✓ ${eventType}: ${count} events, ${guids.length} unique entities${colors.reset}`);
                        
                        // Get a sample for field comparison
                        const sampleQuery = `SELECT * FROM ${eventType} LIMIT 1 SINCE 30 minutes ago`;
                        const sampleResult = await runQuery(sampleQuery);
                        if (sampleResult.results && sampleResult.results[0].events && sampleResult.results[0].events.length > 0) {
                            results.workingKafkaEntities[eventType].sampleFields = Object.keys(sampleResult.results[0].events[0]);
                        }
                    } else {
                        console.log(`${colors.yellow}⚠ ${eventType}: No events found${colors.reset}`);
                    }
                }
            } catch (e) {
                console.log(`${colors.yellow}⚠ ${eventType}: Error checking${colors.reset}`);
            }
        }

        // Check MSK events
        const mskEventTypes = ['AwsMskBrokerSample', 'AwsMskClusterSample', 'AwsMskTopicSample'];
        
        for (const eventType of mskEventTypes) {
            const mskQuery = `
                SELECT count(*), uniques(entity.guid), uniques(entity.type)
                FROM ${eventType}
                SINCE 30 minutes ago
            `;
            
            try {
                const mskResult = await runQuery(mskQuery);
                if (mskResult.results && mskResult.results[0].events && mskResult.results[0].events.length > 0) {
                    const event = mskResult.results[0].events[0];
                    const count = event['count'];
                    const guids = event['uniques.entity.guid'] || [];
                    const types = event['uniques.entity.type'] || [];
                    
                    results.workingKafkaEntities[eventType] = {
                        count,
                        guids: guids.length,
                        types
                    };
                    
                    if (count > 0) {
                        console.log(`${colors.green}✓ ${eventType}: ${count} events, ${guids.length} unique entities${colors.reset}`);
                    } else {
                        console.log(`${colors.yellow}⚠ ${eventType}: No events found${colors.reset}`);
                    }
                }
            } catch (e) {
                console.log(`${colors.yellow}⚠ ${eventType}: Error checking${colors.reset}`);
            }
        }

        // Analysis
        console.log(`\n${colors.cyan}${colors.bright}=== Analysis ===${colors.reset}`);
        
        // Check for critical missing fields
        const criticalFields = ['entity.guid', 'entity.name', 'entity.type'];
        const missingCriticalFields = criticalFields.filter(field => !results.uiFields[field] || results.uiFields[field] === 0);
        
        if (missingCriticalFields.length > 0) {
            console.log(`\n${colors.red}Critical Issue: Missing UI-required fields:${colors.reset}`);
            missingCriticalFields.forEach(field => {
                console.log(`  - ${field}`);
            });
            console.log(`\n${colors.yellow}Recommendation: MessageQueueSample events need proper entity fields for UI visibility${colors.reset}`);
        }

        // Compare with working entities
        const workingEventTypes = Object.entries(results.workingKafkaEntities)
            .filter(([_, data]) => data.count > 0);
        
        if (workingEventTypes.length > 0) {
            console.log(`\n${colors.green}Found working Kafka entities in:${colors.reset}`);
            workingEventTypes.forEach(([eventType, data]) => {
                console.log(`  - ${eventType}: ${data.count} events`);
                if (data.sampleFields) {
                    const mqFields = results.messageQueueSamples.fields || [];
                    const workingFields = data.sampleFields;
                    const missingInMQ = workingFields.filter(f => !mqFields.includes(f) && f.startsWith('entity.'));
                    
                    if (missingInMQ.length > 0) {
                        console.log(`    Missing in MessageQueueSample: ${missingInMQ.join(', ')}`);
                    }
                }
            });
        }

        // Check entity type mapping
        console.log(`\n${colors.blue}Entity Type Analysis:${colors.reset}`);
        if (results.messageQueueSamples.sampleEvent) {
            const sample = results.messageQueueSamples.sampleEvent;
            console.log(`  Current entity.type: ${sample['entity.type'] || 'NOT SET'}`);
            console.log(`  Current vendor: ${sample.vendor}`);
            console.log(`  Current entity.name: ${sample['entity.name'] || 'NOT SET'}`);
            
            if (!sample['entity.type'] || !sample['entity.name']) {
                console.log(`\n${colors.red}Issue: MessageQueueSample events lack proper entity identification${colors.reset}`);
                console.log(`${colors.yellow}Solution: Events need entity.type, entity.name, and entity.guid for UI visibility${colors.reset}`);
            }
        }

        // Save results
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const resultsFile = path.join(__dirname, `messagequeue-visibility-${timestamp}.json`);
        fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
        console.log(`\n${colors.green}Full results saved to: ${resultsFile}${colors.reset}`);

        // Final recommendations
        console.log(`\n${colors.cyan}${colors.bright}=== Recommendations ===${colors.reset}`);
        console.log(`
1. MessageQueueSample events need proper entity fields:
   - entity.guid (unique identifier)
   - entity.name (display name)
   - entity.type (e.g., 'KAFKA_BROKER', 'KAFKA_TOPIC')

2. Events should include relationship data:
   - For brokers: cluster relationship
   - For topics: broker and cluster relationships

3. Consider using event types that New Relic UI recognizes:
   - KafkaBrokerSample, KafkaTopicSample for standard Kafka
   - AwsMskBrokerSample, AwsMskTopicSample for MSK compatibility

4. Ensure proper instrumentation metadata:
   - instrumentationName
   - instrumentationVersion
   - provider information
`);

    } catch (error) {
        console.error(`${colors.red}Error during analysis: ${error.message}${colors.reset}`);
        console.error(error.stack);
    }
}

// Run the check
checkMessageQueueSamples().catch(console.error);