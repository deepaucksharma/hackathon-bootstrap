/**
 * Unit tests for DataSimulator
 * 
 * Tests data generation, topology creation, and pattern simulation
 */

// Mock dependencies
jest.mock('../../../core/entities', () => ({
  EntityFactory: jest.fn().mockImplementation(() => ({
    createCluster: jest.fn((config) => ({
      guid: `cluster-${Math.random()}`,
      name: config.name,
      clusterName: config.clusterName || config.name,
      provider: config.provider,
      region: config.region,
      environment: config.environment,
      ...config
    })),
    createBroker: jest.fn((config) => ({
      guid: `broker-${Math.random()}`,
      brokerId: config.brokerId,
      clusterGuid: config.clusterGuid,
      hostname: config.hostname,
      ...config
    })),
    createTopic: jest.fn((config) => ({
      guid: `topic-${Math.random()}`,
      topic: config.topic,
      clusterGuid: config.clusterGuid,
      ...config
    })),
    createQueue: jest.fn((config) => ({
      guid: `queue-${Math.random()}`,
      queueName: config.queueName,
      provider: config.provider,
      ...config
    }))
  })),
  PROVIDERS: {
    KAFKA: 'kafka',
    RABBITMQ: 'rabbitmq',
    SQS: 'sqs',
    AZURE_SERVICE_BUS: 'azure_service_bus'
  }
}));

const DataSimulator = require('../data-simulator');

describe('DataSimulator', () => {
  let simulator;

  beforeEach(() => {
    simulator = new DataSimulator();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with default configuration', () => {
      expect(simulator.config.businessHoursStart).toBe(9);
      expect(simulator.config.businessHoursEnd).toBe(17);
      expect(simulator.config.timeZone).toBe('UTC');
      expect(simulator.config.weekendReduction).toBe(0.3);
      expect(simulator.config.anomalyRate).toBe(0.05);
      expect(simulator.config.dataPattern).toBe('realistic');
    });

    test('should accept custom configuration', () => {
      const customConfig = {
        businessHoursStart: 8,
        businessHoursEnd: 18,
        timeZone: 'America/New_York',
        weekendReduction: 0.5,
        anomalyRate: 0.1,
        dataPattern: 'synthetic'
      };

      const customSimulator = new DataSimulator(customConfig);

      expect(customSimulator.config.businessHoursStart).toBe(8);
      expect(customSimulator.config.businessHoursEnd).toBe(18);
      expect(customSimulator.config.timeZone).toBe('America/New_York');
      expect(customSimulator.config.weekendReduction).toBe(0.5);
      expect(customSimulator.config.anomalyRate).toBe(0.1);
      expect(customSimulator.config.dataPattern).toBe('synthetic');
    });

    test('should initialize patterns and anomaly injector', () => {
      expect(simulator.patterns).toBeDefined();
      expect(simulator.patterns.getBusinessHourMultiplier).toBeDefined();
      expect(simulator.anomalyInjector).toBeDefined();
      expect(simulator.anomalyInjector.shouldInjectAnomaly).toBeDefined();
    });

    test('should initialize time series data map', () => {
      expect(simulator.timeSeriesData).toBeInstanceOf(Map);
      expect(simulator.timeSeriesData.size).toBe(0);
    });
  });

  describe('createTopology', () => {
    test('should create basic topology with default configuration', () => {
      const topologyConfig = {
        provider: 'kafka',
        environment: 'production',
        region: 'us-east-1'
      };

      const topology = simulator.createTopology(topologyConfig);

      expect(topology).toBeDefined();
      expect(topology.metadata.provider).toBe('kafka');
      expect(topology.metadata.environment).toBe('production');
      expect(topology.metadata.region).toBe('us-east-1');
      expect(topology.metadata.createdAt).toBeDefined();
    });

    test('should create correct number of clusters', () => {
      const topologyConfig = {
        clusterCount: 2,
        provider: 'kafka'
      };

      const topology = simulator.createTopology(topologyConfig);

      expect(topology.clusters).toHaveLength(2);
      expect(simulator.entityFactory.createCluster).toHaveBeenCalledTimes(2);
    });

    test('should create correct number of brokers per cluster', () => {
      const topologyConfig = {
        clusterCount: 1,
        brokersPerCluster: 5,
        provider: 'kafka'
      };

      const topology = simulator.createTopology(topologyConfig);

      expect(topology.brokers).toHaveLength(5);
      expect(simulator.entityFactory.createBroker).toHaveBeenCalledTimes(5);
    });

    test('should create correct number of topics per cluster', () => {
      const topologyConfig = {
        clusterCount: 1,
        topicsPerCluster: 15,
        provider: 'kafka'
      };

      const topology = simulator.createTopology(topologyConfig);

      expect(topology.topics).toHaveLength(15);
      expect(simulator.entityFactory.createTopic).toHaveBeenCalledTimes(15);
    });

    test('should create queues for queue-based providers', () => {
      const topologyConfig = {
        clusterCount: 1,
        queuesPerCluster: 10,
        provider: 'rabbitmq'
      };

      const topology = simulator.createTopology(topologyConfig);

      expect(topology.queues).toHaveLength(10);
      expect(simulator.entityFactory.createQueue).toHaveBeenCalledTimes(10);
    });

    test('should not create queues for Kafka', () => {
      const topologyConfig = {
        clusterCount: 1,
        queuesPerCluster: 10,
        provider: 'kafka'
      };

      const topology = simulator.createTopology(topologyConfig);

      expect(topology.queues).toHaveLength(0);
      expect(simulator.entityFactory.createQueue).not.toHaveBeenCalled();
    });

    test('should pass cluster configuration to brokers and topics', () => {
      const topologyConfig = {
        clusterCount: 1,
        brokersPerCluster: 1,
        topicsPerCluster: 1,
        provider: 'kafka',
        clusterConfig: {
          customProperty: 'test'
        }
      };

      const topology = simulator.createTopology(topologyConfig);
      const cluster = topology.clusters[0];

      expect(simulator.entityFactory.createBroker).toHaveBeenCalledWith(
        expect.objectContaining({
          clusterGuid: cluster.guid,
          clusterName: cluster.clusterName
        })
      );

      expect(simulator.entityFactory.createTopic).toHaveBeenCalledWith(
        expect.objectContaining({
          clusterGuid: cluster.guid,
          clusterName: cluster.clusterName
        })
      );
    });

    test('should handle multiple clusters correctly', () => {
      const topologyConfig = {
        clusterCount: 3,
        brokersPerCluster: 2,
        topicsPerCluster: 5,
        provider: 'kafka'
      };

      const topology = simulator.createTopology(topologyConfig);

      expect(topology.clusters).toHaveLength(3);
      expect(topology.brokers).toHaveLength(6); // 3 clusters * 2 brokers
      expect(topology.topics).toHaveLength(15); // 3 clusters * 5 topics
    });
  });

  describe('createCluster', () => {
    test('should create cluster with provided configuration', () => {
      const config = {
        name: 'test-cluster',
        provider: 'kafka',
        region: 'us-west-2',
        environment: 'staging',
        brokerCount: 5
      };

      const cluster = simulator.createCluster(config);

      expect(simulator.entityFactory.createCluster).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-cluster',
          clusterName: 'test-cluster',
          provider: 'kafka',
          region: 'us-west-2',
          environment: 'staging',
          brokerCount: 5
        })
      );
    });

    test('should add default metadata', () => {
      const config = {
        name: 'test-cluster',
        provider: 'kafka'
      };

      simulator.createCluster(config);

      expect(simulator.entityFactory.createCluster).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            deployment: 'kubernetes',
            monitoring: 'enabled',
            backup: 'enabled'
          }
        })
      );
    });

    test('should add default tags', () => {
      const config = {
        name: 'test-cluster',
        provider: 'kafka'
      };

      simulator.createCluster(config);

      expect(simulator.entityFactory.createCluster).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.objectContaining({
            team: 'platform',
            costCenter: 'engineering',
            criticality: 'high'
          })
        })
      );
    });

    test('should use environment variable for accountId if not provided', () => {
      process.env.NEW_RELIC_ACCOUNT_ID = '123456';
      
      const config = {
        name: 'test-cluster',
        provider: 'kafka'
      };

      simulator.createCluster(config);

      expect(simulator.entityFactory.createCluster).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: '123456'
        })
      );
    });
  });

  describe('patterns', () => {
    test('should have business hour multiplier function', () => {
      const multiplier = simulator.patterns.getBusinessHourMultiplier();
      expect(typeof multiplier).toBe('number');
    });

    test('should have seasonal multiplier function', () => {
      const multiplier = simulator.patterns.getSeasonalMultiplier();
      expect(typeof multiplier).toBe('number');
    });
  });

  describe('anomalyInjector', () => {
    test('should inject anomalies based on configured rate', () => {
      const customSimulator = new DataSimulator({ anomalyRate: 1.0 });
      expect(customSimulator.anomalyInjector.shouldInjectAnomaly()).toBe(true);
    });

    test('should not inject anomalies when rate is 0', () => {
      const customSimulator = new DataSimulator({ anomalyRate: 0 });
      expect(customSimulator.anomalyInjector.shouldInjectAnomaly()).toBe(false);
    });

    test('should generate anomaly values within expected range', () => {
      const value = 100;
      const anomalyValue = simulator.anomalyInjector.generateAnomaly(value);
      
      // Anomaly should be between 50% and 250% of original value
      expect(anomalyValue).toBeGreaterThanOrEqual(50);
      expect(anomalyValue).toBeLessThanOrEqual(250);
    });
  });

  describe('helper methods', () => {
    // These would need to be tested if the methods were accessible
    // Currently testing them indirectly through createTopology
    
    test('should generate topic names', () => {
      simulator.generateTopicName = jest.fn().mockReturnValue('test-topic-1');
      
      const topologyConfig = {
        clusterCount: 1,
        topicsPerCluster: 1,
        provider: 'kafka'
      };

      simulator.createTopology(topologyConfig);
      
      // Verify that topic creation was called
      expect(simulator.entityFactory.createTopic).toHaveBeenCalled();
    });

    test('should generate queue names for queue-based providers', () => {
      simulator.generateQueueName = jest.fn().mockReturnValue('test-queue-1');
      
      const topologyConfig = {
        clusterCount: 1,
        queuesPerCluster: 1,
        provider: 'rabbitmq'
      };

      simulator.createTopology(topologyConfig);
      
      // Verify that queue creation was called
      expect(simulator.entityFactory.createQueue).toHaveBeenCalled();
    });
  });

  describe('time series data', () => {
    test('should track start time', () => {
      const beforeTime = Date.now();
      const testSimulator = new DataSimulator();
      const afterTime = Date.now();
      
      expect(testSimulator.startTime).toBeGreaterThanOrEqual(beforeTime);
      expect(testSimulator.startTime).toBeLessThanOrEqual(afterTime);
    });

    test('should initialize empty time series data map', () => {
      expect(simulator.timeSeriesData).toBeInstanceOf(Map);
      expect(simulator.timeSeriesData.size).toBe(0);
    });
  });
});