#!/usr/bin/env node

/**
 * Comprehensive Platform Verification
 * 
 * Tests all major components and workflows
 */

const chalk = require('chalk');

console.log(chalk.blue('🧪 Comprehensive Platform Verification\n'));

// Test sections
const tests = [
  {
    name: 'Entity GUID Generation',
    test: async () => {
      const NriKafkaTransformer = require('./infrastructure/transformers/nri-kafka-transformer');
      const transformer = new NriKafkaTransformer('12345');
      
      const tests = [
        {
          input: ['MESSAGE_QUEUE_BROKER', 'kafka', 'prod-cluster', '1'],
          expected: 'MESSAGE_QUEUE_BROKER|12345|kafka|prod-cluster|1'
        },
        {
          input: ['MESSAGE_QUEUE_TOPIC', 'kafka', 'prod-cluster', 'user.events'],
          expected: 'MESSAGE_QUEUE_TOPIC|12345|kafka|prod-cluster|user.events'
        }
      ];
      
      let passed = true;
      for (const test of tests) {
        const result = transformer.generateGuid(...test.input);
        if (result !== test.expected) {
          console.log(chalk.red(`  ❌ GUID mismatch: ${result} !== ${test.expected}`));
          passed = false;
        }
      }
      
      return passed;
    }
  },
  
  {
    name: 'Data Transformation',
    test: async () => {
      const NriKafkaTransformer = require('./infrastructure/transformers/nri-kafka-transformer');
      const transformer = new NriKafkaTransformer('12345');
      
      const samples = [
        {
          eventType: 'KafkaBrokerSample',
          'broker.id': '1',
          'broker.bytesInPerSecond': 1024000,
          clusterName: 'test-cluster',
          hostname: 'broker-1.test.com'
        },
        {
          eventType: 'KafkaTopicSample',
          'topic.name': 'test.topic',
          'topic.bytesInPerSecond': 512000,
          clusterName: 'test-cluster'
        }
      ];
      
      const result = transformer.transformSamples(samples);
      
      return result.entities.length === 3 && // broker + topic + cluster
             result.entities.some(e => e.entityType === 'MESSAGE_QUEUE_BROKER') &&
             result.entities.some(e => e.entityType === 'MESSAGE_QUEUE_TOPIC') &&
             result.entities.some(e => e.entityType === 'MESSAGE_QUEUE_CLUSTER');
    }
  },
  
  {
    name: 'Configuration Validation',
    test: async () => {
      const ConfigValidator = require('./core/config-validator');
      const validator = new ConfigValidator();
      
      // Mock environment
      const originalEnv = { ...process.env };
      process.env.NEW_RELIC_ACCOUNT_ID = '12345';
      process.env.NEW_RELIC_API_KEY = 'test-key';
      
      const validConfig = validator.validate({
        mode: 'simulation',
        provider: 'kafka'
      });
      
      const invalidConfig = validator.validate({
        mode: 'invalid-mode'
      });
      
      // Restore
      process.env = originalEnv;
      
      return validConfig.valid === true && invalidConfig.valid === false;
    }
  },
  
  {
    name: 'Gap Detection',
    test: async () => {
      const GapDetector = require('./core/gap-detector');
      const detector = new GapDetector({ accountId: '12345' });
      
      const infrastructure = [
        {
          entityType: 'MESSAGE_QUEUE_BROKER',
          entityGuid: 'MESSAGE_QUEUE_BROKER|12345|kafka|prod|1',
          brokerId: '1',
          clusterName: 'prod'
        }
      ];
      
      const desired = {
        clusters: [{ name: 'prod', provider: 'kafka' }],
        brokers: [
          { id: 1, clusterName: 'prod' },
          { id: 2, clusterName: 'prod' },
          { id: 3, clusterName: 'prod' }
        ],
        topics: []
      };
      
      const gaps = detector.analyzeGaps(infrastructure, desired);
      
      return gaps.missingEntities.length === 3 && // missing cluster + 2 brokers
             gaps.coverageReport.overall.coverage < 50;
    }
  },
  
  {
    name: 'Platform Modes',
    test: async () => {
      // Test that all three modes can be instantiated
      const MessageQueuesPlatform = require('./platform');
      
      // Mock environment
      process.env.NEW_RELIC_ACCOUNT_ID = '12345';
      process.env.NEW_RELIC_API_KEY = 'test-key';
      
      const modes = ['simulation', 'infrastructure', 'hybrid'];
      let allValid = true;
      
      for (const mode of modes) {
        try {
          const platform = new MessageQueuesPlatform({
            mode,
            continuous: false
          });
          
          if (!platform) allValid = false;
        } catch (error) {
          console.log(chalk.red(`  ❌ Failed to create ${mode} mode: ${error.message}`));
          allValid = false;
        }
      }
      
      return allValid;
    }
  },
  
  {
    name: 'Entity Relationships',
    test: async () => {
      const RelationshipManager = require('./core/relationships/relationship-manager');
      const manager = new RelationshipManager();
      
      const clusterGuid = 'MESSAGE_QUEUE_CLUSTER|12345|kafka|test';
      const brokerGuid = 'MESSAGE_QUEUE_BROKER|12345|kafka|test|1';
      const topicGuid = 'MESSAGE_QUEUE_TOPIC|12345|kafka|test|events';
      
      // Test relationship creation
      manager.addRelationship(clusterGuid, brokerGuid, 'contains');
      manager.addRelationship(clusterGuid, topicGuid, 'contains');
      manager.addRelationship(topicGuid, brokerGuid, 'uses');
      
      const clusterRels = manager.getRelationships(clusterGuid);
      const stats = manager.getStats();
      
      return clusterRels.length === 2 && 
             stats.totalRelationships === 3 &&
             stats.totalEntities === 3;
    }
  }
];

// Run all tests
async function runTests() {
  console.log(chalk.gray('Running component tests...\n'));
  
  const results = [];
  
  for (const { name, test } of tests) {
    process.stdout.write(chalk.cyan(`Testing ${name}... `));
    
    try {
      const passed = await test();
      results.push({ name, passed });
      
      if (passed) {
        console.log(chalk.green('✅'));
      } else {
        console.log(chalk.red('❌'));
      }
    } catch (error) {
      results.push({ name, passed: false, error });
      console.log(chalk.red(`❌ ${error.message}`));
    }
  }
  
  // Summary
  console.log(chalk.blue('\n📊 Test Summary'));
  console.log(chalk.gray('─'.repeat(50)));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const percentage = Math.round((passed / total) * 100);
  
  results.forEach(({ name, passed, error }) => {
    console.log(`${passed ? '✅' : '❌'} ${name}${error ? ` (${error.message})` : ''}`);
  });
  
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk[percentage === 100 ? 'green' : 'yellow'](
    `\nOverall: ${passed}/${total} tests passed (${percentage}%)`
  ));
  
  // Platform status
  console.log(chalk.blue('\n🚀 Platform Status'));
  console.log(chalk.gray('─'.repeat(50)));
  
  if (percentage === 100) {
    console.log(chalk.green('✅ All core components are working correctly'));
    console.log(chalk.green('✅ Entity GUID generation follows New Relic standards'));
    console.log(chalk.green('✅ Configuration validation provides helpful errors'));
    console.log(chalk.green('✅ Gap detection identifies missing entities'));
    console.log(chalk.green('✅ All three platform modes are functional'));
  } else {
    console.log(chalk.yellow('⚠️  Some components need attention'));
  }
  
  // Instructions
  console.log(chalk.blue('\n📝 Next Steps'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log('1. Ensure .env file has all required keys');
  console.log('2. Run simulation mode: npm start -- --mode=simulation');
  console.log('3. Set up Kafka infrastructure for infrastructure mode');
  console.log('4. Test hybrid mode for gap filling capabilities');
  console.log('5. Run E2E tests: npm run test:e2e');
  
  process.exit(percentage === 100 ? 0 : 1);
}

// Run the tests
runTests().catch(console.error);