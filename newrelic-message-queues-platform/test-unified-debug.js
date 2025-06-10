#!/usr/bin/env node

const chalk = require('chalk');

console.log(chalk.blue('Testing unified platform components...\n'));

try {
  // Test data simulator
  console.log(chalk.gray('1. Testing DataSimulator...'));
  const DataSimulator = require('./simulation/engines/data-simulator');
  const simulator = new DataSimulator({ 
    anomalyRate: 0.05,
    accountId: '123456'
  });
  const topology = simulator.createTopology({
    provider: 'kafka',
    clusterCount: 1,
    brokersPerCluster: 2,
    topicsPerCluster: 2,
    consumerGroupsPerCluster: 1
  });
  console.log(chalk.green('   ✓ DataSimulator works'));
  console.log(chalk.gray(`     Clusters: ${topology.clusters.length}`));
  console.log(chalk.gray(`     Brokers: ${topology.brokers.length}`));
  console.log(chalk.gray(`     Topics: ${topology.topics.length}`));
  console.log(chalk.gray(`     Consumer Groups: ${topology.consumerGroups?.length || 0}`));
  
  // Check consumer group structure
  if (topology.consumerGroups && topology.consumerGroups.length > 0) {
    const group = topology.consumerGroups[0];
    console.log(chalk.gray('\n   Consumer Group structure:'));
    console.log(chalk.gray(`     name: ${group.name}`));
    console.log(chalk.gray(`     consumerGroup.topics: ${group['consumerGroup.topics']}`));
    console.log(chalk.gray(`     topics: ${group.topics}`));
    console.log(chalk.gray(`     cluster.name: ${group['cluster.name']}`));
    console.log(chalk.gray(`     clusterName: ${group.clusterName}`));
  }
  
  // Test entity synthesis
  console.log(chalk.gray('\n2. Testing EntitySynthesisEngine...'));
  const EntitySynthesisEngine = require('./core/entity-synthesis/entity-synthesis-engine');
  const engine = new EntitySynthesisEngine({ accountId: '123456' });
  console.log(chalk.green('   ✓ EntitySynthesisEngine works'));
  
  // Test error recovery
  console.log(chalk.gray('\n3. Testing ErrorRecoveryManager...'));
  const ErrorRecoveryManager = require('./core/resilience/error-recovery-manager');
  const errorRecovery = new ErrorRecoveryManager();
  console.log(chalk.green('   ✓ ErrorRecoveryManager works'));
  
  // Test streamer
  console.log(chalk.gray('\n4. Testing NewRelicStreamer...'));
  const NewRelicStreamer = require('./simulation/streaming/new-relic-streamer');
  const streamer = new NewRelicStreamer({ 
    ingestKey: 'test-key',
    accountId: '123456'
  });
  console.log(chalk.green('   ✓ NewRelicStreamer works'));
  
  console.log(chalk.green('\n✅ All components loaded successfully!'));
  
} catch (error) {
  console.error(chalk.red('\n❌ Error:'), error.message);
  console.error(error.stack);
}