/**
 * Basic Transformation Example
 * 
 * Demonstrates how to use the foundation layer to transform
 * infrastructure data into MESSAGE_QUEUE entities.
 */

const { createTransformer, HookManager } = require('../index');

async function runExample() {
  console.log('Foundation Layer - Basic Transformation Example\n');

  // 1. Create transformer with configuration
  const transformer = createTransformer({
    enableValidation: true,
    enableOptimization: true,
    generateRelationships: true,
    kafka: {
      includeInternalTopics: false,
      defaultPartitionCount: 12
    },
    rabbitmq: {
      includeSystemQueues: false,
      mapExchangesToTopics: true
    }
  });

  // 2. Create hook manager for lifecycle events
  const hookManager = new HookManager();

  // 3. Register hooks for transformation events
  hookManager.registerHook('pre-transform', async (data) => {
    console.log('Pre-transform hook: Starting transformation for', data.provider);
    return data;
  });

  hookManager.registerHook('post-transform', async (data) => {
    console.log('Post-transform hook: Completed transformation');
    console.log(`- Clusters: ${data.entities.clusters.length}`);
    console.log(`- Brokers: ${data.entities.brokers.length}`);
    console.log(`- Topics: ${data.entities.topics.length}`);
    console.log(`- Queues: ${data.entities.queues.length}`);
    return data;
  });

  // 4. Example Kafka infrastructure data
  const kafkaData = {
    provider: 'kafka',
    clusterId: 'prod-kafka-cluster',
    clusterName: 'Production Kafka',
    region: 'us-east-1',
    kafkaVersion: '3.5.0',
    clusterMetrics: {
      'broker.count': 3,
      'topic.count': 25,
      'partition.count': 300,
      'under.replicated.partitions': 0
    },
    brokers: [
      {
        id: 1,
        host: 'kafka-broker-1.example.com',
        port: 9092,
        rack: 'rack-1',
        metrics: {
          'bytes.in.per.sec': 1024000,
          'bytes.out.per.sec': 2048000,
          'messages.in.per.sec': 1000,
          'partitions': 100,
          'leaders': 95
        }
      },
      {
        id: 2,
        host: 'kafka-broker-2.example.com',
        port: 9092,
        rack: 'rack-2',
        metrics: {
          'bytes.in.per.sec': 1024000,
          'bytes.out.per.sec': 2048000,
          'messages.in.per.sec': 1000,
          'partitions': 100,
          'leaders': 100
        }
      },
      {
        id: 3,
        host: 'kafka-broker-3.example.com',
        port: 9092,
        rack: 'rack-3',
        metrics: {
          'bytes.in.per.sec': 1024000,
          'bytes.out.per.sec': 2048000,
          'messages.in.per.sec': 1000,
          'partitions': 100,
          'leaders': 105
        }
      }
    ],
    topics: [
      {
        name: 'orders',
        partitions: 12,
        replicationFactor: 3,
        config: {
          'retention.ms': '604800000',
          'cleanup.policy': 'delete'
        },
        metrics: {
          'bytes.in.per.sec': 512000,
          'bytes.out.per.sec': 1024000,
          'messages.in.per.sec': 500
        }
      },
      {
        name: 'payments',
        partitions: 12,
        replicationFactor: 3,
        config: {
          'retention.ms': '604800000',
          'cleanup.policy': 'delete'
        },
        metrics: {
          'bytes.in.per.sec': 256000,
          'bytes.out.per.sec': 512000,
          'messages.in.per.sec': 250
        }
      }
    ]
  };

  // 5. Transform Kafka data
  console.log('\n=== Transforming Kafka Data ===');
  
  // Execute pre-transform hook
  const preprocessedData = await hookManager.executeHooks('pre-transform', kafkaData);
  
  // Perform transformation
  const transformedKafka = await transformer.transform(preprocessedData);
  
  // Execute post-transform hook
  const postprocessedData = await hookManager.executeHooks('post-transform', transformedKafka);

  console.log('\nKafka Transformation Results:');
  console.log('- Provider:', postprocessedData.provider);
  console.log('- Transformed at:', postprocessedData.metadata.transformedAt);
  console.log('- Golden Metrics:', JSON.stringify(postprocessedData.goldenMetrics?.clusters, null, 2));

  // 6. Example RabbitMQ infrastructure data
  const rabbitMQData = {
    provider: 'rabbitmq',
    overview: {
      cluster_name: 'prod-rabbitmq',
      rabbitmq_version: '3.12.0',
      erlang_version: '25.3',
      message_stats: {
        publish: 1000,
        deliver: 950,
        ack: 940
      },
      queue_totals: {
        messages: 5000,
        messages_ready: 4500,
        messages_unacknowledged: 500
      },
      object_totals: {
        queues: 20,
        exchanges: 10,
        connections: 50,
        channels: 100,
        consumers: 75
      }
    },
    nodes: [
      {
        name: 'rabbit@rabbitmq-1',
        type: 'disc',
        running: true,
        mem_used: 1073741824, // 1GB
        mem_limit: 4294967296, // 4GB
        disk_free: 10737418240, // 10GB
        disk_free_limit: 1073741824, // 1GB
        fd_used: 100,
        fd_total: 1024,
        sockets_used: 50,
        sockets_total: 512
      }
    ],
    queues: [
      {
        name: 'order-processing',
        vhost: '/',
        node: 'rabbit@rabbitmq-1',
        messages: 1000,
        messages_ready: 900,
        messages_unacknowledged: 100,
        consumers: 5,
        message_stats: {
          publish: 100,
          deliver: 95,
          ack: 94
        }
      },
      {
        name: 'email-notifications',
        vhost: '/',
        node: 'rabbit@rabbitmq-1',
        messages: 500,
        messages_ready: 450,
        messages_unacknowledged: 50,
        consumers: 2,
        message_stats: {
          publish: 50,
          deliver: 48,
          ack: 47
        }
      }
    ]
  };

  // 7. Transform RabbitMQ data
  console.log('\n=== Transforming RabbitMQ Data ===');
  
  const transformedRabbitMQ = await transformer.transform(rabbitMQData);

  console.log('\nRabbitMQ Transformation Results:');
  console.log('- Provider:', transformedRabbitMQ.provider);
  console.log('- Cluster Health Score:', transformedRabbitMQ.entities.clusters[0]?.healthScore);
  console.log('- Resource Utilization:', transformedRabbitMQ.entities.clusters[0]?.resourceUtilization);

  // 8. Demonstrate batch transformation
  console.log('\n=== Batch Transformation ===');
  
  const batchData = [kafkaData, rabbitMQData];
  const batchResults = await transformer.transformBatch(batchData);

  console.log('\nBatch Results:');
  console.log(`- Successful transformations: ${batchResults.results.length}`);
  console.log(`- Failed transformations: ${batchResults.errors.length}`);

  // 9. Get transformation statistics
  const stats = transformer.getStatistics();
  console.log('\n=== Transformation Statistics ===');
  console.log(JSON.stringify(stats, null, 2));

  // 10. Get hook statistics
  const hookStats = hookManager.getStatistics();
  console.log('\n=== Hook Statistics ===');
  console.log(JSON.stringify(hookStats, null, 2));
}

// Run the example
runExample().catch(console.error);