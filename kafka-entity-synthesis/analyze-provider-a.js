#!/usr/bin/env node

/**
 * Analyze Provider A - The Working Provider
 * Understanding what makes it work to replicate for MSK
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

async function analyzeProviderA() {
    loadEnv();
    
    const accountId = process.env.ACC;
    const queryKey = process.env.QKey;
    
    console.log('🔍 Analyzing Provider "A" - The Working Provider\n');
    
    // 1. Get detailed info about Provider A
    console.log('1️⃣ Provider A Details:\n');
    
    const providerQuery = `FROM MessageQueueSample 
        SELECT * 
        WHERE provider = 'A' 
        SINCE 1 hour ago 
        LIMIT 5`;
    
    try {
        const response = await axios.get(
            `https://insights-api.newrelic.com/v1/accounts/${accountId}/query`,
            {
                params: { nrql: providerQuery },
                headers: {
                    'X-Query-Key': queryKey,
                    'Accept': 'application/json'
                }
            }
        );
        
        const events = response?.data?.results?.[0]?.events || [];
        
        if (events.length > 0) {
            console.log('Sample Provider A event structure:');
            const event = events[0];
            
            // Show all fields
            Object.keys(event).sort().forEach(key => {
                console.log(`  ${key}: ${JSON.stringify(event[key])}`);
            });
            
            console.log('\n📊 Key observations:');
            console.log(`  Provider: ${event.provider}`);
            console.log(`  Entity Type: ${event['entity.type'] || 'N/A'}`);
            console.log(`  Queue Type: ${event['queue.type'] || 'N/A'}`);
            console.log(`  Collector: ${event['collector.name'] || 'N/A'}`);
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
    
    // 2. Compare with our MSK attempts
    console.log('\n\n2️⃣ Comparing with our MSK attempts:\n');
    
    const mskQuery = `FROM MessageQueueSample 
        SELECT * 
        WHERE provider = 'AwsMsk' 
        SINCE 1 hour ago 
        LIMIT 5`;
    
    try {
        const response = await axios.get(
            `https://insights-api.newrelic.com/v1/accounts/${accountId}/query`,
            {
                params: { nrql: mskQuery },
                headers: {
                    'X-Query-Key': queryKey,
                    'Accept': 'application/json'
                }
            }
        );
        
        const events = response?.data?.results?.[0]?.events || [];
        
        if (events.length > 0) {
            console.log('Our MSK event structure:');
            const event = events[0];
            Object.keys(event).sort().forEach(key => {
                console.log(`  ${key}: ${JSON.stringify(event[key])}`);
            });
        } else {
            console.log('❌ No MSK MessageQueueSample events found');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
    
    // 3. Check entity association
    console.log('\n\n3️⃣ Entity Association Check:\n');
    
    const entityQuery = `FROM MessageQueueSample 
        SELECT count(*), uniques(entity.guid), uniques(entity.name), uniques(entity.type)
        FACET provider 
        SINCE 1 day ago`;
    
    try {
        const response = await axios.get(
            `https://insights-api.newrelic.com/v1/accounts/${accountId}/query`,
            {
                params: { nrql: entityQuery },
                headers: {
                    'X-Query-Key': queryKey,
                    'Accept': 'application/json'
                }
            }
        );
        
        const results = response?.data?.results || [];
        
        console.log('Entity associations by provider:');
        results.forEach(r => {
            const provider = r.facet[0];
            const guidCount = r['uniques.entity.guid']?.length || 0;
            const nameCount = r['uniques.entity.name']?.length || 0;
            const types = r['uniques.entity.type'] || [];
            
            console.log(`\n${provider}:`);
            console.log(`  Events: ${r.count}`);
            console.log(`  Unique GUIDs: ${guidCount}`);
            console.log(`  Unique Names: ${nameCount}`);
            console.log(`  Entity Types: ${types.join(', ') || 'None'}`);
        });
        
    } catch (error) {
        console.error('Error:', error.message);
    }
    
    // 4. Recommendations
    console.log('\n\n💡 Key Insights:\n');
    console.log('1. Provider "A" is working and visible in the UI');
    console.log('2. It has proper entity associations (check the GUIDs)');
    console.log('3. Our MSK events may be missing critical fields\n');
    
    console.log('🎯 Action Items:');
    console.log('1. Copy the EXACT structure of Provider A events');
    console.log('2. Ensure entity.guid is properly set');
    console.log('3. Match the collector.name pattern');
    console.log('4. Test with the same field structure');
}

analyzeProviderA().catch(console.error);