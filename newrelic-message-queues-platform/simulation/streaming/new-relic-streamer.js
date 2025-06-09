/**
 * New Relic Streamer
 * 
 * Streams MESSAGE_QUEUE_* entity data to New Relic Event API and Metric API
 * with rate limiting, batching, and error handling.
 */

const NewRelicClient = require('../../core/http/new-relic-client');
const { getConfigManager } = require('../../core/config/config-manager');
const { logger } = require('../../core/utils/logger');
const CircuitBreaker = require('../../core/circuit-breaker');

class NewRelicStreamer {
  constructor(config = {}) {
    // Use shared config manager
    const configManager = getConfigManager(config);
    const streamingConfig = configManager.getStreamingConfig();
    
    this.client = new NewRelicClient(streamingConfig);
    this.config = {
      batchSize: config.batchSize || 100,
      flushInterval: config.flushInterval || 5000,
      ...streamingConfig,
      ...config
    };

    this.eventQueue = [];
    this.metricQueue = [];
    this.flushTimer = null;
    this.stats = {
      eventsSent: 0,
      metricsSent: 0,
      errors: 0,
      circuitBreakerRejections: 0
    };
    
    // Initialize circuit breakers for streaming operations
    this.eventCircuitBreaker = new CircuitBreaker({
      name: 'EventStreaming',
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 25000,
      retryDelay: 10000,
      maxRetries: 2
    });
    
    this.metricCircuitBreaker = new CircuitBreaker({
      name: 'MetricStreaming',
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 20000,
      retryDelay: 8000,
      maxRetries: 2
    });
    
    // Set up circuit breaker event handlers
    this.setupCircuitBreakerEvents();

    this.startPeriodicFlush();
    
    if (configManager.isDebug()) {
      logger.debug('NewRelicStreamer initialized with shared client and circuit breakers');
    }
  }

  /**
   * Setup circuit breaker event handlers for monitoring
   */
  setupCircuitBreakerEvents() {
    // Event streaming circuit breaker events
    this.eventCircuitBreaker.on('circuitOpened', ({ failureCount }) => {
      logger.warn(`🔴 Event streaming circuit opened after ${failureCount} failures`);
    });
    
    this.eventCircuitBreaker.on('circuitClosed', ({ successCount }) => {
      logger.info(`🟢 Event streaming circuit closed after ${successCount} successes`);
    });
    
    this.eventCircuitBreaker.on('callRejected', ({ error }) => {
      logger.warn(`⚠️ Event streaming call rejected: ${error.message}`);
      this.stats.circuitBreakerRejections++;
    });
    
    // Metric streaming circuit breaker events
    this.metricCircuitBreaker.on('circuitOpened', ({ failureCount }) => {
      logger.warn(`🔴 Metric streaming circuit opened after ${failureCount} failures`);
    });
    
    this.metricCircuitBreaker.on('circuitClosed', ({ successCount }) => {
      logger.info(`🟢 Metric streaming circuit closed after ${successCount} successes`);
    });
    
    this.metricCircuitBreaker.on('callRejected', ({ error }) => {
      logger.warn(`⚠️ Metric streaming call rejected: ${error.message}`);
      this.stats.circuitBreakerRejections++;
    });
  }
  
  /**
   * Stream entity event data
   */
  streamEvent(entity) {
    const eventPayload = entity.toEventPayload();
    this.eventQueue.push(eventPayload);

    if (this.eventQueue.length >= this.config.batchSize) {
      this.flushEvents();
    }
  }

  /**
   * Stream multiple entity events
   */
  streamEvents(entities) {
    entities.forEach(entity => {
      if (typeof entity.toEventPayload === 'function') {
        this.streamEvent(entity);
      }
    });
  }

  /**
   * Stream dimensional metrics
   */
  streamMetrics(entity) {
    const metrics = this.convertToMetrics(entity);
    this.metricQueue.push(...metrics);

    if (this.metricQueue.length >= this.config.batchSize) {
      this.flushMetrics();
    }
  }

  /**
   * Convert entity to dimensional metrics
   */
  convertToMetrics(entity) {
    const metrics = [];
    const timestamp = Date.now();
    const commonAttributes = {
      'entity.guid': entity.guid,
      'entity.name': entity.name,
      'entity.type': entity.entityType,
      provider: entity.provider,
      ...entity.metadata
    };

    // Convert golden metrics to dimensional metrics
    entity.goldenMetrics.forEach(metric => {
      metrics.push({
        name: metric.name,
        type: 'gauge',
        value: metric.value,
        timestamp: timestamp,
        attributes: {
          ...commonAttributes,
          unit: metric.unit
        }
      });
    });

    return metrics;
  }

  /**
   * Flush events to New Relic with circuit breaker protection
   */
  async flushEvents() {
    if (this.eventQueue.length === 0) return;

    const events = this.eventQueue.splice(0, this.config.batchSize);

    try {
      await this.eventCircuitBreaker.executeWithRetry(
        async () => {
          await this.client.sendEvents(events);
        }
      );
      
      this.stats.eventsSent += events.length;
      logger.success(`Successfully sent ${events.length} events to New Relic`);
    } catch (error) {
      this.stats.errors++;
      
      // Check if it's a circuit breaker rejection
      if (error.code === 'CIRCUIT_BREAKER_OPEN') {
        logger.warn('Event streaming circuit is open - queueing events for later retry');
      } else {
        logger.error('Failed to send events to New Relic:', error.message);
      }
      
      // Re-queue events for retry if not in dry run mode
      if (!this.config.dryRun) {
        this.eventQueue.unshift(...events);
      }
    }
  }

  /**
   * Flush metrics to New Relic with circuit breaker protection
   */
  async flushMetrics() {
    if (this.metricQueue.length === 0) return;

    const metrics = this.metricQueue.splice(0, this.config.batchSize);

    try {
      await this.metricCircuitBreaker.executeWithRetry(
        async () => {
          await this.client.sendMetrics(metrics);
        }
      );
      
      this.stats.metricsSent += metrics.length;
      logger.success(`Successfully sent ${metrics.length} metrics to New Relic`);
    } catch (error) {
      this.stats.errors++;
      
      // Check if it's a circuit breaker rejection
      if (error.code === 'CIRCUIT_BREAKER_OPEN') {
        logger.warn('Metric streaming circuit is open - queueing metrics for later retry');
      } else {
        logger.error('Failed to send metrics to New Relic:', error.message);
      }
      
      // Re-queue metrics for retry if not in dry run mode
      if (!this.config.dryRun) {
        this.metricQueue.unshift(...metrics);
      }
    }
  }

  /**
   * Convert entity to dimensional metrics
   */
  convertToMetrics(entity) {
    const metrics = [];
    const timestamp = Date.now();
    const commonAttributes = {
      'entity.guid': entity.guid,
      'entity.name': entity.name,
      'entity.type': entity.entityType,
      provider: entity.provider,
      ...entity.metadata
    };

    // Convert golden metrics to dimensional metrics
    entity.goldenMetrics.forEach(metric => {
      metrics.push({
        name: metric.name,
        type: 'gauge',
        value: metric.value,
        timestamp: timestamp,
        attributes: {
          ...commonAttributes,
          unit: metric.unit
        }
      });
    });

    return metrics;
  }

  /**
   * Start periodic flush
   */
  startPeriodicFlush() {
    this.flushTimer = setInterval(() => {
      this.flushEvents();
      this.flushMetrics();
    }, this.config.flushInterval);
  }

  /**
   * Stop periodic flush
   */
  stopPeriodicFlush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Flush all pending data
   */
  async flushAll() {
    await Promise.all([
      this.flushEvents(),
      this.flushMetrics()
    ]);
  }

  /**
   * Get streaming statistics including circuit breaker health
   */
  getStats() {
    return {
      eventsSent: this.stats.eventsSent,
      metricsSent: this.stats.metricsSent,
      errors: this.stats.errors,
      circuitBreakerRejections: this.stats.circuitBreakerRejections,
      queuedEvents: this.eventQueue.length,
      queuedMetrics: this.metricQueue.length,
      circuitBreakers: {
        eventStreaming: this.eventCircuitBreaker.getStats(),
        metricStreaming: this.metricCircuitBreaker.getStats()
      }
    };
  }

  /**
   * Reset circuit breakers (for testing or recovery)
   */
  resetCircuitBreakers() {
    this.eventCircuitBreaker.reset();
    this.metricCircuitBreaker.reset();
    logger.info('🔄 Streaming circuit breakers reset');
  }
  
  /**
   * Clean shutdown
   */
  async shutdown() {
    logger.info('Shutting down New Relic streamer...');
    this.stopPeriodicFlush();
    await this.flushAll();
    logger.success('New Relic streamer shutdown complete');
  }
  
  /**
   * Stop method (alias for shutdown)
   */
  async stop() {
    await this.shutdown();
  }
}

module.exports = NewRelicStreamer;