#!/usr/bin/env node

/**
 * Test Infrastructure Agent Collection
 * 
 * This script verifies that we can collect real Kafka metrics from the
 * New Relic Infrastructure agent and transform them to MESSAGE_QUEUE entities.
 */

const chalk = require('chalk');
const InfraAgentCollector = require('./collectors/infra-agent-collector');
const NriKafkaTransformer = require('./transformers/nri-kafka-transformer');

async function testInfraCollection() {
  console.log(chalk.bold.blue('\n🧪 Testing Infrastructure Agent Collection\n'));
  
  // Check for required environment variables
  const accountId = process.env.NEW_RELIC_ACCOUNT_ID;
  const apiKey = process.env.NEW_RELIC_API_KEY || process.env.NEW_RELIC_USER_API_KEY;
  
  if (!accountId || !apiKey) {
    console.error(chalk.red('❌ Missing required environment variables:'));
    console.log(chalk.yellow('   export NEW_RELIC_ACCOUNT_ID=your_account_id'));
    console.log(chalk.yellow('   export NEW_RELIC_API_KEY=your_api_key'));
    process.exit(1);
  }
  
  console.log(chalk.gray(`Account ID: ${accountId}`));
  console.log(chalk.gray(`API Key: ${apiKey.substring(0, 10)}...`));
  
  try {
    // Step 1: Create collector
    console.log(chalk.cyan('\n1️⃣  Creating Infrastructure Agent collector...'));
    const collector = new InfraAgentCollector({
      accountId,
      apiKey,
      debug: true
    });
    
    // Step 2: Check if nri-kafka is installed
    console.log(chalk.cyan('\n2️⃣  Checking for nri-kafka integration...'));
    const hasKafka = await collector.checkKafkaIntegration();
    
    if (!hasKafka) {
      console.log(chalk.yellow('\n⚠️  No Kafka data found. Please ensure:'));
      console.log(chalk.gray('   1. Infrastructure agent is installed'));
      console.log(chalk.gray('   2. nri-kafka integration is configured'));
      console.log(chalk.gray('   3. Kafka is running and accessible'));
      console.log(chalk.gray('\n   Run: docker-compose -f docker-compose.infra.yml up -d'));
      return;
    }
    
    // Step 3: Get available clusters
    console.log(chalk.cyan('\n3️⃣  Getting available Kafka clusters...'));
    const clusters = await collector.getKafkaClusters();
    
    if (clusters.length === 0) {
      console.log(chalk.yellow('⚠️  No Kafka clusters found'));
      return;
    }
    
    console.log(chalk.green(`✅ Found ${clusters.length} cluster(s):`));
    clusters.forEach(cluster => {
      console.log(chalk.gray(`   - ${cluster.clusterName}: ${cluster.brokerCount} broker(s)`));
    });
    
    // Step 4: Collect metrics
    console.log(chalk.cyan('\n4️⃣  Collecting Kafka metrics...'));
    const samples = await collector.collectKafkaMetrics('30 minutes ago');
    
    console.log(chalk.green(`✅ Collected ${samples.length} samples`));
    
    // Show sample data
    const brokerSamples = samples.filter(s => s.eventType === 'KafkaBrokerSample');
    const topicSamples = samples.filter(s => s.eventType === 'KafkaTopicSample');
    
    console.log(chalk.gray(`   - Broker samples: ${brokerSamples.length}`));
    console.log(chalk.gray(`   - Topic samples: ${topicSamples.length}`));
    
    // Step 5: Transform to MESSAGE_QUEUE entities
    console.log(chalk.cyan('\n5️⃣  Transforming to MESSAGE_QUEUE entities...'));
    const transformer = new NriKafkaTransformer(accountId);
    const entities = transformer.transformSamples(samples);
    
    console.log(chalk.green(`✅ Created ${entities.length} entities`));
    
    // Show entity breakdown
    const entityTypes = {};
    entities.forEach(entity => {
      entityTypes[entity.entityType] = (entityTypes[entity.entityType] || 0) + 1;
    });
    
    Object.entries(entityTypes).forEach(([type, count]) => {
      console.log(chalk.gray(`   - ${type}: ${count}`));
    });
    
    // Step 6: Display sample entities
    console.log(chalk.cyan('\n6️⃣  Sample MESSAGE_QUEUE entities:\n'));
    
    // Show one of each type
    const sampleCluster = entities.find(e => e.entityType === 'MESSAGE_QUEUE_CLUSTER');
    const sampleBroker = entities.find(e => e.entityType === 'MESSAGE_QUEUE_BROKER');
    const sampleTopic = entities.find(e => e.entityType === 'MESSAGE_QUEUE_TOPIC');
    
    if (sampleCluster) {
      console.log(chalk.bold('MESSAGE_QUEUE_CLUSTER:'));
      console.log(chalk.gray(JSON.stringify({
        guid: sampleCluster.entityGuid,
        name: sampleCluster.displayName,
        metrics: {
          brokerCount: sampleCluster.metrics['cluster.brokerCount'],
          messagesPerSecond: sampleCluster.metrics['cluster.messagesPerSecond'],
          healthScore: sampleCluster.metrics['cluster.health.score']
        }
      }, null, 2)));
    }
    
    if (sampleBroker) {
      console.log(chalk.bold('\nMESSAGE_QUEUE_BROKER:'));
      console.log(chalk.gray(JSON.stringify({
        guid: sampleBroker.entityGuid,
        name: sampleBroker.displayName,
        metrics: {
          messagesIn: sampleBroker.metrics['broker.messagesInPerSecond'],
          bytesIn: sampleBroker.metrics['broker.bytesInPerSecond'],
          cpuIdle: sampleBroker.metrics['broker.cpu.idle']
        }
      }, null, 2)));
    }
    
    if (sampleTopic) {
      console.log(chalk.bold('\nMESSAGE_QUEUE_TOPIC:'));
      console.log(chalk.gray(JSON.stringify({
        guid: sampleTopic.entityGuid,
        name: sampleTopic.displayName,
        metrics: {
          messagesIn: sampleTopic.metrics['topic.messagesInPerSecond'],
          partitions: sampleTopic.metrics['topic.partitionCount'],
          consumerLag: sampleTopic.metrics['topic.consumerLag']
        }
      }, null, 2)));
    }
    
    // Step 7: Test streaming capability
    console.log(chalk.cyan('\n7️⃣  Testing streaming format...'));
    
    // Convert to event format
    const events = entities.map(entity => ({
      eventType: entity.entityType.replace(/_/g, ''),
      timestamp: Date.now(),
      entityGuid: entity.entityGuid,
      entityName: entity.entityName,
      displayName: entity.displayName,
      provider: entity.provider,
      ...entity.metrics,
      ...entity.tags
    }));
    
    console.log(chalk.green(`✅ Ready to stream ${events.length} events`));
    console.log(chalk.gray('   Sample event:'));
    console.log(chalk.gray(JSON.stringify(events[0], null, 2)));
    
    console.log(chalk.bold.green('\n✅ Infrastructure collection test successful!\n'));
    console.log(chalk.cyan('Next steps:'));
    console.log(chalk.gray('1. Integrate with platform.js'));
    console.log(chalk.gray('2. Add infrastructure mode'));
    console.log(chalk.gray('3. Test hybrid mode with simulation'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Test failed:'), error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testInfraCollection().catch(console.error);
}

module.exports = { testInfraCollection };