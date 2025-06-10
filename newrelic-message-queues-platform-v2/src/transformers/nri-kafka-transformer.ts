/**
 * Enhanced NRI-Kafka Transformer
 * 
 * Transforms raw nri-kafka samples into standardized metrics
 * with comprehensive field mapping and fallback support for different versions.
 */

import { injectable, inject } from 'inversify';
import { BaseTransformer, TransformedMetrics } from './base-transformer.js';
import { RawSample } from '../collectors/base-collector.js';
import { PlatformConfig } from '../shared/types/config.js';
import { TYPES } from '@infrastructure/config/types.js';
import { Logger } from '@shared/utils/logger.js';

// Field mapping configuration for different nri-kafka versions
interface FieldMapping {
  primary: string;
  fallbacks: string[];
  transform?: (value: any) => any;
}

@injectable()
export class NriKafkaTransformer extends BaseTransformer {
  private brokerFieldMappings: Map<string, FieldMapping>;
  private topicFieldMappings: Map<string, FieldMapping>;
  private consumerFieldMappings: Map<string, FieldMapping>;

  constructor(
    @inject(TYPES.ConfigurationService) config: PlatformConfig,
    @inject(TYPES.Logger) logger: Logger
  ) {
    super(config);
    this.logger = logger;
    this.initializeFieldMappings();
    this.logger.info('Enhanced NRI-Kafka transformer initialized with field mappings');
  }

  private initializeFieldMappings(): void {
    // Broker field mappings with fallbacks
    this.brokerFieldMappings = new Map([
      ['brokerId', {
        primary: 'broker.id',
        fallbacks: ['brokerId', 'broker_id', 'id']
      }],
      ['bytesInPerSecond', {
        primary: 'broker.bytesInPerSecond',
        fallbacks: ['broker_bytesInPerSecond', 'bytesInPerSecond', 'broker.bytesInRate']
      }],
      ['bytesOutPerSecond', {
        primary: 'broker.bytesOutPerSecond',
        fallbacks: ['broker_bytesOutPerSecond', 'bytesOutPerSecond', 'broker.bytesOutRate']
      }],
      ['messagesInPerSecond', {
        primary: 'broker.messagesInPerSecond',
        fallbacks: ['broker_messagesInPerSecond', 'messagesInPerSecond', 'broker.messageInRate']
      }],
      ['partitionCount', {
        primary: 'broker.partitionCount',
        fallbacks: ['broker_partitionCount', 'partitionCount', 'broker.totalPartitions']
      }],
      ['leaderPartitionCount', {
        primary: 'broker.leaderPartitionCount',
        fallbacks: ['broker_leaderPartitionCount', 'leaderPartitionCount', 'broker.leaderCount']
      }],
      ['diskUsedPercent', {
        primary: 'broker.diskUsedPercent',
        fallbacks: ['broker_diskUsedPercent', 'diskUsedPercent', 'broker.diskUsage']
      }],
      ['cpuPercent', {
        primary: 'system.cpuPercent',
        fallbacks: ['broker.cpuPercent', 'broker_cpuPercent', 'cpuPercent']
      }],
      ['memoryUsed', {
        primary: 'system.memoryUsedBytes',
        fallbacks: ['broker.memoryUsed', 'jvm.heapMemoryUsed', 'memoryUsedBytes']
      }],
      ['requestHandlerIdlePercent', {
        primary: 'broker.requestHandlerIdlePercent',
        fallbacks: ['broker_requestHandlerIdlePercent', 'kafka.network.requestHandlerAvgIdlePercent']
      }],
      ['requestsPerSecond', {
        primary: 'broker.requestsPerSecond',
        fallbacks: ['broker_requestsPerSecond', 'kafka.network.requestsPerSecond']
      }],
      ['logFlushRate', {
        primary: 'broker.logFlushRate',
        fallbacks: ['kafka.broker.logFlushRate', 'broker_logFlushRate']
      }],
      ['underReplicatedPartitions', {
        primary: 'broker.underReplicatedPartitionCount',
        fallbacks: ['broker_underReplicatedPartitionCount', 'kafka.broker.underReplicatedPartitions']
      }],
      ['offlinePartitions', {
        primary: 'broker.offlinePartitionCount',
        fallbacks: ['broker_offlinePartitionCount', 'kafka.controller.offlinePartitionsCount']
      }],
      ['activeControllerCount', {
        primary: 'kafka.controller.activeControllerCount',
        fallbacks: ['broker.activeControllerCount', 'controller.activeCount']
      }]
    ]);

    // Topic field mappings
    this.topicFieldMappings = new Map([
      ['topicName', {
        primary: 'topic.name',
        fallbacks: ['topicName', 'topic_name', 'name']
      }],
      ['partitionCount', {
        primary: 'topic.partitionCount',
        fallbacks: ['topic_partitionCount', 'partitions', 'topic.partitions']
      }],
      ['replicationFactor', {
        primary: 'topic.replicationFactor',
        fallbacks: ['topic_replicationFactor', 'replication', 'topic.replicas']
      }],
      ['bytesInRate', {
        primary: 'topic.bytesInRate',
        fallbacks: ['topic_bytesInRate', 'topic.bytesInPerSec', 'bytesInRate']
      }],
      ['bytesOutRate', {
        primary: 'topic.bytesOutRate',
        fallbacks: ['topic_bytesOutRate', 'topic.bytesOutPerSec', 'bytesOutRate']
      }],
      ['messagesInRate', {
        primary: 'topic.messagesInRate',
        fallbacks: ['topic_messagesInRate', 'topic.messageInRate', 'messagesInRate']
      }],
      ['underReplicatedPartitions', {
        primary: 'topic.underReplicatedPartitions',
        fallbacks: ['topic_underReplicatedPartitions', 'topic.underReplicated']
      }],
      ['logSize', {
        primary: 'topic.logSize',
        fallbacks: ['topic_logSize', 'topic.sizeBytes', 'topic.totalBytes']
      }]
    ]);

    // Consumer field mappings
    this.consumerFieldMappings = new Map([
      ['consumerGroup', {
        primary: 'consumer.group',
        fallbacks: ['consumerGroup', 'consumer_group', 'groupId']
      }],
      ['clientId', {
        primary: 'consumer.clientId',
        fallbacks: ['consumer_clientId', 'clientId', 'client.id']
      }],
      ['offsetLag', {
        primary: 'consumer.totalOffsetLag',
        fallbacks: ['consumer_totalOffsetLag', 'consumer.offsetLag', 'totalLag']
      }],
      ['maxOffsetLag', {
        primary: 'consumer.maxOffsetLag',
        fallbacks: ['consumer_maxOffsetLag', 'maxLag', 'consumer.maxLag']
      }],
      ['messageConsumptionRate', {
        primary: 'consumer.messageConsumptionRate',
        fallbacks: ['consumer_messageConsumptionRate', 'consumer.recordsConsumedRate']
      }],
      ['bytesConsumptionRate', {
        primary: 'consumer.bytesConsumptionRate',
        fallbacks: ['consumer_bytesConsumptionRate', 'consumer.bytesConsumedRate']
      }],
      ['memberCount', {
        primary: 'consumer.memberCount',
        fallbacks: ['consumer_memberCount', 'consumer.members', 'members']
      }],
      ['assignedPartitions', {
        primary: 'consumer.assignedPartitions',
        fallbacks: ['consumer_assignedPartitions', 'consumer.partitions']
      }],
      ['rebalanceRate', {
        primary: 'consumer.rebalanceRate',
        fallbacks: ['consumer_rebalanceRate', 'consumer.rebalances']
      }]
    ]);
  }

  async transform(sample: RawSample): Promise<TransformedMetrics> {
    this.stats.totalTransformations++;
    
    try {
      let result: TransformedMetrics;
      
      switch (sample.eventType) {
        case 'KafkaBrokerSample':
          result = this.transformBrokerSample(sample);
          break;
        
        case 'KafkaTopicSample':
          result = this.transformTopicSample(sample);
          break;
        
        case 'KafkaConsumerSample':
          result = this.transformConsumerSample(sample);
          break;
          
        case 'KafkaOffsetSample':
          result = this.transformOffsetSample(sample);
          break;
        
        default:
          throw new Error(`Unknown sample type: ${sample.eventType}`);
      }
      
      this.stats.successfulTransformations++;
      return result;
      
    } catch (error) {
      this.stats.failedTransformations++;
      this.logger.error(`Failed to transform sample:`, { error, sample });
      throw error;
    }
  }

  private transformBrokerSample(sample: RawSample): TransformedMetrics {
    const clusterName = this.extractClusterName(sample);
    const brokerId = this.extractFieldWithFallback(sample, this.brokerFieldMappings.get('brokerId')!) || 'unknown';
    const hostname = sample.hostname || sample.host || sample.entityName || 'unknown';
    const port = sample.port || sample['broker.port'] || 9092;
    
    const metrics: Record<string, number> = {};
    
    // Extract all broker metrics with fallbacks
    const extractMetric = (key: string) => {
      const mapping = this.brokerFieldMappings.get(key);
      if (mapping) {
        const value = this.extractFieldWithFallback(sample, mapping);
        if (value !== undefined && value !== null) {
          return this.extractNumericValue(value);
        }
      }
      return undefined;
    };
    
    // Throughput metrics
    const messagesIn = extractMetric('messagesInPerSecond');
    if (messagesIn !== undefined) {
      metrics.throughputPerSecond = messagesIn;
      metrics.messagesInPerSecond = messagesIn;
    }
    
    const bytesIn = extractMetric('bytesInPerSecond');
    if (bytesIn !== undefined) {
      metrics.bytesInPerSecond = bytesIn;
      metrics.networkBytesInPerSecond = bytesIn;
    }
    
    const bytesOut = extractMetric('bytesOutPerSecond');
    if (bytesOut !== undefined) {
      metrics.bytesOutPerSecond = bytesOut;
      metrics.networkBytesOutPerSecond = bytesOut;
    }
    
    // Partition metrics
    const partitionCount = extractMetric('partitionCount');
    if (partitionCount !== undefined) {
      metrics.partitionCount = partitionCount;
    }
    
    const leaderCount = extractMetric('leaderPartitionCount');
    if (leaderCount !== undefined) {
      metrics.leaderPartitionCount = leaderCount;
    }
    
    const underReplicated = extractMetric('underReplicatedPartitions');
    if (underReplicated !== undefined) {
      metrics.underReplicatedPartitions = underReplicated;
    }
    
    const offline = extractMetric('offlinePartitions');
    if (offline !== undefined) {
      metrics.offlinePartitions = offline;
    }
    
    // Resource metrics
    const diskPercent = extractMetric('diskUsedPercent');
    if (diskPercent !== undefined) {
      metrics.diskUsagePercent = diskPercent;
    }
    
    const cpuPercent = extractMetric('cpuPercent');
    if (cpuPercent !== undefined) {
      metrics.cpuUsagePercent = cpuPercent;
    }
    
    const memoryUsed = extractMetric('memoryUsed');
    if (memoryUsed !== undefined) {
      metrics.memoryUsedBytes = memoryUsed;
      metrics.jvmMemoryUsed = memoryUsed;
    }
    
    // Performance metrics
    const requestHandlerIdle = extractMetric('requestHandlerIdlePercent');
    if (requestHandlerIdle !== undefined) {
      metrics.requestHandlerIdlePercent = requestHandlerIdle;
    }
    
    const requestsPerSec = extractMetric('requestsPerSecond');
    if (requestsPerSec !== undefined) {
      metrics.requestRate = requestsPerSec;
    }
    
    const logFlushRate = extractMetric('logFlushRate');
    if (logFlushRate !== undefined) {
      metrics.logFlushRate = logFlushRate;
    }
    
    // Controller metrics
    const activeController = extractMetric('activeControllerCount');
    if (activeController !== undefined) {
      metrics.isController = activeController > 0 ? 1 : 0;
    }
    
    // Calculate error rate if available
    const failedFetch = sample['broker.failedFetchRequestsPerSecond'] || sample['broker_failedFetchRequestsPerSecond'];
    const failedProduce = sample['broker.failedProduceRequestsPerSecond'] || sample['broker_failedProduceRequestsPerSecond'];
    if (failedFetch !== undefined || failedProduce !== undefined) {
      const totalFailed = (this.extractNumericValue(failedFetch) || 0) + (this.extractNumericValue(failedProduce) || 0);
      const totalRequests = requestsPerSec || 1;
      metrics.errorRate = totalRequests > 0 ? (totalFailed / totalRequests) : 0;
    }
    
    return {
      timestamp: sample.timestamp || Date.now(),
      provider: 'kafka',
      entityType: 'broker',
      clusterName,
      identifiers: {
        brokerId: String(brokerId),
        hostname,
        port: String(port)
      },
      metrics,
      metadata: {
        environment: this.config.environment || sample.environment || 'production',
        region: sample.region || 'unknown',
        datacenter: sample.datacenter,
        service: sample.service,
        team: sample.team,
        version: sample.providerVersion || sample['kafka.version'],
        entityGuid: sample.entityGuid,
        entityName: sample.entityName
      },
      originalEventType: sample.eventType
    };
  }

  private transformTopicSample(sample: RawSample): TransformedMetrics {
    const clusterName = this.extractClusterName(sample);
    const topicName = this.extractFieldWithFallback(sample, this.topicFieldMappings.get('topicName')!) || 'unknown';
    
    const metrics: Record<string, number> = {};
    
    // Extract all topic metrics with fallbacks
    const extractMetric = (key: string) => {
      const mapping = this.topicFieldMappings.get(key);
      if (mapping) {
        const value = this.extractFieldWithFallback(sample, mapping);
        if (value !== undefined && value !== null) {
          return this.extractNumericValue(value);
        }
      }
      return undefined;
    };
    
    // Message rate metrics
    const messageInRate = extractMetric('messagesInRate');
    if (messageInRate !== undefined) {
      metrics.messageInRate = messageInRate;
    }
    
    const bytesInRate = extractMetric('bytesInRate');
    if (bytesInRate !== undefined) {
      metrics.bytesInRate = bytesInRate;
    }
    
    const bytesOutRate = extractMetric('bytesOutRate');
    if (bytesOutRate !== undefined) {
      metrics.bytesOutRate = bytesOutRate;
    }
    
    // Topic configuration
    const partitionCount = extractMetric('partitionCount');
    if (partitionCount !== undefined) {
      metrics.partitionCount = partitionCount;
    }
    
    const replicationFactor = extractMetric('replicationFactor');
    if (replicationFactor !== undefined) {
      metrics.replicationFactor = replicationFactor;
    }
    
    const underReplicated = extractMetric('underReplicatedPartitions');
    if (underReplicated !== undefined) {
      metrics.underReplicatedPartitions = underReplicated;
    }
    
    // Size metrics
    const logSize = extractMetric('logSize');
    if (logSize !== undefined) {
      metrics.totalBytes = logSize;
      metrics.logSize = logSize;
    }
    
    // Additional topic metrics from raw sample
    if (sample['topic.retentionMs'] !== undefined) {
      metrics.retentionMs = this.extractNumericValue(sample['topic.retentionMs']);
    }
    
    if (sample['topic.segmentBytes'] !== undefined) {
      metrics.segmentBytes = this.extractNumericValue(sample['topic.segmentBytes']);
    }
    
    if (sample['topic.minInSyncReplicas'] !== undefined) {
      metrics.minInSyncReplicas = this.extractNumericValue(sample['topic.minInSyncReplicas']);
    }
    
    return {
      timestamp: sample.timestamp || Date.now(),
      provider: 'kafka',
      entityType: 'topic',
      clusterName,
      identifiers: {
        topicName
      },
      metrics,
      metadata: {
        environment: this.config.environment || sample.environment || 'production',
        retentionMs: String(metrics.retentionMs || sample['topic.retentionMs'] || -1),
        compressionType: sample['topic.compressionType'] || sample.compressionType || 'none',
        cleanupPolicy: sample['topic.cleanupPolicy'] || sample.cleanupPolicy || 'delete',
        entityGuid: sample.entityGuid,
        entityName: sample.entityName
      },
      originalEventType: sample.eventType
    };
  }

  private transformConsumerSample(sample: RawSample): TransformedMetrics {
    const clusterName = this.extractClusterName(sample);
    const consumerGroupId = this.extractFieldWithFallback(sample, this.consumerFieldMappings.get('consumerGroup')!) || 'unknown';
    const clientId = this.extractFieldWithFallback(sample, this.consumerFieldMappings.get('clientId')!) || 'unknown';
    
    const metrics: Record<string, number> = {};
    
    // Extract all consumer metrics with fallbacks
    const extractMetric = (key: string) => {
      const mapping = this.consumerFieldMappings.get(key);
      if (mapping) {
        const value = this.extractFieldWithFallback(sample, mapping);
        if (value !== undefined && value !== null) {
          return this.extractNumericValue(value);
        }
      }
      return undefined;
    };
    
    // Consumption metrics
    const messageRate = extractMetric('messageConsumptionRate');
    if (messageRate !== undefined) {
      metrics.messageConsumptionRate = messageRate;
    }
    
    const bytesRate = extractMetric('bytesConsumptionRate');
    if (bytesRate !== undefined) {
      metrics.bytesConsumptionRate = bytesRate;
    }
    
    // Lag metrics
    const offsetLag = extractMetric('offsetLag');
    if (offsetLag !== undefined) {
      metrics.totalOffsetLag = offsetLag;
      metrics.offsetLag = offsetLag;
    }
    
    const maxLag = extractMetric('maxOffsetLag');
    if (maxLag !== undefined) {
      metrics.maxOffsetLag = maxLag;
    }
    
    // Group metrics
    const memberCount = extractMetric('memberCount');
    if (memberCount !== undefined) {
      metrics.memberCount = memberCount;
    }
    
    const assignedPartitions = extractMetric('assignedPartitions');
    if (assignedPartitions !== undefined) {
      metrics.assignedPartitions = assignedPartitions;
    }
    
    const rebalanceRate = extractMetric('rebalanceRate');
    if (rebalanceRate !== undefined) {
      metrics.rebalanceRate = rebalanceRate;
    }
    
    // Additional consumer metrics
    if (sample['consumer.fetchLatencyAvg'] !== undefined) {
      metrics.fetchLatencyAvg = this.extractNumericValue(sample['consumer.fetchLatencyAvg']);
    }
    
    if (sample['consumer.commitLatencyAvg'] !== undefined) {
      metrics.commitLatencyAvg = this.extractNumericValue(sample['consumer.commitLatencyAvg']);
    }
    
    if (sample['consumer.lastRebalanceSecondsAgo'] !== undefined) {
      metrics.lastRebalanceSecondsAgo = this.extractNumericValue(sample['consumer.lastRebalanceSecondsAgo']);
    }
    
    return {
      timestamp: sample.timestamp || Date.now(),
      provider: 'kafka',
      entityType: 'consumer',
      clusterName,
      identifiers: {
        consumerGroupId,
        clientId
      },
      metrics,
      metadata: {
        environment: this.config.environment || sample.environment || 'production',
        assignmentStrategy: sample['consumer.assignmentStrategy'] || sample.assignmentStrategy || 'range',
        state: sample['consumer.state'] || sample.state || 'active',
        memberId: sample['consumer.memberId'] || sample.memberId,
        host: sample['consumer.host'] || sample.host || sample.hostname,
        entityGuid: sample.entityGuid,
        entityName: sample.entityName
      },
      originalEventType: sample.eventType
    };
  }

  private transformOffsetSample(sample: RawSample): TransformedMetrics {
    const clusterName = this.extractClusterName(sample);
    const consumerGroup = sample['consumer.group'] || sample.consumerGroup || 'unknown';
    const topic = sample['consumer.topic'] || sample.topic || 'unknown';
    const partition = sample['consumer.partition'] || sample.partition || 0;
    
    const metrics: Record<string, number> = {};
    
    // Offset metrics
    if (sample['consumer.currentOffset'] !== undefined) {
      metrics.currentOffset = this.extractNumericValue(sample['consumer.currentOffset']);
    }
    
    if (sample['consumer.logEndOffset'] !== undefined) {
      metrics.logEndOffset = this.extractNumericValue(sample['consumer.logEndOffset']);
    }
    
    if (sample['consumer.offsetLag'] !== undefined) {
      metrics.offsetLag = this.extractNumericValue(sample['consumer.offsetLag']);
    } else if (metrics.logEndOffset !== undefined && metrics.currentOffset !== undefined) {
      // Calculate lag if not provided
      metrics.offsetLag = metrics.logEndOffset - metrics.currentOffset;
    }
    
    if (sample['consumer.commitLatency'] !== undefined) {
      metrics.commitLatency = this.extractNumericValue(sample['consumer.commitLatency']);
    }
    
    return {
      timestamp: sample.timestamp || Date.now(),
      provider: 'kafka',
      entityType: 'offset',
      clusterName,
      identifiers: {
        consumerGroupId: consumerGroup,
        topicName: topic,
        partition: String(partition)
      },
      metrics,
      metadata: {
        environment: this.config.environment || sample.environment || 'production',
        lastCommitTime: sample['consumer.lastCommitTime'],
        entityGuid: sample.entityGuid,
        entityName: sample.entityName
      },
      originalEventType: sample.eventType
    };
  }

  /**
   * Extract field value with fallback support
   */
  private extractFieldWithFallback(sample: RawSample, mapping: FieldMapping): any {
    // Try primary field
    let value = sample[mapping.primary];
    
    // Try fallbacks if primary is not found
    if (value === undefined || value === null) {
      for (const fallback of mapping.fallbacks) {
        value = sample[fallback];
        if (value !== undefined && value !== null) {
          break;
        }
      }
    }
    
    // Apply transformation if provided
    if (value !== undefined && value !== null && mapping.transform) {
      value = mapping.transform(value);
    }
    
    return value;
  }

  /**
   * Get transformer statistics including field mapping success rates
   */
  getStats(): Record<string, any> {
    const baseStats = super.getStats();
    
    return {
      ...baseStats,
      fieldMappings: {
        broker: this.brokerFieldMappings.size,
        topic: this.topicFieldMappings.size,
        consumer: this.consumerFieldMappings.size
      }
    };
  }
}