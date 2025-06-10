/**
 * Message Queue Broker Domain Entity
 * Represents a broker node in a message queue cluster
 */

import { BaseEntity } from './base-entity.js';
import { EntityGUID } from '@domain/value-objects/entity-guid.js';
import { GoldenMetric } from '@domain/value-objects/golden-metric.js';
import type { AccountId, ProviderType, EntityRelationship } from '@shared/types/common.js';
import { ValidationError } from '@shared/errors/base.js';

export interface BrokerConfig {
  readonly accountId: AccountId;
  readonly provider: ProviderType;
  readonly clusterName: string;
  readonly brokerId: string;
  readonly host: string;
  readonly port: number;
  readonly isController?: boolean;
  readonly version?: string;
  readonly environment?: string;
}

export interface BrokerMetrics {
  readonly throughputPerSecond?: number;
  readonly diskUsagePercent?: number;
  readonly networkBytesInPerSecond?: number;
  readonly networkBytesOutPerSecond?: number;
  readonly partitionCount?: number;
  readonly leaderPartitionCount?: number;
  readonly requestRate?: number;
  readonly errorRate?: number;
  readonly jvmMemoryUsed?: number;
  readonly jvmMemoryMax?: number;
  readonly cpuUsagePercent?: number;
  readonly memoryUsagePercent?: number;
}

export class MessageQueueBroker extends BaseEntity {
  private readonly _guid: EntityGUID;
  private _name: string;
  private _host: string;
  private _port: number;
  private _isController: boolean;
  private _brokerVersion?: string;
  private _environment: string;
  private _goldenMetrics: Map<string, GoldenMetric>;
  private _relationships: EntityRelationship[];
  private _tags: Map<string, string>;

  constructor(config: BrokerConfig, id?: string) {
    super(id);
    
    this.validateConfig(config);
    
    this._guid = new EntityGUID(
      config.accountId,
      'MESSAGE_QUEUE_BROKER',
      config.provider,
      config.clusterName,
      config.brokerId,
      config.host,
      String(config.port)
    );
    
    this._name = `${config.clusterName}-broker-${config.brokerId}`;
    this._host = config.host;
    this._port = config.port;
    this._isController = config.isController || false;
    this._brokerVersion = config.version;
    this._environment = config.environment || 'production';
    this._goldenMetrics = new Map();
    this._relationships = [];
    this._tags = new Map();
    
    // Initialize default tags
    this.initializeDefaultTags(config);
    
    // Add domain event for broker creation
    this.addDomainEvent(
      this.createDomainEvent('BrokerCreated', {
        guid: this._guid.value,
        clusterName: config.clusterName,
        brokerId: config.brokerId,
        host: config.host,
        port: config.port
      })
    );
  }

  /**
   * Get broker GUID
   */
  public get guid(): EntityGUID {
    return this._guid;
  }

  /**
   * Get broker name
   */
  public get name(): string {
    return this._name;
  }

  /**
   * Get broker host
   */
  public get host(): string {
    return this._host;
  }

  /**
   * Get broker port
   */
  public get port(): number {
    return this._port;
  }

  /**
   * Check if this broker is the cluster controller
   */
  public get isController(): boolean {
    return this._isController;
  }

  /**
   * Get broker version
   */
  public get brokerVersion(): string | undefined {
    return this._brokerVersion;
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
   * Update broker metrics
   */
  public updateMetrics(metrics: BrokerMetrics): void {
    if (metrics.throughputPerSecond !== undefined) {
      this._goldenMetrics.set(
        'throughputPerSecond',
        GoldenMetric.throughput('throughputPerSecond', metrics.throughputPerSecond)
      );
    }

    if (metrics.diskUsagePercent !== undefined) {
      this._goldenMetrics.set(
        'diskUsagePercent',
        GoldenMetric.percentage('diskUsagePercent', metrics.diskUsagePercent)
      );
    }

    if (metrics.networkBytesInPerSecond !== undefined) {
      this._goldenMetrics.set(
        'networkBytesInPerSecond',
        GoldenMetric.byteRate('networkBytesInPerSecond', metrics.networkBytesInPerSecond)
      );
    }

    if (metrics.networkBytesOutPerSecond !== undefined) {
      this._goldenMetrics.set(
        'networkBytesOutPerSecond',
        GoldenMetric.byteRate('networkBytesOutPerSecond', metrics.networkBytesOutPerSecond)
      );
    }

    if (metrics.partitionCount !== undefined) {
      this._goldenMetrics.set(
        'partitionCount',
        GoldenMetric.count('partitionCount', metrics.partitionCount)
      );
    }

    if (metrics.errorRate !== undefined) {
      this._goldenMetrics.set(
        'errorRate',
        GoldenMetric.percentage('errorRate', metrics.errorRate * 100)
      );
    }

    this.markModified();
    
    // Add domain event for metrics update
    this.addDomainEvent(
      this.createDomainEvent('BrokerMetricsUpdated', {
        guid: this._guid.value,
        metrics: Object.fromEntries(
          Array.from(this._goldenMetrics.entries()).map(([key, metric]) => [key, metric.value])
        )
      })
    );
  }

  /**
   * Set controller status
   */
  public setControllerStatus(isController: boolean): void {
    if (this._isController !== isController) {
      this._isController = isController;
      this.markModified();
      
      this.addDomainEvent(
        this.createDomainEvent('BrokerControllerStatusChanged', {
          guid: this._guid.value,
          isController
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
    const errorRate = this._goldenMetrics.get('errorRate');
    const diskUsage = this._goldenMetrics.get('diskUsagePercent');
    
    if (errorRate && errorRate.value > 5) { // > 5% error rate
      return 'unhealthy';
    }
    
    if (diskUsage && diskUsage.value > 90) { // > 90% disk usage
      return 'unhealthy';
    }
    
    if (diskUsage && diskUsage.value > 80) { // > 80% disk usage
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
      'entity.name': this._name,
      'entity.type': 'MESSAGE_QUEUE_BROKER',
      entityType: 'MESSAGE_QUEUE_BROKER',
      entityGuid: this._guid.value,
      provider: this._guid.provider,
      accountId: this._guid.accountId,
      environment: this._environment,
      clusterName: this._guid.domainId,
      brokerId: this._guid.identifier,
      brokerHost: this._host,
      brokerPort: this._port,
      isController: this._isController
    };

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
      throw new ValidationError('Broker GUID is required');
    }
    
    if (!this._name || this._name.trim().length === 0) {
      throw new ValidationError('Broker name is required');
    }
    
    if (!this._host || this._host.trim().length === 0) {
      throw new ValidationError('Broker host is required');
    }
    
    if (this._port <= 0 || this._port > 65535) {
      throw new ValidationError('Broker port must be between 1 and 65535');
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
      host: this._host,
      port: this._port,
      isController: this._isController,
      brokerVersion: this._brokerVersion,
      environment: this._environment,
      goldenMetrics: Array.from(this._goldenMetrics.values()).map(m => m.toJSON()),
      relationships: this._relationships,
      tags: Object.fromEntries(this._tags),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  private validateConfig(config: BrokerConfig): void {
    if (!config.accountId) {
      throw new ValidationError('Account ID is required');
    }
    
    if (!config.clusterName) {
      throw new ValidationError('Cluster name is required');
    }
    
    if (!config.brokerId) {
      throw new ValidationError('Broker ID is required');
    }
    
    if (!config.host) {
      throw new ValidationError('Broker host is required');
    }
    
    if (!config.port || config.port <= 0) {
      throw new ValidationError('Valid broker port is required');
    }
  }

  private initializeDefaultTags(config: BrokerConfig): void {
    this._tags.set('environment', this._environment);
    this._tags.set('provider', config.provider);
    this._tags.set('cluster', config.clusterName);
    this._tags.set('broker-id', config.brokerId);
    
    if (config.version) {
      this._tags.set('version', config.version);
    }
  }
}