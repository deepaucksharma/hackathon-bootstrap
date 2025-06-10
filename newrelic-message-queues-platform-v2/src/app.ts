/**
 * Application Entry Point
 * 
 * Main entry point for the Message Queues Platform v2
 * Uses dependency injection for all components
 */

import 'reflect-metadata';
import { Command } from 'commander';
import { ContainerFactory } from './infrastructure/config/container.js';
import { TYPES } from './infrastructure/config/types.js';
import { PlatformOrchestrator } from './application/services/platform-orchestrator.js';
import { HealthMonitor } from './infrastructure/monitoring/health-monitor.js';
import { CircuitBreakerMonitor } from './infrastructure/resilience/circuit-breaker-monitor.js';
import { Logger } from './shared/utils/logger.js';
import { ConfigurationService } from './infrastructure/config/configuration-service.js';

async function main() {
  const program = new Command();
  
  program
    .version('2.0.0')
    .description('New Relic Message Queues Platform v2')
    .option('-m, --mode <mode>', 'Platform mode (infrastructure|simulation|hybrid)', 'infrastructure')
    .option('-i, --interval <seconds>', 'Collection interval in seconds', '60')
    .option('-e, --environment <env>', 'Environment (development|staging|production)', 'production')
    .option('--health-port <port>', 'Health check endpoint port', '8080')
    .option('--debug', 'Enable debug logging')
    .parse(process.argv);

  const options = program.opts();
  
  // Set debug mode
  if (options.debug) {
    process.env.DEBUG = 'platform:*,transform:*,synthesize:*';
  }
  
  // Create DI container
  const container = ContainerFactory.createProductionContainer();
  
  // Get core services
  const logger = container.get<Logger>(TYPES.Logger);
  const config = container.get<ConfigurationService>(TYPES.ConfigurationService);
  const orchestrator = container.get<PlatformOrchestrator>(TYPES.PlatformOrchestrator);
  const healthMonitor = container.get<HealthMonitor>(TYPES.HealthMonitor);
  const circuitBreakerMonitor = container.get<CircuitBreakerMonitor>(TYPES.CircuitBreakerMonitor);
  
  logger.info('Starting Message Queues Platform v2', {
    mode: options.mode,
    interval: options.interval,
    environment: options.environment
  });
  
  // Start health monitoring
  healthMonitor.registerDefaultChecks();
  
  // Monitor circuit breakers
  circuitBreakerMonitor.on('circuitOpened', (event) => {
    logger.warn('Circuit breaker opened', event);
    healthMonitor.reportUnhealthy('circuit-breaker', `Circuit ${event.name} opened: ${event.reason}`);
  });
  
  circuitBreakerMonitor.on('circuitClosed', (event) => {
    logger.info('Circuit breaker closed', event);
    healthMonitor.reportHealthy('circuit-breaker', `Circuit ${event.name} closed`);
  });
  
  // Start health check endpoint
  if (options.healthPort) {
    const express = await import('express');
    const app = express.default();
    
    app.get('/health', (req, res) => {
      const health = healthMonitor.getSystemHealth();
      const status = health.overall === 'healthy' ? 200 : 
                     health.overall === 'degraded' ? 503 : 500;
      
      res.status(status).json(health);
    });
    
    app.get('/metrics', (req, res) => {
      const stats = orchestrator.getStats();
      res.json(stats);
    });
    
    app.listen(parseInt(options.healthPort), () => {
      logger.info(`Health endpoint listening on port ${options.healthPort}`);
    });
  }
  
  // Handle shutdown gracefully
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    
    try {
      // Stop orchestrator
      await orchestrator.stop();
      
      // Stop health monitoring
      healthMonitor.stop();
      
      // Stop circuit breaker monitoring
      circuitBreakerMonitor.stop();
      
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  // Start the platform
  try {
    await orchestrator.start();
    logger.info('Platform started successfully');
    
    // Report healthy
    healthMonitor.reportHealthy('platform', 'Platform started successfully');
    
  } catch (error) {
    logger.error('Failed to start platform:', error);
    healthMonitor.reportUnhealthy('platform', `Startup failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

// Run the application
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});