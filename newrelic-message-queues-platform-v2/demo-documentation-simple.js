/**
 * Simple Demo Script: Pipeline Documentation Generation
 * 
 * This script demonstrates the pipeline documentation generation
 * without module resolution issues.
 */

import { PipelineDocumenter, PipelineDocumenterFactory } from './dist/infrastructure/documentation/pipeline-documenter.js';

async function runDemo() {
  console.log('=== Pipeline Documentation Demo (Simple) ===\n');

  // Create a mock logger
  const mockLogger = {
    debug: (msg, data) => console.log(`[DEBUG] ${msg}`, data || ''),
    info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
    warn: (msg) => console.log(`[WARN] ${msg}`),
    error: (msg, error) => console.error(`[ERROR] ${msg}`, error)
  };

  // Create the pipeline documenter
  const documenter = new PipelineDocumenter(mockLogger, './pipeline-documentation-demo');

  // Simulate raw data collection
  console.log('\n1. Capturing Raw Data Stage...');
  const rawData = {
    brokers: [
      {
        eventType: 'KafkaBrokerSample',
        'broker.id': 1,
        hostname: 'kafka-broker-1.example.com',
        'broker.bytesInPerSecond': 10485760,
        'broker.bytesOutPerSecond': 8388608,
        'broker.messagesInPerSecond': 1000
      },
      {
        eventType: 'KafkaBrokerSample',
        'broker.id': 2,
        hostname: 'kafka-broker-2.example.com',
        'broker.bytesInPerSecond': 12582912,
        'broker.bytesOutPerSecond': 10485760,
        'broker.messagesInPerSecond': 1200
      }
    ],
    topics: [
      {
        eventType: 'KafkaTopicSample',
        topic: 'orders',
        'topic.messagesInPerSecond': 500,
        'topic.bytesInPerSecond': 5242880,
        'topic.partitions': 3
      },
      {
        eventType: 'KafkaTopicSample',
        topic: 'payments',
        'topic.messagesInPerSecond': 300,
        'topic.bytesInPerSecond': 3145728,
        'topic.partitions': 2
      }
    ],
    consumerGroups: [
      {
        eventType: 'KafkaConsumerSample',
        consumerGroup: 'order-processor',
        'consumer.lag': 1500,
        'consumer.messageConsumptionPerSecond': 450
      },
      {
        eventType: 'KafkaConsumerSample',
        consumerGroup: 'payment-processor',
        'consumer.lag': 800,
        'consumer.messageConsumptionPerSecond': 280
      }
    ]
  };
  
  documenter.captureRawData(rawData, 'simulation');
  console.log('✅ Raw data captured');

  // Simulate transformation stage
  console.log('\n2. Capturing Transformation Stage...');
  const transformedEntities = [
    {
      guid: 'ACCOUNT_ID|INFRA|MESSAGE_QUEUE_BROKER|broker-1',
      entityType: 'MESSAGE_QUEUE_BROKER',
      displayName: 'kafka-broker-1',
      hostname: 'kafka-broker-1.example.com',
      'broker.throughput.in': 10485760,
      'broker.throughput.out': 8388608
    },
    {
      guid: 'ACCOUNT_ID|INFRA|MESSAGE_QUEUE_BROKER|broker-2',
      entityType: 'MESSAGE_QUEUE_BROKER',
      displayName: 'kafka-broker-2',
      hostname: 'kafka-broker-2.example.com',
      'broker.throughput.in': 12582912,
      'broker.throughput.out': 10485760
    },
    {
      guid: 'ACCOUNT_ID|INFRA|MESSAGE_QUEUE_TOPIC|topic-orders',
      entityType: 'MESSAGE_QUEUE_TOPIC',
      displayName: 'orders',
      'topic.throughput.messages': 500,
      'topic.throughput.bytes': 5242880
    },
    {
      guid: 'ACCOUNT_ID|INFRA|MESSAGE_QUEUE_TOPIC|topic-payments',
      entityType: 'MESSAGE_QUEUE_TOPIC',
      displayName: 'payments',
      'topic.throughput.messages': 300,
      'topic.throughput.bytes': 3145728
    }
  ];

  const transformationStats = {
    fieldMappings: 20,
    validations: 12,
    enrichments: 8
  };

  documenter.captureTransformedData(transformedEntities, transformationStats);
  console.log('✅ Transformed data captured');

  // Simulate synthesis stage
  console.log('\n3. Capturing Synthesis Stage...');
  const synthesizedEntities = transformedEntities.map(entity => ({
    ...entity,
    relationships: {
      HOSTED_BY: ['ACCOUNT_ID|INFRA|MESSAGE_QUEUE_CLUSTER|cluster-1']
    }
  }));

  const relationships = [
    {
      sourceGuid: 'ACCOUNT_ID|INFRA|MESSAGE_QUEUE_TOPIC|topic-orders',
      targetGuid: 'ACCOUNT_ID|INFRA|MESSAGE_QUEUE_BROKER|broker-1',
      type: 'HOSTED_BY'
    },
    {
      sourceGuid: 'ACCOUNT_ID|INFRA|MESSAGE_QUEUE_TOPIC|topic-payments',
      targetGuid: 'ACCOUNT_ID|INFRA|MESSAGE_QUEUE_BROKER|broker-2',
      type: 'HOSTED_BY'
    },
    {
      sourceGuid: 'ACCOUNT_ID|INFRA|MESSAGE_QUEUE_CONSUMER_GROUP|order-processor',
      targetGuid: 'ACCOUNT_ID|INFRA|MESSAGE_QUEUE_TOPIC|topic-orders',
      type: 'CONSUMES_FROM'
    },
    {
      sourceGuid: 'ACCOUNT_ID|INFRA|MESSAGE_QUEUE_CONSUMER_GROUP|payment-processor',
      targetGuid: 'ACCOUNT_ID|INFRA|MESSAGE_QUEUE_TOPIC|topic-payments',
      type: 'CONSUMES_FROM'
    }
  ];

  documenter.captureSynthesizedData(synthesizedEntities, relationships);
  console.log('✅ Synthesized data captured');

  // Generate the report
  console.log('\n4. Generating Documentation Report...');
  const reportPath = documenter.generateReport();

  console.log('\n✅ Pipeline documentation generated successfully!');
  console.log(`📄 Report location: ${reportPath}`);
  
  console.log('\n📊 Summary:');
  console.log('   - Raw Samples: 6 (2 brokers, 2 topics, 2 consumer groups)');
  console.log('   - Transformed Entities: 4');
  console.log('   - Synthesized Entities: 4');
  console.log('   - Relationships Created: 4');
  console.log('   - No percentage metrics included (as per requirements)');

  console.log('\n=== Demo Complete ===');
}

// Run the demo
runDemo().catch(error => {
  console.error('Error running demo:', error);
  process.exit(1);
});