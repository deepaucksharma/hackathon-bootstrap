#!/bin/bash

echo "Checking for MSK entities in New Relic..."
echo

cd /Users/deepaksharma/syc/hackathon-bootstrap/DashBuilder-main

# Run the check script
node check-strimzi-data.js

# Also check for MSK entities specifically
cat > check-msk-entities.js << 'EOF'
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

async function checkMSKEntities() {
    console.log('\n=== Checking for AWS MSK Entities ===\n');

    const queries = [
        {
            name: 'AwsMskClusterSample entities',
            query: "FROM AwsMskClusterSample SELECT count(*) SINCE 1 hour ago"
        },
        {
            name: 'AwsMskBrokerSample entities',
            query: "FROM AwsMskBrokerSample SELECT count(*) SINCE 1 hour ago"
        },
        {
            name: 'AwsMskTopicSample entities',
            query: "FROM AwsMskTopicSample SELECT count(*) SINCE 1 hour ago"
        },
        {
            name: 'Any AWS MSK cluster names',
            query: "FROM AwsMskClusterSample SELECT uniqueCount(provider.clusterName) FACET provider.clusterName SINCE 1 day ago LIMIT 10"
        },
        {
            name: 'Check entity search for MSK',
            query: "FROM NrdbQuery SELECT count(*) WHERE query LIKE '%AwsMsk%' SINCE 1 day ago"
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

checkMSKEntities().catch(console.error);
EOF

echo
echo "Checking for MSK entities..."
node check-msk-entities.js