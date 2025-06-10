/**
 * Dependency Injection Types
 * Centralized symbols for dependency injection to avoid circular imports
 */

// Symbols for dependency injection
export const TYPES = {
  // Domain
  BrokerRepository: Symbol.for('BrokerRepository'),
  
  // Application
  MonitorBrokersUseCase: Symbol.for('MonitorBrokersUseCase'),
  PlatformOrchestrator: Symbol.for('PlatformOrchestrator'),
  
  // Infrastructure
  ConfigurationService: Symbol.for('ConfigurationService'),
  
  // Shared
  EventBus: Symbol.for('EventBus'),
  Logger: Symbol.for('Logger')
} as const;