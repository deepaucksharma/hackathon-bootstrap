#!/usr/bin/env node

/**
 * Automated Test Suite Runner
 * 
 * Runs all platform tests and generates a comprehensive report
 */

const chalk = require('chalk');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test definitions
const tests = [
  {
    name: 'Platform Integration',
    file: 'test-platform-integration.js',
    timeout: 30000,
    critical: true
  },
  {
    name: 'Entity Relationships',
    file: 'test-relationships.js',
    timeout: 20000,
    critical: true
  },
  {
    name: 'Infrastructure Mode',
    file: 'test-infrastructure-mode.js',
    args: ['--mock'],
    timeout: 30000,
    critical: true
  },
  {
    name: 'Hybrid Mode',
    file: 'test-hybrid-mode.js',
    timeout: 20000,
    critical: false
  },
  {
    name: 'Error Recovery',
    file: 'test-error-recovery-simple.js',
    timeout: 25000,
    critical: false
  },
  {
    name: 'CLI Simulation',
    file: 'tools/cli/mq-platform.js',
    args: ['simulate', 'stream', '--duration', '1', '--interval', '30'],
    env: {
      NEW_RELIC_ACCOUNT_ID: '12345',
      NEW_RELIC_API_KEY: 'test-key',
      DRY_RUN: 'true'
    },
    timeout: 90000,
    critical: true
  },
  {
    name: 'CLI Dashboard',
    file: 'tools/cli/mq-platform.js',
    args: ['dashboard', 'create', 'cluster-overview', '--provider', 'kafka', '--dry-run'],
    env: {
      NEW_RELIC_ACCOUNT_ID: '12345',
      NEW_RELIC_USER_API_KEY: 'test-key'
    },
    timeout: 15000,
    critical: true
  }
];

// Test runner
class TestRunner {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  async runTest(test) {
    const testStart = Date.now();
    console.log(chalk.cyan(`\n▶️  Running: ${test.name}`));
    console.log(chalk.gray(`   File: ${test.file}`));
    
    return new Promise((resolve) => {
      const env = {
        ...process.env,
        ...test.env,
        NODE_ENV: 'test'
      };

      const testPath = path.join(__dirname, test.file);
      const args = test.args || [];
      
      const child = spawn('node', [testPath, ...args], {
        env,
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';
      let timedOut = false;

      // Set timeout
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, test.timeout);

      child.stdout.on('data', (data) => {
        output += data.toString();
        if (process.env.VERBOSE) {
          process.stdout.write(chalk.gray(data));
        }
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
        if (process.env.VERBOSE) {
          process.stderr.write(chalk.red(data));
        }
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        const duration = Date.now() - testStart;
        
        const result = {
          name: test.name,
          file: test.file,
          critical: test.critical,
          duration,
          timedOut,
          exitCode: code,
          passed: !timedOut && code === 0,
          output,
          errorOutput
        };

        if (result.passed) {
          console.log(chalk.green(`✅ ${test.name} passed (${duration}ms)`));
        } else if (timedOut) {
          console.log(chalk.red(`❌ ${test.name} timed out after ${test.timeout}ms`));
        } else {
          console.log(chalk.red(`❌ ${test.name} failed with exit code ${code} (${duration}ms)`));
          if (errorOutput) {
            console.log(chalk.red('   Error:', errorOutput.split('\n')[0]));
          }
        }

        this.results.push(result);
        resolve(result);
      });
    });
  }

  async runAll() {
    console.log(chalk.bold.magenta('\n🧪 New Relic Message Queues Platform - Test Suite\n'));
    console.log(chalk.gray(`Running ${tests.length} tests...\n`));

    for (const test of tests) {
      await this.runTest(test);
    }

    this.generateReport();
  }

  generateReport() {
    const totalDuration = Date.now() - this.startTime;
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const criticalFailures = this.results.filter(r => !r.passed && r.critical).length;

    console.log(chalk.bold.cyan('\n📊 Test Results Summary\n'));
    console.log(chalk.gray('─'.repeat(50)));
    
    // Results table
    this.results.forEach(result => {
      const status = result.passed ? chalk.green('PASS') : chalk.red('FAIL');
      const duration = chalk.gray(`${result.duration}ms`);
      const critical = result.critical ? chalk.yellow(' [CRITICAL]') : '';
      console.log(`${status} ${result.name.padEnd(25)} ${duration}${critical}`);
    });
    
    console.log(chalk.gray('─'.repeat(50)));
    
    // Summary
    console.log(chalk.bold('\nSummary:'));
    console.log(chalk.green(`  ✅ Passed: ${passed}`));
    console.log(chalk.red(`  ❌ Failed: ${failed}`));
    console.log(chalk.yellow(`  ⚠️  Critical failures: ${criticalFailures}`));
    console.log(chalk.gray(`  ⏱️  Total duration: ${(totalDuration / 1000).toFixed(1)}s`));
    
    // Overall status
    const overallStatus = criticalFailures === 0 ? 'PASSED' : 'FAILED';
    const statusColor = criticalFailures === 0 ? chalk.green : chalk.red;
    
    console.log(chalk.bold(`\n🏁 Test Suite ${statusColor(overallStatus)}\n`));

    // Save report
    this.saveReport();
    
    // Exit with appropriate code
    process.exit(criticalFailures > 0 ? 1 : 0);
  }

  saveReport() {
    const report = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.startTime,
      tests: this.results,
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: this.results.filter(r => !r.passed).length,
        criticalFailures: this.results.filter(r => !r.passed && r.critical).length
      }
    };

    const reportPath = path.join(__dirname, 'test-results.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(chalk.gray(`\n📄 Detailed report saved to: ${reportPath}`));
  }
}

// Handle interruption
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n⚠️  Test suite interrupted'));
  process.exit(1);
});

// Run tests
const runner = new TestRunner();
runner.runAll().catch(error => {
  console.error(chalk.red('\n❌ Test runner error:'), error.message);
  process.exit(1);
});