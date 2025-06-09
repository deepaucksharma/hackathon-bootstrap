#!/usr/bin/env node

/**
 * Test Local Kafka Setup
 * 
 * Simulates nri-kafka data collection from a local Kafka cluster
 * and transforms it to MESSAGE_QUEUE entities
 */

const chalk = require('chalk');
const MessageQueuesPlatform = require('../platform');
const { generateNriKafkaSamples } = require('../test-infrastructure-pipeline');

// Enhanced sample generator for local Kafka testing
function generateLocalKafkaSamples() {
  const samples = [];
  const clusterName = 'local-kafka';
  const timestamp = Date.now();
  
  // Broker samples with realistic local metrics
  for (let i = 1; i <= 3; i++) {
    samples.push({
      eventType: 'KafkaBrokerSample',
      'broker.id': i,
      'broker.hostname': `localhost:909${i}`,
      clusterName: clusterName,
      'broker.messagesInPerSecond': Math.floor(Math.random() * 100) + 50,
      'broker.messagesOutPerSecond': Math.floor(Math.random() * 100) + 40,
      'broker.bytesInPerSecond': Math.floor(Math.random() * 100000) + 50000,
      'broker.bytesOutPerSecond': Math.floor(Math.random() * 100000) + 40000,
      'broker.cpuPercent': Math.random() * 30 + 10,
      'broker.JVMMemoryUsedPercent': Math.random() * 50 + 20,
      'broker.underReplicatedPartitions': 0,
      'broker.offlinePartitions': 0,
      'broker.requestHandlerIdlePercent': Math.random() * 30 + 60,
      'broker.networkProcessorIdlePercent': Math.random() * 20 + 70,
      'broker.partitionCount': Math.floor(Math.random() * 20) + 10,
      'broker.leaderCount': Math.floor(Math.random() * 15) + 5,
      'broker.logFlushRateAndTimeMs': Math.random() * 5 + 1,
      kafkaVersion: '3.5.0',
      timestamp: timestamp
    });
  }
  
  // Topic samples for common local development topics
  const topics = [
    { name: '__consumer_offsets', partitions: 50, internal: true },
    { name: 'test-topic', partitions: 3, internal: false },
    { name: 'events', partitions: 6, internal: false },
    { name: 'logs', partitions: 1, internal: false }
  ];
  
  topics.forEach(topic => {
    samples.push({
      eventType: 'KafkaTopicSample',
      'topic.name': topic.name,
      clusterName: clusterName,
      'topic.messagesInPerSecond': topic.internal ? 0 : Math.floor(Math.random() * 50) + 10,
      'topic.messagesOutPerSecond': topic.internal ? 0 : Math.floor(Math.random() * 45) + 9,
      'topic.bytesInPerSecond': topic.internal ? 0 : Math.floor(Math.random() * 50000) + 10000,
      'topic.bytesOutPerSecond': topic.internal ? 0 : Math.floor(Math.random() * 45000) + 9000,
      'topic.partitionCount': topic.partitions,
      'topic.replicationFactor': 1, // Local setup typically has RF=1
      'topic.retentionMs': 7 * 24 * 60 * 60 * 1000,
      'topic.underReplicatedPartitions': 0,
      'topic.isInternal': topic.internal,
      timestamp: timestamp
    });
  });
  
  // Consumer group samples for local testing
  const consumerGroups = [
    { id: 'test-consumer', topics: ['test-topic'], lag: 0, state: 'STABLE' },
    { id: 'event-processor', topics: ['events'], lag: 100, state: 'STABLE' },
    { id: 'log-consumer', topics: ['logs'], lag: 0, state: 'EMPTY' }
  ];
  
  consumerGroups.forEach(group => {
    samples.push({
      eventType: 'KafkaConsumerSample',
      'consumer.groupId': group.id,
      clusterName: clusterName,
      'topic.name': group.topics[0],
      'consumer.state': group.state,
      'consumer.memberCount': group.state === 'EMPTY' ? 0 : 1,
      'consumer.totalLag': group.lag,
      'consumer.maxLag': group.lag,
      'consumer.avgLag': group.lag,
      'consumer.messagesConsumedPerSecond': group.state === 'EMPTY' ? 0 : Math.floor(Math.random() * 50) + 10,
      'consumer.bytesConsumedPerSecond': group.state === 'EMPTY' ? 0 : Math.floor(Math.random() * 50000) + 10000,
      'consumer.offsetCommitRate': group.state === 'EMPTY' ? 0 : Math.random() * 5 + 1,
      timestamp: timestamp
    });
  });
  
  return samples;
}

// Mock collector that simulates nri-kafka data collection
class LocalKafkaCollector {
  constructor(options) {
    this.options = options;
  }

  async collectKafkaMetrics() {
    console.log(chalk.cyan('📊 Simulating nri-kafka data collection from local Kafka...'));
    
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const samples = generateLocalKafkaSamples();
    console.log(chalk.green(`✓ Collected ${samples.length} samples from local Kafka`));
    
    return samples;
  }
}

// Mock or real streamer based on DRY_RUN
class LocalTestStreamer {
  constructor(options) {
    this.options = options;
    this.streamedEvents = [];
    this.dryRun = process.env.DRY_RUN === 'true';
  }

  async streamEvents(entities) {
    this.streamedEvents.push(...entities);
    
    if (this.dryRun) {
      console.log(chalk.blue(`📤 [DRY RUN] Would stream ${entities.length} entities to New Relic`));
      
      // Show entity breakdown
      const breakdown = {};
      entities.forEach(e => {
        breakdown[e.entityType] = (breakdown[e.entityType] || 0) + 1;
      });
      
      console.log(chalk.gray('\nEntity breakdown:'));
      Object.entries(breakdown).forEach(([type, count]) => {
        console.log(chalk.gray(`  - ${type}: ${count}`));
      });
    } else {
      // Real streaming
      const NewRelicStreamer = require('../simulation/streaming/new-relic-streamer');
      const realStreamer = new NewRelicStreamer({
        apiKey: this.options.apiKey,
        accountId: this.options.accountId
      });
      
      await realStreamer.streamEvents(entities);
      console.log(chalk.green(`✓ Streamed ${entities.length} entities to New Relic`));
      await realStreamer.shutdown();
    }
  }

  async flushAll() {
    // No-op for test
  }

  async shutdown() {
    // No-op for test
  }

  getStats() {
    return {
      totalEvents: this.streamedEvents.length,
      eventTypes: [...new Set(this.streamedEvents.map(e => e.entityType))]
    };
  }
}

async function testLocalKafka() {
  console.log(chalk.bold.cyan('\n🧪 Testing Local Kafka Infrastructure Mode\n'));
  
  const dryRun = process.env.DRY_RUN === 'true';
  const accountId = process.env.NEW_RELIC_ACCOUNT_ID || '12345';
  const apiKey = process.env.NEW_RELIC_API_KEY || 'test-key';
  
  if (dryRun) {
    console.log(chalk.yellow('Running in DRY RUN mode - no data will be sent to New Relic\n'));
  } else {
    console.log(chalk.yellow('Running in LIVE mode - data will be sent to New Relic'));
    console.log(chalk.gray(`Account ID: ${accountId}`));
    console.log(chalk.gray(`API Key: ${apiKey.substring(0, 10)}...\\n`));
  }
  
  try {
    // Create platform in infrastructure mode
    const platform = new MessageQueuesPlatform({
      mode: 'infrastructure',
      accountId: accountId,
      apiKey: apiKey,
      interval: 30,
      debug: true
    });
    
    // Replace with local test components
    platform.collector = new LocalKafkaCollector({ accountId });
    platform.streamer = new LocalTestStreamer({ accountId, apiKey });
    
    // Run one cycle
    console.log(chalk.yellow('Running infrastructure cycle...\\n'));
    await platform.runCycle();
    
    // Show statistics
    const stats = await platform.getStats();
    console.log(chalk.yellow('\\n📊 Platform Statistics:'));
    console.log(chalk.gray(JSON.stringify(stats, null, 2)));
    
    // Show relationship statistics
    if (platform.relationshipManager) {
      const relStats = platform.relationshipManager.getStats();
      console.log(chalk.yellow('\\n🔗 Relationship Statistics:'));
      console.log(chalk.gray(`Total entities: ${relStats.totalEntities}`));
      console.log(chalk.gray(`Total relationships: ${relStats.totalRelationships}`));
      console.log(chalk.gray('Relationship types:'));
      Object.entries(relStats.relationshipCounts).forEach(([type, count]) => {
        console.log(chalk.gray(`  - ${type}: ${count}`));
      });
    }
    
    // Show sample NRQL queries
    console.log(chalk.yellow('\\n🔍 NRQL Queries to Verify:'));
    console.log(chalk.cyan('\\n-- Check if entities are appearing:'));
    console.log(`FROM MessageQueue SELECT count(*) WHERE entityType LIKE 'MESSAGE_QUEUE_%' SINCE 5 minutes ago`);
    
    console.log(chalk.cyan('\\n-- View local Kafka cluster:'));
    console.log(`FROM MessageQueue SELECT latest(cluster.health.score) WHERE entityType = 'MESSAGE_QUEUE_CLUSTER' AND clusterName = 'local-kafka'`);
    
    console.log(chalk.cyan('\\n-- Check consumer groups:'));
    console.log(`FROM MessageQueue SELECT latest(consumerGroup.totalLag), latest(consumerGroup.state) WHERE entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP' FACET consumerGroupId`);
    
    console.log(chalk.green('\\n✅ Local Kafka test completed successfully!'));
    
    if (!dryRun) {
      console.log(chalk.yellow('\\n⏱️  Wait 2-3 minutes for entity synthesis, then run the NRQL queries above.\\n'));
    }
    
    // Clean shutdown
    await platform.stop();
    
  } catch (error) {
    console.error(chalk.red('❌ Test failed:'), error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testLocalKafka();
}

module.exports = { testLocalKafka, generateLocalKafkaSamples };