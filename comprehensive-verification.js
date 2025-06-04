#!/usr/bin/env node

/**
 * Comprehensive Kafka Metrics Verification Script
 * This script runs all verification queries from METRICS_VERIFICATION_GUIDE.md
 * and produces a detailed report of the current state
 */

const https = require('https');
const fs = require('fs');

// Load credentials
const API_KEY = process.env.NEW_RELIC_API_KEY || 'YOUR_NEW_RELIC_API_KEY';
const ACCOUNT_ID = process.env.NEW_RELIC_ACCOUNT_ID || 'YOUR_ACCOUNT_ID';
const CLUSTER_NAME = process.env.KAFKA_CLUSTER_NAME || 'kafka-k8s-monitoring';

// Colors for output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m'
};

// Results storage
const verificationResults = {
    timestamp: new Date().toISOString(),
    accountId: ACCOUNT_ID,
    clusterName: CLUSTER_NAME,
    summary: {
        totalChecks: 0,
        passed: 0,
        failed: 0,
        warnings: 0
    },
    sections: {}
};

// Execute NRQL query
async function executeNrql(query, description, section) {
    verificationResults.summary.totalChecks++;
    
    const graphqlQuery = {
        query: `
            query {
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

    const options = {
        hostname: 'api.newrelic.com',
        path: '/graphql',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'API-Key': API_KEY
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    const results = response.data?.actor?.account?.nrql?.results || [];
                    
                    // Store result
                    if (!verificationResults.sections[section]) {
                        verificationResults.sections[section] = { checks: [] };
                    }
                    
                    const check = {
                        description,
                        query,
                        results,
                        status: 'unknown',
                        message: ''
                    };
                    
                    // Evaluate results
                    if (results.length === 0) {
                        check.status = 'failed';
                        check.message = 'No data returned';
                        verificationResults.summary.failed++;
                    } else if (results[0].count === 0 || results[0]['count(*)'] === 0) {
                        check.status = 'failed';
                        check.message = 'Count is 0';
                        verificationResults.summary.failed++;
                    } else {
                        check.status = 'passed';
                        check.message = 'Data exists';
                        verificationResults.summary.passed++;
                    }
                    
                    verificationResults.sections[section].checks.push(check);
                    
                    // Print result
                    const statusIcon = check.status === 'passed' ? '✓' : '✗';
                    const statusColor = check.status === 'passed' ? colors.green : colors.red;
                    console.log(`${statusColor}${statusIcon} ${description}${colors.reset}: ${check.message}`);
                    
                    resolve(results);
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

// Verification sections based on METRICS_VERIFICATION_GUIDE.md
async function runVerification() {
    console.log(`${colors.green}=== Comprehensive Kafka Metrics Verification ===${colors.reset}`);
    console.log(`Account ID: ${ACCOUNT_ID}`);
    console.log(`Cluster Name: ${CLUSTER_NAME}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log('');

    // 1. Standard Kafka Integration Metrics
    console.log(`\n${colors.cyan}1. Standard Kafka Integration Metrics${colors.reset}`);
    console.log('=' .repeat(50));
    
    await executeNrql(
        `FROM KafkaBrokerSample SELECT count(*), uniqueCount(entityName), uniqueCount(broker_host) WHERE clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago`,
        'Broker samples exist',
        'Standard Metrics'
    );
    
    await executeNrql(
        `FROM KafkaTopicSample SELECT count(*), uniqueCount(topic), uniqueCount(entityName) WHERE clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago`,
        'Topic samples exist',
        'Standard Metrics'
    );
    
    await executeNrql(
        `FROM KafkaOffsetSample SELECT count(*), uniqueCount(consumerGroup), uniqueCount(topic) WHERE clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago`,
        'Consumer offset samples exist',
        'Standard Metrics'
    );
    
    await executeNrql(
        `FROM KafkaProducerSample SELECT count(*), uniqueCount(entityName) WHERE clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago`,
        'Producer samples exist',
        'Standard Metrics'
    );
    
    await executeNrql(
        `FROM KafkaConsumerSample SELECT count(*), uniqueCount(entityName) WHERE clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago`,
        'Consumer samples exist',
        'Standard Metrics'
    );

    // 2. Key Broker Metrics
    console.log(`\n${colors.cyan}2. Key Broker Performance Metrics${colors.reset}`);
    console.log('=' .repeat(50));
    
    await executeNrql(
        `FROM KafkaBrokerSample SELECT average(broker.messagesInPerSecond), average(broker.IOInPerSecond), average(broker.IOOutPerSecond) WHERE clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago`,
        'Message throughput metrics',
        'Performance Metrics'
    );
    
    await executeNrql(
        `FROM KafkaBrokerSample SELECT average(broker.bytesWrittenToDiscPerSecond), average(replication.ISRExpandsPerSecond), average(replication.ISRShrinksPerSecond) WHERE clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago`,
        'Disk and replication metrics',
        'Performance Metrics'
    );

    // 3. MSK Shim Metrics (AWS MSK Format)
    console.log(`\n${colors.cyan}3. AWS MSK Shim Metrics${colors.reset}`);
    console.log('=' .repeat(50));
    
    await executeNrql(
        `FROM AwsMskClusterSample SELECT count(*), uniqueCount(clusterName), uniqueCount(entityName) WHERE clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago`,
        'MSK Cluster samples exist',
        'MSK Shim'
    );
    
    await executeNrql(
        `FROM AwsMskBrokerSample SELECT count(*), uniqueCount(brokerId), uniqueCount(clusterName) WHERE clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago`,
        'MSK Broker samples exist',
        'MSK Shim'
    );
    
    await executeNrql(
        `FROM AwsMskTopicSample SELECT count(*), uniqueCount(topicName), uniqueCount(clusterName) WHERE clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago`,
        'MSK Topic samples exist',
        'MSK Shim'
    );
    
    await executeNrql(
        `FROM AwsMskBrokerSample SELECT average(aws.msk.BytesInPerSec), average(aws.msk.BytesOutPerSec), average(aws.msk.MessagesInPerSec) WHERE clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago`,
        'MSK throughput metrics',
        'MSK Shim'
    );

    // 4. MSK Entity Attributes
    console.log(`\n${colors.cyan}4. MSK Entity Attributes Verification${colors.reset}`);
    console.log('=' .repeat(50));
    
    await executeNrql(
        `FROM AwsMskClusterSample SELECT count(provider.clusterName), count(entity.guid), count(entityName) WHERE clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago`,
        'MSK Cluster attributes present',
        'MSK Attributes'
    );
    
    await executeNrql(
        `FROM AwsMskBrokerSample SELECT count(provider.clusterName), count(provider.brokerId), count(entity.guid) WHERE clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago`,
        'MSK Broker attributes present',
        'MSK Attributes'
    );

    // 5. Data Pipeline Analysis
    console.log(`\n${colors.cyan}5. Data Pipeline Analysis${colors.reset}`);
    console.log('=' .repeat(50));
    
    await executeNrql(
        `FROM KafkaBrokerSample SELECT count(*) FACET pipeline WHERE clusterName = '${CLUSTER_NAME}' SINCE 1 hour ago`,
        'Data by pipeline',
        'Pipeline Analysis'
    );

    // 6. Metric Discovery
    console.log(`\n${colors.cyan}6. Available Metrics Discovery${colors.reset}`);
    console.log('=' .repeat(50));
    
    await executeNrql(
        `FROM KafkaBrokerSample SELECT keyset() WHERE clusterName = '${CLUSTER_NAME}' SINCE 1 hour ago LIMIT 1`,
        'Available broker metrics',
        'Metric Discovery'
    );

    // 7. Consumer Lag Analysis
    console.log(`\n${colors.cyan}7. Consumer Lag Monitoring${colors.reset}`);
    console.log('=' .repeat(50));
    
    await executeNrql(
        `FROM KafkaOffsetSample SELECT average(consumer.lag), max(consumer.lag) FACET consumerGroup WHERE clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago LIMIT 10`,
        'Consumer lag by group',
        'Consumer Lag'
    );

    // 8. Data Freshness
    console.log(`\n${colors.cyan}8. Data Freshness Check${colors.reset}`);
    console.log('=' .repeat(50));
    
    await executeNrql(
        `FROM KafkaBrokerSample SELECT latest(timestamp), now() - latest(timestamp) as 'Age in Seconds' WHERE clusterName = '${CLUSTER_NAME}' SINCE 10 minutes ago`,
        'Standard metrics freshness',
        'Data Freshness'
    );
    
    await executeNrql(
        `FROM AwsMskBrokerSample SELECT latest(timestamp), now() - latest(timestamp) as 'Age in Seconds' WHERE clusterName = '${CLUSTER_NAME}' SINCE 10 minutes ago`,
        'MSK metrics freshness',
        'Data Freshness'
    );

    // 9. Entity Summary
    console.log(`\n${colors.cyan}9. Entity Summary${colors.reset}`);
    console.log('=' .repeat(50));
    
    await executeNrql(
        `SELECT uniqueCount(entityGuid) FROM KafkaBrokerSample, KafkaTopicSample, KafkaOffsetSample WHERE clusterName = '${CLUSTER_NAME}' SINCE 1 hour ago FACET eventType()`,
        'Unique entities by type',
        'Entity Summary'
    );

    // 10. Check All Clusters (no filter)
    console.log(`\n${colors.cyan}10. All Clusters Check (No Filter)${colors.reset}`);
    console.log('=' .repeat(50));
    
    await executeNrql(
        `FROM KafkaBrokerSample SELECT uniqueCount(clusterName) FACET clusterName SINCE 1 hour ago`,
        'All available clusters',
        'Cluster Discovery'
    );
    
    await executeNrql(
        `FROM AwsMskClusterSample SELECT uniqueCount(clusterName) FACET clusterName SINCE 1 hour ago`,
        'All MSK clusters',
        'Cluster Discovery'
    );

    // 11. Metric Values Verification
    console.log(`\n${colors.cyan}11. Metric Values Health Check${colors.reset}`);
    console.log('=' .repeat(50));
    
    await executeNrql(
        `FROM KafkaBrokerSample SELECT count(*) WHERE broker.messagesInPerSecond IS NOT NULL AND broker.messagesInPerSecond > 0 AND clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago`,
        'Brokers with non-zero message rate',
        'Metric Values'
    );
    
    await executeNrql(
        `FROM AwsMskBrokerSample SELECT count(*) WHERE aws.msk.MessagesInPerSec IS NOT NULL AND clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago`,
        'MSK brokers with message rate data',
        'Metric Values'
    );

    // 12. AWS MSK Specific Metrics
    console.log(`\n${colors.cyan}12. AWS MSK Specific Metrics${colors.reset}`);
    console.log('=' .repeat(50));
    
    await executeNrql(
        `FROM AwsMskClusterSample SELECT latest(provider.activeControllerCount.Sum), latest(provider.offlinePartitionsCount.Sum), latest(provider.globalPartitionCount.Average) WHERE clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago`,
        'MSK cluster health metrics',
        'MSK Health'
    );
    
    await executeNrql(
        `FROM AwsMskBrokerSample SELECT latest(provider.underReplicatedPartitions.Sum), latest(provider.underMinIsrPartitionCount.Sum) WHERE clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago`,
        'MSK broker health metrics',
        'MSK Health'
    );
}

// Generate summary report
function generateSummary() {
    console.log(`\n${colors.cyan}=== Verification Summary ===${colors.reset}`);
    console.log('=' .repeat(50));
    
    const summary = verificationResults.summary;
    const passRate = summary.totalChecks > 0 ? (summary.passed / summary.totalChecks * 100).toFixed(1) : 0;
    
    console.log(`Total Checks: ${summary.totalChecks}`);
    console.log(`${colors.green}Passed: ${summary.passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${summary.failed}${colors.reset}`);
    console.log(`${colors.yellow}Warnings: ${summary.warnings}${colors.reset}`);
    console.log(`Pass Rate: ${passRate}%`);
    
    // Determine overall status
    let overallStatus = 'UNKNOWN';
    let statusColor = colors.yellow;
    
    if (passRate >= 80) {
        overallStatus = 'HEALTHY';
        statusColor = colors.green;
    } else if (passRate >= 50) {
        overallStatus = 'PARTIAL';
        statusColor = colors.yellow;
    } else {
        overallStatus = 'CRITICAL';
        statusColor = colors.red;
    }
    
    console.log(`\n${statusColor}Overall Status: ${overallStatus}${colors.reset}`);
    
    // Specific recommendations
    console.log(`\n${colors.cyan}Recommendations:${colors.reset}`);
    
    const standardMetricsFailed = verificationResults.sections['Standard Metrics']?.checks.some(c => c.status === 'failed');
    const mskMetricsFailed = verificationResults.sections['MSK Shim']?.checks.some(c => c.status === 'failed');
    
    if (standardMetricsFailed && mskMetricsFailed) {
        console.log(`${colors.red}❌ Both standard and MSK metrics are failing!${colors.reset}`);
        console.log('   - Check if nri-kafka pods are running');
        console.log('   - Verify JMX connectivity to Kafka brokers');
        console.log('   - Check integration logs for errors');
    } else if (standardMetricsFailed) {
        console.log(`${colors.yellow}⚠️  Standard metrics failing but MSK shim working${colors.reset}`);
        console.log('   - Check standard integration configuration');
        console.log('   - Verify bootstrap broker connectivity');
    } else if (mskMetricsFailed) {
        console.log(`${colors.yellow}⚠️  MSK shim metrics failing${colors.reset}`);
        console.log('   - Verify MSK_SHIM_ENABLED=true');
        console.log('   - Check MSK environment variables');
    } else {
        console.log(`${colors.green}✅ Both standard and MSK metrics are working!${colors.reset}`);
        
        // Check for zero values
        const metricValuesFailed = verificationResults.sections['Metric Values']?.checks.some(c => c.status === 'failed');
        if (metricValuesFailed) {
            console.log(`${colors.yellow}⚠️  But metric values are 0 or null${colors.reset}`);
            console.log('   - Check if Kafka is actively processing messages');
            console.log('   - Verify JMX metrics are being exposed correctly');
        }
    }
    
    // Save detailed report
    const reportFile = `kafka-verification-report-${Date.now()}.json`;
    fs.writeFileSync(reportFile, JSON.stringify(verificationResults, null, 2));
    console.log(`\n${colors.green}Detailed report saved to: ${reportFile}${colors.reset}`);
}

// Main execution
async function main() {
    try {
        await runVerification();
        generateSummary();
    } catch (error) {
        console.error(`${colors.red}Error during verification: ${error.message}${colors.reset}`);
        process.exit(1);
    }
}

main();