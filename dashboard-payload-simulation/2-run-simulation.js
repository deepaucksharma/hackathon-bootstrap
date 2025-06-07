#!/usr/bin/env node

/**
 * SIMULATION SCRIPT: Complex Multi-Entity Scenario Runner
 * 
 * Runs complex scenarios that simulate real-world Kafka cluster
 * lifecycles and interactions.
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

// Import engines
const PayloadEngine = require('./src/payload-engine');
const SubmissionEngine = require('./src/submission-engine');
const VerificationEngine = require('./src/verification-engine');

class SimulationRunner {
  constructor() {
    this.loadConfig();
  }

  async loadConfig() {
    try {
      // Load configurations
      const configPath = path.join(__dirname, 'config', 'platform-config.json');
      const configContent = await fs.readFile(configPath, 'utf8');
      this.config = this.resolveEnvVars(JSON.parse(configContent));
      
      const entityDefsPath = path.join(__dirname, 'config', 'entity-definitions.json');
      const entityDefsContent = await fs.readFile(entityDefsPath, 'utf8');
      this.entityDefinitions = JSON.parse(entityDefsContent);
      
      // Initialize engines
      this.payloadEngine = new PayloadEngine(this.config, this.entityDefinitions);
      this.submissionEngine = new SubmissionEngine(this.config);
      this.verificationEngine = new VerificationEngine(this.config);
      
    } catch (error) {
      console.error('❌ Failed to load configuration:', error.message);
      process.exit(1);
    }
  }

  /**
   * Run a simulation from YAML definition
   */
  async runSimulation(simulationPath) {
    console.log('\n' + '='.repeat(80));
    console.log('🎮 ENTITY SYNTHESIS SIMULATION');
    console.log('='.repeat(80));
    
    const startTime = Date.now();
    
    // Load simulation definition
    const simulationContent = await fs.readFile(simulationPath, 'utf8');
    const simulation = yaml.load(simulationContent);
    
    console.log(`\nSimulation: ${simulation.name}`);
    console.log(`Description: ${simulation.description || 'N/A'}`);
    console.log(`Steps: ${simulation.sequence.length}`);
    
    const results = {
      timestamp: new Date().toISOString(),
      simulation: simulation.name,
      steps: [],
      entities: {},
      summary: null
    };
    
    // Execute each step in sequence
    for (const step of simulation.sequence) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`📍 Step ${step.step}: ${step.action.toUpperCase()}`);
      
      const stepResult = await this.executeStep(step, simulation, results);
      results.steps.push(stepResult);
      
      if (stepResult.error && !step.continueOnError) {
        console.error(`❌ Step failed: ${stepResult.error}`);
        break;
      }
    }
    
    // Run final verification if specified
    if (simulation.verification) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log('🔍 Running final verification...');
      
      const verificationResult = await this.runFinalVerification(
        simulation.verification,
        results
      );
      results.verification = verificationResult;
    }
    
    // Generate summary
    results.summary = this.generateSummary(results, startTime);
    
    // Save results
    await this.saveResults(results, simulation);
    
    // Display summary
    this.displaySummary(results);
    
    return results;
  }

  /**
   * Execute a single simulation step
   */
  async executeStep(step, simulation, results) {
    const stepResult = {
      step: step.step,
      action: step.action,
      timestamp: new Date().toISOString(),
      result: null,
      error: null
    };
    
    try {
      switch (step.action) {
        case 'send':
          stepResult.result = await this.executeSendStep(step, simulation, results);
          break;
          
        case 'wait':
          stepResult.result = await this.executeWaitStep(step);
          break;
          
        case 'verify':
          stepResult.result = await this.executeVerifyStep(step, results);
          break;
          
        case 'generate':
          stepResult.result = await this.executeGenerateStep(step, simulation, results);
          break;
          
        case 'update':
          stepResult.result = await this.executeUpdateStep(step, results);
          break;
          
        default:
          throw new Error(`Unknown action: ${step.action}`);
      }
      
      console.log(`   ✅ Step completed`);
      
    } catch (error) {
      stepResult.error = error.message;
      console.error(`   ❌ Step failed: ${error.message}`);
    }
    
    return stepResult;
  }

  /**
   * Execute SEND step - submit payloads
   */
  async executeSendStep(step, simulation, results) {
    const payloadDef = step.payload;
    const count = step.count || 1;
    
    console.log(`   📤 Sending ${count} ${payloadDef} payload(s)`);
    
    const payloads = [];
    
    // Generate payloads
    for (let i = 0; i < count; i++) {
      const payload = await this.generatePayloadForStep(
        payloadDef,
        i,
        simulation,
        results
      );
      payloads.push(payload);
    }
    
    // Submit payloads
    const submissions = await this.submissionEngine.submitBatch(
      payloads,
      {
        parallel: step.parallel || false,
        delayMs: step.delayMs || 1000
      }
    );
    
    // Store entity references
    payloads.forEach((payload, index) => {
      const entityId = step.entityId 
        ? step.entityId.replace('{index}', index)
        : `${payloadDef}-${index}`;
      
      results.entities[entityId] = {
        payload: payload.payload,
        submission: submissions[index],
        guid: payload.payload.entityGuid,
        name: payload.payload.entityName
      };
    });
    
    return {
      count: payloads.length,
      successful: submissions.filter(s => s.status === 200 || s.status === 202).length,
      submissions
    };
  }

  /**
   * Execute WAIT step
   */
  async executeWaitStep(step) {
    const duration = step.duration || 30;
    console.log(`   ⏳ Waiting ${duration} seconds...`);
    
    // Show progress
    const interval = 5;
    for (let elapsed = 0; elapsed < duration; elapsed += interval) {
      await this.sleep(interval * 1000);
      process.stdout.write(`\r   ⏳ Waiting ${duration} seconds... ${elapsed + interval}s`);
    }
    console.log('');
    
    return { waited: duration };
  }

  /**
   * Execute VERIFY step
   */
  async executeVerifyStep(step, results) {
    const check = step.check;
    const params = this.resolveReferences(step.params, results);
    
    console.log(`   🔍 Running check: ${check}`);
    
    const checkResult = await this.verificationEngine.runCheck(
      {
        type: check,
        params
      },
      {} // Mock experiment object
    );
    
    if (checkResult.passed) {
      console.log(`   ✅ Check passed`);
    } else {
      console.log(`   ❌ Check failed: ${checkResult.error}`);
    }
    
    return checkResult;
  }

  /**
   * Execute GENERATE step - dynamic payload generation
   */
  async executeGenerateStep(step, simulation, results) {
    console.log(`   🏭 Generating ${step.type} data`);
    
    switch (step.type) {
      case 'traffic':
        return await this.generateTrafficData(step, results);
        
      case 'errors':
        return await this.generateErrorData(step, results);
        
      case 'scaling':
        return await this.generateScalingEvent(step, results);
        
      default:
        throw new Error(`Unknown generate type: ${step.type}`);
    }
  }

  /**
   * Execute UPDATE step - modify existing entities
   */
  async executeUpdateStep(step, results) {
    const entityId = step.entity;
    const entity = results.entities[entityId];
    
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    
    console.log(`   📝 Updating ${entityId}`);
    
    // Create updated payload
    const updatedPayload = { ...entity.payload };
    
    // Apply updates
    for (const [field, value] of Object.entries(step.updates)) {
      this.setNestedValue(updatedPayload, field, value);
    }
    
    // Submit updated payload
    const submission = await this.submissionEngine.submitPayload(updatedPayload);
    
    return {
      entity: entityId,
      updates: Object.keys(step.updates).length,
      submission
    };
  }

  /**
   * Generate payload for a step
   */
  async generatePayloadForStep(payloadDef, index, simulation, results) {
    // Check if it's a reference to a predefined payload
    if (simulation.payloads && simulation.payloads[payloadDef]) {
      const payloadConfig = simulation.payloads[payloadDef];
      
      const experiment = {
        name: `${simulation.name} - ${payloadDef}`,
        baseTemplate: payloadConfig.template,
        entityType: payloadConfig.entityType,
        modifications: payloadConfig.modifications || [],
        ...this.resolveReferences(payloadConfig.variables || {}, results)
      };
      
      // Add index-specific modifications
      if (payloadConfig.perInstance) {
        experiment.modifications = [
          ...experiment.modifications,
          ...this.generatePerInstanceMods(payloadConfig.perInstance, index)
        ];
      }
      
      return await this.payloadEngine.generateFromExperiment(experiment);
    }
    
    // Generate based on type
    const timestamp = Date.now();
    switch (payloadDef) {
      case 'cluster-creation':
        return this.generateClusterPayload(simulation, timestamp);
        
      case 'broker-creation':
        return this.generateBrokerPayload(simulation, index, timestamp);
        
      case 'topic-creation':
        return this.generateTopicPayload(simulation, index, timestamp);
        
      default:
        throw new Error(`Unknown payload definition: ${payloadDef}`);
    }
  }

  /**
   * Generate cluster payload
   */
  async generateClusterPayload(simulation, timestamp) {
    return this.payloadEngine.generateFromExperiment({
      name: 'Cluster Creation',
      baseTemplate: 'awsmskcluster',
      entityType: 'cluster',
      clusterName: simulation.clusterName || `sim-cluster-${timestamp}`,
      uniqueId: `cluster-${timestamp}`
    });
  }

  /**
   * Generate broker payload
   */
  async generateBrokerPayload(simulation, brokerId, timestamp) {
    return this.payloadEngine.generateFromExperiment({
      name: `Broker ${brokerId} Creation`,
      baseTemplate: 'awsmskbroker',
      entityType: 'broker',
      clusterName: simulation.clusterName || `sim-cluster-${timestamp}`,
      brokerId: brokerId.toString(),
      uniqueId: `broker-${brokerId}-${timestamp}`,
      modifications: [
        {
          action: 'set',
          field: 'provider.brokerId',
          value: brokerId.toString()
        }
      ]
    });
  }

  /**
   * Generate topic payload
   */
  async generateTopicPayload(simulation, index, timestamp) {
    const topics = simulation.topics || ['events', 'logs', 'metrics'];
    const topicName = topics[index % topics.length];
    
    return this.payloadEngine.generateFromExperiment({
      name: `Topic ${topicName} Creation`,
      baseTemplate: 'awsmsktopic',
      entityType: 'topic',
      clusterName: simulation.clusterName || `sim-cluster-${timestamp}`,
      topicName,
      uniqueId: `topic-${topicName}-${timestamp}`
    });
  }

  /**
   * Generate traffic data
   */
  async generateTrafficData(step, results) {
    const brokers = Object.values(results.entities)
      .filter(e => e.payload.eventType === 'AwsMskBrokerSample');
    
    const trafficPayloads = brokers.map(broker => ({
      ...broker.payload,
      'provider.bytesInPerSec.Average': Math.random() * 1000000,
      'provider.bytesOutPerSec.Average': Math.random() * 1000000,
      'provider.messagesInPerSec.Average': Math.random() * 10000,
      timestamp: Date.now()
    }));
    
    const submissions = await this.submissionEngine.submitBatch(trafficPayloads);
    
    return {
      type: 'traffic',
      brokers: brokers.length,
      submissions: submissions.length
    };
  }

  /**
   * Run final verification
   */
  async runFinalVerification(verificationConfig, results) {
    const checks = [];
    
    for (const check of verificationConfig.checks) {
      const params = this.resolveReferences(check.params, results);
      
      const checkResult = await this.verificationEngine.runCheck(
        {
          type: check.type,
          params,
          retries: check.retries || 3
        },
        {} // Mock experiment
      );
      
      checks.push({
        ...checkResult,
        name: check.name || check.type
      });
    }
    
    return {
      timestamp: new Date().toISOString(),
      checks,
      summary: {
        total: checks.length,
        passed: checks.filter(c => c.passed).length,
        failed: checks.filter(c => !c.passed).length
      }
    };
  }

  /**
   * Resolve references in parameters
   */
  resolveReferences(params, results) {
    if (typeof params === 'string') {
      return params.replace(/\{(\w+)\.(\w+)\}/g, (match, entityId, field) => {
        const entity = results.entities[entityId];
        if (entity) {
          return this.getNestedValue(entity.payload, field) || 
                 this.getNestedValue(entity, field) || 
                 match;
        }
        return match;
      });
    }
    
    if (Array.isArray(params)) {
      return params.map(p => this.resolveReferences(p, results));
    }
    
    if (typeof params === 'object' && params !== null) {
      const resolved = {};
      for (const [key, value] of Object.entries(params)) {
        resolved[key] = this.resolveReferences(value, results);
      }
      return resolved;
    }
    
    return params;
  }

  /**
   * Generate summary
   */
  generateSummary(results, startTime) {
    const duration = Date.now() - startTime;
    
    const summary = {
      duration: `${Math.round(duration / 1000)}s`,
      steps: {
        total: results.steps.length,
        successful: results.steps.filter(s => !s.error).length,
        failed: results.steps.filter(s => s.error).length
      },
      entities: {
        created: Object.keys(results.entities).length,
        types: {}
      },
      verification: results.verification ? {
        passed: results.verification.summary.passed,
        failed: results.verification.summary.failed,
        total: results.verification.summary.total
      } : null
    };
    
    // Count entity types
    for (const entity of Object.values(results.entities)) {
      const type = entity.payload.eventType || 'unknown';
      summary.entities.types[type] = (summary.entities.types[type] || 0) + 1;
    }
    
    summary.success = summary.steps.failed === 0 && 
                      (!summary.verification || summary.verification.failed === 0);
    
    return summary;
  }

  /**
   * Display simulation summary
   */
  displaySummary(results) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 SIMULATION SUMMARY');
    console.log('='.repeat(80));
    
    console.log(`\nDuration: ${results.summary.duration}`);
    console.log(`Steps: ${results.summary.steps.successful}/${results.summary.steps.total} successful`);
    console.log(`Entities Created: ${results.summary.entities.created}`);
    
    for (const [type, count] of Object.entries(results.summary.entities.types)) {
      console.log(`  - ${type}: ${count}`);
    }
    
    if (results.summary.verification) {
      console.log(`\nVerification: ${results.summary.verification.passed}/${results.summary.verification.total} passed`);
    }
    
    console.log(`\nOverall Result: ${results.summary.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    
    // Show failed steps
    const failedSteps = results.steps.filter(s => s.error);
    if (failedSteps.length > 0) {
      console.log('\nFailed Steps:');
      failedSteps.forEach(step => {
        console.log(`  ❌ Step ${step.step} (${step.action}): ${step.error}`);
      });
    }
    
    // Show failed checks
    if (results.verification && results.verification.summary.failed > 0) {
      console.log('\nFailed Checks:');
      results.verification.checks
        .filter(c => !c.passed)
        .forEach(check => {
          console.log(`  ❌ ${check.name}: ${check.error}`);
        });
    }
  }

  /**
   * Save simulation results
   */
  async saveResults(results, simulation) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const simName = simulation.name.replace(/\s+/g, '-');
    const filename = `simulation-${simName}-${timestamp}.json`;
    
    const filepath = path.join(
      __dirname,
      'results',
      'detailed-reports',
      filename
    );
    
    await fs.writeFile(filepath, JSON.stringify(results, null, 2));
    console.log(`\n📁 Results saved to: ${filename}`);
  }

  // Helper methods
  resolveEnvVars(obj) {
    if (typeof obj === 'string') {
      return obj.replace(/\${(\w+)}/g, (match, envVar) => {
        return process.env[envVar] || match;
      });
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveEnvVars(item));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.resolveEnvVars(value);
      }
      return result;
    }
    
    return obj;
  }

  setNestedValue(obj, path, value) {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    
    current[parts[parts.length - 1]] = value;
  }

  getNestedValue(obj, path) {
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (!(part in current)) {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }

  generatePerInstanceMods(perInstance, index) {
    const mods = [];
    
    for (const [field, config] of Object.entries(perInstance)) {
      if (config.increment) {
        mods.push({
          action: 'set',
          field,
          value: config.base + (index * config.increment)
        });
      } else if (config.values) {
        mods.push({
          action: 'set',
          field,
          value: config.values[index % config.values.length]
        });
      }
    }
    
    return mods;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Command line interface
async function main() {
  const runner = new SimulationRunner();
  
  // Wait for config to load
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const args = process.argv.slice(2);
  const simulationPath = args[0];
  
  console.log('🎮 Entity Synthesis Simulation Runner');
  console.log('====================================\n');
  
  if (!simulationPath) {
    console.error('Usage: node 2-run-simulation.js <simulation.yaml>');
    console.error('\nExample:');
    console.error('  node 2-run-simulation.js simulations/1-full-cluster-lifecycle.yaml');
    
    // List available simulations
    try {
      const simDir = path.join(__dirname, 'simulations');
      const files = await fs.readdir(simDir);
      const simulations = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
      
      if (simulations.length > 0) {
        console.error('\nAvailable simulations:');
        simulations.forEach(sim => {
          console.error(`  - simulations/${sim}`);
        });
      }
    } catch (e) {
      // Ignore
    }
    
    process.exit(1);
  }
  
  await runner.runSimulation(simulationPath);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = SimulationRunner;