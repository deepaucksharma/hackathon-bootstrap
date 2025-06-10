#!/usr/bin/env node

/**
 * Unified Platform Runner
 * 
 * Complete implementation with:
 * - Real nri-kafka data integration
 * - Entity synthesis to New Relic
 * - Error recovery and circuit breakers
 * - Dashboard generation
 * - Beautiful data transformation pipeline documentation
 */

const chalk = require('chalk');
const { Command } = require('commander');
const path = require('path');
const fs = require('fs');

// Core components
const NriKafkaIntegration = require('./infrastructure/nri-kafka-integration');
const EntitySynthesisEngine = require('./core/entity-synthesis/entity-synthesis-engine');
const ErrorRecoveryManager = require('./core/resilience/error-recovery-manager');
const NewRelicStreamer = require('./simulation/streaming/new-relic-streamer');
const EnhancedPipelineDocumenter = require('./core/documentation/enhanced-pipeline-documenter');
const DataSimulator = require('./simulation/engines/data-simulator');
const { getConfigManager } = require('./core/config/config-manager');

// Dashboard components
let DashboardGenerator, DashboardOrchestrator;
try {
  DashboardGenerator = require('./dashboards/generators/dashboard-generator');
  DashboardOrchestrator = require('./dashboards/lib/dashboard-orchestrator');
} catch (e) {
  console.warn(chalk.yellow('⚠️  Dashboard components not available'));
}

// Load environment
require('dotenv').config();

console.log(chalk.blue.bold(`
╔═══════════════════════════════════════════════════════════════╗
║      New Relic Message Queues Platform - Unified Runner       ║
║                    Complete Implementation                     ║
╚═══════════════════════════════════════════════════════════════╝
`));

/**
 * Unified Platform Implementation
 */
class UnifiedMessageQueuesPlatform {
  constructor(options = {}) {
    // Configuration
    this.configManager = getConfigManager(options);
    this.config = {
      ...this.configManager.getConfig(),
      mode: options.mode || 'simulation',
      interval: options.interval || 60,
      provider: options.provider || 'kafka',
      clusterNames: options.clusterNames || ['default-cluster'],
      generateDashboards: options.generateDashboards !== false,
      generateDocs: options.generateDocs !== false,
      ...options
    };

    // Display configuration
    this.displayConfiguration();

    // Initialize components
    this.initializeComponents();
    
    // Statistics
    this.stats = {
      cycles: 0,
      totalEntities: 0,
      totalErrors: 0,
      successfulStreams: 0,
      failedStreams: 0
    };
  }

  /**
   * Display configuration
   */
  displayConfiguration() {
    console.log(chalk.cyan('📋 Configuration:'));
    console.log(chalk.gray(`   Mode: ${this.config.mode}`));
    console.log(chalk.gray(`   Provider: ${this.config.provider}`));
    console.log(chalk.gray(`   Account ID: ${this.config.accountId}`));
    console.log(chalk.gray(`   Region: ${this.config.region || 'US'}`));
    console.log(chalk.gray(`   Interval: ${this.config.interval}s`));
    
    if (this.config.mode === 'infrastructure') {
      console.log(chalk.gray(`   Clusters: ${this.config.clusterNames.join(', ')}`));
      console.log(chalk.gray(`   API Key: ${this.config.apiKey ? '✅ Configured' : '❌ Missing'}`));
    }
    
    console.log('');
  }

  /**
   * Initialize all components
   */
  initializeComponents() {
    console.log(chalk.blue('🔧 Initializing components...'));
    
    // 1. Error Recovery Manager
    this.errorRecovery = new ErrorRecoveryManager({
      enableMetrics: true,
      enableHealthChecks: true,
      maxRetries: 3,
      retryDelay: 2000
    });
    
    this.setupErrorRecoveryHandlers();
    
    // 2. Data collectors based on mode
    if (this.config.mode === 'infrastructure') {
      this.nriKafka = new NriKafkaIntegration({
        accountId: this.config.accountId,
        apiKey: this.config.apiKey,
        region: this.config.region
      });
      
      // Register with error recovery
      this.errorRecovery.registerComponent('nri-kafka', this.nriKafka, {
        type: 'data-collector',
        critical: true,
        recoveryStrategies: ['retry', 'circuit-breaker', 'fallback'],
        fallback: () => this.getFallbackData(),
        circuitBreakerConfig: {
          failureThreshold: 3,
          timeout: 30000,
          retryTimeout: 60000
        }
      });
    } else {
      this.simulator = new DataSimulator({
        anomalyRate: 0.05,
        businessHoursEnabled: true,
        accountId: this.config.accountId
      });
      
      // Create initial topology for simulation mode
      console.log(chalk.gray('   Creating simulation topology...'));
      this.topology = this.simulator.createTopology({
        provider: this.config.provider,
        clusterCount: this.config.clusters || 1,
        brokersPerCluster: this.config.brokers || 3,
        topicsPerCluster: this.config.topics || 5,
        consumerGroupsPerCluster: this.config.consumerGroups || 3
      });
      console.log(chalk.green(`   ✓ Created topology with ${this.topology.clusters.length} clusters`));
    }
    
    // 3. Entity Synthesis Engine
    this.synthesisEngine = new EntitySynthesisEngine({
      accountId: this.config.accountId,
      provider: this.config.provider,
      environment: this.config.environment || 'production'
    });
    
    this.errorRecovery.registerComponent('synthesis-engine', this.synthesisEngine, {
      type: 'data-processor',
      critical: true,
      recoveryStrategies: ['retry', 'circuit-breaker']
    });
    
    // 4. New Relic Streamer
    this.streamer = new NewRelicStreamer(this.configManager.getStreamingConfig());
    
    this.errorRecovery.registerComponent('streamer', this.streamer, {
      type: 'data-streamer',
      critical: true,
      recoveryStrategies: ['retry', 'circuit-breaker', 'cache'],
      circuitBreakerConfig: {
        failureThreshold: 5,
        timeout: 25000,
        retryTimeout: 30000
      }
    });
    
    // 5. Pipeline Documenter
    this.pipelineDocumenter = new EnhancedPipelineDocumenter({
      outputDir: path.join(__dirname, 'data-pipeline-docs'),
      includeTimestamp: true
    });
    
    // 6. Dashboard Generator (if available)
    if (DashboardGenerator && this.config.generateDashboards) {
      this.dashboardGenerator = new DashboardGenerator({
        accountId: this.config.accountId,
        apiKey: this.config.userApiKey || this.config.apiKey
      });
      
      this.errorRecovery.registerComponent('dashboard-generator', this.dashboardGenerator, {
        type: 'dashboard-generator',
        critical: false,
        recoveryStrategies: ['retry']
      });
    }
    
    console.log(chalk.green('✅ All components initialized'));
  }

  /**
   * Setup error recovery event handlers
   */
  setupErrorRecoveryHandlers() {
    this.errorRecovery.on('error', ({ component, error }) => {
      console.warn(chalk.yellow(`⚠️  Error in ${component}: ${error}`));
      this.stats.totalErrors++;
    });
    
    this.errorRecovery.on('recovery.success', ({ component, strategy }) => {
      console.log(chalk.green(`✅ Recovered ${component} using ${strategy}`));
    });
    
    this.errorRecovery.on('circuit.opened', ({ component }) => {
      console.error(chalk.red(`🔴 Circuit opened for ${component}`));
    });
    
    this.errorRecovery.on('circuit.closed', ({ component }) => {
      console.log(chalk.green(`🟢 Circuit closed for ${component}`));
    });
    
    this.errorRecovery.on('system.degraded', ({ critical, unhealthy }) => {
      console.error(chalk.red.bold(`🚨 SYSTEM DEGRADED - Critical: ${critical.join(', ')}`));
    });
  }

  /**
   * Main execution cycle
   */
  async runCycle() {
    this.stats.cycles++;
    console.log(chalk.blue(`\n📊 Cycle ${this.stats.cycles} - ${new Date().toISOString()}`));
    
    try {
      // Phase 1: Data Collection
      console.log(chalk.cyan('1️⃣  Data Collection Phase'));
      const rawData = await this.collectData();
      
      if (!rawData || this.isEmptyData(rawData)) {
        console.warn(chalk.yellow('⚠️  No data collected, skipping cycle'));
        return;
      }
      
      // Capture raw data for documentation
      this.pipelineDocumenter.captureRawData(rawData);
      
      // Phase 2: Entity Synthesis
      console.log(chalk.cyan('2️⃣  Entity Synthesis Phase'));
      const { entities, relationships } = await this.errorRecovery.executeWithRecovery(
        'synthesis-engine',
        () => this.synthesisEngine.synthesize(rawData)
      );
      
      this.stats.totalEntities += entities.length;
      console.log(chalk.gray(`   ✅ Synthesized ${entities.length} entities with ${relationships.length} relationships`));
      
      // Capture synthesized data for documentation
      this.pipelineDocumenter.captureSynthesizedData(entities, relationships);
      
      // Phase 3: Stream to New Relic
      console.log(chalk.cyan('3️⃣  Streaming Phase'));
      const streamResult = await this.errorRecovery.executeWithRecovery(
        'streamer',
        () => this.streamer.streamEvents(entities),
        {
          cache: this.entityCache,
          cacheKey: 'last-entities'
        }
      );
      
      // Check if streaming was successful
      if (streamResult && streamResult.cached) {
        // Entities were cached due to streaming failure
        console.log(chalk.yellow(`   ⚠️  Cached ${entities.length} entities due to streaming issue`));
        this.stats.failedStreams++;
      } else if (streamResult === undefined || streamResult === null || streamResult.error) {
        // Streaming failed
        console.log(chalk.red(`   ❌ Failed to stream entities`));
        this.stats.failedStreams++;
      } else {
        // Streaming succeeded
        this.stats.successfulStreams++;
        console.log(chalk.gray(`   ✅ Streamed ${entities.length} entities to New Relic`));
      }
      
      // Phase 4: Generate Documentation
      if (this.config.generateDocs) {
        console.log(chalk.cyan('4️⃣  Documentation Phase'));
        this.generateComprehensiveDocumentation();
      }
      
      // Phase 5: Generate/Update Dashboards (first cycle only)
      if (this.config.generateDashboards && this.stats.cycles === 1 && this.dashboardGenerator) {
        console.log(chalk.cyan('5️⃣  Dashboard Generation Phase'));
        await this.generateDashboards(entities);
      }
      
      // Display cycle summary
      this.displayCycleSummary(entities);
      
    } catch (error) {
      console.error(chalk.red('❌ Cycle failed:'), error.message);
      this.stats.totalErrors++;
    }
  }

  /**
   * Collect data based on mode
   */
  async collectData() {
    if (this.config.mode === 'infrastructure') {
      // Real nri-kafka data collection
      return await this.errorRecovery.executeWithRecovery(
        'nri-kafka',
        () => this.nriKafka.monitorClusters(this.config.clusterNames)
      );
    } else {
      // Simulation mode
      return this.generateSimulationData();
    }
  }

  /**
   * Generate simulation data
   */
  generateSimulationData() {
    try {
      const topology = this.topology; // Use pre-created topology
    
    // Convert to raw data format
    const rawData = {
      brokers: [],
      topics: [],
      consumerGroups: [],
      clusters: []
    };
    
    // Add cluster data
    topology.clusters.forEach(cluster => {
      rawData.clusters.push({
        eventType: 'KafkaClusterSample',
        clusterName: cluster.clusterName,
        'cluster.brokersCount': cluster.brokerCount,
        'cluster.topicsCount': cluster.topicCount,
        'cluster.partitionsCount': cluster.totalPartitions || 50,
        'cluster.underReplicatedPartitions': 0,
        'cluster.offlinePartitionsCount': 0
      });
    });
    
    // Add broker data with metrics
    topology.brokers.forEach(broker => {
      this.simulator.updateBrokerMetrics(broker);
      rawData.brokers.push({
        eventType: 'KafkaBrokerSample',
        hostname: broker.hostname,
        clusterName: broker.clusterName,
        'broker.id': broker.brokerId,
        'broker.bytesInPerSecond': broker['broker.network.throughput'] * 0.4,
        'broker.bytesOutPerSecond': broker['broker.network.throughput'] * 0.6,
        'broker.messagesInPerSecond': Math.floor(broker['broker.network.throughput'] / 1024),
        'request.handlerIdle': 100 - broker['broker.cpu.usage'],
        'jvm.heapUsed': broker['broker.memory.usage'] * 10000000,
        'jvm.heapMax': 1000000000,
        'underReplicatedPartitions': 0,
        'activeControllerCount': broker.isController ? 1 : 0
      });
    });
    
    // Add topic data
    topology.topics.forEach(topic => {
      this.simulator.updateTopicMetrics(topic);
      rawData.topics.push({
        eventType: 'KafkaTopicSample',
        topic: topic.name,
        clusterName: topic.clusterName,
        'topic.messagesInPerSecond': topic['topic.throughput.in'],
        'topic.bytesInPerSecond': topic['topic.throughput.in'] * 1024,
        'topic.bytesOutPerSecond': topic['topic.throughput.out'] * 1024,
        'topic.partitionsCount': topic.partitionCount,
        'topic.replicationFactor': topic.replicationFactor,
        'topic.underReplicatedPartitions': 0
      });
    });
    
    // Add consumer group data
    if (topology.consumerGroups) {
      topology.consumerGroups.forEach(group => {
        this.simulator.updateConsumerGroupMetrics(group);
        // Simulate multiple consumers per group
        let topics = [];
        
        // Get topics from the consumer group entity
        if (Array.isArray(group.topics)) {
          topics = group.topics;
        } else if (typeof group.topics === 'string') {
          topics = group.topics.split(',').map(t => t.trim());
        } else if (group['consumerGroup.topics']) {
          topics = typeof group['consumerGroup.topics'] === 'string' 
            ? group['consumerGroup.topics'].split(',').map(t => t.trim())
            : Array.isArray(group['consumerGroup.topics']) 
              ? group['consumerGroup.topics'] 
              : [];
        }
        
        if (topics.length === 0) {
          // If no topics specified, use some default topics
          topics = ['events', 'logs'];
        }
        topics.forEach(topicName => {
          rawData.consumerGroups.push({
            eventType: 'KafkaConsumerSample',
            'consumer.group.id': group.name,
            'consumer.clientId': `${group.name}-client-1`,
            topic: topicName.trim(),
            clusterName: group.clusterName || group['cluster.name'] || 'default-cluster',
            'consumer.lag': Math.floor((group['consumerGroup.lag'] || 0) / topics.length),
            'consumer.messageRate': Math.floor(Math.random() * 1000),
            'consumer.bytesConsumedRate': Math.floor(Math.random() * 1000000)
          });
        });
      });
    }
    
    return rawData;
    } catch (error) {
      console.error(chalk.red('❌ Error generating simulation data:'), error);
      throw error;
    }
  }

  /**
   * Get fallback data for circuit breaker
   */
  getFallbackData() {
    console.log(chalk.yellow('⚠️  Using fallback data due to collection failure'));
    // Return minimal data to keep platform running
    return {
      brokers: [],
      topics: [],
      consumerGroups: [],
      clusters: [{
        eventType: 'KafkaClusterSample',
        clusterName: 'fallback-cluster',
        'cluster.brokersCount': 0,
        'cluster.topicsCount': 0,
        'cluster.partitionsCount': 0
      }]
    };
  }

  /**
   * Check if data is empty
   */
  isEmptyData(data) {
    return !data || (
      (!data.brokers || data.brokers.length === 0) &&
      (!data.topics || data.topics.length === 0) &&
      (!data.clusters || data.clusters.length === 0)
    );
  }

  /**
   * Generate comprehensive documentation
   */
  generateComprehensiveDocumentation() {
    try {
      // Generate the comprehensive report
      const result = this.pipelineDocumenter.generateComprehensiveDoc(this.config.mode);
      
      console.log(chalk.green(`   ✅ Generated comprehensive pipeline report`));
      console.log(chalk.gray(`   📄 View at: ${result.rootPath}`));
      
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Failed to generate documentation: ${error.message}`));
    }
  }

  /**
   * Generate dashboards
   */
  async generateDashboards(entities) {
    try {
      if (!this.dashboardGenerator) {
        console.warn(chalk.yellow('⚠️  Dashboard generator not available'));
        return;
      }
      
      // Generate dashboard definition
      const dashboardDef = await this.errorRecovery.executeWithRecovery(
        'dashboard-generator',
        () => this.dashboardGenerator.generateDashboard({
          name: `Message Queues - ${this.config.provider}`,
          entities: entities.slice(0, 100), // Limit for demo
          provider: this.config.provider
        })
      );
      
      console.log(chalk.green(`✅ Generated dashboard definition with ${dashboardDef.pages.length} pages`));
      
      // Save dashboard definition
      const dashboardPath = path.join(__dirname, 'dashboards', 'generated', `${this.config.provider}-dashboard.json`);
      fs.mkdirSync(path.dirname(dashboardPath), { recursive: true });
      fs.writeFileSync(dashboardPath, JSON.stringify(dashboardDef, null, 2));
      
      console.log(chalk.blue(`📄 Dashboard saved to: ${dashboardPath}`));
      
      // In production, would deploy to New Relic via NerdGraph API
      
    } catch (error) {
      console.error(chalk.red('❌ Dashboard generation failed:'), error.message);
    }
  }

  /**
   * Display cycle summary
   */
  displayCycleSummary(entities) {
    // Group entities by type
    const entityTypes = {};
    entities.forEach(entity => {
      const type = entity.entityType || 'UNKNOWN';
      entityTypes[type] = (entityTypes[type] || 0) + 1;
    });
    
    // Find clusters for health summary
    const clusters = entities.filter(e => e.entityType === 'MESSAGE_QUEUE_CLUSTER');
    
    console.log(chalk.green('\n📈 Cycle Summary:'));
    console.log(chalk.gray('   Entity Types:'));
    Object.entries(entityTypes).forEach(([type, count]) => {
      console.log(chalk.gray(`     - ${type}: ${count}`));
    });
    
    if (clusters.length > 0) {
      console.log(chalk.gray('   Cluster Health:'));
      clusters.forEach(cluster => {
        const health = cluster['cluster.health.score'] || 0;
        const healthIcon = health >= 80 ? '🟢' : health >= 60 ? '🟡' : '🔴';
        console.log(chalk.gray(`     - ${cluster['entity.name']}: ${healthIcon} ${health}%`));
      });
    }
    
    // Overall stats
    console.log(chalk.gray(`   Total Entities Processed: ${this.stats.totalEntities}`));
    console.log(chalk.gray(`   Successful Streams: ${this.stats.successfulStreams}`));
    console.log(chalk.gray(`   Total Errors: ${this.stats.totalErrors}`));
  }

  /**
   * Start the platform
   */
  async start() {
    console.log(chalk.green('\n✨ Starting Unified Message Queues Platform...'));
    
    // Initialize entity cache
    this.entityCache = new Map();
    
    // Show system health
    const health = this.errorRecovery.getSystemHealth();
    console.log(chalk.blue(`🏥 System Health: ${health.status}`));
    
    // Run first cycle
    await this.runCycle();
    
    // Schedule subsequent cycles
    if (this.config.continuous !== false) {
      this.intervalId = setInterval(() => {
        this.runCycle().catch(error => {
          console.error(chalk.red('❌ Uncaught cycle error:'), error);
        });
      }, this.config.interval * 1000);
      
      console.log(chalk.gray(`\n⏱️  Running every ${this.config.interval} seconds. Press Ctrl+C to stop.`));
    }
  }

  /**
   * Stop the platform
   */
  async stop() {
    console.log(chalk.yellow('\n🛑 Stopping platform...'));
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    // Shutdown components
    this.errorRecovery.shutdown();
    
    // Final stats
    console.log(chalk.blue('\n📊 Final Statistics:'));
    console.log(chalk.gray(`   Total Cycles: ${this.stats.cycles}`));
    console.log(chalk.gray(`   Total Entities: ${this.stats.totalEntities}`));
    console.log(chalk.gray(`   Success Rate: ${this.calculateSuccessRate()}%`));
    console.log(chalk.gray(`   Total Errors: ${this.stats.totalErrors}`));
    
    // System health report
    const finalHealth = this.errorRecovery.getSystemHealth();
    console.log(chalk.blue('\n🏥 Final System Health:'));
    console.log(chalk.gray(`   Status: ${finalHealth.status}`));
    console.log(chalk.gray(`   Components: ${finalHealth.components.healthy}/${finalHealth.components.total} healthy`));
    
    console.log(chalk.green('\n✅ Platform stopped successfully'));
  }

  /**
   * Calculate success rate
   */
  calculateSuccessRate() {
    const totalAttempts = this.stats.successfulStreams + this.stats.failedStreams;
    if (totalAttempts === 0) return 100;
    return ((this.stats.successfulStreams / totalAttempts) * 100).toFixed(1);
  }
}

// CLI Implementation
const program = new Command();

program
  .name('run-platform-unified')
  .description('New Relic Message Queues Platform - Unified Runner')
  .version('2.0.0');

program
  .option('-m, --mode <mode>', 'Operation mode (infrastructure|simulation)', 'simulation')
  .option('-p, --provider <provider>', 'Message queue provider', 'kafka')
  .option('-i, --interval <seconds>', 'Update interval in seconds', '60')
  .option('--clusters <names>', 'Comma-separated cluster names (infrastructure mode)')
  .option('--account-id <id>', 'New Relic account ID')
  .option('--api-key <key>', 'New Relic API key')
  .option('--user-api-key <key>', 'New Relic User API key')
  .option('--region <region>', 'New Relic region (US|EU)', 'US')
  .option('--no-continuous', 'Run once and exit')
  .option('--no-dashboards', 'Skip dashboard generation')
  .option('--no-docs', 'Skip documentation generation')
  .option('--debug', 'Enable debug logging');

program.parse(process.argv);

const options = program.opts();

// Enable debug if requested
if (options.debug) {
  require('debug').enable('platform:*');
}

// Parse cluster names
if (options.clusters) {
  options.clusterNames = options.clusters.split(',').map(c => c.trim());
}

// Main execution
async function main() {
  const platform = new UnifiedMessageQueuesPlatform({
    ...options,
    interval: parseInt(options.interval),
    generateDashboards: options.dashboards,
    generateDocs: options.docs
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await platform.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await platform.stop();
    process.exit(0);
  });
  
  // Start platform
  await platform.start();
}

// Run
main().catch(error => {
  console.error(chalk.red('\n❌ Fatal error:'), error);
  process.exit(1);
});