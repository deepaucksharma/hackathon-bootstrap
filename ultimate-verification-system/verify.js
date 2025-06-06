#!/usr/bin/env node

/**
 * Ultimate Verification System - Main Entry Point
 * 
 * A comprehensive, modular verification system for Message Queues UI
 * 
 * Usage: node verify.js --apiKey=KEY --accountId=AWS_ACCOUNT --nrAccountId=NR_ACCOUNT [options]
 * 
 * Options:
 *   --provider=awsMsk|confluent  Provider type (default: awsMsk)
 *   --suite=SUITE_NAME          Run specific test suite only
 *   --output=json|html|markdown Output format (default: all)
 *   --verbose                   Enable verbose logging
 */

const ApiClient = require('./lib/api-client');
const QueryDefinitions = require('./lib/query-definitions');
const TestRunner = require('./lib/test-runner');
const Reporter = require('./lib/reporter');
const { colors } = require('./lib/config');

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
    const [key, value] = arg.split('=');
    acc[key.replace('--', '')] = value;
    return acc;
}, {});

// Validate required arguments
const API_KEY = args.apiKey || process.env.NEW_RELIC_API_KEY;
const AWS_ACCOUNT_ID = args.accountId;
const NR_ACCOUNT_ID = args.nrAccountId;
const PROVIDER = args.provider || 'awsMsk';
const SPECIFIC_SUITE = args.suite;
const OUTPUT_FORMAT = args.output;
const VERBOSE = args.verbose === 'true';

if (!API_KEY || !AWS_ACCOUNT_ID || !NR_ACCOUNT_ID) {
    console.error(`${colors.red}Error: Missing required arguments${colors.reset}`);
    console.error('Usage: node verify.js --apiKey=KEY --accountId=AWS_ACCOUNT --nrAccountId=NR_ACCOUNT [options]');
    console.error('\nOptions:');
    console.error('  --provider=awsMsk|confluent  Provider type (default: awsMsk)');
    console.error('  --suite=SUITE_NAME          Run specific test suite only');
    console.error('  --output=json|html|markdown Output format (default: all)');
    console.error('  --verbose                   Enable verbose logging');
    process.exit(1);
}

// Validate provider
if (!['awsMsk', 'confluent'].includes(PROVIDER)) {
    console.error(`${colors.red}Error: Invalid provider. Must be 'awsMsk' or 'confluent'${colors.reset}`);
    process.exit(1);
}

/**
 * Main verification function
 */
async function runVerification() {
    try {
        // Initialize components
        const apiClient = new ApiClient(API_KEY, NR_ACCOUNT_ID);
        const queryDefs = new QueryDefinitions(PROVIDER, AWS_ACCOUNT_ID);
        const testRunner = new TestRunner(apiClient);
        const reporter = new Reporter(PROVIDER, AWS_ACCOUNT_ID, NR_ACCOUNT_ID);

        // Print header
        reporter.printHeader();

        // Get test suites
        let suites = queryDefs.getAllSuites();
        
        // Filter to specific suite if requested
        if (SPECIFIC_SUITE) {
            if (!suites[SPECIFIC_SUITE]) {
                console.error(`${colors.red}Error: Suite '${SPECIFIC_SUITE}' not found${colors.reset}`);
                console.error(`Available suites: ${Object.keys(suites).join(', ')}`);
                process.exit(1);
            }
            suites = { [SPECIFIC_SUITE]: suites[SPECIFIC_SUITE] };
            console.log(`${colors.yellow}Running only ${SPECIFIC_SUITE} suite${colors.reset}\n`);
        }

        // Run tests
        const results = await testRunner.runAllSuites(suites);

        // Generate reports based on output format
        if (!OUTPUT_FORMAT || OUTPUT_FORMAT === 'all') {
            reporter.generateAllReports(results, testRunner);
        } else {
            reporter.generateConsoleReport(results, testRunner);
            
            switch (OUTPUT_FORMAT) {
                case 'json':
                    reporter.generateJSONReport(results);
                    break;
                case 'html':
                    reporter.generateHTMLReport(results);
                    break;
                case 'markdown':
                    reporter.generateMarkdownReport(results);
                    break;
                default:
                    console.error(`${colors.yellow}Warning: Unknown output format '${OUTPUT_FORMAT}'${colors.reset}`);
            }
        }

        // Exit with appropriate code
        const criticalPassRate = testRunner.getCriticalPassRate();
        process.exit(criticalPassRate === 100 ? 0 : 1);

    } catch (error) {
        console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
        if (VERBOSE) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Handle unhandled rejections
process.on('unhandledRejection', (error) => {
    console.error(`${colors.red}Unhandled rejection: ${error.message}${colors.reset}`);
    if (VERBOSE) {
        console.error(error.stack);
    }
    process.exit(1);
});

// Run verification
runVerification();