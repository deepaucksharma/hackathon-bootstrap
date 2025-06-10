# Error Recovery Manager Implementation Guide for V2

## Overview

The Error Recovery Manager coordinates error handling across the platform, managing circuit breakers, implementing recovery strategies, and maintaining system health visibility. This is the central nervous system for platform resilience.

## Implementation Steps

### Step 1: Define Component Health Types

```typescript
// src/infrastructure/resilience/types.ts
export interface ComponentHealth {
  name: string;
  type: ComponentType;
  status: HealthStatus;
  lastHealthCheck?: Date;
  lastError?: ErrorInfo;
  critical: boolean;
  healthCheckFn?: () => Promise<void>;
}

export interface ErrorInfo {
  message: string;
  timestamp: Date;
  code?: string;
  context?: Record<string, any>;
}

export enum ComponentType {
  COLLECTOR = 'COLLECTOR',
  TRANSFORMER = 'TRANSFORMER',
  SYNTHESIZER = 'SYNTHESIZER',
  STREAMER = 'STREAMER',
  EXTERNAL_API = 'EXTERNAL_API'
}

export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY',
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
  UNKNOWN = 'UNKNOWN'
}

export interface RecoveryStrategy {
  type: 'RETRY' | 'FALLBACK' | 'CIRCUIT_BREAKER' | 'MANUAL';
  execute: (error: Error, context?: any) => Promise<any>;
}
```

### Step 2: Create Error Recovery Manager

```typescript
// src/infrastructure/resilience/error-recovery-manager.ts
import { injectable, inject } from 'inversify';
import { EventEmitter } from 'events';
import { TYPES } from '@infrastructure/config/types';
import { Logger } from '@shared/utils/logger';
import { CircuitBreakerFactory } from './circuit-breaker-factory';
import { CircuitBreaker } from './circuit-breaker';
import { 
  ComponentHealth, 
  HealthStatus, 
  ComponentType, 
  RecoveryStrategy,
  ErrorInfo 
} from './types';

export interface RecoveryConfig {
  maxConcurrentRecoveries: number;
  healthCheckInterval: number;
  enableAutoRecovery: boolean;
  recoveryTimeout: number;
}

export interface SystemHealth {
  status: HealthStatus;
  lastCheck: Date;
  issues: string[];
  components: ComponentHealth[];
  metrics: {
    healthyComponents: number;
    degradedComponents: number;
    unhealthyComponents: number;
    activeRecoveries: number;
  };
}

@injectable()
export class ErrorRecoveryManager extends EventEmitter {
  private components = new Map<string, ComponentHealth>();
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private activeRecoveries = new Set<string>();
  private recoveryHistory: RecoveryRecord[] = [];
  private healthCheckTimer?: NodeJS.Timeout;
  private systemHealth: SystemHealth;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.CircuitBreakerFactory) private circuitBreakerFactory: CircuitBreakerFactory,
    @inject(TYPES.RecoveryConfig) private config: RecoveryConfig
  ) {
    super();
    this.systemHealth = this.createInitialSystemHealth();
    
    if (this.config.healthCheckInterval > 0) {
      this.startHealthMonitoring();
    }
  }

  /**
   * Register a component for health monitoring and recovery
   */
  registerComponent(
    name: string,
    config: {
      type: ComponentType;
      critical?: boolean;
      healthCheck?: () => Promise<void>;
      circuitBreakerConfig?: any;
    }
  ): void {
    const component: ComponentHealth = {
      name,
      type: config.type,
      status: HealthStatus.UNKNOWN,
      critical: config.critical ?? true,
      healthCheckFn: config.healthCheck
    };

    this.components.set(name, component);

    // Create circuit breaker if config provided
    if (config.circuitBreakerConfig) {
      const breaker = this.circuitBreakerFactory.create({
        name: `${name}-circuit-breaker`,
        ...config.circuitBreakerConfig
      });

      // Set up event handlers
      breaker.on('circuitOpened', (data) => this.handleCircuitOpened(name, data));
      breaker.on('circuitClosed', (data) => this.handleCircuitClosed(name, data));

      this.circuitBreakers.set(name, breaker);
    }

    this.logger.info(`Component '${name}' registered with recovery manager`, {
      type: config.type,
      critical: component.critical
    });
  }

  /**
   * Execute operation with recovery handling
   */
  async executeWithRecovery<T>(
    componentName: string,
    operation: () => Promise<T>,
    options?: {
      fallback?: () => Promise<T>;
      retry?: { attempts: number; delay: number };
      timeout?: number;
    }
  ): Promise<T> {
    const component = this.components.get(componentName);
    if (!component) {
      this.logger.warn(`Component '${componentName}' not registered`);
      return operation();
    }

    const recoveryId = `${componentName}-${Date.now()}`;
    this.activeRecoveries.add(recoveryId);

    try {
      // Get circuit breaker if available
      const circuitBreaker = this.circuitBreakers.get(componentName);
      
      // Execute with circuit breaker if available
      const executeOp = circuitBreaker 
        ? () => circuitBreaker.execute(operation)
        : operation;

      // Add timeout if specified
      const finalOp = options?.timeout
        ? () => this.withTimeout(executeOp(), options.timeout)
        : executeOp;

      // Execute with retry if specified
      const result = options?.retry
        ? await this.executeWithRetry(finalOp, options.retry)
        : await finalOp();

      // Update component status on success
      this.updateComponentStatus(componentName, HealthStatus.HEALTHY);
      
      return result;

    } catch (error) {
      const err = error as Error;
      
      // Update component status
      this.updateComponentStatus(componentName, HealthStatus.UNHEALTHY, {
        message: err.message,
        timestamp: new Date(),
        code: (err as any).code
      });

      // Record recovery attempt
      this.recordRecoveryAttempt(componentName, err, 'failed');

      // Try fallback if available
      if (options?.fallback) {
        try {
          this.logger.info(`Attempting fallback for component '${componentName}'`);
          const result = await options.fallback();
          this.recordRecoveryAttempt(componentName, null, 'fallback_success');
          return result;
        } catch (fallbackError) {
          this.logger.error(`Fallback failed for component '${componentName}':`, fallbackError);
          this.recordRecoveryAttempt(componentName, fallbackError as Error, 'fallback_failed');
        }
      }

      // Emit error event
      this.emit('componentError', {
        component: componentName,
        error: err.message,
        timestamp: new Date()
      });

      throw err;

    } finally {
      this.activeRecoveries.delete(recoveryId);
    }
  }

  /**
   * Execute with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: { attempts: number; delay: number }
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.attempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < config.attempts) {
          const delay = config.delay * Math.pow(2, attempt - 1); // Exponential backoff
          this.logger.debug(`Retry attempt ${attempt}/${config.attempts} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Add timeout to operation
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Operation timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  /**
   * Handle circuit breaker opening
   */
  private handleCircuitOpened(componentName: string, data: any): void {
    this.logger.warn(`Circuit opened for component '${componentName}'`, data);
    
    this.updateComponentStatus(componentName, HealthStatus.CIRCUIT_OPEN);
    
    // Schedule recovery if auto-recovery enabled and component is critical
    const component = this.components.get(componentName);
    if (component?.critical && this.config.enableAutoRecovery) {
      this.scheduleRecoveryAttempt(componentName);
    }

    this.emit('circuitOpened', { component: componentName, ...data });
  }

  /**
   * Handle circuit breaker closing
   */
  private handleCircuitClosed(componentName: string, data: any): void {
    this.logger.info(`Circuit closed for component '${componentName}'`, data);
    
    this.updateComponentStatus(componentName, HealthStatus.HEALTHY);
    this.recordRecoveryAttempt(componentName, null, 'recovered');
    
    this.emit('circuitClosed', { component: componentName, ...data });
  }

  /**
   * Schedule automatic recovery attempt
   */
  private scheduleRecoveryAttempt(componentName: string, delay: number = 60000): void {
    if (this.activeRecoveries.size >= this.config.maxConcurrentRecoveries) {
      this.logger.warn(`Max concurrent recoveries reached, skipping recovery for '${componentName}'`);
      return;
    }

    setTimeout(async () => {
      try {
        await this.attemptComponentRecovery(componentName);
      } catch (error) {
        this.logger.error(`Recovery attempt failed for '${componentName}':`, error);
      }
    }, delay);
  }

  /**
   * Attempt to recover a component
   */
  private async attemptComponentRecovery(componentName: string): Promise<void> {
    const component = this.components.get(componentName);
    const circuitBreaker = this.circuitBreakers.get(componentName);

    if (!component || !circuitBreaker) {
      return;
    }

    this.logger.info(`Attempting recovery for component '${componentName}'`);
    const recoveryId = `recovery-${componentName}-${Date.now()}`;
    this.activeRecoveries.add(recoveryId);

    try {
      // Reset circuit breaker to half-open
      circuitBreaker.reset();

      // Try health check if available
      if (component.healthCheckFn) {
        await this.withTimeout(component.healthCheckFn(), this.config.recoveryTimeout);
      }

      this.logger.info(`Recovery successful for component '${componentName}'`);
      this.updateComponentStatus(componentName, HealthStatus.HEALTHY);
      this.recordRecoveryAttempt(componentName, null, 'manual_recovery_success');

    } catch (error) {
      this.logger.error(`Recovery failed for component '${componentName}':`, error);
      this.updateComponentStatus(componentName, HealthStatus.UNHEALTHY);
      this.recordRecoveryAttempt(componentName, error as Error, 'manual_recovery_failed');
      
      // Schedule another attempt if still critical
      if (component.critical && this.config.enableAutoRecovery) {
        this.scheduleRecoveryAttempt(componentName, 120000); // 2 minutes
      }
    } finally {
      this.activeRecoveries.delete(recoveryId);
    }
  }

  /**
   * Update component status
   */
  private updateComponentStatus(
    componentName: string, 
    status: HealthStatus, 
    error?: ErrorInfo
  ): void {
    const component = this.components.get(componentName);
    if (!component) return;

    component.status = status;
    component.lastHealthCheck = new Date();
    
    if (error) {
      component.lastError = error;
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(
      () => this.performHealthCheck(),
      this.config.healthCheckInterval
    );

    this.logger.info('Health monitoring started', {
      interval: this.config.healthCheckInterval
    });
  }

  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(): Promise<void> {
    const startTime = Date.now();
    const issues: string[] = [];

    // Check each component
    for (const [name, component] of this.components) {
      if (component.healthCheckFn && component.status !== HealthStatus.CIRCUIT_OPEN) {
        try {
          await this.withTimeout(component.healthCheckFn(), 30000);
          this.updateComponentStatus(name, HealthStatus.HEALTHY);
        } catch (error) {
          const err = error as Error;
          this.updateComponentStatus(name, HealthStatus.UNHEALTHY, {
            message: err.message,
            timestamp: new Date()
          });

          if (component.critical) {
            issues.push(`Critical component '${name}' is unhealthy: ${err.message}`);
          }
        }
      }

      // Check circuit breaker health
      const breaker = this.circuitBreakers.get(name);
      if (breaker) {
        const stats = breaker.getStats();
        if (stats.state !== 'CLOSED' && component.critical) {
          issues.push(`Circuit breaker for '${name}' is ${stats.state}`);
        }
      }
    }

    // Update system health
    this.updateSystemHealth(issues);

    // Emit health update
    this.emit('healthUpdate', this.systemHealth);

    const duration = Date.now() - startTime;
    this.logger.debug(`Health check completed in ${duration}ms`, {
      issues: issues.length,
      healthy: this.systemHealth.metrics.healthyComponents
    });
  }

  /**
   * Update system health status
   */
  private updateSystemHealth(issues: string[]): void {
    const components = Array.from(this.components.values());
    
    const metrics = {
      healthyComponents: components.filter(c => c.status === HealthStatus.HEALTHY).length,
      degradedComponents: components.filter(c => c.status === HealthStatus.DEGRADED).length,
      unhealthyComponents: components.filter(c => 
        c.status === HealthStatus.UNHEALTHY || c.status === HealthStatus.CIRCUIT_OPEN
      ).length,
      activeRecoveries: this.activeRecoveries.size
    };

    const status = issues.length === 0 
      ? HealthStatus.HEALTHY 
      : metrics.unhealthyComponents > 0 
        ? HealthStatus.UNHEALTHY 
        : HealthStatus.DEGRADED;

    this.systemHealth = {
      status,
      lastCheck: new Date(),
      issues,
      components: [...components],
      metrics
    };
  }

  /**
   * Record recovery attempt
   */
  private recordRecoveryAttempt(
    componentName: string,
    error: Error | null,
    outcome: string
  ): void {
    const record: RecoveryRecord = {
      component: componentName,
      timestamp: new Date(),
      outcome,
      error: error?.message
    };

    this.recoveryHistory.unshift(record);
    
    // Limit history size
    if (this.recoveryHistory.length > 100) {
      this.recoveryHistory = this.recoveryHistory.slice(0, 100);
    }

    this.emit('recoveryAttempt', record);
  }

  /**
   * Get system health
   */
  getSystemHealth(): SystemHealth {
    return { ...this.systemHealth };
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStats(): RecoveryStats {
    const recent = this.recoveryHistory.slice(0, 20);
    const outcomes: Record<string, number> = {};

    recent.forEach(record => {
      outcomes[record.outcome] = (outcomes[record.outcome] || 0) + 1;
    });

    return {
      totalRecoveries: this.recoveryHistory.length,
      activeRecoveries: this.activeRecoveries.size,
      recentHistory: recent,
      outcomeBreakdown: outcomes
    };
  }

  /**
   * Create initial system health
   */
  private createInitialSystemHealth(): SystemHealth {
    return {
      status: HealthStatus.UNKNOWN,
      lastCheck: new Date(),
      issues: [],
      components: [],
      metrics: {
        healthyComponents: 0,
        degradedComponents: 0,
        unhealthyComponents: 0,
        activeRecoveries: 0
      }
    };
  }

  /**
   * Shutdown manager
   */
  shutdown(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    this.logger.info('Error recovery manager shutdown');
  }
}

interface RecoveryRecord {
  component: string;
  timestamp: Date;
  outcome: string;
  error?: string;
}

interface RecoveryStats {
  totalRecoveries: number;
  activeRecoveries: number;
  recentHistory: RecoveryRecord[];
  outcomeBreakdown: Record<string, number>;
}
```

### Step 3: Integrate with Platform Components

```typescript
// src/application/services/platform-orchestrator.ts (updated)
export class PlatformOrchestrator {
  private errorRecoveryManager: ErrorRecoveryManager;

  constructor(
    // ... existing dependencies
    @inject(TYPES.ErrorRecoveryManager) errorRecoveryManager: ErrorRecoveryManager
  ) {
    this.errorRecoveryManager = errorRecoveryManager;
    this.registerComponents();
  }

  private registerComponents(): void {
    // Register collector
    this.errorRecoveryManager.registerComponent('collector', {
      type: ComponentType.COLLECTOR,
      critical: true,
      healthCheck: async () => {
        if (this.collector) {
          // Perform simple collection test
          const samples = await this.collector.collect();
          if (samples.length === 0) {
            throw new Error('No data collected');
          }
        }
      },
      circuitBreakerConfig: {
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 30000,
        retryDelay: 10000
      }
    });

    // Register transformer
    this.errorRecoveryManager.registerComponent('transformer', {
      type: ComponentType.TRANSFORMER,
      critical: true,
      circuitBreakerConfig: {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 20000,
        retryDelay: 5000
      }
    });

    // Register synthesizer
    this.errorRecoveryManager.registerComponent('synthesizer', {
      type: ComponentType.SYNTHESIZER,
      critical: true,
      circuitBreakerConfig: {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 20000,
        retryDelay: 5000
      }
    });

    // Register streamer
    this.errorRecoveryManager.registerComponent('streamer', {
      type: ComponentType.STREAMER,
      critical: true,
      healthCheck: async () => {
        // Could test with a small health check event
      },
      circuitBreakerConfig: {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 30000,
        retryDelay: 15000
      }
    });
  }

  // Update runCycle method to use error recovery
  private async runCycle(): Promise<void> {
    try {
      // Collect with recovery
      const rawSamples = await this.errorRecoveryManager.executeWithRecovery(
        'collector',
        () => this.collect(),
        {
          retry: { attempts: 3, delay: 2000 },
          fallback: async () => {
            this.logger.warn('Using fallback: empty collection');
            return [];
          }
        }
      );

      if (rawSamples.length === 0) {
        this.logger.info('No data to process in this cycle');
        return;
      }

      // Transform with recovery
      const transformedMetrics = await this.errorRecoveryManager.executeWithRecovery(
        'transformer',
        () => this.transform(rawSamples),
        {
          retry: { attempts: 2, delay: 1000 }
        }
      );

      // Synthesize with recovery
      const entities = await this.errorRecoveryManager.executeWithRecovery(
        'synthesizer',
        () => this.synthesize(transformedMetrics),
        {
          retry: { attempts: 2, delay: 1000 }
        }
      );

      // Stream with recovery
      await this.errorRecoveryManager.executeWithRecovery(
        'streamer',
        () => this.stream(entities),
        {
          retry: { attempts: 3, delay: 5000 },
          timeout: 60000
        }
      );

      // Update stats
      this.stats.cyclesRun++;
      this.stats.totalEntitiesProcessed += entities.length;

    } catch (error) {
      this.stats.errors++;
      this.logger.error('Platform cycle failed:', error);
      this.eventBus.emit('platform.cycle.error', {
        error: error instanceof Error ? error.message : String(error),
        stats: this.stats
      });
    }
  }
}
```

### Step 4: Add Health Endpoint

```typescript
// src/presentation/http/routes/health-routes.ts (updated)
import { ErrorRecoveryManager } from '@infrastructure/resilience/error-recovery-manager';

export function healthRoutes(
  errorRecoveryManager: ErrorRecoveryManager
): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/health', async (request, reply) => {
      const systemHealth = errorRecoveryManager.getSystemHealth();
      const recoveryStats = errorRecoveryManager.getRecoveryStats();

      const isHealthy = systemHealth.status === HealthStatus.HEALTHY;
      
      reply
        .code(isHealthy ? 200 : 503)
        .send({
          status: systemHealth.status,
          timestamp: new Date().toISOString(),
          checks: {
            components: systemHealth.components.map(c => ({
              name: c.name,
              type: c.type,
              status: c.status,
              critical: c.critical,
              lastCheck: c.lastHealthCheck,
              lastError: c.lastError
            })),
            metrics: systemHealth.metrics,
            issues: systemHealth.issues
          },
          recovery: {
            activeRecoveries: recoveryStats.activeRecoveries,
            recentAttempts: recoveryStats.recentHistory.slice(0, 5),
            outcomes: recoveryStats.outcomeBreakdown
          }
        });
    });
  };
}
```

### Step 5: Add Tests

```typescript
// test/infrastructure/resilience/error-recovery-manager.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorRecoveryManager } from '@infrastructure/resilience/error-recovery-manager';
import { createMockLogger, createMockCircuitBreakerFactory } from '@test/mocks';

describe('ErrorRecoveryManager', () => {
  let manager: ErrorRecoveryManager;

  beforeEach(() => {
    manager = new ErrorRecoveryManager(
      createMockLogger(),
      createMockCircuitBreakerFactory(),
      {
        maxConcurrentRecoveries: 5,
        healthCheckInterval: 0, // Disable for tests
        enableAutoRecovery: true,
        recoveryTimeout: 5000
      }
    );
  });

  it('should register components', () => {
    manager.registerComponent('test-component', {
      type: ComponentType.COLLECTOR,
      critical: true
    });

    const health = manager.getSystemHealth();
    expect(health.components).toHaveLength(1);
    expect(health.components[0].name).toBe('test-component');
  });

  it('should execute with recovery on success', async () => {
    manager.registerComponent('test-component', {
      type: ComponentType.COLLECTOR
    });

    const operation = vi.fn().mockResolvedValue('success');
    const result = await manager.executeWithRecovery('test-component', operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledOnce();
  });

  it('should use fallback on failure', async () => {
    manager.registerComponent('test-component', {
      type: ComponentType.COLLECTOR
    });

    const operation = vi.fn().mockRejectedValue(new Error('Failed'));
    const fallback = vi.fn().mockResolvedValue('fallback-result');

    const result = await manager.executeWithRecovery(
      'test-component',
      operation,
      { fallback }
    );

    expect(result).toBe('fallback-result');
    expect(operation).toHaveBeenCalledOnce();
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('should retry on failure', async () => {
    manager.registerComponent('test-component', {
      type: ComponentType.COLLECTOR
    });

    let attempts = 0;
    const operation = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Temporary failure');
      }
      return 'success';
    });

    const result = await manager.executeWithRecovery(
      'test-component',
      operation,
      { retry: { attempts: 3, delay: 10 } }
    );

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should update component health on failure', async () => {
    manager.registerComponent('test-component', {
      type: ComponentType.COLLECTOR,
      critical: true
    });

    const operation = vi.fn().mockRejectedValue(new Error('Component failed'));

    try {
      await manager.executeWithRecovery('test-component', operation);
    } catch (e) {
      // Expected
    }

    const health = manager.getSystemHealth();
    const component = health.components.find(c => c.name === 'test-component');
    
    expect(component?.status).toBe(HealthStatus.UNHEALTHY);
    expect(component?.lastError?.message).toBe('Component failed');
  });
});
```

## Usage Example

```typescript
// During platform initialization
const errorRecoveryManager = container.get<ErrorRecoveryManager>(TYPES.ErrorRecoveryManager);

// In your service
class MyService {
  constructor(
    private errorRecoveryManager: ErrorRecoveryManager
  ) {
    // Register this service
    this.errorRecoveryManager.registerComponent('my-service', {
      type: ComponentType.COLLECTOR,
      critical: true,
      healthCheck: () => this.healthCheck(),
      circuitBreakerConfig: {
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 30000,
        retryDelay: 10000
      }
    });
  }

  async performOperation(): Promise<Result> {
    return this.errorRecoveryManager.executeWithRecovery(
      'my-service',
      () => this.riskyOperation(),
      {
        retry: { attempts: 3, delay: 2000 },
        fallback: () => this.fallbackOperation(),
        timeout: 30000
      }
    );
  }

  private async healthCheck(): Promise<void> {
    // Implement health check logic
  }
}
```

## Monitoring Dashboard

```json
{
  "name": "Platform Health & Recovery",
  "pages": [{
    "name": "System Health",
    "widgets": [{
      "title": "Component Status",
      "query": "FROM HealthCheck SELECT latest(status) FACET component"
    }, {
      "title": "Recovery Attempts",
      "query": "FROM RecoveryAttempt SELECT count(*) FACET outcome TIMESERIES"
    }, {
      "title": "Active Recoveries",
      "query": "FROM SystemHealth SELECT latest(activeRecoveries) TIMESERIES"
    }, {
      "title": "Critical Issues",
      "query": "FROM SystemHealth SELECT latest(criticalIssues) WHERE criticalIssues > 0"
    }]
  }]
}
```

## Benefits

1. **Centralized Error Management**: Single point of control for all error handling
2. **Automatic Recovery**: Self-healing capabilities for transient failures
3. **Health Visibility**: Comprehensive view of system health
4. **Graceful Degradation**: Fallback strategies prevent total failure
5. **Circuit Breaker Integration**: Prevents cascading failures
6. **Flexible Recovery Strategies**: Retry, fallback, and manual recovery options