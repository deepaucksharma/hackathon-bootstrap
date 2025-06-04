#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load .env from DashBuilder
const envPath = path.join(__dirname, '../DashBuilder-main/.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
                process.env[key] = valueParts.join('=');
            }
        }
    });
    console.log('✅ Loaded environment from DashBuilder/.env\n');
} else {
    console.error('❌ Could not find DashBuilder/.env file');
    process.exit(1);
}

const ACCOUNT_ID = process.env.ACC;
const API_KEY = process.env.UKEY;

console.log('Configuration:');
console.log(`  Account ID: ${ACCOUNT_ID}`);
console.log(`  API Key: ${API_KEY.substring(0, 10)}...${API_KEY.substring(API_KEY.length - 4)}`);
console.log();

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

async function quickVerify() {
    console.log('============================================');
    console.log('MSK DATA VERIFICATION FOR STRIMZI KAFKA');
    console.log('============================================\n');

    const tests = [
        {
            name: '1. MSK Cluster Entity',
            query: "FROM AwsMskClusterSample SELECT count(*) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 5 minutes ago"
        },
        {
            name: '2. MSK Broker Entities',
            query: "FROM AwsMskBrokerSample SELECT count(*), uniqueCount(provider.brokerId) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 5 minutes ago"
        },
        {
            name: '3. Cluster Health',
            query: "FROM AwsMskClusterSample SELECT latest(provider.activeControllerCount.Sum) as 'controllers', latest(provider.offlinePartitionsCount.Sum) as 'offline' WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 30 minutes ago"
        },
        {
            name: '4. Broker Metrics',
            query: "FROM AwsMskBrokerSample SELECT average(aws.msk.broker.MessagesInPerSec) as 'messagesIn', average(aws.msk.broker.RequestHandlerAvgIdlePercent) as 'handlerIdle' WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 30 minutes ago"
        },
        {
            name: '5. Entity GUIDs',
            query: "FROM AwsMskBrokerSample SELECT uniques(entity.guid) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 1 hour ago LIMIT 1"
        }
    ];

    let hasData = false;

    for (const test of tests) {
        console.log(`📊 ${test.name}`);
        try {
            const result = await queryNRQL(test.query);
            console.log(`   Result: ${JSON.stringify(result)}`);
            
            // Check if we have data
            if (result && result[0]) {
                const firstResult = result[0];
                if (firstResult.count && firstResult.count > 0) {
                    hasData = true;
                }
                if (firstResult['uniqueCount(provider.brokerId)'] && firstResult['uniqueCount(provider.brokerId)'] > 0) {
                    hasData = true;
                }
                if (firstResult.controllers !== undefined) {
                    hasData = true;
                }
            }
        } catch (error) {
            console.error(`   Error: ${error.message}`);
        }
        console.log();
    }

    console.log('============================================');
    console.log('SUMMARY');
    console.log('============================================\n');

    if (hasData) {
        console.log('✅ MSK DATA FOUND IN NRDB!');
        console.log('   The MSK shim is working correctly.');
        console.log('   Data is being transformed and sent to New Relic.\n');
        console.log('📊 Next Steps:');
        console.log('   1. Go to New Relic UI > Message Queues & Streams');
        console.log('   2. Filter by Provider: AWS, Service: Kafka');
        console.log('   3. Look for cluster: strimzi-production-kafka');
    } else {
        console.log('❌ NO MSK DATA FOUND IN NRDB');
        console.log('   The integration might still be initializing.');
        console.log('   Wait a few minutes and try again.');
        
        // Also check for standard Kafka data
        try {
            const kafkaResult = await queryNRQL(
                "FROM KafkaBrokerSample SELECT count(*) WHERE clusterName = 'strimzi-production-kafka' SINCE 5 minutes ago"
            );
            if (kafkaResult && kafkaResult[0] && kafkaResult[0].count > 0) {
                console.log('\n⚠️  Note: Standard Kafka data IS present.');
                console.log('   MSK transformation might not be active yet.');
            }
        } catch (error) {
            // Ignore
        }
    }

    return hasData;
}

// Run verification
(async () => {
    try {
        const success = await quickVerify();
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
})();