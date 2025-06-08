const { EventEmitter } = require('events');

/**
 * BaseAggregator - Abstract base class for metric aggregation
 * 
 * Provides thread-safe aggregation operations with configurable windows
 * and aggregation functions.
 */
class BaseAggregator extends EventEmitter {
  constructor(config = {}) {
    super();

    if (this.constructor === BaseAggregator) {
      throw new Error('BaseAggregator is an abstract class and cannot be instantiated directly');
    }

    this.config = {
      windowSize: 60000, // 1 minute default
      maxWindows: 60,    // Keep 1 hour of history
      aggregationFunctions: ['sum', 'avg', 'min', 'max', 'count'],
      flushInterval: 10000, // Flush every 10 seconds
      enableCompression: true,
      ...config
    };

    // Thread-safe data structures
    this.windows = new Map();
    this.currentWindow = null;
    this.lock = new AsyncLock();
    this.isRunning = false;

    // Metrics
    this.metrics = {
      aggregationsPerformed: 0,
      windowsCreated: 0,
      windowsFlushed: 0,
      errors: 0
    };

    // Start automatic flushing if configured
    if (this.config.flushInterval > 0) {
      this.startAutoFlush();
    }
  }

  /**
   * Start the aggregator
   */
  async start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.currentWindow = this.createWindow();
    this.emit('started');
  }

  /**
   * Stop the aggregator
   */
  async stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    
    // Flush current window
    if (this.currentWindow) {
      await this.flushWindow(this.currentWindow);
    }

    // Stop auto-flush
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    this.emit('stopped');
  }

  /**
   * Add a data point to the aggregator
   * @param {string} key - Metric key
   * @param {number} value - Metric value
   * @param {Object} metadata - Additional metadata
   */
  async add(key, value, metadata = {}) {
    if (!this.isRunning) {
      throw new Error('Aggregator is not running');
    }

    await this.lock.acquire('write', async () => {
      // Check if we need to rotate windows
      if (this.shouldRotateWindow()) {
        await this.rotateWindow();
      }

      // Add to current window
      this.addToWindow(this.currentWindow, key, value, metadata);
      
      this.emit('dataAdded', { key, value, metadata });
    });
  }

  /**
   * Add multiple data points in batch
   * @param {Array} dataPoints - Array of {key, value, metadata}
   */
  async addBatch(dataPoints) {
    if (!this.isRunning) {
      throw new Error('Aggregator is not running');
    }

    await this.lock.acquire('write', async () => {
      // Check if we need to rotate windows
      if (this.shouldRotateWindow()) {
        await this.rotateWindow();
      }

      // Add all points to current window
      for (const point of dataPoints) {
        this.addToWindow(this.currentWindow, point.key, point.value, point.metadata || {});
      }

      this.emit('batchAdded', { count: dataPoints.length });
    });
  }

  /**
   * Aggregate data from entities
   * @param {Object} entities - Entity collections
   * @returns {Promise<Object>} Aggregated metrics
   */
  async aggregate(entities) {
    if (!this.isRunning) {
      await this.start();
    }

    const startTime = Date.now();
    const aggregated = {};

    try {
      // Extract metrics from entities
      const metrics = await this.extractMetrics(entities);

      // Add metrics to aggregator
      for (const [key, values] of Object.entries(metrics)) {
        for (const value of values) {
          await this.add(key, value.value, value.metadata);
        }
      }

      // Get current aggregations
      aggregated.current = await this.getCurrentAggregations();
      
      // Get historical aggregations if needed
      if (this.config.includeHistory) {
        aggregated.history = await this.getHistoricalAggregations();
      }

      this.metrics.aggregationsPerformed++;
      this.emit('aggregationComplete', {
        duration: Date.now() - startTime,
        metricsCount: Object.keys(metrics).length
      });

    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
      throw error;
    }

    return aggregated;
  }

  /**
   * Extract metrics from entities - must be implemented by subclasses
   * @param {Object} entities - Entity collections
   * @returns {Promise<Object>} Extracted metrics
   */
  async extractMetrics(entities) {
    throw new Error('extractMetrics must be implemented by subclass');
  }

  /**
   * Get current window aggregations
   * @returns {Promise<Object>} Current aggregations
   */
  async getCurrentAggregations() {
    return this.lock.acquire('read', async () => {
      if (!this.currentWindow) return {};
      return this.aggregateWindow(this.currentWindow);
    });
  }

  /**
   * Get historical aggregations
   * @param {number} periods - Number of historical periods
   * @returns {Promise<Array>} Historical aggregations
   */
  async getHistoricalAggregations(periods = 5) {
    return this.lock.acquire('read', async () => {
      const windows = Array.from(this.windows.values())
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, periods);

      return Promise.all(windows.map(window => this.aggregateWindow(window)));
    });
  }

  /**
   * Create a new aggregation window
   * @returns {Object} New window
   */
  createWindow() {
    const window = {
      id: Date.now(),
      startTime: Date.now(),
      endTime: null,
      data: new Map(),
      metadata: {
        created: new Date().toISOString()
      }
    };

    this.metrics.windowsCreated++;
    return window;
  }

  /**
   * Add data to a window
   * @param {Object} window - Target window
   * @param {string} key - Metric key
   * @param {number} value - Metric value
   * @param {Object} metadata - Additional metadata
   */
  addToWindow(window, key, value, metadata) {
    if (!window.data.has(key)) {
      window.data.set(key, {
        values: [],
        metadata: []
      });
    }

    const entry = window.data.get(key);
    entry.values.push(value);
    entry.metadata.push({
      ...metadata,
      timestamp: Date.now()
    });
  }

  /**
   * Check if window should be rotated
   * @returns {boolean} Whether to rotate
   */
  shouldRotateWindow() {
    if (!this.currentWindow) return true;
    
    const windowAge = Date.now() - this.currentWindow.startTime;
    return windowAge >= this.config.windowSize;
  }

  /**
   * Rotate to a new window
   */
  async rotateWindow() {
    const oldWindow = this.currentWindow;
    
    // Create new window
    this.currentWindow = this.createWindow();
    
    // Close old window
    if (oldWindow) {
      oldWindow.endTime = Date.now();
      this.windows.set(oldWindow.id, oldWindow);
      
      // Trim old windows
      this.trimWindows();
      
      // Flush if needed
      if (this.config.autoFlush) {
        await this.flushWindow(oldWindow);
      }
    }

    this.emit('windowRotated', {
      oldWindowId: oldWindow?.id,
      newWindowId: this.currentWindow.id
    });
  }

  /**
   * Trim old windows to maintain max window count
   */
  trimWindows() {
    if (this.windows.size <= this.config.maxWindows) return;

    const sortedWindows = Array.from(this.windows.entries())
      .sort((a, b) => a[1].startTime - b[1].startTime);

    const toRemove = sortedWindows.slice(0, sortedWindows.length - this.config.maxWindows);
    
    for (const [id] of toRemove) {
      this.windows.delete(id);
    }
  }

  /**
   * Aggregate a single window
   * @param {Object} window - Window to aggregate
   * @returns {Object} Aggregated data
   */
  aggregateWindow(window) {
    const aggregated = {
      windowId: window.id,
      startTime: window.startTime,
      endTime: window.endTime || Date.now(),
      duration: (window.endTime || Date.now()) - window.startTime,
      metrics: {}
    };

    for (const [key, data] of window.data.entries()) {
      aggregated.metrics[key] = this.performAggregations(data.values);
      
      // Add metadata summary
      aggregated.metrics[key].metadata = {
        count: data.metadata.length,
        firstSeen: data.metadata[0]?.timestamp,
        lastSeen: data.metadata[data.metadata.length - 1]?.timestamp
      };
    }

    return aggregated;
  }

  /**
   * Perform aggregation functions on values
   * @param {Array<number>} values - Values to aggregate
   * @returns {Object} Aggregation results
   */
  performAggregations(values) {
    if (!values || values.length === 0) {
      return this.getEmptyAggregations();
    }

    const results = {};

    if (this.config.aggregationFunctions.includes('sum')) {
      results.sum = values.reduce((acc, val) => acc + val, 0);
    }

    if (this.config.aggregationFunctions.includes('avg')) {
      results.avg = results.sum !== undefined 
        ? results.sum / values.length 
        : values.reduce((acc, val) => acc + val, 0) / values.length;
    }

    if (this.config.aggregationFunctions.includes('min')) {
      results.min = Math.min(...values);
    }

    if (this.config.aggregationFunctions.includes('max')) {
      results.max = Math.max(...values);
    }

    if (this.config.aggregationFunctions.includes('count')) {
      results.count = values.length;
    }

    if (this.config.aggregationFunctions.includes('p50')) {
      results.p50 = this.percentile(values, 50);
    }

    if (this.config.aggregationFunctions.includes('p95')) {
      results.p95 = this.percentile(values, 95);
    }

    if (this.config.aggregationFunctions.includes('p99')) {
      results.p99 = this.percentile(values, 99);
    }

    return results;
  }

  /**
   * Get empty aggregation results
   * @returns {Object} Empty aggregations
   */
  getEmptyAggregations() {
    const empty = {};
    
    for (const func of this.config.aggregationFunctions) {
      empty[func] = 0;
    }
    
    return empty;
  }

  /**
   * Calculate percentile
   * @param {Array<number>} values - Values array
   * @param {number} percentile - Percentile to calculate
   * @returns {number} Percentile value
   */
  percentile(values, percentile) {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  /**
   * Flush window data - override in subclasses
   * @param {Object} window - Window to flush
   */
  async flushWindow(window) {
    this.metrics.windowsFlushed++;
    this.emit('windowFlushed', { windowId: window.id });
  }

  /**
   * Start automatic flush timer
   */
  startAutoFlush() {
    if (this.flushTimer) return;

    this.flushTimer = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        // Flush completed windows
        const completedWindows = Array.from(this.windows.values())
          .filter(w => w.endTime && !w.flushed);

        for (const window of completedWindows) {
          await this.flushWindow(window);
          window.flushed = true;
        }
      } catch (error) {
        this.emit('error', error);
      }
    }, this.config.flushInterval);
  }

  /**
   * Get aggregator statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    return {
      ...this.metrics,
      isRunning: this.isRunning,
      currentWindowId: this.currentWindow?.id,
      windowCount: this.windows.size,
      config: this.config
    };
  }

  /**
   * Reset aggregator
   */
  async reset() {
    await this.lock.acquire('write', async () => {
      this.windows.clear();
      this.currentWindow = this.createWindow();
      this.metrics = {
        aggregationsPerformed: 0,
        windowsCreated: 1,
        windowsFlushed: 0,
        errors: 0
      };
    });

    this.emit('reset');
  }
}

/**
 * Simple async lock implementation
 */
class AsyncLock {
  constructor() {
    this.locks = new Map();
  }

  async acquire(type, fn) {
    const lockKey = type;
    
    while (this.locks.has(lockKey)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    this.locks.set(lockKey, true);
    
    try {
      return await fn();
    } finally {
      this.locks.delete(lockKey);
    }
  }
}

module.exports = BaseAggregator;