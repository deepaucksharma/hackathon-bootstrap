#!/usr/bin/env node

/**
 * Streamlined MSK Entity Experimentation Framework
 * Systematically tests different approaches to get entities in UI
 */

const axios = require('axios');
const fs = require('fs');

class StreamlinedExperimentRunner {
    constructor() {
        this.accountId = process.env.NEW_RELIC_ACCOUNT_ID;
        this.apiKey = process.env.NEW_RELIC_API_KEY;
        this.timestamp = Date.now();
        
        if (!this.accountId || !this.apiKey) {
            console.error('❌ Set NEW_RELIC_ACCOUNT_ID and NEW_RELIC_API_KEY');
            process.exit(1);
        }

        this.experiments = [];
        this.results = {
            timestamp: new Date().toISOString(),
            accountId: this.accountId,
            experiments: [],
            summary: {}
        };
    }

    /**
     * Define all experiments
     */
    defineExperiments() {
        // Experiment 1: Exact CloudWatch Metric Streams Format
        this.addExperiment({
            name: 'CloudWatch Metric Streams Exact Format',
            description: 'Mimics exact CloudWatch format with all fields',
            createEvents: (clusterName) => {
                const ts = Date.now();
                return [
                    // Metric event exactly as CloudWatch sends it
                    {
                        eventType: "Metric",
                        metricName: "aws.kafka.ActiveControllerCount",
                        metricType: "gauge",
                        unit: "Count",
                        value: 1,
                        timestamp: Math.floor(ts / 1000), // Unix timestamp
                        "aws.Namespace": "AWS/Kafka",
                        "aws.MetricName": "ActiveControllerCount",
                        "aws.Dimensions": [
                            { Name: "Cluster Name", Value: clusterName }
                        ],
                        "aws.kafka.ClusterName": clusterName,
                        "collector.name": "cloudwatch-metric-streams",
                        "collector.version": "1.0.0",
                        "newrelic.source": "aws.metric_stream.kafka"
                    },
                    // Add broker metric
                    {
                        eventType: "Metric",
                        metricName: "aws.kafka.BytesInPerSec",
                        metricType: "gauge",
                        unit: "Bytes",
                        value: 125000.5,
                        timestamp: Math.floor(ts / 1000),
                        "aws.Namespace": "AWS/Kafka",
                        "aws.MetricName": "BytesInPerSec",
                        "aws.Dimensions": [
                            { Name: "Cluster Name", Value: clusterName },
                            { Name: "Broker ID", Value: "1" }
                        ],
                        "aws.kafka.ClusterName": clusterName,
                        "aws.kafka.BrokerID": "1",
                        "collector.name": "cloudwatch-metric-streams"
                    }
                ];
            }
        });

        // Experiment 2: Infrastructure Agent Format
        this.addExperiment({
            name: 'Infrastructure Agent Integration Format',
            description: 'Uses infrastructure agent patterns',
            createEvents: (clusterName) => {
                const guid = this.generateGuid('cluster', clusterName);
                return [
                    {
                        eventType: "IntegrationEvent",
                        integrationName: "com.newrelic.kafka",
                        integrationVersion: "2.0.0",
                        targetEntityKey: `${this.accountId}:awsmsk:${clusterName}`,
                        targetEntityName: clusterName,
                        targetEntityGuid: guid,
                        summary: "Kafka cluster integration",
                        category: "integration",
                        provider: "kafka",
                        timestamp: Date.now()
                    },
                    {
                        eventType: "SystemSample",
                        entityKey: `${this.accountId}:awsmsk:${clusterName}`,
                        entityName: clusterName,
                        entityGuid: guid,
                        "entity.guid": guid,
                        "entity.name": clusterName,
                        "entity.type": "AWSMSKCLUSTER",
                        hostname: clusterName,
                        awsRegion: "us-east-1",
                        provider: "awsmsk",
                        timestamp: Date.now()
                    }
                ];
            }
        });

        // Experiment 3: Entity API Pattern
        this.addExperiment({
            name: 'Entity API Submission Pattern',
            description: 'Direct entity creation attempt',
            createEvents: (clusterName) => {
                const guid = this.generateGuid('cluster', clusterName);
                return [
                    {
                        eventType: "InfrastructureEvent",
                        entityKeys: [clusterName],
                        entityName: clusterName,
                        entityGuid: guid,
                        entityType: "AWSMSKCLUSTER",
                        "entity.guid": guid,
                        "entity.name": clusterName,
                        "entity.type": "AWSMSKCLUSTER",
                        "nr.entityType": "AWSMSKCLUSTER",
                        domain: "INFRA",
                        type: "AWSMSKCLUSTER",
                        integrationName: "newrelic-kafka-integration",
                        integrationVersion: "1.0.0",
                        agentName: "Infrastructure",
                        agentVersion: "1.0.0",
                        timestamp: Date.now()
                    }
                ];
            }
        });

        // Experiment 4: Combined Approach
        this.addExperiment({
            name: 'Combined Multi-Event Approach',
            description: 'Sends multiple event types together',
            createEvents: (clusterName) => {
                const guid = this.generateGuid('cluster', clusterName);
                const ts = Date.now();
                return [
                    // Infrastructure event
                    {
                        eventType: "InfrastructureEvent",
                        entityKeys: [clusterName],
                        entityName: clusterName,
                        entityGuid: guid,
                        entityType: "AWSMSKCLUSTER",
                        integrationName: "com.newrelic.kafka",
                        timestamp: ts
                    },
                    // Sample event
                    {
                        eventType: "AwsMskClusterSample",
                        entityGuid: guid,
                        entityName: clusterName,
                        entityType: "AWSMSKCLUSTER",
                        domain: "INFRA",
                        type: "AWSMSKCLUSTER",
                        "provider.clusterName": clusterName,
                        "provider.activeControllerCount.Sum": 1,
                        timestamp: ts
                    },
                    // Metric event
                    {
                        eventType: "Metric",
                        metricName: "aws.kafka.ActiveControllerCount",
                        "entity.guid": guid,
                        "entity.name": clusterName,
                        "entity.type": "AWSMSKCLUSTER",
                        "aws.kafka.ClusterName": clusterName,
                        value: 1,
                        timestamp: Math.floor(ts / 1000)
                    }
                ];
            }
        });

        // Experiment 5: Minimal Working Set
        this.addExperiment({
            name: 'Minimal Required Fields Test',
            description: 'Tests absolute minimum fields needed',
            createEvents: (clusterName) => {
                return [
                    {
                        eventType: "AwsMskClusterSample",
                        entityName: clusterName,
                        entityType: "AWSMSKCLUSTER",
                        timestamp: Date.now()
                    }
                ];
            }
        });
    }

    addExperiment(experiment) {
        this.experiments.push({
            id: this.experiments.length + 1,
            ...experiment,
            clusterName: `exp${this.experiments.length + 1}-${this.timestamp}`
        });
    }

    /**
     * Run all experiments
     */
    async runExperiments() {
        console.log('🧪 Streamlined MSK Entity Experiments');
        console.log('====================================\n');
        console.log(`Account: ${this.accountId}`);
        console.log(`Experiments: ${this.experiments.length}\n`);

        for (const experiment of this.experiments) {
            await this.runSingleExperiment(experiment);
            
            // Wait between experiments
            if (experiment.id < this.experiments.length) {
                console.log('⏳ Waiting 15 seconds before next experiment...\n');
                await new Promise(resolve => setTimeout(resolve, 15000));
            }
        }

        // Wait for entity synthesis
        console.log('⏳ Waiting 30 seconds for entity synthesis...\n');
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Verify all experiments
        await this.verifyAllExperiments();

        // Generate report
        this.generateReport();

        return this.results;
    }

    async runSingleExperiment(experiment) {
        console.log(`🔬 Experiment ${experiment.id}: ${experiment.name}`);
        console.log(`   ${experiment.description}`);
        console.log(`   Cluster: ${experiment.clusterName}`);
        
        try {
            // Create events
            const events = experiment.createEvents(experiment.clusterName);
            console.log(`   Events: ${events.length} (${events.map(e => e.eventType).join(', ')})`);
            
            // Submit events
            const startTime = Date.now();
            await this.submitEvents(events);
            const submitTime = Date.now() - startTime;
            
            console.log(`   ✅ Submitted in ${submitTime}ms`);
            
            // Initial check
            await new Promise(resolve => setTimeout(resolve, 5000));
            const quickCheck = await this.quickVerify(experiment.clusterName);
            console.log(`   Quick check: ${quickCheck.hasEvents ? '✅ Events found' : '❌ No events yet'}`);
            
            // Store result
            this.results.experiments.push({
                ...experiment,
                events: events.length,
                eventTypes: [...new Set(events.map(e => e.eventType))],
                submitTime,
                quickCheck
            });
            
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
            this.results.experiments.push({
                ...experiment,
                error: error.message
            });
        }
        
        console.log('');
    }

    async submitEvents(events) {
        const response = await axios.post(
            `https://insights-collector.newrelic.com/v1/accounts/${this.accountId}/events`,
            events,
            {
                headers: {
                    'Api-Key': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );
        
        if (response.status !== 200) {
            throw new Error(`API returned ${response.status}`);
        }
    }

    async quickVerify(clusterName) {
        const queries = [
            `FROM AwsMskClusterSample SELECT count(*) WHERE entityName = '${clusterName}' OR provider.clusterName = '${clusterName}' SINCE 5 minutes ago`,
            `FROM Metric SELECT count(*) WHERE entity.name = '${clusterName}' OR aws.kafka.ClusterName = '${clusterName}' SINCE 5 minutes ago`,
            `FROM InfrastructureEvent SELECT count(*) WHERE entityName = '${clusterName}' SINCE 5 minutes ago`
        ];

        let totalEvents = 0;
        for (const query of queries) {
            try {
                const response = await this.runNRQL(query);
                const count = response?.results?.[0]?.count || 0;
                totalEvents += count;
            } catch (error) {
                // Ignore individual query errors
            }
        }

        return {
            hasEvents: totalEvents > 0,
            eventCount: totalEvents
        };
    }

    async verifyAllExperiments() {
        console.log('🔍 Verifying All Experiments\n');

        for (const experiment of this.results.experiments) {
            if (experiment.error) continue;
            
            console.log(`Verifying Experiment ${experiment.id}: ${experiment.name}`);
            
            const verification = await this.completeVerification(experiment.clusterName);
            experiment.verification = verification;
            
            const status = this.getVerificationStatus(verification);
            console.log(`   Status: ${status}\n`);
        }
    }

    async completeVerification(clusterName) {
        const verification = {
            hasEvents: false,
            hasEntity: false,
            inMessageQueues: false,
            eventCounts: {},
            entityDetails: null
        };

        // Check events
        const eventTypes = ['AwsMskClusterSample', 'Metric', 'InfrastructureEvent', 'IntegrationEvent', 'SystemSample'];
        for (const eventType of eventTypes) {
            try {
                const query = `FROM ${eventType} SELECT count(*) WHERE entityName = '${clusterName}' OR entity.name = '${clusterName}' OR provider.clusterName = '${clusterName}' OR aws.kafka.ClusterName = '${clusterName}' SINCE 10 minutes ago`;
                const response = await this.runNRQL(query);
                const count = response?.results?.[0]?.count || 0;
                if (count > 0) {
                    verification.eventCounts[eventType] = count;
                    verification.hasEvents = true;
                }
            } catch (error) {
                // Ignore
            }
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
                                type
                                reporting
                            }
                        }
                    }
                }
            }`;
            
            const response = await this.runGraphQL(entityQuery);
            const entities = response?.data?.actor?.entitySearch?.results?.entities || [];
            
            if (entities.length > 0) {
                verification.hasEntity = true;
                verification.entityDetails = entities[0];
                
                // Additional check for message queues visibility
                if (entities[0].reporting) {
                    verification.inMessageQueues = true;
                }
            }
        } catch (error) {
            // Ignore
        }

        return verification;
    }

    getVerificationStatus(verification) {
        if (verification.inMessageQueues) {
            return '✅ Full Success - Visible in Message Queues UI';
        } else if (verification.hasEntity) {
            return '🟡 Partial Success - Entity exists but not in UI';
        } else if (verification.hasEvents) {
            return '🟠 Events Only - No entity synthesis occurred';
        } else {
            return '❌ Failed - No events or entities found';
        }
    }

    generateReport() {
        console.log('\n📊 Experiment Summary');
        console.log('===================\n');

        // Count successes
        let fullSuccess = 0;
        let partialSuccess = 0;
        let eventsOnly = 0;
        let failed = 0;

        this.results.experiments.forEach(exp => {
            if (exp.error) {
                failed++;
            } else if (exp.verification) {
                if (exp.verification.inMessageQueues) fullSuccess++;
                else if (exp.verification.hasEntity) partialSuccess++;
                else if (exp.verification.hasEvents) eventsOnly++;
                else failed++;
            }
        });

        this.results.summary = {
            total: this.experiments.length,
            fullSuccess,
            partialSuccess,
            eventsOnly,
            failed
        };

        console.log(`Total Experiments: ${this.results.summary.total}`);
        console.log(`✅ Full Success: ${fullSuccess}`);
        console.log(`🟡 Partial Success: ${partialSuccess}`);
        console.log(`🟠 Events Only: ${eventsOnly}`);
        console.log(`❌ Failed: ${failed}\n`);

        // Detailed results
        console.log('Detailed Results:');
        console.log('-----------------');
        
        this.results.experiments.forEach(exp => {
            console.log(`\n${exp.id}. ${exp.name}`);
            if (exp.error) {
                console.log(`   Status: ❌ Error - ${exp.error}`);
            } else if (exp.verification) {
                console.log(`   Status: ${this.getVerificationStatus(exp.verification)}`);
                console.log(`   Events: ${Object.entries(exp.verification.eventCounts).map(([k,v]) => `${k}(${v})`).join(', ') || 'None'}`);
                if (exp.verification.entityDetails) {
                    console.log(`   Entity: ${exp.verification.entityDetails.name} (${exp.verification.entityDetails.reporting ? 'reporting' : 'not reporting'})`);
                }
            }
        });

        // Recommendations
        console.log('\n💡 Recommendations');
        console.log('==================\n');

        if (fullSuccess > 0) {
            const successful = this.results.experiments.find(e => e.verification?.inMessageQueues);
            console.log(`✅ Success! Use the "${successful.name}" approach.`);
            console.log(`   This experiment successfully created entities visible in the UI.`);
        } else if (partialSuccess > 0) {
            console.log('🟡 Entities are being created but not appearing in Message Queues UI.');
            console.log('   This suggests the entity format is correct but additional fields or integrations are needed.');
        } else if (eventsOnly > 0) {
            console.log('🟠 Events are being stored but entity synthesis is not occurring.');
            console.log('   This confirms that direct event submission cannot create MSK entities.');
            console.log('   You must use an official integration (CloudWatch Metric Streams or nri-kafka).');
        } else {
            console.log('❌ No approaches succeeded. Check:');
            console.log('   1. API key permissions');
            console.log('   2. Account ID is correct');
            console.log('   3. Entity synthesis is enabled for your account');
        }

        // Save report
        const filename = `experiment-results-${this.timestamp}.json`;
        fs.writeFileSync(filename, JSON.stringify(this.results, null, 2));
        console.log(`\n💾 Detailed results saved to: ${filename}`);
    }

    async runNRQL(query) {
        const response = await axios.get(
            `https://insights-api.newrelic.com/v1/accounts/${this.accountId}/query`,
            {
                params: { nrql: query },
                headers: {
                    'X-Query-Key': this.apiKey,
                    'Accept': 'application/json'
                },
                timeout: 10000
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
                },
                timeout: 10000
            }
        );
        return response.data;
    }

    generateGuid(type, name) {
        const components = [this.accountId, 'INFRA', type.toUpperCase(), name];
        return Buffer.from(components.join('|'))
            .toString('base64')
            .replace(/[+/=]/g, '')
            .substring(0, 32);
    }
}

// Main execution
async function main() {
    const runner = new StreamlinedExperimentRunner();
    runner.defineExperiments();
    
    console.log('🚀 Starting streamlined experiments...\n');
    console.log('This will test multiple approaches systematically.');
    console.log('Total time: ~3 minutes\n');
    
    await runner.runExperiments();
    
    console.log('\n✅ Experimentation complete!');
    console.log('\nCheck the Message Queues UI:');
    console.log('https://one.newrelic.com/nr1-core/message-queues\n');
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { StreamlinedExperimentRunner };