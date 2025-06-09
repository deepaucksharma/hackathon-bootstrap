#!/usr/bin/env node

/**
 * E2E Test Runner
 * 
 * Runs comprehensive end-to-end tests for all platform modes
 */

const chalk = require('chalk');
const { spawn } = require('child_process');
const path = require('path');

// Test configuration
const tests = [
  {
    name: 'Platform Modes E2E',
    file: 'e2e/platform-modes.test.js',
    description: 'Tests infrastructure, simulation, and hybrid modes'
  },
  {
    name: 'Infrastructure Integration',
    file: '__tests__/nri-kafka-transformer.test.js',
    description: 'Tests nri-kafka data transformation'
  },
  {
    name: 'Entity Validation',
    file: '__tests__/entity-factory.test.js', 
    description: 'Tests entity creation and validation'
  },
  {
    name: 'Streaming Integration',
    file: '__tests__/streaming-integration.test.js',
    description: 'Tests data streaming to New Relic'
  }
];

console.log(chalk.blue('🧪 Running E2E Test Suite\n'));

// Check environment
const requiredEnvVars = ['NEW_RELIC_ACCOUNT_ID', 'NEW_RELIC_API_KEY'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  console.log(chalk.yellow('⚠️  Missing environment variables:'), missingVars);
  console.log(chalk.gray('Some tests may be skipped or fail\n'));
}

// Run each test suite
async function runTests() {
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    console.log(chalk.cyan(`\n📋 ${test.name}`));
    console.log(chalk.gray(`   ${test.description}`));
    console.log(chalk.gray('─'.repeat(50)));
    
    try {
      await runTest(test.file);
      passed++;
      console.log(chalk.green(`✅ ${test.name} passed`));
    } catch (error) {
      failed++;
      console.log(chalk.red(`❌ ${test.name} failed`));
      console.log(chalk.red(`   Error: ${error.message}`));
    }
  }
  
  // Summary
  console.log(chalk.blue('\n📊 Test Summary'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.green(`✅ Passed: ${passed}`));
  console.log(chalk.red(`❌ Failed: ${failed}`));
  console.log(chalk.gray(`📋 Total: ${tests.length}`));
  
  if (failed === 0) {
    console.log(chalk.green('\n🎉 All tests passed!'));
    process.exit(0);
  } else {
    console.log(chalk.red(`\n💔 ${failed} test(s) failed`));
    process.exit(1);
  }
}

// Run individual test
function runTest(testFile) {
  return new Promise((resolve, reject) => {
    const testPath = path.join(__dirname, testFile);
    const jest = spawn('npx', ['jest', testPath, '--forceExit'], {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' }
    });
    
    let output = '';
    
    jest.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(chalk.gray(data));
    });
    
    jest.stderr.on('data', (data) => {
      output += data.toString();
      process.stderr.write(chalk.red(data));
    });
    
    jest.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Test exited with code ${code}`));
      }
    });
    
    jest.on('error', (error) => {
      reject(error);
    });
  });
}

// Run optional integration tests if --integration flag is provided
if (process.argv.includes('--integration')) {
  console.log(chalk.yellow('\n🔌 Running integration tests (requires live services)\n'));
  
  tests.push({
    name: 'Live Infrastructure Test',
    file: 'integration/live-infrastructure.test.js',
    description: 'Tests with real Kafka infrastructure'
  });
  
  tests.push({
    name: 'New Relic API Test',
    file: 'integration/new-relic-api.test.js',
    description: 'Tests with real New Relic API'
  });
}

// Run the tests
runTests().catch(error => {
  console.error(chalk.red('\n💥 Test runner failed:'), error);
  process.exit(1);
});