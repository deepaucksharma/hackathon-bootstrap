#!/usr/bin/env node

/**
 * DashBuilder CLI - Unified command-line interface
 * 
 * Replaces 30+ individual scripts with a single, powerful CLI
 */

const { program } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
require('dotenv').config();

const { 
  createDashboardBuilder,
  discoverMetrics,
  createFromTemplate,
  templates
} = require('../src');

// Version from package.json
const { version } = require('../package.json');

// Configure CLI
program
  .name('dashbuilder')
  .description('Unified New Relic Dashboard Builder')
  .version(version);

/**
 * Discover command - find available metrics
 */
program
  .command('discover')
  .description('Discover available metrics in your New Relic account')
  .option('-s, --strategy <type>', 'Discovery strategy (comprehensive|intelligent|pattern|quick)', 'intelligent')
  .option('-p, --patterns <patterns>', 'Comma-separated patterns to match', '')
  .option('-o, --output <file>', 'Save results to file')
  .option('--no-cache', 'Disable caching')
  .action(async (options) => {
    const spinner = ora('Discovering metrics...').start();
    
    try {
      const config = await getConfig();
      const discoveryOptions = {
        strategy: options.strategy,
        useCache: options.cache
      };
      
      if (options.patterns) {
        discoveryOptions.patterns = createPatternsFromString(options.patterns);
      }
      
      const results = await discoverMetrics({ ...config, ...discoveryOptions });
      
      spinner.succeed(`Discovered ${results.totalMetrics} metrics across ${results.eventTypes.length} event types`);
      
      // Display summary
      console.log('\n' + chalk.bold('Summary:'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`Total Event Types: ${chalk.cyan(results.summary.totalEventTypes)}`);
      console.log(`Total Metrics: ${chalk.cyan(results.summary.totalMetrics)}`);
      
      if (results.summary.topEventTypes) {
        console.log('\n' + chalk.bold('Top Event Types:'));
        results.summary.topEventTypes.forEach(et => {
          console.log(`  ${chalk.green(et.eventType)}: ${et.metricCount} metrics`);
        });
      }
      
      // Display results summary only (no file saving)
      console.log('\n' + chalk.bold('Discovery Complete'));
      console.log(`Use this data to create dashboards via NerdGraph`);
      
    } catch (error) {
      spinner.fail('Discovery failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

/**
 * Create command - build a dashboard
 */
program
  .command('create [template]')
  .description('Create a new dashboard')
  .option('-n, --name <name>', 'Dashboard name')
  .option('-i, --intelligent', 'Use intelligent mode', true)
  .option('-o, --output <file>', 'Save dashboard to file')
  .option('-d, --deploy', 'Deploy to New Relic after creation')
  .action(async (template, options) => {
    try {
      const config = await getConfig();
      
      // If template not provided, show selection
      if (!template) {
        const answers = await inquirer.prompt([{
          type: 'list',
          name: 'template',
          message: 'Select a template:',
          choices: [
            ...Object.keys(templates),
            { name: 'Custom (no template)', value: 'custom' }
          ]
        }]);
        template = answers.template;
      }
      
      // Get dashboard name if not provided
      if (!options.name) {
        const answers = await inquirer.prompt([{
          type: 'input',
          name: 'name',
          message: 'Dashboard name:',
          default: `${template} Dashboard - ${new Date().toLocaleDateString()}`
        }]);
        options.name = answers.name;
      }
      
      const spinner = ora('Creating dashboard...').start();
      
      let dashboard;
      
      if (template === 'custom') {
        // Create custom dashboard
        const builder = createDashboardBuilder({
          ...config,
          intelligent: options.intelligent,
          name: options.name
        });
        
        dashboard = await builder.build();
      } else {
        // Create from template
        dashboard = await createFromTemplate(template, {
          ...config,
          intelligent: options.intelligent,
          name: options.name
        });
      }
      
      spinner.succeed('Dashboard created successfully');
      
      // Dashboard created in memory
      console.log(`\n✅ Dashboard created successfully`);
      
      // Deploy if requested
      if (options.deploy) {
        const deploySpinner = ora('Deploying to New Relic...').start();
        try {
          const builder = createDashboardBuilder(config);
          const result = await builder.deploy(dashboard);
          deploySpinner.succeed(`Dashboard deployed successfully! GUID: ${chalk.cyan(result.guid)}`);
        } catch (error) {
          deploySpinner.fail('Deployment failed');
          console.error(chalk.red(error.message));
        }
      }
      
    } catch (error) {
      console.error(chalk.red('Dashboard creation failed:'), error.message);
      process.exit(1);
    }
  });

/**
 * List command - list dashboards via NerdGraph
 */
program
  .command('list')
  .description('List dashboards in your account')
  .action(async () => {
    const spinner = ora('Fetching dashboards from New Relic...').start();
    
    try {
      const config = await getConfig();
      const builder = createDashboardBuilder(config);
      
      // List dashboards via NerdGraph
      const query = `
        query($accountId: Int!) {
          actor {
            entitySearch(query: "accountId = $accountId AND type = 'DASHBOARD'") {
              results {
                entities {
                  guid
                  name
                  tags {
                    key
                    values
                  }
                }
              }
            }
          }
        }
      `;
      
      const result = await builder.nerdgraphQuery(query, { accountId: config.accountId });
      const dashboards = result.actor.entitySearch.results.entities;
      
      spinner.succeed(`Found ${dashboards.length} dashboards`);
      
      // Display dashboards
      console.log('\n' + chalk.bold('Dashboards:'));
      console.log(chalk.gray('─'.repeat(50)));
      
      dashboards.forEach(dashboard => {
        console.log(`\n${chalk.green(dashboard.name)}`);
        console.log(`  GUID: ${chalk.cyan(dashboard.guid)}`);
        console.log(`  URL: ${chalk.blue(`https://one.newrelic.com/dashboards/${dashboard.guid}`)}`);
      });
      
    } catch (error) {
      spinner.fail('Failed to fetch dashboards');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

/**
 * Deploy command - create and deploy dashboard in one step
 */
program
  .command('deploy [template]')
  .description('Create and deploy a dashboard to New Relic')
  .option('-n, --name <name>', 'Dashboard name')
  .action(async (template, options) => {
    const spinner = ora('Creating and deploying dashboard...').start();
    
    try {
      const config = await getConfig();
      
      // Create dashboard
      let dashboard;
      if (template && template !== 'custom') {
        dashboard = await createFromTemplate(template, {
          ...config,
          name: options.name || `${template} Dashboard`
        });
      } else {
        const builder = createDashboardBuilder({
          ...config,
          name: options.name || 'Custom Dashboard'
        });
        dashboard = await builder.build();
      }
      
      // Deploy immediately
      const builder = createDashboardBuilder(config);
      const result = await builder.deploy(dashboard);
      
      spinner.succeed(`Dashboard deployed successfully!`);
      console.log(`\n🎉 Dashboard GUID: ${chalk.cyan(result.guid)}`);
      console.log(`📊 View at: ${chalk.blue(result.url)}`);
      
    } catch (error) {
      spinner.fail('Deployment failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

/**
 * List command - show available templates
 */
program
  .command('list-templates')
  .description('List available dashboard templates')
  .action(() => {
    console.log(chalk.bold('\nAvailable Templates:'));
    console.log(chalk.gray('─'.repeat(50)));
    
    Object.entries(templates).forEach(([name, template]) => {
      console.log(`\n${chalk.green(name)}:`);
      console.log(`  ${template.description || 'No description available'}`);
      if (template.features) {
        console.log(`  Features: ${template.features.join(', ')}`);
      }
    });
  });

/**
 * Interactive mode - guided dashboard creation
 */
program
  .command('interactive')
  .description('Interactive dashboard creation wizard')
  .action(async () => {
    console.log(chalk.bold('\n🚀 Welcome to DashBuilder Interactive Mode!\n'));
    
    try {
      // Get configuration
      const config = await getConfig();
      
      // Ask questions
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            'Create a dashboard from template',
            'Create a custom dashboard',
            'Discover available metrics',
            'List existing dashboards'
          ]
        },
        {
          type: 'list',
          name: 'template',
          message: 'Select a template:',
          choices: Object.keys(templates),
          when: (ans) => ans.action === 'Create a dashboard from template'
        },
        {
          type: 'input',
          name: 'name',
          message: 'Dashboard name:',
          default: (ans) => `${ans.template || 'Custom'} Dashboard - ${new Date().toLocaleDateString()}`,
          when: (ans) => ans.action.includes('Create')
        },
        {
          type: 'confirm',
          name: 'intelligent',
          message: 'Use intelligent mode?',
          default: true,
          when: (ans) => ans.action.includes('Create')
        },
        {
          type: 'confirm',
          name: 'deploy',
          message: 'Deploy to New Relic after creation?',
          default: false,
          when: (ans) => ans.action.includes('Create')
        }
      ]);
      
      // Execute based on answers
      if (answers.action === 'Discover available metrics') {
        await program.parseAsync(['node', 'dashbuilder', 'discover'], { from: 'user' });
      } else if (answers.action === 'List existing dashboards') {
        await program.parseAsync(['node', 'dashbuilder', 'list'], { from: 'user' });
      } else if (answers.action.includes('Create')) {
        const options = {
          name: answers.name,
          intelligent: answers.intelligent,
          deploy: answers.deploy
        };
        
        if (answers.template) {
          await program.parseAsync(['node', 'dashbuilder', 'create', answers.template, ...buildOptionsArray(options)], { from: 'user' });
        } else {
          await program.parseAsync(['node', 'dashbuilder', 'create', 'custom', ...buildOptionsArray(options)], { from: 'user' });
        }
      }
      
    } catch (error) {
      console.error(chalk.red('Interactive mode error:'), error.message);
      process.exit(1);
    }
  });

// Helper functions

/**
 * Get configuration from environment or prompt
 */
async function getConfig() {
  const config = {
    accountId: process.env.NEW_RELIC_ACCOUNT_ID,
    apiKey: process.env.NEW_RELIC_API_KEY || process.env.NEW_RELIC_USER_KEY,
    region: process.env.NEW_RELIC_REGION || 'US'
  };
  
  // Check if config is complete
  if (!config.accountId || !config.apiKey) {
    console.log(chalk.yellow('\n⚠️  Missing configuration. Please provide:'));
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'accountId',
        message: 'New Relic Account ID:',
        when: !config.accountId,
        validate: (input) => input.length > 0 || 'Account ID is required'
      },
      {
        type: 'password',
        name: 'apiKey',
        message: 'New Relic API Key:',
        when: !config.apiKey,
        validate: (input) => input.length > 0 || 'API key is required'
      }
    ]);
    
    Object.assign(config, answers);
  }
  
  return config;
}

/**
 * Create pattern objects from comma-separated string
 */
function createPatternsFromString(patternsStr) {
  const patterns = {};
  patternsStr.split(',').forEach((pattern, index) => {
    patterns[`pattern${index}`] = new RegExp(pattern.trim(), 'i');
  });
  return patterns;
}

/**
 * Build options array for parseAsync
 */
function buildOptionsArray(options) {
  const args = [];
  
  if (options.name) {
    args.push('--name', options.name);
  }
  if (options.intelligent) {
    args.push('--intelligent');
  }
  if (options.deploy) {
    args.push('--deploy');
  }
  
  return args;
}

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}