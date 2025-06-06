#!/usr/bin/env node

/**
 * Simple experiment runner using the new implementation
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

// Import the engines
const PayloadEngine = require('./src/payload-engine');
const SubmissionEngine = require('./src/submission-engine');
const VerificationEngine = require('./src/verification-engine');

async function loadConfig() {
  const configPath = path.join(__dirname, 'config', 'platform-config.json');
  const configContent = await fs.readFile(configPath, 'utf8');
  const config = JSON.parse(configContent);
  
  // Resolve environment variables
  return resolveEnvVars(config);
}

function resolveEnvVars(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/\${(\w+)}/g, (match, envVar) => {
      return process.env[envVar] || match;
    });
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => resolveEnvVars(item));
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVars(value);
    }
    return result;
  }
  
  return obj;
}

async function runExperiment(experimentPath) {
  console.log('\n🧪 RUNNING EXPERIMENT');
  console.log('=' .repeat(50));
  
  // Load config and create engines
  const config = await loadConfig();
  const entityDefsPath = path.join(__dirname, 'config', 'entity-definitions.json');
  const entityDefs = JSON.parse(await fs.readFile(entityDefsPath, 'utf8'));
  
  const payloadEngine = new PayloadEngine(config, entityDefs);
  const submissionEngine = new SubmissionEngine(config);
  const verificationEngine = new VerificationEngine(config);
  
  // Load experiment
  const experimentContent = await fs.readFile(experimentPath, 'utf8');
  const experiment = yaml.load(experimentContent);
  
  console.log(`\nExperiment: ${experiment.name}`);
  console.log(`Description: ${experiment.description}`);
  
  // Generate payload
  console.log('\n📦 Generating payload...');
  
  // Add required fields to experiment if not present
  if (!experiment.uniqueId) {
    experiment.uniqueId = `${experiment.clusterName || 'test'}-${Date.now()}`;
  }
  if (!experiment.accountId) {
    experiment.accountId = config.newRelic.accountId;
  }
  
  const payloadResult = await payloadEngine.generateFromExperiment(experiment);
  console.log(`✅ Generated ${experiment.entityType} payload`);
  
  // Submit to New Relic
  console.log('\n📤 Submitting to New Relic...');
  const submission = await submissionEngine.submitPayload(payloadResult.payload);
  console.log(`✅ Status: ${submission.status}`);
  
  if (submission.status !== 200 && submission.status !== 202) {
    console.error('❌ Submission failed:', submission.error || submission.response);
    return;
  }
  
  // Run verification
  if (experiment.verification) {
    console.log('\n🔍 Running verification...');
    const verificationResult = await verificationEngine.verify(experiment, submission);
    
    console.log(`\n📊 Results: ${verificationResult.summary.passed}/${verificationResult.summary.total} checks passed`);
    
    if (!verificationResult.success) {
      console.log('\nFailed checks:');
      verificationResult.checks
        .filter(c => !c.passed)
        .forEach(c => {
          console.log(`  ❌ ${c.type}: ${c.error}`);
        });
    }
  }
  
  console.log('\n✅ Experiment complete!');
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node run-experiment.js <experiment.yaml>');
  console.log('\nExample:');
  console.log('  node run-experiment.js experiments/phase-1-baseline/01-golden-broker-comprehensive.yaml');
  process.exit(1);
}

runExperiment(args[0]).catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});