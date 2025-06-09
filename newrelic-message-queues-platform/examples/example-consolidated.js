#!/usr/bin/env node

/**
 * Consolidated Platform Example
 * 
 * Demonstrates the working platform with all integrated features:
 * - Entity creation and management
 * - Enhanced simulation with patterns
 * - Pattern-based metric generation
 * - Anomaly injection
 * - Streaming to New Relic (dry-run)
 */

const chalk = require('chalk');
const MessageQueuesPlatform = require('../platform');

async function runExample() {
  console.log(chalk.bold.magenta('\n🚀 New Relic Message Queues Platform - Consolidated Example\n'));
  console.log(chalk.gray('This example demonstrates all working features of the platform\n'));

  // Create platform instance with enhanced features
  const platform = new MessageQueuesPlatform({
    dryRun: true,           // Don't require credentials
    streaming: {
      interval: 10000,      // Stream every 10 seconds
      enabled: true
    },
    api: {
      enabled: false        // Don't start API server for this example
    }
  });

  // Listen to platform events
  platform.on('topology.created', (data) => {
    console.log(chalk.green('\n✅ Topology Created:'));
    console.log(chalk.gray(`   - Provider: ${data.provider}`));
    console.log(chalk.gray(`   - Clusters: ${data.entities.clusters}`));
    console.log(chalk.gray(`   - Brokers: ${data.entities.brokers}`));
    console.log(chalk.gray(`   - Topics: ${data.entities.topics}`));
  });

  platform.on('metrics.updated', (data) => {
    console.log(chalk.blue('\n📊 Metrics Updated:'));
    console.log(chalk.gray(`   - Timestamp: ${new Date(data.timestamp).toLocaleTimeString()}`));
    console.log(chalk.gray(`   - Events: ${data.events}`));
    console.log(chalk.gray(`   - Metrics: ${data.metrics}`));
  });

  platform.on('anomaly.detected', (data) => {
    console.log(chalk.yellow('\n⚠️  Anomaly Detected:'));
    console.log(chalk.gray(`   - Entity: ${data.entity}`));
    console.log(chalk.gray(`   - Count: ${data.anomalies.length}`));
    data.anomalies.forEach(anomaly => {
      console.log(chalk.gray(`   - ${anomaly.metric}: ${anomaly.severity} (${anomaly.value.toFixed(2)})`));
    });
  });

  platform.on('anomaly.injected', (data) => {
    console.log(chalk.red('\n💥 Anomaly Injected:'));
    console.log(chalk.gray(`   - Type: ${data.type}`));
    console.log(chalk.gray(`   - Severity: ${data.severity}`));
    console.log(chalk.gray(`   - Target: ${data.targetEntity}`));
    console.log(chalk.gray(`   - Affected: ${data.affectedEntities} entities`));
  });

  try {
    // Step 1: Create topology
    console.log(chalk.cyan('\n1️⃣  Creating Kafka topology...'));
    await platform.createTopology('kafka', 'medium');

    // Step 2: Start platform
    console.log(chalk.cyan('\n2️⃣  Starting platform...'));
    await platform.start();

    // Show current state
    const state = platform.getState();
    console.log(chalk.cyan('\n3️⃣  Platform State:'));
    console.log(chalk.gray(`   - Dry Run: ${state.dryRun}`));
    console.log(chalk.gray(`   - Streaming: ${state.running ? 'Active' : 'Inactive'}`));

    // Step 3: Demonstrate anomaly injection
    console.log(chalk.cyan('\n4️⃣  Injecting anomaly cascade...'));
    setTimeout(async () => {
      await platform.injectAnomaly('resource_exhaustion', 'severe', 30000);
    }, 5000);

    // Step 4: Show sample metrics
    setTimeout(() => {
      const metrics = platform.state.metrics;
      console.log(chalk.cyan('\n5️⃣  Current Metrics Summary:'));
      Object.entries(metrics).slice(0, 5).forEach(([key, data]) => {
        console.log(chalk.gray(`   - ${key}: ${data.avg.toFixed(2)} (avg)`));
      });
    }, 15000);

    // Step 5: Show pattern information
    setTimeout(() => {
      console.log(chalk.cyan('\n6️⃣  Active Patterns:'));
      console.log(chalk.gray(`   - Business Hours: Active`));
      console.log(chalk.gray(`   - Provider Patterns: ${state.patterns} loaded`));
      console.log(chalk.gray(`   - Anomaly Detection: Enabled`));
    }, 20000);

    // Run for 30 seconds then stop
    console.log(chalk.gray('\n\nExample will run for 30 seconds...'));
    console.log(chalk.gray('Press Ctrl+C to stop earlier\n'));

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n');
      await platform.stop();
      process.exit(0);
    });

    // Auto-stop after 30 seconds
    setTimeout(async () => {
      console.log(chalk.cyan('\n7️⃣  Stopping platform...'));
      await platform.stop();
      
      // Final summary
      console.log(chalk.bold.green('\n✅ Example Complete!\n'));
      console.log(chalk.gray('What we demonstrated:'));
      console.log(chalk.gray('  - Entity creation with relationships'));
      console.log(chalk.gray('  - Enhanced simulation with patterns'));
      console.log(chalk.gray('  - Real-time metric generation'));
      console.log(chalk.gray('  - Anomaly cascade injection'));
      console.log(chalk.gray('  - Pattern-based generation'));
      console.log(chalk.gray('  - Dry-run streaming (no credentials needed)'));
      
      console.log(chalk.yellow('\nNext Steps:'));
      console.log(chalk.gray('1. Set NEW_RELIC_ACCOUNT_ID and NEW_RELIC_API_KEY'));
      console.log(chalk.gray('2. Run with dryRun: false to stream real data'));
      console.log(chalk.gray('3. Enable API server for web UI control'));
      console.log(chalk.gray('4. Try other examples in the examples/ directory'));
      
      process.exit(0);
    }, 30000);

  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error.message);
    process.exit(1);
  }
}

// Run the example
runExample().catch(console.error);