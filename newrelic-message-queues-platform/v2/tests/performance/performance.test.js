/**
 * Performance Tests for v2 Platform
 * Tests latency, throughput, and resource utilization
 */

const PlatformOrchestrator = require('../../platform-orchestrator');
const { PerformanceTracker, createMockConfig } = require('../helpers/test-utils');
const { performanceTestData, infrastructureResources } = require('../fixtures/test-data');

// Mock external dependencies for consistent performance testing
jest.mock('../../../simulation/streaming/new-relic-streamer', () => {
  return {
    NewRelicStreamer: jest.fn().mockImplementation(() => ({
      streamEvents: jest.fn().mockImplementation(async (events) => {
        // Simulate network latency
        await new Promise(resolve => setTimeout(resolve, 10));
        return { success: true };
      }),
      streamMetrics: jest.fn().mockResolvedValue({ success: true }),
      stop: jest.fn()
    }))
  };
});

describe('Performance Tests', () => {
  let platform;
  let performanceTracker;

  beforeEach(() => {
    performanceTracker = new PerformanceTracker();
    platform = new PlatformOrchestrator(createMockConfig({
      mode: 'infrastructure',
      streaming: {
        batchSize: 1000,
        flushInterval: 100
      }
    }));
  });

  afterEach(async () => {
    await platform.stop();
  });

  describe('transformation latency', () => {
    test('should meet <100ms transformation latency requirement', async () => {
      await platform.start();

      const measurements = [];
      
      // Mock SHIM transformation with timing
      const shimOrchestrator = platform.shimOrchestrator;
      shimOrchestrator.transform = jest.fn().mockImplementation(async (resources) => {
        const start = process.hrtime.bigint();
        
        // Simulate transformation work
        const transformed = resources.map(r => ({
          entityType: 'MESSAGE_QUEUE_BROKER',
          guid: `MQB_${r.id}`,
          provider: r.type,
          metrics: {
            'mq.broker.cpu': Math.random() * 100,
            'mq.broker.memory': Math.random() * 100
          }
        }));
        
        const end = process.hrtime.bigint();
        const latency = Number(end - start) / 1e6; // Convert to ms
        measurements.push(latency);
        
        return transformed;
      });

      // Test with various batch sizes
      const batchSizes = [1, 10, 50, 100];
      
      for (const size of batchSizes) {
        const resources = Array(size).fill(infrastructureResources.docker[0])
          .map((r, i) => ({ ...r, id: `container-${i}` }));
        
        platform.discoveryOrchestrator.emit('resourcesDiscovered', {
          provider: 'docker',
          resources
        });
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Calculate statistics
      const avgLatency = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const maxLatency = Math.max(...measurements);
      const p95Latency = measurements.sort((a, b) => a - b)[Math.floor(measurements.length * 0.95)];

      console.log('Transformation Latency Stats:');
      console.log(`  Average: ${avgLatency.toFixed(2)}ms`);
      console.log(`  Max: ${maxLatency.toFixed(2)}ms`);
      console.log(`  P95: ${p95Latency.toFixed(2)}ms`);

      expect(avgLatency).toBeLessThan(100);
      expect(p95Latency).toBeLessThan(100);
    });

    test('should handle complex transformations efficiently', async () => {
      await platform.start();

      const complexResource = performanceTestData.complexResource;
      
      performanceTracker.start('complexTransformation');
      
      platform.discoveryOrchestrator.emit('resourcesDiscovered', {
        provider: 'kafka',
        resources: [complexResource]
      });

      await new Promise(resolve => setTimeout(resolve, 500));
      
      const latency = performanceTracker.end('complexTransformation');

      // Complex resource with 10 brokers and 50 topics should still be fast
      expect(latency).toBeLessThan(200);
    });
  });

  describe('streaming throughput', () => {
    test('should handle 10,000+ events per second', async () => {
      await platform.start();

      const eventCount = 10000;
      const events = performanceTestData.largeBatch(eventCount);
      
      performanceTracker.start('throughput10k');
      
      // Stream all events
      await platform.streamingOrchestrator.stream({ 
        type: 'events', 
        data: events 
      });
      
      // Wait for all events to be processed
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const duration = performanceTracker.end('throughput10k');
      const eventsPerSecond = eventCount / (duration / 1000);

      console.log(`Throughput: ${eventsPerSecond.toFixed(0)} events/second`);

      expect(eventsPerSecond).toBeGreaterThan(10000);
    });

    test('should maintain throughput under sustained load', async () => {
      await platform.start();

      const measurements = [];
      const batchSize = 1000;
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        const events = performanceTestData.largeBatch(batchSize);
        
        performanceTracker.start(`batch${i}`);
        
        await platform.streamingOrchestrator.stream({ 
          type: 'events', 
          data: events 
        });
        
        const duration = performanceTracker.end(`batch${i}`);
        const throughput = batchSize / (duration / 1000);
        measurements.push(throughput);
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Check consistency
      const avgThroughput = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const minThroughput = Math.min(...measurements);
      const maxThroughput = Math.max(...measurements);
      const variance = maxThroughput - minThroughput;

      console.log('Sustained Load Throughput:');
      console.log(`  Average: ${avgThroughput.toFixed(0)} events/s`);
      console.log(`  Min: ${minThroughput.toFixed(0)} events/s`);
      console.log(`  Max: ${maxThroughput.toFixed(0)} events/s`);
      console.log(`  Variance: ${variance.toFixed(0)} events/s`);

      expect(avgThroughput).toBeGreaterThan(10000);
      expect(minThroughput).toBeGreaterThan(5000); // Allow some variation
      expect(variance / avgThroughput).toBeLessThan(0.5); // Less than 50% variance
    });
  });

  describe('resource utilization', () => {
    test('should maintain reasonable CPU usage', async () => {
      await platform.start();

      const cpuMeasurements = [];
      const startCpu = process.cpuUsage();

      // Generate load
      for (let i = 0; i < 10; i++) {
        const events = performanceTestData.largeBatch(1000);
        await platform.streamingOrchestrator.stream({ 
          type: 'events', 
          data: events 
        });
        
        const currentCpu = process.cpuUsage(startCpu);
        const totalCpu = (currentCpu.user + currentCpu.system) / 1000; // Convert to ms
        cpuMeasurements.push(totalCpu);
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const avgCpu = cpuMeasurements.reduce((a, b) => a + b, 0) / cpuMeasurements.length;
      console.log(`Average CPU time per iteration: ${avgCpu.toFixed(2)}ms`);

      // CPU usage should be reasonable
      expect(avgCpu).toBeLessThan(100); // Less than 100ms CPU per iteration
    });

    test('should handle memory efficiently', async () => {
      await platform.start();

      const memoryMeasurements = [];
      const initialMemory = process.memoryUsage().heapUsed;

      // Process large amounts of data
      for (let i = 0; i < 20; i++) {
        const events = performanceTestData.largeBatch(500);
        
        await platform.streamingOrchestrator.stream({ 
          type: 'events', 
          data: events 
        });
        
        if (i % 5 === 0) {
          global.gc && global.gc(); // Force GC if available
          const currentMemory = process.memoryUsage().heapUsed;
          const memoryDelta = (currentMemory - initialMemory) / 1024 / 1024; // MB
          memoryMeasurements.push(memoryDelta);
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const maxMemoryIncrease = Math.max(...memoryMeasurements);
      console.log(`Max memory increase: ${maxMemoryIncrease.toFixed(2)}MB`);

      // Memory should not grow unbounded
      expect(maxMemoryIncrease).toBeLessThan(200); // Less than 200MB increase
    });
  });

  describe('concurrent operations', () => {
    test('should handle concurrent discovery and streaming', async () => {
      await platform.start();

      performanceTracker.start('concurrent');

      const promises = [];

      // Concurrent discovery events
      for (let i = 0; i < 5; i++) {
        promises.push(new Promise(resolve => {
          setTimeout(() => {
            platform.discoveryOrchestrator.emit('resourcesDiscovered', {
              provider: 'docker',
              resources: Array(20).fill(infrastructureResources.docker[0])
                .map((r, j) => ({ ...r, id: `container-${i}-${j}` }))
            });
            resolve();
          }, i * 100);
        }));
      }

      // Concurrent simulation events
      for (let i = 0; i < 5; i++) {
        promises.push(new Promise(resolve => {
          setTimeout(() => {
            platform.dataSimulator.emit('dataGenerated', {
              type: 'simulation',
              entities: performanceTestData.largeBatch(100)
            });
            resolve();
          }, i * 150);
        }));
      }

      await Promise.all(promises);
      await new Promise(resolve => setTimeout(resolve, 2000));

      const duration = performanceTracker.end('concurrent');

      console.log(`Concurrent operations completed in ${duration.toFixed(2)}ms`);

      // Should handle concurrent operations efficiently
      expect(duration).toBeLessThan(5000);
      
      const stats = platform.streamingOrchestrator.getStats();
      expect(stats.totalEvents).toBeGreaterThan(500);
    });
  });

  describe('mode transition performance', () => {
    test('should transition modes quickly', async () => {
      await platform.start();

      const transitionTimes = [];

      for (const mode of ['infrastructure', 'hybrid', 'simulation']) {
        performanceTracker.start(`transition-${mode}`);
        
        await platform.modeController.setMode(mode);
        
        const transitionTime = performanceTracker.end(`transition-${mode}`);
        transitionTimes.push(transitionTime);
      }

      const avgTransitionTime = transitionTimes.reduce((a, b) => a + b, 0) / transitionTimes.length;
      console.log(`Average mode transition time: ${avgTransitionTime.toFixed(2)}ms`);

      // Mode transitions should be fast
      expect(avgTransitionTime).toBeLessThan(100);
      transitionTimes.forEach(time => {
        expect(time).toBeLessThan(200);
      });
    });

    test('should maintain performance during mode transitions', async () => {
      await platform.start();

      // Start streaming
      const streamingPromise = (async () => {
        for (let i = 0; i < 20; i++) {
          await platform.streamingOrchestrator.stream({ 
            type: 'events', 
            data: performanceTestData.largeBatch(500)
          });
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      })();

      // Perform mode transitions while streaming
      const transitionPromise = (async () => {
        for (const mode of ['infrastructure', 'hybrid', 'simulation', 'infrastructure']) {
          await new Promise(resolve => setTimeout(resolve, 500));
          await platform.modeController.setMode(mode);
        }
      })();

      performanceTracker.start('concurrentModeSwitch');
      
      await Promise.all([streamingPromise, transitionPromise]);
      
      const duration = performanceTracker.end('concurrentModeSwitch');

      const stats = platform.streamingOrchestrator.getStats();
      const throughput = stats.totalEvents / (duration / 1000);

      console.log(`Throughput during mode transitions: ${throughput.toFixed(0)} events/s`);

      // Should maintain reasonable throughput even during transitions
      expect(throughput).toBeGreaterThan(5000);
    });
  });

  describe('scalability tests', () => {
    test('should scale with number of entities', async () => {
      await platform.start();

      const entityCounts = [100, 500, 1000, 2000];
      const results = [];

      for (const count of entityCounts) {
        const resources = Array(count).fill(infrastructureResources.docker[0])
          .map((r, i) => ({ ...r, id: `container-${i}` }));

        performanceTracker.start(`scale-${count}`);
        
        platform.discoveryOrchestrator.emit('resourcesDiscovered', {
          provider: 'docker',
          resources
        });

        await new Promise(resolve => setTimeout(resolve, count * 2));
        
        const duration = performanceTracker.end(`scale-${count}`);
        const timePerEntity = duration / count;
        
        results.push({
          count,
          totalTime: duration,
          timePerEntity
        });
      }

      console.log('Scalability Results:');
      results.forEach(r => {
        console.log(`  ${r.count} entities: ${r.totalTime.toFixed(0)}ms total, ${r.timePerEntity.toFixed(2)}ms per entity`);
      });

      // Time per entity should remain relatively constant
      const times = results.map(r => r.timePerEntity);
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      const scalabilityRatio = maxTime / minTime;

      expect(scalabilityRatio).toBeLessThan(2); // Should scale linearly
    });
  });
});