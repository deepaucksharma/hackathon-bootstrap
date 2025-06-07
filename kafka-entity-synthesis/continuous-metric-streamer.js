#!/usr/bin/env node

/**
 * Continuous Metric Streamer for UI Visibility
 * Maintains active metric flow to ensure entities remain visible in UI
 */

const axios = require('axios');
const EventEmitter = require('events');

class ContinuousMetricStreamer extends EventEmitter {
    constructor(config) {
        super();
        this.accountId = config.accountId;
        this.apiKey = config.apiKey;
        this.apiUrl = `https://insights-collector.newrelic.com/v1/accounts/${this.accountId}/events`;
        this.clusters = new Map();
        this.isStreaming = false;
        this.streamInterval = null;
        this.metricsInterval = 60000; // 1 minute default
    }

    /**
     * Start streaming metrics for a cluster
     */
    startStreaming(clusterConfig) {
        const {
            clusterName,
            brokerCount = 3,
            topicCount = 5,
            updateInterval = 60000, // milliseconds
            variability = 0.1 // 10% metric variability
        } = clusterConfig;

        console.log(`🚀 Starting metric stream for cluster: ${clusterName}`);
        console.log(`   Update interval: ${updateInterval / 1000} seconds`);
        console.log(`   Brokers: ${brokerCount}, Topics: ${topicCount}\n`);

        // Initialize cluster state
        this.clusters.set(clusterName, {
            name: clusterName,
            brokerCount,
            topicCount,
            variability,
            baseMetrics: this.generateBaseMetrics(brokerCount, topicCount),
            lastUpdate: Date.now(),
            eventCount: 0
        });

        // Start streaming if not already running
        if (!this.isStreaming) {
            this.isStreaming = true;
            this.streamInterval = setInterval(() => {
                this.streamMetrics();
            }, updateInterval);
            
            // Initial stream
            this.streamMetrics();
        }

        return {
            clusterName,
            status: 'streaming',
            updateInterval
        };
    }

    /**
     * Stop streaming for a specific cluster or all clusters
     */
    stopStreaming(clusterName = null) {
        if (clusterName) {
            this.clusters.delete(clusterName);
            console.log(`⏹️  Stopped streaming for cluster: ${clusterName}`);
            
            if (this.clusters.size === 0) {
                this.stopAllStreaming();
            }
        } else {
            this.stopAllStreaming();
        }
    }

    stopAllStreaming() {
        if (this.streamInterval) {
            clearInterval(this.streamInterval);
            this.streamInterval = null;
        }
        this.isStreaming = false;
        this.clusters.clear();
        console.log('⏹️  Stopped all metric streaming');
    }

    /**
     * Generate base metrics for consistent streaming
     */
    generateBaseMetrics(brokerCount, topicCount) {
        const metrics = {
            cluster: {
                activeControllers: 1,
                offlinePartitions: 0,
                underReplicatedPartitions: 0,
                totalPartitions: topicCount * 3,
                cpuUtilization: 30 + Math.random() * 20
            },
            brokers: []
        };

        // Generate per-broker metrics
        for (let i = 1; i <= brokerCount; i++) {
            metrics.brokers.push({
                id: i,
                bytesIn: 100000 + Math.random() * 50000,
                bytesOut: 80000 + Math.random() * 40000,
                messagesIn: 1000 + Math.random() * 500,
                cpuUser: 20 + Math.random() * 30,
                cpuSystem: 10 + Math.random() * 15,
                networkIn: 50000 + Math.random() * 25000,
                networkOut: 40000 + Math.random() * 20000,
                diskUsage: 40 + Math.random() * 20,
                partitionCount: Math.floor(topicCount * 3 / brokerCount)
            });
        }

        // Generate per-topic metrics
        metrics.topics = [];
        const topicNames = ['orders', 'payments', 'inventory', 'users', 'events', 
                           'logs', 'metrics', 'notifications', 'analytics', 'audit'];
        
        for (let i = 0; i < topicCount; i++) {
            const topicName = i < topicNames.length ? topicNames[i] : `topic-${i + 1}`;
            metrics.topics.push({
                name: topicName,
                bytesIn: 50000 + Math.random() * 25000,
                bytesOut: 40000 + Math.random() * 20000,
                messagesIn: 500 + Math.random() * 250,
                messagesOut: 400 + Math.random() * 200,
                consumerLag: Math.floor(Math.random() * 1000),
                partitions: 3,
                replicationFactor: Math.min(3, brokerCount)
            });
        }

        return metrics;
    }

    /**
     * Stream metrics for all registered clusters
     */
    async streamMetrics() {
        const timestamp = Date.now();
        const promises = [];

        for (const [clusterName, clusterData] of this.clusters) {
            const events = this.generateMetricEvents(clusterName, clusterData, timestamp);
            promises.push(this.submitEvents(events, clusterName));
            
            // Update cluster data
            clusterData.lastUpdate = timestamp;
            clusterData.eventCount += events.length;
        }

        await Promise.all(promises);
        
        this.emit('metricsStreamed', {
            timestamp,
            clusters: Array.from(this.clusters.keys()),
            totalEvents: promises.reduce((sum, p) => sum + p, 0)
        });
    }

    /**
     * Generate metric events with realistic variations
     */
    generateMetricEvents(clusterName, clusterData, timestamp) {
        const events = [];
        const { baseMetrics, variability } = clusterData;

        // Helper to add variation to metrics
        const vary = (value, v = variability) => {
            const change = value * v;
            return value + (Math.random() * change * 2 - change);
        };

        // 1. Cluster-level metrics
        events.push({
            eventType: "AwsMskClusterSample",
            entityName: clusterName,
            "provider.clusterName": clusterName,
            "provider.activeControllerCount.Sum": baseMetrics.cluster.activeControllers,
            "provider.offlinePartitionsCount.Sum": baseMetrics.cluster.offlinePartitions,
            "provider.underReplicatedPartitions.Sum": baseMetrics.cluster.underReplicatedPartitions,
            "provider.globalPartitionCount.Average": baseMetrics.cluster.totalPartitions,
            "provider.globalTopicCount.Average": clusterData.topicCount,
            "provider.cpuUtilization.Average": vary(baseMetrics.cluster.cpuUtilization),
            "aws.kafka.ClusterName": clusterName,
            "aws.msk.clusterName": clusterName,
            timestamp
        });

        // Add cluster metric event
        events.push({
            eventType: "Metric",
            metricName: "aws.kafka.ActiveControllerCount",
            "aws.kafka.ClusterName": clusterName,
            "entity.name": clusterName,
            "entity.type": "AWSMSKCLUSTER",
            value: baseMetrics.cluster.activeControllers,
            timestamp
        });

        // 2. Broker-level metrics
        baseMetrics.brokers.forEach(broker => {
            const brokerName = `${clusterName}-broker-${broker.id}`;
            
            // Broker sample
            events.push({
                eventType: "AwsMskBrokerSample",
                entityName: brokerName,
                displayName: brokerName,
                "provider.clusterName": clusterName,
                "provider.brokerId": broker.id.toString(),
                "provider.bytesInPerSec.Average": vary(broker.bytesIn),
                "provider.bytesOutPerSec.Average": vary(broker.bytesOut),
                "provider.messagesInPerSec.Average": vary(broker.messagesIn),
                "provider.cpuUser.Average": vary(broker.cpuUser),
                "provider.cpuSystem.Average": vary(broker.cpuSystem),
                "provider.networkRxRate.Average": vary(broker.networkIn),
                "provider.networkTxRate.Average": vary(broker.networkOut),
                "provider.diskUsedPercent.Average": vary(broker.diskUsage, 0.05),
                "provider.partitionCount.Sum": broker.partitionCount,
                "provider.underReplicatedPartitions.Sum": 0,
                "provider.underMinIsrPartitionCount.Sum": 0,
                "aws.kafka.ClusterName": clusterName,
                "aws.kafka.BrokerID": broker.id.toString(),
                timestamp
            });

            // Broker metric events
            events.push({
                eventType: "Metric",
                metricName: "aws.kafka.BytesInPerSec.byBroker",
                "aws.kafka.ClusterName": clusterName,
                "aws.kafka.BrokerID": broker.id.toString(),
                "entity.name": brokerName,
                "entity.type": "AWSMSKBROKER",
                value: vary(broker.bytesIn),
                timestamp
            });

            events.push({
                eventType: "Metric",
                metricName: "aws.kafka.CPUUser",
                "aws.kafka.ClusterName": clusterName,
                "aws.kafka.BrokerID": broker.id.toString(),
                value: vary(broker.cpuUser),
                timestamp
            });
        });

        // 3. Topic-level metrics
        baseMetrics.topics.forEach(topic => {
            const fullTopicName = `${clusterName}-${topic.name}`;
            
            // Topic samples for each broker (simulating partition distribution)
            baseMetrics.brokers.forEach(broker => {
                events.push({
                    eventType: "AwsMskTopicSample",
                    entityName: fullTopicName,
                    displayName: fullTopicName,
                    "provider.clusterName": clusterName,
                    "provider.topic": topic.name,
                    "provider.brokerId": broker.id.toString(),
                    "provider.bytesInPerSec.Average": vary(topic.bytesIn / baseMetrics.brokers.length),
                    "provider.bytesOutPerSec.Average": vary(topic.bytesOut / baseMetrics.brokers.length),
                    "provider.messagesInPerSec.Average": vary(topic.messagesIn / baseMetrics.brokers.length),
                    "provider.messagesOutPerSec.Average": vary(topic.messagesOut / baseMetrics.brokers.length),
                    "provider.partitionCount": topic.partitions,
                    "provider.replicationFactor": topic.replicationFactor,
                    "aws.kafka.ClusterName": clusterName,
                    "aws.kafka.Topic": topic.name,
                    "aws.kafka.BrokerID": broker.id.toString(),
                    timestamp
                });
            });

            // Topic metric event
            events.push({
                eventType: "Metric",
                metricName: "aws.kafka.BytesInPerSec.byTopic",
                "aws.kafka.ClusterName": clusterName,
                "aws.kafka.Topic": topic.name,
                "entity.name": fullTopicName,
                "entity.type": "AWSMSKTOPIC",
                value: vary(topic.bytesIn),
                timestamp
            });

            // Consumer lag metric
            events.push({
                eventType: "Metric",
                metricName: "aws.kafka.ConsumerLag.byTopic",
                "aws.kafka.ClusterName": clusterName,
                "aws.kafka.Topic": topic.name,
                value: vary(topic.consumerLag, 0.5),
                timestamp
            });
        });

        // 4. Add some system health metrics
        events.push({
            eventType: "Metric",
            metricName: "aws.kafka.KafkaDataLogsDiskUsed",
            "aws.kafka.ClusterName": clusterName,
            value: vary(50, 0.1),
            unit: "Percent",
            timestamp
        });

        return events;
    }

    async submitEvents(events, clusterName) {
        try {
            await axios.post(this.apiUrl, events, {
                headers: {
                    'Api-Key': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log(`✅ Streamed ${events.length} metrics for ${clusterName}`);
            return events.length;
        } catch (error) {
            console.error(`❌ Failed to stream metrics for ${clusterName}:`, error.message);
            this.emit('error', { clusterName, error });
            return 0;
        }
    }

    /**
     * Get streaming status
     */
    getStatus() {
        const status = {
            isStreaming: this.isStreaming,
            clusterCount: this.clusters.size,
            clusters: []
        };

        for (const [name, data] of this.clusters) {
            status.clusters.push({
                name,
                lastUpdate: new Date(data.lastUpdate).toISOString(),
                eventCount: data.eventCount,
                brokerCount: data.brokerCount,
                topicCount: data.topicCount
            });
        }

        return status;
    }
}

// CLI interface with interactive mode
if (require.main === module) {
    const readline = require('readline');
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    async function main() {
        const config = {
            accountId: process.env.NEW_RELIC_ACCOUNT_ID,
            apiKey: process.env.NEW_RELIC_API_KEY
        };

        if (!config.accountId || !config.apiKey) {
            console.error('❌ Please set NEW_RELIC_ACCOUNT_ID and NEW_RELIC_API_KEY environment variables');
            process.exit(1);
        }

        const streamer = new ContinuousMetricStreamer(config);
        
        // Event listeners
        streamer.on('metricsStreamed', (data) => {
            console.log(`📊 Metrics streamed at ${new Date(data.timestamp).toLocaleTimeString()}`);
        });

        streamer.on('error', (data) => {
            console.error(`❌ Error for ${data.clusterName}:`, data.error.message);
        });

        console.log('🎮 Continuous Metric Streamer');
        console.log('============================\n');
        console.log('Commands:');
        console.log('  start <cluster-name>  - Start streaming for a cluster');
        console.log('  stop <cluster-name>   - Stop streaming for a cluster');
        console.log('  status               - Show streaming status');
        console.log('  exit                 - Exit the program\n');

        const prompt = () => {
            rl.question('> ', async (input) => {
                const [command, ...args] = input.trim().split(' ');

                switch (command) {
                    case 'start':
                        if (args.length === 0) {
                            console.log('Usage: start <cluster-name>');
                        } else {
                            const result = streamer.startStreaming({
                                clusterName: args[0],
                                brokerCount: 3,
                                topicCount: 5,
                                updateInterval: 60000
                            });
                            console.log(`Started streaming for: ${result.clusterName}`);
                        }
                        break;

                    case 'stop':
                        if (args.length === 0) {
                            streamer.stopStreaming();
                        } else {
                            streamer.stopStreaming(args[0]);
                        }
                        break;

                    case 'status':
                        const status = streamer.getStatus();
                        console.log('\n📊 Streaming Status:');
                        console.log(JSON.stringify(status, null, 2));
                        console.log();
                        break;

                    case 'exit':
                    case 'quit':
                        streamer.stopAllStreaming();
                        rl.close();
                        process.exit(0);
                        break;

                    default:
                        console.log('Unknown command. Type "help" for available commands.');
                }

                prompt();
            });
        };

        // Auto-start example
        const exampleCluster = `stream-test-${Date.now()}`;
        console.log(`📌 Auto-starting example cluster: ${exampleCluster}\n`);
        
        streamer.startStreaming({
            clusterName: exampleCluster,
            brokerCount: 3,
            topicCount: 5,
            updateInterval: 60000
        });

        prompt();
    }

    main().catch(console.error);
}

module.exports = { ContinuousMetricStreamer };