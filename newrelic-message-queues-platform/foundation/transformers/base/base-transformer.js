/**
 * BaseTransformer - Abstract base class for all metric transformers
 * 
 * Implements the Template Method pattern for consistent transformation pipeline
 * with lifecycle hooks for validation, transformation, enrichment, and optimization.
 */
class BaseTransformer {
  constructor(config = {}) {
    if (this.constructor === BaseTransformer) {
      throw new Error('BaseTransformer is an abstract class and cannot be instantiated directly');
    }

    this.config = {
      batchSize: 1000,
      enableValidation: true,
      enableOptimization: true,
      enableMetrics: true,
      ...config
    };

    this.metrics = {
      transformed: 0,
      failed: 0,
      validated: 0,
      optimized: 0,
      enriched: 0,
      startTime: Date.now()
    };

    this.hooks = new Map();
    this.middleware = [];
  }

  /**
   * Template method defining the transformation pipeline
   * @param {Object} data - Raw infrastructure data
   * @returns {Promise<Object>} Transformed message queue entity data
   */
  async transform(data) {
    try {
      // Pre-transform hook
      await this.executeHook('pre-transform', data);

      // Step 1: Validation
      const validatedData = await this.validate(data);
      if (this.config.enableValidation && !validatedData) {
        throw new Error('Validation failed');
      }

      // Step 2: Core transformation
      const transformedData = await this.performTransformation(validatedData || data);

      // Step 3: Enrichment
      const enrichedData = await this.enrich(transformedData);

      // Step 4: Optimization
      const optimizedData = this.config.enableOptimization 
        ? await this.optimize(enrichedData)
        : enrichedData;

      // Post-transform hook
      await this.executeHook('post-transform', optimizedData);

      // Update metrics
      this.metrics.transformed++;

      return optimizedData;
    } catch (error) {
      this.metrics.failed++;
      await this.handleError(error, data);
      throw error;
    }
  }

  /**
   * Batch transformation with automatic chunking
   * @param {Array} dataArray - Array of raw data objects
   * @returns {Promise<Array>} Array of transformed objects
   */
  async transformBatch(dataArray) {
    const results = [];
    const errors = [];

    // Process in chunks to avoid memory issues
    for (let i = 0; i < dataArray.length; i += this.config.batchSize) {
      const chunk = dataArray.slice(i, i + this.config.batchSize);
      
      // Process chunk in parallel
      const chunkResults = await Promise.allSettled(
        chunk.map(data => this.transform(data))
      );

      chunkResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          errors.push({
            index: i + index,
            error: result.reason,
            data: chunk[index]
          });
        }
      });
    }

    if (errors.length > 0) {
      await this.handleBatchErrors(errors);
    }

    return { results, errors };
  }

  /**
   * Validation hook - Override in subclasses
   * @param {Object} data - Data to validate
   * @returns {Promise<Object|null>} Validated data or null if invalid
   */
  async validate(data) {
    this.metrics.validated++;
    return data; // Default: pass through
  }

  /**
   * Core transformation logic - Must be implemented by subclasses
   * @param {Object} data - Validated data
   * @returns {Promise<Object>} Transformed data
   */
  async performTransformation(data) {
    throw new Error('performTransformation must be implemented by subclass');
  }

  /**
   * Enrichment hook - Override in subclasses
   * @param {Object} data - Transformed data
   * @returns {Promise<Object>} Enriched data
   */
  async enrich(data) {
    this.metrics.enriched++;
    return data; // Default: pass through
  }

  /**
   * Optimization hook - Override in subclasses
   * @param {Object} data - Enriched data
   * @returns {Promise<Object>} Optimized data
   */
  async optimize(data) {
    this.metrics.optimized++;
    return data; // Default: pass through
  }

  /**
   * Error handling hook - Override in subclasses
   * @param {Error} error - The error that occurred
   * @param {Object} data - The data that caused the error
   */
  async handleError(error, data) {
    console.error('Transformation error:', error);
    console.error('Failed data:', data);
  }

  /**
   * Batch error handling hook
   * @param {Array} errors - Array of error objects
   */
  async handleBatchErrors(errors) {
    console.error(`Batch transformation failed for ${errors.length} items`);
  }

  /**
   * Register a hook for lifecycle events
   * @param {string} event - Event name (pre-transform, post-transform, etc.)
   * @param {Function} handler - Hook handler function
   */
  registerHook(event, handler) {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }
    this.hooks.get(event).push(handler);
  }

  /**
   * Execute all hooks for a given event
   * @param {string} event - Event name
   * @param {*} data - Data to pass to hooks
   */
  async executeHook(event, data) {
    const handlers = this.hooks.get(event) || [];
    for (const handler of handlers) {
      await handler(data, this);
    }
  }

  /**
   * Add middleware to the transformation pipeline
   * @param {Function} middleware - Middleware function
   */
  use(middleware) {
    this.middleware.push(middleware);
  }

  /**
   * Get transformation metrics
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      duration: Date.now() - this.metrics.startTime,
      successRate: this.metrics.transformed / (this.metrics.transformed + this.metrics.failed)
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      transformed: 0,
      failed: 0,
      validated: 0,
      optimized: 0,
      enriched: 0,
      startTime: Date.now()
    };
  }
}

module.exports = BaseTransformer;