#!/usr/bin/env node

/**
 * Debug test for SHIM layer
 */

const { createOrchestrator } = require('./index');

const testData = {
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
};

async function debug() {
  const orchestrator = createOrchestrator({
    enabledProviders: ['kafka'],
    validation: { enabled: false } // Disable validation for debugging
  });
  
  orchestrator.on('adapter:transformation:success', (event) => {
    console.log('Transform success:', event);
  });
  
  orchestrator.on('adapter:transformation:error', (event) => {
    console.log('Transform error:', event);
  });
  
  try {
    await orchestrator.initialize();
    console.log('Orchestrator initialized');
    
    const result = await orchestrator.transform('kafka', testData);
    
    console.log('\nEntities created:');
    result.entities.forEach((entity, index) => {
      console.log(`\nEntity ${index}:`);
      console.log('  Type:', entity.entityType);
      console.log('  Name:', entity.name);
      console.log('  GUID:', entity.guid);
      console.log('  Host:', entity.host);
      console.log('  Port:', entity.port);
      console.log('  Tags:', entity.tags);
    });
    
    console.log('\nMetrics:');
    result.metrics.forEach(metric => {
      console.log(`  ${metric.name}: ${metric.value}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await orchestrator.shutdown();
  }
}

debug().catch(console.error);