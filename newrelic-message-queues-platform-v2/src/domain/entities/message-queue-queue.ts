/**
 * Message Queue Queue Domain Entity
 * Represents a queue in message queue systems (RabbitMQ, SQS, etc.)
 */

import { BaseEntity } from './base-entity.js';
import { EntityGUID } from '@domain/value-objects/entity-guid.js';
import { GoldenMetric } from '@domain/value-objects/golden-metric.js';
import type { AccountId, ProviderType, EntityRelationship } from '@shared/types/common.js';
import { ValidationError } from '@shared/errors/base.js';

export interface QueueConfig {
  readonly accountId: AccountId;
  readonly provider: ProviderType;
  readonly clusterName: string;
  readonly queueName: string;
  readonly vhost?: string; // For RabbitMQ
  readonly queueType?: 'classic' | 'quorum' | 'stream';
  readonly durable?: boolean;
  readonly exclusive?: boolean;
  readonly autoDelete?: boolean;
  readonly environment?: string;
}

export interface QueueMetrics {
  readonly messagesReady?: number;
  readonly messagesUnacknowledged?: number;
  readonly messageRate?: number;
  readonly publishRate?: number;
  readonly deliverRate?: number;
  readonly ackRate?: number;
  readonly consumers?: number;
  readonly connections?: number;
  readonly memory?: number;
  readonly diskReads?: number;
  readonly diskWrites?: number;
}

export class MessageQueueQueue extends BaseEntity {
  private readonly _guid: EntityGUID;
  private _name: string;
  private _displayName: string;
  private _vhost?: string;
  private _queueType: string;
  private _durable: boolean;
  private _exclusive: boolean;
  private _autoDelete: boolean;
  private _environment: string;
  private _goldenMetrics: Map<string, GoldenMetric>;
  private _relationships: EntityRelationship[];
  private _tags: Map<string, string>;

  constructor(config: QueueConfig, id?: string) {
    super(id);
    
    this.validateConfig(config);
    
    this._guid = new EntityGUID(
      config.accountId,
      'MESSAGE_QUEUE_QUEUE',
      config.provider,
      config.clusterName,
      config.vhost || 'default',
      config.queueName
    );
    
    this._name = config.queueName;
    this._displayName = `${config.clusterName}-queue-${config.queueName}`;
    this._vhost = config.vhost;
    this._queueType = config.queueType || 'classic';
    this._durable = config.durable !== false;
    this._exclusive = config.exclusive || false;
    this._autoDelete = config.autoDelete || false;
    this._environment = config.environment || 'production';
    this._goldenMetrics = new Map();
    this._relationships = [];
    this._tags = new Map();
    
    // Initialize default tags
    this.initializeDefaultTags(config);
    
    // Add domain event for queue creation
    this.addDomainEvent(
      this.createDomainEvent('QueueCreated', {
        guid: this._guid.value,
        clusterName: config.clusterName,
        queueName: config.queueName,
        queueType: this._queueType
      })
    );
  }

  /**
   * Get queue GUID
   */
  public get guid(): EntityGUID {
    return this._guid;
  }

  /**
   * Get queue name
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
   * Get vhost
   */
  public get vhost(): string | undefined {
    return this._vhost;
  }

  /**
   * Get queue type
   */
  public get queueType(): string {
    return this._queueType;
  }

  /**
   * Check if queue is durable
   */
  public get durable(): boolean {
    return this._durable;
  }

  /**
   * Check if queue is exclusive
   */
  public get exclusive(): boolean {
    return this._exclusive;
  }

  /**
   * Check if queue auto-deletes
   */
  public get autoDelete(): boolean {
    return this._autoDelete;
  }

  /**
   * Get environment
   */
  public get environment(): string {
    return this._environment;
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
   * Update queue metrics
   */
  public updateMetrics(metrics: QueueMetrics): void {
    if (metrics.messagesReady !== undefined) {
      this._goldenMetrics.set(
        'messagesReady',
        GoldenMetric.count('messagesReady', metrics.messagesReady)
      );
    }

    if (metrics.messagesUnacknowledged !== undefined) {
      this._goldenMetrics.set(
        'messagesUnacknowledged',
        GoldenMetric.count('messagesUnacknowledged', metrics.messagesUnacknowledged)
      );
    }

    if (metrics.messageRate !== undefined) {
      this._goldenMetrics.set(
        'messageRate',
        GoldenMetric.rate('messageRate', metrics.messageRate)
      );
    }

    if (metrics.publishRate !== undefined) {
      this._goldenMetrics.set(
        'publishRate',
        GoldenMetric.rate('publishRate', metrics.publishRate)
      );
    }

    if (metrics.deliverRate !== undefined) {
      this._goldenMetrics.set(
        'deliverRate',
        GoldenMetric.rate('deliverRate', metrics.deliverRate)
      );
    }

    if (metrics.consumers !== undefined) {
      this._goldenMetrics.set(
        'consumers',
        GoldenMetric.count('consumers', metrics.consumers)
      );
    }

    if (metrics.memory !== undefined) {
      this._goldenMetrics.set(
        'memory',
        GoldenMetric.bytes('memory', metrics.memory)
      );
    }

    this.markModified();
    
    // Add domain event for metrics update
    this.addDomainEvent(
      this.createDomainEvent('QueueMetricsUpdated', {
        guid: this._guid.value,
        metrics: Object.fromEntries(
          Array.from(this._goldenMetrics.entries()).map(([key, metric]) => [key, metric.value])
        )
      })
    );
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
    const messagesReady = this._goldenMetrics.get('messagesReady');
    const consumers = this._goldenMetrics.get('consumers');
    const memory = this._goldenMetrics.get('memory');
    
    // Queue with many messages and no consumers is unhealthy
    if (messagesReady && messagesReady.value > 10000 && consumers && consumers.value === 0) {
      return 'unhealthy';
    }
    
    // High memory usage
    if (memory && memory.value > 1024 * 1024 * 1024) { // > 1GB
      return 'degraded';
    }
    
    // Many unprocessed messages
    if (messagesReady && messagesReady.value > 5000) {
      return 'degraded';
    }
    
    return 'healthy';
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
      'entity.type': 'MESSAGE_QUEUE_QUEUE',
      entityType: 'MESSAGE_QUEUE_QUEUE',
      entityGuid: this._guid.value,
      provider: this._guid.provider,
      accountId: this._guid.accountId,
      environment: this._environment,
      clusterName: this._guid.domainId,
      queueName: this._name,
      queueType: this._queueType,
      durable: this._durable,
      exclusive: this._exclusive,
      autoDelete: this._autoDelete
    };

    if (this._vhost) {
      payload.vhost = this._vhost;
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
      throw new ValidationError('Queue GUID is required');
    }
    
    if (!this._name || this._name.trim().length === 0) {
      throw new ValidationError('Queue name is required');
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
      vhost: this._vhost,
      queueType: this._queueType,
      durable: this._durable,
      exclusive: this._exclusive,
      autoDelete: this._autoDelete,
      environment: this._environment,
      goldenMetrics: Array.from(this._goldenMetrics.values()).map(m => m.toJSON()),
      relationships: this._relationships,
      tags: Object.fromEntries(this._tags),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version
    };
  }

  private validateConfig(config: QueueConfig): void {
    if (!config.accountId) {
      throw new ValidationError('Account ID is required');
    }
    
    if (!config.clusterName) {
      throw new ValidationError('Cluster name is required');
    }
    
    if (!config.queueName) {
      throw new ValidationError('Queue name is required');
    }
  }

  private initializeDefaultTags(config: QueueConfig): void {
    this._tags.set('environment', this._environment);
    this._tags.set('provider', config.provider);
    this._tags.set('cluster', config.clusterName);
    this._tags.set('queue', config.queueName);
    this._tags.set('queue-type', this._queueType);
    
    if (config.vhost) {
      this._tags.set('vhost', config.vhost);
    }
  }
}