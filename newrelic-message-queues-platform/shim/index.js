/**
 * SHIM Layer Entry Point
 * 
 * Strategic Hardware Interface Module - transforms infrastructure-specific
 * data into unified MESSAGE_QUEUE entities.
 */

const BaseShimAdapter = require('./base-shim-adapter');
const ShimOrchestrator = require('./shim-orchestrator');
const ShimValidator = require('./validators/shim-validator');
const KafkaShimAdapter = require('./adapters/kafka-shim-adapter');
const RabbitMQShimAdapter = require('./adapters/rabbitmq-shim-adapter');

// Export main components
module.exports = {
  // Core classes
  BaseShimAdapter,
  ShimOrchestrator,
  ShimValidator,
  
  // Provider adapters
  adapters: {
    KafkaShimAdapter,
    RabbitMQShimAdapter
  },
  
  // Factory function for creating orchestrator with default config
  createOrchestrator: (config = {}) => {
    return new ShimOrchestrator({
      enabledProviders: ['kafka', 'rabbitmq'],
      autoInitialize: true,
      validation: {
        enabled: true,
        strict: false
      },
      ...config
    });
  },
  
  // Factory function for creating validator
  createValidator: (config = {}) => {
    return new ShimValidator({
      strictMode: false,
      validateMetrics: true,
      validateRelationships: true,
      ...config
    });
  },
  
  // Utility function for quick transformation
  quickTransform: async (provider, infrastructureData, options = {}) => {
    const orchestrator = new ShimOrchestrator({
      enabledProviders: [provider],
      autoInitialize: false,
      ...options.orchestratorConfig
    });
    
    try {
      await orchestrator.initialize();
      const result = await orchestrator.transform(provider, infrastructureData);
      
      if (options.validate) {
        const validator = new ShimValidator(options.validatorConfig);
        const validation = validator.validateTransformationResult(result);
        
        if (!validation.valid) {
          throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }
      }
      
      return result;
    } finally {
      if (options.autoShutdown !== false) {
        await orchestrator.shutdown();
      }
    }
  }
};