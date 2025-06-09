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
    
    // Auto-create circuit breaker if component supports it
    if (options.circuitBreakerConfig && component.setupCircuitBreaker) {
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
  handleCircuitClosed(componentName, data) {\n    logger.info(`🟢 Circuit closed for component '${componentName}' after ${data.successCount} successes`);\n    \n    const component = this.components.get(componentName);\n    if (component) {\n      component.status = 'healthy';\n    }\n    \n    this.recordRecoveryAttempt(componentName, null, 'recovered');\n    this.emit('circuitClosed', { component: componentName, ...data });\n  }\n  \n  /**\n   * Handle call rejection\n   */\n  handleCallRejected(componentName, data) {\n    logger.debug(`⚠️ Call rejected for component '${componentName}': ${data.error.message}`);\n    this.emit('callRejected', { component: componentName, ...data });\n  }\n  \n  /**\n   * Schedule recovery attempt for critical components\n   */\n  scheduleRecoveryAttempt(componentName, delay = 60000) {\n    setTimeout(async () => {\n      try {\n        await this.attemptComponentRecovery(componentName);\n      } catch (error) {\n        logger.error(`Recovery attempt failed for '${componentName}':`, error.message);\n      }\n    }, delay);\n  }\n  \n  /**\n   * Attempt to recover a component\n   */\n  async attemptComponentRecovery(componentName) {\n    if (this.activeRecoveries.size >= this.options.maxConcurrentRecoveries) {\n      logger.warn(`Max concurrent recoveries reached, skipping recovery for '${componentName}'`);\n      return;\n    }\n    \n    const component = this.components.get(componentName);\n    const circuitBreaker = this.circuitBreakers.get(componentName);\n    \n    if (!component || !circuitBreaker) {\n      return;\n    }\n    \n    logger.info(`🔧 Attempting recovery for component '${componentName}'`);\n    \n    try {\n      // Reset circuit breaker to allow testing\n      circuitBreaker.forceState('half_open');\n      \n      // Try a simple health check if available\n      if (component.healthCheck) {\n        await this.executeWithRecovery(componentName, component.healthCheck);\n      }\n      \n      logger.success(`✅ Recovery successful for component '${componentName}'`);\n      this.recordRecoveryAttempt(componentName, null, 'manual_recovery_success');\n      \n    } catch (error) {\n      logger.error(`❌ Recovery failed for component '${componentName}':`, error.message);\n      this.recordRecoveryAttempt(componentName, error, 'manual_recovery_failed');\n    }\n  }\n  \n  /**\n   * Record recovery attempt for metrics\n   */\n  recordRecoveryAttempt(componentName, error, outcome) {\n    const record = {\n      component: componentName,\n      timestamp: Date.now(),\n      outcome,\n      error: error ? error.message : null\n    };\n    \n    this.recoveryHistory.unshift(record);\n    \n    // Limit history size\n    if (this.recoveryHistory.length > this.maxHistorySize) {\n      this.recoveryHistory = this.recoveryHistory.slice(0, this.maxHistorySize);\n    }\n    \n    this.emit('recoveryAttempt', record);\n  }\n  \n  /**\n   * Start health monitoring\n   */\n  startHealthMonitoring() {\n    this.healthCheckTimer = setInterval(() => {\n      this.performHealthCheck();\n    }, this.options.healthCheckInterval);\n    \n    logger.debug('Health monitoring started');\n  }\n  \n  /**\n   * Perform comprehensive health check\n   */\n  async performHealthCheck() {\n    const startTime = Date.now();\n    const issues = [];\n    const metrics = {};\n    \n    try {\n      // Check circuit breaker health\n      for (const [name, circuitBreaker] of this.circuitBreakers) {\n        const stats = circuitBreaker.getStats();\n        metrics[`${name}_circuit_state`] = stats.state;\n        metrics[`${name}_failure_rate`] = stats.stats.successRate;\n        \n        if (!stats.isHealthy) {\n          issues.push(`Circuit breaker '${name}' is unhealthy (${stats.state})`);\n        }\n      }\n      \n      // Check component health\n      for (const [name, component] of this.components) {\n        metrics[`${name}_status`] = component.status;\n        \n        if (component.critical && component.status !== 'healthy') {\n          issues.push(`Critical component '${name}' is ${component.status}`);\n        }\n        \n        // Run component health check if available\n        if (component.healthCheck && component.status !== 'circuit_open') {\n          try {\n            await component.healthCheck();\n            component.status = 'healthy';\n            component.lastHealthCheck = Date.now();\n          } catch (error) {\n            component.status = 'unhealthy';\n            component.lastError = {\n              message: error.message,\n              timestamp: Date.now()\n            };\n            if (component.critical) {\n              issues.push(`Health check failed for '${name}': ${error.message}`);\n            }\n          }\n        }\n      }\n      \n      // Update system health\n      this.systemHealth = {\n        status: issues.length === 0 ? 'healthy' : 'degraded',\n        lastCheck: Date.now(),\n        issues,\n        metrics: {\n          ...metrics,\n          active_recoveries: this.activeRecoveries.size,\n          total_components: this.components.size,\n          total_circuit_breakers: this.circuitBreakers.size,\n          health_check_duration: Date.now() - startTime\n        }\n      };\n      \n      // Emit health update\n      this.emit('healthUpdate', this.systemHealth);\n      \n      if (issues.length > 0) {\n        logger.warn(`⚠️ System health check found ${issues.length} issues`);\n      }\n      \n    } catch (error) {\n      logger.error('Health check failed:', error.message);\n      this.systemHealth.status = 'error';\n    }\n  }\n  \n  /**\n   * Get system health status\n   */\n  getSystemHealth() {\n    return {\n      ...this.systemHealth,\n      components: Array.from(this.components.entries()).map(([name, component]) => ({\n        name,\n        type: component.type,\n        status: component.status,\n        critical: component.critical,\n        lastHealthCheck: component.lastHealthCheck,\n        lastError: component.lastError\n      })),\n      circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([name, cb]) => ({\n        name,\n        ...cb.getStats()\n      }))\n    };\n  }\n  \n  /**\n   * Get recovery statistics\n   */\n  getRecoveryStats() {\n    const recentRecoveries = this.recoveryHistory.slice(0, 20);\n    const outcomes = {};\n    \n    recentRecoveries.forEach(record => {\n      outcomes[record.outcome] = (outcomes[record.outcome] || 0) + 1;\n    });\n    \n    return {\n      totalRecoveries: this.recoveryHistory.length,\n      recentRecoveries: recentRecoveries.length,\n      activeRecoveries: this.activeRecoveries.size,\n      outcomeBreakdown: outcomes,\n      recentHistory: recentRecoveries\n    };\n  }\n  \n  /**\n   * Reset all circuit breakers\n   */\n  resetAllCircuitBreakers() {\n    for (const [name, circuitBreaker] of this.circuitBreakers) {\n      circuitBreaker.reset();\n    }\n    logger.info('🔄 All circuit breakers reset');\n  }\n  \n  /**\n   * Shutdown recovery manager\n   */\n  shutdown() {\n    if (this.healthCheckTimer) {\n      clearInterval(this.healthCheckTimer);\n      this.healthCheckTimer = null;\n    }\n    \n    // Wait for active recoveries to complete\n    if (this.activeRecoveries.size > 0) {\n      logger.info(`Waiting for ${this.activeRecoveries.size} active recoveries to complete...`);\n    }\n    \n    logger.info('Error recovery manager shutdown complete');\n  }\n}\n\nmodule.exports = ErrorRecoveryManager;"