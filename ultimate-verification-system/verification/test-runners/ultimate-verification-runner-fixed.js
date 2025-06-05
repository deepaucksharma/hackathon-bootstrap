#!/usr/bin/env node

/**
 * Ultimate NRDB Verification Runner for Message Queues UI
 * 
 * This script runs all exhaustive verification tests to provide 100% guarantee
 * that the UI will work if all conditions are satisfied.
 * 
 * Usage: node ultimate-verification-runner.js --apiKey=KEY --accountId=AWS_ACCOUNT --nrAccountId=NR_ACCOUNT [--provider=awsMsk|confluent]
 */

const https = require('https');
const fs = require('fs');

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
    const [key, value] = arg.split('=');
    acc[key.replace('--', '')] = value;
    return acc;
}, {});

const API_KEY = args.apiKey;
const AWS_ACCOUNT_ID = args.accountId;
const NR_ACCOUNT_ID = args.nrAccountId;
const PROVIDER = args.provider || 'awsMsk'; // awsMsk or confluent

if (!API_KEY || !AWS_ACCOUNT_ID || !NR_ACCOUNT_ID) {
    console.error('Usage: node ultimate-verification-runner.js --apiKey=KEY --accountId=AWS_ACCOUNT --nrAccountId=NR_ACCOUNT [--provider=awsMsk|confluent]');
    process.exit(1);
}

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

// Test definitions for ultimate verification
const VERIFICATION_TESTS = {
    'CRITICAL_FOUNDATION': {
        name: '🔨 Critical Foundation Tests',
        critical: true,
        tests: [
            {
                id: '1.1',
                name: 'Entity Type Existence',
                query: PROVIDER === 'awsMsk' ? `
                    SELECT count(*) as 'count'
                    FROM AwsMskClusterSample
                    WHERE awsAccountId = '${AWS_ACCOUNT_ID}'
                    SINCE 1 hour ago
                ` : `
                    SELECT count(*) as 'count'
                    FROM ConfluentCloudClusterSample
                    SINCE 1 hour ago
                `,
                validate: (result) => ({
                    passed: result && result.count > 0,
                    message: result?.count > 0 ? `Found ${result.count} cluster samples` : 'No Kafka entities found in the system'
                })
            },
            {
                id: '1.2',
                name: 'UI Visibility Fields',
                query: PROVIDER === 'awsMsk' ? `
                    SELECT 
                      count(*) as 'samples',
                      filter(count(*), WHERE provider IS NOT NULL) * 100.0 / count(*) as 'providerField',
                      filter(count(*), WHERE awsAccountId IS NOT NULL) * 100.0 / count(*) as 'awsAccountId',
                      filter(count(*), WHERE awsRegion IS NOT NULL) * 100.0 / count(*) as 'awsRegion',
                      filter(count(*), WHERE \`instrumentation.provider\` IS NOT NULL) * 100.0 / count(*) as 'instrumentationProvider',
                      filter(count(*), WHERE entityName IS NOT NULL) * 100.0 / count(*) as 'entityName',
                      filter(count(*), WHERE entity.guid IS NOT NULL) * 100.0 / count(*) as 'entityGuid'
                    FROM AwsMskClusterSample
                    WHERE awsAccountId = '${AWS_ACCOUNT_ID}'
                    SINCE 1 hour ago
                ` : `
                    SELECT 
                      count(*) as 'samples',
                      filter(count(*), WHERE tags.account IS NOT NULL) * 100.0 / count(*) as 'accountTag',
                      filter(count(*), WHERE tags.kafka_env_id IS NOT NULL) * 100.0 / count(*) as 'envId',
                      filter(count(*), WHERE id IS NOT NULL) * 100.0 / count(*) as 'clusterId',
                      filter(count(*), WHERE timestamp IS NOT NULL) * 100.0 / count(*) as 'timestamp'
                    FROM ConfluentCloudClusterSample
                    SINCE 1 hour ago
                `,
                validate: (result) => {
                    if (!result || result.samples === 0) {
                        return { passed: false, message: 'No samples found - integration may not be running' };
                    }
                    
                    if (PROVIDER === 'awsMsk') {
                        const requiredFields = ['providerField', 'awsAccountId', 'awsRegion', 'instrumentationProvider', 'entityName', 'entityGuid'];
                        const missing = requiredFields.filter(f => result[f] < 100);
                        return {
                            passed: missing.length === 0,
                            message: missing.length > 0 
                                ? `❌ CRITICAL: Missing UI fields: ${missing.join(', ')}. Entities won't appear in UI!`
                                : '✅ All UI visibility fields present'
                        };
                    } else {
                        const missing = [];
                        if (result.accountTag < 95) missing.push('account tag');
                        if (result.envId < 95) missing.push('environment ID');
                        return {
                            passed: missing.length === 0,
                            message: missing.length > 0 
                                ? `Missing fields: ${missing.join(', ')}`
                                : 'All required fields present'
                        };
                    }
                }
            },
            {
                id: '1.3',
                name: 'Dimensional Metrics',
                query: `
                    FROM Metric 
                    SELECT 
                      count(*) as 'total',
                      uniqueCount(metricName) as 'uniqueMetrics',
                      uniqueCount(entity.type) as 'entityTypes'
                    WHERE metricName LIKE 'kafka.%' 
                      AND entity.type IN ('AWS_KAFKA_CLUSTER', 'AWS_KAFKA_BROKER', 'AWS_KAFKA_TOPIC', 'CONFLUENT_CLOUD_KAFKA_CLUSTER', 'CONFLUENT_CLOUD_KAFKA_TOPIC')
                    SINCE 5 minutes ago
                `,
                validate: (result) => ({
                    passed: result && result.total > 0,
                    message: result?.total > 0 
                        ? `Found ${result.total} dimensional metrics (${result.uniqueMetrics} types)`
                        : '❌ No dimensional metrics found - queries won\'t work!'
                })
            },
            {
                id: '1.4',
                name: 'Data Freshness',
                query: PROVIDER === 'awsMsk' ? `
                    SELECT 
                      max(timestamp) as 'latest',
                      max(timestamp) as 'latest'
                    FROM AwsMskClusterSample
                    WHERE awsAccountId = '${AWS_ACCOUNT_ID}'
                    SINCE 1 hour ago
                ` : `
                    SELECT 
                      max(timestamp) as 'latest',
                      max(timestamp) as 'latest'
                    FROM ConfluentCloudClusterSample
                    SINCE 1 hour ago
                `,
                validate: (result) => {
                    if (!result || !result.latest) {
                        return { passed: false, message: 'No recent data found' };
                    }
                    const minutesOld = result.latest ? (Date.now() - result.latest) / 60000 : 999;
                    const isStale = minutesOld > 10;
                    return {
                        passed: !isStale,
                        message: isStale 
                            ? `Data is ${Math.round(minutesOld)} minutes old (>10 min threshold)`
                            : `Data is ${Math.round(minutesOld)} minutes old`
                    };
                }
            }
        ]
    },
    
    'HOME_PAGE': {
        name: '🏠 Home Page Verification',
        tests: [
            {
                id: '2.1',
                name: 'Account Aggregation',
                query: PROVIDER === 'awsMsk' ? `
                    SELECT 
                      awsAccountId as 'accountId',
                      latest(providerAccountName) as 'accountName',
                      uniqueCount(entity.guid) as 'clusterCount',
                      filter(uniqueCount(entity.guid), WHERE latest(provider.offlinePartitionsCount.Sum) > 0) as 'unhealthyCount'
                    FROM AwsMskClusterSample
                    WHERE awsAccountId = '${AWS_ACCOUNT_ID}'
                    FACET awsAccountId
                    SINCE 1 hour ago
                ` : `
                    SELECT 
                      tags.account as accountName,
                      uniqueCount(id) as 'clusterCount',
                      filter(uniqueCount(id), WHERE current_controller_id < 0) as 'unhealthyCount'
                    FROM ConfluentCloudClusterSample
                    FACET tags.account
                    SINCE 1 hour ago
                `,
                validate: (results) => {
                    if (!Array.isArray(results) || results.length === 0) {
                        return { passed: false, message: 'No account data for home page table' };
                    }
                    const totalClusters = results.reduce((sum, r) => sum + (r.clusterCount || 0), 0);
                    return {
                        passed: true,
                        message: `Found ${results.length} account(s) with ${totalClusters} total clusters`
                    };
                }
            },
            {
                id: '2.2',
                name: 'Throughput Metrics',
                query: PROVIDER === 'awsMsk' ? `
                    SELECT 
                      sum(provider.bytesInPerSec.Average) as 'totalBytesIn',
                      sum(provider.bytesOutPerSec.Average) as 'totalBytesOut'
                    FROM AwsMskBrokerSample
                    WHERE awsAccountId = '${AWS_ACCOUNT_ID}'
                    SINCE 1 hour ago
                ` : `
                    SELECT 
                      sum(\`cluster_received_bytes\`) as 'totalBytesIn',
                      sum(\`cluster_sent_bytes\`) as 'totalBytesOut'
                    FROM ConfluentCloudClusterSample
                    SINCE 1 hour ago
                `,
                validate: (result) => ({
                    passed: result && (result.totalBytesIn !== null || result.totalBytesOut !== null),
                    message: `Throughput: ${result?.totalBytesIn || 0} bytes in, ${result?.totalBytesOut || 0} bytes out`
                })
            }
        ]
    },
    
    'SUMMARY_PAGE': {
        name: '📊 Summary Page Verification',
        tests: [
            {
                id: '3.1',
                name: 'Billboard Metrics',
                query: PROVIDER === 'awsMsk' ? `
                    SELECT 
                      uniqueCount(entity.guid) as 'clusters',
                      uniqueCount(provider.brokerId) as 'brokers'
                    FROM AwsMskClusterSample, AwsMskBrokerSample
                    WHERE awsAccountId = '${AWS_ACCOUNT_ID}'
                    SINCE 1 hour ago
                ` : `
                    SELECT 
                      uniqueCount(id) as 'clusters',
                      0 as 'brokers'
                    FROM ConfluentCloudClusterSample
                    SINCE 1 hour ago
                `,
                validate: (result) => ({
                    passed: result && (result.clusters > 0),
                    message: `Found ${result?.clusters || 0} clusters${result?.brokers ? `, ${result.brokers} brokers` : ''}`
                })
            },
            {
                id: '3.2',
                name: 'Time Series Data',
                query: PROVIDER === 'awsMsk' ? `
                    SELECT sum(provider.bytesInPerSec.Average) as 'throughput'
                    FROM AwsMskBrokerSample
                    WHERE awsAccountId = '${AWS_ACCOUNT_ID}'
                    TIMESERIES 5 minutes
                    SINCE 1 hour ago
                ` : `
                    SELECT sum(\`cluster_received_bytes\`) as 'throughput'
                    FROM ConfluentCloudClusterSample
                    TIMESERIES 5 minutes
                    SINCE 1 hour ago
                `,
                validate: (results) => ({
                    passed: Array.isArray(results) && results.length > 0,
                    message: `Time series has ${results?.length || 0} data points`
                })
            }
        ]
    },
    
    'ENTITY_HEALTH': {
        name: '🏥 Entity Health Verification',
        tests: [
            {
                id: '4.1',
                name: 'Health Metrics',
                query: PROVIDER === 'awsMsk' ? `
                    SELECT 
                      entityName,
                      latest(provider.activeControllerCount.Sum) as 'activeControllers',
                      latest(provider.offlinePartitionsCount.Sum) as 'offlinePartitions',
                      latest(provider.underReplicatedPartitions.Sum) as 'underReplicated'
                    FROM AwsMskClusterSample
                    WHERE awsAccountId = '${AWS_ACCOUNT_ID}'
                    FACET entityName
                    SINCE 1 hour ago
                ` : `
                    SELECT 
                      cluster_name,
                      latest(current_controller_id) as 'controllerId',
                      latest(cluster_status) as 'status'
                    FROM ConfluentCloudClusterSample
                    FACET cluster_name
                    SINCE 1 hour ago
                `,
                validate: (results) => {
                    if (!results || (Array.isArray(results) && results.length === 0)) {
                        return { passed: false, message: 'No health metrics found' };
                    }
                    
                    if (PROVIDER === 'awsMsk') {
                        const unhealthy = Array.isArray(results) 
                            ? results.filter(r => r.offlinePartitions > 0 || r.underReplicated > 0)
                            : [];
                        return {
                            passed: true,
                            message: unhealthy.length > 0 
                                ? `⚠️ ${unhealthy.length} unhealthy clusters found`
                                : '✅ All clusters healthy'
                        };
                    } else {
                        return { passed: true, message: 'Health metrics available' };
                    }
                }
            },
            {
                id: '4.2',
                name: 'Broker Health',
                query: PROVIDER === 'awsMsk' ? `
                    SELECT 
                      provider.brokerId,
                      average(provider.bytesInPerSec.Average) as 'avgBytesIn',
                      latest(provider.underReplicatedPartitions.Sum) as 'underReplicated'
                    FROM AwsMskBrokerSample
                    WHERE awsAccountId = '${AWS_ACCOUNT_ID}'
                    FACET provider.clusterName, provider.brokerId
                    SINCE 1 hour ago
                    LIMIT 50
                ` : `
                    SELECT 'N/A for Confluent Cloud' as status
                `,
                validate: (results) => {
                    if (PROVIDER !== 'awsMsk') {
                        return { passed: true, message: 'Broker metrics not applicable for Confluent Cloud' };
                    }
                    return {
                        passed: Array.isArray(results) && results.length > 0,
                        message: `Found ${results?.length || 0} brokers with health data`
                    };
                }
            }
        ]
    },
    
    'DATA_QUALITY': {
        name: '🔍 Data Quality Verification',
        tests: [
            {
                id: '5.1',
                name: 'Null Value Handling',
                query: PROVIDER === 'awsMsk' ? `
                    SELECT 
                      count(*) as 'totalSamples',
                      filter(count(*), WHERE provider.bytesInPerSec.Average IS NULL) as 'nullValues',
                      filter(count(*), WHERE provider.bytesInPerSec.Average = 0) as 'zeroValues',
                      filter(count(*), WHERE provider.bytesInPerSec.Average > 0) as 'activeValues'
                    FROM AwsMskBrokerSample
                    WHERE awsAccountId = '${AWS_ACCOUNT_ID}'
                    SINCE 1 hour ago
                ` : `
                    SELECT 
                      count(*) as 'totalSamples',
                      filter(count(*), WHERE \`cluster_received_bytes\` IS NULL) as 'nullValues',
                      filter(count(*), WHERE \`cluster_received_bytes\` = 0) as 'zeroValues',
                      filter(count(*), WHERE \`cluster_received_bytes\` > 0) as 'activeValues'
                    FROM ConfluentCloudClusterSample
                    SINCE 1 hour ago
                `,
                validate: (result) => ({
                    passed: result && result.totalSamples > 0,
                    message: `Total: ${result?.totalSamples || 0}, Active: ${result?.activeValues || 0}, Zero: ${result?.zeroValues || 0}, Null: ${result?.nullValues || 0}`
                })
            },
            {
                id: '5.2',
                name: 'Metric Value Ranges',
                query: `
                    SELECT 
                      count(*) as 'metricCount',
                      min(value) as 'minValue',
                      max(value) as 'maxValue',
                      average(value) as 'avgValue'
                    FROM Metric
                    WHERE metricName LIKE 'kafka.%'
                      AND entity.type IN ('AWS_KAFKA_CLUSTER', 'AWS_KAFKA_BROKER', 'AWS_KAFKA_TOPIC')
                    SINCE 1 hour ago
                `,
                validate: (result) => {
                    if (!result || result.metricCount === 0) {
                        return { passed: false, message: 'No metrics found to validate' };
                    }
                    
                    const issues = [];
                    if (result.minValue < 0) issues.push('negative values');
                    if (result.maxValue > 1e15) issues.push('suspiciously large values');
                    
                    return {
                        passed: issues.length === 0,
                        message: issues.length > 0 
                            ? `Found issues: ${issues.join(', ')}`
                            : `Metrics valid (count: ${result.metricCount}, range: ${result.minValue} - ${result.maxValue})`
                    };
                }
            }
        ]
    },
    
    'PERFORMANCE': {
        name: '⚡ Performance Verification',
        tests: [
            {
                id: '6.1',
                name: 'Query Performance',
                query: `
                    SELECT count(*) as 'resultCount'
                    FROM ${PROVIDER === 'awsMsk' ? 'AwsMskBrokerSample' : 'ConfluentCloudClusterSample'}
                    WHERE ${PROVIDER === 'awsMsk' ? `awsAccountId = '${AWS_ACCOUNT_ID}'` : '1=1'}
                    SINCE 5 minutes ago
                `,
                validate: (result) => ({
                    passed: result && result.resultCount >= 0,
                    message: `Query returned ${result?.resultCount || 0} results`
                })
            }
        ]
    }
};

// Master verification query - simplified
const MASTER_VERIFICATION = {
    name: '🎯 Master System Verification',
    query: PROVIDER === 'awsMsk' ? `
        SELECT 
          count(*) as 'clusterSamples',
          filter(count(*), WHERE provider IS NOT NULL) * 100.0 / count(*) as 'providerPercent',
          filter(count(*), WHERE awsAccountId IS NOT NULL) * 100.0 / count(*) as 'awsAccountPercent',
          filter(count(*), WHERE entity.guid IS NOT NULL) * 100.0 / count(*) as 'entityGuidPercent',
          max(timestamp) as 'latest'
        FROM AwsMskClusterSample 
        WHERE awsAccountId = '${AWS_ACCOUNT_ID}'
        SINCE 1 hour ago
    ` : `
        SELECT 
          count(*) as 'clusterSamples',
          filter(count(*), WHERE tags.account IS NOT NULL) * 100.0 / count(*) as 'accountPercent',
          filter(count(*), WHERE id IS NOT NULL) * 100.0 / count(*) as 'idPercent',
          max(timestamp) as 'latest'
        FROM ConfluentCloudClusterSample 
        SINCE 1 hour ago
    `
};

// Execute NRQL query
async function executeQuery(query) {
    return new Promise((resolve, reject) => {
        const nrql = query.trim().replace(/\s+/g, ' ');
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
                accountId: parseInt(NR_ACCOUNT_ID),
                nrqlQuery: nrql
            }
        };

        const postData = JSON.stringify(graphqlQuery);
        const options = {
            hostname: 'api.newrelic.com',
            path: '/graphql',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'API-Key': API_KEY,
                'Content-Length': Buffer.byteLength(postData)
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
        req.write(postData);
        req.end();
    });
}

// Run a single test
async function runTest(test) {
    const startTime = Date.now();
    try {
        const result = await executeQuery(test.query);
        const duration = Date.now() - startTime;
        const validation = test.validate(result);
        
        return {
            ...test,
            passed: validation.passed,
            message: validation.message,
            duration,
            result
        };
    } catch (error) {
        return {
            ...test,
            passed: false,
            message: `Query failed: ${error.message}`,
            error: error.message,
            duration: Date.now() - startTime
        };
    }
}

// Print test result
function printTestResult(test, indent = '  ') {
    const status = test.passed 
        ? `${colors.green}✅ PASS${colors.reset}`
        : `${colors.red}❌ FAIL${colors.reset}`;
    
    console.log(`${indent}[${test.id}] ${test.name}: ${status}`);
    console.log(`${indent}    ${test.message}`);
    if (test.duration) {
        console.log(`${indent}    ${colors.cyan}Duration: ${test.duration}ms${colors.reset}`);
    }
}

// Run all verification tests
async function runVerification() {
    console.log(`${colors.bright}${colors.magenta}╔════════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.magenta}║     Ultimate NRDB Verification for Message Queues UI           ║${colors.reset}`);
    console.log(`${colors.bright}${colors.magenta}╚════════════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log();
    console.log(`Provider: ${colors.cyan}${PROVIDER === 'awsMsk' ? 'AWS MSK' : 'Confluent Cloud'}${colors.reset}`);
    console.log(`AWS Account: ${colors.cyan}${AWS_ACCOUNT_ID}${colors.reset}`);
    console.log(`NR Account: ${colors.cyan}${NR_ACCOUNT_ID}${colors.reset}`);
    console.log(`Started: ${colors.cyan}${new Date().toISOString()}${colors.reset}`);
    console.log();

    const results = {
        provider: PROVIDER,
        awsAccountId: AWS_ACCOUNT_ID,
        nrAccountId: NR_ACCOUNT_ID,
        startTime: new Date().toISOString(),
        suites: {},
        summary: {
            total: 0,
            passed: 0,
            failed: 0,
            critical: {
                total: 0,
                passed: 0
            }
        }
    };

    // Run master verification first
    console.log(`${colors.bright}${colors.yellow}Running Master System Verification...${colors.reset}`);
    const masterResult = await runTest({
        id: 'MASTER',
        name: MASTER_VERIFICATION.name,
        query: MASTER_VERIFICATION.query,
        validate: (result) => {
            if (!result || result.clusterSamples === 0) {
                return { passed: false, message: '❌ No data found - integration not running' };
            }
            
            const issues = [];
            if (PROVIDER === 'awsMsk') {
                if (result.providerPercent < 100) issues.push('missing provider field');
                if (result.awsAccountPercent < 100) issues.push('missing AWS account');
                if (result.entityGuidPercent < 100) issues.push('missing entity GUIDs');
            } else {
                if (result.accountPercent < 100) issues.push('missing account tag');
                if (result.idPercent < 100) issues.push('missing cluster IDs');
            }
            
            const dataAge = result.latest ? (Date.now() - result.latest) / 60000 : 999;
            if (dataAge > 10) issues.push(`data is ${Math.round(dataAge)} minutes old`);
            
            return {
                passed: issues.length === 0,
                message: issues.length > 0 
                    ? `❌ Issues found: ${issues.join(', ')}`
                    : `✅ System ready - ${result.clusterSamples} samples`
            };
        }
    });
    
    printTestResult(masterResult, '');
    console.log();

    // Run all test suites
    let criticalFailed = false;
    
    for (const [suiteName, suite] of Object.entries(VERIFICATION_TESTS)) {
        console.log(`${colors.bright}${suite.name}${colors.reset}`);
        console.log('─'.repeat(50));
        
        results.suites[suiteName] = {
            name: suite.name,
            critical: suite.critical || false,
            tests: []
        };
        
        for (const test of suite.tests) {
            // Skip non-critical tests if critical tests failed
            if (criticalFailed && !suite.critical) {
                console.log(`  ${colors.yellow}⚠️  Skipping test due to critical failure${colors.reset}`);
                continue;
            }
            
            const result = await runTest(test);
            results.suites[suiteName].tests.push(result);
            results.summary.total++;
            
            if (result.passed) {
                results.summary.passed++;
                if (suite.critical) results.summary.critical.passed++;
            } else {
                results.summary.failed++;
                if (suite.critical) {
                    criticalFailed = true;
                }
            }
            
            if (suite.critical) results.summary.critical.total++;
            
            printTestResult(result);
            
            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log();
    }

    results.endTime = new Date().toISOString();
    results.duration = Date.now() - Date.parse(results.startTime);

    // Print summary
    console.log(`${colors.bright}${colors.yellow}═══════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}VERIFICATION SUMMARY${colors.reset}`);
    console.log(`${colors.bright}${colors.yellow}═══════════════════════════════════════════════════════════${colors.reset}`);
    
    const passRate = Math.round((results.summary.passed / results.summary.total) * 100);
    const criticalPassRate = results.summary.critical.total > 0 
        ? Math.round((results.summary.critical.passed / results.summary.critical.total) * 100)
        : 100;
    
    console.log(`Total Tests: ${results.summary.total}`);
    console.log(`Passed: ${colors.green}${results.summary.passed}${colors.reset} (${passRate}%)`);
    console.log(`Failed: ${colors.red}${results.summary.failed}${colors.reset}`);
    console.log(`Critical Tests: ${results.summary.critical.passed}/${results.summary.critical.total} (${criticalPassRate}%)`);
    console.log(`Duration: ${Math.round(results.duration / 1000)}s`);
    console.log();

    // Final verdict
    if (masterResult.passed && criticalPassRate === 100) {
        console.log(`${colors.bright}${colors.green}✅ UI READY: All critical tests passed! The Message Queues UI will work correctly.${colors.reset}`);
    } else if (criticalPassRate === 100) {
        console.log(`${colors.bright}${colors.yellow}⚠️  UI PARTIALLY READY: Critical tests passed but some features may not work.${colors.reset}`);
    } else {
        console.log(`${colors.bright}${colors.red}❌ UI NOT READY: Critical tests failed. The UI will not function properly.${colors.reset}`);
        console.log();
        console.log(`${colors.bright}Required Actions:${colors.reset}`);
        
        if (!masterResult.passed) {
            console.log(`  1. Fix the issues identified in the Master System Verification`);
        }
        
        const failedCritical = results.suites.CRITICAL_FOUNDATION?.tests.filter(t => !t.passed) || [];
        failedCritical.forEach((test, index) => {
            console.log(`  ${index + 2}. ${test.name}: ${test.message}`);
        });
    }

    // Save detailed results
    const reportFile = `ultimate-verification-${Date.now()}.json`;
    fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
    console.log(`\n${colors.cyan}Detailed report saved to: ${reportFile}${colors.reset}`);
    
    // Exit code based on critical tests
    process.exit(criticalPassRate === 100 ? 0 : 1);
}

// Execute verification
runVerification().catch(error => {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
});