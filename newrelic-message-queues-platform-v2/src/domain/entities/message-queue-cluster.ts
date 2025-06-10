/**
 * Message Queue Cluster Domain Entity
 * Represents a message queue cluster with aggregate metrics and health status
 */

import { BaseEntity } from './base-entity.js';
import { EntityGUID } from '@domain/value-objects/entity-guid.js';
import { GoldenMetric } from '@domain/value-objects/golden-metric.js';
import type { AccountId, ProviderType, EntityRelationship } from '@shared/types/common.js';
import { ValidationError } from '@shared/errors/base.js';

export interface ClusterConfig {
  readonly accountId: AccountId;
  readonly provider: ProviderType;
  readonly clusterName: string;
  readonly version?: string;
  readonly environment?: string;
  readonly region?: string;
  readonly bootstrapServers?: string[];
}

export interface ClusterMetrics {
  readonly totalBrokers?: number;
  readonly activeBrokers?: number;
  readonly controllerCount?: number;
  readonly totalTopics?: number;
  readonly totalPartitions?: number;
  readonly totalConsumerGroups?: number;
  readonly totalProducers?: number;
  readonly totalMessagesPerSecond?: number;
  readonly totalBytesPerSecond?: number;
  readonly averageBrokerCpuUsage?: number;
  readonly averageBrokerMemoryUsage?: number;
  readonly averageBrokerDiskUsage?: number;
  readonly underReplicatedPartitions?: number;
  readonly offlinePartitions?: number;
  readonly preferredReplicaImbalance?: number;
  readonly networkRequestRate?: number;
  readonly networkErrorRate?: number;
}

export interface ClusterHealthInfo {
  readonly overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  readonly brokerHealth: {
    healthy: number;
    degraded: number;
    unhealthy: number;
    total: number;
  };
  readonly topicHealth: {
    healthy: number;
    degraded: number;
    unhealthy: number;
    total: number;
  };
  readonly consumerHealth: {
    healthy: number;
    degraded: number;
    unhealthy: number;
    total: number;
  };
  readonly criticalIssues: string[];
  readonly warnings: string[];
}

export class MessageQueueCluster extends BaseEntity {
  private readonly _guid: EntityGUID;
  private _name: string;
  private _displayName: string;
  private _clusterVersion?: string;
  private _environment: string;
  private _region?: string;
  private _bootstrapServers: string[];
  private _goldenMetrics: Map<string, GoldenMetric>;
  private _relationships: EntityRelationship[];
  private _tags: Map<string, string>;
  private _healthInfo?: ClusterHealthInfo;
  private _lastHealthCheck?: number;

  constructor(config: ClusterConfig, id?: string) {
    super(id);
    
    this.validateConfig(config);
    
    this._guid = new EntityGUID(
      config.accountId,
      'MESSAGE_QUEUE_CLUSTER',
      config.provider,
      'global',
      config.clusterName
    );
    
    this._name = config.clusterName;
    this._displayName = `${config.provider}-cluster-${config.clusterName}`;
    this._clusterVersion = config.version;
    this._environment = config.environment || 'production';
    this._region = config.region;
    this._bootstrapServers = config.bootstrapServers || [];
    this._goldenMetrics = new Map();
    this._relationships = [];
    this._tags = new Map();
    
    // Initialize default tags
    this.initializeDefaultTags(config);
    
    // Add domain event for cluster creation
    this.addDomainEvent(
      this.createDomainEvent('ClusterCreated', {
        guid: this._guid.value,
        clusterName: config.clusterName,
        provider: config.provider,
        environment: this._environment
      })
    );
  }

  /**
   * Get cluster GUID
   */
  public get guid(): EntityGUID {
    return this._guid;
  }

  /**
   * Get cluster name
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
   * Get cluster version
   */
  public get clusterVersion(): string | undefined {
    return this._clusterVersion;
  }

  /**
   * Get environment
   */
  public get environment(): string {
    return this._environment;
  }

  /**
   * Get region
   */
  public get region(): string | undefined {
    return this._region;
  }

  /**
   * Get bootstrap servers
   */
  public get bootstrapServers(): ReadonlyArray<string> {
    return [...this._bootstrapServers];
  }

  /**
   * Get health information
   */
  public get healthInfo(): ClusterHealthInfo | undefined {
    return this._healthInfo;
  }

  /**
   * Get last health check timestamp
   */
  public get lastHealthCheck(): number | undefined {
    return this._lastHealthCheck;
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
   * Update cluster metrics
   */
  public updateMetrics(metrics: ClusterMetrics): void {
    if (metrics.totalBrokers !== undefined) {
      this._goldenMetrics.set(
        'totalBrokers',
        GoldenMetric.count('totalBrokers', metrics.totalBrokers)
      );
    }

    if (metrics.activeBrokers !== undefined) {
      this._goldenMetrics.set(
        'activeBrokers',
        GoldenMetric.count('activeBrokers', metrics.activeBrokers)
      );
    }

    if (metrics.totalTopics !== undefined) {
      this._goldenMetrics.set(
        'totalTopics',
        GoldenMetric.count('totalTopics', metrics.totalTopics)
      );
    }

    if (metrics.totalPartitions !== undefined) {
      this._goldenMetrics.set(
        'totalPartitions',
        GoldenMetric.count('totalPartitions', metrics.totalPartitions)
      );
    }

    if (metrics.totalConsumerGroups !== undefined) {
      this._goldenMetrics.set(
        'totalConsumerGroups',
        GoldenMetric.count('totalConsumerGroups', metrics.totalConsumerGroups)
      );
    }

    if (metrics.totalMessagesPerSecond !== undefined) {
      this._goldenMetrics.set(
        'totalMessagesPerSecond',
        GoldenMetric.throughput('totalMessagesPerSecond', metrics.totalMessagesPerSecond)
      );
    }

    if (metrics.totalBytesPerSecond !== undefined) {
      this._goldenMetrics.set(
        'totalBytesPerSecond',
        GoldenMetric.byteRate('totalBytesPerSecond', metrics.totalBytesPerSecond)
      );
    }

    if (metrics.averageBrokerCpuUsage !== undefined) {
      this._goldenMetrics.set(
        'averageBrokerCpuUsage',
        GoldenMetric.percentage('averageBrokerCpuUsage', metrics.averageBrokerCpuUsage)
      );
    }

    if (metrics.averageBrokerMemoryUsage !== undefined) {
      this._goldenMetrics.set(
        'averageBrokerMemoryUsage',
        GoldenMetric.percentage('averageBrokerMemoryUsage', metrics.averageBrokerMemoryUsage)
      );
    }

    if (metrics.underReplicatedPartitions !== undefined) {
      this._goldenMetrics.set(
        'underReplicatedPartitions',
        GoldenMetric.count('underReplicatedPartitions', metrics.underReplicatedPartitions)
      );
    }

    if (metrics.offlinePartitions !== undefined) {
      this._goldenMetrics.set(
        'offlinePartitions',
        GoldenMetric.count('offlinePartitions', metrics.offlinePartitions)
      );
    }

    if (metrics.networkErrorRate !== undefined) {
      this._goldenMetrics.set(
        'networkErrorRate',
        GoldenMetric.percentage('networkErrorRate', metrics.networkErrorRate * 100)
      );
    }

    this.markModified();
    
    // Add domain event for metrics update
    this.addDomainEvent(
      this.createDomainEvent('ClusterMetricsUpdated', {
        guid: this._guid.value,
        metrics: Object.fromEntries(
          Array.from(this._goldenMetrics.entries()).map(([key, metric]) => [key, metric.value])
        )
      })
    );
  }

  /**
   * Update cluster health information
   */
  public updateHealthInfo(healthInfo: ClusterHealthInfo): void {
    this._healthInfo = healthInfo;
    this._lastHealthCheck = Date.now();
    this.markModified();
    
    this.addDomainEvent(
      this.createDomainEvent('ClusterHealthUpdated', {
        guid: this._guid.value,
        overallStatus: healthInfo.overallStatus,
        criticalIssueCount: healthInfo.criticalIssues.length,
        warningCount: healthInfo.warnings.length,
        timestamp: this._lastHealthCheck
      })
    );
  }

  /**
   * Update bootstrap servers
   */
  public updateBootstrapServers(servers: string[]): void {
    this._bootstrapServers = [...servers];
    this.markModified();
    
    this.addDomainEvent(
      this.createDomainEvent('ClusterBootstrapServersUpdated', {
        guid: this._guid.value,
        servers: this._bootstrapServers
      })
    );
  }

  /**
   * Update cluster version
   */
  public updateVersion(version: string): void {
    if (this._clusterVersion !== version) {
      const oldVersion = this._clusterVersion;
      this._clusterVersion = version;
      this._tags.set('version', version);
      this.markModified();
      
      this.addDomainEvent(
        this.createDomainEvent('ClusterVersionUpdated', {
          guid: this._guid.value,
          oldVersion,
          newVersion: version
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
   * Get overall health status
   */
  public getHealthStatus(): 'healthy' | 'degraded' | 'unhealthy' {
    if (this._healthInfo) {
      return this._healthInfo.overallStatus;
    }
    
    // Fall back to metrics-based health assessment
    const offlinePartitions = this._goldenMetrics.get('offlinePartitions');
    const underReplicatedPartitions = this._goldenMetrics.get('underReplicatedPartitions');
    const networkErrorRate = this._goldenMetrics.get('networkErrorRate');
    
    // Critical issues
    if (offlinePartitions && offlinePartitions.value > 0) {
      return 'unhealthy';
    }
    
    if (networkErrorRate && networkErrorRate.value > 5) { // > 5% error rate
      return 'unhealthy';
    }
    
    // Degraded conditions
    if (underReplicatedPartitions && underReplicatedPartitions.value > 0) {
      return 'degraded';
    }
    
    const avgCpuUsage = this._goldenMetrics.get('averageBrokerCpuUsage');
    if (avgCpuUsage && avgCpuUsage.value > 85) { // > 85% CPU usage
      return 'degraded';
    }
    
    return 'healthy';
  }

  /**
   * Calculate broker availability percentage
   */
  public getBrokerAvailability(): number {
    const totalBrokers = this._goldenMetrics.get('totalBrokers');
    const activeBrokers = this._goldenMetrics.get('activeBrokers');
    
    if (!totalBrokers || !activeBrokers || totalBrokers.value === 0) {
      return 0;
    }
    
    return (activeBrokers.value / totalBrokers.value) * 100;
  }

  /**
   * Calculate data replication health percentage
   */
  public getReplicationHealth(): number {
    const totalPartitions = this._goldenMetrics.get('totalPartitions');
    const underReplicatedPartitions = this._goldenMetrics.get('underReplicatedPartitions');
    
    if (!totalPartitions || totalPartitions.value === 0) {
      return 100;
    }
    
    const underReplicated = underReplicatedPartitions ? underReplicatedPartitions.value : 0;
    return ((totalPartitions.value - underReplicated) / totalPartitions.value) * 100;
  }

  /**
   * Get cluster capacity utilization
   */
  public getCapacityUtilization(): {
    cpu: number;
    memory: number;
    disk: number;
  } {
    const avgCpu = this._goldenMetrics.get('averageBrokerCpuUsage');
    const avgMemory = this._goldenMetrics.get('averageBrokerMemoryUsage');
    const avgDisk = this._goldenMetrics.get('averageBrokerDiskUsage');
    
    return {
      cpu: avgCpu ? avgCpu.value : 0,
      memory: avgMemory ? avgMemory.value : 0,
      disk: avgDisk ? avgDisk.value : 0
    };
  }

  /**
   * Check if cluster has leadership issues
   */
  public hasLeadershipIssues(): boolean {
    const controllerCount = this._goldenMetrics.get('controllerCount');
    return controllerCount ? controllerCount.value !== 1 : false;
  }

  /**
   * Check if health check is stale
   */
  public isHealthCheckStale(maxAgeMs: number = 300000): boolean { // 5 minutes default
    if (!this._lastHealthCheck) {
      return true;
    }
    
    return Date.now() - this._lastHealthCheck > maxAgeMs;
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
      'entity.type': 'MESSAGE_QUEUE_CLUSTER',
      entityType: 'MESSAGE_QUEUE_CLUSTER',
      entityGuid: this._guid.value,
      provider: this._guid.provider,
      accountId: this._guid.accountId,
      environment: this._environment,
      clusterName: this._name,
      brokerAvailability: this.getBrokerAvailability(),
      replicationHealth: this.getReplicationHealth(),
      hasLeadershipIssues: this.hasLeadershipIssues(),
      healthCheckStale: this.isHealthCheckStale(),
      bootstrapServerCount: this._bootstrapServers.length
    };

    if (this._version) {
      payload.version = this._version;
    }

    if (this._region) {
      payload.region = this._region;
    }

    if (this._lastHealthCheck) {
      payload.lastHealthCheck = this._lastHealthCheck;
    }

    if (this._healthInfo) {
      payload.overallHealthStatus = this._healthInfo.overallStatus;
      payload.criticalIssueCount = this._healthInfo.criticalIssues.length;
      payload.warningCount = this._healthInfo.warnings.length;
    }

    // Add golden metrics
    for (const metric of this._goldenMetrics.values()) {
      Object.assign(payload, metric.toEventAttribute());
    }

    // Add capacity utilization
    const capacity = this.getCapacityUtilization();
    payload.capacityCpuPercent = capacity.cpu;
    payload.capacityMemoryPercent = capacity.memory;
    payload.capacityDiskPercent = capacity.disk;

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
      throw new ValidationError('Cluster GUID is required');
    }
    
    if (!this._name || this._name.trim().length === 0) {
      throw new ValidationError('Cluster name is required');
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
      clusterVersion: this._clusterVersion,
      environment: this._environment,
      region: this._region,
      bootstrapServers: this._bootstrapServers,
      healthInfo: this._healthInfo,
      lastHealthCheck: this._lastHealthCheck,
      goldenMetrics: Array.from(this._goldenMetrics.values()).map(m => m.toJSON()),
      relationships: this._relationships,
      tags: Object.fromEntries(this._tags),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  private validateConfig(config: ClusterConfig): void {
    if (!config.accountId) {
      throw new ValidationError('Account ID is required');
    }
    
    if (!config.clusterName) {
      throw new ValidationError('Cluster name is required');
    }
    
    if (!config.provider) {
      throw new ValidationError('Provider is required');
    }
  }

  private initializeDefaultTags(config: ClusterConfig): void {
    this._tags.set('environment', this._environment);
    this._tags.set('provider', config.provider);
    this._tags.set('cluster', config.clusterName);
    
    if (config.version) {
      this._tags.set('version', config.version);
    }
    
    if (config.region) {
      this._tags.set('region', config.region);
    }
  }
}