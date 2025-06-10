/**
 * MESSAGE_QUEUE_QUEUE Entity
 * 
 * Represents a message queue with depth, throughput, and processing time metrics.
 * Based on docs/README.md specification.
 */

const BaseEntity = require('./base-entity');

class MessageQueueQueue extends BaseEntity {
  static ENTITY_TYPE = 'MESSAGE_QUEUE_QUEUE';

  constructor(config = {}) {
    // Ensure name is set from queueName
    const superConfig = {
      ...config,
      name: config.name || config.queueName,
      entityType: MessageQueueQueue.ENTITY_TYPE
    };
    
    super(superConfig);

    // Queue-specific properties
    this.queueName = config.queueName || config.name;
    this.vhost = config.vhost; // RabbitMQ
    this.queueUrl = config.queueUrl; // SQS
    this.queueArn = config.queueArn; // SQS
    this.region = config.region;
    this.queueType = config.queueType || 'standard'; // standard, fifo, priority
    this.maxMessageSize = config.maxMessageSize;
    this.visibilityTimeout = config.visibilityTimeout;
    this.messageRetentionPeriod = config.messageRetentionPeriod;
    this.isDurable = config.isDurable !== false; // Default true
    this.isExclusive = config.isExclusive || false;
    this.autoDelete = config.autoDelete || false;
    
    // Update metadata with queue-specific info
    this.updateMetadata('queueName', this.queueName);
    this.updateMetadata('vhost', this.vhost);
    this.updateMetadata('queueUrl', this.queueUrl);
    this.updateMetadata('queueArn', this.queueArn);
    this.updateMetadata('region', this.region);
    this.updateMetadata('queueType', this.queueType);
  }

  /**
   * Generate composite key for GUID
   */
  generateCompositeKey() {
    if (this.queueArn) {
      return this.queueArn;
    }
    return `${this.provider}:${this.region || 'default'}:${this.queueName}:${this.vhost || 'default'}`;
  }

  /**
   * Initialize golden metrics for queue
   */
  initializeGoldenMetrics() {
    return [
      {
        name: 'queue.depth',
        value: 0,
        unit: 'messages',
        timestamp: new Date().toISOString()
      },
      {
        name: 'queue.throughput.in',
        value: 0,
        unit: 'messages/second',
        timestamp: new Date().toISOString()
      },
      {
        name: 'queue.throughput.out',
        value: 0,
        unit: 'messages/second',
        timestamp: new Date().toISOString()
      },
      {
        name: 'queue.processing.time',
        value: 0.0,
        unit: 'milliseconds',
        timestamp: new Date().toISOString()
      }
    ];
  }

  /**
   * Update queue depth
   */
  updateDepth(messageCount) {
    this.updateGoldenMetric('queue.depth', messageCount, 'messages');
  }

  /**
   * Update input throughput
   */
  updateThroughputIn(messagesPerSecond) {
    this.updateGoldenMetric('queue.throughput.in', messagesPerSecond, 'messages/second');
  }

  /**
   * Update output throughput
   */
  updateThroughputOut(messagesPerSecond) {
    this.updateGoldenMetric('queue.throughput.out', messagesPerSecond, 'messages/second');
  }

  /**
   * Update processing time
   */
  updateProcessingTime(processingTimeMs) {
    this.updateGoldenMetric('queue.processing.time', processingTimeMs, 'milliseconds');
  }

  /**
   * Add relationship to parent entity (cluster, vhost, etc.)
   */
  setParent(parentGuid, parentType) {
    this.addRelationship('CONTAINED_IN', parentGuid, { 
      entityType: parentType,
      relationshipType: 'parent'
    });
  }

  /**
   * Add consumer relationship
   */
  addConsumer(consumerGuid, consumerId) {
    this.addRelationship('PROCESSED_BY', consumerGuid, { 
      entityType: 'CONSUMER',
      consumerId: consumerId,
      relationshipType: 'consumers'
    });
  }

  /**
   * Add producer relationship
   */
  addProducer(producerGuid, producerId) {
    this.addRelationship('PUBLISHED_TO', producerGuid, { 
      entityType: 'PRODUCER',
      producerId: producerId,
      relationshipType: 'producers'
    });
  }

  /**
   * Check if queue is healthy
   */
  isHealthy() {
    const depth = this.goldenMetrics.find(m => m.name === 'queue.depth')?.value || 0;
    const processingTime = this.goldenMetrics.find(m => m.name === 'queue.processing.time')?.value || 0;
    const throughputIn = this.goldenMetrics.find(m => m.name === 'queue.throughput.in')?.value || 0;
    const throughputOut = this.goldenMetrics.find(m => m.name === 'queue.throughput.out')?.value || 0;
    
    // Queue is unhealthy if:
    // - Depth is too high (backlog building up)
    // - Processing time is too slow
    // - Input/output throughput severely imbalanced
    const maxDepthThreshold = this.getMaxDepthThreshold();
    const highDepth = depth > maxDepthThreshold;
    const slowProcessing = processingTime > 5000; // 5 seconds
    const severeImbalance = throughputIn > 0 && 
      (throughputOut / throughputIn) < 0.1; // Less than 10% throughput
    
    return !highDepth && !slowProcessing && !severeImbalance;
  }

  /**
   * Get maximum depth threshold based on queue type
   */
  getMaxDepthThreshold() {
    switch (this.queueType) {
      case 'fifo':
        return 1000; // FIFO queues should be processed quickly
      case 'priority':
        return 5000; // Priority queues can handle more backlog
      case 'dlq':
      case 'dead-letter':
        return 100; // Dead letter queues should be mostly empty
      default:
        return 10000; // Standard queues
    }
  }

  /**
   * Get queue status
   */
  getStatus() {
    const depth = this.goldenMetrics.find(m => m.name === 'queue.depth')?.value || 0;
    const processingTime = this.goldenMetrics.find(m => m.name === 'queue.processing.time')?.value || 0;
    
    const maxDepthThreshold = this.getMaxDepthThreshold();
    const criticalDepth = depth > (maxDepthThreshold * 2);
    const criticalProcessing = processingTime > 10000; // 10 seconds
    
    if (criticalDepth || criticalProcessing) {
      return 'CRITICAL';
    }
    
    const warningDepth = depth > maxDepthThreshold;
    const warningProcessing = processingTime > 5000; // 5 seconds
    
    if (warningDepth || warningProcessing) {
      return 'WARNING';
    }
    
    return 'HEALTHY';
  }

  /**
   * Calculate queue efficiency score
   */
  calculateEfficiencyScore() {
    const throughputIn = this.goldenMetrics.find(m => m.name === 'queue.throughput.in')?.value || 0;
    const throughputOut = this.goldenMetrics.find(m => m.name === 'queue.throughput.out')?.value || 0;
    const processingTime = this.goldenMetrics.find(m => m.name === 'queue.processing.time')?.value || 0;
    const depth = this.goldenMetrics.find(m => m.name === 'queue.depth')?.value || 0;
    
    // Base efficiency on throughput ratio
    let efficiency = 100;
    
    if (throughputIn > 0) {
      const throughputRatio = Math.min(1, throughputOut / throughputIn);
      efficiency = throughputRatio * 100;
    }
    
    // Penalize for high processing time
    if (processingTime > 1000) {
      const processingPenalty = Math.min(50, (processingTime - 1000) / 100);
      efficiency -= processingPenalty;
    }
    
    // Penalize for high depth
    const maxDepth = this.getMaxDepthThreshold();
    if (depth > maxDepth) {
      const depthPenalty = Math.min(30, ((depth - maxDepth) / maxDepth) * 30);
      efficiency -= depthPenalty;
    }
    
    return Math.max(0, Math.round(efficiency));
  }

  /**
   * Get queue age estimation
   */
  getAverageMessageAge() {
    const depth = this.goldenMetrics.find(m => m.name === 'queue.depth')?.value || 0;
    const throughputOut = this.goldenMetrics.find(m => m.name === 'queue.throughput.out')?.value || 0;
    
    if (throughputOut === 0 || depth === 0) return 0;
    
    // Estimate average message age based on depth and consumption rate
    return (depth / throughputOut) * 1000; // Convert to milliseconds
  }

  /**
   * Generate provider-specific event payload
   */
  toEventPayload() {
    const basePayload = super.toEventPayload();
    
    return {
      ...basePayload,
      queueName: this.queueName,
      queueType: this.queueType,
      vhost: this.vhost,
      queueUrl: this.queueUrl,
      queueArn: this.queueArn,
      region: this.region,
      isDurable: this.isDurable,
      isExclusive: this.isExclusive,
      autoDelete: this.autoDelete,
      status: this.getStatus(),
      efficiencyScore: this.calculateEfficiencyScore(),
      averageMessageAge: this.getAverageMessageAge(),
      
      // Provider-specific fields
      ...(this.provider === 'rabbitmq' && {
        'rabbitmq.queue.name': this.queueName,
        'rabbitmq.vhost': this.vhost || '/',
        'rabbitmq.queue.durable': this.isDurable,
        'rabbitmq.queue.exclusive': this.isExclusive,
        'rabbitmq.queue.auto.delete': this.autoDelete,
        'rabbitmq.queue.arguments': this.metadata.arguments || {}
      }),
      
      ...(this.provider === 'sqs' && {
        'sqs.queue.name': this.queueName,
        'sqs.queue.url': this.queueUrl,
        'sqs.queue.arn': this.queueArn,
        'sqs.queue.type': this.queueType,
        'sqs.visibility.timeout': this.visibilityTimeout,
        'sqs.message.retention.period': this.messageRetentionPeriod,
        'sqs.max.message.size': this.maxMessageSize
      }),
      
      ...(this.provider === 'azure-servicebus' && {
        'servicebus.queue.name': this.queueName,
        'servicebus.namespace': this.metadata.namespace,
        'servicebus.queue.path': this.metadata.queuePath,
        'servicebus.max.delivery.count': this.metadata.maxDeliveryCount,
        'servicebus.lock.duration': this.metadata.lockDuration
      })
    };
  }

  /**
   * Validate queue-specific requirements
   */
  validate() {
    const errors = super.validate();
    
    if (!this.queueName) {
      errors.push('queueName is required');
    }
    
    // Provider-specific validation
    if (this.provider === 'rabbitmq' && !this.vhost) {
      this.vhost = '/'; // Default vhost
    }
    
    if (this.provider === 'sqs') {
      if (!this.region) {
        errors.push('region is required for SQS queues');
      }
      if (this.queueType === 'fifo' && !this.queueName.endsWith('.fifo')) {
        errors.push('FIFO queue names must end with .fifo');
      }
    }
    
    // Queue naming validation
    if (this.queueName && this.queueName.length > 80) {
      errors.push('queueName must be 80 characters or less');
    }
    
    return errors;
  }

  /**
   * Get queue summary with performance metrics
   */
  getSummary() {
    const baseSummary = super.getSummary();
    const depth = this.goldenMetrics.find(m => m.name === 'queue.depth')?.value || 0;
    const throughputIn = this.goldenMetrics.find(m => m.name === 'queue.throughput.in')?.value || 0;
    const throughputOut = this.goldenMetrics.find(m => m.name === 'queue.throughput.out')?.value || 0;
    const processingTime = this.goldenMetrics.find(m => m.name === 'queue.processing.time')?.value || 0;
    
    return {
      ...baseSummary,
      queueName: this.queueName,
      queueType: this.queueType,
      vhost: this.vhost,
      region: this.region,
      status: this.getStatus(),
      efficiencyScore: this.calculateEfficiencyScore(),
      performance: {
        depth: depth,
        throughputIn: throughputIn,
        throughputOut: throughputOut,
        processingTime: processingTime,
        averageMessageAge: this.getAverageMessageAge()
      }
    };
  }
}

module.exports = MessageQueueQueue;