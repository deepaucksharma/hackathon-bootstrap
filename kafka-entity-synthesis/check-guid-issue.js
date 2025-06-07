#!/usr/bin/env node

/**
 * Debug entity.guid issue in MessageQueueSample
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

async function checkGuidIssue() {
    loadEnv();
    
    const accountId = process.env.ACC;
    const queryKey = process.env.QKey;
    
    console.log('🔍 Debugging entity.guid Issue\n');
    
    // Try different ways to access entity.guid
    const queries = [
        {
            name: 'Direct entity.guid access',
            query: `FROM MessageQueueSample SELECT count(*), uniques(entity.guid) WHERE provider = 'AwsMsk' SINCE 1 hour ago`
        },
        {
            name: 'Using capture() for entity.guid',
            query: `FROM MessageQueueSample SELECT count(*), uniques(capture(entity.guid, r'.*')) WHERE provider = 'AwsMsk' SINCE 1 hour ago`
        },
        {
            name: 'Check if entity.guid exists',
            query: `FROM MessageQueueSample SELECT count(*) WHERE provider = 'AwsMsk' AND entity.guid != '' SINCE 1 hour ago`
        },
        {
            name: 'Get sample with all fields',
            query: `FROM MessageQueueSample SELECT * WHERE provider = 'AwsMsk' SINCE 1 hour ago LIMIT 1`
        }
    ];
    
    for (const q of queries) {
        console.log(`\n${q.name}:`);
        
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
            
            if (q.name.includes('sample')) {
                const events = response?.data?.results?.[0]?.events || [];
                if (events.length > 0) {
                    const event = events[0];
                    // List all fields that contain 'guid'
                    console.log('  Fields containing "guid":');
                    Object.keys(event).forEach(key => {
                        if (key.toLowerCase().includes('guid')) {
                            console.log(`    ${key}: ${event[key]}`);
                        }
                    });
                    
                    // Check entity fields
                    console.log('\n  Entity fields:');
                    Object.keys(event).forEach(key => {
                        if (key.startsWith('entity.')) {
                            console.log(`    ${key}: ${event[key]}`);
                        }
                    });
                }
            } else {
                const result = response?.data?.results?.[0] || {};
                console.log(`  Count: ${result.count || 0}`);
                if (result['uniques.entity.guid']) {
                    console.log(`  Unique GUIDs: ${result['uniques.entity.guid'].length}`);
                } else if (result['uniques.capture(entity.guid, r\'.*.\')']) {
                    console.log(`  Unique GUIDs (via capture): ${result['uniques.capture(entity.guid, r\'.*.\')'].length}`);
                }
            }
            
        } catch (error) {
            console.log(`  Error: ${error.message}`);
        }
    }
    
    // Try to understand the field structure
    console.log('\n\n🗒️ Field Structure Analysis:');
    
    const structureQuery = `FROM MessageQueueSample 
        SELECT keyset() 
        WHERE provider = 'AwsMsk' 
        SINCE 1 hour ago 
        LIMIT 1`;
    
    try {
        const response = await axios.get(
            `https://insights-api.newrelic.com/v1/accounts/${accountId}/query`,
            {
                params: { nrql: structureQuery },
                headers: {
                    'X-Query-Key': queryKey,
                    'Accept': 'application/json'
                }
            }
        );
        
        const result = response?.data?.results?.[0] || {};
        const keys = result.keyset || [];
        
        console.log('\nAll fields in MessageQueueSample:');
        keys.sort().forEach(key => {
            if (key.includes('entity') || key.includes('guid')) {
                console.log(`  ✓ ${key}`);
            }
        });
        
    } catch (error) {
        console.log(`  Error: ${error.message}`);
    }
}

checkGuidIssue().catch(console.error);