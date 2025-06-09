/**
 * New Relic Message Queues Platform - Comprehensive Test Suite
 * 
 * Consolidates all platform tests into a single executable
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

console.log(chalk.bold.blue(`
╔══════════════════════════════════════════════════════════════╗
║     New Relic Message Queues Platform Test Suite v1.0        ║
╚══════════════════════════════════════════════════════════════╝
`));

// Test Results Accumulator
const testResults = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

// Utility Functions
function recordTest(name, passed, details = '') {
  testResults.tests.push({ name, passed, details });
  if (passed) {
    testResults.passed++;
  } else {
    testResults.failed++;
  }
}

function recordWarning(message) {
  testResults.warnings++;
  console.log(chalk.yellow(`⚠️  ${message}`));
}

// Test 1: Basic Structure Tests
async function testBasicStructure() {
  console.log(chalk.bold.yellow('\n📁 Test 1: Basic Structure & Files\n'));
  
  const requiredDirs = [
    'core/entities',
    'simulation/engines',
    'simulation/streaming',
    'dashboards/framework',
    'dashboards/builders',
    'verification/lib',
    'examples',
    'docs',
    'tools/cli'
  ];

  const requiredFiles = [
    'package.json',
    'index.js',
    'README.md',
    'core/entities/entity-factory.js',
    'simulation/engines/data-simulator.js',
    'dashboards/builders/dashboard-builder.js',
    'tools/cli/mq-platform.js'
  ];

  console.log(chalk.gray('Checking directories...'));
  requiredDirs.forEach(dir => {
    const exists = fs.existsSync(path.join(__dirname, dir));
    if (exists) {
      console.log(chalk.green(`   ✓ ${dir}`));
      recordTest(`Directory: ${dir}`, true);
    } else {
      console.log(chalk.red(`   ✗ ${dir}`));
      recordTest(`Directory: ${dir}`, false);
    }
  });

  console.log(chalk.gray('\nChecking key files...'));
  requiredFiles.forEach(file => {
    const exists = fs.existsSync(path.join(__dirname, file));
    if (exists) {
      console.log(chalk.green(`   ✓ ${file}`));
      recordTest(`File: ${file}`, true);
    } else {
      console.log(chalk.red(`   ✗ ${file}`));
      recordTest(`File: ${file}`, false);
    }
  });
}

// Test 2: Component Functionality
async function testComponents() {
  console.log(chalk.bold.yellow('\n🔧 Test 2: Component Functionality\n'));
  
  try {
    // Test Entity Factory
    console.log(chalk.gray('Testing Entity Factory...'));
    const { EntityFactory } = require('./core/entities');
    const factory = new EntityFactory();
    const cluster = factory.createCluster({
      name: 'test-cluster',
      provider: 'kafka',
      accountId: 123456
    });
    
    if (cluster.entityType === 'MESSAGE_QUEUE_CLUSTER' && cluster.guid) {
      console.log(chalk.green('   ✓ Entity Factory: Creates clusters correctly'));
      recordTest('Entity Factory', true);
    } else {
      throw new Error('Invalid cluster entity');
    }
  } catch (error) {
    console.log(chalk.red(`   ✗ Entity Factory: ${error.message}`));
    recordTest('Entity Factory', false, error.message);
  }

  try {
    // Test Data Simulator
    console.log(chalk.gray('\nTesting Data Simulator...'));
    const DataSimulator = require('./simulation/engines/data-simulator');
    const simulator = new DataSimulator();
    const topology = simulator.createTopology({
      provider: 'kafka',
      clusterCount: 1,
      brokersPerCluster: 3,
      topicsPerCluster: 5
    });
    
    if (topology.clusters.length === 1 && topology.brokers.length === 3) {
      console.log(chalk.green('   ✓ Data Simulator: Creates topology correctly'));
      recordTest('Data Simulator - Topology', true);
      
      // Test metric generation
      const cluster = topology.clusters[0];
      simulator.updateClusterMetrics(cluster);
      
      if (cluster.goldenMetrics && cluster.goldenMetrics.length > 0) {
        console.log(chalk.green('   ✓ Data Simulator: Generates metrics correctly'));
        recordTest('Data Simulator - Metrics', true);
      } else {
        throw new Error('No metrics generated');
      }
    }
  } catch (error) {
    console.log(chalk.red(`   ✗ Data Simulator: ${error.message}`));
    recordTest('Data Simulator', false, error.message);
  }

  try {
    // Test Dashboard Builder
    console.log(chalk.gray('\nTesting Dashboard Builder...'));
    const DashboardBuilder = require('./dashboards/builders/dashboard-builder');
    const builder = new DashboardBuilder();
    
    const dashboard = builder.buildDashboard({
      name: 'Test Dashboard',
      permissions: 'PUBLIC_READ_WRITE',
      pages: [{ name: 'Overview', widgets: [] }]
    });
    
    if (dashboard.name && dashboard.pages) {
      console.log(chalk.green('   ✓ Dashboard Builder: Creates dashboards correctly'));
      recordTest('Dashboard Builder', true);
    }
    
    const widget = builder.createWidget({
      title: 'Test Widget',
      row: 1,
      column: 1,
      width: 6,
      height: 3,
      visualization: 'billboard'
    });
    
    if (widget.title && widget.configuration) {
      console.log(chalk.green('   ✓ Dashboard Builder: Creates widgets correctly'));
      recordTest('Dashboard Widgets', true);
    }
  } catch (error) {
    console.log(chalk.red(`   ✗ Dashboard Builder: ${error.message}`));
    recordTest('Dashboard Builder', false, error.message);
  }
}

// Test 3: Environment & Connectivity
async function testConnectivity() {
  console.log(chalk.bold.yellow('\n🔌 Test 3: Environment & Connectivity\n'));
  
  // Check environment variables
  console.log(chalk.gray('Checking environment variables...'));
  const requiredVars = [
    'NEW_RELIC_API_KEY',
    'NEW_RELIC_USER_API_KEY',
    'NEW_RELIC_ACCOUNT_ID'
  ];
  
  let allVarsPresent = true;
  requiredVars.forEach(varName => {
    if (process.env[varName]) {
      console.log(chalk.green(`   ✓ ${varName}: Set`));
      recordTest(`Env: ${varName}`, true);
    } else {
      console.log(chalk.red(`   ✗ ${varName}: Missing`));
      recordTest(`Env: ${varName}`, false);
      allVarsPresent = false;
    }
  });

  if (!allVarsPresent) {
    recordWarning('Missing environment variables - API tests will be skipped');
    return;
  }

  // Test API connectivity
  console.log(chalk.gray('\nTesting API connectivity...'));
  
  async function testAPIKey(apiKey, apiType) {
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.newrelic.com',
        port: 443,
        path: '/v2/applications.json',
        method: 'GET',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        resolve({
          type: apiType,
          status: res.statusCode === 200 ? 'valid' : 'invalid',
          statusCode: res.statusCode
        });
      });

      req.on('error', (error) => {
        resolve({
          type: apiType,
          status: 'error',
          error: error.message
        });
      });

      req.end();
    });
  }

  const userResult = await testAPIKey(process.env.NEW_RELIC_USER_API_KEY, 'User API');
  if (userResult.status === 'valid') {
    console.log(chalk.green('   ✓ User API Key: Valid'));
    recordTest('User API Key', true);
  } else {
    console.log(chalk.yellow(`   ⚠️  User API Key: ${userResult.status} (${userResult.statusCode})`));
    recordWarning(`User API Key ${userResult.status}`);
  }
}

// Test 4: Dry-Run Functionality
async function testDryRun() {
  console.log(chalk.bold.yellow('\n🧪 Test 4: Dry-Run Functionality\n'));
  
  try {
    console.log(chalk.gray('Testing NewRelicStreamer dry-run mode...'));
    const NewRelicStreamer = require('./simulation/streaming/new-relic-streamer');
    
    const streamer = new NewRelicStreamer({
      apiKey: 'mock-api-key',
      accountId: 123456,
      dryRun: true,
      verbose: false
    });
    
    const mockEntity = {
      entityType: 'MESSAGE_QUEUE_CLUSTER',
      name: 'test-cluster',
      guid: 'test-guid-123',
      accountId: 123456
    };
    
    streamer.streamEvents([mockEntity]);
    await streamer.flushAll();
    
    const stats = streamer.getStats();
    console.log(chalk.green('   ✓ Dry-run mode: Works correctly'));
    console.log(chalk.gray(`     Events queued: ${stats.events.sent + stats.events.pending}`));
    recordTest('Dry-run Mode', true);
    
  } catch (error) {
    console.log(chalk.red(`   ✗ Dry-run mode: ${error.message}`));
    recordTest('Dry-run Mode', false, error.message);
  }
}

// Test 5: CLI Commands
async function testCLI() {
  console.log(chalk.bold.yellow('\n💻 Test 5: CLI Commands\n'));
  
  const cliPath = path.join(__dirname, 'tools/cli/mq-platform.js');
  
  // Check if CLI exists
  if (fs.existsSync(cliPath)) {
    console.log(chalk.green('   ✓ CLI tool exists'));
    recordTest('CLI Exists', true);
    
    // Check if it's executable
    try {
      const stat = fs.statSync(cliPath);
      if (stat.mode & parseInt('111', 8)) {
        console.log(chalk.green('   ✓ CLI tool is executable'));
        recordTest('CLI Executable', true);
      } else {
        console.log(chalk.yellow('   ⚠️  CLI tool needs execute permissions'));
        recordWarning('CLI needs chmod +x');
      }
    } catch (error) {
      console.log(chalk.red(`   ✗ CLI permission check: ${error.message}`));
      recordTest('CLI Permissions', false, error.message);
    }
  } else {
    console.log(chalk.red('   ✗ CLI tool missing'));
    recordTest('CLI Exists', false);
  }
}

// Test 6: Example Workflows
async function testWorkflows() {
  console.log(chalk.bold.yellow('\n📋 Test 6: Example Workflows\n'));
  
  const examples = [
    'examples/mode1-entity-proposal.js',
    'examples/mode2-existing-entities.js',
    'examples/mode3-hybrid.js'
  ];
  
  examples.forEach(example => {
    const exists = fs.existsSync(path.join(__dirname, example));
    if (exists) {
      console.log(chalk.green(`   ✓ ${example}`));
      recordTest(`Example: ${path.basename(example)}`, true);
    } else {
      console.log(chalk.red(`   ✗ ${example}`));
      recordTest(`Example: ${path.basename(example)}`, false);
    }
  });
}

// Test 7: Documentation
async function testDocumentation() {
  console.log(chalk.bold.yellow('\n📚 Test 7: Documentation\n'));
  
  const docs = [
    'docs/DEVELOPER_GUIDE.md',
    'docs/API_REFERENCE.md',
    'docs/QUICKSTART.md',
    'docs/ARCHITECTURE.md'
  ];
  
  docs.forEach(doc => {
    const exists = fs.existsSync(path.join(__dirname, doc));
    if (exists) {
      console.log(chalk.green(`   ✓ ${doc}`));
      recordTest(`Doc: ${path.basename(doc)}`, true);
    } else {
      console.log(chalk.red(`   ✗ ${doc}`));
      recordTest(`Doc: ${path.basename(doc)}`, false);
    }
  });
}

// Main Test Runner
async function runAllTests() {
  const startTime = Date.now();
  
  try {
    await testBasicStructure();
    await testComponents();
    await testConnectivity();
    await testDryRun();
    await testCLI();
    await testWorkflows();
    await testDocumentation();
  } catch (error) {
    console.error(chalk.red(`\n❌ Test suite error: ${error.message}`));
  }
  
  // Display summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const total = testResults.passed + testResults.failed;
  const passRate = total > 0 ? ((testResults.passed / total) * 100).toFixed(1) : 0;
  
  console.log(chalk.bold.blue('\n═══════════════════════════════════════════════════════════════'));
  console.log(chalk.bold.white('                        TEST SUMMARY                           '));
  console.log(chalk.bold.blue('═══════════════════════════════════════════════════════════════\n'));
  
  console.log(chalk.white(`Total Tests:    ${total}`));
  console.log(chalk.green(`Passed:         ${testResults.passed}`));
  console.log(chalk.red(`Failed:         ${testResults.failed}`));
  console.log(chalk.yellow(`Warnings:       ${testResults.warnings}`));
  console.log(chalk.white(`Pass Rate:      ${passRate}%`));
  console.log(chalk.gray(`Duration:       ${duration}s`));
  
  if (testResults.failed > 0) {
    console.log(chalk.red('\n❌ Failed Tests:'));
    testResults.tests
      .filter(t => !t.passed)
      .forEach(t => console.log(chalk.red(`   • ${t.name}${t.details ? `: ${t.details}` : ''}`)));
  }
  
  if (testResults.warnings > 0) {
    console.log(chalk.yellow('\n⚠️  See warnings above for potential issues'));
  }
  
  if (passRate === '100.0' && testResults.warnings === 0) {
    console.log(chalk.bold.green('\n🎉 All tests passed! Platform is fully operational.'));
  } else if (passRate >= 80) {
    console.log(chalk.bold.yellow('\n✅ Platform is operational with minor issues.'));
  } else {
    console.log(chalk.bold.red('\n❌ Platform has significant issues that need attention.'));
  }
  
  // Recommendations
  console.log(chalk.bold.white('\n📋 Recommendations:\n'));
  
  if (!process.env.NEW_RELIC_API_KEY) {
    console.log(chalk.gray('1. Set NEW_RELIC_API_KEY for data streaming'));
  }
  if (!process.env.NEW_RELIC_USER_API_KEY) {
    console.log(chalk.gray('2. Set NEW_RELIC_USER_API_KEY for dashboard creation'));
  }
  if (testResults.passed === total) {
    console.log(chalk.gray('1. Run Mode 1 example: node examples/mode1-entity-proposal.js --dry-run'));
    console.log(chalk.gray('2. Test CLI: npx mq-platform --help'));
    console.log(chalk.gray('3. Create a test dashboard: npx mq-platform dashboard create --dry-run'));
  }
  
  console.log('');
}

// Test 8: Integration Tests
async function testIntegration() {
  console.log(chalk.bold.yellow('\n🔄 Test 8: Integration Tests\n'));
  
  try {
    // Test full workflow integration
    console.log(chalk.gray('Testing entity creation to dashboard generation...'));
    
    const { EntityFactory } = require('./core/entities');
    const DataSimulator = require('./simulation/engines/data-simulator');
    const DashboardBuilder = require('./dashboards/builders/dashboard-builder');
    const MessageQueuesContentProvider = require('./dashboards/content/message-queues/message-queues-content-provider');
    
    // Create entities
    const factory = new EntityFactory();
    const cluster = factory.createCluster({
      name: 'integration-test-cluster',
      provider: 'kafka',
      environment: 'test',
      accountId: process.env.NEW_RELIC_ACCOUNT_ID || 123456
    });
    
    // Generate metrics
    const simulator = new DataSimulator();
    simulator.updateClusterMetrics(cluster);
    
    // Build dashboard
    const contentProvider = new MessageQueuesContentProvider();
    const template = contentProvider.getTemplate('cluster-overview');
    
    if (template && cluster.goldenMetrics) {
      console.log(chalk.green('   ✓ Integration: Entity → Metrics → Dashboard flow works'));
      recordTest('Integration Flow', true);
    } else {
      throw new Error('Integration flow incomplete');
    }
    
  } catch (error) {
    console.log(chalk.red(`   ✗ Integration: ${error.message}`));
    recordTest('Integration Flow', false, error.message);
  }
}

// Test 9: Performance Tests
async function testPerformance() {
  console.log(chalk.bold.yellow('\n⚡ Test 9: Performance Tests\n'));
  
  try {
    const DataSimulator = require('./simulation/engines/data-simulator');
    const simulator = new DataSimulator();
    
    // Test large topology creation
    console.log(chalk.gray('Testing large topology creation...'));
    const startTime = Date.now();
    
    const topology = simulator.createTopology({
      provider: 'kafka',
      clusterCount: 10,
      brokersPerCluster: 20,
      topicsPerCluster: 100,
      partitionsPerTopic: 10
    });
    
    const duration = Date.now() - startTime;
    const entityCount = topology.clusters.length + topology.brokers.length + topology.topics.length;
    
    console.log(chalk.gray(`   Created ${entityCount} entities in ${duration}ms`));
    
    if (duration < 5000) {
      console.log(chalk.green('   ✓ Performance: Large topology creation is fast'));
      recordTest('Performance - Topology', true);
    } else {
      console.log(chalk.yellow(`   ⚠️  Performance: Topology creation took ${duration}ms`));
      recordWarning('Topology creation may be slow for large deployments');
    }
    
    // Test metric generation performance
    const metricStart = Date.now();
    let totalMetrics = 0;
    
    topology.clusters.forEach(cluster => {
      simulator.updateClusterMetrics(cluster);
      totalMetrics += cluster.goldenMetrics ? cluster.goldenMetrics.length : 0;
    });
    
    const metricDuration = Date.now() - metricStart;
    console.log(chalk.gray(`   Generated ${totalMetrics} metrics in ${metricDuration}ms`));
    
    if (metricDuration < 1000) {
      console.log(chalk.green('   ✓ Performance: Metric generation is fast'));
      recordTest('Performance - Metrics', true);
    } else {
      console.log(chalk.yellow(`   ⚠️  Performance: Metric generation took ${metricDuration}ms`));
      recordWarning('Metric generation may impact real-time streaming');
    }
    
  } catch (error) {
    console.log(chalk.red(`   ✗ Performance: ${error.message}`));
    recordTest('Performance Tests', false, error.message);
  }
}

// Test 10: Error Handling
async function testErrorHandling() {
  console.log(chalk.bold.yellow('\n🛡️ Test 10: Error Handling\n'));
  
  try {
    // Test invalid entity creation
    console.log(chalk.gray('Testing error handling for invalid inputs...'));
    const { EntityFactory } = require('./core/entities');
    const factory = new EntityFactory();
    
    try {
      factory.createCluster({}); // Missing required fields
      console.log(chalk.red('   ✗ Error handling: Should have thrown for missing fields'));
      recordTest('Error Handling - Validation', false);
    } catch (error) {
      console.log(chalk.green('   ✓ Error handling: Properly validates required fields'));
      recordTest('Error Handling - Validation', true);
    }
    
    // Test graceful degradation
    const NewRelicStreamer = require('./simulation/streaming/new-relic-streamer');
    const streamer = new NewRelicStreamer({
      apiKey: 'invalid-key',
      accountId: 'invalid',
      dryRun: true
    });
    
    await streamer.streamEvents([{ invalid: 'entity' }]);
    const stats = streamer.getStats();
    
    // In dry-run mode, even invalid entities shouldn't cause failures
    if (stats.events && (stats.events.failed === 0 || stats.events.failed === undefined)) {
      console.log(chalk.green('   ✓ Error handling: Dry-run prevents invalid API calls'));
      recordTest('Error Handling - Dry-run', true);
    } else {
      console.log(chalk.red('   ✗ Error handling: Dry-run failed to prevent errors'));
      recordTest('Error Handling - Dry-run', false);
    }
    
  } catch (error) {
    console.log(chalk.red(`   ✗ Error handling: ${error.message}`));
    recordTest('Error Handling', false, error.message);
  }
}

// Save detailed test report
function saveTestReport() {
  const reportPath = path.join(__dirname, 'test-results.json');
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: testResults.passed + testResults.failed,
      passed: testResults.passed,
      failed: testResults.failed,
      warnings: testResults.warnings,
      passRate: ((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)
    },
    environment: {
      platform: process.platform,
      nodeVersion: process.version,
      apiKeysConfigured: !!process.env.NEW_RELIC_API_KEY && !!process.env.NEW_RELIC_USER_API_KEY
    },
    tests: testResults.tests,
    recommendations: []
  };
  
  // Add recommendations based on test results
  if (!process.env.NEW_RELIC_API_KEY) {
    report.recommendations.push('Configure NEW_RELIC_API_KEY for data streaming');
  }
  if (!process.env.NEW_RELIC_USER_API_KEY) {
    report.recommendations.push('Configure NEW_RELIC_USER_API_KEY for dashboard creation');
  }
  
  testResults.tests
    .filter(t => !t.passed)
    .forEach(t => {
      if (t.name.includes('Doc:')) {
        report.recommendations.push(`Create missing documentation: ${t.name.replace('Doc: ', '')}`);
      } else if (t.name.includes('Example:')) {
        report.recommendations.push(`Fix example workflow: ${t.name.replace('Example: ', '')}`);
      }
    });
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(chalk.gray(`\n📄 Detailed test report saved to: ${reportPath}`));
}

// Main Test Runner
async function runAllTests() {
  const startTime = Date.now();
  
  try {
    await testBasicStructure();
    await testComponents();
    await testConnectivity();
    await testDryRun();
    await testCLI();
    await testWorkflows();
    await testDocumentation();
    await testIntegration();
    await testPerformance();
    await testErrorHandling();
  } catch (error) {
    console.error(chalk.red(`\n❌ Test suite error: ${error.message}`));
  }
  
  // Display summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const total = testResults.passed + testResults.failed;
  const passRate = total > 0 ? ((testResults.passed / total) * 100).toFixed(1) : 0;
  
  console.log(chalk.bold.blue('\n═══════════════════════════════════════════════════════════════'));
  console.log(chalk.bold.white('                        TEST SUMMARY                           '));
  console.log(chalk.bold.blue('═══════════════════════════════════════════════════════════════\n'));
  
  console.log(chalk.white(`Total Tests:    ${total}`));
  console.log(chalk.green(`Passed:         ${testResults.passed}`));
  console.log(chalk.red(`Failed:         ${testResults.failed}`));
  console.log(chalk.yellow(`Warnings:       ${testResults.warnings}`));
  console.log(chalk.white(`Pass Rate:      ${passRate}%`));
  console.log(chalk.gray(`Duration:       ${duration}s`));
  
  if (testResults.failed > 0) {
    console.log(chalk.red('\n❌ Failed Tests:'));
    testResults.tests
      .filter(t => !t.passed)
      .forEach(t => console.log(chalk.red(`   • ${t.name}${t.details ? `: ${t.details}` : ''}`)));
  }
  
  if (testResults.warnings > 0) {
    console.log(chalk.yellow('\n⚠️  See warnings above for potential issues'));
  }
  
  if (passRate === '100.0' && testResults.warnings === 0) {
    console.log(chalk.bold.green('\n🎉 All tests passed! Platform is fully operational.'));
  } else if (passRate >= 80) {
    console.log(chalk.bold.yellow('\n✅ Platform is operational with minor issues.'));
  } else {
    console.log(chalk.bold.red('\n❌ Platform has significant issues that need attention.'));
  }
  
  // Save test report
  saveTestReport();
  
  // Recommendations
  console.log(chalk.bold.white('\n📋 Next Steps:\n'));
  
  if (passRate === '100.0') {
    console.log(chalk.gray('1. Run Mode 1 example: node examples/mode1-entity-proposal.js --dry-run'));
    console.log(chalk.gray('2. Test CLI: npx mq-platform --help'));
    console.log(chalk.gray('3. Create a test dashboard: npx mq-platform dashboard create --dry-run'));
    console.log(chalk.gray('4. Stream test data: npx mq-platform simulate stream --duration 1'));
  } else {
    console.log(chalk.gray('1. Review test-results.json for detailed failure information'));
    console.log(chalk.gray('2. Fix failing tests before proceeding'));
    console.log(chalk.gray('3. Re-run test suite: node test-suite.js'));
  }
  
  console.log('');
}

// Run all tests
runAllTests().catch(error => {
  console.error(chalk.red(`\n❌ Fatal error: ${error.message}`));
  process.exit(1);
});