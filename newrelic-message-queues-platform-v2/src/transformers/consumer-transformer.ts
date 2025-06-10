/**
 * Consumer Transformer
 * 
 * Transforms KafkaConsumerSample from nri-kafka to standardized consumer group metrics.
 * Only handles metric transformation - no entity creation.
 */

import { BaseTransformer, TransformedMetrics } from './base-transformer';
import { RawSample } from '../collectors/base-collector';

export class ConsumerTransformer extends BaseTransformer {
  
  async transform(sample: RawSample): Promise<TransformedMetrics> {
    if (sample.eventType !== 'KafkaConsumerSample') {
      throw new Error(`Invalid event type for consumer transformer: ${sample.eventType}`);
    }

    // Extract identifiers
    const consumerGroup = this.extractConsumerGroup(sample);
    const topicName = this.extractTopicName(sample);
    const clusterName = this.extractClusterName(sample);

    // Transform metrics
    const metrics: Record<string, number> = {};

    // Lag metrics (most important for consumers)
    if (sample['consumer.lag'] !== undefined) {
      metrics['lag.current'] = this.extractNumericValue(sample['consumer.lag']);
    }
    if (sample['consumer.totalLag'] !== undefined) {
      metrics['lag.total'] = this.extractNumericValue(sample['consumer.totalLag']);
    }
    if (sample['consumer.maxLag'] !== undefined) {
      metrics['lag.max'] = this.extractNumericValue(sample['consumer.maxLag']);
    }
    if (sample['consumer.avgLag'] !== undefined) {
      metrics['lag.average'] = this.extractNumericValue(sample['consumer.avgLag']);
    }

    // Offset metrics
    if (sample['consumer.offset'] !== undefined) {
      metrics['offset.current'] = this.extractNumericValue(sample['consumer.offset']);
    }
    if (sample['consumer.highWaterMark'] !== undefined) {
      metrics['offset.highWaterMark'] = this.extractNumericValue(sample['consumer.highWaterMark']);
    }
    if (sample['consumer.lowWaterMark'] !== undefined) {
      metrics['offset.lowWaterMark'] = this.extractNumericValue(sample['consumer.lowWaterMark']);
    }

    // Throughput metrics
    if (sample['consumer.messagesConsumedPerSecond'] !== undefined) {
      metrics['throughput.messagesPerSecond'] = this.extractNumericValue(sample['consumer.messagesConsumedPerSecond']);
    }
    if (sample['consumer.bytesConsumedPerSecond'] !== undefined) {
      metrics['throughput.bytesPerSecond'] = this.extractNumericValue(sample['consumer.bytesConsumedPerSecond']);
    }

    // Member metrics
    if (sample['consumer.memberCount'] !== undefined) {
      metrics['members.total'] = this.extractNumericValue(sample['consumer.memberCount']);
    }
    if (sample['consumer.activeMembers'] !== undefined) {
      metrics['members.active'] = this.extractNumericValue(sample['consumer.activeMembers']);
    }
    if (sample['consumer.rebalanceRate'] !== undefined) {
      metrics['rebalance.rate'] = this.extractNumericValue(sample['consumer.rebalanceRate']);
    }

    // Calculate derived metrics
    if (metrics['offset.highWaterMark'] && metrics['offset.current']) {
      metrics['lag.calculated'] = metrics['offset.highWaterMark'] - metrics['offset.current'];
    }

    if (metrics['throughput.messagesPerSecond'] && metrics['lag.total']) {
      // Estimate time to catch up in seconds
      metrics['lag.timeToCatchUp.seconds'] = Math.round(
        metrics['lag.total'] / metrics['throughput.messagesPerSecond']
      );
    }

    // State as numeric (for easier querying)
    metrics['state.isStable'] = sample['consumer.state'] === 'Stable' ? 1 : 0;

    // Health score
    metrics['health.score'] = this.calculateConsumerHealthScore(metrics);

    const transformed: TransformedMetrics = {
      timestamp: sample.timestamp,
      provider: 'kafka',
      entityType: 'consumer',
      clusterName,
      identifiers: {
        consumerGroup,
        topicName
      },
      metrics,
      metadata: {
        source: 'nri-kafka',
        state: sample['consumer.state'] || 'Unknown',
        providerVersion: sample.providerVersion || 'unknown'
      },
      originalEventType: sample.eventType
    };

    if (!this.validateMetrics(transformed)) {
      throw new Error('Invalid transformed metrics');
    }

    return transformed;
  }

  private extractConsumerGroup(sample: RawSample): string {
    return sample['consumer.group'] || 
           sample.consumerGroup || 
           sample.entityName || 
           'unknown-consumer-group';
  }

  private extractTopicName(sample: RawSample): string {
    return sample['consumer.topic'] || 
           sample.topic || 
           'unknown-topic';
  }

  private calculateConsumerHealthScore(metrics: Record<string, number>): number {
    let score = 100;

    // Heavy penalty for high lag
    const totalLag = metrics['lag.total'] || 0;
    if (totalLag > 10000) {
      score -= 40;
    } else if (totalLag > 1000) {
      score -= 20;
    } else if (totalLag > 100) {
      score -= 10;
    }

    // Penalty for slow consumption
    if (metrics['throughput.messagesPerSecond'] === 0) {
      score -= 30;
    }

    // Penalty for rebalancing
    if (metrics['rebalance.rate'] && metrics['rebalance.rate'] > 0.1) {
      score -= 15;
    }

    // Penalty for inactive members
    if (metrics['members.active'] && metrics['members.total']) {
      const inactiveRatio = 1 - (metrics['members.active'] / metrics['members.total']);
      if (inactiveRatio > 0) {
        score -= Math.min(20, inactiveRatio * 100);
      }
    }

    // Penalty for unstable state
    if (metrics['state.isStable'] === 0) {
      score -= 15;
    }

    return Math.max(0, Math.round(score));
  }
}