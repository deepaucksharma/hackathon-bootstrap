/**
 * Simulation Collector
 * 
 * Generates synthetic data that exactly mimics nri-kafka format.
 * Useful for testing, demos, and development without a real Kafka cluster.
 */

import { BaseCollector, RawSample } from './base-collector.js';
import { PlatformConfig } from '../shared/types/config.js';

interface SimulationTopology {
  clusters: number;
  brokersPerCluster: number;
  topicsPerCluster: number;
  consumerGroupsPerTopic: number;
}

export class SimulationCollector extends BaseCollector {
  private topology: SimulationTopology;
  private iteration: number = 0;

  constructor(config: PlatformConfig) {
    super(config);
    
    // Default topology
    this.topology = {
      clusters: config.simulationClusters || 1,
      brokersPerCluster: config.simulationBrokers || 3,
      topicsPerCluster: config.simulationTopics || 10,
      consumerGroupsPerTopic: config.simulationConsumerGroups || 2
    };
    
    this.logger.info('Simulation collector initialized', this.topology);
  }

  async collect(): Promise<RawSample[]> {
    this.iteration++;
    const samples: RawSample[] = [];
    
    try {
      // Generate samples for each cluster
      for (let c = 0; c < this.topology.clusters; c++) {
        const clusterName = `kafka-cluster-${c + 1}`;
        
        // Generate broker samples
        for (let b = 0; b < this.topology.brokersPerCluster; b++) {
          samples.push(this.generateBrokerSample(clusterName, b + 1));
        }
        
        // Generate topic samples
        for (let t = 0; t < this.topology.topicsPerCluster; t++) {
          const topicName = `topic-${t + 1}`;
          samples.push(this.generateTopicSample(clusterName, topicName));
          
          // Generate consumer samples for each topic
          for (let cg = 0; cg < this.topology.consumerGroupsPerTopic; cg++) {
            const consumerGroup = `consumer-group-${topicName}-${cg + 1}`;
            samples.push(this.generateConsumerSample(clusterName, topicName, consumerGroup));
          }
        }
      }
      
      // Update stats
      this.stats.totalCollections++;
      this.stats.lastCollectionTime = Date.now();
      this.stats.lastCollectionCount = samples.length;
      
      this.logger.debug(`Generated ${samples.length} simulated samples`);
      return samples;
      
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Error generating simulation data:', error);
      throw error;
    }
  }

  private generateBrokerSample(clusterName: string, brokerId: number): RawSample {
    const hostname = `kafka-broker-${brokerId}.example.com`;
    const baseMetrics = this.generateBaseMetrics();
    
    return {
      eventType: 'KafkaBrokerSample',
      timestamp: Math.floor(Date.now() / 1000),
      
      // Entity identification fields (nri-kafka format)
      entityKey: `broker:brokerid=${brokerId}:hostname=${hostname}`,
      entityName: `kafka-broker-${brokerId}`,
      clusterName,
      
      // Broker identification
      'broker.id': brokerId,
      hostname,
      
      // Throughput metrics (nri-kafka field names)
      'broker.bytesInPerSecond': baseMetrics.throughput * 1024 * 1024,
      'broker.bytesOutPerSecond': baseMetrics.throughput * 1024 * 1024 * 0.8,
      'broker.messagesInPerSecond': baseMetrics.throughput * 1000,
      
      // Resource metrics
      'kafka.broker.memoryUsed': baseMetrics.memory * 1024 * 1024 * 1024,
      'kafka.broker.cpuPercent': baseMetrics.cpu,
      'kafka.broker.diskUsed': baseMetrics.disk * 1024 * 1024 * 1024,
      
      // Partition metrics
      'kafka.broker.partitionCount': 50 + Math.floor(Math.random() * 50),
      'kafka.broker.leaderCount': 25 + Math.floor(Math.random() * 25),
      'kafka.broker.underReplicatedPartitions': Math.random() > 0.95 ? Math.floor(Math.random() * 5) : 0,
      
      // Controller metrics
      'kafka.controller.activeControllerCount': brokerId === 1 ? 1 : 0,
      
      // Request metrics
      'kafka.broker.requestHandlerIdlePercent': 100 - baseMetrics.cpu,
      'kafka.broker.produceRequestsPerSecond': baseMetrics.throughput * 100,
      'kafka.broker.fetchRequestsPerSecond': baseMetrics.throughput * 200,
      
      // Log metrics
      'kafka.broker.logFlushRate': 0.5 + Math.random() * 0.5,
      
      // Provider metadata
      provider: 'KafkaBroker',
      providerVersion: '2.8.0'
    };
  }

  private generateTopicSample(clusterName: string, topicName: string): RawSample {
    const baseMetrics = this.generateBaseMetrics();
    const partitionCount = 3 + Math.floor(Math.random() * 10);
    
    return {
      eventType: 'KafkaTopicSample',
      timestamp: Math.floor(Date.now() / 1000),
      
      // Entity identification
      entityKey: `topic:topic=${topicName}`,
      entityName: topicName,
      clusterName,
      
      // Topic identification
      topic: topicName,
      'topic.name': topicName,
      
      // Throughput metrics
      'topic.bytesInPerSecond': baseMetrics.throughput * 512 * 1024,
      'topic.bytesOutPerSecond': baseMetrics.throughput * 512 * 1024 * 0.9,
      'topic.messagesInPerSecond': baseMetrics.throughput * 500,
      
      // Partition metrics
      'topic.partitions': partitionCount,
      'topic.partitionCount': partitionCount,
      'topic.replicationFactor': 3,
      'topic.minInSyncReplicas': 2,
      'topic.underReplicatedPartitions': Math.random() > 0.95 ? 1 : 0,
      
      // Size metrics
      'topic.sizeBytes': Math.floor(Math.random() * 100) * 1024 * 1024 * 1024,
      'topic.retentionBytes': 100 * 1024 * 1024 * 1024,
      'topic.retentionMs': 7 * 24 * 60 * 60 * 1000,
      
      // Provider metadata
      provider: 'KafkaTopic',
      providerVersion: '2.8.0'
    };
  }

  private generateConsumerSample(clusterName: string, topicName: string, consumerGroup: string): RawSample {
    const baseMetrics = this.generateBaseMetrics();
    const lag = Math.floor(Math.random() * 10000);
    
    return {
      eventType: 'KafkaConsumerSample',
      timestamp: Math.floor(Date.now() / 1000),
      
      // Entity identification
      entityKey: `consumer:group=${consumerGroup}:topic=${topicName}`,
      entityName: consumerGroup,
      clusterName,
      
      // Consumer identification
      'consumer.group': consumerGroup,
      'consumer.topic': topicName,
      consumerGroup,
      topic: topicName,
      
      // Lag metrics
      'consumer.lag': lag,
      'consumer.totalLag': lag,
      'consumer.maxLag': lag * 1.2,
      'consumer.avgLag': lag * 0.8,
      
      // Offset metrics
      'consumer.offset': 1000000 + Math.floor(Math.random() * 1000000),
      'consumer.highWaterMark': 2000000 + Math.floor(Math.random() * 1000000),
      'consumer.lowWaterMark': 500000 + Math.floor(Math.random() * 500000),
      
      // Throughput metrics
      'consumer.messagesConsumedPerSecond': baseMetrics.throughput * 450,
      'consumer.bytesConsumedPerSecond': baseMetrics.throughput * 450 * 1024,
      
      // Member metrics
      'consumer.memberCount': 3,
      'consumer.activeMembers': 3,
      'consumer.rebalanceRate': Math.random() * 0.1,
      
      // State
      'consumer.state': 'Stable',
      
      // Provider metadata
      provider: 'KafkaConsumer',
      providerVersion: '2.8.0'
    };
  }

  private generateBaseMetrics() {
    // Generate realistic patterns based on time of day
    const hour = new Date().getHours();
    const isBusinessHours = hour >= 9 && hour <= 17;
    
    // Base load varies by time of day
    const baseLoad = isBusinessHours ? 0.7 : 0.3;
    const variance = 0.2;
    
    return {
      throughput: baseLoad + (Math.random() - 0.5) * variance,
      cpu: (baseLoad * 60) + (Math.random() - 0.5) * 20,
      memory: (baseLoad * 70) + (Math.random() - 0.5) * 15,
      disk: 0.4 + (Math.random() - 0.5) * 0.2
    };
  }
}