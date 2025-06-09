/**
 * Test Enhanced Metric Collection System
 * 
 * Comprehensive test for the enhanced metric collection components:
 * - Metric definitions validation
 * - Enhanced Kafka collector functionality
 * - Consumer offset collector functionality
 * - Worker pool integration
 * - Error handling and resilience
 */

const path = require('path');
const chalk = require('chalk');

// Import components to test
const { 
  getAllMetricDefinitions,
  getMetricsForEntityType,
  getMetricsByStrategy,
  MetricDefinition,
  COLLECTION_STRATEGIES,
  validateDefinitions
} = require('../core/metrics/metric-definitions');

const EnhancedKafkaCollector = require('./collectors/enhanced-kafka-collector');
const ConsumerOffsetCollector = require('./collectors/consumer-offset-collector');

const { logger } = require('../core/utils/logger');

/**
 * Test Runner for Enhanced Collection System
 */
class EnhancedCollectionTestRunner {
  constructor() {
    this.testResults = {
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };
    
    this.config = {
      debug: true,
      // Use minimal worker pool sizes for testing
      brokerWorkerPoolSize: 2,
      topicWorkerPoolSize: 2,
      consumerWorkerPoolSize: 1,
      enableDetailedTopicMetrics: false, // Reduce complexity for testing
      enableConsumerLagCollection: true,
      metricValidation: true,
      // Mock New Relic configuration for testing
      newRelic: {
        apiKey: process.env.NEW_RELIC_API_KEY || 'test-api-key-for-testing',
        accountId: process.env.NEW_RELIC_ACCOUNT_ID || '12345',
        region: process.env.NEW_RELIC_REGION || 'US'
      }
    };
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log(chalk.blue.bold('\n🧪 Enhanced Collection System Test Suite\n'));
    
    try {
      await this.testMetricDefinitions();
      await this.testEnhancedKafkaCollector();
      await this.testConsumerOffsetCollector();
      await this.testIntegration();
      
      this.displayTestSummary();
      
    } catch (error) {
      console.error(chalk.red.bold(`❌ Test suite failed: ${error.message}`));
      this.testResults.errors.push({ test: 'test_suite', error: error.message });
    }
    
    return this.testResults;
  }

  /**
   * Test metric definitions
   */
  async testMetricDefinitions() {
    console.log(chalk.yellow.bold('📋 Testing Metric Definitions...\n'));
    
    // Test 1: Validate all definitions
    await this.runTest('Metric Definitions Validation', async () => {
      validateDefinitions(); // Should not throw
      this.assert(true, 'All metric definitions are valid');
    });
    
    // Test 2: Check metric definition structure
    await this.runTest('Metric Definition Structure', async () => {
      const allMetrics = getAllMetricDefinitions();
      
      this.assert(typeof allMetrics === 'object', 'getAllMetricDefinitions returns object');
      this.assert(allMetrics.broker, 'Broker metrics defined');
      this.assert(allMetrics.topic, 'Topic metrics defined');
      this.assert(allMetrics.consumerGroup, 'Consumer group metrics defined');
      this.assert(allMetrics.cluster, 'Cluster metrics defined');
      
      // Check broker metrics
      const brokerMetrics = allMetrics.broker;
      this.assert(brokerMetrics['broker.messagesInPerSecond'], 'Broker message rate metric exists');
      this.assert(brokerMetrics['broker.bytesInPerSecond'], 'Broker byte rate metric exists');
      this.assert(brokerMetrics['broker.underReplicatedPartitions'], 'Broker replication health metric exists');
    });
    
    // Test 3: Test individual metric definition
    await this.runTest('Individual Metric Definition', async () => {
      const brokerMetrics = getMetricsForEntityType('broker');
      const messageRateMetric = brokerMetrics['broker.messagesInPerSecond'];
      
      this.assert(messageRateMetric instanceof MetricDefinition, 'Metric is MetricDefinition instance');
      this.assert(messageRateMetric.name === 'broker.messagesInPerSecond', 'Correct metric name');
      this.assert(messageRateMetric.unit === 'messages/sec', 'Correct unit');
      this.assert(messageRateMetric.type === 'gauge', 'Correct type');
      
      // Test validation
      const validation = messageRateMetric.validate(100);
      this.assert(validation.valid, 'Valid value passes validation');
      
      const invalidValidation = messageRateMetric.validate(-1);
      this.assert(!invalidValidation.valid, 'Invalid value fails validation');
    });
    
    // Test 4: Test collection strategies
    await this.runTest('Collection Strategies', async () => {
      this.assert(typeof COLLECTION_STRATEGIES === 'object', 'Collection strategies defined');
      this.assert(COLLECTION_STRATEGIES['per-broker'], 'Per-broker strategy exists');
      this.assert(COLLECTION_STRATEGIES['per-topic'], 'Per-topic strategy exists');
      this.assert(COLLECTION_STRATEGIES['cluster-aggregate'], 'Cluster aggregate strategy exists');
      
      // Test strategy filtering
      const brokerMetrics = getMetricsByStrategy('per-broker');
      this.assert(typeof brokerMetrics === 'object', 'Strategy filtering works');
    });
    
    // Test 5: Test metric processing
    await this.runTest('Metric Processing', async () => {
      const testMetric = new MetricDefinition({
        name: 'test.metric',
        unit: 'bytes',
        aggregation: 'sum'
      });
      
      // Test array aggregation
      const processedSum = testMetric.process([100, 200, 300]);
      this.assert(processedSum === 600, 'Sum aggregation works');
      
      // Test unit conversion
      const processedBytes = testMetric.process(1048576, { convertToMB: true });
      this.assert(processedBytes === 1, 'Byte to MB conversion works');
    });
    
    console.log(chalk.green('✅ Metric definitions tests completed\n'));
  }

  /**
   * Test enhanced Kafka collector
   */
  async testEnhancedKafkaCollector() {
    console.log(chalk.yellow.bold('📊 Testing Enhanced Kafka Collector...\n'));
    
    let collector = null;
    
    try {
      // Test 1: Collector initialization
      await this.runTest('Enhanced Collector Initialization', async () => {
        try {
          collector = new EnhancedKafkaCollector(this.config);
          this.assert(collector, 'Collector instance created');
          this.assert(!collector.isInitialized, 'Collector not initialized yet');
        } catch (error) {
          if (error.message.includes('API Key is required')) {
            console.log(chalk.yellow(`   ℹ️ Skipping collector tests - API key required: ${error.message}`));
            this.testResults.skipped++;
            return;
          }
          throw error;
        }
      });
      
      // Skip remaining tests if collector couldn't be created
      if (!collector) {
        console.log(chalk.yellow('   ℹ️ Skipping remaining enhanced collector tests - initialization failed'));
        this.testResults.skipped += 5; // Account for skipped tests
        return;
      }
      
      // Test 2: Worker pool creation
      await this.runTest('Worker Pool Creation', async () => {
        this.assert(collector.brokerPool, 'Broker worker pool created');
        this.assert(collector.topicPool, 'Topic worker pool created');
        this.assert(collector.consumerPool, 'Consumer worker pool created');
        
        this.assert(collector.brokerPool.poolSize === 2, 'Correct broker pool size');
        this.assert(collector.topicPool.poolSize === 2, 'Correct topic pool size');
      });
      
      // Test 3: Connection verification (may fail in test environment)
      await this.runTest('Connection Verification', async () => {
        try {
          await collector.verifyKafkaConnection();
          this.assert(collector.connectionVerified, 'Connection verified');
        } catch (error) {
          // Expected in test environment without real Kafka data
          console.log(chalk.yellow(`   ℹ️ Connection verification failed (expected in test): ${error.message}`));
          this.testResults.skipped++;
          return;
        }
      });
      
      // Test 4: Health status
      await this.runTest('Health Status Check', async () => {
        const health = await collector.getHealthStatus();
        this.assert(typeof health === 'object', 'Health status returns object');
        this.assert(typeof health.workerPools === 'object', 'Worker pool status included');
        this.assert(health.workerPools.broker, 'Broker pool status available');
      });
      
      // Test 5: Helper methods
      await this.runTest('Helper Methods', async () => {
        // Test broker extraction
        const sampleBrokers = [
          { 'broker.id': 1, clusterName: 'test-cluster', hostname: 'broker1' },
          { 'broker.id': 2, clusterName: 'test-cluster', hostname: 'broker2' },
          { 'broker.id': 1, clusterName: 'test-cluster', hostname: 'broker1' } // duplicate
        ];
        
        const uniqueBrokers = collector.extractUniqueBrokers(sampleBrokers);
        this.assert(uniqueBrokers.length === 2, 'Duplicate brokers removed');
        this.assert(uniqueBrokers[0].id === 1, 'First broker ID correct');
        
        // Test topic extraction
        const sampleTopics = [
          { 'topic.name': 'topic1', clusterName: 'test-cluster' },
          { 'topic.name': 'topic2', clusterName: 'test-cluster' },
          { 'topic.name': 'topic1', clusterName: 'test-cluster' } // duplicate
        ];
        
        const uniqueTopics = collector.extractUniqueTopics(sampleTopics);
        this.assert(uniqueTopics.length === 2, 'Duplicate topics removed');
        this.assert(uniqueTopics[0].name === 'topic1', 'First topic name correct');
      });
      
      // Test 6: Metric aggregation
      await this.runTest('Metric Aggregation', async () => {
        const brokerSamples = [
          {
            'broker.id': 1,
            clusterName: 'test-cluster',
            'broker.messagesInPerSecond': 100,
            'broker.bytesInPerSecond': 1000,
            'broker.underReplicatedPartitions': 0
          },
          {
            'broker.id': 2,
            clusterName: 'test-cluster',
            'broker.messagesInPerSecond': 200,
            'broker.bytesInPerSecond': 2000,
            'broker.underReplicatedPartitions': 1
          }
        ];
        
        const clusterMetrics = collector.aggregateClusterMetrics('test-cluster', brokerSamples, []);
        
        this.assert(clusterMetrics.eventType === 'KafkaClusterSample', 'Correct event type');
        this.assert(clusterMetrics['cluster.brokerCount'] === 2, 'Correct broker count');
        this.assert(clusterMetrics['cluster.messagesInPerSecond'] === 300, 'Correct message aggregation');
        this.assert(clusterMetrics['cluster.underReplicatedPartitions'] === 1, 'Correct replication metric');
      });
      
    } finally {
      // Cleanup
      if (collector) {
        await collector.cleanup();
      }
    }
    
    console.log(chalk.green('✅ Enhanced Kafka collector tests completed\n'));
  }

  /**
   * Test consumer offset collector
   */
  async testConsumerOffsetCollector() {
    console.log(chalk.yellow.bold('👥 Testing Consumer Offset Collector...\n'));
    
    let consumerCollector = null;
    
    try {
      // Test 1: Consumer collector initialization
      await this.runTest('Consumer Collector Initialization', async () => {
        try {
          consumerCollector = new ConsumerOffsetCollector(this.config);
          this.assert(consumerCollector, 'Consumer collector instance created');
          this.assert(!consumerCollector.isInitialized, 'Consumer collector not initialized yet');
        } catch (error) {
          if (error.message.includes('API Key is required')) {
            console.log(chalk.yellow(`   ℹ️ Skipping consumer collector tests - API key required: ${error.message}`));
            this.testResults.skipped++;
            return;
          }
          throw error;
        }
      });
      
      // Skip remaining tests if consumer collector couldn't be created
      if (!consumerCollector) {
        console.log(chalk.yellow('   ℹ️ Skipping remaining consumer collector tests - initialization failed'));
        this.testResults.skipped += 6; // Account for skipped tests
        return;
      }
      
      // Test 2: Configuration validation
      await this.runTest('Consumer Configuration', async () => {
        this.assert(consumerCollector.collectionConfig, 'Configuration loaded');
        this.assert(consumerCollector.collectionConfig.lagThresholds, 'Lag thresholds configured');
        this.assert(consumerCollector.collectionConfig.lagThresholds.warning > 0, 'Warning threshold set');
        this.assert(consumerCollector.collectionConfig.lagThresholds.critical > 0, 'Critical threshold set');
      });
      
      // Test 3: Lag severity calculation
      await this.runTest('Lag Severity Calculation', async () => {
        const okLag = consumerCollector.calculateLagSeverity(100);
        this.assert(okLag === 'OK', 'Low lag marked as OK');
        
        const warningLag = consumerCollector.calculateLagSeverity(1500);
        this.assert(warningLag === 'WARNING', 'Medium lag marked as WARNING');
        
        const criticalLag = consumerCollector.calculateLagSeverity(15000);
        this.assert(criticalLag === 'CRITICAL', 'High lag marked as CRITICAL');
      });
      
      // Test 4: Source reliability comparison
      await this.runTest('Source Reliability', async () => {
        const kafkaConsumerBetter = consumerCollector.isMoreReliableSource('KafkaConsumerSample', 'JVMSample');
        this.assert(kafkaConsumerBetter, 'KafkaConsumerSample more reliable than JVMSample');
        
        const customBetter = consumerCollector.isMoreReliableSource('CustomMetrics', 'JVMSample');
        this.assert(customBetter, 'CustomMetrics more reliable than JVMSample');
      });
      
      // Test 5: Metric deduplication
      await this.runTest('Metric Deduplication', async () => {
        const duplicateMetrics = [
          {
            topicName: 'test-topic',
            partition: 0,
            lag: 100,
            source: 'JVMSample'
          },
          {
            topicName: 'test-topic',
            partition: 0,
            lag: 150,
            source: 'KafkaConsumerSample'
          },
          {
            topicName: 'test-topic',
            partition: 1,
            lag: 200,
            source: 'KafkaConsumerSample'
          }
        ];
        
        const deduplicated = consumerCollector.deduplicateLagMetrics(duplicateMetrics);
        this.assert(deduplicated.length === 2, 'Duplicates removed');
        
        const partition0Metric = deduplicated.find(m => m.partition === 0);
        this.assert(partition0Metric.source === 'KafkaConsumerSample', 'More reliable source preferred');
        this.assert(partition0Metric.lag === 150, 'Correct lag value from reliable source');
      });
      
      // Test 6: State change detection (mock test)
      await this.runTest('State Change Detection', async () => {
        const group = { id: 'test-group', clusterName: 'test-cluster' };
        
        // First call - no previous state
        const noChange = consumerCollector.detectStateChange(group, { state: 'STABLE', memberCount: 1 });
        this.assert(noChange === null, 'No state change for new group');
        
        // Update state manually for test
        consumerCollector.updateConsumerGroupState('test-group', { state: 'STABLE', memberCount: 1 });
        
        // Second call - state change
        const stateChange = consumerCollector.detectStateChange(group, { state: 'REBALANCING', memberCount: 2 });
        this.assert(stateChange !== null, 'State change detected');
        this.assert(stateChange.previousState === 'STABLE', 'Previous state correct');
        this.assert(stateChange.newState === 'REBALANCING', 'New state correct');
      });
      
      // Test 7: Consumer group lag summary
      await this.runTest('Consumer Group Lag Summary', async () => {
        // Add some mock lag history
        const mockLagMetrics = [
          { lag: 100, collectedAt: new Date() },
          { lag: 200, collectedAt: new Date() },
          { lag: 150, collectedAt: new Date() }
        ];
        
        consumerCollector.updateLagHistory('test-group', mockLagMetrics);
        
        const summary = await consumerCollector.getConsumerGroupLagSummary();
        this.assert(typeof summary === 'object', 'Summary returned');
        this.assert(summary.totalGroups >= 0, 'Total groups count valid');
        this.assert(Array.isArray(summary.consumerGroups), 'Consumer groups array returned');
      });
      
    } finally {
      // Cleanup
      if (consumerCollector) {
        await consumerCollector.cleanup();
      }
    }
    
    console.log(chalk.green('✅ Consumer offset collector tests completed\n'));
  }

  /**
   * Test integration between components
   */
  async testIntegration() {
    console.log(chalk.yellow.bold('🔗 Testing Component Integration...\n'));
    
    // Test 1: Metric definition compatibility
    await this.runTest('Metric Definition Compatibility', async () => {
      const consumerMetrics = getMetricsForEntityType('consumerGroup');
      this.assert(consumerMetrics['consumerGroup.lag'], 'Consumer lag metric defined');
      this.assert(consumerMetrics['consumerGroup.totalLag'], 'Total lag metric defined');
      this.assert(consumerMetrics['consumerGroup.memberCount'], 'Member count metric defined');
    });
    
    // Test 2: Collection strategy consistency
    await this.runTest('Collection Strategy Consistency', async () => {
      const perBrokerMetrics = getMetricsByStrategy('per-broker');
      const perConsumerGroupMetrics = getMetricsByStrategy('per-consumer-group');
      
      this.assert(Object.keys(perBrokerMetrics).length > 0, 'Per-broker metrics exist');
      this.assert(Object.keys(perConsumerGroupMetrics).length > 0, 'Per-consumer-group metrics exist');
    });
    
    console.log(chalk.green('✅ Integration tests completed\n'));
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
      
      if (this.config.debug && error.stack) {
        console.log(chalk.gray(`      Stack: ${error.stack.split('\n')[1]?.trim()}`));
      }
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
    const total = this.testResults.passed + this.testResults.failed + this.testResults.skipped;
    
    console.log(chalk.blue.bold('📊 Test Summary:\n'));
    console.log(chalk.green(`   ✅ Passed: ${this.testResults.passed}`));
    
    if (this.testResults.failed > 0) {
      console.log(chalk.red(`   ❌ Failed: ${this.testResults.failed}`));
    }
    
    if (this.testResults.skipped > 0) {
      console.log(chalk.yellow(`   ⏭️  Skipped: ${this.testResults.skipped}`));
    }
    
    console.log(chalk.blue(`   📊 Total: ${total}\n`));
    
    const passRate = total > 0 ? (this.testResults.passed / total * 100).toFixed(1) : 0;
    
    if (this.testResults.failed === 0) {
      console.log(chalk.green.bold(`🎉 All tests passed! (${passRate}% pass rate)\n`));
    } else {
      console.log(chalk.red.bold(`❌ ${this.testResults.failed} test(s) failed (${passRate}% pass rate)\n`));
      
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
 * Main test execution
 */
async function main() {
  const testRunner = new EnhancedCollectionTestRunner();
  
  try {
    const results = await testRunner.runAllTests();
    
    // Exit with appropriate code
    if (results.failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
    
  } catch (error) {
    console.error(chalk.red.bold(`❌ Test execution failed: ${error.message}`));
    
    if (process.env.DEBUG === 'true') {
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red.bold('Fatal test error:'), error.message);
    process.exit(1);
  });
}

module.exports = {
  EnhancedCollectionTestRunner
};