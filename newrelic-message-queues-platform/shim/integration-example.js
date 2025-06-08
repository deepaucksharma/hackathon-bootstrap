/**
 * SHIM Layer Integration Example
 * 
 * Demonstrates how the SHIM layer integrates with the Foundation layer
 * to transform infrastructure data into MESSAGE_QUEUE entities.
 */

const { createOrchestrator, createValidator } = require('./index');

// Example infrastructure discovery data
const kafkaInfrastructureData = {
  kubernetes: {
    statefulsets: [
      {
        metadata: {
          name: 'kafka-cluster',
          namespace: 'messaging',
          uid: 'k8s-sts-123',
          labels: {
            app: 'kafka',
            environment: 'production',
            region: 'us-east-1'
          }
        },
        spec: {
          replicas: 3
        },
        pods: [
          {
            metadata: {
              name: 'kafka-cluster-0',
              namespace: 'messaging'
            },
            spec: {
              nodeName: 'k8s-node-1'
            },
            status: {
              phase: 'Running',
              podIP: '10.0.1.10'
            }
          },
          {
            metadata: {
              name: 'kafka-cluster-1',
              namespace: 'messaging'
            },
            spec: {
              nodeName: 'k8s-node-2'
            },
            status: {
              phase: 'Running',
              podIP: '10.0.1.11'
            }
          },
          {
            metadata: {
              name: 'kafka-cluster-2',
              namespace: 'messaging'
            },
            spec: {
              nodeName: 'k8s-node-3'
            },
            status: {
              phase: 'Running',
              podIP: '10.0.1.12'
            }
          }
        ]
      }
    ]
  },
  kafka: {
    clusters: [
      {
        clusterId: 'prod-kafka-001',
        clusterName: 'production-kafka',
        controllerId: 0,
        kafkaVersion: '3.4.0'
      }
    ],
    brokers: [
      {
        brokerId: 0,
        host: '10.0.1.10',
        port: 9092,
        rack: 'us-east-1a',
        listeners: ['PLAINTEXT://10.0.1.10:9092'],
        logDirs: ['/var/kafka-logs'],
        metrics: {
          'kafka.broker.BrokerTopicMetrics.MessagesInPerSec': 1523.4,
          'kafka.broker.BrokerTopicMetrics.BytesInPerSec': 2048576,
          'kafka.broker.ReplicaManager.LeaderCount': 45
        }
      },
      {
        brokerId: 1,
        host: '10.0.1.11',
        port: 9092,
        rack: 'us-east-1b',
        listeners: ['PLAINTEXT://10.0.1.11:9092'],
        logDirs: ['/var/kafka-logs'],
        metrics: {
          'kafka.broker.BrokerTopicMetrics.MessagesInPerSec': 1489.2,
          'kafka.broker.BrokerTopicMetrics.BytesInPerSec': 1987456,
          'kafka.broker.ReplicaManager.LeaderCount': 42
        }
      },
      {
        brokerId: 2,
        host: '10.0.1.12',
        port: 9092,
        rack: 'us-east-1c',
        listeners: ['PLAINTEXT://10.0.1.12:9092'],
        logDirs: ['/var/kafka-logs'],
        metrics: {
          'kafka.broker.BrokerTopicMetrics.MessagesInPerSec': 1556.8,
          'kafka.broker.BrokerTopicMetrics.BytesInPerSec': 2156789,
          'kafka.broker.ReplicaManager.LeaderCount': 48
        }
      }
    ],
    topics: [
      {
        topic: 'orders',
        partitionCount: 12,
        replicationFactor: 3,
        config: {
          'retention.ms': '604800000',
          'compression.type': 'snappy'
        },
        metrics: {
          'MessagesInPerSec': 523.4,
          'BytesInPerSec': 1048576
        }
      },
      {
        topic: 'events',
        partitionCount: 24,
        replicationFactor: 3,
        config: {
          'retention.ms': '259200000',
          'compression.type': 'lz4'
        },
        metrics: {
          'MessagesInPerSec': 1892.7,
          'BytesInPerSec': 4194304
        }
      }
    ]
  }
};

const rabbitmqInfrastructureData = {
  docker: {
    containers: [
      {
        id: 'container-rmq-1',
        name: 'rabbitmq-node-1',
        image: 'rabbitmq:3.11-management',
        state: 'running',
        hostname: 'rabbit1',
        env: [
          { name: 'RABBITMQ_NODENAME', value: 'rabbit@rabbit1' },
          { name: 'RABBITMQ_CLUSTER_NAME', value: 'production-rabbitmq' }
        ],
        ports: [
          { containerPort: 5672, name: 'amqp' },
          { containerPort: 15672, name: 'management' }
        ],
        networkSettings: {
          ipAddress: '172.17.0.2'
        },
        labels: {
          'rabbitmq.cluster': 'production-rabbitmq',
          'environment': 'production'
        }
      },
      {
        id: 'container-rmq-2',
        name: 'rabbitmq-node-2',
        image: 'rabbitmq:3.11-management',
        state: 'running',
        hostname: 'rabbit2',
        env: [
          { name: 'RABBITMQ_NODENAME', value: 'rabbit@rabbit2' },
          { name: 'RABBITMQ_CLUSTER_NAME', value: 'production-rabbitmq' }
        ],
        ports: [
          { containerPort: 5672, name: 'amqp' },
          { containerPort: 15672, name: 'management' }
        ],
        networkSettings: {
          ipAddress: '172.17.0.3'
        },
        labels: {
          'rabbitmq.cluster': 'production-rabbitmq',
          'environment': 'production'
        }
      }
    ]
  },
  rabbitmq: {
    overview: {
      cluster_name: 'production-rabbitmq',
      rabbitmq_version: '3.11.16',
      erlang_version: '25.3.2',
      management_version: '3.11.16'
    },
    nodes: [
      {
        name: 'rabbit@rabbit1',
        type: 'disc',
        running: true,
        mem_limit: 838860800,
        mem_used: 125829120,
        disk_free_limit: 50000000,
        disk_free: 8589934592,
        fd_used: 54,
        fd_total: 1048576,
        sockets_used: 12,
        sockets_total: 943626
      },
      {
        name: 'rabbit@rabbit2',
        type: 'disc',
        running: true,
        mem_limit: 838860800,
        mem_used: 115343360,
        disk_free_limit: 50000000,
        disk_free: 7516192768,
        fd_used: 48,
        fd_total: 1048576,
        sockets_used: 10,
        sockets_total: 943626
      }
    ],
    vhosts: [
      {
        name: '/',
        tracing: false,
        message_stats: {
          publish: 234,
          deliver: 231,
          confirm: 234
        }
      },
      {
        name: '/production',
        tracing: false,
        message_stats: {
          publish: 1567,
          deliver: 1543,
          confirm: 1567
        }
      }
    ],
    queues: [
      {
        name: 'order-processing',
        vhost: '/production',
        durable: true,
        auto_delete: false,
        exclusive: false,
        node: 'rabbit@rabbit1',
        state: 'running',
        consumers: 5,
        messages: 42,
        messages_ready: 12,
        messages_unacknowledged: 30,
        message_stats: {
          publish: 523,
          deliver: 518,
          ack: 516
        }
      },
      {
        name: 'notifications',
        vhost: '/production',
        durable: true,
        auto_delete: false,
        exclusive: false,
        node: 'rabbit@rabbit2',
        state: 'running',
        consumers: 3,
        messages: 156,
        messages_ready: 89,
        messages_unacknowledged: 67,
        message_stats: {
          publish: 892,
          deliver: 834,
          ack: 831
        }
      }
    ]
  }
};

// Example integration function
async function demonstrateShimIntegration() {
  console.log('=== SHIM Layer Integration Example ===\n');
  
  // Create orchestrator
  const orchestrator = createOrchestrator({
    enabledProviders: ['kafka', 'rabbitmq'],
    validation: {
      enabled: true,
      strict: false
    }
  });
  
  // Create validator
  const validator = createValidator({
    strictMode: false,
    validateMetrics: true,
    validateRelationships: true
  });
  
  // Set up event listeners
  orchestrator.on('initialized', (event) => {
    console.log('Orchestrator initialized with adapters:', event.adapters);
  });
  
  orchestrator.on('transformation:start', (event) => {
    console.log(`\nStarting transformation for ${event.provider}...`);
  });
  
  orchestrator.on('transformation:complete', (event) => {
    console.log(`Transformation complete:
      - Entities: ${event.entityCount}
      - Metrics: ${event.metricCount}
      - Relationships: ${event.relationshipCount}`);
  });
  
  orchestrator.on('adapter:transformation:success', (event) => {
    console.log(`  ✓ ${event.provider} adapter processed in ${event.duration}ms`);
  });
  
  try {
    // Initialize orchestrator
    await orchestrator.initialize();
    
    // Transform Kafka infrastructure data
    console.log('\n--- Transforming Kafka Infrastructure Data ---');
    const kafkaResult = await orchestrator.transform('kafka', kafkaInfrastructureData);
    
    // Validate Kafka results
    const kafkaValidation = validator.validateTransformationResult(kafkaResult);
    console.log('\nKafka Validation:', kafkaValidation.valid ? 'PASSED' : 'FAILED');
    if (kafkaValidation.warnings.length > 0) {
      console.log('Warnings:', kafkaValidation.warnings);
    }
    
    // Display Kafka entities
    console.log('\nKafka Entities Created:');
    kafkaResult.entities.forEach(entity => {
      console.log(`  - ${entity.entityType}: ${entity.name} (${entity.guid})`);
    });
    
    // Transform RabbitMQ infrastructure data
    console.log('\n--- Transforming RabbitMQ Infrastructure Data ---');
    const rabbitmqResult = await orchestrator.transform('rabbitmq', rabbitmqInfrastructureData);
    
    // Validate RabbitMQ results
    const rabbitmqValidation = validator.validateTransformationResult(rabbitmqResult);
    console.log('\nRabbitMQ Validation:', rabbitmqValidation.valid ? 'PASSED' : 'FAILED');
    if (rabbitmqValidation.warnings.length > 0) {
      console.log('Warnings:', rabbitmqValidation.warnings);
    }
    
    // Display RabbitMQ entities
    console.log('\nRabbitMQ Entities Created:');
    rabbitmqResult.entities.forEach(entity => {
      console.log(`  - ${entity.entityType}: ${entity.name} (${entity.guid})`);
    });
    
    // Batch transformation example
    console.log('\n--- Batch Transformation Example ---');
    const batchResult = await orchestrator.batchTransform([
      { provider: 'kafka', data: kafkaInfrastructureData },
      { provider: 'rabbitmq', data: rabbitmqInfrastructureData }
    ]);
    
    console.log(`\nBatch Results:
      - Successful: ${batchResult.successful.length}
      - Failed: ${batchResult.failed.length}
      - Total Entities: ${batchResult.entities.length}
      - Total Metrics: ${batchResult.metrics.length}
      - Total Relationships: ${batchResult.relationships.length}`);
    
    // Demonstrate Foundation layer integration
    console.log('\n--- Foundation Layer Integration ---');
    
    // Mock foundation transformer for demonstration
    const mockFoundationTransformer = {
      transform: async (data) => {
        console.log(`Foundation layer received:
          - Source: ${data.source}
          - Provider: ${data.provider}
          - Entities: ${data.entities?.length || 0}
          - Metrics: ${data.metrics?.length || 0}`);
        return { success: true };
      }
    };
    
    // Connect to foundation layer
    orchestrator.connectToFoundation(mockFoundationTransformer);
    
    // Transform with foundation integration
    console.log('\nTransforming with Foundation integration...');
    await orchestrator.transform('kafka', kafkaInfrastructureData);
    
    // Get health status
    console.log('\n--- Health Status ---');
    const health = orchestrator.getHealth();
    console.log(JSON.stringify(health, null, 2));
    
    // Create validation report
    console.log('\n--- Validation Report ---');
    const report = validator.createReport(kafkaValidation);
    console.log(report);
    
  } catch (error) {
    console.error('Error during demonstration:', error);
  } finally {
    // Shutdown
    await orchestrator.shutdown();
    console.log('\n=== Example Complete ===');
  }
}

// Run the example if called directly
if (require.main === module) {
  demonstrateShimIntegration().catch(console.error);
}

module.exports = {
  demonstrateShimIntegration,
  sampleData: {
    kafka: kafkaInfrastructureData,
    rabbitmq: rabbitmqInfrastructureData
  }
};