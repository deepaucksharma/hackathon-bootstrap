#!/usr/bin/env node

/**
 * Test Infrastructure Mode Integration
 * 
 * This script tests the infrastructure mode functionality by:
 * 1. Connecting to New Relic and collecting nri-kafka data
 * 2. Transforming it to MESSAGE_QUEUE entities
 * 3. Streaming the transformed data
 */

const chalk = require('chalk');
const MessageQueuesPlatform = require('./platform');

// Configuration
const config = {
  mode: 'infrastructure',
  accountId: process.env.NEW_RELIC_ACCOUNT_ID,
  apiKey: process.env.NEW_RELIC_USER_API_KEY,
  ingestKey: process.env.NEW_RELIC_INGEST_KEY,
  dryRun: process.argv.includes('--dry-run'),
  infrastructure: {
    interval: 30000 // 30 seconds for testing
  },
  api: {
    enabled: false // No API for this test
  }
};

async function testInfrastructureMode() {
  console.log(chalk.bold.magenta('\n🧪 Testing Infrastructure Mode Integration\n'));
  
  // Validate configuration
  if (!config.accountId || !config.apiKey) {
    console.log(chalk.red('❌ Missing required environment variables:'));
    console.log(chalk.gray('   NEW_RELIC_ACCOUNT_ID=<your-account-id>'));
    console.log(chalk.gray('   NEW_RELIC_USER_API_KEY=<your-user-api-key>'));
    console.log(chalk.gray('   NEW_RELIC_INGEST_KEY=<your-ingest-key> (optional, uses API key)'));
    process.exit(1);
  }
  
  console.log(chalk.cyan('Configuration:'));
  console.log(chalk.gray(`  Account ID: ${config.accountId}`));
  console.log(chalk.gray(`  API Key: ${config.apiKey?.substring(0, 8)}...`));
  console.log(chalk.gray(`  Dry Run: ${config.dryRun ? 'Yes' : 'No'}`));
  console.log('');
  
  // Create platform instance
  const platform = new MessageQueuesPlatform(config);
  
  // Listen for events
  platform.on('infrastructure.updated', (data) => {
    console.log(chalk.green(`✅ Infrastructure update: ${data.entities} entities, ${data.events} events, ${data.metrics} metrics`));
  });
  
  platform.on('error', (error) => {
    console.error(chalk.red('❌ Platform error:'), error.message);
  });
  
  // Test manual collection first
  console.log(chalk.cyan('🔍 Testing manual data collection...\n'));
  
  try {
    // Test infrastructure collector directly
    const infraCollector = platform.infraCollector;
    const nriTransformer = platform.nriTransformer;
    
    // Check for Kafka integration
    console.log(chalk.gray('Checking for nri-kafka integration...'));
    const hasData = await infraCollector.checkKafkaIntegration();
    
    if (!hasData) {
      console.log(chalk.yellow('\n⚠️  No nri-kafka data found in New Relic.'));
      console.log(chalk.gray('Make sure:'));
      console.log(chalk.gray('1. nri-kafka is installed and configured'));
      console.log(chalk.gray('2. Kafka is running and accessible'));
      console.log(chalk.gray('3. Data has been flowing for at least 5 minutes'));
      console.log(chalk.gray('4. The minikube setup is deployed and running'));
      console.log(chalk.gray('\nSee the minikube-consolidated/ directory for setup instructions.\n'));
      return;
    }
    
    // Get clusters
    console.log(chalk.gray('Getting Kafka clusters...'));
    const clusters = await infraCollector.getKafkaClusters();
    console.log(chalk.green(`✅ Found ${clusters.length} clusters:`));
    clusters.forEach(cluster => {
      console.log(chalk.gray(`   - ${cluster.clusterName} (${cluster.brokerCount} brokers)`));
    });
    
    // Collect sample data
    console.log(chalk.gray('\nCollecting Kafka metrics...'));
    const samples = await infraCollector.collectKafkaMetrics('10 minutes ago');
    console.log(chalk.green(`✅ Collected ${samples.length} samples:`));
    
    // Show sample breakdown
    const sampleTypes = samples.reduce((acc, sample) => {
      acc[sample.eventType] = (acc[sample.eventType] || 0) + 1;
      return acc;
    }, {});
    
    Object.entries(sampleTypes).forEach(([type, count]) => {
      console.log(chalk.gray(`   - ${type}: ${count} samples`));
    });
    
    if (samples.length === 0) {
      console.log(chalk.yellow('\n⚠️  No recent samples found. Make sure Kafka is actively processing messages.'));
      return;
    }
    
    // Transform samples
    console.log(chalk.gray('\nTransforming samples to MESSAGE_QUEUE entities...'));
    const entities = nriTransformer.transformSamples(samples);
    console.log(chalk.green(`✅ Created ${entities.length} entities:`));
    
    // Show entity breakdown
    const entityTypes = entities.reduce((acc, entity) => {
      acc[entity.entityType] = (acc[entity.entityType] || 0) + 1;
      return acc;
    }, {});
    
    Object.entries(entityTypes).forEach(([type, count]) => {
      console.log(chalk.gray(`   - ${type}: ${count} entities`));
    });
    
    // Show sample entity details
    if (entities.length > 0) {
      console.log(chalk.gray('\nSample entity details:'));
      const sampleEntity = entities[0];
      console.log(chalk.gray(`   Type: ${sampleEntity.entityType}`));
      console.log(chalk.gray(`   GUID: ${sampleEntity.entityGuid}`));
      console.log(chalk.gray(`   Name: ${sampleEntity.displayName}`));
      console.log(chalk.gray(`   Provider: ${sampleEntity.provider}`));
      console.log(chalk.gray(`   Metrics: ${Object.keys(sampleEntity.metrics || {}).length} metrics`));
      
      if (sampleEntity.metrics) {
        const metricSample = Object.entries(sampleEntity.metrics).slice(0, 3);
        metricSample.forEach(([name, value]) => {
          console.log(chalk.gray(`     - ${name}: ${value}`));
        });
      }
    }
    
    console.log(chalk.green('\n✅ Manual data collection test passed!\n'));
    
    // Test platform streaming
    console.log(chalk.cyan('🚀 Testing platform streaming mode...\n'));
    
    // Start platform
    await platform.start();
    
    // Let it run for a few cycles
    console.log(chalk.gray('Running for 3 collection cycles...\n'));
    
    let updateCount = 0;
    const maxUpdates = 3;
    
    const updatePromise = new Promise((resolve) => {
      platform.on('infrastructure.updated', () => {
        updateCount++;
        if (updateCount >= maxUpdates) {
          resolve();
        }
      });
    });
    
    // Wait for updates or timeout
    const timeout = new Promise((resolve) => {
      setTimeout(resolve, 180000); // 3 minutes timeout
    });
    
    await Promise.race([updatePromise, timeout]);
    
    if (updateCount >= maxUpdates) {
      console.log(chalk.green(`\n✅ Platform streaming test completed (${updateCount} updates)`));
    } else {
      console.log(chalk.yellow(`\n⚠️  Platform streaming test incomplete (${updateCount}/${maxUpdates} updates)`));
    }
    
    // Show final state
    const state = platform.getState();
    console.log(chalk.cyan('\nFinal platform state:'));
    console.log(chalk.gray(`  Mode: ${state.mode}`));
    console.log(chalk.gray(`  Running: ${state.running}`));
    console.log(chalk.gray(`  Infrastructure entities: ${state.infrastructure.entities}`));
    console.log(chalk.gray(`  Dry run: ${state.dryRun}`));
    
    // Stop platform
    await platform.stop();
    
    console.log(chalk.green('\n✅ Infrastructure mode test completed successfully!\n'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Test failed:'), error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Test interrupted');
  process.exit(0);
});

// Run test
testInfrastructureMode().catch(error => {
  console.error(chalk.red('Test error:'), error.message);
  process.exit(1);
});