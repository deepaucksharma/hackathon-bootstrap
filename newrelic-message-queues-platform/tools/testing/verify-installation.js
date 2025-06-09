#!/usr/bin/env node

/**
 * Verification script to ensure the platform is correctly installed and configured
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

console.log(chalk.bold.blue(`
╔═══════════════════════════════════════════════════════════╗
║   Message Queues Platform - Installation Verification      ║
╚═══════════════════════════════════════════════════════════╝
`));

let allChecks = true;

// Check 1: Node.js version
console.log(chalk.bold('\n1. Checking Node.js version...'));
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));
if (majorVersion >= 14) {
  console.log(chalk.green(`✓ Node.js ${nodeVersion} is supported`));
} else {
  console.log(chalk.red(`✗ Node.js ${nodeVersion} is too old. Please upgrade to v14+`));
  allChecks = false;
}

// Check 2: Dependencies
console.log(chalk.bold('\n2. Checking dependencies...'));
const requiredModules = [
  'axios',
  'chalk',
  'commander',
  'dotenv',
  'lodash',
  'moment',
  'uuid'
];

let missingModules = [];
requiredModules.forEach(module => {
  try {
    require.resolve(module);
  } catch (e) {
    missingModules.push(module);
  }
});

if (missingModules.length === 0) {
  console.log(chalk.green('✓ All required dependencies installed'));
} else {
  console.log(chalk.red(`✗ Missing dependencies: ${missingModules.join(', ')}`));
  console.log(chalk.yellow('  Run: npm install'));
  allChecks = false;
}

// Check 3: Environment configuration
console.log(chalk.bold('\n3. Checking environment configuration...'));
const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');

if (fs.existsSync(envPath)) {
  require('dotenv').config();
  
  if (process.env.NEW_RELIC_API_KEY && process.env.NEW_RELIC_ACCOUNT_ID) {
    console.log(chalk.green('✓ .env file exists with New Relic credentials'));
    console.log(`  Account ID: ${process.env.NEW_RELIC_ACCOUNT_ID}`);
    console.log(`  API Key: ${process.env.NEW_RELIC_API_KEY.substring(0, 10)}...`);
  } else {
    console.log(chalk.yellow('⚠ .env file exists but missing credentials'));
    console.log('  Please add NEW_RELIC_API_KEY and NEW_RELIC_ACCOUNT_ID');
    allChecks = false;
  }
} else {
  console.log(chalk.red('✗ .env file not found'));
  console.log(chalk.yellow(`  Run: cp .env.example .env`));
  console.log(chalk.yellow(`  Then edit .env with your New Relic credentials`));
  allChecks = false;
}

// Check 4: Core modules
console.log(chalk.bold('\n4. Checking core modules...'));
const coreModules = {
  'Entity System': './core/entities',
  'Data Simulator': './simulation/engines/data-simulator',
  'NR Streamer': './simulation/streaming/new-relic-streamer',
  'Dashboard CLI': './dashboards/cli/dashgen.js'
};

Object.entries(coreModules).forEach(([name, modulePath]) => {
  const fullPath = path.join(__dirname, modulePath);
  if (fs.existsSync(fullPath) || fs.existsSync(fullPath + '.js')) {
    console.log(chalk.green(`✓ ${name} found`));
  } else {
    console.log(chalk.red(`✗ ${name} missing at ${modulePath}`));
    allChecks = false;
  }
});

// Check 5: Example files
console.log(chalk.bold('\n5. Checking example files...'));
const examples = [
  'simple-streaming.js',
  'production-streaming.js'
];

examples.forEach(example => {
  const examplePath = path.join(__dirname, 'examples', example);
  if (fs.existsSync(examplePath)) {
    console.log(chalk.green(`✓ ${example} found`));
  } else {
    console.log(chalk.red(`✗ ${example} missing`));
    allChecks = false;
  }
});

// Check 6: API Server
console.log(chalk.bold('\n6. Checking API server...'));
const apiPath = path.join(__dirname, 'api', 'server.js');
if (fs.existsSync(apiPath)) {
  console.log(chalk.green('✓ API server found'));
} else {
  console.log(chalk.yellow('⚠ API server not found (optional feature)'));
}

// Summary
console.log(chalk.bold('\n' + '='.repeat(60) + '\n'));

if (allChecks) {
  console.log(chalk.bold.green('✅ Installation verified successfully!\n'));
  console.log(chalk.bold('Next steps:'));
  console.log('1. Run a test simulation:');
  console.log(chalk.cyan('   node examples/simple-streaming.js --dry-run\n'));
  console.log('2. If dry run works, run with real data:');
  console.log(chalk.cyan('   node examples/simple-streaming.js\n'));
  console.log('3. Generate a dashboard:');
  console.log(chalk.cyan('   node dashboards/cli/dashgen.js create --template cluster-overview\n'));
} else {
  console.log(chalk.bold.red('❌ Installation has issues that need to be fixed.\n'));
  console.log('Please address the issues above and run this script again.');
}

// Test basic functionality
if (allChecks && process.argv.includes('--test')) {
  console.log(chalk.bold('\nRunning basic functionality test...\n'));
  
  try {
    const { EntityFactory } = require('./core/entities');
    const factory = new EntityFactory();
    const cluster = factory.createCluster({
      name: 'test-cluster',
      provider: 'kafka'
    });
    console.log(chalk.green('✓ Entity creation works'));
    console.log(`  Created: ${cluster.entityType} (${cluster.guid})`));
  } catch (error) {
    console.log(chalk.red('✗ Entity creation failed:', error.message));
  }
}

process.exit(allChecks ? 0 : 1);