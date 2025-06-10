/**
 * Custom Metric Registry
 * 
 * Allows users to define and register custom metrics for message queue monitoring.
 * Supports dynamic metric definitions, custom calculations, and provider-specific metrics.
 */

const { MetricDefinition } = require('./metric-definitions');
const { logger } = require('../utils/logger');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class CustomMetricRegistry {
  constructor(options = {}) {
    this.customMetrics = new Map();
    this.metricProviders = new Map();
    this.validationRules = new Map();
    
    // Configuration
    this.options = {
      allowOverrides: options.allowOverrides !== false,
      validateOnRegister: options.validateOnRegister !== false,
      customMetricPath: options.customMetricPath || './custom-metrics',
      autoLoad: options.autoLoad !== false,
      ...options
    };
    
    // Initialize built-in providers
    this.initializeProviders();
    
    // Auto-load custom metrics if enabled
    if (this.options.autoLoad && this.options.customMetricPath) {
      this.loadCustomMetricsFromDirectory(this.options.customMetricPath);
    }
    
    logger.info('📊 Custom Metric Registry initialized');
  }

  /**
   * Initialize built-in metric providers
   */
  initializeProviders() {
    // Calculation provider for derived metrics
    this.registerProvider('calculation', {
      name: 'Calculation Provider',
      process: (config, context) => {
        if (typeof config.formula === 'function') {
          return config.formula(context);
        }
        // Simple expression evaluation
        return this.evaluateExpression(config.formula, context);
      }
    });
    
    // Composite provider for multi-source metrics
    this.registerProvider('composite', {
      name: 'Composite Provider',
      process: (config, context) => {
        const values = {};
        config.sources.forEach(source => {
          const value = this.collectMetricValue(source, context);
          values[source.name] = value;
        });
        return config.combine(values);
      }
    });
    
    // Threshold provider for health scores
    this.registerProvider('threshold', {
      name: 'Threshold Provider',
      process: (config, context) => {
        const value = this.collectMetricValue(config.source, context);
        for (const threshold of config.thresholds) {
          if (this.evaluateCondition(value, threshold.condition)) {
            return threshold.score;
          }
        }
        return config.defaultScore || 0;
      }
    });
  }

  /**
   * Register a custom metric definition
   */
  registerMetric(metricDef) {
    if (!metricDef.name) {
      throw new Error('Metric definition must have a name');
    }
    
    // Validate if enabled
    if (this.options.validateOnRegister) {
      const validation = this.validateMetricDefinition(metricDef);
      if (!validation.valid) {
        throw new Error(`Invalid metric definition: ${validation.errors.join(', ')}`);
      }
    }
    
    // Check for overrides
    if (this.customMetrics.has(metricDef.name) && !this.options.allowOverrides) {
      throw new Error(`Metric ${metricDef.name} already exists. Enable allowOverrides to replace.`);
    }
    
    // Create metric instance
    const metric = this.createMetricInstance(metricDef);
    
    this.customMetrics.set(metricDef.name, metric);
    
    logger.debug(`📊 Registered custom metric: ${metricDef.name}`);
    
    return metric;
  }

  /**
   * Register multiple metrics from array or object
   */
  registerMetrics(metrics) {
    const registered = [];
    
    if (Array.isArray(metrics)) {
      metrics.forEach(metric => {
        try {
          registered.push(this.registerMetric(metric));
        } catch (error) {
          logger.error(`Failed to register metric ${metric.name}:`, error.message);
        }
      });
    } else if (typeof metrics === 'object') {
      Object.entries(metrics).forEach(([name, definition]) => {
        try {
          registered.push(this.registerMetric({ name, ...definition }));
        } catch (error) {
          logger.error(`Failed to register metric ${name}:`, error.message);
        }
      });
    }
    
    return registered;
  }

  /**
   * Load custom metrics from YAML/JSON file
   */
  loadCustomMetricsFromFile(filePath) {
    try {
      const fullPath = path.resolve(filePath);
      const content = fs.readFileSync(fullPath, 'utf8');
      
      let metrics;
      if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        metrics = yaml.load(content);
      } else if (filePath.endsWith('.json')) {
        metrics = JSON.parse(content);
      } else {
        throw new Error('Unsupported file format. Use .yaml, .yml, or .json');
      }
      
      const registered = this.registerMetrics(metrics);
      logger.success(`✅ Loaded ${registered.length} custom metrics from ${filePath}`);
      
      return registered;
    } catch (error) {
      logger.error(`Failed to load custom metrics from ${filePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Load all custom metrics from a directory
   */
  loadCustomMetricsFromDirectory(dirPath) {
    try {
      const fullPath = path.resolve(dirPath);
      
      if (!fs.existsSync(fullPath)) {
        logger.debug(`Custom metrics directory not found: ${fullPath}`);
        return [];
      }
      
      const files = fs.readdirSync(fullPath);
      const metricFiles = files.filter(f => 
        f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json')
      );
      
      const allMetrics = [];
      
      metricFiles.forEach(file => {
        try {
          const metrics = this.loadCustomMetricsFromFile(path.join(fullPath, file));
          allMetrics.push(...metrics);
        } catch (error) {
          logger.error(`Failed to load ${file}:`, error.message);
        }
      });
      
      logger.info(`📊 Loaded ${allMetrics.length} custom metrics from ${metricFiles.length} files`);
      
      return allMetrics;
    } catch (error) {
      logger.error(`Failed to load custom metrics directory:`, error.message);
      return [];
    }
  }

  /**
   * Create metric instance with enhanced capabilities
   */
  createMetricInstance(definition) {
    const baseDefinition = {
      name: definition.name,
      description: definition.description || `Custom metric: ${definition.name}`,
      unit: definition.unit || 'count',
      type: definition.type || 'gauge',
      aggregation: definition.aggregation || 'latest',
      validation: definition.validation || {},
      dimensions: definition.dimensions || [],
      tags: definition.tags || {},
      ...definition
    };
    
    // Add custom processing if provider is specified
    if (definition.provider && this.metricProviders.has(definition.provider)) {
      const provider = this.metricProviders.get(definition.provider);
      baseDefinition.process = (value, context) => {
        return provider.process(definition, context);
      };
    }
    
    // Add custom collection logic
    if (definition.collect) {
      baseDefinition.collect = definition.collect;
    }
    
    return new CustomMetric(baseDefinition);
  }

  /**
   * Register a custom metric provider
   */
  registerProvider(name, provider) {
    this.metricProviders.set(name, provider);
    logger.debug(`📦 Registered metric provider: ${name}`);
  }

  /**
   * Get all registered custom metrics
   */
  getAllMetrics() {
    return Array.from(this.customMetrics.values());
  }

  /**
   * Get metrics for specific entity type
   */
  getMetricsForEntityType(entityType) {
    return this.getAllMetrics().filter(metric => 
      !metric.entityTypes || metric.entityTypes.includes(entityType)
    );
  }

  /**
   * Get metrics by tags
   */
  getMetricsByTags(tags) {
    return this.getAllMetrics().filter(metric => {
      if (!metric.tags) return false;
      return Object.entries(tags).every(([key, value]) => 
        metric.tags[key] === value
      );
    });
  }

  /**
   * Validate metric definition
   */
  validateMetricDefinition(definition) {
    const errors = [];
    
    if (!definition.name) {
      errors.push('name is required');
    }
    
    if (definition.name && !/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(definition.name)) {
      errors.push('name must start with letter and contain only letters, numbers, dots, dashes, and underscores');
    }
    
    if (definition.type && !['gauge', 'counter', 'histogram', 'summary'].includes(definition.type)) {
      errors.push('type must be gauge, counter, histogram, or summary');
    }
    
    if (definition.unit && typeof definition.unit !== 'string') {
      errors.push('unit must be a string');
    }
    
    if (definition.provider && !this.metricProviders.has(definition.provider)) {
      errors.push(`unknown provider: ${definition.provider}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Collect metric value using various strategies
   */
  collectMetricValue(source, context) {
    if (typeof source === 'function') {
      return source(context);
    }
    
    if (typeof source === 'string') {
      // Path-based extraction
      return this.extractValueFromPath(source, context);
    }
    
    if (source.type === 'constant') {
      return source.value;
    }
    
    if (source.type === 'random') {
      return Math.random() * (source.max - source.min) + source.min;
    }
    
    return null;
  }

  /**
   * Extract value from object path
   */
  extractValueFromPath(path, obj) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Evaluate simple expressions
   */
  evaluateExpression(expression, context) {
    // Simple expression evaluator (safe subset)
    // This is a placeholder - in production, use a proper expression parser
    try {
      // Replace variable references
      let expr = expression;
      Object.entries(context).forEach(([key, value]) => {
        expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), value);
      });
      
      // Only allow safe operations
      if (!/^[\d\s+\-*/().,]+$/.test(expr)) {
        throw new Error('Invalid expression');
      }
      
      return Function('"use strict"; return (' + expr + ')')();
    } catch (error) {
      logger.error(`Expression evaluation failed: ${expression}`);
      return null;
    }
  }

  /**
   * Evaluate threshold conditions
   */
  evaluateCondition(value, condition) {
    const [operator, threshold] = condition.split(' ');
    const thresholdValue = parseFloat(threshold);
    
    switch (operator) {
      case '>': return value > thresholdValue;
      case '>=': return value >= thresholdValue;
      case '<': return value < thresholdValue;
      case '<=': return value <= thresholdValue;
      case '==': return value === thresholdValue;
      case '!=': return value !== thresholdValue;
      default: return false;
    }
  }

  /**
   * Export metric definitions
   */
  exportDefinitions(format = 'json') {
    const definitions = {};
    
    this.customMetrics.forEach((metric, name) => {
      definitions[name] = {
        description: metric.description,
        unit: metric.unit,
        type: metric.type,
        aggregation: metric.aggregation,
        validation: metric.validation,
        dimensions: metric.dimensions,
        tags: metric.tags,
        provider: metric.provider,
        config: metric.config
      };
    });
    
    if (format === 'yaml') {
      return yaml.dump(definitions);
    }
    
    return JSON.stringify(definitions, null, 2);
  }
}

/**
 * Custom Metric class with enhanced capabilities
 */
class CustomMetric extends MetricDefinition {
  constructor(options) {
    super(options);
    
    this.entityTypes = options.entityTypes || [];
    this.tags = options.tags || {};
    this.provider = options.provider;
    this.config = options.config || {};
    this.collect = options.collect;
    
    // Track usage statistics
    this.stats = {
      collectCount: 0,
      errorCount: 0,
      lastCollected: null,
      lastError: null
    };
  }

  /**
   * Collect metric value with error handling
   */
  async collectValue(context) {
    try {
      this.stats.collectCount++;
      this.stats.lastCollected = new Date();
      
      let value;
      
      if (this.collect) {
        value = await this.collect(context);
      } else if (this.process) {
        value = await this.process(null, context);
      } else {
        throw new Error('No collection method defined');
      }
      
      // Validate collected value
      const validation = this.validate(value);
      if (!validation.valid) {
        throw new Error(validation.reason);
      }
      
      return value;
    } catch (error) {
      this.stats.errorCount++;
      this.stats.lastError = {
        message: error.message,
        timestamp: new Date()
      };
      throw error;
    }
  }

  /**
   * Get metric metadata
   */
  getMetadata() {
    return {
      name: this.name,
      description: this.description,
      unit: this.unit,
      type: this.type,
      entityTypes: this.entityTypes,
      tags: this.tags,
      stats: this.stats
    };
  }
}

// Singleton instance
let registry = null;

/**
 * Get or create the custom metric registry
 */
function getCustomMetricRegistry(options = {}) {
  if (!registry) {
    registry = new CustomMetricRegistry(options);
  }
  return registry;
}

module.exports = {
  CustomMetricRegistry,
  CustomMetric,
  getCustomMetricRegistry
};