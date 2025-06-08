/**
 * V2 Platform Entry Point
 * Exports all v2 components for the message queues platform
 */

const PlatformOrchestrator = require('./platform-orchestrator');
const { 
  ModeController, 
  SimulationModeHandler, 
  InfrastructureModeHandler, 
  HybridModeHandler 
} = require('./mode-controller');
const { StreamingOrchestrator } = require('./streaming-orchestrator');
const ConfigManager = require('./config-manager');

// Re-export infrastructure components
const { 
  DiscoveryOrchestrator,
  BaseDiscoveryService,
  KubernetesDiscoveryProvider,
  DockerDiscoveryProvider,
  ChangeTracker,
  CacheManager
} = require('../infrastructure');

// Re-export SHIM components
const {
  ShimOrchestrator,
  BaseShimAdapter,
  KafkaShimAdapter,
  RabbitMQShimAdapter,
  ShimValidator
} = require('../shim');

// Re-export foundation components
const Foundation = require('../foundation');

/**
 * Create and initialize a v2 platform instance
 */
async function createPlatform(config = {}) {
  // Load configuration
  const configManager = new ConfigManager({
    environment: config.environment || process.env.NODE_ENV || 'development'
  });
  
  const platformConfig = await configManager.load();
  
  // Merge with provided config
  const finalConfig = {
    ...platformConfig,
    ...config
  };
  
  // Create platform orchestrator
  const platform = new PlatformOrchestrator(finalConfig);
  
  // Initialize platform
  await platform.initialize();
  
  return platform;
}

/**
 * Quick start helpers
 */
const quickStart = {
  /**
   * Start simulation mode
   */
  async simulation(options = {}) {
    const platform = await createPlatform({
      mode: 'simulation',
      ...options
    });
    
    await platform.startPipeline();
    return platform;
  },
  
  /**
   * Start infrastructure mode
   */
  async infrastructure(options = {}) {
    const platform = await createPlatform({
      mode: 'infrastructure',
      ...options
    });
    
    await platform.startPipeline();
    return platform;
  },
  
  /**
   * Start hybrid mode
   */
  async hybrid(options = {}) {
    const platform = await createPlatform({
      mode: 'hybrid',
      ...options
    });
    
    await platform.startPipeline();
    return platform;
  }
};

module.exports = {
  // Main components
  PlatformOrchestrator,
  ModeController,
  StreamingOrchestrator,
  ConfigManager,
  
  // Mode handlers
  SimulationModeHandler,
  InfrastructureModeHandler,
  HybridModeHandler,
  
  // Infrastructure components
  DiscoveryOrchestrator,
  BaseDiscoveryService,
  KubernetesDiscoveryProvider,
  DockerDiscoveryProvider,
  ChangeTracker,
  CacheManager,
  
  // SHIM components
  ShimOrchestrator,
  BaseShimAdapter,
  KafkaShimAdapter,
  RabbitMQShimAdapter,
  ShimValidator,
  
  // Foundation
  Foundation,
  
  // Factory functions
  createPlatform,
  quickStart
};