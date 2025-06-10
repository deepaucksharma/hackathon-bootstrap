/**
 * Circuit Breaker Factory
 * Creates and manages circuit breaker instances
 */

import { injectable, inject } from 'inversify';
import { TYPES } from '@infrastructure/config/types';
import { Logger } from '@shared/utils/logger';
import { CircuitBreaker, CircuitBreakerOptions } from './circuit-breaker';

@injectable()
export class CircuitBreakerFactory {
  private breakers = new Map<string, CircuitBreaker>();
  private defaultConfigs: Map<string, CircuitBreakerOptions> = new Map();

  constructor(
    @inject(TYPES.Logger) private logger: Logger
  ) {
    this.initializeDefaultConfigs();
  }

  /**
   * Initialize default configurations for common services
   */
  private initializeDefaultConfigs(): void {
    // NerdGraph API configuration
    this.defaultConfigs.set('nerdgraph-api', {
      name: 'nerdgraph-api',
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000, // 30 seconds
      retryDelay: 5000, // 5 seconds
      monitoringWindow: 60000 // 1 minute
    });

    // Event API configuration
    this.defaultConfigs.set('event-api', {
      name: 'event-api',
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 20000, // 20 seconds
      retryDelay: 10000, // 10 seconds
      monitoringWindow: 60000 // 1 minute
    });

    // Metric API configuration
    this.defaultConfigs.set('metric-api', {
      name: 'metric-api',
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 15000, // 15 seconds
      retryDelay: 5000, // 5 seconds
      monitoringWindow: 60000 // 1 minute
    });

    // Infrastructure collector configuration
    this.defaultConfigs.set('infrastructure-collector', {
      name: 'infrastructure-collector',
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 45000, // 45 seconds for large queries
      retryDelay: 15000, // 15 seconds
      monitoringWindow: 300000 // 5 minutes
    });
  }

  /**
   * Create or get existing circuit breaker
   */
  create(config: CircuitBreakerOptions): CircuitBreaker {
    if (this.breakers.has(config.name)) {
      this.logger.debug(`Returning existing circuit breaker: ${config.name}`);
      return this.breakers.get(config.name)!;
    }

    this.logger.info(`Creating new circuit breaker: ${config.name}`);
    const breaker = new CircuitBreaker(config);
    
    // Set up event listeners for monitoring
    this.setupEventListeners(breaker);
    
    this.breakers.set(config.name, breaker);
    return breaker;
  }

  /**
   * Create circuit breaker with default configuration
   */
  createWithDefaults(name: string): CircuitBreaker {
    const defaultConfig = this.defaultConfigs.get(name);
    if (!defaultConfig) {
      throw new Error(`No default configuration found for: ${name}`);
    }
    return this.create(defaultConfig);
  }

  /**
   * Get existing circuit breaker
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Get or create circuit breaker
   */
  getOrCreate(name: string, config?: CircuitBreakerOptions): CircuitBreaker {
    const existing = this.get(name);
    if (existing) {
      return existing;
    }

    if (config) {
      return this.create(config);
    }

    // Try to use default config
    const defaultConfig = this.defaultConfigs.get(name);
    if (defaultConfig) {
      return this.create(defaultConfig);
    }

    throw new Error(`No configuration provided and no default found for: ${name}`);
  }

  /**
   * Get all circuit breakers
   */
  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  /**
   * Get statistics for all breakers
   */
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    this.breakers.forEach((breaker, name) => {
      stats[name] = breaker.getStats();
    });
    
    return stats;
  }

  /**
   * Reset specific circuit breaker
   */
  reset(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
      this.logger.info(`Reset circuit breaker: ${name}`);
    } else {
      this.logger.warn(`Circuit breaker not found: ${name}`);
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.logger.info('Resetting all circuit breakers');
    this.breakers.forEach(breaker => breaker.reset());
  }

  /**
   * Remove circuit breaker
   */
  remove(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.removeAllListeners();
      this.breakers.delete(name);
      this.logger.info(`Removed circuit breaker: ${name}`);
    }
  }

  /**
   * Remove all circuit breakers
   */
  removeAll(): void {
    this.logger.info('Removing all circuit breakers');
    this.breakers.forEach(breaker => breaker.removeAllListeners());
    this.breakers.clear();
  }

  /**
   * Set up event listeners for monitoring
   */
  private setupEventListeners(breaker: CircuitBreaker): void {
    breaker.on('circuitOpened', (data) => {
      this.logger.warn(`Circuit opened: ${breaker.getStats().state}`, data);
    });

    breaker.on('circuitClosed', (data) => {
      this.logger.info(`Circuit closed: ${breaker.getStats().state}`, data);
    });

    breaker.on('circuitHalfOpen', (data) => {
      this.logger.info(`Circuit half-open: ${breaker.getStats().state}`, data);
    });

    breaker.on('callRejected', (data) => {
      this.logger.debug(`Call rejected by circuit breaker`, data);
    });
  }

  /**
   * Get health status of all breakers
   */
  getHealthStatus(): { healthy: number; degraded: number; unhealthy: number } {
    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;

    this.breakers.forEach(breaker => {
      const state = breaker.getStats().state;
      if (state === 'CLOSED') {
        healthy++;
      } else if (state === 'HALF_OPEN') {
        degraded++;
      } else {
        unhealthy++;
      }
    });

    return { healthy, degraded, unhealthy };
  }
}