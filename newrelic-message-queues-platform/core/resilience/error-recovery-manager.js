/**
 * Error Recovery Manager
 * 
 * Comprehensive error handling and recovery strategies
 */

const { EventEmitter } = require('events');
const { factory: circuitBreakerFactory } = require('./circuit-breaker');
const debug = require('debug')('platform:error-recovery');
const chalk = require('chalk');

class ErrorRecoveryManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      retryBackoff: options.retryBackoff || 2,
      enableMetrics: options.enableMetrics !== false,
      enableHealthChecks: options.enableHealthChecks !== false,
      healthCheckInterval: options.healthCheckInterval || 30000,
      maxConcurrentRecoveries: options.maxConcurrentRecoveries || 5,
      ...options
    };
    
    // Component registry
    this.components = new Map();
    
    // Recovery strategies
    this.strategies = new Map([
      ['retry', this.retryStrategy.bind(this)],
      ['circuit-breaker', this.circuitBreakerStrategy.bind(this)],
      ['fallback', this.fallbackStrategy.bind(this)],
      ['cache', this.cacheStrategy.bind(this)],
      ['degrade', this.degradeStrategy.bind(this)]
    ]);
    
    // Recovery queue
    this.recoveryQueue = [];
    this.activeRecoveries = 0;
    
    // Metrics
    this.metrics = {
      totalErrors: 0,
      totalRecoveries: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      componentErrors: new Map(),
      strategyUsage: new Map()
    };
    
    // Health check interval
    if (this.options.enableHealthChecks) {
      this.startHealthChecks();
    }
    
    debug('Error Recovery Manager initialized');
  }

  /**
   * Register a component for error recovery
   */
  registerComponent(name, component, config = {}) {
    const componentConfig = {
      name,
      component,
      type: config.type || 'generic',
      critical: config.critical || false,
      healthCheck: config.healthCheck || null,
      recoveryStrategies: config.recoveryStrategies || ['retry', 'circuit-breaker'],
      circuitBreakerConfig: config.circuitBreakerConfig || {},
      retryConfig: config.retryConfig || {},
      fallbackConfig: config.fallbackConfig || {},
      ...config
    };
    
    // Create circuit breaker for component
    if (componentConfig.recoveryStrategies.includes('circuit-breaker')) {
      componentConfig.circuitBreaker = circuitBreakerFactory.create(
        `${name}-circuit-breaker`,
        componentConfig.circuitBreakerConfig
      );
      
      // Set up circuit breaker event handlers
      this.setupCircuitBreakerHandlers(name, componentConfig.circuitBreaker);
    }
    
    this.components.set(name, componentConfig);
    this.metrics.componentErrors.set(name, 0);
    
    debug(`Registered component: ${name} (${componentConfig.type})`);
    
    this.emit('component.registered', {
      name,
      type: componentConfig.type,
      critical: componentConfig.critical
    });
  }

  /**
   * Execute a function with error recovery
   */
  async executeWithRecovery(componentName, fn, options = {}) {
    const component = this.components.get(componentName);
    if (!component) {
      throw new Error(`Component '${componentName}' not registered`);
    }
    
    const executionOptions = {
      ...component,
      ...options,
      attempt: 0,
      startTime: Date.now()
    };
    
    try {
      // Try circuit breaker strategy first if available
      if (component.circuitBreaker) {
        return await component.circuitBreaker.execute(fn, async (error) => {
          // Circuit is open, try other strategies
          return await this.handleError(error, executionOptions);
        });
      } else {
        // Direct execution
        return await fn();
      }
    } catch (error) {
      return await this.handleError(error, executionOptions);
    }
  }

  /**
   * Handle error with recovery strategies
   */
  async handleError(error, options) {
    this.metrics.totalErrors++;
    this.metrics.componentErrors.set(
      options.name,
      (this.metrics.componentErrors.get(options.name) || 0) + 1
    );
    
    this.emit('error', {
      component: options.name,
      error: error.message,
      attempt: options.attempt,
      timestamp: Date.now()
    });
    
    // Log error
    console.error(chalk.red(`❌ Error in ${options.name}:`), error.message);
    
    // Queue recovery if needed
    if (this.activeRecoveries >= this.options.maxConcurrentRecoveries) {
      return await this.queueRecovery(error, options);
    }
    
    // Try recovery strategies
    for (const strategyName of options.recoveryStrategies) {
      const strategy = this.strategies.get(strategyName);
      if (strategy) {
        try {
          this.activeRecoveries++;
          this.metrics.strategyUsage.set(
            strategyName,
            (this.metrics.strategyUsage.get(strategyName) || 0) + 1
          );
          
          const result = await strategy(error, options);
          
          this.activeRecoveries--;
          this.metrics.totalRecoveries++;
          this.metrics.successfulRecoveries++;
          
          this.emit('recovery.success', {
            component: options.name,
            strategy: strategyName,
            duration: Date.now() - options.startTime
          });
          
          // Process queued recoveries
          this.processRecoveryQueue();
          
          return result;
        } catch (strategyError) {
          this.activeRecoveries--;
          debug(`Strategy '${strategyName}' failed:`, strategyError.message);
        }
      }
    }
    
    // All strategies failed
    this.metrics.failedRecoveries++;
    this.emit('recovery.failed', {
      component: options.name,
      error: error.message,
      duration: Date.now() - options.startTime
    });
    
    // Process queued recoveries
    this.processRecoveryQueue();
    
    // If component is critical, escalate
    if (options.critical) {
      this.escalateError(error, options);
    }
    
    throw error;
  }

  /**
   * Retry strategy
   */
  async retryStrategy(error, options) {
    const maxRetries = options.retryConfig?.maxRetries || this.options.maxRetries;
    const retryDelay = options.retryConfig?.retryDelay || this.options.retryDelay;
    const backoff = options.retryConfig?.backoff || this.options.retryBackoff;
    
    if (options.attempt >= maxRetries) {
      throw new Error(`Max retries (${maxRetries}) exceeded`);
    }
    
    // Calculate delay with exponential backoff
    const delay = retryDelay * Math.pow(backoff, options.attempt);
    
    console.log(chalk.yellow(`⏳ Retrying ${options.name} in ${delay}ms (attempt ${options.attempt + 1}/${maxRetries})`));
    
    await this.sleep(delay);
    
    // Increment attempt counter
    options.attempt++;
    
    // Retry the original function
    try {
      if (options.fn) {
        return await options.fn();
      } else {
        throw new Error('No function to retry');
      }
    } catch (retryError) {
      // Recursively handle the error
      return await this.handleError(retryError, options);
    }
  }

  /**
   * Circuit breaker strategy
   */
  async circuitBreakerStrategy(error, options) {
    // This is handled by the circuit breaker itself
    // Just propagate the error
    throw error;
  }

  /**
   * Fallback strategy
   */
  async fallbackStrategy(error, options) {
    if (!options.fallback) {
      throw new Error('No fallback function provided');
    }
    
    console.log(chalk.yellow(`🔄 Using fallback for ${options.name}`));
    
    try {
      return await options.fallback(error);
    } catch (fallbackError) {
      throw new Error(`Fallback failed: ${fallbackError.message}`);
    }
  }

  /**
   * Cache strategy
   */
  async cacheStrategy(error, options) {
    if (!options.cache || !options.cacheKey) {
      throw new Error('Cache not configured');
    }
    
    const cachedValue = options.cache.get(options.cacheKey);
    if (cachedValue) {
      console.log(chalk.yellow(`📦 Using cached value for ${options.name}`));
      return cachedValue;
    }
    
    throw new Error('No cached value available');
  }

  /**
   * Degrade strategy
   */
  async degradeStrategy(error, options) {
    if (!options.degradedMode) {
      throw new Error('No degraded mode function provided');
    }
    
    console.log(chalk.yellow(`⚠️  Running ${options.name} in degraded mode`));
    
    try {
      return await options.degradedMode(error);
    } catch (degradeError) {
      throw new Error(`Degraded mode failed: ${degradeError.message}`);
    }
  }

  /**
   * Queue recovery for later processing
   */
  async queueRecovery(error, options) {
    return new Promise((resolve, reject) => {
      this.recoveryQueue.push({
        error,
        options,
        resolve,
        reject,
        queuedAt: Date.now()
      });
      
      debug(`Queued recovery for ${options.name} (queue size: ${this.recoveryQueue.length})`);
    });
  }

  /**
   * Process recovery queue
   */
  async processRecoveryQueue() {
    while (this.recoveryQueue.length > 0 && this.activeRecoveries < this.options.maxConcurrentRecoveries) {
      const recovery = this.recoveryQueue.shift();
      
      try {
        const result = await this.handleError(recovery.error, recovery.options);
        recovery.resolve(result);
      } catch (error) {
        recovery.reject(error);
      }
    }
  }

  /**
   * Escalate critical errors
   */
  escalateError(error, options) {
    console.error(chalk.red.bold(`🚨 CRITICAL ERROR in ${options.name}:`), error.message);
    
    this.emit('critical.error', {
      component: options.name,
      error: error.message,
      timestamp: Date.now()
    });
    
    // In production, this would:
    // - Send alerts (PagerDuty, email, Slack)
    // - Create incident tickets
    // - Trigger automated remediation
  }

  /**
   * Start health checks
   */
  startHealthChecks() {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.options.healthCheckInterval);
    
    debug('Health checks started');
  }

  /**
   * Perform health checks on all components
   */
  async performHealthChecks() {
    const healthStatus = {
      healthy: [],
      unhealthy: [],
      timestamp: Date.now()
    };
    
    for (const [name, component] of this.components) {
      if (component.healthCheck) {
        try {
          const isHealthy = await component.healthCheck();
          if (isHealthy) {
            healthStatus.healthy.push(name);
          } else {
            healthStatus.unhealthy.push(name);
          }
        } catch (error) {
          healthStatus.unhealthy.push(name);
          debug(`Health check failed for ${name}:`, error.message);
        }
      }
    }
    
    // Emit health status
    this.emit('health.check', healthStatus);
    
    // Check for degraded system health
    if (healthStatus.unhealthy.length > 0) {
      const criticalUnhealthy = healthStatus.unhealthy.filter(name => {
        const component = this.components.get(name);
        return component && component.critical;
      });
      
      if (criticalUnhealthy.length > 0) {
        this.emit('system.degraded', {
          critical: criticalUnhealthy,
          unhealthy: healthStatus.unhealthy
        });
      }
    }
    
    return healthStatus;
  }

  /**
   * Get component health
   */
  getComponentHealth(componentName) {
    const component = this.components.get(componentName);
    if (!component) return null;
    
    const errors = this.metrics.componentErrors.get(componentName) || 0;
    const circuitBreakerHealth = component.circuitBreaker 
      ? component.circuitBreaker.health()
      : null;
    
    return {
      name: componentName,
      type: component.type,
      critical: component.critical,
      errors,
      circuitBreaker: circuitBreakerHealth,
      healthy: circuitBreakerHealth ? circuitBreakerHealth.healthy : errors === 0
    };
  }

  /**
   * Get system health
   */
  getSystemHealth() {
    const components = Array.from(this.components.keys());
    const componentHealth = components.map(name => this.getComponentHealth(name));
    
    const healthy = componentHealth.filter(c => c.healthy).length;
    const unhealthy = componentHealth.filter(c => !c.healthy).length;
    const criticalUnhealthy = componentHealth.filter(c => !c.healthy && c.critical).length;
    
    return {
      status: criticalUnhealthy > 0 ? 'CRITICAL' : unhealthy > 0 ? 'DEGRADED' : 'HEALTHY',
      components: {
        total: components.length,
        healthy,
        unhealthy,
        criticalUnhealthy
      },
      metrics: this.getMetrics(),
      componentHealth,
      circuitBreakers: circuitBreakerFactory.health()
    };
  }

  /**
   * Get recovery metrics
   */
  getMetrics() {
    const successRate = this.metrics.totalRecoveries > 0
      ? (this.metrics.successfulRecoveries / this.metrics.totalRecoveries) * 100
      : 0;
    
    return {
      ...this.metrics,
      successRate: successRate.toFixed(2),
      queueSize: this.recoveryQueue.length,
      activeRecoveries: this.activeRecoveries
    };
  }

  /**
   * Get recovery stats
   */
  getRecoveryStats() {
    const stats = {
      strategies: {},
      components: {}
    };
    
    // Strategy usage stats
    this.strategies.forEach((_, name) => {
      const usage = this.metrics.strategyUsage.get(name) || 0;
      stats.strategies[name] = usage;
    });
    
    // Component error stats
    this.components.forEach((component, name) => {
      const errors = this.metrics.componentErrors.get(name) || 0;
      stats.components[name] = {
        errors,
        type: component.type,
        critical: component.critical
      };
    });
    
    return stats;
  }

  /**
   * Reset component errors
   */
  resetComponentErrors(componentName) {
    if (componentName) {
      this.metrics.componentErrors.set(componentName, 0);
      const component = this.components.get(componentName);
      if (component && component.circuitBreaker) {
        component.circuitBreaker.reset();
      }
    } else {
      // Reset all
      this.metrics.componentErrors.clear();
      this.components.forEach(component => {
        if (component.circuitBreaker) {
          component.circuitBreaker.reset();
        }
      });
    }
  }

  /**
   * Setup circuit breaker event handlers
   */
  setupCircuitBreakerHandlers(componentName, circuitBreaker) {
    circuitBreaker.on('open', (event) => {
      this.emit('circuit.opened', {
        component: componentName,
        ...event
      });
    });
    
    circuitBreaker.on('stateChange', (event) => {
      if (event.to === 'CLOSED') {
        this.emit('circuit.closed', {
          component: componentName,
          ...event
        });
      }
    });
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown
   */
  shutdown() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Reset all circuit breakers
    circuitBreakerFactory.resetAll();
    
    debug('Error Recovery Manager shut down');
  }
}

module.exports = ErrorRecoveryManager;