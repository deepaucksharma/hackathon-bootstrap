/**
 * MESSAGE_QUEUE_TOPIC Entity
 * 
 * Represents a message queue topic with throughput, consumer lag, and error metrics.
 * Based on docs/README.md specification.
 */

const BaseEntity = require('./base-entity');

class MessageQueueTopic extends BaseEntity {
  static ENTITY_TYPE = 'MESSAGE_QUEUE_TOPIC';

  constructor(config = {}) {
    super({
      ...config,
      entityType: MessageQueueTopic.ENTITY_TYPE
    });

    // Topic-specific properties
    this.topic = config.topic || config.name;
    this.clusterName = config.clusterName;
    
    // Regenerate GUID now that topic is set
    this.guid = this.generateGUID();
    this.partitionCount = config.partitionCount || 1;
    this.replicationFactor = config.replicationFactor || 1;
    this.retentionMs = config.retentionMs;
    this.segmentMs = config.segmentMs;
    this.cleanupPolicy = config.cleanupPolicy || 'delete';
    this.compressionType = config.compressionType || 'none';
    
    // Update metadata with topic-specific info
    this.updateMetadata('topic', this.topic);
    this.updateMetadata('clusterName', this.clusterName);
    this.updateMetadata('partitionCount', this.partitionCount);
    this.updateMetadata('replicationFactor', this.replicationFactor);
    this.updateMetadata('cleanupPolicy', this.cleanupPolicy);
  }

  /**
   * Generate composite key for GUID
   */
  generateCompositeKey() {
    return `${this.clusterName}:${this.topic}`;
  }

  /**
   * Initialize golden metrics for topic
   */
  initializeGoldenMetrics() {
    return [
      {
        name: 'topic.throughput.in',
        value: 0,
        unit: 'messages/second',
        timestamp: new Date().toISOString()
      },
      {
        name: 'topic.throughput.out',
        value: 0,
        unit: 'messages/second',
        timestamp: new Date().toISOString()
      },
      {
        name: 'topic.consumer.lag',
        value: 0,
        unit: 'messages',
        timestamp: new Date().toISOString()
      },
      {
        name: 'topic.error.rate',
        value: 0.0,
        unit: 'percentage',
        timestamp: new Date().toISOString()
      }
    ];
  }

  /**
   * Update input throughput
   */
  updateThroughputIn(messagesPerSecond) {
    this.updateGoldenMetric('topic.throughput.in', messagesPerSecond, 'messages/second');
  }

  /**
   * Update output throughput
   */
  updateThroughputOut(messagesPerSecond) {
    this.updateGoldenMetric('topic.throughput.out', messagesPerSecond, 'messages/second');
  }

  /**
   * Update consumer lag
   */
  updateConsumerLag(lagMessages) {
    this.updateGoldenMetric('topic.consumer.lag', lagMessages, 'messages');
  }

  /**
   * Update error rate
   */
  updateErrorRate(errorRate) {
    this.updateGoldenMetric('topic.error.rate', errorRate, 'percentage');
  }

  /**
   * Update messages in per second
   */
  updateMessagesIn(messagesPerSecond) {
    this.updateThroughputIn(messagesPerSecond);
  }

  /**
   * Update messages out per second
   */
  updateMessagesOut(messagesPerSecond) {
    this.updateThroughputOut(messagesPerSecond);
  }

  /**
   * Update bytes in per second
   */
  updateBytesIn(bytesPerSecond) {
    this.updateMetadata('bytesInPerSecond', bytesPerSecond);
  }

  /**
   * Update bytes out per second
   */
  updateBytesOut(bytesPerSecond) {
    this.updateMetadata('bytesOutPerSecond', bytesPerSecond);
  }

  /**
   * Add relationship to cluster
   */
  setCluster(clusterGuid) {
    this.addRelationship('CONTAINED_IN', clusterGuid, { 
      entityType: 'MESSAGE_QUEUE_CLUSTER',
      relationshipType: 'cluster'
    });
  }

  /**
   * Add partition for this topic
   */
  addPartition(partitionId, leaderBrokerGuid, replicaBrokerGuids = []) {
    const partitionGuid = `${this.guid}:partition:${partitionId}`;
    
    this.addRelationship('PARTITIONED_INTO', partitionGuid, { 
      entityType: 'PARTITION',
      partitionId: partitionId,
      leader: leaderBrokerGuid,
      replicas: replicaBrokerGuids,
      relationshipType: 'partitions'
    });
  }

  /**
   * Add consumer group for this topic
   */
  addConsumerGroup(consumerGroupGuid, consumerGroupId) {
    this.addRelationship('CONSUMED_FROM', consumerGroupGuid, { 
      entityType: 'CONSUMER_GROUP',
      consumerGroupId: consumerGroupId,
      relationshipType: 'consumers'
    });
  }

  /**
   * Check if topic is healthy
   */
  isHealthy() {
    const consumerLag = this.goldenMetrics.find(m => m.name === 'topic.consumer.lag')?.value || 0;
    const errorRate = this.goldenMetrics.find(m => m.name === 'topic.error.rate')?.value || 0;
    const throughputIn = this.goldenMetrics.find(m => m.name === 'topic.throughput.in')?.value || 0;
    const throughputOut = this.goldenMetrics.find(m => m.name === 'topic.throughput.out')?.value || 0;
    
    // Topic is unhealthy if:
    // - High consumer lag (>10000 messages)
    // - High error rate (>5%)
    // - Input/output throughput imbalance (>50% difference)
    const highLag = consumerLag > 10000;
    const highErrorRate = errorRate > 5;
    const throughputImbalance = throughputIn > 0 && 
      Math.abs(throughputIn - throughputOut) / throughputIn > 0.5;
    
    return !highLag && !highErrorRate && !throughputImbalance;
  }

  /**
   * Get topic status
   */
  getStatus() {
    const consumerLag = this.goldenMetrics.find(m => m.name === 'topic.consumer.lag')?.value || 0;
    const errorRate = this.goldenMetrics.find(m => m.name === 'topic.error.rate')?.value || 0;
    
    if (consumerLag > 50000 || errorRate > 10) {
      return 'CRITICAL';
    }
    
    if (consumerLag > 10000 || errorRate > 5) {
      return 'WARNING';
    }
    
    return 'HEALTHY';
  }

  /**
   * Calculate topic efficiency score
   */
  calculateEfficiencyScore() {
    const throughputIn = this.goldenMetrics.find(m => m.name === 'topic.throughput.in')?.value || 0;
    const throughputOut = this.goldenMetrics.find(m => m.name === 'topic.throughput.out')?.value || 0;
    const errorRate = this.goldenMetrics.find(m => m.name === 'topic.error.rate')?.value || 0;
    
    if (throughputIn === 0) return 100; // No data, assume perfect
    
    const throughputEfficiency = Math.min(100, (throughputOut / throughputIn) * 100);
    const errorImpact = Math.max(0, 100 - (errorRate * 10));
    
    return (throughputEfficiency * 0.7) + (errorImpact * 0.3);
  }

  /**
   * Get partition distribution info
   */
  getPartitionDistribution() {
    const partitionRelationships = this.relationships.filter(r => 
      r.type === 'PARTITIONED_INTO' && r.metadata.entityType === 'PARTITION'
    );
    
    const leaderDistribution = {};
    partitionRelationships.forEach(rel => {
      const leader = rel.metadata.leader;
      leaderDistribution[leader] = (leaderDistribution[leader] || 0) + 1;
    });
    
    return {
      totalPartitions: partitionRelationships.length,
      leaderDistribution: leaderDistribution,
      isBalanced: Object.values(leaderDistribution).every(count => 
        Math.abs(count - partitionRelationships.length / Object.keys(leaderDistribution).length) <= 1
      )
    };
  }

  /**
   * Generate provider-specific event payload
   */
  toEventPayload() {
    const basePayload = super.toEventPayload();
    const partitionDistribution = this.getPartitionDistribution();
    
    return {
      ...basePayload,
      topic: this.topic,
      clusterName: this.clusterName,
      partitionCount: this.partitionCount,
      replicationFactor: this.replicationFactor,
      cleanupPolicy: this.cleanupPolicy,
      compressionType: this.compressionType,
      status: this.getStatus(),
      efficiencyScore: this.calculateEfficiencyScore(),
      partitionsBalanced: partitionDistribution.isBalanced,
      
      // Provider-specific fields
      ...(this.provider === 'kafka' && {
        'kafka.topic.name': this.topic,
        'kafka.partition.count': this.partitionCount,
        'kafka.replication.factor': this.replicationFactor,
        'kafka.retention.ms': this.retentionMs,
        'kafka.segment.ms': this.segmentMs
      }),
      
      ...(this.provider === 'rabbitmq' && {
        'rabbitmq.queue.name': this.topic,
        'rabbitmq.queue.durable': this.metadata.durable || true,
        'rabbitmq.queue.exclusive': this.metadata.exclusive || false,
        'rabbitmq.queue.auto.delete': this.metadata.autoDelete || false
      }),
      
      ...(this.provider === 'sqs' && {
        'sqs.queue.url': this.metadata.queueUrl,
        'sqs.queue.arn': this.metadata.queueArn,
        'sqs.visibility.timeout': this.metadata.visibilityTimeout,
        'sqs.message.retention.period': this.retentionMs
      })
    };
  }

  /**
   * Validate topic-specific requirements
   */
  validate() {
    const errors = super.validate();
    
    if (!this.topic) {
      errors.push('topic name is required');
    }
    
    if (!this.clusterName) {
      errors.push('clusterName is required');
    }
    
    if (this.partitionCount < 1) {
      errors.push('partitionCount must be at least 1');
    }
    
    if (this.replicationFactor < 1) {
      errors.push('replicationFactor must be at least 1');
    }
    
    // Topic naming validation based on provider
    if (this.provider === 'kafka' && this.topic) {
      if (this.topic.length > 255) {
        errors.push('Kafka topic name must be 255 characters or less');
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(this.topic)) {
        errors.push('Kafka topic name contains invalid characters');
      }
    }
    
    return errors;
  }

  /**
   * Get topic summary with performance metrics
   */
  getSummary() {
    const baseSummary = super.getSummary();
    const throughputIn = this.goldenMetrics.find(m => m.name === 'topic.throughput.in')?.value || 0;
    const throughputOut = this.goldenMetrics.find(m => m.name === 'topic.throughput.out')?.value || 0;
    const consumerLag = this.goldenMetrics.find(m => m.name === 'topic.consumer.lag')?.value || 0;
    const errorRate = this.goldenMetrics.find(m => m.name === 'topic.error.rate')?.value || 0;
    
    return {
      ...baseSummary,
      topic: this.topic,
      clusterName: this.clusterName,
      partitionCount: this.partitionCount,
      replicationFactor: this.replicationFactor,
      status: this.getStatus(),
      efficiencyScore: this.calculateEfficiencyScore(),
      performance: {
        throughputIn: throughputIn,
        throughputOut: throughputOut,
        consumerLag: consumerLag,
        errorRate: errorRate
      }
    };
  }
}

module.exports = MessageQueueTopic;