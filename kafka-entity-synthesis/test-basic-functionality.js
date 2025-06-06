#!/usr/bin/env node

/**
 * Basic functionality test
 */

const fs = require('fs').promises;
const path = require('path');

async function testBasicFunctionality() {
  console.log('🧪 Testing Kafka Entity Synthesis Platform\n');
  
  const tests = [];
  
  // Test 1: Check environment
  tests.push({
    name: 'Environment Configuration',
    test: async () => {
      const envPath = path.join(__dirname, '..', '.env');
      const exists = await fs.access(envPath).then(() => true).catch(() => false);
      if (!exists) throw new Error('.env file not found');
      
      const required = ['IKEY', 'ACC', 'UKEY', 'QKey'];
      const env = await fs.readFile(envPath, 'utf8');
      for (const key of required) {
        if (!env.includes(key)) throw new Error(`Missing ${key} in .env`);
      }
    }
  });
  
  // Test 2: Check core engines
  tests.push({
    name: 'Core Engines',
    test: async () => {
      const engines = [
        './src/capture-engine.js',
        './src/payload-engine.js', 
        './src/submission-engine.js',
        './src/verification-engine.js'
      ];
      
      for (const engine of engines) {
        const exists = await fs.access(engine).then(() => true).catch(() => false);
        if (!exists) throw new Error(`Missing engine: ${engine}`);
        
        // Try to require it
        try {
          require(engine);
        } catch (e) {
          throw new Error(`Cannot load ${engine}: ${e.message}`);
        }
      }
    }
  });
  
  // Test 3: Check configuration files
  tests.push({
    name: 'Configuration Files',
    test: async () => {
      const configs = [
        './config/platform-config.json',
        './config/entity-definitions.json',
        './config/golden-payload-schema.json'
      ];
      
      for (const config of configs) {
        const content = await fs.readFile(config, 'utf8');
        JSON.parse(content); // Will throw if invalid JSON
      }
    }
  });
  
  // Test 4: Check templates
  tests.push({
    name: 'Payload Templates',
    test: async () => {
      const templates = [
        './templates/golden-payloads/awsmskbroker.json',
        './templates/golden-payloads/awsmskcluster.json',
        './templates/golden-payloads/awsmsktopic.json'
      ];
      
      for (const template of templates) {
        const content = await fs.readFile(template, 'utf8');
        const payload = JSON.parse(content);
        if (!payload.eventType) throw new Error(`Missing eventType in ${template}`);
      }
    }
  });
  
  // Test 5: Check experiments
  tests.push({
    name: 'Experiment Files',
    test: async () => {
      const yaml = require('js-yaml');
      const experiments = await fs.readdir('./experiments/phase-2-deconstruction');
      
      for (const exp of experiments.filter(f => f.endsWith('.yaml'))) {
        const content = await fs.readFile(
          path.join('./experiments/phase-2-deconstruction', exp), 
          'utf8'
        );
        const experiment = yaml.load(content);
        if (!experiment.name) throw new Error(`Missing name in ${exp}`);
      }
    }
  });
  
  // Run tests
  console.log('Running tests...\n');
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      await test.test();
      console.log(`✅ ${test.name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${test.name}: ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n📊 Summary: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('\n✨ All tests passed! The platform is ready to use.');
    console.log('\nNext steps:');
    console.log('1. Run a simple experiment: node 1-run-experiment.js experiment experiments/phase-2-deconstruction/01-minimal-broker.yaml');
    console.log('2. Run a phase: node 1-run-experiment.js phase phase-2-deconstruction');
    console.log('3. Run a simulation: node 2-run-simulation.js simulations/1-full-cluster-lifecycle.yaml');
  } else {
    console.log('\n⚠️  Some tests failed. Please fix the issues before proceeding.');
  }
}

// Run tests
testBasicFunctionality().catch(console.error);