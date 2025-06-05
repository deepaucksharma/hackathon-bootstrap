#!/usr/bin/env node

/**
 * AWS MSK New Relic Integration Test Runner
 * 
 * This script executes all verification tests from the test plan
 * and generates a comprehensive report.
 * 
 * Usage: node run-aws-msk-tests.js --apiKey=YOUR_API_KEY --accountId=YOUR_ACCOUNT_ID [--clusterName=CLUSTER_NAME]
 */

const https = require('https');

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
    const [key, value] = arg.split('=');
    acc[key.replace('--', '')] = value;
    return acc;
}, {});

const API_KEY = args.apiKey;
const ACCOUNT_ID = args.accountId;
const CLUSTER_NAME = args.clusterName;

if (!API_KEY || !ACCOUNT_ID) {
    console.error('Usage: node run-aws-msk-tests.js --apiKey=YOUR_API_KEY --accountId=YOUR_ACCOUNT_ID [--clusterName=CLUSTER_NAME]');
    process.exit(1);
}

// Test definitions organized by priority
const TEST_SUITES = {
    'P0_CRITICAL_UI_VISIBILITY': {
        name: 'Critical UI Visibility Tests',
        tests: [
            {
                id: '1.1',
                name: 'Verify Required UI Fields',
                query: `
                    SELECT 
                      count(*) as 'samples',
                      percentage(count(provider), count(*)) as 'hasProvider',
                      percentage(count(awsAccountId), count(*)) as 'hasAwsAccountId',
                      percentage(count(awsRegion), count(*)) as 'hasAwsRegion',
                      percentage(count(\`instrumentation.provider\`), count(*)) as 'hasInstrumentationProvider',
                      percentage(count(providerAccountId), count(*)) as 'hasProviderAccountId'
                    FROM AwsMskClusterSample
                    WHERE nr.accountId = ${ACCOUNT_ID}
                    ${CLUSTER_NAME ? `AND provider.clusterName = '${CLUSTER_NAME}'` : ''}
                    SINCE 1 hour ago
                `,
                validate: (result) => {
                    if (!result.samples || result.samples === 0) {
                        return { passed: false, message: 'No cluster samples found' };
                    }
                    const fields = ['hasProvider', 'hasAwsAccountId', 'hasAwsRegion', 'hasInstrumentationProvider', 'hasProviderAccountId'];
                    const missing = fields.filter(field => result[field] < 100);
                    if (missing.length > 0) {
                        return { 
                            passed: false, 
                            message: `Missing UI fields: ${missing.map(f => f + '=' + result[f] + '%').join(', ')}. Clusters won't appear in UI!`
                        };
                    }
                    return { passed: true, message: 'All UI fields present' };
                }
            },
            {
                id: '1.2',
                name: 'Verify Entity Type Format',
                query: `
                    FROM Metric
                    SELECT uniques(entity.type) as 'entityTypes', count(*) as 'metricCount'
                    WHERE entity.type LIKE '%KAFKA%'
                      AND nr.accountId = ${ACCOUNT_ID}
                    FACET entity.type
                    SINCE 1 hour ago
                `,
                validate: (results) => {
                    if (!Array.isArray(results) || results.length === 0) {
                        return { passed: false, message: 'No Kafka entity types found' };
                    }
                    const awsTypes = results.filter(r => r.facet[0] && r.facet[0].startsWith('AWS_KAFKA_'));
                    const nonAwsTypes = results.filter(r => r.facet[0] && r.facet[0].startsWith('KAFKA_') && !r.facet[0].startsWith('AWS_KAFKA_'));
                    
                    if (awsTypes.length === 0) {
                        return { passed: false, message: 'No AWS_KAFKA_* entity types found. Entities won\'t be recognized as AWS MSK!' };
                    }
                    if (nonAwsTypes.length > 0) {
                        return { 
                            passed: false, 
                            message: `Found non-AWS entity types: ${nonAwsTypes.map(r => r.facet[0]).join(', ')}. Should be AWS_KAFKA_*` 
                        };
                    }
                    return { passed: true, message: `Found AWS entity types: ${awsTypes.map(r => r.facet[0]).join(', ')}` };
                }
            },
            {
                id: '1.3',
                name: 'Verify Dimensional Metrics Exist',
                query: `
                    FROM Metric 
                    SELECT count(*) as 'dimensionalMetrics', uniques(metricName) as 'uniqueMetrics'
                    WHERE metricName LIKE 'kafka.%' 
                      AND entity.type IN ('AWS_KAFKA_CLUSTER', 'AWS_KAFKA_BROKER', 'AWS_KAFKA_TOPIC')
                      AND nr.accountId = ${ACCOUNT_ID}
                    SINCE 5 minutes ago
                `,
                validate: (result) => {
                    if (!result.dimensionalMetrics || result.dimensionalMetrics === 0) {
                        return { passed: false, message: 'No dimensional metrics found. Metrics won\'t be queryable!' };
                    }
                    return { 
                        passed: true, 
                        message: `Found ${result.dimensionalMetrics} dimensional metrics (${result.uniqueMetrics.length} unique types)` 
                    };
                }
            }
        ]
    },
    'P0_BASIC_DATA_AVAILABILITY': {
        name: 'Basic Data Availability Tests',
        tests: [
            {
                id: '2.1',
                name: 'Verify Event Samples Exist',
                query: `
                    SELECT 
                      filter(count(*), WHERE eventType() = 'AwsMskClusterSample') as 'clusterSamples',
                      filter(count(*), WHERE eventType() = 'AwsMskBrokerSample') as 'brokerSamples',
                      filter(count(*), WHERE eventType() = 'AwsMskTopicSample') as 'topicSamples'
                    FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
                    WHERE nr.accountId = ${ACCOUNT_ID}
                    ${CLUSTER_NAME ? `AND provider.clusterName = '${CLUSTER_NAME}'` : ''}
                    SINCE 1 hour ago
                `,
                validate: (result) => {
                    const missing = [];
                    if (!result.clusterSamples) missing.push('Cluster');
                    if (!result.brokerSamples) missing.push('Broker');
                    if (!result.topicSamples) missing.push('Topic');
                    
                    if (missing.length > 0) {
                        return { passed: false, message: `Missing samples for: ${missing.join(', ')}` };
                    }
                    return { 
                        passed: true, 
                        message: `Found samples - Clusters: ${result.clusterSamples}, Brokers: ${result.brokerSamples}, Topics: ${result.topicSamples}` 
                    };
                }
            },
            {
                id: '2.2',
                name: 'Check Data Freshness',
                query: `
                    SELECT 
                      max(timestamp) as 'latestData',
                      (now() - max(timestamp))/1000/60 as 'minutesSinceUpdate'
                    FROM AwsMskClusterSample
                    WHERE nr.accountId = ${ACCOUNT_ID}
                    ${CLUSTER_NAME ? `AND provider.clusterName = '${CLUSTER_NAME}'` : ''}
                    SINCE 1 hour ago
                `,
                validate: (result) => {
                    if (!result.latestData) {
                        return { passed: false, message: 'No data found in the last hour' };
                    }
                    if (result.minutesSinceUpdate > 10) {
                        return { passed: false, message: `Data is ${Math.round(result.minutesSinceUpdate)} minutes old (>10 min threshold)` };
                    }
                    return { passed: true, message: `Data is ${Math.round(result.minutesSinceUpdate)} minutes old` };
                }
            }
        ]
    },
    'P1_METRIC_COMPLETENESS': {
        name: 'Metric Completeness Tests',
        tests: [
            {
                id: '3.1',
                name: 'Verify Cluster Metrics',
                query: `
                    SELECT 
                      count(provider.activeControllerCount.Sum) as 'activeControllerMetric',
                      count(provider.offlinePartitionsCount.Sum) as 'offlinePartitionsMetric',
                      count(provider.globalPartitionCount.Average) as 'globalPartitionCount'
                    FROM AwsMskClusterSample 
                    WHERE nr.accountId = ${ACCOUNT_ID}
                    ${CLUSTER_NAME ? `AND provider.clusterName = '${CLUSTER_NAME}'` : ''}
                    SINCE 1 hour ago
                `,
                validate: (result) => {
                    const missing = [];
                    if (!result.activeControllerMetric) missing.push('activeControllerCount');
                    if (!result.offlinePartitionsMetric) missing.push('offlinePartitionsCount');
                    if (!result.globalPartitionCount) missing.push('globalPartitionCount');
                    
                    if (missing.length > 0) {
                        return { passed: false, message: `Missing cluster metrics: ${missing.join(', ')}` };
                    }
                    return { passed: true, message: 'All cluster metrics present' };
                }
            },
            {
                id: '3.2',
                name: 'Verify Broker Metrics',
                query: `
                    SELECT 
                      percentage(count(provider.bytesInPerSec.Average), count(*)) as 'hasBytesIn',
                      percentage(count(provider.bytesOutPerSec.Average), count(*)) as 'hasBytesOut',
                      percentage(count(provider.messagesInPerSec.Average), count(*)) as 'hasMessagesIn',
                      percentage(count(provider.underReplicatedPartitions.Sum), count(*)) as 'hasUnderReplicated'
                    FROM AwsMskBrokerSample 
                    WHERE nr.accountId = ${ACCOUNT_ID}
                    ${CLUSTER_NAME ? `AND provider.clusterName = '${CLUSTER_NAME}'` : ''}
                    SINCE 1 hour ago
                `,
                validate: (result) => {
                    const metrics = [
                        { name: 'bytesInPerSec', value: result.hasBytesIn },
                        { name: 'bytesOutPerSec', value: result.hasBytesOut },
                        { name: 'messagesInPerSec', value: result.hasMessagesIn },
                        { name: 'underReplicatedPartitions', value: result.hasUnderReplicated }
                    ];
                    
                    const incomplete = metrics.filter(m => m.value < 90);
                    if (incomplete.length > 0) {
                        return { 
                            passed: false, 
                            message: `Incomplete broker metrics: ${incomplete.map(m => `${m.name}=${m.value}%`).join(', ')}` 
                        };
                    }
                    return { passed: true, message: 'All broker metrics >90% complete' };
                }
            }
        ]
    },
    'P1_FEATURE_FUNCTIONALITY': {
        name: 'Feature Functionality Tests',
        tests: [
            {
                id: '5.1',
                name: 'Home Page Aggregation',
                query: `
                    SELECT 
                      nr.linkedAccountName as 'account',
                      uniqueCount(entity.guid) as 'clusters',
                      filter(uniqueCount(entity.guid), WHERE provider.offlinePartitionsCount.Sum > 0) as 'unhealthy'
                    FROM AwsMskClusterSample
                    WHERE nr.accountId = ${ACCOUNT_ID}
                    FACET nr.linkedAccountName
                    SINCE 1 hour ago
                `,
                validate: (results) => {
                    if (!Array.isArray(results) || results.length === 0) {
                        return { passed: false, message: 'No account aggregation data found' };
                    }
                    return { 
                        passed: true, 
                        message: `Found ${results.length} account(s) with clusters` 
                    };
                }
            },
            {
                id: '5.2',
                name: 'Time Series Data',
                query: `
                    SELECT sum(provider.bytesInPerSec.Average) as 'throughput'
                    FROM AwsMskBrokerSample
                    WHERE nr.accountId = ${ACCOUNT_ID}
                    ${CLUSTER_NAME ? `AND provider.clusterName = '${CLUSTER_NAME}'` : ''}
                    TIMESERIES 5 minutes
                    SINCE 1 hour ago
                `,
                validate: (results) => {
                    if (!Array.isArray(results) || results.length === 0) {
                        return { passed: false, message: 'No time series data available' };
                    }
                    const nonZeroPoints = results.filter(r => r.throughput > 0).length;
                    return { 
                        passed: true, 
                        message: `Found ${results.length} time series points (${nonZeroPoints} with data)` 
                    };
                }
            }
        ]
    },
    'P2_DATA_QUALITY': {
        name: 'Data Quality Tests',
        tests: [
            {
                id: '6.1',
                name: 'Check for Null Values',
                query: `
                    SELECT provider.clusterName,
                      CASE 
                        WHEN provider.activeControllerCount.Sum IS NULL THEN 'Missing Controller'
                        WHEN provider.activeControllerCount.Sum = 0 THEN 'No Active Controller'
                        ELSE 'OK'
                      END as 'status'
                    FROM AwsMskClusterSample 
                    WHERE nr.accountId = ${ACCOUNT_ID}
                      AND (provider.activeControllerCount.Sum IS NULL OR provider.activeControllerCount.Sum = 0)
                    ${CLUSTER_NAME ? `AND provider.clusterName = '${CLUSTER_NAME}'` : ''}
                    SINCE 1 hour ago
                `,
                validate: (results) => {
                    if (!results || (Array.isArray(results) && results.length === 0)) {
                        return { passed: true, message: 'No clusters with missing controller data' };
                    }
                    const issues = Array.isArray(results) ? results : [results];
                    return { 
                        passed: false, 
                        message: `Found ${issues.length} cluster(s) with controller issues` 
                    };
                }
            }
        ]
    },
    'P0_COMPREHENSIVE_HEALTH': {
        name: 'Comprehensive Health Check',
        tests: [
            {
                id: '10.1',
                name: 'Master System Validation',
                query: `
                    WITH 
                      ui_ready AS (
                        SELECT 
                          percentage(count(provider), count(*)) = 100 
                          AND percentage(count(awsAccountId), count(*)) = 100 as ready
                        FROM AwsMskClusterSample 
                        WHERE nr.accountId = ${ACCOUNT_ID}
                        SINCE 1 hour ago
                      ),
                      metrics_ready AS (
                        SELECT count(*) > 0 as ready
                        FROM Metric 
                        WHERE metricName LIKE 'kafka.%' 
                          AND nr.accountId = ${ACCOUNT_ID}
                        SINCE 5 minutes ago
                      ),
                      fresh_data AS (
                        SELECT (now() - max(timestamp))/1000/60 < 10 as ready
                        FROM AwsMskClusterSample 
                        WHERE nr.accountId = ${ACCOUNT_ID}
                        SINCE 1 hour ago
                      )
                    SELECT 
                      ui_ready.ready as 'uiReady',
                      metrics_ready.ready as 'metricsReady',
                      fresh_data.ready as 'dataFresh',
                      CASE 
                        WHEN ui_ready.ready AND metrics_ready.ready AND fresh_data.ready THEN 'PASS'
                        ELSE 'FAIL'
                      END as 'overallStatus'
                    FROM ui_ready, metrics_ready, fresh_data
                `,
                validate: (result) => {
                    const issues = [];
                    if (!result.uiReady) issues.push('UI fields not ready');
                    if (!result.metricsReady) issues.push('Dimensional metrics not ready');
                    if (!result.dataFresh) issues.push('Data is stale');
                    
                    if (result.overallStatus !== 'PASS') {
                        return { passed: false, message: `System not ready: ${issues.join(', ')}` };
                    }
                    return { passed: true, message: 'All systems operational' };
                }
            }
        ]
    }
};

// Execute NRQL query
async function executeQuery(query) {
    return new Promise((resolve, reject) => {
        const nrql = query.trim().replace(/\s+/g, ' ');
        const postData = JSON.stringify({ query: nrql });

        const options = {
            hostname: 'api.newrelic.com',
            path: `/graphql`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'API-Key': API_KEY,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const graphqlQuery = {
            query: `
                query($accountId: Int!, $nrqlQuery: Nrql!) {
                    actor {
                        account(id: $accountId) {
                            nrql(query: $nrqlQuery) {
                                results
                            }
                        }
                    }
                }
            `,
            variables: {
                accountId: parseInt(ACCOUNT_ID),
                nrqlQuery: nrql
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.errors) {
                        reject(new Error(response.errors[0].message));
                    } else {
                        const results = response.data?.actor?.account?.nrql?.results;
                        resolve(results);
                    }
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', reject);
        req.write(JSON.stringify(graphqlQuery));
        req.end();
    });
}

// Run a single test
async function runTest(test) {
    console.log(`\n  Running Test ${test.id}: ${test.name}`);
    
    try {
        const startTime = Date.now();
        const result = await executeQuery(test.query);
        const duration = Date.now() - startTime;
        
        const validation = test.validate(result);
        
        console.log(`    Status: ${validation.passed ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`    Message: ${validation.message}`);
        console.log(`    Duration: ${duration}ms`);
        
        return {
            ...test,
            passed: validation.passed,
            message: validation.message,
            duration,
            result
        };
    } catch (error) {
        console.log(`    Status: ❌ ERROR`);
        console.log(`    Error: ${error.message}`);
        
        return {
            ...test,
            passed: false,
            message: `Query execution failed: ${error.message}`,
            error: error.message
        };
    }
}

// Run all tests
async function runAllTests() {
    console.log('AWS MSK New Relic Integration Test Runner');
    console.log('========================================');
    console.log(`Account ID: ${ACCOUNT_ID}`);
    console.log(`Cluster: ${CLUSTER_NAME || 'All clusters'}`);
    console.log(`Started: ${new Date().toISOString()}\n`);

    const results = {
        summary: {
            total: 0,
            passed: 0,
            failed: 0,
            errors: 0
        },
        suites: {},
        startTime: new Date().toISOString()
    };

    // Run critical tests first, stop if they fail
    const criticalSuites = ['P0_CRITICAL_UI_VISIBILITY', 'P0_BASIC_DATA_AVAILABILITY'];
    
    for (const suiteName of Object.keys(TEST_SUITES)) {
        const suite = TEST_SUITES[suiteName];
        console.log(`\n${suite.name}`);
        console.log('='.repeat(suite.name.length));
        
        results.suites[suiteName] = {
            name: suite.name,
            tests: []
        };
        
        for (const test of suite.tests) {
            const testResult = await runTest(test);
            results.suites[suiteName].tests.push(testResult);
            results.summary.total++;
            
            if (testResult.passed) {
                results.summary.passed++;
            } else if (testResult.error) {
                results.summary.errors++;
            } else {
                results.summary.failed++;
            }
            
            // Stop if critical test fails
            if (criticalSuites.includes(suiteName) && !testResult.passed) {
                console.log('\n⚠️  Critical test failed! Stopping test execution.');
                console.log('   Fix critical issues before running remaining tests.');
                break;
            }
        }
        
        // Stop suite execution if critical suite had failures
        if (criticalSuites.includes(suiteName) && 
            results.suites[suiteName].tests.some(t => !t.passed)) {
            break;
        }
    }
    
    results.endTime = new Date().toISOString();
    results.summary.duration = Date.now() - Date.parse(results.startTime);
    
    // Print summary
    console.log('\n\nTest Summary');
    console.log('============');
    console.log(`Total Tests: ${results.summary.total}`);
    console.log(`Passed: ${results.summary.passed} (${Math.round(results.summary.passed/results.summary.total*100)}%)`);
    console.log(`Failed: ${results.summary.failed}`);
    console.log(`Errors: ${results.summary.errors}`);
    console.log(`Duration: ${Math.round(results.summary.duration/1000)}s`);
    
    // Print recommendations
    if (results.summary.failed > 0 || results.summary.errors > 0) {
        console.log('\n\nRecommendations');
        console.log('===============');
        
        // Check for specific issues
        const uiTest = results.suites.P0_CRITICAL_UI_VISIBILITY?.tests[0];
        if (uiTest && !uiTest.passed) {
            console.log('\n❗ CRITICAL: UI fields are missing. Clusters won\'t appear in the New Relic UI!');
            console.log('   Action: Check integration configuration for proper AWS field mapping.');
            console.log('   Ensure MSK_USE_DIMENSIONAL=true is set.');
        }
        
        const dimensionalTest = results.suites.P0_CRITICAL_UI_VISIBILITY?.tests[2];
        if (dimensionalTest && !dimensionalTest.passed) {
            console.log('\n❗ CRITICAL: No dimensional metrics found.');
            console.log('   Action: Verify the integration is configured to use dimensional metrics.');
            console.log('   Check that the integration version supports AWS MSK.');
        }
        
        const freshnessTest = results.suites.P0_BASIC_DATA_AVAILABILITY?.tests[1];
        if (freshnessTest && !freshnessTest.passed) {
            console.log('\n⚠️  WARNING: Data is stale.');
            console.log('   Action: Check if the integration is running and has network access to brokers.');
            console.log('   Verify JMX is enabled and accessible.');
        }
    } else {
        console.log('\n✅ All tests passed! AWS MSK integration is working correctly.');
    }
    
    // Save results to file
    const fileName = `msk-test-results-${Date.now()}.json`;
    require('fs').writeFileSync(fileName, JSON.stringify(results, null, 2));
    console.log(`\nDetailed results saved to: ${fileName}`);
    
    // Exit with appropriate code
    process.exit(results.summary.failed > 0 || results.summary.errors > 0 ? 1 : 0);
}

// Execute tests
runAllTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});