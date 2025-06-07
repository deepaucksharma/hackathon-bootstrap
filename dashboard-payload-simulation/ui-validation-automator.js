#!/usr/bin/env node

/**
 * Automated UI Validation Script
 * Validates that MSK entities appear correctly in New Relic UI
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class UIValidationAutomator {
    constructor(config) {
        this.accountId = config.accountId;
        this.apiKey = config.apiKey;
        this.nerdGraphUrl = 'https://api.newrelic.com/graphql';
        this.validationResults = {
            timestamp: new Date().toISOString(),
            accountId: this.accountId,
            clusters: [],
            uiEndpoints: {
                entityExplorer: `https://one.newrelic.com/redirect/entity/${this.accountId}`,
                messageQueues: 'https://one.newrelic.com/nr1-core/message-queues',
                nrqlConsole: 'https://one.newrelic.com/data-exploration'
            },
            checks: {},
            summary: {}
        };
    }

    async validateCluster(clusterName, options = {}) {
        const {
            maxRetries = 10,
            retryDelay = 30000, // 30 seconds
            verbose = true
        } = options;

        console.log(`\n🔍 Validating UI visibility for: ${clusterName}`);
        console.log('=' + '='.repeat(clusterName.length + 30));

        const clusterResult = {
            clusterName,
            startTime: new Date().toISOString(),
            attempts: [],
            finalStatus: 'pending'
        };

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            if (verbose) {
                console.log(`\n📍 Attempt ${attempt}/${maxRetries} at ${new Date().toLocaleTimeString()}`);
            }

            const attemptResult = await this.runValidationChecks(clusterName);
            clusterResult.attempts.push({
                attempt,
                timestamp: new Date().toISOString(),
                ...attemptResult
            });

            // Check if fully validated
            if (attemptResult.summary.fullyValidated) {
                clusterResult.finalStatus = 'validated';
                clusterResult.endTime = new Date().toISOString();
                console.log('\n✅ UI validation successful!');
                break;
            }

            // Show progress
            if (verbose) {
                this.displayProgress(attemptResult);
            }

            // Wait before retry
            if (attempt < maxRetries) {
                console.log(`\n⏳ Waiting ${retryDelay / 1000} seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }

        if (clusterResult.finalStatus === 'pending') {
            clusterResult.finalStatus = 'failed';
            clusterResult.endTime = new Date().toISOString();
            console.log('\n❌ UI validation failed after all attempts');
        }

        this.validationResults.clusters.push(clusterResult);
        return clusterResult;
    }

    async runValidationChecks(clusterName) {
        const checks = {
            entityExists: false,
            entityReporting: false,
            appearsInMessageQueues: false,
            hasMetrics: false,
            hasBrokers: false,
            hasTopics: false,
            visibleInExplorer: false,
            queryableViaGraphQL: false,
            queryableViaNRQL: false
        };

        const metrics = {
            eventCount: 0,
            brokerCount: 0,
            topicCount: 0,
            throughputIn: 0,
            throughputOut: 0
        };

        // 1. Check entity via GraphQL
        console.log('  🔍 Checking entity via GraphQL...');
        const entityData = await this.checkEntityGraphQL(clusterName);
        checks.entityExists = entityData.exists;
        checks.entityReporting = entityData.reporting;
        checks.queryableViaGraphQL = entityData.queryable;
        
        // 2. Check events via NRQL
        console.log('  🔍 Checking events via NRQL...');
        const eventData = await this.checkEventsNRQL(clusterName);
        checks.queryableViaNRQL = eventData.queryable;
        checks.hasMetrics = eventData.hasMetrics;
        metrics.eventCount = eventData.eventCount;
        metrics.brokerCount = eventData.brokerCount;
        metrics.topicCount = eventData.topicCount;
        
        // 3. Check Message Queues visibility
        console.log('  🔍 Checking Message Queues UI...');
        const mqData = await this.checkMessageQueuesVisibility(clusterName);
        checks.appearsInMessageQueues = mqData.visible;
        checks.hasBrokers = mqData.hasBrokers;
        checks.hasTopics = mqData.hasTopics;
        
        // 4. Check Entity Explorer
        console.log('  🔍 Checking Entity Explorer...');
        const explorerData = await this.checkEntityExplorer(clusterName);
        checks.visibleInExplorer = explorerData.visible;
        
        // 5. Check metrics
        console.log('  🔍 Checking metrics...');
        const metricsData = await this.checkMetrics(clusterName);
        metrics.throughputIn = metricsData.throughputIn;
        metrics.throughputOut = metricsData.throughputOut;

        // Calculate summary
        const summary = {
            fullyValidated: checks.entityExists && 
                           checks.entityReporting && 
                           checks.appearsInMessageQueues &&
                           checks.visibleInExplorer,
            partiallyValidated: checks.entityExists || checks.queryableViaNRQL,
            score: this.calculateValidationScore(checks),
            recommendation: this.generateRecommendation(checks, metrics)
        };

        return { checks, metrics, summary };
    }

    async checkEntityGraphQL(clusterName) {
        const query = `
        {
            actor {
                entitySearch(query: "domain='INFRA' AND type='AWSMSKCLUSTER' AND name='${clusterName}'") {
                    count
                    results {
                        entities {
                            guid
                            name
                            type
                            reporting
                            tags {
                                key
                                values
                            }
                            recentAlertViolations {
                                count
                            }
                        }
                    }
                }
            }
        }`;

        try {
            const response = await axios.post(
                this.nerdGraphUrl,
                { query },
                {
                    headers: {
                        'Api-Key': this.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const searchResults = response.data?.data?.actor?.entitySearch;
            const entity = searchResults?.results?.entities?.[0];

            return {
                exists: (searchResults?.count || 0) > 0,
                reporting: entity?.reporting || false,
                queryable: true,
                entity
            };
        } catch (error) {
            return {
                exists: false,
                reporting: false,
                queryable: false,
                error: error.message
            };
        }
    }

    async checkEventsNRQL(clusterName) {
        const queries = {
            cluster: `FROM AwsMskClusterSample SELECT count(*) WHERE provider.clusterName = '${clusterName}' SINCE 10 minutes ago`,
            brokers: `FROM AwsMskBrokerSample SELECT uniqueCount(provider.brokerId) WHERE provider.clusterName = '${clusterName}' SINCE 10 minutes ago`,
            topics: `FROM AwsMskTopicSample SELECT uniqueCount(provider.topic) WHERE provider.clusterName = '${clusterName}' SINCE 10 minutes ago`,
            metrics: `FROM Metric SELECT count(*) WHERE entity.name = '${clusterName}' AND entity.type = 'AWSMSKCLUSTER' SINCE 10 minutes ago`
        };

        const results = {};
        let queryable = false;

        for (const [key, query] of Object.entries(queries)) {
            try {
                const response = await this.runNRQL(query);
                const value = response?.results?.[0]?.count || 
                            response?.results?.[0]?.['uniqueCount.provider.brokerId'] ||
                            response?.results?.[0]?.['uniqueCount.provider.topic'] || 0;
                results[key] = value;
                if (value > 0) queryable = true;
            } catch (error) {
                results[key] = 0;
            }
        }

        return {
            queryable,
            hasMetrics: results.metrics > 0,
            eventCount: results.cluster,
            brokerCount: results.brokers,
            topicCount: results.topics
        };
    }

    async checkMessageQueuesVisibility(clusterName) {
        // Check if cluster appears in Message Queues specific queries
        const query = `
        {
            actor {
                account(id: ${this.accountId}) {
                    nrql(query: "FROM AwsMskClusterSample SELECT latest(provider.activeControllerCount.Sum), latest(provider.offlinePartitionsCount.Sum) WHERE provider.clusterName = '${clusterName}' SINCE 10 minutes ago") {
                        results
                    }
                }
            }
        }`;

        try {
            const response = await axios.post(
                this.nerdGraphUrl,
                { query },
                {
                    headers: {
                        'Api-Key': this.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const results = response.data?.data?.actor?.account?.nrql?.results?.[0];
            const hasData = results && Object.values(results).some(v => v !== null);

            // Also check for related brokers and topics
            const brokerCheck = await this.runNRQL(
                `FROM AwsMskBrokerSample SELECT count(*) WHERE provider.clusterName = '${clusterName}' SINCE 10 minutes ago`
            );
            
            const topicCheck = await this.runNRQL(
                `FROM AwsMskTopicSample SELECT count(*) WHERE provider.clusterName = '${clusterName}' SINCE 10 minutes ago`
            );

            return {
                visible: hasData,
                hasBrokers: (brokerCheck?.results?.[0]?.count || 0) > 0,
                hasTopics: (topicCheck?.results?.[0]?.count || 0) > 0
            };
        } catch (error) {
            return {
                visible: false,
                hasBrokers: false,
                hasTopics: false,
                error: error.message
            };
        }
    }

    async checkEntityExplorer(clusterName) {
        // Check if entity appears in entity list queries used by Entity Explorer
        const query = `
        {
            actor {
                entities(guids: []) {
                    __typename
                }
                entitySearch(query: "domain='INFRA' AND type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC') AND name LIKE '%${clusterName}%'") {
                    count
                    types {
                        count
                        domain
                        type
                    }
                }
            }
        }`;

        try {
            const response = await axios.post(
                this.nerdGraphUrl,
                { query },
                {
                    headers: {
                        'Api-Key': this.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const searchResults = response.data?.data?.actor?.entitySearch;
            
            return {
                visible: (searchResults?.count || 0) > 0,
                entityTypes: searchResults?.types || []
            };
        } catch (error) {
            return {
                visible: false,
                entityTypes: [],
                error: error.message
            };
        }
    }

    async checkMetrics(clusterName) {
        const throughputQuery = `
            FROM AwsMskBrokerSample 
            SELECT 
                sum(provider.bytesInPerSec.Average) as bytesIn,
                sum(provider.bytesOutPerSec.Average) as bytesOut
            WHERE provider.clusterName = '${clusterName}'
            SINCE 10 minutes ago
        `;

        try {
            const response = await this.runNRQL(throughputQuery);
            const results = response?.results?.[0] || {};
            
            return {
                throughputIn: results.bytesIn || 0,
                throughputOut: results.bytesOut || 0
            };
        } catch (error) {
            return {
                throughputIn: 0,
                throughputOut: 0
            };
        }
    }

    async runNRQL(query) {
        try {
            const response = await axios.get(
                `https://insights-api.newrelic.com/v1/accounts/${this.accountId}/query`,
                {
                    params: { nrql: query },
                    headers: {
                        'X-Query-Key': this.apiKey,
                        'Accept': 'application/json'
                    }
                }
            );
            return response.data;
        } catch (error) {
            return null;
        }
    }

    calculateValidationScore(checks) {
        const weights = {
            entityExists: 20,
            entityReporting: 15,
            appearsInMessageQueues: 20,
            hasMetrics: 10,
            hasBrokers: 10,
            hasTopics: 10,
            visibleInExplorer: 10,
            queryableViaGraphQL: 3,
            queryableViaNRQL: 2
        };

        let score = 0;
        let maxScore = 0;

        for (const [check, weight] of Object.entries(weights)) {
            maxScore += weight;
            if (checks[check]) {
                score += weight;
            }
        }

        return Math.round((score / maxScore) * 100);
    }

    generateRecommendation(checks, metrics) {
        const recommendations = [];

        if (!checks.entityExists) {
            recommendations.push('Entity not found. Check entity synthesis configuration.');
        }

        if (checks.entityExists && !checks.entityReporting) {
            recommendations.push('Entity exists but not reporting. Check metric streaming.');
        }

        if (!checks.appearsInMessageQueues) {
            recommendations.push('Not visible in Message Queues. May need official integration.');
        }

        if (metrics.eventCount === 0) {
            recommendations.push('No events found. Verify event submission.');
        }

        if (recommendations.length === 0) {
            recommendations.push('All checks passed! Entity is fully operational.');
        }

        return recommendations;
    }

    displayProgress(attemptResult) {
        const { checks, metrics, summary } = attemptResult;
        
        console.log('\n📊 Validation Progress:');
        console.log('├─ Entity Exists:', checks.entityExists ? '✅' : '❌');
        console.log('├─ Entity Reporting:', checks.entityReporting ? '✅' : '❌');
        console.log('├─ In Message Queues:', checks.appearsInMessageQueues ? '✅' : '❌');
        console.log('├─ In Entity Explorer:', checks.visibleInExplorer ? '✅' : '❌');
        console.log('├─ Has Metrics:', checks.hasMetrics ? '✅' : '❌');
        console.log('├─ Has Brokers:', checks.hasBrokers ? '✅' : '❌');
        console.log('└─ Has Topics:', checks.hasTopics ? '✅' : '❌');
        
        console.log(`\n📈 Validation Score: ${summary.score}%`);
        console.log(`💡 ${summary.recommendation[0]}`);
    }

    async generateReport(outputFile = null) {
        const report = {
            ...this.validationResults,
            summary: {
                totalClusters: this.validationResults.clusters.length,
                validated: this.validationResults.clusters.filter(c => c.finalStatus === 'validated').length,
                failed: this.validationResults.clusters.filter(c => c.finalStatus === 'failed').length,
                averageAttempts: this.calculateAverageAttempts(),
                averageTime: this.calculateAverageTime()
            }
        };

        const markdown = this.generateMarkdownReport(report);
        
        if (outputFile) {
            fs.writeFileSync(outputFile, markdown);
            console.log(`\n📄 Report saved to: ${outputFile}`);
        }

        return report;
    }

    generateMarkdownReport(report) {
        return `# UI Validation Report

**Generated**: ${report.timestamp}
**Account ID**: ${report.accountId}

## Summary

- **Total Clusters Validated**: ${report.summary.totalClusters}
- **Successfully Validated**: ${report.summary.validated}
- **Failed Validation**: ${report.summary.failed}
- **Average Attempts**: ${report.summary.averageAttempts}
- **Average Time**: ${report.summary.averageTime}

## UI Endpoints

- [Entity Explorer](${report.uiEndpoints.entityExplorer})
- [Message Queues UI](${report.uiEndpoints.messageQueues})
- [NRQL Console](${report.uiEndpoints.nrqlConsole})

## Cluster Validation Details

${report.clusters.map(cluster => `
### ${cluster.clusterName}

- **Status**: ${cluster.finalStatus === 'validated' ? '✅ Validated' : '❌ Failed'}
- **Total Attempts**: ${cluster.attempts.length}
- **Duration**: ${this.calculateDuration(cluster.startTime, cluster.endTime)}

#### Final State
${this.formatFinalState(cluster.attempts[cluster.attempts.length - 1])}
`).join('\n')}

## Recommendations

${this.generateGlobalRecommendations(report)}
`;
    }

    formatFinalState(attempt) {
        if (!attempt) return 'No data';
        
        const { checks, metrics, summary } = attempt;
        return `
- **Validation Score**: ${summary.score}%
- **Entity Exists**: ${checks.entityExists ? '✅' : '❌'}
- **Reporting**: ${checks.entityReporting ? '✅' : '❌'}
- **In Message Queues**: ${checks.appearsInMessageQueues ? '✅' : '❌'}
- **Event Count**: ${metrics.eventCount}
- **Broker Count**: ${metrics.brokerCount}
- **Topic Count**: ${metrics.topicCount}
`;
    }

    generateGlobalRecommendations(report) {
        const recommendations = [];
        
        if (report.summary.validated === 0) {
            recommendations.push('- **Critical**: No clusters validated successfully. Review integration method.');
        }
        
        if (report.summary.averageAttempts > 5) {
            recommendations.push('- **Notice**: High average attempts indicate slow entity synthesis.');
        }
        
        if (report.summary.validated === report.summary.totalClusters) {
            recommendations.push('- **Success**: All clusters validated successfully!');
        }
        
        return recommendations.join('\n');
    }

    calculateAverageAttempts() {
        const clusters = this.validationResults.clusters;
        if (clusters.length === 0) return 0;
        
        const total = clusters.reduce((sum, c) => sum + c.attempts.length, 0);
        return (total / clusters.length).toFixed(1);
    }

    calculateAverageTime() {
        const clusters = this.validationResults.clusters;
        if (clusters.length === 0) return 'N/A';
        
        const validClusters = clusters.filter(c => c.startTime && c.endTime);
        if (validClusters.length === 0) return 'N/A';
        
        const totalMs = validClusters.reduce((sum, c) => {
            return sum + (new Date(c.endTime) - new Date(c.startTime));
        }, 0);
        
        const avgMs = totalMs / validClusters.length;
        const minutes = Math.floor(avgMs / 60000);
        const seconds = Math.floor((avgMs % 60000) / 1000);
        
        return `${minutes}m ${seconds}s`;
    }

    calculateDuration(start, end) {
        if (!start || !end) return 'N/A';
        const diff = new Date(end) - new Date(start);
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }
}

// CLI
if (require.main === module) {
    async function main() {
        const args = process.argv.slice(2);
        
        if (args.length === 0 || args.includes('--help')) {
            console.log('Usage: node ui-validation-automator.js <cluster-name> [options]');
            console.log('');
            console.log('Options:');
            console.log('  --max-retries <n>   Maximum validation attempts (default: 10)');
            console.log('  --delay <ms>        Delay between attempts in ms (default: 30000)');
            console.log('  --report <file>     Save report to file');
            console.log('  --quiet             Less verbose output');
            console.log('');
            console.log('Example:');
            console.log('  node ui-validation-automator.js my-cluster --max-retries 5 --report validation.md');
            process.exit(0);
        }

        const config = {
            accountId: process.env.NEW_RELIC_ACCOUNT_ID,
            apiKey: process.env.NEW_RELIC_API_KEY
        };

        if (!config.accountId || !config.apiKey) {
            console.error('❌ Please set NEW_RELIC_ACCOUNT_ID and NEW_RELIC_API_KEY');
            process.exit(1);
        }

        const validator = new UIValidationAutomator(config);
        
        // Parse options
        const clusterName = args[0];
        const options = {
            maxRetries: parseInt(args[args.indexOf('--max-retries') + 1] || '10'),
            retryDelay: parseInt(args[args.indexOf('--delay') + 1] || '30000'),
            verbose: !args.includes('--quiet')
        };

        // Validate cluster
        const result = await validator.validateCluster(clusterName, options);
        
        // Generate report if requested
        if (args.includes('--report')) {
            const reportFile = args[args.indexOf('--report') + 1];
            await validator.generateReport(reportFile);
        }

        // Exit with appropriate code
        process.exit(result.finalStatus === 'validated' ? 0 : 1);
    }

    main().catch(console.error);
}

module.exports = { UIValidationAutomator };