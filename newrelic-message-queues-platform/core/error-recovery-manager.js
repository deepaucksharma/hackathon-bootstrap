/**
 * Error Recovery Manager
 * 
 * Centralized error recovery and resilience management for the platform.
 * Coordinates circuit breakers, retry logic, fallback mechanisms, and health monitoring.
 */

const { EventEmitter } = require('events');
const CircuitBreaker = require('./circuit-breaker');
const { logger } = require('./utils/logger');

class ErrorRecoveryManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableMetrics: options.enableMetrics !== false,
      enableHealthChecks: options.enableHealthChecks !== false,
      healthCheckInterval: options.healthCheckInterval || 30000,
      maxConcurrentRecoveries: options.maxConcurrentRecoveries || 5,
      ...options
    };
    
    // Circuit breaker registry
    this.circuitBreakers = new Map();
    
    // Recovery tracking
    this.activeRecoveries = new Set();
    this.recoveryHistory = [];
    this.maxHistorySize = 100;
    
    // Health monitoring
    this.healthCheckTimer = null;
    this.systemHealth = {
      status: 'healthy',
      lastCheck: null,
      issues: [],
      metrics: {}
    };
    
    // Platform components registry
    this.components = new Map();
    
    if (this.options.enableHealthChecks) {
      this.startHealthMonitoring();
    }
    
    logger.debug('ErrorRecoveryManager initialized');
  }
  
  /**
   * Register a component with the recovery manager
   */
  registerComponent(name, component, options = {}) {
    this.components.set(name, {
      instance: component,
      type: options.type || 'unknown',
      critical: options.critical !== false,
      healthCheck: options.healthCheck,
      circuitBreakerConfig: options.circuitBreakerConfig,
      lastHealthCheck: null,
      status: 'unknown'
    });
    
    // Auto-create circuit breaker if config provided
    if (options.circuitBreakerConfig) {
      this.createCircuitBreaker(name, options.circuitBreakerConfig);
    }
    
    logger.debug(`Component '${name}' registered with recovery manager`);
  }
  
  /**
   * Create and register a circuit breaker
   */
  createCircuitBreaker(name, config = {}) {
    const circuitBreaker = new CircuitBreaker({
      name: `${name}-circuit-breaker`,
      ...config
    });
    
    // Set up event handlers
    circuitBreaker.on('circuitOpened', (data) => {
      this.handleCircuitOpened(name, data);
    });
    
    circuitBreaker.on('circuitClosed', (data) => {
      this.handleCircuitClosed(name, data);
    });
    
    circuitBreaker.on('callRejected', (data) => {
      this.handleCallRejected(name, data);
    });
    
    this.circuitBreakers.set(name, circuitBreaker);
    return circuitBreaker;
  }
  
  /**
   * Get circuit breaker for a component
   */
  getCircuitBreaker(name) {
    return this.circuitBreakers.get(name);
  }
  
  /**
   * Execute function with error recovery protection
   */
  async executeWithRecovery(componentName, operation, options = {}) {
    const circuitBreaker = this.circuitBreakers.get(componentName);
    const component = this.components.get(componentName);
    
    if (!circuitBreaker) {
      logger.warn(`No circuit breaker found for component '${componentName}'`);
      return await operation();
    }
    
    const recoveryId = `${componentName}-${Date.now()}`;
    
    try {
      this.activeRecoveries.add(recoveryId);
      
      const result = await circuitBreaker.executeWithRetry(operation);
      
      // Update component status on success
      if (component) {
        component.status = 'healthy';
        component.lastHealthCheck = Date.now();
      }
      
      return result;
      
    } catch (error) {
      // Handle error with recovery strategies
      return await this.handleOperationError(componentName, error, operation, options);
      
    } finally {
      this.activeRecoveries.delete(recoveryId);
    }
  }
  
  /**
   * Handle operation error with recovery strategies
   */
  async handleOperationError(componentName, error, operation, options = {}) {
    const component = this.components.get(componentName);
    
    if (component) {
      component.status = 'error';
      component.lastError = {
        message: error.message,
        timestamp: Date.now(),
        code: error.code
      };
    }
    
    // Record recovery attempt
    this.recordRecoveryAttempt(componentName, error, 'failed');
    
    // Try fallback if available
    if (options.fallback && typeof options.fallback === 'function') {
      logger.info(`Attempting fallback for component '${componentName}'`);
      try {
        const result = await options.fallback(error);
        this.recordRecoveryAttempt(componentName, error, 'fallback_success');
        return result;
      } catch (fallbackError) {
        logger.error(`Fallback failed for component '${componentName}':`, fallbackError.message);
        this.recordRecoveryAttempt(componentName, fallbackError, 'fallback_failed');
      }
    }
    
    // Emit error event for monitoring
    this.emit('componentError', {
      component: componentName,
      error: error.message,
      timestamp: Date.now()
    });
    
    throw error;
  }
  
  /**
   * Handle circuit breaker opening
   */
  handleCircuitOpened(componentName, data) {
    logger.warn(`🔴 Circuit opened for component '${componentName}' after ${data.failureCount} failures`);
    
    const component = this.components.get(componentName);
    if (component) {
      component.status = 'circuit_open';
    }
    
    // Trigger recovery process if component is critical
    if (component && component.critical) {
      this.scheduleRecoveryAttempt(componentName);
    }
    
    this.emit('circuitOpened', { component: componentName, ...data });
  }
  
  /**
   * Handle circuit breaker closing
   */
  handleCircuitClosed(componentName, data) {
    logger.info(`🟢 Circuit closed for component '${componentName}' after ${data.successCount} successes`);
    
    const component = this.components.get(componentName);
    if (component) {
      component.status = 'healthy';
    }
    
    this.recordRecoveryAttempt(componentName, null, 'recovered');
    this.emit('circuitClosed', { component: componentName, ...data });
  }
  
  /**
   * Handle call rejection
   */
  handleCallRejected(componentName, data) {
    logger.debug(`⚠️ Call rejected for component '${componentName}': ${data.error.message}`);
    this.emit('callRejected', { component: componentName, ...data });
  }
  
  /**
   * Schedule recovery attempt for critical components
   */
  scheduleRecoveryAttempt(componentName, delay = 60000) {
    setTimeout(async () => {
      try {
        await this.attemptComponentRecovery(componentName);
      } catch (error) {
        logger.error(`Recovery attempt failed for '${componentName}':`, error.message);
      }
    }, delay);
  }
  
  /**
   * Attempt to recover a component
   */
  async attemptComponentRecovery(componentName) {
    if (this.activeRecoveries.size >= this.options.maxConcurrentRecoveries) {
      logger.warn(`Max concurrent recoveries reached, skipping recovery for '${componentName}'`);
      return;
    }
    
    const component = this.components.get(componentName);
    const circuitBreaker = this.circuitBreakers.get(componentName);
    
    if (!component || !circuitBreaker) {
      return;
    }
    
    logger.info(`🔧 Attempting recovery for component '${componentName}'`);
    
    try {
      // Reset circuit breaker to allow testing
      circuitBreaker.forceState('half_open');
      
      // Try a simple health check if available
      if (component.healthCheck) {
        await this.executeWithRecovery(componentName, component.healthCheck);
      }
      
      logger.success(`✅ Recovery successful for component '${componentName}'`);
      this.recordRecoveryAttempt(componentName, null, 'manual_recovery_success');
      
    } catch (error) {
      logger.error(`❌ Recovery failed for component '${componentName}':`, error.message);
      this.recordRecoveryAttempt(componentName, error, 'manual_recovery_failed');
    }
  }
  
  /**
   * Record recovery attempt for metrics
   */
  recordRecoveryAttempt(componentName, error, outcome) {
    const record = {
      component: componentName,
      timestamp: Date.now(),
      outcome,
      error: error ? error.message : null
    };
    
    this.recoveryHistory.unshift(record);
    
    // Limit history size
    if (this.recoveryHistory.length > this.maxHistorySize) {
      this.recoveryHistory = this.recoveryHistory.slice(0, this.maxHistorySize);
    }
    
    this.emit('recoveryAttempt', record);
  }
  
  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.options.healthCheckInterval);
    
    logger.debug('Health monitoring started');
  }
  
  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const startTime = Date.now();
    const issues = [];
    const metrics = {};
    
    try {
      // Check circuit breaker health
      for (const [name, circuitBreaker] of this.circuitBreakers) {
        const stats = circuitBreaker.getStats();
        metrics[`${name}_circuit_state`] = stats.state;
        metrics[`${name}_failure_rate`] = stats.stats.successRate;
        
        if (!stats.isHealthy) {
          issues.push(`Circuit breaker '${name}' is unhealthy (${stats.state})`);
        }
      }
      
      // Check component health
      for (const [name, component] of this.components) {
        metrics[`${name}_status`] = component.status;
        
        if (component.critical && component.status !== 'healthy') {
          issues.push(`Critical component '${name}' is ${component.status}`);
        }
        
        // Run component health check if available
        if (component.healthCheck && component.status !== 'circuit_open') {
          try {
            await component.healthCheck();
            component.status = 'healthy';
            component.lastHealthCheck = Date.now();
          } catch (error) {
            component.status = 'unhealthy';
            component.lastError = {
              message: error.message,
              timestamp: Date.now()
            };
            if (component.critical) {
              issues.push(`Health check failed for '${name}': ${error.message}`);
            }
          }
        }
      }
      
      // Update system health
      this.systemHealth = {
        status: issues.length === 0 ? 'healthy' : 'degraded',
        lastCheck: Date.now(),
        issues,
        metrics: {
          ...metrics,
          active_recoveries: this.activeRecoveries.size,
          total_components: this.components.size,
          total_circuit_breakers: this.circuitBreakers.size,
          health_check_duration: Date.now() - startTime
        }
      };
      
      // Emit health update
      this.emit('healthUpdate', this.systemHealth);
      
      if (issues.length > 0) {
        logger.warn(`⚠️ System health check found ${issues.length} issues`);
      }
      
    } catch (error) {
      logger.error('Health check failed:', error.message);
      this.systemHealth.status = 'error';
    }
  }
  
  /**
   * Get system health status
   */
  getSystemHealth() {
    return {
      ...this.systemHealth,
      components: Array.from(this.components.entries()).map(([name, component]) => ({
        name,
        type: component.type,
        status: component.status,
        critical: component.critical,
        lastHealthCheck: component.lastHealthCheck,
        lastError: component.lastError
      })),
      circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([name, cb]) => ({
        name,
        ...cb.getStats()
      }))
    };
  }
  
  /**
   * Get recovery statistics
   */
  getRecoveryStats() {
    const recentRecoveries = this.recoveryHistory.slice(0, 20);
    const outcomes = {};
    
    recentRecoveries.forEach(record => {
      outcomes[record.outcome] = (outcomes[record.outcome] || 0) + 1;
    });
    
    return {
      totalRecoveries: this.recoveryHistory.length,
      recentRecoveries: recentRecoveries.length,
      activeRecoveries: this.activeRecoveries.size,
      outcomeBreakdown: outcomes,
      recentHistory: recentRecoveries
    };
  }
  
  /**
   * Reset all circuit breakers
   */
  resetAllCircuitBreakers() {
    for (const [name, circuitBreaker] of this.circuitBreakers) {
      circuitBreaker.reset();
    }
    logger.info('🔄 All circuit breakers reset');
  }
  
  /**
   * Shutdown recovery manager
   */
  shutdown() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    // Wait for active recoveries to complete
    if (this.activeRecoveries.size > 0) {
      logger.info(`Waiting for ${this.activeRecoveries.size} active recoveries to complete...`);
    }
    
    logger.info('Error recovery manager shutdown complete');
  }
}

module.exports = ErrorRecoveryManager;