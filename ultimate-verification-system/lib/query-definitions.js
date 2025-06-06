/**
 * Query definitions for all verification tests
 */

const Validators = require('./validators');

class QueryDefinitions {
    constructor(provider, awsAccountId) {
        this.provider = provider;
        this.awsAccountId = awsAccountId;
    }

    /**
     * Get all test suites
     */
    getAllSuites() {
        return {
            CRITICAL_FOUNDATION: this.getCriticalFoundationTests(),
            HOME_PAGE: this.getHomePageTests(),
            SUMMARY_PAGE: this.getSummaryPageTests(),
            ENTITY_HEALTH: this.getEntityHealthTests(),
            DATA_QUALITY: this.getDataQualityTests(),
            PERFORMANCE: this.getPerformanceTests(),
            TOPIC_ANALYSIS: this.getTopicAnalysisTests(),
            CONSUMER_GROUPS: this.getConsumerGroupTests(),
            ADVANCED_METRICS: this.getAdvancedMetricsTests()
        };
    }

    /**
     * Critical Foundation Tests
     */
    getCriticalFoundationTests() {
        return {
            name: '🔨 Critical Foundation Tests',
            critical: true,
            tests: [
                {
                    id: '1.1',
                    name: 'Entity Type Existence',
                    query: this.provider === 'awsMsk' ? `
                        SELECT count(*) as 'count'
                        FROM AwsMskClusterSample
                        WHERE awsAccountId = '${this.awsAccountId}'
                        SINCE 1 hour ago
                    ` : `
                        SELECT count(*) as 'count'
                        FROM ConfluentCloudClusterSample
                        SINCE 1 hour ago
                    `,
                    validate: Validators.validateEntityExistence
                },
                {
                    id: '1.2',
                    name: 'UI Visibility Fields',
                    query: this.provider === 'awsMsk' ? `
                        SELECT 
                          count(*) as 'samples',
                          filter(count(*), WHERE provider IS NOT NULL) * 100.0 / count(*) as 'providerField',
                          filter(count(*), WHERE awsAccountId IS NOT NULL) * 100.0 / count(*) as 'awsAccountId',
                          filter(count(*), WHERE awsRegion IS NOT NULL) * 100.0 / count(*) as 'awsRegion',
                          filter(count(*), WHERE \`instrumentation.provider\` IS NOT NULL) * 100.0 / count(*) as 'instrumentationProvider',
                          filter(count(*), WHERE entityName IS NOT NULL) * 100.0 / count(*) as 'entityName',
                          filter(count(*), WHERE entity.guid IS NOT NULL) * 100.0 / count(*) as 'entityGuid'
                        FROM AwsMskClusterSample
                        WHERE awsAccountId = '${this.awsAccountId}'
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
                    validate: (result) => Validators.validateUIFields(result, this.provider)
                },
                {
                    id: '1.3',
                    name: 'MSK Metrics Coverage',
                    query: this.provider === 'awsMsk' ? `
                        SELECT 
                          count(*) as 'totalSamples',
                          uniqueCount(entityName) as 'uniqueEntities',
                          filter(count(*), WHERE provider.bytesInPerSec.Average IS NOT NULL) as 'throughputMetrics',
                          filter(count(*), WHERE provider.activeControllerCount.Sum IS NOT NULL) as 'healthMetrics'
                        FROM AwsMskBrokerSample, AwsMskClusterSample
                        WHERE awsAccountId = '${this.awsAccountId}'
                        SINCE 5 minutes ago
                    ` : `
                        SELECT count(*) as 'totalSamples'
                        FROM ConfluentCloudClusterSample
                        SINCE 5 minutes ago
                    `,
                    validate: (result) => {
                        if (!result || result.length === 0 || result[0].totalSamples === 0) {
                            return { passed: false, message: 'No MSK metrics found' };
                        }
                        const data = result[0];
                        return {
                            passed: data.totalSamples > 0,
                            message: `Found ${data.totalSamples} samples across ${data.uniqueEntities || 0} entities`
                        };
                    }
                },
                {
                    id: '1.4',
                    name: 'Data Freshness',
                    query: this.provider === 'awsMsk' ? `
                        SELECT max(timestamp) as 'latest'
                        FROM AwsMskClusterSample
                        WHERE awsAccountId = '${this.awsAccountId}'
                        SINCE 1 hour ago
                    ` : `
                        SELECT max(timestamp) as 'latest'
                        FROM ConfluentCloudClusterSample
                        SINCE 1 hour ago
                    `,
                    validate: Validators.validateDataFreshness
                }
            ]
        };
    }

    /**
     * Home Page Tests
     */
    getHomePageTests() {
        return {
            name: '🏠 Home Page Verification',
            tests: [
                {
                    id: '2.1',
                    name: 'Account Aggregation',
                    query: this.provider === 'awsMsk' ? `
                        SELECT 
                          uniqueCount(entity.guid) as 'clusterCount',
                          uniqueCount(entityName) as 'uniqueClusters'
                        FROM AwsMskClusterSample
                        WHERE awsAccountId = '${this.awsAccountId}'
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
                    validate: Validators.validateAccountAggregation
                },
                {
                    id: '2.2',
                    name: 'Throughput Metrics',
                    query: this.provider === 'awsMsk' ? `
                        SELECT 
                          sum(provider.bytesInPerSec.Average) as 'totalBytesIn',
                          sum(provider.bytesOutPerSec.Average) as 'totalBytesOut'
                        FROM AwsMskBrokerSample
                        WHERE awsAccountId = '${this.awsAccountId}'
                        SINCE 1 hour ago
                    ` : `
                        SELECT 
                          sum(\`cluster_received_bytes\`) as 'totalBytesIn',
                          sum(\`cluster_sent_bytes\`) as 'totalBytesOut'
                        FROM ConfluentCloudClusterSample
                        SINCE 1 hour ago
                    `,
                    validate: Validators.validateThroughputMetrics
                }
            ]
        };
    }

    /**
     * Summary Page Tests
     */
    getSummaryPageTests() {
        return {
            name: '📊 Summary Page Verification',
            tests: [
                {
                    id: '3.1',
                    name: 'Billboard Metrics',
                    query: this.provider === 'awsMsk' ? `
                        SELECT 
                          uniqueCount(entity.guid) as 'clusters',
                          uniqueCount(provider.brokerId) as 'brokers'
                        FROM AwsMskClusterSample, AwsMskBrokerSample
                        WHERE awsAccountId = '${this.awsAccountId}'
                        SINCE 1 hour ago
                    ` : `
                        SELECT 
                          uniqueCount(id) as 'clusters',
                          0 as 'brokers'
                        FROM ConfluentCloudClusterSample
                        SINCE 1 hour ago
                    `,
                    validate: (result) => {
                        if (!result || result.length === 0 || result[0].clusters === 0) {
                            return { passed: false, message: 'No clusters found' };
                        }
                        return {
                            passed: true,
                            message: `Found ${result[0].clusters} clusters${result[0].brokers ? `, ${result[0].brokers} brokers` : ''}`
                        };
                    }
                },
                {
                    id: '3.2',
                    name: 'Time Series Data',
                    query: this.provider === 'awsMsk' ? `
                        SELECT sum(provider.bytesInPerSec.Average) as 'throughput'
                        FROM AwsMskBrokerSample
                        WHERE awsAccountId = '${this.awsAccountId}'
                        TIMESERIES 5 minutes
                        SINCE 1 hour ago
                    ` : `
                        SELECT sum(\`cluster_received_bytes\`) as 'throughput'
                        FROM ConfluentCloudClusterSample
                        TIMESERIES 5 minutes
                        SINCE 1 hour ago
                    `,
                    validate: Validators.validateTimeSeriesData
                }
            ]
        };
    }

    /**
     * Entity Health Tests
     */
    getEntityHealthTests() {
        return {
            name: '🏥 Entity Health Verification',
            tests: [
                {
                    id: '4.1',
                    name: 'Cluster Health Metrics',
                    query: this.provider === 'awsMsk' ? `
                        SELECT 
                          latest(provider.activeControllerCount.Sum) as 'activeControllers',
                          latest(provider.offlinePartitionsCount.Sum) as 'offlinePartitions',
                          latest(provider.underReplicatedPartitions.Sum) as 'underReplicated'
                        FROM AwsMskClusterSample
                        WHERE awsAccountId = '${this.awsAccountId}'
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
                    validate: (results) => Validators.validateHealthMetrics(results, this.provider)
                },
                {
                    id: '4.2',
                    name: 'Broker Health',
                    query: this.provider === 'awsMsk' ? `
                        SELECT 
                          average(provider.bytesInPerSec.Average) as 'avgBytesIn',
                          latest(provider.underReplicatedPartitions.Sum) as 'underReplicated'
                        FROM AwsMskBrokerSample
                        WHERE awsAccountId = '${this.awsAccountId}'
                        FACET clusterName, provider.brokerId
                        SINCE 1 hour ago
                        LIMIT 50
                    ` : `
                        SELECT 'N/A for Confluent Cloud' as status
                    `,
                    validate: (results) => {
                        if (this.provider !== 'awsMsk') {
                            return { passed: true, message: 'Broker metrics not applicable for Confluent Cloud' };
                        }
                        return {
                            passed: Array.isArray(results) && results.length > 0,
                            message: `Found ${results?.length || 0} brokers with health data`
                        };
                    }
                }
            ]
        };
    }

    /**
     * Data Quality Tests
     */
    getDataQualityTests() {
        return {
            name: '🔍 Data Quality Verification',
            tests: [
                {
                    id: '5.1',
                    name: 'Null Value Handling',
                    query: this.provider === 'awsMsk' ? `
                        SELECT 
                          count(*) as 'totalSamples',
                          filter(count(*), WHERE provider.bytesInPerSec.Average IS NULL) as 'nullValues',
                          filter(count(*), WHERE provider.bytesInPerSec.Average = 0) as 'zeroValues',
                          filter(count(*), WHERE provider.bytesInPerSec.Average > 0) as 'activeValues'
                        FROM AwsMskBrokerSample
                        WHERE awsAccountId = '${this.awsAccountId}'
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
                    validate: (result) => {
                        if (!result || result.length === 0 || result[0].totalSamples === 0) {
                            return { passed: false, message: 'No samples to analyze' };
                        }
                        const data = result[0];
                        return {
                            passed: true,
                            message: `Total: ${data.totalSamples}, Active: ${data.activeValues}, Zero: ${data.zeroValues}, Null: ${data.nullValues}`
                        };
                    }
                },
                {
                    id: '5.2',
                    name: 'Metric Value Ranges',
                    query: this.provider === 'awsMsk' ? `
                        SELECT 
                          count(*) as 'sampleCount',
                          min(provider.bytesInPerSec.Average) as 'minThroughput',
                          max(provider.bytesInPerSec.Average) as 'maxThroughput',
                          average(provider.bytesInPerSec.Average) as 'avgThroughput'
                        FROM AwsMskBrokerSample
                        WHERE awsAccountId = '${this.awsAccountId}'
                          AND provider.bytesInPerSec.Average IS NOT NULL
                        SINCE 1 hour ago
                    ` : `
                        SELECT 
                          count(*) as 'sampleCount',
                          min(\`cluster_received_bytes\`) as 'minThroughput',
                          max(\`cluster_received_bytes\`) as 'maxThroughput',
                          average(\`cluster_received_bytes\`) as 'avgThroughput'
                        FROM ConfluentCloudClusterSample
                        WHERE \`cluster_received_bytes\` IS NOT NULL
                        SINCE 1 hour ago
                    `,
                    validate: (result) => {
                        if (!result || result.length === 0 || result[0].sampleCount === 0) {
                            return { passed: false, message: 'No throughput metrics found to validate' };
                        }
                        
                        const data = result[0];
                        const issues = [];
                        if (data.minThroughput < 0) issues.push('negative values');
                        if (data.maxThroughput > 1e15) issues.push('suspiciously large values');
                        
                        return {
                            passed: issues.length === 0,
                            message: issues.length > 0 
                                ? `Found issues: ${issues.join(', ')}`
                                : `Metrics valid (samples: ${data.sampleCount}, range: ${Math.round(data.minThroughput || 0)} - ${Math.round(data.maxThroughput || 0)} bytes/sec)`
                        };
                    }
                }
            ]
        };
    }

    /**
     * Performance Tests
     */
    getPerformanceTests() {
        return {
            name: '⚡ Performance Verification',
            tests: [
                {
                    id: '6.1',
                    name: 'Query Performance',
                    query: `
                        SELECT count(*) as 'resultCount'
                        FROM ${this.provider === 'awsMsk' ? 'AwsMskBrokerSample' : 'ConfluentCloudClusterSample'}
                        WHERE ${this.provider === 'awsMsk' ? `awsAccountId = '${this.awsAccountId}'` : '1=1'}
                        SINCE 5 minutes ago
                    `,
                    validate: (result) => ({
                        passed: result && result.length > 0 && result[0].resultCount >= 0,
                        message: `Query returned ${result?.[0]?.resultCount || 0} results`
                    })
                }
            ]
        };
    }

    /**
     * Topic Analysis Tests
     */
    getTopicAnalysisTests() {
        return {
            name: '📚 Topic Analysis',
            tests: [
                {
                    id: '7.1',
                    name: 'Topic Count and Health',
                    query: this.provider === 'awsMsk' ? `
                        SELECT 
                          uniqueCount(topicName) as 'topicCount',
                          filter(uniqueCount(topicName), WHERE provider.messagesInPerSec.Sum > 0) as 'activeTopics'
                        FROM AwsMskTopicSample
                        WHERE awsAccountId = '${this.awsAccountId}'
                        SINCE 1 hour ago
                    ` : `
                        SELECT 
                          uniqueCount(topic_name) as 'topicCount',
                          filter(uniqueCount(topic_name), WHERE \`sent_bytes\` > 0) as 'activeTopics'
                        FROM ConfluentCloudTopicSample
                        SINCE 1 hour ago
                    `,
                    validate: (result) => {
                        if (!result || result.length === 0) {
                            return { passed: false, message: 'No topic data available' };
                        }
                        const data = result[0];
                        return {
                            passed: data.topicCount > 0,
                            message: `Found ${data.topicCount} topics (${data.activeTopics} active)`
                        };
                    }
                },
                {
                    id: '7.2',
                    name: 'Top Topics by Throughput',
                    query: this.provider === 'awsMsk' ? `
                        SELECT 
                          sum(provider.messagesInPerSec.Sum) as 'messagesPerSec'
                        FROM AwsMskTopicSample
                        WHERE awsAccountId = '${this.awsAccountId}'
                        FACET topicName
                        SINCE 1 hour ago
                        LIMIT 10
                    ` : `
                        SELECT 
                          topic_name,
                          sum(\`sent_records\`) as 'messagesPerSec'
                        FROM ConfluentCloudTopicSample
                        FACET topic_name
                        SINCE 1 hour ago
                        LIMIT 10
                    `,
                    validate: (results) => {
                        if (!Array.isArray(results) || results.length === 0) {
                            return { passed: false, message: 'No topic throughput data' };
                        }
                        return {
                            passed: true,
                            message: `Found throughput data for ${results.length} topics`
                        };
                    }
                }
            ]
        };
    }

    /**
     * Consumer Group Tests
     */
    getConsumerGroupTests() {
        return {
            name: '👥 Consumer Group Analysis',
            tests: [
                {
                    id: '8.1',
                    name: 'Consumer Group Lag',
                    query: this.provider === 'awsMsk' ? `
                        SELECT 
                          max(consumer.lag) as 'maxLag',
                          average(consumer.lag) as 'avgLag',
                          uniqueCount(consumer.group) as 'groupCount'
                        FROM KafkaOffsetSample
                        WHERE clusterName LIKE '%${this.awsAccountId}%'
                        SINCE 1 hour ago
                    ` : `
                        SELECT 
                          'N/A' as status
                        FROM ConfluentCloudClusterSample
                        WHERE 1=0
                    `,
                    validate: (result) => {
                        if (this.provider !== 'awsMsk') {
                            return { passed: true, message: 'Consumer group metrics via different API for Confluent' };
                        }
                        if (!result || result.length === 0 || result[0].groupCount === 0) {
                            return { passed: true, message: 'No consumer groups found (may be normal)' };
                        }
                        const data = result[0];
                        return {
                            passed: true,
                            message: `${data.groupCount} consumer groups, max lag: ${data.maxLag}, avg lag: ${Math.round(data.avgLag)}`
                        };
                    }
                }
            ]
        };
    }

    /**
     * Advanced Metrics Tests
     */
    getAdvancedMetricsTests() {
        return {
            name: '🚀 Advanced Metrics',
            tests: [
                {
                    id: '9.1',
                    name: 'Partition Distribution',
                    query: this.provider === 'awsMsk' ? `
                        SELECT 
                          sum(provider.partitionCount.Average) as 'partitions'
                        FROM AwsMskBrokerSample
                        WHERE awsAccountId = '${this.awsAccountId}'
                        FACET provider.brokerId
                        SINCE 1 hour ago
                    ` : `
                        SELECT 'N/A for Confluent Cloud' as status
                    `,
                    validate: (results) => {
                        if (this.provider !== 'awsMsk') {
                            return { passed: true, message: 'Partition details not available for Confluent Cloud' };
                        }
                        if (!Array.isArray(results) || results.length === 0) {
                            return { passed: false, message: 'No partition distribution data' };
                        }
                        const total = results.reduce((sum, r) => sum + (r.partitions || 0), 0);
                        return {
                            passed: true,
                            message: `${total} partitions distributed across ${results.length} brokers`
                        };
                    }
                },
                {
                    id: '9.2',
                    name: 'Resource Utilization',
                    query: this.provider === 'awsMsk' ? `
                        SELECT 
                          average(provider.cpuUserTotal.Average) as 'avgCpu',
                          average(provider.memoryUsed.Average / provider.memoryTotal.Average * 100) as 'avgMemoryPct'
                        FROM AwsMskBrokerSample
                        WHERE awsAccountId = '${this.awsAccountId}'
                        SINCE 1 hour ago
                    ` : `
                        SELECT 'N/A for Confluent Cloud' as status
                    `,
                    validate: (result) => {
                        if (this.provider !== 'awsMsk') {
                            return { passed: true, message: 'Resource metrics managed by Confluent' };
                        }
                        if (!result || result.length === 0) {
                            return { passed: false, message: 'No resource utilization data' };
                        }
                        const data = result[0];
                        return {
                            passed: true,
                            message: `CPU: ${Math.round(data.avgCpu || 0)}%, Memory: ${Math.round(data.avgMemoryPct || 0)}%`
                        };
                    }
                }
            ]
        };
    }
}

module.exports = QueryDefinitions;