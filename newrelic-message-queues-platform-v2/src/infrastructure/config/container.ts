/**
 * Dependency Injection Container
 * Configures and wires all application dependencies
 */

import { Container, interfaces } from 'inversify';
import 'reflect-metadata';

import type { BrokerRepository } from '@domain/repositories/broker-repository.js';
import { EventBus } from '@shared/events/event-bus.js';
import { Logger } from '@shared/utils/logger.js';
import { MonitorBrokersUseCase } from '@application/use-cases/monitor-brokers.js';
import { PlatformOrchestrator } from '@application/services/platform-orchestrator.js';

// Infrastructure implementations (will be created next)
import { InMemoryBrokerRepository } from '@infrastructure/repositories/in-memory-broker-repository.js';
import { ConfigurationService } from '@infrastructure/config/configuration-service.js';

// Import types from separate file to avoid circular dependencies
import { TYPES } from './types.js';
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