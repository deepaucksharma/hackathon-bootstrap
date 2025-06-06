#!/usr/bin/env node

/**
 * Payload Synthesizer - Build payloads from experiment definitions
 */

const fs = require('fs');
const path = require('path');

class PayloadSynthesizer {
  constructor(configPath = 'config/platform-config.json') {
    this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  /**
   * Synthesize payload from experiment definition
   */
  synthesize(experiment) {
    console.log(`🧪 Synthesizing payload for: ${experiment.name}`);
    
    let payload;
    
    // Start with base template or empty
    if (experiment.baseTemplate) {
      payload = this.loadBaseTemplate(experiment.baseTemplate);
    } else if (experiment.basePayload) {
      payload = JSON.parse(JSON.stringify(experiment.basePayload));
    } else {
      payload = this.createEmptyPayload();
    }
    
    // Apply modifications
    if (experiment.modifications) {
      payload = this.applyModifications(payload, experiment.modifications);
    }
    
    // Ensure it's in event array format
    if (!Array.isArray(payload)) {
      payload = [payload];
    }
    
    // Add experiment metadata
    payload.forEach(event => {
      event._experimentId = experiment.metadata.id;
      event._experimentName = experiment.name;
    });
    
    return payload;
  }

  /**
   * Load base template from file
   */
  loadBaseTemplate(templatePath) {
    const fullPath = path.join(process.cwd(), templatePath);
    
    if (!fs.existsSync(fullPath)) {
      // Try known good baselines
      for (const [type, baseline] of Object.entries(this.config.knownGoodBaselines)) {
        if (templatePath.includes(type)) {
          const baselinePath = path.join(process.cwd(), baseline);
          if (fs.existsSync(baselinePath)) {
            console.log(`  Using baseline: ${baseline}`);
            const content = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
            // Return first event if array
            return Array.isArray(content) ? content[0] : content;
          }
        }
      }
      throw new Error(`Template not found: ${templatePath}`);
    }
    
    const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    return Array.isArray(content) ? content[0] : content;
  }

  /**
   * Create empty payload structure
   */
  createEmptyPayload() {
    return {
      eventType: 'AwsMskBrokerSample',
      timestamp: Date.now()
    };
  }

  /**
   * Apply modifications to payload
   */
  applyModifications(payload, modifications) {
    for (const mod of modifications) {
      console.log(`  Applying: ${mod.action} ${mod.path || ''}`);
      
      switch (mod.action) {
        case 'set':
          this.setValue(payload, mod.path, mod.value);
          break;
          
        case 'remove':
          this.removeValue(payload, mod.path);
          break;
          
        case 'append':
          this.appendValue(payload, mod.path, mod.value);
          break;
          
        default:
          console.warn(`  Unknown action: ${mod.action}`);
      }
    }
    
    return payload;
  }

  /**
   * Set value at path (supports dot notation)
   */
  setValue(obj, path, value) {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }
    
    current[parts[parts.length - 1]] = value;
  }

  /**
   * Remove value at path
   */
  removeValue(obj, path) {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        return; // Path doesn't exist
      }
      current = current[part];
    }
    
    delete current[parts[parts.length - 1]];
  }

  /**
   * Append value to array at path
   */
  appendValue(obj, path, value) {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }
    
    const key = parts[parts.length - 1];
    if (!Array.isArray(current[key])) {
      current[key] = [];
    }
    current[key].push(value);
  }

  /**
   * Save synthesized payload for debugging
   */
  savePayload(payload, experiment) {
    const dir = path.join('results', 'detailed', experiment.metadata.id);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const filename = path.join(dir, 'synthesized-payload.json');
    fs.writeFileSync(filename, JSON.stringify(payload, null, 2));
    console.log(`  Saved to: ${filename}`);
    
    return filename;
  }
}

// Command line interface for testing
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: node 2-payload-synthesizer.js <experiment.yaml>');
    process.exit(1);
  }
  
  try {
    const ExperimentParser = require('./lib/experiment-parser');
    const parser = new ExperimentParser();
    const synthesizer = new PayloadSynthesizer();
    
    const experiment = parser.parse(args[0]);
    const payload = synthesizer.synthesize(experiment);
    
    console.log('\nSynthesized Payload:');
    console.log(JSON.stringify(payload, null, 2));
    
    synthesizer.savePayload(payload, experiment);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

module.exports = PayloadSynthesizer;