/**
 * Payload Engine - Generates payloads based on experiments
 * 
 * This engine takes experiment definitions and generates
 * the exact JSON payloads needed for testing.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');

class PayloadEngine {
  constructor(config, entityDefinitions) {
    this.config = config;
    this.entityDefinitions = entityDefinitions;
    this.templateCache = {};
  }

  /**
   * Generate payload from experiment definition
   */
  async generateFromExperiment(experimentPath) {
    // Load experiment definition
    const experimentContent = await fs.readFile(experimentPath, 'utf8');
    const experiment = yaml.load(experimentContent);
    
    console.log(`\n🧪 Generating payload for experiment: ${experiment.name}`);
    
    // Load base template
    const template = await this.loadTemplate(experiment.baseTemplate);
    
    // Apply modifications
    let payload = JSON.parse(JSON.stringify(template)); // Deep clone
    
    if (experiment.modifications) {
      payload = this.applyModifications(payload, experiment.modifications);
    }
    
    // Generate dynamic values
    payload = this.generateDynamicValues(payload, experiment);
    
    // Add timestamp
    payload.timestamp = Date.now();
    
    // Validate payload
    this.validatePayload(payload, experiment.entityType);
    
    return {
      experiment,
      payload,
      metadata: {
        generatedAt: new Date().toISOString(),
        experimentPath,
        baseTemplate: experiment.baseTemplate
      }
    };
  }

  /**
   * Load template from golden payloads
   */
  async loadTemplate(templateName) {
    if (this.templateCache[templateName]) {
      return this.templateCache[templateName];
    }
    
    const templatePath = path.join(
      __dirname,
      '..',
      'templates',
      'golden-payloads',
      `${templateName}.json`
    );
    
    try {
      const content = await fs.readFile(templatePath, 'utf8');
      const template = JSON.parse(content);
      this.templateCache[templateName] = template;
      return template;
    } catch (error) {
      throw new Error(`Failed to load template ${templateName}: ${error.message}`);
    }
  }

  /**
   * Apply modifications to payload
   */
  applyModifications(payload, modifications) {
    for (const mod of modifications) {
      switch (mod.action) {
        case 'set':
          this.setNestedProperty(payload, mod.field, mod.value);
          break;
          
        case 'remove':
          this.removeNestedProperty(payload, mod.field);
          break;
          
        case 'increment':
          this.incrementNestedProperty(payload, mod.field, mod.value);
          break;
          
        case 'append':
          this.appendToField(payload, mod.field, mod.value);
          break;
          
        case 'replace':
          if (payload[mod.field] && typeof payload[mod.field] === 'string') {
            payload[mod.field] = payload[mod.field].replace(mod.pattern, mod.value);
          }
          break;
          
        default:
          console.warn(`Unknown modification action: ${mod.action}`);
      }
    }
    
    return payload;
  }

  /**
   * Generate dynamic values like entityGuid, entityName
   */
  generateDynamicValues(payload, experiment) {
    const timestamp = Date.now();
    
    // Replace placeholders
    const replacements = {
      '{{ENTITY_GUID}}': this.generateEntityGuid(
        experiment.entityType,
        this.config.newRelic.accountId,
        experiment.uniqueId || timestamp
      ),
      '{{ENTITY_NAME}}': experiment.entityName || `test-entity-${timestamp}`,
      '{{CLUSTER_NAME}}': experiment.clusterName || `test-cluster-${timestamp}`,
      '{{BROKER_ID}}': experiment.brokerId || '1',
      '{{TOPIC_NAME}}': experiment.topicName || `test-topic-${timestamp}`,
      '{{AWS_ACCOUNT_ID}}': this.config.aws.accountId,
      '{{TIMESTAMP}}': timestamp
    };
    
    // Recursively replace in payload
    return this.replacePlaceholders(payload, replacements);
  }

  /**
   * Generate entity GUID using New Relic's format
   */
  generateEntityGuid(entityType, accountId, uniqueId) {
    // New Relic entity GUID format: base64(accountId|domain|type|identifier)
    const domain = 'INFRA';
    const identifier = `kafka:${uniqueId}`;
    const guidString = `${accountId}|${domain}|${entityType}|${identifier}`;
    return Buffer.from(guidString).toString('base64');
  }

  /**
   * Recursively replace placeholders in object
   */
  replacePlaceholders(obj, replacements) {
    if (typeof obj === 'string') {
      let result = obj;
      for (const [placeholder, value] of Object.entries(replacements)) {
        result = result.replace(new RegExp(placeholder, 'g'), value);
      }
      return result;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.replacePlaceholders(item, replacements));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.replacePlaceholders(value, replacements);
      }
      return result;
    }
    
    return obj;
  }

  /**
   * Validate payload against entity definition
   */
  validatePayload(payload, entityType) {
    const definition = this.entityDefinitions.entities[entityType];
    if (!definition) {
      throw new Error(`Unknown entity type: ${entityType}`);
    }
    
    // Check required attributes
    for (const [field, value] of Object.entries(definition.requiredAttributes)) {
      if (payload[field] !== value) {
        throw new Error(
          `Required field ${field} must be "${value}", got "${payload[field]}"`
        );
      }
    }
    
    // Check identity fields
    for (const field of definition.identityFields) {
      if (!this.getNestedProperty(payload, field)) {
        throw new Error(`Missing required identity field: ${field}`);
      }
    }
    
    console.log(`✅ Payload validated for ${entityType}`);
  }

  /**
   * Generate payloads for a full cluster simulation
   */
  async generateClusterPayloads(clusterConfig) {
    const payloads = [];
    const clusterName = clusterConfig.name || `cluster-${Date.now()}`;
    const timestamp = Date.now();
    
    // Generate cluster payload
    const clusterPayload = await this.generateFromExperiment({
      name: 'Cluster Creation',
      baseTemplate: 'awsmskcluster',
      entityType: 'cluster',
      clusterName,
      uniqueId: `${clusterName}-cluster`
    });
    payloads.push(clusterPayload);
    
    // Generate broker payloads
    for (let i = 1; i <= (clusterConfig.brokerCount || 3); i++) {
      const brokerPayload = await this.generateFromExperiment({
        name: `Broker ${i} Creation`,
        baseTemplate: 'awsmskbroker',
        entityType: 'broker',
        clusterName,
        brokerId: i.toString(),
        uniqueId: `${clusterName}-broker-${i}`,
        modifications: [
          {
            action: 'set',
            field: 'provider.brokerId',
            value: i.toString()
          }
        ]
      });
      payloads.push(brokerPayload);
    }
    
    // Generate topic payloads
    const topics = clusterConfig.topics || ['orders', 'payments', 'users'];
    for (const topicName of topics) {
      const topicPayload = await this.generateFromExperiment({
        name: `Topic ${topicName} Creation`,
        baseTemplate: 'awsmsktopic',
        entityType: 'topic',
        clusterName,
        topicName,
        uniqueId: `${clusterName}-topic-${topicName}`
      });
      payloads.push(topicPayload);
    }
    
    return payloads;
  }

  // Helper methods for nested property manipulation
  setNestedProperty(obj, path, value) {
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

  getNestedProperty(obj, path) {
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

  removeNestedProperty(obj, path) {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) {
        return;
      }
      current = current[parts[i]];
    }
    
    delete current[parts[parts.length - 1]];
  }

  incrementNestedProperty(obj, path, amount = 1) {
    const current = this.getNestedProperty(obj, path);
    if (typeof current === 'number') {
      this.setNestedProperty(obj, path, current + amount);
    }
  }

  appendToField(obj, path, value) {
    const current = this.getNestedProperty(obj, path);
    if (Array.isArray(current)) {
      current.push(value);
    } else if (typeof current === 'string') {
      this.setNestedProperty(obj, path, current + value);
    }
  }
}

module.exports = PayloadEngine;