#!/usr/bin/env node
/**
 * Dashboard Framework CLI
 * 
 * Command-line interface for creating dashboards using the framework + content pattern.
 * Demonstrates clean separation between generic framework and domain-specific content.
 */

const { program } = require('commander');
const DashboardFramework = require('./framework/core/dashboard-framework');
const MessageQueuesContentProvider = require('./content/message-queues/message-queues-content-provider');

// Configure CLI
program
  .name('dashboard-framework')
  .description('Generic dashboard framework with pluggable content providers')
  .version('1.0.0');

// List templates command
program
  .command('list-templates')
  .description('List available dashboard templates')
  .option('-p, --provider <provider>', 'Content provider', 'message-queues')
  .action(async (options) => {
    try {
      const contentProvider = getContentProvider(options.provider);
      const templates = contentProvider.getTemplates();
      
      console.log(`\n📋 Available Templates (${options.provider}):`);
      templates.forEach((template) => {
        console.log(`  • ${template.id}: ${template.title || template.name}`);
        console.log(`    Description: ${template.description}`);
        console.log(`    Entity Type: ${template.entityType}`);
        console.log(`    Sections: ${template.sections?.length || 0}`);
        console.log(`    Variables: ${template.variables?.length || 0}`);
        console.log('');
      });
      
    } catch (error) {
      console.error('❌ Error listing templates:', error.message);
      process.exit(1);
    }
  });

// Preview dashboard command
program
  .command('preview <template>')
  .description('Preview dashboard without deploying')
  .option('-p, --provider <provider>', 'Content provider', 'message-queues')
  .option('-v, --variables <variables>', 'Variables as JSON string', '{}')
  .option('-o, --output <output>', 'Output file for preview HTML')
  .action(async (template, options) => {
    try {
      const framework = initializeFramework();
      const contentProvider = getContentProvider(options.provider);
      framework.setContentProvider(contentProvider);
      
      const variables = JSON.parse(options.variables);
      
      console.log(`🔮 Generating preview for template: ${template}`);
      const result = await framework.previewDashboard(template, variables);
      
      console.log(`✅ Preview generated:`);
      console.log(`  Pages: ${result.dashboard.pages.length}`);
      console.log(`  Widgets: ${result.dashboard.pages.reduce((total, page) => total + page.widgets.length, 0)}`);
      
      if (options.output) {
        const fs = require('fs');
        fs.writeFileSync(options.output, result.preview);
        console.log(`  Preview saved to: ${options.output}`);
      }
      
    } catch (error) {
      console.error('❌ Error generating preview:', error.message);
      process.exit(1);
    }
  });

// Create dashboard command
program
  .command('create <template>')
  .description('Create and deploy dashboard')
  .option('-p, --provider <provider>', 'Content provider', 'message-queues')
  .option('-n, --name <name>', 'Dashboard name')
  .option('-d, --description <description>', 'Dashboard description')
  .option('-v, --variables <variables>', 'Variables as JSON string', '{}')
  .option('--permissions <permissions>', 'Dashboard permissions', 'PUBLIC_READ_WRITE')
  .action(async (template, options) => {
    try {
      const framework = initializeFramework();
      const contentProvider = getContentProvider(options.provider);
      framework.setContentProvider(contentProvider);
      
      const variables = JSON.parse(options.variables);
      const deployOptions = {
        name: options.name,
        description: options.description,
        permissions: options.permissions
      };
      
      console.log(`🚀 Creating dashboard from template: ${template}`);
      const result = await framework.buildAndDeploy(template, variables, deployOptions);
      
      console.log(`✅ Dashboard created successfully:`);
      console.log(`  Name: ${result.name}`);
      console.log(`  GUID: ${result.guid}`);
      console.log(`  URL: ${result.permalink}`);
      
    } catch (error) {
      console.error('❌ Error creating dashboard:', error.message);
      process.exit(1);
    }
  });

// Validate template command
program
  .command('validate <template>')
  .description('Validate dashboard template')
  .option('-p, --provider <provider>', 'Content provider', 'message-queues')
  .action(async (template, options) => {
    try {
      const contentProvider = getContentProvider(options.provider);
      const templateDef = contentProvider.getTemplate(template);
      
      if (!templateDef) {
        throw new Error(`Template '${template}' not found`);
      }
      
      const validation = contentProvider.validateTemplate(templateDef);
      
      console.log(`🔍 Validating template: ${template}`);
      
      if (validation.valid) {
        console.log('✅ Template is valid');
        
        // Show template summary
        const framework = new (require('./framework/core/template-processor'))();
        const summary = framework.getTemplateSummary(templateDef);
        
        console.log(`\nTemplate Summary:`);
        console.log(`  Sections: ${summary.sectionCount}`);
        console.log(`  Widgets: ${summary.widgetCount}`);
        console.log(`  Variables: ${summary.variableCount}`);
        console.log(`  Widget Types: ${summary.widgetTypes.join(', ')}`);
        
      } else {
        console.log('❌ Template validation failed:');
        validation.errors.forEach(error => {
          console.log(`  • ${error}`);
        });
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ Error validating template:', error.message);
      process.exit(1);
    }
  });

// Batch create command
program
  .command('batch <config-file>')
  .description('Create multiple dashboards from configuration file')
  .option('-p, --provider <provider>', 'Content provider', 'message-queues')
  .action(async (configFile, options) => {
    try {
      const fs = require('fs');
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      
      const framework = initializeFramework();
      const contentProvider = getContentProvider(options.provider);
      framework.setContentProvider(contentProvider);
      
      console.log(`📦 Creating ${config.dashboards.length} dashboards from configuration...`);
      
      const results = [];
      
      for (const dashboardConfig of config.dashboards) {
        try {
          console.log(`\n🚀 Creating: ${dashboardConfig.template}`);
          
          const result = await framework.buildAndDeploy(
            dashboardConfig.template,
            dashboardConfig.variables || {},
            {
              name: dashboardConfig.name,
              description: dashboardConfig.description,
              permissions: dashboardConfig.permissions || 'PUBLIC_READ_WRITE'
            }
          );
          
          results.push(result);
          console.log(`✅ Created: ${result.name} (${result.guid})`);
          
        } catch (error) {
          console.error(`❌ Failed to create ${dashboardConfig.template}: ${error.message}`);
        }
      }
      
      console.log(`\n📋 Batch creation summary:`);
      console.log(`  Total requested: ${config.dashboards.length}`);
      console.log(`  Successfully created: ${results.length}`);
      console.log(`  Failed: ${config.dashboards.length - results.length}`);
      
    } catch (error) {
      console.error('❌ Error in batch creation:', error.message);
      process.exit(1);
    }
  });

// Provider info command
program
  .command('provider-info <provider>')
  .description('Get information about content provider')
  .action(async (providerName) => {
    try {
      const contentProvider = getContentProvider(providerName);
      const metadata = contentProvider.getMetadata();
      
      console.log(`\n📦 Content Provider Information:`);
      console.log(`  Name: ${metadata.name}`);
      console.log(`  Domain: ${metadata.domain}`);
      console.log(`  Version: ${metadata.version}`);
      console.log(`  Description: ${metadata.description}`);
      
      if (metadata.supportedEntityTypes) {
        console.log(`  Supported Entity Types: ${metadata.supportedEntityTypes.join(', ')}`);
      }
      
      if (metadata.supportedProviders) {
        console.log(`  Supported Providers: ${metadata.supportedProviders.join(', ')}`);
      }
      
      console.log(`  Template Count: ${metadata.templateCount}`);
      
    } catch (error) {
      console.error('❌ Error getting provider info:', error.message);
      process.exit(1);
    }
  });

// Helper functions
function initializeFramework() {
  const framework = new DashboardFramework({
    apiKey: process.env.NEW_RELIC_USER_API_KEY,
    accountId: process.env.NEW_RELIC_ACCOUNT_ID
  });
  
  if (!process.env.NEW_RELIC_USER_API_KEY) {
    console.error('❌ NEW_RELIC_USER_API_KEY environment variable is required');
    process.exit(1);
  }
  
  if (!process.env.NEW_RELIC_ACCOUNT_ID) {
    console.error('❌ NEW_RELIC_ACCOUNT_ID environment variable is required');
    process.exit(1);
  }
  
  return framework;
}

function getContentProvider(providerName) {
  switch (providerName) {
    case 'message-queues':
      return new MessageQueuesContentProvider();
    default:
      throw new Error(`Unknown content provider: ${providerName}`);
  }
}

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
  
  console.log('\n📋 Examples:');
  console.log('  dashboard-framework list-templates');
  console.log('  dashboard-framework preview cluster-overview --variables \'{"provider":"kafka"}\' -o preview.html');
  console.log('  dashboard-framework create cluster-overview --name "My Cluster" --variables \'{"provider":"kafka"}\' ');
  console.log('  dashboard-framework validate topic-analysis');
  console.log('  dashboard-framework provider-info message-queues');
  console.log('');
  console.log('🔧 Framework Benefits:');
  console.log('  ✅ Generic framework works with any content domain');
  console.log('  ✅ Pluggable content providers for different use cases');
  console.log('  ✅ Template-driven dashboard generation');
  console.log('  ✅ Built-in validation and optimization');
  console.log('  ✅ Consistent API across all domains');
  
  process.exit(0);
}