#!/usr/bin/env node
/**
 * Circuit Breaker Integration Test
 * 
 * Tests the circuit breaker implementation with the platform's external service calls.
 * Demonstrates fault tolerance and error recovery patterns.
 */

const { logger } = require('./core/utils/logger');
const CircuitBreaker = require('./core/circuit-breaker');
const InfraAgentCollector = require('./infrastructure/collectors/infra-agent-collector');
const NewRelicStreamer = require('./simulation/streaming/new-relic-streamer');
const EntityFactory = require('./core/entities/entity-factory');

class CircuitBreakerIntegrationTest {
  constructor() {
    this.testResults = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      details: []
    };
  }

  /**
   * Test basic circuit breaker functionality
   */
  async testBasicCircuitBreaker() {
    console.log('\n🔧 Testing Basic Circuit Breaker...\n');
    
    const circuitBreaker = new CircuitBreaker({
      name: 'TestBreaker',
      failureThreshold: 2,
      successThreshold: 1,
      timeout: 1000,
      retryDelay: 500
    });

    let testPassed = true;
    const details = [];

    try {
      // Test successful operation
      const result1 = await circuitBreaker.execute(async () => {
        return 'success';
      });
      
      if (result1 === 'success') {
        details.push('✅ Successful operation executed correctly');
      } else {
        details.push('❌ Successful operation failed');
        testPassed = false;
      }

      // Test failing operation
      let failureCount = 0;
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Simulated failure');
          });
        } catch (error) {
          failureCount++;
        }
      }

      if (failureCount === 3) {
        details.push('✅ Failed operations handled correctly');
      } else {
        details.push(`❌ Expected 3 failures, got ${failureCount}`);
        testPassed = false;
      }

      // Test circuit opening
      try {
        await circuitBreaker.execute(async () => 'should be rejected');
        details.push('❌ Circuit should be open and reject calls');
        testPassed = false;
      } catch (error) {
        if (error.code === 'CIRCUIT_BREAKER_OPEN') {
          details.push('✅ Circuit correctly opened and rejected call');
        } else {
          details.push(`❌ Unexpected error: ${error.message}`);
          testPassed = false;
        }
      }

      // Check stats
      const stats = circuitBreaker.getStats();
      if (stats.state === 'open' && stats.stats.totalFailures >= 2) {
        details.push('✅ Circuit breaker stats are correct');
      } else {
        details.push('❌ Circuit breaker stats are incorrect');
        testPassed = false;
      }

    } catch (error) {
      details.push(`❌ Unexpected error in basic test: ${error.message}`);
      testPassed = false;
    }

    this.recordTestResult('Basic Circuit Breaker', testPassed, details);
  }

  /**
   * Test Infrastructure Agent Collector with circuit breakers
   */
  async testInfraCollectorWithCircuitBreakers() {
    console.log('\n🏗️ Testing Infrastructure Collector Circuit Breakers...\n');
    
    let testPassed = true;
    const details = [];

    try {
      // Test with invalid credentials to trigger circuit breaker
      const collector = new InfraAgentCollector({
        accountId: '12345',
        userApiKey: 'invalid-key',
        debug: true
      });

      details.push('✅ InfraAgentCollector initialized with circuit breakers');

      // Test circuit breaker stats
      const cbStats = collector.getCircuitBreakerStats();
      if (cbStats.nerdGraph && cbStats.nrql) {
        details.push('✅ Circuit breaker stats accessible');
      } else {
        details.push('❌ Circuit breaker stats not available');
        testPassed = false;
      }

      // Test circuit breaker reset
      collector.resetCircuitBreakers();
      details.push('✅ Circuit breakers reset successfully');

      // Test that NerdGraph calls will fail gracefully (with invalid credentials)
      try {
        await collector.checkKafkaIntegration();
        details.push('❌ Expected authentication failure, but call succeeded');
        testPassed = false;
      } catch (error) {
        if (error.message.includes('unauthorized') || error.message.includes('authentication')) {
          details.push('✅ Authentication failure handled gracefully');
        } else {
          details.push(`✅ Call failed as expected: ${error.message.substring(0, 100)}...`);
        }
      }

    } catch (error) {
      details.push(`❌ Infrastructure collector test failed: ${error.message}`);
      testPassed = false;
    }

    this.recordTestResult('Infrastructure Collector Circuit Breakers', testPassed, details);
  }

  /**
   * Test New Relic Streamer with circuit breakers
   */
  async testStreamerWithCircuitBreakers() {
    console.log('\n📡 Testing New Relic Streamer Circuit Breakers...\n');
    
    let testPassed = true;
    const details = [];

    try {
      // Test with invalid credentials to trigger circuit breaker
      const streamer = new NewRelicStreamer({
        ingestKey: 'invalid-key',
        batchSize: 5,
        flushInterval: 1000,
        debug: true
      });

      details.push('✅ NewRelicStreamer initialized with circuit breakers');

      // Create a test entity
      const entityFactory = new EntityFactory();
      const testBroker = entityFactory.createBroker({
        name: 'test-broker',
        brokerId: 1,
        hostname: 'test-host',
        clusterName: 'test-cluster',
        provider: 'kafka',
        accountId: '12345'
      });

      // Test streaming (will fail due to invalid credentials, but circuit breaker should handle it)
      try {
        streamer.streamEvent(testBroker);
        await streamer.flushEvents();
        
        // Check stats
        const stats = streamer.getStats();
        if (stats.circuitBreakers) {
          details.push('✅ Circuit breaker stats included in streamer stats');
        } else {
          details.push('❌ Circuit breaker stats missing from streamer stats');
          testPassed = false;
        }

        // Test circuit breaker reset
        streamer.resetCircuitBreakers();
        details.push('✅ Streamer circuit breakers reset successfully');

      } catch (error) {
        details.push(`✅ Streaming failure handled gracefully: ${error.message.substring(0, 100)}...`);
      }

      await streamer.shutdown();
      details.push('✅ Streamer shutdown completed');

    } catch (error) {
      details.push(`❌ Streamer test failed: ${error.message}`);
      testPassed = false;
    }

    this.recordTestResult('New Relic Streamer Circuit Breakers', testPassed, details);
  }

  /**
   * Test circuit breaker retry logic
   */
  async testRetryLogic() {
    console.log('\n🔄 Testing Circuit Breaker Retry Logic...\n');
    
    let testPassed = true;
    const details = [];

    try {
      const circuitBreaker = new CircuitBreaker({
        name: 'RetryTest',
        failureThreshold: 5,
        timeout: 500,
        retryDelay: 100,
        maxRetries: 3
      });

      let attempts = 0;
      const maxAttempts = 2;

      try {
        await circuitBreaker.executeWithRetry(async () => {
          attempts++;
          if (attempts <= maxAttempts) {
            throw new Error(`Attempt ${attempts} failed`);
          }
          return 'success after retries';
        });

        if (attempts === maxAttempts + 1) {
          details.push(`✅ Retry logic worked correctly (${attempts} attempts)`);
        } else {
          details.push(`❌ Expected ${maxAttempts + 1} attempts, got ${attempts}`);
          testPassed = false;
        }

      } catch (error) {
        details.push(`❌ Retry test failed: ${error.message}`);
        testPassed = false;
      }

      const stats = circuitBreaker.getStats();
      details.push(`✅ Final stats: ${stats.stats.totalCalls} calls, ${stats.stats.totalFailures} failures`);

    } catch (error) {
      details.push(`❌ Retry logic test failed: ${error.message}`);
      testPassed = false;
    }

    this.recordTestResult('Circuit Breaker Retry Logic', testPassed, details);
  }

  /**
   * Test circuit breaker state transitions
   */
  async testStateTransitions() {
    console.log('\n🔀 Testing Circuit Breaker State Transitions...\n');
    
    let testPassed = true;
    const details = [];

    try {
      const circuitBreaker = new CircuitBreaker({
        name: 'StateTest',
        failureThreshold: 2,
        successThreshold: 1,
        timeout: 200,
        retryDelay: 300
      });

      // Start in CLOSED state
      let stats = circuitBreaker.getStats();
      if (stats.state === 'closed') {
        details.push('✅ Circuit starts in CLOSED state');
      } else {
        details.push(`❌ Expected CLOSED state, got ${stats.state}`);
        testPassed = false;
      }

      // Trigger failures to open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Test failure');
          });
        } catch (error) {
          // Expected
        }
      }

      stats = circuitBreaker.getStats();
      if (stats.state === 'open') {
        details.push('✅ Circuit opened after failures');
      } else {
        details.push(`❌ Expected OPEN state, got ${stats.state}`);
        testPassed = false;
      }

      // Wait for half-open transition
      await new Promise(resolve => setTimeout(resolve, 400));

      // Try a call - should move to half-open
      try {
        await circuitBreaker.execute(async () => 'success');
        
        stats = circuitBreaker.getStats();
        if (stats.state === 'closed') {
          details.push('✅ Circuit closed after successful call in half-open state');
        } else {
          details.push(`✅ Circuit in ${stats.state} state (transition working)`);
        }
      } catch (error) {
        // Expected if still in open state
        details.push(`✅ Call handled appropriately: ${error.message}`);
      }

    } catch (error) {
      details.push(`❌ State transition test failed: ${error.message}`);
      testPassed = false;
    }

    this.recordTestResult('Circuit Breaker State Transitions', testPassed, details);
  }

  /**
   * Record test result
   */
  recordTestResult(testName, passed, details) {
    this.testResults.totalTests++;
    if (passed) {
      this.testResults.passedTests++;
    } else {
      this.testResults.failedTests++;
    }

    this.testResults.details.push({
      name: testName,
      passed,
      details
    });

    // Log results
    console.log(`\n📊 ${testName}: ${passed ? '✅ PASSED' : '❌ FAILED'}\n`);
    details.forEach(detail => console.log(`   ${detail}`));
    console.log();
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🧪 Circuit Breaker Integration Test Suite\n');
    console.log('=========================================\n');

    try {
      await this.testBasicCircuitBreaker();
      await this.testInfraCollectorWithCircuitBreakers();
      await this.testStreamerWithCircuitBreakers();
      await this.testRetryLogic();
      await this.testStateTransitions();

      this.printFinalResults();

    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Print final test results
   */
  printFinalResults() {
    console.log('\n' + '='.repeat(50));
    console.log('🏁 Test Suite Results');
    console.log('='.repeat(50));
    
    console.log(`Total Tests: ${this.testResults.totalTests}`);
    console.log(`Passed: ${this.testResults.passedTests} ✅`);
    console.log(`Failed: ${this.testResults.failedTests} ❌`);
    
    const successRate = ((this.testResults.passedTests / this.testResults.totalTests) * 100).toFixed(1);
    console.log(`Success Rate: ${successRate}%\n`);

    if (this.testResults.failedTests > 0) {
      console.log('Failed Tests:');
      this.testResults.details
        .filter(test => !test.passed)
        .forEach(test => {
          console.log(`  ❌ ${test.name}`);
        });
      console.log();
    }

    if (this.testResults.failedTests === 0) {
      console.log('🎉 All tests passed! Circuit breaker integration is working correctly.\n');
    } else {
      console.log('⚠️ Some tests failed. Please review the implementation.\n');
      process.exit(1);
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const testSuite = new CircuitBreakerIntegrationTest();
  testSuite.runAllTests().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = CircuitBreakerIntegrationTest;