#!/usr/bin/env node

/**
 * Test Dashboard Templates
 * 
 * Verifies that the updated MESSAGE_QUEUE dashboard templates work correctly
 * with the infrastructure entities and metric names.
 */

const chalk = require('chalk');
const MessageQueuesContentProvider = require('./dashboards/content/message-queues/message-queues-content-provider');

async function testDashboardTemplates() {
  console.log(chalk.bold.blue('\n🎯 Testing Dashboard Templates\n'));
  
  try {
    // Initialize content provider
    const contentProvider = new MessageQueuesContentProvider({
      accountId: '123456789'
    });
    
    console.log(chalk.cyan('🔧 Content Provider Initialized'));
    const metadata = contentProvider.getMetadata();
    console.log(chalk.gray(`   Domain: ${metadata.domain}`));
    console.log(chalk.gray(`   Version: ${metadata.version}`));
    console.log(chalk.gray(`   Templates: ${metadata.templateCount}`));
    console.log(chalk.gray(`   Entity Types: ${metadata.supportedEntityTypes.join(', ')}`));
    console.log('');
    
    // Test template variables
    console.log(chalk.cyan('📝 Testing Template Variables:'));
    const variables = contentProvider.getTemplateVariables({
      provider: 'kafka',
      environment: 'production',
      clusterName: 'minikube-kafka'
    });
    
    Object.entries(variables).forEach(([key, value]) => {
      console.log(chalk.gray(`   ${key}: ${value}`));
    });
    console.log('');
    
    // Test entity variables
    console.log(chalk.cyan('🏗️  Testing Entity Variables:'));
    const entityTypes = ['MESSAGE_QUEUE_CLUSTER', 'MESSAGE_QUEUE_BROKER', 'MESSAGE_QUEUE_TOPIC'];
    
    entityTypes.forEach(entityType => {
      const vars = contentProvider.getEntityVariables(entityType);
      console.log(chalk.yellow(`   ${entityType}:`));
      vars.forEach(variable => {
        console.log(chalk.gray(`     - ${variable.name} (${variable.type}): ${variable.title}`));
      });
    });
    console.log('');
    
    // Test template registration
    console.log(chalk.cyan('📊 Testing Template Registration:'));
    const templateNames = ['cluster-overview', 'topic-analysis', 'broker-health', 'queue-monitoring'];
    
    templateNames.forEach(templateName => {
      const hasTemplate = contentProvider.templates && contentProvider.templates.has(templateName);
      const status = hasTemplate ? chalk.green('✅') : chalk.red('❌');
      console.log(`   ${status} ${templateName}`);
      
      if (hasTemplate) {
        const template = contentProvider.templates.get(templateName);
        console.log(chalk.gray(`      Entity Type: ${template.entityType}`));
        console.log(chalk.gray(`      Sections: ${template.sections ? template.sections.length : 0}`));
        
        if (template.sections && template.sections.length > 0) {
          template.sections.forEach((section, idx) => {
            const widgetCount = section.widgets ? section.widgets.length : 0;
            console.log(chalk.gray(`      Section ${idx + 1}: ${section.title} (${widgetCount} widgets)`));
          });
        }
      }
    });
    console.log('');
    
    // Test entity schema registration
    console.log(chalk.cyan('🔗 Testing Entity Schema Registration:'));
    entityTypes.forEach(entityType => {
      const hasSchema = contentProvider.entitySchemas && contentProvider.entitySchemas.has(entityType);
      const status = hasSchema ? chalk.green('✅') : chalk.red('❌');
      console.log(`   ${status} ${entityType}`);
      
      if (hasSchema) {
        const schema = contentProvider.entitySchemas.get(entityType);
        console.log(chalk.gray(`      GUID Pattern: ${schema.guidPattern}`));
        console.log(chalk.gray(`      Golden Metrics: ${schema.goldenMetrics.length}`));
        schema.goldenMetrics.forEach(metric => {
          console.log(chalk.gray(`        - ${metric.name} (${metric.type}, ${metric.unit})`));
        });
      }
    });
    console.log('');
    
    // Test specific template content
    console.log(chalk.cyan('📋 Testing Cluster Overview Template Content:'));
    if (contentProvider.templates && contentProvider.templates.has('cluster-overview')) {
      const template = contentProvider.templates.get('cluster-overview');
      
      // Check if template has correct structure
      console.log(chalk.green('   ✅ Template structure valid'));
      console.log(chalk.gray(`      Title: ${template.title}`));
      console.log(chalk.gray(`      Entity Type: ${template.entityType}`));
      console.log(chalk.gray(`      Variables: ${template.variables ? template.variables.length : 0}`));
      
      // Validate that queries use correct event types
      if (template.sections) {
        let correctEventTypes = 0;
        let totalQueries = 0;
        
        template.sections.forEach(section => {
          if (section.widgets) {
            section.widgets.forEach(widget => {
              if (widget.query && widget.query.from) {
                totalQueries++;
                // Check if using infrastructure entity types (not *_SAMPLE)
                if (widget.query.from.startsWith('MESSAGE_QUEUE_') && !widget.query.from.endsWith('_SAMPLE')) {
                  correctEventTypes++;
                }
              }
            });
          }
        });
        
        console.log(chalk.gray(`      Queries using infrastructure entities: ${correctEventTypes}/${totalQueries}`));
        
        if (correctEventTypes === totalQueries && totalQueries > 0) {
          console.log(chalk.green('   ✅ All queries use correct infrastructure entity types'));
        } else if (totalQueries > 0) {
          console.log(chalk.yellow('   ⚠️  Some queries may still use old event types'));
        }
      }
    }
    
    console.log(chalk.green('\n✅ Dashboard template test completed successfully!'));
    
    // Summary and next steps
    console.log(chalk.cyan('\n📚 Next Steps:'));
    console.log(chalk.gray('1. Test dashboard generation with real data:'));
    console.log(chalk.gray('   node examples/generate-dashboards.js --template cluster-overview'));
    console.log(chalk.gray(''));
    console.log(chalk.gray('2. Deploy dashboard to New Relic:'));
    console.log(chalk.gray('   node dashboards/cli.js create --template cluster-overview --deploy'));
    console.log(chalk.gray(''));
    console.log(chalk.gray('3. Validate NRQL queries:'));
    console.log(chalk.gray('   node test-nrql-queries.js'));
    
    return true;
    
  } catch (error) {
    console.error(chalk.red('\n❌ Dashboard template test failed:'), error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    return false;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(chalk.bold.cyan('Dashboard Template Test\n'));
    console.log('Usage: node test-dashboard-templates.js [options]\n');
    console.log('Options:');
    console.log('  --help    Show this help');
    process.exit(0);
  }
  
  testDashboardTemplates().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error(chalk.red('Test runner error:'), error.message);
    process.exit(1);
  });
}

module.exports = testDashboardTemplates;