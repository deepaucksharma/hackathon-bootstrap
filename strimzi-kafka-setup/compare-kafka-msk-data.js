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

async function compareKafkaAndMSKData() {
    console.log('================================================');
    console.log('KAFKA vs MSK DATA COMPARISON');
    console.log('================================================');
    console.log(`Cluster: strimzi-production-kafka`);
    console.log(`Time: ${new Date().toISOString()}\n`);

    // 1. Compare entity counts
    console.log('1. ENTITY COUNTS (Last Hour)');
    console.log('============================\n');

    try {
        // Standard Kafka entities
        const kafkaBrokers = await queryNRQL(
            "FROM KafkaBrokerSample SELECT count(*) WHERE clusterName = 'strimzi-production-kafka' SINCE 1 hour ago"
        );
        console.log(`📊 Standard Kafka Entities:`);
        console.log(`   KafkaBrokerSample: ${kafkaBrokers[0]?.count || 0} samples`);

        const kafkaTopics = await queryNRQL(
            "FROM KafkaTopicSample SELECT count(*) WHERE clusterName = 'strimzi-production-kafka' SINCE 1 hour ago"
        );
        console.log(`   KafkaTopicSample: ${kafkaTopics[0]?.count || 0} samples`);

        const kafkaConsumers = await queryNRQL(
            "FROM KafkaConsumerSample SELECT count(*) WHERE clusterName = 'strimzi-production-kafka' SINCE 1 hour ago"
        );
        console.log(`   KafkaConsumerSample: ${kafkaConsumers[0]?.count || 0} samples\n`);

        // MSK entities
        const mskCluster = await queryNRQL(
            "FROM AwsMskClusterSample SELECT count(*) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 1 hour ago"
        );
        console.log(`📊 MSK Transformed Entities:`);
        console.log(`   AwsMskClusterSample: ${mskCluster[0]?.count || 0} samples`);

        const mskBrokers = await queryNRQL(
            "FROM AwsMskBrokerSample SELECT count(*) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 1 hour ago"
        );
        console.log(`   AwsMskBrokerSample: ${mskBrokers[0]?.count || 0} samples`);

        const mskTopics = await queryNRQL(
            "FROM AwsMskTopicSample SELECT count(*) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 1 hour ago"
        );
        console.log(`   AwsMskTopicSample: ${mskTopics[0]?.count || 0} samples`);

    } catch (error) {
        console.error('Error querying entity counts:', error.message);
    }

    // 2. Compare broker metrics
    console.log('\n\n2. BROKER METRICS COMPARISON');
    console.log('============================\n');

    try {
        // Standard Kafka broker metrics
        const kafkaMetrics = await queryNRQL(
            "FROM KafkaBrokerSample SELECT average(broker.messagesInPerSecond), average(request.handlerIdle), average(request.avgTimeFetch) WHERE clusterName = 'strimzi-production-kafka' SINCE 30 minutes ago"
        );
        
        console.log('📊 Standard Kafka Metrics:');
        if (kafkaMetrics[0]) {
            console.log(`   Messages In/sec: ${kafkaMetrics[0]['average(broker.messagesInPerSecond)']?.toFixed(2) || 'N/A'}`);
            console.log(`   Handler Idle %: ${kafkaMetrics[0]['average(request.handlerIdle)']?.toFixed(2) || 'N/A'}`);
            console.log(`   Avg Fetch Time: ${kafkaMetrics[0]['average(request.avgTimeFetch)']?.toFixed(2) || 'N/A'} ms\n`);
        }

        // MSK broker metrics
        const mskMetrics = await queryNRQL(
            "FROM AwsMskBrokerSample SELECT average(aws.msk.broker.MessagesInPerSec), average(aws.msk.broker.RequestHandlerAvgIdlePercent), average(aws.msk.broker.FetchConsumerTotalTimeMs) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 30 minutes ago"
        );
        
        console.log('📊 MSK Transformed Metrics:');
        if (mskMetrics[0]) {
            console.log(`   Messages In/sec: ${mskMetrics[0]['average(aws.msk.broker.MessagesInPerSec)']?.toFixed(2) || 'N/A'}`);
            console.log(`   Handler Idle %: ${mskMetrics[0]['average(aws.msk.broker.RequestHandlerAvgIdlePercent)']?.toFixed(2) || 'N/A'}`);
            console.log(`   Fetch Total Time: ${mskMetrics[0]['average(aws.msk.broker.FetchConsumerTotalTimeMs)']?.toFixed(2) || 'N/A'} ms`);
        }

    } catch (error) {
        console.error('Error querying broker metrics:', error.message);
    }

    // 3. Compare entity attributes
    console.log('\n\n3. ENTITY ATTRIBUTES COMPARISON');
    console.log('===============================\n');

    try {
        // Get sample Kafka entity
        const kafkaEntity = await queryNRQL(
            "FROM KafkaBrokerSample SELECT * WHERE clusterName = 'strimzi-production-kafka' LIMIT 1 SINCE 1 hour ago"
        );
        
        // Get sample MSK entity
        const mskEntity = await queryNRQL(
            "FROM AwsMskBrokerSample SELECT * WHERE provider.clusterName = 'strimzi-production-kafka' LIMIT 1 SINCE 1 hour ago"
        );

        if (kafkaEntity[0]) {
            console.log('📊 Standard Kafka Entity Keys:');
            const kafkaKeys = Object.keys(kafkaEntity[0]).filter(k => !k.startsWith('timestamp'));
            console.log(`   Total attributes: ${kafkaKeys.length}`);
            console.log(`   Sample keys: ${kafkaKeys.slice(0, 5).join(', ')}...\n`);
        }

        if (mskEntity[0]) {
            console.log('📊 MSK Entity Keys:');
            const mskKeys = Object.keys(mskEntity[0]).filter(k => !k.startsWith('timestamp'));
            console.log(`   Total attributes: ${mskKeys.length}`);
            console.log(`   Sample keys: ${mskKeys.slice(0, 5).join(', ')}...`);
            
            // Check for AWS-specific attributes
            const awsKeys = mskKeys.filter(k => k.includes('aws') || k.includes('provider'));
            console.log(`   AWS-specific attributes: ${awsKeys.length}`);
            console.log(`   Examples: ${awsKeys.slice(0, 3).join(', ')}`);
        }

    } catch (error) {
        console.error('Error querying entity attributes:', error.message);
    }

    // 4. Data freshness check
    console.log('\n\n4. DATA FRESHNESS CHECK');
    console.log('=======================\n');

    try {
        // Check last data point for each type
        const kafkaFreshness = await queryNRQL(
            "FROM KafkaBrokerSample SELECT latest(timestamp) WHERE clusterName = 'strimzi-production-kafka' SINCE 1 hour ago"
        );
        
        const mskFreshness = await queryNRQL(
            "FROM AwsMskBrokerSample SELECT latest(timestamp) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 1 hour ago"
        );

        if (kafkaFreshness[0]) {
            const kafkaTime = new Date(kafkaFreshness[0]['latest(timestamp)']);
            const kafkaAge = (Date.now() - kafkaTime) / 1000;
            console.log(`📊 Standard Kafka Data:`);
            console.log(`   Last data point: ${kafkaTime.toISOString()}`);
            console.log(`   Age: ${kafkaAge.toFixed(0)} seconds ago\n`);
        }

        if (mskFreshness[0]) {
            const mskTime = new Date(mskFreshness[0]['latest(timestamp)']);
            const mskAge = (Date.now() - mskTime) / 1000;
            console.log(`📊 MSK Data:`);
            console.log(`   Last data point: ${mskTime.toISOString()}`);
            console.log(`   Age: ${mskAge.toFixed(0)} seconds ago`);
        }

    } catch (error) {
        console.error('Error checking data freshness:', error.message);
    }

    // Summary
    console.log('\n\n================================================');
    console.log('SUMMARY');
    console.log('================================================\n');

    try {
        const hasKafkaData = (await queryNRQL(
            "FROM KafkaBrokerSample SELECT count(*) WHERE clusterName = 'strimzi-production-kafka' SINCE 5 minutes ago"
        ))[0]?.count > 0;

        const hasMSKData = (await queryNRQL(
            "FROM AwsMskBrokerSample SELECT count(*) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 5 minutes ago"
        ))[0]?.count > 0;

        console.log('📊 Data Status:');
        console.log(`   Standard Kafka Data: ${hasKafkaData ? '✅ RECEIVING' : '❌ NOT RECEIVING'}`);
        console.log(`   MSK Transformed Data: ${hasMSKData ? '✅ RECEIVING' : '❌ NOT RECEIVING'}`);
        console.log(`   MSK Shim Active: ${hasMSKData ? '✅ YES' : '❌ NO'}`);

        if (hasKafkaData && hasMSKData) {
            console.log('\n✨ SUCCESS: Both standard and MSK entities are being created!');
            console.log('   The integration is working correctly with MSK transformation.');
        } else if (hasKafkaData && !hasMSKData) {
            console.log('\n⚠️  WARNING: Only standard Kafka entities found.');
            console.log('   MSK transformation may not be active.');
        } else {
            console.log('\n❌ ERROR: No recent data found.');
            console.log('   Check if the integration is running.');
        }

    } catch (error) {
        console.error('Error in summary:', error.message);
    }
}

// Run the comparison
console.log('Starting Kafka vs MSK data comparison...\n');
compareKafkaAndMSKData().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});