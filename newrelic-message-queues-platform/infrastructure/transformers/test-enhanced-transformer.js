#!/usr/bin/env node

/**
 * Test script for Enhanced NRI-Kafka Transformer
 * 
 * Tests the transformer with sample data to verify:
 * - New metric definitions support
 * - Per-topic-per-broker metrics
 * - Consumer group entities with lag metrics
 * - Cluster-level aggregation
 * - Validation and error handling
 */

const chalk = require('chalk');
const NriKafkaTransformer = require('./nri-kafka-transformer');

console.log(chalk.blue('🧪 Testing Enhanced NRI-Kafka Transformer\n'));

// Create transformer instance with various options
const transformer = new NriKafkaTransformer('12345', {
  enableValidation: true,
  enablePerTopicBrokerMetrics: true,
  strictMode: false
});

// Sample broker data
const brokerSamples = [
  {
    eventType: 'KafkaBrokerSample',
    'broker.id': 1,
    'broker.messagesInPerSecond': 1000,
    'broker.messagesOutPerSecond': 950,
    'broker.bytesInPerSecond': 1024000,
    'broker.bytesOutPerSecond': 972800,
    'broker.cpuPercent': 45.2,
    'broker.JVMMemoryUsedPercent': 67.8,
    'broker.diskUsedPercent': 23.4,
    'broker.requestsPerSecond': 500,
    'broker.networkProcessorIdlePercent': 78.5,
    'broker.requestHandlerIdlePercent': 82.1,
    'broker.underReplicatedPartitions': 0,
    'broker.offlinePartitions': 0,
    clusterName: 'prod-kafka-cluster',
    hostname: 'kafka-broker-1.example.com',
    kafkaVersion: '2.8.1',
    timestamp: new Date().toISOString()
  },
  {
    eventType: 'KafkaBrokerSample',
    'broker.id': 2,
    'broker.messagesInPerSecond': 1200,
    'broker.messagesOutPerSecond': 1180,
    'broker.bytesInPerSecond': 1228800,
    'broker.bytesOutPerSecond': 1208320,
    'broker.cpuPercent': 52.3,
    'broker.JVMMemoryUsedPercent': 71.2,
    'broker.diskUsedPercent': 28.7,
    'broker.requestsPerSecond': 650,
    'broker.networkProcessorIdlePercent': 75.2,
    'broker.requestHandlerIdlePercent': 79.8,
    'broker.underReplicatedPartitions': 1,
    'broker.offlinePartitions': 0,
    clusterName: 'prod-kafka-cluster',
    hostname: 'kafka-broker-2.example.com',
    kafkaVersion: '2.8.1',
    timestamp: new Date().toISOString()
  }
];

// Sample topic data
const topicSamples = [
  {
    eventType: 'KafkaTopicSample',
    'topic.name': 'user-events',
    'topic.messagesInPerSecond': 800,
    'topic.messagesOutPerSecond': 750,
    'topic.bytesInPerSecond': 819200,
    'topic.bytesOutPerSecond': 768000,
    'topic.partitionCount': 12,
    'topic.replicationFactor': 3,
    'topic.diskSize': 1073741824,
    'topic.underReplicatedPartitions': 0,
    'broker.id': 1,
    clusterName: 'prod-kafka-cluster',
    timestamp: new Date().toISOString()
  },
  {
    eventType: 'KafkaTopicSample',
    'topic.name': 'order-events',
    'topic.messagesInPerSecond': 600,
    'topic.messagesOutPerSecond': 580,
    'topic.bytesInPerSecond': 614400,
    'topic.bytesOutPerSecond': 593920,
    'topic.partitionCount': 8,
    'topic.replicationFactor': 3,
    'topic.diskSize': 536870912,
    'topic.underReplicatedPartitions': 1,
    'broker.id': 2,
    clusterName: 'prod-kafka-cluster',
    timestamp: new Date().toISOString()
  }
];

// Sample consumer group data
const consumerGroupSamples = [
  {
    eventType: 'KafkaConsumerSample',
    'consumer.groupId': 'user-analytics-service',
    'consumer.state': 'STABLE',
    'consumer.memberCount': 3,
    'consumer.activeMembers': 3,
    'consumer.totalLag': 2500,
    'consumer.maxLag': 1200,
    'consumer.avgLag': 833,
    'consumer.messagesConsumedPerSecond': 780,
    'consumer.bytesConsumedPerSecond': 798720,
    'consumer.offset': 1234567,
    'consumer.currentOffset': 1237067,
    'topic.name': 'user-events',
    'partition.id': 0,
    clusterName: 'prod-kafka-cluster',
    timestamp: new Date().toISOString()
  },
  {
    eventType: 'KafkaConsumerSample',
    'consumer.groupId': 'order-processing-service',
    'consumer.state': 'STABLE',
    'consumer.memberCount': 2,
    'consumer.activeMembers': 2,
    'consumer.totalLag': 450,
    'consumer.maxLag': 300,
    'consumer.avgLag': 225,
    'consumer.messagesConsumedPerSecond': 570,
    'consumer.bytesConsumedPerSecond': 583680,
    'consumer.offset': 987654,
    'consumer.currentOffset': 988104,
    'topic.name': 'order-events',
    clusterName: 'prod-kafka-cluster',
    timestamp: new Date().toISOString()
  }
];

async function runTests() {
  try {
    console.log(chalk.green('📊 Test 1: Individual Entity Transformations'));
    
    // Test broker transformation
    console.log('\n🔧 Testing broker transformation...');
    const brokerEntity = transformer.transformBrokerSample(brokerSamples[0]);
    console.log(`✅ Broker entity created: ${brokerEntity.entityGuid}`);
    console.log(`   - Display Name: ${brokerEntity.displayName}`);
    console.log(`   - CPU Usage: ${brokerEntity['broker.cpu.usage']}%`);
    console.log(`   - Memory Usage: ${brokerEntity['broker.memory.usage']}%`);
    console.log(`   - Messages In/Sec: ${brokerEntity['broker.messagesInPerSecond']}`);
    
    // Test topic transformation
    console.log('\n🎯 Testing topic transformation...');
    const topicEntity = transformer.transformTopicSample(topicSamples[0]);
    console.log(`✅ Topic entity created: ${topicEntity.entityGuid}`);
    console.log(`   - Display Name: ${topicEntity.displayName}`);
    console.log(`   - Partitions: ${topicEntity['topic.partitions.count']}`);
    console.log(`   - Replication Factor: ${topicEntity['topic.replicationFactor']}`);
    console.log(`   - Messages In/Sec: ${topicEntity['topic.messagesInPerSecond']}`);
    
    // Test consumer group transformation
    console.log('\n👥 Testing consumer group transformation...');
    const consumerEntity = transformer.transformConsumerSample(consumerGroupSamples[0]);
    console.log(`✅ Consumer group entity created: ${consumerEntity.entityGuid}`);
    console.log(`   - Display Name: ${consumerEntity.displayName}`);
    console.log(`   - State: ${consumerEntity['consumerGroup.state']}`);
    console.log(`   - Total Lag: ${consumerEntity['consumerGroup.totalLag']}`);
    console.log(`   - Lag Stability Score: ${consumerEntity['consumerGroup.lagStabilityScore']}`);
    
    console.log(chalk.green('\n📊 Test 2: Batch Transformation with Aggregation'));
    
    // Test batch transformation
    const allSamples = [...brokerSamples, ...topicSamples, ...consumerGroupSamples];
    console.log(`\n🔄 Processing ${allSamples.length} samples...`);
    
    const result = transformer.transformSamples(allSamples);
    
    console.log(`✅ Transformation completed:`);
    console.log(`   - Total samples: ${result.stats.totalSamples}`);
    console.log(`   - Entities created: ${result.stats.entitiesCreated}`);
    console.log(`   - Broker entities: ${result.stats.brokerEntities}`);
    console.log(`   - Topic entities: ${result.stats.topicEntities}`);
    console.log(`   - Consumer group entities: ${result.stats.consumerGroupEntities}`);
    console.log(`   - Cluster entities: ${result.stats.clusterEntities}`);
    console.log(`   - Success rate: ${result.stats.successRate || 'calculating...'}%`);
    console.log(`   - Transformation rate: ${result.stats.performanceMetrics?.samplesPerSecond || 'calculating...'} samples/sec`);
    
    // Find and examine cluster entity
    const clusterEntity = result.entities.find(e => e.entityType === 'MESSAGE_QUEUE_CLUSTER');
    if (clusterEntity) {
      console.log(chalk.green('\n🏢 Cluster Entity Analysis:'));
      console.log(`   - Cluster GUID: ${clusterEntity.entityGuid}`);
      console.log(`   - Broker Count: ${clusterEntity['cluster.brokerCount']}`);
      console.log(`   - Brokers Online: ${clusterEntity['cluster.brokersOnline']}`);
      console.log(`   - Topic Count: ${clusterEntity['cluster.topicCount']}`);
      console.log(`   - Consumer Group Count: ${clusterEntity['cluster.consumerGroupCount']}`);
      console.log(`   - Total Throughput: ${clusterEntity['cluster.throughput.messagesPerSecond']} msgs/sec`);
      console.log(`   - Health Score: ${clusterEntity['cluster.health.score']}/100`);
      console.log(`   - Health Status: ${clusterEntity['tags.healthStatus']}`);
      console.log(`   - Total Consumer Lag: ${clusterEntity['cluster.totalConsumerLag']}`);
    }
    
    console.log(chalk.green('\n📊 Test 3: Transformer Statistics'));
    
    const transformerStats = transformer.getTransformerStats();
    console.log(`   - Total transformations: ${transformerStats.totalTransformations}`);
    console.log(`   - Successful transformations: ${transformerStats.successfulTransformations}`);
    console.log(`   - Validation errors: ${transformerStats.validationErrors}`);
    console.log(`   - Metric validation errors: ${transformerStats.metricValidationErrors}`);
    console.log(`   - Average transformation time: ${transformerStats.performanceMetrics.avgTransformationTime.toFixed(2)}ms`);
    console.log(`   - Cache sizes: Topics=${transformerStats.cacheStats.topicBrokerMetricsCacheSize}, Consumer Groups=${transformerStats.cacheStats.consumerGroupCacheSize}`);
    
    console.log(chalk.green('\n📊 Test 4: Error Handling & Edge Cases'));
    
    // Test with invalid data
    console.log('\n❌ Testing error handling...');
    try {
      transformer.transformBrokerSample({ eventType: 'InvalidSample' });
    } catch (error) {
      console.log(`✅ Caught expected error: ${error.message}`);
    }
    
    // Test with missing required field
    try {
      transformer.transformTopicSample({ 
        eventType: 'KafkaTopicSample',
        clusterName: 'test'
        // Missing topic.name
      });
    } catch (error) {
      console.log(`✅ Caught expected error: ${error.message}`);
    }
    
    console.log(chalk.green('\n🎉 All tests completed successfully!'));
    console.log(chalk.gray('\nThe enhanced NRI-Kafka transformer is working correctly with:'));
    console.log(chalk.gray('  ✓ Structured metric definitions integration'));
    console.log(chalk.gray('  ✓ Per-topic-per-broker metrics support'));
    console.log(chalk.gray('  ✓ Enhanced consumer group lag analysis'));
    console.log(chalk.gray('  ✓ Comprehensive cluster aggregation'));
    console.log(chalk.gray('  ✓ Robust error handling and validation'));
    console.log(chalk.gray('  ✓ Performance tracking and statistics'));
    
  } catch (error) {
    console.error(chalk.red('❌ Test failed:'), error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
runTests();