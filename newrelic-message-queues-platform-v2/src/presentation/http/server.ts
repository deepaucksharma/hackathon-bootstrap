/**
 * HTTP API Server
 * Fastify-based REST API for the Message Queues Platform
 */

import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { Container } from 'inversify';

import type { ConfigurationService } from '@infrastructure/config/configuration-service.js';
import type { Logger } from '@shared/utils/logger.js';
import { ErrorFactory } from '@shared/errors/base.js';

// Route handlers
import { brokerRoutes } from './routes/broker-routes.js';
import { topicRoutes } from './routes/topic-routes.js';
import { consumerRoutes } from './routes/consumer-routes.js';
import { clusterRoutes } from './routes/cluster-routes.js';
import { healthRoutes } from './routes/health-routes.js';
import { metricsRoutes } from './routes/metrics-routes.js';

export interface ServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly enableCors?: boolean;
  readonly enableHelmet?: boolean;
  readonly enableRateLimit?: boolean;
  readonly apiKeyRequired?: boolean;
}

export class HttpServer {
  private server: FastifyInstance;
  private isStarted = false;
  private readonly container: Container;
  private readonly config: ConfigurationService;
  private readonly logger: Logger;

  constructor(container: Container, options: ServerOptions = {}) {
    this.container = container;
    this.config = container.get<ConfigurationService>('ConfigurationService');
    this.logger = container.get<Logger>('Logger');

    // Create Fastify instance
    this.server = Fastify({
      logger: false, // We use our own logger
      trustProxy: true,
      disableRequestLogging: true
    });

    // Setup middleware and routes
    this.setupMiddleware(options);
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Start the HTTP server
   */
  public async start(options: ServerOptions = {}): Promise<void> {
    if (this.isStarted) {
      throw ErrorFactory.validation('Server is already started');
    }

    const httpConfig = this.config.getHttpConfig();
    const host = options.host || httpConfig.host;
    const port = options.port || httpConfig.port;

    try {
      await this.server.listen({ host, port });
      this.isStarted = true;
      
      this.logger.info('HTTP API server started', {
        host,
        port,
        environment: this.config.getEnvironment(),
        apiVersion: 'v2'
      });
    } catch (error) {
      throw ErrorFactory.infrastructure(
        'Failed to start HTTP server',
        { 
          host, 
          port, 
          originalError: error instanceof Error ? error.message : String(error) 
        }
      );
    }
  }

  /**
   * Stop the HTTP server
   */
  public async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      await this.server.close();
      this.isStarted = false;
      
      this.logger.info('HTTP API server stopped');
    } catch (error) {
      throw ErrorFactory.infrastructure(
        'Failed to stop HTTP server',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Check if server is running
   */
  public get running(): boolean {
    return this.isStarted;
  }

  /**
   * Get server address info
   */
  public getAddress(): { host: string; port: number } | null {
    if (!this.isStarted) {
      return null;
    }

    const address = this.server.server.address();
    if (!address || typeof address === 'string') {
      return null;
    }

    return {
      host: address.address,
      port: address.port
    };
  }

  private setupMiddleware(options: ServerOptions): void {
    // CORS
    if (options.enableCors !== false) {
      this.server.register(cors, {
        origin: this.getAllowedOrigins(),
        credentials: true
      });
    }

    // Security headers
    if (options.enableHelmet !== false) {
      this.server.register(helmet, {
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"]
          }
        }
      });
    }

    // Rate limiting
    if (options.enableRateLimit !== false) {
      this.server.register(rateLimit, {
        max: 100, // 100 requests
        timeWindow: 60 * 1000, // per minute
        errorResponseBuilder: () => ({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          statusCode: 429
        })
      });
    }

    // Request logging
    this.server.addHook('onRequest', async (request: FastifyRequest) => {
      this.logger.debug('HTTP request received', {
        method: request.method,
        url: request.url,
        userAgent: request.headers['user-agent'],
        ip: request.ip
      });
    });

    // API key validation (if enabled)
    if (options.apiKeyRequired || this.config.getHttpConfig().apiKeyRequired) {
      this.server.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
        // Skip API key check for health endpoints
        if (request.url.startsWith('/health')) {
          return;
        }

        const apiKey = request.headers['x-api-key'] as string;
        if (!apiKey || !this.isValidApiKey(apiKey)) {
          await reply.code(401).send({
            error: 'Unauthorized',
            message: 'Valid API key required',
            statusCode: 401
          });
        }
      });
    }

    // Response time tracking
    this.server.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
      const responseTime = reply.elapsedTime;
      
      this.logger.info('HTTP request completed', {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: `${responseTime}ms`
      });
    });
  }

  private setupRoutes(): void {
    // API versioning
    this.server.register(async (fastify) => {
      // API info endpoint
      fastify.get('/', async () => ({
        name: 'New Relic Message Queues Platform API',
        version: '2.0.0',
        description: 'Clean architecture implementation with comprehensive monitoring',
        endpoints: {
          health: '/health',
          metrics: '/metrics',
          brokers: '/api/v2/brokers',
          topics: '/api/v2/topics',
          consumers: '/api/v2/consumers',
          clusters: '/api/v2/clusters'
        },
        documentation: 'https://docs.newrelic.com/message-queues-platform'
      }));

      // Register route modules
      await fastify.register(healthRoutes, { prefix: '/health' });
      await fastify.register(metricsRoutes, { prefix: '/metrics' });
      
      // API v2 routes
      await fastify.register(async (api) => {
        await api.register(brokerRoutes, { prefix: '/brokers' });
        await api.register(topicRoutes, { prefix: '/topics' });
        await api.register(consumerRoutes, { prefix: '/consumers' });
        await api.register(clusterRoutes, { prefix: '/clusters' });
      }, { prefix: '/api/v2' });
    });

    // 404 handler
    this.server.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
      await reply.code(404).send({
        error: 'Not Found',
        message: `Route ${request.method} ${request.url} not found`,
        statusCode: 404
      });
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.server.setErrorHandler(async (error: Error, request: FastifyRequest, reply: FastifyReply) => {
      this.logger.error('HTTP request error', {
        error: error.message,
        stack: error.stack,
        method: request.method,
        url: request.url
      });

      // Handle validation errors
      if (error.name === 'ValidationError') {
        await reply.code(400).send({
          error: 'Bad Request',
          message: error.message,
          statusCode: 400
        });
        return;
      }

      // Handle infrastructure errors
      if (error.name === 'InfrastructureError') {
        await reply.code(500).send({
          error: 'Internal Server Error',
          message: 'An internal error occurred',
          statusCode: 500
        });
        return;
      }

      // Handle not found errors
      if (error.name === 'NotFoundError') {
        await reply.code(404).send({
          error: 'Not Found',
          message: error.message,
          statusCode: 404
        });
        return;
      }

      // Default error response
      await reply.code(500).send({
        error: 'Internal Server Error',
        message: this.config.isDevelopment() ? error.message : 'An internal error occurred',
        statusCode: 500
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.fatal('Uncaught exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.fatal('Unhandled rejection', { 
        reason: reason instanceof Error ? reason.message : String(reason),
        promise 
      });
      process.exit(1);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      this.logger.info(`Received ${signal}, shutting down gracefully`);
      
      try {
        await this.stop();
        this.logger.info('Server shut down successfully');
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during shutdown', { 
          error: error instanceof Error ? error.message : String(error) 
        });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }

  private getAllowedOrigins(): string[] {
    const httpConfig = this.config.getHttpConfig();
    return httpConfig.allowedOrigins.length > 0 
      ? httpConfig.allowedOrigins 
      : ['http://localhost:3000', 'http://localhost:3001'];
  }

  private isValidApiKey(apiKey: string): boolean {
    // In a real implementation, this would check against a database or service
    // For now, we'll accept any API key that starts with 'mq-api-'
    return apiKey.startsWith('mq-api-') && apiKey.length > 10;
  }
}