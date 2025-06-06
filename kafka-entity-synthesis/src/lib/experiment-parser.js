/**
 * Experiment Parser - Parse and validate YAML experiment definitions
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class ExperimentParser {
  constructor(configPath = 'config/platform-config.json') {
    this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  /**
   * Parse experiment YAML file
   */
  parse(experimentFile) {
    if (!fs.existsSync(experimentFile)) {
      throw new Error(`Experiment file not found: ${experimentFile}`);
    }

    try {
      const content = fs.readFileSync(experimentFile, 'utf8');
      const experiment = yaml.load(content);
      
      // Validate required fields
      this.validate(experiment);
      
      // Add metadata
      experiment.metadata = {
        file: experimentFile,
        phase: this.extractPhase(experimentFile),
        timestamp: new Date().toISOString(),
        id: this.generateId(experiment.name)
      };
      
      // Process template variables
      experiment = this.processVariables(experiment);
      
      return experiment;
      
    } catch (error) {
      throw new Error(`Failed to parse experiment: ${error.message}`);
    }
  }

  /**
   * Validate experiment structure
   */
  validate(experiment) {
    const required = ['name', 'description', 'verification'];
    
    for (const field of required) {
      if (!experiment[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Validate verification checks
    if (!experiment.verification.checks || !Array.isArray(experiment.verification.checks)) {
      throw new Error('Verification must include checks array');
    }
    
    for (const check of experiment.verification.checks) {
      if (!check.type || !this.config.verificationTypes[check.type]) {
        throw new Error(`Invalid verification type: ${check.type}`);
      }
    }
    
    // Validate modifications if present
    if (experiment.modifications) {
      for (const mod of experiment.modifications) {
        if (!mod.action || !['set', 'remove', 'append'].includes(mod.action)) {
          throw new Error(`Invalid modification action: ${mod.action}`);
        }
        if (mod.action !== 'remove' && !mod.path) {
          throw new Error('Modification must include path');
        }
      }
    }
  }

  /**
   * Extract phase from file path
   */
  extractPhase(filePath) {
    const match = filePath.match(/phase(\d+)-([^\/]+)/);
    if (match) {
      return {
        number: parseInt(match[1]),
        name: match[2].replace(/-/g, ' ')
      };
    }
    return { number: 0, name: 'unknown' };
  }

  /**
   * Generate unique ID for experiment
   */
  generateId(name) {
    const timestamp = Date.now();
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `${cleanName}-${timestamp}`;
  }

  /**
   * Process template variables like ${timestamp}
   */
  processVariables(experiment) {
    const timestamp = Date.now();
    const variables = {
      timestamp,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-')
    };
    
    // Recursively replace variables
    const processValue = (value) => {
      if (typeof value === 'string') {
        return value.replace(/\${(\w+)}/g, (match, varName) => {
          return variables[varName] || match;
        });
      } else if (Array.isArray(value)) {
        return value.map(processValue);
      } else if (typeof value === 'object' && value !== null) {
        const result = {};
        for (const [key, val] of Object.entries(value)) {
          result[key] = processValue(val);
        }
        return result;
      }
      return value;
    };
    
    return processValue(experiment);
  }
}

// Simple YAML parser implementation (since we can't npm install)
if (!global.yaml) {
  global.yaml = {
    load: function(str) {
      // Basic YAML parser for our specific format
      const lines = str.split('\n');
      const result = {};
      let currentObject = result;
      let currentArray = null;
      let indent = 0;
      const stack = [];
      
      for (const line of lines) {
        if (line.trim() === '' || line.trim().startsWith('#')) continue;
        
        const currentIndent = line.search(/\S/);
        const trimmed = line.trim();
        
        // Handle array items
        if (trimmed.startsWith('- ')) {
          const value = trimmed.substring(2).trim();
          if (currentArray) {
            if (value.includes(':')) {
              const obj = {};
              const [key, val] = value.split(':').map(s => s.trim());
              obj[key] = this.parseValue(val);
              currentArray.push(obj);
            } else {
              currentArray.push(this.parseValue(value));
            }
          }
          continue;
        }
        
        // Handle key-value pairs
        if (trimmed.includes(':')) {
          const colonIndex = trimmed.indexOf(':');
          const key = trimmed.substring(0, colonIndex).trim();
          const value = trimmed.substring(colonIndex + 1).trim();
          
          if (value === '') {
            // This is an object or array
            if (stack.length > 0 && currentIndent <= stack[stack.length - 1].indent) {
              // Pop from stack
              while (stack.length > 0 && currentIndent <= stack[stack.length - 1].indent) {
                const prev = stack.pop();
                currentObject = prev.object;
                currentArray = null;
              }
            }
            
            const newObj = {};
            currentObject[key] = newObj;
            stack.push({ object: currentObject, indent: currentIndent });
            currentObject = newObj;
            currentArray = null;
          } else if (value === '[]') {
            currentObject[key] = [];
            currentArray = currentObject[key];
          } else {
            currentObject[key] = this.parseValue(value);
          }
        }
      }
      
      return result;
    },
    
    parseValue: function(value) {
      if (value === 'true') return true;
      if (value === 'false') return false;
      if (value === 'null') return null;
      if (value.startsWith('"') && value.endsWith('"')) {
        return value.slice(1, -1);
      }
      if (value.startsWith("'") && value.endsWith("'")) {
        return value.slice(1, -1);
      }
      if (!isNaN(value) && value !== '') {
        return Number(value);
      }
      return value;
    }
  };
}

module.exports = ExperimentParser;