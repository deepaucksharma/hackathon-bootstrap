/**
 * Unit Tests for Streaming Orchestrator
 * Tests streaming logic, batching, error handling, and performance
 */

const StreamingOrchestrator = require('../../streaming-orchestrator');
const { NewRelicStreamer } = require('../../../simulation/streaming/new-relic-streamer');
const { 
  createMockStreamData, 
  PerformanceTracker,
  waitForCondition 
} = require('../helpers/test-utils');
const { streamingEvents } = require('../fixtures/test-data');

jest.mock('../../../simulation/streaming/new-relic-streamer');

describe('StreamingOrchestrator', () => {
  let orchestrator;
  let mockStreamer;
  let performanceTracker;

  beforeEach(() => {
    // Mock NewRelicStreamer
    mockStreamer = {
      streamEvents: jest.fn().mockResolvedValue({ success: true }),
      streamMetrics: jest.fn().mockResolvedValue({ success: true }),
      stop: jest.fn()
    };
    NewRelicStreamer.mockImplementation(() => mockStreamer);

    performanceTracker = new PerformanceTracker();

    orchestrator = new StreamingOrchestrator({
      accountId: '12345',
      apiKey: 'test-key',
      batchSize: 100,
      flushInterval: 1000
    });
  });

  afterEach(() => {
    orchestrator.stop();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    test('should initialize with correct configuration', () => {
      expect(orchestrator.config).toMatchObject({
        batchSize: 100,
        flushInterval: 1000,
        maxRetries: 3,
        retryDelay: 1000
      });
      expect(orchestrator.state).toBe('initialized');
    });

    test('should validate configuration', () => {
      expect(() => new StreamingOrchestrator({})).toThrow('Missing required configuration');
      expect(() => new StreamingOrchestrator({
        accountId: '12345',
        apiKey: 'test-key',
        batchSize: -1
      })).toThrow('Invalid batch size');
    });

    test('should initialize internal queues and buffers', () => {
      expect(orchestrator.eventQueue).toEqual([]);
      expect(orchestrator.metricQueue).toEqual([]);
      expect(orchestrator.stats).toMatchObject({
        totalEvents: 0,
        successfulEvents: 0,
        failedEvents: 0,
        totalMetrics: 0
      });
    });
  });

  describe('streaming lifecycle', () => {
    test('should start streaming with flush timer', async () => {
      jest.useFakeTimers();
      
      await orchestrator.start();
      
      expect(orchestrator.state).toBe('running');
      expect(orchestrator.flushTimer).toBeDefined();
      
      jest.useRealTimers();
    });

    test('should stop streaming and flush pending data', async () => {
      await orchestrator.start();
      
      // Add some pending data
      orchestrator.eventQueue.push(...createMockStreamData(5));
      
      await orchestrator.stop();
      
      expect(orchestrator.state).toBe('stopped');
      expect(mockStreamer.streamEvents).toHaveBeenCalled();
      expect(orchestrator.eventQueue).toEqual([]);
    });

    test('should handle stop during active streaming', async () => {
      await orchestrator.start();
      
      // Start a long-running stream
      mockStreamer.streamEvents.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 1000))
      );
      
      orchestrator.stream(streamingEvents.batchEvents(50));
      
      // Stop while streaming
      await orchestrator.stop();
      
      expect(orchestrator.state).toBe('stopped');
    });
  });

  describe('event streaming', () => {
    test('should queue events for batching', async () => {
      await orchestrator.start();
      
      const events = createMockStreamData(50);
      await orchestrator.stream({ type: 'events', data: events });
      
      expect(orchestrator.eventQueue).toHaveLength(50);
      expect(mockStreamer.streamEvents).not.toHaveBeenCalled(); // Not flushed yet
    });

    test('should flush when batch size is reached', async () => {
      await orchestrator.start();
      
      const events = createMockStreamData(100); // Exact batch size
      await orchestrator.stream({ type: 'events', data: events });
      
      expect(mockStreamer.streamEvents).toHaveBeenCalledWith(events);
      expect(orchestrator.eventQueue).toEqual([]);
      expect(orchestrator.stats.totalEvents).toBe(100);
      expect(orchestrator.stats.successfulEvents).toBe(100);
    });

    test('should handle oversized batches', async () => {
      await orchestrator.start();
      
      const events = createMockStreamData(250); // 2.5x batch size
      await orchestrator.stream({ type: 'events', data: events });
      
      expect(mockStreamer.streamEvents).toHaveBeenCalledTimes(2);
      expect(orchestrator.eventQueue).toHaveLength(50); // Remaining events
    });

    test('should flush on timer interval', async () => {
      jest.useFakeTimers();
      
      await orchestrator.start();
      
      const events = createMockStreamData(30); // Less than batch size
      await orchestrator.stream({ type: 'events', data: events });
      
      expect(mockStreamer.streamEvents).not.toHaveBeenCalled();
      
      // Advance timer
      jest.advanceTimersByTime(1000);
      
      expect(mockStreamer.streamEvents).toHaveBeenCalledWith(events);
      expect(orchestrator.eventQueue).toEqual([]);
      
      jest.useRealTimers();
    });
  });

  describe('metric streaming', () => {
    test('should separate metrics from events', async () => {
      await orchestrator.start();
      
      const metrics = [{
        metricName: 'mq.cluster.health',
        value: 98.5,
        timestamp: Date.now()
      }];
      
      await orchestrator.stream({ type: 'metrics', data: metrics });
      
      expect(orchestrator.metricQueue).toHaveLength(1);
      expect(orchestrator.eventQueue).toEqual([]);
    });

    test('should stream metrics separately', async () => {
      await orchestrator.start();
      
      const metrics = Array(100).fill(null).map((_, i) => ({
        metricName: `mq.metric.${i}`,
        value: Math.random() * 100,
        timestamp: Date.now()
      }));
      
      await orchestrator.stream({ type: 'metrics', data: metrics });
      
      expect(mockStreamer.streamMetrics).toHaveBeenCalledWith(metrics);
      expect(orchestrator.stats.totalMetrics).toBe(100);
    });
  });

  describe('error handling and retries', () => {
    test('should retry failed streams', async () => {
      await orchestrator.start();
      
      mockStreamer.streamEvents
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({ success: true });
      
      const events = createMockStreamData(100);
      await orchestrator.stream({ type: 'events', data: events });
      
      await waitForCondition(() => mockStreamer.streamEvents.mock.calls.length === 3);
      
      expect(mockStreamer.streamEvents).toHaveBeenCalledTimes(3);
      expect(orchestrator.stats.successfulEvents).toBe(100);
    });

    test('should handle max retry failures', async () => {
      await orchestrator.start();
      
      const errorHandler = jest.fn();
      orchestrator.on('error', errorHandler);
      
      mockStreamer.streamEvents.mockRejectedValue(new Error('Persistent error'));
      
      const events = createMockStreamData(100);
      await orchestrator.stream({ type: 'events', data: events });
      
      await waitForCondition(() => errorHandler.mock.calls.length > 0);
      
      expect(mockStreamer.streamEvents).toHaveBeenCalledTimes(3); // Max retries
      expect(orchestrator.stats.failedEvents).toBe(100);
      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'streamError',
        error: expect.any(Error),
        dataType: 'events',
        count: 100
      }));
    });

    test('should implement exponential backoff', async () => {
      await orchestrator.start();
      
      mockStreamer.streamEvents.mockRejectedValue(new Error('Error'));
      
      const startTime = Date.now();
      const events = createMockStreamData(100);
      
      await orchestrator.stream({ type: 'events', data: events });
      
      await waitForCondition(() => mockStreamer.streamEvents.mock.calls.length === 3);
      
      const duration = Date.now() - startTime;
      // Should take at least 1000 + 2000 = 3000ms due to backoff
      expect(duration).toBeGreaterThan(2500);
    });
  });

  describe('performance optimization', () => {
    test('should meet latency requirements', async () => {
      await orchestrator.start();
      
      performanceTracker.start('stream');
      
      const events = createMockStreamData(100);
      await orchestrator.stream({ type: 'events', data: events });
      
      const latency = performanceTracker.end('stream');
      
      // Should complete within 100ms for batch processing
      expect(latency).toBeLessThan(100);
    });

    test('should handle high throughput', async () => {
      await orchestrator.start();
      
      performanceTracker.start('throughput');
      
      // Stream 10,000 events
      for (let i = 0; i < 100; i++) {
        await orchestrator.stream({ 
          type: 'events', 
          data: createMockStreamData(100) 
        });
      }
      
      const duration = performanceTracker.end('throughput');
      const eventsPerSecond = 10000 / (duration / 1000);
      
      // Should handle at least 1000 events per second
      expect(eventsPerSecond).toBeGreaterThan(1000);
    });

    test('should optimize memory usage', async () => {
      await orchestrator.start();
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Stream large batch
      const events = createMockStreamData(1000);
      await orchestrator.stream({ type: 'events', data: events });
      
      const peakMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (peakMemory - initialMemory) / 1024 / 1024; // MB
      
      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(50); // Less than 50MB
    });
  });

  describe('statistics and monitoring', () => {
    test('should track comprehensive statistics', async () => {
      await orchestrator.start();
      
      // Stream various data
      await orchestrator.stream({ 
        type: 'events', 
        data: createMockStreamData(150) 
      });
      
      await orchestrator.stream({ 
        type: 'metrics', 
        data: Array(50).fill({ metricName: 'test', value: 1 }) 
      });
      
      const stats = orchestrator.getStats();
      
      expect(stats).toMatchObject({
        totalEvents: 150,
        successfulEvents: 150,
        failedEvents: 0,
        totalMetrics: 50,
        successfulMetrics: 50,
        failedMetrics: 0,
        avgBatchSize: expect.any(Number),
        avgLatency: expect.any(Number),
        throughput: expect.any(Number)
      });
    });

    test('should calculate real-time throughput', async () => {
      await orchestrator.start();
      
      // Stream data over time
      for (let i = 0; i < 5; i++) {
        await orchestrator.stream({ 
          type: 'events', 
          data: createMockStreamData(100) 
        });
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      const stats = orchestrator.getStats();
      expect(stats.throughput).toBeGreaterThan(0);
      expect(stats.throughput).toBeLessThan(1000); // Reasonable throughput
    });

    test('should emit statistics events', async () => {
      const statsHandler = jest.fn();
      orchestrator.on('stats', statsHandler);
      
      await orchestrator.start();
      
      await orchestrator.stream({ 
        type: 'events', 
        data: createMockStreamData(100) 
      });
      
      expect(statsHandler).toHaveBeenCalledWith(expect.objectContaining({
        totalEvents: 100,
        successfulEvents: 100
      }));
    });
  });

  describe('configuration updates', () => {
    test('should update batch size dynamically', async () => {
      await orchestrator.start();
      
      orchestrator.updateConfig({ batchSize: 200 });
      
      expect(orchestrator.config.batchSize).toBe(200);
      
      // Verify new batch size is used
      const events = createMockStreamData(200);
      await orchestrator.stream({ type: 'events', data: events });
      
      expect(mockStreamer.streamEvents).toHaveBeenCalledWith(
        expect.arrayContaining(events)
      );
    });

    test('should update flush interval', async () => {
      jest.useFakeTimers();
      
      await orchestrator.start();
      
      orchestrator.updateConfig({ flushInterval: 2000 });
      
      const events = createMockStreamData(30);
      await orchestrator.stream({ type: 'events', data: events });
      
      jest.advanceTimersByTime(1000);
      expect(mockStreamer.streamEvents).not.toHaveBeenCalled();
      
      jest.advanceTimersByTime(1000);
      expect(mockStreamer.streamEvents).toHaveBeenCalled();
      
      jest.useRealTimers();
    });
  });

  describe('data validation', () => {
    test('should validate event data', async () => {
      await orchestrator.start();
      
      const invalidEvent = streamingEvents.invalidEvent;
      
      await expect(orchestrator.stream({ 
        type: 'events', 
        data: [invalidEvent] 
      })).rejects.toThrow('Invalid event data');
    });

    test('should filter out invalid events', async () => {
      await orchestrator.start();
      orchestrator.config.strictValidation = false;
      
      const mixedEvents = [
        ...createMockStreamData(5),
        streamingEvents.invalidEvent,
        ...createMockStreamData(5)
      ];
      
      await orchestrator.stream({ type: 'events', data: mixedEvents });
      
      expect(orchestrator.eventQueue).toHaveLength(10); // Valid events only
    });
  });

  describe('concurrency control', () => {
    test('should handle concurrent streams', async () => {
      await orchestrator.start();
      
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(orchestrator.stream({ 
          type: 'events', 
          data: createMockStreamData(50) 
        }));
      }
      
      await Promise.all(promises);
      
      expect(orchestrator.stats.totalEvents).toBe(500);
    });

    test('should limit concurrent flushes', async () => {
      await orchestrator.start();
      orchestrator.config.maxConcurrentFlushes = 2;
      
      let activeFl
 = 0;
      let maxActive = 0;
      
      mockStreamer.streamEvents.mockImplementation(async () => {
        activeFlushes++;
        maxActive = Math.max(maxActive, activeFlushes);
        await new Promise(resolve => setTimeout(resolve, 100));
        activeFlushes--;
        return { success: true };
      });
      
      // Create multiple batches
      for (let i = 0; i < 5; i++) {
        orchestrator.stream({ 
          type: 'events', 
          data: createMockStreamData(100) 
        });
      }
      
      await waitForCondition(() => orchestrator.stats.totalEvents === 500);
      
      expect(maxActive).toBeLessThanOrEqual(2);
    });
  });
});