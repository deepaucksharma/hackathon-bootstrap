#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

// Use DashBuilder's environment configuration
const ACCOUNT_ID = process.env.ACC || '3630072';
const API_KEY = process.env.UKEY;

if (!API_KEY) {
    console.error('ERROR: Please set UKEY environment variable with your New Relic User API Key');
    console.error('Example: export UKEY=NRAK-XXXXXXXXXXXXXXXXXXXXXXXXX');
    process.exit(1);
}

// NRQL query function using GraphQL
async function queryNRQL(nrqlQuery) {
    const graphqlQuery = {
        query: `
            {
                actor {
                    account(id: ${ACCOUNT_ID}) {
                        nrql(query: "${nrqlQuery}") {
                            results
                        }
                    }
                }
            }
        `
    };

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.newrelic.com',
            path: '/graphql',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'API-Key': API_KEY
            }
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

// Main verification function
async function verifyStrimziMSKData() {
    console.log('='.repeat(80));
    console.log('STRIMZI KAFKA MSK ENTITY VERIFICATION');
    console.log('='.repeat(80));
    console.log(`Account ID: ${ACCOUNT_ID}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Cluster: strimzi-production-kafka`);
    console.log('='.repeat(80));
    console.log();

    const testResults = {
        timestamp: new Date().toISOString(),
        accountId: ACCOUNT_ID,
        clusterName: 'strimzi-production-kafka',
        tests: []
    };

    // Test Suite 1: Entity Existence
    console.log('TEST SUITE 1: Entity Existence Checks');
    console.log('-'.repeat(40));
    
    const entityTests = [
        {
            name: 'Cluster Entity Check',
            description: 'Verify AwsMskClusterSample exists',
            query: "FROM AwsMskClusterSample SELECT count(*) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 1 hour ago",
            expectedResult: (result) => result && result[0] && result[0]['count'] > 0
        },
        {
            name: 'Broker Entities Check',
            description: 'Verify AwsMskBrokerSample exists (expecting 3 brokers)',
            query: "FROM AwsMskBrokerSample SELECT uniqueCount(provider.brokerId) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 1 hour ago",
            expectedResult: (result) => result && result[0] && result[0]['uniqueCount(provider.brokerId)'] === 3
        },
        {
            name: 'Recent Data Check',
            description: 'Verify data received in last 5 minutes',
            query: "FROM AwsMskBrokerSample SELECT count(*) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 5 minutes ago",
            expectedResult: (result) => result && result[0] && result[0]['count'] > 0
        }
    ];

    for (const test of entityTests) {
        console.log(`\n📋 ${test.name}`);
        console.log(`   ${test.description}`);
        try {
            const result = await queryNRQL(test.query);
            const passed = test.expectedResult(result);
            console.log(`   Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
            console.log(`   Data: ${JSON.stringify(result)}`);
            
            testResults.tests.push({
                suite: 'Entity Existence',
                name: test.name,
                passed,
                result
            });
        } catch (error) {
            console.log(`   Result: ❌ ERROR`);
            console.log(`   Error: ${error.message}`);
            testResults.tests.push({
                suite: 'Entity Existence',
                name: test.name,
                passed: false,
                error: error.message
            });
        }
    }

    // Test Suite 2: Cluster Health Metrics
    console.log('\n\nTEST SUITE 2: Cluster Health Metrics');
    console.log('-'.repeat(40));

    const clusterHealthTests = [
        {
            name: 'Active Controller Check',
            description: 'Verify exactly 1 active controller',
            query: `FROM AwsMskClusterSample 
                    SELECT latest(provider.activeControllerCount.Sum) as 'controllers' 
                    WHERE provider.clusterName = 'strimzi-production-kafka' 
                    SINCE 30 minutes ago`,
            expectedResult: (result) => result && result[0] && result[0]['controllers'] === 1
        },
        {
            name: 'Offline Partitions Check',
            description: 'Verify no offline partitions',
            query: `FROM AwsMskClusterSample 
                    SELECT latest(provider.offlinePartitionsCount.Sum) as 'offline' 
                    WHERE provider.clusterName = 'strimzi-production-kafka' 
                    SINCE 30 minutes ago`,
            expectedResult: (result) => result && result[0] && result[0]['offline'] === 0
        },
        {
            name: 'Cluster Throughput Check',
            description: 'Verify cluster throughput metrics exist',
            query: `FROM AwsMskClusterSample 
                    SELECT latest(provider.bytesInPerSec.Sum) as 'bytesIn',
                           latest(provider.bytesOutPerSec.Sum) as 'bytesOut'
                    WHERE provider.clusterName = 'strimzi-production-kafka' 
                    SINCE 30 minutes ago`,
            expectedResult: (result) => result && result[0] && 
                           result[0]['bytesIn'] !== null && 
                           result[0]['bytesOut'] !== null
        }
    ];

    for (const test of clusterHealthTests) {
        console.log(`\n📋 ${test.name}`);
        console.log(`   ${test.description}`);
        try {
            const result = await queryNRQL(test.query);
            const passed = test.expectedResult(result);
            console.log(`   Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
            console.log(`   Data: ${JSON.stringify(result)}`);
            
            testResults.tests.push({
                suite: 'Cluster Health',
                name: test.name,
                passed,
                result
            });
        } catch (error) {
            console.log(`   Result: ❌ ERROR`);
            console.log(`   Error: ${error.message}`);
            testResults.tests.push({
                suite: 'Cluster Health',
                name: test.name,
                passed: false,
                error: error.message
            });
        }
    }

    // Test Suite 3: Broker Metrics
    console.log('\n\nTEST SUITE 3: Broker Performance Metrics');
    console.log('-'.repeat(40));

    const brokerTests = [
        {
            name: 'Broker Throughput Metrics',
            description: 'Verify all brokers report throughput',
            query: `FROM AwsMskBrokerSample 
                    SELECT average(provider.bytesInPerSec.Average) as 'bytesIn',
                           average(provider.messagesInPerSec.Average) as 'messagesIn'
                    WHERE provider.clusterName = 'strimzi-production-kafka' 
                    FACET provider.brokerId 
                    SINCE 30 minutes ago`,
            expectedResult: (result) => result && result.length === 3
        },
        {
            name: 'Request Handler Idle Check',
            description: 'Verify handler idle percentage > 90%',
            query: `FROM AwsMskBrokerSample 
                    SELECT average(provider.requestHandlerAvgIdlePercent.Average) as 'idle'
                    WHERE provider.clusterName = 'strimzi-production-kafka' 
                    SINCE 30 minutes ago`,
            expectedResult: (result) => result && result[0] && result[0]['idle'] > 90
        },
        {
            name: 'Latency Metrics Check',
            description: 'Verify fetch latency metrics exist',
            query: `FROM AwsMskBrokerSample 
                    SELECT average(provider.fetchConsumerTotalTimeMsMean.Average) as 'fetchLatency'
                    WHERE provider.clusterName = 'strimzi-production-kafka' 
                    SINCE 30 minutes ago`,
            expectedResult: (result) => result && result[0] && result[0]['fetchLatency'] !== null
        }
    ];

    for (const test of brokerTests) {
        console.log(`\n📋 ${test.name}`);
        console.log(`   ${test.description}`);
        try {
            const result = await queryNRQL(test.query);
            const passed = test.expectedResult(result);
            console.log(`   Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
            console.log(`   Data: ${JSON.stringify(result)}`);
            
            testResults.tests.push({
                suite: 'Broker Performance',
                name: test.name,
                passed,
                result
            });
        } catch (error) {
            console.log(`   Result: ❌ ERROR`);
            console.log(`   Error: ${error.message}`);
            testResults.tests.push({
                suite: 'Broker Performance',
                name: test.name,
                passed: false,
                error: error.message
            });
        }
    }

    // Test Suite 4: Entity GUID Validation
    console.log('\n\nTEST SUITE 4: Entity GUID Format Validation');
    console.log('-'.repeat(40));

    const guidTests = [
        {
            name: 'Cluster GUID Format',
            description: 'Verify cluster GUID follows format: {accountId}|INFRA|AWSMSKCLUSTER|{base64}',
            query: "FROM AwsMskClusterSample SELECT uniques(entity.guid) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 1 hour ago",
            expectedResult: (result) => {
                if (!result || !result[0] || !result[0]['uniques(entity.guid)']) return false;
                const guid = result[0]['uniques(entity.guid)'][0];
                const parts = guid.split('|');
                return parts.length === 4 && 
                       parts[0] === '123456789012' && 
                       parts[1] === 'INFRA' && 
                       parts[2] === 'AWSMSKCLUSTER';
            }
        },
        {
            name: 'Broker GUID Format',
            description: 'Verify broker GUIDs follow format: {accountId}|INFRA|AWSMSKBROKER|{base64}',
            query: "FROM AwsMskBrokerSample SELECT uniques(entity.guid) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 1 hour ago LIMIT 1",
            expectedResult: (result) => {
                if (!result || !result[0] || !result[0]['uniques(entity.guid)']) return false;
                const guids = result[0]['uniques(entity.guid)'];
                return guids.every(guid => {
                    const parts = guid.split('|');
                    return parts.length === 4 && 
                           parts[0] === '123456789012' && 
                           parts[1] === 'INFRA' && 
                           parts[2] === 'AWSMSKBROKER';
                });
            }
        }
    ];

    for (const test of guidTests) {
        console.log(`\n📋 ${test.name}`);
        console.log(`   ${test.description}`);
        try {
            const result = await queryNRQL(test.query);
            const passed = test.expectedResult(result);
            console.log(`   Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
            if (result && result[0] && result[0]['uniques(entity.guid)']) {
                console.log(`   GUIDs: ${result[0]['uniques(entity.guid)'].join(', ')}`);
            }
            
            testResults.tests.push({
                suite: 'GUID Validation',
                name: test.name,
                passed,
                result
            });
        } catch (error) {
            console.log(`   Result: ❌ ERROR`);
            console.log(`   Error: ${error.message}`);
            testResults.tests.push({
                suite: 'GUID Validation',
                name: test.name,
                passed: false,
                error: error.message
            });
        }
    }

    // Final Summary
    console.log('\n\n' + '='.repeat(80));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(80));

    const totalTests = testResults.tests.length;
    const passedTests = testResults.tests.filter(t => t.passed).length;
    const failedTests = totalTests - passedTests;
    const successRate = (passedTests / totalTests * 100).toFixed(1);

    console.log(`\n📊 Test Results:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${passedTests} ✅`);
    console.log(`   Failed: ${failedTests} ❌`);
    console.log(`   Success Rate: ${successRate}%`);

    // Group by suite
    const suites = {};
    testResults.tests.forEach(test => {
        if (!suites[test.suite]) {
            suites[test.suite] = { passed: 0, failed: 0 };
        }
        if (test.passed) {
            suites[test.suite].passed++;
        } else {
            suites[test.suite].failed++;
        }
    });

    console.log(`\n📁 Results by Suite:`);
    Object.entries(suites).forEach(([suite, results]) => {
        const status = results.failed === 0 ? '✅' : '❌';
        console.log(`   ${status} ${suite}: ${results.passed}/${results.passed + results.failed} passed`);
    });

    // Overall status
    const overallSuccess = failedTests === 0;
    console.log(`\n🎯 Overall Status: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    
    if (overallSuccess) {
        console.log('\n✨ MSK shim is working correctly! Data is being transformed and sent to New Relic.');
    } else {
        console.log('\n⚠️  Some tests failed. Check the detailed results above.');
    }

    // Save results
    const timestamp = Date.now();
    const filename = `strimzi-msk-verification-${timestamp}.json`;
    fs.writeFileSync(filename, JSON.stringify(testResults, null, 2));
    console.log(`\n📄 Detailed results saved to: ${filename}`);

    // Dashboard recommendation
    if (overallSuccess) {
        console.log('\n🎨 Next Steps:');
        console.log('   1. Use AWS MSK dashboard in New Relic UI');
        console.log('   2. Or create custom dashboard with: node deploy-strimzi-kafka-dashboard.js');
        console.log('   3. Navigate to: Message Queues & Streams > AWS > Kafka');
    }

    return overallSuccess;
}

// Run the verification
(async () => {
    try {
        const success = await verifyStrimziMSKData();
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    }
})();