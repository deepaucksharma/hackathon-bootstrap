#!/usr/bin/env node

/**
 * Transformation Accuracy Test Suite
 * 
 * Comprehensive test suite that validates the accuracy of nri-kafka to MESSAGE_QUEUE
 * entity transformation against known good reference data and expected patterns.
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const NriKafkaTransformer = require('./infrastructure/transformers/nri-kafka-transformer');

class TransformationAccuracyTester {
  constructor(config = {}) {
    this.config = {
      accountId: config.accountId || '123456789',
      outputDir: config.outputDir || './test-results',
      saveAll: config.saveAll || false,
      ...config
    };
    
    this.results = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
      details: []
    };
    
    this.transformer = new NriKafkaTransformer(this.config.accountId);
  }

  async runAccuracyTests() {
    console.log(chalk.bold.blue('\n🧪 Transformation Accuracy Test Suite\n'));
    console.log(chalk.cyan('Validating nri-kafka → MESSAGE_QUEUE transformation accuracy...\n'));
    
    try {
      // Ensure output directory exists
      if (this.config.outputDir && !fs.existsSync(this.config.outputDir)) {
        fs.mkdirSync(this.config.outputDir, { recursive: true });
      }
      
      // Run all test categories
      await this.testBrokerTransformation();
      await this.testTopicTransformation();
      await this.testClusterAggregation();
      await this.testGuidGeneration();
      await this.testMetricAccuracy();
      await this.testEdgeCases();
      await this.testDataValidation();
      await this.testPerformance();
      
      // Generate comprehensive report
      this.generateAccuracyReport();
      
      return this.results;
      
    } catch (error) {
      console.error(chalk.red('\n❌ Test suite failed:'), error.message);
      throw error;
    }
  }

  async testBrokerTransformation() {
    console.log(chalk.cyan('🖥️  Testing Broker Transformation Accuracy...'));
    
    const testCases = [
      {
        name: 'Standard Kafka Broker Sample',
        input: {
          eventType: 'KafkaBrokerSample',
          'broker.id': '1',
          clusterName: 'production-kafka',
          hostname: 'kafka-broker-1.example.com',
          'broker.messagesInPerSecond': 1500.25,
          'broker.bytesInPerSecond': 1024000.5,
          'broker.bytesOutPerSecond': 2048000.75,
          'broker.cpuPercent': 65.4,
          'broker.JVMMemoryUsedPercent': 78.2,
          'broker.underReplicatedPartitions': 0,
          'broker.offlinePartitions': 0,
          kafkaVersion: '2.8.1',
          timestamp: 1640995200000
        },
        expected: {
          entityType: 'MESSAGE_QUEUE_BROKER',
          provider: 'kafka',
          brokerId: '1',
          clusterName: 'production-kafka',
          hostname: 'kafka-broker-1.example.com',
          'broker.messagesInPerSecond': 1500.25,
          'broker.bytesInPerSecond': 1024000.5,
          'broker.cpu.usage': 65.4,
          'tags.kafkaVersion': '2.8.1',
          'tags.environment': 'production'
        }
      },
      {
        name: 'Minimal Broker Sample',
        input: {
          eventType: 'KafkaBrokerSample',
          'broker.id': '2'
        },
        expected: {
          entityType: 'MESSAGE_QUEUE_BROKER',
          provider: 'kafka',
          brokerId: '2',
          clusterName: 'default',
          hostname: 'broker-2'
        }
      },
      {
        name: 'High Load Broker Sample',
        input: {
          eventType: 'KafkaBrokerSample',
          'broker.id': '3',
          clusterName: 'prod-high-throughput',
          'broker.messagesInPerSecond': 50000,
          'broker.bytesInPerSecond': 100000000,
          'broker.cpuPercent': 95,
          'broker.underReplicatedPartitions': 5,
          'broker.offlinePartitions': 2
        },
        expected: {
          entityType: 'MESSAGE_QUEUE_BROKER',
          'broker.messagesInPerSecond': 50000,
          'broker.underReplicatedPartitions': 5,
          'broker.offlinePartitions': 2,
          'tags.environment': 'production'
        }
      }
    ];
    
    this.runTestCases('broker', testCases);
  }

  async testTopicTransformation() {
    console.log(chalk.cyan('📋 Testing Topic Transformation Accuracy...'));
    
    const testCases = [
      {
        name: 'Standard Kafka Topic Sample',
        input: {
          eventType: 'KafkaTopicSample',
          'topic.name': 'user-events',
          clusterName: 'production-kafka',
          'topic.messagesInPerSecond': 2000.5,
          'topic.bytesInPerSecond': 512000.25,
          'topic.bytesOutPerSecond': 1024000.75,
          'topic.partitionCount': 12,
          'topic.replicationFactor': 3,
          'topic.diskSize': 1073741824,
          timestamp: 1640995200000
        },
        expected: {
          entityType: 'MESSAGE_QUEUE_TOPIC',
          provider: 'kafka',
          topicName: 'user-events',
          clusterName: 'production-kafka',
          'topic.messagesInPerSecond': 2000.5,
          'topic.bytesInPerSecond': 512000.25,
          'topic.partitions.count': 12,
          'topic.replicationFactor': 3,
          'topic.sizeBytes': 1073741824,
          'tags.topicName': 'user-events',
          'tags.partitionCount': '12'
        }
      },
      {
        name: 'System Topic Sample',
        input: {
          eventType: 'KafkaTopicSample',
          'topic.name': '__consumer_offsets',
          clusterName: 'production-kafka',
          'topic.partitionCount': 50,
          'topic.replicationFactor': 3
        },
        expected: {
          entityType: 'MESSAGE_QUEUE_TOPIC',
          topicName: '__consumer_offsets',
          'topic.partitions.count': 50,
          'topic.replicationFactor': 3
        }
      }
    ];
    
    this.runTestCases('topic', testCases);
  }

  async testClusterAggregation() {
    console.log(chalk.cyan('🏗️  Testing Cluster Aggregation Accuracy...'));
    
    const brokerSamples = [
      {
        eventType: 'KafkaBrokerSample',
        'broker.id': '1',
        clusterName: 'test-cluster',
        'broker.messagesInPerSecond': 1000,
        'broker.bytesInPerSecond': 500000,
        'broker.cpuPercent': 60,
        'broker.underReplicatedPartitions': 0,
        kafkaVersion: '2.8.0'
      },
      {
        eventType: 'KafkaBrokerSample',
        'broker.id': '2',
        clusterName: 'test-cluster',
        'broker.messagesInPerSecond': 1200,
        'broker.bytesInPerSecond': 600000,
        'broker.cpuPercent': 70,
        'broker.underReplicatedPartitions': 1,
        kafkaVersion: '2.8.0'
      },
      {
        eventType: 'KafkaBrokerSample',
        'broker.id': '3',
        clusterName: 'test-cluster',
        'broker.messagesInPerSecond': 800,
        'broker.bytesInPerSecond': 400000,
        'broker.cpuPercent': 50,
        'broker.underReplicatedPartitions': 0,
        kafkaVersion: '2.8.0'
      }
    ];
    
    const testCase = {
      name: 'Three Broker Cluster Aggregation',
      input: brokerSamples,
      expected: {
        entityType: 'MESSAGE_QUEUE_CLUSTER',
        provider: 'kafka',
        clusterName: 'test-cluster',
        'cluster.brokerCount': 3,
        'cluster.messagesInPerSecond': 3000, // 1000 + 1200 + 800
        'cluster.bytesInPerSecond': 1500000, // 500000 + 600000 + 400000
        'cluster.cpu.avgUsage': 60, // (60 + 70 + 50) / 3
        'cluster.underReplicatedPartitions': 1, // 0 + 1 + 0
        'cluster.health.score': 98, // High score with minimal issues
        'tags.brokerCount': '3',
        'tags.kafkaVersion': '2.8.0'
      }
    };
    
    try {
      const clusterEntity = this.transformer.createClusterEntity(brokerSamples);
      this.validateTransformation('cluster-aggregation', testCase.name, testCase.input, clusterEntity, testCase.expected);
    } catch (error) {
      this.recordTestResult('cluster-aggregation', testCase.name, false, `Transformation failed: ${error.message}`);
    }
  }

  async testGuidGeneration() {
    console.log(chalk.cyan('🆔 Testing GUID Generation Accuracy...'));
    
    const testCases = [
      {
        name: 'Broker GUID Format',
        entityType: 'MESSAGE_QUEUE_BROKER',
        identifiers: ['kafka', 'production-cluster', 'broker-1'],
        expectedPattern: /^MESSAGE_QUEUE_BROKER\|123456789\|kafka\|production-cluster\|broker-1$/
      },
      {
        name: 'Topic GUID Format',
        entityType: 'MESSAGE_QUEUE_TOPIC',
        identifiers: ['kafka', 'production-cluster', 'user-events'],
        expectedPattern: /^MESSAGE_QUEUE_TOPIC\|123456789\|kafka\|production-cluster\|user-events$/
      },
      {
        name: 'Cluster GUID Format',
        entityType: 'MESSAGE_QUEUE_CLUSTER',
        identifiers: ['kafka', 'production-cluster'],
        expectedPattern: /^MESSAGE_QUEUE_CLUSTER\|123456789\|kafka\|production-cluster$/
      },
      {
        name: 'Special Characters in GUID',
        entityType: 'MESSAGE_QUEUE_TOPIC',
        identifiers: ['kafka', 'test-cluster', 'topic.with.dots'],
        expectedPattern: /^MESSAGE_QUEUE_TOPIC\|123456789\|kafka\|test-cluster\|topic\.with\.dots$/
      }
    ];
    
    testCases.forEach(testCase => {
      try {
        const guid = this.transformer.generateGuid(testCase.entityType, ...testCase.identifiers);
        const matches = testCase.expectedPattern.test(guid);
        
        if (matches) {
          this.recordTestResult('guid-generation', testCase.name, true, `GUID: ${guid}`);
        } else {
          this.recordTestResult('guid-generation', testCase.name, false, 
            `GUID format mismatch. Expected pattern: ${testCase.expectedPattern}, Got: ${guid}`);
        }
      } catch (error) {
        this.recordTestResult('guid-generation', testCase.name, false, `GUID generation failed: ${error.message}`);
      }
    });
  }

  async testMetricAccuracy() {
    console.log(chalk.cyan('📊 Testing Metric Calculation Accuracy...'));
    
    const testCases = [
      {
        name: 'Throughput Calculation',
        input: {
          eventType: 'KafkaBrokerSample',
          'broker.id': '1',
          'broker.messagesInPerSecond': 1000.5,
          'broker.bytesInPerSecond': 1024000,
          'broker.bytesOutPerSecond': 2048000
        },
        validations: [
          { field: 'broker.messagesInPerSecond', expected: 1000.5, tolerance: 0.01 },
          { field: 'broker.bytesInPerSecond', expected: 1024000, tolerance: 0 },
          { field: 'broker.bytesOutPerSecond', expected: 2048000, tolerance: 0 }
        ]
      },
      {
        name: 'CPU Calculation',
        input: {
          eventType: 'KafkaBrokerSample',
          'broker.id': '1',
          'broker.cpuPercent': 75.5,
          'broker.IOWaitPercent': 5.2
        },
        validations: [
          { field: 'broker.cpu.usage', expected: 75.5, tolerance: 0.1 }
        ]
      },
      {
        name: 'Health Score Calculation',
        clusterData: {
          offlinePartitions: 0,
          underReplicatedPartitions: 2,
          messagesIn: 1000,
          brokerCount: 3
        },
        validations: [
          { field: 'health_score', expected: 96, tolerance: 1 } // 100 - (2 * 2) = 96
        ]
      }
    ];
    
    testCases.forEach(testCase => {
      try {
        let entity;
        
        if (testCase.input) {
          entity = this.transformer.transformBrokerSample(testCase.input);
        } else if (testCase.clusterData) {
          const score = this.transformer.calculateHealthScore(testCase.clusterData, testCase.clusterData.brokerCount);
          entity = { health_score: score };
        }
        
        testCase.validations.forEach(validation => {
          const actualValue = entity[validation.field];
          const expectedValue = validation.expected;
          const tolerance = validation.tolerance || 0;
          
          const withinTolerance = Math.abs(actualValue - expectedValue) <= tolerance;
          
          if (withinTolerance) {
            this.recordTestResult('metric-accuracy', `${testCase.name} - ${validation.field}`, true, 
              `Value: ${actualValue} (expected: ${expectedValue})`);
          } else {
            this.recordTestResult('metric-accuracy', `${testCase.name} - ${validation.field}`, false,
              `Value mismatch: ${actualValue} vs expected ${expectedValue} (tolerance: ${tolerance})`);
          }
        });
        
      } catch (error) {
        this.recordTestResult('metric-accuracy', testCase.name, false, `Calculation failed: ${error.message}`);
      }
    });
  }

  async testEdgeCases() {
    console.log(chalk.cyan('⚠️  Testing Edge Cases...'));
    
    const testCases = [
      {
        name: 'Missing Required Fields',
        input: { eventType: 'KafkaBrokerSample' },
        expectError: false, // Should handle gracefully with defaults
        expectedDefaults: {
          brokerId: '0',
          clusterName: 'default',
          hostname: 'broker-0'
        }
      },
      {
        name: 'Invalid Event Type',
        input: { eventType: 'InvalidSample', 'broker.id': '1' },
        expectError: true
      },
      {
        name: 'Null Values',
        input: {
          eventType: 'KafkaBrokerSample',
          'broker.id': null,
          clusterName: null,
          'broker.messagesInPerSecond': null
        },
        expectError: false,
        expectedDefaults: {
          brokerId: '0',
          clusterName: 'default',
          'broker.messagesInPerSecond': 0
        }
      },
      {
        name: 'Extreme Values',
        input: {
          eventType: 'KafkaBrokerSample',
          'broker.id': '999',
          'broker.messagesInPerSecond': Number.MAX_SAFE_INTEGER,
          'broker.cpuPercent': 999.99
        },
        expectError: false
      },
      {
        name: 'Empty Topic Name',
        input: {
          eventType: 'KafkaTopicSample',
          'topic.name': '',
          clusterName: 'test'
        },
        expectError: true
      }
    ];
    
    testCases.forEach(testCase => {
      try {
        let entity;
        
        if (testCase.input.eventType === 'KafkaBrokerSample') {
          entity = this.transformer.transformBrokerSample(testCase.input);
        } else if (testCase.input.eventType === 'KafkaTopicSample') {
          entity = this.transformer.transformTopicSample(testCase.input);
        } else {
          // Invalid event type
          entity = this.transformer.transformBrokerSample(testCase.input);
        }
        
        if (testCase.expectError) {
          this.recordTestResult('edge-cases', testCase.name, false, 
            'Expected error but transformation succeeded');
        } else {
          // Validate defaults were applied
          let passed = true;
          let message = 'Transformation succeeded';
          
          if (testCase.expectedDefaults) {
            Object.entries(testCase.expectedDefaults).forEach(([field, expectedValue]) => {
              if (entity[field] !== expectedValue) {
                passed = false;
                message = `Default not applied for ${field}: got ${entity[field]}, expected ${expectedValue}`;
              }
            });
          }
          
          this.recordTestResult('edge-cases', testCase.name, passed, message);
        }
        
      } catch (error) {
        if (testCase.expectError) {
          this.recordTestResult('edge-cases', testCase.name, true, 
            `Expected error occurred: ${error.message}`);
        } else {
          this.recordTestResult('edge-cases', testCase.name, false, 
            `Unexpected error: ${error.message}`);
        }
      }
    });
  }

  async testDataValidation() {
    console.log(chalk.cyan('✅ Testing Data Validation...'));
    
    const validSample = {
      eventType: 'KafkaBrokerSample',
      'broker.id': '1',
      clusterName: 'test-cluster',
      'broker.messagesInPerSecond': 1000
    };
    
    try {
      const entity = this.transformer.transformBrokerSample(validSample);
      
      // Test required fields presence
      const requiredFields = ['eventType', 'entityType', 'entityGuid', 'provider', 'brokerId'];
      const missingFields = requiredFields.filter(field => !entity[field]);
      
      if (missingFields.length === 0) {
        this.recordTestResult('data-validation', 'Required Fields Present', true, 
          'All required fields present');
      } else {
        this.recordTestResult('data-validation', 'Required Fields Present', false,
          `Missing fields: ${missingFields.join(', ')}`);
      }
      
      // Test data types
      const typeTests = [
        { field: 'brokerId', expectedType: 'string' },
        { field: 'broker.messagesInPerSecond', expectedType: 'number' },
        { field: 'entityGuid', expectedType: 'string' }
      ];
      
      typeTests.forEach(test => {
        const actualType = typeof entity[test.field];
        const passed = actualType === test.expectedType;
        
        this.recordTestResult('data-validation', `${test.field} Type Check`, passed,
          `Type: ${actualType} (expected: ${test.expectedType})`);
      });
      
      // Test GUID format
      const guidPattern = /^MESSAGE_QUEUE_[A-Z_]+\|[0-9]+\|/;
      const guidValid = guidPattern.test(entity.entityGuid);
      
      this.recordTestResult('data-validation', 'GUID Format Validation', guidValid,
        `GUID: ${entity.entityGuid}`);
      
    } catch (error) {
      this.recordTestResult('data-validation', 'Validation Test', false,
        `Validation failed: ${error.message}`);
    }
  }

  async testPerformance() {
    console.log(chalk.cyan('⚡ Testing Transformation Performance...'));
    
    // Generate test data
    const generateBrokerSamples = (count) => {
      return Array.from({ length: count }, (_, i) => ({
        eventType: 'KafkaBrokerSample',
        'broker.id': String(i + 1),
        clusterName: `cluster-${Math.floor(i / 3) + 1}`,
        'broker.messagesInPerSecond': Math.random() * 10000,
        'broker.bytesInPerSecond': Math.random() * 1000000,
        'broker.cpuPercent': Math.random() * 100
      }));
    };
    
    const performanceTests = [
      { name: '10 Samples', sampleCount: 10, maxTimeMs: 10 },
      { name: '100 Samples', sampleCount: 100, maxTimeMs: 50 },
      { name: '1000 Samples', sampleCount: 1000, maxTimeMs: 500 }
    ];
    
    performanceTests.forEach(test => {
      const samples = generateBrokerSamples(test.sampleCount);
      
      const startTime = Date.now();
      try {
        const result = this.transformer.transformSamples(samples);
        const duration = Date.now() - startTime;
        
        const passed = duration <= test.maxTimeMs;
        const throughput = Math.round(test.sampleCount / (duration / 1000));
        
        this.recordTestResult('performance', test.name, passed,
          `Duration: ${duration}ms (limit: ${test.maxTimeMs}ms), Throughput: ${throughput} samples/sec, Entities: ${result.entities.length}`);
        
      } catch (error) {
        this.recordTestResult('performance', test.name, false,
          `Performance test failed: ${error.message}`);
      }
    });
  }

  runTestCases(category, testCases) {
    testCases.forEach(testCase => {
      try {
        let entity;
        
        if (testCase.input.eventType === 'KafkaBrokerSample') {
          entity = this.transformer.transformBrokerSample(testCase.input);
        } else if (testCase.input.eventType === 'KafkaTopicSample') {
          entity = this.transformer.transformTopicSample(testCase.input);
        }
        
        this.validateTransformation(category, testCase.name, testCase.input, entity, testCase.expected);
        
      } catch (error) {
        this.recordTestResult(category, testCase.name, false, `Transformation failed: ${error.message}`);
      }
    });
  }

  validateTransformation(category, testName, input, actual, expected) {
    let passed = true;
    const issues = [];
    
    // Validate expected fields
    Object.entries(expected).forEach(([field, expectedValue]) => {
      const actualValue = actual[field];
      
      if (actualValue !== expectedValue) {
        passed = false;
        issues.push(`${field}: got ${actualValue}, expected ${expectedValue}`);
      }
    });
    
    // Additional validations
    if (!actual.entityGuid || !actual.entityGuid.includes(this.config.accountId)) {
      passed = false;
      issues.push('Invalid or missing entityGuid');
    }
    
    if (!actual.eventType || actual.eventType !== 'MessageQueue') {
      passed = false;
      issues.push('Invalid eventType for New Relic');
    }
    
    const message = passed ? 'All validations passed' : issues.join('; ');
    this.recordTestResult(category, testName, passed, message);
    
    // Save detailed results for analysis
    if (!passed || this.config.saveAll) {
      this.saveTestDetails(category, testName, { input, actual, expected, issues });
    }
  }

  recordTestResult(category, testName, passed, message) {
    const result = {
      category,
      testName,
      passed,
      message,
      timestamp: new Date().toISOString()
    };
    
    this.results.details.push(result);
    this.results.totalTests++;
    
    if (passed) {
      this.results.passed++;
      console.log(chalk.green(`   ✅ ${testName}: ${message}`));
    } else {
      this.results.failed++;
      console.log(chalk.red(`   ❌ ${testName}: ${message}`));
    }
  }

  saveTestDetails(category, testName, details) {
    if (!this.config.outputDir) return;
    
    const filename = path.join(this.config.outputDir, `${category}-${testName.replace(/\s+/g, '-').toLowerCase()}.json`);
    
    try {
      fs.writeFileSync(filename, JSON.stringify(details, null, 2));
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not save test details to ${filename}`));
    }
  }

  generateAccuracyReport() {
    const passRate = (this.results.passed / this.results.totalTests * 100).toFixed(1);
    const status = passRate >= 95 ? 'EXCELLENT' : passRate >= 90 ? 'GOOD' : passRate >= 80 ? 'ACCEPTABLE' : 'NEEDS_IMPROVEMENT';
    
    console.log(chalk.bold.blue('\n📊 Transformation Accuracy Report\n'));
    
    const statusColor = passRate >= 95 ? chalk.green : passRate >= 90 ? chalk.yellow : chalk.red;
    console.log(statusColor(`Overall Accuracy: ${passRate}% (${status})`));
    console.log(chalk.gray(`Total Tests: ${this.results.totalTests}`));
    console.log(chalk.green(`Passed: ${this.results.passed}`));
    console.log(chalk.red(`Failed: ${this.results.failed}`));
    console.log('');
    
    // Category breakdown
    const categories = [...new Set(this.results.details.map(r => r.category))];
    console.log(chalk.cyan('Test Category Results:'));
    
    categories.forEach(category => {
      const categoryTests = this.results.details.filter(r => r.category === category);
      const categoryPassed = categoryTests.filter(r => r.passed).length;
      const categoryTotal = categoryTests.length;
      const categoryRate = (categoryPassed / categoryTotal * 100).toFixed(1);
      
      const icon = categoryRate == 100 ? '✅' : categoryRate >= 90 ? '⚠️ ' : '❌';
      console.log(`   ${icon} ${category}: ${categoryPassed}/${categoryTotal} (${categoryRate}%)`);
    });
    
    // Failed tests summary
    if (this.results.failed > 0) {
      console.log(chalk.red('\n❌ Failed Tests:'));
      this.results.details.filter(r => !r.passed).forEach(result => {
        console.log(chalk.red(`   - ${result.category}/${result.testName}: ${result.message}`));
      });
    }
    
    // Save full report
    if (this.config.outputDir) {
      const reportFile = path.join(this.config.outputDir, 'transformation-accuracy-report.json');
      try {
        fs.writeFileSync(reportFile, JSON.stringify({
          summary: {
            totalTests: this.results.totalTests,
            passed: this.results.passed,
            failed: this.results.failed,
            passRate: parseFloat(passRate),
            status,
            timestamp: new Date().toISOString()
          },
          details: this.results.details
        }, null, 2));
        
        console.log(chalk.gray(`\n📁 Full report saved to: ${reportFile}`));
      } catch (error) {
        console.warn(chalk.yellow(`Warning: Could not save report to ${reportFile}`));
      }
    }
    
    if (passRate >= 90) {
      console.log(chalk.green('\n🎉 Transformation accuracy meets quality standards!'));
    } else {
      console.log(chalk.yellow('\n⚠️  Transformation accuracy needs improvement before production deployment.'));
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const config = {
    accountId: args.includes('--account-id') ? args[args.indexOf('--account-id') + 1] : undefined,
    outputDir: args.includes('--output') ? args[args.indexOf('--output') + 1] : undefined,
    saveAll: args.includes('--save-all')
  };
  
  if (args.includes('--help')) {
    console.log(chalk.bold.cyan('Transformation Accuracy Test Suite\n'));
    console.log('Usage: node test-transformation-accuracy.js [options]\n');
    console.log('Options:');
    console.log('  --account-id <id>    New Relic account ID for testing');
    console.log('  --output <dir>       Output directory for test results');
    console.log('  --save-all           Save details for all tests (not just failures)');
    console.log('  --help               Show this help');
    process.exit(0);
  }
  
  const tester = new TransformationAccuracyTester(config);
  tester.runAccuracyTests().then(results => {
    const exitCode = results.failed > 0 ? 1 : 0;
    process.exit(exitCode);
  }).catch(error => {
    console.error(chalk.red('Test suite error:'), error.message);
    process.exit(1);
  });
}

module.exports = TransformationAccuracyTester;