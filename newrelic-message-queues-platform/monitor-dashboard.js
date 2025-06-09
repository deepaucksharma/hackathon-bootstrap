#!/usr/bin/env node
/**
 * Platform Monitoring Dashboard
 * 
 * Real-time monitoring dashboard for the Message Queue Platform.
 * Provides comprehensive visibility into platform health and performance.
 */

const MessageQueuesPlatform = require('./platform');
const PlatformMonitor = require('./core/platform-monitor');
const PipelineValidator = require('./core/pipeline-validator');
const { logger } = require('./core/utils/logger');
const chalk = require('chalk');
const { Command } = require('commander');

class MonitoringDashboard {
  constructor(options = {}) {
    this.options = {
      updateInterval: options.updateInterval || 5000, // 5 seconds for dashboard
      mode: options.mode || 'simulation',
      enableValidation: options.enableValidation !== false,
      enableAlerts: options.enableAlerts !== false,
      ...options
    };
    
    this.platform = null;
    this.monitor = null;
    this.validator = null;
    this.dashboardTimer = null;
    this.running = false;
    
    // Dashboard state
    this.dashboardData = {
      lastUpdate: null,
      validationResults: null,
      trends: {},
      alerts: []
    };
  }

  /**
   * Start the monitoring dashboard
   */
  async start() {
    try {
      console.log(chalk.bold.blue('🚀 Starting Message Queue Platform Monitor\n'));
      
      // Create platform instance
      await this.initializePlatform();
      
      // Create monitor
      this.initializeMonitor();
      
      // Create validator if enabled
      if (this.options.enableValidation) {
        await this.initializeValidator();
      }
      
      // Start monitoring
      this.monitor.startMonitoring(this.platform);
      
      // Start platform
      await this.platform.start();
      
      // Start dashboard updates
      this.startDashboardUpdates();
      
      this.running = true;
      console.log(chalk.green('✅ Monitoring dashboard started successfully\n'));
      
      // Setup graceful shutdown
      this.setupShutdownHandlers();
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to start monitoring dashboard:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Initialize platform
   */
  async initializePlatform() {
    console.log(chalk.cyan('📋 Initializing platform...'));
    
    this.platform = new MessageQueuesPlatform({
      mode: this.options.mode,
      provider: this.options.provider || 'kafka',
      accountId: this.options.accountId || process.env.NEW_RELIC_ACCOUNT_ID || '12345',
      apiKey: this.options.apiKey || process.env.NEW_RELIC_USER_API_KEY || 'demo-key',
      ingestKey: this.options.ingestKey || process.env.NEW_RELIC_INGEST_KEY || 'demo-ingest-key',
      interval: this.options.platformInterval || 30,
      continuous: true,
      debug: this.options.debug || false,
      // Simulation mode specific
      ...(this.options.mode === 'simulation' && {
        clusters: this.options.clusters || 2,
        brokers: this.options.brokers || 6,
        topics: this.options.topics || 10,
        consumerGroups: this.options.consumerGroups || 8,
        autoCreate: true
      })
    });
    
    console.log(chalk.green(`✅ Platform initialized in ${this.options.mode} mode`));
  }

  /**
   * Initialize monitor
   */
  initializeMonitor() {
    console.log(chalk.cyan('📊 Initializing monitor...'));
    
    this.monitor = new PlatformMonitor({
      updateInterval: 10000, // Monitor updates every 10 seconds
      enableAlerts: this.options.enableAlerts,
      alertThresholds: {
        errorRate: 0.05, // 5%
        latency: 60000, // 1 minute
        memoryUsage: 0.85, // 85%
        circuitBreakerFailures: 3
      }
    });
    
    // Set up monitor event handlers
    this.setupMonitorEventHandlers();
    
    console.log(chalk.green('✅ Monitor initialized'));
  }

  /**
   * Initialize validator
   */
  async initializeValidator() {
    console.log(chalk.cyan('🔍 Initializing validator...'));
    
    this.validator = new PipelineValidator({
      timeout: 30000,
      validateData: true,
      validateTransformation: true,
      validateStreaming: true
    });
    
    console.log(chalk.green('✅ Validator initialized'));
  }

  /**
   * Setup monitor event handlers
   */
  setupMonitorEventHandlers() {
    this.monitor.on('alert', (alert) => {
      this.dashboardData.alerts.unshift(alert);
      // Keep only last 10 alerts
      if (this.dashboardData.alerts.length > 10) {
        this.dashboardData.alerts = this.dashboardData.alerts.slice(0, 10);
      }
    });
    
    this.monitor.on('alertResolved', (alert) => {
      console.log(chalk.green(`✅ Alert resolved: ${alert.message}`));
    });
    
    this.monitor.on('metricsUpdated', (snapshot) => {
      this.updateTrends(snapshot);
    });
  }

  /**
   * Start dashboard updates
   */
  startDashboardUpdates() {
    // Initial render
    this.renderDashboard();
    
    // Periodic updates
    this.dashboardTimer = setInterval(() => {
      this.renderDashboard();
    }, this.options.updateInterval);
  }

  /**
   * Update trend calculations
   */
  updateTrends(snapshot) {
    const now = Date.now();
    
    // Store trend data
    const metrics = ['entities.total', 'streaming.eventsPerSecond', 'platform.averageCycleTime'];
    
    metrics.forEach(metric => {
      const value = this.getNestedProperty(snapshot, metric);
      if (value !== undefined) {
        if (!this.dashboardData.trends[metric]) {
          this.dashboardData.trends[metric] = [];
        }
        
        this.dashboardData.trends[metric].push({ timestamp: now, value });
        
        // Keep only last 20 data points for trends
        if (this.dashboardData.trends[metric].length > 20) {
          this.dashboardData.trends[metric] = this.dashboardData.trends[metric].slice(-20);
        }
      }
    });
  }

  /**
   * Get nested property from object
   */
  getNestedProperty(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }

  /**
   * Calculate trend direction
   */
  calculateTrend(metric) {
    const data = this.dashboardData.trends[metric];
    if (!data || data.length < 2) return 'stable';
    
    const recent = data.slice(-5); // Last 5 points
    const avg1 = recent.slice(0, Math.floor(recent.length / 2)).reduce((sum, p) => sum + p.value, 0) / Math.floor(recent.length / 2);
    const avg2 = recent.slice(Math.floor(recent.length / 2)).reduce((sum, p) => sum + p.value, 0) / (recent.length - Math.floor(recent.length / 2));
    
    const change = avg2 - avg1;
    const threshold = avg1 * 0.1; // 10% change threshold
    
    if (change > threshold) return 'up';
    if (change < -threshold) return 'down';
    return 'stable';
  }

  /**
   * Get trend icon
   */
  getTrendIcon(trend) {
    return trend === 'up' ? '📈' : trend === 'down' ? '📉' : '➡️';
  }

  /**
   * Render the dashboard
   */
  async renderDashboard() {
    if (!this.platform || !this.monitor) return;
    
    try {
      // Get current data
      const snapshot = this.monitor.getSnapshot();
      const activeAlerts = this.monitor.getActiveAlerts();
      const platformStats = await this.platform.getStats();
      
      this.dashboardData.lastUpdate = Date.now();
      
      // Clear screen and render
      console.clear();
      this.renderHeader();
      this.renderSystemStatus(snapshot, activeAlerts);
      this.renderPlatformMetrics(snapshot, platformStats);
      this.renderEntityMetrics(snapshot);
      this.renderStreamingMetrics(snapshot);
      this.renderPerformanceMetrics(snapshot);
      this.renderAlertsSection(activeAlerts);
      this.renderFooter();
      
    } catch (error) {
      console.error(chalk.red('❌ Dashboard render error:'), error.message);
    }
  }

  /**
   * Render dashboard header
   */
  renderHeader() {\n    const title = 'MESSAGE QUEUE PLATFORM MONITORING DASHBOARD';\n    const line = '='.repeat(title.length);\n    \n    console.log(chalk.bold.cyan(line));\n    console.log(chalk.bold.cyan(title));\n    console.log(chalk.bold.cyan(line));\n    console.log(`Mode: ${chalk.yellow(this.options.mode)} | ` +\n               `Provider: ${chalk.yellow(this.options.provider || 'kafka')} | ` +\n               `Last Update: ${chalk.gray(new Date().toLocaleTimeString())}\\n`);\n  }\n  \n  /**\n   * Render system status\n   */\n  renderSystemStatus(snapshot, activeAlerts) {\n    const uptime = Math.floor(snapshot.platform.uptime / 1000);\n    const uptimeFormatted = this.formatDuration(uptime);\n    \n    const healthColor = snapshot.errorRecovery.systemHealth === 'healthy' ? chalk.green :\n                       snapshot.errorRecovery.systemHealth === 'degraded' ? chalk.yellow : chalk.red;\n    \n    const statusIcon = activeAlerts.length === 0 ? '🟢' : \n                      activeAlerts.some(a => a.severity === 'critical') ? '🔴' : '🟡';\n    \n    console.log(chalk.bold('🏥 SYSTEM STATUS'));\n    console.log(`${statusIcon} Health: ${healthColor(snapshot.errorRecovery.systemHealth || 'unknown')}`);\n    console.log(`⏱️  Uptime: ${uptimeFormatted}`);\n    console.log(`🔄 Cycles: ${snapshot.platform.cycles}`);\n    console.log(`🚨 Active Alerts: ${activeAlerts.length}\\n`);\n  }\n  \n  /**\n   * Render platform metrics\n   */\n  renderPlatformMetrics(snapshot, platformStats) {\n    const avgCycleTime = Math.round(snapshot.platform.averageCycleTime);\n    const cycleTrend = this.calculateTrend('platform.averageCycleTime');\n    const cycleTrendIcon = this.getTrendIcon(cycleTrend);\n    \n    console.log(chalk.bold('⚙️  PLATFORM METRICS'));\n    console.log(`📊 Avg Cycle Time: ${avgCycleTime}ms ${cycleTrendIcon}`);\n    console.log(`🔄 Total Cycles: ${snapshot.platform.cycles}`);\n    \n    if (platformStats.errorRecovery) {\n      const cbStats = platformStats.errorRecovery.systemHealth;\n      if (cbStats && cbStats.components) {\n        const healthyComponents = cbStats.components.filter(c => c.status === 'healthy').length;\n        console.log(`🛡️  Component Health: ${healthyComponents}/${cbStats.components.length} healthy`);\n      }\n    }\n    \n    console.log();\n  }\n  \n  /**\n   * Render entity metrics\n   */\n  renderEntityMetrics(snapshot) {\n    const totalTrend = this.calculateTrend('entities.total');\n    const totalTrendIcon = this.getTrendIcon(totalTrend);\n    \n    console.log(chalk.bold('🏗️  ENTITY METRICS'));\n    console.log(`📦 Total Entities: ${snapshot.entities.total} ${totalTrendIcon}`);\n    \n    if (snapshot.entities.byType) {\n      Object.entries(snapshot.entities.byType).forEach(([type, count]) => {\n        const icon = {\n          clusters: '🏢',\n          brokers: '🖥️ ',\n          topics: '📝',\n          consumerGroups: '👥'\n        }[type] || '📄';\n        \n        console.log(`${icon} ${type}: ${count}`);\n      });\n    }\n    \n    console.log();\n  }\n  \n  /**\n   * Render streaming metrics\n   */\n  renderStreamingMetrics(snapshot) {\n    const rateColor = snapshot.streaming.eventsPerSecond > 0 ? chalk.green : chalk.gray;\n    const queueColor = snapshot.streaming.queueLength > 100 ? chalk.yellow : \n                      snapshot.streaming.queueLength > 500 ? chalk.red : chalk.green;\n    \n    const rateTrend = this.calculateTrend('streaming.eventsPerSecond');\n    const rateTrendIcon = this.getTrendIcon(rateTrend);\n    \n    console.log(chalk.bold('📡 STREAMING METRICS'));\n    console.log(`🚀 Events/sec: ${rateColor(snapshot.streaming.eventsPerSecond)} ${rateTrendIcon}`);\n    console.log(`📊 Total Events: ${snapshot.streaming.totalEvents}`);\n    console.log(`📈 Total Metrics: ${snapshot.streaming.totalMetrics}`);\n    console.log(`📋 Queue Length: ${queueColor(snapshot.streaming.queueLength)}`);\n    \n    if (snapshot.streaming.errors > 0) {\n      console.log(`❌ Errors: ${chalk.red(snapshot.streaming.errors)}`);\n    }\n    \n    console.log();\n  }\n  \n  /**\n   * Render performance metrics\n   */\n  renderPerformanceMetrics(snapshot) {\n    const memUsage = (snapshot.performance.memoryUsage * 100).toFixed(1);\n    const memColor = snapshot.performance.memoryUsage > 0.8 ? chalk.red :\n                    snapshot.performance.memoryUsage > 0.6 ? chalk.yellow : chalk.green;\n    \n    console.log(chalk.bold('💻 PERFORMANCE'));\n    console.log(`🧠 Memory Usage: ${memColor(memUsage + '%')}`);\n    \n    // Add performance bar\n    const barLength = 20;\n    const filledLength = Math.round(snapshot.performance.memoryUsage * barLength);\n    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);\n    console.log(`   [${memColor(bar)}]`);\n    \n    console.log();\n  }\n  \n  /**\n   * Render alerts section\n   */\n  renderAlertsSection(activeAlerts) {\n    console.log(chalk.bold('🚨 RECENT ALERTS'));\n    \n    if (activeAlerts.length === 0) {\n      console.log(chalk.green('✅ No active alerts'));\n    } else {\n      activeAlerts.slice(0, 5).forEach(alert => {\n        const timeAgo = this.formatTimeAgo(Date.now() - alert.timestamp);\n        const severityColor = alert.severity === 'critical' ? chalk.red :\n                             alert.severity === 'warning' ? chalk.yellow : chalk.blue;\n        const icon = alert.severity === 'critical' ? '🔴' :\n                    alert.severity === 'warning' ? '🟡' : '🔵';\n        \n        console.log(`${icon} ${severityColor(alert.message)} (${timeAgo})`);\n      });\n    }\n    \n    // Show recent resolved alerts from dashboard data\n    const recentAlerts = this.dashboardData.alerts.filter(a => a.resolved).slice(0, 2);\n    if (recentAlerts.length > 0) {\n      console.log(chalk.gray('\\nRecently Resolved:'));\n      recentAlerts.forEach(alert => {\n        const timeAgo = this.formatTimeAgo(Date.now() - alert.resolvedAt);\n        console.log(chalk.gray(`✅ ${alert.message} (resolved ${timeAgo})`));\n      });\n    }\n    \n    console.log();\n  }\n  \n  /**\n   * Render footer\n   */\n  renderFooter() {\n    const line = '='.repeat(80);\n    console.log(chalk.cyan(line));\n    console.log(chalk.gray('Press Ctrl+C to stop monitoring | Refresh every ' + \n                          (this.options.updateInterval / 1000) + 's'));\n    \n    if (this.options.enableValidation && this.dashboardData.validationResults) {\n      const validation = this.dashboardData.validationResults;\n      const statusIcon = validation.overall.status === 'passed' ? '✅' :\n                        validation.overall.status === 'warning' ? '⚠️' : '❌';\n      console.log(chalk.gray(`Last Validation: ${statusIcon} ${validation.overall.score}% ` +\n                            `(${this.formatTimeAgo(Date.now() - new Date(validation.timestamp).getTime())})`));\n    }\n  }\n  \n  /**\n   * Format duration in seconds to human readable\n   */\n  formatDuration(seconds) {\n    if (seconds < 60) return `${seconds}s`;\n    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;\n    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;\n  }\n  \n  /**\n   * Format time ago\n   */\n  formatTimeAgo(ms) {\n    const seconds = Math.floor(ms / 1000);\n    if (seconds < 60) return `${seconds}s ago`;\n    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;\n    return `${Math.floor(seconds / 3600)}h ago`;\n  }\n  \n  /**\n   * Run validation check\n   */\n  async runValidationCheck() {\n    if (!this.validator || !this.platform) return;\n    \n    try {\n      console.log(chalk.cyan('🔍 Running pipeline validation...'));\n      const validation = await this.validator.validatePipeline(this.platform);\n      this.dashboardData.validationResults = validation;\n      \n      const statusIcon = validation.overall.status === 'passed' ? '✅' :\n                        validation.overall.status === 'warning' ? '⚠️' : '❌';\n      console.log(`${statusIcon} Validation completed: ${validation.overall.score}%`);\n      \n    } catch (error) {\n      console.error(chalk.red('❌ Validation failed:'), error.message);\n    }\n  }\n  \n  /**\n   * Setup graceful shutdown\n   */\n  setupShutdownHandlers() {\n    const shutdown = async () => {\n      if (!this.running) return;\n      this.running = false;\n      \n      console.log(chalk.yellow('\\n⏹️  Shutting down monitoring dashboard...'));\n      \n      // Stop dashboard updates\n      if (this.dashboardTimer) {\n        clearInterval(this.dashboardTimer);\n      }\n      \n      // Stop monitoring\n      if (this.monitor) {\n        this.monitor.stopMonitoring();\n      }\n      \n      // Stop platform\n      if (this.platform) {\n        await this.platform.stop();\n      }\n      \n      console.log(chalk.green('✅ Dashboard shutdown complete'));\n      process.exit(0);\n    };\n    \n    process.on('SIGINT', shutdown);\n    process.on('SIGTERM', shutdown);\n  }\n}\n\n// CLI interface\nif (require.main === module) {\n  const program = new Command();\n  \n  program\n    .name('monitor-dashboard')\n    .description('Real-time monitoring dashboard for Message Queue Platform')\n    .version('1.0.0');\n  \n  program\n    .option('-m, --mode <mode>', 'Platform mode (infrastructure|simulation|hybrid)', 'simulation')\n    .option('-p, --provider <provider>', 'Message queue provider', 'kafka')\n    .option('-i, --update-interval <ms>', 'Dashboard update interval in ms', '5000')\n    .option('--platform-interval <seconds>', 'Platform cycle interval', '30')\n    .option('--account-id <id>', 'New Relic account ID')\n    .option('--api-key <key>', 'New Relic User API key')\n    .option('--ingest-key <key>', 'New Relic Ingest key')\n    .option('--clusters <count>', 'Number of clusters (simulation)', '2')\n    .option('--brokers <count>', 'Brokers per cluster (simulation)', '6')\n    .option('--topics <count>', 'Topics per cluster (simulation)', '10')\n    .option('--no-validation', 'Disable pipeline validation')\n    .option('--no-alerts', 'Disable alerting')\n    .option('--debug', 'Enable debug logging');\n  \n  program.parse();\n  \n  const options = program.opts();\n  \n  // Create and start dashboard\n  const dashboard = new MonitoringDashboard({\n    ...options,\n    updateInterval: parseInt(options.updateInterval),\n    platformInterval: parseInt(options.platformInterval),\n    clusters: parseInt(options.clusters),\n    brokers: parseInt(options.brokers),\n    topics: parseInt(options.topics),\n    enableValidation: !options.noValidation,\n    enableAlerts: !options.noAlerts\n  });\n  \n  dashboard.start().catch(error => {\n    console.error(chalk.red('❌ Failed to start dashboard:'), error);\n    process.exit(1);\n  });\n  \n  // Run validation every 5 minutes if enabled\n  if (!options.noValidation) {\n    setInterval(() => {\n      dashboard.runValidationCheck();\n    }, 5 * 60 * 1000);\n  }\n}\n\nmodule.exports = MonitoringDashboard;"