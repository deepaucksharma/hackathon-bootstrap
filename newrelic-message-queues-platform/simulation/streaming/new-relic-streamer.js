/**
 * New Relic Streamer
 * 
 * Streams MESSAGE_QUEUE_* entity data to New Relic Event API and Metric API
 * with rate limiting, batching, and error handling.
 */

const https = require('https');

class NewRelicStreamer {
  constructor(config = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.NEW_RELIC_API_KEY,
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
      region: config.region || 'US', // US or EU
      eventApiUrl: config.eventApiUrl || 'https://insights-collector.newrelic.com/v1/accounts',
      metricApiUrl: config.metricApiUrl || 'https://metric-api.newrelic.com/metric/v1',
      batchSize: config.batchSize || 100,
      flushInterval: config.flushInterval || 5000, // 5 seconds
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      rateLimitBuffer: config.rateLimitBuffer || 0.8, // Use 80% of rate limit
      dryRun: config.dryRun || false, // Enable dry-run mode for testing
      verbose: config.verbose || false, // Enable verbose logging
      ...config
    };

    this.eventQueue = [];
    this.metricQueue = [];
    this.flushTimer = null;
    this.rateLimiter = new RateLimiter();
    this.errorHandler = new ErrorHandler(this.config.maxRetries, this.config.retryDelay);
    this.stats = new StreamingStats();

    this.startPeriodicFlush();
  }

  /**
   * Stream entity event data
   */
  streamEvent(entity) {
    if (!this.config.apiKey) {
      throw new Error('New Relic API key is required');
    }

    const eventPayload = entity.toEventPayload();
    this.eventQueue.push(eventPayload);
    this.stats.recordEvent(eventPayload.eventType);

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
    if (!this.config.apiKey) {
      throw new Error('New Relic API key is required');
    }

    const metrics = this.convertToMetrics(entity);
    this.metricQueue.push(...metrics);
    this.stats.recordMetrics(metrics.length);

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
   * Flush events to New Relic
   */
  async flushEvents() {
    if (this.eventQueue.length === 0) return;

    const events = this.eventQueue.splice(0, this.config.batchSize);
    const url = `${this.config.eventApiUrl}/${this.config.accountId}/events`;

    try {
      await this.rateLimiter.waitForCapacity('events');
      const response = await this.sendToNewRelic(url, events, 'events');
      this.stats.recordSuccess('events', events.length);
      console.log(`Successfully sent ${events.length} events to New Relic`);
    } catch (error) {
      this.stats.recordError('events', events.length);
      console.error('Failed to send events to New Relic:', error.message);
      
      // Retry failed events
      await this.errorHandler.handleError(error, () => this.sendToNewRelic(url, events, 'events'));
    }
  }

  /**
   * Flush metrics to New Relic
   */
  async flushMetrics() {
    if (this.metricQueue.length === 0) return;

    const metrics = this.metricQueue.splice(0, this.config.batchSize);
    const payload = [{ metrics }];

    try {
      await this.rateLimiter.waitForCapacity('metrics');
      const response = await this.sendToNewRelic(this.config.metricApiUrl, payload, 'metrics');
      this.stats.recordSuccess('metrics', metrics.length);
      console.log(`Successfully sent ${metrics.length} metrics to New Relic`);
    } catch (error) {
      this.stats.recordError('metrics', metrics.length);
      console.error('Failed to send metrics to New Relic:', error.message);
      
      // Retry failed metrics
      await this.errorHandler.handleError(error, () => this.sendToNewRelic(this.config.metricApiUrl, payload, 'metrics'));
    }
  }

  /**
   * Send data to New Relic API
   */
  async sendToNewRelic(url, data, dataType) {
    const payload = JSON.stringify(data);
    
    // Handle dry-run mode
    if (this.config.dryRun) {
      if (this.config.verbose) {
        console.log(`[DRY RUN] Would send ${dataType} to ${url}:`);
        console.log(`[DRY RUN] Payload size: ${Buffer.byteLength(payload)} bytes`);
        console.log(`[DRY RUN] Records: ${Array.isArray(data) ? data.length : 1}`);
      }
      
      // Simulate success response
      return Promise.resolve({
        statusCode: 200,
        data: '{"success": true, "dryRun": true}',
        dryRun: true
      });
    }
    
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Api-Key': this.config.apiKey,
          'User-Agent': 'newrelic-message-queues-platform/1.0.0'
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              statusCode: res.statusCode,
              data: responseData
            });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.setTimeout(30000); // 30 second timeout
      req.write(payload);
      req.end();
    });
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
   * Get streaming statistics
   */
  getStats() {
    return {
      ...this.stats.getStats(),
      queuedEvents: this.eventQueue.length,
      queuedMetrics: this.metricQueue.length,
      rateLimiterStats: this.rateLimiter.getStats()
    };
  }

  /**
   * Clean shutdown
   */
  async shutdown() {
    console.log('Shutting down New Relic streamer...');
    this.stopPeriodicFlush();
    await this.flushAll();
    console.log('New Relic streamer shutdown complete');
  }
}

/**
 * Rate Limiter
 * 
 * Manages API rate limits for New Relic endpoints
 */
class RateLimiter {
  constructor() {
    this.limits = {
      events: {
        requestsPerMinute: 3000,
        current: 0,
        resetTime: Date.now() + 60000
      },
      metrics: {
        requestsPerMinute: 100000,
        current: 0,
        resetTime: Date.now() + 60000
      }
    };
  }

  /**
   * Wait for capacity
   */
  async waitForCapacity(endpoint) {
    const limit = this.limits[endpoint];
    if (!limit) return;

    // Reset counter if time window passed
    if (Date.now() > limit.resetTime) {
      limit.current = 0;
      limit.resetTime = Date.now() + 60000;
    }

    // Wait if at capacity
    if (limit.current >= limit.requestsPerMinute) {
      const waitTime = limit.resetTime - Date.now();
      console.log(`Rate limit reached for ${endpoint}, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      limit.current = 0;
      limit.resetTime = Date.now() + 60000;
    }

    limit.current++;
  }

  /**
   * Get rate limiter stats
   */
  getStats() {
    return {
      events: {
        used: this.limits.events.current,
        limit: this.limits.events.requestsPerMinute,
        resetIn: Math.max(0, this.limits.events.resetTime - Date.now())
      },
      metrics: {
        used: this.limits.metrics.current,
        limit: this.limits.metrics.requestsPerMinute,
        resetIn: Math.max(0, this.limits.metrics.resetTime - Date.now())
      }
    };
  }
}

/**
 * Error Handler
 * 
 * Handles retries with exponential backoff
 */
class ErrorHandler {
  constructor(maxRetries = 3, baseDelay = 1000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
  }

  /**
   * Handle error with retry logic
   */
  async handleError(error, retryFunction) {
    let attempt = 0;
    
    while (attempt < this.maxRetries) {
      attempt++;
      const delay = this.baseDelay * Math.pow(2, attempt - 1);
      
      console.log(`Retry attempt ${attempt}/${this.maxRetries} in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      try {
        await retryFunction();
        console.log(`Retry attempt ${attempt} succeeded`);
        return;
      } catch (retryError) {
        console.error(`Retry attempt ${attempt} failed:`, retryError.message);
        
        if (attempt === this.maxRetries) {
          console.error(`All retry attempts failed. Original error:`, error.message);
          throw error;
        }
      }
    }
  }
}

/**
 * Streaming Statistics
 * 
 * Tracks streaming performance and errors
 */
class StreamingStats {
  constructor() {
    this.stats = {
      events: {
        sent: 0,
        failed: 0,
        byType: {}
      },
      metrics: {
        sent: 0,
        failed: 0
      },
      startTime: Date.now(),
      lastActivity: Date.now()
    };
  }

  /**
   * Record event
   */
  recordEvent(eventType) {
    this.stats.events.byType[eventType] = (this.stats.events.byType[eventType] || 0) + 1;
    this.stats.lastActivity = Date.now();
  }

  /**
   * Record metrics
   */
  recordMetrics(count) {
    this.stats.lastActivity = Date.now();
  }

  /**
   * Record success
   */
  recordSuccess(type, count) {
    this.stats[type].sent += count;
    this.stats.lastActivity = Date.now();
  }

  /**
   * Record error
   */
  recordError(type, count) {
    this.stats[type].failed += count;
    this.stats.lastActivity = Date.now();
  }

  /**
   * Get statistics
   */
  getStats() {
    const uptime = Date.now() - this.stats.startTime;
    const totalEvents = this.stats.events.sent + this.stats.events.failed;
    const totalMetrics = this.stats.metrics.sent + this.stats.metrics.failed;
    
    return {
      ...this.stats,
      uptime,
      eventsPerSecond: totalEvents > 0 ? (totalEvents / (uptime / 1000)).toFixed(2) : 0,
      metricsPerSecond: totalMetrics > 0 ? (totalMetrics / (uptime / 1000)).toFixed(2) : 0,
      eventSuccessRate: totalEvents > 0 ? ((this.stats.events.sent / totalEvents) * 100).toFixed(1) : 100,
      metricSuccessRate: totalMetrics > 0 ? ((this.stats.metrics.sent / totalMetrics) * 100).toFixed(1) : 100
    };
  }
}

module.exports = NewRelicStreamer;