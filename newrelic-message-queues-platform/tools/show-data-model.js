#!/usr/bin/env node

/**
 * Data Model Demonstration Tool
 * 
 * Shows the exact data structure streamed by the platform
 */

const chalk = require('chalk');
const StreamDataModel = require('../core/data-models/stream-data-model');

function main() {
  console.log(chalk.blue.bold('\n🔍 New Relic Message Queues Platform - Data Model Reference\n'));
  
  const dataModel = new StreamDataModel();
  
  // Show overview
  console.log(chalk.cyan('📋 Overview:'));
  console.log(chalk.gray('The platform streams standardized MESSAGE_QUEUE_* events to New Relic'));
  console.log(chalk.gray('Each entity type has a specific structure with golden metrics and metadata\n'));
  
  // Show GUID formats
  console.log(chalk.cyan('🆔 Entity GUID Formats:'));
  const guidFormats = dataModel.getGuidFormats();
  Object.entries(guidFormats.examples).forEach(([type, example]) => {
    const entityType = type.toUpperCase();
    console.log(chalk.yellow(`  MESSAGE_QUEUE_${entityType}:`));
    console.log(chalk.gray(`    ${example}\n`));
  });
  
  // Show golden metrics for each entity type  
  console.log(chalk.cyan('📊 Golden Metrics by Entity Type:'));
  const goldenMetrics = dataModel.getGoldenMetricsReference();
  Object.entries(goldenMetrics).forEach(([entityType, metrics]) => {
    console.log(chalk.yellow(`\n  ${entityType}:`));
    metrics.forEach(metric => {
      console.log(chalk.gray(`    • ${metric.name} (${metric.unit}): ${metric.description}`));
    });
  });
  
  // Show streaming patterns
  console.log(chalk.cyan('\n🚀 Streaming Patterns by Mode:'));
  const patterns = dataModel.getStreamingPatterns();
  Object.entries(patterns).forEach(([mode, info]) => {
    console.log(chalk.yellow(`\n  ${mode.toUpperCase()} Mode:`));
    console.log(chalk.gray(`    Description: ${info.description}`));
    console.log(chalk.gray(`    Entities: ${info.entities.join(', ')}`));
    console.log(chalk.gray(`    Frequency: ${info.frequency}`));
    console.log(chalk.gray(`    Data Source: ${info.dataSource}`));
    console.log(chalk.gray(`    Typical Events: ${info.eventCount}`));
  });
  
  // Show sample event structures
  console.log(chalk.cyan('\n📨 Sample Event Structures:'));
  
  console.log(chalk.yellow('\n  MESSAGE_QUEUE_BROKER Event:'));
  const brokerEvent = dataModel.getBrokerEventModel();
  displayEventSample(brokerEvent);
  
  console.log(chalk.yellow('\n  MESSAGE_QUEUE_TOPIC Event:'));
  const topicEvent = dataModel.getTopicEventModel();
  displayEventSample(topicEvent);
  
  console.log(chalk.yellow('\n  MESSAGE_QUEUE_CONSUMER Event:'));
  const consumerEvent = dataModel.getConsumerEventModel();
  displayEventSample(consumerEvent);
  
  console.log(chalk.yellow('\n  MESSAGE_QUEUE_CLUSTER Event:'));
  const clusterEvent = dataModel.getClusterEventModel();
  displayEventSample(clusterEvent);
  
  // Show how to run with data model display
  console.log(chalk.cyan('\n🛠️  How to View Live Data Model:'));
  console.log(chalk.gray('Run the platform with data model visualization:'));
  console.log(chalk.green('  node platform.js --mode simulation --show-data-model'));
  console.log(chalk.green('  node platform.js --mode infrastructure --show-data-model'));
  console.log(chalk.green('  node platform.js --mode simulation --save-data-model ./my-data-model.json'));
  
  console.log(chalk.blue('\n📚 For complete documentation, see:'));
  console.log(chalk.gray('  • /docs/TECHNICAL_SPECIFICATION.md'));
  console.log(chalk.gray('  • /core/data-models/stream-data-model.js'));
  console.log(chalk.gray('  • /core/entities/ (entity definitions)\n'));
}

function displayEventSample(event, maxFields = 15) {
  console.log(chalk.gray('    {'));
  
  const fields = Object.keys(event);
  const displayFields = fields.slice(0, maxFields);
  
  displayFields.forEach((key, index) => {
    const value = event[key];
    const formattedValue = typeof value === 'string' ? `"${value}"` : value;
    const comma = index < displayFields.length - 1 ? ',' : '';
    
    if (key.startsWith('tag.')) {
      console.log(chalk.gray(`      ${key}: ${formattedValue}${comma} // Tag`));
    } else if (typeof value === 'number' && !['timestamp', 'accountId'].includes(key)) {
      console.log(chalk.gray(`      ${key}: ${formattedValue}${comma} // Golden metric`));
    } else {
      console.log(chalk.gray(`      ${key}: ${formattedValue}${comma}`));
    }
  });
  
  if (fields.length > maxFields) {
    console.log(chalk.gray(`      // ... ${fields.length - maxFields} more fields`));
  }
  
  console.log(chalk.gray('    }'));
}

if (require.main === module) {
  main();
}

module.exports = { main };