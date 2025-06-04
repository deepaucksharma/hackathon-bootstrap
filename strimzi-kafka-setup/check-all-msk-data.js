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
}

const ACCOUNT_ID = process.env.ACC || '3630072';
const API_KEY = process.env.UKEY;

if (!API_KEY) {
    console.error('Please set UKEY in DashBuilder/.env');
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

async function checkAllMSKData() {
    console.log('================================================');
    console.log('COMPREHENSIVE MSK DATA CHECK');
    console.log('================================================\n');

    // 1. Check for ANY MSK data
    console.log('1. CHECKING FOR ANY MSK DATA (Last Hour)');
    console.log('========================================\n');

    try {
        const anyCluster = await queryNRQL(
            "FROM AwsMskClusterSample SELECT count(*), uniques(provider.clusterName) SINCE 1 hour ago"
        );
        console.log('📊 MSK Cluster Data:');
        console.log(`   Total samples: ${anyCluster[0]?.count || 0}`);
        console.log(`   Cluster names: ${JSON.stringify(anyCluster[0]?.['uniques(provider.clusterName)'] || [])}\n`);

        const anyBroker = await queryNRQL(
            "FROM AwsMskBrokerSample SELECT count(*), uniques(provider.clusterName) SINCE 1 hour ago"
        );
        console.log('📊 MSK Broker Data:');
        console.log(`   Total samples: ${anyBroker[0]?.count || 0}`);
        console.log(`   Cluster names: ${JSON.stringify(anyBroker[0]?.['uniques(provider.clusterName)'] || [])}\n`);

    } catch (error) {
        console.error('Error checking MSK data:', error.message);
    }

    // 2. Check specific cluster names
    console.log('2. CHECKING SPECIFIC CLUSTER NAMES');
    console.log('==================================\n');

    const clusterNames = [
        'strimzi-production-kafka',
        'default-kafka-cluster',
        'production-kafka',
        'kafka-cluster'
    ];

    for (const clusterName of clusterNames) {
        try {
            const result = await queryNRQL(
                `FROM AwsMskBrokerSample SELECT count(*) WHERE provider.clusterName = '${clusterName}' SINCE 1 hour ago`
            );
            const count = result[0]?.count || 0;
            console.log(`📊 Cluster "${clusterName}": ${count} samples ${count > 0 ? '✅' : '❌'}`);
        } catch (error) {
            console.error(`   Error checking ${clusterName}:`, error.message);
        }
    }

    // 3. Check for data without cluster name filter
    console.log('\n\n3. RECENT MSK DATA (Last 5 Minutes)');
    console.log('===================================\n');

    try {
        const recentData = await queryNRQL(
            "FROM AwsMskBrokerSample SELECT provider.clusterName, provider.brokerId, latest(timestamp) SINCE 5 minutes ago LIMIT 10"
        );
        
        if (recentData && recentData.length > 0) {
            console.log('📊 Recent MSK Broker Data:');
            recentData.forEach(record => {
                const timestamp = new Date(record['latest(timestamp)']);
                const age = Math.round((Date.now() - timestamp) / 1000);
                console.log(`   Cluster: ${record['provider.clusterName']}, Broker: ${record['provider.brokerId']}, Age: ${age}s ago`);
            });
        } else {
            console.log('❌ No recent MSK broker data found');
        }
    } catch (error) {
        console.error('Error checking recent data:', error.message);
    }

    // 4. Check entity GUIDs and attributes
    console.log('\n\n4. MSK ENTITY DETAILS');
    console.log('====================\n');

    try {
        const entityDetails = await queryNRQL(
            "FROM AwsMskBrokerSample SELECT entity.guid, entityGuid, entityName, provider.clusterName, provider.region SINCE 1 hour ago LIMIT 5"
        );
        
        if (entityDetails && entityDetails.length > 0) {
            console.log('📊 MSK Entity Details:');
            entityDetails.forEach(entity => {
                console.log(`\n   Entity Name: ${entity.entityName}`);
                console.log(`   Cluster: ${entity['provider.clusterName']}`);
                console.log(`   Region: ${entity['provider.region']}`);
                console.log(`   GUID: ${entity['entity.guid'] || entity.entityGuid}`);
            });
        } else {
            console.log('❌ No MSK entity details found');
        }
    } catch (error) {
        console.error('Error checking entity details:', error.message);
    }

    // 5. Check standard Kafka data for comparison
    console.log('\n\n5. STANDARD KAFKA DATA (For Comparison)');
    console.log('======================================\n');

    try {
        const kafkaData = await queryNRQL(
            "FROM KafkaBrokerSample SELECT count(*), uniques(clusterName) SINCE 1 hour ago"
        );
        console.log('📊 Standard Kafka Data:');
        console.log(`   Total samples: ${kafkaData[0]?.count || 0}`);
        console.log(`   Cluster names: ${JSON.stringify(kafkaData[0]?.['uniques(clusterName)'] || [])}`);
    } catch (error) {
        console.error('Error checking Kafka data:', error.message);
    }

    // Summary
    console.log('\n\n================================================');
    console.log('SUMMARY');
    console.log('================================================\n');

    try {
        const hasMSKData = (await queryNRQL(
            "FROM AwsMskBrokerSample SELECT count(*) SINCE 5 minutes ago"
        ))[0]?.count > 0;

        const hasKafkaData = (await queryNRQL(
            "FROM KafkaBrokerSample SELECT count(*) SINCE 5 minutes ago"
        ))[0]?.count > 0;

        console.log(`MSK Data Present: ${hasMSKData ? '✅ YES' : '❌ NO'}`);
        console.log(`Standard Kafka Data: ${hasKafkaData ? '✅ YES' : '❌ NO'}`);

        if (hasMSKData) {
            console.log('\n✨ MSK data is being received!');
            console.log('   Check the cluster names above to find your data.');
        } else {
            console.log('\n⚠️  No MSK data found yet.');
            console.log('   The integration might still be initializing.');
            console.log('   Check pod logs for more details.');
        }

    } catch (error) {
        console.error('Error in summary:', error.message);
    }
}

// Run the check
console.log('Checking all MSK data in NRDB...\n');
checkAllMSKData().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});