/**
 * Entity Simulator
 * 
 * Creates simulated entities to fill gaps in infrastructure coverage
 */

import { injectable, inject } from 'inversify';
import { TYPES } from '../config/types.js';
import { Logger } from '../../shared/utils/logger.js';
import { ConfigurationService } from '../config/configuration-service.js';
import { SynthesizedEntity } from '../../synthesizers/entity-synthesizer.js';
import { ClusterSpec, BrokerSpec, TopicSpec, ConsumerGroupSpec } from './gap-detector.js';

@injectable()
export class EntitySimulator {
  private readonly accountId: string;

  constructor(
    @inject(TYPES.Logger) private readonly logger: Logger,
    @inject(TYPES.ConfigurationService) private readonly config: ConfigurationService
  ) {
    this.logger = new Logger('EntitySimulator');
    this.accountId = this.config.getNewRelicConfig().accountId;
  }

  /**
   * Simulate a complete cluster with all related entities
   */
  async simulateCluster(spec: ClusterSpec): Promise<SynthesizedEntity[]> {
    const entities: SynthesizedEntity[] = [];
    
    // Create cluster entity
    const cluster = this.createClusterEntity(spec);
    entities.push(cluster);
    
    // Create default brokers if specified
    if (spec.requiredBrokers && spec.requiredBrokers > 0) {
      for (let i = 1; i <= spec.requiredBrokers; i++) {
        const broker = await this.simulateBroker({
          clusterName: spec.name,
          id: String(i)
        });
        entities.push(broker);
      }
    }
    
    this.logger.info(`Simulated cluster ${spec.name} with ${entities.length} entities`);
    return entities;
  }

  /**
   * Simulate a broker entity
   */
  async simulateBroker(spec: BrokerSpec): Promise<SynthesizedEntity> {
    const entity: SynthesizedEntity = {
      entityGuid: `MESSAGE_QUEUE_BROKER|${this.accountId}|kafka|${spec.clusterName}|${spec.id}`,
      entityType: 'MESSAGE_QUEUE_BROKER',
      entityName: `${spec.clusterName}-broker-${spec.id}`,
      displayName: `Broker ${spec.id}`,
      accountId: this.accountId,
      clusterName: spec.clusterName,
      brokerId: spec.id,
      provider: 'kafka',
      tags: {
        'message.queue.broker.id': spec.id,
        'message.queue.cluster.name': spec.clusterName,
        'message.queue.provider': 'kafka',
        'simulated': 'true',
        'hybridMode': 'gapFilled'
      },
      metrics: this.generateBrokerMetrics(),
      metadata: {
        hostname: `broker-${spec.id}.${spec.clusterName}`,
        port: '9092',
        version: '2.8.0',
        state: 'online'
      },
      relationships: [
        {
          type: 'CONTAINED_IN',
          source: `MESSAGE_QUEUE_BROKER|${this.accountId}|kafka|${spec.clusterName}|${spec.id}`,
          target: `MESSAGE_QUEUE_CLUSTER|${this.accountId}|kafka|${spec.clusterName}`,
          attributes: {}
        }
      ],
      lastSeenAt: Date.now()
    };
    
    return entity;
  }

  /**
   * Simulate a topic entity
   */
  async simulateTopic(spec: TopicSpec): Promise<SynthesizedEntity> {
    const entity: SynthesizedEntity = {
      entityGuid: `MESSAGE_QUEUE_TOPIC|${this.accountId}|kafka|${spec.clusterName}|${spec.name}`,
      entityType: 'MESSAGE_QUEUE_TOPIC',
      entityName: `${spec.clusterName}-topic-${spec.name}`,
      displayName: spec.name,
      accountId: this.accountId,
      clusterName: spec.clusterName,
      topicName: spec.name,
      provider: 'kafka',
      tags: {
        'message.queue.topic.name': spec.name,
        'message.queue.cluster.name': spec.clusterName,
        'message.queue.provider': 'kafka',
        'simulated': 'true',
        'hybridMode': 'gapFilled'
      },
      metrics: this.generateTopicMetrics(),
      metadata: {
        partitions: spec.partitions || 3,
        replicationFactor: spec.replicationFactor || 2,
        retentionMs: '604800000', // 7 days
        compressionType: 'gzip',
        cleanupPolicy: 'delete'
      },
      partitionCount: spec.partitions || 3,
      replicationFactor: spec.replicationFactor || 2,
      relationships: [
        {
          type: 'CONTAINED_IN',
          source: `MESSAGE_QUEUE_TOPIC|${this.accountId}|kafka|${spec.clusterName}|${spec.name}`,
          target: `MESSAGE_QUEUE_CLUSTER|${this.accountId}|kafka|${spec.clusterName}`,
          attributes: {}
        }
      ],
      lastSeenAt: Date.now()
    };
    
    return entity;
  }

  /**
   * Simulate a consumer group entity
   */
  async simulateConsumerGroup(spec: ConsumerGroupSpec): Promise<SynthesizedEntity> {
    const entity: SynthesizedEntity = {
      entityGuid: `MESSAGE_QUEUE_CONSUMER_GROUP|${this.accountId}|kafka|${spec.clusterName}|${spec.id}`,
      entityType: 'MESSAGE_QUEUE_CONSUMER_GROUP',
      entityName: `${spec.clusterName}-consumer-${spec.id}`,
      displayName: spec.id,
      accountId: this.accountId,
      clusterName: spec.clusterName,
      consumerGroupId: spec.id,
      provider: 'kafka',
      tags: {
        'message.queue.consumer.group.id': spec.id,
        'message.queue.cluster.name': spec.clusterName,
        'message.queue.provider': 'kafka',
        'simulated': 'true',
        'hybridMode': 'gapFilled'
      },
      metrics: this.generateConsumerGroupMetrics(),
      metadata: {
        state: 'stable',
        protocol: 'range',
        memberCount: 3,
        topics: spec.topics || ['events', 'logs']
      },
      relationships: [
        {
          type: 'CONTAINED_IN',
          source: `MESSAGE_QUEUE_CONSUMER_GROUP|${this.accountId}|kafka|${spec.clusterName}|${spec.id}`,
          target: `MESSAGE_QUEUE_CLUSTER|${this.accountId}|kafka|${spec.clusterName}`,
          attributes: {}
        }
      ],
      lastSeenAt: Date.now()
    };
    
    // Add topic relationships
    if (spec.topics) {
      spec.topics.forEach(topicName => {
        entity.relationships!.push({
          type: 'CONSUMES_FROM',
          source: entity.entityGuid,
          target: `MESSAGE_QUEUE_TOPIC|${this.accountId}|kafka|${spec.clusterName}|${topicName}`,
          attributes: {}
        });
      });
    }
    
    return entity;
  }

  /**
   * Create cluster entity
   */
  private createClusterEntity(spec: ClusterSpec): SynthesizedEntity {
    return {
      entityGuid: `MESSAGE_QUEUE_CLUSTER|${this.accountId}|kafka|${spec.name}`,
      entityType: 'MESSAGE_QUEUE_CLUSTER',
      entityName: `kafka-cluster-${spec.name}`,
      displayName: spec.name,
      accountId: this.accountId,
      clusterName: spec.name,
      provider: 'kafka',
      tags: {
        'message.queue.cluster.name': spec.name,
        'message.queue.provider': 'kafka',
        'simulated': 'true',
        'hybridMode': 'gapFilled'
      },
      metrics: this.generateClusterMetrics(spec.requiredBrokers || 3),
      metadata: {
        version: '2.8.0',
        brokerCount: spec.requiredBrokers || 3,
        controllerId: '1'
      },
      lastSeenAt: Date.now()
    };
  }

  /**
   * Generate realistic broker metrics
   */
  private generateBrokerMetrics(): Record<string, number> {
    return {
      'broker.bytesInPerSecond': this.randomBetween(100000, 500000),
      'broker.bytesOutPerSecond': this.randomBetween(100000, 500000),
      'broker.messagesInPerSecond': this.randomBetween(1000, 5000),
      'broker.requestsPerSecond': this.randomBetween(100, 1000),
      'broker.cpu.usage': this.randomBetween(10, 50),
      'broker.memory.usage': this.randomBetween(30, 70),
      'broker.disk.usage': this.randomBetween(20, 60),
      'broker.partition.count': this.randomBetween(10, 50),
      'broker.leader.partition.count': this.randomBetween(5, 25),
      'broker.under.replicated.partitions': 0,
      'broker.offline.partitions': 0
    };
  }

  /**
   * Generate realistic topic metrics
   */
  private generateTopicMetrics(): Record<string, number> {
    return {
      'topic.bytesInPerSecond': this.randomBetween(10000, 100000),
      'topic.bytesOutPerSecond': this.randomBetween(10000, 100000),
      'topic.messagesInPerSecond': this.randomBetween(100, 1000),
      'topic.messagesOutPerSecond': this.randomBetween(100, 1000),
      'topic.fetchRequestsPerSecond': this.randomBetween(10, 100),
      'topic.produceRequestsPerSecond': this.randomBetween(10, 100),
      'topic.log.size': this.randomBetween(1000000, 10000000),
      'topic.log.offset.start': 0,
      'topic.log.offset.end': this.randomBetween(1000, 100000)
    };
  }

  /**
   * Generate realistic consumer group metrics
   */
  private generateConsumerGroupMetrics(): Record<string, number> {
    return {
      'consumerGroup.messageConsumptionRate': this.randomBetween(100, 1000),
      'consumerGroup.bytesConsumptionRate': this.randomBetween(10000, 100000),
      'consumerGroup.offsetLag': this.randomBetween(0, 1000),
      'consumerGroup.maxOffsetLag': this.randomBetween(0, 2000),
      'consumerGroup.avgOffsetLag': this.randomBetween(0, 500),
      'consumerGroup.memberCount': 3,
      'consumerGroup.assignedPartitions': this.randomBetween(5, 15),
      'consumerGroup.rebalanceRate': 0,
      'consumerGroup.lastRebalanceSecondsAgo': 3600
    };
  }

  /**
   * Generate cluster-level aggregated metrics
   */
  private generateClusterMetrics(brokerCount: number): Record<string, number> {
    return {
      'cluster.health.score': 100,
      'cluster.brokers.count': brokerCount,
      'cluster.topics.count': this.randomBetween(5, 20),
      'cluster.partitions.total': this.randomBetween(50, 200),
      'cluster.throughput.in': this.randomBetween(1000000, 5000000),
      'cluster.throughput.out': this.randomBetween(1000000, 5000000),
      'cluster.messages.rate': this.randomBetween(5000, 20000),
      'cluster.error.rate': 0,
      'cluster.availability.percentage': 100
    };
  }

  /**
   * Generate random number between min and max
   */
  private randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}