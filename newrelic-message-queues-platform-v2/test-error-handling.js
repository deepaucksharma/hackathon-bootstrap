#!/usr/bin/env node

/**
 * Test Error Handling
 * 
 * Verifies that the platform handles various error conditions gracefully
 */

import 'dotenv/config';
import chalk from 'chalk';
import { MessageQueuesPlatform } from './dist/platform.js';

console.log(chalk.blue.bold(`
╔═══════════════════════════════════════════════════════════════╗
║           Error Handling Test Suite                           ║
╚═══════════════════════════════════════════════════════════════╝
`));

const runTest = async (name, config, expectedError) => {
  console.log(chalk.cyan(`\n🧪 Test: ${name}`));
  
  try {
    const platform = new MessageQueuesPlatform(config);
    await platform.start();
    
    // Wait a bit to see if errors occur
    await new Promise(resolve => setTimeout(resolve, 2000));
    await platform.stop();
    
    if (expectedError) {
      console.log(chalk.red(`   ❌ Expected error but platform started successfully`));
      return false;
    } else {
      console.log(chalk.green(`   ✅ Platform handled configuration correctly`));
      return true;
    }
  } catch (error) {
    if (expectedError) {
      console.log(chalk.green(`   ✅ Correctly threw error: ${error.message}`));
      return true;
    } else {
      console.log(chalk.red(`   ❌ Unexpected error: ${error.message}`));
      return false;
    }
  }
};

async function runTests() {
  let passed = 0;
  let failed = 0;
  
  // Test 1: Missing account ID
  console.log(chalk.blue('\n1️⃣ Missing Account ID'));
  if (await runTest('Missing accountId', {
    apiKey: 'test-key',
    mode: 'simulation'
  }, true)) {
    passed++;
  } else {
    failed++;
  }
  
  // Test 2: Missing API key
  console.log(chalk.blue('\n2️⃣ Missing API Key'));
  if (await runTest('Missing apiKey', {
    accountId: '123456',
    mode: 'simulation'
  }, true)) {
    passed++;
  } else {
    failed++;
  }
  
  // Test 3: Invalid mode
  console.log(chalk.blue('\n3️⃣ Invalid Mode'));
  if (await runTest('Invalid mode', {
    accountId: '123456',
    apiKey: 'test-key',
    mode: 'invalid-mode'
  }, true)) {
    passed++;
  } else {
    failed++;
  }
  
  // Test 4: Valid simulation config (should work even with bad API key)
  console.log(chalk.blue('\n4️⃣ Valid Simulation Config'));
  if (await runTest('Valid simulation', {
    accountId: '123456',
    apiKey: 'test-key',
    mode: 'simulation',
    interval: 60
  }, false)) {
    passed++;
  } else {
    failed++;
  }
  
  // Summary
  console.log(chalk.blue('\n═══════════════════════════════════════════════════════════════'));
  console.log(chalk.blue('                        TEST SUMMARY                           '));
  console.log(chalk.blue('═══════════════════════════════════════════════════════════════'));
  console.log(chalk.green(`✅ Passed: ${passed}`));
  console.log(chalk.red(`❌ Failed: ${failed}`));
  console.log(chalk.blue('═══════════════════════════════════════════════════════════════\n'));
  
  process.exit(failed > 0 ? 1 : 0);
}

// Check if we can load the compiled module
import { existsSync } from 'fs';
if (!existsSync('./dist/platform.js')) {
  console.log(chalk.red('❌ Compiled files not found. Please run: npm run build'));
  process.exit(1);
}

runTests().catch(console.error);