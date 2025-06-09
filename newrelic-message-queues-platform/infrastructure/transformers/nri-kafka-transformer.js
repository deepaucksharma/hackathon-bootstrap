/**
 * Enhanced NRI-Kafka Data Transformer
 * 
 * Transforms nri-kafka integration data into MESSAGE_QUEUE_* entities with comprehensive
 * metric support, validation, and error recovery. Supports structured metric definitions
 * and per-topic-per-broker collection strategies.
 */

const chalk = require('chalk');
const { getAllMetricDefinitions, getMetricsForEntityType } = require('../../core/metrics/metric-definitions');

class NriKafkaTransformer {
  constructor(accountId, options = {}) {
    if (!accountId) {
      throw new Error('Account ID is required for entity transformation');
    }
    this.accountId = String(accountId);
    this.options = {
      enableValidation: options.enableValidation !== false,
      enablePerTopicBrokerMetrics: options.enablePerTopicBrokerMetrics !== false,
      strictMode: options.strictMode || false,
      metricDefinitions: getAllMetricDefinitions(),
      ...options
    };
    
    // Transformation statistics
    this.stats = {
      totalTransformations: 0,
      validationErrors: 0,
      metricValidationErrors: 0,
      successfulTransformations: 0,
      skippedSamples: 0,
      performanceMetrics: {
        avgTransformationTime: 0,
        maxTransformationTime: 0,
        totalTransformationTime: 0
      }
    };
    
    // Cache for topic-broker metric aggregations
    this.topicBrokerMetricsCache = new Map();
    this.consumerGroupCache = new Map();
    
    console.log(chalk.blue('🔧 Enhanced NRI-Kafka Transformer initialized with:'));
    console.log(chalk.gray(`   - Validation: ${this.options.enableValidation ? 'enabled' : 'disabled'}`));
    console.log(chalk.gray(`   - Per-topic-broker metrics: ${this.options.enablePerTopicBrokerMetrics ? 'enabled' : 'disabled'}`));
    console.log(chalk.gray(`   - Strict mode: ${this.options.strictMode ? 'enabled' : 'disabled'}`));
  }

  /**
   * Generate a proper New Relic entity GUID
   * Format: {entityType}|{accountId}|{provider}|{hierarchical_identifiers}
   */
  generateGuid(entityType, ...identifiers) {
    // Filter out empty identifiers and join with pipe
    const parts = [entityType, this.accountId, ...identifiers].filter(Boolean);
    return parts.join('|');
  }

  /**
   * Validate and process metric using metric definitions
   */
  processMetric(metricName, rawValue, entityType, context = {}) {
    const metricDef = this.options.metricDefinitions[entityType]?.[metricName];
    
    if (!metricDef) {
      if (this.options.strictMode) {
        this.stats.metricValidationErrors++;
        throw new Error(`Unknown metric: ${metricName} for entity type: ${entityType}`);
      }
      return rawValue; // Return as-is in non-strict mode
    }
    
    try {
      // Process the value using metric definition
      const processedValue = metricDef.process(rawValue, context);
      
      // Validate the processed value
      if (this.options.enableValidation) {
        const validation = metricDef.validate(processedValue);
        if (!validation.valid) {
          this.stats.metricValidationErrors++;
          if (this.options.strictMode) {
            throw new Error(`Metric validation failed for ${metricName}: ${validation.reason}`);
          }
          console.warn(chalk.yellow(`⚠️  Metric validation warning for ${metricName}: ${validation.reason}`));
        }
      }
      
      return processedValue;
    } catch (error) {
      this.stats.metricValidationErrors++;
      if (this.options.strictMode) {
        throw error;
      }
      console.warn(chalk.yellow(`⚠️  Error processing metric ${metricName}: ${error.message}`));
      return rawValue; // Fallback to raw value
    }
  }

  /**
   * Apply metric definitions to entity metrics
   */
  applyMetricDefinitions(entity, entityType) {
    const metricDefinitions = this.options.metricDefinitions[entityType] || {};
    
    Object.keys(entity).forEach(key => {
      if (key.startsWith('broker.') || key.startsWith('topic.') || 
          key.startsWith('consumerGroup.') || key.startsWith('cluster.')) {
        try {
          entity[key] = this.processMetric(key, entity[key], entityType, {
            entity,
            timestamp: entity.timestamp
          });
        } catch (error) {
          console.warn(chalk.yellow(`⚠️  Failed to process metric ${key}: ${error.message}`));
        }
      }
    });
    
    return entity;
  }

  /**
   * Validate required fields for entity
   */
  validateRequiredFields(sample, requiredFields, entityType) {
    const missing = [];
    
    requiredFields.forEach(field => {
      if (sample[field] === undefined || sample[field] === null || sample[field] === '') {
        missing.push(field);
      }
    });
    
    if (missing.length > 0) {
      const error = `Missing required fields for ${entityType}: ${missing.join(', ')}`;
      this.stats.validationErrors++;
      
      if (this.options.strictMode) {
        throw new Error(error);
      } else {
        console.warn(chalk.yellow(`⚠️  ${error}`));
        return false;
      }
    }
    
    return true;
  }

  /**
   * Transform KafkaBrokerSample to MESSAGE_QUEUE_BROKER entity with enhanced validation
   */
  transformBrokerSample(sample) {
    const startTime = performance.now();
    
    try {
      if (!sample || !sample.eventType || sample.eventType !== 'KafkaBrokerSample') {
        throw new Error('Invalid broker sample: missing or incorrect eventType');
      }

      // Validate required fields
      const requiredFields = ['broker.id'];
      if (!this.validateRequiredFields(sample, requiredFields, 'MESSAGE_QUEUE_BROKER')) {
        this.stats.skippedSamples++;
        return null;
      }

      const brokerId = sample['broker.id'] || sample.broker_id || '0';
      const clusterName = sample.clusterName || sample.cluster_name || 'default';
      const hostname = sample.hostname || sample['broker.hostname'] || `broker-${brokerId}`;
      
      // Generate GUID following MESSAGE_QUEUE pattern
      const entityGuid = this.generateGuid('MESSAGE_QUEUE_BROKER', 'kafka', clusterName, `broker-${brokerId}`);
      
      // Create entity matching our MESSAGE_QUEUE format
      const entity = {
        // Required entity fields
        eventType: 'MessageQueue',
        entityType: 'MESSAGE_QUEUE_BROKER',
        entityGuid: entityGuid,
        displayName: `Kafka Broker ${brokerId}`,
        entityName: `kafka-broker-${brokerId}`,
        
        // Provider info
        provider: 'kafka',
        
        // Broker-specific attributes
        brokerId: String(brokerId),
        hostname: hostname,
        clusterName: clusterName,
        
        // Enhanced metrics with multiple source mappings and fallbacks
        'broker.messagesInPerSecond': this.extractMetricWithFallbacks(sample, [
          'broker.messagesInPerSecond', 'messagesInPerSecond', 'net.messagesInPerSec'
        ]),
        'broker.messagesOutPerSecond': this.extractMetricWithFallbacks(sample, [
          'broker.messagesOutPerSecond', 'messagesOutPerSecond', 'net.messagesOutPerSec'
        ]),
        'broker.bytesInPerSecond': this.extractMetricWithFallbacks(sample, [
          'broker.bytesInPerSecond', 'bytesInPerSecond', 'net.bytesInPerSec'
        ]),
        'broker.bytesOutPerSecond': this.extractMetricWithFallbacks(sample, [
          'broker.bytesOutPerSecond', 'bytesOutPerSecond', 'net.bytesOutPerSec'
        ]),
        
        // Resource utilization with enhanced mapping
        'broker.cpu.usage': this.calculateCpuUsage(sample),
        'broker.memory.usage': this.extractMetricWithFallbacks(sample, [
          'broker.JVMMemoryUsedPercent', 'jvmMemoryUsedPercent', 'memoryUsedPercent'
        ]),
        'broker.disk.usage': this.extractMetricWithFallbacks(sample, [
          'broker.diskUsedPercent', 'disk.usedPercent', 'diskUsedPercent'
        ]),
        
        // Network and request metrics with enhanced fallbacks
        'broker.requestsPerSecond': this.extractMetricWithFallbacks(sample, [
          'broker.requestsPerSecond', 'net.requestsPerSecond', 'requestsPerSecond'
        ]),
        'broker.networkProcessorIdlePercent': this.extractMetricWithFallbacks(sample, [
          'broker.networkProcessorIdlePercent', 'net.networkProcessorAvgIdlePercent', 'networkProcessorIdlePercent'
        ]),
        'broker.requestHandlerIdlePercent': this.extractMetricWithFallbacks(sample, [
          'broker.requestHandlerIdlePercent', 'net.requestHandlerAvgIdlePercent', 'requestHandlerIdlePercent'
        ]),
        
        // Replication health metrics
        'broker.underReplicatedPartitions': this.extractMetricWithFallbacks(sample, [
          'broker.underReplicatedPartitions', 'underReplicatedPartitions'
        ]),
        'broker.offlinePartitions': this.extractMetricWithFallbacks(sample, [
          'broker.offlinePartitions', 'broker.offlinePartitionsCount', 'offlinePartitions'
        ]),
        'broker.leaderElectionRate': this.extractMetricWithFallbacks(sample, [
          'broker.leaderElectionRate', 'leaderElectionRate'
        ]),
        'broker.uncleanLeaderElections': this.extractMetricWithFallbacks(sample, [
          'broker.uncleanLeaderElections', 'uncleanLeaderElections'
        ]),
        
        // Enhanced tags with additional metadata
        'tags.clusterName': clusterName,
        'tags.brokerId': String(brokerId),
        'tags.hostname': hostname,
        'tags.kafkaVersion': sample.kafkaVersion || 'unknown',
        'tags.environment': this.inferEnvironment(clusterName),
        'tags.provider': 'kafka',
        'tags.rack': sample['broker.rack'] || sample.rack || 'unknown',
        'tags.jvmVersion': sample['broker.jvmVersion'] || 'unknown'
      };
      
      // Add timestamp if available
      if (sample.timestamp) {
        entity.timestamp = sample.timestamp;
      }
      
      // Apply metric definitions and validation
      const processedEntity = this.applyMetricDefinitions(entity, 'broker');
      
      // Track performance
      const duration = performance.now() - startTime;
      this.updatePerformanceStats(duration);
      this.stats.successfulTransformations++;
      
      return processedEntity;
      
    } catch (error) {
      const duration = performance.now() - startTime;
      this.updatePerformanceStats(duration);
      this.stats.validationErrors++;
      throw new Error(`Broker transformation failed: ${error.message}`);
    }
  }

  /**
   * Transform KafkaTopicSample to MESSAGE_QUEUE_TOPIC entity with per-topic-per-broker support
   */
  transformTopicSample(sample) {
    const startTime = performance.now();
    
    try {
      if (!sample || !sample.eventType || sample.eventType !== 'KafkaTopicSample') {
        throw new Error('Invalid topic sample: missing or incorrect eventType');
      }

      const topicName = sample['topic.name'] || sample.topic_name;
      if (!topicName) {
        throw new Error('Topic sample missing topic name');
      }

      // Validate required fields
      const requiredFields = ['topic.name'];
      if (!this.validateRequiredFields(sample, requiredFields, 'MESSAGE_QUEUE_TOPIC')) {
        this.stats.skippedSamples++;
        return null;
      }

      const clusterName = sample.clusterName || sample.cluster_name || 'default';
      const brokerId = sample['broker.id'] || sample.broker_id;
      
      // Generate GUID - include broker ID for per-topic-per-broker metrics
      let entityGuid;
      if (this.options.enablePerTopicBrokerMetrics && brokerId) {
        entityGuid = this.generateGuid('MESSAGE_QUEUE_TOPIC', 'kafka', clusterName, topicName, `broker-${brokerId}`);
      } else {
        entityGuid = this.generateGuid('MESSAGE_QUEUE_TOPIC', 'kafka', clusterName, topicName);
      }
      
      // Create entity matching our MESSAGE_QUEUE format
      const entity = {
        // Required entity fields
        eventType: 'MessageQueue',
        entityType: 'MESSAGE_QUEUE_TOPIC',
        entityGuid: entityGuid,
        displayName: brokerId ? `${topicName} (Broker ${brokerId})` : topicName,
        entityName: topicName,
        
        // Provider info
        provider: 'kafka',
        
        // Topic-specific attributes
        topicName: topicName,
        clusterName: clusterName,
        
        // Enhanced throughput metrics with fallbacks
        'topic.messagesInPerSecond': this.extractMetricWithFallbacks(sample, [
          'topic.messagesInPerSecond', 'messagesInPerSecond'
        ]),
        'topic.messagesOutPerSecond': this.extractMetricWithFallbacks(sample, [
          'topic.messagesOutPerSecond', 'messagesOutPerSecond'
        ]),
        'topic.bytesInPerSecond': this.extractMetricWithFallbacks(sample, [
          'topic.bytesInPerSecond', 'bytesInPerSecond'
        ]),
        'topic.bytesOutPerSecond': this.extractMetricWithFallbacks(sample, [
          'topic.bytesOutPerSecond', 'bytesOutPerSecond'
        ]),
        
        // Request metrics with enhanced mapping
        'topic.fetchRequestsPerSecond': this.extractMetricWithFallbacks(sample, [
          'topic.fetchRequestsPerSecond', 'fetchRequestsPerSecond'
        ]),
        'topic.produceRequestsPerSecond': this.extractMetricWithFallbacks(sample, [
          'topic.produceRequestsPerSecond', 'produceRequestsPerSecond'
        ]),
        
        // Configuration metrics with fallbacks
        'topic.partitions.count': this.extractMetricWithFallbacks(sample, [
          'topic.partitionCount', 'partitionCount', 'partitions'
        ]),
        'topic.replicationFactor': this.extractMetricWithFallbacks(sample, [
          'topic.replicationFactor', 'replicationFactor'
        ]),
        'topic.retentionMs': this.extractMetricWithFallbacks(sample, [
          'topic.retentionMs', 'retentionMs', 'retention.ms'
        ]),
        'topic.sizeBytes': this.extractMetricWithFallbacks(sample, [
          'topic.diskSize', 'topic.sizeBytes', 'sizeBytes', 'diskSize'
        ]),
        
        // Health metrics
        'topic.underReplicatedPartitions': this.extractMetricWithFallbacks(sample, [
          'topic.underReplicatedPartitions', 'underReplicatedPartitions'
        ]),
        
        // Enhanced tags
        'tags.topicName': topicName,
        'tags.clusterName': clusterName,
        'tags.partitionCount': String(sample['topic.partitionCount'] || sample.partitionCount || 0),
        'tags.replicationFactor': String(sample['topic.replicationFactor'] || sample.replicationFactor || 0),
        'tags.environment': this.inferEnvironment(clusterName),
        'tags.provider': 'kafka',
        'tags.isCompacted': sample['topic.config.cleanup.policy'] === 'compact' ? 'true' : 'false',
        'tags.retentionPolicy': sample['topic.config.cleanup.policy'] || 'delete'
      };
      
      // Add broker-specific tags if per-topic-per-broker metrics enabled
      if (this.options.enablePerTopicBrokerMetrics && brokerId) {
        entity['tags.brokerId'] = String(brokerId);
        entity['tags.isPerBrokerMetric'] = 'true';
      }
      
      // Add timestamp if available
      if (sample.timestamp) {
        entity.timestamp = sample.timestamp;
      }
      
      // Cache for aggregation if per-topic-per-broker enabled
      if (this.options.enablePerTopicBrokerMetrics && brokerId) {
        this.cacheTopicBrokerMetrics(topicName, clusterName, brokerId, entity);
      }
      
      // Apply metric definitions and validation
      const processedEntity = this.applyMetricDefinitions(entity, 'topic');
      
      // Track performance
      const duration = performance.now() - startTime;
      this.updatePerformanceStats(duration);
      this.stats.successfulTransformations++;
      
      return processedEntity;
      
    } catch (error) {
      const duration = performance.now() - startTime;
      this.updatePerformanceStats(duration);
      this.stats.validationErrors++;
      throw new Error(`Topic transformation failed: ${error.message}`);
    }
  }

  /**
   * Transform KafkaConsumerSample to MESSAGE_QUEUE_CONSUMER_GROUP entity with enhanced lag metrics
   */
  transformConsumerSample(sample) {
    const startTime = performance.now();
    
    try {
      if (!sample || !sample.eventType || sample.eventType !== 'KafkaConsumerSample') {
        throw new Error('Invalid consumer sample: missing or incorrect eventType');
      }

      const consumerGroupId = sample['consumer.groupId'] || sample.consumer_group_id;
      if (!consumerGroupId) {
        throw new Error('Consumer sample missing group ID');
      }

      // Validate required fields
      const requiredFields = ['consumer.groupId'];
      if (!this.validateRequiredFields(sample, requiredFields, 'MESSAGE_QUEUE_CONSUMER_GROUP')) {
        this.stats.skippedSamples++;
        return null;
      }

      const clusterName = sample.clusterName || sample.cluster_name || 'default';
      const topicName = sample['topic.name'] || sample.topic_name || 'unknown';
      const partitionId = sample['partition.id'] || sample.partition_id;
      
      // Generate GUID - include topic and partition for granular tracking
      let entityGuid;
      if (partitionId !== undefined) {
        entityGuid = this.generateGuid('MESSAGE_QUEUE_CONSUMER_GROUP', 'kafka', clusterName, consumerGroupId, topicName, `partition-${partitionId}`);
      } else {
        entityGuid = this.generateGuid('MESSAGE_QUEUE_CONSUMER_GROUP', 'kafka', clusterName, consumerGroupId);
      }
      
      // Calculate advanced lag metrics
      const lagMetrics = this.calculateConsumerLagMetrics(sample);
      
      // Create entity matching our MESSAGE_QUEUE format
      const entity = {
        // Required entity fields
        eventType: 'MessageQueue',
        entityType: 'MESSAGE_QUEUE_CONSUMER_GROUP',
        entityGuid: entityGuid,
        displayName: partitionId !== undefined ? 
          `${consumerGroupId} (${topicName}:${partitionId})` : 
          `${consumerGroupId} (${clusterName})`,
        entityName: consumerGroupId,
        
        // Provider info
        provider: 'kafka',
        
        // Consumer group attributes
        consumerGroupId: consumerGroupId,
        clusterName: clusterName,
        
        // State and membership with enhanced detection
        'consumerGroup.state': this.extractMetricWithFallbacks(sample, [
          'consumer.state', 'state', 'group.state'
        ], 'STABLE'),
        'consumerGroup.memberCount': this.extractMetricWithFallbacks(sample, [
          'consumer.memberCount', 'consumer.members', 'memberCount'
        ]),
        'consumerGroup.activeMembers': this.extractMetricWithFallbacks(sample, [
          'consumer.activeMembers', 'activeMembers'
        ]),
        'consumerGroup.topics': topicName,
        
        // Enhanced lag metrics - critical for consumer group monitoring
        'consumerGroup.totalLag': lagMetrics.totalLag,
        'consumerGroup.maxLag': lagMetrics.maxLag,
        'consumerGroup.avgLag': lagMetrics.avgLag,
        'consumerGroup.lagPerPartition': lagMetrics.lagPerPartition,
        'consumerGroup.lagTrend': lagMetrics.lagTrend,
        'consumerGroup.lagStabilityScore': lagMetrics.stabilityScore,
        
        // Consumption metrics with fallbacks
        'consumerGroup.messagesConsumedPerSecond': this.extractMetricWithFallbacks(sample, [
          'consumer.messagesConsumedPerSecond', 'consumer.messageRate', 'messagesConsumedPerSecond'
        ]),
        'consumerGroup.bytesConsumedPerSecond': this.extractMetricWithFallbacks(sample, [
          'consumer.bytesConsumedPerSecond', 'bytesConsumedPerSecond'
        ]),
        'consumerGroup.recordsPerPoll': this.extractMetricWithFallbacks(sample, [
          'consumer.recordsPerPoll', 'recordsPerPoll'
        ]),
        
        // Offset metrics with enhanced mapping
        'consumerGroup.committedOffset': this.extractMetricWithFallbacks(sample, [
          'consumer.offset', 'consumer.committedOffset', 'committedOffset'
        ]),
        'consumerGroup.currentOffset': this.extractMetricWithFallbacks(sample, [
          'consumer.currentOffset', 'currentOffset'
        ]),
        'consumerGroup.offsetCommitRate': this.extractMetricWithFallbacks(sample, [
          'consumer.offsetCommitRate', 'offsetCommitRate'
        ]),
        
        // Performance metrics
        'consumerGroup.processingTimeMs': this.extractMetricWithFallbacks(sample, [
          'consumer.processingTimeMs', 'processingTimeMs'
        ]),
        'consumerGroup.pollIntervalMs': this.extractMetricWithFallbacks(sample, [
          'consumer.pollIntervalMs', 'pollIntervalMs'
        ]),
        
        // State flags with enhanced detection
        'consumerGroup.isStable': this.getConsumerStateFlag(sample, 'STABLE'),
        'consumerGroup.isRebalancing': this.getConsumerStateFlag(sample, 'REBALANCING'),
        'consumerGroup.isDead': this.getConsumerStateFlag(sample, 'DEAD'),
        'consumerGroup.isEmpty': this.getConsumerStateFlag(sample, 'EMPTY'),
        
        // Enhanced tags with additional metadata
        'tags.consumerGroupId': consumerGroupId,
        'tags.state': sample['consumer.state'] || 'STABLE',
        'tags.clusterName': clusterName,
        'tags.topicName': topicName,
        'tags.clientId': sample['consumer.clientId'] || 'unknown',
        'tags.environment': this.inferEnvironment(clusterName),
        'tags.provider': 'kafka',
        'tags.protocol': sample['consumer.protocol'] || 'unknown',
        'tags.assignmentStrategy': sample['consumer.assignmentStrategy'] || 'unknown'
      };
      
      // Add partition-specific tags if available
      if (partitionId !== undefined) {
        entity['tags.partitionId'] = String(partitionId);
        entity['tags.isPerPartitionMetric'] = 'true';
      }
      
      // Add timestamp if available
      if (sample.timestamp) {
        entity.timestamp = sample.timestamp;
      }
      
      // Cache for aggregation
      this.cacheConsumerGroupMetrics(consumerGroupId, clusterName, topicName, entity);
      
      // Apply metric definitions and validation
      const processedEntity = this.applyMetricDefinitions(entity, 'consumerGroup');
      
      // Track performance
      const duration = performance.now() - startTime;
      this.updatePerformanceStats(duration);
      this.stats.successfulTransformations++;
      
      return processedEntity;
      
    } catch (error) {
      const duration = performance.now() - startTime;
      this.updatePerformanceStats(duration);
      this.stats.validationErrors++;
      throw new Error(`Consumer group transformation failed: ${error.message}`);
    }
  }

  /**
   * Create a cluster entity by aggregating broker data
   */
  createClusterEntity(brokerSamples) {
    if (!brokerSamples || brokerSamples.length === 0) {
      return null;
    }

    const clusterName = brokerSamples[0].clusterName || 'default';
    const kafkaVersion = brokerSamples[0].kafkaVersion || 'unknown';
    
    // Generate GUID for cluster
    const entityGuid = this.generateGuid('MESSAGE_QUEUE_CLUSTER', 'kafka', clusterName);
    
    // Aggregate metrics from all brokers
    const aggregatedMetrics = {
      messagesIn: 0,
      messagesOut: 0,
      bytesIn: 0,
      bytesOut: 0,
      cpuTotal: 0,
      memoryTotal: 0,
      underReplicatedPartitions: 0,
      offlinePartitions: 0
    };
    
    brokerSamples.forEach(sample => {
      aggregatedMetrics.messagesIn += sample['broker.messagesInPerSecond'] || 0;
      aggregatedMetrics.messagesOut += sample['broker.messagesOutPerSecond'] || 0;
      aggregatedMetrics.bytesIn += sample['broker.bytesInPerSecond'] || 0;
      aggregatedMetrics.bytesOut += sample['broker.bytesOutPerSecond'] || 0;
      aggregatedMetrics.cpuTotal += sample['broker.cpuPercent'] || 0;
      aggregatedMetrics.memoryTotal += sample['broker.JVMMemoryUsedPercent'] || 0;
      aggregatedMetrics.underReplicatedPartitions += sample['broker.underReplicatedPartitions'] || 0;
      aggregatedMetrics.offlinePartitions += sample['broker.offlinePartitions'] || 0;
    });
    
    const brokerCount = brokerSamples.length;
    
    // Create cluster entity
    const entity = {
      // Required entity fields
      eventType: 'MessageQueue',
      entityType: 'MESSAGE_QUEUE_CLUSTER',
      entityGuid: entityGuid,
      displayName: `Kafka Cluster: ${clusterName}`,
      entityName: clusterName,
      
      // Provider info
      provider: 'kafka',
      
      // Cluster attributes
      clusterName: clusterName,
      
      // Aggregated metrics
      'cluster.brokerCount': brokerCount,
      'cluster.throughput.messagesPerSecond': aggregatedMetrics.messagesIn + aggregatedMetrics.messagesOut,
      'cluster.throughput.bytesPerSecond': aggregatedMetrics.bytesIn + aggregatedMetrics.bytesOut,
      'cluster.messagesInPerSecond': aggregatedMetrics.messagesIn,
      'cluster.messagesOutPerSecond': aggregatedMetrics.messagesOut,
      'cluster.bytesInPerSecond': aggregatedMetrics.bytesIn,
      'cluster.bytesOutPerSecond': aggregatedMetrics.bytesOut,
      
      // Average resource utilization
      'cluster.cpu.avgUsage': brokerCount > 0 ? aggregatedMetrics.cpuTotal / brokerCount : 0,
      'cluster.memory.avgUsage': brokerCount > 0 ? aggregatedMetrics.memoryTotal / brokerCount : 0,
      
      // Health metrics
      'cluster.underReplicatedPartitions': aggregatedMetrics.underReplicatedPartitions,
      'cluster.offlinePartitions': aggregatedMetrics.offlinePartitions,
      'cluster.health.score': this.calculateHealthScore(aggregatedMetrics, brokerCount),
      
      // Tags
      'tags.clusterName': clusterName,
      'tags.brokerCount': String(brokerCount),
      'tags.kafkaVersion': kafkaVersion,
      'tags.environment': this.inferEnvironment(clusterName),
      'tags.provider': 'kafka'
    };
    
    return entity;
  }

  /**
   * Infer environment from cluster name
   */
  inferEnvironment(clusterName) {
    const name = clusterName.toLowerCase();
    if (name.includes('prod')) return 'production';
    if (name.includes('staging') || name.includes('stg')) return 'staging';
    if (name.includes('dev')) return 'development';
    if (name.includes('test')) return 'test';
    return 'production'; // default
  }

  /**
   * Calculate cluster health score (0-100)
   */
  calculateHealthScore(metrics, brokerCount) {
    let score = 100;
    
    // Deduct points for offline partitions (critical)
    if (metrics.offlinePartitions > 0) {
      score -= Math.min(50, metrics.offlinePartitions * 10);
    }
    
    // Deduct points for under-replicated partitions
    if (metrics.underReplicatedPartitions > 0) {
      score -= Math.min(30, metrics.underReplicatedPartitions * 2);
    }
    
    // Deduct points for low throughput (might indicate issues)
    if (metrics.messagesIn < 10 && brokerCount > 0) {
      score -= 10;
    }
    
    return Math.max(0, score);
  }

  /**
   * Transform a batch of nri-kafka samples to MESSAGE_QUEUE entities with error handling
   */
  transformSamples(samples) {
    if (!samples || !Array.isArray(samples)) {
      throw new Error('Samples must be a non-empty array');
    }

    const entities = [];
    const brokerSamples = [];
    const transformationErrors = [];
    const startTime = Date.now();
    
    samples.forEach((sample, index) => {
      try {
        if (!sample || !sample.eventType) {
          transformationErrors.push({
            index,
            error: 'Sample missing eventType',
            sample: sample
          });
          return;
        }

        if (sample.eventType === 'KafkaBrokerSample') {
          brokerSamples.push(sample);
          const entity = this.transformBrokerSample(sample);
          entities.push(entity);
        } else if (sample.eventType === 'KafkaTopicSample') {
          const entity = this.transformTopicSample(sample);
          entities.push(entity);
        } else if (sample.eventType === 'KafkaConsumerSample') {
          const entity = this.transformConsumerSample(sample);
          entities.push(entity);
        } else {
          transformationErrors.push({
            index,
            error: `Unknown eventType: ${sample.eventType}`,
            eventType: sample.eventType
          });
        }
      } catch (error) {
        transformationErrors.push({
          index,
          error: error.message,
          eventType: sample?.eventType,
          sample: sample
        });
      }
    });
    
    // Create cluster entity from broker samples
    if (brokerSamples.length > 0) {
      try {
        const clusterEntity = this.createClusterEntity(brokerSamples);
        if (clusterEntity) {
          entities.push(clusterEntity);
        }
      } catch (error) {
        transformationErrors.push({
          type: 'cluster',
          error: error.message,
          brokerCount: brokerSamples.length
        });
      }
    }
    
    const duration = Date.now() - startTime;
    
    // Add transformation metadata to all entities
    entities.forEach(entity => {
      entity._transformationMetadata = {
        transformedAt: new Date().toISOString(),
        transformationDuration: duration,
        sourceEventCount: samples.length,
        errorCount: transformationErrors.length
      };
    });

    // Log results
    if (transformationErrors.length > 0) {
      console.warn(`⚠️  ${transformationErrors.length} transformation errors occurred:`);
      transformationErrors.slice(0, 5).forEach(err => {
        console.warn(`   - Sample ${err.index || 'unknown'}: ${err.error}`);
      });
      if (transformationErrors.length > 5) {
        console.warn(`   - ... and ${transformationErrors.length - 5} more`);
      }
    }
    
    return {
      entities,
      stats: {
        totalSamples: samples.length,
        entitiesCreated: entities.length,
        brokerEntities: entities.filter(e => e.entityType === 'MESSAGE_QUEUE_BROKER').length,
        topicEntities: entities.filter(e => e.entityType === 'MESSAGE_QUEUE_TOPIC').length,
        clusterEntities: entities.filter(e => e.entityType === 'MESSAGE_QUEUE_CLUSTER').length,
        consumerGroupEntities: entities.filter(e => e.entityType === 'MESSAGE_QUEUE_CONSUMER_GROUP').length,
        transformationErrors: transformationErrors.length,
        transformationDuration: duration
      },
      errors: transformationErrors
    };
  }
}

module.exports = NriKafkaTransformer;