/**
 * Infrastructure Discovery Module
 * 
 * Main entry point for the infrastructure discovery service.
 * Provides automatic discovery of message queue systems across
 * Kubernetes, Docker, and other infrastructure environments.
 */

const BaseDiscoveryService = require('./discovery/base-discovery-service');
const DiscoveryOrchestrator = require('./discovery/discovery-orchestrator');
const KubernetesDiscoveryProvider = require('./providers/kubernetes-discovery-provider');
const DockerDiscoveryProvider = require('./providers/docker-discovery-provider');
const CacheManager = require('./cache/cache-manager');
const ChangeTracker = require('./tracking/change-tracker');

// Export main components
module.exports = {
  // Core classes
  BaseDiscoveryService,
  DiscoveryOrchestrator,
  KubernetesDiscoveryProvider,
  DockerDiscoveryProvider,
  CacheManager,
  ChangeTracker,
  
  // Factory function for creating configured orchestrator
  createDiscoveryOrchestrator: (config = {}) => {
    const orchestrator = new DiscoveryOrchestrator(config);
    
    // Auto-register providers based on config
    if (config.providers) {
      for (const [name, providerConfig] of Object.entries(config.providers)) {
        let provider;
        
        switch (providerConfig.type) {
          case 'kubernetes':
            provider = new KubernetesDiscoveryProvider(providerConfig);
            break;
          case 'docker':
            provider = new DockerDiscoveryProvider(providerConfig);
            break;
          default:
            console.warn(`Unknown provider type: ${providerConfig.type}`);
            continue;
        }
        
        orchestrator.registerProvider(name, provider);
      }
    }
    
    return orchestrator;
  },
  
  // Helper function to detect available providers
  detectAvailableProviders: async () => {
    const available = [];
    
    // Check for Kubernetes
    try {
      const k8sProvider = new KubernetesDiscoveryProvider();
      // Try to ping Kubernetes API
      await k8sProvider.discoverResources();
      available.push('kubernetes');
    } catch (error) {
      // Kubernetes not available
    }
    
    // Check for Docker
    try {
      const dockerProvider = new DockerDiscoveryProvider();
      // Try to ping Docker daemon
      await dockerProvider.docker.ping();
      available.push('docker');
    } catch (error) {
      // Docker not available
    }
    
    return available;
  },
  
  // Constants
  MESSAGE_QUEUE_TYPES: {
    KAFKA: 'kafka',
    RABBITMQ: 'rabbitmq',
    REDIS: 'redis',
    ACTIVEMQ: 'activemq',
    NATS: 'nats',
    PULSAR: 'pulsar',
    SQS: 'sqs',
    ZOOKEEPER: 'zookeeper'
  }
};