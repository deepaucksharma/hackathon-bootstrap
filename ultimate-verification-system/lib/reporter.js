/**
 * Reporter for generating verification reports
 */

const fs = require('fs');
const path = require('path');
const { colors } = require('./config');

class Reporter {
    constructor(provider, awsAccountId, nrAccountId) {
        this.provider = provider;
        this.awsAccountId = awsAccountId;
        this.nrAccountId = nrAccountId;
    }

    /**
     * Generate console report
     */
    generateConsoleReport(results, testRunner) {
        this.printHeader();
        this.printSummary(results, testRunner);
        this.printRecommendations(results);
    }

    /**
     * Print header
     */
    printHeader() {
        console.log(`${colors.bright}${colors.magenta}╔════════════════════════════════════════════════════════════════╗${colors.reset}`);
        console.log(`${colors.bright}${colors.magenta}║     Ultimate NRDB Verification for Message Queues UI           ║${colors.reset}`);
        console.log(`${colors.bright}${colors.magenta}╚════════════════════════════════════════════════════════════════╝${colors.reset}`);
        console.log();
        console.log(`Provider: ${colors.cyan}${this.provider === 'awsMsk' ? 'AWS MSK' : 'Confluent Cloud'}${colors.reset}`);
        console.log(`AWS Account: ${colors.cyan}${this.awsAccountId}${colors.reset}`);
        console.log(`NR Account: ${colors.cyan}${this.nrAccountId}${colors.reset}`);
        console.log(`Started: ${colors.cyan}${new Date().toISOString()}${colors.reset}`);
        console.log();
    }

    /**
     * Print summary
     */
    printSummary(results, testRunner) {
        console.log(`${colors.bright}${colors.yellow}═══════════════════════════════════════════════════════════${colors.reset}`);
        console.log(`${colors.bright}VERIFICATION SUMMARY${colors.reset}`);
        console.log(`${colors.bright}${colors.yellow}═══════════════════════════════════════════════════════════${colors.reset}`);
        
        const passRate = testRunner.getPassRate();
        const criticalPassRate = testRunner.getCriticalPassRate();
        
        console.log(`Total Tests: ${results.summary.total}`);
        console.log(`Passed: ${colors.green}${results.summary.passed}${colors.reset} (${passRate}%)`);
        console.log(`Failed: ${colors.red}${results.summary.failed}${colors.reset}`);
        console.log(`Skipped: ${colors.yellow}${results.summary.skipped || 0}${colors.reset}`);
        console.log(`Critical Tests: ${results.summary.critical.passed}/${results.summary.critical.total} (${criticalPassRate}%)`);
        console.log(`Duration: ${Math.round((results.duration || 0) / 1000)}s`);
        console.log();

        // Final verdict
        if (criticalPassRate === 100 && passRate >= 90) {
            console.log(`${colors.bright}${colors.green}✅ UI READY: All critical tests passed! The Message Queues UI will work correctly.${colors.reset}`);
        } else if (criticalPassRate === 100) {
            console.log(`${colors.bright}${colors.yellow}⚠️  UI PARTIALLY READY: Critical tests passed but some features may not work.${colors.reset}`);
        } else {
            console.log(`${colors.bright}${colors.red}❌ UI NOT READY: Critical tests failed. The UI will not function properly.${colors.reset}`);
        }
    }

    /**
     * Print recommendations
     */
    printRecommendations(results) {
        const failedCritical = [];
        const failedNonCritical = [];

        // Collect failed tests
        Object.values(results.suites).forEach(suite => {
            if (suite.tests) {
                suite.tests.forEach(test => {
                    if (!test.passed) {
                        if (suite.critical) {
                            failedCritical.push({ suite: suite.name, test });
                        } else {
                            failedNonCritical.push({ suite: suite.name, test });
                        }
                    }
                });
            }
        });

        if (failedCritical.length > 0) {
            console.log();
            console.log(`${colors.bright}Critical Issues to Fix:${colors.reset}`);
            failedCritical.forEach((item, index) => {
                console.log(`  ${index + 1}. [${item.test.id}] ${item.test.name}: ${item.test.message}`);
            });
        }

        if (failedNonCritical.length > 0 && failedCritical.length === 0) {
            console.log();
            console.log(`${colors.bright}Non-Critical Issues:${colors.reset}`);
            failedNonCritical.slice(0, 5).forEach((item, index) => {
                console.log(`  ${index + 1}. [${item.test.id}] ${item.test.name}: ${item.test.message}`);
            });
            if (failedNonCritical.length > 5) {
                console.log(`  ... and ${failedNonCritical.length - 5} more`);
            }
        }
    }

    /**
     * Generate JSON report
     */
    generateJSONReport(results) {
        const timestamp = Date.now();
        const filename = `ultimate-verification-${timestamp}.json`;
        const filepath = path.join(process.cwd(), filename);
        
        const report = {
            provider: this.provider,
            awsAccountId: this.awsAccountId,
            nrAccountId: this.nrAccountId,
            ...results
        };
        
        fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
        console.log(`\n${colors.cyan}Detailed report saved to: ${filename}${colors.reset}`);
        
        return filename;
    }

    /**
     * Generate HTML report
     */
    generateHTMLReport(results) {
        const timestamp = Date.now();
        const filename = `ultimate-verification-${timestamp}.html`;
        const filepath = path.join(process.cwd(), filename);
        
        const passRate = Math.round((results.summary.passed / results.summary.total) * 100);
        const criticalPassRate = results.summary.critical.total > 0 
            ? Math.round((results.summary.critical.passed / results.summary.critical.total) * 100)
            : 100;

        const html = `<!DOCTYPE html>
<html>
<head>
    <title>Ultimate Verification Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        h1 { color: #333; }
        h2 { color: #666; margin-top: 30px; }
        .summary { background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .pass { color: #28a745; }
        .fail { color: #dc3545; }
        .warning { color: #ffc107; }
        .test-suite { margin: 20px 0; border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
        .test { margin: 10px 0; padding: 10px; background: #f9f9f9; border-left: 3px solid #ddd; }
        .test.passed { border-color: #28a745; }
        .test.failed { border-color: #dc3545; }
        .metric { font-family: monospace; background: #e9ecef; padding: 2px 4px; border-radius: 3px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f0f0f0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Ultimate NRDB Verification Report</h1>
        
        <div class="summary">
            <h2>Summary</h2>
            <p><strong>Provider:</strong> ${this.provider === 'awsMsk' ? 'AWS MSK' : 'Confluent Cloud'}</p>
            <p><strong>AWS Account:</strong> ${this.awsAccountId}</p>
            <p><strong>NR Account:</strong> ${this.nrAccountId}</p>
            <p><strong>Overall Pass Rate:</strong> <span class="${passRate >= 90 ? 'pass' : 'fail'}">${passRate}%</span></p>
            <p><strong>Critical Pass Rate:</strong> <span class="${criticalPassRate === 100 ? 'pass' : 'fail'}">${criticalPassRate}%</span></p>
            <p><strong>Total Tests:</strong> ${results.summary.total}</p>
            <p><strong>Duration:</strong> ${Math.round((results.duration || 0) / 1000)}s</p>
        </div>

        ${Object.entries(results.suites).map(([name, suite]) => `
            <div class="test-suite">
                <h2>${suite.name} ${suite.critical ? '<span class="warning">(Critical)</span>' : ''}</h2>
                ${suite.tests.map(test => `
                    <div class="test ${test.passed ? 'passed' : 'failed'}">
                        <h3>[${test.id}] ${test.name} - ${test.passed ? '<span class="pass">✅ PASS</span>' : '<span class="fail">❌ FAIL</span>'}</h3>
                        <p>${test.message}</p>
                        <p><small>Duration: ${test.duration}ms</small></p>
                    </div>
                `).join('')}
            </div>
        `).join('')}
    </div>
</body>
</html>`;

        fs.writeFileSync(filepath, html);
        console.log(`${colors.cyan}HTML report saved to: ${filename}${colors.reset}`);
        
        return filename;
    }

    /**
     * Generate Markdown report
     */
    generateMarkdownReport(results) {
        const timestamp = Date.now();
        const filename = `ultimate-verification-${timestamp}.md`;
        const filepath = path.join(process.cwd(), filename);
        
        const passRate = Math.round((results.summary.passed / results.summary.total) * 100);
        const criticalPassRate = results.summary.critical.total > 0 
            ? Math.round((results.summary.critical.passed / results.summary.critical.total) * 100)
            : 100;

        let markdown = `# Ultimate NRDB Verification Report

## Summary
- **Provider:** ${this.provider === 'awsMsk' ? 'AWS MSK' : 'Confluent Cloud'}
- **AWS Account:** ${this.awsAccountId}
- **NR Account:** ${this.nrAccountId}
- **Overall Pass Rate:** ${passRate}%
- **Critical Pass Rate:** ${criticalPassRate}%
- **Total Tests:** ${results.summary.total}
- **Duration:** ${Math.round((results.duration || 0) / 1000)}s

## Test Results\n\n`;

        Object.entries(results.suites).forEach(([name, suite]) => {
            markdown += `### ${suite.name}${suite.critical ? ' (Critical)' : ''}\n\n`;
            
            if (suite.tests && suite.tests.length > 0) {
                suite.tests.forEach(test => {
                    markdown += `#### [${test.id}] ${test.name}\n`;
                    markdown += `- **Status:** ${test.passed ? '✅ PASS' : '❌ FAIL'}\n`;
                    markdown += `- **Message:** ${test.message}\n`;
                    markdown += `- **Duration:** ${test.duration}ms\n\n`;
                });
            } else {
                markdown += `⚠️ Tests skipped due to critical failures\n\n`;
            }
        });

        fs.writeFileSync(filepath, markdown);
        console.log(`${colors.cyan}Markdown report saved to: ${filename}${colors.reset}`);
        
        return filename;
    }

    /**
     * Generate all reports
     */
    generateAllReports(results, testRunner) {
        this.generateConsoleReport(results, testRunner);
        this.generateJSONReport(results);
        this.generateHTMLReport(results);
        this.generateMarkdownReport(results);
    }
}

module.exports = Reporter;