/**
 * Configuration Service
 * Manages application configuration with validation and type safety
 */

import { injectable } from 'inversify';
import { z } from 'zod';
import type { Environment, PlatformMode, AccountId, ProviderType } from '@shared/types/common.js';
import { ConfigurationError } from '@shared/errors/base.js';

// Configuration schema validation
const ConfigSchema = z.object({
  // Environment
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  
  // Platform
  PLATFORM_MODE: z.enum(['infrastructure', 'simulation', 'hybrid']).default('simulation'),
  PROVIDER: z.enum(['kafka', 'rabbitmq', 'activemq', 'sqs', 'sns']).default('kafka'),
  MONITORING_INTERVAL_MS: z.coerce.number().min(1000).max(300000).default(60000), // 1s to 5min
  
  // New Relic
  NEW_RELIC_ACCOUNT_ID: z.string().min(1),
  NEW_RELIC_API_KEY: z.string().min(1),
  NEW_RELIC_INGEST_KEY: z.string().min(1),
  NEW_RELIC_REGION: z.enum(['US', 'EU']).default('US'),
  
  // Kafka specific
  KAFKA_CLUSTER_NAME: z.string().default('default-cluster'),
  KAFKA_BOOTSTRAP_SERVERS: z.string().optional(),
  
  // HTTP API
  HTTP_PORT: z.coerce.number().min(1).max(65535).default(3000),
  HTTP_HOST: z.string().default('0.0.0.0'),
  
  // Health checks
  HEALTH_CHECK_ENABLED: z.coerce.boolean().default(true),
  HEALTH_CHECK_INTERVAL_MS: z.coerce.number().min(1000).default(30000),
  
  // Metrics
  METRICS_ENABLED: z.coerce.boolean().default(true),
  PROMETHEUS_ENABLED: z.coerce.boolean().default(true),
  PROMETHEUS_PORT: z.coerce.number().min(1).max(65535).default(9090),
  
  // Tracing
  TRACING_ENABLED: z.coerce.boolean().default(false),
  JAEGER_ENDPOINT: z.string().optional(),
  
  // Alert thresholds
  ALERT_ERROR_RATE_THRESHOLD: z.coerce.number().min(0).max(100).default(5),
  ALERT_DISK_USAGE_THRESHOLD: z.coerce.number().min(0).max(100).default(90),
  ALERT_MEMORY_USAGE_THRESHOLD: z.coerce.number().min(0).max(100).default(85),
  
  // Performance
  MAX_CONCURRENT_OPERATIONS: z.coerce.number().min(1).max(100).default(10),
  OPERATION_TIMEOUT_MS: z.coerce.number().min(1000).max(300000).default(30000),
  
  // Security
  API_KEY_REQUIRED: z.coerce.boolean().default(false),
  ALLOWED_ORIGINS: z.string().optional(),
  
  // Database (for future persistent storage)
  DATABASE_URL: z.string().optional(),
  DATABASE_POOL_SIZE: z.coerce.number().min(1).max(50).default(10)
});

type ConfigValues = z.infer<typeof ConfigSchema>;

@injectable()
export class ConfigurationService {
  private readonly config: ConfigValues;
  private readonly validatedAt: number;

  constructor() {
    this.validatedAt = Date.now();
    this.config = this.loadAndValidateConfig();
  }

  /**
   * Get environment
   */
  public getEnvironment(): Environment {
    return this.config.NODE_ENV as Environment;
  }

  /**
   * Check if running in development
   */
  public isDevelopment(): boolean {
    return this.config.NODE_ENV === 'development';
  }

  /**
   * Check if running in production
   */
  public isProduction(): boolean {
    return this.config.NODE_ENV === 'production';
  }

  /**
   * Get log level
   */
  public getLogLevel(): 'debug' | 'info' | 'warn' | 'error' | 'fatal' {
    return this.config.LOG_LEVEL;
  }

  /**
   * Get platform mode
   */
  public getPlatformMode(): PlatformMode {
    return this.config.PLATFORM_MODE as PlatformMode;
  }

  /**
   * Get provider type
   */
  public getProvider(): ProviderType {
    return this.config.PROVIDER as ProviderType;
  }

  /**
   * Get monitoring interval
   */
  public getMonitoringInterval(): number {
    return this.config.MONITORING_INTERVAL_MS;
  }

  /**
   * Get New Relic configuration
   */
  public getNewRelicConfig() {
    return {
      accountId: this.config.NEW_RELIC_ACCOUNT_ID as AccountId,
      apiKey: this.config.NEW_RELIC_API_KEY,
      ingestKey: this.config.NEW_RELIC_INGEST_KEY,
      region: this.config.NEW_RELIC_REGION,
      endpoint: this.getNewRelicEndpoint()
    };
  }

  /**
   * Get Kafka configuration
   */
  public getKafkaConfig() {
    return {
      clusterName: this.config.KAFKA_CLUSTER_NAME,
      bootstrapServers: this.config.KAFKA_BOOTSTRAP_SERVERS?.split(',') || []
    };
  }

  /**
   * Get HTTP configuration
   */
  public getHttpConfig() {
    return {
      port: this.config.HTTP_PORT,
      host: this.config.HTTP_HOST,
      apiKeyRequired: this.config.API_KEY_REQUIRED,
      allowedOrigins: this.config.ALLOWED_ORIGINS?.split(',') || []
    };
  }

  /**
   * Get health check configuration
   */
  public getHealthCheckConfig() {
    return {
      enabled: this.config.HEALTH_CHECK_ENABLED,
      intervalMs: this.config.HEALTH_CHECK_INTERVAL_MS
    };
  }

  /**
   * Get metrics configuration
   */
  public getMetricsConfig() {
    return {
      enabled: this.config.METRICS_ENABLED,
      prometheusEnabled: this.config.PROMETHEUS_ENABLED,
      prometheusPort: this.config.PROMETHEUS_PORT
    };
  }

  /**
   * Get tracing configuration
   */
  public getTracingConfig() {
    return {
      enabled: this.config.TRACING_ENABLED,
      jaegerEndpoint: this.config.JAEGER_ENDPOINT
    };
  }

  /**
   * Get alert thresholds
   */
  public getAlertThresholds() {
    return {
      errorRatePercent: this.config.ALERT_ERROR_RATE_THRESHOLD,
      diskUsagePercent: this.config.ALERT_DISK_USAGE_THRESHOLD,
      memoryUsagePercent: this.config.ALERT_MEMORY_USAGE_THRESHOLD
    };
  }

  /**
   * Get performance configuration
   */
  public getPerformanceConfig() {
    return {
      maxConcurrentOperations: this.config.MAX_CONCURRENT_OPERATIONS,
      operationTimeoutMs: this.config.OPERATION_TIMEOUT_MS
    };
  }

  /**
   * Get database configuration
   */
  public getDatabaseConfig() {
    return {
      url: this.config.DATABASE_URL,
      poolSize: this.config.DATABASE_POOL_SIZE
    };
  }

  /**
   * Get raw configuration value
   */
  public get<K extends keyof ConfigValues>(key: K): ConfigValues[K] {
    return this.config[key];
  }

  /**
   * Get all configuration as object
   */
  public getAll(): Readonly<ConfigValues> {
    return { ...this.config };
  }

  /**
   * Get configuration metadata
   */
  public getMetadata() {
    return {
      validatedAt: this.validatedAt,
      environment: this.config.NODE_ENV,
      version: '2.0.0'
    };
  }

  private loadAndValidateConfig(): ConfigValues {
    try {
      // Load configuration from environment variables
      const result = ConfigSchema.parse(process.env);
      
      // Additional custom validation
      this.validateNewRelicConfig(result);
      this.validateKafkaConfig(result);
      
      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        throw new ConfigurationError(`Configuration validation failed: ${details}`);
      }
      
      throw new ConfigurationError(
        `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private validateNewRelicConfig(config: ConfigValues): void {
    // Validate API key format
    if (!config.NEW_RELIC_API_KEY.startsWith('NRAK-')) {
      throw new ConfigurationError('New Relic API key must start with NRAK-');
    }

    // Validate account ID is numeric
    if (!/^\d+$/.test(config.NEW_RELIC_ACCOUNT_ID)) {
      throw new ConfigurationError('New Relic account ID must be numeric');
    }
  }

  private validateKafkaConfig(config: ConfigValues): void {
    if (config.PLATFORM_MODE === 'infrastructure' && !config.KAFKA_BOOTSTRAP_SERVERS) {
      throw new ConfigurationError('Kafka bootstrap servers are required in infrastructure mode');
    }
  }

  private getNewRelicEndpoint(): string {
    const region = this.config.NEW_RELIC_REGION;
    return region === 'EU' 
      ? 'https://insights-collector.eu01.nr-data.net/v1/accounts'
      : 'https://insights-collector.newrelic.com/v1/accounts';
  }
}