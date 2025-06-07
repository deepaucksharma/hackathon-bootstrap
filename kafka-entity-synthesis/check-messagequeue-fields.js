#!/usr/bin/env node

/**
 * Check what fields are actually in MessageQueueSample
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

async function checkFields() {
    loadEnv();
    
    const accountId = process.env.ACC;
    const queryKey = process.env.QKey;
    
    console.log('🔍 Checking MessageQueueSample Fields\n');
    
    // Get a sample of our recent events
    const query = `FROM MessageQueueSample 
        SELECT * 
        WHERE provider = 'AwsMsk' 
        SINCE 10 minutes ago 
        LIMIT 5`;
    
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
        
        const events = response?.data?.results?.[0]?.events || [];
        
        if (events.length > 0) {
            console.log(`Found ${events.length} events\n`);
            
            // Show first event structure
            console.log('First event structure:');
            const event = events[0];
            Object.keys(event).sort().forEach(key => {
                console.log(`  ${key}: ${JSON.stringify(event[key])}`);
            });
            
            // Check specifically for entity fields
            console.log('\n\nEntity-related fields:');
            ['entity.name', 'entity.type', 'entity.guid', 'entityName', 'entityType', 'entityGuid'].forEach(field => {
                if (event[field] !== undefined) {
                    console.log(`  ✅ ${field}: ${event[field]}`);
                } else {
                    console.log(`  ❌ ${field}: NOT FOUND`);
                }
            });
            
            // Check queue fields
            console.log('\n\nQueue-related fields:');
            ['queue.name', 'queue.type', 'queue.messagesPerSecond'].forEach(field => {
                if (event[field] !== undefined) {
                    console.log(`  ✅ ${field}: ${event[field]}`);
                } else {
                    console.log(`  ❌ ${field}: NOT FOUND`);
                }
            });
            
        } else {
            console.log('No events found');
        }
        
        // Now check aggregated data
        console.log('\n\n📊 Aggregated data check:\n');
        
        const aggQuery = `FROM MessageQueueSample 
            SELECT count(*), 
                   uniques(entityName), 
                   uniques(entityType),
                   uniques(queue.name),
                   uniques(collector.name)
            WHERE provider = 'AwsMsk' 
            SINCE 1 hour ago`;
        
        const aggResponse = await axios.get(
            `https://insights-api.newrelic.com/v1/accounts/${accountId}/query`,
            {
                params: { nrql: aggQuery },
                headers: {
                    'X-Query-Key': queryKey,
                    'Accept': 'application/json'
                }
            }
        );
        
        const aggResult = aggResponse?.data?.results?.[0] || {};
        
        console.log(`Total events: ${aggResult.count || 0}`);
        console.log(`Unique entityName values: ${aggResult['uniques.entityName']?.length || 0}`);
        if (aggResult['uniques.entityName']?.length > 0) {
            console.log('  Entity names:');
            aggResult['uniques.entityName'].slice(0, 5).forEach(name => {
                console.log(`    - ${name}`);
            });
        }
        
        console.log(`\nUnique queue.name values: ${aggResult['uniques.queue.name']?.length || 0}`);
        if (aggResult['uniques.queue.name']?.length > 0) {
            console.log('  Queue names:');
            aggResult['uniques.queue.name'].slice(0, 5).forEach(name => {
                console.log(`    - ${name}`);
            });
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkFields().catch(console.error);