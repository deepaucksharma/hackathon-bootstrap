#!/usr/bin/env node

/**
 * New Relic Message Queues Platform - Unified Interface
 * 
 * This is the main entry point that consolidates all functional components:
 * - Core v1.0 platform (entities, simulation, streaming, dashboards)
 * - API and WebSocket for interactive control
 * 
 * This replaces the fragmented v2/ implementation with a clean, working solution.
 */

const EventEmitter = require('events');
const chalk = require('chalk');

// Core Components
const EntityFactory = require('../core/entities/entity-factory');
const EnhancedDataSimulator = require('../simulation/engines/enhanced-data-simulator');
const NewRelicStreamer = require('../simulation/streaming/new-relic-streamer');
// Dashboard components (optional)
let DashboardFramework, MessageQueuesContentProvider;
try {
  DashboardFramework = require('../dashboards/framework/core/dashboard-framework');
  MessageQueuesContentProvider = require('../dashboards/content/message-queues/message-queues-content-provider');
} catch (e) {
  // Dashboard features are optional
}

// Pattern Generator
const AdvancedPatternGenerator = require('../simulation/patterns/advanced-patterns');

// API Components (optional)
let SimulationAPI;
try {
  SimulationAPI = require('../simulation/api/simulation-api');
} catch (e) {
  // API is optional
}

/**
 * Unified Message Queues Platform
 * 
 * Provides a single, coherent interface to all platform capabilities.
 */
class MessageQueuesPlatform extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // Configuration with defaults
    this.config = {
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
      apiKey: config.apiKey || process.env.NEW_RELIC_USER_API_KEY || process.env.NEW_RELIC_API_KEY,
      ingestKey: config.ingestKey || process.env.NEW_RELIC_INGEST_KEY || config.apiKey,
      region: config.region || process.env.NEW_RELIC_REGION || 'US',
      dryRun: config.dryRun !== undefined ? config.dryRun : !this.hasValidCredentials(),
      streaming: {
        interval: config.streaming?.interval || 30000,
        batchSize: config.streaming?.batchSize || 100,
        enabled: config.streaming?.enabled !== false
      },
      api: {
        enabled: config.api?.enabled && SimulationAPI,
        port: config.api?.port || 3001,
        wsPort: config.api?.wsPort || 3002
      }
    };
    
    // Initialize components
    this.initializeComponents();
    
    // State management
    this.state = {
      running: false,
      topology: null,
      metrics: {},
      patterns: {}
    };
  }

  initializeComponents() {
    // Core components
    this.entityFactory = new EntityFactory({
      accountId: this.config.accountId
    });
    
    this.simulator = new EnhancedDataSimulator({
      enableAnomalies: true,
      anomalyProbability: 0.01,
      enablePatterns: true
    });
    
    this.streamer = new NewRelicStreamer({
      accountId: this.config.accountId,
      apiKey: this.config.ingestKey,
      region: this.config.region,
      dryRun: this.config.dryRun
    });
    
    // Enhanced components (if enabled)
    if (this.config.ml.enabled) {
      this.intelligentSimulator = new IntelligentSimulator({
        learnerOptions: {
          confidenceThreshold: this.config.ml.confidenceThreshold
        }
      });
      
      this.anomalyPredictor = new AnomalyPredictor();
    }
    
    // Dashboard framework (if available and credentials exist)
    if (DashboardFramework && this.hasValidCredentials()) {
      try {
        this.dashboardFramework = new DashboardFramework({
          apiKey: this.config.apiKey,
          accountId: this.config.accountId
        });
      } catch (e) {
        // Dashboard framework requires valid credentials
        console.log(chalk.gray('Dashboard framework not initialized (requires API credentials)'));
      }
    }
    
    // API server (if enabled)
    if (this.config.api.enabled && SimulationAPI) {
      this.apiServer = new SimulationAPI(
        this.config.api.port,
        this.config.api.wsPort
      );
      
      // Connect API to platform
      this.apiServer.simulator = this.simulator;
      this.apiServer.patternGenerator = this.patternGenerator;
    }
  }

  hasValidCredentials() {
    return !!(this.config.accountId && (this.config.apiKey || this.config.ingestKey));
  }

  /**
   * Create a topology with entities
   */
  async createTopology(provider = 'kafka', scale = 'medium') {
    console.log(chalk.cyan(`Creating ${scale} ${provider} topology...`));
    
    try {
      // Generate topology
      this.state.topology = this.simulator.generateTopology(provider, scale);
      
      // Apply ML patterns if available
      if (this.config.ml.enabled && this.intelligentSimulator) {
        await this.applyIntelligentPatterns();
      }
      
      this.emit('topology.created', {
        provider,
        scale,
        entities: {
          clusters: this.state.topology.clusters.length,
          brokers: this.state.topology.brokers.length,
          topics: this.state.topology.topics.length,
          queues: this.state.topology.queues.length
        }
      });
      
      console.log(chalk.green('✅ Topology created successfully'));
      return this.state.topology;
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to create topology:'), error.message);
      throw error;
    }
  }

  /**
   * Start the platform
   */
  async start() {
    if (this.state.running) {
      console.log(chalk.yellow('Platform is already running'));
      return;
    }
    
    console.log(chalk.cyan('\n🚀 Starting Message Queues Platform\n'));
    
    // Create topology if not exists
    if (!this.state.topology) {
      await this.createTopology();
    }
    
    // Start API server if enabled
    if (this.config.api.enabled && this.apiServer) {
      await this.apiServer.start();
      console.log(chalk.green(`✅ API Server started on port ${this.config.api.port}`));
      console.log(chalk.green(`✅ WebSocket server started on port ${this.config.api.wsPort}`));
      console.log(chalk.cyan(`\n🌐 Control Panel: http://localhost:${this.config.api.port}\n`));
    }
    
    // Start streaming
    if (this.config.streaming.enabled) {
      this.startStreaming();
    }
    
    this.state.running = true;
    this.emit('platform.started');
    
    console.log(chalk.green('✅ Platform started successfully'));
    
    if (this.config.dryRun) {
      console.log(chalk.yellow('\n⚠️  Running in DRY-RUN mode (no data sent to New Relic)'));
      console.log(chalk.gray('   Set NEW_RELIC_ACCOUNT_ID and NEW_RELIC_API_KEY to enable streaming\n'));
    }
  }

  /**
   * Start streaming data
   */
  startStreaming() {
    console.log(chalk.cyan('Starting data streaming...'));
    
    // Initial stream
    this.streamData();
    
    // Set up interval
    this.streamingInterval = setInterval(() => {
      this.streamData();
    }, this.config.streaming.interval);
    
    console.log(chalk.green(`✅ Streaming every ${this.config.streaming.interval / 1000}s`));
  }

  /**
   * Stream data for all entities
   */
  async streamData() {
    if (!this.state.topology) return;
    
    const events = [];
    const metrics = [];
    const timestamp = Date.now();
    
    try {
      // Update and collect cluster data
      for (const cluster of this.state.topology.clusters) {
        await this.updateEntityMetrics(cluster);
        
        events.push({
          eventType: 'MessageQueueCluster',
          timestamp,
          ...cluster,
          ...cluster.metrics
        });
        
        this.collectMetrics(metrics, cluster, timestamp);
      }
      
      // Update and collect broker data
      for (const broker of this.state.topology.brokers) {
        await this.updateEntityMetrics(broker);
        
        events.push({
          eventType: 'MessageQueueBroker',
          timestamp,
          ...broker,
          ...broker.metrics
        });
        
        this.collectMetrics(metrics, broker, timestamp);
      }
      
      // Update and collect topic data
      for (const topic of this.state.topology.topics) {
        await this.updateEntityMetrics(topic);
        
        events.push({
          eventType: 'MessageQueueTopic',
          timestamp,
          ...topic,
          ...topic.metrics
        });
        
        this.collectMetrics(metrics, topic, timestamp);
      }
      
      // Stream to New Relic
      if (events.length > 0) {
        await this.streamer.streamEvents(events);
      }
      
      if (metrics.length > 0) {
        await this.streamer.streamMetrics(metrics);
      }
      
      // Emit update event
      this.emit('metrics.updated', {
        timestamp,
        events: events.length,
        metrics: metrics.length
      });
      
      // Update state
      this.state.metrics = this.extractLatestMetrics();
      
    } catch (error) {
      console.error(chalk.red('Streaming error:'), error.message);
      this.emit('error', error);
    }
  }

  /**
   * Update metrics for an entity
   */
  async updateEntityMetrics(entity) {
    // Update simulation metrics
    this.simulator.updateEntityMetrics(entity);
  }

  /**
   * Collect metrics for streaming
   */
  collectMetrics(metrics, entity, timestamp) {
    const prefix = this.getMetricPrefix(entity.entityType);
    
    Object.entries(entity.metrics || {}).forEach(([name, value]) => {
      metrics.push({
        name: `${prefix}.${name}`,
        type: 'gauge',
        value,
        timestamp,
        attributes: {
          entityGuid: entity.guid,
          entityName: entity.name,
          entityType: entity.entityType,
          provider: entity.provider || 'unknown'
        }
      });
    });
  }

  /**
   * Get metric prefix for entity type
   */
  getMetricPrefix(entityType) {
    const prefixes = {
      'MESSAGE_QUEUE_CLUSTER': 'message.queue.cluster',
      'MESSAGE_QUEUE_BROKER': 'message.queue.broker',
      'MESSAGE_QUEUE_TOPIC': 'message.queue.topic',
      'MESSAGE_QUEUE_QUEUE': 'message.queue.queue'
    };
    return prefixes[entityType] || 'message.queue';
  }

  /**
   * Apply simulation patterns
   */
  applyPatterns() {
    if (!this.state.topology) return;
    
    // Apply provider-specific patterns
    const provider = this.state.topology.clusters[0]?.provider || 'kafka';
    this.state.patterns = this.patternGenerator.generateProviderPatterns(provider);
  }

  /**
   * Create and deploy dashboards
   */
  async createDashboards() {
    if (!this.hasValidCredentials()) {
      console.log(chalk.yellow('⚠️  Cannot create dashboards without valid API credentials'));
      return;
    }
    
    if (!this.dashboardFramework || !DashboardFramework || !MessageQueuesContentProvider) {
      console.log(chalk.yellow('⚠️  Dashboard components not available'));
      return;
    }
    
    console.log(chalk.cyan('\n📊 Creating Dashboards...\n'));
    
    try {
      const contentProvider = new MessageQueuesContentProvider();
      this.dashboardFramework.setContentProvider(contentProvider);
      
      // Register templates
      contentProvider.registerTemplates();
      
      // Create dashboards
      const dashboards = [];
      
      // Cluster Overview
      const clusterDashboard = await this.dashboardFramework.createDashboard(
        'cluster-overview',
        {
          accountId: this.config.accountId,
          providers: ['kafka', 'rabbitmq']
        }
      );
      dashboards.push(clusterDashboard);
      console.log(chalk.green('✅ Created Cluster Overview dashboard'));
      
      // Topic Analysis
      const topicDashboard = await this.dashboardFramework.createDashboard(
        'topic-analysis',
        {
          accountId: this.config.accountId
        }
      );
      dashboards.push(topicDashboard);
      console.log(chalk.green('✅ Created Topic Analysis dashboard'));
      
      return dashboards;
      
    } catch (error) {
      console.error(chalk.red('❌ Dashboard creation failed:'), error.message);
      throw error;
    }
  }

  /**
   * Inject an anomaly pattern
   */
  async injectAnomaly(type = 'spike', severity = 'moderate', duration = 60000) {
    if (!this.state.topology) {
      console.log(chalk.yellow('⚠️  Cannot inject anomaly without topology'));
      return;
    }
    
    // Select random entity
    const allEntities = [
      ...this.state.topology.brokers,
      ...this.state.topology.topics
    ];
    
    if (allEntities.length === 0) return;
    
    const targetEntity = allEntities[Math.floor(Math.random() * allEntities.length)];
    
    // Apply anomaly pattern to simulator
    this.simulator.injectAnomaly(targetEntity, type, severity);
    
    this.emit('anomaly.injected', {
      type,
      severity,
      duration,
      targetEntity: targetEntity.name
    });
    
    // Auto-recover after duration
    setTimeout(() => {
      this.simulator.clearAnomaly(targetEntity);
      this.emit('anomaly.recovered', { type, targetEntity: targetEntity.name });
    }, duration);
  }

  /**
   * Get current state
   */
  getState() {
    return {
      running: this.state.running,
      dryRun: this.config.dryRun,
      topology: this.state.topology ? {
        clusters: this.state.topology.clusters.length,
        brokers: this.state.topology.brokers.length,
        topics: this.state.topology.topics.length,
        queues: this.state.topology.queues.length
      } : null,
      metrics: this.state.metrics,
      patterns: Object.keys(this.state.patterns).length,
      api: {
        enabled: this.config.api.enabled,
        url: this.config.api.enabled ? `http://localhost:${this.config.api.port}` : null
      }
    };
  }

  /**
   * Stop the platform
   */
  async stop() {
    console.log(chalk.cyan('\n🛑 Stopping platform...\n'));
    
    // Stop streaming
    if (this.streamingInterval) {
      clearInterval(this.streamingInterval);
      this.streamingInterval = null;
    }
    
    // Stop API server
    if (this.apiServer) {
      await this.apiServer.stop();
    }
    
    this.state.running = false;
    this.emit('platform.stopped');
    
    console.log(chalk.green('✅ Platform stopped'));
  }

  /**
   * Extract latest metrics for state
   */
  extractLatestMetrics() {
    const metrics = {};
    
    if (!this.state.topology) return metrics;
    
    // Aggregate key metrics
    const allEntities = [
      ...this.state.topology.clusters,
      ...this.state.topology.brokers,
      ...this.state.topology.topics,
      ...this.state.topology.queues
    ];
    
    allEntities.forEach(entity => {
      if (entity.metrics) {
        Object.entries(entity.metrics).forEach(([key, value]) => {
          const metricKey = `${entity.entityType}.${key}`;
          if (!metrics[metricKey]) {
            metrics[metricKey] = { sum: 0, count: 0, avg: 0 };
          }
          metrics[metricKey].sum += value;
          metrics[metricKey].count += 1;
          metrics[metricKey].avg = metrics[metricKey].sum / metrics[metricKey].count;
        });
      }
    });
    
    return metrics;
  }

}

// Export platform class
module.exports = MessageQueuesPlatform;

// CLI interface
if (require.main === module) {
  const platform = new MessageQueuesPlatform({
    api: { enabled: true }
  });
  
  console.log(chalk.bold.magenta('\n🚀 New Relic Message Queues Platform\n'));
  console.log(chalk.gray('Unified platform with streaming simulation and API control\n'));
  
  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n');
    await platform.stop();
    process.exit(0);
  });
  
  // Start platform
  platform.start().catch(error => {
    console.error(chalk.red('Failed to start platform:'), error);
    process.exit(1);
  });
}