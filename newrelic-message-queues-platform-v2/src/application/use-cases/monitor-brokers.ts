/**
 * Monitor Brokers Use Case
 * Orchestrates the collection, transformation, and storage of broker metrics
 */

import { injectable, inject } from 'inversify';
import type { BrokerRepository } from '@domain/repositories/broker-repository.js';
import type { MessageQueueBroker } from '@domain/entities/message-queue-broker.js';
import type { EventBus } from '@shared/events/event-bus.js';
import type { Logger } from '@shared/utils/logger.js';
import type { AccountId, ProviderType, RepositoryResult } from '@shared/types/common.js';
import { ErrorFactory } from '@shared/errors/base.js';

export interface BrokerMonitoringConfig {
  readonly accountId: AccountId;
  readonly provider: ProviderType;
  readonly clusterName: string;
  readonly intervalMs: number;
  readonly healthCheckEnabled: boolean;
  readonly alertThresholds: {
    readonly errorRatePercent: number;
    readonly diskUsagePercent: number;
    readonly memoryUsagePercent: number;
  };
}

export interface BrokerMetricsData {
  readonly brokerId: string;
  readonly host: string;
  readonly port: number;
  readonly isController?: boolean;
  readonly metrics: {
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
  };
}

export interface MonitoringResult {
  readonly success: boolean;
  readonly processedCount: number;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly errors: string[];
  readonly unhealthyBrokers: string[];
}

@injectable()
export class MonitorBrokersUseCase {
  constructor(
    @inject('BrokerRepository') private readonly brokerRepository: BrokerRepository,
    @inject('EventBus') private readonly eventBus: EventBus,
    @inject('Logger') private readonly logger: Logger
  ) {}

  /**
   * Process broker metrics data and update entities
   */
  public async execute(
    config: BrokerMonitoringConfig,
    brokersData: BrokerMetricsData[]
  ): Promise<MonitoringResult> {
    const timer = this.logger.timer('monitor-brokers', {
      accountId: config.accountId,
      provider: config.provider,
      clusterName: config.clusterName,
      brokerCount: brokersData.length
    });

    try {
      this.logger.info('Starting broker monitoring', {
        accountId: config.accountId,
        provider: config.provider,
        clusterName: config.clusterName,
        brokerCount: brokersData.length
      });

      const result = await this.processBrokerMetrics(config, brokersData);
      
      // Publish monitoring completed event
      await this.eventBus.publish({
        id: crypto.randomUUID(),
        type: 'BrokerMonitoringCompleted',
        aggregateId: config.clusterName,
        timestamp: Date.now(),
        version: 1,
        data: {
          accountId: config.accountId,
          provider: config.provider,
          clusterName: config.clusterName,
          result
        }
      });

      timer.complete();
      return result;

    } catch (error) {
      const appError = error instanceof Error ? error : new Error(String(error));
      timer.fail();
      
      throw ErrorFactory.infrastructure(
        `Failed to monitor brokers for cluster ${config.clusterName}`,
        {
          accountId: config.accountId,
          provider: config.provider,
          clusterName: config.clusterName,
          originalError: appError.message
        }
      );
    }
  }

  /**
   * Get current health status for all brokers in a cluster
   */
  public async getClusterHealth(
    accountId: AccountId,
    provider: ProviderType,
    clusterName: string
  ): Promise<{
    healthy: MessageQueueBroker[];
    degraded: MessageQueueBroker[];
    unhealthy: MessageQueueBroker[];
    total: number;
  }> {
    const result = await this.brokerRepository.findByCluster(accountId, provider, clusterName);
    
    if (!result.success || !result.data) {
      throw ErrorFactory.infrastructure(
        `Failed to retrieve brokers for cluster ${clusterName}`,
        { accountId, provider, clusterName }
      );
    }

    const brokers = result.data;
    const health = {
      healthy: [] as MessageQueueBroker[],
      degraded: [] as MessageQueueBroker[],
      unhealthy: [] as MessageQueueBroker[],
      total: brokers.length
    };

    for (const broker of brokers) {
      const status = broker.getHealthStatus();
      health[status].push(broker);
    }

    return health;
  }

  /**
   * Find brokers that haven't reported metrics recently
   */
  public async findStaleBrokers(
    accountId: AccountId,
    thresholdMs: number = 300000 // 5 minutes
  ): Promise<MessageQueueBroker[]> {
    const result = await this.brokerRepository.findStale(thresholdMs, accountId);
    
    if (!result.success) {
      throw ErrorFactory.infrastructure(
        'Failed to find stale brokers',
        { accountId, thresholdMs }
      );
    }

    return result.data || [];
  }

  private async processBrokerMetrics(
    config: BrokerMonitoringConfig,
    brokersData: BrokerMetricsData[]
  ): Promise<MonitoringResult> {
    const result = {
      success: true,
      processedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      errors: [] as string[],
      unhealthyBrokers: [] as string[]
    };

    const processedBrokers: MessageQueueBroker[] = [];

    for (const brokerData of brokersData) {
      try {
        const broker = await this.processIndividualBroker(config, brokerData);
        processedBrokers.push(broker);
        result.processedCount++;

        // Check health and add to alerts if needed
        const healthStatus = broker.getHealthStatus();
        if (healthStatus !== 'healthy') {
          result.unhealthyBrokers.push(broker.guid.value);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push(`Broker ${brokerData.brokerId}: ${errorMessage}`);
        this.logger.error('Failed to process broker', {
          brokerId: brokerData.brokerId,
          error: errorMessage
        });
      }
    }

    // Save all processed brokers
    if (processedBrokers.length > 0) {
      const saveResult = await this.brokerRepository.saveMany(processedBrokers);
      
      if (!saveResult.success) {
        throw ErrorFactory.infrastructure(
          'Failed to save broker data',
          { processedCount: processedBrokers.length }
        );
      }

      // Assume all are updates for now (could enhance to track creates vs updates)
      result.updatedCount = processedBrokers.length;
    }

    result.success = result.errors.length === 0;
    return result;
  }

  private async processIndividualBroker(
    config: BrokerMonitoringConfig,
    brokerData: BrokerMetricsData
  ): Promise<MessageQueueBroker> {
    // Try to find existing broker
    const existingResult = await this.brokerRepository.findByClusterAndBrokerId(
      config.accountId,
      config.provider,
      config.clusterName,
      brokerData.brokerId
    );

    let broker: MessageQueueBroker;

    if (existingResult.success && existingResult.data) {
      // Update existing broker
      broker = existingResult.data;
      broker.updateMetrics(brokerData.metrics);
      
      if (brokerData.isController !== undefined) {
        broker.setControllerStatus(brokerData.isController);
      }
    } else {
      // Create new broker
      const { MessageQueueBroker } = await import('@domain/entities/message-queue-broker.js');
      
      broker = new MessageQueueBroker({
        accountId: config.accountId,
        provider: config.provider,
        clusterName: config.clusterName,
        brokerId: brokerData.brokerId,
        host: brokerData.host,
        port: brokerData.port,
        isController: brokerData.isController
      });
      
      broker.updateMetrics(brokerData.metrics);
    }

    // Validate broker state
    broker.validate();

    return broker;
  }
}