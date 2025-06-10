/**
 * Entity Synthesizer
 * 
 * Creates MESSAGE_QUEUE entities from transformed metrics.
 * This is the ONLY place where entities are created.
 * Follows New Relic's entity synthesis platform rules.
 */

import { Logger } from '../shared/utils/logger';
import { PlatformConfig } from '../shared/types/config';
import { TransformedMetrics } from '../transformers/base-transformer';

export interface SynthesizedEntity {
  // Required for entity synthesis
  eventType: 'MessageQueue';
  entityType: 'MESSAGE_QUEUE_BROKER' | 'MESSAGE_QUEUE_TOPIC' | 'MESSAGE_QUEUE_CLUSTER' | 'MESSAGE_QUEUE_CONSUMER_GROUP';
  entityGuid: string;
  displayName: string;
  
  // Entity metadata
  reportingEntity?: string;
  timestamp: number;
  
  // All metrics (prefixed by entity type)
  [key: string]: any;
  
  // Tags for entity grouping and filtering
  tags: Record<string, string>;
}

export interface SynthesizerStats {
  totalSynthesized: number;
  synthesizedByType: Record<string, number>;
  errors: number;
}

export class EntitySynthesizer {
  private logger: Logger;
  private config: PlatformConfig;
  private stats: SynthesizerStats;

  constructor(config: PlatformConfig) {
    this.config = config;
    this.logger = new Logger('EntitySynthesizer');
    this.stats = {
      totalSynthesized: 0,
      synthesizedByType: {},
      errors: 0
    };
  }

  /**
   * Synthesize a New Relic entity from transformed metrics
   */
  async synthesize(metrics: TransformedMetrics): Promise<SynthesizedEntity> {
    try {
      let entity: SynthesizedEntity;

      switch (metrics.entityType) {
        case 'broker':
          entity = this.synthesizeBrokerEntity(metrics);
          break;
        case 'topic':
          entity = this.synthesizeTopicEntity(metrics);
          break;
        case 'consumer':
          entity = this.synthesizeConsumerEntity(metrics);
          break;
        case 'cluster':
          entity = this.synthesizeClusterEntity(metrics);
          break;
        default:
          throw new Error(`Unknown entity type: ${metrics.entityType}`);
      }

      // Update stats
      this.stats.totalSynthesized++;
      this.stats.synthesizedByType[entity.entityType] = 
        (this.stats.synthesizedByType[entity.entityType] || 0) + 1;

      return entity;
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Error synthesizing entity:', error);
      throw error;
    }
  }

  private synthesizeBrokerEntity(metrics: TransformedMetrics): SynthesizedEntity {
    const { clusterName, identifiers } = metrics;
    const brokerId = identifiers.brokerId;
    const hostname = identifiers.hostname;

    // Generate GUID following pattern: {entityType}|{accountId}|{provider}|{identifiers}
    const entityGuid = this.generateEntityGuid('MESSAGE_QUEUE_BROKER', [
      this.config.accountId,
      'kafka',
      clusterName,
      brokerId
    ]);

    const entity: SynthesizedEntity = {
      // Required entity fields
      eventType: 'MessageQueue',
      entityType: 'MESSAGE_QUEUE_BROKER',
      entityGuid,
      displayName: `kafka-broker-${clusterName}-${brokerId}`,
      reportingEntity: hostname,
      timestamp: metrics.timestamp,

      // Tags for grouping and filtering
      tags: {
        'provider': 'kafka',
        'clusterName': clusterName,
        'brokerId': brokerId,
        'hostname': hostname,
        'environment': this.config.environment || 'production'
      }
    };

    // Add all metrics with proper prefix
    Object.entries(metrics.metrics).forEach(([key, value]) => {
      entity[`broker.${key}`] = value;
    });

    return entity;
  }

  private synthesizeTopicEntity(metrics: TransformedMetrics): SynthesizedEntity {
    const { clusterName, identifiers } = metrics;
    const topicName = identifiers.topicName;

    const entityGuid = this.generateEntityGuid('MESSAGE_QUEUE_TOPIC', [
      this.config.accountId,
      'kafka',
      clusterName,
      topicName
    ]);

    const entity: SynthesizedEntity = {
      eventType: 'MessageQueue',
      entityType: 'MESSAGE_QUEUE_TOPIC',
      entityGuid,
      displayName: `kafka-topic-${topicName}`,
      timestamp: metrics.timestamp,

      tags: {
        'provider': 'kafka',
        'clusterName': clusterName,
        'topicName': topicName,
        'environment': this.config.environment || 'production'
      }
    };

    // Add metrics with topic prefix
    Object.entries(metrics.metrics).forEach(([key, value]) => {
      entity[`topic.${key}`] = value;
    });

    return entity;
  }

  private synthesizeConsumerEntity(metrics: TransformedMetrics): SynthesizedEntity {
    const { clusterName, identifiers } = metrics;
    const consumerGroup = identifiers.consumerGroup;
    const topicName = identifiers.topicName;

    const entityGuid = this.generateEntityGuid('MESSAGE_QUEUE_CONSUMER_GROUP', [
      this.config.accountId,
      'kafka',
      clusterName,
      consumerGroup
    ]);

    const entity: SynthesizedEntity = {
      eventType: 'MessageQueue',
      entityType: 'MESSAGE_QUEUE_CONSUMER_GROUP',
      entityGuid,
      displayName: consumerGroup,
      timestamp: metrics.timestamp,

      tags: {
        'provider': 'kafka',
        'clusterName': clusterName,
        'consumerGroup': consumerGroup,
        'topicName': topicName,
        'environment': this.config.environment || 'production'
      }
    };

    // Add metrics with consumerGroup prefix
    Object.entries(metrics.metrics).forEach(([key, value]) => {
      entity[`consumerGroup.${key}`] = value;
    });

    return entity;
  }

  private synthesizeClusterEntity(metrics: TransformedMetrics): SynthesizedEntity {
    const { clusterName } = metrics;

    const entityGuid = this.generateEntityGuid('MESSAGE_QUEUE_CLUSTER', [
      this.config.accountId,
      'kafka',
      clusterName
    ]);

    const entity: SynthesizedEntity = {
      eventType: 'MessageQueue',
      entityType: 'MESSAGE_QUEUE_CLUSTER',
      entityGuid,
      displayName: `kafka-cluster-${clusterName}`,
      timestamp: metrics.timestamp,

      tags: {
        'provider': 'kafka',
        'clusterName': clusterName,
        'environment': this.config.environment || 'production'
      }
    };

    // Add metrics with cluster prefix
    Object.entries(metrics.metrics).forEach(([key, value]) => {
      entity[`cluster.${key}`] = value;
    });

    return entity;
  }

  /**
   * Generate entity GUID following New Relic's pattern
   */
  private generateEntityGuid(entityType: string, components: (string | number)[]): string {
    // Join components with pipe separator
    return components
      .map(c => String(c))
      .filter(c => c && c !== 'undefined')
      .join('|');
  }

  getStats(): SynthesizerStats {
    return { ...this.stats };
  }
}