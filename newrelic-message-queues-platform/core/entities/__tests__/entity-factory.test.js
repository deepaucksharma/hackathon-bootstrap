/**
 * Unit tests for EntityFactory
 * 
 * Tests entity creation, validation, and relationship management
 */

// Mock the entity classes
jest.mock('../message-queue-cluster');
jest.mock('../message-queue-broker');
jest.mock('../message-queue-topic');
jest.mock('../message-queue-queue');

const EntityFactory = require('../entity-factory');
const TestHelpers = require('../../../test/utils/test-helpers');

describe('EntityFactory', () => {
  let factory;
  let testHelper;

  beforeEach(async () => {
    testHelper = new TestHelpers();
    await testHelper.initializeTestEnvironment();
    factory = new EntityFactory();
  });

  afterEach(() => {
    factory.clear();
  });

  describe('constructor', () => {
    test('should initialize with empty registry', () => {
      expect(factory.entityRegistry.size).toBe(0);
      expect(factory.relationshipManager).toBeDefined();
    });
  });

  describe('createCluster', () => {
    test('should create cluster with valid configuration', () => {
      const config = {
        name: 'test-cluster',
        provider: 'kafka',
        accountId: '123456',
        region: 'us-east-1'
      };

      const cluster = factory.createCluster(config);

      expect(cluster).toBeDefined();
      expect(cluster.name).toBe('test-cluster');
      expect(cluster.provider).toBe('kafka');
      expect(cluster.accountId).toBe('123456');
      expect(cluster.entityType).toBe('MESSAGE_QUEUE_CLUSTER');
    });

    test('should throw error when configuration is missing', () => {
      expect(() => factory.createCluster()).toThrow('Configuration object is required');
      expect(() => factory.createCluster(null)).toThrow('Configuration object is required');
    });

    test('should throw error when name is missing', () => {
      expect(() => factory.createCluster({ provider: 'kafka' }))
        .toThrow('Cluster name is required');
    });

    test('should throw error when provider is missing', () => {
      expect(() => factory.createCluster({ name: 'test' }))
        .toThrow('Provider is required');
    });

    test('should throw error when accountId is missing and not in env', () => {
      const originalEnv = process.env.NEW_RELIC_ACCOUNT_ID;
      delete process.env.NEW_RELIC_ACCOUNT_ID;

      expect(() => factory.createCluster({ name: 'test', provider: 'kafka' }))
        .toThrow('Account ID is required');

      process.env.NEW_RELIC_ACCOUNT_ID = originalEnv;
    });

    test('should use environment accountId when not provided in config', () => {
      process.env.NEW_RELIC_ACCOUNT_ID = '999999';
      
      const cluster = factory.createCluster({
        name: 'test-cluster',
        provider: 'kafka'
      });

      expect(cluster.accountId).toBe('999999');
    });

    test('should register cluster in entity registry', () => {
      const cluster = factory.createCluster({
        name: 'test-cluster',
        provider: 'kafka',
        accountId: '123456'
      });

      expect(factory.entityRegistry.has(cluster.guid)).toBe(true);
      expect(factory.entityRegistry.get(cluster.guid)).toBe(cluster);
    });
  });

  describe('createBroker', () => {
    let cluster;

    beforeEach(() => {
      cluster = factory.createCluster({
        name: 'test-cluster',
        provider: 'kafka',
        accountId: '123456'
      });
    });

    test('should create broker with valid configuration', () => {
      const config = {
        brokerId: 1,
        host: 'broker1.example.com',
        port: 9092,
        clusterGuid: cluster.guid
      };

      const broker = factory.createBroker(config);

      expect(broker).toBeDefined();
      expect(broker.entityType).toBe('MESSAGE_QUEUE_BROKER');
      expect(broker.brokerId).toBe(1);
      expect(broker.host).toBe('broker1.example.com');
    });

    test('should link broker to cluster when clusterGuid provided', () => {
      const broker = factory.createBroker({
        brokerId: 1,
        clusterGuid: cluster.guid
      });

      // Verify broker is linked to cluster
      expect(broker.clusterGuid).toBe(cluster.guid);
      // Note: Actual linking depends on MessageQueueBroker implementation
    });

    test('should register broker in entity registry', () => {
      const broker = factory.createBroker({ brokerId: 1 });
      
      expect(factory.entityRegistry.has(broker.guid)).toBe(true);
      expect(factory.entityRegistry.get(broker.guid)).toBe(broker);
    });
  });

  describe('createTopic', () => {
    let cluster;

    beforeEach(() => {
      cluster = factory.createCluster({
        name: 'test-cluster',
        provider: 'kafka',
        accountId: '123456'
      });
    });

    test('should create topic with valid configuration', () => {
      const config = {
        name: 'test-topic',
        partitionCount: 10,
        replicationFactor: 3,
        clusterGuid: cluster.guid
      };

      const topic = factory.createTopic(config);

      expect(topic).toBeDefined();
      expect(topic.entityType).toBe('MESSAGE_QUEUE_TOPIC');
      expect(topic.name).toBe('test-topic');
      expect(topic.partitionCount).toBe(10);
    });

    test('should link topic to cluster when clusterGuid provided', () => {
      const topic = factory.createTopic({
        name: 'test-topic',
        clusterGuid: cluster.guid
      });

      expect(topic.clusterGuid).toBe(cluster.guid);
    });
  });

  describe('createQueue', () => {
    test('should create queue with valid configuration', () => {
      const config = {
        name: 'test-queue',
        vhost: '/',
        durable: true,
        autoDelete: false
      };

      const queue = factory.createQueue(config);

      expect(queue).toBeDefined();
      expect(queue.entityType).toBe('MESSAGE_QUEUE_QUEUE');
      expect(queue.name).toBe('test-queue');
      expect(queue.vhost).toBe('/');
    });

    test('should set parent when parentGuid and parentType provided', () => {
      const queue = factory.createQueue({
        name: 'test-queue',
        parentGuid: 'parent-123',
        parentType: 'MESSAGE_QUEUE_CLUSTER'
      });

      // Verify parent is set (implementation dependent)
      expect(queue.parentGuid).toBe('parent-123');
      expect(queue.parentType).toBe('MESSAGE_QUEUE_CLUSTER');
    });
  });

  describe('createTopology', () => {
    test('should create complete topology from configuration', () => {
      const topologyConfig = {
        clusters: [
          { name: 'cluster1', provider: 'kafka', accountId: '123' },
          { name: 'cluster2', provider: 'rabbitmq', accountId: '123' }
        ],
        brokers: [
          { brokerId: 1, clusterGuid: null },
          { brokerId: 2, clusterGuid: null }
        ],
        topics: [
          { name: 'topic1', clusterGuid: null },
          { name: 'topic2', clusterGuid: null }
        ],
        queues: [
          { name: 'queue1' },
          { name: 'queue2' }
        ]
      };

      const entities = factory.createTopology(topologyConfig);

      expect(entities.clusters).toHaveLength(2);
      expect(entities.brokers).toHaveLength(2);
      expect(entities.topics).toHaveLength(2);
      expect(entities.queues).toHaveLength(2);
      expect(factory.entityRegistry.size).toBe(8);
    });

    test('should handle empty topology configuration', () => {
      const entities = factory.createTopology({});

      expect(entities.clusters).toHaveLength(0);
      expect(entities.brokers).toHaveLength(0);
      expect(entities.topics).toHaveLength(0);
      expect(entities.queues).toHaveLength(0);
    });

    test('should handle partial topology configuration', () => {
      const entities = factory.createTopology({
        clusters: [
          { name: 'cluster1', provider: 'kafka', accountId: '123' }
        ]
      });

      expect(entities.clusters).toHaveLength(1);
      expect(entities.brokers).toHaveLength(0);
      expect(entities.topics).toHaveLength(0);
      expect(entities.queues).toHaveLength(0);
    });
  });

  describe('getEntity', () => {
    test('should return entity by GUID', () => {
      const cluster = factory.createCluster({
        name: 'test-cluster',
        provider: 'kafka',
        accountId: '123456'
      });

      const retrieved = factory.getEntity(cluster.guid);
      expect(retrieved).toBe(cluster);
    });

    test('should return undefined for non-existent GUID', () => {
      const retrieved = factory.getEntity('non-existent-guid');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getEntitiesByType', () => {
    beforeEach(() => {
      factory.createCluster({ name: 'cluster1', provider: 'kafka', accountId: '123' });
      factory.createCluster({ name: 'cluster2', provider: 'kafka', accountId: '123' });
      factory.createBroker({ brokerId: 1 });
      factory.createTopic({ name: 'topic1' });
    });

    test('should return all entities of specified type', () => {
      const clusters = factory.getEntitiesByType('MESSAGE_QUEUE_CLUSTER');
      expect(clusters).toHaveLength(2);
      expect(clusters.every(e => e.entityType === 'MESSAGE_QUEUE_CLUSTER')).toBe(true);
    });

    test('should return empty array for non-existent type', () => {
      const entities = factory.getEntitiesByType('NON_EXISTENT_TYPE');
      expect(entities).toHaveLength(0);
    });
  });

  describe('getEntitiesByProvider', () => {
    beforeEach(() => {
      factory.createCluster({ name: 'kafka1', provider: 'kafka', accountId: '123' });
      factory.createCluster({ name: 'kafka2', provider: 'kafka', accountId: '123' });
      factory.createCluster({ name: 'rabbit1', provider: 'rabbitmq', accountId: '123' });
    });

    test('should return all entities for specified provider', () => {
      const kafkaEntities = factory.getEntitiesByProvider('kafka');
      expect(kafkaEntities).toHaveLength(2);
      expect(kafkaEntities.every(e => e.provider === 'kafka')).toBe(true);
    });

    test('should return empty array for non-existent provider', () => {
      const entities = factory.getEntitiesByProvider('non-existent');
      expect(entities).toHaveLength(0);
    });
  });

  describe('getSummary', () => {
    beforeEach(() => {
      factory.createCluster({ name: 'cluster1', provider: 'kafka', accountId: '123' });
      factory.createCluster({ name: 'cluster2', provider: 'rabbitmq', accountId: '123' });
      factory.createBroker({ brokerId: 1, provider: 'rabbitmq', accountId: '123' });
      factory.createTopic({ name: 'topic1', provider: 'kafka', accountId: '123' });
    });

    test('should return correct summary statistics', () => {
      const summary = factory.getSummary();

      expect(summary.totalEntities).toBe(4);
      expect(summary.byType['MESSAGE_QUEUE_CLUSTER']).toBe(2);
      expect(summary.byType['MESSAGE_QUEUE_BROKER']).toBe(1);
      expect(summary.byType['MESSAGE_QUEUE_TOPIC']).toBe(1);
      expect(summary.byProvider['kafka']).toBe(2);
      expect(summary.byProvider['rabbitmq']).toBe(2);
      expect(summary.healthPercentage).toBeDefined();
    });

    test('should handle empty registry', () => {
      factory.clear();
      const summary = factory.getSummary();

      expect(summary.totalEntities).toBe(0);
      expect(summary.byType).toEqual({});
      expect(summary.byProvider).toEqual({});
      expect(summary.healthPercentage).toBe('100.0');
    });
  });

  describe('exportEntities', () => {
    test('should export all entities to JSON format', () => {
      const cluster = factory.createCluster({
        name: 'test-cluster',
        provider: 'kafka',
        accountId: '123456'
      });
      const broker = factory.createBroker({ brokerId: 1 });

      const exported = factory.exportEntities();

      expect(Object.keys(exported)).toHaveLength(2);
      expect(exported[cluster.guid]).toBeDefined();
      expect(exported[broker.guid]).toBeDefined();
    });

    test('should return empty object when no entities', () => {
      const exported = factory.exportEntities();
      expect(exported).toEqual({});
    });
  });

  describe('clear', () => {
    test('should remove all entities and relationships', () => {
      factory.createCluster({ name: 'cluster1', provider: 'kafka', accountId: '123' });
      factory.createBroker({ brokerId: 1 });
      factory.createTopic({ name: 'topic1' });

      expect(factory.entityRegistry.size).toBe(3);

      factory.clear();

      expect(factory.entityRegistry.size).toBe(0);
    });
  });

  describe('validateAll', () => {
    test('should return empty array when all entities are valid', () => {
      // Assuming entities have valid configurations
      factory.createCluster({ name: 'cluster1', provider: 'kafka', accountId: '123' });
      
      const results = factory.validateAll();
      expect(results).toHaveLength(0);
    });

    // Note: Testing validation failures would require mocking entity.validate()
  });
});

describe('RelationshipManager', () => {
  // Note: RelationshipManager tests would go here if it were exported
  // Currently it's a private class, so we test it indirectly through EntityFactory
});