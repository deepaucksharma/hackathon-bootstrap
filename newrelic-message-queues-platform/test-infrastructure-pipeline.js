#!/usr/bin/env node

/**
 * Test Infrastructure Pipeline
 * 
 * Tests the complete infrastructure mode pipeline with simulated nri-kafka data
 */

const chalk = require('chalk');
const { MessageQueuesPlatform } = require('./platform');
const NriKafkaTransformer = require('./infrastructure/transformers/nri-kafka-transformer');
const NewRelicStreamer = require('./simulation/streaming/new-relic-streamer');

async function testInfrastructurePipeline() {
  console.log(chalk.bold.cyan('\n🧪 Testing Infrastructure Mode Pipeline\n'));
  
  // Step 1: Create simulated nri-kafka data
  console.log(chalk.yellow('Step 1: Generating simulated nri-kafka data...'));
  const samples = generateNriKafkaSamples();
  console.log(chalk.green(`✓ Generated ${samples.length} nri-kafka samples`));
  
  // Step 2: Transform to MESSAGE_QUEUE entities
  console.log(chalk.yellow('\nStep 2: Transforming to MESSAGE_QUEUE entities...'));
  const transformer = new NriKafkaTransformer('12345');
  const result = transformer.transformSamples(samples);
  
  console.log(chalk.green(`✓ Transformed ${result.entities.length} entities:`));
  console.log(`  - Brokers: ${result.stats.brokerEntities}`);
  console.log(`  - Topics: ${result.stats.topicEntities}`);
  console.log(`  - Clusters: ${result.stats.clusterEntities}`);
  console.log(`  - Consumer Groups: ${result.stats.consumerGroupEntities}`);
  
  if (result.stats.transformationErrors > 0) {
    console.log(chalk.yellow(`  - Errors: ${result.stats.transformationErrors}`));
  }
  
  // Step 3: Display sample entities
  console.log(chalk.yellow('\nStep 3: Sample entities:'));
  
  const sampleBroker = result.entities.find(e => e.entityType === 'MESSAGE_QUEUE_BROKER');
  if (sampleBroker) {
    console.log(chalk.cyan('\nBroker Entity:'));
    console.log(JSON.stringify({
      entityGuid: sampleBroker.entityGuid,
      displayName: sampleBroker.displayName,
      cpu: sampleBroker['broker.cpu.usage'],
      messagesIn: sampleBroker['broker.messagesInPerSecond']
    }, null, 2));
  }
  
  const sampleConsumerGroup = result.entities.find(e => e.entityType === 'MESSAGE_QUEUE_CONSUMER_GROUP');
  if (sampleConsumerGroup) {
    console.log(chalk.cyan('\nConsumer Group Entity:'));
    console.log(JSON.stringify({
      entityGuid: sampleConsumerGroup.entityGuid,
      displayName: sampleConsumerGroup.displayName,
      totalLag: sampleConsumerGroup['consumerGroup.totalLag'],
      state: sampleConsumerGroup['consumerGroup.state']
    }, null, 2));
  }
  
  // Step 4: Test streaming (dry run)
  console.log(chalk.yellow('\nStep 4: Testing streaming to New Relic...'));
  
  if (process.env.DRY_RUN !== 'false') {
    console.log(chalk.blue('✓ DRY RUN mode - would stream:'));
    console.log(`  - ${result.entities.length} entities`);
    console.log(`  - Event type: MessageQueue`);
    console.log(`  - Account ID: ${process.env.NEW_RELIC_ACCOUNT_ID || '12345'}`);
  } else {
    const streamer = new NewRelicStreamer({
      accountId: process.env.NEW_RELIC_ACCOUNT_ID || '12345',
      apiKey: process.env.NEW_RELIC_API_KEY || 'test-key',
      interval: 30
    });
    
    await streamer.streamEvents(result.entities);
    console.log(chalk.green('✓ Streamed entities to New Relic'));
    await streamer.shutdown();
  }
  
  // Step 5: Show NRQL queries
  console.log(chalk.yellow('\nStep 5: Verification queries:'));
  console.log(chalk.cyan('\nTo verify entities in New Relic:'));
  console.log(`FROM MessageQueue SELECT count(*) WHERE entityType LIKE 'MESSAGE_QUEUE_%' SINCE 5 minutes ago`);
  console.log(`\nTo see consumer group lag:`);
  console.log(`FROM MessageQueue SELECT latest(consumerGroup.totalLag) WHERE entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP' FACET consumerGroupId`);
  
  console.log(chalk.green('\n✅ Infrastructure pipeline test completed!\n'));
}

function generateNriKafkaSamples() {
  const samples = [];
  const clusterName = 'test-kafka-cluster';
  
  // Generate broker samples
  for (let i = 1; i <= 3; i++) {
    samples.push({
      eventType: 'KafkaBrokerSample',
      'broker.id': i,
      'broker.hostname': `kafka-broker-${i}`,
      clusterName: clusterName,
      'broker.messagesInPerSecond': Math.floor(Math.random() * 1000) + 500,
      'broker.messagesOutPerSecond': Math.floor(Math.random() * 1000) + 400,
      'broker.bytesInPerSecond': Math.floor(Math.random() * 1000000) + 500000,
      'broker.bytesOutPerSecond': Math.floor(Math.random() * 1000000) + 400000,
      'broker.cpuPercent': Math.random() * 50 + 20,
      'broker.JVMMemoryUsedPercent': Math.random() * 40 + 30,
      'broker.underReplicatedPartitions': Math.random() > 0.9 ? Math.floor(Math.random() * 5) : 0,
      'broker.offlinePartitions': 0,
      'broker.requestHandlerIdlePercent': Math.random() * 30 + 60,
      'broker.networkProcessorIdlePercent': Math.random() * 20 + 70,
      kafkaVersion: '2.8.1',
      timestamp: Date.now()
    });
  }
  
  // Generate topic samples
  const topics = ['user-events', 'order-events', 'payment-events', 'system-logs', 'notification-events'];
  topics.forEach((topicName, index) => {
    samples.push({
      eventType: 'KafkaTopicSample',
      'topic.name': topicName,
      clusterName: clusterName,
      'topic.messagesInPerSecond': Math.floor(Math.random() * 500) + 100,
      'topic.messagesOutPerSecond': Math.floor(Math.random() * 450) + 90,
      'topic.bytesInPerSecond': Math.floor(Math.random() * 500000) + 100000,
      'topic.bytesOutPerSecond': Math.floor(Math.random() * 450000) + 90000,
      'topic.partitionCount': index === 2 ? 12 : (index % 2 === 0 ? 6 : 3),
      'topic.replicationFactor': 3,
      'topic.retentionMs': 7 * 24 * 60 * 60 * 1000,
      'topic.underReplicatedPartitions': 0,
      timestamp: Date.now()
    });
  });
  
  // Generate consumer group samples
  const consumerGroups = [
    { id: 'analytics-processor', topics: ['user-events'], lag: 1000 },
    { id: 'order-processor', topics: ['order-events', 'payment-events'], lag: 500 },
    { id: 'notification-sender', topics: ['notification-events'], lag: 100 },
    { id: 'audit-logger', topics: ['system-logs'], lag: 5000 }
  ];
  
  consumerGroups.forEach((group, index) => {
    samples.push({
      eventType: 'KafkaConsumerSample',
      'consumer.groupId': group.id,
      clusterName: clusterName,
      'topic.name': group.topics[0], // Primary topic
      'consumer.state': Math.random() > 0.9 ? 'REBALANCING' : 'STABLE',
      'consumer.memberCount': Math.floor(Math.random() * 3) + 1,
      'consumer.totalLag': group.lag + Math.floor(Math.random() * 1000),
      'consumer.maxLag': group.lag + Math.floor(Math.random() * 500),
      'consumer.avgLag': group.lag / 2,
      'consumer.messagesConsumedPerSecond': Math.floor(Math.random() * 300) + 100,
      'consumer.bytesConsumedPerSecond': Math.floor(Math.random() * 300000) + 100000,
      'consumer.offsetCommitRate': Math.random() * 10 + 5,
      timestamp: Date.now()
    });
  });
  
  return samples;
}

// Run the test
if (require.main === module) {
  testInfrastructurePipeline().catch(error => {
    console.error(chalk.red('Test failed:'), error);
    process.exit(1);
  });
}

module.exports = { testInfrastructurePipeline, generateNriKafkaSamples };