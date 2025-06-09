/**
 * Platform Monitor
 * 
 * Comprehensive monitoring system for the message queue platform.
 * Provides real-time visibility into platform health, performance, and data flows.
 */

const { EventEmitter } = require('events');
const { logger } = require('./utils/logger');
const chalk = require('chalk');

class PlatformMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      updateInterval: options.updateInterval || 30000, // 30 seconds
      retentionPeriod: options.retentionPeriod || 3600000, // 1 hour
      alertThresholds: {
        errorRate: options.errorRate || 0.1, // 10%
        latency: options.latency || 30000, // 30 seconds
        memoryUsage: options.memoryUsage || 0.8, // 80%
        circuitBreakerFailures: options.circuitBreakerFailures || 5,
        ...options.alertThresholds
      },
      enableAlerts: options.enableAlerts !== false,
      ...options
    };
    
    this.platform = null;
    this.monitoring = false;
    this.updateTimer = null;
    
    // Metrics storage
    this.metrics = {
      platform: {
        uptime: 0,
        cycles: 0,
        lastCycle: null,
        averageCycleTime: 0,
        totalCycleTime: 0
      },
      entities: {
        total: 0,
        byType: {},
        processingRate: 0,
        errors: 0
      },
      streaming: {
        eventsPerSecond: 0,
        metricsPerSecond: 0,
        totalEvents: 0,
        totalMetrics: 0,
        errors: 0,
        queueLength: 0
      },
      infrastructure: {
        dataCollectionRate: 0,
        transformationRate: 0,
        samples: 0,
        errors: 0
      },
      errorRecovery: {
        circuitBreakerStatus: {},
        recoveryAttempts: 0,
        systemHealth: 'unknown'
      },
      performance: {
        memoryUsage: 0,
        cpuUsage: 0,
        activeConnections: 0
      }
    };
    
    // Time series data for trending
    this.timeSeries = {
      timestamps: [],
      metrics: {},
      maxPoints: Math.floor(this.options.retentionPeriod / this.options.updateInterval)
    };
    
    // Alert state
    this.alerts = {
      active: new Map(),
      history: [],
      suppressed: new Set()
    };
    
    this.startTime = Date.now();
    
    logger.debug('Platform monitor initialized');
  }
  
  /**
   * Start monitoring a platform instance
   */
  startMonitoring(platform) {
    if (this.monitoring) {
      this.stopMonitoring();
    }
    
    this.platform = platform;
    this.monitoring = true;
    this.startTime = Date.now();
    
    // Set up event listeners
    this.setupPlatformListeners();
    
    // Start periodic updates
    this.updateTimer = setInterval(() => {
      this.updateMetrics();
    }, this.options.updateInterval);
    
    // Initial update
    this.updateMetrics();
    
    this.emit('monitoringStarted', { platform: platform.options.mode });
    logger.info('Platform monitoring started');
  }
  
  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (!this.monitoring) return;
    
    this.monitoring = false;
    
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    
    // Clean up event listeners
    this.cleanupPlatformListeners();
    
    this.emit('monitoringStopped');
    logger.info('Platform monitoring stopped');
  }
  
  /**
   * Set up platform event listeners
   */
  setupPlatformListeners() {
    if (!this.platform) return;
    
    // Platform lifecycle events
    this.platform.on('cycle.completed', (data) => {
      this.handleCycleCompleted(data);
    });
    
    this.platform.on('cycle.error', (error) => {
      this.handleCycleError(error);
    });
    
    this.platform.on('infrastructure.processed', (data) => {
      this.handleInfrastructureProcessed(data);
    });
    
    this.platform.on('simulation.processed', (data) => {
      this.handleSimulationProcessed(data);
    });
    
    this.platform.on('hybrid.processed', (data) => {
      this.handleHybridProcessed(data);
    });
    
    // Error recovery events
    this.platform.on('component.error', (data) => {
      this.handleComponentError(data);
    });
    
    this.platform.on('circuit.opened', (data) => {
      this.handleCircuitOpened(data);
    });
    
    this.platform.on('circuit.closed', (data) => {
      this.handleCircuitClosed(data);
    });
  }
  
  /**
   * Clean up platform event listeners
   */
  cleanupPlatformListeners() {\n    if (!this.platform) return;\n    \n    this.platform.removeAllListeners('cycle.completed');\n    this.platform.removeAllListeners('cycle.error');\n    this.platform.removeAllListeners('infrastructure.processed');\n    this.platform.removeAllListeners('simulation.processed');\n    this.platform.removeAllListeners('hybrid.processed');\n    this.platform.removeAllListeners('component.error');\n    this.platform.removeAllListeners('circuit.opened');\n    this.platform.removeAllListeners('circuit.closed');\n  }\n  \n  /**\n   * Handle cycle completion\n   */\n  handleCycleCompleted(data) {\n    this.metrics.platform.cycles++;\n    this.metrics.platform.lastCycle = Date.now();\n    this.metrics.platform.totalCycleTime += data.duration;\n    this.metrics.platform.averageCycleTime = this.metrics.platform.totalCycleTime / this.metrics.platform.cycles;\n    \n    // Check for latency alerts\n    if (data.duration > this.options.alertThresholds.latency) {\n      this.triggerAlert('high_latency', {\n        duration: data.duration,\n        threshold: this.options.alertThresholds.latency\n      });\n    }\n  }\n  \n  /**\n   * Handle cycle error\n   */\n  handleCycleError(error) {\n    this.triggerAlert('cycle_error', {\n      error: error.message,\n      timestamp: Date.now()\n    });\n  }\n  \n  /**\n   * Handle infrastructure processing\n   */\n  handleInfrastructureProcessed(data) {\n    this.metrics.infrastructure.samples += data.samples || 0;\n    this.metrics.entities.total += data.entities || 0;\n  }\n  \n  /**\n   * Handle simulation processing\n   */\n  handleSimulationProcessed(data) {\n    this.metrics.entities.total += data.entities || 0;\n  }\n  \n  /**\n   * Handle hybrid processing\n   */\n  handleHybridProcessed(data) {\n    this.metrics.entities.total += data.total || 0;\n    this.metrics.infrastructure.samples += data.real || 0;\n  }\n  \n  /**\n   * Handle component error\n   */\n  handleComponentError(data) {\n    this.triggerAlert('component_error', {\n      component: data.component,\n      error: data.error,\n      timestamp: data.timestamp\n    });\n  }\n  \n  /**\n   * Handle circuit breaker opening\n   */\n  handleCircuitOpened(data) {\n    this.metrics.errorRecovery.circuitBreakerStatus[data.component] = 'open';\n    \n    this.triggerAlert('circuit_breaker_open', {\n      component: data.component,\n      timestamp: Date.now()\n    });\n  }\n  \n  /**\n   * Handle circuit breaker closing\n   */\n  handleCircuitClosed(data) {\n    this.metrics.errorRecovery.circuitBreakerStatus[data.component] = 'closed';\n    \n    // Clear circuit breaker alert\n    this.clearAlert(`circuit_breaker_open_${data.component}`);\n  }\n  \n  /**\n   * Update all metrics\n   */\n  async updateMetrics() {\n    if (!this.platform) return;\n    \n    try {\n      // Update platform uptime\n      this.metrics.platform.uptime = Date.now() - this.startTime;\n      \n      // Get current platform stats\n      const stats = await this.platform.getStats();\n      \n      // Update entity metrics\n      if (stats.topology) {\n        this.updateEntityMetrics(stats.topology);\n      }\n      \n      // Update streaming metrics\n      if (stats.streaming) {\n        this.updateStreamingMetrics(stats.streaming);\n      }\n      \n      // Update error recovery metrics\n      if (stats.errorRecovery) {\n        this.updateErrorRecoveryMetrics(stats.errorRecovery);\n      }\n      \n      // Update performance metrics\n      this.updatePerformanceMetrics();\n      \n      // Store time series data\n      this.storeTimeSeriesData();\n      \n      // Check alert conditions\n      this.checkAlertConditions();\n      \n      this.emit('metricsUpdated', this.getSnapshot());\n      \n    } catch (error) {\n      logger.error('Failed to update metrics:', error.message);\n    }\n  }\n  \n  /**\n   * Update entity metrics\n   */\n  updateEntityMetrics(topology) {\n    this.metrics.entities.byType = {\n      clusters: topology.clusters || 0,\n      brokers: topology.brokers || 0,\n      topics: topology.topics || 0,\n      consumerGroups: topology.consumerGroups || 0\n    };\n    \n    this.metrics.entities.total = Object.values(this.metrics.entities.byType)\n      .reduce((sum, count) => sum + count, 0);\n  }\n  \n  /**\n   * Update streaming metrics\n   */\n  updateStreamingMetrics(streaming) {\n    const now = Date.now();\n    const interval = this.options.updateInterval / 1000; // Convert to seconds\n    \n    // Calculate rates\n    const eventsDelta = streaming.eventsSent - (this.metrics.streaming.totalEvents || 0);\n    const metricsDelta = streaming.metricsSent - (this.metrics.streaming.totalMetrics || 0);\n    \n    this.metrics.streaming.eventsPerSecond = Math.round(eventsDelta / interval);\n    this.metrics.streaming.metricsPerSecond = Math.round(metricsDelta / interval);\n    this.metrics.streaming.totalEvents = streaming.eventsSent;\n    this.metrics.streaming.totalMetrics = streaming.metricsSent;\n    this.metrics.streaming.errors = streaming.errors || 0;\n    this.metrics.streaming.queueLength = (streaming.queuedEvents || 0) + (streaming.queuedMetrics || 0);\n    \n    // Calculate error rate\n    const totalOperations = streaming.eventsSent + streaming.metricsSent;\n    const errorRate = totalOperations > 0 ? streaming.errors / totalOperations : 0;\n    \n    // Check error rate alert\n    if (errorRate > this.options.alertThresholds.errorRate && totalOperations > 10) {\n      this.triggerAlert('high_error_rate', {\n        errorRate: errorRate,\n        threshold: this.options.alertThresholds.errorRate,\n        totalOperations\n      });\n    }\n  }\n  \n  /**\n   * Update error recovery metrics\n   */\n  updateErrorRecoveryMetrics(errorRecovery) {\n    if (errorRecovery.systemHealth) {\n      this.metrics.errorRecovery.systemHealth = errorRecovery.systemHealth.status;\n    }\n    \n    if (errorRecovery.recoveryStats) {\n      this.metrics.errorRecovery.recoveryAttempts = errorRecovery.recoveryStats.totalRecoveries || 0;\n    }\n  }\n  \n  /**\n   * Update performance metrics\n   */\n  updatePerformanceMetrics() {\n    const memUsage = process.memoryUsage();\n    this.metrics.performance.memoryUsage = memUsage.heapUsed / memUsage.heapTotal;\n    \n    // Check memory usage alert\n    if (this.metrics.performance.memoryUsage > this.options.alertThresholds.memoryUsage) {\n      this.triggerAlert('high_memory_usage', {\n        memoryUsage: this.metrics.performance.memoryUsage,\n        threshold: this.options.alertThresholds.memoryUsage\n      });\n    }\n  }\n  \n  /**\n   * Store time series data\n   */\n  storeTimeSeriesData() {\n    const timestamp = Date.now();\n    \n    // Add timestamp\n    this.timeSeries.timestamps.push(timestamp);\n    \n    // Add metric values\n    const metricsToStore = {\n      cycleTime: this.metrics.platform.averageCycleTime,\n      entityCount: this.metrics.entities.total,\n      eventsPerSecond: this.metrics.streaming.eventsPerSecond,\n      errorRate: this.calculateCurrentErrorRate(),\n      memoryUsage: this.metrics.performance.memoryUsage\n    };\n    \n    for (const [key, value] of Object.entries(metricsToStore)) {\n      if (!this.timeSeries.metrics[key]) {\n        this.timeSeries.metrics[key] = [];\n      }\n      this.timeSeries.metrics[key].push(value);\n    }\n    \n    // Trim old data\n    if (this.timeSeries.timestamps.length > this.timeSeries.maxPoints) {\n      const excess = this.timeSeries.timestamps.length - this.timeSeries.maxPoints;\n      \n      this.timeSeries.timestamps.splice(0, excess);\n      \n      for (const key of Object.keys(this.timeSeries.metrics)) {\n        this.timeSeries.metrics[key].splice(0, excess);\n      }\n    }\n  }\n  \n  /**\n   * Calculate current error rate\n   */\n  calculateCurrentErrorRate() {\n    const totalOperations = this.metrics.streaming.totalEvents + this.metrics.streaming.totalMetrics;\n    return totalOperations > 0 ? this.metrics.streaming.errors / totalOperations : 0;\n  }\n  \n  /**\n   * Check alert conditions\n   */\n  checkAlertConditions() {\n    // System health alert\n    if (this.metrics.errorRecovery.systemHealth === 'degraded' || \n        this.metrics.errorRecovery.systemHealth === 'error') {\n      this.triggerAlert('system_degraded', {\n        health: this.metrics.errorRecovery.systemHealth,\n        timestamp: Date.now()\n      });\n    }\n    \n    // High queue length alert\n    if (this.metrics.streaming.queueLength > 1000) {\n      this.triggerAlert('high_queue_length', {\n        queueLength: this.metrics.streaming.queueLength,\n        timestamp: Date.now()\n      });\n    }\n  }\n  \n  /**\n   * Trigger an alert\n   */\n  triggerAlert(type, data) {\n    if (!this.options.enableAlerts) return;\n    \n    const alertId = `${type}_${Date.now()}`;\n    const alert = {\n      id: alertId,\n      type,\n      severity: this.getAlertSeverity(type),\n      message: this.getAlertMessage(type, data),\n      data,\n      timestamp: Date.now(),\n      resolved: false\n    };\n    \n    // Check if this alert type is suppressed\n    if (this.alerts.suppressed.has(type)) {\n      return;\n    }\n    \n    // Store active alert\n    this.alerts.active.set(alertId, alert);\n    this.alerts.history.push(alert);\n    \n    // Limit history size\n    if (this.alerts.history.length > 1000) {\n      this.alerts.history = this.alerts.history.slice(-1000);\n    }\n    \n    this.emit('alert', alert);\n    this.printAlert(alert);\n  }\n  \n  /**\n   * Clear an alert\n   */\n  clearAlert(alertId) {\n    const alert = this.alerts.active.get(alertId);\n    if (alert) {\n      alert.resolved = true;\n      alert.resolvedAt = Date.now();\n      this.alerts.active.delete(alertId);\n      \n      this.emit('alertResolved', alert);\n    }\n  }\n  \n  /**\n   * Get alert severity\n   */\n  getAlertSeverity(type) {\n    const severityMap = {\n      cycle_error: 'critical',\n      component_error: 'critical',\n      circuit_breaker_open: 'critical',\n      system_degraded: 'warning',\n      high_latency: 'warning',\n      high_error_rate: 'warning',\n      high_memory_usage: 'warning',\n      high_queue_length: 'info'\n    };\n    \n    return severityMap[type] || 'info';\n  }\n  \n  /**\n   * Get alert message\n   */\n  getAlertMessage(type, data) {\n    const messages = {\n      cycle_error: `Platform cycle failed: ${data.error}`,\n      component_error: `Component ${data.component} error: ${data.error}`,\n      circuit_breaker_open: `Circuit breaker opened for ${data.component}`,\n      system_degraded: `System health degraded: ${data.health}`,\n      high_latency: `High cycle latency: ${data.duration}ms (threshold: ${data.threshold}ms)`,\n      high_error_rate: `High error rate: ${(data.errorRate * 100).toFixed(1)}% (threshold: ${(data.threshold * 100).toFixed(1)}%)`,\n      high_memory_usage: `High memory usage: ${(data.memoryUsage * 100).toFixed(1)}% (threshold: ${(data.threshold * 100).toFixed(1)}%)`,\n      high_queue_length: `High queue length: ${data.queueLength} items`\n    };\n    \n    return messages[type] || `Alert: ${type}`;\n  }\n  \n  /**\n   * Print alert to console\n   */\n  printAlert(alert) {\n    const severityColors = {\n      critical: chalk.red,\n      warning: chalk.yellow,\n      info: chalk.blue\n    };\n    \n    const color = severityColors[alert.severity] || chalk.gray;\n    const icon = alert.severity === 'critical' ? '🚨' : \n                 alert.severity === 'warning' ? '⚠️' : 'ℹ️';\n    \n    console.log(color(`${icon} [${alert.severity.toUpperCase()}] ${alert.message}`));\n  }\n  \n  /**\n   * Get current metrics snapshot\n   */\n  getSnapshot() {\n    return {\n      timestamp: Date.now(),\n      platform: { ...this.metrics.platform },\n      entities: { ...this.metrics.entities },\n      streaming: { ...this.metrics.streaming },\n      infrastructure: { ...this.metrics.infrastructure },\n      errorRecovery: { ...this.metrics.errorRecovery },\n      performance: { ...this.metrics.performance }\n    };\n  }\n  \n  /**\n   * Get time series data\n   */\n  getTimeSeries(metric, points = 60) {\n    if (!this.timeSeries.metrics[metric]) {\n      return { timestamps: [], values: [] };\n    }\n    \n    const length = Math.min(points, this.timeSeries.timestamps.length);\n    const startIndex = this.timeSeries.timestamps.length - length;\n    \n    return {\n      timestamps: this.timeSeries.timestamps.slice(startIndex),\n      values: this.timeSeries.metrics[metric].slice(startIndex)\n    };\n  }\n  \n  /**\n   * Get current alerts\n   */\n  getActiveAlerts() {\n    return Array.from(this.alerts.active.values());\n  }\n  \n  /**\n   * Get alert history\n   */\n  getAlertHistory(limit = 100) {\n    return this.alerts.history.slice(-limit);\n  }\n  \n  /**\n   * Suppress alert type\n   */\n  suppressAlert(type, duration = 300000) { // 5 minutes default\n    this.alerts.suppressed.add(type);\n    \n    setTimeout(() => {\n      this.alerts.suppressed.delete(type);\n    }, duration);\n  }\n  \n  /**\n   * Generate monitoring report\n   */\n  generateReport() {\n    const snapshot = this.getSnapshot();\n    const activeAlerts = this.getActiveAlerts();\n    \n    return {\n      summary: {\n        uptime: snapshot.platform.uptime,\n        cycles: snapshot.platform.cycles,\n        entitiesProcessed: snapshot.entities.total,\n        eventsStreamed: snapshot.streaming.totalEvents,\n        activeAlerts: activeAlerts.length,\n        systemHealth: snapshot.errorRecovery.systemHealth\n      },\n      performance: {\n        averageCycleTime: snapshot.platform.averageCycleTime,\n        eventsPerSecond: snapshot.streaming.eventsPerSecond,\n        errorRate: this.calculateCurrentErrorRate(),\n        memoryUsage: snapshot.performance.memoryUsage\n      },\n      alerts: activeAlerts,\n      timestamp: snapshot.timestamp\n    };\n  }\n  \n  /**\n   * Print status dashboard to console\n   */\n  printDashboard() {\n    const snapshot = this.getSnapshot();\n    const activeAlerts = this.getActiveAlerts();\n    \n    console.clear();\n    \n    // Header\n    console.log(chalk.bold.cyan('📊 MESSAGE QUEUE PLATFORM MONITOR'));\n    console.log(chalk.cyan('=' .repeat(50)));\n    console.log(`Uptime: ${Math.round(snapshot.platform.uptime / 1000)}s | Mode: ${this.platform.options.mode}`);\n    console.log();\n    \n    // Platform metrics\n    console.log(chalk.bold('Platform:'));\n    console.log(`  Cycles: ${snapshot.platform.cycles}`);\n    console.log(`  Avg Cycle Time: ${Math.round(snapshot.platform.averageCycleTime)}ms`);\n    console.log();\n    \n    // Entity metrics\n    console.log(chalk.bold('Entities:'));\n    console.log(`  Total: ${snapshot.entities.total}`);\n    Object.entries(snapshot.entities.byType).forEach(([type, count]) => {\n      console.log(`  ${type}: ${count}`);\n    });\n    console.log();\n    \n    // Streaming metrics\n    console.log(chalk.bold('Streaming:'));\n    console.log(`  Events/sec: ${snapshot.streaming.eventsPerSecond}`);\n    console.log(`  Total Events: ${snapshot.streaming.totalEvents}`);\n    console.log(`  Queue Length: ${snapshot.streaming.queueLength}`);\n    console.log(`  Errors: ${snapshot.streaming.errors}`);\n    console.log();\n    \n    // System health\n    const healthColor = snapshot.errorRecovery.systemHealth === 'healthy' ? chalk.green :\n                       snapshot.errorRecovery.systemHealth === 'degraded' ? chalk.yellow : chalk.red;\n    console.log(chalk.bold('System Health:'));\n    console.log(`  Status: ${healthColor(snapshot.errorRecovery.systemHealth)}`);\n    console.log(`  Memory: ${(snapshot.performance.memoryUsage * 100).toFixed(1)}%`);\n    console.log();\n    \n    // Active alerts\n    if (activeAlerts.length > 0) {\n      console.log(chalk.bold.red('Active Alerts:'));\n      activeAlerts.forEach(alert => {\n        const color = alert.severity === 'critical' ? chalk.red :\n                     alert.severity === 'warning' ? chalk.yellow : chalk.blue;\n        console.log(`  ${color(alert.message)}`);\n      });\n    } else {\n      console.log(chalk.green('✅ No active alerts'));\n    }\n    \n    console.log(chalk.cyan('=' .repeat(50)));\n    console.log(`Last updated: ${new Date().toLocaleTimeString()}`);\n  }\n}\n\nmodule.exports = PlatformMonitor;"