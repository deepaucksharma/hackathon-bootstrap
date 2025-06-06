#!/usr/bin/env node

/**
 * Master Orchestrator - Run complete experiments from YAML definitions
 */

const fs = require('fs');
const path = require('path');
const ExperimentParser = require('./src/lib/experiment-parser');
const PayloadSynthesizer = require('./src/2-payload-synthesizer');
const SubmissionGateway = require('./src/3-submission-gateway');
const VerificationEngine = require('./src/4-verification-engine');

class ExperimentRunner {
  constructor() {
    this.parser = new ExperimentParser();
    this.synthesizer = new PayloadSynthesizer();
    this.gateway = new SubmissionGateway();
    this.verifier = new VerificationEngine();
    
    this.config = JSON.parse(fs.readFileSync('config/platform-config.json', 'utf8'));
  }

  /**
   * Run a complete experiment
   */
  async runExperiment(experimentFile, options = {}) {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 ENTITY SYNTHESIS & VERIFICATION PLATFORM');
    console.log('='.repeat(80) + '\n');
    
    const startTime = Date.now();
    
    try {
      // 1. Parse experiment
      console.log('📋 Step 1: Parsing experiment definition...');
      const experiment = this.parser.parse(experimentFile);
      console.log(`  ✅ Loaded: ${experiment.name}`);
      console.log(`  📁 Phase: ${experiment.metadata.phase.name}`);
      
      // 2. Synthesize payload
      console.log('\n🔧 Step 2: Synthesizing payload...');
      const payload = this.synthesizer.synthesize(experiment);
      this.synthesizer.savePayload(payload, experiment);
      console.log(`  ✅ Created ${Array.isArray(payload) ? payload.length : 1} events`);
      
      // 3. Submit to New Relic
      console.log('\n📤 Step 3: Submitting to New Relic...');
      const submission = await this.gateway.submit(payload, experiment, options);
      console.log(`  ✅ Status: ${submission.status} ${submission.statusText || ''}`);
      
      // 4. Run verification
      console.log('\n🔍 Step 4: Running verification checks...');
      const verification = await this.verifier.verify(experiment, submission);
      
      // 5. Generate outcome
      const outcome = this.generateOutcome(experiment, submission, verification, startTime);
      
      // 6. Log to CSV
      this.logToCSV(outcome);
      
      // 7. Display results
      this.displayResults(outcome);
      
      // 8. Save complete report
      this.saveCompleteReport(experiment, outcome);
      
      return outcome;
      
    } catch (error) {
      console.error('\n❌ Experiment failed:', error.message);
      
      const outcome = {
        timestamp: new Date().toISOString(),
        experimentName: experimentFile,
        phase: 'unknown',
        passed: false,
        failedChecks: ['execution'],
        keyInsight: error.message,
        duration: Date.now() - startTime
      };
      
      this.logToCSV(outcome);
      
      throw error;
    }
  }

  /**
   * Generate experiment outcome
   */
  generateOutcome(experiment, submission, verification, startTime) {
    const failedChecks = verification.checks
      .filter(c => c.status === 'failed')
      .map(c => c.type);
    
    const keyInsight = this.extractKeyInsight(experiment, verification);
    
    return {
      timestamp: new Date().toISOString(),
      experimentName: experiment.name,
      phase: `Phase ${experiment.metadata.phase.number}`,
      passed: verification.success,
      failedChecks: failedChecks.join(', ') || 'None',
      keyInsight,
      duration: Date.now() - startTime,
      detailsFile: `results/detailed/${experiment.metadata.id}/`
    };
  }

  /**
   * Extract key insight from results
   */
  extractKeyInsight(experiment, verification) {
    // Check for specific patterns
    if (verification.success) {
      return 'All checks passed - configuration works';
    }
    
    const failed = verification.checks.filter(c => c.status === 'failed');
    
    if (failed.some(c => c.type === 'uiQuery')) {
      return 'Entity created but not visible in UI queries';
    }
    
    if (failed.some(c => c.type === 'entityExists')) {
      return 'Entity synthesis failed - missing critical fields';
    }
    
    if (failed.some(c => c.type === 'metricPopulated')) {
      return 'Entity exists but metrics not populating';
    }
    
    if (failed.some(c => c.type === 'messageQueueSample')) {
      return 'Entity not recognized by Message Queue backend';
    }
    
    return `Failed ${failed.length} checks`;
  }

  /**
   * Log outcome to CSV
   */
  logToCSV(outcome) {
    const csvPath = this.config.experimentLog.csvPath;
    const headers = this.config.experimentLog.csvHeaders;
    
    // Create CSV if doesn't exist
    if (!fs.existsSync(csvPath)) {
      const headerLine = headers.join(',') + '\n';
      fs.writeFileSync(csvPath, headerLine);
    }
    
    // Append outcome
    const values = headers.map(header => {
      const value = outcome[header.charAt(0).toLowerCase() + header.slice(1)] || '';
      // Escape commas and quotes
      return `"${String(value).replace(/"/g, '""')}"`;
    });
    
    fs.appendFileSync(csvPath, values.join(',') + '\n');
  }

  /**
   * Display results to console
   */
  displayResults(outcome) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 EXPERIMENT OUTCOME');
    console.log('='.repeat(80));
    
    console.log(`\nExperiment: ${outcome.experimentName}`);
    console.log(`Phase: ${outcome.phase}`);
    console.log(`Duration: ${(outcome.duration / 1000).toFixed(1)}s`);
    console.log(`\nResult: ${outcome.passed ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (!outcome.passed) {
      console.log(`Failed Checks: ${outcome.failedChecks}`);
    }
    
    console.log(`\n💡 Key Insight: ${outcome.keyInsight}`);
    console.log(`\n📁 Details: ${outcome.detailsFile}`);
  }

  /**
   * Save complete experiment report
   */
  saveCompleteReport(experiment, outcome) {
    const dir = path.join('results', 'detailed', experiment.metadata.id);
    
    const report = {
      experiment: {
        name: experiment.name,
        description: experiment.description,
        file: experiment.metadata.file,
        phase: experiment.metadata.phase
      },
      outcome,
      timestamp: new Date().toISOString()
    };
    
    const filename = path.join(dir, 'complete-report.json');
    fs.writeFileSync(filename, JSON.stringify(report, null, 2));
  }

  /**
   * Run multiple experiments
   */
  async runBatch(pattern) {
    const files = this.findExperiments(pattern);
    console.log(`Found ${files.length} experiments matching: ${pattern}\n`);
    
    const results = [];
    
    for (const file of files) {
      try {
        const outcome = await this.runExperiment(file);
        results.push({ file, success: true, outcome });
      } catch (error) {
        results.push({ file, success: false, error: error.message });
      }
      
      // Brief pause between experiments
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 BATCH SUMMARY');
    console.log('='.repeat(80));
    
    const passed = results.filter(r => r.success && r.outcome.passed).length;
    const failed = results.filter(r => !r.success || !r.outcome.passed).length;
    
    console.log(`\nTotal: ${results.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    
    return results;
  }

  /**
   * Find experiment files matching pattern
   */
  findExperiments(pattern) {
    const experimentsDir = 'experiments';
    const files = [];
    
    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
          if (!pattern || fullPath.includes(pattern)) {
            files.push(fullPath);
          }
        }
      }
    }
    
    scanDir(experimentsDir);
    return files.sort();
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Entity Synthesis & Verification Platform

Usage:
  node run-experiment.js <experiment.yaml>     Run single experiment
  node run-experiment.js --batch <pattern>     Run batch of experiments
  node run-experiment.js --list                List all experiments
  node run-experiment.js --dry-run <file>      Test without sending data

Options:
  --dry-run    Synthesize and validate but don't send to New Relic
  --help       Show this help message

Examples:
  node run-experiment.js experiments/phase1-baseline/01-golden-payload.yaml
  node run-experiment.js --batch phase1
  node run-experiment.js --dry-run experiments/phase2-ui-visibility/01-collector-name.yaml
`);
    process.exit(0);
  }
  
  const runner = new ExperimentRunner();
  
  try {
    if (args.includes('--list')) {
      const files = runner.findExperiments();
      console.log('Available experiments:');
      files.forEach(f => console.log(`  ${f}`));
      
    } else if (args.includes('--batch')) {
      const index = args.indexOf('--batch');
      const pattern = args[index + 1];
      await runner.runBatch(pattern);
      
    } else {
      const file = args.find(a => !a.startsWith('--'));
      const options = {
        dryRun: args.includes('--dry-run')
      };
      
      await runner.runExperiment(file, options);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = ExperimentRunner;