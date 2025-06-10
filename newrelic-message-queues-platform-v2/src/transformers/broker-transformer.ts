/**
 * Broker Transformer
 * 
 * Transforms KafkaBrokerSample from nri-kafka to standardized broker metrics.
 * Only handles metric transformation - no entity creation.
 */

import { BaseTransformer, TransformedMetrics } from './base-transformer';
import { RawSample } from '../collectors/base-collector';

export class BrokerTransformer extends BaseTransformer {
  
  async transform(sample: RawSample): Promise<TransformedMetrics> {
    if (sample.eventType !== 'KafkaBrokerSample') {
      throw new Error(`Invalid event type for broker transformer: ${sample.eventType}`);
    }

    // Extract identifiers
    const brokerId = this.extractBrokerId(sample);
    const hostname = this.extractHostname(sample);
    const clusterName = this.extractClusterName(sample);

    // Transform metrics
    const metrics: Record<string, number> = {};

    // Throughput metrics
    if (sample['broker.bytesInPerSecond'] !== undefined) {
      metrics['throughput.in.bytesPerSecond'] = this.extractNumericValue(sample['broker.bytesInPerSecond']);
    }
    if (sample['broker.bytesOutPerSecond'] !== undefined) {
      metrics['throughput.out.bytesPerSecond'] = this.extractNumericValue(sample['broker.bytesOutPerSecond']);
    }
    if (sample['broker.messagesInPerSecond'] !== undefined) {
      metrics['throughput.in.messagesPerSecond'] = this.extractNumericValue(sample['broker.messagesInPerSecond']);
    }

    // Resource metrics
    if (sample['kafka.broker.cpuPercent'] !== undefined) {
      metrics['cpu.usage'] = this.extractNumericValue(sample['kafka.broker.cpuPercent']);
    }
    if (sample['kafka.broker.memoryUsed'] !== undefined) {
      metrics['memory.used.bytes'] = this.extractNumericValue(sample['kafka.broker.memoryUsed']);
      metrics['memory.used.gb'] = this.bytesToGB(metrics['memory.used.bytes']);
    }
    if (sample['kafka.broker.diskUsed'] !== undefined) {
      metrics['disk.used.bytes'] = this.extractNumericValue(sample['kafka.broker.diskUsed']);
      metrics['disk.used.gb'] = this.bytesToGB(metrics['disk.used.bytes']);
    }

    // Partition metrics
    if (sample['kafka.broker.partitionCount'] !== undefined) {
      metrics['partitions.total'] = this.extractNumericValue(sample['kafka.broker.partitionCount']);
    }
    if (sample['kafka.broker.leaderCount'] !== undefined) {
      metrics['partitions.leader'] = this.extractNumericValue(sample['kafka.broker.leaderCount']);
    }
    if (sample['kafka.broker.underReplicatedPartitions'] !== undefined) {
      metrics['partitions.underReplicated'] = this.extractNumericValue(sample['kafka.broker.underReplicatedPartitions']);
    }

    // Controller metrics
    if (sample['kafka.controller.activeControllerCount'] !== undefined) {
      metrics['controller.isActive'] = this.extractNumericValue(sample['kafka.controller.activeControllerCount']);
    }

    // Request metrics
    if (sample['kafka.broker.requestHandlerIdlePercent'] !== undefined) {
      metrics['request.handlerIdle.percent'] = this.extractNumericValue(sample['kafka.broker.requestHandlerIdlePercent']);
    }
    if (sample['kafka.broker.produceRequestsPerSecond'] !== undefined) {
      metrics['request.produce.perSecond'] = this.extractNumericValue(sample['kafka.broker.produceRequestsPerSecond']);
    }
    if (sample['kafka.broker.fetchRequestsPerSecond'] !== undefined) {
      metrics['request.fetch.perSecond'] = this.extractNumericValue(sample['kafka.broker.fetchRequestsPerSecond']);
    }

    // Log metrics
    if (sample['kafka.broker.logFlushRate'] !== undefined) {
      metrics['disk.logFlushRate'] = this.extractNumericValue(sample['kafka.broker.logFlushRate']);
    }

    // Calculate derived metrics
    metrics['throughput.total.bytesPerSecond'] = 
      (metrics['throughput.in.bytesPerSecond'] || 0) + 
      (metrics['throughput.out.bytesPerSecond'] || 0);
    
    metrics['throughput.total.mbPerSecond'] = this.bytesToMB(metrics['throughput.total.bytesPerSecond']);

    // Health score (simple calculation based on key metrics)
    metrics['health.score'] = this.calculateBrokerHealthScore(metrics);

    const transformed: TransformedMetrics = {
      timestamp: sample.timestamp,
      provider: 'kafka',
      entityType: 'broker',
      clusterName,
      identifiers: {
        brokerId: String(brokerId),
        hostname
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

  private extractBrokerId(sample: RawSample): number {
    // Try various fields where broker ID might be
    const id = sample['broker.id'] || 
               sample.brokerId || 
               sample.broker_id ||
               this.extractFromEntityKey(sample.entityKey, 'brokerid') ||
               0;
    
    return typeof id === 'number' ? id : parseInt(id, 10);
  }

  private extractHostname(sample: RawSample): string {
    return sample.hostname || 
           sample.entityName || 
           this.extractFromEntityKey(sample.entityKey, 'hostname') ||
           'unknown-host';
  }

  private extractFromEntityKey(entityKey: string, field: string): string | null {
    if (!entityKey) return null;
    
    const regex = new RegExp(`${field}=([^:]+)`);
    const match = entityKey.match(regex);
    return match ? match[1] : null;
  }

  private calculateBrokerHealthScore(metrics: Record<string, number>): number {
    let score = 100;

    // Deduct points for various issues
    if (metrics['partitions.underReplicated'] > 0) {
      score -= Math.min(30, metrics['partitions.underReplicated'] * 10);
    }

    if (metrics['cpu.usage'] > 80) {
      score -= Math.min(20, (metrics['cpu.usage'] - 80));
    }

    if (metrics['memory.used.gb'] && metrics['memory.used.gb'] > 30) {
      score -= 10;
    }

    if (metrics['request.handlerIdle.percent'] < 20) {
      score -= 15;
    }

    return Math.max(0, Math.round(score));
  }
}