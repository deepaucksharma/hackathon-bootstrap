#!/usr/bin/env node

/**
 * Test SHIM Layer
 * 
 * Verifies that the SHIM layer correctly transforms infrastructure data
 * into MESSAGE_QUEUE entities.
 */

const { createOrchestrator, createValidator, quickTransform } = require('./index');

// Test data
const testData = {
  kafka: {
    kubernetes: {
      statefulsets: [{
        metadata: {
          name: 'test-kafka',
          namespace: 'default',
          uid: 'test-123',
          labels: { app: 'kafka', environment: 'test' }
        },
        spec: { replicas: 1 },
        pods: [{
          metadata: { name: 'test-kafka-0' },
          spec: { nodeName: 'test-node' },
          status: { phase: 'Running', podIP: '10.0.0.1' }
        }]
      }]
    },
    kafka: {
      brokers: [{
        brokerId: 0,
        host: '10.0.0.1',
        port: 9092,
        metrics: {
          'kafka.broker.BrokerTopicMetrics.MessagesInPerSec': 100
        }
      }],
      topics: [{
        topic: 'test-topic',
        partitionCount: 3,
        replicationFactor: 1
      }]
    }
  },
  rabbitmq: {
    docker: {
      containers: [{
        id: 'test-rmq',
        name: 'rabbitmq-test',
        image: 'rabbitmq:3.11',
        state: 'running',
        hostname: 'rabbit-test',
        env: [{ name: 'RABBITMQ_NODENAME', value: 'rabbit@test' }],
        ports: [{ containerPort: 5672 }],
        networkSettings: { ipAddress: '172.17.0.2' }
      }]
    },
    rabbitmq: {
      overview: {
        cluster_name: 'test-cluster',
        rabbitmq_version: '3.11.0'
      },
      nodes: [{
        name: 'rabbit@test',
        type: 'disc',
        running: true,
        mem_used: 100000000,
        disk_free: 1000000000
      }],
      queues: [{
        name: 'test-queue',
        vhost: '/',
        durable: true,
        node: 'rabbit@test',
        messages: 10,
        consumers: 2
      }]
    }
  }
};

async function runTests() {
  console.log('=== SHIM Layer Test Suite ===\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Basic Kafka transformation
  console.log('Test 1: Basic Kafka transformation');
  try {
    const result = await quickTransform('kafka', testData.kafka, {
      validate: true
    });
    
    if (result.entities.length > 0 && result.metrics.length > 0) {
      console.log('✓ Kafka transformation successful');
      console.log(`  - Entities: ${result.entities.length}`);
      console.log(`  - Metrics: ${result.metrics.length}`);
      console.log(`  - Relationships: ${result.relationships.length}`);
      passed++;
    } else {
      throw new Error('No entities or metrics generated');
    }
  } catch (error) {
    console.log('✗ Kafka transformation failed:', error.message);
    failed++;
  }
  
  // Test 2: Basic RabbitMQ transformation
  console.log('\nTest 2: Basic RabbitMQ transformation');
  try {
    const result = await quickTransform('rabbitmq', testData.rabbitmq, {
      validate: true
    });
    
    if (result.entities.length > 0) {
      console.log('✓ RabbitMQ transformation successful');
      console.log(`  - Entities: ${result.entities.length}`);
      console.log(`  - Metrics: ${result.metrics.length}`);
      console.log(`  - Relationships: ${result.relationships.length}`);
      passed++;
    } else {
      throw new Error('No entities generated');
    }
  } catch (error) {
    console.log('✗ RabbitMQ transformation failed:', error.message);
    failed++;
  }
  
  // Test 3: Orchestrator initialization
  console.log('\nTest 3: Orchestrator initialization');
  try {
    const orchestrator = createOrchestrator({
      enabledProviders: ['kafka', 'rabbitmq']
    });
    
    await orchestrator.initialize();
    const health = orchestrator.getHealth();
    
    if (health.orchestrator.initialized && 
        health.adapters.kafka && 
        health.adapters.rabbitmq) {
      console.log('✓ Orchestrator initialized successfully');
      passed++;
    } else {
      throw new Error('Orchestrator not properly initialized');
    }
    
    await orchestrator.shutdown();
  } catch (error) {
    console.log('✗ Orchestrator initialization failed:', error.message);
    failed++;
  }
  
  // Test 4: Batch transformation
  console.log('\nTest 4: Batch transformation');
  try {
    const orchestrator = createOrchestrator();
    await orchestrator.initialize();
    
    const batchResult = await orchestrator.batchTransform([
      { provider: 'kafka', data: testData.kafka },
      { provider: 'rabbitmq', data: testData.rabbitmq }
    ]);
    
    if (batchResult.successful.length === 2 && 
        batchResult.entities.length > 0) {
      console.log('✓ Batch transformation successful');
      console.log(`  - Successful: ${batchResult.successful.length}`);
      console.log(`  - Total entities: ${batchResult.entities.length}`);
      passed++;
    } else {
      throw new Error('Batch transformation incomplete');
    }
    
    await orchestrator.shutdown();
  } catch (error) {
    console.log('✗ Batch transformation failed:', error.message);
    failed++;
  }
  
  // Test 5: Validation
  console.log('\nTest 5: Validation');
  try {
    const validator = createValidator({ strictMode: true });
    
    // Test valid result
    const validResult = {
      entities: [{
        guid: '123456|MQ|CLUSTER|test-cluster',
        entityType: 'MESSAGE_QUEUE_CLUSTER',
        name: 'test-cluster'
      }],
      metrics: [{
        name: 'test.metric',
        value: 100,
        timestamp: Date.now(),
        attributes: {}
      }],
      relationships: []
    };
    
    const validation = validator.validateTransformationResult(validResult);
    
    if (validation.valid) {
      console.log('✓ Validation working correctly');
      passed++;
    } else {
      throw new Error('Valid result failed validation');
    }
  } catch (error) {
    console.log('✗ Validation failed:', error.message);
    failed++;
  }
  
  // Test 6: Error handling
  console.log('\nTest 6: Error handling');
  try {
    const result = await quickTransform('kafka', { invalid: 'data' }, {
      validate: false
    });
    console.log('✗ Error handling failed - should have thrown');
    failed++;
  } catch (error) {
    console.log('✓ Error handling working correctly');
    console.log(`  - Error caught: ${error.message}`);
    passed++;
  }
  
  // Test 7: Entity GUID format
  console.log('\nTest 7: Entity GUID format');
  try {
    const result = await quickTransform('kafka', testData.kafka);
    
    const validGuidPattern = /^[A-Za-z0-9]+\|(INFRA|MQ)\|(MESSAGE_QUEUE_[A-Z_]+)\|[A-Za-z0-9\-._]+$/;
    const allGuidsValid = result.entities.every(e => 
      validGuidPattern.test(e.guid)
    );
    
    if (allGuidsValid) {
      console.log('✓ All entity GUIDs have correct format');
      result.entities.forEach(e => {
        console.log(`  - ${e.entityType}: ${e.guid}`);
      });
      passed++;
    } else {
      console.log('Invalid GUIDs found:');
      result.entities.forEach(e => {
        console.log(`  - ${e.entityType}: ${e.guid} (valid: ${validGuidPattern.test(e.guid)})`);
      });
      throw new Error('Invalid GUID format found');
    }
  } catch (error) {
    console.log('✗ Entity GUID format test failed:', error.message);
    failed++;
  }
  
  // Test 8: Metric attributes
  console.log('\nTest 8: Metric attributes');
  try {
    const result = await quickTransform('kafka', testData.kafka);
    
    const allMetricsHaveProvider = result.metrics.every(m => 
      m.attributes && m.attributes.provider === 'kafka'
    );
    
    if (allMetricsHaveProvider && result.metrics.length > 0) {
      console.log('✓ All metrics have correct provider attribute');
      console.log(`  - Total metrics: ${result.metrics.length}`);
      passed++;
    } else {
      throw new Error('Metrics missing provider attribute');
    }
  } catch (error) {
    console.log('✗ Metric attributes test failed:', error.message);
    failed++;
  }
  
  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Total tests: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
if (require.main === module) {
  runTests().catch(error => {
    console.error('Test suite error:', error);
    process.exit(1);
  });
}

module.exports = { runTests, testData };