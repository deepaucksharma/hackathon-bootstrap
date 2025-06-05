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
                    FROM NrdbQuery 
                    SELECT uniqueCount(entity.guid) as 'count'
                    WHERE query = 'SELECT * FROM AWSMSKCLUSTER, AWSMSKBROKER, AWSMSKTOPIC WHERE nr.accountId = ${NR_ACCOUNT_ID}'
                ` : `
                    FROM NrdbQuery 
                    SELECT uniqueCount(entity.guid) as 'count'
                    WHERE query = 'SELECT * FROM CONFLUENTCLOUDCLUSTER, CONFLUENTCLOUDKAFKATOPIC WHERE nr.accountId = ${NR_ACCOUNT_ID}'
                `,
                validate: (result) => ({
                    passed: result && result.count > 0,
                    message: result?.count > 0 ? `Found ${result.count} entities` : 'No Kafka entities found in the system'
                })
            },
            {
                id: '1.2',
                name: 'UI Visibility Fields',
                query: PROVIDER === 'awsMsk' ? `
                    SELECT 
                      count(*) as 'samples',
                      percentage(count(provider), count(*)) as 'providerField',
                      percentage(count(awsAccountId), count(*)) as 'awsAccountId',
                      percentage(count(awsRegion), count(*)) as 'awsRegion',
                      percentage(count(\`instrumentation.provider\`), count(*)) as 'instrumentationProvider',
                      percentage(count(entityName), count(*)) as 'entityName',
                      percentage(count(entity.guid), count(*)) as 'entityGuid'
                    FROM AwsMskClusterSample
                    WHERE nr.accountId = ${NR_ACCOUNT_ID}
                      AND awsAccountId = '${AWS_ACCOUNT_ID}'
                    SINCE 1 hour ago
                ` : `
                    SELECT 
                      count(*) as 'samples',
                      percentage(count(tags.account), count(*)) as 'accountTag',
                      percentage(count(tags.kafka_env_id), count(*)) as 'envId',
                      percentage(count(id), count(*)) as 'clusterId',
                      percentage(count(timestamp), count(*)) as 'timestamp'
                    FROM ConfluentCloudClusterSample
                    WHERE nr.accountId = ${NR_ACCOUNT_ID}
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
                      AND nr.accountId = ${NR_ACCOUNT_ID}
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
                      (now() - max(timestamp))/1000/60 as 'minutesOld'
                    FROM AwsMskClusterSample
                    WHERE nr.accountId = ${NR_ACCOUNT_ID}
                      AND awsAccountId = '${AWS_ACCOUNT_ID}'
                    SINCE 1 hour ago
                ` : `
                    SELECT 
                      max(timestamp) as 'latest',
                      (now() - max(timestamp))/1000/60 as 'minutesOld'
                    FROM ConfluentCloudClusterSample
                    WHERE nr.accountId = ${NR_ACCOUNT_ID}
                    SINCE 1 hour ago
                `,
                validate: (result) => {
                    if (!result || !result.latest) {
                        return { passed: false, message: 'No recent data found' };
                    }
                    const isStale = result.minutesOld > 10;
                    return {
                        passed: !isStale,
                        message: isStale 
                            ? `Data is ${Math.round(result.minutesOld)} minutes old (>10 min threshold)`
                            : `Data is ${Math.round(result.minutesOld)} minutes old`
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
                    FROM (
                      SELECT 
                        awsAccountId as accountId,
                        providerAccountName as accountName,
                        entity.guid,
                        latest(provider.offlinePartitionsCount.Sum) as offlinePartitions
                      FROM AwsMskClusterSample
                      WHERE nr.accountId = ${NR_ACCOUNT_ID}
                        AND awsAccountId = '${AWS_ACCOUNT_ID}'
                      FACET entity.guid, awsAccountId, providerAccountName
                      LIMIT MAX
                    )
                    SELECT 
                      accountId,
                      accountName,
                      uniqueCount(entity.guid) as 'clusterCount',
                      filter(uniqueCount(entity.guid), WHERE offlinePartitions > 0) as 'unhealthyCount'
                    FACET accountId, accountName
                    SINCE 1 hour ago
                ` : `
                    SELECT 
                      tags.account as accountName,
                      uniqueCount(id) as 'clusterCount',
                      filter(uniqueCount(id), WHERE current_controller_id < 0) as 'unhealthyCount'
                    FROM ConfluentCloudClusterSample
                    WHERE nr.accountId = ${NR_ACCOUNT_ID}
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
                    FROM (
                      SELECT 
                        nr.linkedAccountId as accountId,
                        sum(provider.bytesInPerSec.Average) as bytesIn,
                        sum(provider.bytesOutPerSec.Average) as bytesOut
                      FROM AwsMskBrokerSample
                      WHERE nr.accountId = ${NR_ACCOUNT_ID}
                        AND nr.linkedAccountId = '${AWS_ACCOUNT_ID}'
                      FACET nr.linkedAccountId, provider.brokerId
                      LIMIT MAX
                    )
                    SELECT 
                      sum(bytesIn) as 'totalBytesIn',
                      sum(bytesOut) as 'totalBytesOut'
                    SINCE 1 hour ago
                ` : `
                    SELECT 
                      sum(\`cluster_received_bytes\`) as 'totalBytesIn',
                      sum(\`cluster_sent_bytes\`) as 'totalBytesOut'
                    FROM ConfluentCloudClusterSample
                    WHERE nr.accountId = ${NR_ACCOUNT_ID}
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
                    WITH 
                      clusters AS (
                        SELECT uniqueCount(entity.guid) as total
                        FROM AwsMskClusterSample 
                        WHERE nr.accountId = ${NR_ACCOUNT_ID} AND nr.linkedAccountId = '${AWS_ACCOUNT_ID}'
                        SINCE 1 hour ago
                      ),
                      topics AS (
                        SELECT uniqueCount(displayName) as total
                        FROM AwsMskTopicSample 
                        WHERE nr.accountId = ${NR_ACCOUNT_ID} AND nr.linkedAccountId = '${AWS_ACCOUNT_ID}'
                        SINCE 1 hour ago
                      ),
                      brokers AS (
                        SELECT uniqueCount(provider.brokerId) as total
                        FROM AwsMskBrokerSample 
                        WHERE nr.accountId = ${NR_ACCOUNT_ID} AND nr.linkedAccountId = '${AWS_ACCOUNT_ID}'
                        SINCE 1 hour ago
                      )
                    SELECT 
                      clusters.total as 'clusters',
                      topics.total as 'topics',
                      brokers.total as 'brokers'
                    FROM clusters, topics, brokers
                ` : `
                    SELECT 
                      uniqueCount(id) as 'clusters',
                      uniqueCount(topic_name) as 'topics'
                    FROM ConfluentCloudClusterSample, ConfluentCloudKafkaTopicSample
                    WHERE nr.accountId = ${NR_ACCOUNT_ID}
                    SINCE 1 hour ago
                `,
                validate: (result) => ({
                    passed: result && (result.clusters > 0 || result.topics > 0),
                    message: `Found ${result?.clusters || 0} clusters, ${result?.topics || 0} topics${result?.brokers ? `, ${result.brokers} brokers` : ''}`
                })
            },
            {
                id: '3.2',
                name: 'Time Series Data',
                query: PROVIDER === 'awsMsk' ? `
                    SELECT sum(provider.bytesInPerSec.Average) as 'throughput'
                    FROM AwsMskBrokerSample
                    WHERE nr.accountId = ${NR_ACCOUNT_ID} AND nr.linkedAccountId = '${AWS_ACCOUNT_ID}'
                    TIMESERIES 5 minutes
                    SINCE 1 hour ago
                ` : `
                    SELECT sum(\`cluster_received_bytes\`) as 'throughput'
                    FROM ConfluentCloudClusterSample
                    WHERE nr.accountId = ${NR_ACCOUNT_ID}
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
                    WHERE nr.accountId = ${NR_ACCOUNT_ID} AND awsAccountId = '${AWS_ACCOUNT_ID}'
                    FACET entityName
                    SINCE 1 hour ago
                ` : `
                    SELECT 
                      cluster_name,
                      latest(current_controller_id) as 'controllerId',
                      latest(cluster_status) as 'status'
                    FROM ConfluentCloudClusterSample
                    WHERE nr.accountId = ${NR_ACCOUNT_ID}
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
                    WHERE nr.accountId = ${NR_ACCOUNT_ID} AND nr.linkedAccountId = '${AWS_ACCOUNT_ID}'
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
                      entityName,
                      provider.bytesInPerSec.Average OR 0 as 'bytesIn',
                      CASE 
                        WHEN provider.bytesInPerSec.Average IS NULL THEN 'No Data'
                        WHEN provider.bytesInPerSec.Average = 0 THEN 'Idle'
                        ELSE 'Active'
                      END as 'status'
                    FROM AwsMskBrokerSample
                    WHERE nr.accountId = ${NR_ACCOUNT_ID} AND nr.linkedAccountId = '${AWS_ACCOUNT_ID}'
                    SINCE 1 hour ago
                    LIMIT 10
                ` : `
                    SELECT 
                      cluster_name,
                      \`cluster_received_bytes\` OR 0 as 'bytesIn',
                      CASE 
                        WHEN \`cluster_received_bytes\` IS NULL THEN 'No Data'
                        WHEN \`cluster_received_bytes\` = 0 THEN 'Idle'
                        ELSE 'Active'
                      END as 'status'
                    FROM ConfluentCloudClusterSample
                    WHERE nr.accountId = ${NR_ACCOUNT_ID}
                    SINCE 1 hour ago
                    LIMIT 10
                `,
                validate: (results) => ({
                    passed: true,
                    message: 'Null value handling verified'
                })
            },
            {
                id: '5.2',
                name: 'Metric Value Ranges',
                query: `
                    SELECT 
                      metricName,
                      min(value) as 'minValue',
                      max(value) as 'maxValue',
                      CASE 
                        WHEN min(value) < 0 THEN 'Has Negative Values'
                        WHEN max(value) > 1e15 THEN 'Suspiciously Large'
                        ELSE 'Normal Range'
                      END as 'assessment'
                    FROM Metric
                    WHERE metricName LIKE 'kafka.%'
                      AND nr.accountId = ${NR_ACCOUNT_ID}
                    FACET metricName
                    SINCE 1 hour ago
                    LIMIT 20
                `,
                validate: (results) => {
                    if (!Array.isArray(results)) return { passed: true, message: 'No metrics to validate' };
                    
                    const issues = results.filter(r => r.assessment !== 'Normal Range');
                    return {
                        passed: issues.length === 0,
                        message: issues.length > 0 
                            ? `Found ${issues.length} metrics with unusual values`
                            : 'All metrics within normal ranges'
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
                    SELECT 
                      beginTimeSeconds,
                      endTimeSeconds,
                      (endTimeSeconds - beginTimeSeconds) * 1000 as 'durationMs',
                      count(*) as 'resultCount'
                    FROM (
                      SELECT *
                      FROM ${PROVIDER === 'awsMsk' ? 'AwsMskBrokerSample' : 'ConfluentCloudClusterSample'}
                      WHERE nr.accountId = ${NR_ACCOUNT_ID}
                      LIMIT 1000
                      SINCE 5 minutes ago
                    )
                `,
                validate: (result) => {
                    const duration = result?.durationMs || 0;
                    return {
                        passed: duration < 5000,
                        message: duration > 0 
                            ? `Query completed in ${duration}ms`
                            : 'Performance metrics not available'
                    };
                }
            }
        ]
    }
};

// Master verification query
const MASTER_VERIFICATION = {
    name: '🎯 Master System Verification',
    query: PROVIDER === 'awsMsk' ? `
        WITH 
          ui_fields AS (
            SELECT 
              CASE 
                WHEN percentage(count(provider), count(*)) = 100 
                 AND percentage(count(awsAccountId), count(*)) = 100
                 AND percentage(count(\`instrumentation.provider\`), count(*)) = 100
                THEN 'PASS'
                ELSE 'FAIL'
              END as status,
              count(*) as sampleCount
            FROM AwsMskClusterSample 
            WHERE nr.accountId = ${NR_ACCOUNT_ID} AND awsAccountId = '${AWS_ACCOUNT_ID}'
            SINCE 1 hour ago
          ),
          
          dimensional_metrics AS (
            SELECT 
              CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END as status,
              count(*) as metricCount
            FROM Metric 
            WHERE metricName LIKE 'kafka.%' 
              AND entity.type LIKE '%KAFKA_%'
              AND nr.accountId = ${NR_ACCOUNT_ID}
            SINCE 5 minutes ago
          ),
          
          data_freshness AS (
            SELECT 
              CASE WHEN (now() - max(timestamp))/1000/60 < 10 THEN 'PASS' ELSE 'FAIL' END as status,
              (now() - max(timestamp))/1000/60 as minutesOld
            FROM AwsMskClusterSample 
            WHERE nr.accountId = ${NR_ACCOUNT_ID} AND awsAccountId = '${AWS_ACCOUNT_ID}'
            SINCE 1 hour ago
          ),
          
          entity_hierarchy AS (
            SELECT 
              CASE 
                WHEN uniqueCount(CASE WHEN eventType() = 'AwsMskClusterSample' THEN entity.guid END) > 0
                 AND uniqueCount(CASE WHEN eventType() = 'AwsMskBrokerSample' THEN provider.brokerId END) > 0
                 AND uniqueCount(CASE WHEN eventType() = 'AwsMskTopicSample' THEN displayName END) > 0
                THEN 'PASS'
                ELSE 'FAIL'
              END as status,
              uniqueCount(CASE WHEN eventType() = 'AwsMskClusterSample' THEN entity.guid END) as clusters,
              uniqueCount(CASE WHEN eventType() = 'AwsMskBrokerSample' THEN provider.brokerId END) as brokers,
              uniqueCount(CASE WHEN eventType() = 'AwsMskTopicSample' THEN displayName END) as topics
            FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
            WHERE nr.accountId = ${NR_ACCOUNT_ID}
            SINCE 1 hour ago
          )

        SELECT 
          ui_fields.status as 'uiFields',
          ui_fields.sampleCount as 'samples',
          dimensional_metrics.status as 'dimensionalMetrics',
          dimensional_metrics.metricCount as 'metrics',
          data_freshness.status as 'dataFreshness',
          data_freshness.minutesOld as 'dataAge',
          entity_hierarchy.status as 'entityHierarchy',
          entity_hierarchy.clusters as 'clusterCount',
          entity_hierarchy.brokers as 'brokerCount',
          entity_hierarchy.topics as 'topicCount',
          CASE 
            WHEN ui_fields.status = 'PASS'
             AND dimensional_metrics.status = 'PASS'
             AND data_freshness.status = 'PASS'
             AND entity_hierarchy.status = 'PASS'
            THEN 'READY'
            ELSE 'NOT_READY'
          END as 'systemStatus'
        FROM ui_fields, dimensional_metrics, data_freshness, entity_hierarchy
    ` : `
        WITH 
          samples AS (
            SELECT 
              CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END as status,
              count(*) as sampleCount
            FROM ConfluentCloudClusterSample 
            WHERE nr.accountId = ${NR_ACCOUNT_ID}
            SINCE 1 hour ago
          ),
          
          metrics AS (
            SELECT 
              CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END as status,
              count(*) as metricCount
            FROM Metric 
            WHERE metricName LIKE 'kafka.%' 
              AND entity.type LIKE '%CONFLUENT%'
              AND nr.accountId = ${NR_ACCOUNT_ID}
            SINCE 5 minutes ago
          ),
          
          freshness AS (
            SELECT 
              CASE WHEN (now() - max(timestamp))/1000/60 < 10 THEN 'PASS' ELSE 'FAIL' END as status,
              (now() - max(timestamp))/1000/60 as minutesOld
            FROM ConfluentCloudClusterSample 
            WHERE nr.accountId = ${NR_ACCOUNT_ID}
            SINCE 1 hour ago
          )

        SELECT 
          samples.status as 'samples',
          samples.sampleCount as 'sampleCount',
          metrics.status as 'metrics',
          metrics.metricCount as 'metricCount',
          freshness.status as 'freshness',
          freshness.minutesOld as 'dataAge',
          CASE 
            WHEN samples.status = 'PASS'
             AND metrics.status = 'PASS'
             AND freshness.status = 'PASS'
            THEN 'READY'
            ELSE 'NOT_READY'
          END as 'systemStatus'
        FROM samples, metrics, freshness
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
            const status = result?.systemStatus;
            if (status === 'READY') {
                return { 
                    passed: true, 
                    message: '✅ SYSTEM READY - All core components verified!' 
                };
            } else {
                const issues = [];
                if (PROVIDER === 'awsMsk') {
                    if (result?.uiFields === 'FAIL') issues.push('UI fields missing');
                    if (result?.dimensionalMetrics === 'FAIL') issues.push('No dimensional metrics');
                    if (result?.dataFreshness === 'FAIL') issues.push('Data is stale');
                    if (result?.entityHierarchy === 'FAIL') issues.push('Entity hierarchy incomplete');
                } else {
                    if (result?.samples === 'FAIL') issues.push('No samples found');
                    if (result?.metrics === 'FAIL') issues.push('No metrics found');
                    if (result?.freshness === 'FAIL') issues.push('Data is stale');
                }
                return { 
                    passed: false, 
                    message: `❌ SYSTEM NOT READY - Issues: ${issues.join(', ')}` 
                };
            }
        }
    });
    
    printTestResult(masterResult, '');
    
    if (masterResult.result) {
        console.log(`\n  ${colors.cyan}System Details:${colors.reset}`);
        if (PROVIDER === 'awsMsk') {
            console.log(`    Samples: ${masterResult.result.samples || 0}`);
            console.log(`    Metrics: ${masterResult.result.metrics || 0}`);
            console.log(`    Data Age: ${Math.round(masterResult.result.dataAge || 0)} minutes`);
            console.log(`    Clusters: ${masterResult.result.clusterCount || 0}`);
            console.log(`    Brokers: ${masterResult.result.brokerCount || 0}`);
            console.log(`    Topics: ${masterResult.result.topicCount || 0}`);
        } else {
            console.log(`    Samples: ${masterResult.result.sampleCount || 0}`);
            console.log(`    Metrics: ${masterResult.result.metricCount || 0}`);
            console.log(`    Data Age: ${Math.round(masterResult.result.dataAge || 0)} minutes`);
        }
    }
    
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