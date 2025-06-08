/**
 * Base SHIM Adapter
 * 
 * Abstract base class for provider-specific SHIM adapters that transform
 * infrastructure discovery data into MESSAGE_QUEUE entities.
 * 
 * The SHIM layer acts as a bridge between raw infrastructure data and
 * the Foundation layer's transformation pipeline.
 */

const { EventEmitter } = require('events');
const { EntityFactory } = require('../core/entities');

class BaseShimAdapter extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      provider: null,
      retryAttempts: 3,
      retryDelay: 1000,
      batchSize: 100,
      validateOutput: true,
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID || '1234567890',
      ...config
    };
    
    this.entityFactory = new EntityFactory();
    this.metrics = {
      transformations: 0,
      errors: 0,
      retries: 0,
      lastTransformTime: null
    };
    
    this._isInitialized = false;
  }
  
  /**
   * Initialize the adapter
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._isInitialized) {
      return;
    }
    
    await this._initializeProvider();
    this._isInitialized = true;
    this.emit('initialized', { provider: this.config.provider });
  }
  
  /**
   * Transform infrastructure data to MESSAGE_QUEUE entities
   * @param {Object} infrastructureData - Raw infrastructure discovery data
   * @returns {Promise<Object>} Transformed entities and metrics
   */
  async transform(infrastructureData) {
    if (!this._isInitialized) {
      throw new Error('Adapter not initialized. Call initialize() first.');
    }
    
    const startTime = Date.now();
    
    try {
      // Validate input data
      this._validateInfrastructureData(infrastructureData);
      
      // Transform with retry logic
      const result = await this._transformWithRetry(infrastructureData);
      
      // Validate output if enabled
      if (this.config.validateOutput) {
        this._validateTransformationResult(result);
      }
      
      // Update metrics
      this.metrics.transformations++;
      this.metrics.lastTransformTime = Date.now() - startTime;
      
      this.emit('transformation:success', {
        provider: this.config.provider,
        entityCount: result.entities.length,
        duration: this.metrics.lastTransformTime
      });
      
      return result;
      
    } catch (error) {
      this.metrics.errors++;
      this.emit('transformation:error', {
        provider: this.config.provider,
        error: error.message,
        data: infrastructureData
      });
      throw error;
    }
  }
  
  /**
   * Transform with retry logic
   * @private
   */
  async _transformWithRetry(data) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await this._doTransform(data);
      } catch (error) {
        lastError = error;
        this.metrics.retries++;
        
        if (attempt < this.config.retryAttempts) {
          const delay = this.config.retryDelay * attempt;
          this.emit('transformation:retry', {
            provider: this.config.provider,
            attempt,
            delay,
            error: error.message
          });
          
          await this._sleep(delay);
        }
      }
    }
    
    throw lastError;
  }
  
  /**
   * Core transformation logic - must be implemented by subclasses
   * @private
   */
  async _doTransform(infrastructureData) {
    // Extract provider-specific components
    const components = await this._extractComponents(infrastructureData);
    
    // Map to MESSAGE_QUEUE entities
    const entities = await this._mapToEntities(components);
    
    // Extract metrics
    const metrics = await this._extractMetrics(components);
    
    // Build relationships
    const relationships = await this._buildRelationships(entities);
    
    return {
      entities,
      metrics,
      relationships,
      metadata: {
        provider: this.config.provider,
        timestamp: Date.now(),
        source: 'infrastructure-discovery'
      }
    };
  }
  
  /**
   * Batch transform multiple infrastructure data items
   * @param {Array} dataItems - Array of infrastructure data items
   * @returns {Promise<Object>} Aggregated transformation results
   */
  async batchTransform(dataItems) {
    const results = {
      entities: [],
      metrics: [],
      relationships: [],
      errors: []
    };
    
    // Process in batches
    for (let i = 0; i < dataItems.length; i += this.config.batchSize) {
      const batch = dataItems.slice(i, i + this.config.batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(item => this.transform(item))
      );
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.entities.push(...result.value.entities);
          results.metrics.push(...result.value.metrics);
          results.relationships.push(...result.value.relationships);
        } else {
          results.errors.push({
            index: i + index,
            error: result.reason.message,
            data: batch[index]
          });
        }
      });
    }
    
    return results;
  }
  
  /**
   * Get adapter health status
   * @returns {Object} Health status information
   */
  getHealth() {
    return {
      provider: this.config.provider,
      initialized: this._isInitialized,
      metrics: { ...this.metrics },
      status: this._isInitialized ? 'healthy' : 'uninitialized'
    };
  }
  
  /**
   * Reset adapter state
   */
  reset() {
    this.metrics = {
      transformations: 0,
      errors: 0,
      retries: 0,
      lastTransformTime: null
    };
    this.emit('reset', { provider: this.config.provider });
  }
  
  // Abstract methods that must be implemented by subclasses
  
  /**
   * Initialize provider-specific components
   * @abstract
   * @protected
   */
  async _initializeProvider() {
    throw new Error('_initializeProvider must be implemented by subclass');
  }
  
  /**
   * Extract components from infrastructure data
   * @abstract
   * @protected
   */
  async _extractComponents(infrastructureData) {
    throw new Error('_extractComponents must be implemented by subclass');
  }
  
  /**
   * Map components to MESSAGE_QUEUE entities
   * @abstract
   * @protected
   */
  async _mapToEntities(components) {
    throw new Error('_mapToEntities must be implemented by subclass');
  }
  
  /**
   * Extract metrics from components
   * @abstract
   * @protected
   */
  async _extractMetrics(components) {
    throw new Error('_extractMetrics must be implemented by subclass');
  }
  
  /**
   * Build relationships between entities
   * @abstract
   * @protected
   */
  async _buildRelationships(entities) {
    throw new Error('_buildRelationships must be implemented by subclass');
  }
  
  /**
   * Validate infrastructure data
   * @abstract
   * @protected
   */
  _validateInfrastructureData(data) {
    throw new Error('_validateInfrastructureData must be implemented by subclass');
  }
  
  // Helper methods
  
  /**
   * Validate transformation result
   * @protected
   */
  _validateTransformationResult(result) {
    if (!result || typeof result !== 'object') {
      throw new Error('Transformation result must be an object');
    }
    
    if (!Array.isArray(result.entities)) {
      throw new Error('Transformation result must include entities array');
    }
    
    if (!Array.isArray(result.metrics)) {
      throw new Error('Transformation result must include metrics array');
    }
    
    if (!Array.isArray(result.relationships)) {
      throw new Error('Transformation result must include relationships array');
    }
    
    // Validate each entity has required fields
    result.entities.forEach((entity, index) => {
      if (!entity.guid) {
        throw new Error(`Entity at index ${index} missing required field: guid`);
      }
      if (!entity.entityType) {
        throw new Error(`Entity at index ${index} missing required field: entityType`);
      }
    });
  }
  
  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Create cluster entity
   * @protected
   */
  _createClusterEntity(data) {
    return this.entityFactory.createCluster({
      name: data.name,
      provider: this.config.provider,
      region: data.region || 'unknown',
      environment: data.environment || 'production',
      accountId: this.config.accountId,
      metadata: data.metadata || {}
    });
  }
  
  /**
   * Create broker entity
   * @protected
   */
  _createBrokerEntity(data) {
    return this.entityFactory.createBroker({
      name: data.name,
      host: data.host,
      port: data.port,
      provider: this.config.provider,
      clusterId: data.clusterId,
      accountId: this.config.accountId,
      metadata: data.metadata || {}
    });
  }
  
  /**
   * Create topic entity
   * @protected
   */
  _createTopicEntity(data) {
    return this.entityFactory.createTopic({
      name: data.name,
      provider: this.config.provider,
      clusterId: data.clusterId,
      partitions: data.partitions || 1,
      replicas: data.replicas || 1,
      accountId: this.config.accountId,
      metadata: data.metadata || {}
    });
  }
  
  /**
   * Create queue entity
   * @protected
   */
  _createQueueEntity(data) {
    return this.entityFactory.createQueue({
      name: data.name,
      provider: this.config.provider,
      vhost: data.vhost || '/',
      clusterId: data.clusterId,
      accountId: this.config.accountId,
      metadata: data.metadata || {}
    });
  }
}

module.exports = BaseShimAdapter;