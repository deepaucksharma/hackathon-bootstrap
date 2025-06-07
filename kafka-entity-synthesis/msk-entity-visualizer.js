#!/usr/bin/env node

/**
 * MSK Entity Hierarchy Visualizer
 * Creates visual representations of Kafka entity relationships
 */

const axios = require('axios');

class MSKEntityVisualizer {
    constructor(config) {
        this.accountId = config.accountId;
        this.apiKey = config.apiKey;
        this.nerdGraphUrl = 'https://api.newrelic.com/graphql';
        this.nrqlUrl = `https://insights-api.newrelic.com/v1/accounts/${this.accountId}/query`;
    }

    /**
     * Fetch and visualize MSK entity hierarchy
     */
    async visualizeHierarchy(clusterNamePattern = null) {
        console.log('🎨 MSK Entity Hierarchy Visualizer');
        console.log('==================================\n');

        // Fetch all MSK entities
        const entities = await this.fetchMSKEntities(clusterNamePattern);
        
        if (entities.clusters.length === 0) {
            console.log('❌ No MSK clusters found');
            return;
        }

        // Build hierarchy
        const hierarchy = await this.buildHierarchy(entities);
        
        // Visualize
        this.renderHierarchy(hierarchy);
        
        // Generate statistics
        this.renderStatistics(hierarchy);
        
        // Generate health report
        await this.renderHealthReport(hierarchy);
        
        return hierarchy;
    }

    async fetchMSKEntities(pattern) {
        console.log('📡 Fetching MSK entities...\n');
        
        const entities = {
            clusters: [],
            brokers: [],
            topics: []
        };

        // GraphQL query for all MSK entities
        const query = `
        {
            actor {
                clusterSearch: entitySearch(query: "domain='INFRA' AND type='AWSMSKCLUSTER'${pattern ? ` AND name LIKE '%${pattern}%'` : ''}") {
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
                        }
                    }
                }
                brokerSearch: entitySearch(query: "domain='INFRA' AND type='AWSMSKBROKER'${pattern ? ` AND name LIKE '%${pattern}%'` : ''}") {
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
                        }
                    }
                }
                topicSearch: entitySearch(query: "domain='INFRA' AND type='AWSMSKTOPIC'${pattern ? ` AND name LIKE '%${pattern}%'` : ''}") {
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

            const data = response.data?.data?.actor;
            
            entities.clusters = data?.clusterSearch?.results?.entities || [];
            entities.brokers = data?.brokerSearch?.results?.entities || [];
            entities.topics = data?.topicSearch?.results?.entities || [];

            console.log(`Found: ${entities.clusters.length} clusters, ${entities.brokers.length} brokers, ${entities.topics.length} topics\n`);
            
        } catch (error) {
            console.error('❌ Error fetching entities:', error.message);
        }

        return entities;
    }

    async buildHierarchy(entities) {
        const hierarchy = new Map();

        // Initialize clusters
        entities.clusters.forEach(cluster => {
            hierarchy.set(cluster.name, {
                type: 'cluster',
                entity: cluster,
                brokers: new Map(),
                topics: new Map(),
                metrics: {}
            });
        });

        // Map brokers to clusters
        entities.brokers.forEach(broker => {
            const clusterName = this.extractClusterName(broker.name);
            if (hierarchy.has(clusterName)) {
                const cluster = hierarchy.get(clusterName);
                cluster.brokers.set(broker.name, {
                    type: 'broker',
                    entity: broker,
                    topics: new Set()
                });
            }
        });

        // Map topics to clusters and brokers
        entities.topics.forEach(topic => {
            const clusterName = this.extractClusterName(topic.name);
            if (hierarchy.has(clusterName)) {
                const cluster = hierarchy.get(clusterName);
                cluster.topics.set(topic.name, {
                    type: 'topic',
                    entity: topic,
                    brokers: new Set()
                });
            }
        });

        // Fetch metrics for each cluster
        for (const [clusterName, clusterData] of hierarchy) {
            clusterData.metrics = await this.fetchClusterMetrics(clusterName);
        }

        return hierarchy;
    }

    extractClusterName(entityName) {
        // Extract cluster name from entity names like "cluster-name-broker-1" or "cluster-name-topic"
        const parts = entityName.split('-');
        
        // Look for common patterns
        if (entityName.includes('-broker-')) {
            return entityName.substring(0, entityName.lastIndexOf('-broker-'));
        } else if (entityName.includes('-topic-') || parts[parts.length - 1] in ['orders', 'payments', 'users', 'events']) {
            // Handle topic names
            const possibleEndings = ['orders', 'payments', 'inventory', 'users', 'events', 'logs', 'metrics'];
            for (const ending of possibleEndings) {
                if (entityName.endsWith('-' + ending)) {
                    return entityName.substring(0, entityName.lastIndexOf('-' + ending));
                }
            }
        }
        
        // Default: assume first parts are cluster name
        return parts.slice(0, -1).join('-');
    }

    async fetchClusterMetrics(clusterName) {
        const metrics = {
            throughput: { in: 0, out: 0 },
            messages: { in: 0, out: 0 },
            health: { 
                activeControllers: 0, 
                offlinePartitions: 0,
                underReplicated: 0 
            }
        };

        try {
            // Fetch throughput metrics
            const throughputQuery = `
                FROM AwsMskBrokerSample 
                SELECT 
                    sum(provider.bytesInPerSec.Average) as bytesIn,
                    sum(provider.bytesOutPerSec.Average) as bytesOut
                WHERE provider.clusterName = '${clusterName}'
                SINCE 5 minutes ago
            `;

            const healthQuery = `
                FROM AwsMskClusterSample
                SELECT 
                    latest(provider.activeControllerCount.Sum) as controllers,
                    latest(provider.offlinePartitionsCount.Sum) as offline
                WHERE provider.clusterName = '${clusterName}'
                SINCE 5 minutes ago
            `;

            const [throughputResult, healthResult] = await Promise.all([
                this.runNRQL(throughputQuery),
                this.runNRQL(healthQuery)
            ]);

            if (throughputResult?.results?.[0]) {
                metrics.throughput.in = throughputResult.results[0].bytesIn || 0;
                metrics.throughput.out = throughputResult.results[0].bytesOut || 0;
            }

            if (healthResult?.results?.[0]) {
                metrics.health.activeControllers = healthResult.results[0].controllers || 0;
                metrics.health.offlinePartitions = healthResult.results[0].offline || 0;
            }

        } catch (error) {
            console.error(`Error fetching metrics for ${clusterName}:`, error.message);
        }

        return metrics;
    }

    async runNRQL(query) {
        try {
            const response = await axios.get(this.nrqlUrl, {
                params: { nrql: query },
                headers: {
                    'X-Query-Key': this.apiKey,
                    'Accept': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            return null;
        }
    }

    renderHierarchy(hierarchy) {
        console.log('🌳 MSK Entity Hierarchy\n');

        for (const [clusterName, clusterData] of hierarchy) {
            const clusterStatus = clusterData.entity.reporting ? '🟢' : '🔴';
            console.log(`${clusterStatus} 📦 Cluster: ${clusterName}`);
            
            // Render brokers
            if (clusterData.brokers.size > 0) {
                console.log('│');
                let brokerIndex = 0;
                for (const [brokerName, brokerData] of clusterData.brokers) {
                    brokerIndex++;
                    const isLast = brokerIndex === clusterData.brokers.size;
                    const brokerStatus = brokerData.entity.reporting ? '🟢' : '🔴';
                    console.log(`├─${brokerStatus} 💾 Broker: ${brokerName.split('-').pop()}`);
                }
            }

            // Render topics
            if (clusterData.topics.size > 0) {
                console.log('│');
                console.log(`├─📑 Topics (${clusterData.topics.size}):`);
                let topicIndex = 0;
                for (const [topicName, topicData] of clusterData.topics) {
                    topicIndex++;
                    if (topicIndex <= 5) {
                        const topicStatus = topicData.entity.reporting ? '🟢' : '🔴';
                        const shortName = topicName.replace(clusterName + '-', '');
                        console.log(`│  ├─${topicStatus} ${shortName}`);
                    }
                }
                if (clusterData.topics.size > 5) {
                    console.log(`│  └─... and ${clusterData.topics.size - 5} more`);
                }
            }

            // Render metrics
            const metrics = clusterData.metrics;
            console.log('│');
            console.log('└─📊 Metrics:');
            console.log(`   ├─ Throughput In: ${this.formatBytes(metrics.throughput.in)}/s`);
            console.log(`   ├─ Throughput Out: ${this.formatBytes(metrics.throughput.out)}/s`);
            console.log(`   ├─ Active Controllers: ${metrics.health.activeControllers}`);
            console.log(`   └─ Offline Partitions: ${metrics.health.offlinePartitions}`);
            
            console.log('');
        }
    }

    renderStatistics(hierarchy) {
        console.log('📈 Statistics\n');

        let totalClusters = hierarchy.size;
        let totalBrokers = 0;
        let totalTopics = 0;
        let reportingClusters = 0;
        let reportingBrokers = 0;
        let reportingTopics = 0;

        for (const [clusterName, clusterData] of hierarchy) {
            if (clusterData.entity.reporting) reportingClusters++;
            totalBrokers += clusterData.brokers.size;
            totalTopics += clusterData.topics.size;

            for (const [, brokerData] of clusterData.brokers) {
                if (brokerData.entity.reporting) reportingBrokers++;
            }

            for (const [, topicData] of clusterData.topics) {
                if (topicData.entity.reporting) reportingTopics++;
            }
        }

        console.log(`Total Clusters: ${totalClusters} (${reportingClusters} reporting)`);
        console.log(`Total Brokers: ${totalBrokers} (${reportingBrokers} reporting)`);
        console.log(`Total Topics: ${totalTopics} (${reportingTopics} reporting)`);
        console.log('');

        // Health summary
        const healthPercentage = totalClusters > 0 
            ? Math.round((reportingClusters / totalClusters) * 100)
            : 0;

        console.log(`Overall Health: ${this.getHealthEmoji(healthPercentage)} ${healthPercentage}%`);
        console.log('');
    }

    async renderHealthReport(hierarchy) {
        console.log('🏥 Health Report\n');

        for (const [clusterName, clusterData] of hierarchy) {
            const issues = [];
            
            // Check cluster reporting
            if (!clusterData.entity.reporting) {
                issues.push('Cluster not reporting data');
            }

            // Check broker health
            const nonReportingBrokers = Array.from(clusterData.brokers.values())
                .filter(b => !b.entity.reporting).length;
            if (nonReportingBrokers > 0) {
                issues.push(`${nonReportingBrokers} broker(s) not reporting`);
            }

            // Check metrics
            if (clusterData.metrics.health.offlinePartitions > 0) {
                issues.push(`${clusterData.metrics.health.offlinePartitions} offline partitions`);
            }

            if (clusterData.metrics.health.activeControllers !== 1) {
                issues.push(`Abnormal controller count: ${clusterData.metrics.health.activeControllers}`);
            }

            if (issues.length > 0) {
                console.log(`❗ ${clusterName}:`);
                issues.forEach(issue => console.log(`   - ${issue}`));
                console.log('');
            } else {
                console.log(`✅ ${clusterName}: Healthy`);
            }
        }

        console.log('');
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getHealthEmoji(percentage) {
        if (percentage >= 90) return '🟢';
        if (percentage >= 70) return '🟡';
        if (percentage >= 50) return '🟠';
        return '🔴';
    }

    /**
     * Generate ASCII art visualization
     */
    generateASCIIVisualization(hierarchy) {
        console.log('\n📐 ASCII Visualization\n');
        
        for (const [clusterName, clusterData] of hierarchy) {
            console.log('┌' + '─'.repeat(clusterName.length + 10) + '┐');
            console.log(`│ CLUSTER: ${clusterName} │`);
            console.log('└' + '─'.repeat(clusterName.length + 10) + '┘');
            console.log('         │');
            
            // Draw brokers
            const brokerCount = clusterData.brokers.size;
            if (brokerCount > 0) {
                console.log('    ┌────┴────┬' + '─────────┬'.repeat(Math.min(brokerCount - 1, 2)) + (brokerCount > 3 ? '───...' : ''));
                console.log('    │         │' + '         │'.repeat(Math.min(brokerCount - 1, 2)));
                
                let brokerLabels = '  ';
                let i = 0;
                for (const [brokerName] of clusterData.brokers) {
                    if (i < 3) {
                        brokerLabels += `[B${i + 1}]     `;
                    }
                    i++;
                }
                if (brokerCount > 3) {
                    brokerLabels += `... +${brokerCount - 3}`;
                }
                console.log(brokerLabels);
            }
            
            console.log('');
        }
    }
}

// CLI interface
if (require.main === module) {
    async function main() {
        const args = process.argv.slice(2);
        const pattern = args[0] || null;

        const config = {
            accountId: process.env.NEW_RELIC_ACCOUNT_ID,
            apiKey: process.env.NEW_RELIC_API_KEY || process.env.NEW_RELIC_USER_KEY
        };

        if (!config.accountId || !config.apiKey) {
            console.error('❌ Please set NEW_RELIC_ACCOUNT_ID and NEW_RELIC_API_KEY environment variables');
            process.exit(1);
        }

        const visualizer = new MSKEntityVisualizer(config);
        
        console.log('🔍 Searching for MSK entities...');
        if (pattern) {
            console.log(`   Pattern: ${pattern}`);
        }
        console.log('');

        const hierarchy = await visualizer.visualizeHierarchy(pattern);
        
        // Generate ASCII visualization
        visualizer.generateASCIIVisualization(hierarchy);

        // Save visualization to file
        if (hierarchy.size > 0) {
            const filename = `msk-visualization-${Date.now()}.json`;
            require('fs').writeFileSync(
                filename,
                JSON.stringify(Array.from(hierarchy.entries()), null, 2)
            );
            console.log(`\n💾 Visualization data saved to: ${filename}`);
        }
    }

    main().catch(console.error);
}

module.exports = { MSKEntityVisualizer };