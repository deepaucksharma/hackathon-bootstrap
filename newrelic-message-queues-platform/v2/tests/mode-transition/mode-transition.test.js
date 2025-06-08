/**
 * Mode Transition Tests
 * Tests seamless switching between simulation, infrastructure, and hybrid modes
 */

const PlatformOrchestrator = require('../../platform-orchestrator');
const { 
  waitForCondition, 
  createMockConfig,
  PerformanceTracker 
} = require('../helpers/test-utils');
const { 
  infrastructureResources, 
  testEntities,
  modeConfigurations 
} = require('../fixtures/test-data');

// Track all streamed data
let streamedData = [];

jest.mock('../../../simulation/streaming/new-relic-streamer', () => {
  return {
    NewRelicStreamer: jest.fn().mockImplementation(() => ({
      streamEvents: jest.fn().mockImplementation(async (events) => {
        streamedData.push(...events);
        return { success: true };
      }),
      streamMetrics: jest.fn().mockResolvedValue({ success: true }),
      stop: jest.fn()
    }))
  };
});

describe('Mode Transition Tests', () => {
  let platform;
  let performanceTracker;

  beforeEach(() => {
    streamedData = [];
    performanceTracker = new PerformanceTracker();
    platform = new PlatformOrchestrator(createMockConfig({
      mode: 'simulation'
    }));
  });

  afterEach(async () => {
    await platform.stop();
  });

  describe('basic mode transitions', () => {
    test('should transition from simulation to infrastructure mode', async () => {
      await platform.start();
      
      // Verify initial state
      expect(platform.modeController.getMode()).toBe('simulation');
      expect(platform.dataSimulator.isActive).toBe(true);
      expect(platform.discoveryOrchestrator.isDiscovering).toBe(false);

      // Generate some simulation data
      platform.dataSimulator.emit('dataGenerated', {
        type: 'simulation',
        entities: [testEntities.kafkaCluster]
      });

      await waitForCondition(() => streamedData.length > 0);
      const simDataCount = streamedData.length;

      // Transition to infrastructure mode
      performanceTracker.start('modeTransition');
      await platform.modeController.setMode('infrastructure');
      const transitionTime = performanceTracker.end('modeTransition');

      // Verify mode change
      expect(platform.modeController.getMode()).toBe('infrastructure');
      expect(platform.dataSimulator.isActive).toBe(false);
      expect(platform.discoveryOrchestrator.isDiscovering).toBe(true);
      expect(transitionTime).toBeLessThan(500); // Fast transition

      // Generate infrastructure data
      platform.discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'docker',
        resources: infrastructureResources.docker
      });

      await waitForCondition(() => streamedData.length > simDataCount);
      
      // Verify both data types were processed
      const simData = streamedData.slice(0, simDataCount);
      const infraData = streamedData.slice(simDataCount);
      
      expect(simData[0].provider).toBe('kafka');
      expect(infraData.length).toBeGreaterThan(0);
    });

    test('should transition from infrastructure to hybrid mode', async () => {
      // Start in infrastructure mode
      await platform.stop();
      platform = new PlatformOrchestrator(createMockConfig({
        mode: 'infrastructure'
      }));
      await platform.start();

      // Generate infrastructure data
      platform.discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'kubernetes',
        resources: infrastructureResources.kubernetes
      });

      await waitForCondition(() => streamedData.length > 0);
      const infraOnlyCount = streamedData.length;

      // Transition to hybrid mode
      await platform.modeController.setMode('hybrid');

      expect(platform.modeController.getMode()).toBe('hybrid');
      expect(platform.dataSimulator.isActive).toBe(true);
      expect(platform.discoveryOrchestrator.isDiscovering).toBe(true);

      // Generate both types of data
      platform.dataSimulator.emit('dataGenerated', {
        type: 'simulation',
        entities: [testEntities.rabbitmqCluster]
      });

      platform.discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'docker',
        resources: [infrastructureResources.docker[1]] // RabbitMQ container
      });

      await waitForCondition(() => streamedData.length >= infraOnlyCount + 2);

      // Should have data from both sources
      const newData = streamedData.slice(infraOnlyCount);
      const providers = new Set(newData.map(d => d.provider));
      expect(providers.has('rabbitmq')).toBe(true);
    });

    test('should transition from hybrid to simulation mode', async () => {
      // Start in hybrid mode
      await platform.stop();
      platform = new PlatformOrchestrator(createMockConfig({
        mode: 'hybrid'
      }));
      await platform.start();

      // Verify both components are active
      expect(platform.dataSimulator.isActive).toBe(true);
      expect(platform.discoveryOrchestrator.isDiscovering).toBe(true);

      // Transition to simulation only
      await platform.modeController.setMode('simulation');

      expect(platform.modeController.getMode()).toBe('simulation');
      expect(platform.dataSimulator.isActive).toBe(true);
      expect(platform.discoveryOrchestrator.isDiscovering).toBe(false);

      // Only simulation data should be generated now
      platform.dataSimulator.emit('dataGenerated', {
        type: 'simulation',
        entities: [testEntities.kafkaBroker]
      });

      // Infrastructure discovery should be ignored
      platform.discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'docker',
        resources: infrastructureResources.docker
      });

      await waitForCondition(() => streamedData.length === 1);

      // Only simulation data should be processed
      expect(streamedData).toHaveLength(1);
      expect(streamedData[0].entityType).toBe('MESSAGE_QUEUE_BROKER');
    });
  });

  describe('data continuity during transitions', () => {
    test('should not lose data during mode transitions', async () => {
      await platform.start();

      const dataBeforeTransition = [];
      const dataAfterTransition = [];

      // Generate continuous simulation data
      const dataInterval = setInterval(() => {
        platform.dataSimulator.emit('dataGenerated', {
          type: 'simulation',
          entities: [{
            ...testEntities.kafkaCluster,
            timestamp: Date.now(),
            metrics: {
              'mq.cluster.throughput': Math.random() * 1000
            }
          }]
        });
      }, 100);

      // Collect data for 500ms
      await new Promise(resolve => setTimeout(resolve, 500));
      dataBeforeTransition.push(...streamedData);

      // Transition during data generation
      await platform.modeController.setMode('infrastructure');

      // Continue for another 500ms
      await new Promise(resolve => setTimeout(resolve, 500));
      clearInterval(dataInterval);

      dataAfterTransition.push(...streamedData.slice(dataBeforeTransition.length));

      // Should have data from before transition
      expect(dataBeforeTransition.length).toBeGreaterThan(0);
      
      // Check for any gaps in timestamps
      const allData = [...dataBeforeTransition, ...dataAfterTransition];
      const timestamps = allData.map(d => d.timestamp).sort();
      
      for (let i = 1; i < timestamps.length; i++) {
        const gap = timestamps[i] - timestamps[i-1];
        expect(gap).toBeLessThan(200); // No large gaps
      }
    });

    test('should handle in-flight data during transitions', async () => {
      await platform.start();

      // Create a large batch that takes time to process
      const largeBatch = Array(1000).fill(null).map((_, i) => ({
        ...testEntities.kafkaCluster,
        guid: `MQC_test_${i}`,
        timestamp: Date.now()
      }));

      // Start streaming the large batch
      const streamPromise = platform.streamingOrchestrator.stream({
        type: 'events',
        data: largeBatch
      });

      // Immediately start mode transition
      const transitionPromise = platform.modeController.setMode('infrastructure');

      // Both should complete successfully
      await Promise.all([streamPromise, transitionPromise]);

      // All data should be processed
      expect(streamedData.length).toBe(1000);
      expect(platform.modeController.getMode()).toBe('infrastructure');
    });
  });

  describe('component state management', () => {
    test('should properly start and stop components', async () => {
      await platform.start();

      const componentStates = [];

      // Track component state changes
      platform.on('componentStateChange', (state) => {
        componentStates.push({
          ...state,
          timestamp: Date.now()
        });
      });

      // Cycle through all modes
      const modes = ['infrastructure', 'hybrid', 'simulation'];
      
      for (const mode of modes) {
        await platform.modeController.setMode(mode);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Verify component states align with modes
      const finalStates = componentStates.filter(s => s.mode === 'simulation').pop();
      expect(finalStates.components.simulation).toBe('active');
      expect(finalStates.components.infrastructure).toBe('inactive');
    });

    test('should handle component failures during transitions', async () => {
      await platform.start();

      // Mock discovery failure
      platform.discoveryOrchestrator.startDiscovery = jest.fn().mockRejectedValue(
        new Error('Discovery initialization failed')
      );

      // Attempt transition to infrastructure mode
      await expect(
        platform.modeController.setMode('infrastructure')
      ).rejects.toThrow();

      // Should rollback to previous mode
      expect(platform.modeController.getMode()).toBe('simulation');
      expect(platform.dataSimulator.isActive).toBe(true);
    });
  });

  describe('configuration preservation', () => {
    test('should preserve component configurations across transitions', async () => {
      await platform.start();

      // Set custom configuration
      const customConfig = {
        simulation: {
          interval: 5000,
          providers: ['kafka', 'rabbitmq', 'sqs']
        },
        infrastructure: {
          discoveryInterval: 60000,
          providers: ['docker', 'kubernetes']
        }
      };

      platform.updateConfig(customConfig);

      // Transition through modes
      await platform.modeController.setMode('infrastructure');
      await platform.modeController.setMode('hybrid');
      await platform.modeController.setMode('simulation');

      // Configuration should be preserved
      expect(platform.config.simulation).toEqual(customConfig.simulation);
      expect(platform.config.infrastructure).toEqual(customConfig.infrastructure);
    });
  });

  describe('event handling during transitions', () => {
    test('should emit proper transition events', async () => {
      await platform.start();

      const transitionEvents = [];
      
      platform.on('modeTransition', (event) => {
        transitionEvents.push(event);
      });

      // Perform multiple transitions
      await platform.modeController.setMode('infrastructure');
      await platform.modeController.setMode('hybrid');
      await platform.modeController.setMode('simulation');

      expect(transitionEvents).toHaveLength(3);
      
      // Verify transition details
      expect(transitionEvents[0]).toMatchObject({
        from: 'simulation',
        to: 'infrastructure',
        components: {
          started: ['discovery'],
          stopped: ['simulation']
        }
      });

      expect(transitionEvents[1]).toMatchObject({
        from: 'infrastructure',
        to: 'hybrid',
        components: {
          started: ['simulation'],
          stopped: []
        }
      });
    });

    test('should handle rapid mode switches', async () => {
      await platform.start();

      const rapidSwitches = async () => {
        for (let i = 0; i < 10; i++) {
          const mode = i % 3 === 0 ? 'simulation' : 
                       i % 3 === 1 ? 'infrastructure' : 'hybrid';
          await platform.modeController.setMode(mode);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      };

      await expect(rapidSwitches()).resolves.not.toThrow();
      
      // Platform should still be functional
      expect(platform.state).toBe('running');
      
      // Final mode should be deterministic
      expect(['simulation', 'infrastructure', 'hybrid']).toContain(
        platform.modeController.getMode()
      );
    });
  });

  describe('hybrid mode data merging', () => {
    test('should properly merge data sources in hybrid mode', async () => {
      // Start in hybrid mode
      await platform.stop();
      platform = new PlatformOrchestrator(createMockConfig({
        mode: 'hybrid'
      }));
      await platform.start();

      // Generate simulation data for Kafka
      platform.dataSimulator.emit('dataGenerated', {
        type: 'simulation',
        entities: [{
          ...testEntities.kafkaCluster,
          metrics: {
            'mq.cluster.health': 95,
            'mq.cluster.throughput': 5000
          }
        }]
      });

      // Discover real Kafka infrastructure
      platform.discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'docker',
        resources: [infrastructureResources.docker[0]] // Kafka container
      });

      await waitForCondition(() => streamedData.length >= 2);

      // Should have both simulated and real data
      const kafkaEntities = streamedData.filter(e => e.provider === 'kafka');
      expect(kafkaEntities).toHaveLength(2);
      
      // Different sources should have different characteristics
      const simEntity = kafkaEntities.find(e => e.guid === testEntities.kafkaCluster.guid);
      const realEntity = kafkaEntities.find(e => e.guid !== testEntities.kafkaCluster.guid);
      
      expect(simEntity).toBeDefined();
      expect(realEntity).toBeDefined();
      expect(realEntity.metadata.dockerId).toBeDefined();
    });

    test('should handle mode transitions while processing hybrid data', async () => {
      // Start in hybrid mode
      await platform.stop();
      platform = new PlatformOrchestrator(createMockConfig({
        mode: 'hybrid'
      }));
      await platform.start();

      // Start generating both types of data
      const simInterval = setInterval(() => {
        platform.dataSimulator.emit('dataGenerated', {
          type: 'simulation',
          entities: [{ ...testEntities.kafkaCluster, timestamp: Date.now() }]
        });
      }, 100);

      const discoveryInterval = setInterval(() => {
        platform.discoveryOrchestrator.emit('resourcesDiscovered', {
          provider: 'docker',
          resources: infrastructureResources.docker
        });
      }, 200);

      // Let it run for a bit
      await new Promise(resolve => setTimeout(resolve, 500));

      // Transition to infrastructure only
      await platform.modeController.setMode('infrastructure');

      // Continue for a bit more
      await new Promise(resolve => setTimeout(resolve, 500));

      clearInterval(simInterval);
      clearInterval(discoveryInterval);

      // Data should transition smoothly
      const dataBeforeModeChange = streamedData.filter(d => d.timestamp < platform.modeTransitionTimestamp);
      const dataAfterModeChange = streamedData.filter(d => d.timestamp >= platform.modeTransitionTimestamp);

      // Before: should have both types
      const beforeProviders = new Set(dataBeforeModeChange.map(d => d.source || 'unknown'));
      expect(beforeProviders.size).toBe(2); // simulation and infrastructure

      // After: should only have infrastructure
      const afterSources = new Set(dataAfterModeChange.map(d => d.source || 'infrastructure'));
      expect(afterSources.has('simulation')).toBe(false);
    });
  });

  describe('error recovery during transitions', () => {
    test('should recover from transition failures', async () => {
      await platform.start();

      let attemptCount = 0;
      
      // Mock mode controller to fail first attempt
      const originalSetMode = platform.modeController.setMode;
      platform.modeController.setMode = jest.fn().mockImplementation(async (mode) => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('Transition failed');
        }
        return originalSetMode.call(platform.modeController, mode);
      });

      // First attempt should fail
      await expect(
        platform.modeController.setMode('infrastructure')
      ).rejects.toThrow('Transition failed');

      expect(platform.modeController.getMode()).toBe('simulation');

      // Second attempt should succeed
      await expect(
        platform.modeController.setMode('infrastructure')
      ).resolves.not.toThrow();

      expect(platform.modeController.getMode()).toBe('infrastructure');
    });

    test('should maintain data integrity during failed transitions', async () => {
      await platform.start();

      // Generate initial data
      platform.dataSimulator.emit('dataGenerated', {
        type: 'simulation',
        entities: Array(5).fill(testEntities.kafkaCluster)
      });

      await waitForCondition(() => streamedData.length === 5);
      const initialDataCount = streamedData.length;

      // Mock component to fail during transition
      platform.discoveryOrchestrator.startDiscovery = jest.fn().mockRejectedValue(
        new Error('Component failure')
      );

      // Attempt transition (will fail)
      await expect(
        platform.modeController.setMode('infrastructure')
      ).rejects.toThrow();

      // Continue generating simulation data
      platform.dataSimulator.emit('dataGenerated', {
        type: 'simulation',
        entities: Array(3).fill(testEntities.rabbitmqCluster)
      });

      await waitForCondition(() => streamedData.length === initialDataCount + 3);

      // All data should be preserved and new data should be processed
      expect(streamedData).toHaveLength(8);
      expect(platform.state).toBe('running');
    });
  });
});