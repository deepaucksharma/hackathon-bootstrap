/**
 * Integration Tests for NRI-Kafka Transformer
 * 
 * Tests the transformation of real nri-kafka sample data to MESSAGE_QUEUE entities
 */

const NriKafkaTransformer = require('../nri-kafka-transformer');

describe('NriKafkaTransformer', () => {
  let transformer;
  const accountId = '12345';

  beforeEach(() => {
    transformer = new NriKafkaTransformer(accountId);
  });

  describe('constructor', () => {
    test('should require account ID', () => {
      expect(() => new NriKafkaTransformer()).toThrow('Account ID is required');
    });

    test('should convert account ID to string', () => {
      const numericTransformer = new NriKafkaTransformer(98765);
      expect(numericTransformer.accountId).toBe('98765');
    });
  });

  describe('generateGuid', () => {
    test('should generate correct GUID format for broker', () => {
      const guid = transformer.generateGuid('MESSAGE_QUEUE_BROKER', 'kafka', 'prod-cluster', 'broker-1');
      expect(guid).toBe('MESSAGE_QUEUE_BROKER|12345|kafka|prod-cluster|broker-1');
    });

    test('should generate correct GUID format for topic', () => {
      const guid = transformer.generateGuid('MESSAGE_QUEUE_TOPIC', 'kafka', 'prod-cluster', 'user-events');
      expect(guid).toBe('MESSAGE_QUEUE_TOPIC|12345|kafka|prod-cluster|user-events');
    });

    test('should filter out empty identifiers', () => {
      const guid = transformer.generateGuid('MESSAGE_QUEUE_CLUSTER', 'kafka', '', 'cluster-name');
      expect(guid).toBe('MESSAGE_QUEUE_CLUSTER|12345|kafka|cluster-name');
    });
  });

  describe('transformBrokerSample', () => {
    const validBrokerSample = {
      eventType: 'KafkaBrokerSample',
      'broker.id': 1,
      'broker.bytesInPerSecond': 1024000,
      'broker.bytesOutPerSecond': 2048000,
      'broker.messagesInPerSecond': 1000,
      'broker.cpuPercent': 35.5,
      'broker.JVMMemoryUsedPercent': 65.0,
      'broker.underReplicatedPartitions': 0,
      'broker.offlinePartitions': 0,
      clusterName: 'production-kafka',
      kafkaVersion: '2.8.0',
      hostname: 'kafka-broker-1.example.com'
    };

    test('should transform valid broker sample', () => {
      const entity = transformer.transformBrokerSample(validBrokerSample);
      
      expect(entity.eventType).toBe('MessageQueue');
      expect(entity.entityType).toBe('MESSAGE_QUEUE_BROKER');
      expect(entity.entityGuid).toBe('MESSAGE_QUEUE_BROKER|12345|kafka|production-kafka|broker-1');
      expect(entity.displayName).toBe('Kafka Broker 1');
      expect(entity.provider).toBe('kafka');
      expect(entity.brokerId).toBe('1');
      expect(entity.clusterName).toBe('production-kafka');
    });

    test('should map metrics correctly', () => {
      const entity = transformer.transformBrokerSample(validBrokerSample);
      
      expect(entity['broker.messagesInPerSecond']).toBe(1000);
      expect(entity['broker.bytesInPerSecond']).toBe(1024000);
      expect(entity['broker.cpu.usage']).toBe(35.5);
      expect(entity['broker.memory.usage']).toBe(65.0);
      expect(entity['broker.underReplicatedPartitions']).toBe(0);
    });

    test('should set tags with correct prefix', () => {
      const entity = transformer.transformBrokerSample(validBrokerSample);
      
      expect(entity['tags.clusterName']).toBe('production-kafka');
      expect(entity['tags.brokerId']).toBe('1');
      expect(entity['tags.kafkaVersion']).toBe('2.8.0');
      expect(entity['tags.environment']).toBe('production');
      expect(entity['tags.provider']).toBe('kafka');
    });

    test('should infer environment from cluster name', () => {
      const samples = [
        { ...validBrokerSample, clusterName: 'prod-kafka' },
        { ...validBrokerSample, clusterName: 'staging-kafka' },
        { ...validBrokerSample, clusterName: 'dev-kafka' },
        { ...validBrokerSample, clusterName: 'test-cluster' },
        { ...validBrokerSample, clusterName: 'random-name' }
      ];

      const environments = samples.map(s => transformer.transformBrokerSample(s)['tags.environment']);
      expect(environments).toEqual(['production', 'staging', 'development', 'test', 'production']);
    });

    test('should handle missing optional fields', () => {
      const minimalSample = {
        eventType: 'KafkaBrokerSample',
        'broker.id': 1
      };

      const entity = transformer.transformBrokerSample(minimalSample);
      expect(entity.clusterName).toBe('default');
      expect(entity['broker.messagesInPerSecond']).toBe(0);
      expect(entity['tags.kafkaVersion']).toBe('unknown');
    });

    test('should throw error for invalid sample', () => {
      expect(() => transformer.transformBrokerSample({}))
        .toThrow('Invalid broker sample: missing or incorrect eventType');
      
      expect(() => transformer.transformBrokerSample({ eventType: 'WrongType' }))
        .toThrow('Invalid broker sample: missing or incorrect eventType');
    });

    test('should preserve timestamp if present', () => {
      const sampleWithTimestamp = {
        ...validBrokerSample,
        timestamp: 1234567890
      };

      const entity = transformer.transformBrokerSample(sampleWithTimestamp);
      expect(entity.timestamp).toBe(1234567890);
    });
  });

  describe('transformTopicSample', () => {
    const validTopicSample = {
      eventType: 'KafkaTopicSample',
      'topic.name': 'user-events',
      'topic.bytesInPerSecond': 524288,
      'topic.bytesOutPerSecond': 524288,
      'topic.messagesInPerSecond': 500,
      'topic.partitionCount': 12,
      'topic.replicationFactor': 3,
      'topic.diskSize': 1073741824,
      'topic.retentionMs': 604800000,
      clusterName: 'production-kafka'
    };

    test('should transform valid topic sample', () => {
      const entity = transformer.transformTopicSample(validTopicSample);
      
      expect(entity.eventType).toBe('MessageQueue');
      expect(entity.entityType).toBe('MESSAGE_QUEUE_TOPIC');
      expect(entity.entityGuid).toBe('MESSAGE_QUEUE_TOPIC|12345|kafka|production-kafka|user-events');
      expect(entity.displayName).toBe('user-events');
      expect(entity.topicName).toBe('user-events');
    });

    test('should map topic metrics correctly', () => {
      const entity = transformer.transformTopicSample(validTopicSample);
      
      expect(entity['topic.messagesInPerSecond']).toBe(500);
      expect(entity['topic.bytesInPerSecond']).toBe(524288);
      expect(entity['topic.partitions.count']).toBe(12);
      expect(entity['topic.replicationFactor']).toBe(3);
      expect(entity['topic.sizeBytes']).toBe(1073741824);
      expect(entity['topic.retentionMs']).toBe(604800000);
    });

    test('should set topic tags correctly', () => {
      const entity = transformer.transformTopicSample(validTopicSample);
      
      expect(entity['tags.topicName']).toBe('user-events');
      expect(entity['tags.clusterName']).toBe('production-kafka');
      expect(entity['tags.partitionCount']).toBe('12');
      expect(entity['tags.replicationFactor']).toBe('3');
    });

    test('should throw error for missing topic name', () => {
      const invalidSample = {
        eventType: 'KafkaTopicSample',
        clusterName: 'test'
      };

      expect(() => transformer.transformTopicSample(invalidSample))
        .toThrow('Topic sample missing topic name');
    });

    test('should handle alternate field names', () => {
      const sampleWithAlternateFields = {
        eventType: 'KafkaTopicSample',
        topic_name: 'alternate-topic',
        cluster_name: 'alternate-cluster'
      };

      const entity = transformer.transformTopicSample(sampleWithAlternateFields);
      expect(entity.topicName).toBe('alternate-topic');
      expect(entity.clusterName).toBe('alternate-cluster');
    });
  });

  describe('createClusterEntity', () => {
    const brokerSamples = [
      {
        'broker.id': 1,
        'broker.messagesInPerSecond': 1000,
        'broker.bytesInPerSecond': 1024000,
        'broker.cpuPercent': 30,
        'broker.JVMMemoryUsedPercent': 60,
        'broker.underReplicatedPartitions': 0,
        'broker.offlinePartitions': 0,
        clusterName: 'production-kafka',
        kafkaVersion: '2.8.0'
      },
      {
        'broker.id': 2,
        'broker.messagesInPerSecond': 800,
        'broker.bytesInPerSecond': 819200,
        'broker.cpuPercent': 25,
        'broker.JVMMemoryUsedPercent': 55,
        'broker.underReplicatedPartitions': 1,
        'broker.offlinePartitions': 0,
        clusterName: 'production-kafka',
        kafkaVersion: '2.8.0'
      },
      {
        'broker.id': 3,
        'broker.messagesInPerSecond': 1200,
        'broker.bytesInPerSecond': 1228800,
        'broker.cpuPercent': 35,
        'broker.JVMMemoryUsedPercent': 70,
        'broker.underReplicatedPartitions': 0,
        'broker.offlinePartitions': 0,
        clusterName: 'production-kafka',
        kafkaVersion: '2.8.0'
      }
    ];

    test('should create cluster entity from broker samples', () => {
      const entity = transformer.createClusterEntity(brokerSamples);
      
      expect(entity.eventType).toBe('MessageQueue');
      expect(entity.entityType).toBe('MESSAGE_QUEUE_CLUSTER');
      expect(entity.entityGuid).toBe('MESSAGE_QUEUE_CLUSTER|12345|kafka|production-kafka');
      expect(entity.displayName).toBe('Kafka Cluster: production-kafka');
      expect(entity['cluster.brokerCount']).toBe(3);
    });

    test('should aggregate metrics correctly', () => {
      const entity = transformer.createClusterEntity(brokerSamples);
      
      expect(entity['cluster.messagesInPerSecond']).toBe(3000); // 1000 + 800 + 1200
      expect(entity['cluster.bytesInPerSecond']).toBe(3072000); // Sum of all
      expect(entity['cluster.cpu.avgUsage']).toBe(30); // (30 + 25 + 35) / 3
      expect(entity['cluster.memory.avgUsage']).toBe(61.666666666666664); // (60 + 55 + 70) / 3
      expect(entity['cluster.underReplicatedPartitions']).toBe(1);
    });

    test('should calculate health score', () => {
      const entity = transformer.createClusterEntity(brokerSamples);
      expect(entity['cluster.health.score']).toBe(98); // -2 for 1 under-replicated partition
    });

    test('should handle unhealthy cluster', () => {
      const unhealthySamples = [
        {
          ...brokerSamples[0],
          'broker.offlinePartitions': 5,
          'broker.underReplicatedPartitions': 10
        }
      ];

      const entity = transformer.createClusterEntity(unhealthySamples);
      expect(entity['cluster.health.score']).toBe(30); // -50 for offline, -20 for under-replicated
    });

    test('should return null for empty broker samples', () => {
      expect(transformer.createClusterEntity([])).toBeNull();
      expect(transformer.createClusterEntity(null)).toBeNull();
    });
  });

  describe('transformSamples', () => {
    const mixedSamples = [
      {
        eventType: 'KafkaBrokerSample',
        'broker.id': 1,
        clusterName: 'test-cluster'
      },
      {
        eventType: 'KafkaTopicSample',
        'topic.name': 'test-topic',
        clusterName: 'test-cluster'
      },
      {
        eventType: 'KafkaBrokerSample',
        'broker.id': 2,
        clusterName: 'test-cluster'
      }
    ];

    test('should transform mixed samples correctly', () => {
      const result = transformer.transformSamples(mixedSamples);
      
      expect(result.stats.totalSamples).toBe(3);
      expect(result.stats.entitiesCreated).toBe(4); // 2 brokers + 1 topic + 1 cluster
      expect(result.stats.brokerEntities).toBe(2);
      expect(result.stats.topicEntities).toBe(1);
      expect(result.stats.clusterEntities).toBe(1);
      expect(result.stats.transformationErrors).toBe(0);
    });

    test('should handle transformation errors gracefully', () => {
      const samplesWithErrors = [
        ...mixedSamples,
        { eventType: 'InvalidType' },
        { /* missing eventType */ },
        null
      ];

      const result = transformer.transformSamples(samplesWithErrors);
      expect(result.stats.transformationErrors).toBe(3);
      expect(result.stats.entitiesCreated).toBe(4); // Still creates valid entities
    });

    test('should add transformation metadata', () => {
      const result = transformer.transformSamples(mixedSamples);
      
      result.entities.forEach(entity => {
        expect(entity._transformationMetadata).toBeDefined();
        expect(entity._transformationMetadata.transformedAt).toBeDefined();
        expect(entity._transformationMetadata.sourceEventCount).toBe(3);
      });
    });

    test('should throw error for invalid input', () => {
      expect(() => transformer.transformSamples()).toThrow('Samples must be a non-empty array');
      expect(() => transformer.transformSamples('not-an-array')).toThrow('Samples must be a non-empty array');
    });

    test('should track performance', () => {
      const result = transformer.transformSamples(mixedSamples);
      expect(result.stats.transformationDuration).toBeGreaterThanOrEqual(0);
      expect(result.stats.transformationDuration).toBeLessThan(1000); // Should be fast
    });
  });

  describe('real-world sample data', () => {
    test('should handle actual nri-kafka output format', () => {
      // This is what real nri-kafka data might look like
      const realSample = {
        eventType: 'KafkaBrokerSample',
        'broker.id': 1001,
        'broker.IOWaitPercent': 2.5,
        'broker.JVMMemoryUsed': 2147483648, // 2GB in bytes
        'broker.JVMMemoryUsedPercent': 50,
        'broker.bytesInPerSecond': 10485760, // 10 MB/s
        'broker.bytesOutPerSecond': 20971520, // 20 MB/s
        'broker.messagesInPerSecond': 10000,
        'broker.underReplicatedPartitions': 0,
        'disk.usedPercent': 45.5,
        'net.requestsPerSecond': 500,
        'net.networkProcessorAvgIdlePercent': 85,
        'net.requestHandlerAvgIdlePercent': 90,
        clusterName: 'prod-kafka-us-east-1',
        kafkaVersion: '2.8.1',
        hostname: 'ip-10-0-1-100.ec2.internal',
        timestamp: Date.now()
      };

      const entity = transformer.transformBrokerSample(realSample);
      
      expect(entity.entityGuid).toBe('MESSAGE_QUEUE_BROKER|12345|kafka|prod-kafka-us-east-1|broker-1001');
      expect(entity['broker.cpu.usage']).toBe(97.5); // 100 - 2.5
      expect(entity['broker.memory.usage']).toBe(50);
      expect(entity['broker.disk.usage']).toBe(45.5);
      expect(entity['broker.requestsPerSecond']).toBe(500);
      expect(entity['tags.environment']).toBe('production');
    });
  });
});