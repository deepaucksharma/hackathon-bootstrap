/**
 * Circuit Breaker Monitor
 * Monitors and reports circuit breaker health metrics
 */

import { injectable, inject } from 'inversify';
import { TYPES } from '@infrastructure/config/types';
import { CircuitBreakerFactory } from './circuit-breaker-factory';
import { MetricStreamer } from '@/streaming/metric-streamer';
import { Logger } from '@shared/utils/logger';
import { CircuitState } from './circuit-breaker';
import { EventEmitter } from 'events';

@injectable()
export class CircuitBreakerMonitor extends EventEmitter {
  private monitoringInterval?: NodeJS.Timeout;
  private isMonitoring = false;

  constructor(
    @inject(TYPES.CircuitBreakerFactory) private factory: CircuitBreakerFactory,
    @inject(TYPES.MetricStreamer) private metricStreamer: MetricStreamer,
    @inject(TYPES.Logger) private logger: Logger
  ) {
    super();
  }

  /**
   * Report circuit breaker metrics to New Relic
   */
  async reportMetrics(): Promise<void> {
    const metrics: any[] = [];
    const timestamp = Date.now();

    try {
      this.factory.getAll().forEach((breaker, name) => {
        const stats = breaker.getStats();
        
        // Main circuit breaker metric
        metrics.push({
          eventType: 'CircuitBreakerMetric',
          timestamp,
          breakerName: name,
          state: stats.state,
          stateNumeric: this.stateToNumeric(stats.state),
          totalCalls: stats.totalCalls,
          totalFailures: stats.failures,
          totalSuccesses: stats.successes,
          totalTimeouts: 0, // Not tracked in current implementation
          averageResponseTime: 0, // Not tracked in current implementation
          failureRate: stats.totalCalls > 0 ? (stats.failures / stats.totalCalls) * 100 : 0,
          successRate: stats.totalCalls > 0 ? (stats.successes / stats.totalCalls) * 100 : 0,
          lastError: null, // Not tracked in current implementation
          lastStateChange: stats.lastFailureTime || stats.lastSuccessTime ? new Date(stats.lastFailureTime || stats.lastSuccessTime || 0).toISOString() : undefined,
          platform: 'message-queues-v2'
        });

        // Separate event for state changes
        const lastChangeTime = stats.lastFailureTime || stats.lastSuccessTime;
        if (lastChangeTime) {
          const timeSinceChange = timestamp - lastChangeTime;
          metrics.push({
            eventType: 'CircuitBreakerStateChange',
            timestamp,
            breakerName: name,
            currentState: stats.state,
            timeSinceChangeMs: timeSinceChange,
            platform: 'message-queues-v2'
          });
        }
      });

      // Overall health metric
      const health = this.factory.getHealthStatus();
      metrics.push({
        eventType: 'CircuitBreakerHealth',
        timestamp,
        healthyCount: health.healthy,
        degradedCount: health.degraded,
        unhealthyCount: health.unhealthy,
        totalBreakers: health.healthy + health.degraded + health.unhealthy,
        platform: 'message-queues-v2'
      });

      if (metrics.length > 0) {
        await this.metricStreamer.streamMetrics(metrics);
        this.logger.debug(`Reported ${metrics.length} circuit breaker metrics`);
      }
    } catch (error) {
      this.logger.error('Failed to report circuit breaker metrics:', error);
      // Don't throw - monitoring should not break the application
    }
  }

  /**
   * Start monitoring circuit breakers
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.isMonitoring) {
      this.logger.warn('Circuit breaker monitoring is already running');
      return;
    }

    this.logger.info(`Starting circuit breaker monitoring (interval: ${intervalMs}ms)`);
    this.isMonitoring = true;

    // Report immediately
    this.reportMetrics().catch(err => 
      this.logger.error('Initial circuit breaker metrics report failed:', err)
    );

    // Then report on interval
    this.monitoringInterval = setInterval(() => {
      this.reportMetrics().catch(err => 
        this.logger.error('Circuit breaker metrics report failed:', err)
      );
    }, intervalMs);
  }

  /**
   * Stop monitoring circuit breakers (alias for stopMonitoring)
   */
  stop(): void {
    this.stopMonitoring();
  }

  /**
   * Stop monitoring circuit breakers
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.logger.info('Stopping circuit breaker monitoring');
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    this.isMonitoring = false;
  }

  /**
   * Get monitoring status
   */
  isRunning(): boolean {
    return this.isMonitoring;
  }

  /**
   * Convert state to numeric value for easier graphing
   */
  private stateToNumeric(state: CircuitState): number {
    switch (state) {
      case 'CLOSED':
        return 0;
      case 'HALF_OPEN':
        return 1;
      case 'OPEN':
        return 2;
      default:
        return -1;
    }
  }

  /**
   * Generate alert conditions based on circuit breaker states
   */
  getAlertConditions(): any[] {
    const conditions: any[] = [];

    // Alert if any circuit breaker is open for more than 5 minutes
    conditions.push({
      name: 'Circuit Breaker Open',
      nrql: `SELECT count(*) FROM CircuitBreakerMetric WHERE state = 'OPEN' AND platform = 'message-queues-v2' FACET breakerName`,
      threshold: 0,
      duration: 300 // 5 minutes
    });

    // Alert if failure rate is above 50%
    conditions.push({
      name: 'High Failure Rate',
      nrql: `SELECT average(failureRate) FROM CircuitBreakerMetric WHERE platform = 'message-queues-v2' FACET breakerName`,
      threshold: 50,
      duration: 180 // 3 minutes
    });

    // Alert if average response time is above threshold
    conditions.push({
      name: 'High Response Time',
      nrql: `SELECT average(averageResponseTime) FROM CircuitBreakerMetric WHERE platform = 'message-queues-v2' FACET breakerName`,
      threshold: 10000, // 10 seconds
      duration: 300 // 5 minutes
    });

    return conditions;
  }

  /**
   * Generate dashboard JSON for circuit breaker monitoring
   */
  getDashboardConfig(): any {
    return {
      name: 'Message Queues V2 - Circuit Breaker Health',
      description: 'Monitor the health and performance of circuit breakers in the Message Queues platform',
      pages: [{
        name: 'Overview',
        widgets: [
          {
            title: 'Circuit Breaker States',
            type: 'billboard',
            query: `FROM CircuitBreakerMetric SELECT latest(state) WHERE platform = 'message-queues-v2' FACET breakerName SINCE 5 minutes ago`
          },
          {
            title: 'State Timeline',
            type: 'line',
            query: `FROM CircuitBreakerMetric SELECT latest(stateNumeric) WHERE platform = 'message-queues-v2' FACET breakerName TIMESERIES 1 minute SINCE 1 hour ago`
          },
          {
            title: 'Failure Rates',
            type: 'line',
            query: `FROM CircuitBreakerMetric SELECT average(failureRate) WHERE platform = 'message-queues-v2' FACET breakerName TIMESERIES 1 minute SINCE 1 hour ago`
          },
          {
            title: 'Success Rates',
            type: 'line',
            query: `FROM CircuitBreakerMetric SELECT average(successRate) WHERE platform = 'message-queues-v2' FACET breakerName TIMESERIES 1 minute SINCE 1 hour ago`
          },
          {
            title: 'Average Response Times',
            type: 'line',
            query: `FROM CircuitBreakerMetric SELECT average(averageResponseTime) WHERE platform = 'message-queues-v2' FACET breakerName TIMESERIES 1 minute SINCE 1 hour ago`
          },
          {
            title: 'Total Calls',
            type: 'line',
            query: `FROM CircuitBreakerMetric SELECT sum(totalCalls) WHERE platform = 'message-queues-v2' FACET breakerName TIMESERIES 1 minute SINCE 1 hour ago`
          },
          {
            title: 'Timeouts',
            type: 'line',
            query: `FROM CircuitBreakerMetric SELECT sum(totalTimeouts) WHERE platform = 'message-queues-v2' FACET breakerName TIMESERIES 1 minute SINCE 1 hour ago`
          },
          {
            title: 'Overall Health',
            type: 'pie',
            query: `FROM CircuitBreakerHealth SELECT latest(healthyCount) as 'Healthy', latest(degradedCount) as 'Degraded', latest(unhealthyCount) as 'Unhealthy' WHERE platform = 'message-queues-v2' SINCE 5 minutes ago`
          },
          {
            title: 'Recent Errors',
            type: 'table',
            query: `FROM CircuitBreakerMetric SELECT latest(lastError) as 'Last Error', latest(timestamp) as 'Time' WHERE platform = 'message-queues-v2' AND lastError IS NOT NULL FACET breakerName SINCE 30 minutes ago LIMIT 20`
          }
        ]
      }]
    };
  }
}