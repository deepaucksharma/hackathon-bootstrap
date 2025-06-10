/**
 * Circuit Breaker Implementation
 * 
 * Provides fault tolerance and resilience for the platform
 */

const { EventEmitter } = require('events');
const debug = require('debug')('platform:circuit-breaker');

class CircuitBreaker extends EventEmitter {
  constructor(name, options = {}) {
    super();
    
    this.name = name;
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      successThreshold: options.successThreshold || 2,
      timeout: options.timeout || 60000, // 60 seconds
      retryTimeout: options.retryTimeout || 30000, // 30 seconds
      volumeThreshold: options.volumeThreshold || 10,
      errorFilter: options.errorFilter || (() => true),
      ...options
    };
    
    // Circuit states
    this.states = {
      CLOSED: 'CLOSED',
      OPEN: 'OPEN',
      HALF_OPEN: 'HALF_OPEN'
    };
    
    // Initialize state
    this.state = this.states.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = Date.now();
    this.requestCount = 0;
    
    // Metrics
    this.metrics = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      totalTimeouts: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      stateChanges: []
    };
    
    debug(`Circuit breaker '${name}' initialized`);
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn, fallback) {
    this.metrics.totalRequests++;
    this.requestCount++;
    
    // Check if circuit is open
    if (this.state === this.states.OPEN) {
      if (Date.now() < this.nextAttempt) {
        return this.handleOpen(fallback);
      }
      // Try half-open
      this.halfOpen();
    }
    
    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      return this.onFailure(error, fallback);
    }
  }

  /**
   * Execute function with timeout
   */
  async executeWithTimeout(fn) {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        this.metrics.totalTimeouts++;
        reject(new Error(`Circuit breaker timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);
      
      try {
        const result = await fn();
        clearTimeout(timer);
        resolve(result);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * Handle successful execution
   */
  onSuccess() {
    this.failures = 0;
    this.metrics.totalSuccesses++;
    this.metrics.consecutiveSuccesses++;
    this.metrics.consecutiveFailures = 0;
    this.metrics.lastSuccessTime = Date.now();
    
    if (this.state === this.states.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.options.successThreshold) {
        this.close();
      }
    }
    
    this.emit('success', {
      circuit: this.name,
      state: this.state,
      metrics: this.getMetrics()
    });
  }

  /**
   * Handle failed execution
   */
  onFailure(error, fallback) {
    this.successes = 0;
    this.metrics.totalFailures++;
    this.metrics.consecutiveFailures++;
    this.metrics.consecutiveSuccesses = 0;
    this.metrics.lastFailureTime = Date.now();
    
    // Check if error should trip the circuit
    if (!this.options.errorFilter(error)) {
      // Error doesn't count towards circuit breaker
      if (fallback) {
        return fallback(error);
      }
      throw error;
    }
    
    this.failures++;
    
    if (this.state === this.states.HALF_OPEN || 
        (this.failures >= this.options.failureThreshold && 
         this.requestCount >= this.options.volumeThreshold)) {
      this.open();
    }
    
    this.emit('failure', {
      circuit: this.name,
      state: this.state,
      error: error.message,
      metrics: this.getMetrics()
    });
    
    if (fallback) {
      return fallback(error);
    }
    
    throw error;
  }

  /**
   * Handle open circuit
   */
  handleOpen(fallback) {
    const error = new Error(`Circuit breaker '${this.name}' is OPEN`);
    error.code = 'CIRCUIT_OPEN';
    
    this.emit('reject', {
      circuit: this.name,
      state: this.state,
      metrics: this.getMetrics()
    });
    
    if (fallback) {
      return fallback(error);
    }
    
    throw error;
  }

  /**
   * Transition to CLOSED state
   */
  close() {
    if (this.state === this.states.CLOSED) return;
    
    const previousState = this.state;
    this.state = this.states.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.requestCount = 0;
    
    this.metrics.stateChanges.push({
      from: previousState,
      to: this.states.CLOSED,
      timestamp: Date.now()
    });
    
    this.emit('stateChange', {
      circuit: this.name,
      from: previousState,
      to: this.states.CLOSED,
      metrics: this.getMetrics()
    });
    
    debug(`Circuit '${this.name}' transitioned from ${previousState} to CLOSED`);
  }

  /**
   * Transition to OPEN state
   */
  open() {
    if (this.state === this.states.OPEN) return;
    
    const previousState = this.state;
    this.state = this.states.OPEN;
    this.nextAttempt = Date.now() + this.options.retryTimeout;
    
    this.metrics.stateChanges.push({
      from: previousState,
      to: this.states.OPEN,
      timestamp: Date.now()
    });
    
    this.emit('stateChange', {
      circuit: this.name,
      from: previousState,
      to: this.states.OPEN,
      metrics: this.getMetrics()
    });
    
    this.emit('open', {
      circuit: this.name,
      metrics: this.getMetrics()
    });
    
    debug(`Circuit '${this.name}' transitioned from ${previousState} to OPEN`);
  }

  /**
   * Transition to HALF_OPEN state
   */
  halfOpen() {
    if (this.state === this.states.HALF_OPEN) return;
    
    const previousState = this.state;
    this.state = this.states.HALF_OPEN;
    this.failures = 0;
    this.successes = 0;
    
    this.metrics.stateChanges.push({
      from: previousState,
      to: this.states.HALF_OPEN,
      timestamp: Date.now()
    });
    
    this.emit('stateChange', {
      circuit: this.name,
      from: previousState,
      to: this.states.HALF_OPEN,
      metrics: this.getMetrics()
    });
    
    debug(`Circuit '${this.name}' transitioned from ${previousState} to HALF_OPEN`);
  }

  /**
   * Get current state
   */
  getState() {
    return this.state;
  }

  /**
   * Check if circuit is closed
   */
  isClosed() {
    return this.state === this.states.CLOSED;
  }

  /**
   * Check if circuit is open
   */
  isOpen() {
    return this.state === this.states.OPEN;
  }

  /**
   * Check if circuit is half-open
   */
  isHalfOpen() {
    return this.state === this.states.HALF_OPEN;
  }

  /**
   * Get circuit metrics
   */
  getMetrics() {
    const uptime = this.metrics.stateChanges.length > 0
      ? Date.now() - this.metrics.stateChanges[0].timestamp
      : 0;
      
    const errorRate = this.metrics.totalRequests > 0
      ? (this.metrics.totalFailures / this.metrics.totalRequests) * 100
      : 0;
      
    return {
      ...this.metrics,
      state: this.state,
      uptime,
      errorRate: errorRate.toFixed(2),
      requestsPerMinute: this.calculateRequestRate()
    };
  }

  /**
   * Calculate request rate
   */
  calculateRequestRate() {
    if (this.metrics.stateChanges.length === 0) return 0;
    
    const firstChange = this.metrics.stateChanges[0];
    const durationMinutes = (Date.now() - firstChange.timestamp) / 60000;
    
    return durationMinutes > 0
      ? Math.round(this.metrics.totalRequests / durationMinutes)
      : 0;
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = this.states.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = Date.now();
    this.requestCount = 0;
    
    // Reset metrics but keep history
    this.metrics.consecutiveFailures = 0;
    this.metrics.consecutiveSuccesses = 0;
    
    this.emit('reset', {
      circuit: this.name,
      metrics: this.getMetrics()
    });
    
    debug(`Circuit '${this.name}' has been reset`);
  }

  /**
   * Force circuit to open
   */
  forceOpen() {
    this.open();
  }

  /**
   * Force circuit to close
   */
  forceClose() {
    this.close();
  }

  /**
   * Health check
   */
  health() {
    return {
      name: this.name,
      state: this.state,
      healthy: this.state !== this.states.OPEN,
      metrics: this.getMetrics()
    };
  }
}

/**
 * Circuit Breaker Factory
 */
class CircuitBreakerFactory {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * Create or get a circuit breaker
   */
  create(name, options) {
    if (!this.breakers.has(name)) {
      const breaker = new CircuitBreaker(name, options);
      this.breakers.set(name, breaker);
      debug(`Created new circuit breaker: ${name}`);
    }
    return this.breakers.get(name);
  }

  /**
   * Get a circuit breaker
   */
  get(name) {
    return this.breakers.get(name);
  }

  /**
   * Get all circuit breakers
   */
  getAll() {
    return Array.from(this.breakers.values());
  }

  /**
   * Get health status of all breakers
   */
  health() {
    const breakers = this.getAll();
    const healthy = breakers.filter(b => b.isClosed()).length;
    const unhealthy = breakers.filter(b => !b.isClosed()).length;
    
    return {
      total: breakers.length,
      healthy,
      unhealthy,
      breakers: breakers.map(b => b.health())
    };
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    this.breakers.forEach(breaker => breaker.reset());
  }

  /**
   * Clear all circuit breakers
   */
  clear() {
    this.breakers.clear();
  }
}

// Create singleton factory
const factory = new CircuitBreakerFactory();

module.exports = {
  CircuitBreaker,
  CircuitBreakerFactory,
  factory
};