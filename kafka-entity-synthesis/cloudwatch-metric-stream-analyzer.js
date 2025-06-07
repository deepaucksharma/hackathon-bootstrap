#!/usr/bin/env node

/**
 * CloudWatch Metric Streams Format Analyzer
 * Analyzes and generates exact CloudWatch format for MSK entities
 */

const axios = require('axios');
const fs = require('fs');

class CloudWatchMetricStreamAnalyzer {
    constructor() {
        this.accountId = process.env.NEW_RELIC_ACCOUNT_ID;
        this.apiKey = process.env.NEW_RELIC_API_KEY;
        
        if (!this.accountId || !this.apiKey) {
            console.error('❌ Set NEW_RELIC_ACCOUNT_ID and NEW_RELIC_API_KEY');
            process.exit(1);
        }
    }

    /**
     * Analyze existing CloudWatch metrics to understand exact format
     */
    async analyzeExistingMetrics() {
        console.log('🔍 CloudWatch Metric Streams Format Analysis');
        console.log('===========================================\n');

        // Step 1: Find any existing CloudWatch metrics
        console.log('1️⃣ Searching for existing CloudWatch metrics...\n');
        
        const queries = [
            {
                name: 'AWS Kafka Metrics',
                query: `FROM Metric SELECT * WHERE metricName LIKE 'aws.kafka%' LIMIT 10`
            },
            {
                name: 'CloudWatch Collector Metrics',
                query: `FROM Metric SELECT * WHERE collector.name = 'cloudwatch-metric-streams' LIMIT 10`
            },
            {
                name: 'AWS MSK Specific',
                query: `FROM Metric SELECT * WHERE aws.Namespace = 'AWS/Kafka' LIMIT 10`
            }
        ];

        const foundMetrics = [];
        
        for (const q of queries) {
            try {
                console.log(`Checking: ${q.name}`);
                const response = await this.runNRQL(q.query);
                
                if (response?.results?.length > 0) {
                    console.log(`   ✅ Found ${response.results.length} metrics`);
                    foundMetrics.push(...response.results);
                    
                    // Analyze first metric structure
                    if (response.results[0]) {
                        console.log('\n   Sample metric structure:');
                        this.analyzeMetricStructure(response.results[0]);
                    }
                } else {
                    console.log(`   ❌ No metrics found`);
                }
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
            }
            console.log('');
        }

        return foundMetrics;
    }

    analyzeMetricStructure(metric) {
        const importantFields = [
            'metricName', 'aws.Namespace', 'aws.MetricName', 
            'collector.name', 'entity.type', 'entity.guid',
            'aws.kafka.ClusterName', 'aws.Dimensions'
        ];

        importantFields.forEach(field => {
            if (metric[field] !== undefined) {
                console.log(`     ${field}: ${JSON.stringify(metric[field])}`);
            }
        });
    }

    /**
     * Generate exact CloudWatch Metric Streams format
     */
    generateCloudWatchFormat(clusterName, options = {}) {
        console.log('\n🏗️  Generating CloudWatch Metric Streams Format');
        console.log('==============================================\n');

        const {
            region = 'us-east-1',
            accountId = '123456789012',
            streamName = 'NewRelicMetricStream'
        } = options;

        const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp
        const events = [];

        // 1. Cluster-level metrics (exactly as CloudWatch sends them)
        const clusterMetrics = [
            {
                metricName: 'ActiveControllerCount',
                value: 1,
                unit: 'Count',
                statistic: 'Sum'
            },
            {
                metricName: 'OfflinePartitionsCount',
                value: 0,
                unit: 'Count',
                statistic: 'Sum'
            },
            {
                metricName: 'GlobalPartitionCount',
                value: 15,
                unit: 'Count',
                statistic: 'Average'
            },
            {
                metricName: 'GlobalTopicCount',
                value: 5,
                unit: 'Count',
                statistic: 'Average'
            }
        ];

        clusterMetrics.forEach(metric => {
            events.push({
                eventType: "Metric",
                
                // Standard metric fields
                metricName: `aws.kafka.${metric.metricName}`,
                metricType: "gauge",
                value: metric.value,
                unit: metric.unit,
                timestamp: timestamp,
                
                // AWS-specific fields
                "aws.Namespace": "AWS/Kafka",
                "aws.MetricName": metric.metricName,
                "aws.Dimensions": [
                    {
                        "Name": "Cluster Name",
                        "Value": clusterName
                    }
                ],
                "aws.Region": region,
                "aws.AccountId": accountId,
                
                // CloudWatch Metric Streams metadata
                "collector.name": "cloudwatch-metric-streams",
                "collector.version": "1.0.0",
                "newrelic.source": "aws.metric_stream.kafka",
                "instrumentation.name": "cloudwatch-metric-streams",
                "instrumentation.provider": "aws",
                "instrumentation.stream.name": streamName,
                
                // Entity association (critical for UI visibility)
                "entity.guid": this.generateEntityGuid('cluster', clusterName),
                "entity.name": clusterName,
                "entity.type": "AWSMSKCLUSTER",
                
                // Additional cluster identification
                "aws.kafka.ClusterName": clusterName,
                "aws.msk.clusterName": clusterName,
                
                // Metadata
                "aws.MetricStreamName": streamName,
                "newrelic.MetricStreamVersion": "1.0"
            });
        });

        // 2. Broker-level metrics
        for (let brokerId = 1; brokerId <= 3; brokerId++) {
            const brokerMetrics = [
                {
                    metricName: 'BytesInPerSec',
                    value: 125000.5 + Math.random() * 50000,
                    unit: 'Bytes',
                    statistic: 'Average'
                },
                {
                    metricName: 'BytesOutPerSec',
                    value: 100000.2 + Math.random() * 40000,
                    unit: 'Bytes',
                    statistic: 'Average'
                },
                {
                    metricName: 'CpuUser',
                    value: 25.5 + Math.random() * 30,
                    unit: 'Percent',
                    statistic: 'Average'
                }
            ];

            brokerMetrics.forEach(metric => {
                events.push({
                    eventType: "Metric",
                    metricName: `aws.kafka.${metric.metricName}.byBroker`,
                    metricType: "gauge",
                    value: metric.value,
                    unit: metric.unit,
                    timestamp: timestamp,
                    
                    "aws.Namespace": "AWS/Kafka",
                    "aws.MetricName": metric.metricName,
                    "aws.Dimensions": [
                        {
                            "Name": "Cluster Name",
                            "Value": clusterName
                        },
                        {
                            "Name": "Broker ID",
                            "Value": brokerId.toString()
                        }
                    ],
                    
                    "collector.name": "cloudwatch-metric-streams",
                    "newrelic.source": "aws.metric_stream.kafka",
                    
                    // Entity association for broker
                    "entity.guid": this.generateEntityGuid('broker', `${clusterName}-broker-${brokerId}`),
                    "entity.name": `${clusterName}-broker-${brokerId}`,
                    "entity.type": "AWSMSKBROKER",
                    
                    "aws.kafka.ClusterName": clusterName,
                    "aws.kafka.BrokerID": brokerId.toString(),
                    "aws.msk.brokerId": brokerId.toString()
                });
            });
        }

        // 3. Topic-level metrics
        const topics = ['orders', 'payments', 'inventory'];
        topics.forEach(topicName => {
            const topicMetrics = [
                {
                    metricName: 'BytesInPerSec',
                    value: 50000 + Math.random() * 25000,
                    unit: 'Bytes',
                    statistic: 'Average'
                },
                {
                    metricName: 'MessagesInPerSec',
                    value: 1000 + Math.random() * 500,
                    unit: 'Count',
                    statistic: 'Average'
                }
            ];

            topicMetrics.forEach(metric => {
                events.push({
                    eventType: "Metric",
                    metricName: `aws.kafka.${metric.metricName}.byTopic`,
                    metricType: "gauge",
                    value: metric.value,
                    unit: metric.unit,
                    timestamp: timestamp,
                    
                    "aws.Namespace": "AWS/Kafka",
                    "aws.MetricName": metric.metricName,
                    "aws.Dimensions": [
                        {
                            "Name": "Cluster Name",
                            "Value": clusterName
                        },
                        {
                            "Name": "Topic",
                            "Value": topicName
                        }
                    ],
                    
                    "collector.name": "cloudwatch-metric-streams",
                    "newrelic.source": "aws.metric_stream.kafka",
                    
                    // Entity association for topic
                    "entity.guid": this.generateEntityGuid('topic', `${clusterName}-${topicName}`),
                    "entity.name": `${clusterName}-${topicName}`,
                    "entity.type": "AWSMSKTOPIC",
                    "displayName": `${clusterName}-${topicName}`,
                    
                    "aws.kafka.ClusterName": clusterName,
                    "aws.kafka.Topic": topicName,
                    "aws.msk.topic": topicName
                });
            });
        });

        console.log(`Generated ${events.length} CloudWatch metric events`);
        console.log('\nKey characteristics:');
        console.log('- Unix timestamps (seconds, not milliseconds)');
        console.log('- AWS Dimensions array format');
        console.log('- Specific metric name patterns (aws.kafka.*)');
        console.log('- Entity GUID association');
        console.log('- CloudWatch collector metadata\n');

        return events;
    }

    /**
     * Submit CloudWatch format events
     */
    async submitCloudWatchEvents(clusterName) {
        console.log('📤 Submitting CloudWatch Format Events');
        console.log('=====================================\n');

        const events = this.generateCloudWatchFormat(clusterName);
        
        try {
            const response = await axios.post(
                `https://insights-collector.newrelic.com/v1/accounts/${this.accountId}/events`,
                events,
                {
                    headers: {
                        'Api-Key': this.apiKey,
                        'Content-Type': 'application/json',
                        'X-Insert-Key': this.apiKey // Alternative header
                    }
                }
            );

            console.log('✅ Events submitted successfully');
            console.log(`   Cluster: ${clusterName}`);
            console.log(`   Events: ${events.length}`);
            
            // Save events for reference
            const filename = `cloudwatch-events-${Date.now()}.json`;
            fs.writeFileSync(filename, JSON.stringify(events, null, 2));
            console.log(`\n💾 Events saved to: ${filename}`);
            
            return { success: true, clusterName, eventCount: events.length };
            
        } catch (error) {
            console.error('❌ Submission failed:', error.response?.data || error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Verify CloudWatch entities
     */
    async verifyCloudWatchEntities(clusterName) {
        console.log('\n🔍 Verifying CloudWatch Entities');
        console.log('================================\n');

        // Check metrics
        const metricQuery = `FROM Metric 
            SELECT count(*) 
            WHERE aws.kafka.ClusterName = '${clusterName}' 
            AND collector.name = 'cloudwatch-metric-streams'
            SINCE 5 minutes ago`;

        try {
            const response = await this.runNRQL(metricQuery);
            const count = response?.results?.[0]?.count || 0;
            console.log(`Metric events: ${count > 0 ? '✅' : '❌'} (${count} found)`);
        } catch (error) {
            console.log(`Metric events: ❌ Error`);
        }

        // Check entity
        try {
            const entityQuery = `{
                actor {
                    entitySearch(query: "domain='INFRA' AND type='AWSMSKCLUSTER' AND name='${clusterName}'") {
                        count
                        results {
                            entities {
                                guid
                                name
                                reporting
                                tags {
                                    key
                                    values
                                }
                            }
                        }
                    }
                }
            }`;

            const response = await this.runGraphQL(entityQuery);
            const entities = response?.data?.actor?.entitySearch?.results?.entities || [];
            
            if (entities.length > 0) {
                console.log(`Entity created: ✅`);
                console.log(`   Name: ${entities[0].name}`);
                console.log(`   Reporting: ${entities[0].reporting ? 'Yes' : 'No'}`);
                
                // Check for CloudWatch tags
                const cwTags = entities[0].tags?.filter(t => 
                    t.key.includes('collector') || t.key.includes('aws')
                ) || [];
                
                if (cwTags.length > 0) {
                    console.log(`   CloudWatch tags: ${cwTags.map(t => t.key).join(', ')}`);
                }
            } else {
                console.log(`Entity created: ❌`);
            }
        } catch (error) {
            console.log(`Entity check: ❌ Error`);
        }
    }

    generateEntityGuid(type, name) {
        const components = [this.accountId, 'INFRA', type.toUpperCase(), name];
        return Buffer.from(components.join('|'))
            .toString('base64')
            .replace(/[+/=]/g, '')
            .substring(0, 32);
    }

    async runNRQL(query) {
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
    }

    async runGraphQL(query) {
        const response = await axios.post(
            'https://api.newrelic.com/graphql',
            { query },
            {
                headers: {
                    'Api-Key': this.apiKey,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    }
}

// Main execution
async function main() {
    const analyzer = new CloudWatchMetricStreamAnalyzer();
    
    // Analyze existing metrics
    await analyzer.analyzeExistingMetrics();
    
    // Submit new CloudWatch format events
    const clusterName = process.argv[2] || `cw-test-${Date.now()}`;
    const result = await analyzer.submitCloudWatchEvents(clusterName);
    
    if (result.success) {
        // Wait and verify
        console.log('\n⏳ Waiting 30 seconds for processing...');
        await new Promise(resolve => setTimeout(resolve, 30000));
        
        await analyzer.verifyCloudWatchEntities(clusterName);
        
        console.log('\n📋 Next Steps:');
        console.log('1. Check Message Queues UI:');
        console.log('   https://one.newrelic.com/nr1-core/message-queues');
        console.log('2. Check Entity Explorer:');
        console.log(`   https://one.newrelic.com/redirect/entity/${analyzer.accountId}`);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { CloudWatchMetricStreamAnalyzer };