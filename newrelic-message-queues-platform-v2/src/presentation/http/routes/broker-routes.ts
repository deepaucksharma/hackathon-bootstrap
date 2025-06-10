/**
 * Broker Routes
 * REST API endpoints for broker management and monitoring
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ContainerFactory } from '@infrastructure/config/container.js';
import { TYPES } from '@infrastructure/config/container.js';
import type { MonitorBrokersUseCase, BrokerMetricsData } from '@application/use-cases/monitor-brokers.js';
import type { BrokerRepository } from '@domain/repositories/broker-repository.js';
import type { Logger } from '@shared/utils/logger.js';
import type { AccountId, ProviderType } from '@shared/types/common.js';
import { ErrorFactory } from '@shared/errors/base.js';

interface BrokerQueryParams {
  accountId?: string;
  provider?: string;
  clusterName?: string;
  brokerId?: string;
  environment?: string;
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy';
  limit?: number;
  offset?: number;
}

interface CreateBrokerRequest {
  accountId: string;
  provider: string;
  clusterName: string;
  brokerId: string;
  host: string;
  port: number;
  isController?: boolean;
  version?: string;
  environment?: string;
}

interface UpdateBrokerMetricsRequest {
  metrics: BrokerMetricsData['metrics'];
}

export async function brokerRoutes(fastify: FastifyInstance): Promise<void> {
  const container = ContainerFactory.getInstance();
  const monitorBrokersUseCase = container.get<MonitorBrokersUseCase>(TYPES.MonitorBrokersUseCase);
  const brokerRepository = container.get<BrokerRepository>(TYPES.BrokerRepository);
  const logger = container.get<Logger>(TYPES.Logger);

  // List brokers with filtering and pagination
  fastify.get('/', async (request: FastifyRequest<{ Querystring: BrokerQueryParams }>, reply: FastifyReply) => {
    try {
      const { 
        accountId, 
        provider, 
        clusterName, 
        brokerId, 
        environment, 
        healthStatus, 
        limit = 50, 
        offset = 0 
      } = request.query;

      // Validate required parameters
      if (!accountId) {
        await reply.code(400).send({
          error: 'Bad Request',
          message: 'accountId query parameter is required',
          statusCode: 400
        });
        return;
      }

      const query = {
        accountId: accountId as AccountId,
        ...(provider && { provider: provider as ProviderType }),
        ...(clusterName && { clusterName }),
        ...(brokerId && { brokerId }),
        ...(environment && { environment }),
        ...(healthStatus && { healthStatus })
      };

      const result = await brokerRepository.findMany(query, { 
        pagination: limit || offset ? { 
          limit: limit || 100, 
          offset: offset || 0 
        } : undefined 
      });

      if (!result.success) {
        throw result.error || ErrorFactory.infrastructure('Failed to retrieve brokers');
      }

      const brokers = result.data || [];
      const brokerData = brokers.map(broker => ({
        id: broker.id,
        guid: broker.guid.value,
        name: broker.name,
        host: broker.host,
        port: broker.port,
        isController: broker.isController,
        version: broker.version,
        environment: broker.environment,
        healthStatus: broker.getHealthStatus(),
        goldenMetrics: broker.goldenMetrics.map(m => ({
          name: m.name,
          value: m.value,
          unit: m.unit
        })),
        relationships: broker.relationships,
        tags: Object.fromEntries(broker.tags),
        createdAt: broker.createdAt,
        updatedAt: broker.updatedAt
      }));

      await reply.code(200).send({
        brokers: brokerData,
        pagination: {
          limit,
          offset,
          total: brokers.length
        },
        query: {
          accountId,
          provider,
          clusterName,
          brokerId,
          environment,
          healthStatus
        }
      });

    } catch (error) {
      logger.error('Error listing brokers', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      await reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve brokers',
        statusCode: 500
      });
    }
  });

  // Get broker by ID
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;

      const result = await brokerRepository.findById(id);

      if (!result.success || !result.data) {
        await reply.code(404).send({
          error: 'Not Found',
          message: `Broker with ID ${id} not found`,
          statusCode: 404
        });
        return;
      }

      const broker = result.data;
      const brokerData = {
        id: broker.id,
        guid: broker.guid.value,
        name: broker.name,
        host: broker.host,
        port: broker.port,
        isController: broker.isController,
        version: broker.version,
        environment: broker.environment,
        healthStatus: broker.getHealthStatus(),
        goldenMetrics: broker.goldenMetrics.map(m => ({
          name: m.name,
          value: m.value,
          unit: m.unit,
          timestamp: m.timestamp
        })),
        relationships: broker.relationships,
        tags: Object.fromEntries(broker.tags),
        createdAt: broker.createdAt,
        updatedAt: broker.updatedAt,
        eventPayload: broker.toEventPayload()
      };

      await reply.code(200).send({ broker: brokerData });

    } catch (error) {
      logger.error('Error retrieving broker', { 
        id: request.params.id,
        error: error instanceof Error ? error.message : String(error) 
      });
      
      await reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve broker',
        statusCode: 500
      });
    }
  });

  // Create new broker
  fastify.post('/', async (request: FastifyRequest<{ Body: CreateBrokerRequest }>, reply: FastifyReply) => {
    try {
      const brokerConfig = request.body;

      // Validate required fields
      const requiredFields = ['accountId', 'provider', 'clusterName', 'brokerId', 'host', 'port'];
      const missingFields = requiredFields.filter(field => !brokerConfig[field as keyof CreateBrokerRequest]);
      
      if (missingFields.length > 0) {
        await reply.code(400).send({
          error: 'Bad Request',
          message: `Missing required fields: ${missingFields.join(', ')}`,
          statusCode: 400
        });
        return;
      }

      // Create broker entity
      const { MessageQueueBroker } = await import('@domain/entities/message-queue-broker.js');
      const broker = new MessageQueueBroker({
        accountId: brokerConfig.accountId as AccountId,
        provider: brokerConfig.provider as ProviderType,
        clusterName: brokerConfig.clusterName,
        brokerId: brokerConfig.brokerId,
        host: brokerConfig.host,
        port: brokerConfig.port,
        isController: brokerConfig.isController,
        version: brokerConfig.version,
        environment: brokerConfig.environment
      });

      // Save broker
      const result = await brokerRepository.save(broker);

      if (!result.success) {
        throw result.error || ErrorFactory.infrastructure('Failed to create broker');
      }

      logger.info('Broker created', {
        brokerId: broker.id,
        guid: broker.guid.value,
        clusterName: brokerConfig.clusterName
      });

      await reply.code(201).send({
        message: 'Broker created successfully',
        broker: {
          id: broker.id,
          guid: broker.guid.value,
          name: broker.name,
          host: broker.host,
          port: broker.port,
          isController: broker.isController,
          environment: broker.environment,
          createdAt: broker.createdAt
        }
      });

    } catch (error) {
      logger.error('Error creating broker', { 
        error: error instanceof Error ? error.message : String(error),
        body: request.body
      });
      
      if (error instanceof Error && error.name === 'ValidationError') {
        await reply.code(400).send({
          error: 'Bad Request',
          message: error.message,
          statusCode: 400
        });
        return;
      }
      
      await reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create broker',
        statusCode: 500
      });
    }
  });

  // Update broker metrics
  fastify.patch('/:id/metrics', async (request: FastifyRequest<{ 
    Params: { id: string }; 
    Body: UpdateBrokerMetricsRequest 
  }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { metrics } = request.body;

      if (!metrics || typeof metrics !== 'object') {
        await reply.code(400).send({
          error: 'Bad Request',
          message: 'Valid metrics object is required',
          statusCode: 400
        });
        return;
      }

      const result = await brokerRepository.findById(id);

      if (!result.success || !result.data) {
        await reply.code(404).send({
          error: 'Not Found',
          message: `Broker with ID ${id} not found`,
          statusCode: 404
        });
        return;
      }

      const broker = result.data;
      broker.updateMetrics(metrics);

      const saveResult = await brokerRepository.save(broker);

      if (!saveResult.success) {
        throw saveResult.error || ErrorFactory.infrastructure('Failed to update broker metrics');
      }

      logger.info('Broker metrics updated', {
        brokerId: broker.id,
        guid: broker.guid.value,
        metricsCount: Object.keys(metrics).length
      });

      await reply.code(200).send({
        message: 'Broker metrics updated successfully',
        broker: {
          id: broker.id,
          guid: broker.guid.value,
          healthStatus: broker.getHealthStatus(),
          goldenMetrics: broker.goldenMetrics.map(m => ({
            name: m.name,
            value: m.value,
            unit: m.unit
          })),
          updatedAt: broker.updatedAt
        }
      });

    } catch (error) {
      logger.error('Error updating broker metrics', { 
        id: request.params.id,
        error: error instanceof Error ? error.message : String(error) 
      });
      
      await reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to update broker metrics',
        statusCode: 500
      });
    }
  });

  // Delete broker
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;

      const result = await brokerRepository.deleteById(id);

      if (!result.success || !result.data) {
        await reply.code(404).send({
          error: 'Not Found',
          message: `Broker with ID ${id} not found`,
          statusCode: 404
        });
        return;
      }

      logger.info('Broker deleted', { brokerId: id });

      await reply.code(200).send({
        message: 'Broker deleted successfully',
        id
      });

    } catch (error) {
      logger.error('Error deleting broker', { 
        id: request.params.id,
        error: error instanceof Error ? error.message : String(error) 
      });
      
      await reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to delete broker',
        statusCode: 500
      });
    }
  });

  // Get cluster health summary
  fastify.get('/clusters/:clusterName/health', async (request: FastifyRequest<{
    Params: { clusterName: string };
    Querystring: { accountId: string; provider?: string };
  }>, reply: FastifyReply) => {
    try {
      const { clusterName } = request.params;
      const { accountId, provider } = request.query;

      if (!accountId) {
        await reply.code(400).send({
          error: 'Bad Request',
          message: 'accountId query parameter is required',
          statusCode: 400
        });
        return;
      }

      const health = await monitorBrokersUseCase.getClusterHealth(
        accountId as AccountId,
        (provider as ProviderType) || 'kafka',
        clusterName
      );

      await reply.code(200).send({
        clusterName,
        health: {
          healthy: health.healthy.map(b => ({
            id: b.id,
            guid: b.guid.value,
            name: b.name,
            host: b.host,
            port: b.port,
            isController: b.isController
          })),
          degraded: health.degraded.map(b => ({
            id: b.id,
            guid: b.guid.value,
            name: b.name,
            host: b.host,
            port: b.port,
            isController: b.isController
          })),
          unhealthy: health.unhealthy.map(b => ({
            id: b.id,
            guid: b.guid.value,
            name: b.name,
            host: b.host,
            port: b.port,
            isController: b.isController
          })),
          summary: {
            total: health.total,
            healthyCount: health.healthy.length,
            degradedCount: health.degraded.length,
            unhealthyCount: health.unhealthy.length,
            healthPercentage: health.total > 0 ? (health.healthy.length / health.total) * 100 : 0
          }
        }
      });

    } catch (error) {
      logger.error('Error retrieving cluster health', { 
        clusterName: request.params.clusterName,
        error: error instanceof Error ? error.message : String(error) 
      });
      
      await reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve cluster health',
        statusCode: 500
      });
    }
  });

  // Get stale brokers
  fastify.get('/stale', async (request: FastifyRequest<{
    Querystring: { accountId: string; thresholdMs?: number };
  }>, reply: FastifyReply) => {
    try {
      const { accountId, thresholdMs = 300000 } = request.query; // 5 minutes default

      if (!accountId) {
        await reply.code(400).send({
          error: 'Bad Request',
          message: 'accountId query parameter is required',
          statusCode: 400
        });
        return;
      }

      const staleBrokers = await monitorBrokersUseCase.findStaleBrokers(
        accountId as AccountId,
        Number(thresholdMs)
      );

      const brokerData = staleBrokers.map(broker => ({
        id: broker.id,
        guid: broker.guid.value,
        name: broker.name,
        host: broker.host,
        port: broker.port,
        clusterName: broker.guid.domainId,
        lastUpdate: broker.updatedAt,
        staleDuration: Date.now() - broker.updatedAt
      }));

      await reply.code(200).send({
        staleBrokers: brokerData,
        count: brokerData.length,
        thresholdMs: Number(thresholdMs)
      });

    } catch (error) {
      logger.error('Error retrieving stale brokers', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      await reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve stale brokers',
        statusCode: 500
      });
    }
  });
}