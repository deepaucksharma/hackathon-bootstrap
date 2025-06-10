/**
 * NRI-Kafka Transformer
 * 
 * Transforms raw nri-kafka samples into standardized metrics
 * following the Message Queue data model.
 */

import { BaseTransformer, TransformedMetrics } from './base-transformer.js';
import { RawSample } from '../collectors/base-collector.js';
import { PlatformConfig } from '../shared/types/config.js';

export class NriKafkaTransformer extends BaseTransformer {
  constructor(config: PlatformConfig) {
    super(config);
    this.logger.info('NRI-Kafka transformer initialized');
  }

  async transform(sample: RawSample): Promise<TransformedMetrics> {
    switch (sample.eventType) {
      case 'KafkaBrokerSample':
        return this.transformBrokerSample(sample);
      
      case 'KafkaTopicSample':
        return this.transformTopicSample(sample);
      
      case 'KafkaConsumerSample':
        return this.transformConsumerSample(sample);
      
      default:
        throw new Error(`Unknown sample type: ${sample.eventType}`);
    }
  }

  private transformBrokerSample(sample: RawSample): TransformedMetrics {
    const clusterName = this.extractClusterName(sample);
    const brokerId = sample.brokerId || sample['broker.id'] || 'unknown';
    const hostname = sample.hostname || sample.host || 'unknown';
    
    const metrics: Record<string, number> = {};
    
    // Transform golden metrics for brokers
    if (sample['broker.messagesInPerSecond'] !== undefined) {
      metrics.throughputPerSecond = this.extractNumericValue(sample['broker.messagesInPerSecond']);
    }
    
    if (sample['broker.bytesInPerSecond'] !== undefined) {
      metrics.bytesInPerSecond = this.extractNumericValue(sample['broker.bytesInPerSecond']);
    }
    
    if (sample['broker.bytesOutPerSecond'] !== undefined) {
      metrics.bytesOutPerSecond = this.extractNumericValue(sample['broker.bytesOutPerSecond']);
    }
    
    if (sample['broker.partitionCount'] !== undefined) {
      metrics.partitionCount = this.extractNumericValue(sample['broker.partitionCount']);
    }
    
    if (sample['broker.leaderPartitionCount'] !== undefined) {
      metrics.leaderPartitionCount = this.extractNumericValue(sample['broker.leaderPartitionCount']);
    }
    
    if (sample['broker.diskUsage'] !== undefined) {
      const diskUsed = this.extractNumericValue(sample['broker.diskUsage']);
      const diskTotal = this.extractNumericValue(sample['broker.diskTotal'] || 0);
      if (diskTotal > 0) {
        metrics.diskUsagePercent = (diskUsed / diskTotal) * 100;
      }
      metrics.diskUsedBytes = diskUsed;
    }
    
    if (sample['broker.cpuPercent'] !== undefined) {
      metrics.cpuUsagePercent = this.extractNumericValue(sample['broker.cpuPercent']);
    }
    
    if (sample['broker.memoryUsed'] !== undefined) {
      metrics.memoryUsedBytes = this.extractNumericValue(sample['broker.memoryUsed']);
    }
    
    if (sample['broker.requestHandlerIdlePercent'] !== undefined) {
      metrics.requestHandlerIdlePercent = this.extractNumericValue(sample['broker.requestHandlerIdlePercent']);
    }
    
    if (sample['broker.networkBytesInPerSecond'] !== undefined) {
      metrics.networkBytesInPerSecond = this.extractNumericValue(sample['broker.networkBytesInPerSecond']);
    }
    
    if (sample['broker.networkBytesOutPerSecond'] !== undefined) {
      metrics.networkBytesOutPerSecond = this.extractNumericValue(sample['broker.networkBytesOutPerSecond']);
    }
    
    return {
      timestamp: sample.timestamp || Date.now(),
      provider: 'kafka',
      entityType: 'broker',
      clusterName,
      identifiers: {
        brokerId,
        hostname
      },
      metrics,
      metadata: {
        environment: this.config.environment || 'production',
        region: sample.region || 'unknown'
      },
      originalEventType: sample.eventType
    };
  }

  private transformTopicSample(sample: RawSample): TransformedMetrics {
    const clusterName = this.extractClusterName(sample);
    const topicName = sample.topicName || sample['topic.name'] || 'unknown';
    
    const metrics: Record<string, number> = {};
    
    // Transform golden metrics for topics
    if (sample['topic.messageInRate'] !== undefined) {
      metrics.messageInRate = this.extractNumericValue(sample['topic.messageInRate']);
    }
    
    if (sample['topic.messageOutRate'] !== undefined) {
      metrics.messageOutRate = this.extractNumericValue(sample['topic.messageOutRate']);
    }
    
    if (sample['topic.bytesInRate'] !== undefined) {
      metrics.bytesInRate = this.extractNumericValue(sample['topic.bytesInRate']);
    }
    
    if (sample['topic.bytesOutRate'] !== undefined) {
      metrics.bytesOutRate = this.extractNumericValue(sample['topic.bytesOutRate']);
    }
    
    if (sample['topic.partitionCount'] !== undefined) {
      metrics.partitionCount = this.extractNumericValue(sample['topic.partitionCount']);
    }
    
    if (sample['topic.replicationFactor'] !== undefined) {
      metrics.replicationFactor = this.extractNumericValue(sample['topic.replicationFactor']);
    }
    
    if (sample['topic.underReplicatedPartitions'] !== undefined) {
      metrics.underReplicatedPartitions = this.extractNumericValue(sample['topic.underReplicatedPartitions']);
    }
    
    if (sample['topic.sizeBytes'] !== undefined) {
      metrics.totalBytes = this.extractNumericValue(sample['topic.sizeBytes']);
    }
    
    if (sample['topic.logSize'] !== undefined) {
      metrics.logSize = this.extractNumericValue(sample['topic.logSize']);
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
        environment: this.config.environment || 'production',
        retentionMs: String(sample['topic.retentionMs'] || -1),
        compressionType: sample['topic.compressionType'] || 'none'
      },
      originalEventType: sample.eventType
    };
  }

  private transformConsumerSample(sample: RawSample): TransformedMetrics {
    const clusterName = this.extractClusterName(sample);
    const consumerGroupId = sample.consumerGroup || sample['consumer.group'] || 'unknown';
    const clientId = sample.clientId || sample['consumer.clientId'] || 'unknown';
    
    const metrics: Record<string, number> = {};
    
    // Transform golden metrics for consumer groups
    if (sample['consumer.messageConsumptionRate'] !== undefined) {
      metrics.messageConsumptionRate = this.extractNumericValue(sample['consumer.messageConsumptionRate']);
    }
    
    if (sample['consumer.bytesConsumptionRate'] !== undefined) {
      metrics.bytesConsumptionRate = this.extractNumericValue(sample['consumer.bytesConsumptionRate']);
    }
    
    if (sample['consumer.offsetLag'] !== undefined) {
      metrics.offsetLag = this.extractNumericValue(sample['consumer.offsetLag']);
    }
    
    if (sample['consumer.maxOffsetLag'] !== undefined) {
      metrics.maxOffsetLag = this.extractNumericValue(sample['consumer.maxOffsetLag']);
    }
    
    if (sample['consumer.totalOffsetLag'] !== undefined) {
      metrics.totalOffsetLag = this.extractNumericValue(sample['consumer.totalOffsetLag']);
    }
    
    if (sample['consumer.memberCount'] !== undefined) {
      metrics.memberCount = this.extractNumericValue(sample['consumer.memberCount']);
    }
    
    if (sample['consumer.assignedPartitions'] !== undefined) {
      metrics.assignedPartitions = this.extractNumericValue(sample['consumer.assignedPartitions']);
    }
    
    if (sample['consumer.rebalanceRate'] !== undefined) {
      metrics.rebalanceRate = this.extractNumericValue(sample['consumer.rebalanceRate']);
    }
    
    if (sample['consumer.averageCommitLatency'] !== undefined) {
      metrics.averageCommitLatency = this.extractNumericValue(sample['consumer.averageCommitLatency']);
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
        environment: this.config.environment || 'production',
        assignmentStrategy: sample['consumer.assignmentStrategy'] || 'range',
        state: sample['consumer.state'] || 'active'
      },
      originalEventType: sample.eventType
    };
  }
}