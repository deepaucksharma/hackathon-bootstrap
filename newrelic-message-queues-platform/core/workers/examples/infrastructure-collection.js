/**
 * Example: Using Worker Pool for Infrastructure Data Collection
 * 
 * This example shows how to use the worker pool for concurrent collection
 * of infrastructure data from multiple Kafka brokers, topics, and consumers.
 */

const { DataCollectionPool } = require('../worker-pool');

/**
 * Infrastructure Data Collector using Worker Pool
 */
class InfrastructureCollector {
  constructor(options = {}) {
    this.brokerPool = new DataCollectionPool({
      name: 'BrokerCollectionPool',
      poolSize: options.brokerPoolSize || 10,
      taskTimeout: 60000,
      batchSize: 50
    });
    
    this.topicPool = new DataCollectionPool({
      name: 'TopicCollectionPool', 
      poolSize: options.topicPoolSize || 15,
      taskTimeout: 30000,
      batchSize: 100
    });
    
    this.consumerPool = new DataCollectionPool({
      name: 'ConsumerCollectionPool',
      poolSize: options.consumerPoolSize || 8,
      taskTimeout: 45000,
      batchSize: 75
    });
    
    this.nerdGraphClient = options.nerdGraphClient;
    this.metrics = {
      collectionsCompleted: 0,
      totalBrokersProcessed: 0,
      totalTopicsProcessed: 0,
      totalConsumersProcessed: 0,
      errors: 0
    };
  }
  
  /**
   * Start all worker pools
   */
  async start() {
    console.log('Starting infrastructure collector pools...');
    
    this.brokerPool.start();
    this.topicPool.start();
    this.consumerPool.start();
    
    // Set up event listeners for monitoring
    this._setupEventListeners();
    
    console.log('All worker pools started');
  }
  
  /**
   * Stop all worker pools gracefully
   */
  async stop() {
    console.log('Stopping infrastructure collector pools...');
    
    await Promise.all([
      this.brokerPool.stop(),
      this.topicPool.stop(),
      this.consumerPool.stop()
    ]);
    
    console.log('All worker pools stopped');
  }
  
  /**
   * Collect data for all Kafka infrastructure components
   */
  async collectAll(clusters) {
    const startTime = Date.now();
    
    try {
      // Collect broker data concurrently
      const brokerPromises = clusters.map(cluster => 
        this.collectBrokerData(cluster)
      );
      
      // Collect topic data concurrently  
      const topicPromises = clusters.map(cluster =>
        this.collectTopicData(cluster)
      );
      
      // Collect consumer data concurrently
      const consumerPromises = clusters.map(cluster =>
        this.collectConsumerData(cluster)
      );
      
      // Wait for all collections to complete
      const [brokerResults, topicResults, consumerResults] = await Promise.all([
        Promise.allSettled(brokerPromises),
        Promise.allSettled(topicPromises),
        Promise.allSettled(consumerPromises)
      ]);
      
      const duration = Date.now() - startTime;
      
      // Aggregate results
      const results = this._aggregateResults({
        brokers: brokerResults,
        topics: topicResults,
        consumers: consumerResults,
        duration
      });
      
      this.metrics.collectionsCompleted++;
      
      return results;
      
    } catch (error) {
      this.metrics.errors++;
      console.error('Infrastructure collection failed:', error);
      throw error;
    }
  }
  
  /**
   * Collect broker data for a cluster
   */
  async collectBrokerData(cluster) {
    const brokers = await this._discoverBrokers(cluster);
    
    console.log(`Collecting data for ${brokers.length} brokers in cluster ${cluster.name}`);
    
    const brokerCollector = async (broker) => {
      try {
        const query = `
          FROM KafkaBrokerSample 
          SELECT latest(broker.bytesInPerSecond) as bytesIn,
                 latest(broker.bytesOutPerSecond) as bytesOut,
                 latest(broker.messagesInPerSecond) as messagesIn,
                 latest(broker.partitionCount) as partitions,
                 latest(broker.leaderCount) as leaders
          WHERE clusterName = '${cluster.name}' 
            AND \`broker.id\` = ${broker.id}
          SINCE 5 minutes ago
        `;
        
        const response = await this.nerdGraphClient.query(query);
        
        return {
          brokerId: broker.id,
          clusterName: cluster.name,
          metrics: response.data,
          timestamp: Date.now()
        };
        
      } catch (error) {
        console.error(`Failed to collect broker ${broker.id} data:`, error);
        throw error;
      }
    };
    
    const results = await this.brokerPool.collectBatch(brokers, brokerCollector);
    this.metrics.totalBrokersProcessed += results.length;
    
    return results;
  }
  
  /**
   * Collect topic data for a cluster
   */
  async collectTopicData(cluster) {
    const topics = await this._discoverTopics(cluster);
    
    console.log(`Collecting data for ${topics.length} topics in cluster ${cluster.name}`);
    
    const topicCollector = async (topic) => {
      try {
        const query = `
          FROM KafkaTopicSample
          SELECT latest(topic.bytesInPerSecond) as bytesIn,
                 latest(topic.bytesOutPerSecond) as bytesOut,
                 latest(topic.messagesInPerSecond) as messagesIn,
                 latest(topic.partitionsCount) as partitions,
                 latest(topic.replicationFactor) as replicationFactor
          WHERE clusterName = '${cluster.name}'
            AND topicName = '${topic.name}'
          SINCE 5 minutes ago
        `;
        
        const response = await this.nerdGraphClient.query(query);
        
        return {
          topicName: topic.name,
          clusterName: cluster.name,
          metrics: response.data,
          timestamp: Date.now()
        };
        
      } catch (error) {
        console.error(`Failed to collect topic ${topic.name} data:`, error);
        throw error;
      }
    };
    
    const results = await this.topicPool.collectBatch(topics, topicCollector);
    this.metrics.totalTopicsProcessed += results.length;
    
    return results;
  }
  
  /**
   * Collect consumer group data for a cluster
   */
  async collectConsumerData(cluster) {
    const consumerGroups = await this._discoverConsumerGroups(cluster);
    
    console.log(`Collecting data for ${consumerGroups.length} consumer groups in cluster ${cluster.name}`);
    
    const consumerCollector = async (consumerGroup) => {
      try {
        const query = `
          FROM KafkaConsumerSample
          SELECT latest(consumer.lag) as lag,
                 latest(consumer.offset) as offset,
                 latest(consumer.highWaterMark) as highWaterMark
          WHERE clusterName = '${cluster.name}'
            AND consumerGroup = '${consumerGroup.name}'
          SINCE 5 minutes ago
        `;
        
        const response = await this.nerdGraphClient.query(query);
        
        return {
          consumerGroup: consumerGroup.name,
          clusterName: cluster.name,
          metrics: response.data,
          timestamp: Date.now()
        };
        
      } catch (error) {
        console.error(`Failed to collect consumer group ${consumerGroup.name} data:`, error);
        throw error;
      }
    };
    
    const results = await this.consumerPool.collectBatch(consumerGroups, consumerCollector);
    this.metrics.totalConsumersProcessed += results.length;
    
    return results;
  }
  
  /**
   * Stream collection for continuous monitoring
   */
  async startStreaming(clusters, interval = 30000) {
    console.log(`Starting streaming collection with ${interval}ms interval`);
    
    const streamingLoop = async () => {
      while (true) {
        try {
          const results = await this.collectAll(clusters);
          
          console.log('Collection completed:', {
            brokers: results.summary.totalBrokers,
            topics: results.summary.totalTopics,
            consumers: results.summary.totalConsumers,
            duration: results.duration
          });
          
          // Wait for next interval
          await new Promise(resolve => setTimeout(resolve, interval));
          
        } catch (error) {
          console.error('Streaming collection error:', error);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    };
    
    // Start streaming in background
    streamingLoop().catch(console.error);
  }
  
  /**
   * Get collector status and metrics
   */
  getStatus() {
    return {
      pools: {
        brokers: this.brokerPool.getStatus(),
        topics: this.topicPool.getStatus(),
        consumers: this.consumerPool.getStatus()
      },
      metrics: { ...this.metrics }
    };
  }
  
  /**
   * Set up event listeners for monitoring
   */
  _setupEventListeners() {
    const logPoolEvent = (poolName, event, data) => {
      console.log(`[${poolName}] ${event}:`, data);
    };
    
    // Broker pool events
    this.brokerPool.on('taskCompleted', (data) => {
      logPoolEvent('BrokerPool', 'taskCompleted', {
        taskId: data.taskId,
        duration: data.duration
      });
    });
    
    this.brokerPool.on('taskFailed', (data) => {
      logPoolEvent('BrokerPool', 'taskFailed', {
        taskId: data.taskId,
        error: data.error
      });
    });
    
    // Topic pool events
    this.topicPool.on('taskCompleted', (data) => {
      logPoolEvent('TopicPool', 'taskCompleted', {
        taskId: data.taskId,
        duration: data.duration
      });
    });
    
    // Consumer pool events  
    this.consumerPool.on('taskCompleted', (data) => {
      logPoolEvent('ConsumerPool', 'taskCompleted', {
        taskId: data.taskId,
        duration: data.duration
      });
    });
  }
  
  /**
   * Discover brokers in cluster (mock implementation)
   */
  async _discoverBrokers(cluster) {
    // In real implementation, query NRDB for broker list
    return Array.from({ length: cluster.brokerCount || 3 }, (_, i) => ({
      id: i + 1,
      host: `broker-${i + 1}.${cluster.name}`,
      port: 9092
    }));
  }
  
  /**
   * Discover topics in cluster (mock implementation)
   */
  async _discoverTopics(cluster) {
    // In real implementation, query NRDB for topic list
    const topicNames = ['user-events', 'order-events', 'payment-events', 'audit-logs'];
    return topicNames.map(name => ({
      name,
      partitions: Math.floor(Math.random() * 10) + 1
    }));
  }
  
  /**
   * Discover consumer groups in cluster (mock implementation)
   */
  async _discoverConsumerGroups(cluster) {
    // In real implementation, query NRDB for consumer group list
    const groupNames = ['user-service', 'order-service', 'analytics-service'];
    return groupNames.map(name => ({
      name,
      memberCount: Math.floor(Math.random() * 5) + 1
    }));
  }
  
  /**
   * Aggregate collection results
   */
  _aggregateResults(results) {
    const successful = {
      brokers: results.brokers.filter(r => r.status === 'fulfilled').length,
      topics: results.topics.filter(r => r.status === 'fulfilled').length,
      consumers: results.consumers.filter(r => r.status === 'fulfilled').length
    };
    
    const failed = {
      brokers: results.brokers.filter(r => r.status === 'rejected').length,
      topics: results.topics.filter(r => r.status === 'rejected').length,
      consumers: results.consumers.filter(r => r.status === 'rejected').length
    };
    
    return {
      success: successful,
      failed: failed,
      summary: {
        totalBrokers: successful.brokers,
        totalTopics: successful.topics,
        totalConsumers: successful.consumers,
        totalFailed: failed.brokers + failed.topics + failed.consumers
      },
      duration: results.duration,
      timestamp: Date.now()
    };
  }
}

module.exports = { InfrastructureCollector };

// Example usage
async function main() {
  const collector = new InfrastructureCollector({
    brokerPoolSize: 10,
    topicPoolSize: 15,
    consumerPoolSize: 8,
    nerdGraphClient: {
      query: async (query) => {
        // Mock NerdGraph response
        return {
          data: {
            bytesIn: Math.random() * 1000000,
            bytesOut: Math.random() * 1000000,
            messagesIn: Math.random() * 1000,
            partitions: 10,
            leaders: 5
          }
        };
      }
    }
  });
  
  try {
    await collector.start();
    
    const clusters = [
      { name: 'production-kafka', brokerCount: 5 },
      { name: 'staging-kafka', brokerCount: 3 }
    ];
    
    // One-time collection
    console.log('Running one-time collection...');
    const results = await collector.collectAll(clusters);
    console.log('Collection results:', results);
    
    // Start streaming collection
    // collector.startStreaming(clusters, 30000);
    
    // Show status
    console.log('Collector status:', collector.getStatus());
    
  } catch (error) {
    console.error('Collection failed:', error);
  } finally {
    await collector.stop();
  }
}

// Run example if called directly
if (require.main === module) {
  main().catch(console.error);
}