/**
 * Dashboard Generator
 * 
 * Creates dashboards based on product specifications using MESSAGE_QUEUE entities.
 * This is a wrapper around the new dashboard system for backward compatibility.
 */

import { Logger } from '../shared/utils/logger';
import { PlatformConfig } from '../shared/types/config';
import { DashboardBuilder } from './builders/dashboard-builder';
import { StandardMessageQueueDashboard } from './templates/standard-message-queue-dashboard';

export class DashboardGenerator {
  private logger: Logger;
  private config: PlatformConfig;
  private builder: DashboardBuilder;

  constructor(config: PlatformConfig) {
    this.config = config;
    this.logger = new Logger('DashboardGenerator');
    
    // Initialize the new dashboard builder
    this.builder = new DashboardBuilder({
      accountId: config.accountId,
      apiKey: config.userApiKey || config.apiKey,
      region: config.region as 'US' | 'EU'
    });
  }

  /**
   * Generate and deploy a standard Message Queue dashboard
   */
  async generate(dashboardName?: string): Promise<{ guid: string; url: string }> {
    const name = dashboardName || 'Message Queues Platform';
    
    this.logger.info(`Generating dashboard: ${name}`);
    
    try {
      // Override the dashboard name in builder options
      const originalName = this.builder['options'].dashboardName;
      this.builder['options'].dashboardName = name;
      
      // Use the new dashboard builder
      const result = await this.builder.buildStandardDashboard();
      
      // Restore original name
      this.builder['options'].dashboardName = originalName;
      
      if (result.success && result.dashboardGuid && result.dashboardUrl) {
        this.logger.info(`Dashboard created: ${result.dashboardUrl}`);
        return {
          guid: result.dashboardGuid,
          url: result.dashboardUrl
        };
      } else {
        throw new Error(result.error || 'Dashboard creation failed');
      }
    } catch (error) {
      this.logger.error('Dashboard creation failed:', error);
      throw error;
    }
  }

  /**
   * Generate dashboard with custom configuration
   */
  async generateCustom(config: {
    name: string;
    description?: string;
    pages?: string[];
  }): Promise<string> {
    this.logger.info(`Generating custom dashboard: ${config.name}`);
    
    try {
      // Create a custom template based on configuration
      const templateGenerator = new StandardMessageQueueDashboard(this.config.accountId);
      const template = templateGenerator.generateTemplate(config.name);
      
      if (config.description) {
        template.description = config.description;
      }
      
      // Filter pages if specific ones are requested
      if (config.pages && config.pages.length > 0) {
        template.pages = template.pages.filter(page => 
          config.pages!.includes(page.name)
        );
      }
      
      const result = await this.builder.buildCustomDashboard(template);
      
      if (result.success && result.dashboardUrl) {
        this.logger.info(`Custom dashboard created: ${result.dashboardUrl}`);
        return result.dashboardUrl;
      } else {
        throw new Error(result.error || 'Custom dashboard creation failed');
      }
    } catch (error) {
      this.logger.error('Custom dashboard creation failed:', error);
      throw error;
    }
  }

  /**
   * List all dashboards in the account
   */
  async listDashboards(): Promise<any[]> {
    try {
      return await this.builder.listDashboards();
    } catch (error) {
      this.logger.error('Failed to list dashboards:', error);
      return [];
    }
  }

  /**
   * Delete a dashboard by GUID
   */
  async deleteDashboard(guid: string): Promise<boolean> {
    try {
      const result = await this.builder.deleteDashboard(guid);
      return result.success;
    } catch (error) {
      this.logger.error('Failed to delete dashboard:', error);
      return false;
    }
  }

  /**
   * Update an existing dashboard
   */
  async update(guid: string, dashboardName?: string): Promise<{ guid: string; url: string }> {
    this.logger.info(`Updating dashboard: ${guid}`);
    
    try {
      // Generate a new template with current configuration
      const name = dashboardName || 'Message Queues Platform';
      const templateGenerator = new StandardMessageQueueDashboard(this.config.accountId);
      const template = templateGenerator.generateTemplate(name);
      
      // Update the dashboard
      const result = await this.builder.updateDashboard(guid, template);
      
      if (result.success && result.dashboardGuid && result.dashboardUrl) {
        this.logger.info(`Dashboard updated: ${result.dashboardUrl}`);
        return {
          guid: result.dashboardGuid,
          url: result.dashboardUrl
        };
      } else {
        throw new Error(result.error || 'Dashboard update failed');
      }
    } catch (error) {
      this.logger.error('Dashboard update failed:', error);
      throw error;
    }
  }

}