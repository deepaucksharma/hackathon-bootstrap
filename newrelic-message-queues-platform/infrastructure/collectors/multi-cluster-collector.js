/**
 * Multi-Cluster Kafka Collector
 * 
 * Enhanced version of InfraAgentCollector that supports collecting data from
 * multiple Kafka clusters efficiently with cluster-aware queries and filtering.
 */

const InfraAgentCollector = require('./infra-agent-collector');
const { logger } = require('../../core/utils/logger');

class MultiClusterCollector extends InfraAgentCollector {
  constructor(config = {}) {
    super(config);
    
    // Multi-cluster specific config
    this.clusterFilter = config.clusterFilter || null; // Array of cluster names to filter
    this.maxClustersPerQuery = config.maxClustersPerQuery || 10;
    this.enableClusterDiscovery = config.enableClusterDiscovery !== false;
    
    // Cache for discovered clusters
    this.discoveredClusters = new Map();
    this.clusterDiscoveryInterval = config.clusterDiscoveryInterval || 300000; // 5 minutes
    this.lastDiscoveryTime = 0;
    
    logger.info('🌐 Multi-cluster collector initialized');
  }

  /**
   * Discover all available Kafka clusters
   */
  async discoverClusters(forceRefresh = false) {
    const now = Date.now();
    
    // Use cache if available and not expired
    if (!forceRefresh && 
        this.discoveredClusters.size > 0 && 
        (now - this.lastDiscoveryTime) < this.clusterDiscoveryInterval) {
      return Array.from(this.discoveredClusters.values());
    }

    logger.info('🔍 Discovering Kafka clusters...');
    
    const nrql = `
      FROM KafkaBrokerSample 
      SELECT 
        uniqueCount(broker.id) as brokerCount,
        latest(provider) as provider,
        latest(hostname) as sampleHost,
        count(*) as sampleCount
      FACET clusterName 
      SINCE 24 hours ago
      LIMIT 100
    `;

    try {
      const response = await this.nrqlCircuitBreaker.execute(
        async () => await this.client.executeNrqlQuery(nrql)
      );
      
      const results = response?.results || [];
      
      // Clear and update cache
      this.discoveredClusters.clear();
      
      results.forEach(r => {
        if (r.clusterName) {
          this.discoveredClusters.set(r.clusterName, {
            clusterName: r.clusterName,
            brokerCount: r.brokerCount || 0,
            provider: r.provider || 'kafka',
            lastSeen: now,
            sampleCount: r.sampleCount || 0,
            sampleHost: r.sampleHost
          });
        }
      });
      
      this.lastDiscoveryTime = now;
      
      const clusters = Array.from(this.discoveredClusters.values());
      logger.success(`✅ Discovered ${clusters.length} Kafka clusters`);
      
      if (this.debug) {
        clusters.forEach(c => {
          logger.debug(`  - ${c.clusterName}: ${c.brokerCount} brokers, ${c.sampleCount} samples`);
        });
      }
      
      return clusters;
    } catch (error) {
      logger.error('Failed to discover clusters:', error.message);
      // Return cached clusters if available
      return Array.from(this.discoveredClusters.values());
    }
  }

  /**
   * Get clusters to collect data from
   */
  async getClustersToCollect() {
    let clusters = [];
    
    if (this.enableClusterDiscovery) {
      // Discover all available clusters
      clusters = await this.discoverClusters();
    } else if (this.clusterFilter && this.clusterFilter.length > 0) {
      // Use explicitly configured clusters
      clusters = this.clusterFilter.map(name => ({ clusterName: name }));
    } else {
      // Fall back to default behavior
      clusters = await this.getKafkaClusters();
    }
    
    // Apply filter if configured
    if (this.clusterFilter && this.clusterFilter.length > 0) {
      clusters = clusters.filter(c => this.clusterFilter.includes(c.clusterName));
      logger.info(`📋 Filtering to ${clusters.length} configured clusters`);
    }
    
    return clusters;
  }

  /**
   * Collect broker metrics for specific clusters
   */
  async collectKafkaBrokerMetricsForClusters(clusterNames, since = '5 minutes ago') {
    if (!clusterNames || clusterNames.length === 0) {
      return [];
    }

    // Build cluster filter clause
    const clusterFilter = clusterNames.length === 1 
      ? `clusterName = '${clusterNames[0]}'`
      : `clusterName IN (${clusterNames.map(c => `'${c}'`).join(',')})`;

    const nrql = `
      FROM KafkaBrokerSample 
      SELECT 
        latest(broker.id) as 'broker.id',
        latest(clusterName) as clusterName,
        latest(hostname) as hostname,
        average(broker.messagesInPerSecond) as 'broker.messagesInPerSecond',
        average(broker.bytesInPerSecond) as 'broker.bytesInPerSecond',
        average(broker.bytesOutPerSecond) as 'broker.bytesOutPerSecond',
        average(broker.requestsPerSecond) as 'broker.requestsPerSecond',
        average(broker.cpuUsage) as 'broker.cpuUsage',
        average(broker.memoryUsage) as 'broker.memoryUsage',
        max(broker.underReplicatedPartitions) as 'broker.underReplicatedPartitions',
        max(broker.offlinePartitions) as 'broker.offlinePartitions',
        latest(kafka.controller.activeControllerCount) as 'kafka.controller.activeControllerCount'
      WHERE ${clusterFilter} AND broker.id IS NOT NULL
      FACET broker.id, clusterName, hostname
      SINCE ${since}
      LIMIT 1000
    `;

    if (this.debug) {
      logger.debug(`Collecting brokers for clusters: ${clusterNames.join(', ')}`);
    }

    const response = await this.nerdGraphQuery(`
      {
        actor {
          account(id: ${this.accountId}) {
            nrql(query: "${nrql.replace(/\n/g, ' ').replace(/"/g, '\\"')}") {
              results
            }
          }
        }
      }
    `);

    const results = response.data?.actor?.account?.nrql?.results || [];
    
    return results.map(result => ({
      eventType: 'KafkaBrokerSample',
      ...result
    }));
  }

  /**
   * Collect topic metrics for specific clusters
   */
  async collectKafkaTopicMetricsForClusters(clusterNames, since = '5 minutes ago') {
    if (!clusterNames || clusterNames.length === 0) {
      return [];
    }

    const clusterFilter = clusterNames.length === 1 
      ? `clusterName = '${clusterNames[0]}'`
      : `clusterName IN (${clusterNames.map(c => `'${c}'`).join(',')})`;

    const nrql = `
      FROM KafkaTopicSample 
      SELECT 
        latest(topic.name) as 'topic.name',
        latest(clusterName) as clusterName,
        average(topic.bytesInPerSecond) as 'topic.bytesInPerSecond',
        average(topic.bytesOutPerSecond) as 'topic.bytesOutPerSecond',
        average(topic.messagesInPerSecond) as 'topic.messagesInPerSecond',
        latest(topic.partitionCount) as 'topic.partitionCount',
        latest(topic.replicationFactor) as 'topic.replicationFactor',
        latest(topic.retentionBytes) as 'topic.diskSize'
      WHERE ${clusterFilter} AND topic.name IS NOT NULL
      FACET topic.name, clusterName
      SINCE ${since}
      LIMIT 2000
    `;

    if (this.debug) {
      logger.debug(`Collecting topics for clusters: ${clusterNames.join(', ')}`);
    }

    const response = await this.nerdGraphQuery(`
      {
        actor {
          account(id: ${this.accountId}) {
            nrql(query: "${nrql.replace(/\n/g, ' ').replace(/"/g, '\\"')}") {
              results
            }
          }
        }
      }
    `);

    const results = response.data?.actor?.account?.nrql?.results || [];
    
    return results.map(result => ({
      eventType: 'KafkaTopicSample',
      ...result
    }));
  }

  /**
   * Collect all Kafka metrics with multi-cluster support
   */
  async collectKafkaMetrics(since = '5 minutes ago') {
    logger.info('📊 Collecting Kafka metrics for multiple clusters...');
    
    const startTime = Date.now();
    const results = {
      brokerMetrics: [],
      topicMetrics: [],
      clusterInfo: [],
      errors: []
    };

    try {
      // Get clusters to collect
      const clusters = await this.getClustersToCollect();
      results.clusterInfo = clusters;
      
      if (clusters.length === 0) {
        logger.warn('⚠️  No Kafka clusters found to collect metrics from');
        return [];
      }

      logger.info(`🎯 Collecting metrics from ${clusters.length} clusters`);

      // Batch clusters for efficient querying
      const clusterBatches = [];
      for (let i = 0; i < clusters.length; i += this.maxClustersPerQuery) {
        clusterBatches.push(
          clusters.slice(i, i + this.maxClustersPerQuery).map(c => c.clusterName)
        );
      }

      // Collect metrics for each batch
      for (const batch of clusterBatches) {
        const batchPromises = [
          this.collectKafkaBrokerMetricsForClusters(batch, since).catch(error => {
            results.errors.push({ 
              type: 'broker', 
              clusters: batch,
              error: error.message 
            });
            logger.error(`❌ Broker metrics failed for ${batch.join(', ')}:`, error.message);
            return [];
          }),
          this.collectKafkaTopicMetricsForClusters(batch, since).catch(error => {
            results.errors.push({ 
              type: 'topic', 
              clusters: batch,
              error: error.message 
            });
            logger.error(`❌ Topic metrics failed for ${batch.join(', ')}:`, error.message);
            return [];
          })
        ];

        const [brokerMetrics, topicMetrics] = await Promise.all(batchPromises);
        
        results.brokerMetrics.push(...brokerMetrics);
        results.topicMetrics.push(...topicMetrics);
      }

      const duration = Date.now() - startTime;
      
      // Log summary by cluster
      const brokersByCluster = {};
      const topicsByCluster = {};
      
      results.brokerMetrics.forEach(b => {
        const cluster = b.clusterName || 'unknown';
        brokersByCluster[cluster] = (brokersByCluster[cluster] || 0) + 1;
      });
      
      results.topicMetrics.forEach(t => {
        const cluster = t.clusterName || 'unknown';
        topicsByCluster[cluster] = (topicsByCluster[cluster] || 0) + 1;
      });
      
      logger.success(`✅ Collection completed in ${duration}ms`);
      logger.info('📈 Metrics by cluster:');
      
      clusters.forEach(cluster => {
        const clusterName = cluster.clusterName;
        const brokers = brokersByCluster[clusterName] || 0;
        const topics = topicsByCluster[clusterName] || 0;
        logger.info(`   ${clusterName}: ${brokers} brokers, ${topics} topics`);
      });

      if (results.errors.length > 0) {
        logger.warn(`⚠️  ${results.errors.length} partial failures occurred`);
      }

      const allMetrics = [...results.brokerMetrics, ...results.topicMetrics];
      
      // Add collection metadata
      allMetrics.forEach(metric => {
        metric.collectionTime = startTime;
        metric.multiCluster = true;
      });
      
      return allMetrics;
      
    } catch (error) {
      logger.error('❌ Multi-cluster collection failed:', error.message);
      results.errors.push({ type: 'general', error: error.message });
      throw error;
    }
  }

  /**
   * Get cluster health summary across all clusters
   */
  async getMultiClusterHealth(since = '1 hour ago') {
    const clusters = await this.getClustersToCollect();
    
    const healthPromises = clusters.map(async cluster => {
      const nrql = `
        FROM KafkaBrokerSample
        SELECT 
          uniqueCount(broker.id) as activeBrokers,
          sum(broker.underReplicatedPartitions) as underReplicatedPartitions,
          sum(broker.offlinePartitions) as offlinePartitions,
          average(broker.cpuUsage) as avgCpuUsage,
          average(broker.memoryUsage) as avgMemoryUsage
        WHERE clusterName = '${cluster.clusterName}'
        SINCE ${since}
      `;
      
      try {
        const response = await this.client.executeNrqlQuery(nrql);
        const result = response?.results?.[0] || {};
        
        return {
          clusterName: cluster.clusterName,
          health: {
            activeBrokers: result.activeBrokers || 0,
            underReplicatedPartitions: result.underReplicatedPartitions || 0,
            offlinePartitions: result.offlinePartitions || 0,
            avgCpuUsage: result.avgCpuUsage || 0,
            avgMemoryUsage: result.avgMemoryUsage || 0,
            healthScore: this.calculateHealthScore(result)
          }
        };
      } catch (error) {
        logger.error(`Failed to get health for ${cluster.clusterName}:`, error.message);
        return {
          clusterName: cluster.clusterName,
          health: { error: error.message }
        };
      }
    });
    
    const healthResults = await Promise.all(healthPromises);
    
    return {
      clusters: healthResults,
      summary: {
        totalClusters: healthResults.length,
        healthyClusters: healthResults.filter(c => (c.health.healthScore || 0) > 80).length,
        degradedClusters: healthResults.filter(c => {
          const score = c.health.healthScore || 0;
          return score > 50 && score <= 80;
        }).length,
        unhealthyClusters: healthResults.filter(c => (c.health.healthScore || 0) <= 50).length
      }
    };
  }

  /**
   * Calculate health score for a cluster
   */
  calculateHealthScore(metrics) {
    let score = 100;
    
    // Deduct for offline partitions (critical)
    if (metrics.offlinePartitions > 0) {
      score -= Math.min(50, metrics.offlinePartitions * 10);
    }
    
    // Deduct for under-replicated partitions
    if (metrics.underReplicatedPartitions > 0) {
      score -= Math.min(30, metrics.underReplicatedPartitions * 2);
    }
    
    // Deduct for high CPU usage
    if (metrics.avgCpuUsage > 80) {
      score -= Math.min(20, (metrics.avgCpuUsage - 80) / 2);
    }
    
    // Deduct for high memory usage
    if (metrics.avgMemoryUsage > 85) {
      score -= Math.min(15, (metrics.avgMemoryUsage - 85) / 2);
    }
    
    return Math.max(0, Math.round(score));
  }
}

module.exports = MultiClusterCollector;