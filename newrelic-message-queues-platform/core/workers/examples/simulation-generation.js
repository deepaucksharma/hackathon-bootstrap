/**
 * Example: Using Worker Pool for Simulation Data Generation
 * 
 * This example shows how to use the SimulationPool for concurrent generation
 * of realistic message queue data across multiple entities and providers.
 */

const { SimulationPool } = require('../worker-pool');

/**
 * Simulation Data Generator using Worker Pool
 */
class SimulationGenerator {
  constructor(options = {}) {
    this.pool = new SimulationPool({
      name: 'SimulationGeneratorPool',
      poolSize: options.poolSize || 8,
      taskTimeout: 15000
    });
    
    this.streamer = options.streamer; // New Relic data streamer
    this.patterns = options.patterns || {};
    
    this.metrics = {
      entitiesGenerated: 0,
      dataPointsGenerated: 0,
      generationRounds: 0,
      errors: 0
    };
    
    this._setupGenerators();
  }
  
  /**
   * Start the simulation generator
   */
  async start() {
    console.log('Starting simulation generator...');
    this.pool.start();
    this._setupEventListeners();
    console.log('Simulation generator started');
  }
  
  /**
   * Stop the simulation generator
   */
  async stop() {
    console.log('Stopping simulation generator...');
    await this.pool.stop();
    console.log('Simulation generator stopped');
  }
  
  /**
   * Generate data for multiple entities concurrently
   */
  async generateRound(entities) {
    const startTime = Date.now();
    
    try {
      // Group entities by type for optimal generation
      const entityGroups = this._groupEntitiesByType(entities);
      
      // Generate data for each entity type concurrently
      const generationPromises = Object.entries(entityGroups).map(
        ([entityType, entityList]) => 
          this.pool.generateBatch(entityList, entityType)
      );
      
      const results = await Promise.all(generationPromises);
      
      // Flatten and process results
      const allResults = results.flat();
      const successfulData = allResults
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);
      
      const duration = Date.now() - startTime;
      
      // Update metrics
      this.metrics.generationRounds++;
      this.metrics.entitiesGenerated += successfulData.length;
      this.metrics.dataPointsGenerated += successfulData.reduce(
        (sum, data) => sum + (data.metrics ? Object.keys(data.metrics).length : 0), 
        0
      );
      
      console.log(`Generated data for ${successfulData.length} entities in ${duration}ms`);
      
      return {
        data: successfulData,
        metadata: {
          duration,
          entitiesProcessed: entities.length,
          successfulGenerations: successfulData.length,
          failedGenerations: allResults.length - successfulData.length
        }
      };
      
    } catch (error) {
      this.metrics.errors++;
      console.error('Generation round failed:', error);
      throw error;
    }
  }
  
  /**
   * Start continuous streaming generation
   */
  async startStreaming(entities, interval = 30000) {
    console.log(`Starting streaming generation with ${interval}ms interval`);
    
    const streamingLoop = async () => {
      while (true) {
        try {
          const results = await this.generateRound(entities);
          
          // Stream data to New Relic
          if (this.streamer && results.data.length > 0) {
            await this.streamer.sendBatch(results.data);
          }
          
          console.log('Streaming round completed:', {
            entities: results.data.length,
            dataPoints: results.data.reduce(
              (sum, d) => sum + Object.keys(d.metrics || {}).length, 
              0
            ),
            duration: results.metadata.duration
          });
          
          // Wait for next interval
          await new Promise(resolve => setTimeout(resolve, interval));
          
        } catch (error) {
          console.error('Streaming generation error:', error);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    };
    
    // Start streaming in background
    streamingLoop().catch(console.error);
  }
  
  /**
   * Generate anomaly data for testing
   */
  async generateAnomalies(entities, anomalyType = 'spike') {
    console.log(`Generating ${anomalyType} anomalies for ${entities.length} entities`);
    
    // Use anomaly-specific generators
    const anomalyGeneratorType = `${entities[0].entityType}_anomaly_${anomalyType}`;
    
    try {
      const results = await this.pool.generateBatch(entities, anomalyGeneratorType);
      
      const anomalyData = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);
      
      console.log(`Generated ${anomalyData.length} anomaly data points`);
      
      return anomalyData;
      
    } catch (error) {
      console.error('Anomaly generation failed:', error);
      throw error;
    }
  }
  
  /**
   * Get generator status and metrics
   */
  getStatus() {
    return {
      pool: this.pool.getStatus(),
      metrics: { ...this.metrics },
      generators: Array.from(this.pool.generators.keys())
    };
  }
  
  /**
   * Setup data generators for different entity types
   */
  _setupGenerators() {
    // Broker data generator
    this.pool.registerGenerator('MESSAGE_QUEUE_BROKER', async (entity) => {
      const baseMetrics = this._getBrokerBaseMetrics(entity);
      const variationMetrics = this._applyVariations(baseMetrics, entity);
      
      return {
        eventType: 'MessageQueue',
        entityGuid: entity.entityGuid,
        entityType: 'MESSAGE_QUEUE_BROKER',
        provider: entity.provider,
        clusterName: entity.clusterName,
        brokerId: entity.brokerId,
        metrics: variationMetrics,
        timestamp: Date.now()
      };
    });
    
    // Topic data generator
    this.pool.registerGenerator('MESSAGE_QUEUE_TOPIC', async (entity) => {
      const baseMetrics = this._getTopicBaseMetrics(entity);
      const variationMetrics = this._applyVariations(baseMetrics, entity);
      
      return {
        eventType: 'MessageQueue',
        entityGuid: entity.entityGuid,
        entityType: 'MESSAGE_QUEUE_TOPIC',
        provider: entity.provider,
        clusterName: entity.clusterName,
        topicName: entity.topicName,
        metrics: variationMetrics,
        timestamp: Date.now()
      };
    });
    
    // Queue data generator
    this.pool.registerGenerator('MESSAGE_QUEUE_QUEUE', async (entity) => {
      const baseMetrics = this._getQueueBaseMetrics(entity);
      const variationMetrics = this._applyVariations(baseMetrics, entity);
      
      return {
        eventType: 'MessageQueue',
        entityGuid: entity.entityGuid,
        entityType: 'MESSAGE_QUEUE_QUEUE',
        provider: entity.provider,
        queueName: entity.queueName,
        metrics: variationMetrics,
        timestamp: Date.now()
      };
    });
    
    // Cluster data generator
    this.pool.registerGenerator('MESSAGE_QUEUE_CLUSTER', async (entity) => {
      const baseMetrics = this._getClusterBaseMetrics(entity);
      const variationMetrics = this._applyVariations(baseMetrics, entity);
      
      return {
        eventType: 'MessageQueue',
        entityGuid: entity.entityGuid,
        entityType: 'MESSAGE_QUEUE_CLUSTER',
        provider: entity.provider,
        clusterName: entity.clusterName,
        metrics: variationMetrics,
        timestamp: Date.now()
      };
    });
    
    // Anomaly generators
    this._setupAnomalyGenerators();
  }
  
  /**
   * Setup anomaly generators
   */
  _setupAnomalyGenerators() {
    // Spike anomaly generator
    this.pool.registerGenerator('MESSAGE_QUEUE_BROKER_anomaly_spike', async (entity) => {
      const normalMetrics = this._getBrokerBaseMetrics(entity);
      
      // Apply spike multipliers
      const spikeMetrics = {
        ...normalMetrics,
        bytesInPerSecond: normalMetrics.bytesInPerSecond * (5 + Math.random() * 10),
        bytesOutPerSecond: normalMetrics.bytesOutPerSecond * (5 + Math.random() * 10),
        messagesInPerSecond: normalMetrics.messagesInPerSecond * (3 + Math.random() * 7),
        cpuUtilization: Math.min(95, normalMetrics.cpuUtilization * 2),
        memoryUtilization: Math.min(90, normalMetrics.memoryUtilization * 1.5)
      };
      
      return {
        eventType: 'MessageQueue',
        entityGuid: entity.entityGuid,
        entityType: 'MESSAGE_QUEUE_BROKER',
        provider: entity.provider,
        clusterName: entity.clusterName,
        brokerId: entity.brokerId,
        metrics: spikeMetrics,
        anomaly: 'spike',
        timestamp: Date.now()
      };
    });
    
    // Degradation anomaly generator
    this.pool.registerGenerator('MESSAGE_QUEUE_BROKER_anomaly_degradation', async (entity) => {
      const normalMetrics = this._getBrokerBaseMetrics(entity);
      
      // Apply degradation effects
      const degradedMetrics = {
        ...normalMetrics,
        bytesInPerSecond: normalMetrics.bytesInPerSecond * 0.1,
        bytesOutPerSecond: normalMetrics.bytesOutPerSecond * 0.1,
        messagesInPerSecond: normalMetrics.messagesInPerSecond * 0.2,
        responseTime: normalMetrics.responseTime * (5 + Math.random() * 10),
        errorRate: 0.05 + Math.random() * 0.15
      };
      
      return {
        eventType: 'MessageQueue',
        entityGuid: entity.entityGuid,
        entityType: 'MESSAGE_QUEUE_BROKER',
        provider: entity.provider,
        clusterName: entity.clusterName,
        brokerId: entity.brokerId,
        metrics: degradedMetrics,
        anomaly: 'degradation',
        timestamp: Date.now()
      };
    });
  }
  
  /**
   * Get base metrics for broker entity
   */
  _getBrokerBaseMetrics(entity) {
    const pattern = this.patterns[entity.provider] || this.patterns.default || {};
    const brokerPattern = pattern.broker || {};
    
    return {
      bytesInPerSecond: this._generateMetric(brokerPattern.bytesIn, 1000000, 5000000),
      bytesOutPerSecond: this._generateMetric(brokerPattern.bytesOut, 800000, 4000000),
      messagesInPerSecond: this._generateMetric(brokerPattern.messagesIn, 1000, 5000),
      messagesOutPerSecond: this._generateMetric(brokerPattern.messagesOut, 900, 4500),
      partitionCount: this._generateMetric(brokerPattern.partitions, 50, 200),
      leaderCount: this._generateMetric(brokerPattern.leaders, 25, 100),
      cpuUtilization: this._generateMetric(brokerPattern.cpu, 20, 80),
      memoryUtilization: this._generateMetric(brokerPattern.memory, 40, 85),
      diskUtilization: this._generateMetric(brokerPattern.disk, 30, 75),
      networkUtilization: this._generateMetric(brokerPattern.network, 25, 70),
      responseTime: this._generateMetric(brokerPattern.responseTime, 1, 50),
      errorRate: this._generateMetric(brokerPattern.errorRate, 0, 0.02)
    };
  }
  
  /**
   * Get base metrics for topic entity
   */
  _getTopicBaseMetrics(entity) {
    const pattern = this.patterns[entity.provider] || this.patterns.default || {};
    const topicPattern = pattern.topic || {};
    
    return {
      bytesInPerSecond: this._generateMetric(topicPattern.bytesIn, 100000, 1000000),
      bytesOutPerSecond: this._generateMetric(topicPattern.bytesOut, 80000, 800000),
      messagesInPerSecond: this._generateMetric(topicPattern.messagesIn, 100, 1000),
      messagesOutPerSecond: this._generateMetric(topicPattern.messagesOut, 90, 900),
      partitionCount: this._generateMetric(topicPattern.partitions, 3, 20),
      replicationFactor: this._generateMetric(topicPattern.replication, 2, 3),
      consumerLag: this._generateMetric(topicPattern.lag, 0, 1000),
      underReplicatedPartitions: this._generateMetric(topicPattern.underReplicated, 0, 2)
    };
  }
  
  /**
   * Get base metrics for queue entity
   */
  _getQueueBaseMetrics(entity) {
    const pattern = this.patterns[entity.provider] || this.patterns.default || {};
    const queuePattern = pattern.queue || {};
    
    return {
      messagesVisible: this._generateMetric(queuePattern.visible, 0, 1000),
      messagesNotVisible: this._generateMetric(queuePattern.notVisible, 0, 100),
      messagesDelayed: this._generateMetric(queuePattern.delayed, 0, 50),
      messagesInFlight: this._generateMetric(queuePattern.inFlight, 0, 200),
      oldestMessage: this._generateMetric(queuePattern.oldestMessage, 0, 3600),
      approximateAgeOfOldestMessage: this._generateMetric(queuePattern.ageOldest, 0, 7200)
    };
  }
  
  /**
   * Get base metrics for cluster entity
   */
  _getClusterBaseMetrics(entity) {
    const pattern = this.patterns[entity.provider] || this.patterns.default || {};
    const clusterPattern = pattern.cluster || {};
    
    return {
      totalBrokers: this._generateMetric(clusterPattern.brokers, 3, 10),
      activeBrokers: this._generateMetric(clusterPattern.activeBrokers, 3, 10),
      totalTopics: this._generateMetric(clusterPattern.topics, 50, 200),
      totalPartitions: this._generateMetric(clusterPattern.partitions, 150, 1000),
      underReplicatedPartitions: this._generateMetric(clusterPattern.underReplicated, 0, 5),
      offlinePartitions: this._generateMetric(clusterPattern.offline, 0, 2),
      controllerActive: this._generateMetric(clusterPattern.controller, 0, 1)
    };
  }
  
  /**
   * Generate metric value with pattern awareness
   */
  _generateMetric(pattern, defaultMin, defaultMax) {
    if (!pattern) {
      return defaultMin + Math.random() * (defaultMax - defaultMin);
    }
    
    const base = pattern.base || (defaultMin + defaultMax) / 2;
    const variation = pattern.variation || 0.2;
    const trend = pattern.trend || 0;
    
    // Apply time-based trend
    const trendFactor = 1 + (trend * Math.sin(Date.now() / 60000)); // 1-minute cycle
    
    // Apply random variation
    const variationFactor = 1 + (Math.random() - 0.5) * variation;
    
    return Math.max(0, base * trendFactor * variationFactor);
  }
  
  /**
   * Apply entity-specific variations
   */
  _applyVariations(baseMetrics, entity) {
    const variations = { ...baseMetrics };
    
    // Apply entity-specific multipliers based on tier/importance
    if (entity.tier === 'critical') {
      Object.keys(variations).forEach(key => {
        if (key.includes('PerSecond') || key.includes('Count')) {
          variations[key] *= 1.5; // Higher throughput for critical entities
        }
      });
    }
    
    // Apply provider-specific adjustments
    if (entity.provider === 'rabbitmq') {
      // RabbitMQ typically has lower throughput but higher message rates
      variations.bytesInPerSecond *= 0.7;
      variations.bytesOutPerSecond *= 0.7;
      variations.messagesInPerSecond *= 1.3;
      variations.messagesOutPerSecond *= 1.3;
    }
    
    return variations;
  }
  
  /**
   * Group entities by type for batch processing
   */
  _groupEntitiesByType(entities) {
    return entities.reduce((groups, entity) => {
      const type = entity.entityType;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(entity);
      return groups;
    }, {});
  }
  
  /**
   * Setup event listeners for monitoring
   */
  _setupEventListeners() {
    this.pool.on('taskCompleted', (data) => {
      console.log(`Generated data for entity in ${data.duration}ms`);
    });
    
    this.pool.on('taskFailed', (data) => {
      console.error(`Data generation failed: ${data.error}`);
    });
    
    this.pool.on('taskRetrying', (data) => {
      console.warn(`Retrying data generation (attempt ${data.attempt}): ${data.error}`);
    });
  }
}

module.exports = { SimulationGenerator };

// Example usage
async function main() {
  const generator = new SimulationGenerator({
    poolSize: 8,
    patterns: {
      kafka: {
        broker: {
          bytesIn: { base: 2000000, variation: 0.3, trend: 0.1 },
          messagesIn: { base: 2000, variation: 0.25, trend: 0.05 }
        },
        topic: {
          bytesIn: { base: 500000, variation: 0.4, trend: 0.2 }
        }
      }
    },
    streamer: {
      sendBatch: async (data) => {
        console.log(`Streaming ${data.length} data points to New Relic`);
        // Mock streaming implementation
      }
    }
  });
  
  try {
    await generator.start();
    
    // Mock entities
    const entities = [
      {
        entityGuid: 'MESSAGE_QUEUE_BROKER|123456|kafka|cluster1:broker1',
        entityType: 'MESSAGE_QUEUE_BROKER',
        provider: 'kafka',
        clusterName: 'cluster1',
        brokerId: '1',
        tier: 'critical'
      },
      {
        entityGuid: 'MESSAGE_QUEUE_TOPIC|123456|kafka|cluster1:topic1',
        entityType: 'MESSAGE_QUEUE_TOPIC',
        provider: 'kafka',
        clusterName: 'cluster1',
        topicName: 'user-events'
      }
    ];
    
    // Generate one round
    console.log('Generating one round of data...');
    const results = await generator.generateRound(entities);
    console.log('Generated data:', results.data);
    
    // Generate anomalies
    console.log('Generating spike anomalies...');
    const anomalies = await generator.generateAnomalies(
      entities.filter(e => e.entityType === 'MESSAGE_QUEUE_BROKER'),
      'spike'
    );
    console.log('Generated anomalies:', anomalies);
    
    // Show status
    console.log('Generator status:', generator.getStatus());
    
  } catch (error) {
    console.error('Generation failed:', error);
  } finally {
    await generator.stop();
  }
}

// Run example if called directly
if (require.main === module) {
  main().catch(console.error);
}