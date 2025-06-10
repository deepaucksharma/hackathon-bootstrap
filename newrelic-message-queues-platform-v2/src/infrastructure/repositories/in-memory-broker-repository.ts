/**
 * In-Memory Broker Repository Implementation
 * Development implementation for broker persistence using in-memory storage
 */

import { injectable } from 'inversify';
import type { BrokerRepository, BrokerQuery } from '@domain/repositories/broker-repository.js';
import type { MessageQueueBroker } from '@domain/entities/message-queue-broker.js';
import type { EntityGUID } from '@domain/value-objects/entity-guid.js';
import type { UUID, AccountId, ProviderType, RepositoryResult, QueryOptions } from '@shared/types/common.js';
import { ErrorFactory } from '@shared/errors/base.js';

@injectable()
export class InMemoryBrokerRepository implements BrokerRepository {
  private readonly brokers = new Map<string, MessageQueueBroker>();
  private readonly guidIndex = new Map<string, string>(); // guid -> id mapping

  /**
   * Save a broker (create or update)
   */
  async save(broker: MessageQueueBroker): Promise<RepositoryResult<MessageQueueBroker>> {
    try {
      this.brokers.set(broker.id, broker);
      this.guidIndex.set(broker.guid.value, broker.id);
      
      return {
        success: true,
        data: broker
      };
    } catch (error) {
      return {
        success: false,
        error: ErrorFactory.infrastructure(
          'Failed to save broker',
          { brokerId: broker.id, originalError: error instanceof Error ? error.message : String(error) }
        )
      };
    }
  }

  /**
   * Save multiple brokers in a transaction
   */
  async saveMany(brokers: MessageQueueBroker[]): Promise<RepositoryResult<MessageQueueBroker[]>> {
    try {
      for (const broker of brokers) {
        this.brokers.set(broker.id, broker);
        this.guidIndex.set(broker.guid.value, broker.id);
      }
      
      return {
        success: true,
        data: brokers
      };
    } catch (error) {
      return {
        success: false,
        error: ErrorFactory.infrastructure(
          'Failed to save multiple brokers',
          { count: brokers.length, originalError: error instanceof Error ? error.message : String(error) }
        )
      };
    }
  }

  /**
   * Find broker by entity ID
   */
  async findById(id: UUID): Promise<RepositoryResult<MessageQueueBroker>> {
    try {
      const broker = this.brokers.get(id);
      
      if (!broker) {
        return {
          success: false,
          error: ErrorFactory.notFound('Broker not found', { id })
        };
      }
      
      return {
        success: true,
        data: broker
      };
    } catch (error) {
      return {
        success: false,
        error: ErrorFactory.infrastructure(
          'Failed to find broker by ID',
          { id, originalError: error instanceof Error ? error.message : String(error) }
        )
      };
    }
  }

  /**
   * Find broker by GUID
   */
  async findByGuid(guid: EntityGUID): Promise<RepositoryResult<MessageQueueBroker>> {
    try {
      const id = this.guidIndex.get(guid.value);
      
      if (!id) {
        return {
          success: false,
          error: ErrorFactory.notFound('Broker not found', { guid: guid.value })
        };
      }
      
      return this.findById(id);
    } catch (error) {
      return {
        success: false,
        error: ErrorFactory.infrastructure(
          'Failed to find broker by GUID',
          { guid: guid.value, originalError: error instanceof Error ? error.message : String(error) }
        )
      };
    }
  }

  /**
   * Find broker by cluster and broker ID
   */
  async findByClusterAndBrokerId(
    accountId: AccountId,
    provider: ProviderType,
    clusterName: string,
    brokerId: string
  ): Promise<RepositoryResult<MessageQueueBroker>> {
    try {
      for (const broker of this.brokers.values()) {
        if (
          broker.guid.accountId === accountId &&
          broker.guid.provider === provider &&
          broker.guid.domainId === clusterName &&
          broker.guid.identifier === brokerId
        ) {
          return {
            success: true,
            data: broker
          };
        }
      }
      
      return {
        success: false,
        error: ErrorFactory.notFound('Broker not found', {
          accountId,
          provider,
          clusterName,
          brokerId
        })
      };
    } catch (error) {
      return {
        success: false,
        error: ErrorFactory.infrastructure(
          'Failed to find broker by cluster and broker ID',
          { accountId, provider, clusterName, brokerId, originalError: error instanceof Error ? error.message : String(error) }
        )
      };
    }
  }

  /**
   * Find all brokers in a cluster
   */
  async findByCluster(
    accountId: AccountId,
    provider: ProviderType,
    clusterName: string
  ): Promise<RepositoryResult<MessageQueueBroker[]>> {
    try {
      const brokers = Array.from(this.brokers.values()).filter(broker =>
        broker.guid.accountId === accountId &&
        broker.guid.provider === provider &&
        broker.guid.domainId === clusterName
      );
      
      return {
        success: true,
        data: brokers
      };
    } catch (error) {
      return {
        success: false,
        error: ErrorFactory.infrastructure(
          'Failed to find brokers by cluster',
          { accountId, provider, clusterName, originalError: error instanceof Error ? error.message : String(error) }
        )
      };
    }
  }

  /**
   * Find brokers with query options
   */
  async findMany(
    query: BrokerQuery,
    options?: QueryOptions
  ): Promise<RepositoryResult<MessageQueueBroker[]>> {
    try {
      let brokers = Array.from(this.brokers.values());
      
      // Apply filters
      if (query.accountId) {
        brokers = brokers.filter(b => b.guid.accountId === query.accountId);
      }
      
      if (query.provider) {
        brokers = brokers.filter(b => b.guid.provider === query.provider);
      }
      
      if (query.clusterName) {
        brokers = brokers.filter(b => b.guid.domainId === query.clusterName);
      }
      
      if (query.brokerId) {
        brokers = brokers.filter(b => b.guid.identifier === query.brokerId);
      }
      
      if (query.isController !== undefined) {
        brokers = brokers.filter(b => b.isController === query.isController);
      }
      
      if (query.healthStatus) {
        brokers = brokers.filter(b => b.getHealthStatus() === query.healthStatus);
      }
      
      if (query.environment) {
        brokers = brokers.filter(b => b.environment === query.environment);
      }
      
      // Apply pagination
      if (options?.pagination?.limit) {
        const offset = options.pagination.offset || 0;
        brokers = brokers.slice(offset, offset + options.pagination.limit);
      }
      
      return {
        success: true,
        data: brokers
      };
    } catch (error) {
      return {
        success: false,
        error: ErrorFactory.infrastructure(
          'Failed to find brokers with query',
          { query, originalError: error instanceof Error ? error.message : String(error) }
        )
      };
    }
  }

  /**
   * Find all controller brokers
   */
  async findControllers(
    accountId: AccountId,
    provider?: ProviderType
  ): Promise<RepositoryResult<MessageQueueBroker[]>> {
    const query: BrokerQuery = {
      accountId,
      isController: true,
      ...(provider && { provider })
    };
    
    return this.findMany(query);
  }

  /**
   * Find brokers by health status
   */
  async findByHealthStatus(
    accountId: AccountId,
    healthStatus: 'healthy' | 'degraded' | 'unhealthy',
    provider?: ProviderType
  ): Promise<RepositoryResult<MessageQueueBroker[]>> {
    const query: BrokerQuery = {
      accountId,
      healthStatus,
      ...(provider && { provider })
    };
    
    return this.findMany(query);
  }

  /**
   * Count brokers matching query
   */
  async count(query: BrokerQuery): Promise<RepositoryResult<number>> {
    try {
      const result = await this.findMany(query);
      
      if (!result.success) {
        return {
          success: false,
          error: result.error
        };
      }
      
      return {
        success: true,
        data: result.data?.length || 0
      };
    } catch (error) {
      return {
        success: false,
        error: ErrorFactory.infrastructure(
          'Failed to count brokers',
          { query, originalError: error instanceof Error ? error.message : String(error) }
        )
      };
    }
  }

  /**
   * Check if broker exists
   */
  async exists(guid: EntityGUID): Promise<RepositoryResult<boolean>> {
    try {
      const result = await this.findByGuid(guid);
      return {
        success: true,
        data: result.success
      };
    } catch (error) {
      return {
        success: false,
        error: ErrorFactory.infrastructure(
          'Failed to check broker existence',
          { guid: guid.value, originalError: error instanceof Error ? error.message : String(error) }
        )
      };
    }
  }

  /**
   * Delete broker by ID
   */
  async deleteById(id: UUID): Promise<RepositoryResult<boolean>> {
    try {
      const broker = this.brokers.get(id);
      
      if (!broker) {
        return {
          success: false,
          error: ErrorFactory.notFound('Broker not found', { id })
        };
      }
      
      this.brokers.delete(id);
      this.guidIndex.delete(broker.guid.value);
      
      return {
        success: true,
        data: true
      };
    } catch (error) {
      return {
        success: false,
        error: ErrorFactory.infrastructure(
          'Failed to delete broker by ID',
          { id, originalError: error instanceof Error ? error.message : String(error) }
        )
      };
    }
  }

  /**
   * Delete broker by GUID
   */
  async deleteByGuid(guid: EntityGUID): Promise<RepositoryResult<boolean>> {
    try {
      const id = this.guidIndex.get(guid.value);
      
      if (!id) {
        return {
          success: false,
          error: ErrorFactory.notFound('Broker not found', { guid: guid.value })
        };
      }
      
      return this.deleteById(id);
    } catch (error) {
      return {
        success: false,
        error: ErrorFactory.infrastructure(
          'Failed to delete broker by GUID',
          { guid: guid.value, originalError: error instanceof Error ? error.message : String(error) }
        )
      };
    }
  }

  /**
   * Delete all brokers in a cluster
   */
  async deleteByCluster(
    accountId: AccountId,
    provider: ProviderType,
    clusterName: string
  ): Promise<RepositoryResult<number>> {
    try {
      const result = await this.findByCluster(accountId, provider, clusterName);
      
      if (!result.success || !result.data) {
        return {
          success: true,
          data: 0
        };
      }
      
      let deletedCount = 0;
      for (const broker of result.data) {
        const deleteResult = await this.deleteById(broker.id);
        if (deleteResult.success) {
          deletedCount++;
        }
      }
      
      return {
        success: true,
        data: deletedCount
      };
    } catch (error) {
      return {
        success: false,
        error: ErrorFactory.infrastructure(
          'Failed to delete brokers by cluster',
          { accountId, provider, clusterName, originalError: error instanceof Error ? error.message : String(error) }
        )
      };
    }
  }

  /**
   * Get broker metrics aggregated by cluster
   */
  async getClusterMetrics(
    accountId: AccountId,
    provider: ProviderType,
    clusterName: string
  ): Promise<RepositoryResult<Record<string, number>>> {
    try {
      const result = await this.findByCluster(accountId, provider, clusterName);
      
      if (!result.success || !result.data) {
        return {
          success: true,
          data: {}
        };
      }
      
      const metrics: Record<string, number> = {
        brokerCount: result.data.length,
        controllerCount: result.data.filter(b => b.isController).length,
        healthyCount: result.data.filter(b => b.getHealthStatus() === 'healthy').length,
        degradedCount: result.data.filter(b => b.getHealthStatus() === 'degraded').length,
        unhealthyCount: result.data.filter(b => b.getHealthStatus() === 'unhealthy').length
      };
      
      // Aggregate numeric metrics
      let totalThroughput = 0;
      let totalPartitions = 0;
      let totalNetworkIn = 0;
      let totalNetworkOut = 0;
      
      for (const broker of result.data) {
        for (const metric of broker.goldenMetrics) {
          switch (metric.name) {
            case 'throughputPerSecond':
              totalThroughput += metric.value;
              break;
            case 'partitionCount':
              totalPartitions += metric.value;
              break;
            case 'networkBytesInPerSecond':
              totalNetworkIn += metric.value;
              break;
            case 'networkBytesOutPerSecond':
              totalNetworkOut += metric.value;
              break;
          }
        }
      }
      
      metrics.totalThroughputPerSecond = totalThroughput;
      metrics.totalPartitionCount = totalPartitions;
      metrics.totalNetworkBytesInPerSecond = totalNetworkIn;
      metrics.totalNetworkBytesOutPerSecond = totalNetworkOut;
      
      return {
        success: true,
        data: metrics
      };
    } catch (error) {
      return {
        success: false,
        error: ErrorFactory.infrastructure(
          'Failed to get cluster metrics',
          { accountId, provider, clusterName, originalError: error instanceof Error ? error.message : String(error) }
        )
      };
    }
  }

  /**
   * Get health summary for account
   */
  async getHealthSummary(
    accountId: AccountId,
    provider?: ProviderType
  ): Promise<RepositoryResult<{
    healthy: number;
    degraded: number;
    unhealthy: number;
    total: number;
  }>> {
    try {
      const query: BrokerQuery = {
        accountId,
        ...(provider && { provider })
      };
      
      const result = await this.findMany(query);
      
      if (!result.success || !result.data) {
        return {
          success: true,
          data: { healthy: 0, degraded: 0, unhealthy: 0, total: 0 }
        };
      }
      
      const summary = {
        healthy: result.data.filter(b => b.getHealthStatus() === 'healthy').length,
        degraded: result.data.filter(b => b.getHealthStatus() === 'degraded').length,
        unhealthy: result.data.filter(b => b.getHealthStatus() === 'unhealthy').length,
        total: result.data.length
      };
      
      return {
        success: true,
        data: summary
      };
    } catch (error) {
      return {
        success: false,
        error: ErrorFactory.infrastructure(
          'Failed to get health summary',
          { accountId, provider, originalError: error instanceof Error ? error.message : String(error) }
        )
      };
    }
  }

  /**
   * Find brokers with stale metrics (older than threshold)
   */
  async findStale(
    thresholdMs: number,
    accountId?: AccountId
  ): Promise<RepositoryResult<MessageQueueBroker[]>> {
    try {
      const cutoffTime = Date.now() - thresholdMs;
      let brokers = Array.from(this.brokers.values());
      
      if (accountId) {
        brokers = brokers.filter(b => b.guid.accountId === accountId);
      }
      
      const staleBrokers = brokers.filter(broker => broker.updatedAt < cutoffTime);
      
      return {
        success: true,
        data: staleBrokers
      };
    } catch (error) {
      return {
        success: false,
        error: ErrorFactory.infrastructure(
          'Failed to find stale brokers',
          { thresholdMs, accountId, originalError: error instanceof Error ? error.message : String(error) }
        )
      };
    }
  }

  /**
   * Update broker metrics only
   */
  async updateMetrics(
    guid: EntityGUID,
    metrics: Record<string, number>
  ): Promise<RepositoryResult<boolean>> {
    try {
      const result = await this.findByGuid(guid);
      
      if (!result.success || !result.data) {
        return {
          success: false,
          error: ErrorFactory.notFound('Broker not found', { guid: guid.value })
        };
      }
      
      result.data.updateMetrics(metrics);
      await this.save(result.data);
      
      return {
        success: true,
        data: true
      };
    } catch (error) {
      return {
        success: false,
        error: ErrorFactory.infrastructure(
          'Failed to update broker metrics',
          { guid: guid.value, originalError: error instanceof Error ? error.message : String(error) }
        )
      };
    }
  }

  /**
   * Bulk update controller status
   */
  async updateControllerStatus(
    updates: Array<{
      guid: EntityGUID;
      isController: boolean;
    }>
  ): Promise<RepositoryResult<number>> {
    try {
      let updatedCount = 0;
      
      for (const update of updates) {
        const result = await this.findByGuid(update.guid);
        
        if (result.success && result.data) {
          result.data.setControllerStatus(update.isController);
          await this.save(result.data);
          updatedCount++;
        }
      }
      
      return {
        success: true,
        data: updatedCount
      };
    } catch (error) {
      return {
        success: false,
        error: ErrorFactory.infrastructure(
          'Failed to bulk update controller status',
          { updateCount: updates.length, originalError: error instanceof Error ? error.message : String(error) }
        )
      };
    }
  }
}