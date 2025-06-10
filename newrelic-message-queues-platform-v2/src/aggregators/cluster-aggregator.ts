/**
 * Cluster Aggregator
 * 
 * Aggregates broker-level metrics to create cluster-level metrics
 */

import { injectable, inject } from 'inversify';
import { TYPES } from '../infrastructure/config/types.js';
import { Logger } from '../shared/utils/logger.js';
import { TransformedMetrics } from '../transformers/base-transformer.js';

export interface ClusterMetrics {
  // Health and availability
  healthScore: number;
  availabilityPercentage: number;
  
  // Throughput
  totalBytesInPerSecond: number;
  totalBytesOutPerSecond: number;
  totalMessagesPerSecond: number;
  
  // Resource utilization
  avgCpuUsage: number;
  avgMemoryUsage: number;
  avgDiskUsage: number;
  maxDiskUsage: number;
  
  // Partitions
  totalPartitions: number;
  totalLeaderPartitions: number;
  underReplicatedPartitions: number;
  offlinePartitions: number;
  
  // Brokers
  totalBrokers: number;
  onlineBrokers: number;
  offlineBrokers: number;
  
  // Requests
  totalRequestsPerSecond: number;
  errorRate: number;
  
  // Additional cluster metrics
  totalTopics?: number;
  totalConsumerGroups?: number;
  avgRequestHandlerIdlePercent?: number;
  avgNetworkProcessorIdlePercent?: number;
}

@injectable()
export class ClusterAggregator {
  constructor(
    @inject(TYPES.Logger) private readonly logger: Logger
  ) {
    this.logger = new Logger('ClusterAggregator');
  }

  /**
   * Aggregate broker metrics into cluster metrics
   */
  aggregateBrokerMetrics(brokerMetrics: TransformedMetrics[]): Map<string, TransformedMetrics> {
    const clusterMetricsMap = new Map<string, TransformedMetrics>();
    
    // Group brokers by cluster
    const brokersByCluster = this.groupBrokersByCluster(brokerMetrics);
    
    // Aggregate metrics for each cluster
    brokersByCluster.forEach((brokers, clusterName) => {
      const aggregatedMetrics = this.calculateClusterMetrics(brokers);
      
      const clusterTransformedMetrics: TransformedMetrics = {
        timestamp: Date.now(),
        provider: 'kafka',
        entityType: 'cluster',
        clusterName,
        identifiers: {
          clusterName
        },
        metrics: aggregatedMetrics,
        metadata: {
          brokerCount: brokers.length,
          environment: brokers[0]?.metadata?.environment || 'production',
          region: brokers[0]?.metadata?.region || 'unknown'
        }
      };
      
      clusterMetricsMap.set(clusterName, clusterTransformedMetrics);
    });
    
    this.logger.debug(`Aggregated ${brokerMetrics.length} brokers into ${clusterMetricsMap.size} clusters`);
    
    return clusterMetricsMap;
  }

  /**
   * Group brokers by cluster name
   */
  private groupBrokersByCluster(brokerMetrics: TransformedMetrics[]): Map<string, TransformedMetrics[]> {
    const groups = new Map<string, TransformedMetrics[]>();
    
    brokerMetrics.forEach(broker => {
      const clusterName = broker.clusterName;
      if (!groups.has(clusterName)) {
        groups.set(clusterName, []);
      }
      groups.get(clusterName)!.push(broker);
    });
    
    return groups;
  }

  /**
   * Calculate cluster-level metrics from broker metrics
   */
  private calculateClusterMetrics(brokers: TransformedMetrics[]): Record<string, number> {
    const metrics: ClusterMetrics = {
      // Initialize with zeros
      healthScore: 100,
      availabilityPercentage: 100,
      totalBytesInPerSecond: 0,
      totalBytesOutPerSecond: 0,
      totalMessagesPerSecond: 0,
      avgCpuUsage: 0,
      avgMemoryUsage: 0,
      avgDiskUsage: 0,
      maxDiskUsage: 0,
      totalPartitions: 0,
      totalLeaderPartitions: 0,
      underReplicatedPartitions: 0,
      offlinePartitions: 0,
      totalBrokers: brokers.length,
      onlineBrokers: brokers.length,
      offlineBrokers: 0,
      totalRequestsPerSecond: 0,
      errorRate: 0
    };
    
    if (brokers.length === 0) {
      return metrics as unknown as Record<string, number>;
    }
    
    // Aggregate metrics
    let cpuSum = 0;
    let cpuCount = 0;
    let memorySum = 0;
    let memoryCount = 0;
    let diskSum = 0;
    let diskCount = 0;
    let requestHandlerIdleSum = 0;
    let requestHandlerIdleCount = 0;
    let networkProcessorIdleSum = 0;
    let networkProcessorIdleCount = 0;
    let totalErrors = 0;
    let totalRequests = 0;
    
    brokers.forEach(broker => {
      const m = broker.metrics;
      
      // Throughput (sum)
      metrics.totalBytesInPerSecond += m.bytesInPerSecond || m.networkBytesInPerSecond || 0;
      metrics.totalBytesOutPerSecond += m.bytesOutPerSecond || m.networkBytesOutPerSecond || 0;
      metrics.totalMessagesPerSecond += m.messagesInPerSecond || m.throughputPerSecond || 0;
      
      // Resource utilization (average)
      if (m.cpuUsagePercent !== undefined) {
        cpuSum += m.cpuUsagePercent;
        cpuCount++;
      }
      if (m.memoryUsagePercent !== undefined || m.memoryUsedBytes !== undefined) {
        const memoryPercent = m.memoryUsagePercent || 
          (m.memoryUsedBytes && m.memoryTotalBytes ? 
            (m.memoryUsedBytes / m.memoryTotalBytes) * 100 : 0);
        if (memoryPercent > 0) {
          memorySum += memoryPercent;
          memoryCount++;
        }
      }
      if (m.diskUsagePercent !== undefined) {
        diskSum += m.diskUsagePercent;
        diskCount++;
        metrics.maxDiskUsage = Math.max(metrics.maxDiskUsage, m.diskUsagePercent);
      }
      
      // Partitions (sum)
      metrics.totalPartitions += m.partitionCount || 0;
      metrics.totalLeaderPartitions += m.leaderPartitionCount || 0;
      metrics.underReplicatedPartitions += m.underReplicatedPartitions || 0;
      metrics.offlinePartitions += m.offlinePartitions || m.offlinePartitionsCount || 0;
      
      // Requests (sum)
      const requests = m.requestsPerSecond || m.requestRate || 0;
      metrics.totalRequestsPerSecond += requests;
      totalRequests += requests;
      
      // Error tracking
      if (m.errorRate !== undefined) {
        totalErrors += requests * (m.errorRate / 100);
      }
      
      // Additional metrics
      if (m.requestHandlerIdlePercent !== undefined) {
        requestHandlerIdleSum += m.requestHandlerIdlePercent;
        requestHandlerIdleCount++;
      }
      if (m.networkProcessorIdlePercent !== undefined) {
        networkProcessorIdleSum += m.networkProcessorIdlePercent;
        networkProcessorIdleCount++;
      }
    });
    
    // Calculate averages
    metrics.avgCpuUsage = cpuCount > 0 ? cpuSum / cpuCount : 0;
    metrics.avgMemoryUsage = memoryCount > 0 ? memorySum / memoryCount : 0;
    metrics.avgDiskUsage = diskCount > 0 ? diskSum / diskCount : 0;
    
    // Calculate error rate
    metrics.errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
    
    // Calculate health score
    metrics.healthScore = this.calculateHealthScore(metrics);
    
    // Calculate availability
    metrics.availabilityPercentage = this.calculateAvailability(metrics);
    
    // Add optional metrics
    if (requestHandlerIdleCount > 0) {
      metrics.avgRequestHandlerIdlePercent = requestHandlerIdleSum / requestHandlerIdleCount;
    }
    if (networkProcessorIdleCount > 0) {
      metrics.avgNetworkProcessorIdlePercent = networkProcessorIdleSum / networkProcessorIdleCount;
    }
    
    // Convert to plain object
    const result: Record<string, number> = {};
    Object.entries(metrics).forEach(([key, value]) => {
      if (typeof value === 'number') {
        result[key] = value;
      }
    });
    
    return result;
  }

  /**
   * Calculate cluster health score based on various metrics
   */
  private calculateHealthScore(metrics: ClusterMetrics): number {
    let score = 100;
    
    // Deduct for offline partitions (critical)
    if (metrics.offlinePartitions > 0) {
      score -= 30;
    }
    
    // Deduct for under-replicated partitions
    if (metrics.underReplicatedPartitions > 0) {
      score -= Math.min(20, metrics.underReplicatedPartitions * 2);
    }
    
    // Deduct for high resource usage
    if (metrics.avgCpuUsage > 80) {
      score -= Math.min(15, (metrics.avgCpuUsage - 80) * 0.75);
    }
    if (metrics.avgMemoryUsage > 85) {
      score -= Math.min(15, (metrics.avgMemoryUsage - 85) * 0.75);
    }
    if (metrics.maxDiskUsage > 90) {
      score -= Math.min(20, (metrics.maxDiskUsage - 90) * 2);
    }
    
    // Deduct for high error rate
    if (metrics.errorRate > 5) {
      score -= Math.min(20, metrics.errorRate * 2);
    }
    
    // Deduct for low request handler idle (performance issue)
    if (metrics.avgRequestHandlerIdlePercent !== undefined && 
        metrics.avgRequestHandlerIdlePercent < 20) {
      score -= 10;
    }
    
    return Math.max(0, Math.round(score));
  }

  /**
   * Calculate cluster availability percentage
   */
  private calculateAvailability(metrics: ClusterMetrics): number {
    if (metrics.totalBrokers === 0) {
      return 0;
    }
    
    const availability = (metrics.onlineBrokers / metrics.totalBrokers) * 100;
    
    // Reduce availability if there are offline partitions
    if (metrics.offlinePartitions > 0 && metrics.totalPartitions > 0) {
      const partitionAvailability = 
        ((metrics.totalPartitions - metrics.offlinePartitions) / metrics.totalPartitions) * 100;
      return Math.min(availability, partitionAvailability);
    }
    
    return availability;
  }

  /**
   * Aggregate topic metrics for cluster-level topic count
   */
  aggregateTopicCount(topicMetrics: TransformedMetrics[]): Map<string, number> {
    const topicCountByCluster = new Map<string, number>();
    
    topicMetrics.forEach(topic => {
      const clusterName = topic.clusterName;
      topicCountByCluster.set(clusterName, (topicCountByCluster.get(clusterName) || 0) + 1);
    });
    
    return topicCountByCluster;
  }

  /**
   * Aggregate consumer group metrics for cluster-level consumer group count
   */
  aggregateConsumerGroupCount(consumerMetrics: TransformedMetrics[]): Map<string, number> {
    const consumerGroupsByCluster = new Map<string, Set<string>>();
    
    consumerMetrics.forEach(consumer => {
      const clusterName = consumer.clusterName;
      const groupId = consumer.identifiers.consumerGroupId || consumer.identifiers.consumerGroup;
      
      if (!consumerGroupsByCluster.has(clusterName)) {
        consumerGroupsByCluster.set(clusterName, new Set());
      }
      
      if (groupId) {
        consumerGroupsByCluster.get(clusterName)!.add(groupId);
      }
    });
    
    const result = new Map<string, number>();
    consumerGroupsByCluster.forEach((groups, clusterName) => {
      result.set(clusterName, groups.size);
    });
    
    return result;
  }
}