/**
 * Health Monitor
 * 
 * Monitors platform health and provides centralized health status reporting
 */

import { injectable } from 'inversify';
import { Logger } from '../../shared/utils/logger';
import { EventEmitter } from 'events';

export interface HealthStatus {
  component: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  lastCheck: Date;
  metadata?: Record<string, any>;
}

export interface HealthCheck {
  name: string;
  check: () => Promise<HealthCheckResult>;
  interval?: number;
  critical?: boolean;
}

export interface HealthCheckResult {
  healthy: boolean;
  message?: string;
  metadata?: Record<string, any>;
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  components: HealthStatus[];
  lastCheck: Date;
  uptime: number;
  issues: string[];
}

@injectable()
export class HealthMonitor extends EventEmitter {
  private readonly logger = new Logger('HealthMonitor');
  private readonly healthChecks = new Map<string, HealthCheck>();
  private readonly componentStatus = new Map<string, HealthStatus>();
  private readonly checkIntervals = new Map<string, NodeJS.Timeout>();
  private startTime = Date.now();

  constructor() {
    super();
    this.logger.info('Health monitor initialized');
  }

  /**
   * Register a health check
   */
  registerHealthCheck(check: HealthCheck): void {
    this.healthChecks.set(check.name, check);
    
    // Run initial check
    this.runHealthCheck(check.name);
    
    // Schedule periodic checks
    if (check.interval) {
      const interval = setInterval(() => {
        this.runHealthCheck(check.name);
      }, check.interval);
      
      this.checkIntervals.set(check.name, interval);
    }
    
    this.logger.info(`Registered health check: ${check.name}`);
  }

  /**
   * Run a specific health check
   */
  private async runHealthCheck(name: string): Promise<void> {
    const check = this.healthChecks.get(name);
    if (!check) {
      return;
    }

    try {
      const result = await check.check();
      
      const status: HealthStatus = {
        component: name,
        status: result.healthy ? 'healthy' : check.critical ? 'unhealthy' : 'degraded',
        message: result.message,
        lastCheck: new Date(),
        metadata: result.metadata
      };
      
      const previousStatus = this.componentStatus.get(name);
      this.componentStatus.set(name, status);
      
      // Emit event if status changed
      if (!previousStatus || previousStatus.status !== status.status) {
        this.emit('statusChanged', {
          component: name,
          previousStatus: previousStatus?.status,
          currentStatus: status.status,
          message: result.message
        });
        
        if (status.status === 'unhealthy') {
          this.logger.error(`Component ${name} is unhealthy: ${result.message}`);
        } else if (status.status === 'degraded') {
          this.logger.warn(`Component ${name} is degraded: ${result.message}`);
        } else if (previousStatus && previousStatus.status !== 'healthy') {
          this.logger.info(`Component ${name} recovered`);
        }
      }
      
    } catch (error) {
      const status: HealthStatus = {
        component: name,
        status: check.critical ? 'unhealthy' : 'degraded',
        message: `Health check failed: ${(error as Error).message}`,
        lastCheck: new Date()
      };
      
      this.componentStatus.set(name, status);
      this.logger.error(`Health check ${name} failed:`, error);
      
      this.emit('checkFailed', {
        component: name,
        error: (error as Error).message
      });
    }
  }

  /**
   * Report a component as unhealthy
   */
  reportUnhealthy(component: string, message: string, metadata?: Record<string, any>): void {
    const status: HealthStatus = {
      component,
      status: 'unhealthy',
      message,
      lastCheck: new Date(),
      metadata
    };
    
    this.componentStatus.set(component, status);
    this.logger.error(`Component reported unhealthy: ${component} - ${message}`);
    
    this.emit('componentUnhealthy', {
      component,
      message,
      metadata
    });
  }

  /**
   * Report a component as healthy
   */
  reportHealthy(component: string, message?: string, metadata?: Record<string, any>): void {
    const status: HealthStatus = {
      component,
      status: 'healthy',
      message,
      lastCheck: new Date(),
      metadata
    };
    
    const previousStatus = this.componentStatus.get(component);
    this.componentStatus.set(component, status);
    
    if (previousStatus && previousStatus.status !== 'healthy') {
      this.logger.info(`Component recovered: ${component}`);
      this.emit('componentRecovered', {
        component,
        previousStatus: previousStatus.status
      });
    }
  }

  /**
   * Get overall system health
   */
  getSystemHealth(): SystemHealth {
    const components = Array.from(this.componentStatus.values());
    const issues: string[] = [];
    
    // Determine overall health
    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    for (const component of components) {
      if (component.status === 'unhealthy') {
        overall = 'unhealthy';
        issues.push(`${component.component}: ${component.message || 'Unhealthy'}`);
      } else if (component.status === 'degraded' && overall === 'healthy') {
        overall = 'degraded';
        issues.push(`${component.component}: ${component.message || 'Degraded'}`);
      }
    }
    
    return {
      overall,
      components,
      lastCheck: new Date(),
      uptime: Date.now() - this.startTime,
      issues
    };
  }

  /**
   * Get health status for a specific component
   */
  getComponentHealth(component: string): HealthStatus | undefined {
    return this.componentStatus.get(component);
  }

  /**
   * Check if system is healthy
   */
  isHealthy(): boolean {
    const health = this.getSystemHealth();
    return health.overall === 'healthy';
  }

  /**
   * Run all health checks immediately
   */
  async checkAll(): Promise<SystemHealth> {
    const promises = Array.from(this.healthChecks.keys()).map(name => 
      this.runHealthCheck(name)
    );
    
    await Promise.allSettled(promises);
    return this.getSystemHealth();
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    for (const interval of this.checkIntervals.values()) {
      clearInterval(interval);
    }
    this.checkIntervals.clear();
    this.logger.info('Health monitor stopped');
  }

  /**
   * Register default platform health checks
   */
  registerDefaultChecks(): void {
    // Memory usage check
    this.registerHealthCheck({
      name: 'memory',
      check: async () => {
        const usage = process.memoryUsage();
        const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;
        
        return {
          healthy: heapUsedPercent < 90,
          message: `Heap usage: ${heapUsedPercent.toFixed(1)}%`,
          metadata: {
            heapUsed: usage.heapUsed,
            heapTotal: usage.heapTotal,
            rss: usage.rss,
            external: usage.external
          }
        };
      },
      interval: 30000, // 30 seconds
      critical: true
    });

    // Event loop lag check
    this.registerHealthCheck({
      name: 'eventLoop',
      check: async () => {
        const start = process.hrtime.bigint();
        
        // Measure event loop lag
        return new Promise(resolve => {
          setImmediate(() => {
            const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
            
            resolve({
              healthy: lag < 100, // Less than 100ms lag
              message: `Event loop lag: ${lag.toFixed(2)}ms`,
              metadata: { lag }
            });
          });
        });
      },
      interval: 10000, // 10 seconds
      critical: false
    });

    // Uptime check
    this.registerHealthCheck({
      name: 'uptime',
      check: async () => {
        const uptime = process.uptime();
        
        return {
          healthy: true,
          message: `Uptime: ${this.formatUptime(uptime)}`,
          metadata: { uptime }
        };
      },
      interval: 60000 // 1 minute
    });
  }

  /**
   * Format uptime for display
   */
  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    
    return parts.join(' ') || '< 1m';
  }
}