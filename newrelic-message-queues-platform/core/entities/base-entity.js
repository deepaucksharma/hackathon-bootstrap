/**
 * Base Entity Class
 * 
 * Foundation for all MESSAGE_QUEUE_* entities following the New Relic
 * entity model specification from docs/README.md
 */

const crypto = require('crypto');
const { getConfigManager } = require('../config/config-manager');
const { logger } = require('../utils/logger');

class BaseEntity {
  constructor(config = {}) {
    // Use config manager for defaults
    const configManager = getConfigManager();
    
    this.accountId = config.accountId || configManager.get('accountId');
    this.domain = 'INFRA';
    this.entityType = config.entityType || this.constructor.ENTITY_TYPE;
    this.name = config.name;
    this.provider = config.provider;
    this.metadata = config.metadata || {};
    this.tags = config.tags || [];
    this.relationships = [];
    this.lastSeenAt = new Date().toISOString();
    this.createdAt = config.createdAt || new Date().toISOString();
    
    // Validate required fields early
    this._validateRequiredFields();
    
    // Generate GUID after validation
    this.guid = this.generateGUID();
    
    // Initialize golden metrics
    this.goldenMetrics = this.initializeGoldenMetrics();
    
    if (configManager.isDebug()) {
      logger.debug(`Created entity: ${this.entityType}:${this.name}`);
    }
  }

  /**
   * Generate Entity GUID
   * Format: {entityType}|{accountId}|{provider}|{hierarchical_identifiers}
   */
  generateGUID() {
    const compositeKey = this.generateCompositeKey();
    const identifiers = compositeKey.split(':').filter(Boolean);
    
    // Use consistent format with transformer
    const parts = [this.entityType, this.accountId, this.provider, ...identifiers];
    return parts.filter(Boolean).join('|');
  }

  /**
   * Generate composite key for GUID hashing
   * Override in subclasses for entity-specific logic
   */
  generateCompositeKey() {
    return `${this.name}:${this.provider}:${this.accountId}`;
  }

  /**
   * Initialize golden metrics for the entity
   * Override in subclasses to define entity-specific metrics
   */
  initializeGoldenMetrics() {
    return [];
  }

  /**
   * Update golden metric value
   */
  updateGoldenMetric(name, value, unit = null) {
    let metric = this.goldenMetrics.find(m => m.name === name);
    if (!metric) {
      metric = { name, value, unit, timestamp: new Date().toISOString() };
      this.goldenMetrics.push(metric);
    } else {
      metric.value = value;
      metric.timestamp = new Date().toISOString();
      if (unit) metric.unit = unit;
    }
  }

  /**
   * Add relationship to another entity
   */
  addRelationship(type, targetGuid, metadata = {}) {
    this.relationships.push({
      type,
      targetGuid,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString()
      }
    });
  }

  /**
   * Update entity metadata
   */
  updateMetadata(key, value) {
    this.metadata[key] = value;
    this.lastSeenAt = new Date().toISOString();
  }

  /**
   * Add or update tag
   */
  setTag(key, value) {
    // Remove existing tag with same key
    this.tags = this.tags.filter(tag => tag.key !== key);
    // Add new tag
    this.tags.push({ key, value });
  }

  /**
   * Generate New Relic event payload
   */
  toEventPayload() {
    return {
      eventType: 'MessageQueue',
      timestamp: Date.now(),
      'entity.guid': this.guid,
      'entity.name': this.name,
      'entity.type': this.entityType,
      entityType: this.entityType,
      entityGuid: this.guid,
      provider: this.provider,
      ...this.metadata,
      ...this.tags,
      ...this.goldenMetricsToAttributes()
    };
  }

  /**
   * Convert golden metrics to event attributes
   */
  goldenMetricsToAttributes() {
    const attributes = {};
    this.goldenMetrics.forEach(metric => {
      attributes[metric.name] = metric.value;
    });
    return attributes;
  }

  /**
   * Generate entity metadata for New Relic
   */
  toEntityMetadata() {
    return {
      entity: {
        guid: this.guid,
        name: this.name,
        entityType: this.entityType,
        domain: this.domain,
        reporting: true,
        metadata: {
          provider: this.provider,
          ...this.metadata,
          createdAt: this.createdAt,
          lastSeenAt: this.lastSeenAt
        },
        tags: this.tags,
        goldenMetrics: this.goldenMetrics,
        relationships: this.relationships
      }
    };
  }

  /**
   * Validate entity data
   */
  validate() {
    const errors = [];
    const warnings = [];
    
    // Required field validation
    const validationResult = this._validateRequiredFields(false);
    errors.push(...validationResult.errors);
    warnings.push(...validationResult.warnings);
    
    // GUID format validation
    const guidResult = this._validateGuidFormat();
    if (!guidResult.valid) {
      errors.push(...guidResult.errors);
    }
    
    // Golden metrics validation
    const metricsResult = this._validateGoldenMetrics();
    errors.push(...metricsResult.errors);
    warnings.push(...metricsResult.warnings);
    
    // Relationship validation
    const relationshipResult = this._validateRelationships();
    errors.push(...relationshipResult.errors);
    warnings.push(...relationshipResult.warnings);
    
    // Entity-specific validation (override in subclasses)
    const customResult = this._validateCustom();
    errors.push(...customResult.errors);
    warnings.push(...customResult.warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate required fields (can be called during construction)
   */
  _validateRequiredFields(throwOnError = true) {
    const errors = [];
    const warnings = [];
    
    if (!this.accountId) {
      errors.push('accountId is required');
    } else if (!/^\d+$/.test(this.accountId.toString())) {
      errors.push('accountId must be numeric');
    }
    
    if (!this.name || this.name.trim().length === 0) {
      errors.push('name is required and cannot be empty');
    } else if (this.name.length > 255) {
      warnings.push('name is very long (>255 characters)');
    }
    
    if (!this.provider) {
      errors.push('provider is required');
    } else if (!['kafka', 'rabbitmq', 'activemq', 'sqs', 'sns'].includes(this.provider.toLowerCase())) {
      warnings.push(`provider '${this.provider}' is not a standard message queue provider`);
    }
    
    if (!this.entityType) {
      errors.push('entityType is required');
    } else if (!this.entityType.startsWith('MESSAGE_QUEUE_')) {
      warnings.push('entityType should start with MESSAGE_QUEUE_');
    }
    
    if (throwOnError && errors.length > 0) {
      throw new Error(`Entity validation failed: ${errors.join(', ')}`);
    }
    
    return { errors, warnings };
  }

  /**
   * Validate GUID format
   */
  _validateGuidFormat() {
    const errors = [];
    
    if (!this.guid) {
      errors.push('GUID is missing');
    } else {
      // Expected format: {entityType}|{accountId}|{provider}|{hash}
      const pattern = /^[A-Z_]+\|\d+\|[a-z]+\|[a-f0-9]+$/;
      if (!pattern.test(this.guid)) {
        errors.push(`GUID format invalid: ${this.guid}`);
      } else {
        const parts = this.guid.split('|');
        if (parts[0] !== this.entityType) {
          errors.push(`GUID entity type mismatch: expected ${this.entityType}, got ${parts[0]}`);
        }
        if (parts[1] !== this.accountId.toString()) {
          errors.push(`GUID account ID mismatch: expected ${this.accountId}, got ${parts[1]}`);
        }
        if (parts[2] !== this.provider) {
          errors.push(`GUID provider mismatch: expected ${this.provider}, got ${parts[2]}`);
        }
      }
    }
    
    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate golden metrics
   */
  _validateGoldenMetrics() {
    const errors = [];
    const warnings = [];
    
    if (!Array.isArray(this.goldenMetrics)) {
      errors.push('goldenMetrics must be an array');
      return { errors, warnings };
    }
    
    this.goldenMetrics.forEach((metric, index) => {
      if (!metric.name) {
        errors.push(`Golden metric ${index} missing name`);
      }
      
      if (metric.value === undefined || metric.value === null) {
        warnings.push(`Golden metric '${metric.name}' has no value`);
      } else if (typeof metric.value !== 'number') {
        warnings.push(`Golden metric '${metric.name}' value is not numeric`);
      }
      
      if (metric.unit && typeof metric.unit !== 'string') {
        warnings.push(`Golden metric '${metric.name}' unit should be a string`);
      }
    });
    
    return { errors, warnings };
  }

  /**
   * Validate relationships
   */
  _validateRelationships() {
    const errors = [];
    const warnings = [];
    
    if (!Array.isArray(this.relationships)) {
      errors.push('relationships must be an array');
      return { errors, warnings };
    }
    
    this.relationships.forEach((rel, index) => {
      if (!rel.type) {
        errors.push(`Relationship ${index} missing type`);
      }
      
      if (!rel.targetGuid) {
        errors.push(`Relationship ${index} missing targetGuid`);
      } else {
        // Basic GUID format check
        if (!rel.targetGuid.includes('|')) {
          warnings.push(`Relationship ${index} targetGuid appears malformed`);
        }
      }
    });
    
    return { errors, warnings };
  }

  /**
   * Custom validation (override in subclasses)
   */
  _validateCustom() {
    return { errors: [], warnings: [] };
  }

  /**
   * Check if entity is healthy based on golden metrics
   */
  isHealthy() {
    // Override in subclasses for entity-specific health logic
    return true;
  }

  /**
   * Get entity summary for debugging
   */
  getSummary() {
    return {
      guid: this.guid,
      name: this.name,
      type: this.entityType,
      provider: this.provider,
      goldenMetricsCount: this.goldenMetrics.length,
      relationshipsCount: this.relationships.length,
      isHealthy: this.isHealthy(),
      lastSeenAt: this.lastSeenAt
    };
  }
}

module.exports = BaseEntity;