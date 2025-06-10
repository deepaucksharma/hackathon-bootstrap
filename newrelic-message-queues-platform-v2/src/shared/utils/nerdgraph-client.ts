/**
 * Enhanced NerdGraph Client with Circuit Breaker Protection
 * Provides resilient querying of New Relic data
 */

import https from 'https';
import { injectable, inject } from 'inversify';
import { Logger } from './logger.js';
import { PlatformConfig } from '../types/config.js';
import { CircuitBreaker } from '@infrastructure/resilience/circuit-breaker.js';
import { CircuitBreakerFactory } from '@infrastructure/resilience/circuit-breaker-factory.js';
import { TYPES } from '@infrastructure/config/types.js';

export interface NerdGraphResponse<T = any> {
  data?: T;
  errors?: Array<{
    message: string;
    path?: string[];
    extensions?: any;
  }>;
}

export interface NRQLQueryResult {
  results: Array<Record<string, any>>;
  metadata?: {
    eventTypes?: string[];
    messages?: string[];
    beginTime?: number;
    endTime?: number;
    rawSince?: string;
    rawUntil?: string;
    rawCompareWith?: string;
  };
}

@injectable()
export class NerdGraphClient {
  private endpoint: string;
  private circuitBreaker: CircuitBreaker;
  private requestCount = 0;
  private errorCount = 0;
  private lastError?: Error;

  constructor(
    @inject(TYPES.ConfigurationService) private config: PlatformConfig,
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.CircuitBreakerFactory) circuitBreakerFactory: CircuitBreakerFactory
  ) {
    this.endpoint = config.region === 'EU' 
      ? 'api.eu.newrelic.com'
      : 'api.newrelic.com';
    
    // Create circuit breaker for this client
    this.circuitBreaker = circuitBreakerFactory.getOrCreate('nerdgraph-api');
    
    this.logger.info(`NerdGraph client initialized for ${this.endpoint}`);
  }

  /**
   * Execute NRQL query with circuit breaker protection
   */
  async query(nrql: string): Promise<any[]> {
    const query = `
      query($accountId: Int!, $nrql: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrql) {
              results
              metadata {
                eventTypes
                messages
                beginTime
                endTime
              }
            }
          }
        }
      }
    `;

    const variables = {
      accountId: parseInt(this.config.accountId),
      nrql
    };

    try {
      const response = await this.circuitBreaker.execute(async () => {
        this.logger.debug(`Executing NRQL query: ${nrql}`);
        return this.makeRequest(query, variables);
      });
      
      const results = response?.data?.actor?.account?.nrql?.results || [];
      const metadata = response?.data?.actor?.account?.nrql?.metadata;
      
      if (metadata?.messages?.length > 0) {
        this.logger.warn('NRQL query warnings:', metadata.messages);
      }
      
      this.logger.debug(`Query returned ${results.length} results`);
      return results;
    } catch (error) {
      this.errorCount++;
      this.lastError = error as Error;
      this.logger.error(`NerdGraph query failed (${this.errorCount} errors total):`, error);
      throw error;
    }
  }

  /**
   * Execute multiple NRQL queries in parallel with circuit breaker protection
   */
  async batchQuery(queries: string[]): Promise<any[][]> {
    const batchQuery = `
      query($accountId: Int!, $queries: [Nrql!]!) {
        actor {
          account(id: $accountId) {
            nrql {
              ${queries.map((_, index) => `
                query${index}: nrql(query: $queries[${index}]) {
                  results
                }
              `).join('')}
            }
          }
        }
      }
    `;

    const variables = {
      accountId: parseInt(this.config.accountId),
      queries
    };

    try {
      const response = await this.circuitBreaker.execute(async () => {
        this.logger.debug(`Executing batch NRQL query with ${queries.length} queries`);
        return this.makeRequest(batchQuery, variables);
      });
      
      const nrqlResults = response?.data?.actor?.account?.nrql || {};
      return queries.map((_, index) => nrqlResults[`query${index}`]?.results || []);
    } catch (error) {
      this.errorCount++;
      this.lastError = error as Error;
      this.logger.error('Batch NerdGraph query failed:', error);
      throw error;
    }
  }

  /**
   * Query with pagination support
   */
  async queryWithPagination(
    nrql: string, 
    limit: number = 2000,
    offset: number = 0
  ): Promise<any[]> {
    const paginatedNrql = `${nrql} LIMIT ${limit} OFFSET ${offset}`;
    return this.query(paginatedNrql);
  }

  /**
   * Query all results (handling pagination automatically)
   */
  async queryAll(baseNrql: string, maxResults: number = 10000): Promise<any[]> {
    const results: any[] = [];
    const pageSize = 2000; // Max NRQL limit
    let offset = 0;
    
    while (results.length < maxResults) {
      const pageResults = await this.queryWithPagination(baseNrql, pageSize, offset);
      
      if (pageResults.length === 0) {
        break; // No more results
      }
      
      results.push(...pageResults);
      offset += pageSize;
      
      // Respect rate limits
      if (offset > 0 && offset % 10000 === 0) {
        this.logger.debug(`Fetched ${results.length} results, pausing for rate limit...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results.slice(0, maxResults);
  }

  /**
   * Make HTTP request to NerdGraph
   */
  private makeRequest(query: string, variables: any): Promise<NerdGraphResponse> {
    return new Promise((resolve, reject) => {
      this.requestCount++;
      const startTime = Date.now();
      const postData = JSON.stringify({ query, variables });
      
      const options = {
        hostname: this.endpoint,
        port: 443,
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': this.config.apiKey,
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'NewRelic-MessageQueues-V2/1.0'
        },
        timeout: 30000 // 30 second timeout
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          const duration = Date.now() - startTime;
          this.logger.debug(`NerdGraph request completed in ${duration}ms`);
          
          try {
            const result = JSON.parse(data);
            
            if (res.statusCode && res.statusCode >= 400) {
              const error = new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`);
              (error as any).statusCode = res.statusCode;
              (error as any).response = result;
              reject(error);
              return;
            }
            
            if (result.errors && result.errors.length > 0) {
              const errorMessages = result.errors.map((e: any) => e.message).join(', ');
              reject(new Error(`GraphQL errors: ${errorMessages}`));
            } else {
              resolve(result);
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error}`));
          }
        });
      });

      req.on('error', (error) => {
        const duration = Date.now() - startTime;
        this.logger.error(`NerdGraph request failed after ${duration}ms:`, error);
        reject(error);
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout after 30 seconds'));
      });
      
      req.write(postData);
      req.end();
    });
  }

  /**
   * Get client statistics
   */
  getStats(): Record<string, any> {
    return {
      endpoint: this.endpoint,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0,
      lastError: this.lastError?.message,
      circuitBreakerStats: this.circuitBreaker.getStats()
    };
  }

  /**
   * Test connectivity to NerdGraph
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 FROM Transaction LIMIT 1');
      return true;
    } catch (error) {
      this.logger.error('Connection test failed:', error);
      return false;
    }
  }
}