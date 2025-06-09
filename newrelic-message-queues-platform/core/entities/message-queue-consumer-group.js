const BaseEntity = require('./base-entity');

/**
 * MESSAGE_QUEUE_CONSUMER_GROUP entity
 * Represents a consumer group in a message queue system
 */
class MessageQueueConsumerGroup extends BaseEntity {
  static ENTITY_TYPE = 'MESSAGE_QUEUE_CONSUMER_GROUP';

  constructor(data = {}) {
    super({
      ...data,
      entityType: MessageQueueConsumerGroup.ENTITY_TYPE
    });
    
    // Core attributes
    this.provider = data.provider || 'kafka';
    this.consumerGroupId = data.consumerGroupId || data.groupId;
    this.clusterName = data.clusterName;
    
    // Consumer group specific attributes
    this.state = data.state || 'STABLE'; // STABLE, REBALANCING, DEAD, EMPTY
    this.protocol = data.protocol || 'consumer';
    this.protocolType = data.protocolType || 'consumer';
    this.coordinator = data.coordinator || {};
    
    // Members and partitions
    this.memberCount = data.memberCount || 0;
    this.activeMembers = data.activeMembers || [];
    this.partitionAssignment = data.partitionAssignment || {};
    this.topics = data.topics || [];
    
    // Lag metrics
    this.totalLag = data.totalLag || 0;
    this.maxLag = data.maxLag || 0;
    this.avgLag = data.avgLag || 0;
    
    // Initialize base entity properties
    this._initializeEntity();
  }

  _initializeEntity() {
    // Set display name
    this.displayName = `${this.consumerGroupId} (${this.clusterName})`;
    
    // Build entity name following New Relic conventions
    this.entityName = `${this.provider}:consumer-group:${this.consumerGroupId}`;
    
    // Set entity GUID - must follow exact format for synthesis
    this.entityGuid = this._generateGuid();
    
    // Initialize metrics
    this._initializeMetrics();
    
    // Initialize tags
    this._initializeTags();
    
    // Set relationships
    this._initializeRelationships();
  }

  _generateGuid() {
    // Format: MESSAGE_QUEUE_CONSUMER_GROUP|accountId|provider|cluster|consumerGroupId
    const parts = [
      this.entityType,
      this.accountId,
      this.provider,
      this.clusterName,
      this.consumerGroupId
    ].filter(Boolean);
    
    return parts.join('|');
  }

  _initializeMetrics() {
    this.metrics = {
      // Lag metrics
      'consumerGroup.totalLag': this.totalLag,
      'consumerGroup.maxLag': this.maxLag,
      'consumerGroup.avgLag': this.avgLag,
      'consumerGroup.lagPerPartition': this.partitionAssignment,
      
      // Member metrics
      'consumerGroup.memberCount': this.memberCount,
      'consumerGroup.activeMembers': this.activeMembers.length,
      'consumerGroup.rebalanceRate': this.rebalanceRate || 0,
      
      // Consumption metrics
      'consumerGroup.messagesConsumedPerSecond': this.messagesConsumedPerSecond || 0,
      'consumerGroup.bytesConsumedPerSecond': this.bytesConsumedPerSecond || 0,
      'consumerGroup.recordsPerPoll': this.recordsPerPoll || 0,
      
      // Offset metrics
      'consumerGroup.committedOffset': this.committedOffset || 0,
      'consumerGroup.currentOffset': this.currentOffset || 0,
      'consumerGroup.offsetCommitRate': this.offsetCommitRate || 0,
      
      // Performance metrics
      'consumerGroup.processingTimeMs': this.processingTimeMs || 0,
      'consumerGroup.pollIntervalMs': this.pollIntervalMs || 0,
      
      // State metrics
      'consumerGroup.isStable': this.state === 'STABLE' ? 1 : 0,
      'consumerGroup.isRebalancing': this.state === 'REBALANCING' ? 1 : 0,
      'consumerGroup.isDead': this.state === 'DEAD' ? 1 : 0
    };
  }

  _initializeTags() {
    this.tags = {
      'consumerGroup.id': this.consumerGroupId,
      'consumerGroup.state': this.state,
      'consumerGroup.protocol': this.protocol,
      'consumerGroup.protocolType': this.protocolType,
      'cluster.name': this.clusterName,
      'provider': this.provider,
      'consumerGroup.topics': this.topics.join(','),
      'consumerGroup.coordinator.id': this.coordinator.id || 'unknown',
      'consumerGroup.coordinator.host': this.coordinator.host || 'unknown'
    };
    
    // Add custom tags
    if (this.customTags) {
      Object.assign(this.tags, this.customTags);
    }
  }

  _initializeRelationships() {
    this.relationships = [];
    
    // Relationship to cluster
    if (this.clusterName) {
      this.relationships.push({
        type: 'BELONGS_TO',
        targetEntityGuid: `MESSAGE_QUEUE_CLUSTER|${this.accountId}|${this.provider}|${this.clusterName}`
      });
    }
    
    // Relationships to topics
    this.topics.forEach(topic => {
      this.relationships.push({
        type: 'CONSUMES_FROM',
        targetEntityGuid: `MESSAGE_QUEUE_TOPIC|${this.accountId}|${this.provider}|${this.clusterName}|${topic}`
      });
    });
    
    // Relationship to coordinator broker
    if (this.coordinator.id) {
      this.relationships.push({
        type: 'COORDINATED_BY',
        targetEntityGuid: `MESSAGE_QUEUE_BROKER|${this.accountId}|${this.provider}|${this.clusterName}|${this.coordinator.id}`
      });
    }
  }

  /**
   * Update lag metrics
   */
  updateLagMetrics(lagData) {
    this.totalLag = lagData.totalLag || 0;
    this.maxLag = lagData.maxLag || 0;
    this.avgLag = lagData.avgLag || 0;
    this.partitionAssignment = lagData.partitionAssignment || {};
    
    // Update metrics
    this.metrics['consumerGroup.totalLag'] = this.totalLag;
    this.metrics['consumerGroup.maxLag'] = this.maxLag;
    this.metrics['consumerGroup.avgLag'] = this.avgLag;
    this.metrics['consumerGroup.lagPerPartition'] = this.partitionAssignment;
  }

  /**
   * Update consumer group state
   */
  updateState(newState) {
    const validStates = ['STABLE', 'REBALANCING', 'DEAD', 'EMPTY'];
    if (validStates.includes(newState)) {
      this.state = newState;
      this.tags['consumerGroup.state'] = newState;
      
      // Update state metrics
      this.metrics['consumerGroup.isStable'] = newState === 'STABLE' ? 1 : 0;
      this.metrics['consumerGroup.isRebalancing'] = newState === 'REBALANCING' ? 1 : 0;
      this.metrics['consumerGroup.isDead'] = newState === 'DEAD' ? 1 : 0;
    }
  }

  /**
   * Add or update member
   */
  updateMembers(members) {
    this.activeMembers = members;
    this.memberCount = members.length;
    
    this.metrics['consumerGroup.memberCount'] = this.memberCount;
    this.metrics['consumerGroup.activeMembers'] = this.activeMembers.length;
  }

  /**
   * Get lag summary
   */
  getLagSummary() {
    return {
      total: this.totalLag,
      max: this.maxLag,
      average: this.avgLag,
      byPartition: this.partitionAssignment,
      isHealthy: this.maxLag < (this.lagThreshold || 10000)
    };
  }

  /**
   * Check if consumer group is healthy
   */
  isHealthy() {
    return this.state === 'STABLE' && 
           this.memberCount > 0 && 
           this.maxLag < (this.lagThreshold || 10000);
  }

  /**
   * Convert to New Relic event format
   */
  toEvent() {
    return {
      eventType: 'MessageQueue',
      entityGuid: this.entityGuid,
      entityType: this.entityType,
      entityName: this.entityName,
      displayName: this.displayName,
      provider: this.provider,
      consumerGroupId: this.consumerGroupId,
      clusterName: this.clusterName,
      state: this.state,
      memberCount: this.memberCount,
      topicCount: this.topics.length,
      ...this.metrics,
      ...this.tags,
      timestamp: Date.now()
    };
  }

  /**
   * Convert to metric format
   */
  toMetrics() {
    const metrics = [];
    const baseMetric = {
      name: 'message_queue_consumer_group',
      type: 'gauge',
      value: 1,
      attributes: {
        entity_guid: this.entityGuid,
        entity_type: this.entityType,
        consumer_group_id: this.consumerGroupId,
        cluster_name: this.clusterName,
        provider: this.provider,
        state: this.state
      }
    };
    
    // Add metric for each numeric value
    Object.entries(this.metrics).forEach(([key, value]) => {
      if (typeof value === 'number') {
        metrics.push({
          ...baseMetric,
          name: key.replace(/\./g, '_'),
          value: value,
          timestamp: Date.now()
        });
      }
    });
    
    return metrics;
  }
}

module.exports = MessageQueueConsumerGroup;