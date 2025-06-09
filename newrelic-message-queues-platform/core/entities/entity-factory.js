/**
 * Entity Factory
 * 
 * Factory for creating MESSAGE_QUEUE_* entities with provider-specific configurations
 * and proper relationship management.
 */

const MessageQueueCluster = require('./message-queue-cluster');
const MessageQueueBroker = require('./message-queue-broker');
const MessageQueueTopic = require('./message-queue-topic');
const MessageQueueQueue = require('./message-queue-queue');
const MessageQueueConsumerGroup = require('./message-queue-consumer-group');

class EntityFactory {
  constructor() {
    this.entityRegistry = new Map();
    // Simple relationship tracking (can be expanded later)
    this.relationshipManager = {
      relationships: new Map(),
      addRelationship: (sourceGuid, targetGuid, type) => {
        if (!this.relationshipManager.relationships.has(sourceGuid)) {
          this.relationshipManager.relationships.set(sourceGuid, []);
        }
        this.relationshipManager.relationships.get(sourceGuid).push({ targetGuid, type });
      },
      getRelationships: (guid) => this.relationshipManager.relationships.get(guid) || []
    };
  }

  /**
   * Create a MESSAGE_QUEUE_CLUSTER entity
   */
  createCluster(config) {
    // Validate required fields
    if (!config || typeof config !== 'object') {
      throw new Error('Configuration object is required');
    }
    if (!config.name) {
      throw new Error('Cluster name is required');
    }
    if (!config.provider) {
      throw new Error('Provider is required');
    }
    if (!config.accountId && !process.env.NEW_RELIC_ACCOUNT_ID) {
      throw new Error('Account ID is required');
    }
    
    const cluster = new MessageQueueCluster(config);
    this.entityRegistry.set(cluster.guid, cluster);
    return cluster;
  }

  /**
   * Create a MESSAGE_QUEUE_BROKER entity
   */
  createBroker(config) {
    const broker = new MessageQueueBroker(config);
    this.entityRegistry.set(broker.guid, broker);
    
    // Auto-link to cluster if specified
    if (config.clusterGuid) {
      const cluster = this.entityRegistry.get(config.clusterGuid);
      if (cluster) {
        cluster.addBroker(broker.guid);
        broker.setCluster(cluster.guid);
      }
    }
    
    return broker;
  }

  /**
   * Create a MESSAGE_QUEUE_TOPIC entity
   */
  createTopic(config) {
    const topic = new MessageQueueTopic(config);
    this.entityRegistry.set(topic.guid, topic);
    
    // Auto-link to cluster if specified
    if (config.clusterGuid) {
      const cluster = this.entityRegistry.get(config.clusterGuid);
      if (cluster) {
        cluster.addTopic(topic.guid);
        topic.setCluster(cluster.guid);
      }
    }
    
    return topic;
  }

  /**
   * Create a MESSAGE_QUEUE_QUEUE entity
   */
  createQueue(config) {
    const queue = new MessageQueueQueue(config);
    this.entityRegistry.set(queue.guid, queue);
    
    // Auto-link to parent if specified
    if (config.parentGuid && config.parentType) {
      queue.setParent(config.parentGuid, config.parentType);
    }
    
    return queue;
  }

  /**
   * Create a MESSAGE_QUEUE_CONSUMER_GROUP entity
   */
  createConsumerGroup(config) {
    // Validate required fields
    if (!config || typeof config !== 'object') {
      throw new Error('Configuration object is required');
    }
    if (!config.consumerGroupId && !config.groupId) {
      throw new Error('Consumer group ID is required');
    }
    if (!config.clusterName) {
      throw new Error('Cluster name is required');
    }
    
    const consumerGroup = new MessageQueueConsumerGroup(config);
    this.entityRegistry.set(consumerGroup.entityGuid, consumerGroup);
    
    // Auto-link to cluster if specified
    if (config.clusterGuid || config.clusterName) {
      const clusterGuid = config.clusterGuid || 
        `MESSAGE_QUEUE_CLUSTER|${config.accountId}|${config.provider || 'kafka'}|${config.clusterName}`;
      const cluster = this.entityRegistry.get(clusterGuid);
      if (cluster && cluster.addConsumerGroup) {
        cluster.addConsumerGroup(consumerGroup.entityGuid);
      }
    }
    
    return consumerGroup;
  }

  /**
   * Create entities from topology configuration
   */
  createTopology(topologyConfig) {
    const entities = {
      clusters: [],
      brokers: [],
      topics: [],
      queues: [],
      consumerGroups: []
    };

    // Create clusters first
    if (topologyConfig.clusters) {
      topologyConfig.clusters.forEach(clusterConfig => {
        const cluster = this.createCluster(clusterConfig);
        entities.clusters.push(cluster);
      });
    }

    // Create brokers and link to clusters
    if (topologyConfig.brokers) {
      topologyConfig.brokers.forEach(brokerConfig => {
        const broker = this.createBroker(brokerConfig);
        entities.brokers.push(broker);
      });
    }

    // Create topics and link to clusters
    if (topologyConfig.topics) {
      topologyConfig.topics.forEach(topicConfig => {
        const topic = this.createTopic(topicConfig);
        entities.topics.push(topic);
      });
    }

    // Create queues
    if (topologyConfig.queues) {
      topologyConfig.queues.forEach(queueConfig => {
        const queue = this.createQueue(queueConfig);
        entities.queues.push(queue);
      });
    }

    // Create consumer groups
    if (topologyConfig.consumerGroups) {
      topologyConfig.consumerGroups.forEach(consumerGroupConfig => {
        const consumerGroup = this.createConsumerGroup(consumerGroupConfig);
        entities.consumerGroups.push(consumerGroup);
      });
    }

    return entities;
  }

  /**
   * Get entity by GUID
   */
  getEntity(guid) {
    return this.entityRegistry.get(guid);
  }

  /**
   * Get all entities of a specific type
   */
  getEntitiesByType(entityType) {
    return Array.from(this.entityRegistry.values())
      .filter(entity => entity.entityType === entityType);
  }

  /**
   * Get all entities for a provider
   */
  getEntitiesByProvider(provider) {
    return Array.from(this.entityRegistry.values())
      .filter(entity => entity.provider === provider);
  }

  /**
   * Get entity hierarchy for a cluster
   */
  getClusterHierarchy(clusterGuid) {
    const cluster = this.entityRegistry.get(clusterGuid);
    if (!cluster) return null;

    const brokers = this.getEntitiesByType('MESSAGE_QUEUE_BROKER')
      .filter(broker => broker.clusterName === cluster.clusterName);
    
    const topics = this.getEntitiesByType('MESSAGE_QUEUE_TOPIC')
      .filter(topic => topic.clusterName === cluster.clusterName);
    
    const queues = this.getEntitiesByType('MESSAGE_QUEUE_QUEUE')
      .filter(queue => queue.metadata.clusterName === cluster.clusterName);

    return {
      cluster,
      brokers,
      topics,
      queues,
      relationships: [] // this.relationshipManager.getClusterRelationships(clusterGuid)
    };
  }

  /**
   * Validate all entities
   */
  validateAll() {
    const validationResults = [];
    
    for (const [guid, entity] of this.entityRegistry.entries()) {
      const errors = entity.validate();
      if (errors.length > 0) {
        validationResults.push({
          guid,
          entityType: entity.entityType,
          name: entity.name,
          errors
        });
      }
    }
    
    return validationResults;
  }

  /**
   * Get entities summary
   */
  getSummary() {
    const summary = {
      totalEntities: this.entityRegistry.size,
      byType: {},
      byProvider: {},
      healthyEntities: 0,
      totalRelationships: 0
    };

    for (const entity of this.entityRegistry.values()) {
      // Count by type
      summary.byType[entity.entityType] = (summary.byType[entity.entityType] || 0) + 1;
      
      // Count by provider
      summary.byProvider[entity.provider] = (summary.byProvider[entity.provider] || 0) + 1;
      
      // Count healthy entities
      if (entity.isHealthy()) {
        summary.healthyEntities++;
      }
      
      // Count relationships
      summary.totalRelationships += entity.relationships.length;
    }

    summary.healthPercentage = summary.totalEntities > 0 
      ? (summary.healthyEntities / summary.totalEntities * 100).toFixed(1)
      : '100.0';

    return summary;
  }

  /**
   * Export entities to JSON
   */
  exportEntities() {
    const entities = {};
    for (const [guid, entity] of this.entityRegistry.entries()) {
      entities[guid] = entity.toEntityMetadata();
    }
    return entities;
  }

  /**
   * Clear all entities
   */
  clear() {
    this.entityRegistry.clear();
    // this.relationshipManager.clear();
  }
}

/**
 * Relationship Manager
 * 
 * Manages bidirectional relationships between entities
 */
class RelationshipManager {
  constructor() {
    this.relationships = new Map();
  }

  /**
   * Add bidirectional relationship
   */
  addRelationship(sourceGuid, targetGuid, relationshipType, metadata = {}) {
    if (!this.relationships.has(sourceGuid)) {
      this.relationships.set(sourceGuid, []);
    }
    if (!this.relationships.has(targetGuid)) {
      this.relationships.set(targetGuid, []);
    }

    // Add forward relationship
    this.relationships.get(sourceGuid).push({
      targetGuid,
      type: relationshipType,
      direction: 'outgoing',
      metadata
    });

    // Add reverse relationship
    const reverseType = this.getReverseRelationshipType(relationshipType);
    this.relationships.get(targetGuid).push({
      targetGuid: sourceGuid,
      type: reverseType,
      direction: 'incoming',
      metadata
    });
  }

  /**
   * Get reverse relationship type
   */
  getReverseRelationshipType(relationshipType) {
    const reverseMap = {
      'CONTAINS': 'CONTAINED_IN',
      'CONTAINED_IN': 'CONTAINS',
      'MANAGES': 'MANAGED_BY',
      'MANAGED_BY': 'MANAGES',
      'HOSTS': 'HOSTED_ON',
      'HOSTED_ON': 'HOSTS',
      'PROCESSES': 'PROCESSED_BY',
      'PROCESSED_BY': 'PROCESSES'
    };
    
    return reverseMap[relationshipType] || relationshipType;
  }

  /**
   * Get relationships for an entity
   */
  getRelationships(entityGuid) {
    return this.relationships.get(entityGuid) || [];
  }

  /**
   * Get cluster relationships
   */
  getClusterRelationships(clusterGuid) {
    const relationships = this.getRelationships(clusterGuid);
    return {
      brokers: relationships.filter(r => r.metadata.entityType === 'MESSAGE_QUEUE_BROKER'),
      topics: relationships.filter(r => r.metadata.entityType === 'MESSAGE_QUEUE_TOPIC'),
      queues: relationships.filter(r => r.metadata.entityType === 'MESSAGE_QUEUE_QUEUE')
    };
  }

  /**
   * Clear all relationships
   */
  clear() {
    this.relationships.clear();
  }
}

module.exports = EntityFactory;