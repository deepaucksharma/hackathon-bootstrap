/**
 * Test Data Fixtures for v2 Platform Tests
 */

const testEntities = {
  kafkaCluster: {
    entityType: 'MESSAGE_QUEUE_CLUSTER',
    guid: 'MQC_kafka-prod-01',
    name: 'kafka-prod-01',
    provider: 'kafka',
    region: 'us-east-1',
    environment: 'production',
    metadata: {
      version: '2.8.0',
      nodes: 3,
      topics: 15,
      partitions: 45
    }
  },
  
  rabbitmqCluster: {
    entityType: 'MESSAGE_QUEUE_CLUSTER',
    guid: 'MQC_rabbitmq-prod-01',
    name: 'rabbitmq-prod-01',
    provider: 'rabbitmq',
    region: 'us-west-2',
    environment: 'production',
    metadata: {
      version: '3.9.0',
      nodes: 2,
      queues: 25,
      exchanges: 10
    }
  },
  
  kafkaBroker: {
    entityType: 'MESSAGE_QUEUE_BROKER',
    guid: 'MQB_kafka-broker-01',
    name: 'kafka-broker-01',
    provider: 'kafka',
    clusterId: 'MQC_kafka-prod-01',
    metadata: {
      host: 'broker1.kafka.local',
      port: 9092,
      rack: 'rack-1'
    }
  }
};

const testMetrics = {
  clusterMetrics: {
    'mq.cluster.health': 98.5,
    'mq.cluster.throughput': 15000,
    'mq.cluster.lag': 250,
    'mq.cluster.error.rate': 0.02,
    'mq.cluster.availability': 99.99
  },
  
  brokerMetrics: {
    'mq.broker.cpu': 45.2,
    'mq.broker.memory': 78.3,
    'mq.broker.disk.usage': 62.1,
    'mq.broker.network.in': 125.5,
    'mq.broker.network.out': 98.7
  },
  
  topicMetrics: {
    'mq.topic.messages.in': 5000,
    'mq.topic.messages.out': 4950,
    'mq.topic.lag': 50,
    'mq.topic.partitions': 3,
    'mq.topic.replicas': 2
  }
};

const infrastructureResources = {
  docker: [
    {
      id: 'container-1',
      type: 'docker',
      name: 'kafka-broker-1',
      labels: {
        'com.docker.compose.service': 'kafka',
        'com.docker.compose.project': 'message-queues'
      },
      metadata: {
        image: 'confluentinc/cp-kafka:7.0.1',
        status: 'running',
        ports: ['9092:9092'],
        environment: {
          KAFKA_BROKER_ID: '1',
          KAFKA_ZOOKEEPER_CONNECT: 'zookeeper:2181'
        }
      }
    },
    {
      id: 'container-2',
      type: 'docker',
      name: 'rabbitmq-1',
      labels: {
        'com.docker.compose.service': 'rabbitmq',
        'com.docker.compose.project': 'message-queues'
      },
      metadata: {
        image: 'rabbitmq:3.9-management',
        status: 'running',
        ports: ['5672:5672', '15672:15672']
      }
    }
  ],
  
  kubernetes: [
    {
      id: 'pod-1',
      type: 'kubernetes',
      name: 'kafka-0',
      namespace: 'messaging',
      labels: {
        app: 'kafka',
        'app.kubernetes.io/name': 'kafka',
        'app.kubernetes.io/instance': 'kafka-prod'
      },
      metadata: {
        uid: 'abc123',
        resourceVersion: '12345',
        containers: [{
          name: 'kafka',
          image: 'confluentinc/cp-kafka:7.0.1',
          ports: [{ containerPort: 9092, protocol: 'TCP' }]
        }]
      }
    }
  ]
};

const streamingEvents = {
  validEvent: {
    eventType: 'MessageQueueCluster',
    timestamp: Date.now(),
    guid: 'MQC_test-cluster',
    provider: 'kafka',
    metrics: {
      'mq.cluster.health': 100,
      'mq.cluster.throughput': 1000
    }
  },
  
  invalidEvent: {
    eventType: 'InvalidType',
    timestamp: 'not-a-timestamp',
    // Missing required fields
  },
  
  batchEvents: (count = 10) => {
    const events = [];
    const baseTime = Date.now();
    
    for (let i = 0; i < count; i++) {
      events.push({
        eventType: 'MessageQueueCluster',
        timestamp: baseTime + (i * 1000),
        guid: `MQC_cluster_${i}`,
        provider: i % 2 === 0 ? 'kafka' : 'rabbitmq',
        metrics: {
          'mq.cluster.health': 95 + Math.random() * 5,
          'mq.cluster.throughput': 1000 + Math.random() * 1000
        }
      });
    }
    
    return events;
  }
};

const modeConfigurations = {
  simulation: {
    mode: 'simulation',
    simulation: {
      enabled: true,
      interval: 30000,
      providers: ['kafka', 'rabbitmq']
    },
    infrastructure: {
      enabled: false
    }
  },
  
  infrastructure: {
    mode: 'infrastructure',
    simulation: {
      enabled: false
    },
    infrastructure: {
      enabled: true,
      discoveryInterval: 60000,
      providers: ['docker', 'kubernetes']
    }
  },
  
  hybrid: {
    mode: 'hybrid',
    simulation: {
      enabled: true,
      interval: 30000,
      providers: ['kafka']
    },
    infrastructure: {
      enabled: true,
      discoveryInterval: 60000,
      providers: ['docker']
    }
  }
};

const performanceTestData = {
  // Large batch for throughput testing
  largeBatch: (size = 1000) => {
    const events = [];
    for (let i = 0; i < size; i++) {
      events.push({
        eventType: 'MessageQueueCluster',
        timestamp: Date.now(),
        guid: `MQC_perf_${i}`,
        provider: 'kafka',
        metrics: {
          'mq.cluster.health': Math.random() * 100,
          'mq.cluster.throughput': Math.random() * 10000,
          'mq.cluster.lag': Math.random() * 1000,
          'mq.cluster.error.rate': Math.random(),
          'mq.cluster.availability': 95 + Math.random() * 5
        }
      });
    }
    return events;
  },
  
  // Complex transformation data
  complexResource: {
    id: 'complex-kafka-cluster',
    type: 'kafka',
    metadata: {
      version: '2.8.0',
      brokers: Array(10).fill(null).map((_, i) => ({
        id: i,
        host: `broker${i}.kafka.local`,
        port: 9092,
        rack: `rack-${i % 3}`
      })),
      topics: Array(50).fill(null).map((_, i) => ({
        name: `topic-${i}`,
        partitions: 3,
        replicationFactor: 2,
        configs: {
          'retention.ms': '604800000',
          'compression.type': 'snappy'
        }
      })),
      metrics: {
        cluster: {
          messagesPerSec: 15000,
          bytesInPerSec: 5242880,
          bytesOutPerSec: 4194304
        }
      }
    }
  }
};

module.exports = {
  testEntities,
  testMetrics,
  infrastructureResources,
  streamingEvents,
  modeConfigurations,
  performanceTestData
};