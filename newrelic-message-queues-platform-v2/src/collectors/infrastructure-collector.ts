/**
 * Enhanced Infrastructure Collector
 * 
 * Queries NRDB for real nri-kafka data with comprehensive field selection,
 * consumer group collection, and cluster aggregation support.
 */

import { injectable, inject } from 'inversify';
import { BaseCollector, RawSample } from './base-collector.js';
import { NerdGraphClient } from '../shared/utils/nerdgraph-client.js';
import { PlatformConfig } from '../shared/types/config.js';
import { TYPES } from '@infrastructure/config/types.js';
import { Logger } from '@shared/utils/logger.js';
import { WorkerPool } from '@infrastructure/concurrency/worker-pool.js';

export interface ClusterAggregation {
  clusterName: string;
  brokerCount: number;
  totalPartitions: number;
  totalTopics: number;
  totalBytesInPerSecond: number;
  totalBytesOutPerSecond: number;
  totalMessagesInPerSecond: number;
  avgCpuPercent: number;
  avgMemoryUsed: number;
  avgDiskUsage: number;
}

@injectable()
export class InfrastructureCollector extends BaseCollector {
  private lookbackMinutes: number;
  private maxSamplesPerQuery: number;
  private enableParallelCollection: boolean;
  private lastClusterAggregation?: ClusterAggregation[];

  constructor(
    @inject(TYPES.ConfigurationService) config: PlatformConfig,
    @inject(TYPES.Logger) logger: Logger,
    @inject(TYPES.NerdGraphClient) private nerdGraphClient: NerdGraphClient,
    @inject(TYPES.WorkerPool) private workerPool: WorkerPool
  ) {
    super(config);
    this.logger = logger;
    this.lookbackMinutes = config.lookbackMinutes || 5;
    this.maxSamplesPerQuery = config.maxSamplesPerQuery || 2000;
    this.enableParallelCollection = config.enableParallelCollection !== false;
    
    this.logger.info(`Enhanced infrastructure collector initialized`, {
      lookbackMinutes: this.lookbackMinutes,
      maxSamplesPerQuery: this.maxSamplesPerQuery,
      enableParallelCollection: this.enableParallelCollection
    });
  }

  async collect(): Promise<RawSample[]> {
    const startTime = Date.now();
    this.logger.debug('Starting enhanced infrastructure data collection');
    
    try {
      let allSamples: RawSample[] = [];
      
      if (this.enableParallelCollection) {
        // Use worker pool for parallel collection
        const tasks = [
          () => this.collectBrokerSamples(),
          () => this.collectTopicSamples(),
          () => this.collectConsumerSamples(),
          () => this.collectConsumerOffsetSamples(),
          () => this.collectClusterAggregations()
        ];
        
        const results = await this.workerPool.executeAll(tasks);
        
        // Flatten results (excluding cluster aggregations which are stored separately)
        allSamples = results.slice(0, 4).flat();
        this.lastClusterAggregation = results[4] as ClusterAggregation[];
      } else {
        // Sequential collection
        const [brokerSamples, topicSamples, consumerSamples, offsetSamples] = await Promise.all([
          this.collectBrokerSamples(),
          this.collectTopicSamples(),
          this.collectConsumerSamples(),
          this.collectConsumerOffsetSamples()
        ]);
        
        allSamples = [
          ...brokerSamples,
          ...topicSamples,
          ...consumerSamples,
          ...offsetSamples
        ];
        
        // Collect cluster aggregations separately
        this.lastClusterAggregation = await this.collectClusterAggregations();
      }
      
      // Update stats
      this.stats.totalCollections++;
      this.stats.lastCollectionTime = Date.now();
      this.stats.lastCollectionCount = allSamples.length;
      
      const duration = Date.now() - startTime;
      this.logger.info(`Collected ${allSamples.length} samples in ${duration}ms`, {
        brokers: allSamples.filter(s => s.eventType === 'KafkaBrokerSample').length,
        topics: allSamples.filter(s => s.eventType === 'KafkaTopicSample').length,
        consumers: allSamples.filter(s => s.eventType === 'KafkaConsumerSample').length,
        offsets: allSamples.filter(s => s.eventType === 'KafkaOffsetSample').length,
        clusters: this.lastClusterAggregation?.length || 0
      });
      
      return allSamples;
      
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Error collecting infrastructure data:', error);
      throw error;
    }
  }

  private async collectBrokerSamples(): Promise<RawSample[]> {
    // Enhanced query with all available nri-kafka fields
    const query = `
      FROM KafkaBrokerSample 
      SELECT 
        timestamp,
        hostname,
        entityName,
        entityGuid,
        clusterName,
        'broker.id',
        'broker.state',
        'broker.bytesInPerSecond',
        'broker.bytesOutPerSecond',
        'broker.messagesInPerSecond',
        'broker.fetchConsumerRequestsPerSecond',
        'broker.fetchFollowerRequestsPerSecond',
        'broker.produceRequestsPerSecond',
        'broker.replicationBytesInPerSecond',
        'broker.replicationBytesOutPerSecond',
        'broker.requestHandlerIdlePercent',
        'broker.requestsPerSecond',
        'broker.logFlushRate',
        'broker.partitionCount',
        'broker.leaderPartitionCount',
        'broker.offlinePartitionCount',
        'broker.underReplicatedPartitionCount',
        'broker.preferredReplicaImbalanceCount',
        'broker.ioWaitPercent',
        'broker.diskUsedPercent',
        'broker.diskFreeBytes',
        'broker.networkProcessorIdlePercent',
        'jvm.heapMemoryUsed',
        'jvm.nonHeapMemoryUsed',
        'jvm.gcTimeMillis',
        'jvm.gcCount',
        'system.cpuPercent',
        'system.loadAverageOneMinute',
        'system.memoryUsedBytes',
        'system.memoryFreeBytes',
        'system.swapUsedBytes',
        'kafka.broker.logFlushRate',
        'kafka.controller.activeControllerCount',
        'kafka.controller.offlinePartitionsCount',
        'kafka.network.requestsPerSecond',
        provider,
        providerVersion,
        datacenter,
        environment,
        service,
        team,
        region
      WHERE provider = 'KafkaBroker'
      SINCE ${this.lookbackMinutes} minutes ago
      LIMIT ${this.maxSamplesPerQuery}
    `;
    
    try {
      const results = await this.nerdGraphClient.query(query);
      
      return results.map(sample => ({
        eventType: 'KafkaBrokerSample' as const,
        timestamp: sample.timestamp || Math.floor(Date.now() / 1000),
        ...this.normalizeFieldNames(sample)
      }));
    } catch (error) {
      this.logger.error('Failed to collect broker samples:', error);
      return [];
    }
  }

  private async collectTopicSamples(): Promise<RawSample[]> {
    const query = `
      FROM KafkaTopicSample 
      SELECT 
        timestamp,
        hostname,
        entityName,
        entityGuid,
        clusterName,
        'topic.name',
        'topic.partitionCount',
        'topic.replicationFactor',
        'topic.minInSyncReplicas',
        'topic.retentionBytes',
        'topic.retentionMs',
        'topic.segmentBytes',
        'topic.segmentMs',
        'topic.underReplicatedPartitions',
        'topic.preferredReplicaImbalance',
        'topic.bytesInRate',
        'topic.bytesOutRate',
        'topic.messagesInRate',
        'topic.fetchRequestRate',
        'topic.produceRequestRate',
        'topic.failedFetchRequestRate',
        'topic.failedProduceRequestRate',
        'topic.logSize',
        'topic.logStartOffset',
        'topic.logEndOffset',
        'topic.sizeBytes',
        'topic.compressionType',
        'topic.cleanupPolicy',
        provider,
        providerVersion,
        datacenter,
        environment,
        service,
        team,
        region
      WHERE provider = 'KafkaTopic'
      SINCE ${this.lookbackMinutes} minutes ago
      LIMIT ${this.maxSamplesPerQuery}
    `;
    
    try {
      const results = await this.nerdGraphClient.query(query);
      
      return results.map(sample => ({
        eventType: 'KafkaTopicSample' as const,
        timestamp: sample.timestamp || Math.floor(Date.now() / 1000),
        ...this.normalizeFieldNames(sample)
      }));
    } catch (error) {
      this.logger.error('Failed to collect topic samples:', error);
      return [];
    }
  }

  private async collectConsumerSamples(): Promise<RawSample[]> {
    const query = `
      FROM KafkaConsumerSample 
      SELECT 
        timestamp,
        hostname,
        entityName,
        entityGuid,
        clusterName,
        'consumer.group',
        'consumer.clientId',
        'consumer.memberId',
        'consumer.host',
        'consumer.state',
        'consumer.assignmentStrategy',
        'consumer.messageConsumptionRate',
        'consumer.bytesConsumptionRate',
        'consumer.recordsConsumedRate',
        'consumer.recordsPerRequestAvg',
        'consumer.fetchLatencyAvg',
        'consumer.fetchLatencyMax',
        'consumer.fetchRate',
        'consumer.commitRate',
        'consumer.commitLatencyAvg',
        'consumer.commitLatencyMax',
        'consumer.assignedPartitions',
        'consumer.heartbeatRate',
        'consumer.sessionTimeoutMs',
        'consumer.rebalanceLatencyAvg',
        'consumer.rebalanceLatencyMax',
        'consumer.rebalanceRate',
        'consumer.rebalanceTotal',
        'consumer.lastRebalanceSecondsAgo',
        'consumer.totalOffsetLag',
        'consumer.maxOffsetLag',
        'consumer.avgOffsetLag',
        'consumer.memberCount',
        provider,
        providerVersion,
        datacenter,
        environment,
        service,
        team,
        region
      WHERE provider = 'KafkaConsumer'
      SINCE ${this.lookbackMinutes} minutes ago
      LIMIT ${this.maxSamplesPerQuery}
    `;
    
    try {
      const results = await this.nerdGraphClient.query(query);
      
      return results.map(sample => ({
        eventType: 'KafkaConsumerSample' as const,
        timestamp: sample.timestamp || Math.floor(Date.now() / 1000),
        ...this.normalizeFieldNames(sample)
      }));
    } catch (error) {
      this.logger.error('Failed to collect consumer samples:', error);
      return [];
    }
  }

  private async collectConsumerOffsetSamples(): Promise<RawSample[]> {
    // Query for consumer offset/lag information
    const query = `
      FROM KafkaOffsetSample 
      SELECT 
        timestamp,
        hostname,
        entityName,
        entityGuid,
        clusterName,
        'consumer.group',
        'consumer.topic',
        'consumer.partition',
        'consumer.currentOffset',
        'consumer.logEndOffset',
        'consumer.offsetLag',
        'consumer.lastCommitTime',
        'consumer.commitLatency',
        provider,
        environment
      WHERE provider IN ('KafkaConsumer', 'KafkaOffset')
      SINCE ${this.lookbackMinutes} minutes ago
      LIMIT ${this.maxSamplesPerQuery}
    `;
    
    try {
      const results = await this.nerdGraphClient.query(query);
      
      if (results.length === 0) {
        // Fallback to KafkaConsumerSample for offset data
        return this.collectConsumerOffsetFromConsumerSample();
      }
      
      return results.map(sample => ({
        eventType: 'KafkaOffsetSample' as const,
        timestamp: sample.timestamp || Math.floor(Date.now() / 1000),
        ...this.normalizeFieldNames(sample)
      }));
    } catch (error) {
      this.logger.warn('Failed to collect offset samples, trying fallback:', error);
      return this.collectConsumerOffsetFromConsumerSample();
    }
  }

  private async collectConsumerOffsetFromConsumerSample(): Promise<RawSample[]> {
    // Fallback query to extract offset information from KafkaConsumerSample
    const query = `
      FROM KafkaConsumerSample
      SELECT 
        timestamp,
        clusterName,
        'consumer.group' as consumerGroup,
        'consumer.totalOffsetLag' as offsetLag,
        'consumer.maxOffsetLag' as maxOffsetLag,
        'consumer.avgOffsetLag' as avgOffsetLag
      WHERE 'consumer.totalOffsetLag' IS NOT NULL
      SINCE ${this.lookbackMinutes} minutes ago
      LIMIT ${this.maxSamplesPerQuery}
    `;
    
    try {
      const results = await this.nerdGraphClient.query(query);
      return results.map(sample => ({
        eventType: 'KafkaOffsetSample' as const,
        timestamp: sample.timestamp || Math.floor(Date.now() / 1000),
        ...sample
      }));
    } catch (error) {
      this.logger.error('Fallback offset collection also failed:', error);
      return [];
    }
  }

  private async collectClusterAggregations(): Promise<ClusterAggregation[]> {
    // Aggregate broker metrics to create cluster-level view
    const query = `
      FROM KafkaBrokerSample
      SELECT 
        count(*) as brokerCount,
        sum('broker.partitionCount') as totalPartitions,
        sum('broker.bytesInPerSecond') as totalBytesInPerSecond,
        sum('broker.bytesOutPerSecond') as totalBytesOutPerSecond,
        sum('broker.messagesInPerSecond') as totalMessagesInPerSecond,
        average('system.cpuPercent') as avgCpuPercent,
        average('system.memoryUsedBytes') as avgMemoryUsed,
        average('broker.diskUsedPercent') as avgDiskUsage
      WHERE provider = 'KafkaBroker'
      FACET clusterName
      SINCE ${this.lookbackMinutes} minutes ago
      LIMIT 100
    `;
    
    try {
      const results = await this.nerdGraphClient.query(query);
      
      // Also get topic count per cluster
      const topicCountQuery = `
        FROM KafkaTopicSample
        SELECT uniqueCount('topic.name') as totalTopics
        WHERE provider = 'KafkaTopic'
        FACET clusterName
        SINCE ${this.lookbackMinutes} minutes ago
        LIMIT 100
      `;
      
      const topicResults = await this.nerdGraphClient.query(topicCountQuery);
      const topicCountMap = new Map(topicResults.map(r => [r.clusterName, r.totalTopics]));
      
      return results.map(result => ({
        clusterName: result.clusterName || 'unknown',
        brokerCount: result.brokerCount || 0,
        totalPartitions: result.totalPartitions || 0,
        totalTopics: topicCountMap.get(result.clusterName) || 0,
        totalBytesInPerSecond: result.totalBytesInPerSecond || 0,
        totalBytesOutPerSecond: result.totalBytesOutPerSecond || 0,
        totalMessagesInPerSecond: result.totalMessagesInPerSecond || 0,
        avgCpuPercent: result.avgCpuPercent || 0,
        avgMemoryUsed: result.avgMemoryUsed || 0,
        avgDiskUsage: result.avgDiskUsage || 0
      }));
    } catch (error) {
      this.logger.error('Failed to collect cluster aggregations:', error);
      return [];
    }
  }

  /**
   * Normalize field names to handle different nri-kafka versions
   */
  private normalizeFieldNames(sample: Record<string, any>): Record<string, any> {
    const normalized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(sample)) {
      // Handle both dot notation and underscore notation
      const normalizedKey = key
        .replace(/^kafka\./, '')        // Remove kafka. prefix
        .replace(/^broker_/, 'broker.')  // Convert broker_ to broker.
        .replace(/^topic_/, 'topic.')    // Convert topic_ to topic.
        .replace(/^consumer_/, 'consumer.') // Convert consumer_ to consumer.
        .replace(/_/g, '.');             // Convert remaining underscores to dots
      
      normalized[normalizedKey] = value;
      
      // Also keep original key for compatibility
      if (normalizedKey !== key) {
        normalized[key] = value;
      }
    }
    
    return normalized;
  }

  /**
   * Get last cluster aggregation results
   */
  getClusterAggregations(): ClusterAggregation[] {
    return this.lastClusterAggregation || [];
  }

  /**
   * Get collector health status
   */
  getHealthStatus(): Record<string, any> {
    const stats = this.getStats();
    const errorRate = stats.totalCollections > 0 
      ? (stats.errors / stats.totalCollections) * 100 
      : 0;
    
    return {
      ...stats,
      errorRate,
      isHealthy: errorRate < 10, // Less than 10% error rate
      nerdGraphStats: this.nerdGraphClient.getStats()
    };
  }
}