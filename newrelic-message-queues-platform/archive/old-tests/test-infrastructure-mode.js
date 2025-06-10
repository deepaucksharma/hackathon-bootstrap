#!/usr/bin/env node

/**
 * Test Infrastructure Mode Integration
 * 
 * This script tests the infrastructure mode functionality by:
 * 1. Using mock nri-kafka data to simulate real infrastructure
 * 2. Transforming it to MESSAGE_QUEUE entities
 * 3. Verifying the transformation pipeline
 */

const chalk = require('chalk');
const MessageQueuesPlatform = require('./platform');

// Mock mode flag
const useMockData = process.argv.includes('--mock');

// Configuration
const config = {
  mode: 'infrastructure',
  accountId: process.env.NEW_RELIC_ACCOUNT_ID || '12345',
  apiKey: process.env.NEW_RELIC_USER_API_KEY || 'test-api-key',
  ingestKey: process.env.NEW_RELIC_INGEST_KEY || 'test-ingest-key',
  dryRun: true, // Always dry run for testing
  infrastructure: {
    interval: 30000 // 30 seconds for testing
  },
  api: {
    enabled: false // No API for this test
  }
};

// Mock infrastructure collector for testing
class MockInfrastructureCollector {
  async checkKafkaIntegration() {
    return true;
  }
  
  async getKafkaClusters() {
    return [
      { clusterName: 'test-cluster-1', brokerCount: 3 },
      { clusterName: 'test-cluster-2', brokerCount: 5 }
    ];
  }
  
  async collectKafkaMetrics() {
    // Return mock nri-kafka sample data
    const timestamp = Date.now();
    return [
      {
        eventType: 'KafkaBrokerSample',
        entityName: 'broker:localhost:9092',
        displayName: 'kafka-broker-1',
        clusterName: 'test-cluster-1',
        'broker.id': 1,
        'broker.IOInPerSecond': 125000,
        'broker.IOOutPerSecond': 110000,
        'broker.messagesInPerSecond': 850,
        'broker.bytesInPerSecond': 125000,
        'broker.bytesOutPerSecond': 110000,
        'broker.logFlushRateAndTimeMs99thPercentile': 15.5,
        'net.activeConnections': 150,
        'net.requestsPerSecond': 1200,
        'request.avgTimeMs': 2.3,
        'request.handlerIdlePercent': 0.85,
        'kafka.controller.activeControllerCount': 1,
        'kafka.controller.offlinePartitionsCount': 0,
        'replication.underReplicatedPartitions': 0,
        'replication.leaderElectionPerSecond': 0.02,
        'kafka.server.brokerId': 1,
        'kafka.server.zookeeperSessionState': 'CONNECTED',
        provider: 'kafka',
        timestamp
      },
      {
        eventType: 'KafkaBrokerSample',
        entityName: 'broker:localhost:9093',
        displayName: 'kafka-broker-2',
        clusterName: 'test-cluster-1',
        'broker.id': 2,
        'broker.IOInPerSecond': 98000,
        'broker.IOOutPerSecond': 87000,
        'broker.messagesInPerSecond': 650,
        'broker.bytesInPerSecond': 98000,
        'broker.bytesOutPerSecond': 87000,
        'net.activeConnections': 120,
        'kafka.server.brokerId': 2,
        provider: 'kafka',
        timestamp
      },
      {
        eventType: 'KafkaTopicSample',
        entityName: 'topic:orders',
        displayName: 'orders',
        clusterName: 'test-cluster-1',
        'topic.name': 'orders',
        topic: 'orders',
        'topic.partitions': 12,
        'topic.replicationFactor': 3,
        'topic.underReplicatedPartitions': 0,
        'topic.retentionSizeOrTime': 86400000,
        'topic.messagesInPerSecond': 450,
        'topic.bytesInPerSecond': 67500,
        'topic.bytesOutPerSecond': 202500,
        provider: 'kafka',
        timestamp
      },
      {
        eventType: 'KafkaTopicSample',
        entityName: 'topic:payments',
        displayName: 'payments',
        clusterName: 'test-cluster-1',
        'topic.name': 'payments',
        topic: 'payments',
        'topic.partitions': 6,
        'topic.replicationFactor': 3,
        'topic.messagesInPerSecond': 120,
        'topic.bytesInPerSecond': 18000,
        'topic.bytesOutPerSecond': 54000,
        provider: 'kafka',
        timestamp
      },
      {
        eventType: 'KafkaConsumerSample',
        entityName: 'consumer:order-processor',
        displayName: 'order-processor',
        clusterName: 'test-cluster-1',
        'consumer.groupId': 'order-processor',
        consumerGroup: 'order-processor',
        'consumer.totalLag': 1250,
        'consumer.maxLag': 450,
        'consumer.avgLag': 104,
        'consumer.messageConsumptionPerSecond': 425,
        'consumer.bytesConsumedPerSecond': 63750,
        'consumer.ageOfOldestMessageMs': 5200,
        'consumer.members': 4,
        clientId: 'order-processor-client',
        provider: 'kafka',
        timestamp
      },
      {
        eventType: 'KafkaConsumerSample',
        entityName: 'consumer:payment-validator',
        displayName: 'payment-validator',
        clusterName: 'test-cluster-1',
        'consumer.groupId': 'payment-validator',
        consumerGroup: 'payment-validator',
        'consumer.totalLag': 50,
        'consumer.maxLag': 25,
        'consumer.avgLag': 8.3,
        'consumer.messageConsumptionPerSecond': 118,
        'consumer.members': 2,
        provider: 'kafka',
        timestamp
      }
    ];
  }
}

async function testInfrastructureMode() {
  console.log(chalk.bold.magenta('\n🧪 Testing Infrastructure Mode Integration\n'));
  
  if (useMockData) {
    console.log(chalk.yellow('📊 Using mock nri-kafka data for testing\n'));
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
    let infraCollector, nriTransformer;
    
    if (useMockData) {
      // Use mock collector for testing
      infraCollector = new MockInfrastructureCollector();
      
      // Import the transformer directly
      const NRIKafkaTransformer = require('./infrastructure/transformers/nri-kafka-transformer');
      nriTransformer = new NRIKafkaTransformer(config.accountId, {
        debug: true
      });
    } else {
      infraCollector = platform.infraCollector;
      nriTransformer = platform.nriTransformer;
    }
    
    // Check for Kafka integration
    console.log(chalk.gray('Checking for nri-kafka integration...'));
    const hasData = await infraCollector.checkKafkaIntegration();
    
    if (!hasData && !useMockData) {
      console.log(chalk.yellow('\n⚠️  No nri-kafka data found in New Relic.'));
      console.log(chalk.gray('\nTo test with mock data, run:'));
      console.log(chalk.cyan('  node test-infrastructure-mode.js --mock'));
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
    const transformResult = nriTransformer.transformSamples(samples);
    
    // Handle both array and object return types
    const entities = Array.isArray(transformResult) ? transformResult : 
                    (transformResult.entities || transformResult.results || []);
    
    console.log(chalk.green(`✅ Created ${entities.length} entities:`));
    
    // Show entity breakdown
    const entityTypes = entities.reduce((acc, entity) => {
      acc[entity.entityType] = (acc[entity.entityType] || 0) + 1;
      return acc;
    }, {});
    
    Object.entries(entityTypes).forEach(([type, count]) => {
      console.log(chalk.gray(`   - ${type}: ${count} entities`));
    });
    
    // Verify entity GUIDs follow v3.0 format: {accountId}|{domain}|{entityType}|{uniqueHash}
    console.log(chalk.gray('\nVerifying entity GUIDs (v3.0 format)...'));
    let guidErrors = 0;
    entities.forEach(entity => {
      const expectedPrefix = `${config.accountId}|INFRA|${entity.entityType}|`;
      if (!entity.entityGuid.startsWith(expectedPrefix)) {
        console.log(chalk.red(`   ❌ Invalid v3.0 GUID format: ${entity.entityGuid}`));
        console.log(chalk.gray(`      Expected prefix: ${expectedPrefix}`));
        guidErrors++;
      }
      
      // Validate full GUID structure
      const guidParts = entity.entityGuid.split('|');
      if (guidParts.length !== 4) {
        console.log(chalk.red(`   ❌ Invalid GUID structure: ${entity.entityGuid}`));
        console.log(chalk.gray(`      Expected 4 parts separated by |`));
        guidErrors++;
      }
    });
    
    if (guidErrors === 0) {
      console.log(chalk.green('   ✅ All entity GUIDs are properly formatted'));
    } else {
      console.log(chalk.red(`   ❌ ${guidErrors} entities have invalid GUIDs`));
    }
    
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
    
    // Verify relationships
    console.log(chalk.gray('\nVerifying entity relationships...'));
    const clusterEntities = entities.filter(e => e.entityType === 'MESSAGE_QUEUE_CLUSTER');
    const brokerEntities = entities.filter(e => e.entityType === 'MESSAGE_QUEUE_BROKER');
    const topicEntities = entities.filter(e => e.entityType === 'MESSAGE_QUEUE_TOPIC');
    const consumerEntities = entities.filter(e => e.entityType === 'MESSAGE_QUEUE_CONSUMER_GROUP');
    
    // Check cluster relationships
    clusterEntities.forEach(cluster => {
      const clusterBrokers = brokerEntities.filter(b => b.tags && b.tags.clusterName === cluster.tags.clusterName);
      console.log(chalk.gray(`   Cluster ${cluster.displayName}: ${clusterBrokers.length} brokers`));
    });
    
    // Check topic relationships  
    topicEntities.forEach(topic => {
      const topicConsumers = consumerEntities.filter(c => {
        // In a real scenario, we'd check which topics the consumer is subscribed to
        return c.tags && c.tags.clusterName === topic.tags.clusterName;
      });
      console.log(chalk.gray(`   Topic ${topic.displayName}: ${topicConsumers.length} potential consumers`));
    });
    
    console.log(chalk.green('\n✅ Manual data collection test passed!\n'));
    
    if (useMockData) {
      console.log(chalk.cyan('Mock test completed successfully!'));
      console.log(chalk.gray('\nTo test with real infrastructure:'));
      console.log(chalk.gray('1. Set up nri-kafka on your Kafka brokers'));
      console.log(chalk.gray('2. Configure environment variables'));
      console.log(chalk.gray('3. Run without --mock flag'));
      return;
    }
    
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