#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

const ACCOUNT_ID = process.env.ACC || '3630072';
const API_KEY = process.env.UKEY;

if (!API_KEY) {
    console.error('Please set UKEY environment variable with your New Relic User API Key');
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

async function verifyMSKEntities() {
    console.log('============================================');
    console.log('MSK Entity Verification for Strimzi Kafka');
    console.log('============================================');
    console.log(`Account ID: ${ACCOUNT_ID}`);
    console.log(`Cluster Name: strimzi-production-kafka`);
    console.log(`Time: ${new Date().toISOString()}\n`);

    const results = {};

    // 1. Check for entity existence (from MSK-SHIM.md line 267-269)
    console.log('1. CHECKING ENTITY EXISTENCE');
    console.log('============================\n');
    
    const entityQueries = [
        {
            name: 'AwsMskClusterSample count',
            query: "FROM AwsMskClusterSample SELECT count(*) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 1 hour ago"
        },
        {
            name: 'AwsMskBrokerSample count',
            query: "FROM AwsMskBrokerSample SELECT count(*) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 1 hour ago"
        },
        {
            name: 'AwsMskTopicSample count',
            query: "FROM AwsMskTopicSample SELECT count(*) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 1 hour ago"
        }
    ];

    for (const q of entityQueries) {
        console.log(`✓ ${q.name}:`);
        try {
            const result = await queryNRQL(q.query);
            console.log(`  Result: ${JSON.stringify(result)}`);
            results[q.name] = result;
        } catch (error) {
            console.error(`  Error: ${error.message}`);
            results[q.name] = { error: error.message };
        }
        console.log();
    }

    // 2. Validate cluster health (from MSK-SHIM.md line 271-277)
    console.log('\n2. CLUSTER HEALTH VALIDATION');
    console.log('============================\n');

    const clusterHealthQuery = `
        FROM AwsMskClusterSample
        SELECT 
            latest(provider.activeControllerCount.Sum) as 'Controllers',
            latest(provider.underReplicatedPartitions.Sum) as 'UnderReplicated',
            latest(provider.offlinePartitionsCount.Sum) as 'Offline',
            latest(provider.globalPartitionCount) as 'TotalPartitions',
            latest(provider.globalTopicCount) as 'TotalTopics',
            latest(provider.bytesInPerSec.Sum) as 'ClusterBytesIn',
            latest(provider.bytesOutPerSec.Sum) as 'ClusterBytesOut'
        WHERE provider.clusterName = 'strimzi-production-kafka'
        SINCE 30 minutes ago
    `;

    try {
        console.log('✓ Cluster Health Metrics:');
        const result = await queryNRQL(clusterHealthQuery);
        console.log(JSON.stringify(result, null, 2));
        results['clusterHealth'] = result;
    } catch (error) {
        console.error(`  Error: ${error.message}`);
        results['clusterHealth'] = { error: error.message };
    }

    // 3. Check broker metrics (from MSK-SHIM.md line 279-285)
    console.log('\n\n3. BROKER METRICS VALIDATION');
    console.log('============================\n');

    const brokerMetricsQuery = `
        FROM AwsMskBrokerSample
        SELECT 
            average(provider.bytesInPerSec.Average) as 'BytesIn',
            average(provider.bytesOutPerSec.Average) as 'BytesOut',
            average(provider.messagesInPerSec.Average) as 'MessagesIn',
            average(provider.cpuUser.Average) as 'CPU%',
            average(provider.kafkaDataLogsDiskUsed.Average) as 'Disk%',
            average(provider.requestHandlerAvgIdlePercent.Average) as 'HandlerIdle%'
        WHERE provider.clusterName = 'strimzi-production-kafka'
        FACET provider.brokerId
        SINCE 30 minutes ago
    `;

    try {
        console.log('✓ Broker Performance Metrics:');
        const result = await queryNRQL(brokerMetricsQuery);
        console.log(JSON.stringify(result, null, 2));
        results['brokerMetrics'] = result;
    } catch (error) {
        console.error(`  Error: ${error.message}`);
        results['brokerMetrics'] = { error: error.message };
    }

    // 4. Verify latency metrics (from MSK-SHIM.md line 287-291)
    console.log('\n\n4. LATENCY METRICS VALIDATION');
    console.log('============================\n');

    const latencyMetricsQuery = `
        FROM AwsMskBrokerSample
        SELECT 
            average(provider.fetchConsumerTotalTimeMsMean.Average) as 'FetchLatency',
            average(provider.fetchConsumerLocalTimeMsMean.Average) as 'FetchLocalTime',
            average(provider.fetchConsumerRequestQueueTimeMsMean.Average) as 'FetchQueueTime',
            average(provider.produceTotalTimeMsMean.Average) as 'ProduceLatency',
            average(provider.produceLocalTimeMsMean.Average) as 'ProduceLocalTime'
        WHERE provider.clusterName = 'strimzi-production-kafka'
        SINCE 30 minutes ago
    `;

    try {
        console.log('✓ Request Latency Metrics:');
        const result = await queryNRQL(latencyMetricsQuery);
        console.log(JSON.stringify(result, null, 2));
        results['latencyMetrics'] = result;
    } catch (error) {
        console.error(`  Error: ${error.message}`);
        results['latencyMetrics'] = { error: error.message };
    }

    // 5. Check entity GUIDs format
    console.log('\n\n5. ENTITY GUID VALIDATION');
    console.log('========================\n');

    const guidQueries = [
        {
            name: 'Cluster GUIDs',
            query: "FROM AwsMskClusterSample SELECT uniques(entity.guid) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 1 hour ago"
        },
        {
            name: 'Broker GUIDs',
            query: "FROM AwsMskBrokerSample SELECT uniques(entity.guid) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 1 hour ago LIMIT 10"
        }
    ];

    for (const q of guidQueries) {
        console.log(`✓ ${q.name}:`);
        try {
            const result = await queryNRQL(q.query);
            console.log(`  GUIDs: ${JSON.stringify(result)}`);
            
            // Validate GUID format
            if (result && result[0] && result[0]['uniques(entity.guid)']) {
                const guids = result[0]['uniques(entity.guid)'];
                guids.forEach(guid => {
                    const parts = guid.split('|');
                    console.log(`  - ${guid}`);
                    console.log(`    Account: ${parts[0]}, Type: ${parts[1]}, Entity: ${parts[2]}`);
                });
            }
            results[q.name] = result;
        } catch (error) {
            console.error(`  Error: ${error.message}`);
            results[q.name] = { error: error.message };
        }
        console.log();
    }

    // 6. Topic metrics validation
    console.log('\n6. TOPIC METRICS VALIDATION');
    console.log('==========================\n');

    const topicQueries = [
        {
            name: 'Topic count and throughput',
            query: `FROM AwsMskTopicSample 
                    SELECT count(*), 
                           sum(provider.bytesInPerSec.Average) as 'TotalBytesIn',
                           sum(provider.messagesInPerSec.Average) as 'TotalMessagesIn'
                    WHERE provider.clusterName = 'strimzi-production-kafka' 
                    SINCE 30 minutes ago`
        },
        {
            name: 'Top topics by throughput',
            query: `FROM AwsMskTopicSample 
                    SELECT average(provider.bytesInPerSec.Average) as 'BytesIn',
                           average(provider.messagesInPerSec.Average) as 'MessagesIn'
                    WHERE provider.clusterName = 'strimzi-production-kafka' 
                    FACET provider.topicName 
                    SINCE 30 minutes ago 
                    LIMIT 10`
        }
    ];

    for (const q of topicQueries) {
        console.log(`✓ ${q.name}:`);
        try {
            const result = await queryNRQL(q.query);
            console.log(JSON.stringify(result, null, 2));
            results[q.name] = result;
        } catch (error) {
            console.error(`  Error: ${error.message}`);
            results[q.name] = { error: error.message };
        }
        console.log();
    }

    // 7. Check raw metric names
    console.log('\n7. RAW METRIC NAMES CHECK');
    console.log('========================\n');

    const metricNamesQuery = `
        FROM AwsMskBrokerSample 
        SELECT keyset() 
        WHERE provider.clusterName = 'strimzi-production-kafka' 
        SINCE 5 minutes ago 
        LIMIT 1
    `;

    try {
        console.log('✓ Available MSK Broker Metrics:');
        const result = await queryNRQL(metricNamesQuery);
        if (result && result[0] && result[0]['keyset()']) {
            const metrics = result[0]['keyset()'];
            const mskMetrics = metrics.filter(m => m.includes('msk') || m.includes('provider'));
            console.log('  MSK-specific metrics:');
            mskMetrics.forEach(m => console.log(`    - ${m}`));
        }
        results['availableMetrics'] = result;
    } catch (error) {
        console.error(`  Error: ${error.message}`);
        results['availableMetrics'] = { error: error.message };
    }

    // 8. Summary
    console.log('\n\n============================================');
    console.log('VERIFICATION SUMMARY');
    console.log('============================================\n');

    let hasData = false;
    let clusterFound = false;
    let brokersFound = 0;
    let topicsFound = 0;

    // Check cluster
    if (results['AwsMskClusterSample count'] && results['AwsMskClusterSample count'][0]) {
        const count = results['AwsMskClusterSample count'][0]['count'];
        clusterFound = count > 0;
        console.log(`✅ Cluster Entity: ${count > 0 ? 'FOUND' : 'NOT FOUND'} (${count} samples)`);
    }

    // Check brokers
    if (results['AwsMskBrokerSample count'] && results['AwsMskBrokerSample count'][0]) {
        const count = results['AwsMskBrokerSample count'][0]['count'];
        brokersFound = count;
        console.log(`✅ Broker Entities: ${count > 0 ? 'FOUND' : 'NOT FOUND'} (${count} samples)`);
    }

    // Check topics
    if (results['AwsMskTopicSample count'] && results['AwsMskTopicSample count'][0]) {
        const count = results['AwsMskTopicSample count'][0]['count'];
        topicsFound = count;
        console.log(`✅ Topic Entities: ${count > 0 ? 'FOUND' : 'NOT FOUND'} (${count} samples)`);
    }

    hasData = clusterFound || brokersFound > 0 || topicsFound > 0;

    console.log('\n📊 Data Status:');
    console.log(`   - MSK Shim Active: ${hasData ? 'YES' : 'NO'}`);
    console.log(`   - Cluster Metrics: ${clusterFound ? 'RECEIVING' : 'NOT RECEIVING'}`);
    console.log(`   - Broker Metrics: ${brokersFound > 0 ? 'RECEIVING' : 'NOT RECEIVING'}`);
    console.log(`   - Topic Metrics: ${topicsFound > 0 ? 'RECEIVING' : 'NOT RECEIVING'}`);

    // Save results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `msk-verification-results-${timestamp}.json`;
    
    fs.writeFileSync(filename, JSON.stringify({
        timestamp: new Date().toISOString(),
        accountId: ACCOUNT_ID,
        clusterName: 'strimzi-production-kafka',
        summary: {
            hasData,
            clusterFound,
            brokersFound,
            topicsFound
        },
        results
    }, null, 2));

    console.log(`\n📁 Results saved to: ${filename}`);

    // Return exit code based on success
    process.exit(hasData ? 0 : 1);
}

// Run verification
console.log('Starting MSK entity verification...\n');
verifyMSKEntities().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});