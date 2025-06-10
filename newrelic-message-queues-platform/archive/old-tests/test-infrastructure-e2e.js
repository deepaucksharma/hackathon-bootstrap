#!/usr/bin/env node

/**
 * End-to-End Test for Infrastructure Mode
 * 
 * This test verifies that infrastructure mode works correctly by:
 * 1. Setting up the platform in infrastructure mode
 * 2. Simulating nri-kafka data input
 * 3. Verifying entity creation and transformation
 * 4. Checking GUID consistency and event type correctness
 */

const chalk = require('chalk');
const Platform = require('./platform');
const NriKafkaTransformer = require('./infrastructure/transformers/nri-kafka-transformer');

// Mock New Relic API responses for testing
const mockNrdbData = [
  {
    eventType: 'KafkaBrokerSample',
    'broker.id': 1,
    'broker.bytesInPerSecond': 1024000,
    'broker.bytesOutPerSecond': 512000,
    'broker.messagesInPerSecond': 100,
    'broker.messagesOutPerSecond': 95,
    'broker.cpuPercent': 45.2,
    'broker.JVMMemoryUsedPercent': 60.1,
    'broker.diskUsedPercent': 35.8,
    'broker.networkProcessorIdlePercent': 75.5,
    'broker.requestHandlerIdlePercent': 80.2,
    'broker.underReplicatedPartitions': 0,
    'broker.offlinePartitions': 0,
    'broker.requestsPerSecond': 250,
    'broker.leaderElectionRate': 0.0,
    'broker.uncleanLeaderElections': 0,
    clusterName: 'test-cluster',
    kafkaVersion: '2.8.1',
    hostname: 'kafka-broker-1',
    timestamp: Date.now()
  },
  {
    eventType: 'KafkaTopicSample',
    'topic.name': 'test-topic',
    'topic.bytesInPerSecond': 204800,
    'topic.bytesOutPerSecond': 153600,
    'topic.messagesInPerSecond': 20,
    'topic.messagesOutPerSecond': 18,
    'topic.fetchRequestsPerSecond': 15,
    'topic.produceRequestsPerSecond': 20,
    'topic.partitionCount': 3,
    'topic.replicationFactor': 2,
    'topic.underReplicatedPartitions': 0,
    'topic.diskSize': 104857600, // 100MB
    'topic.retentionMs': 604800000, // 7 days
    clusterName: 'test-cluster',
    timestamp: Date.now()
  }
];

async function runE2ETest() {
  console.log(chalk.blue('\n🧪 Running Infrastructure Mode End-to-End Test\n'));
  
  const testResults = {
    passed: 0,
    failed: 0,
    tests: []
  };
  
  function addTestResult(name, success, details = '') {
    testResults.tests.push({ name, success, details });
    if (success) {
      testResults.passed++;
      console.log(chalk.green(`✓ ${name}`));
    } else {
      testResults.failed++;
      console.log(chalk.red(`✗ ${name}: ${details}`));
    }
    if (details && success) {
      console.log(chalk.gray(`  ${details}`));
    }
  }
  
  try {
    // Test 1: Transformer functionality
    console.log(chalk.cyan('\n📋 Testing Data Transformation'));
    
    const accountId = '12345';
    const transformer = new NriKafkaTransformer(accountId);
    
    // Test broker transformation
    const brokerSample = mockNrdbData[0];
    const brokerResult = transformer.transformBrokerSample(brokerSample);
    
    const expectedBrokerGuid = `MESSAGE_QUEUE_BROKER|${accountId}|kafka|test-cluster|broker-1`;
    const brokerGuidMatch = brokerResult.entityGuid === expectedBrokerGuid;
    addTestResult(
      'Broker GUID generation',
      brokerGuidMatch,
      brokerGuidMatch ? `GUID: ${brokerResult.entityGuid}` : `Expected: ${expectedBrokerGuid}, Got: ${brokerResult.entityGuid}`
    );
    
    const brokerEventTypeMatch = brokerResult.eventType === 'MESSAGE_QUEUE_BROKER_SAMPLE';
    addTestResult(
      'Broker event type',
      brokerEventTypeMatch,
      brokerEventTypeMatch ? 'Uses correct MESSAGE_QUEUE_BROKER_SAMPLE' : `Got: ${brokerResult.eventType}`
    );
    
    const brokerMetricsPresent = brokerResult['broker.bytesInPerSecond'] === 1024000;
    addTestResult(
      'Broker metrics transformation',
      brokerMetricsPresent,
      brokerMetricsPresent ? 'Throughput metrics correctly transformed' : 'Missing or incorrect throughput metrics'
    );
    
    // Test topic transformation
    const topicSample = mockNrdbData[1];
    const topicResult = transformer.transformTopicSample(topicSample);
    
    const expectedTopicGuid = `MESSAGE_QUEUE_TOPIC|${accountId}|kafka|test-cluster|test-topic`;
    const topicGuidMatch = topicResult.entityGuid === expectedTopicGuid;
    addTestResult(
      'Topic GUID generation',
      topicGuidMatch,
      topicGuidMatch ? `GUID: ${topicResult.entityGuid}` : `Expected: ${expectedTopicGuid}, Got: ${topicResult.entityGuid}`
    );
    
    const topicEventTypeMatch = topicResult.eventType === 'MESSAGE_QUEUE_TOPIC_SAMPLE';
    addTestResult(
      'Topic event type',
      topicEventTypeMatch,
      topicEventTypeMatch ? 'Uses correct MESSAGE_QUEUE_TOPIC_SAMPLE' : `Got: ${topicResult.eventType}`
    );
    
    // Test 2: Full batch transformation
    console.log(chalk.cyan('\n📦 Testing Batch Transformation'));
    
    const batchResult = transformer.transformSamples(mockNrdbData);
    const expectedEntityCount = 3; // 1 broker + 1 topic + 1 cluster
    const actualEntityCount = batchResult.stats.entitiesCreated;
    
    addTestResult(
      'Batch entity creation',
      actualEntityCount === expectedEntityCount,
      `Created ${actualEntityCount} entities (expected ${expectedEntityCount})`
    );
    
    const noErrors = batchResult.stats.transformationErrors === 0;
    addTestResult(
      'No transformation errors',
      noErrors,
      noErrors ? 'All samples transformed successfully' : `${batchResult.stats.transformationErrors} errors occurred`
    );
    
    // Test 3: Platform initialization
    console.log(chalk.cyan('\n🏗️  Testing Platform Setup'));
    
    // Use minimal config for testing
    const testConfig = {
      mode: 'infrastructure',
      accountId: accountId,
      provider: 'kafka',
      interval: 30, // Fixed: Use seconds instead of milliseconds
      continuous: false,
      apiEnabled: false,
      useEnhancedCollector: false
    };
    
    const platform = new Platform(testConfig);
    
    addTestResult(
      'Platform initialization',
      platform !== null,
      'Platform created with infrastructure mode config'
    );
    
    addTestResult(
      'Config validation',
      platform.options.mode === 'infrastructure',
      `Mode set to: ${platform.options.mode}`
    );
    
    // Test 4: Configuration validation
    console.log(chalk.cyan('\n🔧 Testing Configuration Validation'));
    
    const configValidator = require('./core/config-validator');
    const validator = new configValidator();
    
    const validConfig = {
      mode: 'infrastructure',
      accountId: '12345',
      provider: 'kafka',
      apiKey: 'TEST-api-key-placeholder'
    };
    
    const validationResult = validator.validate(validConfig);
    const configValid = validationResult.isValid || validationResult.errors.length === 0;
    
    addTestResult(
      'Configuration validation',
      configValid,
      configValid ? 'Valid infrastructure config accepted' : `Validation errors: ${JSON.stringify(validationResult.errors)}`
    );
    
    // Test invalid config
    const invalidConfig = {
      mode: 'infrastructure'
      // Missing required fields
    };
    
    const invalidResult = validator.validate(invalidConfig);
    const correctlyRejectsInvalid = !invalidResult.isValid;
    
    addTestResult(
      'Invalid config rejection',
      correctlyRejectsInvalid,
      correctlyRejectsInvalid ? 'Invalid config properly rejected' : 'Should have rejected invalid config'
    );
    
    // Test 5: Entity framework consistency
    console.log(chalk.cyan('\n🏗️  Testing Entity Framework'));
    
    const EntityFactory = require('./core/entities/entity-factory');
    const factory = new EntityFactory();
    
    // Create a broker entity and verify GUID consistency
    const brokerEntity = factory.createBroker({
      name: 'test-broker-1',
      accountId: accountId,
      provider: 'kafka',
      brokerId: 1,
      hostname: 'kafka-broker-1',
      clusterName: 'test-cluster'
    });
    
    const entityGuidMatch = brokerEntity.guid.startsWith('MESSAGE_QUEUE_BROKER|12345|kafka');
    addTestResult(
      'Entity factory GUID consistency',
      entityGuidMatch,
      entityGuidMatch ? `Entity GUID: ${brokerEntity.guid}` : `Unexpected GUID format: ${brokerEntity.guid}`
    );
    
    const eventPayload = brokerEntity.toEventPayload();
    const entityEventTypeMatch = eventPayload.eventType === 'MESSAGE_QUEUE_BROKER_SAMPLE';
    addTestResult(
      'Entity event type consistency',
      entityEventTypeMatch,
      entityEventTypeMatch ? 'Entity uses correct event type' : `Got: ${eventPayload.eventType}`
    );
    
  } catch (error) {
    addTestResult(
      'Test execution',
      false,
      `Test failed with error: ${error.message}`
    );
    console.error(chalk.red('\n❌ Test execution failed:'), error);
  }
  
  // Print final results
  console.log(chalk.blue('\n📊 Test Results Summary:'));
  console.log(`   • Total Tests: ${testResults.tests.length}`);
  console.log(`   • Passed: ${chalk.green(testResults.passed)}`);
  console.log(`   • Failed: ${chalk.red(testResults.failed)}`);
  console.log(`   • Success Rate: ${((testResults.passed / testResults.tests.length) * 100).toFixed(1)}%`);
  
  if (testResults.failed > 0) {
    console.log(chalk.yellow('\n⚠️  Failed Tests:'));
    testResults.tests
      .filter(test => !test.success)
      .forEach(test => {
        console.log(chalk.red(`   • ${test.name}: ${test.details}`));
      });
  }
  
  const allTestsPassed = testResults.failed === 0;
  if (allTestsPassed) {
    console.log(chalk.green('\n✅ All tests passed! Infrastructure mode is working correctly.\n'));
  } else {
    console.log(chalk.red('\n❌ Some tests failed. Please review the issues above.\n'));
  }
  
  return {
    success: allTestsPassed,
    results: testResults
  };
}

// Run the test if called directly
if (require.main === module) {
  runE2ETest()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error(chalk.red('Test runner failed:'), error);
      process.exit(1);
    });
}

module.exports = { runE2ETest, mockNrdbData };