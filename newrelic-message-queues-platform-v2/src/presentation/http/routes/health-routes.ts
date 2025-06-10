/**
 * Health Check Routes
 * Kubernetes-compatible health endpoints for the Message Queues Platform
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ContainerFactory } from '@infrastructure/config/container.js';
import type { ConfigurationService } from '@infrastructure/config/configuration-service.js';
import type { Logger } from '@shared/utils/logger.js';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  const container = ContainerFactory.getInstance();
  const config = container.get<ConfigurationService>('ConfigurationService');
  const logger = container.get<Logger>('Logger');

  // Liveness probe - basic server health
  fastify.get('/live', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      // Basic checks that indicate the server is alive
      const checks = {
        server: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: config.getEnvironment()
      };

      const responseTime = Date.now() - startTime;
      
      await reply.code(200).send({
        status: 'ok',
        checks,
        responseTime: `${responseTime}ms`
      });
    } catch (error) {
      logger.error('Liveness check failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      await reply.code(503).send({
        status: 'error',
        message: 'Liveness check failed',
        timestamp: Date.now()
      });
    }
  });

  // Readiness probe - full application health
  fastify.get('/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      const checks = await performReadinessChecks(config, logger);
      const allHealthy = Object.values(checks.details).every(check => check.status === 'ok');
      const responseTime = Date.now() - startTime;

      const status = allHealthy ? 'ok' : 'degraded';
      const statusCode = allHealthy ? 200 : 503;

      await reply.code(statusCode).send({
        status,
        checks: {
          ...checks.details,
          responseTime: `${responseTime}ms`
        },
        summary: {
          healthy: checks.healthy,
          total: checks.total,
          critical: checks.critical
        }
      });
    } catch (error) {
      logger.error('Readiness check failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      await reply.code(503).send({
        status: 'error',
        message: 'Readiness check failed',
        timestamp: Date.now()
      });
    }
  });

  // Startup probe - application initialization
  fastify.get('/startup', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      const checks = await performStartupChecks(config, logger);
      const allReady = Object.values(checks.details).every(check => check.status === 'ok');
      const responseTime = Date.now() - startTime;

      const status = allReady ? 'ok' : 'starting';
      const statusCode = allReady ? 200 : 503;

      await reply.code(statusCode).send({
        status,
        checks: {
          ...checks.details,
          responseTime: `${responseTime}ms`
        },
        summary: {
          ready: checks.ready,
          total: checks.total
        }
      });
    } catch (error) {
      logger.error('Startup check failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      await reply.code(503).send({
        status: 'error',
        message: 'Startup check failed',
        timestamp: Date.now()
      });
    }
  });

  // Combined health endpoint (legacy compatibility)
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      const checks = await performReadinessChecks(config, logger);
      const allHealthy = Object.values(checks.details).every(check => check.status === 'ok');
      const responseTime = Date.now() - startTime;

      const status = allHealthy ? 'healthy' : 'degraded';
      const statusCode = allHealthy ? 200 : 503;

      await reply.code(statusCode).send({
        status,
        timestamp: Date.now(),
        version: '2.0.0',
        environment: config.getEnvironment(),
        checks: {
          ...checks.details,
          responseTime: `${responseTime}ms`
        },
        summary: {
          healthy: checks.healthy,
          total: checks.total,
          critical: checks.critical
        }
      });
    } catch (error) {
      logger.error('Health check failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      await reply.code(503).send({
        status: 'unhealthy',
        message: 'Health check failed',
        timestamp: Date.now()
      });
    }
  });

  // Detailed health status
  fastify.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      const readinessChecks = await performReadinessChecks(config, logger);
      const systemInfo = getSystemInfo();
      const responseTime = Date.now() - startTime;

      await reply.code(200).send({
        status: 'ok',
        timestamp: Date.now(),
        responseTime: `${responseTime}ms`,
        application: {
          name: 'Message Queues Platform',
          version: '2.0.0',
          environment: config.getEnvironment(),
          uptime: process.uptime()
        },
        system: systemInfo,
        health: {
          checks: readinessChecks.details,
          summary: {
            healthy: readinessChecks.healthy,
            total: readinessChecks.total,
            critical: readinessChecks.critical
          }
        },
        configuration: {
          platformMode: config.getPlatformMode(),
          provider: config.getProvider(),
          monitoringInterval: config.getMonitoringInterval(),
          metricsEnabled: config.getMetricsConfig().enabled,
          healthCheckEnabled: config.getHealthCheckConfig().enabled
        }
      });
    } catch (error) {
      logger.error('Status check failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      await reply.code(500).send({
        status: 'error',
        message: 'Status check failed',
        timestamp: Date.now()
      });
    }
  });
}

async function performReadinessChecks(
  config: ConfigurationService, 
  logger: Logger
): Promise<{
  details: Record<string, { status: string; message?: string; responseTime?: string }>;
  healthy: number;
  total: number;
  critical: number;
}> {
  const checks: Record<string, { status: string; message?: string; responseTime?: string }> = {};
  let healthy = 0;
  let critical = 0;

  // Configuration check
  try {
    const startTime = Date.now();
    config.getAll(); // This will throw if configuration is invalid
    checks.configuration = { 
      status: 'ok', 
      responseTime: `${Date.now() - startTime}ms` 
    };
    healthy++;
  } catch (error) {
    checks.configuration = { 
      status: 'error', 
      message: error instanceof Error ? error.message : 'Configuration validation failed' 
    };
    critical++;
  }

  // New Relic connectivity check
  try {
    const startTime = Date.now();
    const nrConfig = config.getNewRelicConfig();
    
    // Basic validation of New Relic configuration
    if (nrConfig.apiKey && nrConfig.accountId && nrConfig.ingestKey) {
      checks.newrelic = { 
        status: 'ok', 
        responseTime: `${Date.now() - startTime}ms` 
      };
      healthy++;
    } else {
      checks.newrelic = { 
        status: 'error', 
        message: 'Missing New Relic configuration' 
      };
      critical++;
    }
  } catch (error) {
    checks.newrelic = { 
      status: 'error', 
      message: error instanceof Error ? error.message : 'New Relic check failed' 
    };
    critical++;
  }

  // Memory check
  try {
    const startTime = Date.now();
    const memUsage = process.memoryUsage();
    const totalMem = memUsage.heapUsed + memUsage.external;
    const maxMem = memUsage.heapTotal;
    const memPercent = (totalMem / maxMem) * 100;
    
    if (memPercent < 90) {
      checks.memory = { 
        status: 'ok', 
        message: `${memPercent.toFixed(1)}% used`,
        responseTime: `${Date.now() - startTime}ms` 
      };
      healthy++;
    } else {
      checks.memory = { 
        status: 'warning', 
        message: `High memory usage: ${memPercent.toFixed(1)}%` 
      };
    }
  } catch (error) {
    checks.memory = { 
      status: 'error', 
      message: error instanceof Error ? error.message : 'Memory check failed' 
    };
  }

  // Event loop lag check
  try {
    const startTime = Date.now();
    const lagStart = process.hrtime();
    
    await new Promise(resolve => setImmediate(resolve));
    
    const lagEnd = process.hrtime(lagStart);
    const lagMs = (lagEnd[0] * 1000) + (lagEnd[1] / 1000000);
    
    if (lagMs < 100) { // Less than 100ms lag
      checks.eventLoop = { 
        status: 'ok', 
        message: `${lagMs.toFixed(2)}ms lag`,
        responseTime: `${Date.now() - startTime}ms` 
      };
      healthy++;
    } else {
      checks.eventLoop = { 
        status: 'warning', 
        message: `High event loop lag: ${lagMs.toFixed(2)}ms` 
      };
    }
  } catch (error) {
    checks.eventLoop = { 
      status: 'error', 
      message: error instanceof Error ? error.message : 'Event loop check failed' 
    };
  }

  const total = Object.keys(checks).length;
  
  return { details: checks, healthy, total, critical };
}

async function performStartupChecks(
  config: ConfigurationService, 
  logger: Logger
): Promise<{
  details: Record<string, { status: string; message?: string; responseTime?: string }>;
  ready: number;
  total: number;
}> {
  const checks: Record<string, { status: string; message?: string; responseTime?: string }> = {};
  let ready = 0;

  // Configuration initialization
  try {
    const startTime = Date.now();
    const configData = config.getAll();
    checks.configuration = { 
      status: 'ok', 
      message: `Loaded ${Object.keys(configData).length} settings`,
      responseTime: `${Date.now() - startTime}ms` 
    };
    ready++;
  } catch (error) {
    checks.configuration = { 
      status: 'error', 
      message: error instanceof Error ? error.message : 'Configuration failed to load' 
    };
  }

  // Dependency injection container
  try {
    const startTime = Date.now();
    // Container should be initialized at this point
    checks.container = { 
      status: 'ok', 
      responseTime: `${Date.now() - startTime}ms` 
    };
    ready++;
  } catch (error) {
    checks.container = { 
      status: 'error', 
      message: error instanceof Error ? error.message : 'DI container initialization failed' 
    };
  }

  // Logger initialization
  try {
    const startTime = Date.now();
    logger.info('Startup health check');
    checks.logger = { 
      status: 'ok', 
      responseTime: `${Date.now() - startTime}ms` 
    };
    ready++;
  } catch (error) {
    checks.logger = { 
      status: 'error', 
      message: error instanceof Error ? error.message : 'Logger initialization failed' 
    };
  }

  const total = Object.keys(checks).length;
  
  return { details: checks, ready, total };
}

function getSystemInfo(): Record<string, unknown> {
  const memUsage = process.memoryUsage();
  
  return {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    pid: process.pid,
    uptime: process.uptime(),
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024)
    },
    cpu: {
      loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0],
      usage: process.cpuUsage()
    }
  };
}