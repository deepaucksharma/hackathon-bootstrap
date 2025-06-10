/**
 * Message Queue Consumer Domain Entity
 * Represents a consumer group in a message queue system
 */

import { BaseEntity } from './base-entity.js';
import { EntityGUID } from '@domain/value-objects/entity-guid.js';
import { GoldenMetric } from '@domain/value-objects/golden-metric.js';
import type { AccountId, ProviderType, EntityRelationship } from '@shared/types/common.js';
import { ValidationError } from '@shared/errors/base.js';

export interface ConsumerConfig {
  readonly accountId: AccountId;
  readonly provider: ProviderType;
  readonly clusterName: string;
  readonly consumerGroupId: string;
  readonly clientId?: string;
  readonly assignmentStrategy?: string;
  readonly sessionTimeoutMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly environment?: string;
}

export interface ConsumerMetrics {
  readonly messageConsumptionRate?: number;
  readonly bytesConsumptionRate?: number;
  readonly totalMessagesConsumed?: number;
  readonly totalBytesConsumed?: number;
  readonly averageProcessingTime?: number;
  readonly offsetLag?: number;
  readonly maxOffsetLag?: number;
  readonly totalOffsetLag?: number;
  readonly memberCount?: number;
  readonly assignedPartitions?: number;
  readonly errorRate?: number;
  readonly rebalanceRate?: number;
  readonly rebalanceLatency?: number;
}

export interface ConsumerMember {
  readonly memberId: string;
  readonly clientId: string;
  readonly host: string;
  readonly assignedPartitions: number[];
}

export class MessageQueueConsumerGroup extends BaseEntity {
  private readonly _guid: EntityGUID;
  private _name: string;
  private _displayName: string;
  private _clientId?: string;
  private _assignmentStrategy: string;
  private _sessionTimeoutMs: number;
  private _heartbeatIntervalMs: number;
  private _environment: string;
  private _goldenMetrics: Map<string, GoldenMetric>;
  private _relationships: EntityRelationship[];
  private _tags: Map<string, string>;
  private _members: ConsumerMember[];
  private _state: 'active' | 'inactive' | 'rebalancing' | 'error';
  private _subscribedTopics: string[];

  constructor(config: ConsumerConfig, id?: string) {
    super(id);
    
    this.validateConfig(config);
    
    this._guid = new EntityGUID(
      config.accountId,
      'MESSAGE_QUEUE_CONSUMER_GROUP',
      config.provider,
      config.clusterName,
      config.consumerGroupId
    );
    
    this._name = config.consumerGroupId;
    this._displayName = `${config.clusterName}-consumer-${config.consumerGroupId}`;
    this._clientId = config.clientId;
    this._assignmentStrategy = config.assignmentStrategy || 'range';
    this._sessionTimeoutMs = config.sessionTimeoutMs || 30000;
    this._heartbeatIntervalMs = config.heartbeatIntervalMs || 3000;
    this._environment = config.environment || 'production';
    this._goldenMetrics = new Map();
    this._relationships = [];
    this._tags = new Map();
    this._members = [];
    this._state = 'inactive';
    this._subscribedTopics = [];
    
    // Initialize default tags
    this.initializeDefaultTags(config);
    
    // Add domain event for consumer creation
    this.addDomainEvent(
      this.createDomainEvent('ConsumerCreated', {
        guid: this._guid.value,
        clusterName: config.clusterName,
        consumerGroupId: config.consumerGroupId,
        assignmentStrategy: this._assignmentStrategy
      })
    );
  }

  /**
   * Get consumer GUID
   */
  public get guid(): EntityGUID {
    return this._guid;
  }

  /**
   * Get consumer group name
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
   * Get client ID
   */
  public get clientId(): string | undefined {
    return this._clientId;
  }

  /**
   * Get assignment strategy
   */
  public get assignmentStrategy(): string {
    return this._assignmentStrategy;
  }

  /**
   * Get session timeout
   */
  public get sessionTimeoutMs(): number {
    return this._sessionTimeoutMs;
  }

  /**
   * Get heartbeat interval
   */
  public get heartbeatIntervalMs(): number {
    return this._heartbeatIntervalMs;
  }

  /**
   * Get environment
   */
  public get environment(): string {
    return this._environment;
  }

  /**
   * Get consumer state
   */
  public get state(): 'active' | 'inactive' | 'rebalancing' | 'error' {
    return this._state;
  }

  /**
   * Get subscribed topics
   */
  public get subscribedTopics(): ReadonlyArray<string> {
    return [...this._subscribedTopics];
  }

  /**
   * Get consumer members
   */
  public get members(): ReadonlyArray<ConsumerMember> {
    return [...this._members];
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
   * Update consumer metrics
   */
  public updateMetrics(metrics: ConsumerMetrics): void {
    if (metrics.messageConsumptionRate !== undefined) {
      this._goldenMetrics.set(
        'messageConsumptionRate',
        GoldenMetric.rate('messageConsumptionRate', metrics.messageConsumptionRate)
      );
    }

    if (metrics.bytesConsumptionRate !== undefined) {
      this._goldenMetrics.set(
        'bytesConsumptionRate',
        GoldenMetric.byteRate('bytesConsumptionRate', metrics.bytesConsumptionRate)
      );
    }

    if (metrics.totalMessagesConsumed !== undefined) {
      this._goldenMetrics.set(
        'totalMessagesConsumed',
        GoldenMetric.count('totalMessagesConsumed', metrics.totalMessagesConsumed)
      );
    }

    if (metrics.averageProcessingTime !== undefined) {
      this._goldenMetrics.set(
        'averageProcessingTime',
        GoldenMetric.latency('averageProcessingTime', metrics.averageProcessingTime)
      );
    }

    if (metrics.offsetLag !== undefined) {
      this._goldenMetrics.set(
        'offsetLag',
        GoldenMetric.latency('offsetLag', metrics.offsetLag)
      );
    }

    if (metrics.maxOffsetLag !== undefined) {
      this._goldenMetrics.set(
        'maxOffsetLag',
        GoldenMetric.latency('maxOffsetLag', metrics.maxOffsetLag)
      );
    }

    if (metrics.memberCount !== undefined) {
      this._goldenMetrics.set(
        'memberCount',
        GoldenMetric.count('memberCount', metrics.memberCount)
      );
    }

    if (metrics.errorRate !== undefined) {
      this._goldenMetrics.set(
        'errorRate',
        GoldenMetric.percentage('errorRate', metrics.errorRate * 100)
      );
    }

    if (metrics.rebalanceRate !== undefined) {
      this._goldenMetrics.set(
        'rebalanceRate',
        GoldenMetric.rate('rebalanceRate', metrics.rebalanceRate)
      );
    }

    this.markModified();
    
    // Add domain event for metrics update
    this.addDomainEvent(
      this.createDomainEvent('ConsumerMetricsUpdated', {
        guid: this._guid.value,
        metrics: Object.fromEntries(
          Array.from(this._goldenMetrics.entries()).map(([key, metric]) => [key, metric.value])
        )
      })
    );
  }

  /**
   * Update consumer state
   */
  public updateState(newState: 'active' | 'inactive' | 'rebalancing' | 'error'): void {
    if (this._state !== newState) {
      const oldState = this._state;
      this._state = newState;
      this.markModified();
      
      this.addDomainEvent(
        this.createDomainEvent('ConsumerStateChanged', {
          guid: this._guid.value,
          oldState,
          newState
        })
      );
    }
  }

  /**
   * Update subscribed topics
   */
  public updateSubscribedTopics(topics: string[]): void {
    this._subscribedTopics = [...topics];
    this.markModified();
    
    this.addDomainEvent(
      this.createDomainEvent('ConsumerTopicsUpdated', {
        guid: this._guid.value,
        topics: this._subscribedTopics
      })
    );
  }

  /**
   * Update consumer members
   */
  public updateMembers(members: ConsumerMember[]): void {
    this._members = [...members];
    this.markModified();
    
    this.addDomainEvent(
      this.createDomainEvent('ConsumerMembersUpdated', {
        guid: this._guid.value,
        memberCount: members.length,
        members: members.map(m => ({
          memberId: m.memberId,
          clientId: m.clientId,
          host: m.host,
          partitionCount: m.assignedPartitions.length
        }))
      })
    );
  }

  /**
   * Add a member to the consumer group
   */
  public addMember(member: ConsumerMember): void {
    const existingIndex = this._members.findIndex(m => m.memberId === member.memberId);
    
    if (existingIndex === -1) {
      this._members.push(member);
      this.markModified();
      
      this.addDomainEvent(
        this.createDomainEvent('ConsumerMemberAdded', {
          guid: this._guid.value,
          member: {
            memberId: member.memberId,
            clientId: member.clientId,
            host: member.host,
            partitionCount: member.assignedPartitions.length
          }
        })
      );
    }
  }

  /**
   * Remove a member from the consumer group
   */
  public removeMember(memberId: string): void {
    const index = this._members.findIndex(m => m.memberId === memberId);
    
    if (index !== -1) {
      const removedMember = this._members[index];
      this._members.splice(index, 1);
      this.markModified();
      
      this.addDomainEvent(
        this.createDomainEvent('ConsumerMemberRemoved', {
          guid: this._guid.value,
          memberId,
          partitionCount: removedMember.assignedPartitions.length
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
   * Get health status based on metrics and state
   */
  public getHealthStatus(): 'healthy' | 'degraded' | 'unhealthy' {
    // Error state is always unhealthy
    if (this._state === 'error') {
      return 'unhealthy';
    }
    
    // Inactive state is degraded
    if (this._state === 'inactive') {
      return 'degraded';
    }
    
    const errorRate = this._goldenMetrics.get('errorRate');
    const offsetLag = this._goldenMetrics.get('offsetLag');
    
    // High error rate is unhealthy
    if (errorRate && errorRate.value > 5) { // > 5% error rate
      return 'unhealthy';
    }
    
    // High lag is degraded or unhealthy
    if (offsetLag) {
      if (offsetLag.value > 1000000) { // > 1M message lag
        return 'unhealthy';
      }
      if (offsetLag.value > 100000) { // > 100k message lag
        return 'degraded';
      }
    }
    
    return 'healthy';
  }

  /**
   * Calculate average lag per partition
   */
  public getAverageLagPerPartition(): number {
    const totalLag = this._goldenMetrics.get('totalOffsetLag');
    const memberCount = this._members.length;
    
    if (!totalLag || memberCount === 0) {
      return 0;
    }
    
    const totalPartitions = this._members.reduce(
      (sum, member) => sum + member.assignedPartitions.length,
      0
    );
    
    return totalPartitions > 0 ? totalLag.value / totalPartitions : 0;
  }

  /**
   * Check if consumer group is balanced
   */
  public isBalanced(): boolean {
    if (this._members.length <= 1) {
      return true;
    }
    
    const partitionCounts = this._members.map(m => m.assignedPartitions.length);
    const min = Math.min(...partitionCounts);
    const max = Math.max(...partitionCounts);
    
    // Consider balanced if difference is <= 1
    return max - min <= 1;
  }

  /**
   * Get total assigned partitions
   */
  public getTotalAssignedPartitions(): number {
    return this._members.reduce(
      (sum, member) => sum + member.assignedPartitions.length,
      0
    );
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
      'entity.type': 'MESSAGE_QUEUE_CONSUMER_GROUP',
      entityType: 'MESSAGE_QUEUE_CONSUMER_GROUP',
      entityGuid: this._guid.value,
      provider: this._guid.provider,
      accountId: this._guid.accountId,
      environment: this._environment,
      clusterName: this._guid.domainId,
      consumerGroupId: this._name,
      assignmentStrategy: this._assignmentStrategy,
      sessionTimeoutMs: this._sessionTimeoutMs,
      heartbeatIntervalMs: this._heartbeatIntervalMs,
      state: this._state,
      memberCount: this._members.length,
      subscribedTopicCount: this._subscribedTopics.length,
      totalAssignedPartitions: this.getTotalAssignedPartitions(),
      isBalanced: this.isBalanced()
    };

    if (this._clientId) {
      payload.clientId = this._clientId;
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
      throw new ValidationError('Consumer GUID is required');
    }
    
    if (!this._name || this._name.trim().length === 0) {
      throw new ValidationError('Consumer group ID is required');
    }
    
    if (this._sessionTimeoutMs <= 0) {
      throw new ValidationError('Session timeout must be greater than 0');
    }
    
    if (this._heartbeatIntervalMs <= 0) {
      throw new ValidationError('Heartbeat interval must be greater than 0');
    }
    
    if (this._heartbeatIntervalMs >= this._sessionTimeoutMs) {
      throw new ValidationError('Heartbeat interval must be less than session timeout');
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
      clientId: this._clientId,
      assignmentStrategy: this._assignmentStrategy,
      sessionTimeoutMs: this._sessionTimeoutMs,
      heartbeatIntervalMs: this._heartbeatIntervalMs,
      environment: this._environment,
      state: this._state,
      subscribedTopics: this._subscribedTopics,
      members: this._members,
      goldenMetrics: Array.from(this._goldenMetrics.values()).map(m => m.toJSON()),
      relationships: this._relationships,
      tags: Object.fromEntries(this._tags),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version
    };
  }

  private validateConfig(config: ConsumerConfig): void {
    if (!config.accountId) {
      throw new ValidationError('Account ID is required');
    }
    
    if (!config.clusterName) {
      throw new ValidationError('Cluster name is required');
    }
    
    if (!config.consumerGroupId) {
      throw new ValidationError('Consumer group ID is required');
    }
    
    if (config.sessionTimeoutMs !== undefined && config.sessionTimeoutMs <= 0) {
      throw new ValidationError('Session timeout must be greater than 0');
    }
    
    if (config.heartbeatIntervalMs !== undefined && config.heartbeatIntervalMs <= 0) {
      throw new ValidationError('Heartbeat interval must be greater than 0');
    }
  }

  private initializeDefaultTags(config: ConsumerConfig): void {
    this._tags.set('environment', this._environment);
    this._tags.set('provider', config.provider);
    this._tags.set('cluster', config.clusterName);
    this._tags.set('consumer-group', config.consumerGroupId);
    this._tags.set('assignment-strategy', this._assignmentStrategy);
    
    if (config.clientId) {
      this._tags.set('client-id', config.clientId);
    }
  }
}