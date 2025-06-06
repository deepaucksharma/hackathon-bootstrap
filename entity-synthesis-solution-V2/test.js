#!/usr/bin/env node

/**
 * Simple entry point for entity synthesis testing
 * 
 * Usage: ./test.js
 */

const { spawn } = require('child_process');

console.log('🚀 Entity Synthesis Testing Framework\n');
console.log('Choose an option:\n');
console.log('1. Send working payload');
console.log('2. Validate UI visibility');
console.log('3. Compare with working accounts');
console.log('4. Discover payload format');
console.log('5. Run full test suite');
console.log('6. Exit\n');

process.stdout.write('Enter your choice (1-6): ');

process.stdin.once('data', (data) => {
  const choice = data.toString().trim();
  
  const modeMap = {
    '1': 'send',
    '2': 'validate',
    '3': 'compare',
    '4': 'discover',
    '5': 'test'
  };

  if (choice === '6') {
    console.log('\nGoodbye!');
    process.exit(0);
  }

  const mode = modeMap[choice];
  if (mode) {
    console.log(`\nStarting ${mode} mode...\n`);
    const child = spawn('node', ['entity-synthesis-tester.js', mode], {
      stdio: 'inherit'
    });
    
    child.on('exit', (code) => {
      process.exit(code);
    });
  } else {
    console.log('\nInvalid choice. Please run again.');
    process.exit(1);
  }
});