/**
 * Health Check Service
 * 
 * Provides standardized health checks for the platform following
 * Kubernetes liveness and readiness probe patterns.
 */

const { getConfigManager } = require('../config/config-manager');
const { getSecretsManager } = require('../security/secrets-manager');

class HealthCheckService {
  constructor() {
    this.checks = new Map();
    this.criticalChecks = new Set();
    this._initializeDefaultChecks();
  }

  /**
   * Initialize default health checks
   */
  _initializeDefaultChecks() {
    // Config check
    this.registerCheck('config', async () => {
      const configManager = getConfigManager();
      const validation = configManager.validate();
      
      if (!validation.valid) {
        return {
          healthy: false,
          message: `Configuration errors: ${validation.errors.join(', ')}`
        };
      }
      
      return {
        healthy: true,
        message: 'Configuration valid',
        details: {
          warnings: validation.warnings,
          mode: configManager.get('mode'),
          region: configManager.get('region')
        }
      };
    }, { critical: true });

    // Secrets check
    this.registerCheck('secrets', async () => {
      try {
        const secretsManager = getSecretsManager();
        const hasSecrets = await secretsManager.hasRequiredSecrets();
        
        return {
          healthy: hasSecrets,
          message: hasSecrets ? 'Secrets available' : 'Missing required secrets',
          details: {
            backend: secretsManager.backend,
            encrypted: secretsManager.config.encryptionKey ? true : false
          }
        };
      } catch (error) {
        return {
          healthy: false,
          message: `Secrets check failed: ${error.message}`
        };
      }
    }, { critical: true });

    // Memory check
    this.registerCheck('memory', async () => {
      const usage = process.memoryUsage();
      const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;
      
      return {
        healthy: heapUsedPercent < 90,
        message: `Heap usage: ${heapUsedPercent.toFixed(1)}%`,
        details: {
          rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
          heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
          heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
          external: Math.round(usage.external / 1024 / 1024) + 'MB'
        }
      };
    });

    // Process check
    this.registerCheck('process', async () => {
      const uptime = process.uptime();
      
      return {
        healthy: true,
        message: `Process uptime: ${Math.floor(uptime)}s`,
        details: {
          pid: process.pid,
          version: process.version,
          platform: process.platform,
          uptime: uptime
        }
      };
    });
  }

  /**
   * Register a health check
   */
  registerCheck(name, checkFn, options = {}) {
    this.checks.set(name, {
      fn: checkFn,
      timeout: options.timeout || 5000,
      critical: options.critical || false
    });
    
    if (options.critical) {
      this.criticalChecks.add(name);
    }
  }

  /**
   * Remove a health check
   */
  unregisterCheck(name) {
    this.checks.delete(name);
    this.criticalChecks.delete(name);
  }

  /**
   * Execute a single check with timeout
   */
  async _executeCheck(name, check) {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Check timed out')), check.timeout)
    );
    
    try {
      const start = Date.now();
      const result = await Promise.race([check.fn(), timeoutPromise]);
      const duration = Date.now() - start;
      
      return {
        name,
        ...result,
        duration,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        name,
        healthy: false,
        message: error.message,
        error: error.stack,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Liveness probe - checks if application is alive
   * Only runs critical checks
   */
  async liveness() {
    const checks = [];
    
    for (const [name, check] of this.checks) {
      if (this.criticalChecks.has(name)) {
        checks.push(this._executeCheck(name, check));
      }
    }
    
    const results = await Promise.all(checks);
    const healthy = results.every(r => r.healthy);
    
    return {
      status: healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: results
    };
  }

  /**
   * Readiness probe - checks if application is ready to serve traffic
   * Runs all checks
   */
  async readiness() {
    const checks = [];
    
    for (const [name, check] of this.checks) {
      checks.push(this._executeCheck(name, check));
    }
    
    const results = await Promise.all(checks);
    const healthy = results.every(r => r.healthy);
    const criticalHealthy = results
      .filter(r => this.criticalChecks.has(r.name))
      .every(r => r.healthy);
    
    return {
      status: healthy ? 'healthy' : (criticalHealthy ? 'degraded' : 'unhealthy'),
      timestamp: new Date().toISOString(),
      checks: results,
      summary: {
        total: results.length,
        healthy: results.filter(r => r.healthy).length,
        unhealthy: results.filter(r => !r.healthy).length,
        critical: {
          total: this.criticalChecks.size,
          healthy: results.filter(r => this.criticalChecks.has(r.name) && r.healthy).length
        }
      }
    };
  }

  /**
   * Get health summary (simplified readiness)
   */
  async health() {
    const readiness = await this.readiness();
    
    return {
      healthy: readiness.status === 'healthy',
      status: readiness.status,
      timestamp: readiness.timestamp,
      version: require('../../package.json').version || '1.0.0',
      checks: readiness.checks.reduce((acc, check) => {
        acc[check.name] = {
          healthy: check.healthy,
          message: check.message,
          duration: check.duration
        };
        return acc;
      }, {})
    };
  }

  /**
   * Platform-specific health check
   */
  registerPlatformCheck(platform) {
    this.registerCheck('platform', async () => {
      try {
        // Check if platform is initialized
        if (!platform || !platform.initialized) {
          return {
            healthy: false,
            message: 'Platform not initialized'
          };
        }
        
        // Check data simulator (if in simulation mode)
        if (platform.dataSimulator) {
          const isRunning = platform.dataSimulator.isRunning;
          return {
            healthy: isRunning,
            message: isRunning ? 'Data simulator running' : 'Data simulator stopped',
            details: {
              mode: platform.mode,
              entityCount: platform.dataSimulator.entities?.size || 0
            }
          };
        }
        
        // Check infrastructure transformer (if in infrastructure mode)
        if (platform.infrastructureTransformer) {
          return {
            healthy: true,
            message: 'Infrastructure transformer available',
            details: {
              mode: platform.mode,
              hasKafkaConfig: !!platform.config.kafkaBootstrapServers
            }
          };
        }
        
        return {
          healthy: true,
          message: 'Platform ready',
          details: { mode: platform.mode }
        };
      } catch (error) {
        return {
          healthy: false,
          message: `Platform check failed: ${error.message}`
        };
      }
    }, { critical: true });
  }

  /**
   * Streaming service health check
   */
  registerStreamingCheck(streamer) {
    this.registerCheck('streaming', async () => {
      try {
        if (!streamer) {
          return {
            healthy: false,
            message: 'Streaming service not initialized'
          };
        }
        
        const stats = streamer.getStats ? streamer.getStats() : {};
        const isHealthy = !streamer.circuitBreaker || 
                         streamer.circuitBreaker.state !== 'OPEN';
        
        return {
          healthy: isHealthy,
          message: isHealthy ? 'Streaming service operational' : 'Circuit breaker open',
          details: {
            totalSent: stats.totalSent || 0,
            totalFailed: stats.totalFailed || 0,
            queueSize: streamer.queue?.length || 0,
            circuitBreakerState: streamer.circuitBreaker?.state || 'N/A'
          }
        };
      } catch (error) {
        return {
          healthy: false,
          message: `Streaming check failed: ${error.message}`
        };
      }
    });
  }
}

// Singleton instance
let healthCheckService = null;

/**
 * Get singleton health check service
 */
function getHealthCheckService() {
  if (!healthCheckService) {
    healthCheckService = new HealthCheckService();
  }
  return healthCheckService;
}

module.exports = {
  HealthCheckService,
  getHealthCheckService
};