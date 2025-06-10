/**
 * Base Collector Interface
 * 
 * Collectors are responsible for retrieving raw metric data in nri-kafka format.
 * They do NOT transform or create entities - only collect raw samples.
 */

import { Logger } from '../shared/utils/logger';
import { PlatformConfig } from '../shared/types/config';

export interface RawSample {
  eventType: 'KafkaBrokerSample' | 'KafkaTopicSample' | 'KafkaConsumerSample' | 'KafkaOffsetSample' | 'SimulatedSample';
  timestamp: number;
  [key: string]: any; // Raw fields from nri-kafka or simulation
}

export interface CollectorStats {
  totalCollections: number;
  lastCollectionTime?: number;
  lastCollectionCount?: number;
  errors: number;
}

export abstract class BaseCollector {
  protected logger: Logger;
  protected config: PlatformConfig;
  protected stats: CollectorStats;

  constructor(config: PlatformConfig) {
    this.config = config;
    this.logger = new Logger(this.constructor.name);
    this.stats = {
      totalCollections: 0,
      errors: 0
    };
  }

  /**
   * Collect raw samples from the data source
   * @returns Array of raw samples in nri-kafka format
   */
  abstract collect(): Promise<RawSample[]>;

  /**
   * Get collector statistics
   */
  getStats(): CollectorStats {
    return { ...this.stats };
  }

  /**
   * Validate that a sample has required fields
   */
  protected validateSample(sample: any): boolean {
    if (!sample.eventType) {
      this.logger.warn('Sample missing eventType');
      return false;
    }
    
    if (!['KafkaBrokerSample', 'KafkaTopicSample', 'KafkaConsumerSample', 'KafkaOffsetSample', 'SimulatedSample'].includes(sample.eventType)) {
      this.logger.warn(`Unknown event type: ${sample.eventType}`);
      return false;
    }
    
    return true;
  }

  /**
   * Add timestamp if missing
   */
  protected ensureTimestamp(sample: RawSample): RawSample {
    if (!sample.timestamp) {
      sample.timestamp = Math.floor(Date.now() / 1000);
    }
    return sample;
  }
}