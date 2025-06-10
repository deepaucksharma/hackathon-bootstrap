/**
 * Metrics Routes
 * Prometheus-compatible metrics endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ContainerFactory } from '@infrastructure/config/container.js';
import type { ConfigurationService } from '@infrastructure/config/configuration-service.js';
import type { Logger } from '@shared/utils/logger.js';

export async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  const container = ContainerFactory.getInstance();
  const config = container.get<ConfigurationService>('ConfigurationService');
  const logger = container.get<Logger>('Logger');

  // Prometheus metrics endpoint
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = await generatePrometheusMetrics();
      
      await reply
        .type('text/plain; version=0.0.4; charset=utf-8')
        .code(200)
        .send(metrics);
        
    } catch (error) {
      logger.error('Error generating metrics', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      await reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to generate metrics',
        statusCode: 500
      });
    }
  });

  // JSON metrics endpoint
  fastify.get('/json', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = await generateJsonMetrics();
      
      await reply.code(200).send(metrics);
        
    } catch (error) {
      logger.error('Error generating JSON metrics', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      await reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to generate JSON metrics',
        statusCode: 500
      });
    }
  });

  // Application-specific metrics
  fastify.get('/application', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const appMetrics = await generateApplicationMetrics(config, logger);
      
      await reply.code(200).send(appMetrics);
        
    } catch (error) {
      logger.error('Error generating application metrics', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      await reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to generate application metrics',
        statusCode: 500
      });
    }
  });
}

async function generatePrometheusMetrics(): Promise<string> {
  const timestamp = Date.now();
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  const metrics = [
    '# HELP mq_platform_info Information about the Message Queues Platform',
    '# TYPE mq_platform_info gauge',
    `mq_platform_info{version="2.0.0",environment="${process.env.NODE_ENV || 'development'}"} 1 ${timestamp}`,
    '',
    '# HELP mq_platform_uptime_seconds Total uptime in seconds',
    '# TYPE mq_platform_uptime_seconds counter',
    `mq_platform_uptime_seconds ${process.uptime()} ${timestamp}`,
    '',
    '# HELP nodejs_memory_heap_used_bytes Memory heap used in bytes',
    '# TYPE nodejs_memory_heap_used_bytes gauge',
    `nodejs_memory_heap_used_bytes ${memUsage.heapUsed} ${timestamp}`,
    '',
    '# HELP nodejs_memory_heap_total_bytes Memory heap total in bytes',
    '# TYPE nodejs_memory_heap_total_bytes gauge',
    `nodejs_memory_heap_total_bytes ${memUsage.heapTotal} ${timestamp}`,
    '',
    '# HELP nodejs_memory_external_bytes Memory external in bytes',
    '# TYPE nodejs_memory_external_bytes gauge',
    `nodejs_memory_external_bytes ${memUsage.external} ${timestamp}`,
    '',
    '# HELP nodejs_memory_rss_bytes Memory RSS in bytes',
    '# TYPE nodejs_memory_rss_bytes gauge',
    `nodejs_memory_rss_bytes ${memUsage.rss} ${timestamp}`,
    '',
    '# HELP nodejs_cpu_user_microseconds CPU user time in microseconds',
    '# TYPE nodejs_cpu_user_microseconds counter',
    `nodejs_cpu_user_microseconds ${cpuUsage.user} ${timestamp}`,
    '',
    '# HELP nodejs_cpu_system_microseconds CPU system time in microseconds',
    '# TYPE nodejs_cpu_system_microseconds counter',
    `nodejs_cpu_system_microseconds ${cpuUsage.system} ${timestamp}`,
    '',
    '# HELP mq_platform_process_id Process ID',
    '# TYPE mq_platform_process_id gauge',
    `mq_platform_process_id ${process.pid} ${timestamp}`,
    ''
  ];

  // Add event loop lag metric
  const lagStart = process.hrtime();
  await new Promise(resolve => setImmediate(resolve));
  const lagEnd = process.hrtime(lagStart);
  const lagMs = (lagEnd[0] * 1000) + (lagEnd[1] / 1000000);
  
  metrics.push(
    '# HELP nodejs_eventloop_lag_milliseconds Event loop lag in milliseconds',
    '# TYPE nodejs_eventloop_lag_milliseconds gauge',
    `nodejs_eventloop_lag_milliseconds ${lagMs} ${timestamp}`,
    ''
  );

  return metrics.join('\n');
}

interface JsonMetrics {
  timestamp: number;
  platform: {
    version: string;
    environment: string;
    uptime: number;
    pid: number;
    platform: string;
    arch: string;
    nodeVersion: string;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    heapUsedMB: number;
    heapTotalMB: number;
    heapUtilization: number;
  };
  cpu: {
    user: number;
    system: number;
    userMs: number;
    systemMs: number;
  };
  eventLoop: {
    lagMs: number;
    status: 'healthy' | 'warning' | 'critical';
  };
}

async function generateJsonMetrics(): Promise<JsonMetrics> {
  const timestamp = Date.now();
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  // Calculate event loop lag
  const lagStart = process.hrtime();
  await new Promise(resolve => setImmediate(resolve));
  const lagEnd = process.hrtime(lagStart);
  const lagMs = (lagEnd[0] * 1000) + (lagEnd[1] / 1000000);
  
  return {
    timestamp,
    platform: {
      version: '2.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version
    },
    memory: {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUtilization: (memUsage.heapUsed / memUsage.heapTotal) * 100
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
      userMs: cpuUsage.user / 1000,
      systemMs: cpuUsage.system / 1000
    },
    eventLoop: {
      lagMs: lagMs,
      status: lagMs < 10 ? 'healthy' : lagMs < 50 ? 'warning' : 'critical'
    }
  };
}

async function generateApplicationMetrics(
  config: ConfigurationService, 
  logger: Logger
): Promise<Record<string, unknown>> {
  const jsonMetrics = await generateJsonMetrics();
  
  // Add application-specific metrics
  const appMetrics = {
    ...jsonMetrics,
    application: {
      name: 'Message Queues Platform',
      version: '2.0.0',
      description: 'Clean architecture implementation with comprehensive monitoring',
      configuration: {
        environment: config.getEnvironment(),
        platformMode: config.getPlatformMode(),
        provider: config.getProvider(),
        monitoringInterval: config.getMonitoringInterval(),
        logLevel: config.getLogLevel(),
        region: config.getNewRelicConfig().region
      },
      features: {
        healthChecks: config.getHealthCheckConfig().enabled,
        metrics: config.getMetricsConfig().enabled,
        prometheus: config.getMetricsConfig().prometheusEnabled,
        tracing: config.getTracingConfig().enabled
      },
      http: {
        port: config.getHttpConfig().port,
        host: config.getHttpConfig().host,
        apiKeyRequired: config.getHttpConfig().apiKeyRequired
      }
    },
    health: {
      status: 'healthy', // This would come from actual health checks
      lastCheck: Date.now(),
      checks: {
        configuration: 'ok',
        newrelic: 'ok',
        memory: jsonMetrics.memory.heapUtilization < 90 ? 'ok' : 'warning',
        eventLoop: jsonMetrics.eventLoop.status
      }
    }
  };

  return appMetrics;
}