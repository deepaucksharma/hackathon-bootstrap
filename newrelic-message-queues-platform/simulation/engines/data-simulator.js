/**
 * Data Simulator Engine
 * 
 * Generates realistic data for MESSAGE_QUEUE_* entities with business patterns,
 * seasonal trends, and controlled anomalies.
 */

const { EntityFactory, PROVIDERS } = require('../../core/entities');

class DataSimulator {
  constructor(config = {}) {
    this.entityFactory = new EntityFactory();
    this.config = {
      businessHoursStart: config.businessHoursStart || 9,
      businessHoursEnd: config.businessHoursEnd || 17,
      timeZone: config.timeZone || 'UTC',
      seasonalVariation: config.seasonalVariation !== false,
      weekendReduction: config.weekendReduction || 0.3,
      anomalyRate: config.anomalyRate || 0.05,
      dataPattern: config.dataPattern || 'realistic',
      ...config
    };
    
    // Initialize patterns and anomaly injection (inline for now)
    this.patterns = {
      getBusinessHourMultiplier: () => this.getBusinessHourMultiplier(),
      getSeasonalMultiplier: () => this.getSeasonalMultiplier(),
      getBrokerLoad: (isController) => {
        const patterns = new DataPatterns();
        return patterns.getBrokerLoad(isController);
      },
      getTopicLoad: (topicName) => {
        const patterns = new DataPatterns();
        return patterns.getTopicLoad(topicName);
      },
      getQueueLoad: (queueType) => {
        const patterns = new DataPatterns();
        return patterns.getQueueLoad(queueType);
      }
    };
    this.anomalyInjector = {
      shouldInjectAnomaly: () => Math.random() < this.config.anomalyRate,
      generateAnomaly: (value) => value * (Math.random() * 2 + 0.5),
      generateBrokerAnomaly: () => {
        const injector = new AnomalyInjector(this.config.anomalyRate);
        return injector.generateBrokerAnomaly();
      }
    };
    this.timeSeriesData = new Map();
    this.startTime = Date.now();
  }

  /**
   * Create a complete message queue topology
   */
  createTopology(topologyConfig) {
    const topology = {
      clusters: [],
      brokers: [],
      topics: [],
      queues: [],
      metadata: {
        provider: topologyConfig.provider || PROVIDERS.KAFKA,
        environment: topologyConfig.environment || 'production',
        region: topologyConfig.region || 'us-east-1',
        createdAt: new Date().toISOString()
      }
    };

    // Create clusters
    for (let i = 0; i < (topologyConfig.clusterCount || 1); i++) {
      const cluster = this.createCluster({
        ...topologyConfig.clusterConfig,
        name: `${topology.metadata.environment}-${topology.metadata.provider}-cluster-${i + 1}`,
        provider: topology.metadata.provider,
        region: topology.metadata.region,
        environment: topology.metadata.environment
      });
      topology.clusters.push(cluster);

      // Create brokers for each cluster
      const brokerCount = topologyConfig.brokersPerCluster || 3;
      for (let j = 0; j < brokerCount; j++) {
        const broker = this.createBroker({
          ...topologyConfig.brokerConfig,
          brokerId: j,
          clusterName: cluster.clusterName,
          clusterGuid: cluster.guid,
          hostname: `${cluster.clusterName}-broker-${j}`,
          provider: topology.metadata.provider
        });
        topology.brokers.push(broker);
      }

      // Create topics for each cluster
      const topicCount = topologyConfig.topicsPerCluster || 10;
      for (let k = 0; k < topicCount; k++) {
        const topic = this.createTopic({
          ...topologyConfig.topicConfig,
          topic: this.generateTopicName(topology.metadata.provider, k),
          clusterName: cluster.clusterName,
          clusterGuid: cluster.guid,
          provider: topology.metadata.provider
        });
        topology.topics.push(topic);
      }

      // Create queues if provider supports them
      if ([PROVIDERS.RABBITMQ, PROVIDERS.SQS, PROVIDERS.AZURE_SERVICE_BUS].includes(topology.metadata.provider)) {
        const queueCount = topologyConfig.queuesPerCluster || 5;
        for (let l = 0; l < queueCount; l++) {
          const queue = this.createQueue({
            ...topologyConfig.queueConfig,
            queueName: this.generateQueueName(topology.metadata.provider, l),
            provider: topology.metadata.provider,
            region: topology.metadata.region
          });
          topology.queues.push(queue);
        }
      }
    }

    return topology;
  }

  /**
   * Create a cluster with realistic configuration
   */
  createCluster(config) {
    const cluster = this.entityFactory.createCluster({
      name: config.name,
      clusterName: config.name,
      provider: config.provider,
      region: config.region,
      environment: config.environment,
      version: this.getProviderVersion(config.provider),
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
      brokerCount: config.brokerCount || 3,
      metadata: {
        deployment: config.deployment || 'kubernetes',
        monitoring: config.monitoring || 'enabled',
        backup: config.backup || 'enabled'
      },
      tags: {
        environment: config.environment,
        team: config.team || 'platform',
        costCenter: config.costCenter || 'engineering',
        criticality: config.criticality || 'high'
      }
    });

    // Initialize with realistic metrics
    this.updateClusterMetrics(cluster);
    return cluster;
  }

  /**
   * Create a broker with realistic configuration
   */
  createBroker(config) {
    const broker = this.entityFactory.createBroker({
      brokerId: config.brokerId,
      hostname: config.hostname,
      port: config.port || this.getDefaultPort(config.provider),
      clusterName: config.clusterName,
      clusterGuid: config.clusterGuid,
      provider: config.provider,
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
      isController: config.brokerId === 0, // First broker is controller
      rack: config.rack || `rack-${config.brokerId % 3}`,
      metadata: {
        instanceType: config.instanceType || 'm5.large',
        storage: config.storage || 'gp2',
        storageSize: config.storageSize || '100GB'
      }
    });

    // Initialize with realistic metrics
    this.updateBrokerMetrics(broker);
    return broker;
  }

  /**
   * Create a topic with realistic configuration
   */
  createTopic(config) {
    const topic = this.entityFactory.createTopic({
      topic: config.topic,
      clusterName: config.clusterName,
      clusterGuid: config.clusterGuid,
      provider: config.provider,
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
      partitionCount: config.partitionCount || this.getOptimalPartitionCount(config.topic),
      replicationFactor: config.replicationFactor || 3,
      retentionMs: config.retentionMs || (7 * 24 * 60 * 60 * 1000), // 7 days
      cleanupPolicy: config.cleanupPolicy || 'delete',
      compressionType: config.compressionType || 'lz4'
    });

    // Initialize with realistic metrics
    this.updateTopicMetrics(topic);
    return topic;
  }

  /**
   * Create a queue with realistic configuration
   */
  createQueue(config) {
    const queue = this.entityFactory.createQueue({
      queueName: config.queueName,
      provider: config.provider,
      region: config.region,
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
      queueType: config.queueType || 'standard',
      vhost: config.vhost || (config.provider === PROVIDERS.RABBITMQ ? '/' : undefined),
      isDurable: config.isDurable !== false,
      visibilityTimeout: config.visibilityTimeout || 30,
      messageRetentionPeriod: config.messageRetentionPeriod || (14 * 24 * 60 * 60), // 14 days
      metadata: {
        maxMessageSize: config.maxMessageSize || '256KB',
        encryption: config.encryption || 'enabled'
      }
    });

    // Initialize with realistic metrics
    this.updateQueueMetrics(queue);
    return queue;
  }

  /**
   * Update cluster metrics with realistic patterns
   */
  updateClusterMetrics(cluster) {
    const now = new Date();
    const businessHourMultiplier = this.patterns.getBusinessHourMultiplier(now);
    const seasonalMultiplier = this.patterns.getSeasonalMultiplier(now);
    const baseMultiplier = businessHourMultiplier * seasonalMultiplier;

    // Base throughput varies by provider and environment
    const baseThroughput = this.getBaseThroughput(cluster.provider, cluster.environment);
    const currentThroughput = Math.round(baseThroughput * baseMultiplier);

    // Health score with occasional dips
    const baseHealth = 98;
    const healthVariation = this.anomalyInjector.shouldInjectAnomaly() ? 
      Math.random() * -20 : Math.random() * 2;
    const healthScore = Math.max(60, Math.min(100, baseHealth + healthVariation));

    // Error rate inversely related to health
    const errorRate = Math.max(0, (100 - healthScore) / 20);

    // Availability based on health and random outages
    const availability = Math.max(95, healthScore - (Math.random() * 3));

    cluster.updateGoldenMetric('cluster.health.score', Number(healthScore.toFixed(1)), 'percentage');
    cluster.updateGoldenMetric('cluster.throughput.total', currentThroughput, 'messages/second');
    cluster.updateGoldenMetric('cluster.error.rate', Number(errorRate.toFixed(2)), 'percentage');
    cluster.updateGoldenMetric('cluster.availability', Number(availability.toFixed(2)), 'percentage');
  }

  /**
   * Update broker metrics with realistic patterns
   */
  updateBrokerMetrics(broker) {
    const baseLoad = this.patterns.getBrokerLoad(broker.isController);
    const variation = (Math.random() - 0.5) * 20; // ±10% variation

    const cpuUsage = Math.max(5, Math.min(95, baseLoad.cpu + variation));
    const memoryUsage = Math.max(10, Math.min(90, baseLoad.memory + variation));
    const networkThroughput = Math.max(0, baseLoad.network + (variation * 1000000)); // bytes/sec
    const requestLatency = Math.max(1, baseLoad.latency + (Math.random() * 10));

    // Inject anomalies occasionally
    if (this.anomalyInjector.shouldInjectAnomaly()) {
      const anomaly = this.anomalyInjector.generateBrokerAnomaly();
      broker.updateCpuUsage(Math.min(100, cpuUsage + anomaly.cpuSpike));
      broker.updateMemoryUsage(Math.min(100, memoryUsage + anomaly.memorySpike));
      broker.updateRequestLatency(requestLatency + anomaly.latencySpike);
    } else {
      broker.updateCpuUsage(Number(cpuUsage.toFixed(1)));
      broker.updateMemoryUsage(Number(memoryUsage.toFixed(1)));
      broker.updateRequestLatency(Number(requestLatency.toFixed(1)));
    }

    broker.updateNetworkThroughput(Math.round(networkThroughput));
  }

  /**
   * Update topic metrics with realistic patterns
   */
  updateTopicMetrics(topic) {
    const topicLoad = this.patterns.getTopicLoad(topic.topic);
    const now = new Date();
    const businessMultiplier = this.patterns.getBusinessHourMultiplier(now);

    const baseThroughputIn = topicLoad.throughputIn * businessMultiplier;
    const baseThroughputOut = topicLoad.throughputOut * businessMultiplier;

    // Add some randomness
    const variation = 1 + ((Math.random() - 0.5) * 0.4); // ±20% variation
    const throughputIn = Math.max(0, Math.round(baseThroughputIn * variation));
    const throughputOut = Math.max(0, Math.round(baseThroughputOut * variation));

    // Consumer lag based on throughput imbalance
    const lagAccumulation = Math.max(0, throughputIn - throughputOut);
    const existingLag = topic.goldenMetrics.find(m => m.name === 'topic.consumer.lag')?.value || 0;
    const newLag = Math.max(0, existingLag + lagAccumulation - (throughputOut * 0.1));

    // Error rate with occasional spikes
    const baseErrorRate = 0.1;
    const errorSpike = this.anomalyInjector.shouldInjectAnomaly() ? Math.random() * 5 : 0;
    const errorRate = baseErrorRate + errorSpike;

    topic.updateThroughputIn(throughputIn);
    topic.updateThroughputOut(throughputOut);
    topic.updateConsumerLag(Math.round(newLag));
    topic.updateErrorRate(Number(errorRate.toFixed(2)));
  }

  /**
   * Update queue metrics with realistic patterns
   */
  updateQueueMetrics(queue) {
    const queueLoad = this.patterns.getQueueLoad(queue.queueType);
    const now = new Date();
    const businessMultiplier = this.patterns.getBusinessHourMultiplier(now);

    const baseThroughputIn = queueLoad.throughputIn * businessMultiplier;
    const baseThroughputOut = queueLoad.throughputOut * businessMultiplier;

    const variation = 1 + ((Math.random() - 0.5) * 0.3); // ±15% variation
    const throughputIn = Math.max(0, Math.round(baseThroughputIn * variation));
    const throughputOut = Math.max(0, Math.round(baseThroughputOut * variation));

    // Queue depth based on throughput imbalance
    const depthChange = throughputIn - throughputOut;
    const existingDepth = queue.goldenMetrics.find(m => m.name === 'queue.depth')?.value || 0;
    const newDepth = Math.max(0, existingDepth + depthChange);

    // Processing time varies with queue depth
    const baseProcessingTime = queueLoad.processingTime;
    const depthPenalty = newDepth > 1000 ? (newDepth / 1000) * 100 : 0;
    const processingTime = baseProcessingTime + depthPenalty + (Math.random() * 50);

    queue.updateThroughputIn(throughputIn);
    queue.updateThroughputOut(throughputOut);
    queue.updateDepth(Math.round(newDepth));
    queue.updateProcessingTime(Number(processingTime.toFixed(1)));
  }

  /**
   * Simulate continuous data updates
   */
  startContinuousSimulation(intervalMs = 30000) {
    this.simulationInterval = setInterval(() => {
      this.updateAllMetrics();
    }, intervalMs);
    
    console.log(`Started continuous simulation with ${intervalMs}ms interval`);
  }

  /**
   * Stop continuous simulation
   */
  stopContinuousSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
      console.log('Stopped continuous simulation');
    }
  }

  /**
   * Update all entity metrics
   */
  updateAllMetrics() {
    const clusters = this.entityFactory.getEntitiesByType('MESSAGE_QUEUE_CLUSTER');
    const brokers = this.entityFactory.getEntitiesByType('MESSAGE_QUEUE_BROKER');
    const topics = this.entityFactory.getEntitiesByType('MESSAGE_QUEUE_TOPIC');
    const queues = this.entityFactory.getEntitiesByType('MESSAGE_QUEUE_QUEUE');

    clusters.forEach(cluster => this.updateClusterMetrics(cluster));
    brokers.forEach(broker => this.updateBrokerMetrics(broker));
    topics.forEach(topic => this.updateTopicMetrics(topic));
    queues.forEach(queue => this.updateQueueMetrics(queue));
  }

  /**
   * Generate topic name based on provider
   */
  generateTopicName(provider, index) {
    const patterns = {
      [PROVIDERS.KAFKA]: [
        'user.events.created', 'payment.transactions.processed', 'order.status.updated',
        'inventory.items.changed', 'analytics.page.views', 'notification.email.sent',
        'audit.security.events', 'metrics.application.performance', 'logs.error.stream',
        'billing.invoices.generated'
      ],
      [PROVIDERS.RABBITMQ]: [
        'email-queue', 'image-processing', 'order-fulfillment', 'payment-processing',
        'notification-delivery', 'data-export', 'report-generation', 'backup-jobs',
        'cache-invalidation', 'user-registration'
      ]
    };

    const names = patterns[provider] || patterns[PROVIDERS.KAFKA];
    return names[index % names.length];
  }

  /**
   * Generate queue name based on provider
   */
  generateQueueName(provider, index) {
    const patterns = {
      [PROVIDERS.RABBITMQ]: [
        'email-sender-prod', 'image-processor-prod', 'order-fulfillment-prod',
        'payment-gateway-prod', 'notification-service-prod'
      ],
      [PROVIDERS.SQS]: [
        'prod-email-queue', 'prod-image-processing', 'prod-order-fulfillment',
        'prod-payment-processing', 'prod-notification-delivery'
      ],
      [PROVIDERS.AZURE_SERVICE_BUS]: [
        'email-processing-queue', 'order-processing-queue', 'payment-processing-queue',
        'notification-queue', 'analytics-queue'
      ]
    };

    const names = patterns[provider] || patterns[PROVIDERS.SQS];
    return names[index % names.length];
  }

  /**
   * Get provider version
   */
  getProviderVersion(provider) {
    const versions = {
      [PROVIDERS.KAFKA]: '2.8.1',
      [PROVIDERS.RABBITMQ]: '3.9.11',
      [PROVIDERS.SQS]: 'n/a',
      [PROVIDERS.AZURE_SERVICE_BUS]: '1.0',
      [PROVIDERS.GOOGLE_PUBSUB]: '1.0'
    };
    return versions[provider] || '1.0.0';
  }

  /**
   * Get default port for provider
   */
  getDefaultPort(provider) {
    const ports = {
      [PROVIDERS.KAFKA]: 9092,
      [PROVIDERS.RABBITMQ]: 5672,
      [PROVIDERS.SQS]: 443,
      [PROVIDERS.AZURE_SERVICE_BUS]: 443,
      [PROVIDERS.GOOGLE_PUBSUB]: 443
    };
    return ports[provider] || 9092;
  }

  /**
   * Get base throughput for provider/environment
   */
  getBaseThroughput(provider, environment) {
    const multipliers = {
      production: 1.0,
      staging: 0.3,
      development: 0.1,
      test: 0.05
    };

    const baseThroughputs = {
      [PROVIDERS.KAFKA]: 10000,
      [PROVIDERS.RABBITMQ]: 5000,
      [PROVIDERS.SQS]: 3000,
      [PROVIDERS.AZURE_SERVICE_BUS]: 4000,
      [PROVIDERS.GOOGLE_PUBSUB]: 8000
    };

    const base = baseThroughputs[provider] || 5000;
    const envMultiplier = multipliers[environment] || 1.0;
    return Math.round(base * envMultiplier);
  }

  /**
   * Get optimal partition count for topic
   */
  getOptimalPartitionCount(topicName) {
    // High-volume topics get more partitions
    const highVolumePatterns = ['events', 'logs', 'metrics', 'analytics'];
    const isHighVolume = highVolumePatterns.some(pattern => 
      topicName.toLowerCase().includes(pattern)
    );
    
    return isHighVolume ? 12 : 6;
  }

  /**
   * Get business hour multiplier
   */
  getBusinessHourMultiplier(date = new Date()) {
    const patterns = new DataPatterns();
    return patterns.getBusinessHourMultiplier(date);
  }

  /**
   * Get seasonal multiplier
   */
  getSeasonalMultiplier(date = new Date()) {
    const patterns = new DataPatterns();
    return patterns.getSeasonalMultiplier(date);
  }

  /**
   * Get simulation summary
   */
  getSummary() {
    return {
      ...this.entityFactory.getSummary(),
      simulationConfig: this.config,
      uptime: Date.now() - this.startTime,
      isRunning: !!this.simulationInterval
    };
  }
}

/**
 * Data Patterns Class
 * 
 * Defines realistic data patterns for different times and conditions
 */
class DataPatterns {
  /**
   * Get business hour multiplier
   */
  getBusinessHourMultiplier(date) {
    const hour = date.getHours();
    const dayOfWeek = date.getDay();
    
    // Weekend reduction
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return 0.3;
    }
    
    // Business hours pattern
    if (hour >= 9 && hour <= 17) {
      // Peak hours (10-11 AM, 2-3 PM)
      if ((hour >= 10 && hour <= 11) || (hour >= 14 && hour <= 15)) {
        return 1.3;
      }
      return 1.0;
    }
    
    // Evening hours
    if (hour >= 18 && hour <= 22) {
      return 0.6;
    }
    
    // Night hours
    return 0.2;
  }

  /**
   * Get seasonal multiplier
   */
  getSeasonalMultiplier(date) {
    const month = date.getMonth();
    
    // Q4 increase (Oct, Nov, Dec)
    if (month >= 9) {
      return 1.4;
    }
    
    // Summer decline (Jun, Jul, Aug)
    if (month >= 5 && month <= 7) {
      return 0.85;
    }
    
    // Back to school (Sep)
    if (month === 8) {
      return 1.25;
    }
    
    return 1.0;
  }

  /**
   * Get broker load patterns
   */
  getBrokerLoad(isController) {
    const baseLoad = {
      cpu: 45,
      memory: 60,
      network: 50000000, // 50MB/s
      latency: 15
    };

    // Controller has slightly higher load
    if (isController) {
      baseLoad.cpu += 10;
      baseLoad.memory += 5;
      baseLoad.latency += 5;
    }

    return baseLoad;
  }

  /**
   * Get topic load patterns
   */
  getTopicLoad(topicName) {
    const lowerName = topicName.toLowerCase();
    
    // High-volume topics
    if (lowerName.includes('events') || lowerName.includes('logs')) {
      return {
        throughputIn: 5000,
        throughputOut: 4800
      };
    }
    
    // Medium-volume topics
    if (lowerName.includes('analytics') || lowerName.includes('metrics')) {
      return {
        throughputIn: 2000,
        throughputOut: 1950
      };
    }
    
    // Low-volume topics
    return {
      throughputIn: 500,
      throughputOut: 490
    };
  }

  /**
   * Get queue load patterns
   */
  getQueueLoad(queueType) {
    const patterns = {
      standard: {
        throughputIn: 1000,
        throughputOut: 950,
        processingTime: 200
      },
      fifo: {
        throughputIn: 300,
        throughputOut: 295,
        processingTime: 400
      },
      priority: {
        throughputIn: 800,
        throughputOut: 780,
        processingTime: 150
      },
      'dead-letter': {
        throughputIn: 10,
        throughputOut: 5,
        processingTime: 1000
      }
    };

    return patterns[queueType] || patterns.standard;
  }
}

/**
 * Anomaly Injector Class
 * 
 * Injects realistic anomalies and error conditions
 */
class AnomalyInjector {
  constructor(anomalyRate = 0.05) {
    this.anomalyRate = anomalyRate;
    this.lastAnomalyTime = 0;
    this.minAnomalyInterval = 60000; // 1 minute minimum between anomalies
  }

  /**
   * Check if anomaly should be injected
   */
  shouldInjectAnomaly() {
    const now = Date.now();
    if (now - this.lastAnomalyTime < this.minAnomalyInterval) {
      return false;
    }
    
    if (Math.random() < this.anomalyRate) {
      this.lastAnomalyTime = now;
      return true;
    }
    
    return false;
  }

  /**
   * Generate broker anomaly
   */
  generateBrokerAnomaly() {
    const anomalyTypes = ['cpu_spike', 'memory_leak', 'network_congestion', 'latency_spike'];
    const type = anomalyTypes[Math.floor(Math.random() * anomalyTypes.length)];
    
    switch (type) {
      case 'cpu_spike':
        return { cpuSpike: 30, memorySpike: 5, latencySpike: 20 };
      case 'memory_leak':
        return { cpuSpike: 5, memorySpike: 25, latencySpike: 10 };
      case 'network_congestion':
        return { cpuSpike: 10, memorySpike: 5, latencySpike: 50 };
      case 'latency_spike':
        return { cpuSpike: 15, memorySpike: 5, latencySpike: 100 };
      default:
        return { cpuSpike: 10, memorySpike: 10, latencySpike: 20 };
    }
  }
}

module.exports = DataSimulator;