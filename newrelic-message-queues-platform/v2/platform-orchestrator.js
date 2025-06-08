/**
 * Platform Orchestrator for v2
 * Coordinates all v2 components and manages the data flow pipeline
 */

const EventEmitter = require('events');
const { ModeController } = require('./mode-controller');
const { StreamingOrchestrator } = require('./streaming-orchestrator');

class PlatformOrchestrator extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = this.mergeDefaultConfig(config);
    this.initialized = false;
    
    // Core components
    this.modeController = null;
    this.streamingOrchestrator = null;
    this.foundation = null;
    this.discoveryOrchestrator = null;
    this.shimOrchestrator = null;
    
    // Component registry
    this.components = new Map();
    
    // Pipeline state
    this.pipelineActive = false;
    this.metrics = {
      processed: 0,
      errors: 0,
      startTime: null
    };
  }

  /**
   * Merge with default configuration
   */
  mergeDefaultConfig(config) {
    return {
      mode: 'simulation',
      accountId: process.env.NEW_RELIC_ACCOUNT_ID,
      apiKey: process.env.NEW_RELIC_USER_API_KEY,
      ingestKey: process.env.NEW_RELIC_INGEST_KEY,
      region: process.env.NEW_RELIC_REGION || 'us',
      streaming: {
        batchSize: 1000,
        flushInterval: 30000,
        retryAttempts: 3
      },
      discovery: {
        providers: ['kubernetes', 'docker'],
        interval: 60000
      },
      foundation: {
        hooks: ['validation', 'enrichment', 'routing'],
        aggregation: {
          enabled: true,
          window: 60000
        }
      },
      ...config
    };
  }

  /**
   * Initialize the platform
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize mode controller
      this.modeController = new ModeController({
        defaultMode: this.config.mode,
        modes: {
          simulation: this.config.simulation || {},
          infrastructure: this.config.infrastructure || {},
          hybrid: this.config.hybrid || {}
        }
      });

      // Initialize streaming orchestrator
      this.streamingOrchestrator = new StreamingOrchestrator({
        accountId: this.config.accountId,
        ingestKey: this.config.ingestKey,
        region: this.config.region,
        ...this.config.streaming
      });

      // Initialize foundation layer
      const Foundation = require('../foundation');
      this.foundation = new Foundation(this.config.foundation);

      // Set up mode handlers
      this.setupModeHandlers();

      // Set up event flows
      this.setupEventFlows();

      this.initialized = true;
      this.emit('initialized');
      
    } catch (error) {
      this.emit('error', { phase: 'initialization', error });
      throw error;
    }
  }

  /**
   * Set up mode-specific handlers
   */
  setupModeHandlers() {
    const { 
      SimulationModeHandler, 
      InfrastructureModeHandler, 
      HybridModeHandler 
    } = require('./mode-controller');

    // Register mode handlers
    this.modeController.registerModeHandler(
      'simulation', 
      new SimulationModeHandler(this.config)
    );
    
    this.modeController.registerModeHandler(
      'infrastructure', 
      new InfrastructureModeHandler(this.config)
    );
    
    this.modeController.registerModeHandler(
      'hybrid', 
      new HybridModeHandler(this.config)
    );

    // Set up mode transitions
    this.modeController.on('modeChanged', async ({ oldMode, newMode }) => {
      await this.handleModeChange(oldMode, newMode);
    });
  }

  /**
   * Set up data flow event handlers
   */
  setupEventFlows() {
    // Infrastructure discovery → SHIM flow
    if (this.config.mode === 'infrastructure' || this.config.mode === 'hybrid') {
      this.setupInfrastructureFlow();
    }

    // Simulation → Foundation flow
    if (this.config.mode === 'simulation' || this.config.mode === 'hybrid') {
      this.setupSimulationFlow();
    }

    // Foundation → Streaming flow (common)
    this.setupStreamingFlow();
  }

  /**
   * Set up infrastructure data flow
   */
  setupInfrastructureFlow() {
    const { DiscoveryOrchestrator } = require('../infrastructure');
    const { ShimOrchestrator } = require('../shim');

    this.discoveryOrchestrator = new DiscoveryOrchestrator(this.config.discovery);
    this.shimOrchestrator = new ShimOrchestrator(this.config.shim);

    // Discovery → SHIM
    this.discoveryOrchestrator.on('resourcesDiscovered', async (resources) => {
      try {
        const entities = await this.shimOrchestrator.transformResources(resources);
        this.emit('entitiesCreated', { source: 'infrastructure', entities });
        
        // Send to foundation
        for (const entity of entities) {
          await this.foundation.process(entity);
        }
      } catch (error) {
        this.emit('error', { phase: 'shim-transformation', error });
      }
    });

    // SHIM → Foundation
    this.shimOrchestrator.on('metricsGenerated', async (metrics) => {
      try {
        const processed = await this.foundation.processMetrics(metrics);
        this.emit('metricsProcessed', { source: 'infrastructure', count: processed.length });
      } catch (error) {
        this.emit('error', { phase: 'foundation-processing', error });
      }
    });
  }

  /**
   * Set up simulation data flow
   */
  setupSimulationFlow() {
    // This will be handled by the mode handler
    // which creates simulator and connects it to foundation
  }

  /**
   * Set up streaming flow from foundation
   */
  setupStreamingFlow() {
    // Foundation → Streaming
    this.foundation.on('dataReady', async (data) => {
      try {
        await this.streamingOrchestrator.stream(data);
        this.metrics.processed += data.length;
        this.emit('dataStreamed', { count: data.length });
      } catch (error) {
        this.metrics.errors++;
        this.emit('error', { phase: 'streaming', error });
      }
    });

    // Handle streaming events
    this.streamingOrchestrator.on('batchSent', (info) => {
      this.emit('streamingUpdate', info);
    });

    this.streamingOrchestrator.on('error', (error) => {
      this.emit('error', { phase: 'streaming', error });
    });
  }

  /**
   * Handle mode changes
   */
  async handleModeChange(oldMode, newMode) {
    this.emit('modeChanging', { oldMode, newMode });

    // Stop current flows
    await this.stopPipeline();

    // Reconfigure flows for new mode
    this.setupEventFlows();

    // Restart if was running
    if (this.pipelineActive) {
      await this.startPipeline();
    }

    this.emit('modeChanged', { oldMode, newMode });
  }

  /**
   * Start the data pipeline
   */
  async startPipeline(options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.pipelineActive) {
      return { status: 'already_running' };
    }

    try {
      this.metrics.startTime = Date.now();
      this.pipelineActive = true;

      // Start components based on mode
      const mode = this.modeController.getMode();
      
      switch (mode) {
        case 'infrastructure':
          await this.startInfrastructurePipeline(options);
          break;
        case 'simulation':
          await this.startSimulationPipeline(options);
          break;
        case 'hybrid':
          await this.startHybridPipeline(options);
          break;
      }

      // Start streaming
      await this.streamingOrchestrator.start();

      this.emit('pipelineStarted', { mode, options });
      return { status: 'started', mode };

    } catch (error) {
      this.pipelineActive = false;
      this.emit('error', { phase: 'pipeline-start', error });
      throw error;
    }
  }

  /**
   * Start infrastructure pipeline
   */
  async startInfrastructurePipeline(options) {
    await this.discoveryOrchestrator.startDiscovery();
    await this.shimOrchestrator.start();
    this.emit('infrastructurePipelineStarted');
  }

  /**
   * Start simulation pipeline
   */
  async startSimulationPipeline(options) {
    const handler = this.modeController.modeHandlers.get('simulation');
    const { simulator, streamer } = await handler.start(options);
    
    // Connect simulator to foundation
    simulator.on('metricsGenerated', async (metrics) => {
      await this.foundation.processMetrics(metrics);
    });

    this.emit('simulationPipelineStarted');
  }

  /**
   * Start hybrid pipeline
   */
  async startHybridPipeline(options) {
    await Promise.all([
      this.startInfrastructurePipeline(options),
      this.startSimulationPipeline(options)
    ]);
    this.emit('hybridPipelineStarted');
  }

  /**
   * Stop the data pipeline
   */
  async stopPipeline() {
    if (!this.pipelineActive) {
      return { status: 'already_stopped' };
    }

    try {
      // Stop discovery if running
      if (this.discoveryOrchestrator) {
        await this.discoveryOrchestrator.stopDiscovery();
      }

      // Stop SHIM if running
      if (this.shimOrchestrator) {
        await this.shimOrchestrator.stop();
      }

      // Stop streaming
      await this.streamingOrchestrator.stop();

      // Stop mode handler
      const currentMode = this.modeController.getMode();
      await this.modeController.switchMode(currentMode, { force: true });

      this.pipelineActive = false;
      this.emit('pipelineStopped');
      
      return { 
        status: 'stopped', 
        metrics: this.getMetrics() 
      };

    } catch (error) {
      this.emit('error', { phase: 'pipeline-stop', error });
      throw error;
    }
  }

  /**
   * Switch platform mode
   */
  async switchMode(newMode, options = {}) {
    return await this.modeController.switchMode(newMode, options);
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      mode: this.modeController?.getMode(),
      pipelineActive: this.pipelineActive,
      components: {
        modeController: this.modeController?.getStatus(),
        streaming: this.streamingOrchestrator?.getStatus(),
        foundation: this.foundation?.getStatus(),
        discovery: this.discoveryOrchestrator?.getStatus(),
        shim: this.shimOrchestrator?.getStatus()
      },
      metrics: this.getMetrics()
    };
  }

  /**
   * Get platform metrics
   */
  getMetrics() {
    const runtime = this.metrics.startTime 
      ? Date.now() - this.metrics.startTime 
      : 0;

    return {
      ...this.metrics,
      runtime,
      throughput: runtime > 0 ? this.metrics.processed / (runtime / 1000) : 0
    };
  }

  /**
   * Register a component
   */
  registerComponent(name, component) {
    this.components.set(name, component);
    this.emit('componentRegistered', { name, component });
  }

  /**
   * Get a registered component
   */
  getComponent(name) {
    return this.components.get(name);
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.emit('shutdownStarted');
    
    await this.stopPipeline();
    
    // Clear components
    this.components.clear();
    
    this.emit('shutdownCompleted');
  }
}

module.exports = PlatformOrchestrator;