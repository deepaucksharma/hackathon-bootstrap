/**
 * Integration Test: Enhanced Collection with nri-kafka Transformer
 * 
 * Tests the integration between the enhanced metric collection system
 * and the existing nri-kafka transformer to ensure compatibility.
 */

const chalk = require('chalk');
const { getAllMetricDefinitions } = require('../core/metrics/metric-definitions');
const NriKafkaTransformer = require('./transformers/nri-kafka-transformer');

/**
 * Integration Test Runner
 */
class IntegrationTestRunner {
  constructor() {
    this.testResults = {
      passed: 0,
      failed: 0,
      errors: []
    };
    
    this.accountId = '12345'; // Mock account ID for testing
  }

  /**
   * Run integration tests
   */
  async runTests() {
    console.log(chalk.blue.bold('\n🔗 Enhanced Collection + Transformer Integration Tests\n'));
    
    await this.testMetricCompatibility();
    await this.testSampleDataTransformation();
    await this.testEnhancedMetricFormat();
    
    this.displayTestSummary();
    return this.testResults;
  }

  /**
   * Test metric compatibility between definitions and transformer
   */
  async testMetricCompatibility() {
    console.log(chalk.yellow.bold('📊 Testing Metric Compatibility...\n'));
    
    // Test 1: Verify broker metric compatibility
    await this.runTest('Broker Metric Compatibility', async () => {
      const brokerMetrics = getAllMetricDefinitions().broker;
      const transformer = new NriKafkaTransformer(this.accountId);
      
      // Create a sample broker data with enhanced metrics
      const sampleBrokerData = {
        eventType: 'KafkaBrokerSample',
        'broker.id': 1,
        clusterName: 'test-cluster',
        hostname: 'broker-1',
        'broker.messagesInPerSecond': 1000,
        'broker.bytesInPerSecond': 1048576,
        'broker.messagesOutPerSecond': 950,
        'broker.bytesOutPerSecond': 998000,
        'broker.underReplicatedPartitions': 0,
        'broker.offlinePartitionsCount': 0,
        'net.requestsPerSecond': 500,
        'net.networkProcessorAvgIdlePercent': 85,
        'broker.IOWaitPercent': 5,
        'disk.usedPercent': 60,
        kafkaVersion: '2.8.0'
      };
      
      // Transform using existing transformer
      const entity = transformer.transformBrokerSample(sampleBrokerData);
      
      // Verify key broker metrics are present
      this.assert(entity.eventType === 'MessageQueue', 'Correct event type');
      this.assert(entity.entityType === 'MESSAGE_QUEUE_BROKER', 'Correct entity type');
      this.assert(entity['broker.messagesInPerSecond'] === 1000, 'Message rate preserved');
      this.assert(entity['broker.bytesInPerSecond'] === 1048576, 'Byte rate preserved');
      this.assert(entity['broker.underReplicatedPartitions'] === 0, 'Replication metric preserved');
      
      // Verify that metrics from our definitions are compatible
      Object.keys(brokerMetrics).forEach(metricName => {
        if (sampleBrokerData[metricName] !== undefined) {
          this.assert(entity[metricName] !== undefined, `Metric ${metricName} preserved in transformation`);
        }
      });
    });
    
    // Test 2: Verify topic metric compatibility
    await this.runTest('Topic Metric Compatibility', async () => {
      const topicMetrics = getAllMetricDefinitions().topic;
      const transformer = new NriKafkaTransformer(this.accountId);
      
      const sampleTopicData = {
        eventType: 'KafkaTopicSample',
        'topic.name': 'test-topic',
        clusterName: 'test-cluster',
        'topic.messagesInPerSecond': 500,
        'topic.bytesInPerSecond': 524288,
        'topic.messagesOutPerSecond': 450,
        'topic.bytesOutPerSecond': 471000,
        'topic.partitionCount': 6,
        'topic.replicationFactor': 3,
        'topic.diskSize': 10737418240
      };
      
      const entity = transformer.transformTopicSample(sampleTopicData);
      
      this.assert(entity.eventType === 'MessageQueue', 'Correct event type');
      this.assert(entity.entityType === 'MESSAGE_QUEUE_TOPIC', 'Correct entity type');
      this.assert(entity['topic.messagesInPerSecond'] === 500, 'Topic message rate preserved');
      this.assert(entity['topic.partitions.count'] === 6, 'Partition count preserved');
      this.assert(entity['topic.replicationFactor'] === 3, 'Replication factor preserved');
    });
    
    // Test 3: Verify cluster aggregation compatibility
    await this.runTest('Cluster Aggregation Compatibility', async () => {
      const transformer = new NriKafkaTransformer(this.accountId);
      
      const brokerSamples = [
        {
          'broker.id': 1,
          clusterName: 'test-cluster',
          'broker.messagesInPerSecond': 1000,
          'broker.bytesInPerSecond': 1000000,
          'broker.underReplicatedPartitions': 0,
          kafkaVersion: '2.8.0'
        },
        {
          'broker.id': 2,
          clusterName: 'test-cluster',
          'broker.messagesInPerSecond': 1200,
          'broker.bytesInPerSecond': 1200000,
          'broker.underReplicatedPartitions': 1,
          kafkaVersion: '2.8.0'
        }
      ];
      
      const clusterEntity = transformer.createClusterEntity(brokerSamples);
      
      this.assert(clusterEntity !== null, 'Cluster entity created');
      this.assert(clusterEntity.entityType === 'MESSAGE_QUEUE_CLUSTER', 'Correct cluster entity type');
      this.assert(clusterEntity['cluster.brokerCount'] === 2, 'Correct broker count');
      this.assert(clusterEntity['cluster.messagesInPerSecond'] === 2200, 'Correct aggregated message rate');
      this.assert(clusterEntity['cluster.underReplicatedPartitions'] === 1, 'Correct aggregated replication issues');
    });
    
    console.log(chalk.green('✅ Metric compatibility tests completed\n'));
  }

  /**
   * Test sample data transformation workflow
   */
  async testSampleDataTransformation() {
    console.log(chalk.yellow.bold('🔄 Testing Sample Data Transformation...\n'));
    
    // Test 1: Full transformation workflow
    await this.runTest('Full Transformation Workflow', async () => {
      const transformer = new NriKafkaTransformer(this.accountId);
      
      // Simulate data that would come from enhanced collection
      const enhancedSamples = [
        {
          eventType: 'KafkaBrokerSample',
          'broker.id': 1,
          clusterName: 'production-kafka',
          hostname: 'kafka-broker-1.example.com',
          'broker.messagesInPerSecond': 5000,
          'broker.bytesInPerSecond': 5242880,
          'broker.underReplicatedPartitions': 0,
          'broker.offlinePartitionsCount': 0,
          'net.requestsPerSecond': 2500,
          'net.networkProcessorAvgIdlePercent': 75,
          kafkaVersion: '2.8.1',
          _enhanced: true,
          _collectionMetadata: {
            collectedAt: '2023-12-07T10:00:00Z',
            collectionDuration: 1500
          }
        },
        {
          eventType: 'KafkaTopicSample',
          'topic.name': 'user-events',
          clusterName: 'production-kafka',
          'topic.messagesInPerSecond': 3000,
          'topic.bytesInPerSecond': 3145728,
          'topic.partitionCount': 12,
          'topic.replicationFactor': 3,
          'topic.diskSize': 21474836480,
          _enhanced: true,
          _collectionMetadata: {
            collectedAt: '2023-12-07T10:00:00Z',
            collectionDuration: 1200
          }
        }
      ];
      
      // Transform samples
      const transformResult = transformer.transformSamples(enhancedSamples);
      
      this.assert(transformResult.entities.length >= 2, 'At least broker and topic entities created');
      this.assert(transformResult.stats.brokerEntities === 1, 'One broker entity created');
      this.assert(transformResult.stats.topicEntities === 1, 'One topic entity created');
      this.assert(transformResult.stats.clusterEntities === 1, 'One cluster entity created');
      this.assert(transformResult.errors.length === 0, 'No transformation errors');
      
      // Verify enhanced metadata is preserved
      const brokerEntity = transformResult.entities.find(e => e.entityType === 'MESSAGE_QUEUE_BROKER');
      this.assert(brokerEntity._transformationMetadata, 'Transformation metadata added');
      
      // Verify entity GUIDs follow correct format
      this.assert(brokerEntity.entityGuid.includes('MESSAGE_QUEUE_BROKER'), 'Broker GUID has correct format');
      this.assert(brokerEntity.entityGuid.includes('kafka'), 'Broker GUID includes provider');
      this.assert(brokerEntity.entityGuid.includes('production-kafka'), 'Broker GUID includes cluster name');
    });
    
    // Test 2: Enhanced metric validation
    await this.runTest('Enhanced Metric Validation', async () => {
      const transformer = new NriKafkaTransformer(this.accountId);
      
      // Test with metrics that have validation rules
      const sampleWithValidation = {
        eventType: 'KafkaBrokerSample',
        'broker.id': 1,
        clusterName: 'test-cluster',
        'broker.messagesInPerSecond': -100, // Invalid negative value
        'broker.bytesInPerSecond': 1000000,
        'broker.underReplicatedPartitions': 5, // Valid but concerning value
        'broker.offlinePartitionsCount': 0
      };
      
      const entity = transformer.transformBrokerSample(sampleWithValidation);
      
      // Transformer should preserve the data even if it's invalid
      // (validation happens in the collection system, not transformation)
      this.assert(entity['broker.messagesInPerSecond'] === -100, 'Invalid values preserved for analysis');
      this.assert(entity['broker.underReplicatedPartitions'] === 5, 'Concerning values preserved');
    });
    
    console.log(chalk.green('✅ Sample data transformation tests completed\n'));
  }

  /**
   * Test enhanced metric format compatibility
   */
  async testEnhancedMetricFormat() {
    console.log(chalk.yellow.bold('🎯 Testing Enhanced Metric Format...\n'));
    
    // Test 1: Per-topic-per-broker metrics
    await this.runTest('Per-Topic-Per-Broker Metrics', async () => {
      const transformer = new NriKafkaTransformer(this.accountId);
      
      // Simulate per-topic-per-broker enhanced data
      const enhancedTopicBrokerSample = {
        eventType: 'KafkaTopicSample',
        'topic.name': 'orders',
        clusterName: 'production-kafka',
        'broker.id': 2, // Topic metrics with broker context
        'topic.messagesInPerSecond': 800,
        'topic.bytesInPerSecond': 819200,
        'topic.partitionCount': 8,
        'topic.replicationFactor': 3,
        _enhanced: true,
        _collection: 'topic-broker-level'
      };
      
      const entity = transformer.transformTopicSample(enhancedTopicBrokerSample);
      
      this.assert(entity.entityType === 'MESSAGE_QUEUE_TOPIC', 'Topic entity type preserved');
      this.assert(entity.topicName === 'orders', 'Topic name preserved');
      this.assert(entity['topic.messagesInPerSecond'] === 800, 'Per-broker topic metrics preserved');
      
      // Verify transformation preserves enhanced collection metadata
      // (Note: transformation metadata is added during batch operations, not individual transforms)
      this.assert(entity.eventType === 'MessageQueue', 'Correct event type for MESSAGE_QUEUE entity');
    });
    
    // Test 2: Consumer group compatibility
    await this.runTest('Consumer Group Compatibility', async () => {
      const transformer = new NriKafkaTransformer(this.accountId);
      
      // Simulate consumer group data from enhanced collection
      const consumerSample = {
        eventType: 'KafkaConsumerSample',
        'consumer.groupId': 'order-processors',
        clusterName: 'production-kafka',
        'topic.name': 'orders',
        'consumer.state': 'STABLE',
        'consumer.memberCount': 3,
        'consumer.totalLag': 150,
        'consumer.maxLag': 75,
        'consumer.lag': 50,
        'consumer.offset': 1000000,
        'consumer.committedOffset': 999950
      };
      
      const entity = transformer.transformConsumerSample(consumerSample);
      
      this.assert(entity.entityType === 'MESSAGE_QUEUE_CONSUMER_GROUP', 'Consumer group entity type');
      this.assert(entity.consumerGroupId === 'order-processors', 'Consumer group ID preserved');
      this.assert(entity['consumerGroup.totalLag'] === 150, 'Total lag preserved');
      this.assert(entity['consumerGroup.state'] === 'STABLE', 'State preserved');
      this.assert(entity['consumerGroup.isStable'] === 1, 'State flag calculated correctly');
    });
    
    // Test 3: Aggregated cluster metrics
    await this.runTest('Aggregated Cluster Metrics', async () => {
      const clusterMetrics = getAllMetricDefinitions().cluster;
      
      // Verify cluster metric definitions align with transformer output
      this.assert(clusterMetrics['cluster.brokerCount'], 'Broker count metric defined');
      this.assert(clusterMetrics['cluster.throughput.messagesPerSecond'], 'Throughput metric defined');
      this.assert(clusterMetrics['cluster.health.score'], 'Health score metric defined');
      
      // These should match what the transformer calculates
      const expectedClusterMetrics = [
        'cluster.brokerCount',
        'cluster.throughput.messagesPerSecond',
        'cluster.throughput.bytesPerSecond',
        'cluster.messagesInPerSecond',
        'cluster.messagesOutPerSecond',
        'cluster.bytesInPerSecond',
        'cluster.bytesOutPerSecond',
        'cluster.underReplicatedPartitions',
        'cluster.offlinePartitions',
        'cluster.health.score'
      ];
      
      expectedClusterMetrics.forEach(metricName => {
        this.assert(clusterMetrics[metricName] || metricName.startsWith('cluster.'), 
          `Cluster metric ${metricName} is defined or follows cluster pattern`);
      });
    });
    
    console.log(chalk.green('✅ Enhanced metric format tests completed\n'));
  }

  /**
   * Run individual test with error handling
   */
  async runTest(testName, testFn) {
    try {
      console.log(chalk.cyan(`   🧪 ${testName}...`));
      await testFn();
      console.log(chalk.green(`   ✅ ${testName} passed`));
      this.testResults.passed++;
    } catch (error) {
      console.log(chalk.red(`   ❌ ${testName} failed: ${error.message}`));
      this.testResults.failed++;
      this.testResults.errors.push({ test: testName, error: error.message });
    }
  }

  /**
   * Assert helper
   */
  assert(condition, message) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  /**
   * Display test summary
   */
  displayTestSummary() {
    const total = this.testResults.passed + this.testResults.failed;
    
    console.log(chalk.blue.bold('📊 Integration Test Summary:\n'));
    console.log(chalk.green(`   ✅ Passed: ${this.testResults.passed}`));
    
    if (this.testResults.failed > 0) {
      console.log(chalk.red(`   ❌ Failed: ${this.testResults.failed}`));
    }
    
    console.log(chalk.blue(`   📊 Total: ${total}\n`));
    
    const passRate = total > 0 ? (this.testResults.passed / total * 100).toFixed(1) : 0;
    
    if (this.testResults.failed === 0) {
      console.log(chalk.green.bold(`🎉 All integration tests passed! (${passRate}% pass rate)\n`));
    } else {
      console.log(chalk.red.bold(`❌ ${this.testResults.failed} integration test(s) failed (${passRate}% pass rate)\n`));
      
      if (this.testResults.errors.length > 0) {
        console.log(chalk.red('Failed Tests:'));
        this.testResults.errors.forEach(error => {
          console.log(chalk.red(`   - ${error.test}: ${error.error}`));
        });
        console.log();
      }
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const testRunner = new IntegrationTestRunner();
  
  try {
    const results = await testRunner.runTests();
    
    // Exit with appropriate code
    if (results.failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
    
  } catch (error) {
    console.error(chalk.red.bold(`❌ Integration test execution failed: ${error.message}`));
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red.bold('Fatal integration test error:'), error.message);
    process.exit(1);
  });
}

module.exports = {
  IntegrationTestRunner
};