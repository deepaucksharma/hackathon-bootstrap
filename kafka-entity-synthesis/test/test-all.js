#!/usr/bin/env node

/**
 * Test All - Comprehensive test suite
 */

const { spawn } = require('child_process');
const path = require('path');

async function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔧 Running: ${command} ${args.join(' ')}`);
    console.log('─'.repeat(50));
    
    const proc = spawn(command, args, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
  });
}

async function runTests() {
  console.log('🧪 Running Comprehensive Test Suite\n');
  
  const testCluster = `test-cluster-${Date.now()}`;
  
  try {
    // Test 1: Send events
    console.log('\n📤 Test 1: Sending Events');
    await runCommand('node', ['src/send-events.js', '--cluster-name', testCluster, '--brokers', '2', '--topics', '2']);
    
    // Wait for entity synthesis
    console.log('\n⏳ Waiting 30 seconds for entity synthesis...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Test 2: Validate UI
    console.log('\n🔍 Test 2: Validating UI Visibility');
    await runCommand('node', ['src/validate-ui.js', '--cluster-name', testCluster, '--detailed']);
    
    // Test 3: Analyze accounts (if user key available)
    if (process.env.NEW_RELIC_USER_KEY || process.env.UKEY) {
      console.log('\n📊 Test 3: Analyzing Accounts');
      await runCommand('node', ['src/analyze-accounts.js', '--accounts', process.env.NEW_RELIC_ACCOUNT_ID || process.env.ACC]);
    }
    
    console.log('\n\n✅ All tests passed!');
    console.log(`\nTest cluster: ${testCluster}`);
    console.log('Check the Message Queues UI to verify visibility.');
    
  } catch (error) {
    console.error('\n\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();