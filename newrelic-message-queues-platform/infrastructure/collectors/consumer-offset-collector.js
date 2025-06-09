/**
 * Consumer Offset Collector
 * 
 * Specialized collector for Kafka consumer group lag calculation and monitoring.
 * This collector aligns with how nri-kafka handles consumer group metrics
 * and provides detailed lag analysis per consumer group, topic, and partition.
 * 
 * Features:
 * - Consumer group discovery and monitoring
 * - Per-partition lag calculation
 * - Consumer group state tracking
 * - Lag trend analysis
 * - Consumer group health assessment
 * - Integration with enhanced Kafka collector
 */

const { DataCollectionPool } = require('../../core/workers/worker-pool');
const { getMetricsForEntityType } = require('../../core/metrics/metric-definitions');
const NewRelicClient = require('../../core/http/new-relic-client');
const { getConfigManager } = require('../../core/config/config-manager');
const { logger } = require('../../core/utils/logger');
const chalk = require('chalk');

class ConsumerOffsetCollector {
  constructor(config = {}) {
    // Use shared config manager
    const configManager = getConfigManager(config);
    const nrConfig = configManager.getNewRelicConfig();
    
    this.client = new NewRelicClient(nrConfig);
    this.accountId = nrConfig.accountId;
    this.debug = configManager.isDebug();
    
    this.collectionConfig = {
      lagThresholds: {
        warning: config.lagWarningThreshold || 1000,
        critical: config.lagCriticalThreshold || 10000
      },
      maxConsumerGroups: config.maxConsumerGroups || 100,
      stateTrackingWindow: config.stateTrackingWindow || '15 minutes ago',
      lagTrendAnalysis: config.lagTrendAnalysis !== false,
      partitionLevelDetails: config.partitionLevelDetails !== false,
      consumerPoolSize: config.consumerPoolSize || 5
    };
    
    // Initialize worker pool for consumer group collection
    this.consumerPool = new DataCollectionPool({
      name: 'ConsumerOffsetPool',
      poolSize: this.collectionConfig.consumerPoolSize,
      taskTimeout: 45000
    });
    
    // Consumer group state tracking
    this.consumerGroupStates = new Map();
    this.lagHistory = new Map();
    
    // Get consumer group metric definitions
    this.metricDefinitions = getMetricsForEntityType('consumerGroup');
    
    this.isInitialized = false;
    
    if (this.debug) {
      logger.debug('ConsumerOffsetCollector initialized');
      logger.debug('Configuration:', this.collectionConfig);
    }
  }

  /**
   * Initialize the consumer offset collector
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }
    
    logger.info('🚀 Initializing Consumer Offset Collector...');
    
    try {
      // Start worker pool
      this.consumerPool.start();
      
      // Verify consumer data availability
      await this.verifyConsumerDataAvailability();
      
      this.isInitialized = true;
      logger.success('✅ Consumer Offset Collector initialized');
      
    } catch (error) {
      logger.error('❌ Consumer Offset Collector initialization failed:', error.message);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Verify consumer data is available in New Relic
   */
  async verifyConsumerDataAvailability() {
    logger.debug('🔍 Verifying consumer data availability...');
    
    try {
      // Check for consumer group data in different possible formats
      const checks = [
        this.checkConsumerSamples(),
        this.checkJVMMetrics(),
        this.checkCustomConsumerMetrics()
      ];
      
      const results = await Promise.allSettled(checks);
      const hasData = results.some(result => result.status === 'fulfilled' && result.value);
      
      if (!hasData) {
        logger.warn('⚠️ No consumer group data found. Consumer lag collection may be limited.');
        logger.debug('This is normal if no consumer groups are actively consuming.');
      } else {
        logger.success('✅ Consumer data sources verified');
      }
      
    } catch (error) {
      logger.warn('⚠️ Consumer data verification failed:', error.message);
    }
  }

  /**
   * Check for KafkaConsumerSample data
   */
  async checkConsumerSamples() {
    const nrql = `
      FROM KafkaConsumerSample 
      SELECT count(*) 
      SINCE 1 hour ago
    `;
    
    try {
      const response = await this.executeNrqlQuery(nrql);
      const count = response?.results?.[0]?.count || 0;
      return count > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check for JVM metrics that might include consumer metrics
   */
  async checkJVMMetrics() {
    const nrql = `
      FROM JVMSample 
      SELECT count(*) 
      WHERE \`kafka.consumer\` IS NOT NULL 
      SINCE 1 hour ago
    `;
    
    try {
      const response = await this.executeNrqlQuery(nrql);
      const count = response?.results?.[0]?.count || 0;
      return count > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check for custom consumer metrics
   */
  async checkCustomConsumerMetrics() {
    const nrql = `
      FROM Metric 
      SELECT count(*) 
      WHERE metricName LIKE 'kafka.consumer.%' 
      SINCE 1 hour ago
    `;
    
    try {
      const response = await this.executeNrqlQuery(nrql);
      const count = response?.results?.[0]?.count || 0;
      return count > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Collect comprehensive consumer group metrics
   */
  async collectConsumerGroupMetrics(since = '5 minutes ago') {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    logger.info('👥 Collecting consumer group metrics...');
    const startTime = Date.now();
    
    const results = {
      consumerGroups: [],
      lagMetrics: [],
      stateChanges: [],
      errors: [],
      collectionStats: {}
    };
    
    try {
      // Discover active consumer groups
      const consumerGroups = await this.discoverConsumerGroups(since);
      
      if (consumerGroups.length === 0) {
        logger.info('ℹ️ No active consumer groups found');
        return results;
      }
      
      logger.debug(`Found ${consumerGroups.length} consumer groups to analyze`);
      
      // Collect metrics for each consumer group concurrently
      const consumerGroupTasks = consumerGroups.map(group => ({
        taskFn: async () => this.collectConsumerGroupDetails(group, since),
        context: { consumerGroup: group.id, cluster: group.clusterName }
      }));
      
      const groupResults = await this.consumerPool.submitBatch(consumerGroupTasks);
      
      // Process results
      groupResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          const groupData = result.value;
          results.consumerGroups.push(groupData.groupInfo);
          results.lagMetrics.push(...groupData.lagMetrics);
          
          if (groupData.stateChange) {
            results.stateChanges.push(groupData.stateChange);
          }
        } else {
          results.errors.push({
            type: 'consumer_group_collection',
            consumerGroup: consumerGroups[index].id,
            error: result.reason?.message || 'Unknown error'
          });
        }
      });
      
      // Analyze lag trends if enabled
      if (this.collectionConfig.lagTrendAnalysis) {
        await this.analyzeLagTrends(results.lagMetrics);
      }
      
      // Generate collection stats
      results.collectionStats = this.generateConsumerCollectionStats(results, startTime);
      
      logger.success(`✅ Collected consumer metrics for ${results.consumerGroups.length} groups in ${Date.now() - startTime}ms`);
      this.logConsumerSummary(results);
      
      return results;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`❌ Consumer group collection failed after ${duration}ms: ${error.message}`);
      
      results.errors.push({
        type: 'collection_error',
        error: error.message,
        duration
      });
      
      throw error;
    }
  }

  /**
   * Discover active consumer groups
   */
  async discoverConsumerGroups(since) {
    logger.debug('🔍 Discovering active consumer groups...');
    
    // Try multiple approaches to find consumer groups
    const discoveryMethods = [
      () => this.discoverFromConsumerSamples(since),
      () => this.discoverFromJVMMetrics(since),
      () => this.discoverFromCustomMetrics(since)
    ];
    
    const allGroups = new Map();
    
    for (const method of discoveryMethods) {
      try {
        const groups = await method();
        groups.forEach(group => {
          const key = `${group.id}-${group.clusterName}`;
          if (!allGroups.has(key)) {
            allGroups.set(key, group);
          }
        });
      } catch (error) {
        if (this.debug) {
          logger.debug('Discovery method failed:', error.message);
        }
      }
    }
    
    const uniqueGroups = Array.from(allGroups.values());
    logger.debug(`Discovered ${uniqueGroups.length} unique consumer groups`);
    
    return uniqueGroups.slice(0, this.collectionConfig.maxConsumerGroups);
  }

  /**
   * Discover consumer groups from KafkaConsumerSample
   */
  async discoverFromConsumerSamples(since) {
    const nrql = `
      FROM KafkaConsumerSample 
      SELECT 
        latest(consumer.groupId) as groupId,
        latest(clusterName) as clusterName,
        latest(consumer.clientId) as clientId,
        latest(consumer.state) as state
      WHERE consumer.groupId IS NOT NULL
      FACET consumer.groupId, clusterName
      SINCE ${since}
      LIMIT 100
    `;
    
    try {
      const response = await this.executeNrqlQuery(nrql);
      const results = response?.results || [];
      
      return results.map(result => ({
        id: result.groupId,
        clusterName: result.clusterName || 'default',
        clientId: result.clientId,
        state: result.state || 'UNKNOWN',
        source: 'KafkaConsumerSample'
      }));
      
    } catch (error) {
      logger.debug('Failed to discover from consumer samples:', error.message);
      return [];
    }
  }

  /**
   * Discover consumer groups from JVM metrics
   */
  async discoverFromJVMMetrics(since) {
    const nrql = `
      FROM JVMSample 
      SELECT 
        latest(\`kafka.consumer.group.id\`) as groupId,
        latest(\`kafka.cluster.name\`) as clusterName
      WHERE \`kafka.consumer.group.id\` IS NOT NULL
      FACET \`kafka.consumer.group.id\`, \`kafka.cluster.name\`
      SINCE ${since}
      LIMIT 100
    `;
    
    try {
      const response = await this.executeNrqlQuery(nrql);
      const results = response?.results || [];
      
      return results.map(result => ({
        id: result.groupId,
        clusterName: result.clusterName || 'default',
        state: 'UNKNOWN',
        source: 'JVMSample'
      }));
      
    } catch (error) {
      logger.debug('Failed to discover from JVM metrics:', error.message);
      return [];
    }
  }

  /**
   * Discover consumer groups from custom metrics
   */
  async discoverFromCustomMetrics(since) {
    const nrql = `
      FROM Metric 
      SELECT 
        latest(\`consumer.group.id\`) as groupId,
        latest(\`cluster.name\`) as clusterName
      WHERE metricName LIKE 'kafka.consumer.%' 
        AND \`consumer.group.id\` IS NOT NULL
      FACET \`consumer.group.id\`, \`cluster.name\`
      SINCE ${since}
      LIMIT 100
    `;
    
    try {
      const response = await this.executeNrqlQuery(nrql);
      const results = response?.results || [];
      
      return results.map(result => ({
        id: result.groupId,
        clusterName: result.clusterName || 'default',
        state: 'UNKNOWN',
        source: 'CustomMetrics'
      }));
      
    } catch (error) {
      logger.debug('Failed to discover from custom metrics:', error.message);
      return [];
    }
  }

  /**
   * Collect detailed metrics for a specific consumer group
   */
  async collectConsumerGroupDetails(group, since) {
    logger.debug(`Collecting details for consumer group: ${group.id}`);
    
    try {
      // Collect base consumer group info
      const groupInfo = await this.collectConsumerGroupInfo(group, since);
      
      // Collect lag metrics for all topics/partitions
      const lagMetrics = await this.collectConsumerLagMetrics(group, since);
      
      // Check for state changes
      const stateChange = this.detectStateChange(group, groupInfo);
      
      // Update internal tracking
      this.updateConsumerGroupState(group.id, groupInfo);
      this.updateLagHistory(group.id, lagMetrics);
      
      return {
        groupInfo,
        lagMetrics,
        stateChange
      };
      
    } catch (error) {
      logger.warn(`Failed to collect details for consumer group ${group.id}:`, error.message);
      throw error;
    }
  }

  /**
   * Collect consumer group information
   */
  async collectConsumerGroupInfo(group, since) {
    const nrql = `
      FROM KafkaConsumerSample 
      SELECT 
        latest(consumer.groupId) as groupId,
        latest(clusterName) as clusterName,
        latest(consumer.state) as state,
        latest(consumer.memberCount) as memberCount,
        latest(consumer.clientId) as clientId,
        count(*) as sampleCount
      WHERE consumer.groupId = '${group.id}' 
        AND clusterName = '${group.clusterName}'
      SINCE ${since}
    `;
    
    try {
      const response = await this.executeNrqlQuery(nrql);
      const result = response?.results?.[0] || {};
      
      return {
        groupId: result.groupId || group.id,
        clusterName: result.clusterName || group.clusterName,
        state: result.state || 'UNKNOWN',
        memberCount: result.memberCount || 0,
        clientId: result.clientId,
        sampleCount: result.sampleCount || 0,
        lastSeen: new Date(),
        source: group.source
      };
      
    } catch (error) {
      logger.debug(`Failed to get consumer group info for ${group.id}:`, error.message);
      
      // Return minimal info if query fails
      return {
        groupId: group.id,
        clusterName: group.clusterName,
        state: 'UNKNOWN',
        memberCount: 0,
        sampleCount: 0,
        lastSeen: new Date(),
        source: group.source
      };
    }
  }

  /**
   * Collect consumer lag metrics
   */
  async collectConsumerLagMetrics(group, since) {
    const lagQueries = [
      this.collectLagFromConsumerSamples(group, since),
      this.collectLagFromOffsetMetrics(group, since)
    ];
    
    const results = await Promise.allSettled(lagQueries);
    const allLagMetrics = [];
    
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        allLagMetrics.push(...result.value);
      }
    });
    
    // If we got multiple sources, prefer the most detailed one
    return this.deduplicateLagMetrics(allLagMetrics);
  }

  /**
   * Collect lag from KafkaConsumerSample
   */
  async collectLagFromConsumerSamples(group, since) {
    const nrql = `
      FROM KafkaConsumerSample 
      SELECT 
        latest(consumer.lag) as lag,
        latest(consumer.totalLag) as totalLag,
        latest(consumer.maxLag) as maxLag,
        latest(consumer.offset) as currentOffset,
        latest(consumer.committedOffset) as committedOffset,
        latest(topic.name) as topicName,
        latest(partition) as partition
      WHERE consumer.groupId = '${group.id}' 
        AND clusterName = '${group.clusterName}'
      FACET topic.name, partition
      SINCE ${since}
      LIMIT 1000
    `;
    
    try {
      const response = await this.executeNrqlQuery(nrql);
      const results = response?.results || [];
      
      return results.map(result => ({
        consumerGroupId: group.id,
        clusterName: group.clusterName,
        topicName: result.topicName || 'unknown',
        partition: result.partition || 0,
        lag: result.lag || 0,
        totalLag: result.totalLag || 0,
        maxLag: result.maxLag || 0,
        currentOffset: result.currentOffset || 0,
        committedOffset: result.committedOffset || 0,
        timestamp: new Date(),
        source: 'KafkaConsumerSample',
        severity: this.calculateLagSeverity(result.lag || 0)
      }));
      
    } catch (error) {
      logger.debug(`Failed to collect lag from consumer samples for ${group.id}:`, error.message);
      return [];
    }
  }

  /**
   * Collect lag from offset metrics
   */
  async collectLagFromOffsetMetrics(group, since) {
    // This would be implemented if offset metrics are available separately
    // For now, return empty array
    return [];
  }

  /**
   * Deduplicate lag metrics from multiple sources
   */
  deduplicateLagMetrics(lagMetrics) {
    const metricMap = new Map();
    
    lagMetrics.forEach(metric => {
      const key = `${metric.topicName}-${metric.partition}`;
      const existing = metricMap.get(key);
      
      if (!existing || this.isMoreReliableSource(metric.source, existing.source)) {
        metricMap.set(key, metric);
      }
    });
    
    return Array.from(metricMap.values());
  }

  /**
   * Determine if one source is more reliable than another
   */
  isMoreReliableSource(source1, source2) {
    const reliability = {
      'KafkaConsumerSample': 3,
      'CustomMetrics': 2,
      'JVMSample': 1
    };
    
    return (reliability[source1] || 0) > (reliability[source2] || 0);
  }

  /**
   * Calculate lag severity
   */
  calculateLagSeverity(lag) {
    if (lag >= this.collectionConfig.lagThresholds.critical) {
      return 'CRITICAL';
    } else if (lag >= this.collectionConfig.lagThresholds.warning) {
      return 'WARNING';
    } else {
      return 'OK';
    }
  }

  /**
   * Detect consumer group state changes
   */
  detectStateChange(group, currentInfo) {
    const previousState = this.consumerGroupStates.get(group.id);
    
    if (!previousState) {
      return null; // First time seeing this group
    }
    
    if (previousState.state !== currentInfo.state) {
      return {
        consumerGroupId: group.id,
        clusterName: group.clusterName,
        previousState: previousState.state,
        newState: currentInfo.state,
        timestamp: new Date(),
        memberCountChange: currentInfo.memberCount - (previousState.memberCount || 0)
      };
    }
    
    return null;
  }

  /**
   * Update consumer group state tracking
   */
  updateConsumerGroupState(groupId, groupInfo) {
    this.consumerGroupStates.set(groupId, {
      ...groupInfo,
      lastUpdated: new Date()
    });
  }

  /**
   * Update lag history for trend analysis
   */
  updateLagHistory(groupId, lagMetrics) {
    if (!this.collectionConfig.lagTrendAnalysis) {
      return;
    }
    
    const history = this.lagHistory.get(groupId) || [];
    
    // Add current metrics with timestamp
    const timestampedMetrics = lagMetrics.map(metric => ({
      ...metric,
      collectedAt: new Date()
    }));
    
    history.push(...timestampedMetrics);
    
    // Keep only last hour of data
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const recentHistory = history.filter(metric => 
      metric.collectedAt.getTime() > oneHourAgo
    );
    
    this.lagHistory.set(groupId, recentHistory);
  }

  /**
   * Analyze lag trends
   */
  async analyzeLagTrends(currentLagMetrics) {
    // This could be enhanced to detect lag trends, spikes, etc.
    // For now, just log summary
    if (this.debug && currentLagMetrics.length > 0) {
      const totalLag = currentLagMetrics.reduce((sum, metric) => sum + metric.lag, 0);
      const maxLag = Math.max(...currentLagMetrics.map(metric => metric.lag));
      
      logger.debug(`Lag analysis: Total=${totalLag}, Max=${maxLag}, Partitions=${currentLagMetrics.length}`);
    }
  }

  /**
   * Generate consumer collection statistics
   */
  generateConsumerCollectionStats(results, startTime) {
    const duration = Date.now() - startTime;
    
    const lagSeverityCounts = {
      OK: 0,
      WARNING: 0,
      CRITICAL: 0
    };
    
    results.lagMetrics.forEach(metric => {
      lagSeverityCounts[metric.severity] = (lagSeverityCounts[metric.severity] || 0) + 1;
    });
    
    return {
      totalDuration: duration,
      consumerGroupCount: results.consumerGroups.length,
      lagMetricCount: results.lagMetrics.length,
      stateChangeCount: results.stateChanges.length,
      errorCount: results.errors.length,
      lagSeverityCounts,
      workerPoolStats: this.consumerPool.getStatus()
    };
  }

  /**
   * Log consumer collection summary
   */
  logConsumerSummary(results) {
    const stats = results.collectionStats;
    
    logger.info('👥 Consumer Group Summary:');
    logger.info(`   ⏱️  Duration: ${stats.totalDuration}ms`);
    logger.info(`   👥 Groups: ${stats.consumerGroupCount}`);
    logger.info(`   📊 Lag Metrics: ${stats.lagMetricCount}`);
    
    if (stats.lagSeverityCounts.CRITICAL > 0) {
      logger.warn(`   🚨 Critical Lag: ${stats.lagSeverityCounts.CRITICAL} partitions`);
    }
    if (stats.lagSeverityCounts.WARNING > 0) {
      logger.warn(`   ⚠️  Warning Lag: ${stats.lagSeverityCounts.WARNING} partitions`);
    }
    
    if (stats.stateChangeCount > 0) {
      logger.info(`   🔄 State Changes: ${stats.stateChangeCount}`);
    }
    
    if (stats.errorCount > 0) {
      logger.warn(`   ❌ Errors: ${stats.errorCount}`);
    }
  }

  /**
   * Execute NRQL query
   */
  async executeNrqlQuery(nrql) {
    const query = `
      {
        actor {
          account(id: ${this.accountId}) {
            nrql(query: "${nrql.replace(/\n/g, ' ').replace(/"/g, '\\"')}") {
              results
            }
          }
        }
      }
    `;

    const response = await this.client.nerdGraphQuery(query);
    return response.data?.actor?.account?.nrql;
  }

  /**
   * Get consumer group lag summary
   */
  async getConsumerGroupLagSummary() {
    const lagHistory = Array.from(this.lagHistory.entries()).map(([groupId, history]) => {
      const recentMetrics = history.slice(-10); // Last 10 measurements
      const totalLag = recentMetrics.reduce((sum, metric) => sum + metric.lag, 0);
      const avgLag = recentMetrics.length > 0 ? totalLag / recentMetrics.length : 0;
      const maxLag = recentMetrics.length > 0 ? Math.max(...recentMetrics.map(m => m.lag)) : 0;
      
      return {
        groupId,
        avgLag,
        maxLag,
        totalLag,
        measurementCount: recentMetrics.length,
        lastUpdated: recentMetrics.length > 0 ? recentMetrics[recentMetrics.length - 1].collectedAt : null
      };
    });
    
    return {
      consumerGroups: lagHistory,
      totalGroups: lagHistory.length,
      groupsWithHighLag: lagHistory.filter(g => g.maxLag >= this.collectionConfig.lagThresholds.warning).length
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.info('🧹 Cleaning up Consumer Offset Collector...');
    
    try {
      await this.consumerPool.stop();
      
      this.consumerGroupStates.clear();
      this.lagHistory.clear();
      this.isInitialized = false;
      
      logger.success('✅ Consumer Offset Collector cleanup completed');
      
    } catch (error) {
      logger.error('❌ Consumer cleanup failed:', error.message);
    }
  }
}

module.exports = ConsumerOffsetCollector;