/**
 * Simple Streaming Example
 * 
 * Demonstrates basic entity creation and streaming to New Relic
 */

require('dotenv').config();
const chalk = require('chalk');
const { EntityFactory } = require('../core/entities');
const DataSimulator = require('../simulation/engines/data-simulator');
const NewRelicStreamer = require('../simulation/streaming/new-relic-streamer');

async function runSimpleStreaming() {
  console.log(chalk.bold.blue('\n🚀 Simple Streaming Example'));
  console.log(chalk.gray('=' .repeat(60)));
  
  try {
    // Step 1: Create entities
    console.log(chalk.yellow('\n📋 Step 1: Creating entities...'));
    const factory = new EntityFactory();
    
    const cluster = factory.createCluster({
      name: 'simple-test-cluster',
      provider: 'kafka',
      environment: 'development',
      accountId: process.env.NEW_RELIC_ACCOUNT_ID
    });
    
    console.log(chalk.green('✅ Created cluster:'), cluster.name);
    console.log(chalk.gray(`   GUID: ${cluster.guid}`));
    
    // Step 2: Generate metrics
    console.log(chalk.yellow('\n📊 Step 2: Generating metrics...'));
    const simulator = new DataSimulator();
    simulator.updateClusterMetrics(cluster);
    
    console.log(chalk.green('✅ Generated metrics:'));
    cluster.goldenMetrics.forEach(metric => {
      console.log(chalk.gray(`   • ${metric.name}: ${metric.value} ${metric.unit || ''}`));
    });
    
    // Step 3: Stream to New Relic (dry-run)
    console.log(chalk.yellow('\n📤 Step 3: Streaming to New Relic...'));
    const streamer = new NewRelicStreamer({
      apiKey: process.env.NEW_RELIC_API_KEY,
      accountId: process.env.NEW_RELIC_ACCOUNT_ID,
      dryRun: true,
      verbose: true
    });
    
    // Stream entity with its metrics
    await streamer.streamEvents([cluster]);
    
    // Stream metrics (pass the entity directly, not as array)
    streamer.streamMetrics(cluster);
    await streamer.flushAll();
    
    // Get stats
    const stats = streamer.getStats();
    console.log(chalk.green('\n✅ Streaming complete:'));
    console.log(chalk.gray(`   • Events sent: ${stats.events.sent}`));
    console.log(chalk.gray(`   • Metrics sent: ${stats.metrics.sent}`));
    console.log(chalk.gray(`   • Errors: ${stats.events.failed + stats.metrics.failed}`));
    
    console.log(chalk.bold.green('\n✨ Example completed successfully!'));
    
  } catch (error) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    console.error(error.stack);
    process.exit(1);
  }
}

// Check for required environment variables
const required = ['NEW_RELIC_API_KEY', 'NEW_RELIC_ACCOUNT_ID'];
const missing = required.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error(chalk.red('❌ Missing required environment variables:'));
  missing.forEach(key => console.error(chalk.red(`   • ${key}`)));
  process.exit(1);
}

// Run the example
runSimpleStreaming().catch(error => {
  console.error(chalk.red(`\n❌ Fatal error: ${error.message}`));
  process.exit(1);
});