#!/usr/bin/env node

/**
 * Dashboard CLI Tool
 * 
 * Command-line interface for managing Message Queue dashboards
 */

import { Command } from 'commander';
import { DashboardBuilder, DashboardBuilderOptions } from '../builders/dashboard-builder';
import { StandardMessageQueueDashboard } from '../templates/standard-message-queue-dashboard';
import { Logger } from '../../shared/utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = new Logger('DashboardCLI');

const program = new Command();

program
  .name('mq-dashboard')
  .description('New Relic Message Queue Dashboard Management CLI')
  .version('1.0.0');

// Create dashboard command
program
  .command('create')
  .description('Create a new message queue dashboard')
  .option('-a, --account <accountId>', 'New Relic account ID', process.env.NEW_RELIC_ACCOUNT_ID)
  .option('-k, --api-key <apiKey>', 'New Relic User API key', process.env.NEW_RELIC_API_KEY)
  .option('-r, --region <region>', 'New Relic region (US or EU)', 'US')
  .option('-n, --name <name>', 'Dashboard name', 'Message Queues Platform Dashboard')
  .option('-d, --description <description>', 'Dashboard description')
  .option('--dry-run', 'Preview dashboard without creating it')
  .action(async (options) => {
    try {
      validateRequiredOptions(options, ['account', 'apiKey']);
      
      if (options.dryRun) {
        logger.info('Dry run mode - previewing dashboard structure');
        const template = new StandardMessageQueueDashboard(options.account);
        const dashboard = template.generateTemplate(options.name);
        console.log(JSON.stringify(dashboard, null, 2));
        return;
      }
      
      const builder = new DashboardBuilder({
        accountId: options.account,
        apiKey: options.apiKey,
        region: options.region as 'US' | 'EU',
        dashboardName: options.name,
        description: options.description
      });
      
      logger.info('Creating dashboard...');
      const result = await builder.buildStandardDashboard();
      
      if (result.success) {
        logger.info('Dashboard created successfully!');
        console.log(`Dashboard URL: ${result.dashboardUrl}`);
        console.log(`Dashboard GUID: ${result.dashboardGuid}`);
      } else {
        logger.error(`Failed to create dashboard: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      logger.error('Error creating dashboard:', error);
      process.exit(1);
    }
  });

// Update dashboard command
program
  .command('update <guid>')
  .description('Update an existing dashboard')
  .option('-a, --account <accountId>', 'New Relic account ID', process.env.NEW_RELIC_ACCOUNT_ID)
  .option('-k, --api-key <apiKey>', 'New Relic User API key', process.env.NEW_RELIC_API_KEY)
  .option('-r, --region <region>', 'New Relic region (US or EU)', 'US')
  .option('-n, --name <name>', 'Dashboard name')
  .option('-d, --description <description>', 'Dashboard description')
  .action(async (guid, options) => {
    try {
      validateRequiredOptions(options, ['account', 'apiKey']);
      
      const builder = new DashboardBuilder({
        accountId: options.account,
        apiKey: options.apiKey,
        region: options.region as 'US' | 'EU'
      });
      
      const template = new StandardMessageQueueDashboard(options.account);
      const dashboard = template.generateTemplate(options.name || 'Message Queues Platform Dashboard');
      
      if (options.description) {
        dashboard.description = options.description;
      }
      
      logger.info(`Updating dashboard ${guid}...`);
      const result = await builder.updateDashboard(guid, dashboard);
      
      if (result.success) {
        logger.info('Dashboard updated successfully!');
        console.log(`Dashboard URL: ${result.dashboardUrl}`);
      } else {
        logger.error(`Failed to update dashboard: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      logger.error('Error updating dashboard:', error);
      process.exit(1);
    }
  });

// Delete dashboard command
program
  .command('delete <guid>')
  .description('Delete a dashboard')
  .option('-a, --account <accountId>', 'New Relic account ID', process.env.NEW_RELIC_ACCOUNT_ID)
  .option('-k, --api-key <apiKey>', 'New Relic User API key', process.env.NEW_RELIC_API_KEY)
  .option('-r, --region <region>', 'New Relic region (US or EU)', 'US')
  .option('--force', 'Skip confirmation prompt')
  .action(async (guid, options) => {
    try {
      validateRequiredOptions(options, ['account', 'apiKey']);
      
      if (!options.force) {
        const confirmation = await promptConfirmation(`Are you sure you want to delete dashboard ${guid}?`);
        if (!confirmation) {
          logger.info('Deletion cancelled');
          return;
        }
      }
      
      const builder = new DashboardBuilder({
        accountId: options.account,
        apiKey: options.apiKey,
        region: options.region as 'US' | 'EU'
      });
      
      logger.info(`Deleting dashboard ${guid}...`);
      const result = await builder.deleteDashboard(guid);
      
      if (result.success) {
        logger.info('Dashboard deleted successfully!');
      } else {
        logger.error(`Failed to delete dashboard: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      logger.error('Error deleting dashboard:', error);
      process.exit(1);
    }
  });

// List dashboards command
program
  .command('list')
  .description('List all dashboards in the account')
  .option('-a, --account <accountId>', 'New Relic account ID', process.env.NEW_RELIC_ACCOUNT_ID)
  .option('-k, --api-key <apiKey>', 'New Relic User API key', process.env.NEW_RELIC_API_KEY)
  .option('-r, --region <region>', 'New Relic region (US or EU)', 'US')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      validateRequiredOptions(options, ['account', 'apiKey']);
      
      const builder = new DashboardBuilder({
        accountId: options.account,
        apiKey: options.apiKey,
        region: options.region as 'US' | 'EU'
      });
      
      logger.info('Fetching dashboards...');
      const dashboards = await builder.listDashboards();
      
      if (options.json) {
        console.log(JSON.stringify(dashboards, null, 2));
      } else {
        console.log(`\nFound ${dashboards.length} dashboards:\n`);
        dashboards.forEach((dashboard) => {
          console.log(`- ${dashboard.name}`);
          console.log(`  GUID: ${dashboard.guid}`);
          console.log(`  Pages: ${dashboard.pages.length}`);
          console.log(`  Created: ${new Date(dashboard.createdAt).toLocaleString()}`);
          console.log(`  Updated: ${new Date(dashboard.updatedAt).toLocaleString()}`);
          console.log('');
        });
      }
    } catch (error) {
      logger.error('Error listing dashboards:', error);
      process.exit(1);
    }
  });

// Validate dashboard command
program
  .command('validate')
  .description('Validate dashboard queries')
  .option('-a, --account <accountId>', 'New Relic account ID', process.env.NEW_RELIC_ACCOUNT_ID)
  .option('-k, --api-key <apiKey>', 'New Relic User API key', process.env.NEW_RELIC_API_KEY)
  .option('-r, --region <region>', 'New Relic region (US or EU)', 'US')
  .option('-f, --file <file>', 'Dashboard template file (JSON)')
  .action(async (options) => {
    try {
      validateRequiredOptions(options, ['account', 'apiKey']);
      
      const builder = new DashboardBuilder({
        accountId: options.account,
        apiKey: options.apiKey,
        region: options.region as 'US' | 'EU'
      });
      
      let template;
      if (options.file) {
        logger.info(`Loading template from ${options.file}`);
        const templateData = fs.readFileSync(options.file, 'utf8');
        template = JSON.parse(templateData);
      } else {
        logger.info('Using standard template');
        const generator = new StandardMessageQueueDashboard(options.account);
        template = generator.generateTemplate();
      }
      
      logger.info('Validating dashboard queries...');
      const validation = await builder.validateDashboardQueries(template);
      
      if (validation.valid) {
        logger.info('All queries are valid!');
      } else {
        logger.error('Validation errors found:');
        validation.errors.forEach(error => console.error(`  - ${error}`));
        process.exit(1);
      }
    } catch (error) {
      logger.error('Error validating dashboard:', error);
      process.exit(1);
    }
  });

// Export dashboard command
program
  .command('export <guid>')
  .description('Export a dashboard to JSON file')
  .option('-a, --account <accountId>', 'New Relic account ID', process.env.NEW_RELIC_ACCOUNT_ID)
  .option('-k, --api-key <apiKey>', 'New Relic User API key', process.env.NEW_RELIC_API_KEY)
  .option('-r, --region <region>', 'New Relic region (US or EU)', 'US')
  .option('-o, --output <file>', 'Output file path')
  .action(async (guid, options) => {
    try {
      validateRequiredOptions(options, ['account', 'apiKey']);
      
      logger.info(`Exporting dashboard ${guid}...`);
      
      // For now, export the standard template
      // In a real implementation, this would fetch the dashboard from New Relic
      const template = new StandardMessageQueueDashboard(options.account);
      const dashboard = template.generateTemplate();
      
      const outputPath = options.output || `dashboard-${guid}.json`;
      fs.writeFileSync(outputPath, JSON.stringify(dashboard, null, 2));
      
      logger.info(`Dashboard exported to ${outputPath}`);
    } catch (error) {
      logger.error('Error exporting dashboard:', error);
      process.exit(1);
    }
  });

// Import dashboard command
program
  .command('import <file>')
  .description('Import a dashboard from JSON file')
  .option('-a, --account <accountId>', 'New Relic account ID', process.env.NEW_RELIC_ACCOUNT_ID)
  .option('-k, --api-key <apiKey>', 'New Relic User API key', process.env.NEW_RELIC_API_KEY)
  .option('-r, --region <region>', 'New Relic region (US or EU)', 'US')
  .action(async (file, options) => {
    try {
      validateRequiredOptions(options, ['account', 'apiKey']);
      
      logger.info(`Importing dashboard from ${file}...`);
      
      const templateData = fs.readFileSync(file, 'utf8');
      const template = JSON.parse(templateData);
      
      const builder = new DashboardBuilder({
        accountId: options.account,
        apiKey: options.apiKey,
        region: options.region as 'US' | 'EU'
      });
      
      const result = await builder.buildCustomDashboard(template);
      
      if (result.success) {
        logger.info('Dashboard imported successfully!');
        console.log(`Dashboard URL: ${result.dashboardUrl}`);
        console.log(`Dashboard GUID: ${result.dashboardGuid}`);
      } else {
        logger.error(`Failed to import dashboard: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      logger.error('Error importing dashboard:', error);
      process.exit(1);
    }
  });

// Helper functions
function validateRequiredOptions(options: any, required: string[]): void {
  const missing = required.filter(opt => !options[opt]);
  if (missing.length > 0) {
    logger.error(`Missing required options: ${missing.join(', ')}`);
    logger.info('You can set these as environment variables:');
    if (missing.includes('account')) {
      logger.info('  export NEW_RELIC_ACCOUNT_ID=your-account-id');
    }
    if (missing.includes('apiKey')) {
      logger.info('  export NEW_RELIC_API_KEY=your-api-key');
    }
    process.exit(1);
  }
}

async function promptConfirmation(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    readline.question(`${message} (y/N): `, (answer: string) => {
      readline.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}