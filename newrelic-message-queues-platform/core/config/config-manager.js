/**
 * Centralized Configuration Manager
 * 
 * Consolidates all configuration handling across the platform.
 * Provides validation, defaults, and consistent environment variable handling.
 */

const path = require('path');
const fs = require('fs');

class ConfigManager {
  constructor(overrides = {}) {
    this._config = null;
    this._overrides = overrides;
    this._environmentMappings = {
      // New Relic API Configuration
      apiKey: ['NEW_RELIC_API_KEY', 'NEW_RELIC_USER_API_KEY'],
      userApiKey: ['NEW_RELIC_USER_API_KEY'],
      insertApiKey: ['NEW_RELIC_INSERT_API_KEY', 'NEW_RELIC_API_KEY'],
      accountId: ['NEW_RELIC_ACCOUNT_ID'],
      region: ['NEW_RELIC_REGION'],
      
      // Platform Configuration
      mode: ['PLATFORM_MODE', 'MODE'],
      debug: ['DEBUG', 'PLATFORM_DEBUG'],
      verbose: ['VERBOSE', 'PLATFORM_VERBOSE'],
      dryRun: ['DRY_RUN', 'PLATFORM_DRY_RUN'],
      
      // Infrastructure Configuration
      kafkaBootstrapServers: ['KAFKA_BOOTSTRAP_SERVERS'],
      kafkaClusterName: ['KAFKA_CLUSTER_NAME'],
      
      // Dashboard Configuration
      dashboardPrefix: ['DASHBOARD_PREFIX', 'NR_DASHBOARD_PREFIX'],
      
      // Simulation Configuration
      simulationInterval: ['SIMULATION_INTERVAL'],
      simulationDuration: ['SIMULATION_DURATION']
    };
    
    this._defaults = {
      // API defaults
      region: 'US',
      
      // Platform defaults
      mode: 'simulation',
      debug: false,
      verbose: false,
      dryRun: false,
      
      // HTTP defaults
      timeout: 30000,
      retries: 3,
      retryDelay: 1000,
      
      // Streaming defaults
      batchSize: 100,
      flushInterval: 5000,
      
      // Dashboard defaults
      dashboardPrefix: 'Message Queues',
      dashboardPermissions: 'PUBLIC_READ_WRITE',
      
      // Simulation defaults
      simulationInterval: 30,
      simulationDuration: 300,
      entityCount: {
        clusters: 2,
        brokers: 6,
        topics: 20,
        consumerGroups: 8
      }
    };
  }

  /**
   * Get consolidated configuration
   */
  getConfig() {
    if (!this._config) {
      this._config = this._buildConfig();
    }
    return { ...this._config };
  }

  /**
   * Get specific config value with optional default
   */
  get(key, defaultValue = undefined) {
    const config = this.getConfig();
    return this._getNestedValue(config, key) ?? defaultValue;
  }

  /**
   * Check if running in specific mode
   */
  isMode(mode) {
    return this.get('mode') === mode;
  }

  /**
   * Check if debug mode is enabled
   */
  isDebug() {
    return this.get('debug') === true || this.get('debug') === 'true';
  }

  /**
   * Check if verbose mode is enabled
   */
  isVerbose() {
    return this.get('verbose') === true || this.get('verbose') === 'true';
  }

  /**
   * Check if dry run mode is enabled
   */
  isDryRun() {
    return this.get('dryRun') === true || this.get('dryRun') === 'true';
  }

  /**
   * Get New Relic client configuration
   */
  getNewRelicConfig() {
    const config = this.getConfig();
    return {
      apiKey: config.apiKey || config.userApiKey,
      userApiKey: config.userApiKey,
      insertApiKey: config.insertApiKey || config.apiKey,
      accountId: config.accountId,
      region: config.region,
      timeout: config.timeout,
      retries: config.retries,
      retryDelay: config.retryDelay,
      verbose: config.verbose,
      dryRun: config.dryRun
    };
  }

  /**
   * Get platform mode configuration
   */
  getModeConfig() {
    const config = this.getConfig();
    return {
      mode: config.mode,
      debug: config.debug,
      verbose: config.verbose,
      interval: config.simulationInterval,
      duration: config.simulationDuration
    };
  }

  /**
   * Get dashboard configuration
   */
  getDashboardConfig() {
    const config = this.getConfig();
    return {
      prefix: config.dashboardPrefix,
      permissions: config.dashboardPermissions,
      accountId: config.accountId,
      apiKey: config.userApiKey || config.apiKey,
      region: config.region,
      dryRun: config.dryRun
    };
  }

  /**
   * Get streaming configuration
   */
  getStreamingConfig() {
    const config = this.getConfig();
    return {
      apiKey: config.insertApiKey || config.apiKey,
      accountId: config.accountId,
      region: config.region,
      batchSize: config.batchSize,
      flushInterval: config.flushInterval,
      retries: config.retries,
      retryDelay: config.retryDelay,
      dryRun: config.dryRun,
      verbose: config.verbose
    };
  }

  /**
   * Get infrastructure configuration
   */
  getInfrastructureConfig() {
    const config = this.getConfig();
    return {
      kafkaBootstrapServers: config.kafkaBootstrapServers,
      kafkaClusterName: config.kafkaClusterName,
      accountId: config.accountId,
      apiKey: config.userApiKey || config.apiKey,
      region: config.region,
      debug: config.debug
    };
  }

  /**
   * Validate configuration
   */
  validate() {
    const config = this.getConfig();
    const errors = [];
    const warnings = [];

    // Required fields validation
    if (!config.accountId) {
      errors.push('NEW_RELIC_ACCOUNT_ID is required');
    }

    if (!config.apiKey && !config.userApiKey) {
      errors.push('Either NEW_RELIC_API_KEY or NEW_RELIC_USER_API_KEY is required');
    }

    // Region validation
    if (config.region && !['US', 'EU'].includes(config.region)) {
      errors.push('NEW_RELIC_REGION must be "US" or "EU"');
    }

    // Mode validation
    if (config.mode && !['simulation', 'infrastructure', 'hybrid'].includes(config.mode)) {
      errors.push('MODE must be "simulation", "infrastructure", or "hybrid"');
    }

    // Mode-specific validation
    if (config.mode === 'infrastructure') {
      if (!config.userApiKey && !config.apiKey) {
        warnings.push('Infrastructure mode works best with NEW_RELIC_USER_API_KEY for NerdGraph queries');
      }
    }

    if (config.mode === 'infrastructure' && !config.kafkaBootstrapServers) {
      warnings.push('KAFKA_BOOTSTRAP_SERVERS not set - will only use data from New Relic');
    }

    // Numeric validation
    if (config.accountId && !/^\d+$/.test(config.accountId.toString())) {
      errors.push('NEW_RELIC_ACCOUNT_ID must be numeric');
    }

    if (config.timeout && config.timeout < 1000) {
      warnings.push('HTTP timeout is very low (< 1 second)');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Load configuration from file
   */
  loadFromFile(filePath) {
    try {
      const fullPath = path.resolve(filePath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const fileConfig = JSON.parse(content);
        this._overrides = { ...this._overrides, ...fileConfig };
        this._config = null; // Force rebuild
        return true;
      }
    } catch (error) {
      throw new Error(`Failed to load config from ${filePath}: ${error.message}`);
    }
    return false;
  }

  /**
   * Save configuration to file
   */
  saveToFile(filePath, options = {}) {
    try {
      const config = this.getConfig();
      const sensitiveKeys = ['apiKey', 'userApiKey', 'insertApiKey'];
      
      let output = config;
      if (options.excludeSensitive) {
        output = { ...config };
        sensitiveKeys.forEach(key => {
          if (output[key]) {
            output[key] = '[REDACTED]';
          }
        });
      }

      const content = JSON.stringify(output, null, 2);
      fs.writeFileSync(path.resolve(filePath), content, 'utf8');
      return true;
    } catch (error) {
      throw new Error(`Failed to save config to ${filePath}: ${error.message}`);
    }
  }

  /**
   * Build consolidated configuration
   */
  _buildConfig() {
    const config = { ...this._defaults };

    // Apply environment variables
    Object.entries(this._environmentMappings).forEach(([key, envVars]) => {
      const value = this._getEnvironmentValue(envVars);
      if (value !== undefined) {
        config[key] = this._coerceValue(value);
      }
    });

    // Apply overrides
    Object.assign(config, this._overrides);

    // Process special cases
    this._processSpecialConfigs(config);

    return config;
  }

  /**
   * Get value from environment variables (first found wins)
   */
  _getEnvironmentValue(envVars) {
    for (const envVar of envVars) {
      const value = process.env[envVar];
      if (value !== undefined && value !== '') {
        return value;
      }
    }
    return undefined;
  }

  /**
   * Coerce string values to appropriate types
   */
  _coerceValue(value) {
    if (typeof value !== 'string') {
      return value;
    }

    // Boolean conversion
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Number conversion
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    if (/^\d+\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    return value;
  }

  /**
   * Process special configuration cases
   */
  _processSpecialConfigs(config) {
    // Ensure accountId is a string for API calls but can be parsed as int
    if (config.accountId && typeof config.accountId === 'number') {
      config.accountId = config.accountId.toString();
    }

    // Handle debug mode environment variable patterns
    if (config.debug && typeof config.debug === 'string') {
      config.debug = config.debug.includes('platform') || config.debug === '*';
    }

    // Set appropriate API keys based on mode
    if (!config.userApiKey && config.apiKey) {
      config.userApiKey = config.apiKey;
    }
    if (!config.insertApiKey && config.apiKey) {
      config.insertApiKey = config.apiKey;
    }
  }

  /**
   * Get nested object value using dot notation
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Get configuration summary for logging
   */
  getSummary() {
    const config = this.getConfig();
    return {
      mode: config.mode,
      region: config.region,
      accountId: config.accountId ? `${config.accountId.substring(0, 4)}****` : 'NOT_SET',
      hasApiKey: !!config.apiKey,
      hasUserApiKey: !!config.userApiKey,
      debug: config.debug,
      dryRun: config.dryRun
    };
  }
}

// Singleton instance
let configManager = null;

/**
 * Get singleton config manager instance
 */
function getConfigManager(overrides = {}) {
  if (!configManager || Object.keys(overrides).length > 0) {
    configManager = new ConfigManager(overrides);
  }
  return configManager;
}

/**
 * Reset singleton (useful for testing)
 */
function resetConfigManager() {
  configManager = null;
}

module.exports = {
  ConfigManager,
  getConfigManager,
  resetConfigManager
};