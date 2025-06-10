# Circuit Breaker Implementation Guide for V2

## Overview

The Circuit Breaker pattern prevents cascading failures by detecting when an external service is failing and temporarily stopping attempts to use it. This is critical for V2's production readiness.

## Implementation Steps

### Step 1: Create Base Circuit Breaker Class

```typescript
// src/infrastructure/resilience/circuit-breaker.ts
import { EventEmitter } from 'events';
import { Logger } from '@shared/utils/logger';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  retryDelay: number;
  monitoringWindow: number;
}

export interface CircuitBreakerStats {
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
  totalTimeouts: number;
  averageResponseTime: number;
  state: CircuitState;
  lastError?: string;
}

export class CircuitBreaker<T = any> extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptTime?: number;
  private stats: CircuitBreakerStats;
  private callHistory: Array<{ timestamp: number; success: boolean; duration: number }> = [];

  constructor(
    private config: CircuitBreakerConfig,
    private logger: Logger
  ) {
    super();
    this.stats = {
      totalCalls: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      totalTimeouts: 0,
      averageResponseTime: 0,
      state: CircuitState.CLOSED
    };
  }

  async execute<R>(fn: () => Promise<R>): Promise<R> {
    this.stats.totalCalls++;
    this.cleanupCallHistory();

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < (this.nextAttemptTime || 0)) {
        const error = new Error(`Circuit breaker '${this.config.name}' is OPEN`);
        this.emit('callRejected', { error, state: this.state });
        throw error;
      } else {
        // Move to half-open to test
        this.setState(CircuitState.HALF_OPEN);
      }
    }

    const startTime = Date.now();

    try {
      // Execute with timeout
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => 
          setTimeout(() => {
            this.stats.totalTimeouts++;
            reject(new Error(`Timeout after ${this.config.timeout}ms`));
          }, this.config.timeout)
        )
      ]);

      this.onSuccess(Date.now() - startTime);
      return result;
    } catch (error) {
      this.onFailure(error as Error, Date.now() - startTime);
      throw error;
    }
  }

  private onSuccess(responseTime: number): void {
    this.successCount++;
    this.stats.totalSuccesses++;
    this.updateAverageResponseTime(responseTime);
    this.recordCall(true, responseTime);

    this.logger.debug(`${this.config.name} call succeeded in ${responseTime}ms`);

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successCount >= this.config.successThreshold) {
        this.setState(CircuitState.CLOSED);
        this.resetCounts();
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount = 0;
    }

    this.emit('success', { responseTime, state: this.state });
  }

  private onFailure(error: Error, responseTime: number): void {
    this.failureCount++;
    this.stats.totalFailures++;
    this.stats.lastError = error.message;
    this.recordCall(false, responseTime);

    this.logger.warn(`${this.config.name} call failed: ${error.message}`);

    if (this.state === CircuitState.HALF_OPEN) {
      this.setState(CircuitState.OPEN);
      this.scheduleNextAttempt();
    } else if (this.state === CircuitState.CLOSED) {
      if (this.failureCount >= this.config.failureThreshold) {
        this.setState(CircuitState.OPEN);
        this.scheduleNextAttempt();
      }
    }

    this.emit('failure', { error, responseTime, state: this.state });
  }

  private setState(newState: CircuitState): void {
    const previousState = this.state;
    this.state = newState;
    this.stats.state = newState;

    if (newState === CircuitState.OPEN && previousState !== CircuitState.OPEN) {
      this.logger.warn(`Circuit breaker '${this.config.name}' opened`);
      this.emit('circuitOpened', { failureCount: this.failureCount });
    } else if (newState === CircuitState.CLOSED && previousState !== CircuitState.CLOSED) {
      this.logger.info(`Circuit breaker '${this.config.name}' closed`);
      this.emit('circuitClosed', { successCount: this.successCount });
    }
  }

  private scheduleNextAttempt(): void {
    this.nextAttemptTime = Date.now() + this.config.retryDelay;
  }

  private resetCounts(): void {
    this.failureCount = 0;
    this.successCount = 0;
  }

  private recordCall(success: boolean, duration: number): void {
    this.callHistory.push({ timestamp: Date.now(), success, duration });
  }

  private cleanupCallHistory(): void {
    const cutoff = Date.now() - this.config.monitoringWindow;
    this.callHistory = this.callHistory.filter(call => call.timestamp > cutoff);
  }

  private updateAverageResponseTime(responseTime: number): void {
    const totalCalls = this.stats.totalSuccesses + this.stats.totalFailures;
    this.stats.averageResponseTime = 
      ((this.stats.averageResponseTime * (totalCalls - 1)) + responseTime) / totalCalls;
  }

  getStats(): CircuitBreakerStats {
    return { ...this.stats };
  }

  reset(): void {
    this.setState(CircuitState.CLOSED);
    this.resetCounts();
    this.nextAttemptTime = undefined;
    this.callHistory = [];
    this.emit('reset');
  }
}
```

### Step 2: Create Circuit Breaker Factory

```typescript
// src/infrastructure/resilience/circuit-breaker-factory.ts
import { injectable, inject } from 'inversify';
import { TYPES } from '@infrastructure/config/types';
import { Logger } from '@shared/utils/logger';
import { CircuitBreaker, CircuitBreakerConfig } from './circuit-breaker';

@injectable()
export class CircuitBreakerFactory {
  private breakers = new Map<string, CircuitBreaker>();

  constructor(
    @inject(TYPES.Logger) private logger: Logger
  ) {}

  create(config: CircuitBreakerConfig): CircuitBreaker {
    if (this.breakers.has(config.name)) {
      return this.breakers.get(config.name)!;
    }

    const breaker = new CircuitBreaker(config, this.logger);
    this.breakers.set(config.name, breaker);
    return breaker;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  reset(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
    }
  }

  resetAll(): void {
    this.breakers.forEach(breaker => breaker.reset());
  }
}
```

### Step 3: Integrate with NerdGraph Client

```typescript
// src/shared/utils/nerdgraph-client.ts (updated)
import { CircuitBreaker } from '@infrastructure/resilience/circuit-breaker';

export class NerdGraphClient {
  private circuitBreaker: CircuitBreaker;

  constructor(
    private config: NewRelicConfig,
    private logger: Logger,
    circuitBreakerFactory: CircuitBreakerFactory
  ) {
    this.circuitBreaker = circuitBreakerFactory.create({
      name: 'nerdgraph-api',
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000,
      retryDelay: 5000,
      monitoringWindow: 60000
    });
  }

  async query<T>(query: string): Promise<T> {
    return this.circuitBreaker.execute(async () => {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-Key': this.config.apiKey,
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(`NerdGraph API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }

      return data;
    });
  }
}
```

### Step 4: Integrate with Event API Streamer

```typescript
// src/streaming/entity-streamer.ts (updated)
export class EntityStreamer {
  private circuitBreaker: CircuitBreaker;

  constructor(
    private config: StreamerConfig,
    private logger: Logger,
    circuitBreakerFactory: CircuitBreakerFactory
  ) {
    this.circuitBreaker = circuitBreakerFactory.create({
      name: 'event-api',
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 20000,
      retryDelay: 10000,
      monitoringWindow: 60000
    });
  }

  async streamEntities(entities: Entity[]): Promise<void> {
    const batches = this.createBatches(entities);

    for (const batch of batches) {
      await this.circuitBreaker.execute(async () => {
        await this.sendBatch(batch);
      });
    }
  }

  private async sendBatch(batch: Entity[]): Promise<void> {
    const response = await fetch(this.getEventApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': this.config.ingestKey,
      },
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      throw new Error(`Event API error: ${response.status}`);
    }
  }
}
```

### Step 5: Add Monitoring Dashboard

```typescript
// src/infrastructure/resilience/circuit-breaker-monitor.ts
import { injectable, inject } from 'inversify';
import { CircuitBreakerFactory } from './circuit-breaker-factory';
import { MetricStreamer } from '@streaming/metric-streamer';

@injectable()
export class CircuitBreakerMonitor {
  constructor(
    @inject(TYPES.CircuitBreakerFactory) private factory: CircuitBreakerFactory,
    @inject(TYPES.MetricStreamer) private metricStreamer: MetricStreamer
  ) {}

  async reportMetrics(): Promise<void> {
    const metrics: any[] = [];
    const timestamp = Date.now();

    this.factory.getAll().forEach((breaker, name) => {
      const stats = breaker.getStats();
      
      metrics.push({
        eventType: 'CircuitBreakerMetric',
        timestamp,
        breakerName: name,
        state: stats.state,
        totalCalls: stats.totalCalls,
        totalFailures: stats.totalFailures,
        totalSuccesses: stats.totalSuccesses,
        totalTimeouts: stats.totalTimeouts,
        averageResponseTime: stats.averageResponseTime,
        failureRate: stats.totalCalls > 0 
          ? (stats.totalFailures / stats.totalCalls) * 100 
          : 0,
        successRate: stats.totalCalls > 0 
          ? (stats.totalSuccesses / stats.totalCalls) * 100 
          : 0
      });
    });

    if (metrics.length > 0) {
      await this.metricStreamer.streamMetrics(metrics);
    }
  }

  startMonitoring(intervalMs: number = 60000): void {
    setInterval(() => {
      this.reportMetrics().catch(err => 
        console.error('Failed to report circuit breaker metrics:', err)
      );
    }, intervalMs);
  }
}
```

### Step 6: Update Dependency Injection Container

```typescript
// src/infrastructure/config/container.ts (additions)
import { CircuitBreakerFactory } from '@infrastructure/resilience/circuit-breaker-factory';
import { CircuitBreakerMonitor } from '@infrastructure/resilience/circuit-breaker-monitor';

// Add to container bindings
container.bind<CircuitBreakerFactory>(TYPES.CircuitBreakerFactory)
  .to(CircuitBreakerFactory)
  .inSingletonScope();

container.bind<CircuitBreakerMonitor>(TYPES.CircuitBreakerMonitor)
  .to(CircuitBreakerMonitor)
  .inSingletonScope();

// Update types.ts
export const TYPES = {
  // ... existing types
  CircuitBreakerFactory: Symbol.for('CircuitBreakerFactory'),
  CircuitBreakerMonitor: Symbol.for('CircuitBreakerMonitor'),
};
```

### Step 7: Add Tests

```typescript
// test/infrastructure/resilience/circuit-breaker.test.ts
import { describe, it, expect, vi } from 'vitest';
import { CircuitBreaker, CircuitState } from '@infrastructure/resilience/circuit-breaker';
import { createMockLogger } from '@test/mocks';

describe('CircuitBreaker', () => {
  const config = {
    name: 'test-breaker',
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 1000,
    retryDelay: 5000,
    monitoringWindow: 60000
  };

  it('should start in CLOSED state', () => {
    const breaker = new CircuitBreaker(config, createMockLogger());
    expect(breaker.getStats().state).toBe(CircuitState.CLOSED);
  });

  it('should open after failure threshold', async () => {
    const breaker = new CircuitBreaker(config, createMockLogger());
    const failingFn = vi.fn().mockRejectedValue(new Error('Test error'));

    // Fail 3 times
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(failingFn);
      } catch (e) {
        // Expected
      }
    }

    expect(breaker.getStats().state).toBe(CircuitState.OPEN);
  });

  it('should reject calls when OPEN', async () => {
    const breaker = new CircuitBreaker(config, createMockLogger());
    const failingFn = vi.fn().mockRejectedValue(new Error('Test error'));

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(failingFn);
      } catch (e) {
        // Expected
      }
    }

    // Should reject without calling function
    await expect(breaker.execute(failingFn)).rejects.toThrow('Circuit breaker');
    expect(failingFn).toHaveBeenCalledTimes(3); // Not 4
  });

  it('should move to HALF_OPEN after retry delay', async () => {
    const breaker = new CircuitBreaker({
      ...config,
      retryDelay: 100 // Short delay for testing
    }, createMockLogger());

    const failingFn = vi.fn().mockRejectedValue(new Error('Test error'));
    const successFn = vi.fn().mockResolvedValue('success');

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(failingFn);
      } catch (e) {
        // Expected
      }
    }

    // Wait for retry delay
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should try again (HALF_OPEN)
    const result = await breaker.execute(successFn);
    expect(result).toBe('success');
  });
});
```

## Usage Example

```typescript
// In platform initialization
const platform = new Platform();
const circuitBreakerMonitor = container.get<CircuitBreakerMonitor>(TYPES.CircuitBreakerMonitor);

// Start monitoring
circuitBreakerMonitor.startMonitoring(60000); // Report every minute

// The circuit breakers are now automatically protecting all external calls
```

## Monitoring

Create a dashboard to monitor circuit breaker states:

```json
{
  "name": "Circuit Breaker Health",
  "pages": [{
    "name": "Overview",
    "widgets": [{
      "title": "Circuit Breaker States",
      "query": "FROM CircuitBreakerMetric SELECT latest(state) FACET breakerName"
    }, {
      "title": "Failure Rates",
      "query": "FROM CircuitBreakerMetric SELECT average(failureRate) FACET breakerName TIMESERIES"
    }, {
      "title": "Response Times",
      "query": "FROM CircuitBreakerMetric SELECT average(averageResponseTime) FACET breakerName TIMESERIES"
    }]
  }]
}
```

## Benefits

1. **Automatic Failure Detection**: Prevents cascading failures
2. **Self-Healing**: Automatically tests and recovers
3. **Observability**: Full metrics and event emission
4. **Configurable**: Per-service configuration
5. **Testable**: Easy to test failure scenarios