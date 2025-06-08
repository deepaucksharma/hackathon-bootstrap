/**
 * Dual-Mode Streaming Orchestrator for v2
 * Manages data streaming from both simulation and infrastructure sources
 */

const EventEmitter = require('events');
const https = require('https');

class StreamingOrchestrator extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = this.mergeDefaultConfig(config);
    this.active = false;
    
    // Streaming state
    this.eventBuffer = [];
    this.metricBuffer = [];
    this.flushTimer = null;
    
    // Source tracking
    this.sources = new Map();
    this.sourceMetrics = new Map();
    
    // Performance metrics
    this.metrics = {
      eventsSent: 0,
      metricsSent: 0,
      batchesSent: 0,
      errors: 0,
      lastFlush: null
    };

    // Circuit breaker
    this.circuitBreaker = {
      failures: 0,
      threshold: 5,
      timeout: 60000,
      state: 'closed',
      nextAttempt: null
    };
  }

  /**
   * Merge with default configuration
   */
  mergeDefaultConfig(config) {
    return {
      batchSize: 1000,
      flushInterval: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      endpoints: {
        events: 'insights-collector.newrelic.com',
        metrics: 'metric-api.newrelic.com'
      },
      compression: true,
      ...config
    };
  }

  /**
   * Start the streaming orchestrator
   */
  async start() {
    if (this.active) {
      return;
    }

    this.active = true;
    this.startFlushTimer();
    this.emit('started');
  }

  /**
   * Stop the streaming orchestrator
   */
  async stop() {
    if (!this.active) {
      return;
    }

    // Flush remaining data
    await this.flush();

    // Stop flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    this.active = false;
    this.emit('stopped');
  }

  /**
   * Stream data from any source
   */
  async stream(data, options = {}) {
    if (!this.active) {
      throw new Error('Streaming orchestrator is not active');
    }

    // Check circuit breaker
    if (this.circuitBreaker.state === 'open') {
      if (Date.now() < this.circuitBreaker.nextAttempt) {
        throw new Error('Circuit breaker is open');
      }
      // Try to close circuit
      this.circuitBreaker.state = 'half-open';
    }

    const { source = 'unknown', type = 'auto' } = options;

    // Track source
    if (!this.sources.has(source)) {
      this.sources.set(source, { 
        firstSeen: Date.now(), 
        lastSeen: Date.now(),
        count: 0 
      });
    }
    this.sources.get(source).lastSeen = Date.now();
    this.sources.get(source).count++;

    // Route data based on type
    if (type === 'events' || this.isEventData(data)) {
      await this.addEvents(data, source);
    } else if (type === 'metrics' || this.isMetricData(data)) {
      await this.addMetrics(data, source);
    } else {
      // Auto-detect and route
      await this.autoRoute(data, source);
    }

    // Check if we need to flush
    if (this.shouldFlush()) {
      await this.flush();
    }
  }

  /**
   * Add events to buffer
   */
  async addEvents(events, source) {
    const eventsArray = Array.isArray(events) ? events : [events];
    
    for (const event of eventsArray) {
      this.eventBuffer.push({
        ...event,
        _source: source,
        _timestamp: Date.now()
      });
    }

    this.emit('eventsBuffered', { count: eventsArray.length, source });
  }

  /**
   * Add metrics to buffer
   */
  async addMetrics(metrics, source) {
    const metricsArray = Array.isArray(metrics) ? metrics : [metrics];
    
    for (const metric of metricsArray) {
      this.metricBuffer.push({
        ...metric,
        _source: source,
        _timestamp: Date.now()
      });
    }

    this.emit('metricsBuffered', { count: metricsArray.length, source });
  }

  /**
   * Auto-detect data type and route appropriately
   */
  async autoRoute(data, source) {
    const dataArray = Array.isArray(data) ? data : [data];
    const events = [];
    const metrics = [];

    for (const item of dataArray) {
      if (this.isEventData(item)) {
        events.push(item);
      } else if (this.isMetricData(item)) {
        metrics.push(item);
      } else {
        // Default to events
        events.push(item);
      }
    }

    if (events.length > 0) {
      await this.addEvents(events, source);
    }
    if (metrics.length > 0) {
      await this.addMetrics(metrics, source);
    }
  }

  /**
   * Check if data is event format
   */
  isEventData(data) {
    return data.eventType || data.type === 'event';
  }

  /**
   * Check if data is metric format
   */
  isMetricData(data) {
    return data.name && (data.value !== undefined || data.count !== undefined) || 
           data.type === 'metric';
  }

  /**
   * Should flush buffers?
   */
  shouldFlush() {
    return this.eventBuffer.length >= this.config.batchSize ||
           this.metricBuffer.length >= this.config.batchSize;
  }

  /**
   * Start flush timer
   */
  startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        this.emit('error', { phase: 'timer-flush', error });
      });
    }, this.config.flushInterval);
  }

  /**
   * Flush all buffers
   */
  async flush() {
    const promises = [];

    if (this.eventBuffer.length > 0) {
      promises.push(this.flushEvents());
    }

    if (this.metricBuffer.length > 0) {
      promises.push(this.flushMetrics());
    }

    if (promises.length > 0) {
      await Promise.all(promises);
      this.metrics.lastFlush = Date.now();
    }
  }

  /**
   * Flush event buffer
   */
  async flushEvents() {
    const events = this.eventBuffer.splice(0, this.config.batchSize);
    if (events.length === 0) return;

    try {
      await this.sendToNewRelic(events, 'events');
      this.metrics.eventsSent += events.length;
      this.metrics.batchesSent++;
      
      // Update source metrics
      this.updateSourceMetrics(events);
      
      this.emit('eventsFlushed', { count: events.length });
      
      // Circuit breaker success
      if (this.circuitBreaker.state === 'half-open') {
        this.circuitBreaker.state = 'closed';
        this.circuitBreaker.failures = 0;
      }
      
    } catch (error) {
      // Return events to buffer on failure
      this.eventBuffer.unshift(...events);
      this.handleStreamError(error);
      throw error;
    }
  }

  /**
   * Flush metric buffer
   */
  async flushMetrics() {
    const metrics = this.metricBuffer.splice(0, this.config.batchSize);
    if (metrics.length === 0) return;

    try {
      await this.sendToNewRelic(metrics, 'metrics');
      this.metrics.metricsSent += metrics.length;
      this.metrics.batchesSent++;
      
      // Update source metrics
      this.updateSourceMetrics(metrics);
      
      this.emit('metricsFlushed', { count: metrics.length });
      
      // Circuit breaker success
      if (this.circuitBreaker.state === 'half-open') {
        this.circuitBreaker.state = 'closed';
        this.circuitBreaker.failures = 0;
      }
      
    } catch (error) {
      // Return metrics to buffer on failure
      this.metricBuffer.unshift(...metrics);
      this.handleStreamError(error);
      throw error;
    }
  }

  /**
   * Send data to New Relic
   */
  async sendToNewRelic(data, type) {
    const endpoint = type === 'events' 
      ? this.config.endpoints.events 
      : this.config.endpoints.metrics;

    const path = type === 'events'
      ? `/v1/accounts/${this.config.accountId}/events`
      : `/metric/v1`;

    const payload = type === 'events' 
      ? data 
      : [{
          metrics: data.map(m => ({
            name: m.name,
            type: m.type || 'gauge',
            value: m.value,
            timestamp: m.timestamp || Date.now(),
            attributes: m.attributes || {}
          }))
        }];

    const body = JSON.stringify(payload);

    const options = {
      hostname: endpoint,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Insert-Key': this.config.ingestKey || this.config.apiKey
      }
    };

    if (this.config.compression) {
      options.headers['Content-Encoding'] = 'gzip';
    }

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', chunk => responseBody += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body: responseBody });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Update source-specific metrics
   */
  updateSourceMetrics(data) {
    const sourceCounts = new Map();
    
    for (const item of data) {
      const source = item._source || 'unknown';
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    }

    for (const [source, count] of sourceCounts) {
      if (!this.sourceMetrics.has(source)) {
        this.sourceMetrics.set(source, { sent: 0, errors: 0 });
      }
      this.sourceMetrics.get(source).sent += count;
    }
  }

  /**
   * Handle streaming errors
   */
  handleStreamError(error) {
    this.metrics.errors++;
    this.circuitBreaker.failures++;

    if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
      this.circuitBreaker.state = 'open';
      this.circuitBreaker.nextAttempt = Date.now() + this.circuitBreaker.timeout;
      this.emit('circuitBreakerOpen', { 
        failures: this.circuitBreaker.failures,
        nextAttempt: new Date(this.circuitBreaker.nextAttempt)
      });
    }

    this.emit('error', { phase: 'streaming', error });
  }

  /**
   * Get streaming status
   */
  getStatus() {
    return {
      active: this.active,
      buffers: {
        events: this.eventBuffer.length,
        metrics: this.metricBuffer.length
      },
      sources: Array.from(this.sources.entries()).map(([name, info]) => ({
        name,
        ...info,
        metrics: this.sourceMetrics.get(name) || { sent: 0, errors: 0 }
      })),
      metrics: this.metrics,
      circuitBreaker: this.circuitBreaker
    };
  }

  /**
   * Get source statistics
   */
  getSourceStats() {
    const stats = {};
    
    for (const [source, info] of this.sources) {
      const metrics = this.sourceMetrics.get(source) || { sent: 0, errors: 0 };
      stats[source] = {
        ...info,
        ...metrics,
        errorRate: metrics.sent > 0 ? metrics.errors / metrics.sent : 0
      };
    }
    
    return stats;
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      eventsSent: 0,
      metricsSent: 0,
      batchesSent: 0,
      errors: 0,
      lastFlush: null
    };
    this.sourceMetrics.clear();
  }
}

module.exports = { StreamingOrchestrator };