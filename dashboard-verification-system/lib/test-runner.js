/**
 * Test Runner for executing verification tests
 */

const { colors } = require('./config');

class TestRunner {
    constructor(apiClient) {
        this.apiClient = apiClient;
        this.results = {
            suites: {},
            summary: {
                total: 0,
                passed: 0,
                failed: 0,
                skipped: 0,
                critical: {
                    total: 0,
                    passed: 0
                }
            }
        };
    }

    /**
     * Run a single test
     */
    async runTest(test) {
        const startTime = Date.now();
        
        try {
            const result = await this.apiClient.executeQuery(test.query);
            const duration = Date.now() - startTime;
            const validation = test.validate(result);
            
            return {
                ...test,
                passed: validation.passed,
                message: validation.message,
                duration,
                result,
                status: 'completed'
            };
        } catch (error) {
            return {
                ...test,
                passed: false,
                message: `Query failed: ${error.message}`,
                error: error.message,
                duration: Date.now() - startTime,
                status: 'error'
            };
        }
    }

    /**
     * Run a test suite
     */
    async runSuite(suiteName, suite, skipIfCriticalFailed = false) {
        if (skipIfCriticalFailed && this.hasCriticalFailures()) {
            console.log(`  ${colors.yellow}⚠️  Skipping suite due to critical failures${colors.reset}`);
            this.results.suites[suiteName] = {
                name: suite.name,
                critical: suite.critical || false,
                tests: [],
                status: 'skipped'
            };
            return;
        }

        console.log(`${colors.bright}${suite.name}${colors.reset}`);
        console.log('─'.repeat(50));
        
        this.results.suites[suiteName] = {
            name: suite.name,
            critical: suite.critical || false,
            tests: [],
            status: 'running'
        };
        
        for (const test of suite.tests) {
            const result = await this.runTest(test);
            this.results.suites[suiteName].tests.push(result);
            this.updateSummary(result, suite.critical);
            this.printTestResult(result);
            
            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        this.results.suites[suiteName].status = 'completed';
        console.log();
    }

    /**
     * Run all test suites
     */
    async runAllSuites(suites) {
        this.results.startTime = new Date().toISOString();
        
        // Run critical suites first
        const criticalSuites = Object.entries(suites).filter(([_, suite]) => suite.critical);
        const nonCriticalSuites = Object.entries(suites).filter(([_, suite]) => !suite.critical);
        
        // Run critical tests
        for (const [name, suite] of criticalSuites) {
            await this.runSuite(name, suite);
        }
        
        // Run non-critical tests (skip if critical failed)
        for (const [name, suite] of nonCriticalSuites) {
            await this.runSuite(name, suite, true);
        }
        
        this.results.endTime = new Date().toISOString();
        this.results.duration = Date.parse(this.results.endTime) - Date.parse(this.results.startTime);
        
        return this.results;
    }

    /**
     * Update summary statistics
     */
    updateSummary(result, isCritical) {
        this.results.summary.total++;
        
        if (result.status === 'error' || !result.passed) {
            this.results.summary.failed++;
        } else {
            this.results.summary.passed++;
        }
        
        if (isCritical) {
            this.results.summary.critical.total++;
            if (result.passed) {
                this.results.summary.critical.passed++;
            }
        }
    }

    /**
     * Check if there are critical failures
     */
    hasCriticalFailures() {
        return this.results.summary.critical.total > 0 && 
               this.results.summary.critical.passed < this.results.summary.critical.total;
    }

    /**
     * Print test result
     */
    printTestResult(test, indent = '  ') {
        const status = test.passed 
            ? `${colors.green}✅ PASS${colors.reset}`
            : `${colors.red}❌ FAIL${colors.reset}`;
        
        console.log(`${indent}[${test.id}] ${test.name}: ${status}`);
        console.log(`${indent}    ${test.message}`);
        if (test.duration) {
            console.log(`${indent}    ${colors.cyan}Duration: ${test.duration}ms${colors.reset}`);
        }
    }

    /**
     * Get pass rate
     */
    getPassRate() {
        if (this.results.summary.total === 0) return 0;
        return Math.round((this.results.summary.passed / this.results.summary.total) * 100);
    }

    /**
     * Get critical pass rate
     */
    getCriticalPassRate() {
        if (this.results.summary.critical.total === 0) return 100;
        return Math.round((this.results.summary.critical.passed / this.results.summary.critical.total) * 100);
    }
}

module.exports = TestRunner;