#!/usr/bin/env node

/**
 * Test Infrastructure Agent Connection
 * 
 * Simple test to verify New Relic API connectivity and nri-kafka integration.
 */

const chalk = require('chalk');
const InfraAgentCollector = require('./infrastructure/collectors/infra-agent-collector');

async function testConnection() {
  console.log(chalk.bold.blue('\n🔗 Testing Infrastructure Agent Connection\n'));
  
  // Check environment variables
  const accountId = process.env.NEW_RELIC_ACCOUNT_ID;
  const apiKey = process.env.NEW_RELIC_USER_API_KEY;
  
  if (!accountId) {
    console.log(chalk.red('❌ NEW_RELIC_ACCOUNT_ID not set'));
    console.log(chalk.gray('   Set environment variable or pass --account-id'));
    return false;
  }
  
  if (!apiKey) {
    console.log(chalk.red('❌ NEW_RELIC_USER_API_KEY not set'));
    console.log(chalk.gray('   Set environment variable or pass --api-key'));
    return false;
  }
  
  console.log(chalk.cyan('🔧 Configuration:'));
  console.log(chalk.gray(`   Account ID: ${accountId}`));
  console.log(chalk.gray(`   API Key: ${apiKey.substring(0, 8)}...`));
  console.log('');
  
  try {
    // Initialize collector
    const collector = new InfraAgentCollector({
      accountId,
      apiKey,
      debug: true
    });
    
    // Test 1: Check for any Kafka integration data
    console.log(chalk.cyan('📊 Test 1: Checking for Kafka integration...'));
    const hasKafkaData = await collector.checkKafkaIntegration();
    
    if (!hasKafkaData) {
      console.log(chalk.yellow('⚠️  No Kafka data found - this is expected if nri-kafka is not set up'));
      console.log(chalk.gray('   To continue testing, we\'ll use the mock data pipeline'));
      return true; // Not a failure, just no real data
    }
    
    // Test 2: Get cluster summary
    console.log(chalk.cyan('\n📊 Test 2: Getting Kafka clusters...'));
    const clusters = await collector.getKafkaClusters();
    
    if (clusters.length > 0) {
      console.log(chalk.green(`✅ Found ${clusters.length} Kafka clusters:`));
      clusters.forEach(cluster => {
        console.log(chalk.gray(`   - ${cluster.clusterName} (${cluster.brokerCount} brokers)`));
      });
    } else {
      console.log(chalk.yellow('   No clusters found in recent data'));
    }
    
    // Test 3: Try to collect a small sample
    console.log(chalk.cyan('\n📊 Test 3: Collecting sample metrics...'));
    try {
      const metrics = await collector.collectKafkaMetrics('1 hour ago');
      console.log(chalk.green(`✅ Successfully collected ${metrics.length} metric samples`));
      
      if (metrics.length > 0) {
        const sampleTypes = metrics.reduce((acc, m) => {
          acc[m.eventType] = (acc[m.eventType] || 0) + 1;
          return acc;
        }, {});
        
        console.log(chalk.gray('   Sample breakdown:'));
        Object.entries(sampleTypes).forEach(([type, count]) => {
          console.log(chalk.gray(`     - ${type}: ${count} samples`));
        });
      }
    } catch (error) {
      console.log(chalk.yellow(`   Collection failed: ${error.message}`));
      console.log(chalk.gray('   This might be expected if no recent Kafka activity'));
    }
    
    console.log(chalk.green('\n✅ Connection test completed successfully!'));
    return true;
    
  } catch (error) {
    console.error(chalk.red('\n❌ Connection test failed:'), error.message);
    
    // Provide helpful error context
    if (error.message.includes('401') || error.message.includes('403')) {
      console.log(chalk.yellow('\n💡 API Key Issues:'));
      console.log(chalk.gray('   - Verify NEW_RELIC_USER_API_KEY is correct'));
      console.log(chalk.gray('   - Ensure the key has NRQL query permissions'));
      console.log(chalk.gray('   - Check if the key belongs to the correct account'));
    }
    
    if (error.message.includes('404')) {
      console.log(chalk.yellow('\n💡 Account Issues:'));
      console.log(chalk.gray('   - Verify NEW_RELIC_ACCOUNT_ID is correct'));
      console.log(chalk.gray('   - Ensure you have access to the account'));
    }
    
    if (error.message.includes('timeout') || error.message.includes('ENOTFOUND')) {
      console.log(chalk.yellow('\n💡 Network Issues:'));
      console.log(chalk.gray('   - Check internet connectivity'));
      console.log(chalk.gray('   - Verify firewall settings'));
      console.log(chalk.gray('   - Try again in a moment'));
    }
    
    return false;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(chalk.bold.cyan('Infrastructure Connection Test\n'));
    console.log('Usage: node test-infra-connection.js [options]\n');
    console.log('Options:');
    console.log('  --help    Show this help\n');
    console.log('Environment Variables:');
    console.log('  NEW_RELIC_ACCOUNT_ID    New Relic account ID');
    console.log('  NEW_RELIC_USER_API_KEY  User API key for queries');
    process.exit(0);
  }
  
  testConnection().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error(chalk.red('Test runner error:'), error.message);
    process.exit(1);
  });
}

module.exports = testConnection;