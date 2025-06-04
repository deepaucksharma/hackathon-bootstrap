#!/usr/bin/env node

const https = require('https');

const ACCOUNT_ID = process.env.ACC || '3630072';
const API_KEY = process.env.UKEY;

if (!API_KEY) {
    console.error('Please set UKEY environment variable');
    process.exit(1);
}

function queryNRQL(query) {
    return new Promise((resolve, reject) => {
        const encodedQuery = encodeURIComponent(query);
        const options = {
            hostname: 'api.newrelic.com',
            path: `/graphql`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'API-Key': API_KEY
            }
        };

        const graphqlQuery = {
            query: `
                {
                    actor {
                        account(id: ${ACCOUNT_ID}) {
                            nrql(query: "${query}") {
                                results
                            }
                        }
                    }
                }
            `
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.errors) {
                        reject(new Error(JSON.stringify(response.errors)));
                    } else {
                        resolve(response.data.actor.account.nrql.results);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.write(JSON.stringify(graphqlQuery));
        req.end();
    });
}

async function checkStrimziMetrics() {
    console.log('=== Checking Strimzi Kafka Metrics ===\n');

    const queries = [
        {
            name: 'Strimzi cluster data (last 5 min)',
            query: "FROM KafkaBrokerSample SELECT count(*) WHERE clusterName = 'strimzi-production-kafka' SINCE 5 minutes ago"
        },
        {
            name: 'Any KafkaBrokerSample data',
            query: "FROM KafkaBrokerSample SELECT count(*) SINCE 1 hour ago"
        },
        {
            name: 'All cluster names',
            query: "FROM KafkaBrokerSample SELECT uniqueCount(clusterName) FACET clusterName SINCE 1 hour ago LIMIT 10"
        },
        {
            name: 'Check integration events', 
            query: "FROM SystemSample SELECT count(*) WHERE integration.name = 'com.newrelic.kafka' SINCE 1 hour ago"
        },
        {
            name: 'Infrastructure integration logs',
            query: "FROM InfrastructureEvent SELECT message WHERE category = 'integration' AND message LIKE '%kafka%' SINCE 30 minutes ago LIMIT 10"
        },
        {
            name: 'Any broker sample attributes',
            query: "FROM KafkaBrokerSample SELECT * LIMIT 1 SINCE 1 day ago"
        }
    ];

    for (const q of queries) {
        console.log(`\n📊 ${q.name}:`);
        console.log(`Query: ${q.query}`);
        try {
            const results = await queryNRQL(q.query);
            console.log('Results:', JSON.stringify(results, null, 2));
        } catch (error) {
            console.error('Error:', error.message);
        }
    }
}

checkStrimziMetrics().catch(console.error);