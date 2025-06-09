#!/usr/bin/env node

/**
 * Test Infrastructure Mode with Dry Run
 * 
 * Tests the infrastructure mode with simulated nri-kafka data
 * without requiring real New Relic credentials
 */

const chalk = require('chalk');
const MessageQueuesPlatform = require('./platform');
const NriKafkaTransformer = require('./infrastructure/transformers/nri-kafka-transformer');
const { generateNriKafkaSamples } = require('./test-infrastructure-pipeline');

// Mock the infrastructure collector to return simulated data
class MockInfraCollector {
  constructor(options) {
    this.options = options;
    this.samples = generateNriKafkaSamples();
  }

  async collectKafkaMetrics() {
    console.log(chalk.cyan('📊 Using simulated nri-kafka data...'));
    
    // Simulate some delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return this.samples;
  }
}

// Mock streamer for dry run
class MockStreamer {
  constructor(options) {
    this.options = options;
    this.streamedEvents = [];
  }

  async streamEvents(entities) {
    this.streamedEvents.push(...entities);
    console.log(chalk.blue(`📤 [DRY RUN] Would stream ${entities.length} entities to New Relic`));
    
    // Log sample entity
    if (entities.length > 0) {
      const sample = entities[0];
      console.log(chalk.gray('\nSample entity:'));
      console.log(chalk.gray(JSON.stringify({
        entityGuid: sample.entityGuid,
        entityType: sample.entityType,
        displayName: sample.displayName
      }, null, 2)));
    }
  }

  async flushAll() {
    console.log(chalk.gray('Flushing streamer (dry run)...'));
  }

  async shutdown() {
    console.log(chalk.gray('Shutting down streamer (dry run)...'));
  }

  getStats() {
    return {
      totalEvents: this.streamedEvents.length,
      eventTypes: [...new Set(this.streamedEvents.map(e => e.entityType))]
    };
  }
}

async function testInfrastructureMode() {
  console.log(chalk.bold.cyan('\n🧪 Testing Infrastructure Mode (Dry Run)\n'));

  try {
    // Create platform with mocked components
    const platform = new MessageQueuesPlatform({
      mode: 'infrastructure',
      accountId: '12345',
      apiKey: 'test-key',
      interval: 10,
      debug: true
    });

    // Replace real components with mocks
    platform.collector = new MockInfraCollector({ accountId: '12345' });
    platform.streamer = new MockStreamer({ accountId: '12345' });

    // Run one cycle
    console.log(chalk.yellow('Running infrastructure cycle with simulated data...\n'));
    await platform.runCycle();

    // Show statistics
    const stats = await platform.getStats();
    console.log(chalk.yellow('\n📊 Platform Statistics:'));
    console.log(chalk.gray(JSON.stringify(stats, null, 2)));

    // Show relationship statistics
    if (platform.relationshipManager) {
      const relStats = platform.relationshipManager.getStats();
      console.log(chalk.yellow('\n🔗 Relationship Statistics:'));
      console.log(chalk.gray(`Total entities: ${relStats.totalEntities}`));
      console.log(chalk.gray(`Total relationships: ${relStats.totalRelationships}`));
      console.log(chalk.gray('Relationship types:'));
      Object.entries(relStats.relationshipCounts).forEach(([type, count]) => {
        console.log(chalk.gray(`  - ${type}: ${count}`));
      });
    }

    // Show entity breakdown
    const streamerStats = platform.streamer.getStats();
    console.log(chalk.yellow('\n📦 Entity Breakdown:'));
    streamerStats.eventTypes.forEach(type => {
      const count = platform.streamer.streamedEvents.filter(e => e.entityType === type).length;
      console.log(chalk.gray(`  - ${type}: ${count}`));
    });

    // Show sample queries
    console.log(chalk.yellow('\n🔍 Sample NRQL Queries:'));
    console.log(chalk.cyan('-- Check entity count:'));
    console.log(`FROM MessageQueue SELECT count(*) WHERE entityType LIKE 'MESSAGE_QUEUE_%' SINCE 5 minutes ago`);
    console.log(chalk.cyan('\n-- View consumer lag:'));
    console.log(`FROM MessageQueue SELECT latest(consumerGroup.totalLag) FACET consumerGroupId WHERE entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP'`);
    console.log(chalk.cyan('\n-- Broker health:'));
    console.log(`FROM MessageQueue SELECT latest(broker.cpu.usage), latest(broker.memory.usage) FACET hostname WHERE entityType = 'MESSAGE_QUEUE_BROKER'`);

    console.log(chalk.green('\n✅ Infrastructure mode test completed successfully!\n'));

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
  testInfrastructureMode();
}

module.exports = { testInfrastructureMode };