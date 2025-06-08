const BaseTransformer = require('../base/base-transformer');

/**
 * KafkaTransformer - Transforms Kafka infrastructure data to MESSAGE_QUEUE entities
 * 
 * Handles Kafka-specific data structures and metrics, converting them to
 * the standardized MESSAGE_QUEUE entity format.
 */
class KafkaTransformer extends BaseTransformer {
  constructor(config = {}) {
    super(config);

    this.config = {
      ...this.config,
      defaultReplicationFactor: 3,
      defaultPartitionCount: 12,
      includeInternalTopics: false,
      enrichWithControllerInfo: true,
      ...config
    };

    // Kafka-specific metric mappings
    this.metricMappings = {
      // Cluster metrics
      'kafka.cluster.broker.count': 'cluster.brokerCount',
      'kafka.cluster.topic.count': 'cluster.topicCount',
      'kafka.cluster.partition.count': 'cluster.partitionCount',
      'kafka.cluster.under.replicated.partitions': 'cluster.underReplicatedPartitions',
      
      // Broker metrics
      'kafka.broker.bytes.in.per.sec': 'broker.bytesInPerSec',
      'kafka.broker.bytes.out.per.sec': 'broker.bytesOutPerSec',
      'kafka.broker.messages.in.per.sec': 'broker.messagesInPerSec',
      'kafka.broker.partitions': 'broker.partitionCount',
      'kafka.broker.leaders': 'broker.leaderCount',
      
      // Topic metrics
      'kafka.topic.bytes.in.per.sec': 'topic.bytesInPerSec',
      'kafka.topic.bytes.out.per.sec': 'topic.bytesOutPerSec',
      'kafka.topic.messages.in.per.sec': 'topic.messagesInPerSec',
      'kafka.topic.partitions': 'topic.partitionCount',
      'kafka.topic.replicas': 'topic.replicationFactor'
    };
  }

  /**
   * Validate Kafka-specific data
   * @param {Object} data - Raw Kafka data
   * @returns {Promise<Object>} Validated data
   */
  async validate(data) {
    await super.validate(data);

    // Validate Kafka-specific fields
    if (!data.clusterId && !data.brokers) {
      throw new Error('Kafka data must contain either clusterId or brokers');
    }

    // Ensure broker data has required fields
    if (data.brokers) {
      for (const broker of data.brokers) {
        if (!broker.id && !broker.brokerId) {
          throw new Error('Kafka broker must have an id');
        }
      }
    }

    return data;
  }

  /**
   * Transform Kafka data to MESSAGE_QUEUE format
   * @param {Object} data - Validated Kafka data
   * @returns {Promise<Object>} Transformed data
   */
  async performTransformation(data) {
    const transformed = {
      clusters: [],
      brokers: [],
      topics: [],
      queues: [] // Kafka doesn't have queues, only topics
    };

    // Transform cluster data
    if (data.clusterId || data.clusterMetadata) {
      transformed.clusters.push(this.transformCluster(data));
    }

    // Transform broker data
    if (data.brokers) {
      transformed.brokers = data.brokers.map(broker => this.transformBroker(broker, data));
    }

    // Transform topic data
    if (data.topics) {
      transformed.topics = data.topics
        .filter(topic => this.shouldIncludeTopic(topic))
        .map(topic => this.transformTopic(topic, data));
    }

    // Extract additional broker info from topic metadata if available
    if (data.topicMetadata) {
      this.enrichBrokersFromTopicMetadata(transformed.brokers, data.topicMetadata);
    }

    return transformed;
  }

  /**
   * Transform Kafka cluster data
   * @param {Object} data - Cluster data
   * @returns {Object} Transformed cluster
   */
  transformCluster(data) {
    const cluster = {
      name: data.clusterName || `kafka-cluster-${data.clusterId}`,
      provider: 'kafka',
      clusterId: data.clusterId,
      region: data.region || 'unknown',
      environment: data.environment || 'production',
      metrics: {}
    };

    // Transform cluster metrics
    if (data.clusterMetrics) {
      cluster.metrics = this.transformMetrics(data.clusterMetrics, 'cluster');
    }

    // Add controller information if available
    if (this.config.enrichWithControllerInfo && data.controller) {
      cluster.controllerId = data.controller.id;
      cluster.controllerEpoch = data.controller.epoch;
    }

    // Add Kafka version
    if (data.kafkaVersion) {
      cluster.version = data.kafkaVersion;
    }

    return cluster;
  }

  /**
   * Transform Kafka broker data
   * @param {Object} broker - Broker data
   * @param {Object} clusterData - Parent cluster data
   * @returns {Object} Transformed broker
   */
  transformBroker(broker, clusterData) {
    const transformed = {
      name: broker.name || `kafka-broker-${broker.id || broker.brokerId}`,
      provider: 'kafka',
      brokerId: broker.id || broker.brokerId,
      host: broker.host || broker.hostname,
      port: broker.port || 9092,
      clusterId: clusterData.clusterId,
      rack: broker.rack,
      status: this.determineBrokerStatus(broker),
      metrics: {}
    };

    // Transform broker metrics
    if (broker.metrics) {
      transformed.metrics = this.transformMetrics(broker.metrics, 'broker');
    }

    // Add JMX port if available
    if (broker.jmxPort) {
      transformed.jmxPort = broker.jmxPort;
    }

    // Add listener information
    if (broker.listeners) {
      transformed.listeners = broker.listeners;
    }

    return transformed;
  }

  /**
   * Transform Kafka topic data
   * @param {Object} topic - Topic data
   * @param {Object} clusterData - Parent cluster data
   * @returns {Object} Transformed topic
   */
  transformTopic(topic, clusterData) {
    const transformed = {
      name: topic.name || topic.topicName,
      provider: 'kafka',
      topicId: topic.id || topic.topicId || topic.name,
      clusterId: clusterData.clusterId,
      partitionCount: topic.partitions || topic.partitionCount || this.config.defaultPartitionCount,
      replicationFactor: topic.replicationFactor || this.config.defaultReplicationFactor,
      config: topic.config || {},
      metrics: {}
    };

    // Transform topic metrics
    if (topic.metrics) {
      transformed.metrics = this.transformMetrics(topic.metrics, 'topic');
    }

    // Add partition details if available
    if (topic.partitionDetails) {
      transformed.partitions = topic.partitionDetails.map(p => ({
        id: p.partition,
        leader: p.leader,
        replicas: p.replicas,
        isr: p.isr,
        offsets: {
          beginning: p.beginningOffset,
          end: p.endOffset,
          lag: p.lag
        }
      }));
    }

    // Calculate retention if config is available
    if (topic.config) {
      transformed.retention = this.calculateRetention(topic.config);
    }

    return transformed;
  }

  /**
   * Transform metrics based on mappings
   * @param {Object} metrics - Raw metrics
   * @param {string} entityType - Type of entity (cluster, broker, topic)
   * @returns {Object} Transformed metrics
   */
  transformMetrics(metrics, entityType) {
    const transformed = {};

    Object.entries(metrics).forEach(([key, value]) => {
      const mappingKey = `kafka.${entityType}.${key}`;
      const mappedKey = this.metricMappings[mappingKey];
      
      if (mappedKey) {
        // Extract the metric name after entity type
        const metricName = mappedKey.split('.')[1];
        transformed[metricName] = value;
      } else {
        // Keep original metric if no mapping exists
        transformed[key] = value;
      }
    });

    // Calculate derived metrics
    if (entityType === 'broker') {
      transformed.totalThroughput = (transformed.bytesInPerSec || 0) + (transformed.bytesOutPerSec || 0);
    }

    if (entityType === 'topic') {
      transformed.messageRate = transformed.messagesInPerSec || 0;
    }

    return transformed;
  }

  /**
   * Determine if a topic should be included
   * @param {Object} topic - Topic data
   * @returns {boolean} Whether to include the topic
   */
  shouldIncludeTopic(topic) {
    // Filter internal topics unless configured to include them
    if (!this.config.includeInternalTopics) {
      const internalPrefixes = ['__', '_schemas', '_confluent'];
      const isInternal = internalPrefixes.some(prefix => 
        topic.name && topic.name.startsWith(prefix)
      );
      if (isInternal) return false;
    }

    return true;
  }

  /**
   * Determine broker status based on available data
   * @param {Object} broker - Broker data
   * @returns {string} Broker status
   */
  determineBrokerStatus(broker) {
    if (broker.status) return broker.status;
    
    if (broker.isController) return 'controller';
    if (broker.isAlive === false) return 'offline';
    if (broker.underReplicatedPartitions > 0) return 'degraded';
    
    return 'online';
  }

  /**
   * Calculate retention period from topic config
   * @param {Object} config - Topic configuration
   * @returns {Object} Retention configuration
   */
  calculateRetention(config) {
    const retention = {
      ms: parseInt(config['retention.ms']) || 604800000, // 7 days default
      bytes: parseInt(config['retention.bytes']) || -1,
      compacted: config['cleanup.policy'] === 'compact'
    };

    // Convert ms to human-readable format
    retention.hours = Math.floor(retention.ms / (1000 * 60 * 60));
    retention.days = Math.floor(retention.hours / 24);

    return retention;
  }

  /**
   * Enrich broker information from topic metadata
   * @param {Array} brokers - Broker array to enrich
   * @param {Object} topicMetadata - Topic metadata containing broker info
   */
  enrichBrokersFromTopicMetadata(brokers, topicMetadata) {
    if (!topicMetadata.brokers) return;

    topicMetadata.brokers.forEach(metadataBroker => {
      const broker = brokers.find(b => b.brokerId === metadataBroker.id);
      if (broker) {
        // Enrich with additional metadata
        if (!broker.host && metadataBroker.host) {
          broker.host = metadataBroker.host;
        }
        if (!broker.port && metadataBroker.port) {
          broker.port = metadataBroker.port;
        }
      }
    });
  }

  /**
   * Enrich transformed data with Kafka-specific information
   * @param {Object} data - Transformed data
   * @returns {Promise<Object>} Enriched data
   */
  async enrich(data) {
    await super.enrich(data);

    // Add Kafka-specific enrichments
    if (data.clusters && data.clusters.length > 0) {
      const cluster = data.clusters[0];
      
      // Calculate cluster health score
      cluster.healthScore = this.calculateClusterHealth(data);
      
      // Add topic distribution stats
      cluster.topicDistribution = this.calculateTopicDistribution(data.topics, data.brokers);
    }

    return data;
  }

  /**
   * Calculate cluster health score
   * @param {Object} data - Cluster data with brokers and topics
   * @returns {number} Health score (0-100)
   */
  calculateClusterHealth(data) {
    let score = 100;

    // Check broker availability
    const totalBrokers = data.brokers.length;
    const onlineBrokers = data.brokers.filter(b => b.status === 'online').length;
    const brokerAvailability = totalBrokers > 0 ? (onlineBrokers / totalBrokers) : 0;
    score -= (1 - brokerAvailability) * 30;

    // Check under-replicated partitions
    const hasUnderReplicated = data.brokers.some(b => 
      b.metrics && b.metrics.underReplicatedPartitions > 0
    );
    if (hasUnderReplicated) score -= 20;

    // Check topic health
    const unhealthyTopics = data.topics.filter(t => 
      t.partitions && t.partitions.some(p => p.isr.length < p.replicas.length)
    );
    if (unhealthyTopics.length > 0) {
      score -= Math.min(30, unhealthyTopics.length * 5);
    }

    return Math.max(0, Math.round(score));
  }

  /**
   * Calculate topic distribution across brokers
   * @param {Array} topics - Topic array
   * @param {Array} brokers - Broker array
   * @returns {Object} Distribution statistics
   */
  calculateTopicDistribution(topics, brokers) {
    const distribution = {
      totalTopics: topics.length,
      totalPartitions: 0,
      avgPartitionsPerTopic: 0,
      avgPartitionsPerBroker: 0,
      maxPartitionsOnBroker: 0,
      minPartitionsOnBroker: Number.MAX_SAFE_INTEGER
    };

    // Count total partitions
    topics.forEach(topic => {
      distribution.totalPartitions += topic.partitionCount || 0;
    });

    // Calculate averages
    if (topics.length > 0) {
      distribution.avgPartitionsPerTopic = 
        Math.round(distribution.totalPartitions / topics.length);
    }

    if (brokers.length > 0) {
      distribution.avgPartitionsPerBroker = 
        Math.round(distribution.totalPartitions / brokers.length);
    }

    // Calculate min/max from broker metrics
    brokers.forEach(broker => {
      const partitions = broker.metrics?.partitionCount || 0;
      distribution.maxPartitionsOnBroker = Math.max(
        distribution.maxPartitionsOnBroker, 
        partitions
      );
      distribution.minPartitionsOnBroker = Math.min(
        distribution.minPartitionsOnBroker, 
        partitions
      );
    });

    if (distribution.minPartitionsOnBroker === Number.MAX_SAFE_INTEGER) {
      distribution.minPartitionsOnBroker = 0;
    }

    return distribution;
  }
}

module.exports = KafkaTransformer;