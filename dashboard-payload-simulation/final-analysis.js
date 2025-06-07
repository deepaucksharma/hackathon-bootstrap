#\!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');

async function finalAnalysis() {
    const ACCOUNT_ID = process.env.ACC;
    const QUERY_KEY = process.env.QKey;
    
    console.log('🎯 Final Analysis: MSK Entity Creation\n');
    console.log('=====================================\n');
    
    // Check for MSK sample events
    console.log('1️⃣ Checking for MSK event types in the account:\n');
    
    const eventTypes = [
        'AwsMskClusterSample',
        'AwsMskBrokerSample', 
        'AwsMskTopicSample',
        'KafkaClusterSample',
        'KafkaBrokerSample',
        'KafkaTopicSample'
    ];
    
    for (const eventType of eventTypes) {
        try {
            const query = `FROM ${eventType} SELECT count(*) SINCE 1 day ago`;
            const response = await axios.get(
                `https://insights-api.newrelic.com/v1/accounts/${ACCOUNT_ID}/query`,
                {
                    params: { nrql: query },
                    headers: {
                        'X-Query-Key': QUERY_KEY,
                        'Accept': 'application/json'
                    }
                }
            );
            const count = response?.data?.results?.[0]?.count || 0;
            if (count > 0) {
                console.log(`   ✅ ${eventType}: ${count} events`);
            } else {
                console.log(`   ❌ ${eventType}: 0 events`);
            }
        } catch (error) {
            console.log(`   ❌ ${eventType}: Error querying`);
        }
    }
    
    // Final recommendations
    console.log('\n\n🚀 SOLUTION: How to Get MSK Entities in UI\n');
    console.log('=========================================\n');
    
    console.log('Based on comprehensive testing, here are the ONLY ways to create MSK entities:\n');
    
    console.log('Option 1: Use Infrastructure Agent with nri-kafka');
    console.log('------------------------------------------------');
    console.log('1. Deploy New Relic Infrastructure agent');
    console.log('2. Install nri-kafka integration');
    console.log('3. Configure it with MSK_MODE=true');
    console.log('4. Point it to your Kafka/MSK cluster');
    console.log('5. Entities will appear automatically\n');
    
    console.log('Option 2: Use AWS CloudWatch Metric Streams');
    console.log('------------------------------------------');
    console.log('1. Set up AWS integration in New Relic');
    console.log('2. Configure CloudWatch Metric Streams');
    console.log('3. Include AWS/Kafka namespace');
    console.log('4. MSK entities will be created from metrics\n');
    
    console.log('Option 3: Use the nri-kafka binary directly');
    console.log('------------------------------------------');
    console.log('1. Build nri-kafka with MSK shim enabled');
    console.log('2. Run it on a server that can reach Kafka');
    console.log('3. Configure with proper cluster details');
    console.log('4. It will create entities via Infrastructure API\n');
    
    console.log('❌ What DOESN\'T Work:');
    console.log('--------------------');
    console.log('- Direct event submission via Insights API');
    console.log('- Sending AwsMskClusterSample events directly');
    console.log('- MessageQueueSample events');
    console.log('- Any custom event submission approach\n');
    
    console.log('📝 Key Insight:');
    console.log('--------------');
    console.log('Entity synthesis rules are NOT available for direct MSK event submission.');
    console.log('Entities MUST be created through official integrations that have the');
    console.log('proper entity synthesis rules configured in the New Relic platform.\n');
}

finalAnalysis().catch(console.error);
