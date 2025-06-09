#!/usr/bin/env node

/**
 * Test Configuration Validation
 * 
 * Demonstrates the configuration validator with various scenarios
 */

const chalk = require('chalk');
const ConfigValidator = require('./core/config-validator');

// Test scenarios
const testScenarios = [
  {
    name: 'Valid Simulation Mode',
    config: {
      mode: 'simulation',
      accountId: '12345',
      apiKey: 'test-api-key',
      provider: 'kafka',
      simulation: {
        topology: {
          clusterCount: 1,
          brokersPerCluster: 3,
          topicsPerCluster: 5
        }
      }
    }
  },
  {
    name: 'Infrastructure Mode (Missing User Key)',
    config: {
      mode: 'infrastructure',
      accountId: '12345',
      apiKey: 'test-api-key',
      provider: 'kafka',
      infrastructure: {
        interval: 60000
      }
    }
  },
  {
    name: 'Invalid Mode',
    config: {
      mode: 'invalid-mode',
      accountId: '12345',
      apiKey: 'test-api-key'
    }
  },
  {
    name: 'Missing Required Fields',
    config: {
      mode: 'simulation',
      provider: 'kafka'
    }
  },
  {
    name: 'Invalid Provider',
    config: {
      mode: 'simulation',
      accountId: '12345',
      apiKey: 'test-api-key',
      provider: 'invalid-provider'
    }
  },
  {
    name: 'Hybrid Mode with Warnings',
    config: {
      mode: 'hybrid',
      accountId: '12345',
      apiKey: 'test-api-key',
      provider: 'kafka',
      infrastructure: {
        interval: 10000 // Too short
      },
      streaming: {
        batchSize: 2000, // Too large
        maxRetries: 15 // Too many
      }
    }
  }
];

async function runValidationTests() {
  console.log(chalk.blue('🧪 Configuration Validation Tests\n'));

  // Test each scenario
  for (const scenario of testScenarios) {
    console.log(chalk.cyan(`\n📋 Testing: ${scenario.name}`));
    console.log(chalk.gray('─'.repeat(50)));

    const validator = new ConfigValidator();
    
    // Mock environment variables for testing
    const originalEnv = { ...process.env };
    if (scenario.config.accountId && !process.env.NEW_RELIC_ACCOUNT_ID) {
      process.env.NEW_RELIC_ACCOUNT_ID = scenario.config.accountId;
    }
    if (scenario.config.apiKey && !process.env.NEW_RELIC_API_KEY) {
      process.env.NEW_RELIC_API_KEY = scenario.config.apiKey;
    }

    const result = validator.validate(scenario.config);
    
    console.log(chalk.gray(`Configuration:`));
    console.log(chalk.gray(JSON.stringify(scenario.config, null, 2)));
    console.log();
    
    console.log(chalk.gray(`Validation Result:`));
    console.log(chalk.gray(`- Valid: ${result.valid ? '✅' : '❌'}`));
    console.log(chalk.gray(`- Errors: ${result.summary.errorCount}`));
    console.log(chalk.gray(`- Warnings: ${result.summary.warningCount}`));
    console.log(chalk.gray(`- Info: ${result.summary.infoCount}`));

    // Restore environment
    process.env = originalEnv;
  }

  // Test configuration templates
  console.log(chalk.blue('\n\n📝 Configuration Templates\n'));

  const modes = ['simulation', 'infrastructure', 'hybrid'];
  for (const mode of modes) {
    console.log(chalk.cyan(`\n${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode Template:`));
    const template = ConfigValidator.generateTemplate(mode);
    console.log(chalk.gray(JSON.stringify(template, null, 2)));
  }

  // Test with current environment
  console.log(chalk.blue('\n\n🔍 Current Environment Validation\n'));
  
  const validator = new ConfigValidator();
  const currentConfig = {
    mode: process.env.PLATFORM_MODE || 'simulation',
    accountId: process.env.NEW_RELIC_ACCOUNT_ID,
    apiKey: process.env.NEW_RELIC_API_KEY || process.env.NEW_RELIC_INGEST_KEY,
    userApiKey: process.env.NEW_RELIC_USER_API_KEY,
    provider: process.env.MESSAGE_QUEUE_PROVIDER || 'kafka'
  };

  const result = validator.validate(currentConfig);
  validator.printReport(result);

  // Provide setup guidance if there are errors
  if (!result.valid) {
    console.log(chalk.blue('\n📚 Setup Guide:\n'));
    
    console.log(chalk.cyan('1. Create a .env file:'));
    console.log(chalk.gray('   cp .env.example .env'));
    console.log();
    
    console.log(chalk.cyan('2. Add your New Relic credentials:'));
    console.log(chalk.gray('   NEW_RELIC_ACCOUNT_ID=your_account_id'));
    console.log(chalk.gray('   NEW_RELIC_API_KEY=your_ingest_key'));
    console.log(chalk.gray('   NEW_RELIC_USER_API_KEY=your_user_key  # For infrastructure mode'));
    console.log();
    
    console.log(chalk.cyan('3. Choose your mode:'));
    console.log(chalk.gray('   - simulation: Generate synthetic data (default)'));
    console.log(chalk.gray('   - infrastructure: Use real nri-kafka data'));
    console.log(chalk.gray('   - hybrid: Combine real and simulated data'));
    console.log();
    
    console.log(chalk.cyan('4. Run the platform:'));
    console.log(chalk.gray('   node platform.js --mode simulation'));
  }

  console.log(chalk.blue('\n✅ Configuration validation tests completed!\n'));
}

// Run tests if called directly
if (require.main === module) {
  runValidationTests().catch(console.error);
}

module.exports = { runValidationTests };