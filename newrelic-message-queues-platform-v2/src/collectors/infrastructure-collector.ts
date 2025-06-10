/**
 * Infrastructure Collector
 * 
 * Queries NRDB for real nri-kafka data (KafkaBrokerSample, KafkaTopicSample, KafkaConsumerSample)
 * Returns raw samples exactly as they come from nri-kafka without any transformation.
 */

import { BaseCollector, RawSample } from './base-collector';
import { NerdGraphClient } from '../shared/utils/nerdgraph-client';
import { PlatformConfig } from '../shared/types/config';

export class InfrastructureCollector extends BaseCollector {
  private nerdGraphClient: NerdGraphClient;
  private lookbackMinutes: number;

  constructor(config: PlatformConfig) {
    super(config);
    this.nerdGraphClient = new NerdGraphClient(config);
    this.lookbackMinutes = config.lookbackMinutes || 5;
    this.logger.info(`Infrastructure collector initialized (lookback: ${this.lookbackMinutes}m)`);
  }

  async collect(): Promise<RawSample[]> {
    const startTime = Date.now();
    this.logger.debug('Starting infrastructure data collection');
    
    try {
      // Collect all sample types in parallel
      const [brokerSamples, topicSamples, consumerSamples] = await Promise.all([
        this.collectBrokerSamples(),
        this.collectTopicSamples(),
        this.collectConsumerSamples()
      ]);
      
      const allSamples = [
        ...brokerSamples,
        ...topicSamples,
        ...consumerSamples
      ];
      
      // Update stats
      this.stats.totalCollections++;
      this.stats.lastCollectionTime = Date.now();
      this.stats.lastCollectionCount = allSamples.length;
      
      const duration = Date.now() - startTime;
      this.logger.info(`Collected ${allSamples.length} samples in ${duration}ms`);
      
      return allSamples;
      
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Error collecting infrastructure data:', error);
      throw error;
    }
  }

  private async collectBrokerSamples(): Promise<RawSample[]> {
    const query = `
      FROM KafkaBrokerSample 
      SELECT *
      WHERE provider = 'KafkaBroker'
      SINCE ${this.lookbackMinutes} minutes ago
      LIMIT 1000
    `;
    
    const results = await this.nerdGraphClient.query(query);
    
    return results.map(sample => ({
      eventType: 'KafkaBrokerSample' as const,
      timestamp: sample.timestamp || Math.floor(Date.now() / 1000),
      ...sample
    }));
  }

  private async collectTopicSamples(): Promise<RawSample[]> {
    const query = `
      FROM KafkaTopicSample 
      SELECT *
      WHERE provider = 'KafkaTopic'
      SINCE ${this.lookbackMinutes} minutes ago
      LIMIT 1000
    `;
    
    const results = await this.nerdGraphClient.query(query);
    
    return results.map(sample => ({
      eventType: 'KafkaTopicSample' as const,
      timestamp: sample.timestamp || Math.floor(Date.now() / 1000),
      ...sample
    }));
  }

  private async collectConsumerSamples(): Promise<RawSample[]> {
    const query = `
      FROM KafkaConsumerSample 
      SELECT *
      WHERE provider = 'KafkaConsumer'
      SINCE ${this.lookbackMinutes} minutes ago
      LIMIT 1000
    `;
    
    const results = await this.nerdGraphClient.query(query);
    
    return results.map(sample => ({
      eventType: 'KafkaConsumerSample' as const,
      timestamp: sample.timestamp || Math.floor(Date.now() / 1000),
      ...sample
    }));
  }
}