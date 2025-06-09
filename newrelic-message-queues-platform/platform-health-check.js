#!/usr/bin/env node

/**
 * Platform Health Check
 * 
 * Comprehensive health check for the Message Queues Platform
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const MessageQueuesPlatform = require('./platform');
const ConfigValidator = require('./core/config-validator');

class PlatformHealthCheck {
  constructor(options = {}) {
    this.options = options;
    this.results = {
      overall: 'unknown',
      timestamp: new Date().toISOString(),
      checks: []
    };
  }
  
  async runAllChecks() {
    console.log(chalk.bold.cyan('\n🔍 Message Queues Platform Health Check\n'));
    
    const checks = [
      { name: 'Configuration', fn: () => this.checkConfiguration() },
      { name: 'Dependencies', fn: () => this.checkDependencies() },
      { name: 'File System', fn: () => this.checkFileSystem() },
      { name: 'Platform Components', fn: () => this.checkPlatformComponents() },
      { name: 'Network Connectivity', fn: () => this.checkNetworkConnectivity() },
      { name: 'Performance', fn: () => this.checkPerformance() }
    ];
    
    for (const check of checks) {
      await this.runCheck(check);
    }
    
    // Calculate overall health
    const failedChecks = this.results.checks.filter(c => c.status === 'fail').length;
    const warningChecks = this.results.checks.filter(c => c.status === 'warning').length;
    
    if (failedChecks > 0) {
      this.results.overall = 'unhealthy';
    } else if (warningChecks > 0) {
      this.results.overall = 'degraded';
    } else {
      this.results.overall = 'healthy';
    }
    
    this.printSummary();
    
    return this.results;
  }
  
  async runCheck(check) {
    const startTime = performance.now();
    
    try {
      console.log(chalk.cyan(`Checking ${check.name}...`));
      
      const result = await check.fn();
      const duration = Math.round(performance.now() - startTime);
      
      this.results.checks.push({
        name: check.name,
        status: result.status || 'pass',
        duration: duration,
        message: result.message,
        details: result.details || [],
        recommendations: result.recommendations || []
      });
      
      const statusIcon = this.getStatusIcon(result.status);
      console.log(`${statusIcon} ${check.name}: ${result.message} (${duration}ms)`);
      
      if (result.details && result.details.length > 0) {
        result.details.forEach(detail => {
          console.log(chalk.gray(`   ${detail}`));
        });
      }
      
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      
      this.results.checks.push({
        name: check.name,
        status: 'fail',
        duration: duration,
        message: `Check failed: ${error.message}`,
        details: [error.stack],
        recommendations: ['Contact support if this error persists']
      });
      
      console.log(`❌ ${check.name}: Check failed - ${error.message} (${duration}ms)`);
    }
    
    console.log('');
  }
  
  checkConfiguration() {
    const validator = new ConfigValidator();
    const config = {
      accountId: process.env.NEW_RELIC_ACCOUNT_ID || this.options.accountId,
      apiKey: process.env.NEW_RELIC_USER_API_KEY || this.options.apiKey,
      ingestKey: process.env.NEW_RELIC_INGEST_KEY || this.options.ingestKey,
      mode: this.options.mode || 'simulation',
      provider: this.options.provider || 'kafka',
      interval: this.options.interval || 60
    };
    
    const result = validator.validate(config);
    
    if (!result.valid) {
      return {
        status: 'fail',
        message: `Configuration validation failed (${result.errors.length} errors)`,
        details: result.errors.map(e => `${e.key}: ${e.message}`),
        recommendations: result.errors.map(e => e.help).filter(Boolean)
      };
    }
    
    const details = [];
    if (result.warnings.length > 0) {
      details.push(`${result.warnings.length} warnings found`);
    }
    if (result.info.length > 0) {
      details.push(`${result.info.length} info messages`);
    }
    
    return {
      status: result.warnings.length > 0 ? 'warning' : 'pass',
      message: 'Configuration is valid',
      details: details
    };
  }
  
  checkDependencies() {
    const details = [];
    const missing = [];
    
    // Check package.json
    const packagePath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packagePath)) {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      details.push(`Package: ${pkg.name}@${pkg.version}`);
      
      // Check key dependencies
      const requiredDeps = ['chalk', 'commander', 'axios', 'lodash'];
      requiredDeps.forEach(dep => {
        if (!pkg.dependencies[dep] && !pkg.devDependencies[dep]) {
          missing.push(dep);
        }
      });
    } else {
      missing.push('package.json');
    }
    
    // Check node_modules
    const nodeModulesPath = path.join(process.cwd(), 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      missing.push('node_modules directory');
      return {
        status: 'fail',
        message: 'Dependencies not installed',
        details: ['Run npm install to install dependencies'],
        recommendations: ['npm install']
      };
    }
    
    if (missing.length > 0) {
      return {
        status: 'fail',
        message: `Missing dependencies: ${missing.join(', ')}`,
        recommendations: ['Run npm install']
      };
    }
    
    return {
      status: 'pass',
      message: 'All dependencies available',
      details: details
    };
  }
  
  checkFileSystem() {
    const details = [];
    const missing = [];
    const recommendations = [];
    
    // Check core directories
    const coreDirs = ['core', 'simulation', 'infrastructure', 'dashboards'];
    coreDirs.forEach(dir => {
      const dirPath = path.join(process.cwd(), dir);
      if (fs.existsSync(dirPath)) {
        details.push(`${dir}/ directory exists`);
      } else {
        missing.push(`${dir}/ directory`);
      }
    });
    
    // Check key files
    const keyFiles = ['platform.js', 'package.json', 'README.md'];
    keyFiles.forEach(file => {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        details.push(`${file} (${stats.size} bytes)`);
      } else {
        missing.push(file);
      }
    });
    
    // Check write permissions
    try {
      const testFile = path.join(process.cwd(), '.health-check-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      details.push('Write permissions OK');
    } catch (error) {
      missing.push('Write permissions');
      recommendations.push('Check directory permissions');
    }
    
    if (missing.length > 0) {
      return {
        status: 'warning',
        message: `Some files/directories missing: ${missing.join(', ')}`,
        details: details,
        recommendations: recommendations
      };
    }
    
    return {
      status: 'pass',
      message: 'File system checks passed',
      details: details
    };
  }
  
  async checkPlatformComponents() {
    const details = [];
    const issues = [];
    
    try {
      // Test platform initialization
      const platform = new MessageQueuesPlatform({
        mode: 'simulation',
        accountId: '12345',
        apiKey: 'test-key',
        interval: 60
      });
      
      details.push('Platform initialization: OK');
      
      // Check entity factory
      if (platform.entityFactory) {
        details.push('Entity factory: OK');
        
        // Test entity creation
        const testBroker = platform.entityFactory.createBroker({
          brokerId: 1,
          clusterName: 'test-cluster',
          hostname: 'test-host'
        });
        
        if (testBroker && testBroker.entityGuid) {
          details.push('Entity creation: OK');
        } else {
          issues.push('Entity creation failed');
        }
      } else {
        issues.push('Entity factory not initialized');
      }
      
      // Check relationship manager
      if (platform.relationshipManager) {
        details.push('Relationship manager: OK');
      } else {
        issues.push('Relationship manager not initialized');
      }
      
      // Check simulator
      if (platform.simulator) {
        details.push('Data simulator: OK');
      } else {
        issues.push('Data simulator not initialized');
      }
      
    } catch (error) {
      issues.push(`Platform initialization failed: ${error.message}`);
    }
    
    if (issues.length > 0) {
      return {
        status: 'fail',
        message: `Component issues found: ${issues.join(', ')}`,
        details: details
      };
    }
    
    return {
      status: 'pass',
      message: 'All platform components functional',
      details: details
    };
  }
  
  async checkNetworkConnectivity() {
    const details = [];
    const issues = [];
    
    // Check if we have valid credentials to test with
    const hasValidCreds = (process.env.NEW_RELIC_ACCOUNT_ID && 
                          (process.env.NEW_RELIC_USER_API_KEY || process.env.NEW_RELIC_INGEST_KEY));
    
    if (!hasValidCreds) {
      return {
        status: 'warning',
        message: 'Cannot test network connectivity without valid credentials',
        details: ['Set NEW_RELIC_ACCOUNT_ID and NEW_RELIC_USER_API_KEY environment variables to test'],
        recommendations: ['Configure credentials to enable network tests']
      };
    }
    
    try {
      // Test New Relic API connectivity (simplified)
      const https = require('https');
      const apiTest = new Promise((resolve, reject) => {
        const req = https.get('https://api.newrelic.com/graphql', (res) => {
          resolve(res.statusCode);
        });
        req.on('error', reject);
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      
      const statusCode = await apiTest;
      if (statusCode === 200 || statusCode === 401) { // 401 is expected without auth
        details.push('New Relic API reachable');
      } else {
        issues.push(`New Relic API returned status ${statusCode}`);
      }
      
    } catch (error) {
      issues.push(`Network connectivity issue: ${error.message}`);
    }
    
    if (issues.length > 0) {
      return {
        status: 'fail',
        message: 'Network connectivity issues',
        details: details.concat(issues),
        recommendations: ['Check internet connection', 'Verify firewall settings']
      };
    }
    
    return {
      status: 'pass',
      message: 'Network connectivity OK',
      details: details
    };
  }
  
  async checkPerformance() {
    const details = [];
    const warnings = [];
    
    // Memory usage
    const memUsage = process.memoryUsage();
    const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    details.push(`Memory usage: ${memMB} MB`);
    
    if (memMB > 500) {
      warnings.push('High memory usage detected');
    }
    
    // CPU usage simulation (simplified)
    const startTime = performance.now();
    let iterations = 0;
    const testDuration = 100; // ms
    
    while (performance.now() - startTime < testDuration) {
      iterations++;
    }
    
    const perfScore = iterations / testDuration;
    details.push(`Performance score: ${Math.round(perfScore)} ops/ms`);
    
    if (perfScore < 1000) {
      warnings.push('Low performance detected');
    }
    
    // Check available disk space
    try {
      const stats = fs.statSync(process.cwd());
      details.push('File system accessible');
    } catch (error) {
      warnings.push('File system issues detected');
    }
    
    return {
      status: warnings.length > 0 ? 'warning' : 'pass',
      message: warnings.length > 0 ? 'Performance warnings detected' : 'Performance checks passed',
      details: details
    };
  }
  
  getStatusIcon(status) {
    switch (status) {
      case 'pass': return '✅';
      case 'warning': return '⚠️';
      case 'fail': return '❌';
      default: return '❓';
    }
  }
  
  printSummary() {
    console.log(chalk.bold.cyan('📊 Health Check Summary\n'));
    
    const overallIcon = this.getStatusIcon(this.results.overall === 'healthy' ? 'pass' : 
                                          this.results.overall === 'degraded' ? 'warning' : 'fail');
    
    console.log(`${overallIcon} Overall Status: ${chalk.bold(this.results.overall.toUpperCase())}`);
    console.log(`⏱️  Total Duration: ${this.results.checks.reduce((sum, c) => sum + c.duration, 0)}ms`);
    console.log(`🔍 Checks Run: ${this.results.checks.length}`);
    
    const passed = this.results.checks.filter(c => c.status === 'pass').length;
    const warnings = this.results.checks.filter(c => c.status === 'warning').length;
    const failed = this.results.checks.filter(c => c.status === 'fail').length;
    
    console.log(`✅ Passed: ${passed}`);
    if (warnings > 0) console.log(`⚠️  Warnings: ${warnings}`);
    if (failed > 0) console.log(`❌ Failed: ${failed}`);
    
    // Print recommendations
    const allRecommendations = this.results.checks
      .filter(c => c.recommendations && c.recommendations.length > 0)
      .flatMap(c => c.recommendations);
    
    if (allRecommendations.length > 0) {
      console.log(chalk.yellow('\n💡 Recommendations:'));
      [...new Set(allRecommendations)].forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }
    
    console.log('');
  }
  
  saveReport(filename = `health-check-${Date.now()}.json`) {
    fs.writeFileSync(filename, JSON.stringify(this.results, null, 2));
    console.log(chalk.green(`✓ Health check report saved to ${filename}`));
  }
}

// CLI usage
if (require.main === module) {
  const { Command } = require('commander');
  const program = new Command();
  
  program
    .name('platform-health-check')
    .description('Platform health check')
    .option('--account-id <id>', 'New Relic account ID')
    .option('--api-key <key>', 'New Relic API key')
    .option('--mode <mode>', 'Platform mode', 'simulation')
    .option('--save-report', 'Save detailed report to file')
    .option('--json', 'Output results as JSON');
  
  program.parse();
  
  const options = program.opts();
  
  const healthCheck = new PlatformHealthCheck(options);
  
  healthCheck.runAllChecks().then(results => {
    if (options.saveReport) {
      healthCheck.saveReport();
    }
    
    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
    }
    
    // Exit with appropriate code
    const exitCode = results.overall === 'healthy' ? 0 : 
                    results.overall === 'degraded' ? 1 : 2;
    process.exit(exitCode);
  }).catch(error => {
    console.error(chalk.red('Health check failed:'), error);
    process.exit(3);
  });
}

module.exports = PlatformHealthCheck;