#!/usr/bin/env node

/**
 * Test Dashboard Integration
 * 
 * Verifies that the dashboard functionality works correctly
 * with the unified platform runner.
 */

import 'dotenv/config';
import chalk from 'chalk';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log(chalk.blue.bold(`
╔═══════════════════════════════════════════════════════════════╗
║           Dashboard Integration Test                          ║
╚═══════════════════════════════════════════════════════════════╝
`));

// Configuration
const config = {
  accountId: process.env.NEW_RELIC_ACCOUNT_ID,
  apiKey: process.env.NEW_RELIC_API_KEY,
  userApiKey: process.env.NEW_RELIC_USER_API_KEY,
  region: process.env.NEW_RELIC_REGION || 'US',
  provider: 'kafka'
};

// Validate configuration
if (!config.accountId || !config.apiKey || !config.userApiKey) {
  console.log(chalk.red('❌ Missing required environment variables'));
  console.log(chalk.yellow('   Required: NEW_RELIC_ACCOUNT_ID, NEW_RELIC_API_KEY, NEW_RELIC_USER_API_KEY'));
  process.exit(1);
}

async function testDashboardIntegration() {
  try {
    console.log(chalk.cyan('📦 Loading dashboard components...'));
    
    // Import the dashboard generator
    const { DashboardGenerator } = await import('./dist/dashboards/generator.js');
    
    console.log(chalk.green('✅ Components loaded successfully'));
    
    // Create dashboard generator instance
    const generator = new DashboardGenerator(config);
    
    console.log(chalk.cyan('\n🧪 Testing dashboard operations...'));
    
    // Test 1: Create a new dashboard
    console.log(chalk.blue('\n1️⃣ Creating new dashboard...'));
    let dashboardResult;
    try {
      dashboardResult = await generator.generate('Test Kafka Dashboard');
      console.log(chalk.green(`   ✅ Dashboard created successfully`));
      console.log(chalk.gray(`   GUID: ${dashboardResult.guid}`));
      console.log(chalk.gray(`   URL: ${dashboardResult.url}`));
    } catch (error) {
      console.log(chalk.red(`   ❌ Failed to create dashboard: ${error.message}`));
      throw error;
    }
    
    // Test 2: Update the dashboard
    console.log(chalk.blue('\n2️⃣ Updating dashboard...'));
    try {
      const updateResult = await generator.update(dashboardResult.guid, 'Updated Test Dashboard');
      console.log(chalk.green(`   ✅ Dashboard updated successfully`));
      console.log(chalk.gray(`   URL: ${updateResult.url}`));
    } catch (error) {
      console.log(chalk.red(`   ❌ Failed to update dashboard: ${error.message}`));
    }
    
    // Test 3: List dashboards
    console.log(chalk.blue('\n3️⃣ Listing dashboards...'));
    try {
      const dashboards = await generator.listDashboards();
      const testDashboard = dashboards.find(d => d.guid === dashboardResult.guid);
      if (testDashboard) {
        console.log(chalk.green(`   ✅ Found test dashboard in list`));
        console.log(chalk.gray(`   Name: ${testDashboard.name}`));
      } else {
        console.log(chalk.yellow(`   ⚠️  Test dashboard not found in list`));
      }
    } catch (error) {
      console.log(chalk.red(`   ❌ Failed to list dashboards: ${error.message}`));
    }
    
    // Test 4: Clean up - delete the test dashboard
    console.log(chalk.blue('\n4️⃣ Cleaning up test dashboard...'));
    try {
      const deleteResult = await generator.deleteDashboard(dashboardResult.guid);
      if (deleteResult) {
        console.log(chalk.green(`   ✅ Test dashboard deleted`));
      } else {
        console.log(chalk.yellow(`   ⚠️  Could not delete test dashboard`));
      }
    } catch (error) {
      console.log(chalk.yellow(`   ⚠️  Cleanup failed: ${error.message}`));
    }
    
    console.log(chalk.green('\n✅ Dashboard integration test completed successfully!'));
    
  } catch (error) {
    console.log(chalk.red('\n❌ Dashboard integration test failed:'));
    console.error(error);
    process.exit(1);
  }
}

// Run the test
console.log(chalk.cyan('🚀 Starting dashboard integration test...\n'));
testDashboardIntegration().catch(console.error);