/**
 * NerdGraph Client
 * 
 * Generic New Relic NerdGraph API client for dashboard operations.
 * Handles authentication, query execution, and error handling.
 */

const https = require('https');
const { URL } = require('url');

class NerdGraphClient {
  constructor(config = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.NEW_RELIC_USER_API_KEY,
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
      nerdGraphUrl: config.nerdGraphUrl || 'https://api.newrelic.com/graphql',
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      retryDelay: config.retryDelay || 1000,
      ...config
    };

    if (!this.config.apiKey) {
      throw new Error('New Relic User API Key is required');
    }

    if (!this.config.accountId) {
      throw new Error('New Relic Account ID is required');
    }
  }

  /**
   * Execute GraphQL query with retry logic
   */
  async executeQuery(query, variables = {}, options = {}) {
    const payload = {
      query,
      variables
    };

    let lastError;
    const maxRetries = options.retries !== undefined ? options.retries : this.config.retries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.makeRequest(payload, options);
        
        if (result.errors && result.errors.length > 0) {
          throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries && this.isRetryableError(error)) {
          const delay = (options.retryDelay || this.config.retryDelay) * Math.pow(2, attempt);
          console.warn(`Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms: ${error.message}`);
          await this.sleep(delay);
        } else {
          break;
        }
      }
    }

    throw lastError;
  }

  /**
   * Create dashboard
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
      dashboard: this.prepareDashboardInput(dashboard)
    };

    const result = await this.executeQuery(mutation, variables, options);
    
    if (result.data.dashboardCreate.errors && result.data.dashboardCreate.errors.length > 0) {
      throw new Error(`Dashboard creation failed: ${JSON.stringify(result.data.dashboardCreate.errors)}`);
    }

    return result.data.dashboardCreate.entityResult;
  }

  /**
   * Update dashboard
   */
  async updateDashboard(guid, dashboard, options = {}) {
    const mutation = `
      mutation UpdateDashboard($guid: EntityGuid!, $dashboard: DashboardInput!) {
        dashboardUpdate(guid: $guid, dashboard: $dashboard) {
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
      guid,
      dashboard: this.prepareDashboardInput(dashboard)
    };

    const result = await this.executeQuery(mutation, variables, options);
    
    if (result.data.dashboardUpdate.errors && result.data.dashboardUpdate.errors.length > 0) {
      throw new Error(`Dashboard update failed: ${JSON.stringify(result.data.dashboardUpdate.errors)}`);
    }

    return result.data.dashboardUpdate.entityResult;
  }

  /**
   * Delete dashboard
   */
  async deleteDashboard(guid, options = {}) {
    const mutation = `
      mutation DeleteDashboard($guid: EntityGuid!) {
        dashboardDelete(guid: $guid) {
          status
          errors {
            description
            type
          }
        }
      }
    `;

    const variables = { guid };

    const result = await this.executeQuery(mutation, variables, options);
    
    if (result.data.dashboardDelete.errors && result.data.dashboardDelete.errors.length > 0) {
      throw new Error(`Dashboard deletion failed: ${JSON.stringify(result.data.dashboardDelete.errors)}`);
    }

    return result.data.dashboardDelete;
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
              variables {
                name
                type
                title
                defaultValue
                possibleValues
                isMultiSelection
              }
              pages {
                guid
                name
                description
                createdAt
                updatedAt
                widgets {
                  id
                  title
                  visualization {
                    id
                  }
                  layout {
                    column
                    row
                    width
                    height
                  }
                  configuration
                }
              }
            }
          }
        }
      }
    `;

    const variables = { guid };

    const result = await this.executeQuery(query, variables, options);
    
    return result.data.actor.entity;
  }

  /**
   * List dashboards for account
   */
  async listDashboards(options = {}) {
    const query = `
      query ListDashboards($accountId: Int!, $cursor: String) {
        actor {
          entitySearch(
            query: "type = 'DASHBOARD' AND accountId = ${this.config.accountId}"
            options: { limit: 200, cursor: $cursor }
          ) {
            results {
              entities {
                ... on DashboardEntity {
                  guid
                  name
                  description
                  permissions
                  createdAt
                  updatedAt
                  permalink
                }
              }
              nextCursor
            }
          }
        }
      }
    `;

    const dashboards = [];
    let cursor = null;

    do {
      const variables = {
        accountId: parseInt(this.config.accountId),
        cursor
      };

      const result = await this.executeQuery(query, variables, options);
      const searchResult = result.data.actor.entitySearch.results;
      
      dashboards.push(...searchResult.entities);
      cursor = searchResult.nextCursor;
      
    } while (cursor && (!options.maxResults || dashboards.length < options.maxResults));

    return dashboards.slice(0, options.maxResults);
  }

  /**
   * Execute NRQL query
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

    const result = await this.executeQuery(query, variables, options);
    
    return result.data.actor.account.nrql;
  }

  /**
   * Validate dashboard configuration
   */
  async validateDashboard(dashboard, options = {}) {
    // This is a client-side validation since NerdGraph doesn't have a validate endpoint
    const errors = [];
    const warnings = [];

    // Basic validation
    if (!dashboard.name || dashboard.name.trim().length === 0) {
      errors.push('Dashboard name is required');
    }

    if (!dashboard.pages || dashboard.pages.length === 0) {
      errors.push('Dashboard must have at least one page');
    }

    // Validate pages
    if (dashboard.pages) {
      dashboard.pages.forEach((page, pageIndex) => {
        if (!page.name || page.name.trim().length === 0) {
          errors.push(`Page ${pageIndex + 1} must have a name`);
        }

        if (!page.widgets || page.widgets.length === 0) {
          warnings.push(`Page "${page.name}" has no widgets`);
        }

        // Validate widgets
        if (page.widgets) {
          page.widgets.forEach((widget, widgetIndex) => {
            if (!widget.title || widget.title.trim().length === 0) {
              errors.push(`Widget ${widgetIndex + 1} on page "${page.name}" must have a title`);
            }

            if (!widget.configuration || !widget.configuration.nrqlQueries || widget.configuration.nrqlQueries.length === 0) {
              errors.push(`Widget "${widget.title}" must have at least one NRQL query`);
            }
          });
        }
      });
    }

    // Validate variables
    if (dashboard.variables) {
      dashboard.variables.forEach((variable, varIndex) => {
        if (!variable.name || variable.name.trim().length === 0) {
          errors.push(`Variable ${varIndex + 1} must have a name`);
        }

        if (!variable.type) {
          errors.push(`Variable "${variable.name}" must have a type`);
        }

        if (variable.type === 'ENUM' && (!variable.possibleValues || variable.possibleValues.length === 0)) {
          errors.push(`ENUM variable "${variable.name}" must have possible values`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Private methods

  /**
   * Make HTTP request to NerdGraph
   */
  async makeRequest(payload, options = {}) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      const urlObj = new URL(this.config.nerdGraphUrl);
      
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'API-Key': this.config.apiKey,
          'User-Agent': 'newrelic-dashboard-framework/1.0.0'
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
            const result = JSON.parse(responseData);
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(result);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${result.message || responseData}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(data);
      req.end();
    });
  }

  /**
   * Prepare dashboard input for GraphQL mutation
   */
  prepareDashboardInput(dashboard) {
    // Clean up the dashboard object to match GraphQL schema expectations
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
   * Check if error is retryable
   */
  isRetryableError(error) {
    if (error.code && ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error.code)) {
      return true;
    }
    
    if (error.message && error.message.includes('timeout')) {
      return true;
    }
    
    if (error.message && error.message.includes('HTTP 5')) {
      return true;
    }
    
    return false;
  }

  /**
   * Sleep utility for retry delays
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get client configuration
   */
  getConfig() {
    return {
      accountId: this.config.accountId,
      nerdGraphUrl: this.config.nerdGraphUrl,
      timeout: this.config.timeout,
      retries: this.config.retries,
      retryDelay: this.config.retryDelay
    };
  }
}

module.exports = NerdGraphClient;