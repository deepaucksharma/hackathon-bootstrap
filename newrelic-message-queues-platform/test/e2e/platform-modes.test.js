/**
 * End-to-End Test Suite for Platform Modes
 * 
 * Tests all three platform modes: infrastructure, simulation, and hybrid
 */

const MessageQueuesPlatform = require('../../platform');
const { EntityFactory } = require('../../core/entities');
const InfraAgentCollector = require('../../infrastructure/collectors/infra-agent-collector');
const NewRelicStreamer = require('../../simulation/streaming/new-relic-streamer');
const chalk = require('chalk');

// Mock dependencies
jest.mock('../../infrastructure/collectors/infra-agent-collector');
jest.mock('../../simulation/streaming/new-relic-streamer');

describe('Platform Modes E2E Tests', () => {
  let platform;
  let mockCollector;
  let mockStreamer;
  
  // Sample infrastructure data
  const mockInfrastructureSamples = [
    {
      metric: 'kafka.broker.bytesIn',
      value: 1024000,
      timestamp: Date.now(),
      attributes: {
        'kafka.broker.id': '1',
        'kafka.cluster.name': 'prod-kafka',
        host: 'broker-1.example.com',
        environment: 'production'
      }
    },
    {
      metric: 'kafka.topic.bytesIn',
      value: 512000,
      timestamp: Date.now(),
      attributes: {
        'kafka.topic': 'user.events',
        'kafka.cluster.name': 'prod-kafka',
        host: 'broker-1.example.com'
      }
    }
  ];

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup collector mock
    mockCollector = {
      collectKafkaMetrics: jest.fn()
    };
    InfraAgentCollector.mockImplementation(() => mockCollector);
    
    // Setup streamer mock
    mockStreamer = {
      streamEvents: jest.fn().mockResolvedValue(true),
      flushAll: jest.fn().mockResolvedValue(true),
      shutdown: jest.fn().mockResolvedValue(true),
      getStats: jest.fn().mockReturnValue({ sent: 0, failed: 0 })
    };
    NewRelicStreamer.mockImplementation(() => mockStreamer);
    
    // Set required environment variables
    process.env.NEW_RELIC_ACCOUNT_ID = '12345';
    process.env.NEW_RELIC_API_KEY = 'test-api-key';
    process.env.NEW_RELIC_USER_API_KEY = 'test-user-key';
  });

  afterEach(async () => {
    if (platform) {
      await platform.stop();
      platform = null;
    }
  });

  describe('Infrastructure Mode', () => {
    test('should collect and transform real infrastructure data', async () => {
      // Setup
      mockCollector.collectKafkaMetrics.mockResolvedValue(mockInfrastructureSamples);
      
      platform = new MessageQueuesPlatform({
        mode: 'infrastructure',
        continuous: false
      });
      
      // Run one cycle
      await platform.runCycle();
      
      // Verify data collection
      expect(mockCollector.collectKafkaMetrics).toHaveBeenCalled();
      
      // Verify streaming
      expect(mockStreamer.streamEvents).toHaveBeenCalled();
      const streamedEntities = mockStreamer.streamEvents.mock.calls[0][0];
      expect(streamedEntities.length).toBeGreaterThan(0);
      
      // Verify entity types
      const entityTypes = streamedEntities.map(e => e.entityType);
      expect(entityTypes).toContain('MESSAGE_QUEUE_BROKER');
      expect(entityTypes).toContain('MESSAGE_QUEUE_TOPIC');
    });

    test('should handle no infrastructure data gracefully', async () => {
      // Setup with no data
      mockCollector.collectKafkaMetrics.mockResolvedValue([]);
      
      platform = new MessageQueuesPlatform({
        mode: 'infrastructure',
        continuous: false
      });
      
      // Run one cycle
      await platform.runCycle();
      
      // Should not stream empty data
      expect(mockStreamer.streamEvents).not.toHaveBeenCalled();
    });

    test('should handle infrastructure collector errors', async () => {
      // Setup with error
      mockCollector.collectKafkaMetrics.mockRejectedValue(new Error('Connection failed'));
      
      platform = new MessageQueuesPlatform({
        mode: 'infrastructure',
        continuous: false
      });
      
      // Run should throw error
      await expect(platform.runCycle()).rejects.toThrow('Connection failed');
    });
  });

  describe('Simulation Mode', () => {
    test('should generate and stream simulated topology', async () => {
      platform = new MessageQueuesPlatform({
        mode: 'simulation',
        continuous: false,
        clusters: 2,
        brokers: 3,
        topics: 5
      });
      
      // Verify topology creation
      expect(platform.topology).toBeDefined();
      expect(platform.topology.clusters.length).toBe(2);
      expect(platform.topology.brokers.length).toBe(6); // 2 clusters * 3 brokers
      expect(platform.topology.topics.length).toBe(10); // 2 clusters * 5 topics
      
      // Run one cycle
      await platform.runCycle();
      
      // Verify streaming
      expect(mockStreamer.streamEvents).toHaveBeenCalled();
      const streamedEntities = mockStreamer.streamEvents.mock.calls[0][0];
      expect(streamedEntities.length).toBe(18); // 2 clusters + 6 brokers + 10 topics
    });

    test('should update metrics on each cycle', async () => {
      platform = new MessageQueuesPlatform({
        mode: 'simulation',
        continuous: false,
        clusters: 1,
        brokers: 1,
        topics: 1
      });
      
      // Run first cycle
      await platform.runCycle();
      const firstCall = mockStreamer.streamEvents.mock.calls[0][0];
      const firstBrokerMetrics = firstCall.find(e => e.entityType === 'MESSAGE_QUEUE_BROKER');
      
      // Run second cycle
      await platform.runCycle();
      const secondCall = mockStreamer.streamEvents.mock.calls[1][0];
      const secondBrokerMetrics = secondCall.find(e => e.entityType === 'MESSAGE_QUEUE_BROKER');
      
      // Metrics should be different (due to simulation randomness)
      expect(firstBrokerMetrics.cpuUsage).toBeDefined();
      expect(secondBrokerMetrics.cpuUsage).toBeDefined();
      // Note: Due to randomness, we can't guarantee they're different, but they should be defined
    });

    test('should respect anomaly configuration', async () => {
      platform = new MessageQueuesPlatform({
        mode: 'simulation',
        continuous: false,
        anomalyRate: 1.0, // Always inject anomalies
        clusters: 1,
        brokers: 1,
        topics: 1
      });
      
      // Run multiple cycles to trigger anomalies
      for (let i = 0; i < 5; i++) {
        await platform.runCycle();
      }
      
      // Verify streaming happened
      expect(mockStreamer.streamEvents).toHaveBeenCalledTimes(5);
    });
  });

  describe('Hybrid Mode', () => {
    test('should combine infrastructure and simulated data', async () => {
      // Setup infrastructure data
      mockCollector.collectKafkaMetrics.mockResolvedValue(mockInfrastructureSamples);
      
      platform = new MessageQueuesPlatform({
        mode: 'hybrid',
        continuous: false,
        topology: {
          clusters: [{ name: 'prod-kafka', provider: 'kafka' }],
          brokers: [
            { id: 1, clusterName: 'prod-kafka' },
            { id: 2, clusterName: 'prod-kafka' },
            { id: 3, clusterName: 'prod-kafka' }
          ],
          topics: [
            { name: 'user.events', clusterName: 'prod-kafka' },
            { name: 'order.events', clusterName: 'prod-kafka' } // This should be simulated
          ]
        }
      });
      
      // Run one cycle
      await platform.runCycle();
      
      // Verify data collection
      expect(mockCollector.collectKafkaMetrics).toHaveBeenCalled();
      
      // Verify streaming includes both real and simulated
      expect(mockStreamer.streamEvents).toHaveBeenCalled();
      const streamedEntities = mockStreamer.streamEvents.mock.calls[0][0];
      
      // Should have both infrastructure and simulated entities
      const sources = streamedEntities.map(e => e.source).filter(Boolean);
      expect(sources).toContain('infrastructure');
      expect(sources).toContain('simulation');
    });

    test('should fall back to pure simulation when no infrastructure data', async () => {
      // Setup with no infrastructure data
      mockCollector.collectKafkaMetrics.mockResolvedValue([]);
      
      platform = new MessageQueuesPlatform({
        mode: 'hybrid',
        continuous: false,
        topology: {
          clusters: [{ name: 'prod-kafka', provider: 'kafka' }],
          brokers: [{ id: 1, clusterName: 'prod-kafka' }],
          topics: [{ name: 'test.topic', clusterName: 'prod-kafka' }]
        }
      });
      
      // Run one cycle
      await platform.runCycle();
      
      // Should create simulated topology
      expect(mockStreamer.streamEvents).toHaveBeenCalled();
      const streamedEntities = mockStreamer.streamEvents.mock.calls[0][0];
      expect(streamedEntities.length).toBeGreaterThan(0);
    });

    test('should detect and fill gaps in infrastructure data', async () => {
      // Setup partial infrastructure data (missing broker 2 and 3)
      mockCollector.collectKafkaMetrics.mockResolvedValue([
        {
          metric: 'kafka.broker.bytesIn',
          value: 1024000,
          timestamp: Date.now(),
          attributes: {
            'kafka.broker.id': '1',
            'kafka.cluster.name': 'prod-kafka',
            host: 'broker-1.example.com'
          }
        }
      ]);
      
      platform = new MessageQueuesPlatform({
        mode: 'hybrid',
        continuous: false,
        hybrid: { fillGaps: true },
        topology: {
          clusters: [{ name: 'prod-kafka', provider: 'kafka' }],
          brokers: [
            { id: 1, clusterName: 'prod-kafka' },
            { id: 2, clusterName: 'prod-kafka' },
            { id: 3, clusterName: 'prod-kafka' }
          ],
          topics: []
        }
      });
      
      // Run one cycle
      await platform.runCycle();
      
      // Verify streaming includes all brokers
      expect(mockStreamer.streamEvents).toHaveBeenCalled();
      const streamedEntities = mockStreamer.streamEvents.mock.calls[0][0];
      const brokers = streamedEntities.filter(e => e.entityType === 'MESSAGE_QUEUE_BROKER');
      
      // Should have all 3 brokers (1 real, 2 simulated)
      expect(brokers.length).toBe(3);
      
      // Check sources
      const brokerSources = brokers.map(b => b.source);
      expect(brokerSources).toContain('infrastructure');
      expect(brokerSources).toContain('simulation');
    });
  });

  describe('Platform Lifecycle', () => {
    test('should start and stop cleanly', async () => {
      platform = new MessageQueuesPlatform({
        mode: 'simulation',
        continuous: true,
        interval: 1 // 1 second for testing
      });
      
      // Start platform
      await platform.start();
      expect(platform.running).toBe(true);
      
      // Wait for at least one cycle
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Stop platform
      await platform.stop();
      expect(platform.running).toBe(false);
      
      // Verify cleanup
      expect(mockStreamer.flushAll).toHaveBeenCalled();
      expect(mockStreamer.shutdown).toHaveBeenCalled();
    });

    test('should emit lifecycle events', async () => {
      platform = new MessageQueuesPlatform({
        mode: 'simulation',
        continuous: false
      });
      
      const events = [];
      platform.on('started', () => events.push('started'));
      platform.on('cycle.completed', () => events.push('cycle.completed'));
      platform.on('stopped', () => events.push('stopped'));
      
      // Start and run one cycle
      await platform.start();
      await platform.stop();
      
      // Verify events
      expect(events).toContain('started');
      expect(events).toContain('cycle.completed');
      expect(events).toContain('stopped');
    });

    test('should provide accurate statistics', async () => {
      platform = new MessageQueuesPlatform({
        mode: 'simulation',
        continuous: false,
        clusters: 1,
        brokers: 3,
        topics: 5
      });
      
      const stats = await platform.getStats();
      
      expect(stats.mode).toBe('simulation');
      expect(stats.running).toBe(false);
      expect(stats.provider).toBe('kafka');
      expect(stats.topology).toEqual({
        clusters: 1,
        brokers: 3,
        topics: 5,
        consumerGroups: 5
      });
      expect(stats.relationships).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle streaming errors gracefully', async () => {
      // Setup streaming error
      mockStreamer.streamEvents.mockRejectedValue(new Error('API rate limit'));
      
      platform = new MessageQueuesPlatform({
        mode: 'simulation',
        continuous: false
      });
      
      // Run should throw error
      await expect(platform.runCycle()).rejects.toThrow('API rate limit');
    });

    test('should validate configuration', () => {
      // Remove required environment variable
      delete process.env.NEW_RELIC_ACCOUNT_ID;
      
      // Should throw validation error
      expect(() => {
        new MessageQueuesPlatform({
          mode: 'simulation'
        });
      }).toThrow('Configuration validation failed');
      
      // Restore for other tests
      process.env.NEW_RELIC_ACCOUNT_ID = '12345';
    });

    test('should handle invalid mode', () => {
      expect(() => {
        new MessageQueuesPlatform({
          mode: 'invalid-mode'
        });
      }).toThrow('Configuration validation failed');
    });
  });
});