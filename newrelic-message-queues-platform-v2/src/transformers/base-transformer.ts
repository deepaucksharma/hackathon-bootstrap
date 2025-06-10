/**
 * Base Transformer
 * 
 * Transformers are responsible for converting raw nri-kafka metrics to standardized format.
 * They do NOT create entities - only normalize and calculate metrics.
 */

import { Logger } from '../shared/utils/logger';
import { PlatformConfig } from '../shared/types/config';
import { RawSample } from '../collectors/base-collector';

export interface TransformedMetrics {
  // Metadata
  timestamp: number;
  provider: string;
  entityType: 'broker' | 'topic' | 'consumer' | 'cluster';
  
  // Identifiers
  clusterName: string;
  identifiers: Record<string, string>;
  
  // Transformed metrics (standardized names)
  metrics: Record<string, number>;
  
  // Additional metadata
  metadata: Record<string, string>;
  
  // Original sample reference
  originalEventType: string;
}

export interface TransformerStats {
  totalTransformations: number;
  transformationErrors: number;
  transformationsByType: Record<string, number>;
}

export abstract class BaseTransformer {
  protected logger: Logger;
  protected config: PlatformConfig;
  protected stats: TransformerStats;

  constructor(config: PlatformConfig) {
    this.config = config;
    this.logger = new Logger(this.constructor.name);
    this.stats = {
      totalTransformations: 0,
      transformationErrors: 0,
      transformationsByType: {}
    };
  }

  /**
   * Transform raw sample to standardized metrics
   * @param sample Raw sample from nri-kafka
   * @returns Transformed metrics (no entity creation)
   */
  abstract transform(sample: RawSample): Promise<TransformedMetrics>;

  /**
   * Extract cluster name from various possible fields
   */
  protected extractClusterName(sample: RawSample): string {
    return sample.clusterName || 
           sample.cluster || 
           sample['kafka.cluster'] || 
           'unknown-cluster';
  }

  /**
   * Convert bytes to megabytes
   */
  protected bytesToMB(bytes: number): number {
    return Math.round((bytes / (1024 * 1024)) * 100) / 100;
  }

  /**
   * Convert bytes to gigabytes
   */
  protected bytesToGB(bytes: number): number {
    return Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100;
  }

  /**
   * Calculate rate per second from total
   */
  protected calculateRate(current: number, previous: number, intervalSeconds: number): number {
    if (!previous || !intervalSeconds) return current;
    return Math.max(0, (current - previous) / intervalSeconds);
  }

  /**
   * Get transformer statistics
   */
  getStats(): TransformerStats {
    return { ...this.stats };
  }

  /**
   * Normalize metric names from nri-kafka to standard format
   */
  protected normalizeMetricName(nriKafkaName: string): string {
    // Remove kafka. prefix
    let normalized = nriKafkaName.replace(/^kafka\./, '');
    
    // Convert specific patterns
    normalized = normalized
      .replace('bytesInPerSecond', 'throughput.in.bytesPerSecond')
      .replace('bytesOutPerSecond', 'throughput.out.bytesPerSecond')
      .replace('messagesInPerSecond', 'throughput.in.messagesPerSecond')
      .replace('messagesOutPerSecond', 'throughput.out.messagesPerSecond')
      .replace('cpuPercent', 'cpu.usage')
      .replace('memoryUsed', 'memory.used.bytes')
      .replace('diskUsed', 'disk.used.bytes')
      .replace('partitionCount', 'partitions.total')
      .replace('underReplicatedPartitions', 'partitions.underReplicated')
      .replace('requestHandlerIdlePercent', 'request.handlerIdle.percent')
      .replace('produceRequestsPerSecond', 'request.produce.perSecond')
      .replace('fetchRequestsPerSecond', 'request.fetch.perSecond');
    
    return normalized;
  }

  /**
   * Extract numeric value, handling various formats
   */
  protected extractNumericValue(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  /**
   * Validate transformed metrics
   */
  protected validateMetrics(metrics: TransformedMetrics): boolean {
    if (!metrics.clusterName) {
      this.logger.warn('Missing cluster name in transformed metrics');
      return false;
    }
    
    if (Object.keys(metrics.metrics).length === 0) {
      this.logger.warn('No metrics found in transformation');
      return false;
    }
    
    return true;
  }
}