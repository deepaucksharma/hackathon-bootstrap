/**
 * Integration Tests for Complete Data Pipeline
 * Tests end-to-end data flow from discovery to streaming
 */

const PlatformOrchestrator = require('../../platform-orchestrator');
const { DiscoveryOrchestrator } = require('../../../infrastructure/discovery/discovery-orchestrator');
const { ShimOrchestrator } = require('../../../shim/shim-orchestrator');
const { NewRelicStreamer } = require('../../../simulation/streaming/new-relic-streamer');
const { 
  waitForCondition, 
  PerformanceTracker,
  createMockConfig 
} = require('../helpers/test-utils');
const { infrastructureResources } = require('../fixtures/test-data');

// Mock external API calls
jest.mock('../../../simulation/streaming/new-relic-streamer', () => {
  return {
    NewRelicStreamer: jest.fn().mockImplementation(() => ({
      streamEvents: jest.fn().mockResolvedValue({ success: true }),
      streamMetrics: jest.fn().mockResolvedValue({ success: true }),
      stop: jest.fn()
    }))
  };
});

describe('Data Pipeline Integration', () => {
  let platform;
  let performanceTracker;
  let streamedData;

  beforeEach(() => {
    performanceTracker = new PerformanceTracker();
    streamedData = [];

    // Capture streamed data
    const MockStreamer = NewRelicStreamer.mock.instances[0];
    if (MockStreamer) {
      MockStreamer.streamEvents.mockImplementation(async (events) => {
        streamedData.push(...events);
        return { success: true };
      });
    }

    platform = new PlatformOrchestrator(createMockConfig({
      mode: 'infrastructure'
    }));
  });

  afterEach(async () => {
    await platform.stop();
    jest.clearAllMocks();
  });

  describe('infrastructure mode pipeline', () => {
    test('should complete full pipeline from discovery to streaming', async () => {
      performanceTracker.start('fullPipeline');
      
      await platform.start();

      // Simulate infrastructure discovery
      const discoveryOrchestrator = platform.discoveryOrchestrator;
      discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'docker',
        resources: infrastructureResources.docker
      });

      // Wait for data to be processed and streamed
      await waitForCondition(() => streamedData.length > 0, {
        timeout: 5000,
        message: 'Data not streamed within timeout'
      });

      const pipelineTime = performanceTracker.end('fullPipeline');

      // Verify the complete pipeline
      expect(streamedData).toHaveLength(infrastructureResources.docker.length);
      expect(streamedData[0]).toMatchObject({
        entityType: expect.stringMatching(/^MESSAGE_QUEUE_/),
        guid: expect.any(String),
        provider: expect.any(String),
        metrics: expect.any(Object)
      });

      // Performance check: Complete pipeline should be under 500ms
      expect(pipelineTime).toBeLessThan(500);
    });

    test('should transform docker resources correctly', async () => {
      await platform.start();

      const kafkaResource = infrastructureResources.docker[0]; // Kafka container
      
      discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'docker',
        resources: [kafkaResource]
      });

      await waitForCondition(() => streamedData.length > 0);

      const transformed = streamedData[0];
      expect(transformed).toMatchObject({
        entityType: 'MESSAGE_QUEUE_BROKER',
        guid: expect.stringMatching(/^MQB_/),
        name: 'kafka-broker-1',
        provider: 'kafka',
        metadata: {
          dockerId: 'container-1',
          image: 'confluentinc/cp-kafka:7.0.1'
        }
      });
    });

    test('should handle kubernetes resources', async () => {
      await platform.start();

      discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'kubernetes',
        resources: infrastructureResources.kubernetes
      });

      await waitForCondition(() => streamedData.length > 0);

      const transformed = streamedData[0];
      expect(transformed).toMatchObject({
        entityType: 'MESSAGE_QUEUE_BROKER',
        provider: 'kafka',
        metadata: {
          k8sNamespace: 'messaging',
          k8sPod: 'kafka-0'
        }
      });
    });
  });

  describe('hybrid mode pipeline', () => {
    test('should merge simulation and infrastructure data', async () => {
      // Reconfigure for hybrid mode
      await platform.stop();
      platform = new PlatformOrchestrator(createMockConfig({
        mode: 'hybrid'
      }));
      
      await platform.start();

      // Generate simulation data
      const simulator = platform.dataSimulator;
      simulator.emit('dataGenerated', {
        type: 'simulation',
        entities: [{
          entityType: 'MESSAGE_QUEUE_CLUSTER',
          guid: 'MQC_sim_cluster',
          provider: 'kafka',
          metrics: { 'mq.cluster.health': 100 }
        }]
      });

      // Discover infrastructure
      discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'docker',
        resources: infrastructureResources.docker.slice(0, 1)
      });

      await waitForCondition(() => streamedData.length >= 2);

      // Should have both simulation and infrastructure data
      const simulationEntity = streamedData.find(e => e.guid === 'MQC_sim_cluster');
      const infrastructureEntity = streamedData.find(e => e.guid !== 'MQC_sim_cluster');

      expect(simulationEntity).toBeDefined();
      expect(infrastructureEntity).toBeDefined();
      expect(simulationEntity.provider).toBe('kafka');
      expect(infrastructureEntity.metadata.dockerId).toBeDefined();
    });

    test('should deduplicate entities across modes', async () => {
      await platform.stop();
      platform = new PlatformOrchestrator(createMockConfig({
        mode: 'hybrid',
        deduplication: { enabled: true }
      }));
      
      await platform.start();

      // Create matching entities in both modes
      const sharedGuid = 'MQC_kafka_prod';
      
      simulator.emit('dataGenerated', {
        type: 'simulation',
        entities: [{
          entityType: 'MESSAGE_QUEUE_CLUSTER',
          guid: sharedGuid,
          provider: 'kafka',
          metrics: { 'mq.cluster.health': 95 }
        }]
      });

      // Mock SHIM to generate same GUID
      const shimOrchestrator = platform.shimOrchestrator;
      shimOrchestrator.transform = jest.fn().mockResolvedValue([{
        entityType: 'MESSAGE_QUEUE_CLUSTER',
        guid: sharedGuid,
        provider: 'kafka',
        metrics: { 'mq.cluster.health': 98 }
      }]);

      discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'docker',
        resources: [infrastructureResources.docker[0]]
      });

      await waitForCondition(() => streamedData.length > 0);

      // Should only have one entity with merged data
      const entities = streamedData.filter(e => e.guid === sharedGuid);
      expect(entities).toHaveLength(1);
      
      // Infrastructure data should take precedence
      expect(entities[0].metrics['mq.cluster.health']).toBe(98);
    });
  });

  describe('error handling in pipeline', () => {
    test('should handle discovery errors gracefully', async () => {
      const errorHandler = jest.fn();
      platform.on('error', errorHandler);

      await platform.start();

      // Emit error from discovery
      discoveryOrchestrator.emit('error', new Error('Discovery failed'));

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        component: 'discoveryOrchestrator',
        error: expect.objectContaining({ message: 'Discovery failed' })
      }));

      // Platform should continue running
      expect(platform.state).toBe('running');
    });

    test('should handle transformation errors', async () => {
      await platform.start();

      // Mock SHIM error
      const shimOrchestrator = platform.shimOrchestrator;
      shimOrchestrator.transform = jest.fn().mockRejectedValue(
        new Error('Transformation failed')
      );

      discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'docker',
        resources: infrastructureResources.docker
      });

      // Give time for error handling
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not crash, no data streamed
      expect(streamedData).toHaveLength(0);
      expect(platform.state).toBe('running');
    });

    test('should handle streaming errors with retry', async () => {
      await platform.start();

      // Mock streaming failure then success
      const MockStreamer = NewRelicStreamer.mock.instances[0];
      MockStreamer.streamEvents
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ success: true });

      discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'docker',
        resources: [infrastructureResources.docker[0]]
      });

      await waitForCondition(() => streamedData.length > 0, {
        timeout: 10000 // Allow time for retry
      });

      expect(streamedData).toHaveLength(1);
      expect(MockStreamer.streamEvents).toHaveBeenCalledTimes(2);
    });
  });

  describe('performance requirements', () => {
    test('should meet transformation latency requirement (<100ms)', async () => {
      await platform.start();

      const resourceCount = 10;
      const resources = Array(resourceCount).fill(infrastructureResources.docker[0]);

      performanceTracker.start('transformation');
      
      discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'docker',
        resources
      });

      await waitForCondition(() => streamedData.length === resourceCount);
      
      const latency = performanceTracker.end('transformation');
      const avgLatency = latency / resourceCount;

      expect(avgLatency).toBeLessThan(100);
    });

    test('should handle high-volume discovery', async () => {
      await platform.start();

      performanceTracker.start('highVolume');

      // Simulate discovery of 100 resources
      const largeResourceSet = [];
      for (let i = 0; i < 100; i++) {
        largeResourceSet.push({
          ...infrastructureResources.docker[0],
          id: `container-${i}`,
          name: `kafka-broker-${i}`
        });
      }

      discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'docker',
        resources: largeResourceSet
      });

      await waitForCondition(() => streamedData.length === 100, {
        timeout: 10000
      });

      const duration = performanceTracker.end('highVolume');

      // Should process 100 resources in under 5 seconds
      expect(duration).toBeLessThan(5000);
      expect(streamedData).toHaveLength(100);
    });

    test('should maintain memory efficiency', async () => {
      await platform.start();

      const initialMemory = process.memoryUsage().heapUsed;

      // Process large batch
      const resources = Array(500).fill(infrastructureResources.docker[0])
        .map((r, i) => ({ ...r, id: `container-${i}` }));

      discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'docker',
        resources
      });

      await waitForCondition(() => streamedData.length === 500, {
        timeout: 30000
      });

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      // Memory increase should be reasonable for 500 resources
      expect(memoryIncrease).toBeLessThan(100); // Less than 100MB
    });
  });

  describe('data consistency', () => {
    test('should maintain data integrity through pipeline', async () => {
      await platform.start();

      const testResource = {
        ...infrastructureResources.docker[0],
        metadata: {
          ...infrastructureResources.docker[0].metadata,
          customField: 'test-value',
          numericField: 12345
        }
      };

      discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'docker',
        resources: [testResource]
      });

      await waitForCondition(() => streamedData.length > 0);

      const result = streamedData[0];
      
      // Verify data integrity
      expect(result.metadata.customField).toBe('test-value');
      expect(result.metadata.numericField).toBe(12345);
      expect(result.provider).toBe('kafka');
      expect(result.entityType).toBeDefined();
    });

    test('should preserve metric precision', async () => {
      await platform.start();

      // Mock SHIM to return precise metrics
      const shimOrchestrator = platform.shimOrchestrator;
      shimOrchestrator.transform = jest.fn().mockResolvedValue([{
        entityType: 'MESSAGE_QUEUE_CLUSTER',
        guid: 'MQC_test',
        provider: 'kafka',
        metrics: {
          'mq.cluster.throughput': 12345.6789,
          'mq.cluster.latency': 0.123456,
          'mq.cluster.availability': 99.999
        }
      }]);

      discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'docker',
        resources: [infrastructureResources.docker[0]]
      });

      await waitForCondition(() => streamedData.length > 0);

      const metrics = streamedData[0].metrics;
      expect(metrics['mq.cluster.throughput']).toBe(12345.6789);
      expect(metrics['mq.cluster.latency']).toBe(0.123456);
      expect(metrics['mq.cluster.availability']).toBe(99.999);
    });
  });

  describe('mode transitions during operation', () => {
    test('should handle mode switch without data loss', async () => {
      // Start in simulation mode
      await platform.stop();
      platform = new PlatformOrchestrator(createMockConfig({
        mode: 'simulation'
      }));
      
      await platform.start();

      // Generate simulation data
      simulator.emit('dataGenerated', {
        type: 'simulation',
        entities: Array(5).fill(null).map((_, i) => ({
          entityType: 'MESSAGE_QUEUE_CLUSTER',
          guid: `MQC_sim_${i}`,
          provider: 'kafka',
          metrics: { 'mq.cluster.health': 100 }
        }))
      });

      await waitForCondition(() => streamedData.length === 5);

      // Switch to infrastructure mode
      await platform.modeController.setMode('infrastructure');

      // Discover infrastructure
      discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'docker',
        resources: infrastructureResources.docker
      });

      await waitForCondition(() => streamedData.length === 7); // 5 sim + 2 infra

      // Verify both data sets were processed
      const simData = streamedData.filter(e => e.guid.startsWith('MQC_sim_'));
      const infraData = streamedData.filter(e => !e.guid.startsWith('MQC_sim_'));

      expect(simData).toHaveLength(5);
      expect(infraData).toHaveLength(2);
    });
  });
});