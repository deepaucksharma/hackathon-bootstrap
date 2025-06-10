/**
 * Message Queue Topic Domain Entity
 * Represents a topic/channel in a message queue system
 */

import { BaseEntity } from './base-entity.js';
import { EntityGUID } from '@domain/value-objects/entity-guid.js';
import { GoldenMetric } from '@domain/value-objects/golden-metric.js';
import type { AccountId, ProviderType, EntityRelationship } from '@shared/types/common.js';
import { ValidationError } from '@shared/errors/base.js';

export interface TopicConfig {
  readonly accountId: AccountId;
  readonly provider: ProviderType;
  readonly clusterName: string;
  readonly topicName: string;
  readonly partitionCount?: number;
  readonly replicationFactor?: number;
  readonly retentionMs?: number;
  readonly compressionType?: string;
  readonly environment?: string;
}

export interface TopicMetrics {
  readonly messageInRate?: number;
  readonly messageOutRate?: number;
  readonly bytesInRate?: number;
  readonly bytesOutRate?: number;
  readonly totalMessages?: number;
  readonly totalBytes?: number;
  readonly consumerCount?: number;
  readonly partitionCount?: number;
  readonly underReplicatedPartitions?: number;
  readonly leaderElectionRate?: number;
  readonly offsetLag?: number;
}

export class MessageQueueTopic extends BaseEntity {
  private readonly _guid: EntityGUID;
  private _name: string;
  private _displayName: string;
  private _partitionCount: number;
  private _replicationFactor: number;
  private _retentionMs?: number;
  private _compressionType: string;
  private _environment: string;
  private _goldenMetrics: Map<string, GoldenMetric>;
  private _relationships: EntityRelationship[];
  private _tags: Map<string, string>;
  private _isInternal: boolean;

  constructor(config: TopicConfig, id?: string) {
    super(id);
    
    this.validateConfig(config);
    
    this._guid = new EntityGUID(
      config.accountId,
      'MESSAGE_QUEUE_TOPIC',
      config.provider,
      config.clusterName,
      config.topicName
    );
    
    this._name = config.topicName;
    this._displayName = `${config.clusterName}-topic-${config.topicName}`;
    this._partitionCount = config.partitionCount || 1;
    this._replicationFactor = config.replicationFactor || 1;
    this._retentionMs = config.retentionMs;
    this._compressionType = config.compressionType || 'none';
    this._environment = config.environment || 'production';
    this._goldenMetrics = new Map();
    this._relationships = [];
    this._tags = new Map();
    this._isInternal = config.topicName.startsWith('_') || config.topicName.startsWith('__');
    
    // Initialize default tags
    this.initializeDefaultTags(config);
    
    // Add domain event for topic creation
    this.addDomainEvent(
      this.createDomainEvent('TopicCreated', {
        guid: this._guid.value,
        clusterName: config.clusterName,
        topicName: config.topicName,
        partitionCount: this._partitionCount,
        replicationFactor: this._replicationFactor
      })
    );
  }

  /**
   * Get topic GUID
   */
  public get guid(): EntityGUID {
    return this._guid;
  }

  /**
   * Get topic name
   */
  public get name(): string {
    return this._name;
  }

  /**
   * Get display name
   */
  public get displayName(): string {
    return this._displayName;
  }

  /**
   * Get partition count
   */
  public get partitionCount(): number {
    return this._partitionCount;
  }

  /**
   * Get replication factor
   */
  public get replicationFactor(): number {
    return this._replicationFactor;
  }

  /**
   * Get retention period in milliseconds
   */
  public get retentionMs(): number | undefined {
    return this._retentionMs;
  }

  /**
   * Get compression type
   */
  public get compressionType(): string {
    return this._compressionType;
  }

  /**
   * Get environment
   */
  public get environment(): string {
    return this._environment;
  }

  /**
   * Check if this is an internal topic
   */
  public get isInternal(): boolean {
    return this._isInternal;
  }

  /**
   * Get golden metrics
   */
  public get goldenMetrics(): ReadonlyArray<GoldenMetric> {
    return Array.from(this._goldenMetrics.values());
  }

  /**
   * Get relationships
   */
  public get relationships(): ReadonlyArray<EntityRelationship> {
    return [...this._relationships];
  }

  /**
   * Get tags
   */
  public get tags(): ReadonlyMap<string, string> {
    return new Map(this._tags);
  }

  /**
   * Update topic metrics
   */
  public updateMetrics(metrics: TopicMetrics): void {
    if (metrics.messageInRate !== undefined) {
      this._goldenMetrics.set(
        'messageInRate',
        GoldenMetric.rate('messageInRate', metrics.messageInRate)
      );
    }

    if (metrics.messageOutRate !== undefined) {
      this._goldenMetrics.set(
        'messageOutRate',
        GoldenMetric.rate('messageOutRate', metrics.messageOutRate)
      );
    }

    if (metrics.bytesInRate !== undefined) {
      this._goldenMetrics.set(
        'bytesInRate',
        GoldenMetric.byteRate('bytesInRate', metrics.bytesInRate)
      );
    }

    if (metrics.bytesOutRate !== undefined) {
      this._goldenMetrics.set(
        'bytesOutRate',
        GoldenMetric.byteRate('bytesOutRate', metrics.bytesOutRate)
      );
    }

    if (metrics.totalMessages !== undefined) {
      this._goldenMetrics.set(
        'totalMessages',
        GoldenMetric.count('totalMessages', metrics.totalMessages)
      );
    }

    if (metrics.consumerCount !== undefined) {
      this._goldenMetrics.set(
        'consumerCount',
        GoldenMetric.count('consumerCount', metrics.consumerCount)
      );
    }

    if (metrics.underReplicatedPartitions !== undefined) {
      this._goldenMetrics.set(
        'underReplicatedPartitions',
        GoldenMetric.count('underReplicatedPartitions', metrics.underReplicatedPartitions)
      );
    }

    if (metrics.offsetLag !== undefined) {
      this._goldenMetrics.set(
        'offsetLag',
        GoldenMetric.latency('offsetLag', metrics.offsetLag)
      );
    }

    this.markModified();
    
    // Add domain event for metrics update
    this.addDomainEvent(
      this.createDomainEvent('TopicMetricsUpdated', {
        guid: this._guid.value,
        metrics: Object.fromEntries(
          Array.from(this._goldenMetrics.entries()).map(([key, metric]) => [key, metric.value])
        )
      })
    );
  }

  /**
   * Update partition count
   */
  public updatePartitionCount(newCount: number): void {
    if (newCount <= 0) {
      throw new ValidationError('Partition count must be greater than 0');
    }
    
    if (newCount < this._partitionCount) {
      throw new ValidationError('Cannot decrease partition count');
    }
    
    if (newCount !== this._partitionCount) {
      const oldCount = this._partitionCount;
      this._partitionCount = newCount;
      this.markModified();
      
      this.addDomainEvent(
        this.createDomainEvent('TopicPartitionCountChanged', {
          guid: this._guid.value,
          oldCount,
          newCount
        })
      );
    }
  }

  /**
   * Update topic configuration
   */
  public updateConfiguration(config: {
    retentionMs?: number;
    compressionType?: string;
  }): void {
    let hasChanges = false;
    
    if (config.retentionMs !== undefined && config.retentionMs !== this._retentionMs) {
      this._retentionMs = config.retentionMs;
      hasChanges = true;
    }
    
    if (config.compressionType && config.compressionType !== this._compressionType) {
      this._compressionType = config.compressionType;
      hasChanges = true;
    }
    
    if (hasChanges) {
      this.markModified();
      
      this.addDomainEvent(
        this.createDomainEvent('TopicConfigurationUpdated', {
          guid: this._guid.value,
          configuration: {
            retentionMs: this._retentionMs,
            compressionType: this._compressionType
          }
        })
      );
    }
  }

  /**
   * Add a relationship to another entity
   */
  public addRelationship(relationship: EntityRelationship): void {
    const existingIndex = this._relationships.findIndex(
      r => r.type === relationship.type && r.target === relationship.target
    );
    
    if (existingIndex === -1) {
      this._relationships.push(relationship);
      this.markModified();
    }
  }

  /**
   * Remove a relationship
   */
  public removeRelationship(type: string, targetGuid: string): void {
    const index = this._relationships.findIndex(
      r => r.type === type && r.target === targetGuid
    );
    
    if (index !== -1) {
      this._relationships.splice(index, 1);
      this.markModified();
    }
  }

  /**
   * Add or update a tag
   */
  public setTag(key: string, value: string): void {
    this._tags.set(key, value);
    this.markModified();
  }

  /**
   * Get health status based on metrics
   */
  public getHealthStatus(): 'healthy' | 'degraded' | 'unhealthy' {
    const underReplicatedPartitions = this._goldenMetrics.get('underReplicatedPartitions');
    const offsetLag = this._goldenMetrics.get('offsetLag');
    
    // Critical issues
    if (underReplicatedPartitions && underReplicatedPartitions.value > 0) {
      return 'unhealthy';
    }
    
    // Performance degradation
    if (offsetLag && offsetLag.value > 100000) { // > 100k message lag
      return 'degraded';
    }
    
    return 'healthy';
  }

  /**
   * Calculate throughput ratio (out/in)
   */
  public getThroughputRatio(): number {
    const inRate = this._goldenMetrics.get('messageInRate');
    const outRate = this._goldenMetrics.get('messageOutRate');
    
    if (!inRate || !outRate || inRate.value === 0) {
      return 0;
    }
    
    return outRate.value / inRate.value;
  }

  /**
   * Check if topic has consumers
   */
  public hasActiveConsumers(): boolean {
    const consumerCount = this._goldenMetrics.get('consumerCount');
    return consumerCount ? consumerCount.value > 0 : false;
  }

  /**
   * Convert to New Relic event payload
   */
  public toEventPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      eventType: 'MessageQueue',
      timestamp: Date.now(),
      'entity.guid': this._guid.value,
      'entity.name': this._displayName,
      'entity.type': 'MESSAGE_QUEUE_TOPIC',
      entityType: 'MESSAGE_QUEUE_TOPIC',
      entityGuid: this._guid.value,
      provider: this._guid.provider,
      accountId: this._guid.accountId,
      environment: this._environment,
      clusterName: this._guid.domainId,
      topicName: this._name,
      partitionCount: this._partitionCount,
      replicationFactor: this._replicationFactor,
      compressionType: this._compressionType,
      isInternal: this._isInternal
    };

    if (this._retentionMs) {
      payload.retentionMs = this._retentionMs;
    }

    // Add golden metrics
    for (const metric of this._goldenMetrics.values()) {
      Object.assign(payload, metric.toEventAttribute());
    }

    // Add tags
    for (const [key, value] of this._tags) {
      payload[`tag.${key}`] = value;
    }

    return payload;
  }

  /**
   * Validate entity state
   */
  public validate(): void {
    if (!this._guid) {
      throw new ValidationError('Topic GUID is required');
    }
    
    if (!this._name || this._name.trim().length === 0) {
      throw new ValidationError('Topic name is required');
    }
    
    if (this._partitionCount <= 0) {
      throw new ValidationError('Partition count must be greater than 0');
    }
    
    if (this._replicationFactor <= 0) {
      throw new ValidationError('Replication factor must be greater than 0');
    }
  }

  /**
   * Convert to JSON representation
   */
  public toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      guid: this._guid.value,
      name: this._name,
      displayName: this._displayName,
      partitionCount: this._partitionCount,
      replicationFactor: this._replicationFactor,
      retentionMs: this._retentionMs,
      compressionType: this._compressionType,
      environment: this._environment,
      isInternal: this._isInternal,
      goldenMetrics: Array.from(this._goldenMetrics.values()).map(m => m.toJSON()),
      relationships: this._relationships,
      tags: Object.fromEntries(this._tags),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version
    };
  }

  private validateConfig(config: TopicConfig): void {
    if (!config.accountId) {
      throw new ValidationError('Account ID is required');
    }
    
    if (!config.clusterName) {
      throw new ValidationError('Cluster name is required');
    }
    
    if (!config.topicName) {
      throw new ValidationError('Topic name is required');
    }
    
    if (config.partitionCount !== undefined && config.partitionCount <= 0) {
      throw new ValidationError('Partition count must be greater than 0');
    }
    
    if (config.replicationFactor !== undefined && config.replicationFactor <= 0) {
      throw new ValidationError('Replication factor must be greater than 0');
    }
  }

  private initializeDefaultTags(config: TopicConfig): void {
    this._tags.set('environment', this._environment);
    this._tags.set('provider', config.provider);
    this._tags.set('cluster', config.clusterName);
    this._tags.set('topic', config.topicName);
    this._tags.set('is-internal', this._isInternal.toString());
    
    if (config.compressionType) {
      this._tags.set('compression', config.compressionType);
    }
  }
}