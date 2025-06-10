#!/usr/bin/env node

/**
 * Automatic Documentation Demo Tool
 * 
 * Demonstrates the automatic documentation generation features
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

function main() {
  console.log(chalk.blue.bold('\n🔄 Automatic Documentation Generation Demo\n'));
  
  console.log(chalk.cyan('📋 Overview:'));
  console.log(chalk.gray('Every time platform.js runs, it automatically generates beautiful documentation'));
  console.log(chalk.gray('showing the complete data transformation pipeline from raw NRDB to final events.\n'));
  
  // Show what gets generated
  console.log(chalk.cyan('📄 Generated Documentation:'));
  console.log(chalk.yellow('  1. CURRENT_DATA_MODEL.md') + chalk.gray(' (root directory)'));
  console.log(chalk.gray('     • Live execution summary with real entity counts'));
  console.log(chalk.gray('     • Data flow diagrams for current mode'));
  console.log(chalk.gray('     • Sample event structures with actual data'));
  console.log(chalk.gray('     • Golden metrics with real values'));
  console.log(chalk.gray('     • Entity relationships and hierarchy\n'));
  
  console.log(chalk.yellow('  2. docs/LIVE_DATA_TRANSFORMATION_PIPELINE.md'));
  console.log(chalk.gray('     • Complete transformation pipeline documentation'));
  console.log(chalk.gray('     • Raw NRDB source data (infrastructure mode)'));
  console.log(chalk.gray('     • Before/after transformation comparison'));
  console.log(chalk.gray('     • Platform configuration and execution details\n'));
  
  // Show the difference by mode
  console.log(chalk.cyan('🎭 Mode-Specific Features:'));
  
  console.log(chalk.yellow('  SIMULATION Mode:'));
  console.log(chalk.gray('    • Entity Factory → Synthetic Data Generation flow'));
  console.log(chalk.gray('    • Realistic pattern application documentation'));
  console.log(chalk.gray('    • Generated entity structures with golden metrics\n'));
  
  console.log(chalk.yellow('  INFRASTRUCTURE Mode:'));
  console.log(chalk.gray('    • Raw NRDB KafkaBrokerSample, KafkaTopicSample data'));
  console.log(chalk.gray('    • Complete transformation mappings'));
  console.log(chalk.gray('    • Before/after comparison with actual metrics'));
  console.log(chalk.gray('    • Source data validation and cleanup process\n'));
  
  console.log(chalk.yellow('  HYBRID Mode:'));
  console.log(chalk.gray('    • Combined real + synthetic data flow'));
  console.log(chalk.gray('    • Gap detection and filling documentation'));
  console.log(chalk.gray('    • Mixed entity source tracking\n'));
  
  // Show current files
  console.log(chalk.cyan('📁 Check Current Documentation:'));
  
  const currentDoc = path.join(__dirname, '..', 'CURRENT_DATA_MODEL.md');
  const liveDoc = path.join(__dirname, '..', 'docs', 'LIVE_DATA_TRANSFORMATION_PIPELINE.md');
  
  if (fs.existsSync(currentDoc)) {
    const stats = fs.statSync(currentDoc);
    console.log(chalk.green(`  ✅ CURRENT_DATA_MODEL.md (${formatSize(stats.size)}, modified ${formatTime(stats.mtime)})`));
  } else {
    console.log(chalk.red(`  ❌ CURRENT_DATA_MODEL.md (not found - run platform.js to generate)`));
  }
  
  if (fs.existsSync(liveDoc)) {
    const stats = fs.statSync(liveDoc);
    console.log(chalk.green(`  ✅ LIVE_DATA_TRANSFORMATION_PIPELINE.md (${formatSize(stats.size)}, modified ${formatTime(stats.mtime)})`));
  } else {
    console.log(chalk.red(`  ❌ LIVE_DATA_TRANSFORMATION_PIPELINE.md (not found - run platform.js to generate)`));
  }
  
  console.log('\n');
  
  // Show examples of running the platform
  console.log(chalk.cyan('🚀 Generate Documentation:'));
  console.log(chalk.green('  # Simulation mode (generates synthetic data model)'));
  console.log(chalk.green('  node platform.js --mode simulation --no-continuous'));
  console.log('');
  console.log(chalk.green('  # Infrastructure mode (shows real NRDB → MESSAGE_QUEUE transformation)'));
  console.log(chalk.green('  node platform.js --mode infrastructure --no-continuous'));
  console.log('');
  console.log(chalk.green('  # Hybrid mode (shows combined real + synthetic data)'));
  console.log(chalk.green('  node platform.js --mode hybrid --no-continuous'));
  console.log('');
  console.log(chalk.green('  # Disable automatic docs (only extract data model)'));
  console.log(chalk.green('  node platform.js --mode simulation --no-auto-docs'));
  console.log('');
  
  // Show what the documentation contains
  console.log(chalk.cyan('🔍 Documentation Contents:'));
  console.log(chalk.yellow('  Raw NRDB Data:'));
  console.log(chalk.gray('    • KafkaBrokerSample with JMX metrics'));
  console.log(chalk.gray('    • KafkaTopicSample with partition details'));
  console.log(chalk.gray('    • KafkaConsumerSample with lag metrics\n'));
  
  console.log(chalk.yellow('  Transformation Process:'));
  console.log(chalk.gray('    • Data validation and cleanup'));
  console.log(chalk.gray('    • Metric mapping and aggregation'));
  console.log(chalk.gray('    • GUID generation with standard patterns'));
  console.log(chalk.gray('    • Relationship building and hierarchy\n'));
  
  console.log(chalk.yellow('  Final MESSAGE_QUEUE Events:'));
  console.log(chalk.gray('    • MESSAGE_QUEUE_BROKER with golden metrics'));
  console.log(chalk.gray('    • MESSAGE_QUEUE_TOPIC with throughput data'));
  console.log(chalk.gray('    • MESSAGE_QUEUE_CONSUMER with lag analysis'));
  console.log(chalk.gray('    • MESSAGE_QUEUE_CLUSTER with health scores\n'));
  
  console.log(chalk.blue('📖 For static reference documentation, see:'));
  console.log(chalk.gray('  • /docs/DATA_MODEL.md - Static data model reference'));
  console.log(chalk.gray('  • /docs/DATA_TRANSFORMATION_PIPELINE.md - Detailed transformation guide'));
  console.log(chalk.gray('  • /core/data-models/stream-data-model.js - Programmatic model'));
  console.log(chalk.gray('  • /tools/show-data-model.js - Interactive reference tool\n'));
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
  return Math.round(bytes / 1048576) + ' MB';
}

function formatTime(date) {
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.round(diff / 60000) + ' min ago';
  if (diff < 86400000) return Math.round(diff / 3600000) + ' hr ago';
  return Math.round(diff / 86400000) + ' days ago';
}

if (require.main === module) {
  main();
}

module.exports = { main };