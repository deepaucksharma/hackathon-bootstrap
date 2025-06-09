/**
 * Unified New Relic HTTP Client
 * 
 * Consolidates HTTP communication logic for NerdGraph API, Event API, and Metric API.
 * Provides unified retry logic, error handling, rate limiting, and configuration.
 */

const https = require('https');
const { URL } = require('url');

class NewRelicClient {
  constructor(config = {}) {
    this.config = {
      // API Configuration
      apiKey: config.apiKey || process.env.NEW_RELIC_API_KEY || process.env.NEW_RELIC_USER_API_KEY,
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
      region: config.region || process.env.NEW_RELIC_REGION || 'US',
      
      // HTTP Configuration  
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      retryDelay: config.retryDelay || 1000,
      
      // API Endpoints
      nerdGraphUrl: config.nerdGraphUrl || this._getNerdGraphEndpoint(config.region),
      eventApiUrl: config.eventApiUrl || this._getEventApiEndpoint(config.region),
      metricApiUrl: config.metricApiUrl || this._getMetricApiEndpoint(config.region),
      
      // Client Configuration
      userAgent: config.userAgent || 'newrelic-message-queues-platform/1.0.0',
      verbose: config.verbose || false,
      dryRun: config.dryRun || false,
      
      ...config
    };

    this._validateConfig();
    this._rateLimiter = new Map(); // Track rate limits per endpoint
  }

  /**
   * Execute NerdGraph GraphQL query
   */
  async nerdGraphQuery(query, variables = {}, options = {}) {
    const payload = { query, variables };
    const endpoint = this.config.nerdGraphUrl;
    
    const headers = {
      'Content-Type': 'application/json',
      'API-Key': this.config.apiKey
    };

    return this._executeRequest(endpoint, payload, headers, options);
  }

  /**
   * Send events to Event API
   */
  async sendEvents(events, options = {}) {
    const endpoint = `${this.config.eventApiUrl}/${this.config.accountId}/events`;
    
    const headers = {
      'Content-Type': 'application/json', 
      'Api-Key': this.config.apiKey
    };

    return this._executeRequest(endpoint, events, headers, options);
  }

  /**
   * Send metrics to Metric API
   */
  async sendMetrics(metrics, options = {}) {
    const endpoint = this.config.metricApiUrl;
    const payload = Array.isArray(metrics) ? [{ metrics }] : metrics;
    
    const headers = {
      'Content-Type': 'application/json',
      'Api-Key': this.config.apiKey
    };

    return this._executeRequest(endpoint, payload, headers, options);
  }

  /**
   * Execute NRQL query via NerdGraph
   */
  async executeNrqlQuery(nrql, options = {}) {
    const query = `
      query ExecuteNrql($accountId: Int!, $nrql: Nrql!, $timeout: Seconds) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrql, timeout: $timeout) {
              results
              metadata {
                timeWindow {
                  begin
                  end
                }
                rawResponse
              }
            }
          }
        }
      }
    `;

    const variables = {
      accountId: parseInt(this.config.accountId),
      nrql,
      timeout: options.timeout || 60
    };

    const result = await this.nerdGraphQuery(query, variables, options);
    return result.data?.actor?.account?.nrql;
  }

  /**
   * Create dashboard via NerdGraph
   */
  async createDashboard(dashboard, options = {}) {
    const mutation = `
      mutation CreateDashboard($accountId: Int!, $dashboard: DashboardInput!) {
        dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
          entityResult {
            guid
            name
            permalink
          }
          errors {
            description
            type
          }
        }
      }
    `;

    const variables = {
      accountId: parseInt(this.config.accountId),
      dashboard: this._prepareDashboardInput(dashboard)
    };

    const result = await this.nerdGraphQuery(mutation, variables, options);
    
    if (result.data?.dashboardCreate?.errors?.length > 0) {
      throw new Error(`Dashboard creation failed: ${JSON.stringify(result.data.dashboardCreate.errors)}`);
    }

    return result.data?.dashboardCreate?.entityResult;
  }

  /**
   * Get dashboard by GUID
   */
  async getDashboard(guid, options = {}) {
    const query = `
      query GetDashboard($guid: EntityGuid!) {
        actor {
          entity(guid: $guid) {
            ... on DashboardEntity {
              guid
              name
              description
              permissions
              createdAt
              updatedAt
              permalink
              pages {
                guid
                name
                widgets {
                  id
                  title
                  configuration
                  visualization {
                    id
                  }
                  layout {
                    column
                    row
                    width
                    height
                  }
                }
              }
            }
          }
        }
      }
    `;

    const variables = { guid };
    const result = await this.nerdGraphQuery(query, variables, options);
    return result.data?.actor?.entity;
  }

  // Private methods

  /**
   * Execute HTTP request with retry logic and error handling
   */
  async _executeRequest(endpoint, payload, headers, options = {}) {
    const maxRetries = options.retries !== undefined ? options.retries : this.config.retries;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Handle dry run mode
        if (this.config.dryRun) {
          return this._handleDryRun(endpoint, payload, headers);
        }

        // Execute actual request
        const result = await this._makeHttpRequest(endpoint, payload, headers, options);
        
        if (this.config.verbose && attempt > 0) {
          console.log(`Request succeeded on attempt ${attempt + 1}`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries && this._isRetryableError(error)) {
          const delay = (options.retryDelay || this.config.retryDelay) * Math.pow(2, attempt);
          
          if (this.config.verbose) {
            console.warn(`Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms: ${error.message}`);
          }
          
          await this._sleep(delay);
        } else {
          break;
        }
      }
    }

    // Enrich error with context
    lastError.endpoint = endpoint;
    lastError.attempts = maxRetries + 1;
    lastError.payloadSize = Buffer.byteLength(JSON.stringify(payload));
    
    throw lastError;
  }

  /**
   * Make actual HTTP request
   */
  async _makeHttpRequest(endpoint, payload, headers, options = {}) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      const urlObj = new URL(endpoint);
      
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Length': Buffer.byteLength(data),
          'User-Agent': this.config.userAgent,
          ...headers
        },
        timeout: options.timeout || this.config.timeout
      };

      const req = https.request(requestOptions, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const result = responseData ? JSON.parse(responseData) : {};
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              // Handle GraphQL errors in successful HTTP responses
              if (result.errors && result.errors.length > 0) {
                const error = new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
                error.graphqlErrors = result.errors;
                error.statusCode = res.statusCode;
                error.isRetryable = result.errors.some(e => 
                  e.extensions?.code === 'RATE_LIMITED' ||
                  e.extensions?.code === 'TIMEOUT' ||
                  e.message.includes('timeout') ||
                  e.message.includes('temporarily unavailable')
                );
                reject(error);
              } else {
                resolve(result);
              }
            } else {
              const error = new Error(`HTTP ${res.statusCode}: ${res.statusText}. ${responseData}`);
              error.statusCode = res.statusCode;
              error.isRetryable = res.statusCode >= 500 || res.statusCode === 429;
              reject(error);
            }
          } catch (parseError) {
            const error = new Error(`Failed to parse response: ${parseError.message}`);
            error.originalError = parseError;
            error.responseData = responseData;
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        error.isRetryable = true; // Network errors are generally retryable
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        const error = new Error('Request timeout');
        error.code = 'ETIMEDOUT';
        error.isRetryable = true;
        reject(error);
      });

      req.write(data);
      req.end();
    });
  }

  /**
   * Handle dry run mode
   */
  _handleDryRun(endpoint, payload, headers) {
    if (this.config.verbose) {
      console.log(`[DRY RUN] Would send request to ${endpoint}`);
      console.log(`[DRY RUN] Payload size: ${Buffer.byteLength(JSON.stringify(payload))} bytes`);
      console.log(`[DRY RUN] Records: ${Array.isArray(payload) ? payload.length : 1}`);
    }
    
    return Promise.resolve({
      dryRun: true,
      success: true,
      endpoint,
      payloadSize: Buffer.byteLength(JSON.stringify(payload))
    });
  }

  /**
   * Check if error should be retried
   */
  _isRetryableError(error) {
    // Network errors
    if (error.code && ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(error.code)) {
      return true;
    }
    
    // HTTP status codes
    if (error.statusCode && (error.statusCode >= 500 || error.statusCode === 429)) {
      return true;
    }
    
    // GraphQL-specific retryable errors
    if (error.isRetryable) {
      return true;
    }
    
    // Timeout messages
    if (error.message && error.message.toLowerCase().includes('timeout')) {
      return true;
    }
    
    return false;
  }

  /**
   * Sleep utility for retry delays
   */
  async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate client configuration
   */
  _validateConfig() {
    if (!this.config.apiKey) {
      throw new Error('New Relic API Key is required (NEW_RELIC_API_KEY or NEW_RELIC_USER_API_KEY)');
    }

    if (!this.config.accountId) {
      throw new Error('New Relic Account ID is required (NEW_RELIC_ACCOUNT_ID)');
    }

    // Validate region
    if (!['US', 'EU'].includes(this.config.region)) {
      throw new Error('Region must be "US" or "EU"');
    }
  }

  /**
   * Get NerdGraph endpoint for region
   */
  _getNerdGraphEndpoint(region) {
    return region === 'EU' 
      ? 'https://api.eu.newrelic.com/graphql'
      : 'https://api.newrelic.com/graphql';
  }

  /**
   * Get Event API endpoint for region
   */
  _getEventApiEndpoint(region) {
    return region === 'EU'
      ? 'https://insights-collector.eu.newrelic.com/v1/accounts'
      : 'https://insights-collector.newrelic.com/v1/accounts';
  }

  /**
   * Get Metric API endpoint for region
   */
  _getMetricApiEndpoint(region) {
    return region === 'EU'
      ? 'https://metric-api.eu.newrelic.com/metric/v1'
      : 'https://metric-api.newrelic.com/metric/v1';
  }

  /**
   * Prepare dashboard input for GraphQL
   */
  _prepareDashboardInput(dashboard) {
    const input = {
      name: dashboard.name,
      description: dashboard.description || '',
      permissions: dashboard.permissions || 'PUBLIC_READ_WRITE'
    };

    if (dashboard.variables) {
      input.variables = dashboard.variables.map(variable => ({
        name: variable.name,
        type: variable.type,
        title: variable.title || variable.name,
        ...(variable.defaultValue && { defaultValue: variable.defaultValue }),
        ...(variable.possibleValues && { possibleValues: variable.possibleValues }),
        ...(variable.isMultiSelection && { isMultiSelection: variable.isMultiSelection })
      }));
    }

    if (dashboard.pages) {
      input.pages = dashboard.pages.map(page => ({
        name: page.name,
        description: page.description || '',
        widgets: page.widgets.map(widget => ({
          title: widget.title,
          visualization: widget.visualization,
          layout: widget.layout,
          configuration: widget.configuration
        }))
      }));
    }

    return input;
  }

  /**
   * Get client configuration (without sensitive data)
   */
  getConfig() {
    return {
      accountId: this.config.accountId,
      region: this.config.region,
      timeout: this.config.timeout,
      retries: this.config.retries,
      retryDelay: this.config.retryDelay,
      nerdGraphUrl: this.config.nerdGraphUrl,
      eventApiUrl: this.config.eventApiUrl,
      metricApiUrl: this.config.metricApiUrl,
      userAgent: this.config.userAgent,
      dryRun: this.config.dryRun
    };
  }
}

module.exports = NewRelicClient;