/**
 * Circuit Breaker Pattern Implementation
 * 
 * Protects external services from being overwhelmed by failing fast
 * when the service is unavailable or experiencing issues.
 */

import { Logger } from '../../shared/utils/logger';
import { EventEmitter } from 'events';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  retryDelay?: number;
  volumeThreshold?: number;
  monitoringWindow?: number;
  logger?: Logger;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  totalCalls: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  nextRetryTime?: number;
}

export class CircuitBreaker<T = any> extends EventEmitter {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private totalCalls = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private nextRetryTime?: number;
  private readonly logger: Logger;

  // Configuration
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeout: number;
  private readonly retryDelay: number;
  private readonly volumeThreshold: number;

  constructor(options: CircuitBreakerOptions) {
    super();
    this.name = options.name;
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 60000; // 1 minute
    this.retryDelay = options.retryDelay || 30000; // 30 seconds
    this.volumeThreshold = options.volumeThreshold || 10;
    this.logger = options.logger || new Logger(`CircuitBreaker:${this.name}`);
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<R = T>(operation: () => Promise<R>): Promise<R> {
    this.totalCalls++;

    // Check if circuit should be opened
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextRetryTime!) {
        const error = new Error(`Circuit breaker is OPEN for ${this.name}`);
        (error as any).code = 'CIRCUIT_OPEN';
        throw error;
      }
      // Move to half-open to test if service has recovered
      this.transitionTo('HALF_OPEN');
    }

    try {
      // Execute with timeout protection
      const result = await this.executeWithTimeout(operation);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<R>(operation: () => Promise<R>): Promise<R> {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const error = new Error(`Operation timed out after ${this.timeout}ms`);
        (error as any).code = 'TIMEOUT';
        reject(error);
      }, this.timeout);

      try {
        const result = await operation();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = Date.now();

    switch (this.state) {
      case 'HALF_OPEN':
        if (this.successes >= this.successThreshold) {
          this.transitionTo('CLOSED');
        }
        break;

      case 'CLOSED':
        this.failures = 0; // Reset failure count on success
        break;
    }

    this.emit('success', {
      name: this.name,
      state: this.state,
      successes: this.successes
    });
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: Error): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    // Log the failure
    this.logger.warn(`Circuit breaker ${this.name} recorded failure:`, {
      error: error.message,
      failures: this.failures,
      state: this.state
    });

    switch (this.state) {
      case 'CLOSED':
        if (this.failures >= this.failureThreshold && this.totalCalls >= this.volumeThreshold) {
          this.transitionTo('OPEN');
        }
        break;

      case 'HALF_OPEN':
        this.transitionTo('OPEN');
        break;
    }

    this.emit('failure', {
      name: this.name,
      state: this.state,
      failures: this.failures,
      error: error.message
    });
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    // Reset counters on state change
    switch (newState) {
      case 'OPEN':
        this.nextRetryTime = Date.now() + this.retryDelay;
        this.logger.error(`Circuit breaker ${this.name} is now OPEN`, {
          failures: this.failures,
          nextRetryTime: new Date(this.nextRetryTime).toISOString()
        });
        break;

      case 'HALF_OPEN':
        this.failures = 0;
        this.successes = 0;
        this.logger.info(`Circuit breaker ${this.name} is now HALF_OPEN (testing recovery)`);
        break;

      case 'CLOSED':
        this.failures = 0;
        this.successes = 0;
        this.nextRetryTime = undefined;
        this.logger.info(`Circuit breaker ${this.name} is now CLOSED (recovered)`);
        break;
    }

    this.emit('stateChange', {
      name: this.name,
      oldState,
      newState,
      timestamp: Date.now()
    });
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalCalls: this.totalCalls,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextRetryTime: this.nextRetryTime
    };
  }

  /**
   * Force the circuit to close (for manual recovery)
   */
  reset(): void {
    this.transitionTo('CLOSED');
    this.failures = 0;
    this.successes = 0;
    this.totalCalls = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.logger.info(`Circuit breaker ${this.name} has been manually reset`);
  }

  /**
   * Force the circuit to open (for manual intervention)
   */
  trip(): void {
    this.transitionTo('OPEN');
    this.logger.warn(`Circuit breaker ${this.name} has been manually tripped`);
  }

  /**
   * Check if circuit is currently allowing requests
   */
  isOpen(): boolean {
    return this.state === 'OPEN' && Date.now() < (this.nextRetryTime || 0);
  }

  /**
   * Get human-readable status
   */
  getStatus(): string {
    switch (this.state) {
      case 'CLOSED':
        return `Closed (healthy) - ${this.failures}/${this.failureThreshold} failures`;
      case 'OPEN':
        const remainingTime = this.nextRetryTime ? this.nextRetryTime - Date.now() : 0;
        return `Open (unhealthy) - Retry in ${Math.ceil(remainingTime / 1000)}s`;
      case 'HALF_OPEN':
        return `Half-open (testing) - ${this.successes}/${this.successThreshold} successes needed`;
      default:
        return 'Unknown state';
    }
  }
}

/**
 * Circuit Breaker Factory for managing multiple breakers
 */
export class CircuitBreakerFactory {
  private static instance: CircuitBreakerFactory;
  private breakers = new Map<string, CircuitBreaker>();
  private logger = new Logger('CircuitBreakerFactory');

  static getInstance(): CircuitBreakerFactory {
    if (!this.instance) {
      this.instance = new CircuitBreakerFactory();
    }
    return this.instance;
  }

  /**
   * Get or create a circuit breaker
   */
  getBreaker(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const breaker = new CircuitBreaker({
        name,
        ...options
      });

      // Subscribe to events for monitoring
      breaker.on('stateChange', (event) => {
        this.logger.info('Circuit breaker state changed', event);
      });

      breaker.on('failure', (event) => {
        if (event.failures % 10 === 0) { // Log every 10th failure
          this.logger.warn('Circuit breaker failures increasing', event);
        }
      });

      this.breakers.set(name, breaker);
    }

    return this.breakers.get(name)!;
  }

  /**
   * Get all circuit breakers
   */
  getAllBreakers(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  /**
   * Get status of all breakers
   */
  getAllStatus(): Record<string, CircuitBreakerStats> {
    const status: Record<string, CircuitBreakerStats> = {};
    
    for (const [name, breaker] of this.breakers) {
      status[name] = breaker.getStats();
    }
    
    return status;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
    this.logger.info('All circuit breakers have been reset');
  }
}