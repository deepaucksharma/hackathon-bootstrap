#!/usr/bin/env node

/**
 * New Relic Message Queues Platform
 * 
 * Main entry point for the platform supporting three modes:
 * 1. Infrastructure - Transform real nri-kafka data to MESSAGE_QUEUE entities
 * 2. Simulation - Generate test data for development and demos
 * 3. Hybrid - Combine real and simulated data
 */

const { Command } = require('commander');
const { EventEmitter } = require('events');
const debug = require('debug')('platform:main');
const chalk = require('chalk');
const path = require('path');
const DataModelExtractor = require('./core/data-models/data-model-extractor');

// Core components
const { EntityFactory } = require('./core/entities');
const DataSimulator = require('./simulation/engines/data-simulator');
const NewRelicStreamer = require('./simulation/streaming/new-relic-streamer');
const ConfigValidator = require('./core/config-validator');
const { getConfigManager } = require('./core/config/config-manager');
const HybridModeManager = require('./core/hybrid-mode-manager');
const RelationshipManager = require('./core/relationships/relationship-manager');
const ErrorRecoveryManager = require('./core/resilience/error-recovery-manager');

// API components
const ApiServer = require('./api/server');
const { getHealthCheckService } = require('./core/health/health-check');
const { getPrometheusExporter } = require('./core/metrics/prometheus-exporter');

// Infrastructure components
const InfraAgentCollector = require('./infrastructure/collectors/infra-agent-collector');
const MultiClusterCollector = require('./infrastructure/collectors/multi-cluster-collector');
const NriKafkaTransformer = require('./infrastructure/transformers/nri-kafka-transformer');

// Enhanced infrastructure components
let EnhancedKafkaCollector, ConsumerOffsetCollector;
try {
  EnhancedKafkaCollector = require('./infrastructure/collectors/enhanced-kafka-collector');
  ConsumerOffsetCollector = require('./infrastructure/collectors/consumer-offset-collector');
} catch (e) {
  // Enhanced features are optional
}

// Dashboard components (optional)
let DashboardFramework, MessageQueuesContentProvider;
try {
  DashboardFramework = require('./dashboards/framework/core/dashboard-framework');
  MessageQueuesContentProvider = require('./dashboards/content/message-queues/message-queues-content-provider');
} catch (e) {
  // Dashboard features are optional
}

// Load environment variables
require('dotenv').config();

class MessageQueuesPlatform extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Use centralized config manager
    this.configManager = getConfigManager(options);
    this.options = {
      ...this.configManager.getConfig(),
      mode: options.mode || 'simulation',
      interval: options.interval || 60,
      provider: options.provider || 'kafka',
      // Enhanced collection options
      useEnhancedCollector: options.useEnhancedCollector !== false,
      enableConsumerLagCollection: options.enableConsumerLagCollection !== false,
      enableDetailedTopicMetrics: options.enableDetailedTopicMetrics !== false,
      brokerWorkerPoolSize: options.brokerWorkerPoolSize || 5,
      topicWorkerPoolSize: options.topicWorkerPoolSize || 8,
      consumerWorkerPoolSize: options.consumerWorkerPoolSize || 3,
      // API options
      apiEnabled: options.apiEnabled !== false,
      apiPort: options.apiPort || 3000,
      apiHost: options.apiHost || '0.0.0.0',
      ...options
    };
    
    this.validateConfig();
    this.setupErrorRecovery();
    this.setupComponents();
    this.setupApiServer();
    this.setupMetrics();
    this.setupDataModelExtractor();
    
    this.running = false;
    this.intervalId = null;
    this.initialized = false;
  }
  
  validateConfig() {
    // Use the comprehensive config validator
    const validator = new ConfigValidator();
    const result = validator.validate(this.options);
    
    // Print warnings and info
    if (result.warnings.length > 0) {
      console.log(chalk.yellow('\nConfiguration warnings:'), result.warnings.map(w => w.message));
    }
    
    // Throw error if validation fails
    if (!result.valid) {
      validator.printReport(result);
      throw new Error('Configuration validation failed. Please fix the errors above.');
    }
    
    // Show helpful info in debug mode
    if (this.options.debug || process.env.DEBUG) {
      validator.printReport(result);
    }
  }
  
  setupErrorRecovery() {
    // Initialize error recovery manager
    this.errorRecovery = new ErrorRecoveryManager({
      enableMetrics: true,
      enableHealthChecks: true,
      healthCheckInterval: 30000,
      maxConcurrentRecoveries: 3
    });
    
    // Set up error recovery event handlers
    this.errorRecovery.on('componentError', ({ component, error, timestamp }) => {
      console.warn(chalk.yellow(`⚠️ Component error in ${component}: ${error}`));
      this.emit('component.error', { component, error, timestamp });
    });
    
    this.errorRecovery.on('circuitOpened', ({ component }) => {
      console.warn(chalk.red(`🔴 Circuit opened for ${component}`));
      this.emit('circuit.opened', { component });
    });
    
    this.errorRecovery.on('circuitClosed', ({ component }) => {
      console.log(chalk.green(`🟢 Circuit closed for ${component}`));
      this.emit('circuit.closed', { component });
    });
    
    this.errorRecovery.on('healthUpdate', (healthData) => {
      if (this.options.debug && healthData.issues.length > 0) {
        console.log(chalk.yellow(`🏥 Health check: ${healthData.issues.length} issues detected`));
      }
    });
    
    debug('Error recovery manager initialized');
  }
  
  setupComponents() {
    // Entity factory for all modes
    this.entityFactory = new EntityFactory({
      defaultProvider: this.options.provider,
      defaultAccountId: this.options.accountId
    });
    
    // Relationship manager for entity relationships
    this.relationshipManager = new RelationshipManager();
    
    // Mode-specific setup
    switch (this.options.mode) {
      case 'infrastructure':
        this.setupInfrastructureMode();
        break;
        
      case 'simulation':
        this.setupSimulationMode();
        break;
        
      case 'hybrid':
        this.setupHybridMode();
        break;
        
      default:
        throw new Error(`Unknown mode: ${this.options.mode}`);
    }
  }
  
  setupApiServer() {
    if (!this.options.apiEnabled) {
      debug('API server disabled');
      return;
    }
    
    // Initialize API server
    this.apiServer = new ApiServer(this, {
      port: this.options.apiPort,
      host: this.options.apiHost
    });
    
    debug('API server configured on %s:%d', this.options.apiHost, this.options.apiPort);
  }
  
  setupMetrics() {
    // Initialize Prometheus metrics exporter
    this.prometheusExporter = getPrometheusExporter();
    
    // Set up metrics update interval
    this.metricsUpdateInterval = setInterval(() => {
      try {
        this.prometheusExporter.updateFromPlatformStats(this);
      } catch (error) {
        debug('Error updating Prometheus metrics:', error);
      }
    }, 30000); // Update every 30 seconds
    
    debug('Prometheus metrics exporter initialized');
  }

  setupDataModelExtractor() {
    // Initialize data model extractor for debugging and documentation
    const extractorOptions = {
      outputFormat: this.options.showDataModel ? 'console' : 'silent',
      outputPath: this.options.saveDataModel || './data-model-output.json',
      includeMetadata: true,
      prettyPrint: true
    };
    
    this.dataModelExtractor = new DataModelExtractor(extractorOptions);
    this.showDataModel = this.options.showDataModel || false;
    
    // Store source data for documentation
    this.sourceDataCapture = null;
    
    // Initialize pipeline documenter for beautiful markdown generation
    const PipelineDocumenter = require('./core/documentation/pipeline-documenter');
    this.pipelineDocumenter = new PipelineDocumenter({
      outputDir: path.join(__dirname, 'data-pipeline-docs'),
      includeTimestamp: true,
      prettifyJson: true
    });
    
    debug('Data model extractor initialized with options:', extractorOptions);
    debug('Pipeline documenter initialized for beautiful documentation');
  }
  
  setupInfrastructureMode() {
    debug('Setting up infrastructure mode');
    
    // Use enhanced collector if available and enabled
    if (this.options.multiCluster || this.options.clusterFilter) {
      console.log(chalk.blue('🌐 Using Multi-Cluster Collector'));
      this.collector = new MultiClusterCollector({
        ...this.configManager.getNewRelicConfig(),
        clusterFilter: this.options.clusterFilter,
        enableClusterDiscovery: this.options.enableClusterDiscovery !== false,
        maxClustersPerQuery: this.options.maxClustersPerQuery || 10
      });
      this.infraCollector = this.collector;
    } else if (this.options.useEnhancedCollector && EnhancedKafkaCollector) {
      console.log(chalk.blue('🚀 Using Enhanced Kafka Collector'));
      this.collector = new EnhancedKafkaCollector({
        ...this.configManager.getNewRelicConfig(),
        brokerWorkerPoolSize: this.options.brokerWorkerPoolSize,
        topicWorkerPoolSize: this.options.topicWorkerPoolSize,
        consumerWorkerPoolSize: this.options.consumerWorkerPoolSize,
        enableDetailedTopicMetrics: this.options.enableDetailedTopicMetrics,
        enableConsumerLagCollection: this.options.enableConsumerLagCollection
      });
      
      // Use standard transformer with enhanced features enabled if supported
      this.transformer = new NriKafkaTransformer(this.options.accountId, {
        enableEnhancedMetrics: true,
        enablePerformanceOptimizations: true,
        enableValidation: true
      });
      
      // Set up consumer offset collector if enabled
      if (this.options.enableConsumerLagCollection && ConsumerOffsetCollector) {
        this.consumerOffsetCollector = new ConsumerOffsetCollector({
          ...this.configManager.getNewRelicConfig(),
          workerPoolSize: this.options.consumerWorkerPoolSize
        });
      }
    } else {
      console.log(chalk.yellow('📊 Using Standard Infrastructure Collector'));
      this.collector = new InfraAgentCollector(this.configManager.getNewRelicConfig());
      this.transformer = new NriKafkaTransformer(this.options.accountId);
    }
    
    this.streamer = new NewRelicStreamer(this.configManager.getStreamingConfig());
    
    // Register components with error recovery
    this.errorRecovery.registerComponent('infra-collector', this.collector, {
      type: 'data-collector',
      critical: true,
      healthCheck: () => this.collector.checkKafkaIntegration(),
      circuitBreakerConfig: {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 30000,
        retryDelay: 10000
      }
    });
    
    // Register consumer offset collector if available
    if (this.consumerOffsetCollector) {
      this.errorRecovery.registerComponent('consumer-offset-collector', this.consumerOffsetCollector, {
        type: 'data-collector',
        critical: false,
        healthCheck: () => this.consumerOffsetCollector.testConnection(),
        circuitBreakerConfig: {
          failureThreshold: 5,
          successThreshold: 3,
          timeout: 20000,
          retryDelay: 5000
        }
      });
    }
    
    this.errorRecovery.registerComponent('streamer', this.streamer, {
      type: 'data-streamer',
      critical: true,
      healthCheck: () => this.testStreamerConnection(),
      circuitBreakerConfig: {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 25000,
        retryDelay: 8000
      }
    });
  }
  
  setupSimulationMode() {
    debug('Setting up simulation mode');
    
    // Use EnhancedDataSimulator if available, fallback to basic
    try {
      const EnhancedDataSimulator = require('./simulation/engines/enhanced-data-simulator');
      this.simulator = new EnhancedDataSimulator({
        anomalyRate: this.options.anomalyRate || 0.05,
        businessHoursEnabled: true
      });
    } catch (e) {
      this.simulator = new DataSimulator({
        anomalyRate: this.options.anomalyRate || 0.05,
        businessHoursEnabled: true
      });
    }
    
    this.streamer = new NewRelicStreamer(this.configManager.getStreamingConfig());
    
    // Register streamer with error recovery
    this.errorRecovery.registerComponent('streamer', this.streamer, {
      type: 'data-streamer',
      critical: true,
      healthCheck: () => this.testStreamerConnection(),
      circuitBreakerConfig: {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 25000,
        retryDelay: 8000
      }
    });
    
    // Create initial topology
    if (this.options.autoCreate !== false) {
      this.topology = this.createTopology();
    }
  }
  
  setupHybridMode() {
    debug('Setting up hybrid mode');
    
    // Setup infrastructure components
    this.setupInfrastructureMode();
    
    // Setup hybrid mode manager
    this.hybridManager = new HybridModeManager({
      accountId: this.options.accountId,
      debug: this.options.debug,
      fillGaps: this.options.hybrid?.fillGaps !== false
    });
    
    // Also setup simulation for gaps
    try {
      const EnhancedDataSimulator = require('./simulation/engines/enhanced-data-simulator');
      this.simulator = new EnhancedDataSimulator({
        anomalyRate: this.options.anomalyRate || 0.05
      });
    } catch (e) {
      this.simulator = new DataSimulator({
        anomalyRate: this.options.anomalyRate || 0.05
      });
    }
    
    // Create desired topology for gap detection
    this.desiredTopology = this.options.topology || {
      clusters: [{ name: `${this.options.provider}-cluster`, provider: this.options.provider }],
      brokers: Array.from({ length: this.options.brokers || 3 }, (_, i) => ({
        id: i + 1,
        clusterName: `${this.options.provider}-cluster`
      })),
      topics: this.options.expectedTopics || []
    };
  }
  
  createTopology() {
    debug('Creating topology');
    
    const topology = this.simulator.createTopology({
      provider: this.options.provider,
      clusterCount: this.options.clusters || 1,
      brokersPerCluster: this.options.brokers || 3,
      topicsPerCluster: this.options.topics || 5,
      consumerGroupsPerCluster: this.options.consumerGroups || 5,
      environment: this.options.environment || 'production'
    });
    
    // Build relationships for each cluster
    topology.clusters.forEach(cluster => {
      const clusterEntities = {
        brokers: topology.brokers.filter(b => b.clusterName === cluster.clusterName),
        topics: topology.topics.filter(t => t.clusterName === cluster.clusterName),
        consumerGroups: topology.consumerGroups?.filter(cg => cg.clusterName === cluster.clusterName) || []
      };
      
      this.relationshipManager.buildClusterHierarchy(
        cluster.entityGuid || cluster.guid,
        clusterEntities
      );
    });
    
    console.log(chalk.green(`✓ Created topology: ${topology.clusters.length} clusters, ${topology.brokers.length} brokers, ${topology.topics.length} topics, ${topology.consumerGroups?.length || 0} consumer groups`));
    
    // Log relationship statistics
    const relStats = this.relationshipManager.getStats();
    console.log(chalk.cyan(`✓ Built relationships: ${relStats.totalRelationships} relationships between ${relStats.totalEntities} entities`));
    
    return topology;
  }
  
  async start() {
    if (this.running) {
      console.warn('Platform is already running');
      return;
    }
    
    this.running = true;
    console.log(chalk.blue(`\n🚀 Starting Message Queues Platform in ${chalk.bold(this.options.mode)} mode\n`));
    
    // Start API server if enabled
    if (this.apiServer) {
      try {
        await this.apiServer.start();
      } catch (error) {
        console.error(chalk.red('Failed to start API server:'), error);
        // Continue without API server
      }
    }
    
    // Mark as initialized for health checks
    this.initialized = true;
    
    // Initial run
    await this.runCycle();
    
    // Set up interval for continuous operation
    if (this.options.continuous !== false) {
      this.intervalId = setInterval(() => {
        this.runCycle().catch(err => {
          console.error(chalk.red('Error in run cycle:'), err);
          this.emit('error', err);
        });
      }, this.options.interval * 1000);
      
      console.log(chalk.gray(`Running every ${this.options.interval} seconds. Press Ctrl+C to stop.\n`));
    }
    
    this.emit('started');
  }
  
  async runCycle() {
    debug('Running cycle');
    const startTime = Date.now();
    
    try {
      switch (this.options.mode) {
        case 'infrastructure':
          await this.runInfrastructureCycle();
          break;
          
        case 'simulation':
          await this.runSimulationCycle();
          break;
          
        case 'hybrid':
          await this.runHybridCycle();
          break;
      }
      
      const duration = Date.now() - startTime;
      debug(`Cycle completed in ${duration}ms`);
      this.emit('cycle.completed', { duration });
      
    } catch (error) {
      console.error(chalk.red('Error in cycle:'), error);
      this.emit('cycle.error', error);
      throw error;
    }
  }
  
  async runInfrastructureCycle() {
    debug('Running infrastructure cycle');
    
    let allResults = {
      samples: [],
      entities: [],
      consumerGroups: [],
      errors: []
    };
    
    try {
      // 1. Collect nri-kafka data with error recovery
      console.log(chalk.cyan('📊 Querying infrastructure data...'));
      
      if (this.options.useEnhancedCollector && this.collector.collectEnhancedKafkaMetrics) {
        // Use enhanced collection method
        const enhancedResults = await this.errorRecovery.executeWithRecovery(
          'infra-collector',
          () => this.collector.collectEnhancedKafkaMetrics(),
          {
            fallback: (error) => {
              console.warn(chalk.yellow('Falling back to basic collection'));
              return this.collector.collectKafkaMetrics();
            }
          }
        );
        
        allResults.samples = [
          ...enhancedResults.brokerMetrics,
          ...enhancedResults.topicMetrics,
          ...enhancedResults.clusterMetrics
        ];
        
        // Log enhanced collection stats if available
        if (enhancedResults.collectionStats) {
          const stats = enhancedResults.collectionStats;
          console.log(chalk.blue(`📊 Enhanced collection: ${stats.brokerCount} brokers, ${stats.topicCount} topics, ${stats.clusterCount} clusters in ${stats.totalDuration}ms`));
        }
        
      } else {
        // Use standard collection method
        allResults.samples = await this.errorRecovery.executeWithRecovery(
          'infra-collector',
          () => this.collector.collectKafkaMetrics(),
          {
            fallback: (error) => {
              console.warn(chalk.yellow('Using cached data due to collection failure'));
              return this.getCachedSamples() || [];
            }
          }
        );
      }
      
      // 2. Collect consumer offset data if enabled
      if (this.consumerOffsetCollector && this.options.enableConsumerLagCollection) {
        try {
          console.log(chalk.cyan('👥 Collecting consumer offset data...'));
          const consumerResults = await this.errorRecovery.executeWithRecovery(
            'consumer-offset-collector',
            () => this.consumerOffsetCollector.collectConsumerOffsets(),
            {
              fallback: (error) => {
                console.warn(chalk.yellow('Consumer offset collection failed, continuing without lag data'));
                return [];
              }
            }
          );
          
          allResults.consumerGroups = consumerResults;
          if (consumerResults.length > 0) {
            console.log(chalk.green(`✓ Found ${consumerResults.length} consumer group samples`));
          }
        } catch (error) {
          console.warn(chalk.yellow('Consumer offset collection failed:', error.message));
        }
      }
      
      if (!allResults.samples || allResults.samples.length === 0) {
        console.warn(chalk.yellow('⚠️  No infrastructure data found'));
        return;
      }
      
      console.log(chalk.green(`✓ Found ${allResults.samples.length} samples`));
      
      // Capture source data for documentation
      this.sourceDataCapture = {
        brokerSamples: allResults.samples.filter(s => s.eventType === 'KafkaBrokerSample'),
        topicSamples: allResults.samples.filter(s => s.eventType === 'KafkaTopicSample'),
        consumerSamples: allResults.consumerGroups || []
      };
      
      // 3. Transform to MESSAGE_QUEUE entities
      let transformResult;
      if (this.transformer.transformSamplesEnhanced && allResults.consumerGroups.length > 0) {
        // Use enhanced transformation with consumer data
        transformResult = this.transformer.transformSamplesEnhanced({
          brokerSamples: allResults.samples.filter(s => s.eventType === 'KafkaBrokerSample'),
          topicSamples: allResults.samples.filter(s => s.eventType === 'KafkaTopicSample'),
          clusterSamples: allResults.samples.filter(s => s.eventType === 'KafkaClusterSample'),
          consumerSamples: allResults.consumerGroups
        });
      } else {
        // Use standard transformation (includes consumer samples if available)
        const allSamples = [...allResults.samples, ...allResults.consumerGroups];
        transformResult = this.transformer.transformSamples(allSamples);
      }
      
      // Convert plain objects to entity instances
      const plainEntities = transformResult.entities;
      allResults.entities = this.convertToEntityInstances(plainEntities);
      
      if (transformResult.errors && transformResult.errors.length > 0) {
        console.warn(chalk.yellow(`⚠️  ${transformResult.errors.length} transformation errors occurred`));
        allResults.errors.push(...transformResult.errors);
      }
      
      console.log(chalk.green(`✓ Transformed ${allResults.entities.length} entities`));
      
      // 4. Build relationships for infrastructure entities
      this.buildInfrastructureRelationships(allResults.entities);
      
      // Store synthesized entities for documentation
      this.lastSynthesizedEntities = allResults.entities;
      
      // 5. Extract data model and generate documentation
      if (this.dataModelExtractor) {
        const extractedData = this.dataModelExtractor.extractFromStreaming(allResults.entities, 'infrastructure');
        
        // Generate transformation pipeline documentation (if enabled)
        if (this.options.autoDocs !== false) {
          this.generateTransformationDoc(extractedData, this.sourceDataCapture);
        }
        
        // Show data model if requested
        if (this.showDataModel) {
          // Data model is already displayed by extractFromStreaming
        }
      }
      
      // 6. Stream entities with error recovery
      await this.errorRecovery.executeWithRecovery(
        'streamer',
        () => this.streamer.streamEvents(allResults.entities),
        {
          fallback: (error) => {
            console.warn(chalk.yellow('Caching entities due to streaming failure'));
            this.cacheEntities(allResults.entities);
            return { cached: true, count: allResults.entities.length };
          }
        }
      );
      
      console.log(chalk.green(`✓ Streamed to New Relic`));
      
      // Cache successful results
      this.cacheSamples(allResults.samples);
      
      this.emit('infrastructure.processed', {
        samples: allResults.samples.length,
        entities: allResults.entities.length,
        consumerGroups: allResults.consumerGroups.length,
        errors: allResults.errors.length
      });
      
    } catch (error) {
      console.error(chalk.red('Infrastructure cycle failed:'), error.message);
      allResults.errors.push({ type: 'cycle_error', error: error.message });
      throw error;
    }
  }
  
  async runSimulationCycle() {
    debug('Running simulation cycle');
    
    if (!this.topology) {
      console.error(chalk.red('No topology created'));
      return;
    }
    
    // Update metrics for all entities
    const allEntities = [
      ...this.topology.clusters,
      ...this.topology.brokers,
      ...this.topology.topics,
      ...(this.topology.consumerGroups || []),
      ...(this.topology.queues || [])
    ];
    
    console.log(chalk.cyan(`📊 Updating metrics for ${allEntities.length} entities`));
    
    // Update metrics
    for (const cluster of this.topology.clusters) {
      this.simulator.updateClusterMetrics(cluster);
    }
    
    for (const broker of this.topology.brokers) {
      this.simulator.updateBrokerMetrics(broker);
    }
    
    for (const topic of this.topology.topics) {
      this.simulator.updateTopicMetrics(topic);
    }
    
    // Update consumer group metrics
    if (this.topology.consumerGroups) {
      for (const consumerGroup of this.topology.consumerGroups) {
        this.simulator.updateConsumerGroupMetrics(consumerGroup);
      }
    }
    
    // Update queue metrics
    if (this.topology.queues) {
      for (const queue of this.topology.queues) {
        this.simulator.updateQueueMetrics(queue);
      }
    }
    
    // Store synthesized entities for documentation
    this.lastSynthesizedEntities = allEntities;
    
    // Extract data model and generate documentation
    if (this.dataModelExtractor) {
      const extractedData = this.dataModelExtractor.extractFromStreaming(allEntities, 'simulation');
      
      // Generate transformation pipeline documentation (if enabled)
      if (this.options.autoDocs !== false) {
        this.generateTransformationDoc(extractedData, null); // No source data in simulation mode
      }
      
      // Show data model if requested
      if (this.showDataModel) {
        // Data model is already displayed by extractFromStreaming
      }
    }
    
    // Stream updated entities with error recovery
    await this.errorRecovery.executeWithRecovery(
      'streamer',
      () => this.streamer.streamEvents(allEntities),
      {
        fallback: (error) => {
          console.warn(chalk.yellow('Caching entities due to streaming failure'));
          this.cacheEntities(allEntities);
          return { cached: true, count: allEntities.length };
        }
      }
    );
    
    console.log(chalk.green(`✓ Streamed ${allEntities.length} entities`));
    
    this.emit('simulation.processed', {
      entities: allEntities.length
    });
  }
  
  async runHybridCycle() {
    debug('Running hybrid cycle');
    
    // 1. Collect real data using enhanced collection if available
    const realEntities = [];
    try {
      console.log(chalk.cyan('📊 Querying infrastructure data...'));
      
      let samples = [];
      if (this.options.useEnhancedCollector && this.collector.collectEnhancedKafkaMetrics) {
        // Use enhanced collection for hybrid mode
        const enhancedResults = await this.errorRecovery.executeWithRecovery(
          'infra-collector',
          () => this.collector.collectEnhancedKafkaMetrics(),
          {
            fallback: (error) => {
              console.warn(chalk.yellow('Enhanced collection failed, using basic collection'));
              return this.collector.collectKafkaMetrics();
            }
          }
        );
        
        samples = [
          ...enhancedResults.brokerMetrics,
          ...enhancedResults.topicMetrics,
          ...enhancedResults.clusterMetrics
        ];
      } else {
        samples = await this.errorRecovery.executeWithRecovery(
          'infra-collector',
          () => this.collector.collectKafkaMetrics(),
          {
            fallback: (error) => {
              console.warn(chalk.yellow('Using cached data for hybrid mode'));
              return this.getCachedSamples() || [];
            }
          }
        );
      }
      
      if (samples && samples.length > 0) {
        // Transform real data
        let result;
        if (this.transformer.transformSamplesEnhanced) {
          result = this.transformer.transformSamplesEnhanced({
            brokerSamples: samples.filter(s => s.eventType === 'KafkaBrokerSample'),
            topicSamples: samples.filter(s => s.eventType === 'KafkaTopicSample'), 
            clusterSamples: samples.filter(s => s.eventType === 'KafkaClusterSample')
          });
        } else {
          result = this.transformer.transformSamples(samples);
        }
        
        // Convert plain objects to entity instances
        const plainEntities = result.entities;
        const entityInstances = this.convertToEntityInstances(plainEntities);
        realEntities.push(...entityInstances);
        console.log(chalk.green(`✓ Found ${realEntities.length} real entities`));
        
        // Build relationships for real entities
        this.buildInfrastructureRelationships(realEntities);
      }
    } catch (error) {
      console.warn(chalk.yellow('⚠️  Failed to collect infrastructure data:'), error.message);
    }
    
    // 2. Update hybrid manager with real entities
    this.hybridManager.updateInfrastructureEntities(realEntities);
    
    // 3. Analyze gaps and fill with simulation if enabled
    const gaps = await this.hybridManager.analyzeAndFillGaps(this.desiredTopology, this.entityFactory, this.simulator);
    
    // 4. Get all entities (real + simulated)
    const allEntities = this.hybridManager.getAllEntities();
    
    // 5. Update metrics for simulated entities
    const simulatedEntities = allEntities.filter(e => e.source === 'simulation' || e.source === 'simulation_refresh');
    for (const entity of simulatedEntities) {
      try {
        // Use InfraEntitySimulator wrapper for infrastructure entities that need metric refresh
        if (entity.source === 'simulation_refresh') {
          const InfraEntitySimulator = require('./core/infra-entity-simulator');
          switch (entity.entityType) {
            case 'MESSAGE_QUEUE_BROKER':
              InfraEntitySimulator.updateBrokerMetrics(entity);
              break;
            case 'MESSAGE_QUEUE_TOPIC':
              InfraEntitySimulator.updateTopicMetrics(entity);
              break;
          }
        } else {
          // Pure simulated entities use regular simulator if they have update methods
          switch (entity.entityType) {
            case 'MESSAGE_QUEUE_CLUSTER':
              if (entity.updateGoldenMetric) {
                this.simulator.updateClusterMetrics(entity);
              } else {
                // Direct property update for entities without methods
                entity['cluster.health.score'] = 95 + Math.random() * 5;
                entity['cluster.throughput.total'] = Math.round(10000 * (0.8 + Math.random() * 0.4));
              }
              break;
            case 'MESSAGE_QUEUE_BROKER':
              if (entity.updateCpuUsage) {
                this.simulator.updateBrokerMetrics(entity);
              } else {
                const InfraEntitySimulator = require('./core/infra-entity-simulator');
                InfraEntitySimulator.updateBrokerMetrics(entity);
              }
              break;
            case 'MESSAGE_QUEUE_TOPIC':
              if (entity.updateThroughputIn) {
                this.simulator.updateTopicMetrics(entity);
              } else {
                const InfraEntitySimulator = require('./core/infra-entity-simulator');
                InfraEntitySimulator.updateTopicMetrics(entity);
              }
              break;
          }
        }
      } catch (error) {
        if (this.options.debug) {
          console.warn(chalk.yellow(`Failed to update metrics for ${entity.entityType}: ${error.message}`));
        }
      }
    }
    
    // Store synthesized entities for documentation
    this.lastSynthesizedEntities = allEntities;
    
    // 6. Extract data model and generate documentation
    if (this.dataModelExtractor) {
      const extractedData = this.dataModelExtractor.extractFromStreaming(allEntities, 'hybrid');
      
      // Generate transformation pipeline documentation (if enabled)
      if (this.options.autoDocs !== false) {
        this.generateTransformationDoc(extractedData, this.sourceDataCapture);
      }
      
      // Show data model if requested
      if (this.showDataModel) {
        // Data model is already displayed by extractFromStreaming
      }
    }
    
    // 7. Stream all entities with error recovery
    console.log(chalk.blue(`📤 Streaming ${allEntities.length} entities (${realEntities.length} real, ${simulatedEntities.length} simulated)`));
    await this.errorRecovery.executeWithRecovery(
      'streamer',
      () => this.streamer.streamEvents(allEntities),
      {
        fallback: (error) => {
          console.warn(chalk.yellow('Caching entities due to streaming failure'));
          this.cacheEntities(allEntities);
          return { cached: true, count: allEntities.length };
        }
      }
    );
    
    // 7. Print status if in debug mode
    if (this.options.debug) {
      this.hybridManager.printStatus();
    }
    
    this.emit('hybrid.processed', {
      real: realEntities.length,
      simulated: simulatedEntities.length,
      total: allEntities.length,
      gaps: gaps
    });
  }
  
  buildInfrastructureRelationships(entities) {
    // Group entities by type
    const clusters = entities.filter(e => e.entityType === 'MESSAGE_QUEUE_CLUSTER');
    const brokers = entities.filter(e => e.entityType === 'MESSAGE_QUEUE_BROKER');
    const topics = entities.filter(e => e.entityType === 'MESSAGE_QUEUE_TOPIC');
    const consumerGroups = entities.filter(e => e.entityType === 'MESSAGE_QUEUE_CONSUMER_GROUP');
    
    // Build relationships for each cluster
    clusters.forEach(cluster => {
      const clusterName = cluster.clusterName;
      
      // Find related entities
      const clusterBrokers = brokers.filter(b => b.clusterName === clusterName);
      const clusterTopics = topics.filter(t => t.clusterName === clusterName);
      const clusterConsumerGroups = consumerGroups.filter(cg => cg.clusterName === clusterName);
      
      // Build hierarchy
      this.relationshipManager.buildClusterHierarchy(cluster.entityGuid, {
        brokers: clusterBrokers,
        topics: clusterTopics,
        consumerGroups: clusterConsumerGroups
      });
    });
    
    // Log relationship statistics
    const relStats = this.relationshipManager.getStats();
    console.log(chalk.cyan(`✓ Built ${relStats.totalRelationships} relationships for infrastructure entities`));
  }

  /**
   * Convert transformed plain objects to proper entity instances
   */
  convertToEntityInstances(transformedObjects) {
    const entityInstances = [];
    
    for (const obj of transformedObjects) {
      try {
        let entity;
        
        switch (obj.entityType) {
          case 'MESSAGE_QUEUE_CLUSTER':
            entity = this.entityFactory.createCluster({
              name: obj.clusterName,
              provider: obj.provider,
              accountId: obj.accountId || this.options.accountId,
              metadata: {
                environment: obj.environment,
                region: obj.region,
                ...obj
              }
            });
            break;
            
          case 'MESSAGE_QUEUE_BROKER':
            entity = this.entityFactory.createBroker({
              name: obj.entityName || `broker-${obj.brokerId}`,
              brokerId: obj.brokerId,
              hostname: obj.hostname,
              port: obj.port || 9092,
              clusterName: obj.clusterName,
              provider: obj.provider,
              accountId: obj.accountId || this.options.accountId,
              isController: obj.isController,
              rack: obj.rack,
              metadata: obj
            });
            
            // Update metrics if available
            if (obj['broker.cpu.usage'] !== undefined) {
              entity.updateCpuUsage(obj['broker.cpu.usage']);
            }
            if (obj['broker.memory.usage'] !== undefined) {
              entity.updateMemoryUsage(obj['broker.memory.usage']);
            }
            if (obj['broker.bytesInPerSecond'] !== undefined && obj['broker.bytesOutPerSecond'] !== undefined) {
              entity.updateNetworkThroughput(obj['broker.bytesInPerSecond'] + obj['broker.bytesOutPerSecond']);
            }
            if (obj['broker.requestLatency'] !== undefined) {
              entity.updateRequestLatency(obj['broker.requestLatency']);
            }
            break;
            
          case 'MESSAGE_QUEUE_TOPIC':
            entity = this.entityFactory.createTopic({
              name: obj.topicName || obj.entityName,
              topic: obj.topicName,
              clusterName: obj.clusterName,
              provider: obj.provider,
              accountId: obj.accountId || this.options.accountId,
              partitionCount: obj.partitionCount,
              replicationFactor: obj.replicationFactor,
              metadata: obj
            });
            
            // Update metrics if available
            if (obj['topic.messagesInPerSecond'] !== undefined) {
              entity.updateMessagesIn(obj['topic.messagesInPerSecond']);
            }
            if (obj['topic.messagesOutPerSecond'] !== undefined) {
              entity.updateMessagesOut(obj['topic.messagesOutPerSecond']);
            }
            if (obj['topic.bytesInPerSecond'] !== undefined) {
              entity.updateBytesIn(obj['topic.bytesInPerSecond']);
            }
            if (obj['topic.bytesOutPerSecond'] !== undefined) {
              entity.updateBytesOut(obj['topic.bytesOutPerSecond']);
            }
            break;
            
          case 'MESSAGE_QUEUE_CONSUMER_GROUP':
            entity = this.entityFactory.createConsumerGroup({
              consumerGroupId: obj.consumerGroupId || obj.groupId,
              clusterName: obj.clusterName,
              provider: obj.provider,
              accountId: obj.accountId || this.options.accountId,
              state: obj.state,
              metadata: obj
            });
            
            // Update metrics if available
            if (obj.totalLag !== undefined) {
              entity.updateLag(obj.totalLag);
            }
            if (obj.memberCount !== undefined) {
              entity.updateMemberCount(obj.memberCount);
            }
            break;
            
          default:
            console.warn(chalk.yellow(`Unknown entity type: ${obj.entityType}`));
            continue;
        }
        
        entityInstances.push(entity);
      } catch (error) {
        console.error(chalk.red(`Failed to convert entity: ${error.message}`), obj);
      }
    }
    
    return entityInstances;
  }

  async stop() {
    if (!this.running) {
      return;
    }
    
    console.log(chalk.yellow('\n⏹️  Stopping platform...'));
    this.running = false;
    
    // Track all shutdown errors
    const shutdownErrors = [];
    const shutdownTasks = [];
    
    // Clear intervals first
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    if (this.metricsUpdateInterval) {
      clearInterval(this.metricsUpdateInterval);
      this.metricsUpdateInterval = null;
    }
    
    // Create shutdown tasks with timeout
    const createShutdownTask = (name, fn, timeout = 10000) => {
      return Promise.race([
        fn().catch(error => {
          shutdownErrors.push({ component: name, error: error.message });
          throw error;
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
        )
      ]).then(
        () => ({ component: name, status: 'success' }),
        (error) => {
          const errorEntry = { component: name, status: 'failed', error: error.message };
          shutdownErrors.push(errorEntry);
          return errorEntry;
        }
      );
    };
    
    // Stop API server first
    if (this.apiServer) {
      shutdownTasks.push(
        createShutdownTask('api-server', () => this.apiServer.stop())
      );
    }
    
    // Cleanup enhanced collector
    if (this.collector && this.collector.cleanup) {
      shutdownTasks.push(
        createShutdownTask('enhanced-collector', () => this.collector.cleanup())
      );
    }
    
    // Cleanup consumer offset collector
    if (this.consumerOffsetCollector && this.consumerOffsetCollector.cleanup) {
      shutdownTasks.push(
        createShutdownTask('consumer-offset-collector', () => this.consumerOffsetCollector.cleanup())
      );
    }
    
    // Flush streaming data
    if (this.streamer) {
      shutdownTasks.push(
        createShutdownTask('streamer-flush', () => this.streamer.flushAll(), 30000)
      );
      shutdownTasks.push(
        createShutdownTask('streamer-shutdown', () => this.streamer.shutdown())
      );
    }
    
    // Save any cached data
    if (this.cachedEntities || this.cachedSamples) {
      shutdownTasks.push(
        createShutdownTask('cache-persist', async () => {
          // In production, this would persist to disk or external storage
          const cacheSize = (this.cachedEntities?.entities?.length || 0) + 
                           (this.cachedSamples?.samples?.length || 0);
          if (cacheSize > 0) {
            console.log(chalk.gray(`Persisting ${cacheSize} cached items...`));
          }
        })
      );
    }
    
    // Execute all shutdown tasks in parallel
    const results = await Promise.allSettled(shutdownTasks);
    
    // Shutdown error recovery manager last
    if (this.errorRecovery) {
      try {
        this.errorRecovery.shutdown();
      } catch (error) {
        shutdownErrors.push({ component: 'error-recovery', error: error.message });
      }
    }
    
    // Report shutdown summary
    const successCount = results.filter(r => r.value?.status === 'success').length;
    const failureCount = shutdownErrors.length;
    
    if (failureCount > 0) {
      console.log(chalk.yellow(`\n⚠️  Platform stopped with ${failureCount} warnings:`));
      shutdownErrors.forEach(err => {
        console.log(chalk.yellow(`   • ${err.component}: ${err.error}`));
      });
    } else {
      console.log(chalk.green('\n✅ Platform stopped successfully'));
    }
    
    console.log(chalk.gray(`   • Components shut down: ${successCount}/${shutdownTasks.length}`));
    
    // Emit stopped event with summary
    this.emit('stopped', {
      success: failureCount === 0,
      errors: shutdownErrors,
      summary: {
        total: shutdownTasks.length,
        successful: successCount,
        failed: failureCount
      }
    });
    
    // Return summary for programmatic use
    return {
      success: failureCount === 0,
      errors: shutdownErrors,
      summary: {
        total: shutdownTasks.length,
        successful: successCount,
        failed: failureCount
      }
    };
  }

  /**
   * Generate transformation pipeline documentation
   */
  generateTransformationDoc(extractedData, sourceData) {
    try {
      // Generate the beautiful pipeline documentation
      if (this.pipelineDocumenter) {
        // Prepare the three stages of data
        const rawData = sourceData || {
          brokerSamples: [],
          topicSamples: [],
          consumerSamples: []
        };
        
        const transformedData = extractedData?.entities || [];
        const synthesizedEntities = this.lastSynthesizedEntities || transformedData;
        
        // Generate the documentation
        this.pipelineDocumenter.generatePipelineDoc(
          rawData,
          transformedData,
          synthesizedEntities,
          this.options.mode
        );
      }
      
      // Also generate the legacy documentation for compatibility
      const pipelineDoc = this.dataModelExtractor.generateTransformationPipelineDoc(sourceData);
      
      // Always save to docs directory
      const fs = require('fs');
      
      const docsDir = path.join(__dirname, 'docs');
      if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
      }
      
      const docPath = path.join(docsDir, 'LIVE_DATA_TRANSFORMATION_PIPELINE.md');
      fs.writeFileSync(docPath, pipelineDoc);
      
      console.log(chalk.green(`📄 Generated transformation pipeline documentation: ${docPath}`));
      
      // Also save to root for easy access
      const rootDocPath = path.join(__dirname, 'CURRENT_DATA_MODEL.md');
      fs.writeFileSync(rootDocPath, pipelineDoc);
      
      console.log(chalk.blue(`📄 Current data model available at: CURRENT_DATA_MODEL.md`));
      
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Failed to generate transformation documentation: ${error.message}`));
    }
  }
  
  async getStats() {
    const stats = {
      mode: this.options.mode,
      running: this.running,
      provider: this.options.provider,
      interval: this.options.interval
    };
    
    if (this.streamer) {
      stats.streaming = this.streamer.getStats();
    }
    
    if (this.topology) {
      stats.topology = {
        clusters: this.topology.clusters.length,
        brokers: this.topology.brokers.length,
        topics: this.topology.topics.length,
        consumerGroups: this.topology.consumerGroups?.length || 0
      };
    }
    
    if (this.relationshipManager) {
      stats.relationships = this.relationshipManager.getStats();
    }
    
    if (this.errorRecovery) {
      stats.errorRecovery = {
        systemHealth: this.errorRecovery.getSystemHealth(),
        recoveryStats: this.errorRecovery.getRecoveryStats()
      };
    }
    
    // Add enhanced collector stats if available
    if (this.collector && this.collector.getHealthStatus) {
      try {
        stats.enhancedCollector = await this.collector.getHealthStatus();
      } catch (error) {
        stats.enhancedCollector = { error: error.message };
      }
    }
    
    // Add consumer offset collector stats if available
    if (this.consumerOffsetCollector && this.consumerOffsetCollector.getStats) {
      try {
        stats.consumerOffsetCollector = this.consumerOffsetCollector.getStats();
      } catch (error) {
        stats.consumerOffsetCollector = { error: error.message };
      }
    }
    
    return stats;
  }
  
  /**
   * Test streamer connection for health checks
   */
  async testStreamerConnection() {
    // Simple health check - just get stats
    const stats = this.streamer.getStats();
    const totalSent = stats.eventsSent + stats.metricsSent;
    
    // If nothing has been sent yet, consider it healthy
    if (totalSent === 0) {
      return true;
    }
    
    // Calculate error rate
    const errorRate = stats.errors / (totalSent + stats.errors);
    if (errorRate > 0.5) { // More than 50% error rate
      throw new Error(`Streamer error rate too high: ${Math.round(errorRate * 100)}%`);
    }
    return true;
  }
  
  /**
   * Cache entities for fallback scenarios
   */
  cacheEntities(entities) {
    this.cachedEntities = {
      entities,
      timestamp: Date.now()
    };
  }
  
  /**
   * Cache samples for fallback scenarios
   */
  cacheSamples(samples) {
    this.cachedSamples = {
      samples,
      timestamp: Date.now()
    };
  }
  
  /**
   * Get cached samples for fallback scenarios
   */
  getCachedSamples() {
    if (this.cachedSamples && Date.now() - this.cachedSamples.timestamp < 300000) { // 5 minutes
      return this.cachedSamples.samples;
    }
    return null;
  }
}

// CLI interface
if (require.main === module) {
  const program = new Command();
  
  program
    .name('platform')
    .description('New Relic Message Queues Platform')
    .version('1.0.0');
  
  program
    .option('-m, --mode <mode>', 'Operation mode (infrastructure|simulation|hybrid)', 'simulation')
    .option('-p, --provider <provider>', 'Message queue provider', 'kafka')
    .option('-i, --interval <seconds>', 'Update interval in seconds', '60')
    .option('-d, --duration <seconds>', 'Run duration (omit for continuous)')
    .option('--account-id <id>', 'New Relic account ID')
    .option('--api-key <key>', 'New Relic User API key')
    .option('--ingest-key <key>', 'New Relic Ingest key')
    .option('--clusters <count>', 'Number of clusters (simulation)', '1')
    .option('--brokers <count>', 'Brokers per cluster (simulation)', '3')
    .option('--topics <count>', 'Topics per cluster (simulation)', '5')
    .option('--environment <env>', 'Environment name', 'production')
    .option('--no-continuous', 'Run once and exit')
    .option('--debug', 'Enable debug logging')
    .option('--no-enhanced-collector', 'Disable enhanced collector features')
    .option('--no-consumer-lag', 'Disable consumer lag collection')
    .option('--no-detailed-topics', 'Disable detailed topic metrics')
    .option('--broker-workers <count>', 'Broker worker pool size', '5')
    .option('--topic-workers <count>', 'Topic worker pool size', '8')
    .option('--consumer-workers <count>', 'Consumer worker pool size', '3')
    .option('--multi-cluster', 'Enable multi-cluster monitoring')
    .option('--cluster-filter <clusters>', 'Comma-separated list of cluster names to monitor')
    .option('--max-clusters-per-query <count>', 'Maximum clusters per query batch', '10')
    .option('--no-cluster-discovery', 'Disable automatic cluster discovery')
    .option('--api-port <port>', 'API server port', '3000')
    .option('--api-host <host>', 'API server host', '0.0.0.0')
    .option('--no-api', 'Disable API server')
    .option('--show-data-model', 'Display detailed data model information during streaming')
    .option('--save-data-model <path>', 'Save data model to file (JSON format)')
    .option('--no-auto-docs', 'Disable automatic documentation generation');
  
  program.parse();
  
  const options = program.opts();
  
  if (options.debug) {
    require('debug').enable('platform:*,transform:*');
  }
  
  // Create and start platform
  const platform = new MessageQueuesPlatform({
    ...options,
    interval: parseInt(options.interval),
    clusters: parseInt(options.clusters),
    brokers: parseInt(options.brokers),
    topics: parseInt(options.topics),
    // Enhanced collector options
    useEnhancedCollector: options.enhancedCollector !== false,
    enableConsumerLagCollection: options.consumerLag !== false,
    enableDetailedTopicMetrics: options.detailedTopics !== false,
    brokerWorkerPoolSize: parseInt(options.brokerWorkers),
    topicWorkerPoolSize: parseInt(options.topicWorkers),
    consumerWorkerPoolSize: parseInt(options.consumerWorkers),
    // Multi-cluster options
    multiCluster: options.multiCluster || false,
    clusterFilter: options.clusterFilter ? options.clusterFilter.split(',').map(c => c.trim()) : null,
    maxClustersPerQuery: parseInt(options.maxClustersPerQuery),
    enableClusterDiscovery: options.clusterDiscovery !== false,
    // API server options
    apiEnabled: options.api !== false,
    apiPort: parseInt(options.apiPort),
    apiHost: options.apiHost,
    // Data model options
    showDataModel: options.showDataModel || false,
    saveDataModel: options.saveDataModel || null,
    autoDocs: options.autoDocs !== false
  });
  
  // Event handlers
  platform.on('started', () => {
    console.log(chalk.green('✓ Platform started successfully'));
  });
  
  platform.on('error', (error) => {
    console.error(chalk.red('Platform error:'), error);
  });
  
  platform.on('cycle.completed', ({ duration }) => {
    console.log(chalk.gray(`Cycle completed in ${duration}ms`));
  });
  
  platform.on('component.error', ({ component, error }) => {
    console.warn(chalk.yellow(`Component ${component} error: ${error}`));
  });
  
  platform.on('circuit.opened', ({ component }) => {
    console.warn(chalk.red(`🔴 Circuit breaker opened for ${component}`));
  });
  
  platform.on('circuit.closed', ({ component }) => {
    console.log(chalk.green(`🟢 Circuit breaker closed for ${component}`));
  });
  
  // Start platform
  platform.start().catch(err => {
    console.error(chalk.red('Failed to start platform:'), err);
    process.exit(1);
  });
  
  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n⏹️  Shutting down...'));
    await platform.stop();
    process.exit(0);
  });
  
  // Run for specified duration if provided
  if (options.duration) {
    setTimeout(async () => {
      await platform.stop();
      process.exit(0);
    }, parseInt(options.duration) * 1000);
  }
}

module.exports = MessageQueuesPlatform;