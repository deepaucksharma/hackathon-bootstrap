/**
 * Enhanced NRI-Kafka Transformer
 * 
 * Comprehensive transformation of nri-kafka data with full field mapping support
 * for all versions of nri-kafka and proper cluster aggregation
 */

import { injectable, inject } from 'inversify';
import { BaseTransformer, TransformedMetrics } from './base-transformer';
import { RawSample } from '../collectors/base-collector';
import { PlatformConfig } from '../shared/types/config';
import { Logger } from '../shared/utils/logger';
import { TYPES } from '@infrastructure/config/types';

@injectable()
export class EnhancedNriKafkaTransformer extends BaseTransformer {
  constructor(
    @inject(TYPES.ConfigurationService) config: PlatformConfig
  ) {
    super(config);
    this.logger = new Logger('EnhancedNriKafkaTransformer');
  }

  async transform(sample: RawSample): Promise<TransformedMetrics> {
    switch (sample.eventType) {
      case 'KafkaBrokerSample':
        return this.transformBrokerSample(sample);
      
      case 'KafkaTopicSample':
        return this.transformTopicSample(sample);
      
      case 'KafkaConsumerSample':
        return this.transformConsumerSample(sample);
      
      case 'KafkaOffsetSample':
        return this.transformOffsetSample(sample);
      
      default:
        throw new Error(`Unknown sample type: ${sample.eventType}`);
    }
  }

  private transformBrokerSample(sample: RawSample): TransformedMetrics {
    const clusterName = this.extractClusterName(sample);
    const brokerId = this.extractBrokerId(sample);
    const hostname = this.extractHostname(sample);
    
    const metrics: Record<string, number> = {};
    
    // Throughput metrics with comprehensive fallbacks
    metrics.throughputPerSecond = this.extractMetricWithFallbacks(sample, [
      'broker.messagesInPerSecond',
      'messagesInPerSecond',
      'kafka.broker.MessagesInPerSec.OneMinuteRate',
      'broker.messages.in.rate',
      'broker_messagesInPerSecond'
    ]);
    
    metrics.bytesInPerSecond = this.extractMetricWithFallbacks(sample, [
      'broker.bytesInPerSecond',
      'bytesInPerSecond',
      'kafka.server.BrokerTopicMetrics.BytesInPerSec',
      'net.bytesInPerSec',
      'broker_bytesInPerSecond'
    ]);
    
    metrics.bytesOutPerSecond = this.extractMetricWithFallbacks(sample, [
      'broker.bytesOutPerSecond',
      'bytesOutPerSecond',
      'kafka.server.BrokerTopicMetrics.BytesOutPerSec',
      'net.bytesOutPerSec',
      'broker_bytesOutPerSecond'
    ]);
    
    // Request metrics
    metrics.requestsPerSecond = this.extractMetricWithFallbacks(sample, [
      'broker.requestsPerSecond',
      'requestsPerSecond',
      'kafka.network.RequestsPerSec',
      'broker.request.total.rate',
      'broker_requestsPerSecond'
    ]);
    
    metrics.fetchRequestsPerSecond = this.extractMetricWithFallbacks(sample, [
      'broker.fetchRequestsPerSecond',
      'broker.fetchConsumerRequestsPerSecond',
      'fetchRequestsPerSecond',
      'kafka.network.RequestMetrics.FetchConsumer.RequestsPerSec',
      'broker.fetch.consumer.rate'
    ]);
    
    metrics.produceRequestsPerSecond = this.extractMetricWithFallbacks(sample, [
      'broker.produceRequestsPerSecond',
      'produceRequestsPerSecond',
      'kafka.network.RequestMetrics.Produce.RequestsPerSec',
      'broker.produce.rate',
      'broker_produceRequestsPerSecond'
    ]);
    
    // Partition metrics
    metrics.partitionCount = this.extractMetricWithFallbacks(sample, [
      'broker.partitionCount',
      'partitionCount',
      'kafka.server.ReplicaManager.PartitionCount',
      'broker.partition.count',
      'broker_partitionCount'
    ]);
    
    metrics.leaderPartitionCount = this.extractMetricWithFallbacks(sample, [
      'broker.leaderPartitionCount',
      'leaderPartitionCount',
      'kafka.server.ReplicaManager.LeaderCount',
      'broker.leader.count',
      'broker_leaderPartitionCount'
    ]);
    
    metrics.underReplicatedPartitions = this.extractMetricWithFallbacks(sample, [
      'broker.underReplicatedPartitions',
      'broker.underReplicatedPartitionCount',
      'underReplicatedPartitions',
      'kafka.server.ReplicaManager.UnderReplicatedPartitions',
      'broker.partition.underReplicated'
    ]);
    
    metrics.offlinePartitionsCount = this.extractMetricWithFallbacks(sample, [
      'broker.offlinePartitionsCount',
      'broker.offlinePartitionCount',
      'offlinePartitionsCount',
      'kafka.controller.KafkaController.OfflinePartitionsCount',
      'broker.partition.offline'
    ]);
    
    // Resource utilization
    metrics.cpuUsagePercent = this.extractMetricWithFallbacks(sample, [
      'broker.cpuPercent',
      'cpuPercent',
      'system.cpuPercent',
      'kafka.broker.cpuPercent',
      'broker.cpu.percent',
      'broker_cpuPercent'
    ]);
    
    // Disk metrics - complex handling for different reporting styles
    const diskUsed = this.extractMetricWithFallbacks(sample, [
      'broker.diskUsed',
      'broker.diskUsedBytes',
      'diskUsed',
      'broker.diskUsage',
      'diskUsage'
    ]);
    
    const diskFree = this.extractMetricWithFallbacks(sample, [
      'broker.diskFree',
      'broker.diskFreeBytes',
      'diskFree',
      'diskFreeBytes'
    ]);
    
    const diskTotal = this.extractMetricWithFallbacks(sample, [
      'broker.diskTotal',
      'diskTotal',
      'broker.diskCapacity',
      'diskCapacity'
    ]);
    
    // Calculate disk metrics
    if (diskUsed > 0) {
      metrics.diskUsedBytes = diskUsed;
      
      if (diskTotal > 0) {
        metrics.diskUsagePercent = (diskUsed / diskTotal) * 100;
        metrics.diskTotalBytes = diskTotal;
      } else if (diskFree > 0) {
        const calculatedTotal = diskUsed + diskFree;
        metrics.diskUsagePercent = (diskUsed / calculatedTotal) * 100;
        metrics.diskTotalBytes = calculatedTotal;
      }
    }
    
    // Direct disk percentage if available
    const diskPercent = this.extractMetricWithFallbacks(sample, [
      'broker.diskUsedPercent',
      'diskUsedPercent',
      'broker.disk.used.percent',
      'broker_diskUsedPercent'
    ]);
    
    if (diskPercent > 0) {
      metrics.diskUsagePercent = diskPercent;
    }
    
    // Memory metrics
    metrics.memoryUsedBytes = this.extractMetricWithFallbacks(sample, [
      'broker.memoryUsed',
      'memoryUsed',
      'system.memoryUsedBytes',
      'jvm.heapMemoryUsed',
      'broker.memory.used',
      'broker_memoryUsed'
    ]);
    
    metrics.memoryTotalBytes = this.extractMetricWithFallbacks(sample, [
      'broker.memoryTotal',
      'memoryTotal',
      'system.memoryTotalBytes',
      'system.memoryFreeBytes',
      'jvm.heapMemoryMax',
      'broker.memory.total'
    ]);
    
    // Request handler metrics
    metrics.requestHandlerIdlePercent = this.extractMetricWithFallbacks(sample, [
      'broker.requestHandlerIdlePercent',
      'requestHandlerIdlePercent',
      'kafka.server.KafkaRequestHandlerPool.RequestHandlerAvgIdlePercent',
      'broker.handler.idle.percent',
      'broker_requestHandlerIdlePercent'
    ]);
    
    // Network processor idle (important for performance)
    metrics.networkProcessorIdlePercent = this.extractMetricWithFallbacks(sample, [
      'broker.networkProcessorIdlePercent',
      'networkProcessorIdlePercent',
      'kafka.network.NetworkProcessorAvgIdlePercent',
      'broker.network.idle.percent'
    ]);
    
    // Replication metrics
    metrics.replicationBytesInPerSecond = this.extractMetricWithFallbacks(sample, [
      'broker.replicationBytesInPerSecond',
      'replicationBytesInPerSecond',
      'kafka.server.BrokerTopicMetrics.ReplicationBytesInPerSec',
      'replication.bytesIn.rate',
      'broker_replicationBytesInPerSecond'
    ]);
    
    metrics.replicationBytesOutPerSecond = this.extractMetricWithFallbacks(sample, [
      'broker.replicationBytesOutPerSecond',
      'replicationBytesOutPerSecond',
      'kafka.server.BrokerTopicMetrics.ReplicationBytesOutPerSec',
      'replication.bytesOut.rate',
      'broker_replicationBytesOutPerSecond'
    ]);
    
    // Log flush metrics
    metrics.logFlushRate = this.extractMetricWithFallbacks(sample, [
      'kafka.broker.logFlushRate',
      'broker.logFlushRate',
      'logFlushRate',
      'kafka.log.LogFlushStats.LogFlushRateAndTimeMs',
      'broker_logFlushRate'
    ]);
    
    // JVM metrics
    metrics.gcTimeMillis = this.extractMetricWithFallbacks(sample, [
      'jvm.gcTimeMillis',
      'gcTimeMillis',
      'jvm.gc.time',
      'broker.gc.time',
      'jvm_gcTimeMillis'
    ]);
    
    metrics.gcCount = this.extractMetricWithFallbacks(sample, [
      'jvm.gcCount',
      'gcCount',
      'jvm.gc.count',
      'broker.gc.count',
      'jvm_gcCount'
    ]);
    
    // IO wait (important for disk performance)
    metrics.ioWaitPercent = this.extractMetricWithFallbacks(sample, [
      'broker.ioWaitPercent',
      'ioWaitPercent',
      'system.ioWaitPercent',
      'broker.io.wait.percent'
    ]);
    
    // Controller metrics (only on controller broker)
    metrics.activeControllerCount = this.extractMetricWithFallbacks(sample, [
      'kafka.controller.activeControllerCount',
      'activeControllerCount',
      'kafka.controller.KafkaController.ActiveControllerCount'
    ]);
    
    return {
      timestamp: sample.timestamp || Date.now(),
      provider: 'kafka',
      entityType: 'broker',
      clusterName,
      identifiers: {
        brokerId,
        hostname
      },
      metrics: this.cleanMetrics(metrics),
      metadata: {
        environment: this.config.environment || 'production',
        region: sample.region || 'unknown',
        datacenter: sample.datacenter,
        service: sample.service,
        team: sample.team,
        providerVersion: sample.providerVersion,
        entityGuid: sample.entityGuid,
        entityName: sample.entityName
      },
      originalEventType: sample.eventType
    };
  }

  private transformTopicSample(sample: RawSample): TransformedMetrics {
    const clusterName = this.extractClusterName(sample);
    const topicName = this.extractTopicName(sample);
    
    const metrics: Record<string, number> = {};
    
    // Message rate metrics
    metrics.messageInRate = this.extractMetricWithFallbacks(sample, [
      'topic.messageInRate',
      'topic.messagesInRate',
      'messageInRate',
      'kafka.server.BrokerTopicMetrics.MessagesInPerSec',
      'topic_messageInRate'
    ]);
    
    metrics.messageOutRate = this.extractMetricWithFallbacks(sample, [
      'topic.messageOutRate',
      'topic.messagesOutRate',
      'messageOutRate',
      'kafka.server.BrokerTopicMetrics.MessagesOutPerSec',
      'topic_messageOutRate'
    ]);
    
    // Byte rate metrics
    metrics.bytesInRate = this.extractMetricWithFallbacks(sample, [
      'topic.bytesInRate',
      'topic.bytesInPerSecond',
      'bytesInRate',
      'kafka.server.BrokerTopicMetrics.BytesInPerSec',
      'topic_bytesInRate'
    ]);
    
    metrics.bytesOutRate = this.extractMetricWithFallbacks(sample, [
      'topic.bytesOutRate',
      'topic.bytesOutPerSecond',
      'bytesOutRate',
      'kafka.server.BrokerTopicMetrics.BytesOutPerSec',
      'topic_bytesOutRate'
    ]);
    
    // Request rate metrics
    metrics.fetchRequestRate = this.extractMetricWithFallbacks(sample, [
      'topic.fetchRequestRate',
      'topic.fetchRequestsPerSecond',
      'fetchRequestRate',
      'kafka.server.BrokerTopicMetrics.TotalFetchRequestsPerSec',
      'topic_fetchRequestRate'
    ]);
    
    metrics.produceRequestRate = this.extractMetricWithFallbacks(sample, [
      'topic.produceRequestRate',
      'topic.produceRequestsPerSecond',
      'produceRequestRate',
      'kafka.server.BrokerTopicMetrics.TotalProduceRequestsPerSec',
      'topic_produceRequestRate'
    ]);
    
    // Failed request rates
    metrics.failedFetchRequestRate = this.extractMetricWithFallbacks(sample, [
      'topic.failedFetchRequestRate',
      'failedFetchRequestRate',
      'kafka.server.BrokerTopicMetrics.FailedFetchRequestsPerSec',
      'topic_failedFetchRequestRate'
    ]);
    
    metrics.failedProduceRequestRate = this.extractMetricWithFallbacks(sample, [
      'topic.failedProduceRequestRate',
      'failedProduceRequestRate',
      'kafka.server.BrokerTopicMetrics.FailedProduceRequestsPerSec',
      'topic_failedProduceRequestRate'
    ]);
    
    // Partition and replication metrics
    metrics.partitionCount = this.extractMetricWithFallbacks(sample, [
      'topic.partitionCount',
      'partitionCount',
      'topic.partitions',
      'topic_partitionCount'
    ]);
    
    metrics.replicationFactor = this.extractMetricWithFallbacks(sample, [
      'topic.replicationFactor',
      'replicationFactor',
      'topic.replicas',
      'topic_replicationFactor'
    ]);
    
    metrics.underReplicatedPartitions = this.extractMetricWithFallbacks(sample, [
      'topic.underReplicatedPartitions',
      'underReplicatedPartitions',
      'topic.underReplicated',
      'topic_underReplicatedPartitions'
    ]);
    
    metrics.preferredReplicaImbalance = this.extractMetricWithFallbacks(sample, [
      'topic.preferredReplicaImbalance',
      'preferredReplicaImbalance',
      'topic.imbalance',
      'topic_preferredReplicaImbalance'
    ]);
    
    // Size metrics
    metrics.totalBytes = this.extractMetricWithFallbacks(sample, [
      'topic.sizeBytes',
      'topic.size',
      'sizeBytes',
      'topic.totalBytes',
      'topic_sizeBytes'
    ]);
    
    metrics.logSize = this.extractMetricWithFallbacks(sample, [
      'topic.logSize',
      'logSize',
      'topic.log.size',
      'topic_logSize'
    ]);
    
    // Offset metrics
    metrics.logStartOffset = this.extractMetricWithFallbacks(sample, [
      'topic.logStartOffset',
      'logStartOffset',
      'topic.log.start.offset',
      'topic_logStartOffset'
    ]);
    
    metrics.logEndOffset = this.extractMetricWithFallbacks(sample, [
      'topic.logEndOffset',
      'logEndOffset',
      'topic.log.end.offset',
      'topic_logEndOffset'
    ]);
    
    // Consumer lag (if available at topic level)
    metrics.offsetLag = this.extractMetricWithFallbacks(sample, [
      'topic.offsetLag',
      'offsetLag',
      'topic.lag',
      'topic_offsetLag'
    ]);
    
    return {
      timestamp: sample.timestamp || Date.now(),
      provider: 'kafka',
      entityType: 'topic',
      clusterName,
      identifiers: {
        topicName
      },
      metrics: this.cleanMetrics(metrics),
      metadata: {
        environment: this.config.environment || 'production',
        retentionMs: String(sample['topic.retentionMs'] || sample.retentionMs || -1),
        compressionType: sample['topic.compressionType'] || sample.compressionType || 'none',
        cleanupPolicy: sample['topic.cleanupPolicy'] || sample.cleanupPolicy || 'delete',
        minInSyncReplicas: sample['topic.minInSyncReplicas'] || sample.minInSyncReplicas,
        segmentBytes: sample['topic.segmentBytes'] || sample.segmentBytes,
        segmentMs: sample['topic.segmentMs'] || sample.segmentMs,
        entityGuid: sample.entityGuid,
        entityName: sample.entityName
      },
      originalEventType: sample.eventType
    };
  }

  private transformConsumerSample(sample: RawSample): TransformedMetrics {
    const clusterName = this.extractClusterName(sample);
    const consumerGroup = this.extractConsumerGroup(sample);
    const clientId = this.extractClientId(sample);
    const topicName = this.extractTopicNameFromConsumer(sample);
    
    const metrics: Record<string, number> = {};
    
    // Message consumption metrics
    metrics.messageConsumptionRate = this.extractMetricWithFallbacks(sample, [
      'consumer.messageConsumptionRate',
      'messageConsumptionRate',
      'consumer.messagesPerSecond',
      'consumer.recordsConsumedRate',
      'consumer_messageConsumptionRate'
    ]);
    
    metrics.bytesConsumptionRate = this.extractMetricWithFallbacks(sample, [
      'consumer.bytesConsumptionRate',
      'bytesConsumptionRate',
      'consumer.bytesPerSecond',
      'consumer_bytesConsumptionRate'
    ]);
    
    // Lag metrics - critical for consumer monitoring
    metrics.offsetLag = this.extractMetricWithFallbacks(sample, [
      'consumer.offsetLag',
      'consumer.lag',
      'offsetLag',
      'consumer.totalOffsetLag',
      'consumer_offsetLag'
    ]);
    
    metrics.maxOffsetLag = this.extractMetricWithFallbacks(sample, [
      'consumer.maxOffsetLag',
      'maxOffsetLag',
      'consumer.maxLag',
      'consumer_maxOffsetLag'
    ]);
    
    metrics.totalOffsetLag = this.extractMetricWithFallbacks(sample, [
      'consumer.totalOffsetLag',
      'totalOffsetLag',
      'consumer.sumOffsetLag',
      'consumer_totalOffsetLag'
    ]);
    
    metrics.avgOffsetLag = this.extractMetricWithFallbacks(sample, [
      'consumer.avgOffsetLag',
      'avgOffsetLag',
      'consumer.averageOffsetLag',
      'consumer_avgOffsetLag'
    ]);
    
    // Fetch metrics
    metrics.fetchRate = this.extractMetricWithFallbacks(sample, [
      'consumer.fetchRate',
      'fetchRate',
      'consumer.fetchRequestsPerSecond',
      'consumer_fetchRate'
    ]);
    
    metrics.fetchLatencyAvg = this.extractMetricWithFallbacks(sample, [
      'consumer.fetchLatencyAvg',
      'fetchLatencyAvg',
      'consumer.fetch.latency.avg',
      'consumer_fetchLatencyAvg'
    ]);
    
    metrics.fetchLatencyMax = this.extractMetricWithFallbacks(sample, [
      'consumer.fetchLatencyMax',
      'fetchLatencyMax',
      'consumer.fetch.latency.max',
      'consumer_fetchLatencyMax'
    ]);
    
    metrics.recordsPerRequestAvg = this.extractMetricWithFallbacks(sample, [
      'consumer.recordsPerRequestAvg',
      'recordsPerRequestAvg',
      'consumer.records.per.request.avg',
      'consumer_recordsPerRequestAvg'
    ]);
    
    // Commit metrics
    metrics.commitRate = this.extractMetricWithFallbacks(sample, [
      'consumer.commitRate',
      'commitRate',
      'consumer.commitRequestsPerSecond',
      'consumer_commitRate'
    ]);
    
    metrics.commitLatencyAvg = this.extractMetricWithFallbacks(sample, [
      'consumer.commitLatencyAvg',
      'commitLatencyAvg',
      'consumer.commit.latency.avg',
      'consumer.averageCommitLatency',
      'consumer_commitLatencyAvg'
    ]);
    
    metrics.commitLatencyMax = this.extractMetricWithFallbacks(sample, [
      'consumer.commitLatencyMax',
      'commitLatencyMax',
      'consumer.commit.latency.max',
      'consumer_commitLatencyMax'
    ]);
    
    // Group coordination metrics
    metrics.memberCount = this.extractMetricWithFallbacks(sample, [
      'consumer.memberCount',
      'memberCount',
      'consumer.members',
      'consumer.groupSize',
      'consumer_memberCount'
    ]);
    
    metrics.assignedPartitions = this.extractMetricWithFallbacks(sample, [
      'consumer.assignedPartitions',
      'assignedPartitions',
      'consumer.partitions.assigned',
      'consumer_assignedPartitions'
    ]);
    
    metrics.heartbeatRate = this.extractMetricWithFallbacks(sample, [
      'consumer.heartbeatRate',
      'heartbeatRate',
      'consumer.heartbeatsPerSecond',
      'consumer_heartbeatRate'
    ]);
    
    // Rebalance metrics
    metrics.rebalanceRate = this.extractMetricWithFallbacks(sample, [
      'consumer.rebalanceRate',
      'rebalanceRate',
      'consumer.rebalancesPerHour',
      'consumer_rebalanceRate'
    ]);
    
    metrics.rebalanceLatencyAvg = this.extractMetricWithFallbacks(sample, [
      'consumer.rebalanceLatencyAvg',
      'rebalanceLatencyAvg',
      'consumer.rebalance.latency.avg',
      'consumer_rebalanceLatencyAvg'
    ]);
    
    metrics.rebalanceLatencyMax = this.extractMetricWithFallbacks(sample, [
      'consumer.rebalanceLatencyMax',
      'rebalanceLatencyMax',
      'consumer.rebalance.latency.max',
      'consumer_rebalanceLatencyMax'
    ]);
    
    metrics.rebalanceTotal = this.extractMetricWithFallbacks(sample, [
      'consumer.rebalanceTotal',
      'rebalanceTotal',
      'consumer.rebalances.total',
      'consumer_rebalanceTotal'
    ]);
    
    metrics.lastRebalanceSecondsAgo = this.extractMetricWithFallbacks(sample, [
      'consumer.lastRebalanceSecondsAgo',
      'lastRebalanceSecondsAgo',
      'consumer.time.since.last.rebalance',
      'consumer_lastRebalanceSecondsAgo'
    ]);
    
    return {
      timestamp: sample.timestamp || Date.now(),
      provider: 'kafka',
      entityType: 'consumer',
      clusterName,
      identifiers: {
        consumerGroup,
        clientId,
        topicName
      },
      metrics: this.cleanMetrics(metrics),
      metadata: {
        environment: this.config.environment || 'production',
        assignmentStrategy: sample['consumer.assignmentStrategy'] || sample.assignmentStrategy || 'range',
        state: sample['consumer.state'] || sample.state || 'active',
        memberId: sample['consumer.memberId'] || sample.memberId,
        host: sample['consumer.host'] || sample.host,
        sessionTimeoutMs: sample['consumer.sessionTimeoutMs'] || sample.sessionTimeoutMs,
        entityGuid: sample.entityGuid,
        entityName: sample.entityName
      },
      originalEventType: sample.eventType
    };
  }

  private transformOffsetSample(sample: RawSample): TransformedMetrics {
    const clusterName = this.extractClusterName(sample);
    const consumerGroup = this.extractConsumerGroup(sample);
    const topicName = this.extractTopicNameFromConsumer(sample);
    const partition = sample['consumer.partition'] || sample.partition;
    
    const metrics: Record<string, number> = {};
    
    // Offset tracking
    metrics.currentOffset = this.extractMetricWithFallbacks(sample, [
      'consumer.currentOffset',
      'currentOffset',
      'consumer.offset.current',
      'offset'
    ]);
    
    metrics.logEndOffset = this.extractMetricWithFallbacks(sample, [
      'consumer.logEndOffset',
      'logEndOffset',
      'consumer.offset.logEnd',
      'highWatermark'
    ]);
    
    metrics.offsetLag = this.extractMetricWithFallbacks(sample, [
      'consumer.offsetLag',
      'offsetLag',
      'consumer.lag',
      'lag'
    ]);
    
    metrics.commitLatency = this.extractMetricWithFallbacks(sample, [
      'consumer.commitLatency',
      'commitLatency',
      'consumer.lastCommitAge'
    ]);
    
    return {
      timestamp: sample.timestamp || Date.now(),
      provider: 'kafka',
      entityType: 'consumer' as const,
      clusterName,
      identifiers: {
        consumerGroup,
        topicName,
        partition: String(partition)
      },
      metrics: this.cleanMetrics(metrics),
      metadata: {
        environment: this.config.environment || 'production',
        entityGuid: sample.entityGuid,
        entityName: sample.entityName
      },
      originalEventType: sample.eventType
    };
  }

  /**
   * Extract metric value with fallback field names
   */
  private extractMetricWithFallbacks(sample: RawSample, fieldPaths: string[]): number {
    for (const path of fieldPaths) {
      const value = sample[path];
      if (value !== undefined && value !== null) {
        const numericValue = this.extractNumericValue(value);
        if (!isNaN(numericValue) && isFinite(numericValue)) {
          return numericValue;
        }
      }
    }
    return 0;
  }

  /**
   * Extract cluster name with fallbacks
   */
  private extractClusterName(sample: RawSample): string {
    return sample.clusterName || 
           sample.cluster || 
           sample['kafka.cluster'] || 
           this.config.kafka?.clusterName || 
           'unknown';
  }

  /**
   * Extract broker ID with fallbacks
   */
  private extractBrokerId(sample: RawSample): string {
    const id = sample['broker.id'] || 
                sample.brokerId || 
                sample.broker_id || 
                sample.id;
    return String(id || 'unknown');
  }

  /**
   * Extract hostname with fallbacks
   */
  private extractHostname(sample: RawSample): string {
    return sample.hostname || 
           sample.host || 
           sample.brokerHost || 
           sample['broker.host'] || 
           'unknown';
  }

  /**
   * Extract topic name with fallbacks
   */
  private extractTopicName(sample: RawSample): string {
    return sample['topic.name'] || 
           sample.topicName || 
           sample.topic || 
           sample.topic_name || 
           'unknown';
  }

  /**
   * Extract consumer group with fallbacks
   */
  private extractConsumerGroup(sample: RawSample): string {
    return sample.consumerGroup || 
           sample['consumer.group'] || 
           sample.consumer_group || 
           sample.groupId || 
           'unknown';
  }

  /**
   * Extract client ID with fallbacks
   */
  private extractClientId(sample: RawSample): string {
    return sample.clientId || 
           sample['consumer.clientId'] || 
           sample.client_id || 
           sample['consumer.client.id'] || 
           'unknown';
  }

  /**
   * Extract topic name from consumer sample
   */
  private extractTopicNameFromConsumer(sample: RawSample): string {
    return sample.topic || 
           sample.topicName || 
           sample['consumer.topic'] || 
           sample.consumer_topic || 
           'all-topics';
  }

  /**
   * Clean metrics by removing zero values and NaN
   */
  private cleanMetrics(metrics: Record<string, number>): Record<string, number> {
    const cleaned: Record<string, number> = {};
    
    for (const [key, value] of Object.entries(metrics)) {
      if (value !== 0 && !isNaN(value) && isFinite(value)) {
        cleaned[key] = value;
      }
    }
    
    return cleaned;
  }
}