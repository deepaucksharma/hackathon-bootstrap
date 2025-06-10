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
   * Generate New Relic entity GUID following Queues & Streaming v3.0 specification
   * Format: {accountId}|{domain}|{entityType}|{uniqueHash}
   */
  generateGuid(entityType, ...identifiers) {
    // Calculate unique hash from hierarchical identifiers
    const crypto = require('crypto');
    const compositeKey = identifiers.filter(Boolean).join(':');
    const uniqueHash = crypto.createHash('sha256').update(compositeKey).digest('hex').substring(0, 32);
    
    // Follow v3.0 specification format: {accountId}|{domain}|{entityType}|{uniqueHash}
    return `${this.accountId}|INFRA|${entityType}|${uniqueHash}`;
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
      // Handle both eventType and event_type field names from nri-kafka
      const eventType = sample.eventType || sample.event_type;
      if (!sample || !eventType || eventType !== 'KafkaBrokerSample') {
        throw new Error(`Invalid broker sample: missing or incorrect eventType. Got: ${eventType}`);
      }

      // Extract broker ID from various possible fields in nri-kafka data
      const brokerId = sample['broker.id'] || sample.broker_id || sample.entityId || 
                       (sample.entityKey && sample.entityKey.includes('brokerid=') ? 
                        sample.entityKey.split('brokerid=')[1].split(':')[0] : '0');
      const clusterName = sample.clusterName || sample.cluster_name || 'default';
      const hostname = sample.hostname || sample['broker.hostname'] || `broker-${brokerId}`;
      
      // Generate GUID following MESSAGE_QUEUE pattern
      const entityGuid = this.generateGuid('MESSAGE_QUEUE_BROKER', 'kafka', clusterName, `broker-${brokerId}`);
      
      // Create entity following Queues & Streaming v3.0 specification
      const entity = {
        // Core entity fields per v3.0 spec
        eventType: 'KafkaBrokerSample',
        entityType: 'MESSAGE_QUEUE_BROKER',
        entityGuid: entityGuid,
        entityName: `kafka-broker-${brokerId}`,
        displayName: `Kafka Broker ${brokerId}`,
        domain: 'INFRA',
        reporting: true,
        
        // Provider identification per v3.0
        provider: 'kafka',
        providerAccountId: this.accountId,
        
        // v3.0 Required metadata
        metadata: {
          provider: 'kafka',
          clusterName: clusterName,
          brokerId: String(brokerId),
          hostname: hostname,
          version: sample.kafkaVersion || sample['kafka.version'] || 'unknown',
          region: sample.region || 'unknown',
          environment: this.inferEnvironment(clusterName),
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString()
        },
        
        // Broker-specific attributes
        brokerId: String(brokerId),
        hostname: hostname,
        clusterName: clusterName,
        
        // v3.0 Standard broker metrics following specification
        metrics: {
          // Throughput metrics per v3.0 spec
          'broker.bytesInPerSecond': this.extractMetricWithFallbacks(sample, [
            'broker.bytesInPerSecond', 'bytesInPerSecond', 'net.bytesInPerSec'
          ]),
          'broker.bytesOutPerSecond': this.extractMetricWithFallbacks(sample, [
            'broker.bytesOutPerSecond', 'bytesOutPerSecond', 'net.bytesOutPerSec'
          ]),
          'broker.messagesInPerSecond': this.extractMetricWithFallbacks(sample, [
            'broker.messagesInPerSecond', 'messagesInPerSecond', 'net.messagesInPerSec'
          ]),
          'broker.fetchRequestsPerSecond': this.extractMetricWithFallbacks(sample, [
            'broker.requestsPerSecond', 'net.requestsPerSecond', 'requestsPerSecond'
          ]),
          'broker.produceRequestsPerSecond': this.extractMetricWithFallbacks(sample, [
            'broker.requestsPerSecond', 'net.requestsPerSecond', 'requestsPerSecond'
          ]),
          
          // Resource metrics per v3.0 spec
          'broker.requestHandlerAvgIdlePercent': this.extractMetricWithFallbacks(sample, [
            'broker.requestHandlerIdlePercent', 'net.requestHandlerAvgIdlePercent', 'requestHandlerIdlePercent'
          ]),
          'broker.networkProcessorAvgIdlePercent': this.extractMetricWithFallbacks(sample, [
            'broker.networkProcessorIdlePercent', 'net.networkProcessorAvgIdlePercent', 'networkProcessorIdlePercent'
          ]),
          
          // Replication metrics per v3.0 spec
          'broker.partitionCount': this.extractMetricWithFallbacks(sample, [
            'broker.partitionCount', 'partitionCount'
          ]),
          'broker.leaderCount': this.extractMetricWithFallbacks(sample, [
            'broker.leaderCount', 'leaderCount'
          ]),
          'broker.underReplicatedPartitions': this.extractMetricWithFallbacks(sample, [
            'broker.underReplicatedPartitions', 'underReplicatedPartitions'
          ]),
          'broker.offlinePartitionsCount': this.extractMetricWithFallbacks(sample, [
            'broker.offlinePartitions', 'broker.offlinePartitionsCount', 'offlinePartitions'
          ])
        },
        
        // v3.0 Latency metrics following specification
        latency: {
          'request.produce.totalTimeMs.p50': this.extractMetricWithFallbacks(sample, [
            'request.produce.totalTimeMs.50thPercentile', 'produce.latency.p50'
          ]),
          'request.produce.totalTimeMs.p95': this.extractMetricWithFallbacks(sample, [
            'request.produce.totalTimeMs.95thPercentile', 'produce.latency.p95'
          ]),
          'request.produce.totalTimeMs.p99': this.extractMetricWithFallbacks(sample, [
            'request.produce.totalTimeMs.99thPercentile', 'produce.latency.p99'
          ]),
          'request.fetch.totalTimeMs.p50': this.extractMetricWithFallbacks(sample, [
            'request.fetch.totalTimeMs.50thPercentile', 'fetch.latency.p50'
          ]),
          'request.fetch.totalTimeMs.p95': this.extractMetricWithFallbacks(sample, [
            'request.fetch.totalTimeMs.95thPercentile', 'fetch.latency.p95'
          ]),
          'request.fetch.totalTimeMs.p99': this.extractMetricWithFallbacks(sample, [
            'request.fetch.totalTimeMs.99thPercentile', 'fetch.latency.p99'
          ])
        },
        
        // v3.0 Resource metrics
        resources: {
          'cpu.user': this.calculateCpuUsage(sample),
          'memory.heap.used': this.extractMetricWithFallbacks(sample, [
            'broker.JVMMemoryUsedPercent', 'jvmMemoryUsedPercent', 'memoryUsedPercent'
          ]),
          'disk.log.dir.used.percent': this.extractMetricWithFallbacks(sample, [
            'broker.diskUsedPercent', 'disk.usedPercent', 'diskUsedPercent'
          ]),
          'network.connections.active': this.extractMetricWithFallbacks(sample, [
            'broker.connectionCount', 'connectionCount'
          ])
        },
        
        // v3.0 Golden metrics for UI display
        goldenMetrics: [
          {
            name: 'broker.bytesInPerSecond',
            value: this.extractMetricWithFallbacks(sample, [
              'broker.bytesInPerSecond', 'bytesInPerSecond', 'net.bytesInPerSec'
            ]),
            unit: 'bytes/second'
          },
          {
            name: 'broker.cpu.usage',
            value: this.calculateCpuUsage(sample),
            unit: 'percentage'
          },
          {
            name: 'broker.memory.usage',
            value: this.extractMetricWithFallbacks(sample, [
              'broker.JVMMemoryUsedPercent', 'jvmMemoryUsedPercent', 'memoryUsedPercent'
            ]),
            unit: 'percentage'
          },
          {
            name: 'broker.partitionCount',
            value: this.extractMetricWithFallbacks(sample, [
              'broker.partitionCount', 'partitionCount'
            ]),
            unit: 'count'
          }
        ],
        
        // v3.0 Tags following specification
        tags: {
          // Technical tags
          provider: 'kafka',
          environment: this.inferEnvironment(clusterName),
          region: sample.region || 'unknown',
          version: sample.kafkaVersion || sample['kafka.version'] || 'unknown',
          
          // Infrastructure tags
          clusterName: clusterName,
          brokerId: String(brokerId),
          hostname: hostname,
          rack: sample['broker.rack'] || sample.rack || 'unknown',
          
          // Custom tags for operational management
          customTags: {
            jvmVersion: sample['broker.jvmVersion'] || 'unknown',
            kafkaCommitId: sample['kafka.commitId'] || 'unknown',
            osVersion: sample['os.version'] || 'unknown'
          }
        }
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
      // Handle both eventType and event_type field names from nri-kafka
      const eventType = sample.eventType || sample.event_type;
      if (!sample || !eventType || eventType !== 'KafkaTopicSample') {
        throw new Error(`Invalid topic sample: missing or incorrect eventType. Got: ${eventType}`);
      }

      // Extract topic name from various possible fields in nri-kafka data
      const topicName = sample['topic.name'] || sample.topic_name || sample.entityName || sample.topic;
      if (!topicName) {
        throw new Error('Topic sample missing topic name');
      }

      // Topic name was already validated above

      const clusterName = sample.clusterName || sample.cluster_name || 'default';
      const brokerId = sample['broker.id'] || sample.broker_id;
      
      // Generate GUID - include broker ID for per-topic-per-broker metrics
      let entityGuid;
      if (this.options.enablePerTopicBrokerMetrics && brokerId) {
        entityGuid = this.generateGuid('MESSAGE_QUEUE_TOPIC', 'kafka', clusterName, topicName, `broker-${brokerId}`);
      } else {
        entityGuid = this.generateGuid('MESSAGE_QUEUE_TOPIC', 'kafka', clusterName, topicName);
      }
      
      // Create entity following Queues & Streaming v3.0 specification
      const entity = {
        // Core entity fields per v3.0 spec
        eventType: 'KafkaTopicSample',
        entityType: 'MESSAGE_QUEUE_TOPIC',
        entityGuid: entityGuid,
        entityName: topicName,
        displayName: brokerId ? `${topicName} (Broker ${brokerId})` : topicName,
        domain: 'INFRA',
        reporting: true,
        
        // Provider identification per v3.0
        provider: 'kafka',
        providerAccountId: this.accountId,
        
        // v3.0 Required metadata
        metadata: {
          provider: 'kafka',
          clusterName: clusterName,
          topicName: topicName,
          partitionCount: this.extractMetricWithFallbacks(sample, ['topic.partitionCount', 'partitionCount']),
          replicationFactor: this.extractMetricWithFallbacks(sample, ['topic.replicationFactor', 'replicationFactor']),
          environment: this.inferEnvironment(clusterName),
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString()
        },
        
        // Topic-specific attributes
        topicName: topicName,
        clusterName: clusterName,
        
        // v3.0 Topic metrics following specification
        metrics: {
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
          'topic.fetchRequestsPerSecond': this.extractMetricWithFallbacks(sample, [
            'topic.fetchRequestsPerSecond', 'fetchRequestsPerSecond'
          ]),
          'topic.produceRequestsPerSecond': this.extractMetricWithFallbacks(sample, [
            'topic.produceRequestsPerSecond', 'produceRequestsPerSecond'
          ]),
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
          'topic.underReplicatedPartitions': this.extractMetricWithFallbacks(sample, [
            'topic.underReplicatedPartitions', 'underReplicatedPartitions'
          ])
        },
        
        // v3.0 Golden metrics for topics
        goldenMetrics: [
          {
            name: 'topic.throughput.in',
            value: this.extractMetricWithFallbacks(sample, [
              'topic.bytesInPerSecond', 'bytesInPerSecond'
            ]),
            unit: 'bytes/second'
          },
          {
            name: 'topic.throughput.out', 
            value: this.extractMetricWithFallbacks(sample, [
              'topic.bytesOutPerSecond', 'bytesOutPerSecond'
            ]),
            unit: 'bytes/second'
          },
          {
            name: 'topic.consumer.lag',
            value: this.extractMetricWithFallbacks(sample, [
              'topic.consumerLag', 'consumerLag'
            ]),
            unit: 'messages'
          },
          {
            name: 'topic.error.rate',
            value: this.extractMetricWithFallbacks(sample, [
              'topic.errorRate', 'errorRate'
            ]),
            unit: 'errors/second'
          }
        ],
        
        // v3.0 Tags following specification
        tags: {
          // Technical tags
          provider: 'kafka',
          environment: this.inferEnvironment(clusterName),
          region: sample.region || 'unknown',
          
          // Topic-specific tags
          topicName: topicName,
          clusterName: clusterName,
          partitionCount: String(sample['topic.partitionCount'] || sample.partitionCount || 0),
          replicationFactor: String(sample['topic.replicationFactor'] || sample.replicationFactor || 0),
          
          // Configuration tags
          isCompacted: sample['topic.config.cleanup.policy'] === 'compact' ? 'true' : 'false',
          retentionPolicy: sample['topic.config.cleanup.policy'] || 'delete',
          compressionType: sample['topic.config.compression.type'] || 'producer',
          
          // Custom tags for operational management
          customTags: {
            retentionMs: String(sample['topic.retentionMs'] || sample.retentionMs || 0),
            segmentBytes: String(sample['topic.config.segment.bytes'] || 'unknown')
          }
        }
      };
      
      // Add broker-specific tags if per-topic-per-broker metrics enabled
      if (this.options.enablePerTopicBrokerMetrics && brokerId) {
        entity.tags.brokerId = String(brokerId);
        entity.tags.customTags.isPerBrokerMetric = 'true';
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
      // Handle both eventType and event_type field names from nri-kafka  
      const eventType = sample.eventType || sample.event_type;
      if (!sample || !eventType || eventType !== 'KafkaConsumerSample') {
        throw new Error(`Invalid consumer sample: missing or incorrect eventType. Got: ${eventType}`);
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
      
      // Create entity following Queues & Streaming v3.0 specification
      const entity = {
        // Core entity fields per v3.0 spec
        eventType: 'KafkaConsumerSample',
        entityType: 'MESSAGE_QUEUE_CONSUMER_GROUP',
        entityGuid: entityGuid,
        entityName: consumerGroupId,
        displayName: partitionId !== undefined ? 
          `${consumerGroupId} (${topicName}:${partitionId})` : 
          `${consumerGroupId} (${clusterName})`,
        domain: 'INFRA',
        reporting: true,
        
        // Provider identification per v3.0
        provider: 'kafka',
        providerAccountId: this.accountId,
        
        // v3.0 Required metadata
        metadata: {
          provider: 'kafka',
          clusterName: clusterName,
          consumerGroupId: consumerGroupId,
          topicName: topicName,
          partitionId: partitionId,
          environment: this.inferEnvironment(clusterName),
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString()
        },
        
        // Consumer group attributes
        consumerGroupId: consumerGroupId,
        clusterName: clusterName,
        
        // v3.0 Consumer metrics following specification
        metrics: {
          // Enhanced lag metrics - critical for consumer group monitoring
          'consumerGroup.totalLag': lagMetrics.totalLag,
          'consumerGroup.maxLag': lagMetrics.maxLag,
          'consumerGroup.avgLag': lagMetrics.avgLag,
          'consumerGroup.lagPerPartition': lagMetrics.lagPerPartition,
          'consumerGroup.lagTrend': lagMetrics.lagTrend,
          'consumerGroup.lagStabilityScore': lagMetrics.stabilityScore,
          
          // State and membership metrics
          'consumerGroup.memberCount': this.extractMetricWithFallbacks(sample, [
            'consumer.memberCount', 'consumer.members', 'memberCount'
          ]),
          'consumerGroup.activeMembers': this.extractMetricWithFallbacks(sample, [
            'consumer.activeMembers', 'activeMembers'
          ]),
          
          // Consumption metrics
          'consumerGroup.messagesConsumedPerSecond': this.extractMetricWithFallbacks(sample, [
            'consumer.messagesConsumedPerSecond', 'consumer.messageRate', 'messagesConsumedPerSecond'
          ]),
          'consumerGroup.bytesConsumedPerSecond': this.extractMetricWithFallbacks(sample, [
            'consumer.bytesConsumedPerSecond', 'bytesConsumedPerSecond'
          ]),
          'consumerGroup.recordsPerPoll': this.extractMetricWithFallbacks(sample, [
            'consumer.recordsPerPoll', 'recordsPerPoll'
          ]),
          
          // Offset metrics
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
          ])
        },
        
        // v3.0 Golden metrics for consumer groups
        goldenMetrics: [
          {
            name: 'consumer.lag',
            value: lagMetrics.totalLag,
            unit: 'messages'
          },
          {
            name: 'consumer.throughput',
            value: this.extractMetricWithFallbacks(sample, [
              'consumer.messagesConsumedPerSecond', 'consumer.messageRate', 'messagesConsumedPerSecond'
            ]),
            unit: 'messages/second'
          },
          {
            name: 'consumer.stability.score',
            value: lagMetrics.stabilityScore,
            unit: 'score'
          },
          {
            name: 'consumer.member.count',
            value: this.extractMetricWithFallbacks(sample, [
              'consumer.memberCount', 'consumer.members', 'memberCount'
            ]),
            unit: 'count'
          }
        ],
        
        // State and membership with enhanced detection (keeping for backward compatibility)
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
        
        // v3.0 Tags following specification
        tags: {
          // Technical tags
          provider: 'kafka',
          environment: this.inferEnvironment(clusterName),
          region: sample.region || 'unknown',
          
          // Consumer group specific tags
          consumerGroupId: consumerGroupId,
          clusterName: clusterName,
          topicName: topicName,
          state: sample['consumer.state'] || 'STABLE',
          clientId: sample['consumer.clientId'] || 'unknown',
          protocol: sample['consumer.protocol'] || 'unknown',
          assignmentStrategy: sample['consumer.assignmentStrategy'] || 'unknown',
          
          // Custom tags for operational management
          customTags: {
            partitionId: partitionId ? String(partitionId) : 'unknown',
            memberCount: String(this.extractMetricWithFallbacks(sample, [
              'consumer.memberCount', 'consumer.members', 'memberCount'
            ])),
            isPerPartitionMetric: partitionId !== undefined ? 'true' : 'false'
          }
        }
      };
      
      // Update partition-specific tags if available
      if (partitionId !== undefined) {
        entity.tags.partitionId = String(partitionId);
        entity.tags.customTags.isPerPartitionMetric = 'true';
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
   * Create a cluster entity by aggregating broker data with enhanced metrics
   */
  createClusterEntity(brokerSamples, topicSamples = [], consumerGroupSamples = []) {
    const startTime = performance.now();
    
    try {
      if (!brokerSamples || brokerSamples.length === 0) {
        return null;
      }

      const clusterName = brokerSamples[0].clusterName || 'default';
      const kafkaVersion = brokerSamples[0].kafkaVersion || 'unknown';
      
      // Generate GUID for cluster
      const entityGuid = this.generateGuid('MESSAGE_QUEUE_CLUSTER', 'kafka', clusterName);
      
      // Enhanced aggregation with topic and consumer group data
      const aggregatedMetrics = this.aggregateClusterMetrics(brokerSamples, topicSamples, consumerGroupSamples);
      const brokerCount = brokerSamples.length;
      
      // Create cluster entity following v3.0 specification
      const entity = {
        // Core entity fields per v3.0 spec
        eventType: 'KafkaClusterSample',
        entityType: 'MESSAGE_QUEUE_CLUSTER',
        entityGuid: entityGuid,
        entityName: clusterName,
        displayName: `Kafka Cluster: ${clusterName}`,
        domain: 'INFRA',
        reporting: true,
        
        // Provider identification per v3.0
        provider: 'kafka',
        providerAccountId: this.accountId,
        
        // v3.0 Required metadata
        metadata: {
          provider: 'kafka',
          clusterName: clusterName,
          brokerCount: brokerCount,
          version: kafkaVersion,
          region: brokerSamples[0]?.region || 'unknown',
          environment: this.inferEnvironment(clusterName),
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString()
        },
        
        // Cluster attributes
        clusterName: clusterName,
        
        // v3.0 Cluster metrics following specification
        metrics: {
          // Enhanced broker metrics
          'cluster.brokerCount': brokerCount,
          'cluster.brokersOnline': aggregatedMetrics.brokersOnline,
          'cluster.brokersOffline': Math.max(0, brokerCount - aggregatedMetrics.brokersOnline),
          
          // Throughput metrics with additional calculations
          'cluster.throughput.messagesPerSecond': aggregatedMetrics.messagesIn + aggregatedMetrics.messagesOut,
          'cluster.throughput.bytesPerSecond': aggregatedMetrics.bytesIn + aggregatedMetrics.bytesOut,
          'cluster.messagesInPerSecond': aggregatedMetrics.messagesIn,
          'cluster.messagesOutPerSecond': aggregatedMetrics.messagesOut,
          'cluster.bytesInPerSecond': aggregatedMetrics.bytesIn,
          'cluster.bytesOutPerSecond': aggregatedMetrics.bytesOut,
          
          // Average and peak resource utilization
          'cluster.cpu.avgUsage': aggregatedMetrics.avgCpuUsage,
          'cluster.cpu.maxUsage': aggregatedMetrics.maxCpuUsage,
          'cluster.memory.avgUsage': aggregatedMetrics.avgMemoryUsage,
          'cluster.memory.maxUsage': aggregatedMetrics.maxMemoryUsage,
          'cluster.disk.avgUsage': aggregatedMetrics.avgDiskUsage,
          'cluster.disk.maxUsage': aggregatedMetrics.maxDiskUsage,
          
          // Enhanced health metrics
          'cluster.underReplicatedPartitions': aggregatedMetrics.underReplicatedPartitions,
          'cluster.offlinePartitions': aggregatedMetrics.offlinePartitions,
          'cluster.health.score': this.calculateEnhancedHealthScore(aggregatedMetrics, brokerCount),
          'cluster.health.brokerHealthScore': aggregatedMetrics.brokerHealthScore,
          'cluster.health.replicationHealthScore': aggregatedMetrics.replicationHealthScore,
          
          // Topic aggregations
          'cluster.topicCount': aggregatedMetrics.topicCount,
          'cluster.totalPartitions': aggregatedMetrics.totalPartitions,
          'cluster.avgPartitionsPerTopic': aggregatedMetrics.avgPartitionsPerTopic,
          'cluster.avgReplicationFactor': aggregatedMetrics.avgReplicationFactor,
          
          // Consumer group aggregations
          'cluster.consumerGroupCount': aggregatedMetrics.consumerGroupCount,
          'cluster.totalConsumerLag': aggregatedMetrics.totalConsumerLag,
          'cluster.maxConsumerLag': aggregatedMetrics.maxConsumerLag,
          'cluster.avgConsumerLag': aggregatedMetrics.avgConsumerLag,
          
          // Network and request metrics
          'cluster.requestsPerSecond': aggregatedMetrics.requestsPerSecond,
          'cluster.avgNetworkProcessorIdle': aggregatedMetrics.avgNetworkProcessorIdle,
          'cluster.avgRequestHandlerIdle': aggregatedMetrics.avgRequestHandlerIdle
        },
        
        // v3.0 Golden metrics for clusters
        goldenMetrics: [
          {
            name: 'cluster.health.score',
            value: this.calculateEnhancedHealthScore(aggregatedMetrics, brokerCount),
            unit: 'percentage'
          },
          {
            name: 'cluster.availability.percentage',
            value: (aggregatedMetrics.brokersOnline / brokerCount) * 100,
            unit: 'percentage'
          },
          {
            name: 'cluster.throughput.total',
            value: aggregatedMetrics.messagesIn + aggregatedMetrics.messagesOut,
            unit: 'messages/second'
          },
          {
            name: 'cluster.error.rate',
            value: aggregatedMetrics.underReplicatedPartitions + aggregatedMetrics.offlinePartitions,
            unit: 'errors/second'
          }
        ],
        
        // v3.0 Tags following specification
        tags: {
          // Technical tags
          provider: 'kafka',
          environment: this.inferEnvironment(clusterName),
          region: brokerSamples[0]?.region || 'unknown',
          version: kafkaVersion,
          
          // Cluster-specific tags
          clusterName: clusterName,
          brokerCount: String(brokerCount),
          topicCount: String(aggregatedMetrics.topicCount),
          consumerGroupCount: String(aggregatedMetrics.consumerGroupCount),
          
          // Health and operational tags
          healthStatus: this.getHealthStatus(this.calculateEnhancedHealthScore(aggregatedMetrics, brokerCount)),
          availability: String(Math.round((aggregatedMetrics.brokersOnline / brokerCount) * 100)),
          
          // Custom tags for operational management
          customTags: {
            totalPartitions: String(aggregatedMetrics.totalPartitions),
            avgReplicationFactor: String(Math.round(aggregatedMetrics.avgReplicationFactor * 100) / 100),
            maxConsumerLag: String(aggregatedMetrics.maxConsumerLag)
          }
        }
      };
      
      // Apply metric definitions and validation
      const processedEntity = this.applyMetricDefinitions(entity, 'cluster');
      
      // Track performance
      const duration = performance.now() - startTime;
      this.updatePerformanceStats(duration);
      
      return processedEntity;
      
    } catch (error) {
      console.error(chalk.red(`❌ Cluster entity creation failed: ${error.message}`));
      return null;
    }
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
   * Transform a batch of nri-kafka samples to MESSAGE_QUEUE entities with enhanced error handling
   */
  transformSamples(samples) {
    if (!samples || !Array.isArray(samples)) {
      throw new Error('Samples must be a non-empty array');
    }

    const entities = [];
    const brokerSamples = [];
    const topicSamples = [];
    const consumerGroupSamples = [];
    const transformationErrors = [];
    const startTime = Date.now();
    
    console.log(chalk.blue(`🔄 Transforming ${samples.length} samples...`));
    
    // First pass: categorize and validate samples
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

        // Categorize samples for later processing
        if (sample.eventType === 'KafkaBrokerSample') {
          brokerSamples.push({ sample, index });
        } else if (sample.eventType === 'KafkaTopicSample') {
          topicSamples.push({ sample, index });
        } else if (sample.eventType === 'KafkaConsumerSample') {
          consumerGroupSamples.push({ sample, index });
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
          error: `Sample categorization failed: ${error.message}`,
          eventType: sample?.eventType
        });
      }
    });
    
    // Second pass: transform entities with retry logic
    const processSamplesWithRetry = (sampleInfoArray, transformFn, entityType) => {
      sampleInfoArray.forEach(({ sample, index }) => {
        let retryCount = 0;
        const maxRetries = this.options.strictMode ? 0 : 1;
        
        while (retryCount <= maxRetries) {
          try {
            const entity = transformFn.call(this, sample);
            if (entity) {
              entities.push(entity);
            }
            break; // Success, exit retry loop
          } catch (error) {
            retryCount++;
            if (retryCount > maxRetries) {
              transformationErrors.push({
                index,
                error: `${entityType} transformation failed after ${maxRetries + 1} attempts: ${error.message}`,
                eventType: sample.eventType,
                retryCount
              });
            } else {
              console.warn(chalk.yellow(`⚠️  Retrying ${entityType} transformation for sample ${index}: ${error.message}`));
            }
          }
        }
      });
    };
    
    // Transform each entity type
    processSamplesWithRetry(brokerSamples, this.transformBrokerSample, 'Broker');
    processSamplesWithRetry(topicSamples, this.transformTopicSample, 'Topic');
    processSamplesWithRetry(consumerGroupSamples, this.transformConsumerSample, 'Consumer Group');
    
    // Create cluster entity with all available data
    if (brokerSamples.length > 0) {
      try {
        const clusterEntity = this.createClusterEntity(
          brokerSamples.map(bs => bs.sample),
          topicSamples.map(ts => ts.sample),
          consumerGroupSamples.map(cgs => cgs.sample)
        );
        if (clusterEntity) {
          entities.push(clusterEntity);
        }
      } catch (error) {
        transformationErrors.push({
          type: 'cluster',
          error: `Cluster aggregation failed: ${error.message}`,
          brokerCount: brokerSamples.length,
          topicCount: topicSamples.length,
          consumerGroupCount: consumerGroupSamples.length
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
    
    // Enhanced statistics
    const stats = {
      totalSamples: samples.length,
      entitiesCreated: entities.length,
      brokerEntities: entities.filter(e => e.entityType === 'MESSAGE_QUEUE_BROKER').length,
      topicEntities: entities.filter(e => e.entityType === 'MESSAGE_QUEUE_TOPIC').length,
      clusterEntities: entities.filter(e => e.entityType === 'MESSAGE_QUEUE_CLUSTER').length,
      consumerGroupEntities: entities.filter(e => e.entityType === 'MESSAGE_QUEUE_CONSUMER_GROUP').length,
      transformationErrors: transformationErrors.length,
      transformationDuration: duration,
      transformationRate: samples.length / (duration / 1000), // samples per second
      successRate: ((samples.length - transformationErrors.length) / samples.length * 100).toFixed(2),
      
      // Performance metrics
      performanceMetrics: {
        samplesPerSecond: (samples.length / (duration / 1000)).toFixed(0),
        avgTransformationTime: this.stats.performanceMetrics.avgTransformationTime.toFixed(2),
        maxTransformationTime: this.stats.performanceMetrics.maxTransformationTime.toFixed(2)
      },
      
      // Validation metrics
      validationMetrics: {
        validationErrors: this.stats.validationErrors,
        metricValidationErrors: this.stats.metricValidationErrors,
        skippedSamples: this.stats.skippedSamples
      }
    };
    
    console.log(chalk.green(`✅ Transformation completed: ${stats.entitiesCreated} entities created from ${stats.totalSamples} samples (${stats.successRate}% success rate)`));
    
    return {
      entities,
      stats,
      errors: transformationErrors,
      transformerStats: this.stats
    };
  }

  /**
   * Cache consumer group metrics for aggregation
   */
  cacheConsumerGroupMetrics(consumerGroupId, clusterName, topicName, entity) {
    const key = `${clusterName}:${consumerGroupId}`;
    if (!this.consumerGroupCache.has(key)) {
      this.consumerGroupCache.set(key, []);
    }
    this.consumerGroupCache.get(key).push({
      topicName,
      entity,
      timestamp: Date.now()
    });
  }

  /**
   * Extract metric with fallback values
   */
  extractMetricWithFallbacks(sample, fieldPaths, defaultValue = 0) {
    for (const path of fieldPaths) {
      const value = sample[path];
      if (value !== undefined && value !== null && !isNaN(value)) {
        return Number(value);
      }
    }
    return defaultValue;
  }

  /**
   * Calculate CPU usage with fallbacks and calculations
   */
  calculateCpuUsage(sample) {
    // Try direct CPU percentage first
    const directCpu = this.extractMetricWithFallbacks(sample, [
      'broker.cpuPercent', 'cpuPercent', 'cpu.usage'
    ]);
    
    if (directCpu > 0) {
      return directCpu;
    }
    
    // Calculate from IO wait if available
    const ioWait = this.extractMetricWithFallbacks(sample, [
      'broker.IOWaitPercent', 'IOWaitPercent'
    ]);
    
    if (ioWait > 0) {
      return Math.max(0, 100 - ioWait);
    }
    
    return 0;
  }

  /**
   * Calculate consumer lag metrics with trend analysis
   */
  calculateConsumerLagMetrics(sample) {
    const totalLag = this.extractMetricWithFallbacks(sample, [
      'consumer.totalLag', 'consumer.lag', 'totalLag'
    ]);
    
    const maxLag = this.extractMetricWithFallbacks(sample, [
      'consumer.maxLag', 'maxLag'
    ]);
    
    const avgLag = this.extractMetricWithFallbacks(sample, [
      'consumer.avgLag', 'avgLag'
    ]);
    
    const lagPerPartition = this.extractMetricWithFallbacks(sample, [
      'consumer.lagPerPartition', 'lagPerPartition'
    ]);
    
    // Calculate lag trend (simplified)
    const previousLag = this.extractMetricWithFallbacks(sample, [
      'consumer.previousLag', 'previousTotalLag'
    ]);
    
    let lagTrend = 'stable';
    if (previousLag > 0) {
      const lagChange = totalLag - previousLag;
      const changePercent = (lagChange / previousLag) * 100;
      
      if (changePercent > 10) {
        lagTrend = 'increasing';
      } else if (changePercent < -10) {
        lagTrend = 'decreasing';
      }
    }
    
    // Calculate stability score (0-100)
    let stabilityScore = 100;
    if (totalLag > 1000) stabilityScore -= 30;
    if (maxLag > 5000) stabilityScore -= 20;
    if (lagTrend === 'increasing') stabilityScore -= 25;
    
    return {
      totalLag,
      maxLag,
      avgLag,
      lagPerPartition,
      lagTrend,
      stabilityScore: Math.max(0, stabilityScore)
    };
  }

  /**
   * Get consumer state flag
   */
  getConsumerStateFlag(sample, targetState) {
    const state = this.extractMetricWithFallbacks(sample, [
      'consumer.state', 'state', 'group.state'
    ], 'STABLE');
    
    return state === targetState ? 1 : 0;
  }

  /**
   * Cache topic-broker metrics for aggregation
   */
  cacheTopicBrokerMetrics(topicName, clusterName, brokerId, entity) {
    const key = `${clusterName}:${topicName}`;
    if (!this.topicBrokerMetricsCache.has(key)) {
      this.topicBrokerMetricsCache.set(key, []);
    }
    this.topicBrokerMetricsCache.get(key).push({
      brokerId,
      entity,
      timestamp: Date.now()
    });
  }

  /**
   * Update performance statistics
   */
  updatePerformanceStats(duration) {
    this.stats.totalTransformations++;
    this.stats.performanceMetrics.totalTransformationTime += duration;
    this.stats.performanceMetrics.maxTransformationTime = Math.max(
      this.stats.performanceMetrics.maxTransformationTime,
      duration
    );
    this.stats.performanceMetrics.avgTransformationTime = 
      this.stats.performanceMetrics.totalTransformationTime / this.stats.totalTransformations;
  }

  /**
   * Get comprehensive transformer statistics
   */
  getTransformerStats() {
    return {
      ...this.stats,
      cacheStats: {
        topicBrokerMetricsCacheSize: this.topicBrokerMetricsCache.size,
        consumerGroupCacheSize: this.consumerGroupCache.size
      },
      configuration: {
        enableValidation: this.options.enableValidation,
        enablePerTopicBrokerMetrics: this.options.enablePerTopicBrokerMetrics,
        strictMode: this.options.strictMode
      }
    };
  }

  /**
   * Clear caches and reset statistics
   */
  reset() {
    this.topicBrokerMetricsCache.clear();
    this.consumerGroupCache.clear();
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
    console.log(chalk.blue('🔄 Transformer statistics and caches reset'));
  }

  /**
   * Aggregate cluster metrics from all entity types
   */
  aggregateClusterMetrics(brokerSamples, topicSamples = [], consumerGroupSamples = []) {
    const metrics = {
      // Broker aggregations
      messagesIn: 0,
      messagesOut: 0,
      bytesIn: 0,
      bytesOut: 0,
      requestsPerSecond: 0,
      brokersOnline: 0,
      
      // Resource aggregations
      totalCpuUsage: 0,
      totalMemoryUsage: 0,
      totalDiskUsage: 0,
      maxCpuUsage: 0,
      maxMemoryUsage: 0,
      maxDiskUsage: 0,
      
      // Health aggregations
      underReplicatedPartitions: 0,
      offlinePartitions: 0,
      
      // Network aggregations
      totalNetworkProcessorIdle: 0,
      totalRequestHandlerIdle: 0,
      
      // Topic aggregations
      topicCount: 0,
      totalPartitions: 0,
      totalReplicationFactor: 0,
      
      // Consumer group aggregations
      consumerGroupCount: 0,
      totalConsumerLag: 0,
      maxConsumerLag: 0,
      totalConsumerGroups: 0
    };
    
    // Aggregate broker metrics
    brokerSamples.forEach(sample => {
      if (sample && typeof sample === 'object') {
        metrics.messagesIn += this.extractMetricWithFallbacks(sample, ['broker.messagesInPerSecond', 'messagesInPerSecond']);
        metrics.messagesOut += this.extractMetricWithFallbacks(sample, ['broker.messagesOutPerSecond', 'messagesOutPerSecond']);
        metrics.bytesIn += this.extractMetricWithFallbacks(sample, ['broker.bytesInPerSecond', 'bytesInPerSecond']);
        metrics.bytesOut += this.extractMetricWithFallbacks(sample, ['broker.bytesOutPerSecond', 'bytesOutPerSecond']);
        metrics.requestsPerSecond += this.extractMetricWithFallbacks(sample, ['broker.requestsPerSecond', 'requestsPerSecond']);
        
        const cpuUsage = this.calculateCpuUsage(sample);
        const memoryUsage = this.extractMetricWithFallbacks(sample, ['broker.JVMMemoryUsedPercent', 'memoryUsage']);
        const diskUsage = this.extractMetricWithFallbacks(sample, ['broker.diskUsedPercent', 'diskUsage']);
        
        metrics.totalCpuUsage += cpuUsage;
        metrics.totalMemoryUsage += memoryUsage;
        metrics.totalDiskUsage += diskUsage;
        metrics.maxCpuUsage = Math.max(metrics.maxCpuUsage, cpuUsage);
        metrics.maxMemoryUsage = Math.max(metrics.maxMemoryUsage, memoryUsage);
        metrics.maxDiskUsage = Math.max(metrics.maxDiskUsage, diskUsage);
        
        metrics.underReplicatedPartitions += this.extractMetricWithFallbacks(sample, ['broker.underReplicatedPartitions', 'underReplicatedPartitions']);
        metrics.offlinePartitions += this.extractMetricWithFallbacks(sample, ['broker.offlinePartitions', 'offlinePartitions']);
        
        metrics.totalNetworkProcessorIdle += this.extractMetricWithFallbacks(sample, ['broker.networkProcessorIdlePercent', 'networkProcessorIdlePercent']);
        metrics.totalRequestHandlerIdle += this.extractMetricWithFallbacks(sample, ['broker.requestHandlerIdlePercent', 'requestHandlerIdlePercent']);
        
        if (cpuUsage > 0 || memoryUsage > 0) {
          metrics.brokersOnline++;
        }
      }
    });
    
    // Aggregate topic metrics
    const uniqueTopics = new Set();
    topicSamples.forEach(sample => {
      if (sample && typeof sample === 'object') {
        const topicName = sample['topic.name'] || sample.topic_name;
        if (topicName) {
          uniqueTopics.add(topicName);
          metrics.totalPartitions += this.extractMetricWithFallbacks(sample, ['topic.partitionCount', 'partitionCount']);
          metrics.totalReplicationFactor += this.extractMetricWithFallbacks(sample, ['topic.replicationFactor', 'replicationFactor']);
        }
      }
    });
    metrics.topicCount = uniqueTopics.size;
    
    // Aggregate consumer group metrics
    const uniqueConsumerGroups = new Set();
    consumerGroupSamples.forEach(sample => {
      if (sample && typeof sample === 'object') {
        const groupId = sample['consumer.groupId'] || sample.consumer_group_id;
        if (groupId) {
          uniqueConsumerGroups.add(groupId);
          const lag = this.extractMetricWithFallbacks(sample, ['consumer.totalLag', 'consumer.lag', 'totalLag']);
          metrics.totalConsumerLag += lag;
          metrics.maxConsumerLag = Math.max(metrics.maxConsumerLag, lag);
        }
      }
    });
    metrics.consumerGroupCount = uniqueConsumerGroups.size;
    
    // Calculate averages
    const brokerCount = brokerSamples.length;
    return {
      ...metrics,
      avgCpuUsage: brokerCount > 0 ? metrics.totalCpuUsage / brokerCount : 0,
      avgMemoryUsage: brokerCount > 0 ? metrics.totalMemoryUsage / brokerCount : 0,
      avgDiskUsage: brokerCount > 0 ? metrics.totalDiskUsage / brokerCount : 0,
      avgNetworkProcessorIdle: brokerCount > 0 ? metrics.totalNetworkProcessorIdle / brokerCount : 0,
      avgRequestHandlerIdle: brokerCount > 0 ? metrics.totalRequestHandlerIdle / brokerCount : 0,
      avgPartitionsPerTopic: metrics.topicCount > 0 ? metrics.totalPartitions / metrics.topicCount : 0,
      avgReplicationFactor: metrics.topicCount > 0 ? metrics.totalReplicationFactor / metrics.topicCount : 0,
      avgConsumerLag: metrics.consumerGroupCount > 0 ? metrics.totalConsumerLag / metrics.consumerGroupCount : 0,
      
      // Health scores
      brokerHealthScore: this.calculateBrokerHealthScore(metrics, brokerCount),
      replicationHealthScore: this.calculateReplicationHealthScore(metrics),
      healthScore: 0 // Will be calculated in calculateEnhancedHealthScore
    };
  }

  /**
   * Calculate enhanced cluster health score (0-100)
   */
  calculateEnhancedHealthScore(metrics, brokerCount) {
    let score = 100;
    
    // Critical issues (high impact)
    if (metrics.offlinePartitions > 0) {
      score -= Math.min(40, metrics.offlinePartitions * 20);
    }
    
    const brokersOffline = Math.max(0, brokerCount - metrics.brokersOnline);
    if (brokersOffline > 0) {
      score -= Math.min(30, (brokersOffline / brokerCount) * 100);
    }
    
    // Important issues (medium impact)
    if (metrics.underReplicatedPartitions > 0) {
      score -= Math.min(25, metrics.underReplicatedPartitions * 3);
    }
    
    if (metrics.maxCpuUsage > 90) {
      score -= 15;
    }
    
    if (metrics.maxMemoryUsage > 90) {
      score -= 15;
    }
    
    // Performance issues (low impact)
    if (metrics.avgNetworkProcessorIdle < 20) {
      score -= 10;
    }
    
    if (metrics.avgRequestHandlerIdle < 20) {
      score -= 10;
    }
    
    if (metrics.totalConsumerLag > 10000) {
      score -= Math.min(15, (metrics.totalConsumerLag / 50000) * 15);
    }
    
    return Math.max(0, Math.round(score));
  }

  /**
   * Calculate broker health score
   */
  calculateBrokerHealthScore(metrics, brokerCount) {
    if (brokerCount === 0) return 0;
    
    let score = 100;
    
    const onlineRatio = metrics.brokersOnline / brokerCount;
    if (onlineRatio < 1) {
      score -= (1 - onlineRatio) * 50;
    }
    
    if (metrics.avgCpuUsage > 80) {
      score -= Math.min(20, (metrics.avgCpuUsage - 80) * 2);
    }
    
    if (metrics.avgMemoryUsage > 80) {
      score -= Math.min(20, (metrics.avgMemoryUsage - 80) * 2);
    }
    
    return Math.max(0, Math.round(score));
  }

  /**
   * Calculate replication health score
   */
  calculateReplicationHealthScore(metrics) {
    let score = 100;
    
    if (metrics.offlinePartitions > 0) {
      score -= Math.min(60, metrics.offlinePartitions * 15);
    }
    
    if (metrics.underReplicatedPartitions > 0) {
      score -= Math.min(40, metrics.underReplicatedPartitions * 5);
    }
    
    return Math.max(0, Math.round(score));
  }

  /**
   * Get health status text
   */
  getHealthStatus(score) {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    if (score >= 40) return 'poor';
    return 'critical';
  }
}

module.exports = NriKafkaTransformer;