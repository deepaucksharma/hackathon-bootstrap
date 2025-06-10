/**
 * Dependency Injection Container
 * Configures and wires all application dependencies
 */

import { Container, interfaces } from 'inversify';
import 'reflect-metadata';

import type { BrokerRepository } from '@domain/repositories/broker-repository';
import { EventBus } from '@shared/events/event-bus';
import { Logger } from '@shared/utils/logger';
import { MonitorBrokersUseCase } from '@application/use-cases/monitor-brokers';
import { PlatformOrchestrator } from '@application/services/platform-orchestrator';

// Infrastructure implementations
import { InMemoryBrokerRepository } from '@infrastructure/repositories/in-memory-broker-repository';
import { ConfigurationService } from '@infrastructure/config/configuration-service';
import { CircuitBreakerFactory } from '@infrastructure/resilience/circuit-breaker-factory';
import { CircuitBreakerMonitor } from '@infrastructure/resilience/circuit-breaker-monitor';
import { WorkerPool } from '@infrastructure/concurrency/worker-pool';
import { NerdGraphClient } from '@shared/utils/nerdgraph-client';
import { InfrastructureCollector } from '@/collectors/infrastructure-collector';
import { NriKafkaTransformer } from '@/transformers/nri-kafka-transformer';
import { EntityStreamer } from '@/streaming/entity-streamer';
import { MetricStreamer } from '@/streaming/metric-streamer';

// New production-critical components
import { CircuitBreaker } from '@infrastructure/resilience/circuit-breaker';
import { ErrorRecoveryManager } from '@infrastructure/resilience/error-recovery-manager';
import { HealthMonitor } from '@infrastructure/monitoring/health-monitor';
import { EnhancedNriKafkaTransformer } from '@/transformers/enhanced-nri-kafka-transformer';

// Hybrid mode components
import { HybridModeManager } from '@infrastructure/hybrid/hybrid-mode-manager';
import { GapDetector } from '@infrastructure/hybrid/gap-detector';
import { EntitySimulator } from '@infrastructure/hybrid/entity-simulator';

// Relationship management
import { RelationshipManager } from '@infrastructure/relationships/relationship-manager';

// Aggregators
import { ClusterAggregator } from '@/aggregators/cluster-aggregator';

// Import types from separate file to avoid circular dependencies
import { TYPES } from './types';
export { TYPES };

/**
 * Create and configure the application container
 */
export function createContainer(): Container {
  const container = new Container({
    defaultScope: 'Singleton',
    autoBindInjectable: true
  });

  // Bind infrastructure services
  bindInfrastructure(container);
  
  // Bind shared services
  bindSharedServices(container);
  
  // Bind domain repositories
  bindRepositories(container);
  
  // Bind application use cases
  bindUseCases(container);
  
  // Bind collectors
  bindCollectors(container);
  
  // Bind transformers
  bindTransformers(container);
  
  // Bind streaming services
  bindStreamingServices(container);
  
  // Bind hybrid mode components
  bindHybridModeComponents(container);
  
  // Bind aggregators
  bindAggregators(container);
  
  return container;
}

/**
 * Bind infrastructure services
 */
function bindInfrastructure(container: Container): void {
  // Configuration service
  container.bind<ConfigurationService>(TYPES.ConfigurationService)
    .to(ConfigurationService)
    .inSingletonScope();
    
  // Circuit breaker factory
  container.bind<CircuitBreakerFactory>(TYPES.CircuitBreakerFactory)
    .to(CircuitBreakerFactory)
    .inSingletonScope();
    
  // Circuit breaker monitor
  container.bind<CircuitBreakerMonitor>(TYPES.CircuitBreakerMonitor)
    .to(CircuitBreakerMonitor)
    .inSingletonScope();
    
  // Worker pool
  container.bind<WorkerPool>(TYPES.WorkerPool)
    .toDynamicValue((context: interfaces.Context) => {
      const logger = context.container.get<Logger>(TYPES.Logger);
      return new WorkerPool({
        logger,
        minWorkers: 2,
        maxWorkers: 8,
        idleTimeout: 30000,
        taskTimeout: 60000
      });
    })
    .inSingletonScope();
    
  // Health Monitor
  container.bind<HealthMonitor>(TYPES.HealthMonitor)
    .to(HealthMonitor)
    .inSingletonScope()
    .onActivation((context: interfaces.Context, healthMonitor: HealthMonitor) => {
      // Register default health checks
      healthMonitor.registerDefaultChecks();
      return healthMonitor;
    });
    
  // Error Recovery Manager
  container.bind<ErrorRecoveryManager>(TYPES.ErrorRecoveryManager)
    .toDynamicValue((context: interfaces.Context) => {
      const eventBus = context.container.get<EventBus>(TYPES.EventBus);
      const healthMonitor = context.container.get<HealthMonitor>(TYPES.HealthMonitor);
      return new ErrorRecoveryManager(eventBus, healthMonitor);
    })
    .inSingletonScope();
    
  // Circuit Breaker for NerdGraph
  container.bind<CircuitBreaker>(TYPES.NerdGraphCircuitBreaker)
    .toDynamicValue((context: interfaces.Context) => {
      const logger = context.container.get<Logger>(TYPES.Logger);
      return new CircuitBreaker({
        name: 'NerdGraph-API',
        failureThreshold: 5,
        timeout: 30000,
        retryDelay: 30000,
        logger
      });
    })
    .inSingletonScope();
}

/**
 * Bind shared services
 */
function bindSharedServices(container: Container): void {
  // Logger
  container.bind<Logger>(TYPES.Logger)
    .toDynamicValue((context: interfaces.Context) => {
      return new Logger('Platform');
    })
    .inSingletonScope();

  // Event Bus
  container.bind<EventBus>(TYPES.EventBus)
    .toDynamicValue((context: interfaces.Context) => {
      const logger = context.container.get<Logger>(TYPES.Logger);
      return new EventBus(logger);
    })
    .inSingletonScope();
    
  // NerdGraph Client
  container.bind<NerdGraphClient>(TYPES.NerdGraphClient)
    .to(NerdGraphClient)
    .inSingletonScope();
}

/**
 * Bind domain repositories
 */
function bindRepositories(container: Container): void {
  // Broker Repository
  // In development, use in-memory implementation
  // In production, this would be replaced with a persistent implementation
  container.bind<BrokerRepository>(TYPES.BrokerRepository)
    .to(InMemoryBrokerRepository)
    .inSingletonScope();
}

/**
 * Bind application use cases
 */
function bindUseCases(container: Container): void {
  container.bind<MonitorBrokersUseCase>(TYPES.MonitorBrokersUseCase)
    .to(MonitorBrokersUseCase)
    .inSingletonScope();
    
  container.bind<PlatformOrchestrator>(TYPES.PlatformOrchestrator)
    .to(PlatformOrchestrator)
    .inSingletonScope();
}

/**
 * Bind collectors
 */
function bindCollectors(container: Container): void {
  // Infrastructure Collector with enhanced features
  container.bind<InfrastructureCollector>(TYPES.InfrastructureCollector)
    .to(InfrastructureCollector)
    .inSingletonScope();
}

/**
 * Bind transformers
 */
function bindTransformers(container: Container): void {
  // Standard transformer
  container.bind<NriKafkaTransformer>(TYPES.NriKafkaTransformer)
    .to(NriKafkaTransformer)
    .inSingletonScope();
    
  // Enhanced transformer with comprehensive field mappings
  container.bind<EnhancedNriKafkaTransformer>(TYPES.EnhancedNriKafkaTransformer)
    .to(EnhancedNriKafkaTransformer)
    .inSingletonScope();
}

/**
 * Bind streaming services
 */
function bindStreamingServices(container: Container): void {
  // Entity Streamer
  container.bind<EntityStreamer>(TYPES.EntityStreamer)
    .to(EntityStreamer)
    .inSingletonScope();
    
  // Metric Streamer
  container.bind<MetricStreamer>(TYPES.MetricStreamer)
    .to(MetricStreamer)
    .inSingletonScope();
}

/**
 * Bind hybrid mode components
 */
function bindHybridModeComponents(container: Container): void {
  // Gap Detector
  container.bind<GapDetector>(TYPES.GapDetector)
    .to(GapDetector)
    .inSingletonScope();
    
  // Entity Simulator
  container.bind<EntitySimulator>(TYPES.EntitySimulator)
    .to(EntitySimulator)
    .inSingletonScope();
    
  // Hybrid Mode Manager
  container.bind<HybridModeManager>(TYPES.HybridModeManager)
    .to(HybridModeManager)
    .inSingletonScope();
    
  // Relationship Manager
  container.bind<RelationshipManager>(TYPES.RelationshipManager)
    .to(RelationshipManager)
    .inSingletonScope();
}

/**
 * Bind aggregators
 */
function bindAggregators(container: Container): void {
  // Cluster Aggregator
  container.bind<ClusterAggregator>(TYPES.ClusterAggregator)
    .to(ClusterAggregator)
    .inSingletonScope();
}

/**
 * Container factory for different environments
 */
export class ContainerFactory {
  private static instance: Container | null = null;

  /**
   * Get or create container instance
   */
  public static getInstance(): Container {
    if (!this.instance) {
      this.instance = createContainer();
    }
    return this.instance;
  }

  /**
   * Reset container (useful for testing)
   */
  public static reset(): void {
    this.instance = null;
  }

  /**
   * Create container for testing with mocks
   */
  public static createTestContainer(): Container {
    const container = new Container({
      defaultScope: 'Transient',
      autoBindInjectable: true
    });

    // In tests, we would bind mock implementations
    // This is just a placeholder for the pattern
    bindSharedServices(container);
    bindRepositories(container);
    bindUseCases(container);

    return container;
  }

  /**
   * Create container for production with persistent implementations
   */
  public static createProductionContainer(): Container {
    const container = createContainer();
    
    // In production, we might override some bindings
    // For example, use PostgreSQL instead of in-memory repository
    // container.rebind<BrokerRepository>(TYPES.BrokerRepository)
    //   .to(PostgresBrokerRepository)
    //   .inSingletonScope();
    
    return container;
  }
}