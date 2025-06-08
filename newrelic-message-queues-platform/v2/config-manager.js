/**
 * Configuration Manager for v2 Platform
 * Handles configuration loading, validation, and mode-specific settings
 */

const fs = require('fs').promises;
const path = require('path');
const Ajv = require('ajv');

class ConfigManager {
  constructor(options = {}) {
    this.configPath = options.configPath || path.join(process.cwd(), 'config');
    this.environment = options.environment || process.env.NODE_ENV || 'development';
    this.config = {};
    this.schemas = new Map();
    this.ajv = new Ajv({ allErrors: true });
  }

  /**
   * Load configuration for v2 platform
   */
  async load() {
    try {
      // Load base configuration
      const baseConfig = await this.loadBaseConfig();
      
      // Load environment-specific config
      const envConfig = await this.loadEnvironmentConfig();
      
      // Load mode-specific configurations
      const modeConfigs = await this.loadModeConfigs();
      
      // Merge configurations
      this.config = this.mergeConfigs(baseConfig, envConfig, modeConfigs);
      
      // Apply environment variables
      this.applyEnvironmentVariables();
      
      // Validate configuration
      await this.validate();
      
      return this.config;
      
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  /**
   * Load base configuration
   */
  async loadBaseConfig() {
    const basePath = path.join(this.configPath, 'v2', 'base.json');
    
    try {
      const content = await fs.readFile(basePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      // Return default base config if file doesn't exist
      return this.getDefaultBaseConfig();
    }
  }

  /**
   * Load environment-specific configuration
   */
  async loadEnvironmentConfig() {
    const envPath = path.join(this.configPath, 'v2', 'environments', `${this.environment}.json`);
    
    try {
      const content = await fs.readFile(envPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      // Environment config is optional
      return {};
    }
  }

  /**
   * Load mode-specific configurations
   */
  async loadModeConfigs() {
    const modes = ['simulation', 'infrastructure', 'hybrid'];
    const modeConfigs = {};
    
    for (const mode of modes) {
      const modePath = path.join(this.configPath, 'v2', 'modes', `${mode}.json`);
      
      try {
        const content = await fs.readFile(modePath, 'utf8');
        modeConfigs[mode] = JSON.parse(content);
      } catch (error) {
        // Mode config is optional, use defaults
        modeConfigs[mode] = this.getDefaultModeConfig(mode);
      }
    }
    
    return modeConfigs;
  }

  /**
   * Get default base configuration
   */
  getDefaultBaseConfig() {
    return {
      platform: {
        version: '2.0.0',
        name: 'newrelic-message-queues-platform',
        defaultMode: 'simulation'
      },
      api: {
        region: 'us',
        endpoints: {
          events: 'insights-collector.newrelic.com',
          metrics: 'metric-api.newrelic.com',
          nerdgraph: 'api.newrelic.com'
        }
      },
      streaming: {
        batchSize: 1000,
        flushInterval: 30000,
        maxRetries: 3,
        retryDelay: 1000,
        compression: true
      },
      foundation: {
        hooks: ['validation', 'enrichment', 'routing'],
        aggregation: {
          enabled: true,
          window: 60000,
          maxGroups: 1000
        },
        transformation: {
          maxDepth: 10,
          strictMode: false
        }
      },
      monitoring: {
        metrics: {
          enabled: true,
          interval: 60000
        },
        health: {
          enabled: true,
          endpoint: '/health',
          port: 8080
        }
      }
    };
  }

  /**
   * Get default mode configuration
   */
  getDefaultModeConfig(mode) {
    const defaults = {
      simulation: {
        scenarios: ['production', 'development', 'chaos'],
        defaultScenario: 'production',
        patterns: {
          businessHours: true,
          anomalies: true,
          seasonality: true
        },
        providers: ['kafka', 'rabbitmq', 'sqs'],
        entityCounts: {
          clusters: 2,
          brokers: 6,
          topics: 20,
          queues: 15
        }
      },
      infrastructure: {
        discovery: {
          providers: ['kubernetes', 'docker'],
          interval: 60000,
          timeout: 30000,
          cache: {
            enabled: true,
            ttl: 300000
          }
        },
        shim: {
          providers: ['kafka', 'rabbitmq'],
          validation: {
            strict: true,
            schemas: true
          },
          mapping: {
            autoDetect: true,
            customMappings: {}
          }
        },
        tracking: {
          changes: true,
          history: {
            enabled: true,
            retention: 86400000 // 24 hours
          }
        }
      },
      hybrid: {
        weights: {
          infrastructure: 70,
          simulation: 30
        },
        coordination: {
          deduplication: true,
          prioritization: 'infrastructure',
          mergeStrategy: 'overlay'
        },
        fallback: {
          enabled: true,
          mode: 'simulation',
          threshold: 0.5
        }
      }
    };
    
    return defaults[mode] || {};
  }

  /**
   * Merge configurations with precedence
   */
  mergeConfigs(base, env, modes) {
    const merged = this.deepMerge(base, env);
    
    // Add mode configurations
    merged.modes = modes;
    
    return merged;
  }

  /**
   * Deep merge objects
   */
  deepMerge(target, source) {
    const output = { ...target };
    
    for (const key in source) {
      if (source[key] instanceof Object && key in target) {
        output[key] = this.deepMerge(target[key], source[key]);
      } else {
        output[key] = source[key];
      }
    }
    
    return output;
  }

  /**
   * Apply environment variables
   */
  applyEnvironmentVariables() {
    // API credentials
    if (process.env.NEW_RELIC_ACCOUNT_ID) {
      this.config.accountId = process.env.NEW_RELIC_ACCOUNT_ID;
    }
    
    if (process.env.NEW_RELIC_USER_API_KEY) {
      this.config.apiKey = process.env.NEW_RELIC_USER_API_KEY;
    }
    
    if (process.env.NEW_RELIC_INGEST_KEY) {
      this.config.ingestKey = process.env.NEW_RELIC_INGEST_KEY;
    }
    
    // Region
    if (process.env.NEW_RELIC_REGION) {
      this.config.api.region = process.env.NEW_RELIC_REGION;
    }
    
    // Mode
    if (process.env.V2_PLATFORM_MODE) {
      this.config.platform.defaultMode = process.env.V2_PLATFORM_MODE;
    }
    
    // Feature flags
    if (process.env.V2_ENABLE_MONITORING) {
      this.config.monitoring.metrics.enabled = process.env.V2_ENABLE_MONITORING === 'true';
    }
    
    if (process.env.V2_ENABLE_HEALTH_CHECK) {
      this.config.monitoring.health.enabled = process.env.V2_ENABLE_HEALTH_CHECK === 'true';
    }
  }

  /**
   * Validate configuration
   */
  async validate() {
    // Load schemas if not loaded
    if (this.schemas.size === 0) {
      await this.loadSchemas();
    }
    
    // Validate base config
    const baseSchema = this.schemas.get('base');
    if (baseSchema) {
      const valid = this.ajv.validate(baseSchema, this.config);
      if (!valid) {
        throw new Error(`Configuration validation failed: ${this.ajv.errorsText()}`);
      }
    }
    
    // Validate mode configs
    for (const [mode, modeConfig] of Object.entries(this.config.modes)) {
      const modeSchema = this.schemas.get(mode);
      if (modeSchema) {
        const valid = this.ajv.validate(modeSchema, modeConfig);
        if (!valid) {
          throw new Error(`Mode ${mode} configuration validation failed: ${this.ajv.errorsText()}`);
        }
      }
    }
    
    // Validate required fields
    this.validateRequired();
  }

  /**
   * Load validation schemas
   */
  async loadSchemas() {
    const schemaDir = path.join(this.configPath, 'v2', 'schemas');
    
    try {
      const files = await fs.readdir(schemaDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const schemaPath = path.join(schemaDir, file);
          const content = await fs.readFile(schemaPath, 'utf8');
          const schema = JSON.parse(content);
          const name = path.basename(file, '.json');
          this.schemas.set(name, schema);
        }
      }
    } catch (error) {
      // Schemas are optional, validation will be skipped
    }
  }

  /**
   * Validate required configuration
   */
  validateRequired() {
    const required = ['accountId', 'apiKey'];
    const missing = [];
    
    for (const field of required) {
      if (!this.config[field]) {
        missing.push(field);
      }
    }
    
    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }
  }

  /**
   * Get configuration for a specific mode
   */
  getModeConfig(mode) {
    return this.config.modes?.[mode] || {};
  }

  /**
   * Update configuration
   */
  update(updates) {
    this.config = this.deepMerge(this.config, updates);
  }

  /**
   * Get specific configuration value
   */
  get(path, defaultValue) {
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
   * Set specific configuration value
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
   * Export configuration
   */
  export() {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * Save configuration to file
   */
  async save(filepath) {
    const content = JSON.stringify(this.config, null, 2);
    await fs.writeFile(filepath, content, 'utf8');
  }
}

module.exports = ConfigManager;