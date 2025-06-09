#!/usr/bin/env node

/**
 * Simple E2E Test
 * 
 * Tests basic platform functionality without running the full platform
 */

const chalk = require('chalk');

console.log(chalk.blue('🧪 Simple E2E Test\n'));

async function testTransformation() {
  console.log(chalk.cyan('1. Testing nri-kafka transformation...'));
  
  try {
    const NriKafkaTransformer = require('./infrastructure/transformers/nri-kafka-transformer');
    const transformer = new NriKafkaTransformer('12345');
    
    // Sample nri-kafka data
    const samples = [
      {
        eventType: 'KafkaBrokerSample',
        'broker.id': '1',
        'broker.bytesInPerSecond': 1024000,
        'broker.bytesOutPerSecond': 512000,
        'broker.messagesInPerSecond': 1000,
        clusterName: 'production-kafka',
        hostname: 'broker-1.example.com',
        entityName: 'broker-1.example.com:kafka',
        timestamp: Date.now()
      },
      {
        eventType: 'KafkaTopicSample',
        'topic.name': 'user.events',
        'topic.bytesInPerSecond': 200000,
        'topic.bytesOutPerSecond': 180000,
        'topic.messagesInPerSecond': 200,
        clusterName: 'production-kafka',
        timestamp: Date.now()
      }
    ];
    
    console.log(chalk.gray('  Input: 2 samples (1 broker, 1 topic)'));
    
    const result = transformer.transformSamples(samples);
    
    console.log(chalk.gray(`  Output: ${result.entities.length} entities`));
    console.log(chalk.gray(`  Errors: ${result.errors.length}`));
    
    // Check entities
    const broker = result.entities.find(e => e.entityType === 'MESSAGE_QUEUE_BROKER');
    const topic = result.entities.find(e => e.entityType === 'MESSAGE_QUEUE_TOPIC');
    const cluster = result.entities.find(e => e.entityType === 'MESSAGE_QUEUE_CLUSTER');
    
    console.log(chalk.gray('\n  Generated entities:'));
    if (broker) {
      console.log(chalk.green(`  ✅ Broker: ${broker.entityGuid}`));
      console.log(chalk.gray(`     - Throughput In: ${broker['broker.bytesInPerSecond']} bytes/sec`));
      console.log(chalk.gray(`     - Messages In: ${broker['broker.messagesInPerSecond']} msgs/sec`));
    }
    
    if (topic) {
      console.log(chalk.green(`  ✅ Topic: ${topic.entityGuid}`));
      console.log(chalk.gray(`     - Name: ${topic.topicName}`));
      console.log(chalk.gray(`     - Throughput: ${topic['topic.bytesInPerSecond']} bytes/sec`));
    }
    
    if (cluster) {
      console.log(chalk.green(`  ✅ Cluster: ${cluster.entityGuid}`));
      console.log(chalk.gray(`     - Name: ${cluster.clusterName}`));
      console.log(chalk.gray(`     - Health: ${cluster['cluster.health.score']}%`));
    }
    
    return result.entities.length === 3;
    
  } catch (error) {
    console.log(chalk.red(`  ❌ Error: ${error.message}`));
    return false;
  }
}

async function testGapDetection() {
  console.log(chalk.cyan('\n2. Testing gap detection...'));
  
  try {
    const GapDetector = require('./core/gap-detector');
    const detector = new GapDetector({ accountId: '12345' });
    
    // Simulate having only 1 broker out of 3
    const infrastructure = [
      {
        entityType: 'MESSAGE_QUEUE_BROKER',
        entityGuid: 'MESSAGE_QUEUE_BROKER|12345|kafka|prod|1',
        brokerId: '1',
        clusterName: 'prod',
        broker: { id: '1' }
      }
    ];
    
    const desired = {
      clusters: [{ name: 'prod', provider: 'kafka' }],
      brokers: [
        { id: 1, clusterName: 'prod' },
        { id: 2, clusterName: 'prod' },
        { id: 3, clusterName: 'prod' }
      ],
      topics: [
        { name: 'events', clusterName: 'prod' },
        { name: 'commands', clusterName: 'prod' }
      ]
    };
    
    const gaps = detector.analyzeGaps(infrastructure, desired);
    
    console.log(chalk.gray('  Infrastructure: 1 broker'));
    console.log(chalk.gray('  Desired: 1 cluster, 3 brokers, 2 topics'));
    console.log(chalk.gray(`\n  Missing entities: ${gaps.missingEntities.length}`));
    
    gaps.missingEntities.forEach(entity => {
      console.log(chalk.yellow(`  ⚠️  Missing ${entity.type}: ${entity.name}`));
    });
    
    console.log(chalk.gray(`\n  Coverage: ${gaps.coverageReport.overall.coverage}%`));
    console.log(chalk.gray(`  - Clusters: ${gaps.coverageReport.clusters.coverage}%`));
    console.log(chalk.gray(`  - Brokers: ${gaps.coverageReport.brokers.coverage}%`));
    console.log(chalk.gray(`  - Topics: ${gaps.coverageReport.topics.coverage}%`));
    
    return gaps.missingEntities.length === 5; // 1 cluster + 2 brokers + 2 topics
    
  } catch (error) {
    console.log(chalk.red(`  ❌ Error: ${error.message}`));
    return false;
  }
}

async function testConfigValidation() {
  console.log(chalk.cyan('\n3. Testing configuration validation...'));
  
  try {
    const ConfigValidator = require('./core/config-validator');
    const validator = new ConfigValidator();
    
    // Test with mock environment
    const originalEnv = { ...process.env };
    process.env.NEW_RELIC_ACCOUNT_ID = '12345';
    process.env.NEW_RELIC_API_KEY = 'test-key';
    
    // Test valid config
    const validResult = validator.validate({
      mode: 'simulation',
      provider: 'kafka'
    });
    
    console.log(chalk.gray('  Valid config test:'));
    console.log(chalk.gray(`    - Valid: ${validResult.valid ? '✅' : '❌'}`));
    console.log(chalk.gray(`    - Errors: ${validResult.errors.length}`));
    console.log(chalk.gray(`    - Warnings: ${validResult.warnings.length}`));
    
    // Test invalid config
    delete process.env.NEW_RELIC_ACCOUNT_ID;
    const invalidResult = validator.validate({
      mode: 'infrastructure'
    });
    
    console.log(chalk.gray('\n  Invalid config test:'));
    console.log(chalk.gray(`    - Valid: ${invalidResult.valid ? '✅' : '❌'}`));
    console.log(chalk.gray(`    - Errors: ${invalidResult.errors.length}`));
    
    if (invalidResult.errors.length > 0) {
      console.log(chalk.gray('\n  Sample error:'));
      const error = invalidResult.errors[0];
      console.log(chalk.red(`    ${error.message}`));
      console.log(chalk.gray(`    Help: ${error.help}`));
    }
    
    // Restore environment
    process.env = originalEnv;
    
    return validResult.valid === true && invalidResult.valid === false;
    
  } catch (error) {
    console.log(chalk.red(`  ❌ Error: ${error.message}`));
    return false;
  }
}

// Run all tests
async function runTests() {
  const results = [];
  
  results.push(await testTransformation());
  results.push(await testGapDetection());
  results.push(await testConfigValidation());
  
  // Summary
  console.log(chalk.blue('\n📊 Test Summary'));
  console.log(chalk.gray('─'.repeat(50)));
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  const percentage = Math.round((passed / total) * 100);
  
  console.log(chalk[percentage === 100 ? 'green' : 'yellow'](
    `${passed}/${total} tests passed (${percentage}%)`
  ));
  
  if (percentage === 100) {
    console.log(chalk.green('\n✅ All tests passed! The platform is working correctly.'));
    console.log(chalk.gray('\nYou can now run:'));
    console.log(chalk.gray('  npm start -- --mode=simulation'));
    console.log(chalk.gray('  npm start -- --mode=infrastructure'));
    console.log(chalk.gray('  npm start -- --mode=hybrid'));
  } else {
    console.log(chalk.yellow('\n⚠️  Some tests failed. Please check the errors above.'));
  }
  
  process.exit(percentage === 100 ? 0 : 1);
}

runTests().catch(console.error);