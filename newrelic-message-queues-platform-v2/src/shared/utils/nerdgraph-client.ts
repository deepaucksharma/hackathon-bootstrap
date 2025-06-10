/**
 * NerdGraph Client for querying New Relic
 */

import https from 'https';
import { Logger } from './logger';
import { PlatformConfig } from '../types/config';

export class NerdGraphClient {
  private logger: Logger;
  private config: PlatformConfig;
  private endpoint: string;

  constructor(config: PlatformConfig) {
    this.config = config;
    this.logger = new Logger('NerdGraphClient');
    this.endpoint = config.region === 'EU' 
      ? 'api.eu.newrelic.com'
      : 'api.newrelic.com';
  }

  async query(nrql: string): Promise<any[]> {
    const query = `
      query($accountId: Int!, $nrql: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrql) {
              results
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
      const response = await this.makeRequest(query, variables);
      return response?.data?.actor?.account?.nrql?.results || [];
    } catch (error) {
      this.logger.error('NerdGraph query failed:', error);
      throw error;
    }
  }

  private makeRequest(query: string, variables: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({ query, variables });
      
      const options = {
        hostname: this.endpoint,
        port: 443,
        path: '/graphql',
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
          try {
            const result = JSON.parse(data);
            if (result.errors) {
              reject(new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`));
            } else {
              resolve(result);
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }
}