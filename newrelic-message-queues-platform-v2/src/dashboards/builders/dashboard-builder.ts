/**
 * Dashboard Builder
 * 
 * Builds and deploys dashboards using templates and New Relic GraphQL API
 */

import https from 'https';
import { Logger } from '../../shared/utils/logger';
import { PlatformConfig } from '../../shared/types/config';
import { StandardMessageQueueDashboard, DashboardTemplate } from '../templates/standard-message-queue-dashboard';

export interface DashboardBuilderOptions {
  accountId: string;
  apiKey: string;
  region?: 'US' | 'EU';
  dashboardName?: string;
  description?: string;
}

export interface DashboardDeploymentResult {
  success: boolean;
  dashboardGuid?: string;
  dashboardUrl?: string;
  error?: string;
}

export class DashboardBuilder {
  private logger: Logger;
  private apiEndpoint: string;
  private options: DashboardBuilderOptions;

  constructor(options: DashboardBuilderOptions) {
    this.options = options;
    this.logger = new Logger('DashboardBuilder');
    this.apiEndpoint = options.region === 'EU' 
      ? 'api.eu.newrelic.com'
      : 'api.newrelic.com';
  }

  /**
   * Build and deploy a standard message queue dashboard
   */
  async buildStandardDashboard(): Promise<DashboardDeploymentResult> {
    try {
      this.logger.info('Building standard message queue dashboard');
      
      // Generate dashboard template
      const templateGenerator = new StandardMessageQueueDashboard(this.options.accountId);
      const template = templateGenerator.generateTemplate(
        this.options.dashboardName || 'Message Queues Platform Dashboard'
      );
      
      // Override description if provided
      if (this.options.description) {
        template.description = this.options.description;
      }
      
      // Deploy to New Relic
      const result = await this.deployDashboard(template);
      
      if (result.success) {
        this.logger.info(`Dashboard deployed successfully: ${result.dashboardUrl}`);
      } else {
        this.logger.error(`Dashboard deployment failed: ${result.error}`);
      }
      
      return result;
    } catch (error) {
      this.logger.error('Dashboard build failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Build and deploy a custom dashboard from template
   */
  async buildCustomDashboard(template: DashboardTemplate): Promise<DashboardDeploymentResult> {
    try {
      this.logger.info(`Building custom dashboard: ${template.name}`);
      
      // Validate template
      this.validateTemplate(template);
      
      // Deploy to New Relic
      const result = await this.deployDashboard(template);
      
      if (result.success) {
        this.logger.info(`Custom dashboard deployed: ${result.dashboardUrl}`);
      } else {
        this.logger.error(`Custom dashboard deployment failed: ${result.error}`);
      }
      
      return result;
    } catch (error) {
      this.logger.error('Custom dashboard build failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Update an existing dashboard
   */
  async updateDashboard(dashboardGuid: string, template: DashboardTemplate): Promise<DashboardDeploymentResult> {
    try {
      this.logger.info(`Updating dashboard: ${dashboardGuid}`);
      
      const mutation = `
        mutation UpdateDashboard($guid: EntityGuid!, $dashboard: DashboardInput!) {
          dashboardUpdate(guid: $guid, dashboard: $dashboard) {
            entityResult {
              guid
            }
            errors {
              description
              type
            }
          }
        }
      `;

      const variables = {
        guid: dashboardGuid,
        dashboard: this.transformTemplateForAPI(template)
      };

      const response = await this.makeGraphQLRequest(mutation, variables);
      
      if (response.data?.dashboardUpdate?.errors?.length > 0) {
        const errors = response.data.dashboardUpdate.errors;
        return {
          success: false,
          error: `Dashboard update errors: ${JSON.stringify(errors)}`
        };
      }

      const guid = response.data?.dashboardUpdate?.entityResult?.guid;
      return {
        success: true,
        dashboardGuid: guid,
        dashboardUrl: `https://one.newrelic.com/redirect/entity/${guid}`
      };
    } catch (error) {
      this.logger.error('Dashboard update failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Delete a dashboard
   */
  async deleteDashboard(dashboardGuid: string): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.info(`Deleting dashboard: ${dashboardGuid}`);
      
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

      const variables = { guid: dashboardGuid };
      const response = await this.makeGraphQLRequest(mutation, variables);
      
      if (response.data?.dashboardDelete?.errors?.length > 0) {
        const errors = response.data.dashboardDelete.errors;
        return {
          success: false,
          error: `Dashboard deletion errors: ${JSON.stringify(errors)}`
        };
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Dashboard deletion failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * List all dashboards for the account
   */
  async listDashboards(): Promise<any[]> {
    try {
      const query = `
        query ListDashboards($accountId: Int!) {
          actor {
            account(id: $accountId) {
              dashboards {
                results {
                  guid
                  name
                  description
                  createdAt
                  updatedAt
                  permissions
                  pages {
                    name
                    description
                  }
                }
              }
            }
          }
        }
      `;

      const variables = { accountId: parseInt(this.options.accountId) };
      const response = await this.makeGraphQLRequest(query, variables);
      
      return response.data?.actor?.account?.dashboards?.results || [];
    } catch (error) {
      this.logger.error('Failed to list dashboards:', error);
      return [];
    }
  }

  /**
   * Deploy dashboard to New Relic
   */
  private async deployDashboard(template: DashboardTemplate): Promise<DashboardDeploymentResult> {
    const mutation = `
      mutation CreateDashboard($accountId: Int!, $dashboard: DashboardInput!) {
        dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
          entityResult {
            guid
          }
          errors {
            description
            type
          }
        }
      }
    `;

    const dashboard = this.transformTemplateForAPI(template);
    const variables = {
      accountId: parseInt(this.options.accountId),
      dashboard
    };

    try {
      const response = await this.makeGraphQLRequest(mutation, variables);
      
      if (response.data?.dashboardCreate?.errors?.length > 0) {
        const errors = response.data.dashboardCreate.errors;
        return {
          success: false,
          error: `Dashboard creation errors: ${JSON.stringify(errors)}`
        };
      }

      const guid = response.data?.dashboardCreate?.entityResult?.guid;
      if (!guid) {
        return {
          success: false,
          error: 'No dashboard GUID returned from API'
        };
      }

      return {
        success: true,
        dashboardGuid: guid,
        dashboardUrl: `https://one.newrelic.com/redirect/entity/${guid}`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'API request failed'
      };
    }
  }

  /**
   * Transform template to API format
   */
  private transformTemplateForAPI(template: DashboardTemplate): any {
    return {
      name: template.name,
      description: template.description,
      permissions: template.permissions,
      pages: template.pages.map(page => ({
        name: page.name,
        description: page.description,
        widgets: page.widgets.map(widget => ({
          title: widget.title,
          layout: widget.layout,
          visualization: widget.visualization,
          rawConfiguration: widget.rawConfiguration
        }))
      }))
    };
  }

  /**
   * Validate dashboard template
   */
  private validateTemplate(template: DashboardTemplate): void {
    if (!template.name || template.name.trim().length === 0) {
      throw new Error('Dashboard name is required');
    }
    
    if (!template.pages || template.pages.length === 0) {
      throw new Error('Dashboard must have at least one page');
    }
    
    for (const page of template.pages) {
      if (!page.name || page.name.trim().length === 0) {
        throw new Error('Page name is required');
      }
      
      if (!page.widgets || page.widgets.length === 0) {
        throw new Error(`Page "${page.name}" must have at least one widget`);
      }
      
      for (const widget of page.widgets) {
        if (!widget.title || widget.title.trim().length === 0) {
          throw new Error('Widget title is required');
        }
        
        if (!widget.visualization?.id) {
          throw new Error(`Widget "${widget.title}" must have a visualization type`);
        }
        
        if (!widget.rawConfiguration?.nrqlQueries?.length) {
          throw new Error(`Widget "${widget.title}" must have at least one NRQL query`);
        }
      }
    }
  }

  /**
   * Make GraphQL request to New Relic API
   */
  private makeGraphQLRequest(query: string, variables: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({ query, variables });
      
      const options = {
        hostname: this.apiEndpoint,
        port: 443,
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': this.options.apiKey,
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
            reject(new Error(`Failed to parse API response: ${error instanceof Error ? error.message : String(error)}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`API request failed: ${error.message}`));
      });
      
      req.write(postData);
      req.end();
    });
  }

  /**
   * Get dashboard metrics for validation
   */
  async validateDashboardQueries(template: DashboardTemplate): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    for (const page of template.pages) {
      for (const widget of page.widgets) {
        if (widget.rawConfiguration?.nrqlQueries) {
          for (const query of widget.rawConfiguration.nrqlQueries) {
            try {
              await this.validateNRQL(query.query);
            } catch (error) {
              errors.push(`Widget "${widget.title}": ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate NRQL query
   */
  private async validateNRQL(nrql: string): Promise<void> {
    const query = `
      query ValidateNRQL($accountId: Int!, $nrql: Nrql!) {
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
      accountId: parseInt(this.options.accountId),
      nrql
    };

    try {
      await this.makeGraphQLRequest(query, variables);
    } catch (error) {
      throw new Error(`Invalid NRQL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}