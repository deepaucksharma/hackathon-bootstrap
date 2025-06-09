/**
 * Circuit Breaker Pattern Implementation
 * 
 * Provides fault tolerance and error recovery for external service calls
 */

const { EventEmitter } = require('events');
const debug = require('debug')('platform:circuit-breaker');

class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.name = options.name || 'unnamed';
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 30000; // 30 seconds
    this.retryDelay = options.retryDelay || 5000; // 5 seconds
    this.maxRetries = options.maxRetries || 3;
    this.monitoringWindow = options.monitoringWindow || 60000; // 1 minute
    
    // Circuit states
    this.states = {
      CLOSED: 'closed',     // Normal operation
      OPEN: 'open',         // Failing fast
      HALF_OPEN: 'half_open' // Testing if service recovered
    };
    
    this.state = this.states.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    
    // Monitoring
    this.stats = {
      totalCalls: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      totalTimeouts: 0,
      totalCircuitOpens: 0,
      totalCircuitCloses: 0,
      averageResponseTime: 0,
      lastError: null,
      startTime: Date.now()
    };
    
    // Recent call history for monitoring window
    this.callHistory = [];
    
    debug(`Circuit breaker '${this.name}' initialized`);
  }
  
  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn, ...args) {
    this.stats.totalCalls++;
    this.cleanupCallHistory();
    
    // Check if circuit is open
    if (this.state === this.states.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        const error = new Error(`Circuit breaker '${this.name}' is OPEN. Next attempt at ${new Date(this.nextAttemptTime).toISOString()}`);
        error.code = 'CIRCUIT_BREAKER_OPEN';
        this.emit('callRejected', { error, state: this.state });
        throw error;
      } else {
        // Move to half-open to test
        this.setState(this.states.HALF_OPEN);
      }
    }
    
    const startTime = Date.now();
    let callResult;
    
    try {
      // Execute with timeout
      callResult = await Promise.race([
        fn(...args),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Timeout after ${this.timeout}ms`)), this.timeout)
        )
      ]);
      
      // Success
      this.onSuccess(Date.now() - startTime);
      return callResult;
      
    } catch (error) {
      // Failure
      this.onFailure(error, Date.now() - startTime);
      throw error;
    }
  }
  
  /**
   * Execute with retry logic
   */
  async executeWithRetry(fn, ...args) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.execute(fn, ...args);
      } catch (error) {
        lastError = error;
        
        // Don't retry if circuit is open
        if (error.code === 'CIRCUIT_BREAKER_OPEN') {
          break;
        }
        
        // Don't retry on last attempt
        if (attempt === this.maxRetries) {
          break;
        }
        
        // Wait before retry
        await this.delay(this.retryDelay * attempt);
        debug(`Retrying ${this.name} (attempt ${attempt + 1}/${this.maxRetries})`);
        this.emit('retry', { attempt: attempt + 1, error });
      }
    }
    
    throw lastError;
  }
  
  onSuccess(responseTime) {
    this.successCount++;
    this.stats.totalSuccesses++;
    this.recordCall({ success: true, responseTime, timestamp: Date.now() });
    this.updateAverageResponseTime(responseTime);
    
    debug(`${this.name} call succeeded in ${responseTime}ms`);
    
    if (this.state === this.states.HALF_OPEN) {
      if (this.successCount >= this.successThreshold) {
        this.setState(this.states.CLOSED);
        this.resetCounts();
      }
    } else if (this.state === this.states.CLOSED) {
      // Reset failure count on success
      this.failureCount = 0;
    }
    
    this.emit('success', { responseTime, state: this.state });
  }
  
  onFailure(error, responseTime) {
    this.failureCount++;
    this.stats.totalFailures++;
    this.stats.lastError = {
      message: error.message,
      code: error.code,
      timestamp: Date.now()
    };
    
    if (error.message.includes('Timeout')) {
      this.stats.totalTimeouts++;
    }
    
    this.lastFailureTime = Date.now();
    this.recordCall({ success: false, error: error.message, responseTime, timestamp: Date.now() });
    
    debug(`${this.name} call failed: ${error.message} (${responseTime}ms)`);
    
    if (this.state === this.states.HALF_OPEN) {
      // Any failure in half-open immediately opens circuit
      this.setState(this.states.OPEN);
      this.scheduleNextAttempt();
    } else if (this.state === this.states.CLOSED) {
      if (this.failureCount >= this.failureThreshold) {
        this.setState(this.states.OPEN);
        this.scheduleNextAttempt();
      }
    }
    
    this.emit('failure', { error, responseTime, state: this.state });
  }
  
  setState(newState) {
    const previousState = this.state;
    this.state = newState;
    
    if (newState === this.states.OPEN && previousState !== this.states.OPEN) {
      this.stats.totalCircuitOpens++;
      debug(`Circuit breaker '${this.name}' opened`);
      this.emit('circuitOpened', { failureCount: this.failureCount });
    } else if (newState === this.states.CLOSED && previousState !== this.states.CLOSED) {
      this.stats.totalCircuitCloses++;
      debug(`Circuit breaker '${this.name}' closed`);
      this.emit('circuitClosed', { successCount: this.successCount });
    } else if (newState === this.states.HALF_OPEN) {
      debug(`Circuit breaker '${this.name}' half-open`);
      this.emit('circuitHalfOpen');
    }
  }
  
  scheduleNextAttempt() {
    this.nextAttemptTime = Date.now() + this.retryDelay;
    debug(`Next attempt for '${this.name}' scheduled at ${new Date(this.nextAttemptTime).toISOString()}`);
  }
  
  resetCounts() {
    this.failureCount = 0;
    this.successCount = 0;
  }
  
  recordCall(callData) {
    this.callHistory.push(callData);
  }
  
  cleanupCallHistory() {
    const cutoff = Date.now() - this.monitoringWindow;
    this.callHistory = this.callHistory.filter(call => call.timestamp > cutoff);
  }
  
  updateAverageResponseTime(responseTime) {
    const totalCalls = this.stats.totalSuccesses + this.stats.totalFailures;
    this.stats.averageResponseTime = ((this.stats.averageResponseTime * (totalCalls - 1)) + responseTime) / totalCalls;
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get current circuit breaker statistics
   */
  getStats() {
    const uptime = Date.now() - this.stats.startTime;
    const recentCalls = this.callHistory.length;
    const recentFailures = this.callHistory.filter(c => !c.success).length;
    const recentSuccessRate = recentCalls > 0 ? ((recentCalls - recentFailures) / recentCalls) * 100 : 0;
    
    return {
      name: this.name,
      state: this.state,
      uptime: uptime,
      currentCounts: {
        failures: this.failureCount,
        successes: this.successCount
      },
      thresholds: {
        failure: this.failureThreshold,
        success: this.successThreshold
      },
      stats: {
        ...this.stats,
        averageResponseTime: Math.round(this.stats.averageResponseTime),
        successRate: this.stats.totalCalls > 0 ? 
          ((this.stats.totalSuccesses / this.stats.totalCalls) * 100).toFixed(2) : 0
      },
      recent: {
        calls: recentCalls,
        failures: recentFailures,
        successRate: recentSuccessRate.toFixed(2)
      },
      nextAttemptTime: this.nextAttemptTime,
      isHealthy: this.state === this.states.CLOSED && this.failureCount < this.failureThreshold
    };
  }
  
  /**
   * Force circuit to specific state (for testing)
   */
  forceState(state) {
    if (Object.values(this.states).includes(state)) {
      this.setState(state);
      if (state === this.states.CLOSED) {
        this.resetCounts();
      }
    }
  }
  
  /**
   * Reset circuit breaker to initial state
   */
  reset() {
    this.setState(this.states.CLOSED);
    this.resetCounts();
    this.nextAttemptTime = null;
    this.lastFailureTime = null;
    this.callHistory = [];
    debug(`Circuit breaker '${this.name}' reset`);
    this.emit('reset');
  }
}

module.exports = CircuitBreaker;