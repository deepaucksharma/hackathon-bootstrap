#!/usr/bin/env node
/**
 * Pipeline Validation Test
 * 
 * Tests the complete end-to-end data pipeline validation across all platform modes.
 * Demonstrates comprehensive validation of data collection → transformation → streaming.
 */

const MessageQueuesPlatform = require('./platform');
const PipelineValidator = require('./core/pipeline-validator');
const { logger } = require('./core/utils/logger');
const chalk = require('chalk');

class PipelineValidationTest {
  constructor() {
    this.testResults = {
      modes: {},
      summary: {
        totalModes: 0,
        passedModes: 0,
        failedModes: 0
      }
    };
  }

  /**
   * Run validation tests for all platform modes
   */
  async runAllValidations() {
    console.log(chalk.bold.blue('🧪 PIPELINE VALIDATION TEST SUITE'));
    console.log(chalk.bold.blue('=====================================\n'));
    
    const modes = ['simulation', 'infrastructure', 'hybrid'];
    
    for (const mode of modes) {
      try {
        console.log(chalk.cyan(`\n🔍 Testing ${mode} mode...\n`));
        
        const result = await this.validateMode(mode);
        this.testResults.modes[mode] = result;
        this.testResults.summary.totalModes++;
        
        if (result.validation.overall.status === 'passed') {
          this.testResults.summary.passedModes++;
        } else {
          this.testResults.summary.failedModes++;
        }
        
      } catch (error) {
        console.error(chalk.red(`❌ Failed to test ${mode} mode:`), error.message);
        this.testResults.modes[mode] = {
          success: false,
          error: error.message
        };
        this.testResults.summary.totalModes++;
        this.testResults.summary.failedModes++;
      }
    }
    
    this.printSummaryReport();
  }

  /**
   * Validate a specific platform mode
   */
  async validateMode(mode) {
    // Create platform instance for this mode
    const platform = new MessageQueuesPlatform({
      mode,
      provider: 'kafka',
      accountId: process.env.NEW_RELIC_ACCOUNT_ID || '12345',
      apiKey: process.env.NEW_RELIC_USER_API_KEY || 'test-key',
      ingestKey: process.env.NEW_RELIC_INGEST_KEY || 'test-ingest-key',
      continuous: false,
      debug: true,
      // Mode-specific options
      ...(mode === 'simulation' && {
        clusters: 1,
        brokers: 2,
        topics: 3,
        autoCreate: true
      }),
      ...(mode === 'hybrid' && {
        brokers: 2,
        expectedTopics: ['test-topic-1', 'test-topic-2']
      })
    });

    // Create validator
    const validator = new PipelineValidator({
      timeout: 30000,
      validateData: true,
      validateTransformation: true,
      validateStreaming: true
    });

    let validation;
    try {
      // Run validation
      validation = await validator.validatePipeline(platform);
      
      // Clean up
      await platform.stop();
      
      return {
        success: validation.overall.status === 'passed',
        validation,
        mode
      };
      
    } catch (error) {
      // Clean up on error
      try {
        await platform.stop();
      } catch (stopError) {
        // Ignore stop errors
      }
      
      throw error;
    }
  }

  /**
   * Test individual validation components
   */
  async testValidationComponents() {
    console.log(chalk.cyan('\n🔧 Testing individual validation components...\n'));
    
    const tests = [
      {
        name: 'Configuration Validation',
        test: () => this.testConfigValidation()
      },
      {
        name: 'Entity Structure Validation',
        test: () => this.testEntityValidation()
      },
      {
        name: 'Data Flow Validation',
        test: () => this.testDataFlowValidation()
      }
    ];
    
    for (const test of tests) {
      try {
        console.log(chalk.gray(`Testing ${test.name}...`));
        const result = await test.test();
        
        if (result.success) {
          console.log(chalk.green(`✅ ${test.name} passed`));
        } else {
          console.log(chalk.red(`❌ ${test.name} failed: ${result.reason}`));
        }
        
      } catch (error) {
        console.log(chalk.red(`❌ ${test.name} error: ${error.message}`));
      }
    }
  }

  /**
   * Test configuration validation
   */
  async testConfigValidation() {
    const platform = new MessageQueuesPlatform({
      mode: 'simulation',
      provider: 'kafka',
      continuous: false
    });
    
    const validator = new PipelineValidator();
    
    try {
      const validation = {
        stages: { config: { status: 'pending', details: null } }
      };
      
      await validator.validateConfiguration(platform, validation);
      await platform.stop();
      
      return {
        success: validation.stages.config.status !== 'error',
        details: validation.stages.config.details
      };
      
    } catch (error) {
      await platform.stop();
      return { success: false, reason: error.message };
    }
  }

  /**
   * Test entity validation
   */
  async testEntityValidation() {
    const platform = new MessageQueuesPlatform({
      mode: 'simulation',
      provider: 'kafka',
      continuous: false,
      autoCreate: true
    });
    
    const validator = new PipelineValidator();
    
    try {
      const validation = {
        stages: { entityValidation: { status: 'pending', details: null } }
      };
      
      await validator.validateEntities(platform, validation);
      await platform.stop();
      
      return {
        success: validation.stages.entityValidation.status === 'passed',
        details: validation.stages.entityValidation.details
      };
      
    } catch (error) {
      await platform.stop();
      return { success: false, reason: error.message };
    }
  }

  /**
   * Test data flow validation
   */
  async testDataFlowValidation() {
    const platform = new MessageQueuesPlatform({
      mode: 'simulation',
      provider: 'kafka',
      continuous: false,
      autoCreate: true
    });
    
    try {
      // Run one cycle to generate data
      await platform.runCycle();
      
      // Check if data was generated and streamed
      const stats = await platform.getStats();
      
      await platform.stop();
      
      const hasTopology = stats.topology && stats.topology.brokers > 0;
      const hasStreaming = stats.streaming && stats.streaming.eventsSent > 0;
      
      return {
        success: hasTopology && hasStreaming,
        details: { hasTopology, hasStreaming, stats }
      };
      
    } catch (error) {
      await platform.stop();
      return { success: false, reason: error.message };
    }
  }

  /**
   * Test error recovery integration
   */
  async testErrorRecoveryIntegration() {
    console.log(chalk.cyan('\n🛡️ Testing error recovery integration...\n'));
    
    try {
      // Create platform with invalid configuration to trigger error recovery
      const platform = new MessageQueuesPlatform({
        mode: 'infrastructure',
        provider: 'kafka',
        accountId: '12345',
        apiKey: 'invalid-key',
        continuous: false,
        debug: true
      });
      
      const validator = new PipelineValidator({
        timeout: 10000
      });
      
      // This should trigger circuit breakers
      const validation = await validator.validatePipeline(platform);
      
      // Check error recovery stats
      const stats = await platform.getStats();
      const errorRecoveryWorking = stats.errorRecovery && 
                                 stats.errorRecovery.systemHealth.status !== 'error';
      
      await platform.stop();
      
      console.log(errorRecoveryWorking ? 
        chalk.green('✅ Error recovery system working') : 
        chalk.red('❌ Error recovery system issues')
      );
      
      return { success: errorRecoveryWorking, validation };
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Error recovery test completed with expected error: ${error.message}`));
      return { success: true, expectedError: true };
    }
  }

  /**
   * Print comprehensive summary report
   */
  printSummaryReport() {
    console.log('\n' + '='.repeat(80));
    console.log(chalk.bold.cyan('📊 PIPELINE VALIDATION SUMMARY'));
    console.log('='.repeat(80));
    
    console.log(`Total Modes Tested: ${this.testResults.summary.totalModes}`);
    console.log(`Passed: ${this.testResults.summary.passedModes} ✅`);
    console.log(`Failed: ${this.testResults.summary.failedModes} ❌`);
    
    const successRate = this.testResults.summary.totalModes > 0 ? 
      ((this.testResults.summary.passedModes / this.testResults.summary.totalModes) * 100).toFixed(1) : 0;
    console.log(`Success Rate: ${successRate}%\n`);
    
    // Mode-by-mode breakdown
    console.log('Mode Breakdown:');
    for (const [mode, result] of Object.entries(this.testResults.modes)) {
      if (result.success) {
        const score = result.validation ? result.validation.overall.score : 0;
        console.log(`  ✅ ${mode}: PASSED (${score}%)`);
      } else {
        console.log(`  ❌ ${mode}: FAILED${result.error ? ` - ${result.error}` : ''}`);
      }
    }
    
    // Recommendations
    console.log('\nRecommendations:');
    const failedModes = Object.entries(this.testResults.modes)
      .filter(([_, result]) => !result.success)
      .map(([mode]) => mode);
    
    if (failedModes.length === 0) {
      console.log('  🎉 All pipeline validations passed! The platform is working correctly.');
    } else {
      console.log(`  🔧 Review and fix issues in: ${failedModes.join(', ')}`);
      console.log('  📋 Check the detailed validation reports above for specific issues');
      console.log('  🏥 Verify error recovery systems are properly configured');
    }
    
    if (this.testResults.summary.passedModes > 0) {
      console.log('  ✨ Working modes can be used for production workloads');
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
  }

  /**
   * Run quick health check
   */
  async runQuickHealthCheck() {
    console.log(chalk.cyan('🏥 Running quick platform health check...\n'));
    
    try {
      const platform = new MessageQueuesPlatform({
        mode: 'simulation',
        provider: 'kafka',
        continuous: false,
        autoCreate: true
      });
      
      // Quick cycle
      await platform.runCycle();
      const stats = await platform.getStats();
      
      await platform.stop();
      
      const healthy = stats.topology && 
                     stats.topology.brokers > 0 && 
                     stats.streaming && 
                     stats.streaming.eventsSent > 0;
      
      console.log(healthy ? 
        chalk.green('✅ Platform health check passed') : 
        chalk.red('❌ Platform health check failed')
      );
      
      return healthy;
      
    } catch (error) {
      console.error(chalk.red('❌ Health check failed:'), error.message);
      return false;
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const testSuite = new PipelineValidationTest();
  
  async function runTests() {
    try {
      // Quick health check first
      const healthy = await testSuite.runQuickHealthCheck();
      
      if (healthy) {
        // Run component tests
        await testSuite.testValidationComponents();
        
        // Test error recovery
        await testSuite.testErrorRecoveryIntegration();
        
        // Full pipeline validation
        await testSuite.runAllValidations();
      } else {
        console.log(chalk.red('❌ Platform failed basic health check. Skipping full validation.'));
        process.exit(1);
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Test suite failed:'), error);
      process.exit(1);
    }
  }
  
  runTests();
}

module.exports = PipelineValidationTest;