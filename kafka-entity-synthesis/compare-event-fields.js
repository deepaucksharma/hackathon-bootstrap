#!/usr/bin/env node

const https = require('https');
require('dotenv').config({ path: '../.env' });

// Configuration
const ACCOUNT_ID = process.env.ACC || '3630072';
const API_KEY = process.env.QKey || process.env.UKEY;

async function runQuery(nrql) {
    const url = `https://insights-api.newrelic.com/v1/accounts/${ACCOUNT_ID}/query?nrql=${encodeURIComponent(nrql)}`;
    
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'Accept': 'application/json',
                'X-Query-Key': API_KEY
            },
            timeout: 10000
        };
        
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function compareEvents() {
    console.log('=== Event Field Comparison ===\n');
    
    // 1. Get MessageQueueSample
    console.log('1. Fetching MessageQueueSample...');
    const mqQuery = 'SELECT * FROM MessageQueueSample LIMIT 1 SINCE 1 hour ago';
    const mqResult = await runQuery(mqQuery);
    
    let mqSample = null;
    if (mqResult.results && mqResult.results[0].events && mqResult.results[0].events.length > 0) {
        mqSample = mqResult.results[0].events[0];
        console.log('✓ Found MessageQueueSample event');
    } else {
        console.log('✗ No MessageQueueSample events found');
    }
    
    // 2. Get AwsMskBrokerSample (working entity)
    console.log('\n2. Fetching AwsMskBrokerSample (working)...');
    const mskQuery = 'SELECT * FROM AwsMskBrokerSample LIMIT 1 SINCE 24 hours ago';
    const mskResult = await runQuery(mskQuery);
    
    let mskSample = null;
    if (mskResult.results && mskResult.results[0].events && mskResult.results[0].events.length > 0) {
        mskSample = mskResult.results[0].events[0];
        console.log('✓ Found AwsMskBrokerSample event');
    } else {
        console.log('✗ No AwsMskBrokerSample events found');
    }
    
    // 3. Get KafkaBrokerSample (check if it creates entities)
    console.log('\n3. Fetching KafkaBrokerSample...');
    const kafkaQuery = 'SELECT * FROM KafkaBrokerSample LIMIT 1 SINCE 24 hours ago';
    const kafkaResult = await runQuery(kafkaQuery);
    
    let kafkaSample = null;
    if (kafkaResult.results && kafkaResult.results[0].events && kafkaResult.results[0].events.length > 0) {
        kafkaSample = kafkaResult.results[0].events[0];
        console.log('✓ Found KafkaBrokerSample event');
    } else {
        console.log('✗ No KafkaBrokerSample events found');
    }
    
    // 4. Compare fields
    console.log('\n=== Field Comparison ===\n');
    
    // Critical entity fields
    const criticalFields = [
        'entityGuid',
        'entityName',
        'entityType',
        'entity.guid',
        'entity.name',
        'entity.type',
        'nr.entityType',
        'instrumentation.name',
        'instrumentation.version',
        'instrumentationName',
        'instrumentationVersion',
        'collector.name',
        'provider',
        'provider.accountId',
        'providerAccountId',
        'vendor',
        'clusterName',
        'brokerId',
        'brokerDisplayName'
    ];
    
    console.log('Critical Entity Fields:');
    console.log('Field Name                    | MessageQueue | AwsMskBroker | KafkaBroker');
    console.log('----------------------------- | ------------ | ------------ | -----------');
    
    criticalFields.forEach(field => {
        const mqValue = mqSample ? (mqSample[field] !== undefined ? String(mqSample[field]).substring(0, 12) : '-') : '?';
        const mskValue = mskSample ? (mskSample[field] !== undefined ? String(mskSample[field]).substring(0, 12) : '-') : '?';
        const kafkaValue = kafkaSample ? (kafkaSample[field] !== undefined ? String(kafkaSample[field]).substring(0, 12) : '-') : '?';
        
        console.log(`${field.padEnd(29)} | ${mqValue.padEnd(12)} | ${mskValue.padEnd(12)} | ${kafkaValue}`);
    });
    
    // 5. Show all fields for MessageQueueSample
    if (mqSample) {
        console.log('\n=== All MessageQueueSample Fields ===');
        Object.entries(mqSample).sort().forEach(([key, value]) => {
            console.log(`${key}: ${JSON.stringify(value)}`);
        });
    }
    
    // 6. Show all fields for AwsMskBrokerSample (working)
    if (mskSample) {
        console.log('\n=== All AwsMskBrokerSample Fields (WORKING) ===');
        Object.entries(mskSample).sort().forEach(([key, value]) => {
            console.log(`${key}: ${JSON.stringify(value)}`);
        });
    }
    
    // 7. Check entity existence
    console.log('\n=== Entity Existence Check ===');
    
    if (mskSample && mskSample.entityGuid) {
        const entityQuery = `SELECT * FROM Entity WHERE guid = '${mskSample.entityGuid}' SINCE 1 day ago LIMIT 1`;
        const entityResult = await runQuery(entityQuery);
        if (entityResult.results && entityResult.results[0].events && entityResult.results[0].events.length > 0) {
            console.log('✓ AwsMskBroker entity exists in Entity table');
            console.log('  Entity details:', JSON.stringify(entityResult.results[0].events[0], null, 2));
        }
    }
    
    // 8. Analysis
    console.log('\n=== Analysis ===');
    
    const mqMissingFields = criticalFields.filter(field => !mqSample || mqSample[field] === undefined);
    const mskPresentFields = criticalFields.filter(field => mskSample && mskSample[field] !== undefined);
    
    console.log('\nFields present in AwsMskBrokerSample but missing in MessageQueueSample:');
    const missingInMQ = mskPresentFields.filter(field => mqMissingFields.includes(field));
    missingInMQ.forEach(field => {
        console.log(`  - ${field}: ${mskSample[field]}`);
    });
    
    console.log('\n=== Recommendations ===');
    console.log(`
MessageQueueSample events need the following fields to be visible in the UI:

1. Entity identification (REQUIRED):
   - entityGuid: Unique identifier for the entity
   - entityName: Display name in the UI
   - entityType: Should be a recognized type (e.g., 'KAFKA_BROKER', 'AWS_MSK_BROKER')

2. Provider information:
   - provider: 'kafka' or 'AwsMsk'
   - collector.name: 'nri-kafka' or 'cloudwatch-metric-streams'

3. Kafka-specific fields:
   - clusterName: Name of the Kafka cluster
   - brokerId: ID of the broker (for broker entities)

Current MessageQueueSample is likely being ignored because:
- It lacks proper entity identification fields
- The event type 'MessageQueueSample' is not recognized for Kafka entity synthesis
- Missing provider/collector metadata

Solution: Use KafkaBrokerSample or AwsMskBrokerSample event types instead.
`);
}

compareEvents().catch(console.error);