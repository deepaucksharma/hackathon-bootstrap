/**
 * Streaming Integration Tests
 * 
 * Tests the NewRelicStreamer component and data flow
 */

const NewRelicStreamer = require('../../simulation/streaming/new-relic-streamer');
const { EntityFactory } = require('../../core/entities');
const axios = require('axios');

// Mock axios
jest.mock('axios');

describe('Streaming Integration', () => {
  let streamer;
  let entityFactory;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup axios mock
    axios.post = jest.fn().mockResolvedValue({ data: { success: true } });
    
    // Create streamer
    streamer = new NewRelicStreamer({
      apiKey: 'test-api-key',
      accountId: '12345'
    });
    
    // Create entity factory
    entityFactory = new EntityFactory();
  });

  afterEach(async () => {
    if (streamer) {
      await streamer.shutdown();
    }
  });

  describe('Event Streaming', () => {
    test('should stream entity events to New Relic', async () => {
      // Create test entities
      const cluster = entityFactory.createCluster({
        name: 'test-cluster',
        provider: 'kafka'
      });
      
      const broker = entityFactory.createBroker({
        brokerId: 1,
        clusterName: 'test-cluster',
        provider: 'kafka'
      });
      
      const topic = entityFactory.createTopic({
        topic: 'test.topic',
        clusterName: 'test-cluster',
        provider: 'kafka'
      });
      
      // Stream entities
      await streamer.streamEvents([cluster, broker, topic]);
      
      // Verify API calls
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/events'),
        expect.any(Array),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Api-Key': 'test-api-key'
          })
        })
      );
      
      // Verify event format
      const eventData = axios.post.mock.calls[0][1];
      expect(eventData).toBeInstanceOf(Array);
      expect(eventData.length).toBe(3);
      
      // Check event structure
      const clusterEvent = eventData.find(e => e.entityType === 'MESSAGE_QUEUE_CLUSTER');
      expect(clusterEvent).toMatchObject({
        eventType: 'MessageQueueSample',
        entityGuid: expect.stringMatching(/^MESSAGE_QUEUE_CLUSTER\|12345\|kafka\|/),
        entityName: 'test-cluster',
        entityType: 'MESSAGE_QUEUE_CLUSTER',
        provider: 'kafka'
      });
    });

    test('should batch large numbers of entities', async () => {
      // Create many entities
      const entities = [];
      for (let i = 0; i < 2500; i++) {
        entities.push(entityFactory.createTopic({
          topic: `topic-${i}`,
          clusterName: 'test-cluster',
          provider: 'kafka'
        }));
      }
      
      await streamer.streamEvents(entities);
      
      // Should make 3 API calls (1000 + 1000 + 500)
      expect(axios.post).toHaveBeenCalledTimes(3);
      
      // Verify batch sizes
      expect(axios.post.mock.calls[0][1].length).toBe(1000);
      expect(axios.post.mock.calls[1][1].length).toBe(1000);
      expect(axios.post.mock.calls[2][1].length).toBe(500);
    });

    test('should handle API errors with retry', async () => {
      // First call fails, second succeeds
      axios.post
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockResolvedValueOnce({ data: { success: true } });
      
      const topic = entityFactory.createTopic({
        topic: 'test.topic',
        clusterName: 'test-cluster',
        provider: 'kafka'
      });
      
      await streamer.streamEvents([topic]);
      
      // Should retry and succeed
      expect(axios.post).toHaveBeenCalledTimes(2);
    });

    test('should respect rate limits', async () => {
      // Create streamer with low rate limit
      const rateLimitedStreamer = new NewRelicStreamer({
        apiKey: 'test-api-key',
        accountId: '12345',
        rateLimit: 2 // 2 requests per second
      });
      
      const startTime = Date.now();
      
      // Make 4 requests
      for (let i = 0; i < 4; i++) {
        const topic = entityFactory.createTopic({
          topic: `topic-${i}`,
          clusterName: 'test-cluster',
          provider: 'kafka'
        });
        await rateLimitedStreamer.streamEvents([topic]);
      }
      
      const duration = Date.now() - startTime;
      
      // Should take at least 1.5 seconds (4 requests at 2/sec)
      expect(duration).toBeGreaterThan(1500);
      
      await rateLimitedStreamer.shutdown();
    });
  });

  describe('Metric Streaming', () => {
    test('should stream metrics to New Relic', async () => {
      const metrics = [
        {
          name: 'message.queue.throughput',
          type: 'gauge',
          value: 1000,
          timestamp: Date.now(),
          attributes: {
            entityGuid: 'MESSAGE_QUEUE_TOPIC|12345|kafka|test-cluster|test.topic',
            entityType: 'MESSAGE_QUEUE_TOPIC',
            provider: 'kafka',
            clusterName: 'test-cluster',
            topicName: 'test.topic'
          }
        }
      ];
      
      await streamer.streamMetrics(metrics);
      
      // Verify API call
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/metrics'),
        expect.any(Array),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Api-Key': 'test-api-key'
          })
        })
      );
      
      // Verify metric format
      const metricData = axios.post.mock.calls[0][1];
      expect(metricData).toEqual([{
        metrics: metrics
      }]);
    });

    test('should aggregate metrics by interval', async () => {
      // Create metrics at different timestamps
      const now = Date.now();
      const metrics = [
        {
          name: 'broker.cpu.usage',
          type: 'gauge',
          value: 50,
          timestamp: now,
          attributes: { brokerId: '1' }
        },
        {
          name: 'broker.cpu.usage',
          type: 'gauge',
          value: 60,
          timestamp: now + 30000, // 30 seconds later
          attributes: { brokerId: '1' }
        },
        {
          name: 'broker.cpu.usage',
          type: 'gauge',
          value: 55,
          timestamp: now + 60000, // 1 minute later
          attributes: { brokerId: '1' }
        }
      ];
      
      await streamer.streamMetrics(metrics);
      
      // Should make one call with all metrics
      expect(axios.post).toHaveBeenCalledTimes(1);
      
      const sentMetrics = axios.post.mock.calls[0][1][0].metrics;
      expect(sentMetrics.length).toBe(3);
    });
  });

  describe('Statistics and Monitoring', () => {
    test('should track streaming statistics', async () => {
      // Stream some successful entities
      const entities = [
        entityFactory.createCluster({ name: 'cluster1', provider: 'kafka' }),
        entityFactory.createBroker({ brokerId: 1, clusterName: 'cluster1', provider: 'kafka' })
      ];
      
      await streamer.streamEvents(entities);
      
      const stats = streamer.getStats();
      expect(stats).toMatchObject({
        events: {
          sent: 2,
          failed: 0,
          batches: 1
        },
        metrics: {
          sent: 0,
          failed: 0,
          batches: 0
        }
      });
    });

    test('should track failed requests', async () => {
      // Setup to always fail
      axios.post.mockRejectedValue(new Error('API Error'));
      
      const topic = entityFactory.createTopic({
        topic: 'test.topic',
        clusterName: 'test-cluster',
        provider: 'kafka'
      });
      
      try {
        await streamer.streamEvents([topic]);
      } catch (e) {
        // Expected to fail
      }
      
      const stats = streamer.getStats();
      expect(stats.events.failed).toBe(1);
    });

    test('should handle circuit breaker', async () => {
      // Make multiple failed requests to trigger circuit breaker
      axios.post.mockRejectedValue(new Error('Service unavailable'));
      
      for (let i = 0; i < 5; i++) {
        try {
          await streamer.streamEvents([
            entityFactory.createTopic({ topic: `topic-${i}`, clusterName: 'test', provider: 'kafka' })
          ]);
        } catch (e) {
          // Expected to fail
        }
      }
      
      // Circuit should be open
      const stats = streamer.getStats();
      expect(stats.circuitBreaker).toBeDefined();
      expect(stats.circuitBreaker.state).toBe('open');
      
      // Further requests should fail immediately
      const startTime = Date.now();
      try {
        await streamer.streamEvents([
          entityFactory.createTopic({ topic: 'another-topic', clusterName: 'test', provider: 'kafka' })
        ]);
      } catch (e) {
        // Should fail fast
      }
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should fail immediately, not retry
    });
  });

  describe('Shutdown and Cleanup', () => {
    test('should flush pending data on shutdown', async () => {
      // Queue some data
      const entities = Array.from({ length: 100 }, (_, i) => 
        entityFactory.createTopic({
          topic: `topic-${i}`,
          clusterName: 'test-cluster',
          provider: 'kafka'
        })
      );
      
      // Stream without waiting
      streamer.streamEvents(entities); // No await
      
      // Immediately shutdown
      await streamer.shutdown();
      
      // Should have flushed the data
      expect(axios.post).toHaveBeenCalled();
    });

    test('should handle graceful shutdown', async () => {
      const shutdownPromise = streamer.shutdown();
      
      // Should complete quickly
      await expect(shutdownPromise).resolves.toBeUndefined();
      
      // Should not accept new data after shutdown
      await expect(
        streamer.streamEvents([
          entityFactory.createTopic({ topic: 'test', clusterName: 'test', provider: 'kafka' })
        ])
      ).rejects.toThrow();
    });
  });
});