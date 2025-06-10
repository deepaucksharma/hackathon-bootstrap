/**
 * Topic Transformer
 * 
 * Transforms KafkaTopicSample from nri-kafka to standardized topic metrics.
 * Only handles metric transformation - no entity creation.
 */

import { BaseTransformer, TransformedMetrics } from './base-transformer';
import { RawSample } from '../collectors/base-collector';

export class TopicTransformer extends BaseTransformer {
  
  async transform(sample: RawSample): Promise<TransformedMetrics> {
    if (sample.eventType !== 'KafkaTopicSample') {
      throw new Error(`Invalid event type for topic transformer: ${sample.eventType}`);
    }

    // Extract identifiers
    const topicName = this.extractTopicName(sample);
    const clusterName = this.extractClusterName(sample);

    // Transform metrics
    const metrics: Record<string, number> = {};

    // Throughput metrics
    if (sample['topic.bytesInPerSecond'] !== undefined) {
      metrics['throughput.in.bytesPerSecond'] = this.extractNumericValue(sample['topic.bytesInPerSecond']);
    }
    if (sample['topic.bytesOutPerSecond'] !== undefined) {
      metrics['throughput.out.bytesPerSecond'] = this.extractNumericValue(sample['topic.bytesOutPerSecond']);
    }
    if (sample['topic.messagesInPerSecond'] !== undefined) {
      metrics['throughput.in.messagesPerSecond'] = this.extractNumericValue(sample['topic.messagesInPerSecond']);
    }

    // Partition metrics
    const partitionCount = this.extractPartitionCount(sample);
    if (partitionCount !== undefined) {
      metrics['partitions.count'] = partitionCount;
    }
    
    if (sample['topic.replicationFactor'] !== undefined) {
      metrics['replication.factor'] = this.extractNumericValue(sample['topic.replicationFactor']);
    }
    if (sample['topic.minInSyncReplicas'] !== undefined) {
      metrics['replication.minInSync'] = this.extractNumericValue(sample['topic.minInSyncReplicas']);
    }
    if (sample['topic.underReplicatedPartitions'] !== undefined) {
      metrics['partitions.underReplicated'] = this.extractNumericValue(sample['topic.underReplicatedPartitions']);
    }

    // Size metrics
    if (sample['topic.sizeBytes'] !== undefined) {
      metrics['size.bytes'] = this.extractNumericValue(sample['topic.sizeBytes']);
      metrics['size.gb'] = this.bytesToGB(metrics['size.bytes']);
    }

    // Retention metrics
    if (sample['topic.retentionBytes'] !== undefined) {
      metrics['retention.bytes'] = this.extractNumericValue(sample['topic.retentionBytes']);
    }
    if (sample['topic.retentionMs'] !== undefined) {
      metrics['retention.ms'] = this.extractNumericValue(sample['topic.retentionMs']);
      metrics['retention.hours'] = Math.round(metrics['retention.ms'] / (1000 * 60 * 60));
    }

    // Calculate derived metrics
    if (metrics['throughput.in.bytesPerSecond'] && metrics['throughput.in.messagesPerSecond']) {
      metrics['avgMessageSize.bytes'] = Math.round(
        metrics['throughput.in.bytesPerSecond'] / metrics['throughput.in.messagesPerSecond']
      );
    }

    // Health indicators
    metrics['health.score'] = this.calculateTopicHealthScore(metrics);

    const transformed: TransformedMetrics = {
      timestamp: sample.timestamp,
      provider: 'kafka',
      entityType: 'topic',
      clusterName,
      identifiers: {
        topicName
      },
      metrics,
      metadata: {
        source: 'nri-kafka',
        providerVersion: sample.providerVersion || 'unknown'
      },
      originalEventType: sample.eventType
    };

    if (!this.validateMetrics(transformed)) {
      throw new Error('Invalid transformed metrics');
    }

    return transformed;
  }

  private extractTopicName(sample: RawSample): string {
    return sample.topic || 
           sample['topic.name'] || 
           sample.entityName || 
           'unknown-topic';
  }

  private extractPartitionCount(sample: RawSample): number | undefined {
    const count = sample['topic.partitions'] || 
                  sample['topic.partitionCount'] || 
                  sample.partitions;
    
    return count !== undefined ? this.extractNumericValue(count) : undefined;
  }

  private calculateTopicHealthScore(metrics: Record<string, number>): number {
    let score = 100;

    // Deduct for under-replicated partitions
    if (metrics['partitions.underReplicated'] > 0) {
      score -= Math.min(40, metrics['partitions.underReplicated'] * 20);
    }

    // Deduct if replication factor is low
    if (metrics['replication.factor'] && metrics['replication.factor'] < 2) {
      score -= 20;
    }

    // Deduct if topic is too large
    if (metrics['size.gb'] && metrics['size.gb'] > 100) {
      score -= 10;
    }

    // Deduct if no throughput
    if (!metrics['throughput.in.messagesPerSecond'] || metrics['throughput.in.messagesPerSecond'] === 0) {
      score -= 10;
    }

    return Math.max(0, Math.round(score));
  }
}