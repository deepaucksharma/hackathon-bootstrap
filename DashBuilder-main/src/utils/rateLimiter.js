/**
 * Rate Limiter utility for DashBuilder
 * Prevents API rate limit violations
 */

const pLimit = require('p-limit');
const logger = require('./logger');

class RateLimiter {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 5;
    this.interval = options.interval || 1000; // 1 second
    this.maxPerInterval = options.maxPerInterval || 10;
    
    // Create p-limit instance for concurrency control
    this.limit = pLimit(this.concurrency);
    
    // Track requests per interval
    this.requests = [];
    this.waitQueue = [];
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.interval);
  }

  /**
   * Execute function with rate limiting
   */
  async execute(fn, ...args) {
    // Wait if we've hit the rate limit
    await this.waitForSlot();
    
    // Track this request
    this.requests.push(Date.now());
    
    // Execute with concurrency limit
    return this.limit(async () => {
      try {
        const result = await fn(...args);
        logger.verbose('Rate limiter: Request completed');
        return result;
      } catch (error) {
        logger.error('Rate limiter: Request failed', error);
        throw error;
      }
    });
  }

  /**
   * Wait for available slot
   */
  async waitForSlot() {
    const now = Date.now();
    const cutoff = now - this.interval;
    
    // Remove old requests
    this.requests = this.requests.filter(time => time > cutoff);
    
    // Check if we're at the limit
    if (this.requests.length >= this.maxPerInterval) {
      const oldestRequest = this.requests[0];
      const waitTime = this.interval - (now - oldestRequest) + 100; // Add 100ms buffer
      
      if (waitTime > 0) {
        logger.verbose(`Rate limiter: Waiting ${waitTime}ms`);
        await this.delay(waitTime);
        // Recursive call to re-check
        return this.waitForSlot();
      }
    }
  }

  /**
   * Batch execute with rate limiting
   */
  async batchExecute(items, fn) {
    const results = [];
    const errors = [];
    
    logger.info(`Rate limiter: Processing ${items.length} items`);
    
    const promises = items.map((item, index) => 
      this.execute(fn, item, index)
        .then(result => {
          results[index] = result;
        })
        .catch(error => {
          errors.push({ index, item, error });
        })
    );
    
    await Promise.all(promises);
    
    if (errors.length > 0) {
      logger.warn(`Rate limiter: ${errors.length} items failed`);
    }
    
    return { results, errors };
  }

  /**
   * Create a rate-limited function
   */
  wrap(fn) {
    return (...args) => this.execute(fn, ...args);
  }

  /**
   * Create a throttled function
   */
  throttle(fn, wait) {
    let lastCall = 0;
    
    return async (...args) => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCall;
      
      if (timeSinceLastCall < wait) {
        await this.delay(wait - timeSinceLastCall);
      }
      
      lastCall = Date.now();
      return fn(...args);
    };
  }

  /**
   * Create a debounced function
   */
  debounce(fn, wait) {
    let timeout;
    
    return (...args) => {
      clearTimeout(timeout);
      
      return new Promise((resolve) => {
        timeout = setTimeout(() => {
          resolve(fn(...args));
        }, wait);
      });
    };
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up old requests
   */
  cleanup() {
    const cutoff = Date.now() - this.interval;
    this.requests = this.requests.filter(time => time > cutoff);
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      activeRequests: this.limit.activeCount,
      pendingRequests: this.limit.pendingCount,
      recentRequests: this.requests.length,
      concurrency: this.concurrency,
      maxPerInterval: this.maxPerInterval,
      interval: this.interval
    };
  }

  /**
   * Update settings
   */
  updateSettings(options) {
    if (options.concurrency !== undefined) {
      this.concurrency = options.concurrency;
      this.limit = pLimit(this.concurrency);
    }
    
    if (options.maxPerInterval !== undefined) {
      this.maxPerInterval = options.maxPerInterval;
    }
    
    if (options.interval !== undefined) {
      this.interval = options.interval;
      // Restart cleanup interval
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, this.interval);
    }
  }

  /**
   * Reset rate limiter
   */
  reset() {
    this.requests = [];
    this.waitQueue = [];
    logger.verbose('Rate limiter reset');
  }

  /**
   * Destroy rate limiter
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.reset();
  }
}

// Export both class and factory function
module.exports = {
  RateLimiter,
  create: (options) => new RateLimiter(options),
  // Common presets
  presets: {
    standard: { concurrency: 5, maxPerInterval: 10, interval: 1000 },
    aggressive: { concurrency: 10, maxPerInterval: 20, interval: 1000 },
    conservative: { concurrency: 2, maxPerInterval: 5, interval: 1000 },
    newRelic: { concurrency: 3, maxPerInterval: 30, interval: 60000 } // New Relic API limits
  },
  
  // Create with preset
  createWithPreset: (presetName) => {
    const preset = module.exports.presets[presetName] || module.exports.presets.standard;
    return new RateLimiter(preset);
  }
};