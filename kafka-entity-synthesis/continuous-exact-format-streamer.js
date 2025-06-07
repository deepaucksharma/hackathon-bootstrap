#!/usr/bin/env node

/**
 * Continuous Exact Format Streamer
 * 
 * Continuously streams MSK metrics in the exact working format
 * to ensure data freshness and UI visibility
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load environment
function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const match = line.match(/^([^=:#]+?)[=:](.*)/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim().replace(/^["']|["']$/g, '');
                process.env[key] = value;
            }
        });
    }
}

class ContinuousExactFormatStreamer {
    constructor() {
        loadEnv();
        
        this.accountId = process.env.ACC;
        this.insertKey = process.env.IKEY;
        this.userKey = process.env.UKEY;
        
        if (!this.accountId || !this.insertKey) {
            console.error('❌ Missing required environment variables');
            process.exit(1);
        }
        
        // Configuration
        this.awsAccountId = '123456789012';
        this.awsRegion = 'us-east-1';
        this.streamInterval = 5 * 60 * 1000; // 5 minutes
        this.metricsHistory = new Map(); // Track metric trends
        
        // Metric ranges for realistic variations
        this.metricRanges = {
            cluster: {
                activeControllers: { min: 1, max: 1 },
                offlinePartitions: { min: 0, max: 0 },
                globalPartitions: { min: 25, max: 35 },
                globalTopics: { min: 5, max: 8 }
            },
            broker: {
                bytesInPerSec: { min: 500000, max: 2000000 },
                bytesOutPerSec: { min: 400000, max: 1800000 },
                messagesInPerSec: { min: 500, max: 2000 },
                cpuUser: { min: 15, max: 65 },
                memoryUsed: { min: 30, max: 70 },
                diskUsed: { min: 20, max: 60 }
            },
            topic: {
                bytesInPerSec: { min: 10000, max: 100000 },
                bytesOutPerSec: { min: 8000, max: 90000 },
                messagesInPerSec: { min: 10, max: 200 },
                offsetLag: { min: 0, max: 100 }
            }
        };
    }

    /**
     * Generate realistic metric value with trends
     */
    generateMetricValue(metricType, metricName, previousValue = null) {
        const range = this.metricRanges[metricType]?.[metricName];
        if (!range) return Math.random() * 1000;
        
        let value;
        if (previousValue !== null) {
            // Create realistic trends
            const change = (Math.random() - 0.5) * 0.2; // ±20% change
            value = previousValue * (1 + change);
            value = Math.max(range.min, Math.min(range.max, value));
        } else {
            // Initial random value
            value = range.min + Math.random() * (range.max - range.min);
        }
        
        return Math.round(value);
    }

    /**
     * Generate all aggregations for a metric
     */
    generateAggregations(baseValue, sampleCount = 60) {
        const variance = 0.1; // 10% variance
        
        return {
            Average: baseValue,
            Sum: baseValue * sampleCount,
            Maximum: Math.round(baseValue * (1 + variance)),
            Minimum: Math.round(baseValue * (1 - variance)),
            SampleCount: sampleCount
        };
    }

    /**
     * Create cluster event with realistic metrics
     */
    createClusterEvent(clusterName, iteration) {
        const timestamp = Date.now();
        const clusterGuid = this.generateEntityGuid('AWSMSKCLUSTER', clusterName);
        const clusterArn = `arn:aws:kafka:${this.awsRegion}:${this.awsAccountId}:cluster/${clusterName}/${crypto.randomBytes(8).toString('hex')}`;
        
        // Get previous values for trends
        const historyKey = `cluster:${clusterName}`;
        const prevMetrics = this.metricsHistory.get(historyKey) || {};
        
        // Generate new metrics with trends
        const metrics = {
            activeControllers: this.generateMetricValue('cluster', 'activeControllers', prevMetrics.activeControllers),
            offlinePartitions: 0, // Always 0 for healthy cluster
            globalPartitions: this.generateMetricValue('cluster', 'globalPartitions', prevMetrics.globalPartitions),
            globalTopics: this.generateMetricValue('cluster', 'globalTopics', prevMetrics.globalTopics)
        };
        
        // Store for next iteration
        this.metricsHistory.set(historyKey, metrics);
        
        const event = {
            eventType: "AwsMskClusterSample",
            timestamp,
            entityGuid: clusterGuid,
            entityName: clusterName,
            provider: "AwsMskCluster",
            clusterName: clusterName,
            "provider.clusterName": clusterName,
            "provider.accountId": this.awsAccountId,
            "provider.region": this.awsRegion,
            "provider.awsRegion": this.awsRegion,
            "provider.externalId": clusterArn,
            "provider.clusterArn": clusterArn,
            "aws.accountId": this.awsAccountId,
            "aws.region": this.awsRegion,
            "awsAccountId": this.awsAccountId,
            "awsRegion": this.awsRegion,
            "provider.clusterState": "ACTIVE",
            "provider.enhancedMonitoring": "PER_BROKER",
            "collector.name": "cloudwatch-metric-streams",
            "collector.version": "1.8.0",
            
            // Add iteration info
            "streaming.iteration": iteration,
            "streaming.timestamp": new Date().toISOString()
        };
        
        // Add metric aggregations
        Object.entries(metrics).forEach(([metric, value]) => {
            const aggregations = this.generateAggregations(value);
            Object.entries(aggregations).forEach(([agg, aggValue]) => {
                event[`provider.${metric}Count.${agg}`] = aggValue;
            });
        });
        
        return event;
    }

    /**
     * Create broker events with realistic variations
     */
    createBrokerEvents(clusterName, iteration) {
        const events = [];
        const clusterArn = `arn:aws:kafka:${this.awsRegion}:${this.awsAccountId}:cluster/${clusterName}/${crypto.randomBytes(8).toString('hex')}`;
        
        for (let i = 1; i <= 3; i++) {
            const timestamp = Date.now();
            const brokerName = `${clusterName}-broker-${i}`;
            const brokerIdentifier = `${clusterName}/broker-${i}`;
            const brokerGuid = this.generateEntityGuid('AWSMSKBROKER', brokerIdentifier);
            
            // Get previous metrics
            const historyKey = `broker:${brokerIdentifier}`;
            const prevMetrics = this.metricsHistory.get(historyKey) || {};
            
            // Generate trending metrics
            const metrics = {
                bytesInPerSec: this.generateMetricValue('broker', 'bytesInPerSec', prevMetrics.bytesInPerSec),
                bytesOutPerSec: this.generateMetricValue('broker', 'bytesOutPerSec', prevMetrics.bytesOutPerSec),
                messagesInPerSec: this.generateMetricValue('broker', 'messagesInPerSec', prevMetrics.messagesInPerSec),
                cpuUser: this.generateMetricValue('broker', 'cpuUser', prevMetrics.cpuUser),
                memoryUsed: this.generateMetricValue('broker', 'memoryUsed', prevMetrics.memoryUsed),
                diskUsed: this.generateMetricValue('broker', 'diskUsed', prevMetrics.diskUsed)
            };
            
            this.metricsHistory.set(historyKey, metrics);
            
            const event = {
                eventType: "AwsMskBrokerSample",
                timestamp,
                entityGuid: brokerGuid,
                entityName: brokerName,
                provider: "AwsMskBroker",
                clusterName: clusterName,
                "provider.clusterName": clusterName,
                "provider.brokerId": i.toString(),
                "provider.accountId": this.awsAccountId,
                "provider.region": this.awsRegion,
                "provider.awsRegion": this.awsRegion,
                "provider.externalId": `${clusterArn}/broker-${i}`,
                "provider.clusterArn": clusterArn,
                "aws.accountId": this.awsAccountId,
                "aws.region": this.awsRegion,
                "aws.availabilityZone": `us-east-1${String.fromCharCode(96 + i)}`,
                "aws.kafka.BrokerID": i.toString(),
                "awsAccountId": this.awsAccountId,
                "awsRegion": this.awsRegion,
                "awsMskBrokerId": i.toString(),
                "collector.name": "cloudwatch-metric-streams",
                "collector.version": "1.8.0",
                "streaming.iteration": iteration,
                
                // Additional broker metrics
                "provider.underReplicatedPartitions.Maximum": 0,
                "provider.producerRequestTime.Average": 2.5 + Math.random() * 2,
                "provider.consumerRequestTime.Average": 1.5 + Math.random() * 1,
                "provider.networkRxPackets.Average": 10000 + Math.random() * 5000,
                "provider.networkTxPackets.Average": 8000 + Math.random() * 4000
            };
            
            // Add aggregated metrics
            ['bytesInPerSec', 'bytesOutPerSec', 'messagesInPerSec'].forEach(metric => {
                const aggregations = this.generateAggregations(metrics[metric]);
                Object.entries(aggregations).forEach(([agg, value]) => {
                    event[`provider.${metric}.${agg}`] = value;
                });
            });
            
            // Add single value metrics
            event[`provider.cpuUser.Average`] = metrics.cpuUser;
            event[`provider.cpuUser.Maximum`] = Math.min(100, metrics.cpuUser + 10);
            event[`provider.cpuUser.Minimum`] = Math.max(0, metrics.cpuUser - 10);
            
            event[`provider.memoryUsed.Average`] = metrics.memoryUsed;
            event[`provider.memoryFree.Average`] = 100 - metrics.memoryUsed;
            
            event[`provider.rootDiskUsed.Average`] = metrics.diskUsed;
            
            events.push(event);
        }
        
        return events;
    }

    /**
     * Create topic events
     */
    createTopicEvents(clusterName, iteration) {
        const events = [];
        const clusterArn = `arn:aws:kafka:${this.awsRegion}:${this.awsAccountId}:cluster/${clusterName}/${crypto.randomBytes(8).toString('hex')}`;
        const topics = ['orders', 'payments', 'inventory', 'events', 'logs', 'metrics', 'alerts'];
        
        for (const topicName of topics) {
            const timestamp = Date.now();
            const topicIdentifier = `${clusterName}/${topicName}`;
            const topicGuid = this.generateEntityGuid('AWSMSKTOPIC', topicIdentifier);
            
            const historyKey = `topic:${topicIdentifier}`;
            const prevMetrics = this.metricsHistory.get(historyKey) || {};
            
            const metrics = {
                bytesInPerSec: this.generateMetricValue('topic', 'bytesInPerSec', prevMetrics.bytesInPerSec),
                bytesOutPerSec: this.generateMetricValue('topic', 'bytesOutPerSec', prevMetrics.bytesOutPerSec),
                messagesInPerSec: this.generateMetricValue('topic', 'messagesInPerSec', prevMetrics.messagesInPerSec),
                offsetLag: this.generateMetricValue('topic', 'offsetLag', prevMetrics.offsetLag)
            };
            
            this.metricsHistory.set(historyKey, metrics);
            
            const event = {
                eventType: "AwsMskTopicSample",
                timestamp,
                entityGuid: topicGuid,
                entityName: topicIdentifier,
                provider: "AwsMskTopic",
                clusterName: clusterName,
                "provider.clusterName": clusterName,
                "provider.topic": topicName,
                "provider.topicName": topicName,
                "provider.accountId": this.awsAccountId,
                "provider.region": this.awsRegion,
                "provider.awsRegion": this.awsRegion,
                "provider.externalId": `${clusterArn}/topic/${topicName}`,
                "aws.accountId": this.awsAccountId,
                "aws.region": this.awsRegion,
                "aws.kafka.Topic": topicName,
                "provider.partitionCount": 6,
                "provider.replicationFactor": 3,
                "provider.minInSyncReplicas": 2,
                "collector.name": "cloudwatch-metric-streams",
                "collector.version": "1.8.0",
                "streaming.iteration": iteration
            };
            
            // Add aggregated metrics
            ['bytesInPerSec', 'bytesOutPerSec', 'messagesInPerSec'].forEach(metric => {
                const aggregations = this.generateAggregations(metrics[metric]);
                Object.entries(aggregations).forEach(([agg, value]) => {
                    event[`provider.${metric}.${agg}`] = value;
                });
            });
            
            // Consumer lag metrics
            event[`provider.sumOffsetLag.Average`] = metrics.offsetLag;
            event[`provider.sumOffsetLag.Maximum`] = Math.round(metrics.offsetLag * 1.5);
            event[`provider.estimatedMaxTimeLag.Average`] = metrics.offsetLag > 0 ? Math.round(metrics.offsetLag / 10) : 0;
            
            events.push(event);
        }
        
        return events;
    }

    /**
     * Submit events
     */
    async submitEvents(events) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(events);
            
            const options = {
                hostname: 'insights-collector.newrelic.com',
                path: `/v1/accounts/${this.accountId}/events`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Insert-Key': this.insertKey,
                    'Content-Length': data.length
                }
            };
            
            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    resolve({
                        success: res.statusCode === 200,
                        status: res.statusCode,
                        body
                    });
                });
            });
            
            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    /**
     * Stream metrics for a single iteration
     */
    async streamIteration(clusterName, iteration) {
        const timestamp = new Date().toISOString();
        console.log(`\n⏰ Iteration ${iteration} at ${timestamp}`);
        console.log('='.repeat(50));
        
        const events = [];
        
        // Create all events
        events.push(this.createClusterEvent(clusterName, iteration));
        events.push(...this.createBrokerEvents(clusterName, iteration));
        events.push(...this.createTopicEvents(clusterName, iteration));
        
        // Submit events
        console.log(`📤 Submitting ${events.length} events...`);
        const result = await this.submitEvents(events);
        
        if (result.success) {
            console.log('✅ Events submitted successfully');
            console.log(`   Cluster: 1, Brokers: 3, Topics: 7`);
            
            // Sample metrics display
            const clusterMetrics = this.metricsHistory.get(`cluster:${clusterName}`);
            console.log(`\n📊 Current Metrics:`);
            console.log(`   Active Controllers: ${clusterMetrics.activeControllers}`);
            console.log(`   Global Partitions: ${clusterMetrics.globalPartitions}`);
            console.log(`   Global Topics: ${clusterMetrics.globalTopics}`);
            
            // Show a sample broker metric
            const broker1Metrics = this.metricsHistory.get(`broker:${clusterName}/broker-1`);
            if (broker1Metrics) {
                console.log(`   Broker 1 CPU: ${broker1Metrics.cpuUser}%`);
                console.log(`   Broker 1 Bytes In/Sec: ${(broker1Metrics.bytesInPerSec / 1000000).toFixed(2)} MB/s`);
            }
        } else {
            console.log(`❌ Failed to submit events: ${result.status}`);
        }
    }

    /**
     * Run continuous streaming
     */
    async runContinuousStream(clusterName) {
        console.log('🚀 Continuous Exact Format Streamer');
        console.log('===================================\n');
        console.log(`Account: ${this.accountId}`);
        console.log(`Cluster: ${clusterName}`);
        console.log(`Interval: ${this.streamInterval / 1000 / 60} minutes`);
        console.log(`Started: ${new Date().toISOString()}\n`);
        
        let iteration = 1;
        
        // Initial submission
        await this.streamIteration(clusterName, iteration);
        
        // Set up continuous streaming
        const intervalId = setInterval(async () => {
            iteration++;
            await this.streamIteration(clusterName, iteration);
        }, this.streamInterval);
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n\n🛑 Stopping continuous stream...');
            clearInterval(intervalId);
            
            // Final summary
            console.log('\n📊 Streaming Summary:');
            console.log(`   Total Iterations: ${iteration}`);
            console.log(`   Duration: ${((Date.now() - (iteration - 1) * this.streamInterval) / 1000 / 60).toFixed(1)} minutes`);
            console.log(`   Events Sent: ${iteration * (1 + 3 + 7)} total`);
            
            process.exit(0);
        });
        
        console.log('\n✅ Continuous streaming active. Press Ctrl+C to stop.');
    }

    /**
     * Generate entity GUID
     */
    generateEntityGuid(entityType, identifier) {
        const base64Id = Buffer.from(identifier).toString('base64');
        return `${this.accountId}|INFRA|${entityType}|${base64Id}`;
    }
}

// Main execution
async function main() {
    const streamer = new ContinuousExactFormatStreamer();
    const clusterName = process.argv[2] || `continuous-msk-${Date.now()}`;
    
    await streamer.runContinuousStream(clusterName);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { ContinuousExactFormatStreamer };