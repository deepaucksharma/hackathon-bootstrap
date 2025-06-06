#!/usr/bin/env node

/**
 * Campaign Runner - Execute all experiments in a phase directory
 * Automates the knowledge-building process through systematic testing
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Load environment configuration
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+?)[=:](.*)/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        process.env[key] = value;
      }
    });
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    phase: null,
    dryRun: false,
    parallel: false,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--phase':
      case '-p':
        options.phase = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--parallel':
        options.parallel = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        if (!options.phase && !args[i].startsWith('-')) {
          options.phase = args[i];
        }
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Campaign Runner - Execute all experiments in a phase directory

Usage: node 2-run-campaign.js [options] [phase]

Options:
  --phase, -p <phase>   Run specific phase (e.g., phase-1-baseline-validation)
  --dry-run             Show what would be run without executing
  --parallel            Run experiments in parallel (use with caution)
  --verbose, -v         Show detailed output
  --help, -h            Show this help message

Examples:
  node 2-run-campaign.js phase-1-baseline-validation
  node 2-run-campaign.js --phase phase-2-deconstruction-analysis
  node 2-run-campaign.js --dry-run phase-3-component-verification
  node 2-run-campaign.js --parallel phase-1-baseline-validation

If no phase is specified, lists all available phases.
  `);
}

// Get all experiment files in a phase directory
function getExperimentFiles(phaseDir) {
  const files = [];
  try {
    const entries = fs.readdirSync(phaseDir);
    entries.forEach(entry => {
      const fullPath = path.join(phaseDir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && entry.endsWith('.yaml')) {
        files.push(fullPath);
      }
    });
    // Sort files for consistent execution order
    files.sort();
  } catch (error) {
    console.error(`Error reading phase directory: ${error.message}`);
  }
  return files;
}

// List available phases
function listPhases() {
  const experimentsDir = path.join(__dirname, 'experiments');
  console.log('\nAvailable experiment phases:');
  console.log('============================\n');
  
  try {
    const entries = fs.readdirSync(experimentsDir);
    entries.forEach(entry => {
      const fullPath = path.join(experimentsDir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && entry.startsWith('phase-')) {
        const experiments = getExperimentFiles(fullPath);
        console.log(`  ${entry} (${experiments.length} experiments)`);
      }
    });
    console.log('\nRun with: node 2-run-campaign.js <phase-name>\n');
  } catch (error) {
    console.error(`Error listing phases: ${error.message}`);
  }
}

// Run a single experiment
function runExperiment(experimentFile, options) {
  return new Promise((resolve, reject) => {
    const experimentName = path.basename(experimentFile, '.yaml');
    console.log(`\n🧪 Running: ${experimentName}`);
    
    if (options.dryRun) {
      console.log(`   [DRY RUN] Would execute: ${experimentFile}`);
      resolve({ status: 'skipped', file: experimentFile });
      return;
    }

    const args = [path.join(__dirname, '1-run-experiment.js'), experimentFile];
    if (options.verbose) args.push('--verbose');

    const child = spawn('node', args, { stdio: 'inherit' });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`   ✅ Success: ${experimentName}`);
        resolve({ status: 'success', file: experimentFile });
      } else {
        console.log(`   ❌ Failed: ${experimentName} (exit code: ${code})`);
        resolve({ status: 'failed', file: experimentFile, code });
      }
    });

    child.on('error', (error) => {
      console.error(`   ❌ Error: ${experimentName} - ${error.message}`);
      resolve({ status: 'error', file: experimentFile, error: error.message });
    });
  });
}

// Generate campaign summary
function generateSummary(results, startTime) {
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(1);
  
  const summary = {
    total: results.length,
    success: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    error: results.filter(r => r.status === 'error').length,
    skipped: results.filter(r => r.status === 'skipped').length
  };

  console.log('\n========================================');
  console.log('Campaign Summary');
  console.log('========================================');
  console.log(`Total experiments: ${summary.total}`);
  console.log(`✅ Success: ${summary.success}`);
  console.log(`❌ Failed: ${summary.failed}`);
  console.log(`⚠️  Error: ${summary.error}`);
  console.log(`⏭️  Skipped: ${summary.skipped}`);
  console.log(`⏱️  Duration: ${duration}s`);
  console.log('========================================\n');

  // Write detailed results
  const resultsDir = path.join(__dirname, 'results', 'campaigns');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsFile = path.join(resultsDir, `campaign-${timestamp}.json`);
  
  const campaignData = {
    timestamp: new Date().toISOString(),
    duration: `${duration}s`,
    summary,
    results: results.map(r => ({
      experiment: path.basename(r.file, '.yaml'),
      status: r.status,
      code: r.code,
      error: r.error
    }))
  };

  fs.writeFileSync(resultsFile, JSON.stringify(campaignData, null, 2));
  console.log(`Detailed results saved to: ${resultsFile}`);

  return summary;
}

// Main execution
async function main() {
  loadEnv();
  const options = parseArgs();

  if (!options.phase) {
    listPhases();
    return;
  }

  // Find phase directory
  const phaseDir = path.join(__dirname, 'experiments', options.phase);
  if (!fs.existsSync(phaseDir)) {
    console.error(`\n❌ Phase directory not found: ${options.phase}`);
    console.log('\nUse one of the following phases:');
    listPhases();
    process.exit(1);
  }

  // Get experiment files
  const experimentFiles = getExperimentFiles(phaseDir);
  if (experimentFiles.length === 0) {
    console.error(`\n❌ No experiment files found in: ${options.phase}`);
    process.exit(1);
  }

  console.log(`\n🚀 Starting campaign: ${options.phase}`);
  console.log(`📋 Found ${experimentFiles.length} experiments`);
  console.log(`🔧 Mode: ${options.dryRun ? 'DRY RUN' : (options.parallel ? 'PARALLEL' : 'SEQUENTIAL')}`);
  console.log('========================================');

  const startTime = Date.now();
  const results = [];

  if (options.parallel) {
    // Run all experiments in parallel
    console.log('\n⚡ Running experiments in parallel...');
    const promises = experimentFiles.map(file => runExperiment(file, options));
    const parallelResults = await Promise.all(promises);
    results.push(...parallelResults);
  } else {
    // Run experiments sequentially
    for (const file of experimentFiles) {
      const result = await runExperiment(file, options);
      results.push(result);
      
      // Add a small delay between experiments to avoid overwhelming the API
      if (!options.dryRun && result.status === 'success') {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  // Generate summary
  const summary = generateSummary(results, startTime);

  // Exit with appropriate code
  if (summary.failed > 0 || summary.error > 0) {
    process.exit(1);
  }
}

// Run the campaign
main().catch(error => {
  console.error(`\n❌ Campaign error: ${error.message}`);
  process.exit(1);
});