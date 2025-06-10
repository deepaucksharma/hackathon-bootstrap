#!/usr/bin/env node

/**
 * Test Entity Synthesis Engine
 */

const EntitySynthesisEngine = require('./core/entity-synthesis/entity-synthesis-engine');
const chalk = require('chalk');

async function test() {
  console.log(chalk.blue('Testing Entity Synthesis Engine...\n'));
  
  const engine = new EntitySynthesisEngine({
    accountId: '123456',
    provider: 'kafka',
    environment: 'test'
  });
  
  // Test data
  const rawData = {
    clusters: [{
      eventType: 'KafkaClusterSample',
      clusterName: 'test-cluster',
      'cluster.brokersCount': 3,
      'cluster.topicsCount': 2,
      'cluster.partitionsCount': 10
    }],
    brokers: [{
      eventType: 'KafkaBrokerSample',
      hostname: 'broker-1.test',
      clusterName: 'test-cluster',
      'broker.id': 1,
      'broker.bytesInPerSecond': 1000,
      'broker.bytesOutPerSecond': 2000,
      'jvm.heapUsed': 500000000,
      'jvm.heapMax': 1000000000,
      'request.handlerIdle': 90
    }],
    topics: [{
      eventType: 'KafkaTopicSample',
      topic: 'test-topic',
      clusterName: 'test-cluster',
      'topic.messagesInPerSecond': 100,
      'topic.bytesInPerSecond': 100000,
      'topic.bytesOutPerSecond': 200000,
      'topic.partitionsCount': 5,
      'topic.replicationFactor': 3
    }],
    consumerGroups: [{
      eventType: 'KafkaConsumerSample',
      'consumer.group.id': 'test-group',
      'consumer.clientId': 'test-client-1',
      topic: 'test-topic',
      clusterName: 'test-cluster',
      'consumer.lag': 1000,
      'consumer.messageRate': 50,
      'consumer.bytesConsumedRate': 50000
    }]
  };
  
  try {
    const result = await engine.synthesize(rawData);
    
    console.log(chalk.green('\n✅ Synthesis completed successfully!'));
    console.log(chalk.gray(`   Entities: ${result.entities.length}`));
    console.log(chalk.gray(`   Relationships: ${result.relationships.length}`));
    
    // Show entity types
    const entityTypes = {};
    result.entities.forEach(e => {
      entityTypes[e.entityType] = (entityTypes[e.entityType] || 0) + 1;
    });
    
    console.log(chalk.blue('\nEntity Types:'));
    Object.entries(entityTypes).forEach(([type, count]) => {
      console.log(chalk.gray(`   ${type}: ${count}`));
    });
    
    // Show sample entity
    console.log(chalk.blue('\nSample Entity:'));
    const sampleEntity = result.entities[0];
    console.log(JSON.stringify(sampleEntity, null, 2));
    
  } catch (error) {
    console.error(chalk.red('❌ Test failed:'), error);
    console.error(error.stack);
  }
}

test();