/**
 * Broker Repository Interface
 * Defines how brokers are persisted and retrieved (domain layer)
 */

import type { MessageQueueBroker } from '@domain/entities/message-queue-broker.js';
import type { EntityGUID } from '@domain/value-objects/entity-guid.js';
import type { UUID, AccountId, ProviderType, RepositoryResult, QueryOptions } from '@shared/types/common.js';

export interface BrokerQuery {
  readonly accountId?: AccountId;
  readonly provider?: ProviderType;
  readonly clusterName?: string;
  readonly brokerId?: string;
  readonly environment?: string;
  readonly isController?: boolean;
  readonly healthStatus?: 'healthy' | 'degraded' | 'unhealthy';
}

export interface BrokerRepository {
  /**
   * Save a broker (create or update)
   */
  save(broker: MessageQueueBroker): Promise<RepositoryResult<MessageQueueBroker>>;

  /**
   * Save multiple brokers in a transaction
   */
  saveMany(brokers: MessageQueueBroker[]): Promise<RepositoryResult<MessageQueueBroker[]>>;

  /**
   * Find broker by entity ID
   */
  findById(id: UUID): Promise<RepositoryResult<MessageQueueBroker>>;

  /**
   * Find broker by GUID
   */
  findByGuid(guid: EntityGUID): Promise<RepositoryResult<MessageQueueBroker>>;

  /**
   * Find broker by cluster and broker ID
   */
  findByClusterAndBrokerId(
    accountId: AccountId,
    provider: ProviderType,
    clusterName: string,
    brokerId: string
  ): Promise<RepositoryResult<MessageQueueBroker>>;

  /**
   * Find all brokers in a cluster
   */
  findByCluster(
    accountId: AccountId,
    provider: ProviderType,
    clusterName: string
  ): Promise<RepositoryResult<MessageQueueBroker[]>>;

  /**
   * Find brokers with query options
   */
  findMany(
    query: BrokerQuery,
    options?: QueryOptions
  ): Promise<RepositoryResult<MessageQueueBroker[]>>;

  /**
   * Find all controller brokers
   */
  findControllers(
    accountId: AccountId,
    provider?: ProviderType
  ): Promise<RepositoryResult<MessageQueueBroker[]>>;

  /**
   * Find brokers by health status
   */
  findByHealthStatus(
    accountId: AccountId,
    healthStatus: 'healthy' | 'degraded' | 'unhealthy',
    provider?: ProviderType
  ): Promise<RepositoryResult<MessageQueueBroker[]>>;

  /**
   * Count brokers matching query
   */
  count(query: BrokerQuery): Promise<RepositoryResult<number>>;

  /**
   * Check if broker exists
   */
  exists(guid: EntityGUID): Promise<RepositoryResult<boolean>>;

  /**
   * Delete broker by ID
   */
  deleteById(id: UUID): Promise<RepositoryResult<boolean>>;

  /**
   * Delete broker by GUID
   */
  deleteByGuid(guid: EntityGUID): Promise<RepositoryResult<boolean>>;

  /**
   * Delete all brokers in a cluster
   */
  deleteByCluster(
    accountId: AccountId,
    provider: ProviderType,
    clusterName: string
  ): Promise<RepositoryResult<number>>;

  /**
   * Get broker metrics aggregated by cluster
   */
  getClusterMetrics(
    accountId: AccountId,
    provider: ProviderType,
    clusterName: string
  ): Promise<RepositoryResult<Record<string, number>>>;

  /**
   * Get health summary for account
   */
  getHealthSummary(
    accountId: AccountId,
    provider?: ProviderType
  ): Promise<RepositoryResult<{
    healthy: number;
    degraded: number;
    unhealthy: number;
    total: number;
  }>>;

  /**
   * Find brokers with stale metrics (older than threshold)
   */
  findStale(
    thresholdMs: number,
    accountId?: AccountId
  ): Promise<RepositoryResult<MessageQueueBroker[]>>;

  /**
   * Update broker metrics only
   */
  updateMetrics(
    guid: EntityGUID,
    metrics: Record<string, number>
  ): Promise<RepositoryResult<boolean>>;

  /**
   * Bulk update controller status
   */
  updateControllerStatus(
    updates: Array<{
      guid: EntityGUID;
      isController: boolean;
    }>
  ): Promise<RepositoryResult<number>>;
}