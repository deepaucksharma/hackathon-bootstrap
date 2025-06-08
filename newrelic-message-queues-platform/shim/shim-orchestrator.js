/**
 * SHIM Orchestrator
 * 
 * Manages multiple SHIM adapters, coordinates transformations,
 * and integrates with the Foundation layer's transformation pipeline.
 */

const { EventEmitter } = require('events');
const KafkaShimAdapter = require('./adapters/kafka-shim-adapter');
const RabbitMQShimAdapter = require('./adapters/rabbitmq-shim-adapter');

class ShimOrchestrator extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      enabledProviders: ['kafka', 'rabbitmq', 'sqs', 'redis', 'pulsar'],
      autoInitialize: true,
      batchSize: 100,
      maxConcurrency: 5,
      errorRecovery: {
        maxRetries: 3,
        retryDelay: 1000,
        backoffMultiplier: 2
      },
      validation: {
        enabled: true,
        strict: false
      },
      ...config
    };
    
    this.adapters = new Map();
    this.adapterClasses = {
      kafka: KafkaShimAdapter,
      rabbitmq: RabbitMQShimAdapter
      // Additional adapters can be registered here
    };
    
    this.metrics = {
      totalTransformations: 0,
      successfulTransformations: 0,
      failedTransformations: 0,
      activeTransformations: 0,
      adapterMetrics: {}
    };
    
    this._isInitialized = false;
    this._transformationQueue = [];
    this._activeTransformations = new Set();
    
    if (this.config.autoInitialize) {
      this.initialize().catch(err => {
        this.emit('error', { 
          type: 'initialization', 
          error: err.message 
        });
      });
    }
  }
  
  /**
   * Initialize the orchestrator and all enabled adapters
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._isInitialized) {
      return;
    }
    
    try {
      // Initialize enabled adapters
      const initPromises = [];
      
      for (const provider of this.config.enabledProviders) {
        if (this.adapterClasses[provider]) {
          const adapter = new this.adapterClasses[provider]({
            ...this.config.adapterConfig?.[provider]
          });
          
          // Set up adapter event listeners
          this._setupAdapterListeners(adapter, provider);
          
          this.adapters.set(provider, adapter);
          initPromises.push(adapter.initialize());
          
          this.metrics.adapterMetrics[provider] = {
            initialized: false,
            transformations: 0,
            errors: 0
          };
        }
      }
      
      await Promise.all(initPromises);
      
      // Mark adapters as initialized
      for (const provider of this.adapters.keys()) {
        this.metrics.adapterMetrics[provider].initialized = true;
      }
      
      this._isInitialized = true;
      this.emit('initialized', {
        adapters: Array.from(this.adapters.keys()),
        config: this.config
      });
      
    } catch (error) {
      this.emit('initialization:error', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Register a custom adapter
   * @param {string} provider - Provider name
   * @param {class} AdapterClass - Adapter class extending BaseShimAdapter
   */
  registerAdapter(provider, AdapterClass) {
    if (this.adapterClasses[provider]) {
      throw new Error(`Adapter for provider '${provider}' already registered`);
    }
    
    this.adapterClasses[provider] = AdapterClass;
    this.emit('adapter:registered', { provider });
  }
  
  /**
   * Transform infrastructure data using appropriate adapter
   * @param {string} provider - Provider name
   * @param {Object} infrastructureData - Infrastructure discovery data
   * @returns {Promise<Object>} Transformation result
   */
  async transform(provider, infrastructureData) {
    if (!this._isInitialized) {
      await this.initialize();
    }
    
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${provider}`);
    }
    
    const transformationId = this._generateTransformationId(provider);
    this._activeTransformations.add(transformationId);
    this.metrics.activeTransformations = this._activeTransformations.size;
    
    try {
      this.metrics.totalTransformations++;
      this.metrics.adapterMetrics[provider].transformations++;
      
      this.emit('transformation:start', {
        id: transformationId,
        provider,
        timestamp: Date.now()
      });
      
      // Perform transformation with error recovery
      const result = await this._transformWithRecovery(
        adapter, 
        infrastructureData, 
        provider
      );
      
      // Validate result if enabled
      if (this.config.validation.enabled) {
        this._validateTransformationResult(result, provider);
      }
      
      this.metrics.successfulTransformations++;
      
      this.emit('transformation:complete', {
        id: transformationId,
        provider,
        entityCount: result.entities.length,
        metricCount: result.metrics.length,
        relationshipCount: result.relationships.length
      });
      
      return result;
      
    } catch (error) {
      this.metrics.failedTransformations++;
      this.metrics.adapterMetrics[provider].errors++;
      
      this.emit('transformation:error', {
        id: transformationId,
        provider,
        error: error.message
      });
      
      throw error;
      
    } finally {
      this._activeTransformations.delete(transformationId);
      this.metrics.activeTransformations = this._activeTransformations.size;
    }
  }
  
  /**
   * Batch transform infrastructure data from multiple providers
   * @param {Array<{provider: string, data: Object}>} items - Batch items
   * @returns {Promise<Object>} Aggregated results
   */
  async batchTransform(items) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Items must be a non-empty array');
    }
    
    const results = {
      successful: [],
      failed: [],
      entities: [],
      metrics: [],
      relationships: []
    };
    
    // Process in controlled batches
    for (let i = 0; i < items.length; i += this.config.batchSize) {
      const batch = items.slice(i, i + this.config.batchSize);
      
      // Limit concurrency
      const chunks = [];
      for (let j = 0; j < batch.length; j += this.config.maxConcurrency) {
        chunks.push(batch.slice(j, j + this.config.maxConcurrency));
      }
      
      for (const chunk of chunks) {
        const promises = chunk.map(item => 
          this.transform(item.provider, item.data)
            .then(result => ({
              status: 'fulfilled',
              provider: item.provider,
              result
            }))
            .catch(error => ({
              status: 'rejected',
              provider: item.provider,
              error: error.message,
              data: item.data
            }))
        );
        
        const chunkResults = await Promise.all(promises);
        
        chunkResults.forEach(result => {
          if (result.status === 'fulfilled') {
            results.successful.push({
              provider: result.provider,
              entityCount: result.result.entities.length
            });
            results.entities.push(...result.result.entities);
            results.metrics.push(...result.result.metrics);
            results.relationships.push(...result.result.relationships);
          } else {
            results.failed.push({
              provider: result.provider,
              error: result.error,
              data: result.data
            });
          }
        });
      }
    }
    
    this.emit('batch:complete', {
      total: items.length,
      successful: results.successful.length,
      failed: results.failed.length,
      entities: results.entities.length,
      metrics: results.metrics.length,
      relationships: results.relationships.length
    });
    
    return results;
  }
  
  /**
   * Stream transform infrastructure data
   * @param {AsyncIterable} dataStream - Stream of infrastructure data
   * @param {Function} callback - Callback for each transformation result
   * @returns {Promise<Object>} Stream statistics
   */
  async streamTransform(dataStream, callback) {
    const stats = {
      processed: 0,
      successful: 0,
      failed: 0,
      startTime: Date.now(),
      endTime: null
    };
    
    try {
      for await (const item of dataStream) {
        try {
          const result = await this.transform(item.provider, item.data);
          stats.processed++;
          stats.successful++;
          
          if (callback) {
            await callback(null, result, item);
          }
        } catch (error) {
          stats.processed++;
          stats.failed++;
          
          if (callback) {
            await callback(error, null, item);
          }
        }
      }
    } finally {
      stats.endTime = Date.now();
      stats.duration = stats.endTime - stats.startTime;
      
      this.emit('stream:complete', stats);
    }
    
    return stats;
  }
  
  /**
   * Get adapter for a specific provider
   * @param {string} provider - Provider name
   * @returns {BaseShimAdapter|null} Adapter instance
   */
  getAdapter(provider) {
    return this.adapters.get(provider);
  }
  
  /**
   * Get health status of all adapters
   * @returns {Object} Health status
   */
  getHealth() {
    const health = {
      orchestrator: {
        initialized: this._isInitialized,
        activeTransformations: this._activeTransformations.size,
        metrics: { ...this.metrics }
      },
      adapters: {}
    };
    
    for (const [provider, adapter] of this.adapters.entries()) {
      health.adapters[provider] = adapter.getHealth();
    }
    
    return health;
  }
  
  /**
   * Reset orchestrator and all adapter metrics
   */
  reset() {
    this.metrics = {
      totalTransformations: 0,
      successfulTransformations: 0,
      failedTransformations: 0,
      activeTransformations: 0,
      adapterMetrics: {}
    };
    
    for (const [provider, adapter] of this.adapters.entries()) {
      adapter.reset();
      this.metrics.adapterMetrics[provider] = {
        initialized: true,
        transformations: 0,
        errors: 0
      };
    }
    
    this._activeTransformations.clear();
    this.emit('reset');
  }
  
  /**
   * Shutdown orchestrator and cleanup resources
   */
  async shutdown() {
    // Wait for active transformations to complete
    if (this._activeTransformations.size > 0) {
      this.emit('shutdown:waiting', {
        activeTransformations: this._activeTransformations.size
      });
      
      // Wait with timeout
      const timeout = 30000; // 30 seconds
      const startTime = Date.now();
      
      while (this._activeTransformations.size > 0 && Date.now() - startTime < timeout) {
        await this._sleep(100);
      }
      
      if (this._activeTransformations.size > 0) {
        this.emit('shutdown:forced', {
          remainingTransformations: this._activeTransformations.size
        });
      }
    }
    
    // Clear adapters
    this.adapters.clear();
    this._isInitialized = false;
    
    this.emit('shutdown:complete');
  }
  
  /**
   * Connect to Foundation layer transformer
   * @param {Object} foundationTransformer - Foundation layer transformer instance
   */
  connectToFoundation(foundationTransformer) {
    if (!foundationTransformer || typeof foundationTransformer.transform !== 'function') {
      throw new Error('Invalid foundation transformer');
    }
    
    this.foundationTransformer = foundationTransformer;
    
    // Set up integration
    this.on('transformation:complete', async (event) => {
      if (this.foundationTransformer) {
        try {
          await this.foundationTransformer.transform({
            source: 'shim',
            provider: event.provider,
            entities: event.entities,
            metrics: event.metrics,
            relationships: event.relationships
          });
        } catch (error) {
          this.emit('foundation:error', {
            provider: event.provider,
            error: error.message
          });
        }
      }
    });
    
    this.emit('foundation:connected');
  }
  
  // Private methods
  
  /**
   * Set up event listeners for an adapter
   * @private
   */
  _setupAdapterListeners(adapter, provider) {
    adapter.on('initialized', (event) => {
      this.emit('adapter:initialized', { provider, ...event });
    });
    
    adapter.on('transformation:success', (event) => {
      this.emit('adapter:transformation:success', { provider, ...event });
    });
    
    adapter.on('transformation:error', (event) => {
      this.emit('adapter:transformation:error', { provider, ...event });
    });
    
    adapter.on('transformation:retry', (event) => {
      this.emit('adapter:transformation:retry', { provider, ...event });
    });
  }
  
  /**
   * Transform with error recovery
   * @private
   */
  async _transformWithRecovery(adapter, data, provider) {
    const { maxRetries, retryDelay, backoffMultiplier } = this.config.errorRecovery;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await adapter.transform(data);
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          const delay = retryDelay * Math.pow(backoffMultiplier, attempt - 1);
          
          this.emit('recovery:retry', {
            provider,
            attempt,
            maxAttempts: maxRetries,
            delay,
            error: error.message
          });
          
          await this._sleep(delay);
          
          // Try to recover adapter state if needed
          if (error.message.includes('not initialized')) {
            try {
              await adapter.initialize();
            } catch (initError) {
              // Continue with retry
            }
          }
        }
      }
    }
    
    throw lastError;
  }
  
  /**
   * Validate transformation result
   * @private
   */
  _validateTransformationResult(result, provider) {
    if (!result || typeof result !== 'object') {
      throw new Error('Transformation result must be an object');
    }
    
    const required = ['entities', 'metrics', 'relationships'];
    for (const field of required) {
      if (!Array.isArray(result[field])) {
        throw new Error(`Transformation result must include ${field} array`);
      }
    }
    
    // Validate entities
    if (this.config.validation.strict) {
      result.entities.forEach((entity, index) => {
        if (!entity.guid) {
          throw new Error(`Entity at index ${index} missing guid`);
        }
        if (!entity.entityType) {
          throw new Error(`Entity at index ${index} missing entityType`);
        }
        if (!entity.entityType.startsWith('MESSAGE_QUEUE_')) {
          throw new Error(`Entity at index ${index} has invalid entityType: ${entity.entityType}`);
        }
      });
      
      // Validate relationships
      result.relationships.forEach((rel, index) => {
        if (!rel.source || !rel.target || !rel.type) {
          throw new Error(`Relationship at index ${index} missing required fields`);
        }
      });
    }
    
    this.emit('validation:complete', {
      provider,
      entities: result.entities.length,
      metrics: result.metrics.length,
      relationships: result.relationships.length
    });
  }
  
  /**
   * Generate unique transformation ID
   * @private
   */
  _generateTransformationId(provider) {
    return `${provider}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ShimOrchestrator;