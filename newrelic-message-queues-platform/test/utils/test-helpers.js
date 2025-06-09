/**
 * Shared Test Utilities
 * 
 * Consolidates common test setup, teardown, and helper functions
 * to eliminate duplication across 29+ test files.
 */

const chalk = require('chalk');
const { getConfigManager } = require('../../core/config/config-manager');
const NewRelicClient = require('../../core/http/new-relic-client');

class TestHelpers {
  constructor(options = {}) {
    this.options = {
      verbose: options.verbose || false,
      timeout: options.timeout || 30000,
      retries: options.retries || 2,
      ...options
    };
    
    this.testConfig = null;
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };
  }

  /**
   * Initialize test environment with common configuration
   */
  async initializeTestEnvironment() {
    console.log(chalk.cyan('🔧 Initializing test environment...'));
    
    // Create test configuration
    this.testConfig = this._createTestConfig();
    
    // Validate configuration
    const configManager = getConfigManager(this.testConfig);
    const validation = configManager.validate();
    
    if (!validation.valid) {
      console.error(chalk.red('❌ Test configuration invalid:'));
      validation.errors.forEach(error => console.error(chalk.red(`   - ${error}`)));
      throw new Error('Invalid test configuration');
    }
    
    if (validation.warnings.length > 0 && this.options.verbose) {
      console.log(chalk.yellow('⚠️  Configuration warnings:'));
      validation.warnings.forEach(warning => console.log(chalk.yellow(`   - ${warning}`)));
    }
    
    console.log(chalk.green('✅ Test environment initialized'));
    return this.testConfig;
  }

  /**
   * Create New Relic client for testing
   */
  createTestClient(overrides = {}) {
    const config = getConfigManager().getNewRelicConfig();
    return new NewRelicClient({ ...config, dryRun: true, ...overrides });
  }

  /**
   * Run a test case with error handling and reporting
   */
  async runTest(testName, testFunction, options = {}) {
    const startTime = Date.now();
    
    try {
      console.log(chalk.blue(`🧪 Running: ${testName}`));
      
      await testFunction();
      
      const duration = Date.now() - startTime;
      this.results.passed++;
      console.log(chalk.green(`✅ ${testName} (${duration}ms)`));
      
      return { success: true, duration };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.failed++;
      this.results.errors.push({ testName, error, duration });
      
      console.log(chalk.red(`❌ ${testName} (${duration}ms)`));
      if (this.options.verbose) {
        console.log(chalk.red(`   Error: ${error.message}`));
      }
      
      if (options.throwOnError) {
        throw error;
      }
      
      return { success: false, error, duration };
    }
  }

  /**
   * Run a test suite with multiple test cases
   */
  async runTestSuite(suiteName, tests, options = {}) {
    console.log(chalk.cyan(`📋 Running test suite: ${suiteName}`));
    const suiteStartTime = Date.now();
    
    const results = [];
    
    for (const test of tests) {
      const result = await this.runTest(test.name, test.fn, test.options || {});
      results.push({ ...test, result });
      
      // Add delay between tests if specified
      if (options.delayBetweenTests && results.length < tests.length) {
        await this.sleep(options.delayBetweenTests);
      }
    }
    
    const suiteDuration = Date.now() - suiteStartTime;
    this._printSuiteResults(suiteName, results, suiteDuration);
    
    return results;
  }

  /**
   * Create mock entity data for testing
   */
  createMockEntity(type = 'MESSAGE_QUEUE_BROKER', overrides = {}) {
    const baseEntity = {
      entityGuid: `MESSAGE_QUEUE_BROKER|123456|kafka|test-cluster:broker-1`,
      name: 'test-broker-1',
      entityType: 'MESSAGE_QUEUE_BROKER',
      provider: 'kafka',
      metadata: {
        clusterName: 'test-cluster',
        brokerId: '1'
      },
      goldenMetrics: [
        { name: 'throughput', value: 1000, unit: 'messages/sec' },
        { name: 'errorRate', value: 0.1, unit: 'percent' },
        { name: 'responseTime', value: 50, unit: 'ms' }
      ],
      toEventPayload: function() {
        return {
          eventType: 'MessageQueue',
          entityGuid: this.entityGuid,
          entityName: this.name,
          entityType: this.entityType,
          provider: this.provider,
          ...this.metadata,
          timestamp: Date.now()
        };
      }
    };

    return { ...baseEntity, ...overrides };
  }

  /**
   * Create mock Kafka metrics data
   */
  createMockKafkaMetrics(count = 5) {
    const metrics = [];
    
    for (let i = 1; i <= count; i++) {
      metrics.push({
        eventType: 'KafkaBrokerSample',
        'broker.id': i,
        clusterName: 'test-cluster',
        'broker.bytesInPerSecond': Math.random() * 1000000,
        'broker.bytesOutPerSecond': Math.random() * 800000,
        'broker.messagesInPerSecond': Math.random() * 10000,
        'broker.underReplicatedPartitions': Math.floor(Math.random() * 3),
        timestamp: Date.now()
      });
    }
    
    return metrics;
  }

  /**
   * Create test dashboard configuration
   */
  createMockDashboard(name = 'Test Dashboard') {
    return {
      name,
      description: 'Test dashboard created by automated tests',
      permissions: 'PUBLIC_READ_WRITE',
      pages: [{
        name: 'Test Page',
        description: 'Test page',
        widgets: [{
          title: 'Test Widget',
          visualization: { id: 'viz.line' },
          layout: { column: 1, row: 1, width: 4, height: 3 },
          configuration: {
            nrqlQueries: [{
              query: 'FROM MessageQueue SELECT count(*) SINCE 1 hour ago',
              accountId: parseInt(this.testConfig?.accountId || '123456')
            }]
          }
        }]
      }]
    };
  }

  /**
   * Verify entity structure
   */
  verifyEntityStructure(entity, expectedType) {
    const required = ['entityGuid', 'name', 'entityType', 'provider'];
    const missing = required.filter(field => !entity[field]);
    
    if (missing.length > 0) {
      throw new Error(`Entity missing required fields: ${missing.join(', ')}`);
    }
    
    if (expectedType && entity.entityType !== expectedType) {
      throw new Error(`Expected entity type ${expectedType}, got ${entity.entityType}`);
    }
    
    // Verify GUID format
    const guidPattern = /^[A-Z_]+\|[0-9]+\|[a-z]+\|.+$/;
    if (!guidPattern.test(entity.entityGuid)) {
      throw new Error(`Invalid entity GUID format: ${entity.entityGuid}`);
    }
    
    return true;
  }

  /**
   * Wait for condition with timeout
   */
  async waitForCondition(conditionFn, options = {}) {
    const timeout = options.timeout || 10000;
    const interval = options.interval || 1000;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const result = await conditionFn();
        if (result) {
          return result;
        }
      } catch (error) {
        if (options.verbose) {
          console.log(chalk.gray(`Condition check failed: ${error.message}`));
        }
      }
      
      await this.sleep(interval);
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Check if New Relic integration is available
   */
  async checkNewRelicConnection() {
    try {
      const client = this.createTestClient({ dryRun: false });
      const query = `
        {
          actor {
            user {
              id
              email
            }
          }
        }
      `;
      
      await client.nerdGraphQuery(query);
      return true;
    } catch (error) {
      console.log(chalk.yellow(`⚠️  New Relic connection not available: ${error.message}`));
      return false;
    }
  }

  /**
   * Clean up test resources
   */
  async cleanup() {
    console.log(chalk.gray('🧹 Cleaning up test resources...'));
    
    // Add cleanup logic here (delete test dashboards, etc.)
    
    console.log(chalk.green('✅ Cleanup completed'));
  }

  /**
   * Get test results summary
   */
  getResultsSummary() {
    const total = this.results.passed + this.results.failed + this.results.skipped;
    return {
      total,
      passed: this.results.passed,
      failed: this.results.failed,
      skipped: this.results.skipped,
      successRate: total > 0 ? (this.results.passed / total * 100).toFixed(1) : 0,
      errors: this.results.errors
    };
  }

  /**
   * Print final test report
   */
  printTestReport() {
    const summary = this.getResultsSummary();
    
    console.log(chalk.cyan('\n📊 Test Results Summary'));
    console.log(chalk.cyan('========================'));
    console.log(`Total: ${summary.total}`);
    console.log(chalk.green(`Passed: ${summary.passed}`));
    console.log(chalk.red(`Failed: ${summary.failed}`));
    console.log(chalk.yellow(`Skipped: ${summary.skipped}`));
    console.log(`Success Rate: ${summary.successRate}%`);
    
    if (summary.errors.length > 0) {
      console.log(chalk.red('\n❌ Failed Tests:'));
      summary.errors.forEach(({ testName, error, duration }) => {
        console.log(chalk.red(`   ${testName} (${duration}ms): ${error.message}`));
      });
    }
    
    return summary;
  }

  // Utility methods

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  randomString(length = 8) {
    return Math.random().toString(36).substring(2, 2 + length);
  }

  randomInt(min = 0, max = 100) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Private methods

  _createTestConfig() {
    return {
      // Use environment variables but with test-safe defaults
      accountId: process.env.NEW_RELIC_ACCOUNT_ID || '123456',
      apiKey: process.env.NEW_RELIC_API_KEY || 'test-api-key',
      userApiKey: process.env.NEW_RELIC_USER_API_KEY || 'test-user-api-key',
      region: process.env.NEW_RELIC_REGION || 'US',
      
      // Test-specific configuration
      mode: 'simulation',
      debug: process.env.DEBUG === 'true',
      verbose: this.options.verbose,
      dryRun: true,
      
      // Reduced timeouts for testing
      timeout: 10000,
      retries: 1,
      batchSize: 10,
      flushInterval: 1000
    };
  }

  _printSuiteResults(suiteName, results, duration) {
    const passed = results.filter(r => r.result.success).length;
    const failed = results.filter(r => !r.result.success).length;
    
    console.log(chalk.cyan(`\n📋 ${suiteName} Results:`));
    console.log(`   Total: ${results.length}, Passed: ${chalk.green(passed)}, Failed: ${chalk.red(failed)}`);
    console.log(`   Duration: ${duration}ms`);
    
    if (failed > 0 && this.options.verbose) {
      console.log(chalk.red('   Failed tests:'));
      results.filter(r => !r.result.success).forEach(test => {
        console.log(chalk.red(`     - ${test.name}: ${test.result.error.message}`));
      });
    }
  }
}

// Export both class and convenience functions
module.exports = {
  TestHelpers,
  
  // Convenience functions for quick usage
  createTestHelper: (options) => new TestHelpers(options),
  
  createMockEntity: (type, overrides) => new TestHelpers().createMockEntity(type, overrides),
  
  createMockKafkaMetrics: (count) => new TestHelpers().createMockKafkaMetrics(count),
  
  verifyEntityStructure: (entity, expectedType) => new TestHelpers().verifyEntityStructure(entity, expectedType),
  
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};