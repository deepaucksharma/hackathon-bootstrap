/**
 * Metric Streamer
 * 
 * Streams custom metrics to New Relic using the Metric API.
 * This is optional - entities already contain metrics.
 */

import https from 'https';
import { Logger } from '../shared/utils/logger.js';
import { PlatformConfig } from '../shared/types/config.js';
import { SynthesizedEntity } from '../synthesizers/entity-synthesizer.js';

interface MetricData {
  name: string;
  type: 'gauge' | 'count' | 'summary';
  value: number;
  timestamp: number;
  attributes: Record<string, string>;
}

export class MetricStreamer {
  private logger: Logger;
  private config: PlatformConfig;
  private endpoint: string;

  constructor(config: PlatformConfig) {
    this.config = config;
    this.logger = new Logger('MetricStreamer');
    this.endpoint = config.region === 'EU'
      ? 'metric-api.eu.newrelic.com'
      : 'metric-api.newrelic.com';
  }

  /**
   * Stream entity metrics as custom metrics (optional)
   * Most users will rely on entity metrics instead
   */
  async stream(entities: SynthesizedEntity[]): Promise<void> {
    if (!this.config.enableMetrics) {
      return; // Metrics streaming is optional
    }

    const metrics: MetricData[] = [];
    
    for (const entity of entities) {
      // Extract numeric fields as metrics
      for (const [key, value] of Object.entries(entity)) {
        if (typeof value === 'number' && this.isMetricField(key)) {
          const metricName = this.getMetricName(entity.entityType, key);
          metrics.push({
            name: metricName,
            type: 'gauge',
            value: value,
            timestamp: entity.timestamp,
            attributes: {
              'entity.guid': entity.entityGuid,
              'entity.type': entity.entityType,
              ...entity.tags
            }
          });
        }
      }
    }

    if (metrics.length > 0) {
      await this.sendMetrics(metrics);
      this.logger.debug(`Streamed ${metrics.length} custom metrics`);
    }
  }

  private async sendMetrics(metrics: MetricData[]): Promise<void> {
    const payload = [{
      metrics: metrics
    }];

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(payload);
      
      const options = {
        hostname: this.endpoint,
        port: 443,
        path: '/metric/v1',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': this.config.apiKey,
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode === 202) {
            resolve();
          } else {
            reject(new Error(`Metric API error: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  private isMetricField(key: string): boolean {
    // Skip metadata fields
    const skipFields = ['eventType', 'entityType', 'entityGuid', 'displayName', 'timestamp', 'tags', 'reportingEntity'];
    return !skipFields.includes(key);
  }

  private getMetricName(entityType: string, field: string): string {
    const typePrefix = entityType.toLowerCase().replace(/_/g, '.');
    return `newrelic.${typePrefix}.${field}`;
  }
}