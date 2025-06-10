#!/usr/bin/env node

/**
 * Dashboard CLI Tool
 * 
 * Command-line interface for generating and managing Message Queue dashboards
 * Implements complete functional flows including error recovery and validation
 */

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const DashboardGenerator = require('../generators/dashboard-generator');
const { getConfigManager } = require('../../core/config/config-manager');

const program = new Command();

program
  .name('mq-dashboard')
  .description('Generate and manage New Relic dashboards for Message Queues')
  .version('1.0.0');

/**
 * Generate dashboard command
 */
program
  .command('generate')
  .description('Generate a new dashboard for message queue monitoring')
  .option('-n, --name <name>', 'Dashboard name')
  .option('-c, --cluster <cluster>', 'Filter by cluster name')
  .option('-e, --environment <env>', 'Filter by environment (production, staging, development)')
  .option('--dry-run', 'Validate without creating dashboard')
  .option('--verify', 'Run verification after creation')
  .action(async (options) => {
    const spinner = ora('Initializing dashboard generator...').start();
    
    try {
      // Load configuration
      const configManager = getConfigManager();
      const config = configManager.getConfig();
      
      // Validate configuration
      if (!config.accountId || !config.apiKey) {
        spinner.fail('Missing required configuration');
        console.error(chalk.red('\nError: NEW_RELIC_ACCOUNT_ID and NEW_RELIC_USER_API_KEY are required'));
        console.log(chalk.yellow('\nSet environment variables:'));
        console.log('  export NEW_RELIC_ACCOUNT_ID=your_account_id');
        console.log('  export NEW_RELIC_USER_API_KEY=your_api_key');
        process.exit(1);
      }
      
      // Create generator instance
      const generator = new DashboardGenerator(config);
      
      spinner.text = 'Collecting entity context...';
      
      // Prepare options
      const dashboardOptions = {
        name: options.name,
        filters: {}
      };
      
      if (options.cluster) {
        dashboardOptions.filters.cluster = options.cluster;
      }
      
      if (options.environment) {
        dashboardOptions.filters.environment = options.environment;
      }
      
      // Dry run mode
      if (options.dryRun) {
        spinner.text = 'Running validation...';
        const context = await generator.collectEntityContext();
        const dashboard = generator.customizeDashboard(context, dashboardOptions);
        const validation = await generator.verifyDashboard(dashboard);
        
        spinner.stop();
        
        console.log(chalk.blue('\n📋 Dashboard Validation Report'));
        console.log(chalk.gray('─'.repeat(50)));
        
        if (validation.valid) {
          console.log(chalk.green('✅ Dashboard structure is valid'));
        } else {
          console.log(chalk.red('❌ Validation failed'));
          validation.errors.forEach(error => {
            console.log(chalk.red(`   • ${error}`));
          });
        }
        
        if (validation.warnings.length > 0) {
          console.log(chalk.yellow('\n⚠️  Warnings:'));
          validation.warnings.forEach(warning => {
            console.log(chalk.yellow(`   • ${warning}`));
          });
        }
        
        console.log(chalk.gray('\nDashboard summary:'));
        console.log(`  Pages: ${dashboard.pages.length}`);
        console.log(`  Total widgets: ${dashboard.pages.reduce((sum, p) => sum + p.widgets.length, 0)}`);
        
        return;
      }
      
      spinner.text = 'Generating dashboard...';
      
      // Generate dashboard
      const result = await generator.generateDashboard(dashboardOptions);
      
      if (result.success) {
        spinner.succeed('Dashboard created successfully!');
        
        console.log(chalk.green('\n✅ Dashboard Details'));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(`Name: ${result.dashboard.name}`);
        console.log(`GUID: ${result.dashboard.guid}`);
        console.log(`URL: ${result.dashboard.permalink}`);
        console.log(`Duration: ${result.duration}ms`);
        
        // Display verification report if requested
        if (options.verify && result.report) {
          console.log(chalk.blue('\n📊 Verification Report'));
          console.log(chalk.gray('─'.repeat(50)));
          console.log(`Pages: ${result.report.verification.pageCount}`);
          console.log(`Widgets: ${result.report.verification.widgetCount}`);
          console.log(`Est. Load Time: ${result.report.verification.estimatedLoadTime}s`);
          
          if (result.report.recommendations.length > 0) {
            console.log(chalk.yellow('\n💡 Recommendations:'));
            result.report.recommendations.forEach(rec => {
              console.log(chalk.yellow(`   • ${rec}`));
            });
          }
        }
        
      } else {
        spinner.fail('Dashboard generation failed');
        console.error(chalk.red(`\nError: ${result.error}`));
        console.log(chalk.yellow(`Recovery: ${result.recovery}`));
        process.exit(1);
      }
      
    } catch (error) {
      spinner.fail('Unexpected error');
      console.error(chalk.red('\nError:'), error.message);
      console.error(chalk.gray(error.stack));
      process.exit(1);
    }
  });

/**
 * List dashboards command
 */
program
  .command('list')
  .description('List existing message queue dashboards')
  .option('-l, --limit <number>', 'Number of dashboards to list', '10')
  .action(async (options) => {
    const spinner = ora('Fetching dashboards...').start();
    
    try {
      const configManager = getConfigManager();
      const config = configManager.getConfig();
      const generator = new DashboardGenerator(config);
      
      const query = `
        {
          actor {
            entitySearch(query: "type = 'DASHBOARD' AND name LIKE '%Message Queue%'") {
              results(limit: ${options.limit}) {
                entities {
                  guid
                  name
                  tags {
                    key
                    values
                  }
                  ... on DashboardEntity {
                    createdAt
                    updatedAt
                    pages {
                      name
                    }
                  }
                }
              }
            }
          }
        }
      `;
      
      const response = await generator.executeNerdGraphQuery(query);
      const dashboards = response.data?.actor?.entitySearch?.results?.entities || [];
      
      spinner.stop();
      
      if (dashboards.length === 0) {
        console.log(chalk.yellow('No message queue dashboards found'));
        return;
      }
      
      console.log(chalk.blue(`\n📊 Message Queue Dashboards (${dashboards.length})`));
      console.log(chalk.gray('─'.repeat(80)));
      
      dashboards.forEach(dashboard => {
        console.log(chalk.white(`\n${dashboard.name}`));
        console.log(chalk.gray(`  GUID: ${dashboard.guid}`));
        console.log(chalk.gray(`  Pages: ${dashboard.pages?.length || 0}`));
        console.log(chalk.gray(`  Created: ${new Date(dashboard.createdAt).toLocaleString()}`));
        console.log(chalk.gray(`  Updated: ${new Date(dashboard.updatedAt).toLocaleString()}`));
      });
      
    } catch (error) {
      spinner.fail('Failed to fetch dashboards');
      console.error(chalk.red('\nError:'), error.message);
      process.exit(1);
    }
  });

/**
 * Health check command
 */
program
  .command('health')
  .description('Check dashboard generator health status')
  .action(async () => {
    try {
      const configManager = getConfigManager();
      const config = configManager.getConfig();
      const generator = new DashboardGenerator(config);
      
      const health = generator.getHealth();
      
      console.log(chalk.blue('\n🏥 Dashboard Generator Health'));
      console.log(chalk.gray('─'.repeat(50)));
      
      const statusColor = health.status === 'success' ? chalk.green : 
                         health.status === 'error' ? chalk.red : chalk.yellow;
      
      console.log(`Status: ${statusColor(health.status)}`);
      console.log(`Dashboards Created: ${health.dashboardsCreated}`);
      console.log(`Errors: ${health.errors}`);
      
      if (health.lastSuccess) {
        console.log(`Last Success: ${new Date(health.lastSuccess).toLocaleString()}`);
      }
      
      if (health.lastError) {
        console.log(chalk.red(`\nLast Error: ${health.lastError.message}`));
        console.log(chalk.gray(`  Occurred: ${new Date(health.lastError.timestamp).toLocaleString()}`));
      }
      
      console.log(chalk.blue('\n🔌 Circuit Breaker Status'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`State: ${health.circuitBreaker.state}`);
      console.log(`Failures: ${health.circuitBreaker.failures}`);
      
    } catch (error) {
      console.error(chalk.red('\nError:'), error.message);
      process.exit(1);
    }
  });

/**
 * Validate command
 */
program
  .command('validate')
  .description('Validate dashboard template and configuration')
  .action(async () => {
    const spinner = ora('Validating configuration...').start();
    
    try {
      const configManager = getConfigManager();
      const config = configManager.getConfig();
      
      // Check configuration
      const configChecks = [
        { name: 'Account ID', value: config.accountId, required: true },
        { name: 'API Key', value: config.apiKey, required: true },
        { name: 'Region', value: config.region || 'US', required: false },
        { name: 'Environment', value: process.env.NODE_ENV || 'development', required: false }
      ];
      
      spinner.stop();
      
      console.log(chalk.blue('\n🔍 Configuration Validation'));
      console.log(chalk.gray('─'.repeat(50)));
      
      let hasErrors = false;
      configChecks.forEach(check => {
        if (check.required && !check.value) {
          console.log(chalk.red(`❌ ${check.name}: MISSING`));
          hasErrors = true;
        } else {
          const displayValue = check.name === 'API Key' ? 
            check.value?.substring(0, 10) + '...' : check.value;
          console.log(chalk.green(`✅ ${check.name}: ${displayValue}`));
        }
      });
      
      // Validate dashboard template
      console.log(chalk.blue('\n📋 Dashboard Template Validation'));
      console.log(chalk.gray('─'.repeat(50)));
      
      const { standardMessageQueueDashboard } = require('../templates/standard-message-queue-dashboard');
      const generator = new DashboardGenerator(config);
      const validation = await generator.verifyDashboard(standardMessageQueueDashboard);
      
      if (validation.valid) {
        console.log(chalk.green('✅ Template structure is valid'));
        console.log(`  Pages: ${standardMessageQueueDashboard.pages.length}`);
        console.log(`  Widgets: ${standardMessageQueueDashboard.pages.reduce((sum, p) => sum + p.widgets.length, 0)}`);
      } else {
        console.log(chalk.red('❌ Template validation failed'));
        hasErrors = true;
      }
      
      if (hasErrors) {
        console.log(chalk.red('\n⚠️  Validation completed with errors'));
        process.exit(1);
      } else {
        console.log(chalk.green('\n✅ All validations passed'));
      }
      
    } catch (error) {
      spinner.fail('Validation failed');
      console.error(chalk.red('\nError:'), error.message);
      process.exit(1);
    }
  });

/**
 * Interactive mode
 */
program
  .command('interactive')
  .description('Interactive dashboard generation wizard')
  .action(async () => {
    console.log(chalk.blue('\n🧙 Dashboard Generation Wizard'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.yellow('Coming soon...'));
    console.log('\nFor now, use: mq-dashboard generate --name "My Dashboard"');
  });

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}