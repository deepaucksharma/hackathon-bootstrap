/**
 * Base Provider Hook Interface
 * 
 * Defines the contract for provider-specific data transformations
 * and entity enhancements. Hooks allow pluggable provider-specific
 * logic while maintaining compatibility with the MESSAGE_QUEUE entity framework.
 */

class BaseProviderHook {
  constructor(config = {}) {
    this.config = config;
    this.providerType = config.providerType || 'generic';
    this.enabled = config.enabled !== false;
    this.features = config.features || {};
  }

  /**
   * Get the provider type this hook handles
   * @returns {string} Provider type identifier
   */
  getProviderType() {
    return this.providerType;
  }

  /**
   * Check if the hook is enabled
   * @returns {boolean} True if hook is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Check if a specific feature is enabled
   * @param {string} feature - Feature name
   * @returns {boolean} True if feature is enabled
   */
  isFeatureEnabled(feature) {
    return this.features[feature] === true;
  }

  /**
   * Transform broker data before entity creation
   * @param {Object} brokerData - Raw broker data
   * @param {Object} context - Additional context
   * @returns {Object} Transformed broker data
   */
  transformBrokerData(brokerData, context = {}) {
    // Default implementation - no transformation
    return brokerData;
  }

  /**
   * Transform topic data before entity creation
   * @param {Object} topicData - Raw topic data
   * @param {Object} context - Additional context
   * @returns {Object} Transformed topic data
   */
  transformTopicData(topicData, context = {}) {
    // Default implementation - no transformation
    return topicData;
  }

  /**
   * Transform consumer group data before entity creation
   * @param {Object} consumerGroupData - Raw consumer group data
   * @param {Object} context - Additional context
   * @returns {Object} Transformed consumer group data
   */
  transformConsumerGroupData(consumerGroupData, context = {}) {
    // Default implementation - no transformation
    return consumerGroupData;
  }

  /**
   * Transform cluster data before entity creation
   * @param {Object} clusterData - Raw cluster data
   * @param {Object} context - Additional context
   * @returns {Object} Transformed cluster data
   */
  transformClusterData(clusterData, context = {}) {
    // Default implementation - no transformation
    return clusterData;
  }

  /**
   * Generate provider-specific entity GUID
   * @param {string} entityType - Entity type (MESSAGE_QUEUE_BROKER, etc.)
   * @param {Object} entityData - Entity data
   * @param {Object} context - Additional context
   * @returns {string} Generated GUID
   */
  generateEntityGuid(entityType, entityData, context = {}) {
    // Default GUID format: {entityType}|{accountId}|{provider}|{identifiers}
    const accountId = context.accountId || 'unknown';
    const provider = this.providerType;
    const identifiers = this._extractIdentifiers(entityType, entityData);
    
    return `${entityType}|${accountId}|${provider}|${identifiers}`;
  }

  /**
   * Generate provider-specific entity name
   * @param {string} entityType - Entity type
   * @param {Object} entityData - Entity data
   * @param {Object} context - Additional context
   * @returns {string} Generated entity name
   */
  generateEntityName(entityType, entityData, context = {}) {
    // Default naming convention
    switch (entityType) {
      case 'MESSAGE_QUEUE_BROKER':
        return `${this.providerType}-broker-${entityData.brokerId || entityData.id}`;
      case 'MESSAGE_QUEUE_TOPIC':
        return `${this.providerType}-topic-${entityData.topicName || entityData.name}`;
      case 'MESSAGE_QUEUE_CLUSTER':
        return `${this.providerType}-cluster-${entityData.clusterName || entityData.name}`;
      case 'MESSAGE_QUEUE_CONSUMER_GROUP':
        return `${this.providerType}-consumer-group-${entityData.consumerGroup || entityData.name}`;
      default:
        return `${this.providerType}-${entityType.toLowerCase()}`;
    }
  }

  /**
   * Aggregate metrics at cluster level
   * @param {Array} entities - Entities to aggregate
   * @param {string} metricType - Type of metric to aggregate
   * @returns {Object} Aggregated metrics
   */
  aggregateClusterMetrics(entities, metricType) {
    const aggregated = {};
    
    entities.forEach(entity => {
      if (entity.metrics && entity.metrics[metricType]) {
        Object.keys(entity.metrics[metricType]).forEach(metric => {
          if (!aggregated[metric]) {
            aggregated[metric] = 0;
          }
          aggregated[metric] += entity.metrics[metricType][metric] || 0;
        });
      }
    });
    
    return aggregated;
  }

  /**
   * Post-process entity after creation
   * @param {Object} entity - Created entity
   * @param {Object} context - Additional context
   * @returns {Object} Post-processed entity
   */
  postProcessEntity(entity, context = {}) {
    // Default implementation - add provider metadata
    if (!entity.metadata) {
      entity.metadata = {};
    }
    
    entity.metadata.providerType = this.providerType;
    entity.metadata.hookVersion = '1.0.0';
    entity.metadata.processedAt = new Date().toISOString();
    
    return entity;
  }

  /**
   * Validate entity data before processing
   * @param {string} entityType - Entity type
   * @param {Object} entityData - Entity data to validate
   * @returns {boolean} True if valid
   */
  validateEntityData(entityType, entityData) {
    // Basic validation - override in specific hooks
    return entityData && typeof entityData === 'object';
  }

  /**
   * Handle hook errors with fallback behavior
   * @param {Error} error - Error that occurred
   * @param {string} operation - Operation that failed
   * @param {Object} data - Data being processed
   * @returns {Object} Fallback result or null
   */
  handleError(error, operation, data) {
    console.error(`Provider hook error in ${operation}:`, error.message);
    
    // Return original data as fallback
    return data;
  }

  /**
   * Extract identifiers for GUID generation
   * @private
   * @param {string} entityType - Entity type
   * @param {Object} entityData - Entity data
   * @returns {string} Identifier string
   */
  _extractIdentifiers(entityType, entityData) {
    switch (entityType) {
      case 'MESSAGE_QUEUE_BROKER':
        return `broker-${entityData.brokerId || entityData.id}`;
      case 'MESSAGE_QUEUE_TOPIC':
        return `topic-${entityData.topicName || entityData.name}`;
      case 'MESSAGE_QUEUE_CLUSTER':
        return `cluster-${entityData.clusterName || entityData.name}`;
      case 'MESSAGE_QUEUE_CONSUMER_GROUP':
        return `consumer-group-${entityData.consumerGroup || entityData.name}`;
      default:
        return `unknown-${Date.now()}`;
    }
  }
}

module.exports = BaseProviderHook;