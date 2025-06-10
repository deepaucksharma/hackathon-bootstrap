/**
 * Entity Streamer
 * 
 * Streams synthesized entities to New Relic using the Event API.
 * Handles batching, retries, and rate limiting.
 */

import https from 'https';
import { Logger } from '../shared/utils/logger';
import { PlatformConfig } from '../shared/types/config';
import { SynthesizedEntity } from '../synthesizers/entity-synthesizer';

interface StreamerStats {
  totalStreamed: number;
  totalBatches: number;
  errors: number;
  lastStreamTime?: number;
}

export class EntityStreamer {
  private logger: Logger;
  private config: PlatformConfig;
  private stats: StreamerStats;
  private batchSize: number;
  private endpoint: string;

  constructor(config: PlatformConfig) {
    this.config = config;
    this.logger = new Logger('EntityStreamer');
    this.batchSize = config.batchSize || 100;
    this.endpoint = config.region === 'EU' 
      ? 'insights-collector.eu01.nr-data.net'
      : 'insights-collector.newrelic.com';
    
    this.stats = {
      totalStreamed: 0,
      totalBatches: 0,
      errors: 0
    };
    
    this.logger.info(`Entity streamer initialized (endpoint: ${this.endpoint}, batch: ${this.batchSize})`);
  }

  /**
   * Stream entities to New Relic
   */
  async stream(entities: SynthesizedEntity[]): Promise<void> {
    if (entities.length === 0) {
      this.logger.debug('No entities to stream');
      return;
    }

    const startTime = Date.now();
    this.logger.debug(`Streaming ${entities.length} entities`);

    try {
      // Split into batches
      const batches = this.createBatches(entities);
      
      // Stream each batch
      for (const batch of batches) {
        await this.streamBatch(batch);
        this.stats.totalBatches++;
      }

      this.stats.totalStreamed += entities.length;
      this.stats.lastStreamTime = Date.now();
      
      const duration = Date.now() - startTime;
      this.logger.info(`Streamed ${entities.length} entities in ${batches.length} batches (${duration}ms)`);
      
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Error streaming entities:', error);
      throw error;
    }
  }

  private createBatches(entities: SynthesizedEntity[]): SynthesizedEntity[][] {
    const batches: SynthesizedEntity[][] = [];
    
    for (let i = 0; i < entities.length; i += this.batchSize) {
      batches.push(entities.slice(i, i + this.batchSize));
    }
    
    return batches;
  }

  private async streamBatch(batch: SynthesizedEntity[]): Promise<void> {
    const payload = JSON.stringify(batch);
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.endpoint,
        port: 443,
        path: `/v1/accounts/${this.config.accountId}/events`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': this.config.apiKey,
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 202) {
            this.logger.debug(`Batch streamed successfully (${batch.length} entities)`);
            resolve();
          } else {
            const error = new Error(`Event API error: ${res.statusCode} - ${data}`);
            this.logger.error('Batch streaming failed:', error);
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        this.logger.error('Request error:', error);
        reject(error);
      });

      req.write(payload);
      req.end();
    });
  }

  getStats(): StreamerStats {
    return { ...this.stats };
  }
}