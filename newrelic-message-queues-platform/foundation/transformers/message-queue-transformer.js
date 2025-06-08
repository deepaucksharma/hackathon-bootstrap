const BaseTransformer = require('./base/base-transformer');
const EntityFactory = require('../../core/entities/entity-factory');

/**
 * MessageQueueTransformer - Main transformer orchestrator
 * 
 * Coordinates provider-specific transformers and manages the overall
 * transformation pipeline from infrastructure data to MESSAGE_QUEUE entities.
 */
class MessageQueueTransformer extends BaseTransformer {
  constructor(config = {}) {
    super(config);
    
    this.entityFactory = new EntityFactory();
    this.providers = new Map();
    this.aggregators = new Map();
    
    // Default configuration
    this.config = {
      ...this.config,
      autoDetectProvider: true,
      enrichWithMetadata: true,
      generateRelationships: true,
      aggregationInterval: 60000, // 1 minute
      ...config
    };

    // Initialize metrics specific to message queue transformation
    this.metrics = {
      ...this.metrics,
      entitiesCreated: {
        cluster: 0,
        broker: 0,
        topic: 0,
        queue: 0
      },
      providersDetected: new Set()
    };
  }

  /**
   * Register a provider-specific transformer
   * @param {string} providerName - Provider name (kafka, rabbitmq, etc.)
   * @param {BaseTransformer} transformer - Provider transformer instance
   */
  registerProvider(providerName, transformer) {
    if (!(transformer instanceof BaseTransformer)) {
      throw new Error('Provider transformer must extend BaseTransformer');
    }
    this.providers.set(providerName.toLowerCase(), transformer);
  }

  /**
   * Register an aggregator for metric aggregation
   * @param {string} name - Aggregator name
   * @param {Object} aggregator - Aggregator instance
   */
  registerAggregator(name, aggregator) {
    this.aggregators.set(name, aggregator);
  }

  /**
   * Detect provider from infrastructure data
   * @param {Object} data - Raw infrastructure data
   * @returns {string|null} Detected provider name
   */
  detectProvider(data) {
    // Check for explicit provider
    if (data.provider) {
      return data.provider.toLowerCase();
    }

    // Auto-detection based on data patterns
    if (data.kafkaVersion || data.controllerId || data.zookeeperConnect) {
      return 'kafka';
    }
    
    if (data.rabbitVersion || data.erlangVersion || data.managementVersion) {
      return 'rabbitmq';
    }
    
    if (data.queueUrl && data.queueUrl.includes('amazonaws.com/sqs')) {
      return 'sqs';
    }
    
    if (data.activemqVersion || data.storeUsage) {
      return 'activemq';
    }

    return null;
  }

  /**
   * Validate infrastructure data
   * @param {Object} data - Data to validate
   * @returns {Promise<Object>} Validated data
   */
  async validate(data) {
    await super.validate(data);

    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data: must be an object');
    }

    if (this.config.autoDetectProvider && !data.provider) {
      const detectedProvider = this.detectProvider(data);
      if (!detectedProvider) {
        throw new Error('Unable to detect message queue provider');
      }
      data.provider = detectedProvider;
      this.metrics.providersDetected.add(detectedProvider);
    }

    if (!this.providers.has(data.provider.toLowerCase())) {
      throw new Error(`No transformer registered for provider: ${data.provider}`);
    }

    return data;
  }

  /**
   * Perform core transformation
   * @param {Object} data - Validated infrastructure data
   * @returns {Promise<Object>} Transformed entity data
   */
  async performTransformation(data) {
    const provider = data.provider.toLowerCase();
    const providerTransformer = this.providers.get(provider);

    // Delegate to provider-specific transformer
    const providerData = await providerTransformer.transform(data);

    // Create MESSAGE_QUEUE entities
    const entities = await this.createEntities(providerData);

    // Generate relationships if enabled
    if (this.config.generateRelationships) {
      await this.generateRelationships(entities);
    }

    return {
      provider,
      entities,
      metadata: {
        transformedAt: new Date().toISOString(),
        transformerVersion: '2.0.0',
        provider
      }
    };
  }

  /**
   * Create MESSAGE_QUEUE entities from transformed data
   * @param {Object} data - Provider-transformed data
   * @returns {Promise<Object>} Created entities
   */
  async createEntities(data) {
    const entities = {
      clusters: [],
      brokers: [],
      topics: [],
      queues: []
    };

    // Create cluster entities
    if (data.clusters) {
      for (const clusterData of data.clusters) {
        const cluster = this.entityFactory.createCluster(clusterData);
        entities.clusters.push(cluster);
        this.metrics.entitiesCreated.cluster++;
      }
    }

    // Create broker entities
    if (data.brokers) {
      for (const brokerData of data.brokers) {
        const broker = this.entityFactory.createBroker(brokerData);
        entities.brokers.push(broker);
        this.metrics.entitiesCreated.broker++;
      }
    }

    // Create topic entities
    if (data.topics) {
      for (const topicData of data.topics) {
        const topic = this.entityFactory.createTopic(topicData);
        entities.topics.push(topic);
        this.metrics.entitiesCreated.topic++;
      }
    }

    // Create queue entities
    if (data.queues) {
      for (const queueData of data.queues) {
        const queue = this.entityFactory.createQueue(queueData);
        entities.queues.push(queue);
        this.metrics.entitiesCreated.queue++;
      }
    }

    return entities;
  }

  /**
   * Generate relationships between entities
   * @param {Object} entities - Created entities
   */
  async generateRelationships(entities) {
    // Link brokers to clusters
    for (const broker of entities.brokers) {
      const cluster = entities.clusters.find(c => c.guid === broker.clusterGuid);
      if (cluster) {
        cluster.addBroker(broker);
      }
    }

    // Link topics to brokers
    for (const topic of entities.topics) {
      const broker = entities.brokers.find(b => b.guid === topic.brokerGuid);
      if (broker) {
        broker.addTopic(topic);
      }
    }

    // Link queues to brokers
    for (const queue of entities.queues) {
      const broker = entities.brokers.find(b => b.guid === queue.brokerGuid);
      if (broker) {
        broker.addQueue(queue);
      }
    }
  }

  /**
   * Enrich transformed data with additional metadata
   * @param {Object} data - Transformed data
   * @returns {Promise<Object>} Enriched data
   */
  async enrich(data) {
    await super.enrich(data);

    if (this.config.enrichWithMetadata) {
      // Add golden metrics
      data.goldenMetrics = await this.calculateGoldenMetrics(data.entities);

      // Add aggregated metrics if aggregators are registered
      if (this.aggregators.size > 0) {
        data.aggregatedMetrics = await this.aggregateMetrics(data.entities);
      }
    }

    return data;
  }

  /**
   * Calculate golden metrics for entities
   * @param {Object} entities - Entity collections
   * @returns {Promise<Object>} Golden metrics
   */
  async calculateGoldenMetrics(entities) {
    const metrics = {
      clusters: {},
      brokers: {},
      topics: {},
      queues: {}
    };

    // Calculate cluster-level golden metrics
    for (const cluster of entities.clusters) {
      metrics.clusters[cluster.guid] = cluster.getGoldenMetrics();
    }

    // Calculate broker-level golden metrics
    for (const broker of entities.brokers) {
      metrics.brokers[broker.guid] = broker.getGoldenMetrics();
    }

    // Calculate topic-level golden metrics
    for (const topic of entities.topics) {
      metrics.topics[topic.guid] = topic.getGoldenMetrics();
    }

    // Calculate queue-level golden metrics
    for (const queue of entities.queues) {
      metrics.queues[queue.guid] = queue.getGoldenMetrics();
    }

    return metrics;
  }

  /**
   * Aggregate metrics using registered aggregators
   * @param {Object} entities - Entity collections
   * @returns {Promise<Object>} Aggregated metrics
   */
  async aggregateMetrics(entities) {
    const aggregated = {};

    for (const [name, aggregator] of this.aggregators) {
      aggregated[name] = await aggregator.aggregate(entities);
    }

    return aggregated;
  }

  /**
   * Optimize the transformed data
   * @param {Object} data - Enriched data
   * @returns {Promise<Object>} Optimized data
   */
  async optimize(data) {
    await super.optimize(data);

    // Remove null/undefined values
    this.removeNullValues(data);

    // Compress large arrays if needed
    if (data.entities) {
      this.optimizeEntityArrays(data.entities);
    }

    return data;
  }

  /**
   * Remove null/undefined values recursively
   * @param {Object} obj - Object to clean
   */
  removeNullValues(obj) {
    Object.keys(obj).forEach(key => {
      if (obj[key] === null || obj[key] === undefined) {
        delete obj[key];
      } else if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        this.removeNullValues(obj[key]);
      }
    });
  }

  /**
   * Optimize entity arrays for efficient storage
   * @param {Object} entities - Entity collections
   */
  optimizeEntityArrays(entities) {
    // Limit array sizes if needed
    const maxArraySize = this.config.maxEntityArraySize || 1000;

    Object.keys(entities).forEach(type => {
      if (Array.isArray(entities[type]) && entities[type].length > maxArraySize) {
        console.warn(`Truncating ${type} array from ${entities[type].length} to ${maxArraySize}`);
        entities[type] = entities[type].slice(0, maxArraySize);
      }
    });
  }

  /**
   * Get transformation statistics
   * @returns {Object} Detailed statistics
   */
  getStatistics() {
    const baseMetrics = this.getMetrics();
    return {
      ...baseMetrics,
      entitiesCreated: { ...this.metrics.entitiesCreated },
      providersDetected: Array.from(this.metrics.providersDetected),
      registeredProviders: Array.from(this.providers.keys()),
      registeredAggregators: Array.from(this.aggregators.keys())
    };
  }
}

module.exports = MessageQueueTransformer;