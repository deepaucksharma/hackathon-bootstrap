/**
 * Kafka Provider Hook
 * 
 * Handles standard Apache Kafka provider-specific transformations
 * and entity enhancements. Provides default Kafka behavior for
 * data transformation and entity creation.
 */

const BaseProviderHook = require('./base-provider-hook');

class KafkaProviderHook extends BaseProviderHook {
  constructor(config = {}) {
    super({
      providerType: 'kafka',
      enabled: true,
      features: {
        clusterAggregation: true,
        metricNormalization: true,
        entityRelationships: true,
        ...config.features
      },
      ...config
    });
    
    this.metricMappings = this._initializeMetricMappings();
  }

  /**
   * Transform broker data with Kafka-specific logic
   * @param {Object} brokerData - Raw broker data
   * @param {Object} context - Additional context
   * @returns {Object} Transformed broker data
   */
  transformBrokerData(brokerData, context = {}) {
    try {
      const transformed = {
        ...brokerData,
        // Normalize broker ID
        brokerId: this._normalizeBrokerId(brokerData),
        
        // Add Kafka-specific metadata
        metadata: {
          ...brokerData.metadata,
          kafkaVersion: brokerData.kafkaVersion || context.kafkaVersion,
          jvmMetrics: this._extractJvmMetrics(brokerData),
          networkMetrics: this._extractNetworkMetrics(brokerData)
        },
        
        // Normalize metrics
        metrics: this._normalizeMetrics(brokerData.metrics || {}, 'broker')
      };
      
      // Add cluster information if available
      if (context.clusterName || brokerData.clusterName) {
        transformed.clusterName = context.clusterName || brokerData.clusterName;
      }
      
      return transformed;
    } catch (error) {
      return this.handleError(error, 'transformBrokerData', brokerData);
    }
  }

  /**
   * Transform topic data with Kafka-specific logic
   * @param {Object} topicData - Raw topic data
   * @param {Object} context - Additional context
   * @returns {Object} Transformed topic data
   */
  transformTopicData(topicData, context = {}) {
    try {
      const transformed = {
        ...topicData,
        // Normalize topic name
        topicName: topicData.topicName || topicData.topic || topicData.name,
        
        // Add Kafka-specific metadata
        metadata: {
          ...topicData.metadata,
          partitionCount: topicData.partitionCount || topicData.partitions,
          replicationFactor: topicData.replicationFactor || topicData.replicas,
          retentionMs: topicData.retentionMs || topicData['retention.ms'],
          cleanupPolicy: topicData.cleanupPolicy || topicData['cleanup.policy']
        },
        
        // Normalize metrics
        metrics: this._normalizeMetrics(topicData.metrics || {}, 'topic')
      };
      
      // Calculate derived metrics
      if (this.isFeatureEnabled('metricNormalization')) {
        transformed.metrics.derived = this._calculateTopicDerivedMetrics(transformed);
      }
      
      return transformed;
    } catch (error) {
      return this.handleError(error, 'transformTopicData', topicData);
    }
  }

  /**
   * Transform consumer group data with Kafka-specific logic
   * @param {Object} consumerGroupData - Raw consumer group data
   * @param {Object} context - Additional context
   * @returns {Object} Transformed consumer group data
   */
  transformConsumerGroupData(consumerGroupData, context = {}) {
    try {
      const transformed = {
        ...consumerGroupData,
        // Normalize consumer group name
        consumerGroup: consumerGroupData.consumerGroup || consumerGroupData.group || consumerGroupData.name,
        
        // Add Kafka-specific metadata
        metadata: {
          ...consumerGroupData.metadata,
          state: consumerGroupData.state || 'Unknown',
          protocol: consumerGroupData.protocol || 'range',
          members: consumerGroupData.members || []
        },
        
        // Normalize metrics
        metrics: this._normalizeMetrics(consumerGroupData.metrics || {}, 'consumerGroup')
      };
      
      // Calculate lag metrics
      if (this.isFeatureEnabled('metricNormalization')) {
        transformed.metrics.lag = this._calculateConsumerLagMetrics(transformed);
      }
      
      return transformed;
    } catch (error) {
      return this.handleError(error, 'transformConsumerGroupData', consumerGroupData);
    }
  }

  /**
   * Transform cluster data with Kafka-specific logic
   * @param {Object} clusterData - Raw cluster data
   * @param {Object} context - Additional context
   * @returns {Object} Transformed cluster data
   */
  transformClusterData(clusterData, context = {}) {
    try {
      const transformed = {
        ...clusterData,
        // Normalize cluster name
        clusterName: clusterData.clusterName || clusterData.cluster || clusterData.name,
        
        // Add Kafka-specific metadata
        metadata: {
          ...clusterData.metadata,
          brokerCount: clusterData.brokerCount || (clusterData.brokers && clusterData.brokers.length) || 0,
          topicCount: clusterData.topicCount || (clusterData.topics && clusterData.topics.length) || 0,
          kafkaVersion: clusterData.kafkaVersion || context.kafkaVersion
        },
        
        // Initialize cluster metrics
        metrics: this._normalizeMetrics(clusterData.metrics || {}, 'cluster')
      };
      
      return transformed;
    } catch (error) {
      return this.handleError(error, 'transformClusterData', clusterData);
    }
  }

  /**
   * Generate Kafka-specific entity GUID
   * @param {string} entityType - Entity type
   * @param {Object} entityData - Entity data
   * @param {Object} context - Additional context
   * @returns {string} Generated GUID
   */
  generateEntityGuid(entityType, entityData, context = {}) {
    const accountId = context.accountId || 'unknown';
    const provider = 'kafka';
    
    let identifiers;
    switch (entityType) {
      case 'MESSAGE_QUEUE_BROKER':
        const brokerId = this._normalizeBrokerId(entityData);
        const clusterName = entityData.clusterName || context.clusterName || 'default';
        identifiers = `${clusterName}-broker-${brokerId}`;
        break;
      case 'MESSAGE_QUEUE_TOPIC':
        const topicName = entityData.topicName || entityData.topic || entityData.name;
        const topicCluster = entityData.clusterName || context.clusterName || 'default';
        identifiers = `${topicCluster}-topic-${topicName}`;
        break;
      case 'MESSAGE_QUEUE_CLUSTER':
        const cluster = entityData.clusterName || entityData.cluster || entityData.name;
        identifiers = `cluster-${cluster}`;
        break;
      case 'MESSAGE_QUEUE_CONSUMER_GROUP':
        const consumerGroup = entityData.consumerGroup || entityData.group || entityData.name;
        const cgCluster = entityData.clusterName || context.clusterName || 'default';
        identifiers = `${cgCluster}-consumer-group-${consumerGroup}`;
        break;
      default:
        identifiers = `unknown-${Date.now()}`;
    }
    
    return `${entityType}|${accountId}|${provider}|${identifiers}`;
  }

  /**
   * Generate Kafka-specific entity name
   * @param {string} entityType - Entity type
   * @param {Object} entityData - Entity data
   * @param {Object} context - Additional context
   * @returns {string} Generated entity name
   */
  generateEntityName(entityType, entityData, context = {}) {
    const clusterName = entityData.clusterName || context.clusterName || 'kafka';
    
    switch (entityType) {
      case 'MESSAGE_QUEUE_BROKER':
        const brokerId = this._normalizeBrokerId(entityData);
        return `${clusterName} Broker ${brokerId}`;
      case 'MESSAGE_QUEUE_TOPIC':
        const topicName = entityData.topicName || entityData.topic || entityData.name;
        return `${clusterName} Topic: ${topicName}`;
      case 'MESSAGE_QUEUE_CLUSTER':
        const cluster = entityData.clusterName || entityData.cluster || entityData.name;
        return `Kafka Cluster: ${cluster}`;
      case 'MESSAGE_QUEUE_CONSUMER_GROUP':
        const consumerGroup = entityData.consumerGroup || entityData.group || entityData.name;
        return `${clusterName} Consumer Group: ${consumerGroup}`;
      default:
        return `Kafka ${entityType}`;
    }
  }

  /**
   * Aggregate metrics at cluster level for Kafka
   * @param {Array} entities - Entities to aggregate
   * @param {string} metricType - Type of metric to aggregate
   * @returns {Object} Aggregated metrics
   */
  aggregateClusterMetrics(entities, metricType = 'throughput') {
    if (!this.isFeatureEnabled('clusterAggregation')) {
      return {};
    }
    
    const aggregated = {
      brokerCount: 0,
      totalBytesIn: 0,
      totalBytesOut: 0,
      totalMessagesIn: 0,
      totalPartitions: 0,
      totalTopics: new Set(),
      avgCpuUsage: 0,
      avgMemoryUsage: 0,
      totalConnections: 0
    };
    
    let brokerCpuSum = 0;
    let brokerMemSum = 0;
    let brokerCount = 0;
    
    entities.forEach(entity => {
      if (entity.entityType === 'MESSAGE_QUEUE_BROKER') {
        brokerCount++;
        aggregated.brokerCount++;
        
        const metrics = entity.metrics || {};
        aggregated.totalBytesIn += metrics.bytesInPerSecond || 0;
        aggregated.totalBytesOut += metrics.bytesOutPerSecond || 0;
        aggregated.totalMessagesIn += metrics.messagesInPerSecond || 0;
        aggregated.totalConnections += metrics.connectionCount || 0;
        
        brokerCpuSum += metrics.cpuUsage || 0;
        brokerMemSum += metrics.memoryUsage || 0;
      } else if (entity.entityType === 'MESSAGE_QUEUE_TOPIC') {
        aggregated.totalPartitions += entity.metadata?.partitionCount || 1;
        aggregated.totalTopics.add(entity.topicName || entity.name);
      }
    });
    
    // Calculate averages
    if (brokerCount > 0) {
      aggregated.avgCpuUsage = brokerCpuSum / brokerCount;
      aggregated.avgMemoryUsage = brokerMemSum / brokerCount;
    }
    
    aggregated.totalTopics = aggregated.totalTopics.size;
    
    return aggregated;
  }

  /**
   * Initialize metric mappings for normalization
   * @private
   * @returns {Object} Metric mappings
   */
  _initializeMetricMappings() {
    return {
      broker: {
        'kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec': 'bytesInPerSecond',
        'kafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec': 'bytesOutPerSecond',
        'kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec': 'messagesInPerSecond',
        'bytesInPerSecond': 'bytesInPerSecond',
        'bytesOutPerSecond': 'bytesOutPerSecond',
        'messagesInPerSecond': 'messagesInPerSecond'
      },
      topic: {
        'kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec': 'bytesInPerSecond',
        'kafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec': 'bytesOutPerSecond',
        'bytesInPerSecond': 'bytesInPerSecond',
        'bytesOutPerSecond': 'bytesOutPerSecond'
      },
      consumerGroup: {
        'lag': 'totalLag',
        'lagMax': 'maxLag'
      }
    };
  }

  /**
   * Normalize broker ID from various formats
   * @private
   * @param {Object} brokerData - Broker data
   * @returns {string|number} Normalized broker ID
   */
  _normalizeBrokerId(brokerData) {
    return brokerData.brokerId || 
           brokerData['broker.id'] || 
           brokerData.id || 
           brokerData.nodeId || 
           'unknown';
  }

  /**
   * Extract JVM metrics from broker data
   * @private
   * @param {Object} brokerData - Broker data
   * @returns {Object} JVM metrics
   */
  _extractJvmMetrics(brokerData) {
    return {
      heapUsed: brokerData.jvmHeapUsed || brokerData['jvm.heap.used'],
      heapMax: brokerData.jvmHeapMax || brokerData['jvm.heap.max'],
      gcCount: brokerData.gcCount || brokerData['jvm.gc.count'],
      gcTime: brokerData.gcTime || brokerData['jvm.gc.time']
    };
  }

  /**
   * Extract network metrics from broker data
   * @private
   * @param {Object} brokerData - Broker data
   * @returns {Object} Network metrics
   */
  _extractNetworkMetrics(brokerData) {
    return {
      requestRate: brokerData.requestRate || brokerData['kafka.network.request.rate'],
      responseRate: brokerData.responseRate || brokerData['kafka.network.response.rate'],
      networkProcessorAvgIdlePercent: brokerData.networkProcessorAvgIdlePercent
    };
  }

  /**
   * Normalize metrics using mappings
   * @private
   * @param {Object} metrics - Raw metrics
   * @param {string} entityType - Entity type for mapping
   * @returns {Object} Normalized metrics
   */
  _normalizeMetrics(metrics, entityType) {
    const mappings = this.metricMappings[entityType] || {};
    const normalized = {};
    
    Object.keys(metrics).forEach(key => {
      const normalizedKey = mappings[key] || key;
      normalized[normalizedKey] = metrics[key];
    });
    
    return normalized;
  }

  /**
   * Calculate derived metrics for topics
   * @private
   * @param {Object} topicData - Topic data
   * @returns {Object} Derived metrics
   */
  _calculateTopicDerivedMetrics(topicData) {
    const metrics = topicData.metrics || {};
    return {
      throughputRatio: (metrics.bytesOutPerSecond || 0) / Math.max(metrics.bytesInPerSecond || 1, 1),
      messagesPerByte: (metrics.messagesInPerSecond || 0) / Math.max(metrics.bytesInPerSecond || 1, 1),
      avgMessageSize: (metrics.bytesInPerSecond || 0) / Math.max(metrics.messagesInPerSecond || 1, 1)
    };
  }

  /**
   * Calculate consumer lag metrics
   * @private
   * @param {Object} consumerGroupData - Consumer group data
   * @returns {Object} Lag metrics
   */
  _calculateConsumerLagMetrics(consumerGroupData) {
    const metrics = consumerGroupData.metrics || {};
    return {
      totalLag: metrics.lag || metrics.totalLag || 0,
      maxLag: metrics.lagMax || metrics.maxLag || 0,
      avgLag: metrics.avgLag || (metrics.totalLag || 0) / Math.max(consumerGroupData.metadata?.members?.length || 1, 1)
    };
  }
}

module.exports = KafkaProviderHook;