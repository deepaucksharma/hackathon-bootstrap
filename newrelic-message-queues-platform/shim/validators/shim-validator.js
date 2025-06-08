/**
 * SHIM Validator
 * 
 * Validates infrastructure data and transformation results
 * to ensure data integrity and correctness.
 */

class ShimValidator {
  constructor(config = {}) {
    this.config = {
      strictMode: false,
      allowUnknownFields: true,
      validateMetrics: true,
      validateRelationships: true,
      ...config
    };
    
    this.validationRules = {
      entityTypes: [
        'MESSAGE_QUEUE_CLUSTER',
        'MESSAGE_QUEUE_BROKER',
        'MESSAGE_QUEUE_TOPIC',
        'MESSAGE_QUEUE_QUEUE'
      ],
      relationshipTypes: [
        'CONTAINS',
        'HOSTED_ON',
        'REPLICATED_TO',
        'CONNECTED_TO',
        'PRODUCES_TO',
        'CONSUMES_FROM'
      ],
      metricTypes: ['gauge', 'count', 'summary', 'histogram'],
      providers: ['kafka', 'rabbitmq', 'sqs', 'redis', 'pulsar']
    };
  }
  
  /**
   * Validate infrastructure data before transformation
   * @param {Object} data - Infrastructure data
   * @param {string} provider - Provider name
   * @returns {Object} Validation result
   */
  validateInfrastructureData(data, provider) {
    const errors = [];
    const warnings = [];
    
    try {
      // Basic structure validation
      if (!data || typeof data !== 'object') {
        errors.push('Infrastructure data must be an object');
        return { valid: false, errors, warnings };
      }
      
      // Provider-specific validation
      switch (provider) {
        case 'kafka':
          this._validateKafkaData(data, errors, warnings);
          break;
        case 'rabbitmq':
          this._validateRabbitMQData(data, errors, warnings);
          break;
        default:
          if (this.config.strictMode) {
            errors.push(`Unknown provider: ${provider}`);
          } else {
            warnings.push(`Unrecognized provider: ${provider}`);
          }
      }
      
      // Check for at least one data source
      const dataSources = ['kubernetes', 'docker', provider, 'prometheus', 'jmx'];
      const hasSource = dataSources.some(source => data[source]);
      
      if (!hasSource) {
        errors.push(`No valid data source found. Expected one of: ${dataSources.join(', ')}`);
      }
      
    } catch (error) {
      errors.push(`Validation error: ${error.message}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Validate transformation result
   * @param {Object} result - Transformation result
   * @returns {Object} Validation result
   */
  validateTransformationResult(result) {
    const errors = [];
    const warnings = [];
    const stats = {
      entities: 0,
      metrics: 0,
      relationships: 0
    };
    
    try {
      // Basic structure validation
      if (!result || typeof result !== 'object') {
        errors.push('Transformation result must be an object');
        return { valid: false, errors, warnings, stats };
      }
      
      // Validate entities
      if (!Array.isArray(result.entities)) {
        errors.push('Result must include entities array');
      } else {
        stats.entities = result.entities.length;
        result.entities.forEach((entity, index) => {
          this._validateEntity(entity, index, errors, warnings);
        });
      }
      
      // Validate metrics
      if (!Array.isArray(result.metrics)) {
        errors.push('Result must include metrics array');
      } else if (this.config.validateMetrics) {
        stats.metrics = result.metrics.length;
        result.metrics.forEach((metric, index) => {
          this._validateMetric(metric, index, errors, warnings);
        });
      }
      
      // Validate relationships
      if (!Array.isArray(result.relationships)) {
        errors.push('Result must include relationships array');
      } else if (this.config.validateRelationships) {
        stats.relationships = result.relationships.length;
        result.relationships.forEach((rel, index) => {
          this._validateRelationship(rel, index, errors, warnings);
        });
      }
      
      // Validate metadata
      if (result.metadata) {
        this._validateMetadata(result.metadata, errors, warnings);
      }
      
      // Cross-validation
      if (this.config.strictMode) {
        this._crossValidate(result, errors, warnings);
      }
      
    } catch (error) {
      errors.push(`Validation error: ${error.message}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats
    };
  }
  
  /**
   * Validate an entity
   * @private
   */
  _validateEntity(entity, index, errors, warnings) {
    const prefix = `Entity[${index}]`;
    
    // Required fields
    if (!entity.guid) {
      errors.push(`${prefix}: Missing required field 'guid'`);
    } else if (!this._isValidGuid(entity.guid)) {
      errors.push(`${prefix}: Invalid GUID format: ${entity.guid}`);
    }
    
    if (!entity.entityType) {
      errors.push(`${prefix}: Missing required field 'entityType'`);
    } else if (!this.validationRules.entityTypes.includes(entity.entityType)) {
      if (this.config.strictMode) {
        errors.push(`${prefix}: Invalid entityType: ${entity.entityType}`);
      } else {
        warnings.push(`${prefix}: Unrecognized entityType: ${entity.entityType}`);
      }
    }
    
    if (!entity.name) {
      errors.push(`${prefix}: Missing required field 'name'`);
    }
    
    // Type-specific validation
    switch (entity.entityType) {
      case 'MESSAGE_QUEUE_BROKER':
        if (!entity.host) {
          errors.push(`${prefix}: Broker missing required field 'host'`);
        }
        if (!entity.port || typeof entity.port !== 'number') {
          errors.push(`${prefix}: Broker missing or invalid 'port'`);
        }
        break;
        
      case 'MESSAGE_QUEUE_TOPIC':
        if (entity.partitions !== undefined && typeof entity.partitions !== 'number') {
          errors.push(`${prefix}: Topic 'partitions' must be a number`);
        }
        break;
        
      case 'MESSAGE_QUEUE_QUEUE':
        if (!entity.vhost && entity.provider === 'rabbitmq') {
          warnings.push(`${prefix}: RabbitMQ queue missing 'vhost', defaulting to '/'`);
        }
        break;
    }
    
    // Validate tags if present
    if (entity.tags && !Array.isArray(entity.tags)) {
      errors.push(`${prefix}: 'tags' must be an array`);
    }
  }
  
  /**
   * Validate a metric
   * @private
   */
  _validateMetric(metric, index, errors, warnings) {
    const prefix = `Metric[${index}]`;
    
    // Required fields
    if (!metric.name) {
      errors.push(`${prefix}: Missing required field 'name'`);
    }
    
    if (metric.type && !this.validationRules.metricTypes.includes(metric.type)) {
      warnings.push(`${prefix}: Unrecognized metric type: ${metric.type}`);
    }
    
    if (metric.value === undefined || metric.value === null) {
      errors.push(`${prefix}: Missing required field 'value'`);
    } else if (typeof metric.value !== 'number') {
      errors.push(`${prefix}: Metric value must be a number`);
    }
    
    if (!metric.timestamp) {
      warnings.push(`${prefix}: Missing timestamp, will use current time`);
    } else if (typeof metric.timestamp !== 'number') {
      errors.push(`${prefix}: Timestamp must be a number (milliseconds)`);
    }
    
    // Validate attributes
    if (metric.attributes && typeof metric.attributes !== 'object') {
      errors.push(`${prefix}: Attributes must be an object`);
    }
  }
  
  /**
   * Validate a relationship
   * @private
   */
  _validateRelationship(rel, index, errors, warnings) {
    const prefix = `Relationship[${index}]`;
    
    // Required fields
    if (!rel.source) {
      errors.push(`${prefix}: Missing required field 'source'`);
    } else if (!this._isValidGuid(rel.source)) {
      errors.push(`${prefix}: Invalid source GUID: ${rel.source}`);
    }
    
    if (!rel.target) {
      errors.push(`${prefix}: Missing required field 'target'`);
    } else if (!this._isValidGuid(rel.target)) {
      errors.push(`${prefix}: Invalid target GUID: ${rel.target}`);
    }
    
    if (!rel.type) {
      errors.push(`${prefix}: Missing required field 'type'`);
    } else if (!this.validationRules.relationshipTypes.includes(rel.type)) {
      if (this.config.strictMode) {
        errors.push(`${prefix}: Invalid relationship type: ${rel.type}`);
      } else {
        warnings.push(`${prefix}: Unrecognized relationship type: ${rel.type}`);
      }
    }
  }
  
  /**
   * Validate metadata
   * @private
   */
  _validateMetadata(metadata, errors, warnings) {
    if (!metadata.provider) {
      warnings.push('Metadata missing provider information');
    } else if (!this.validationRules.providers.includes(metadata.provider)) {
      warnings.push(`Unrecognized provider in metadata: ${metadata.provider}`);
    }
    
    if (!metadata.timestamp) {
      warnings.push('Metadata missing timestamp');
    }
    
    if (!metadata.source) {
      warnings.push('Metadata missing source identifier');
    }
  }
  
  /**
   * Cross-validate entities, metrics, and relationships
   * @private
   */
  _crossValidate(result, errors, warnings) {
    const entityGuids = new Set(result.entities.map(e => e.guid));
    
    // Validate relationship references
    result.relationships.forEach((rel, index) => {
      if (!entityGuids.has(rel.source)) {
        warnings.push(`Relationship[${index}]: Source entity not found: ${rel.source}`);
      }
      if (!entityGuids.has(rel.target)) {
        warnings.push(`Relationship[${index}]: Target entity not found: ${rel.target}`);
      }
    });
    
    // Check for orphaned entities
    const referencedGuids = new Set();
    result.relationships.forEach(rel => {
      referencedGuids.add(rel.source);
      referencedGuids.add(rel.target);
    });
    
    result.entities.forEach(entity => {
      if (!referencedGuids.has(entity.guid) && entity.entityType !== 'MESSAGE_QUEUE_CLUSTER') {
        warnings.push(`Entity '${entity.name}' (${entity.guid}) has no relationships`);
      }
    });
  }
  
  /**
   * Validate Kafka-specific data
   * @private
   */
  _validateKafkaData(data, errors, warnings) {
    if (data.kafka) {
      const kafka = data.kafka;
      
      if (kafka.brokers && !Array.isArray(kafka.brokers)) {
        errors.push('Kafka brokers must be an array');
      }
      
      if (kafka.topics && !Array.isArray(kafka.topics)) {
        errors.push('Kafka topics must be an array');
      }
      
      // Validate broker structure
      if (kafka.brokers) {
        kafka.brokers.forEach((broker, index) => {
          if (!broker.brokerId && broker.brokerId !== 0) {
            errors.push(`Kafka broker[${index}] missing brokerId`);
          }
        });
      }
    }
    
    if (data.jmx && !data.jmx.mbeans && !Array.isArray(data.jmx)) {
      warnings.push('JMX data should contain mbeans array or be an array itself');
    }
  }
  
  /**
   * Validate RabbitMQ-specific data
   * @private
   */
  _validateRabbitMQData(data, errors, warnings) {
    if (data.rabbitmq) {
      const rmq = data.rabbitmq;
      
      if (rmq.nodes && !Array.isArray(rmq.nodes)) {
        errors.push('RabbitMQ nodes must be an array');
      }
      
      if (rmq.queues && !Array.isArray(rmq.queues)) {
        errors.push('RabbitMQ queues must be an array');
      }
      
      if (rmq.vhosts && !Array.isArray(rmq.vhosts)) {
        errors.push('RabbitMQ vhosts must be an array');
      }
      
      // Validate queue structure
      if (rmq.queues) {
        rmq.queues.forEach((queue, index) => {
          if (!queue.name) {
            errors.push(`RabbitMQ queue[${index}] missing name`);
          }
          if (!queue.vhost) {
            warnings.push(`RabbitMQ queue[${index}] missing vhost, will use default '/'`);
          }
        });
      }
    }
  }
  
  /**
   * Check if GUID is valid format
   * @private
   */
  _isValidGuid(guid) {
    // New Relic GUID format: ACCOUNT_ID|DOMAIN|TYPE|IDENTIFIER
    // Updated to accept INFRA domain and MESSAGE_QUEUE_* types
    const guidPattern = /^[A-Za-z0-9]+\|(INFRA|MQ|[A-Z]+)\|(MESSAGE_QUEUE_[A-Z_]+|[A-Z_]+)\|[A-Za-z0-9\-._]+$/;
    return guidPattern.test(guid);
  }
  
  /**
   * Create validation report
   * @param {Object} validationResult - Validation result
   * @returns {string} Formatted report
   */
  createReport(validationResult) {
    let report = '=== SHIM Validation Report ===\n\n';
    
    report += `Status: ${validationResult.valid ? 'PASSED' : 'FAILED'}\n`;
    report += `Timestamp: ${new Date().toISOString()}\n\n`;
    
    if (validationResult.stats) {
      report += 'Statistics:\n';
      report += `  Entities: ${validationResult.stats.entities}\n`;
      report += `  Metrics: ${validationResult.stats.metrics}\n`;
      report += `  Relationships: ${validationResult.stats.relationships}\n\n`;
    }
    
    if (validationResult.errors.length > 0) {
      report += `Errors (${validationResult.errors.length}):\n`;
      validationResult.errors.forEach((error, index) => {
        report += `  ${index + 1}. ${error}\n`;
      });
      report += '\n';
    }
    
    if (validationResult.warnings.length > 0) {
      report += `Warnings (${validationResult.warnings.length}):\n`;
      validationResult.warnings.forEach((warning, index) => {
        report += `  ${index + 1}. ${warning}\n`;
      });
      report += '\n';
    }
    
    report += '=== End of Report ===\n';
    
    return report;
  }
}

module.exports = ShimValidator;