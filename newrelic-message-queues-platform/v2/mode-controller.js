/**
 * Mode Controller for v2 Platform
 * Manages switching between simulation, infrastructure, and hybrid modes
 */

const EventEmitter = require('events');

class ModeController extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.currentMode = config.defaultMode || 'simulation';
    this.supportedModes = ['simulation', 'infrastructure', 'hybrid'];
    this.modeHandlers = new Map();
    this.modeTransitions = new Map();
  }

  /**
   * Register a mode handler
   */
  registerModeHandler(mode, handler) {
    if (!this.supportedModes.includes(mode)) {
      throw new Error(`Unsupported mode: ${mode}`);
    }
    this.modeHandlers.set(mode, handler);
  }

  /**
   * Register mode transition callback
   */
  onModeTransition(fromMode, toMode, callback) {
    const key = `${fromMode}->${toMode}`;
    if (!this.modeTransitions.has(key)) {
      this.modeTransitions.set(key, []);
    }
    this.modeTransitions.get(key).push(callback);
  }

  /**
   * Switch to a different mode
   */
  async switchMode(newMode, options = {}) {
    if (!this.supportedModes.includes(newMode)) {
      throw new Error(`Unsupported mode: ${newMode}`);
    }

    if (this.currentMode === newMode && !options.force) {
      return { mode: this.currentMode, changed: false };
    }

    const oldMode = this.currentMode;
    
    // Execute transition callbacks
    const transitionKey = `${oldMode}->${newMode}`;
    const transitions = this.modeTransitions.get(transitionKey) || [];
    
    for (const transition of transitions) {
      await transition({ oldMode, newMode, options });
    }

    // Stop current mode handler
    const currentHandler = this.modeHandlers.get(oldMode);
    if (currentHandler && currentHandler.stop) {
      await currentHandler.stop();
    }

    // Update mode
    this.currentMode = newMode;

    // Start new mode handler
    const newHandler = this.modeHandlers.get(newMode);
    if (newHandler && newHandler.start) {
      await newHandler.start(options);
    }

    this.emit('modeChanged', { oldMode, newMode, options });

    return { mode: this.currentMode, changed: true, previousMode: oldMode };
  }

  /**
   * Get current mode
   */
  getMode() {
    return this.currentMode;
  }

  /**
   * Check if in specific mode
   */
  isMode(mode) {
    return this.currentMode === mode;
  }

  /**
   * Get mode configuration
   */
  getModeConfig(mode = this.currentMode) {
    return this.config.modes?.[mode] || {};
  }

  /**
   * Validate mode configuration
   */
  validateModeConfig(mode) {
    const config = this.getModeConfig(mode);
    
    switch (mode) {
      case 'infrastructure':
        if (!config.discovery) {
          throw new Error('Infrastructure mode requires discovery configuration');
        }
        if (!config.providers || config.providers.length === 0) {
          throw new Error('Infrastructure mode requires at least one provider');
        }
        break;
        
      case 'hybrid':
        if (!config.infrastructureWeight || !config.simulationWeight) {
          throw new Error('Hybrid mode requires weight configuration');
        }
        if (config.infrastructureWeight + config.simulationWeight !== 100) {
          throw new Error('Hybrid mode weights must sum to 100');
        }
        break;
        
      case 'simulation':
        if (!config.scenarios) {
          throw new Error('Simulation mode requires scenario configuration');
        }
        break;
    }
    
    return true;
  }

  /**
   * Get mode status
   */
  getStatus() {
    const handler = this.modeHandlers.get(this.currentMode);
    return {
      mode: this.currentMode,
      active: handler?.isActive?.() || false,
      config: this.getModeConfig(),
      handler: handler?.getStatus?.() || null
    };
  }
}

/**
 * Mode handler interfaces
 */
class BaseModeHandler {
  constructor(name, config) {
    this.name = name;
    this.config = config;
    this.active = false;
  }

  async start(options = {}) {
    this.active = true;
  }

  async stop() {
    this.active = false;
  }

  isActive() {
    return this.active;
  }

  getStatus() {
    return {
      name: this.name,
      active: this.active,
      config: this.config
    };
  }
}

class SimulationModeHandler extends BaseModeHandler {
  constructor(config) {
    super('simulation', config);
    this.simulator = null;
    this.streamer = null;
  }

  async start(options = {}) {
    await super.start(options);
    // Initialize simulation components
    const DataSimulator = require('../simulation/engines/data-simulator');
    const NewRelicStreamer = require('../simulation/streaming/new-relic-streamer');
    
    this.simulator = new DataSimulator(this.config.simulation || {});
    this.streamer = new NewRelicStreamer(this.config.streaming || {});
    
    return { simulator: this.simulator, streamer: this.streamer };
  }

  async stop() {
    if (this.streamer) {
      await this.streamer.stop();
    }
    await super.stop();
  }
}

class InfrastructureModeHandler extends BaseModeHandler {
  constructor(config) {
    super('infrastructure', config);
    this.discoveryOrchestrator = null;
    this.shimOrchestrator = null;
  }

  async start(options = {}) {
    await super.start(options);
    // Initialize infrastructure components
    const { DiscoveryOrchestrator } = require('../infrastructure');
    const { ShimOrchestrator } = require('../shim');
    
    this.discoveryOrchestrator = new DiscoveryOrchestrator(this.config.discovery || {});
    this.shimOrchestrator = new ShimOrchestrator(this.config.shim || {});
    
    // Start discovery
    await this.discoveryOrchestrator.startDiscovery();
    
    return { 
      discoveryOrchestrator: this.discoveryOrchestrator, 
      shimOrchestrator: this.shimOrchestrator 
    };
  }

  async stop() {
    if (this.discoveryOrchestrator) {
      await this.discoveryOrchestrator.stopDiscovery();
    }
    await super.stop();
  }
}

class HybridModeHandler extends BaseModeHandler {
  constructor(config) {
    super('hybrid', config);
    this.simulationHandler = null;
    this.infrastructureHandler = null;
  }

  async start(options = {}) {
    await super.start(options);
    
    // Initialize both handlers
    this.simulationHandler = new SimulationModeHandler(this.config);
    this.infrastructureHandler = new InfrastructureModeHandler(this.config);
    
    // Start both with weighted configuration
    const simOptions = { weight: this.config.simulationWeight || 50 };
    const infraOptions = { weight: this.config.infrastructureWeight || 50 };
    
    const [simResult, infraResult] = await Promise.all([
      this.simulationHandler.start(simOptions),
      this.infrastructureHandler.start(infraOptions)
    ]);
    
    return {
      simulation: simResult,
      infrastructure: infraResult,
      weights: {
        simulation: simOptions.weight,
        infrastructure: infraOptions.weight
      }
    };
  }

  async stop() {
    await Promise.all([
      this.simulationHandler?.stop(),
      this.infrastructureHandler?.stop()
    ]);
    await super.stop();
  }

  getStatus() {
    return {
      ...super.getStatus(),
      simulation: this.simulationHandler?.getStatus(),
      infrastructure: this.infrastructureHandler?.getStatus()
    };
  }
}

module.exports = {
  ModeController,
  BaseModeHandler,
  SimulationModeHandler,
  InfrastructureModeHandler,
  HybridModeHandler
};