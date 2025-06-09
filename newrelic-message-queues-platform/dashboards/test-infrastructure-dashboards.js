#!/usr/bin/env node

/**
 * Test Infrastructure Dashboard Templates
 * 
 * Validates that infrastructure-specific dashboard templates work correctly
 * with MESSAGE_QUEUE entities created from nri-kafka data.
 */

const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');

// Dashboard template paths
const TEMPLATE_DIR = path.join(__dirname, 'templates', 'infrastructure');
const TEMPLATES = [
  'kafka-infrastructure-overview.json',
  'kafka-broker-details.json',
  'kafka-topic-analysis.json'
];

// Validate NRQL queries in a dashboard template
function validateNrqlQueries(template) {
  const errors = [];
  const warnings = [];
  
  // Check each page and widget
  template.pages?.forEach((page, pageIndex) => {
    page.widgets?.forEach((widget, widgetIndex) => {
      const query = widget.config?.nrqlQuery;
      if (!query) {
        errors.push(`Page ${pageIndex + 1}, Widget ${widgetIndex + 1}: Missing NRQL query`);
        return;
      }
      
      // Validate query structure
      if (!query.includes('FROM MessageQueue')) {
        errors.push(`Page ${pageIndex + 1}, Widget ${widgetIndex + 1}: Query should use MessageQueue event type`);
      }
      
      // Check for infrastructure entity types
      const validEntityTypes = ['MESSAGE_QUEUE_CLUSTER', 'MESSAGE_QUEUE_BROKER', 'MESSAGE_QUEUE_TOPIC'];
      const hasValidEntityType = validEntityTypes.some(type => query.includes(type));
      if (!hasValidEntityType && query.includes('entityType')) {
        warnings.push(`Page ${pageIndex + 1}, Widget ${widgetIndex + 1}: Query might not filter by correct entity type`);
      }
      
      // Check for provider filter
      if (!query.includes("provider = 'kafka'")) {
        warnings.push(`Page ${pageIndex + 1}, Widget ${widgetIndex + 1}: Consider filtering by provider = 'kafka'`);
      }
      
      // Validate metric names match our schema
      const infrastructureMetrics = [
        'cluster.health.score',
        'cluster.brokerCount',
        'cluster.messagesInPerSecond',
        'cluster.bytesInPerSecond',
        'broker.cpu.usage',
        'broker.memory.usage',
        'broker.disk.usage',
        'broker.messagesInPerSecond',
        'broker.bytesInPerSecond',
        'broker.requestHandlerIdlePercent',
        'broker.underReplicatedPartitions',
        'topic.messagesInPerSecond',
        'topic.bytesInPerSecond',
        'topic.partitions.count',
        'topic.replicationFactor',
        'topic.sizeBytes'
      ];
      
      // Check if query uses valid metrics
      const usedMetrics = infrastructureMetrics.filter(metric => query.includes(metric));
      if (usedMetrics.length === 0 && !query.includes('uniqueCount') && !query.includes('uniques')) {
        warnings.push(`Page ${pageIndex + 1}, Widget ${widgetIndex + 1}: No recognized infrastructure metrics found`);
      }
    });
  });
  
  // Check variables
  template.variables?.forEach((variable, index) => {
    if (!variable.query) {
      errors.push(`Variable ${index + 1}: Missing query`);
    } else if (!variable.query.includes('FROM MessageQueue')) {
      errors.push(`Variable ${index + 1}: Should query MessageQueue events`);
    }
  });
  
  return { errors, warnings };
}

// Test a single dashboard template
async function testDashboardTemplate(templatePath) {
  const templateName = path.basename(templatePath);
  console.log(chalk.cyan(`\n📊 Testing ${templateName}`));
  
  try {
    // Read and parse template
    const content = await fs.readFile(templatePath, 'utf8');
    const template = JSON.parse(content);
    
    // Basic structure validation
    if (!template.name) {
      throw new Error('Missing dashboard name');
    }
    if (!template.pages || template.pages.length === 0) {
      throw new Error('Dashboard must have at least one page');
    }
    
    console.log(chalk.gray(`  Dashboard: ${template.name}`));
    console.log(chalk.gray(`  Pages: ${template.pages.length}`));
    
    // Count widgets
    const totalWidgets = template.pages.reduce((sum, page) => sum + (page.widgets?.length || 0), 0);
    console.log(chalk.gray(`  Total widgets: ${totalWidgets}`));
    
    // Validate NRQL queries
    const { errors, warnings } = validateNrqlQueries(template);
    
    if (errors.length === 0) {
      console.log(chalk.green('  ✓ All NRQL queries valid'));
    } else {
      console.log(chalk.red(`  ✗ ${errors.length} errors found:`));
      errors.forEach(error => console.log(chalk.red(`    - ${error}`)));
    }
    
    if (warnings.length > 0) {
      console.log(chalk.yellow(`  ⚠️  ${warnings.length} warnings:`));
      warnings.forEach(warning => console.log(chalk.yellow(`    - ${warning}`)));
    }
    
    // Check for infrastructure-specific features
    const features = {
      hasVariables: template.variables && template.variables.length > 0,
      hasThresholds: JSON.stringify(template).includes('thresholds'),
      hasTimeseries: JSON.stringify(template).includes('TIMESERIES'),
      hasFacets: JSON.stringify(template).includes('FACET'),
      hasMultiplePages: template.pages.length > 1
    };
    
    console.log(chalk.gray('  Features:'));
    Object.entries(features).forEach(([feature, hasFeature]) => {
      console.log(chalk.gray(`    - ${feature}: ${hasFeature ? '✓' : '✗'}`));
    });
    
    return {
      name: templateName,
      success: errors.length === 0,
      errors: errors.length,
      warnings: warnings.length,
      widgets: totalWidgets,
      features
    };
    
  } catch (error) {
    console.log(chalk.red(`  ✗ Failed to test template: ${error.message}`));
    return {
      name: templateName,
      success: false,
      error: error.message
    };
  }
}

// Generate sample widget from template
function generateSampleWidget(widgetConfig) {
  const { title, visualization, config } = widgetConfig;
  
  console.log(chalk.gray(`\n    Widget: ${title}`));
  console.log(chalk.gray(`    Type: ${visualization}`));
  console.log(chalk.gray(`    Query preview:`));
  console.log(chalk.cyan(`      ${config.nrqlQuery.substring(0, 100)}...`));
}

// Main test runner
async function runTests() {
  console.log(chalk.blue('🧪 Infrastructure Dashboard Template Validation\n'));
  
  const results = [];
  
  // Test each template
  for (const templateFile of TEMPLATES) {
    const templatePath = path.join(TEMPLATE_DIR, templateFile);
    const result = await testDashboardTemplate(templatePath);
    results.push(result);
  }
  
  // Summary
  console.log(chalk.blue('\n📊 Test Summary'));
  console.log(chalk.gray('─'.repeat(60)));
  
  const successCount = results.filter(r => r.success).length;
  const totalErrors = results.reduce((sum, r) => sum + (r.errors || 0), 0);
  const totalWarnings = results.reduce((sum, r) => sum + (r.warnings || 0), 0);
  
  console.log(chalk.green(`✓ Successful templates: ${successCount}/${results.length}`));
  if (totalErrors > 0) {
    console.log(chalk.red(`✗ Total errors: ${totalErrors}`));
  }
  if (totalWarnings > 0) {
    console.log(chalk.yellow(`⚠️  Total warnings: ${totalWarnings}`));
  }
  
  // Show sample queries
  console.log(chalk.blue('\n📝 Sample NRQL Queries for Infrastructure Mode:'));
  
  const sampleQueries = [
    {
      title: 'Cluster Health Score',
      query: `FROM MessageQueue SELECT latest(cluster.health.score) WHERE entityType = 'MESSAGE_QUEUE_CLUSTER' AND provider = 'kafka' FACET clusterName`
    },
    {
      title: 'Broker CPU Usage',
      query: `FROM MessageQueue SELECT average(broker.cpu.usage) WHERE entityType = 'MESSAGE_QUEUE_BROKER' AND provider = 'kafka' FACET displayName TIMESERIES`
    },
    {
      title: 'Topic Message Rate',
      query: `FROM MessageQueue SELECT rate(sum(topic.messagesInPerSecond), 1 second) WHERE entityType = 'MESSAGE_QUEUE_TOPIC' AND provider = 'kafka' FACET topicName LIMIT 10`
    }
  ];
  
  sampleQueries.forEach(({ title, query }) => {
    console.log(chalk.cyan(`\n${title}:`));
    console.log(chalk.gray(query));
  });
  
  // Usage instructions
  console.log(chalk.blue('\n🚀 Next Steps:'));
  console.log(chalk.gray('1. Start infrastructure mode to collect real data:'));
  console.log(chalk.cyan('   node platform.js --mode infrastructure'));
  console.log(chalk.gray('2. Deploy dashboards using the framework:'));
  console.log(chalk.cyan('   node dashboards/cli.js create --template kafka-infrastructure-overview'));
  console.log(chalk.gray('3. View dashboards in New Relic One'));
  
  console.log(chalk.blue('\n✅ Infrastructure dashboard validation complete!\n'));
}

// Run tests if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { validateNrqlQueries, testDashboardTemplate };