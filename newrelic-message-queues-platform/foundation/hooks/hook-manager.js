const { EventEmitter } = require('events');

/**
 * HookManager - Manages lifecycle hooks and middleware for the transformation pipeline
 * 
 * Provides a flexible hook system that allows plugins and extensions to
 * tap into various stages of the transformation process.
 */
class HookManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      maxHooksPerEvent: 100,
      hookTimeout: 30000, // 30 seconds
      enableMetrics: true,
      enableDebug: false,
      ...config
    };

    // Hook storage: event -> priority -> hooks[]
    this.hooks = new Map();
    
    // Middleware chain
    this.middleware = [];
    
    // Hook execution metrics
    this.metrics = {
      hooksRegistered: 0,
      hooksExecuted: 0,
      hooksFailed: 0,
      middlewareRegistered: 0,
      middlewareExecuted: 0
    };

    // Available hook points
    this.hookPoints = [
      // Transformation lifecycle
      'pre-transform',
      'post-transform',
      'pre-validate',
      'post-validate',
      'pre-enrich',
      'post-enrich',
      'pre-optimize',
      'post-optimize',
      
      // Entity lifecycle
      'pre-entity-create',
      'post-entity-create',
      'pre-relationship-create',
      'post-relationship-create',
      
      // Aggregation lifecycle
      'pre-aggregate',
      'post-aggregate',
      'pre-window-rotate',
      'post-window-rotate',
      
      // Error handling
      'error',
      'validation-error',
      'transformation-error'
    ];

    // Initialize hook storage
    this.hookPoints.forEach(point => {
      this.hooks.set(point, new Map());
    });
  }

  /**
   * Register a hook for a specific event
   * @param {string} event - Event name
   * @param {Function} handler - Hook handler function
   * @param {Object} options - Hook options
   */
  registerHook(event, handler, options = {}) {
    if (!this.hooks.has(event)) {
      throw new Error(`Invalid hook event: ${event}`);
    }

    if (typeof handler !== 'function') {
      throw new Error('Hook handler must be a function');
    }

    const hookConfig = {
      name: options.name || `hook-${Date.now()}`,
      priority: options.priority || 50,
      timeout: options.timeout || this.config.hookTimeout,
      async: options.async !== false,
      once: options.once || false,
      metadata: options.metadata || {}
    };

    // Get priority map for this event
    const priorityMap = this.hooks.get(event);
    
    // Get or create priority array
    if (!priorityMap.has(hookConfig.priority)) {
      priorityMap.set(hookConfig.priority, []);
    }

    const priorityHooks = priorityMap.get(hookConfig.priority);
    
    // Check max hooks limit
    const totalHooks = Array.from(priorityMap.values())
      .reduce((sum, hooks) => sum + hooks.length, 0);
    
    if (totalHooks >= this.config.maxHooksPerEvent) {
      throw new Error(`Maximum hooks (${this.config.maxHooksPerEvent}) reached for event: ${event}`);
    }

    // Create hook entry
    const hook = {
      id: `${event}-${hookConfig.name}-${Date.now()}`,
      handler,
      config: hookConfig,
      metrics: {
        executions: 0,
        failures: 0,
        totalDuration: 0,
        avgDuration: 0
      }
    };

    priorityHooks.push(hook);
    this.metrics.hooksRegistered++;

    this.emit('hookRegistered', {
      event,
      hookId: hook.id,
      priority: hookConfig.priority
    });

    // Return unregister function
    return () => this.unregisterHook(event, hook.id);
  }

  /**
   * Unregister a hook
   * @param {string} event - Event name
   * @param {string} hookId - Hook ID
   */
  unregisterHook(event, hookId) {
    const priorityMap = this.hooks.get(event);
    if (!priorityMap) return false;

    for (const [priority, hooks] of priorityMap.entries()) {
      const index = hooks.findIndex(h => h.id === hookId);
      if (index !== -1) {
        hooks.splice(index, 1);
        
        // Clean up empty priority arrays
        if (hooks.length === 0) {
          priorityMap.delete(priority);
        }

        this.emit('hookUnregistered', { event, hookId });
        return true;
      }
    }

    return false;
  }

  /**
   * Execute all hooks for an event
   * @param {string} event - Event name
   * @param {*} data - Data to pass to hooks
   * @param {Object} context - Execution context
   * @returns {Promise<*>} Modified data
   */
  async executeHooks(event, data, context = {}) {
    const priorityMap = this.hooks.get(event);
    if (!priorityMap || priorityMap.size === 0) {
      return data;
    }

    // Get sorted priorities (lowest to highest)
    const priorities = Array.from(priorityMap.keys()).sort((a, b) => a - b);
    
    let currentData = data;
    const errors = [];

    for (const priority of priorities) {
      const hooks = priorityMap.get(priority);
      
      // Execute hooks at this priority level
      for (const hook of hooks) {
        try {
          currentData = await this.executeHook(hook, event, currentData, context);
          
          // Remove if it was a one-time hook
          if (hook.config.once) {
            this.unregisterHook(event, hook.id);
          }
        } catch (error) {
          errors.push({
            hookId: hook.id,
            error,
            priority
          });

          if (this.config.enableDebug) {
            console.error(`Hook execution failed: ${hook.id}`, error);
          }

          // Emit error event
          this.emit('hookError', {
            event,
            hookId: hook.id,
            error
          });
        }
      }
    }

    // Handle errors based on configuration
    if (errors.length > 0 && context.stopOnError) {
      throw new Error(`Hook execution failed: ${errors.length} errors`);
    }

    return currentData;
  }

  /**
   * Execute a single hook with timeout and metrics
   * @param {Object} hook - Hook object
   * @param {string} event - Event name
   * @param {*} data - Hook data
   * @param {Object} context - Execution context
   * @returns {Promise<*>} Modified data
   */
  async executeHook(hook, event, data, context) {
    const startTime = Date.now();

    try {
      // Create hook execution promise
      const hookPromise = hook.config.async
        ? hook.handler(data, context, { event, hookId: hook.id })
        : Promise.resolve(hook.handler(data, context, { event, hookId: hook.id }));

      // Add timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Hook timeout')), hook.config.timeout);
      });

      // Race between hook execution and timeout
      const result = await Promise.race([hookPromise, timeoutPromise]);

      // Update metrics
      hook.metrics.executions++;
      hook.metrics.totalDuration += Date.now() - startTime;
      hook.metrics.avgDuration = hook.metrics.totalDuration / hook.metrics.executions;
      this.metrics.hooksExecuted++;

      return result !== undefined ? result : data;
    } catch (error) {
      // Update failure metrics
      hook.metrics.failures++;
      this.metrics.hooksFailed++;
      
      throw error;
    }
  }

  /**
   * Register middleware
   * @param {Function} middleware - Middleware function
   * @param {Object} options - Middleware options
   */
  use(middleware, options = {}) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function');
    }

    const middlewareEntry = {
      id: options.name || `middleware-${Date.now()}`,
      handler: middleware,
      options: {
        priority: options.priority || 50,
        enabled: options.enabled !== false,
        ...options
      },
      metrics: {
        executions: 0,
        failures: 0,
        totalDuration: 0
      }
    };

    // Insert middleware based on priority
    const insertIndex = this.middleware.findIndex(m => 
      m.options.priority > middlewareEntry.options.priority
    );

    if (insertIndex === -1) {
      this.middleware.push(middlewareEntry);
    } else {
      this.middleware.splice(insertIndex, 0, middlewareEntry);
    }

    this.metrics.middlewareRegistered++;

    this.emit('middlewareRegistered', {
      middlewareId: middlewareEntry.id,
      priority: middlewareEntry.options.priority
    });

    // Return unregister function
    return () => this.removeMiddleware(middlewareEntry.id);
  }

  /**
   * Remove middleware
   * @param {string} middlewareId - Middleware ID
   */
  removeMiddleware(middlewareId) {
    const index = this.middleware.findIndex(m => m.id === middlewareId);
    
    if (index !== -1) {
      this.middleware.splice(index, 1);
      this.emit('middlewareRemoved', { middlewareId });
      return true;
    }

    return false;
  }

  /**
   * Execute middleware chain
   * @param {*} data - Initial data
   * @param {Object} context - Execution context
   * @returns {Promise<*>} Processed data
   */
  async executeMiddleware(data, context = {}) {
    let currentData = data;

    for (const middleware of this.middleware) {
      if (!middleware.options.enabled) continue;

      const startTime = Date.now();

      try {
        // Create next function
        let nextCalled = false;
        const next = (modifiedData) => {
          nextCalled = true;
          currentData = modifiedData !== undefined ? modifiedData : currentData;
        };

        // Execute middleware
        await middleware.handler(currentData, next, context);

        // If next wasn't called, assume pass-through
        if (!nextCalled) {
          currentData = currentData;
        }

        // Update metrics
        middleware.metrics.executions++;
        middleware.metrics.totalDuration += Date.now() - startTime;
        this.metrics.middlewareExecuted++;

      } catch (error) {
        middleware.metrics.failures++;
        
        if (this.config.enableDebug) {
          console.error(`Middleware execution failed: ${middleware.id}`, error);
        }

        this.emit('middlewareError', {
          middlewareId: middleware.id,
          error
        });

        if (context.stopOnError) {
          throw error;
        }
      }
    }

    return currentData;
  }

  /**
   * Create a hook context with common utilities
   * @param {Object} baseContext - Base context
   * @returns {Object} Enhanced context
   */
  createContext(baseContext = {}) {
    return {
      ...baseContext,
      timestamp: Date.now(),
      hookManager: this,
      
      // Utility functions
      emit: (event, data) => this.emit(event, data),
      
      // Hook registration within hooks
      registerHook: (event, handler, options) => 
        this.registerHook(event, handler, options),
      
      // Metrics access
      getMetrics: () => this.getMetrics(),
      
      // Storage for passing data between hooks
      storage: new Map()
    };
  }

  /**
   * Get hook statistics
   * @returns {Object} Hook statistics
   */
  getStatistics() {
    const stats = {
      ...this.metrics,
      hooksByEvent: {},
      middlewareCount: this.middleware.length,
      topHooksByExecution: [],
      topHooksByDuration: []
    };

    // Count hooks by event
    for (const [event, priorityMap] of this.hooks.entries()) {
      let count = 0;
      const allHooks = [];
      
      for (const hooks of priorityMap.values()) {
        count += hooks.length;
        allHooks.push(...hooks);
      }
      
      stats.hooksByEvent[event] = count;

      // Collect all hooks for ranking
      allHooks.forEach(hook => {
        if (hook.metrics.executions > 0) {
          stats.topHooksByExecution.push({
            id: hook.id,
            event,
            executions: hook.metrics.executions,
            avgDuration: hook.metrics.avgDuration
          });
        }
      });
    }

    // Sort top hooks
    stats.topHooksByExecution.sort((a, b) => b.executions - a.executions);
    stats.topHooksByExecution = stats.topHooksByExecution.slice(0, 10);

    stats.topHooksByDuration = [...stats.topHooksByExecution]
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);

    return stats;
  }

  /**
   * Get metrics for all hooks
   * @returns {Object} Hook metrics
   */
  getMetrics() {
    const metrics = {
      hooks: {},
      middleware: {}
    };

    // Collect hook metrics
    for (const [event, priorityMap] of this.hooks.entries()) {
      metrics.hooks[event] = {};
      
      for (const [priority, hooks] of priorityMap.entries()) {
        metrics.hooks[event][priority] = hooks.map(h => ({
          id: h.id,
          name: h.config.name,
          metrics: { ...h.metrics }
        }));
      }
    }

    // Collect middleware metrics
    metrics.middleware = this.middleware.map(m => ({
      id: m.id,
      priority: m.options.priority,
      metrics: { ...m.metrics }
    }));

    return metrics;
  }

  /**
   * Clear all hooks and middleware
   */
  clear() {
    // Clear all hooks
    for (const priorityMap of this.hooks.values()) {
      priorityMap.clear();
    }

    // Clear middleware
    this.middleware = [];

    // Reset metrics
    this.metrics = {
      hooksRegistered: 0,
      hooksExecuted: 0,
      hooksFailed: 0,
      middlewareRegistered: 0,
      middlewareExecuted: 0
    };

    this.emit('cleared');
  }

  /**
   * Create a scoped hook manager for isolated hook execution
   * @param {Object} config - Scoped configuration
   * @returns {HookManager} Scoped hook manager
   */
  createScope(config = {}) {
    const scopedManager = new HookManager({
      ...this.config,
      ...config
    });

    // Copy hook points
    this.hookPoints.forEach(point => {
      scopedManager.hooks.set(point, new Map());
    });

    return scopedManager;
  }
}

module.exports = HookManager;