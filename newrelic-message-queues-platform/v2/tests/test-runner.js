#!/usr/bin/env node

/**
 * V2 Platform Test Runner
 * Executes all v2 tests with categorized results and performance metrics
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

class V2TestRunner {
  constructor() {
    this.testSuites = [
      {
        name: 'Unit Tests',
        category: 'unit',
        files: [
          'unit/mode-controller.test.js',
          'unit/platform-orchestrator.test.js',
          'unit/streaming-orchestrator.test.js'
        ]
      },
      {
        name: 'Integration Tests',
        category: 'integration',
        files: [
          'integration/data-pipeline.test.js'
        ]
      },
      {
        name: 'Performance Tests',
        category: 'performance',
        files: [
          'performance/performance.test.js'
        ]
      },
      {
        name: 'Mode Transition Tests',
        category: 'mode-transition',
        files: [
          'mode-transition/mode-transition.test.js'
        ]
      }
    ];

    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
      suites: {}
    };
  }

  async run(options = {}) {
    const { 
      category = null, 
      verbose = false, 
      coverage = false,
      bail = false,
      watch = false
    } = options;

    console.log(chalk.bold.blue('\n🚀 V2 Platform Test Runner\n'));

    const startTime = Date.now();
    const suitesToRun = category 
      ? this.testSuites.filter(suite => suite.category === category)
      : this.testSuites;

    if (suitesToRun.length === 0) {
      console.error(chalk.red(`No test suites found for category: ${category}`));
      process.exit(1);
    }

    // Run test suites
    for (const suite of suitesToRun) {
      await this.runTestSuite(suite, { verbose, coverage, bail, watch });
    }

    // Display results
    this.results.totalDuration = Date.now() - startTime;
    this.displayResults();

    // Generate report
    if (options.report) {
      await this.generateReport(options.reportPath);
    }

    // Exit with appropriate code
    process.exit(this.results.failed > 0 ? 1 : 0);
  }

  async runTestSuite(suite, options) {
    console.log(chalk.bold.cyan(`\n📦 Running ${suite.name}...\n`));

    const suiteStartTime = Date.now();
    const suiteResults = {
      passed: 0,
      failed: 0,
      skipped: 0,
      tests: []
    };

    for (const file of suite.files) {
      const result = await this.runTestFile(file, options);
      suiteResults.passed += result.passed;
      suiteResults.failed += result.failed;
      suiteResults.skipped += result.skipped;
      suiteResults.tests.push(result);
    }

    suiteResults.duration = Date.now() - suiteStartTime;
    this.results.suites[suite.name] = suiteResults;
    this.results.passed += suiteResults.passed;
    this.results.failed += suiteResults.failed;
    this.results.skipped += suiteResults.skipped;

    // Display suite summary
    this.displaySuiteSummary(suite.name, suiteResults);
  }

  async runTestFile(file, options) {
    const testPath = path.join(__dirname, file);
    
    if (!fs.existsSync(testPath)) {
      console.error(chalk.red(`Test file not found: ${file}`));
      return { passed: 0, failed: 1, skipped: 0, file };
    }

    return new Promise((resolve) => {
      const args = [
        '--testPathPattern', file,
        '--runInBand',
        '--forceExit'
      ];

      if (options.coverage) {
        args.push('--coverage');
      }

      if (options.verbose) {
        args.push('--verbose');
      }

      if (options.bail) {
        args.push('--bail');
      }

      if (options.watch) {
        args.push('--watch');
      }

      const jest = spawn('npm', ['test', '--', ...args], {
        cwd: path.join(__dirname, '../..'),
        stdio: options.verbose ? 'inherit' : 'pipe'
      });

      let output = '';
      let passed = 0;
      let failed = 0;
      let skipped = 0;

      if (!options.verbose) {
        jest.stdout.on('data', (data) => {
          output += data.toString();
          
          // Parse Jest output for test counts
          const passMatch = data.toString().match(/(\d+) passed/);
          const failMatch = data.toString().match(/(\d+) failed/);
          const skipMatch = data.toString().match(/(\d+) skipped/);
          
          if (passMatch) passed = parseInt(passMatch[1]);
          if (failMatch) failed = parseInt(failMatch[1]);
          if (skipMatch) skipped = parseInt(skipMatch[1]);
        });

        jest.stderr.on('data', (data) => {
          output += data.toString();
        });
      }

      jest.on('close', (code) => {
        if (!options.verbose && (code !== 0 || options.debug)) {
          console.log(output);
        }

        resolve({
          file,
          passed,
          failed,
          skipped,
          exitCode: code,
          output
        });
      });
    });
  }

  displaySuiteSummary(suiteName, results) {
    const status = results.failed === 0 ? '✅' : '❌';
    const color = results.failed === 0 ? 'green' : 'red';
    
    console.log(chalk[color](
      `${status} ${suiteName}: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped (${results.duration}ms)`
    ));
  }

  displayResults() {
    console.log(chalk.bold.blue('\n📊 Test Results Summary\n'));

    const totalTests = this.results.passed + this.results.failed + this.results.skipped;
    const passRate = totalTests > 0 ? (this.results.passed / totalTests * 100).toFixed(1) : 0;

    console.log(chalk.bold('Total Tests:'), totalTests);
    console.log(chalk.green('Passed:'), this.results.passed);
    console.log(chalk.red('Failed:'), this.results.failed);
    console.log(chalk.yellow('Skipped:'), this.results.skipped);
    console.log(chalk.bold('Pass Rate:'), `${passRate}%`);
    console.log(chalk.bold('Duration:'), `${(this.results.totalDuration / 1000).toFixed(2)}s`);

    // Display suite breakdown
    console.log(chalk.bold.blue('\n📋 Suite Breakdown:\n'));
    
    Object.entries(this.results.suites).forEach(([name, suite]) => {
      const suiteTotal = suite.passed + suite.failed + suite.skipped;
      const suitePassRate = suiteTotal > 0 ? (suite.passed / suiteTotal * 100).toFixed(1) : 0;
      
      console.log(chalk.bold(`${name}:`));
      console.log(`  Tests: ${suiteTotal} | Pass Rate: ${suitePassRate}% | Duration: ${(suite.duration / 1000).toFixed(2)}s`);
      
      if (suite.failed > 0) {
        console.log(chalk.red(`  Failed tests:`));
        suite.tests.filter(t => t.failed > 0).forEach(test => {
          console.log(chalk.red(`    - ${test.file}`));
        });
      }
    });

    // Performance metrics for performance tests
    const perfSuite = this.results.suites['Performance Tests'];
    if (perfSuite && perfSuite.tests.length > 0) {
      console.log(chalk.bold.blue('\n⚡ Performance Metrics:\n'));
      this.extractPerformanceMetrics(perfSuite);
    }
  }

  extractPerformanceMetrics(perfSuite) {
    // Parse performance test output for key metrics
    perfSuite.tests.forEach(test => {
      if (test.output) {
        // Extract throughput
        const throughputMatch = test.output.match(/Throughput: (\d+) events\/second/);
        if (throughputMatch) {
          console.log(chalk.green(`  ✓ Throughput: ${throughputMatch[1]} events/second`));
        }

        // Extract latency
        const latencyMatch = test.output.match(/Average: ([\d.]+)ms/);
        if (latencyMatch) {
          console.log(chalk.green(`  ✓ Average Latency: ${latencyMatch[1]}ms`));
        }

        // Extract memory usage
        const memoryMatch = test.output.match(/Max memory increase: ([\d.]+)MB/);
        if (memoryMatch) {
          console.log(chalk.green(`  ✓ Max Memory Increase: ${memoryMatch[1]}MB`));
        }
      }
    });
  }

  async generateReport(reportPath = './test-report.json') {
    const report = {
      timestamp: new Date().toISOString(),
      results: this.results,
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch
      },
      testSuites: this.testSuites
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(chalk.green(`\n📄 Test report generated: ${reportPath}`));
  }
}

// CLI Interface
if (require.main === module) {
  const yargs = require('yargs/yargs');
  const { hideBin } = require('yargs/helpers');

  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 [options]')
    .option('category', {
      alias: 'c',
      describe: 'Run specific test category',
      choices: ['unit', 'integration', 'performance', 'mode-transition'],
      type: 'string'
    })
    .option('verbose', {
      alias: 'v',
      describe: 'Verbose output',
      type: 'boolean',
      default: false
    })
    .option('coverage', {
      describe: 'Generate code coverage report',
      type: 'boolean',
      default: false
    })
    .option('bail', {
      alias: 'b',
      describe: 'Stop on first test failure',
      type: 'boolean',
      default: false
    })
    .option('watch', {
      alias: 'w',
      describe: 'Watch files for changes',
      type: 'boolean',
      default: false
    })
    .option('report', {
      alias: 'r',
      describe: 'Generate JSON test report',
      type: 'boolean',
      default: false
    })
    .option('report-path', {
      describe: 'Path for test report',
      type: 'string',
      default: './v2-test-report.json'
    })
    .example('$0', 'Run all v2 tests')
    .example('$0 -c unit', 'Run only unit tests')
    .example('$0 -v --coverage', 'Run with verbose output and coverage')
    .example('$0 -c performance -r', 'Run performance tests and generate report')
    .help()
    .argv;

  const runner = new V2TestRunner();
  runner.run(argv).catch(console.error);
}

module.exports = V2TestRunner;