/**
 * Dependency Injection Types
 * Centralized symbols for dependency injection to avoid circular imports
 */

// Symbols for dependency injection
export const TYPES = {
  // Domain
  BrokerRepository: Symbol.for('BrokerRepository'),
  TopicRepository: Symbol.for('TopicRepository'),
  ConsumerGroupRepository: Symbol.for('ConsumerGroupRepository'),
  ClusterRepository: Symbol.for('ClusterRepository'),
  
  // Application
  MonitorBrokersUseCase: Symbol.for('MonitorBrokersUseCase'),
  PlatformOrchestrator: Symbol.for('PlatformOrchestrator'),
  
  // Infrastructure
  ConfigurationService: Symbol.for('ConfigurationService'),
  CircuitBreakerFactory: Symbol.for('CircuitBreakerFactory'),
  CircuitBreakerMonitor: Symbol.for('CircuitBreakerMonitor'),
  WorkerPool: Symbol.for('WorkerPool'),
  
  // Production-critical components
  HealthMonitor: Symbol.for('HealthMonitor'),
  ErrorRecoveryManager: Symbol.for('ErrorRecoveryManager'),
  CircuitBreaker: Symbol.for('CircuitBreaker'),
  NerdGraphCircuitBreaker: Symbol.for('NerdGraphCircuitBreaker'),
  
  // Hybrid mode components
  HybridModeManager: Symbol.for('HybridModeManager'),
  GapDetector: Symbol.for('GapDetector'),
  EntitySimulator: Symbol.for('EntitySimulator'),
  
  // Relationship management
  RelationshipManager: Symbol.for('RelationshipManager'),
  
  // Aggregators
  ClusterAggregator: Symbol.for('ClusterAggregator'),
  
  // Collectors
  InfrastructureCollector: Symbol.for('InfrastructureCollector'),
  SimulationCollector: Symbol.for('SimulationCollector'),
  
  // Transformers
  NriKafkaTransformer: Symbol.for('NriKafkaTransformer'),
  EnhancedNriKafkaTransformer: Symbol.for('EnhancedNriKafkaTransformer'),
  
  // Streamers
  EntityStreamer: Symbol.for('EntityStreamer'),
  MetricStreamer: Symbol.for('MetricStreamer'),
  
  // Shared
  EventBus: Symbol.for('EventBus'),
  Logger: Symbol.for('Logger'),
  NerdGraphClient: Symbol.for('NerdGraphClient')
} as const;