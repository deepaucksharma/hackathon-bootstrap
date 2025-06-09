const MessageQueueConsumerGroup = require('../message-queue-consumer-group');

describe('MessageQueueConsumerGroup', () => {
  const baseConfig = {
    accountId: '12345',
    consumerGroupId: 'analytics-processor',
    clusterName: 'prod-kafka',
    provider: 'kafka'
  };

  describe('Constructor', () => {
    it('should create a valid consumer group entity with minimal config', () => {
      const consumerGroup = new MessageQueueConsumerGroup(baseConfig);
      
      expect(consumerGroup.entityType).toBe('MESSAGE_QUEUE_CONSUMER_GROUP');
      expect(consumerGroup.consumerGroupId).toBe('analytics-processor');
      expect(consumerGroup.clusterName).toBe('prod-kafka');
      expect(consumerGroup.provider).toBe('kafka');
      expect(consumerGroup.state).toBe('STABLE');
    });

    it('should accept groupId as alternative to consumerGroupId', () => {
      const config = {
        ...baseConfig,
        groupId: 'order-processor',
        consumerGroupId: undefined
      };
      const consumerGroup = new MessageQueueConsumerGroup(config);
      
      expect(consumerGroup.consumerGroupId).toBe('order-processor');
    });

    it('should set correct display name', () => {
      const consumerGroup = new MessageQueueConsumerGroup(baseConfig);
      expect(consumerGroup.displayName).toBe('analytics-processor (prod-kafka)');
    });

    it('should generate correct entity GUID', () => {
      const consumerGroup = new MessageQueueConsumerGroup(baseConfig);
      expect(consumerGroup.entityGuid).toBe('MESSAGE_QUEUE_CONSUMER_GROUP|12345|kafka|prod-kafka|analytics-processor');
    });
  });

  describe('Lag Metrics', () => {
    it('should initialize lag metrics to zero', () => {
      const consumerGroup = new MessageQueueConsumerGroup(baseConfig);
      
      expect(consumerGroup.totalLag).toBe(0);
      expect(consumerGroup.maxLag).toBe(0);
      expect(consumerGroup.avgLag).toBe(0);
      expect(consumerGroup.metrics['consumerGroup.totalLag']).toBe(0);
    });

    it('should update lag metrics correctly', () => {
      const consumerGroup = new MessageQueueConsumerGroup(baseConfig);
      
      consumerGroup.updateLagMetrics({
        totalLag: 10000,
        maxLag: 5000,
        avgLag: 2500,
        partitionAssignment: {
          '0': 5000,
          '1': 3000,
          '2': 2000
        }
      });

      expect(consumerGroup.totalLag).toBe(10000);
      expect(consumerGroup.maxLag).toBe(5000);
      expect(consumerGroup.avgLag).toBe(2500);
      expect(consumerGroup.metrics['consumerGroup.totalLag']).toBe(10000);
    });

    it('should calculate lag summary correctly', () => {
      const consumerGroup = new MessageQueueConsumerGroup({
        ...baseConfig,
        totalLag: 5000,
        maxLag: 3000,
        avgLag: 1000,
        lagThreshold: 10000
      });

      const summary = consumerGroup.getLagSummary();
      
      expect(summary.total).toBe(5000);
      expect(summary.max).toBe(3000);
      expect(summary.average).toBe(1000);
      expect(summary.isHealthy).toBe(true);
    });
  });

  describe('State Management', () => {
    it('should update state correctly', () => {
      const consumerGroup = new MessageQueueConsumerGroup(baseConfig);
      
      consumerGroup.updateState('REBALANCING');
      
      expect(consumerGroup.state).toBe('REBALANCING');
      expect(consumerGroup.tags['consumerGroup.state']).toBe('REBALANCING');
      expect(consumerGroup.metrics['consumerGroup.isRebalancing']).toBe(1);
      expect(consumerGroup.metrics['consumerGroup.isStable']).toBe(0);
    });

    it('should reject invalid states', () => {
      const consumerGroup = new MessageQueueConsumerGroup(baseConfig);
      
      consumerGroup.updateState('INVALID_STATE');
      
      expect(consumerGroup.state).toBe('STABLE'); // Should remain unchanged
    });

    it('should set state flags correctly', () => {
      const consumerGroup = new MessageQueueConsumerGroup({
        ...baseConfig,
        state: 'DEAD'
      });
      
      expect(consumerGroup.metrics['consumerGroup.isDead']).toBe(1);
      expect(consumerGroup.metrics['consumerGroup.isStable']).toBe(0);
      expect(consumerGroup.metrics['consumerGroup.isRebalancing']).toBe(0);
    });
  });

  describe('Member Management', () => {
    it('should update members correctly', () => {
      const consumerGroup = new MessageQueueConsumerGroup(baseConfig);
      
      const members = ['member-1', 'member-2', 'member-3'];
      consumerGroup.updateMembers(members);
      
      expect(consumerGroup.memberCount).toBe(3);
      expect(consumerGroup.activeMembers).toEqual(members);
      expect(consumerGroup.metrics['consumerGroup.memberCount']).toBe(3);
    });
  });

  describe('Relationships', () => {
    it('should create relationship to cluster', () => {
      const consumerGroup = new MessageQueueConsumerGroup(baseConfig);
      
      const clusterRelationship = consumerGroup.relationships.find(r => r.type === 'BELONGS_TO');
      expect(clusterRelationship).toBeDefined();
      expect(clusterRelationship.targetEntityGuid).toBe('MESSAGE_QUEUE_CLUSTER|12345|kafka|prod-kafka');
    });

    it('should create relationships to topics', () => {
      const consumerGroup = new MessageQueueConsumerGroup({
        ...baseConfig,
        topics: ['user-events', 'order-events']
      });
      
      const topicRelationships = consumerGroup.relationships.filter(r => r.type === 'CONSUMES_FROM');
      expect(topicRelationships).toHaveLength(2);
      expect(topicRelationships[0].targetEntityGuid).toContain('user-events');
      expect(topicRelationships[1].targetEntityGuid).toContain('order-events');
    });

    it('should create relationship to coordinator broker', () => {
      const consumerGroup = new MessageQueueConsumerGroup({
        ...baseConfig,
        coordinator: {
          id: '1',
          host: 'broker-1.kafka'
        }
      });
      
      const coordinatorRelationship = consumerGroup.relationships.find(r => r.type === 'COORDINATED_BY');
      expect(coordinatorRelationship).toBeDefined();
      expect(coordinatorRelationship.targetEntityGuid).toBe('MESSAGE_QUEUE_BROKER|12345|kafka|prod-kafka|1');
    });
  });

  describe('Health Check', () => {
    it('should be healthy when stable with members and low lag', () => {
      const consumerGroup = new MessageQueueConsumerGroup({
        ...baseConfig,
        state: 'STABLE',
        memberCount: 3,
        maxLag: 500
      });
      
      expect(consumerGroup.isHealthy()).toBe(true);
    });

    it('should be unhealthy when no members', () => {
      const consumerGroup = new MessageQueueConsumerGroup({
        ...baseConfig,
        memberCount: 0
      });
      
      expect(consumerGroup.isHealthy()).toBe(false);
    });

    it('should be unhealthy when lag exceeds threshold', () => {
      const consumerGroup = new MessageQueueConsumerGroup({
        ...baseConfig,
        maxLag: 15000,
        lagThreshold: 10000
      });
      
      expect(consumerGroup.isHealthy()).toBe(false);
    });

    it('should be unhealthy when not stable', () => {
      const consumerGroup = new MessageQueueConsumerGroup({
        ...baseConfig,
        state: 'REBALANCING',
        memberCount: 3,
        maxLag: 100
      });
      
      expect(consumerGroup.isHealthy()).toBe(false);
    });
  });

  describe('Event Conversion', () => {
    it('should convert to New Relic event format', () => {
      const consumerGroup = new MessageQueueConsumerGroup({
        ...baseConfig,
        totalLag: 1000,
        topics: ['events']
      });
      
      const event = consumerGroup.toEvent();
      
      expect(event.eventType).toBe('MessageQueue');
      expect(event.entityType).toBe('MESSAGE_QUEUE_CONSUMER_GROUP');
      expect(event.entityGuid).toBe('MESSAGE_QUEUE_CONSUMER_GROUP|12345|kafka|prod-kafka|analytics-processor');
      expect(event.consumerGroupId).toBe('analytics-processor');
      expect(event['consumerGroup.totalLag']).toBe(1000);
      expect(event.topicCount).toBe(1);
      expect(event.timestamp).toBeDefined();
    });
  });

  describe('Metrics Conversion', () => {
    it('should convert to metrics format', () => {
      const consumerGroup = new MessageQueueConsumerGroup({
        ...baseConfig,
        totalLag: 5000,
        messagesConsumedPerSecond: 150
      });
      
      const metrics = consumerGroup.toMetrics();
      
      expect(metrics).toBeInstanceOf(Array);
      expect(metrics.length).toBeGreaterThan(0);
      
      const lagMetric = metrics.find(m => m.name === 'consumerGroup_totalLag');
      expect(lagMetric).toBeDefined();
      expect(lagMetric.value).toBe(5000);
      expect(lagMetric.attributes.consumer_group_id).toBe('analytics-processor');
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle consumer group with multiple topics and partitions', () => {
      const consumerGroup = new MessageQueueConsumerGroup({
        ...baseConfig,
        topics: ['user-events', 'order-events', 'payment-events'],
        partitionAssignment: {
          'user-events-0': 1000,
          'user-events-1': 2000,
          'order-events-0': 500,
          'order-events-1': 1500,
          'payment-events-0': 0,
          'payment-events-1': 100
        },
        totalLag: 5100,
        maxLag: 2000,
        avgLag: 850
      });
      
      expect(consumerGroup.topics).toHaveLength(3);
      expect(consumerGroup.totalLag).toBe(5100);
      expect(consumerGroup.relationships.filter(r => r.type === 'CONSUMES_FROM')).toHaveLength(3);
    });

    it('should handle edge cases in metrics', () => {
      const consumerGroup = new MessageQueueConsumerGroup({
        ...baseConfig,
        messagesConsumedPerSecond: 0,
        bytesConsumedPerSecond: 0,
        processingTimeMs: null,
        pollIntervalMs: undefined
      });
      
      expect(consumerGroup.metrics['consumerGroup.messagesConsumedPerSecond']).toBe(0);
      expect(consumerGroup.metrics['consumerGroup.processingTimeMs']).toBe(0);
      expect(consumerGroup.metrics['consumerGroup.pollIntervalMs']).toBe(0);
    });
  });
});