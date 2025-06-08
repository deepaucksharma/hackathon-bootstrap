/**
 * Centralized Configuration Module
 * 
 * Manages all configuration settings for the platform, including:
 * - Environment variables
 * - Default values
 * - Configuration validation
 * - Environment-specific settings
 */

const path = require('path');
const fs = require('fs');

class ConfigurationManager {
  constructor() {
    this.config = {};
    this.environment = process.env.NODE_ENV || 'development';
    this.configPath = process.env.CONFIG_PATH || path.join(__dirname, 'environments');
    
    // Load configuration in order of precedence
    this.loadDefaults();
    this.loadEnvironmentFile();
    this.loadEnvironmentVariables();
    this.validate();
  }

  /**
   * Load default configuration values
   */
  loadDefaults() {
    this.config = {
      // New Relic Configuration
      newRelic: {
        accountId: null,
        apiKey: null,
        region: 'US',
        nerdgraphUrl: 'https://api.newrelic.com/graphql',
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000
      },

      // Platform Configuration
      platform: {
        name: 'Message Queues Platform',
        version: require('../package.json').version,
        environment: this.environment,
        logLevel: 'info',
        debug: false
      },

      // Entity Configuration
      entities: {
        providers: ['kafka', 'rabbitmq', 'sqs', 'azure_service_bus'],
        defaultProvider: 'kafka',
        validationEnabled: true,
        relationshipManagement: true
      },

      // Simulation Configuration
      simulation: {
        businessHoursStart: 9,
        businessHoursEnd: 17,
        timeZone: 'UTC',
        weekendReduction: 0.3,
        anomalyRate: 0.05,
        dataPattern: 'realistic',
        streamingEnabled: true,
        streamingInterval: 60000 // 1 minute
      },

      // Dashboard Configuration
      dashboards: {
        defaultPermissions: 'PUBLIC_READ_WRITE',
        layoutEngine: 'grid',
        gridColumns: 12,
        responsive: true,
        optimization: {
          enabled: true,
          maxWidgetsPerPage: 12,
          queryCaching: true
        }
      },

      // Verification Configuration
      verification: {
        enabled: true,
        screenshotEnabled: true,
        performanceThresholds: {
          loadTime: 5000,
          renderTime: 2000,
          queryTime: 1000
        }
      },

      // Data Storage Configuration
      storage: {
        cacheEnabled: true,
        cacheTimeout: 300000, // 5 minutes
        persistenceEnabled: false,
        dataRetention: 86400000 // 24 hours
      }
    };
  }

  /**
   * Load environment-specific configuration file
   */
  loadEnvironmentFile() {
    const envConfigPath = path.join(this.configPath, `${this.environment}.json`);
    
    if (fs.existsSync(envConfigPath)) {
      try {
        const envConfig = JSON.parse(fs.readFileSync(envConfigPath, 'utf8'));
        this.config = this.deepMerge(this.config, envConfig);
      } catch (error) {
        console.warn(`Failed to load environment config from ${envConfigPath}:`, error.message);
      }
    }
  }

  /**
   * Load configuration from environment variables
   */
  loadEnvironmentVariables() {
    // New Relic settings
    if (process.env.NEW_RELIC_ACCOUNT_ID) {
      this.config.newRelic.accountId = process.env.NEW_RELIC_ACCOUNT_ID;
    }
    
    if (process.env.NEW_RELIC_USER_API_KEY) {
      this.config.newRelic.apiKey = process.env.NEW_RELIC_USER_API_KEY;
    }
    
    if (process.env.NEW_RELIC_REGION) {
      this.config.newRelic.region = process.env.NEW_RELIC_REGION;
    }

    // Platform settings
    if (process.env.PLATFORM_ENVIRONMENT) {
      this.config.platform.environment = process.env.PLATFORM_ENVIRONMENT;
    }
    
    if (process.env.LOG_LEVEL) {
      this.config.platform.logLevel = process.env.LOG_LEVEL;
    }
    
    if (process.env.DEBUG === 'true') {
      this.config.platform.debug = true;
    }

    // Simulation settings
    if (process.env.ANOMALY_RATE) {
      this.config.simulation.anomalyRate = parseFloat(process.env.ANOMALY_RATE);
    }
    
    if (process.env.STREAMING_INTERVAL) {
      this.config.simulation.streamingInterval = parseInt(process.env.STREAMING_INTERVAL);
    }

    // Dashboard settings
    if (process.env.DEFAULT_PERMISSIONS) {
      this.config.dashboards.defaultPermissions = process.env.DEFAULT_PERMISSIONS;
    }
  }

  /**
   * Validate configuration
   */
  validate() {
    const errors = [];

    // Validate required New Relic settings
    if (!this.config.newRelic.accountId) {
      errors.push('NEW_RELIC_ACCOUNT_ID is required');
    }
    
    if (!this.config.newRelic.apiKey) {
      errors.push('NEW_RELIC_USER_API_KEY is required');
    }

    // Validate numeric values
    if (this.config.simulation.anomalyRate < 0 || this.config.simulation.anomalyRate > 1) {
      errors.push('Anomaly rate must be between 0 and 1');
    }

    if (this.config.simulation.businessHoursStart < 0 || this.config.simulation.businessHoursStart > 23) {
      errors.push('Business hours start must be between 0 and 23');
    }

    if (this.config.simulation.businessHoursEnd < 0 || this.config.simulation.businessHoursEnd > 23) {
      errors.push('Business hours end must be between 0 and 23');
    }

    if (errors.length > 0 && this.config.platform.environment === 'production') {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    } else if (errors.length > 0) {
      console.warn('Configuration warnings:', errors);
    }
  }

  /**
   * Get configuration value by path
   */
  get(path, defaultValue = undefined) {
    const keys = path.split('.');
    let value = this.config;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  }

  /**
   * Set configuration value by path
   */
  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = this.config;
    
    for (const key of keys) {
      if (!(key in target) || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }
    
    target[lastKey] = value;
  }

  /**
   * Get all configuration
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * Check if running in production
   */
  isProduction() {
    return this.config.platform.environment === 'production';
  }

  /**
   * Check if debug mode is enabled
   */
  isDebugMode() {
    return this.config.platform.debug === true;
  }

  /**
   * Get New Relic configuration
   */
  getNewRelicConfig() {
    return { ...this.config.newRelic };
  }

  /**
   * Get simulation configuration
   */
  getSimulationConfig() {
    return { ...this.config.simulation };
  }

  /**
   * Get dashboard configuration
   */
  getDashboardConfig() {
    return { ...this.config.dashboards };
  }

  /**
   * Deep merge objects
   */
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Export configuration for specific environment
   */
  exportForEnvironment(environment) {
    const baseConfig = { ...this.config };
    
    // Remove sensitive information
    if (baseConfig.newRelic) {
      delete baseConfig.newRelic.apiKey;
    }
    
    return {
      environment,
      timestamp: new Date().toISOString(),
      config: baseConfig
    };
  }

  /**
   * Reload configuration
   */
  reload() {
    this.loadDefaults();
    this.loadEnvironmentFile();
    this.loadEnvironmentVariables();
    this.validate();
  }
}

// Create singleton instance
let instance = null;

/**
 * Get configuration instance
 */
function getConfig() {
  if (!instance) {
    instance = new ConfigurationManager();
  }
  return instance;
}

/**
 * Reset configuration (mainly for testing)
 */
function resetConfig() {
  instance = null;
}

module.exports = {
  getConfig,
  resetConfig,
  ConfigurationManager
};