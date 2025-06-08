/**
 * Base Entity Class
 * 
 * Foundation for all MESSAGE_QUEUE_* entities following the New Relic
 * entity model specification from docs/README.md
 */

const crypto = require('crypto');

class BaseEntity {
  constructor(config = {}) {
    this.accountId = config.accountId || process.env.NEW_RELIC_ACCOUNT_ID;
    this.domain = 'INFRA';
    this.entityType = config.entityType || this.constructor.ENTITY_TYPE;
    this.name = config.name;
    this.provider = config.provider;
    this.metadata = config.metadata || {};
    this.tags = config.tags || [];
    this.relationships = [];
    this.lastSeenAt = new Date().toISOString();
    this.createdAt = config.createdAt || new Date().toISOString();
    
    // Generate GUID
    this.guid = this.generateGUID();
    
    // Initialize golden metrics
    this.goldenMetrics = this.initializeGoldenMetrics();
  }

  /**
   * Generate Entity GUID
   * Format: {accountId}|{domain}|{entityType}|{uniqueHash}
   */
  generateGUID() {
    const compositeKey = this.generateCompositeKey();
    const hash = crypto.createHash('sha256')
      .update(compositeKey)
      .digest('hex')
      .substring(0, 32);
    
    return `${this.accountId}|${this.domain}|${this.entityType}|${hash}`;
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
      eventType: `${this.entityType}_SAMPLE`,
      timestamp: Date.now(),
      'entity.guid': this.guid,
      'entity.name': this.name,
      'entity.type': this.entityType,
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
    
    if (!this.accountId) {
      errors.push('accountId is required');
    }
    
    if (!this.name) {
      errors.push('name is required');
    }
    
    if (!this.provider) {
      errors.push('provider is required');
    }
    
    if (!this.entityType) {
      errors.push('entityType is required');
    }

    return errors;
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