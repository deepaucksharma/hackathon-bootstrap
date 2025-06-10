/**
 * Message Queues Platform V2 - Main Entry Point
 * Clean architecture implementation with dependency injection
 */

import 'reflect-metadata';
import { ContainerFactory, TYPES } from '@infrastructure/config/container.js';
import { HttpServer } from '@presentation/http/server.js';
import type { ConfigurationService } from '@infrastructure/config/configuration-service.js';
import type { Logger } from '@shared/utils/logger.js';
import { ErrorFactory } from '@shared/errors/base.js';
import { PlatformOrchestrator } from '@application/services/platform-orchestrator.js';

export class MessageQueuesPlatform {
  private readonly container = ContainerFactory.getInstance();
  private readonly config: ConfigurationService;
  private readonly logger: Logger;
  private httpServer?: HttpServer;
  private orchestrator?: PlatformOrchestrator;
  private isStarted = false;

  constructor() {
    this.config = this.container.get<ConfigurationService>(TYPES.ConfigurationService);
    this.logger = this.container.get<Logger>(TYPES.Logger);
  }

  /**
   * Start the platform
   */
  public async start(): Promise<void> {
    if (this.isStarted) {
      throw ErrorFactory.validation('Platform is already started');
    }

    try {
      this.logger.info('Starting Message Queues Platform V2', {
        version: '2.0.0',
        environment: this.config.getEnvironment(),
        platformMode: this.config.getPlatformMode(),
        provider: this.config.getProvider()
      });

      // Validate configuration
      await this.validateConfiguration();

      // Start HTTP server if enabled
      await this.startHttpServer();

      // Start monitoring if enabled
      await this.startMonitoring();

      this.isStarted = true;
      
      this.logger.info('Message Queues Platform V2 started successfully', {
        httpPort: this.httpServer?.getAddress()?.port,
        healthEndpoint: '/health',
        apiEndpoint: '/api/v2',
        metricsEndpoint: '/metrics'
      });

    } catch (error) {
      this.logger.fatal('Failed to start platform', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Cleanup on failure
      await this.stop();
      throw error;
    }
  }

  /**
   * Stop the platform
   */
  public async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.logger.info('Stopping Message Queues Platform V2');

    try {
      // Stop HTTP server
      if (this.httpServer) {
        await this.httpServer.stop();
      }

      // Stop monitoring
      await this.stopMonitoring();

      this.isStarted = false;
      
      this.logger.info('Message Queues Platform V2 stopped successfully');

    } catch (error) {
      this.logger.error('Error during platform shutdown', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Check if platform is running
   */
  public get running(): boolean {
    return this.isStarted;
  }

  /**
   * Get platform information
   */
  public getInfo(): Record<string, unknown> {
    return {
      name: 'New Relic Message Queues Platform',
      version: '2.0.0',
      architecture: 'clean-architecture',
      description: 'Enterprise-grade message queue monitoring with comprehensive observability',
      status: this.isStarted ? 'running' : 'stopped',
      configuration: {
        environment: this.config.getEnvironment(),
        platformMode: this.config.getPlatformMode(),
        provider: this.config.getProvider(),
        region: this.config.getNewRelicConfig().region
      },
      features: {
        httpApi: !!this.httpServer,
        healthChecks: this.config.getHealthCheckConfig().enabled,
        metrics: this.config.getMetricsConfig().enabled,
        prometheus: this.config.getMetricsConfig().prometheusEnabled,
        tracing: this.config.getTracingConfig().enabled
      },
      endpoints: this.httpServer ? {
        http: this.httpServer.getAddress(),
        health: '/health',
        api: '/api/v2',
        metrics: '/metrics'
      } : null
    };
  }

  private async validateConfiguration(): Promise<void> {
    try {
      this.logger.debug('Validating configuration');
      
      // Configuration service constructor already validates
      const config = this.config.getAll();
      
      this.logger.debug('Configuration validated successfully', {
        settingsCount: Object.keys(config).length,
        environment: this.config.getEnvironment(),
        platformMode: this.config.getPlatformMode()
      });

    } catch (error) {
      throw ErrorFactory.configuration(
        'Configuration validation failed',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async startHttpServer(): Promise<void> {
    try {
      this.logger.debug('Starting HTTP server');
      
      this.httpServer = new HttpServer(this.container);
      await this.httpServer.start();
      
      const address = this.httpServer.getAddress();
      this.logger.info('HTTP server started', {
        host: address?.host,
        port: address?.port
      });

    } catch (error) {
      throw ErrorFactory.infrastructure(
        'Failed to start HTTP server',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async startMonitoring(): Promise<void> {
    try {
      this.logger.debug('Starting monitoring services');
      
      // Create and start the orchestrator
      this.orchestrator = this.container.get<PlatformOrchestrator>(TYPES.PlatformOrchestrator);
      
      await this.orchestrator.start();
      
      this.logger.info('Monitoring services started', {
        monitoringInterval: this.config.getMonitoringInterval(),
        metricsEnabled: this.config.getMetricsConfig().enabled,
        healthChecksEnabled: this.config.getHealthCheckConfig().enabled,
        platformMode: this.config.getPlatformMode()
      });

    } catch (error) {
      throw ErrorFactory.infrastructure(
        'Failed to start monitoring',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async stopMonitoring(): Promise<void> {
    try {
      this.logger.debug('Stopping monitoring services');
      
      // Stop the orchestrator
      if (this.orchestrator) {
        await this.orchestrator.stop();
      }
      
      this.logger.info('Monitoring services stopped');

    } catch (error) {
      this.logger.error('Error stopping monitoring', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't throw - we're shutting down anyway
    }
  }
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  const platform = new MessageQueuesPlatform();

  // Handle process signals
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    try {
      await platform.stop();
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));

  try {
    await platform.start();
    
    // Keep process alive
    const keepAlive = setInterval(() => {
      // This keeps the event loop active
    }, 1000);

    // Cleanup interval on shutdown
    process.on('exit', () => {
      clearInterval(keepAlive);
    });

  } catch (error) {
    console.error('Failed to start platform:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export default MessageQueuesPlatform;