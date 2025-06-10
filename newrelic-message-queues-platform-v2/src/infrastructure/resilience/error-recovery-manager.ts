/**
 * Error Recovery Manager
 * 
 * Centralized error handling with automatic recovery strategies.
 * Prevents cascading failures and enables self-healing capabilities.
 */

import { Logger } from '../../shared/utils/logger';
import { EventBus } from '../../shared/events/event-bus';
import { HealthMonitor } from '../monitoring/health-monitor';

export interface ErrorContext {
  component: string;
  operation: string;
  error: Error;
  metadata?: Record<string, any>;
  attemptNumber?: number;
}

export interface RecoveryStrategy {
  name: string;
  canHandle(error: Error): boolean;
  recover(context: ErrorContext): Promise<RecoveryResult>;
}

export interface RecoveryResult {
  success: boolean;
  action: 'retry' | 'fallback' | 'skip' | 'fail';
  message?: string;
  delay?: number;
}

export class ErrorRecoveryManager {
  private readonly logger: Logger;
  private readonly strategies = new Map<string, RecoveryStrategy>();
  private readonly errorCounts = new Map<string, number>();
  private readonly recoveryHistory: RecoveryEvent[] = [];
  
  constructor(
    private readonly eventBus: EventBus,
    private readonly healthMonitor: HealthMonitor
  ) {
    this.logger = new Logger('ErrorRecoveryManager');
    this.registerDefaultStrategies();
  }

  /**
   * Register a recovery strategy
   */
  registerStrategy(strategy: RecoveryStrategy): void {
    this.strategies.set(strategy.name, strategy);
    this.logger.info(`Registered recovery strategy: ${strategy.name}`);
  }

  /**
   * Handle an error with automatic recovery
   */
  async handleError(context: ErrorContext): Promise<RecoveryResult> {
    const errorKey = `${context.component}:${context.operation}`;
    this.incrementErrorCount(errorKey);
    
    this.logger.error(`Error in ${errorKey}:`, context.error);
    
    // Find applicable recovery strategy
    for (const strategy of this.strategies.values()) {
      if (strategy.canHandle(context.error)) {
        try {
          const result = await strategy.recover(context);
          
          this.recordRecovery({
            timestamp: Date.now(),
            component: context.component,
            operation: context.operation,
            strategy: strategy.name,
            result
          });
          
          if (result.success) {
            this.resetErrorCount(errorKey);
            this.eventBus.emit('error:recovered', {
              component: context.component,
              strategy: strategy.name
            });
          }
          
          return result;
        } catch (strategyError) {
          this.logger.error(`Recovery strategy ${strategy.name} failed:`, strategyError);
        }
      }
    }
    
    // No strategy found, return default failure
    return {
      success: false,
      action: 'fail',
      message: 'No recovery strategy available'
    };
  }

  /**
   * Execute a function with automatic error recovery
   */
  async withRecovery<T>(
    component: string,
    operation: string,
    fn: () => Promise<T>,
    maxAttempts = 3
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        const context: ErrorContext = {
          component,
          operation,
          error: lastError,
          attemptNumber: attempt
        };
        
        const recovery = await this.handleError(context);
        
        if (recovery.action === 'retry' && attempt < maxAttempts) {
          if (recovery.delay) {
            await this.delay(recovery.delay);
          }
          continue;
        } else if (recovery.action === 'skip') {
          throw new Error(`Operation skipped: ${recovery.message}`);
        } else if (recovery.action === 'fail') {
          throw lastError;
        }
      }
    }
    
    throw lastError || new Error('Unknown error in recovery');
  }

  /**
   * Register default recovery strategies
   */
  private registerDefaultStrategies(): void {
    // Network error recovery
    this.registerStrategy({
      name: 'NetworkErrorRecovery',
      canHandle: (error) => {
        return error.message.includes('ECONNREFUSED') ||
               error.message.includes('ETIMEDOUT') ||
               error.message.includes('ENOTFOUND');
      },
      recover: async (context) => {
        const attempt = context.attemptNumber || 1;
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        
        return {
          success: true,
          action: 'retry',
          delay,
          message: `Network error, retrying in ${delay}ms`
        };
      }
    });

    // API rate limit recovery
    this.registerStrategy({
      name: 'RateLimitRecovery',
      canHandle: (error) => {
        return error.message.includes('429') ||
               error.message.includes('rate limit');
      },
      recover: async (context) => {
        const delay = 60000; // 1 minute
        
        this.eventBus.emit('api:rateLimited', {
          component: context.component,
          delay
        });
        
        return {
          success: true,
          action: 'retry',
          delay,
          message: `Rate limited, waiting ${delay}ms`
        };
      }
    });

    // Authentication error recovery
    this.registerStrategy({
      name: 'AuthErrorRecovery',
      canHandle: (error) => {
        return error.message.includes('401') ||
               error.message.includes('403') ||
               error.message.includes('authentication');
      },
      recover: async (context) => {
        this.healthMonitor.reportUnhealthy('authentication', 'Auth failure');
        
        return {
          success: false,
          action: 'fail',
          message: 'Authentication failed - check credentials'
        };
      }
    });

    // Data validation error recovery
    this.registerStrategy({
      name: 'ValidationErrorRecovery',
      canHandle: (error) => {
        return error.message.includes('validation') ||
               error.message.includes('invalid data');
      },
      recover: async (context) => {
        this.logger.warn(`Skipping invalid data in ${context.operation}`);
        
        return {
          success: true,
          action: 'skip',
          message: 'Invalid data skipped'
        };
      }
    });

    // Memory error recovery
    this.registerStrategy({
      name: 'MemoryErrorRecovery',
      canHandle: (error) => {
        return error.message.includes('heap out of memory') ||
               error.message.includes('ENOMEM');
      },
      recover: async (context) => {
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        
        this.eventBus.emit('system:memoryPressure', {
          component: context.component
        });
        
        return {
          success: true,
          action: 'retry',
          delay: 5000,
          message: 'Memory pressure detected, retrying after GC'
        };
      }
    });
  }

  private incrementErrorCount(key: string): void {
    const count = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, count + 1);
    
    // Alert if error threshold exceeded
    if (count > 10) {
      this.healthMonitor.reportUnhealthy(key, `High error rate: ${count} errors`);
    }
  }

  private resetErrorCount(key: string): void {
    this.errorCounts.delete(key);
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private recordRecovery(event: RecoveryEvent): void {
    this.recoveryHistory.push(event);
    
    // Keep only last 1000 events
    if (this.recoveryHistory.length > 1000) {
      this.recoveryHistory.shift();
    }
  }

  /**
   * Get recovery statistics
   */
  getStats(): RecoveryStats {
    const stats: RecoveryStats = {
      totalErrors: 0,
      totalRecoveries: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      errorsByComponent: {},
      strategiesUsed: {}
    };
    
    for (const [key, count] of this.errorCounts) {
      stats.totalErrors += count;
      const [component] = key.split(':');
      stats.errorsByComponent[component] = (stats.errorsByComponent[component] || 0) + count;
    }
    
    for (const event of this.recoveryHistory) {
      stats.totalRecoveries++;
      if (event.result.success) {
        stats.successfulRecoveries++;
      } else {
        stats.failedRecoveries++;
      }
      
      stats.strategiesUsed[event.strategy] = (stats.strategiesUsed[event.strategy] || 0) + 1;
    }
    
    return stats;
  }
}

interface RecoveryEvent {
  timestamp: number;
  component: string;
  operation: string;
  strategy: string;
  result: RecoveryResult;
}

interface RecoveryStats {
  totalErrors: number;
  totalRecoveries: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  errorsByComponent: Record<string, number>;
  strategiesUsed: Record<string, number>;
}