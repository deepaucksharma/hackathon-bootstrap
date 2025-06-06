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
        }).on('error', reject).on('timeout', () => reject(new Error('Query timeout')));
    });
}

async function quickCheck() {
    console.log('=== Quick Entity Check ===\n');
    
    const queries = [
        {
            name: 'Kafka events (last hour)',
            query: 'SELECT count(*) FROM KafkaBrokerSample, KafkaTopicSample, KafkaOffsetSample, KafkaConsumerSample, KafkaProducerSample SINCE 1 hour ago'
        },
        {
            name: 'MSK events (last hour)',
            query: 'SELECT count(*) FROM AwsMskBrokerSample, AwsMskClusterSample, AwsMskTopicSample SINCE 1 hour ago'
        },
        {
            name: 'MessageQueue events (last hour)',
            query: 'SELECT count(*) FROM MessageQueueSample SINCE 1 hour ago'
        },
        {
            name: 'Kafka entities',
            query: "SELECT count(*) FROM Entity WHERE type IN ('KAFKA_BROKER', 'KAFKA_TOPIC', 'KAFKA_CLUSTER', 'AWS_MSK_BROKER', 'AWS_MSK_CLUSTER', 'AWS_MSK_TOPIC') SINCE 1 hour ago"
        },
        {
            name: 'Recent MSK Broker sample',
            query: 'SELECT * FROM AwsMskBrokerSample LIMIT 1 SINCE 24 hours ago'
        },
        {
            name: 'Recent Kafka Broker sample',
            query: 'SELECT * FROM KafkaBrokerSample LIMIT 1 SINCE 24 hours ago'
        }
    ];
    
    for (const {name, query} of queries) {
        console.log(`\nChecking: ${name}`);
        console.log(`Query: ${query}`);
        
        try {
            const result = await runQuery(query);
            
            if (result.error) {
                console.log(`Error: ${result.error}`);
            } else if (result.results && result.results[0]) {
                if (result.results[0].events && result.results[0].events.length > 0) {
                    const event = result.results[0].events[0];
                    if (event.count !== undefined) {
                        console.log(`Count: ${event.count}`);
                    } else {
                        console.log('Sample event:');
                        console.log(JSON.stringify(event, null, 2));
                    }
                } else if (result.results[0].count !== undefined) {
                    console.log(`Count: ${result.results[0].count}`);
                } else {
                    console.log('No results');
                }
            } else {
                console.log('No data');
            }
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
    }
    
    console.log('\n=== Summary ===');
    console.log('Check the results above to see what Kafka/MSK data exists in your account.');
    console.log('If events exist but entities don\'t, there may be an entity synthesis issue.');
}

quickCheck().catch(console.error);