#!/usr/bin/env node

/**
 * Integration Test for nri-kafka to MESSAGE_QUEUE Entity Transformation
 * 
 * This script demonstrates the complete pipeline:
 * 1. Mock nri-kafka data (simulating what comes from the minikube setup)
 * 2. Transform to MESSAGE_QUEUE entities
 * 3. Show the transformed entities
 */

const chalk = require('chalk');
const NriKafkaTransformer = require('./transformers/nri-kafka-transformer');

// Mock data simulating what nri-kafka would collect from minikube
const mockNriKafkaData = [
  // Broker samples
  {
    eventType: 'KafkaBrokerSample',
    'broker.id': '1',
    clusterName: 'minikube-kafka',
    kafkaVersion: '2.8.0',
    'broker.bytesInPerSecond': 1024.5,
    'broker.bytesOutPerSecond': 2048.7,
    'broker.messagesInPerSecond': 150.2,
    'net.requestsPerSecond': 75.1,
    'broker.underReplicatedPartitions': 0,
    'broker.offlinePartitionsCount': 0,
    'broker.IOWaitPercent': 5.2,
    'disk.usedPercent': 45.8,
    'broker.requestQueueSize': 12,
    'net.networkProcessorAvgIdlePercent': 85.3,
    environment: 'minikube'
  },
  
  // Topic samples
  {
    eventType: 'KafkaTopicSample',
    'topic.name': 'events',
    clusterName: 'minikube-kafka',
    'topic.bytesInPerSecond': 512.3,
    'topic.bytesOutPerSecond': 1024.6,
    'topic.messagesInPerSecond': 75.1,
    'topic.partitionCount': 3,
    'topic.replicationFactor': 1,
    'topic.retentionBytes': 1073741824, // 1GB
    'consumer.lag': 150,
    'consumer.totalGroups': 2
  },
  
  {
    eventType: 'KafkaTopicSample',
    'topic.name': 'metrics',
    clusterName: 'minikube-kafka',
    'topic.bytesInPerSecond': 256.1,
    'topic.bytesOutPerSecond': 512.2,
    'topic.messagesInPerSecond': 37.5,
    'topic.partitionCount': 6,
    'topic.replicationFactor': 1,
    'topic.retentionBytes': 536870912, // 512MB
    'consumer.lag': 75,
    'consumer.totalGroups': 1
  },
  
  {
    eventType: 'KafkaTopicSample',
    'topic.name': 'logs',
    clusterName: 'minikube-kafka',
    'topic.bytesInPerSecond': 128.0,
    'topic.bytesOutPerSecond': 256.1,
    'topic.messagesInPerSecond': 25.0,
    'topic.partitionCount': 3,
    'topic.replicationFactor': 1,
    'topic.retentionBytes': 268435456, // 256MB
    'consumer.lag': 50,
    'consumer.totalGroups': 1
  }
];

function displayEntity(entity, index) {
  console.log(chalk.cyan(`\n${index + 1}. ${entity.entityType}`));
  console.log(chalk.gray(`   GUID: ${entity.entityGuid}`));
  console.log(chalk.gray(`   Name: ${entity.displayName}`));
  console.log(chalk.gray(`   Provider: ${entity.provider}`));
  
  if (entity.brokerId) {
    console.log(chalk.gray(`   Broker ID: ${entity.brokerId}`));
  }
  
  if (entity.topicName) {
    console.log(chalk.gray(`   Topic Name: ${entity.topicName}`));
  }
  
  console.log(chalk.gray(`   Cluster: ${entity.clusterName}`));
  
  if (entity.metrics) {
    console.log(chalk.yellow('   Metrics:'));
    Object.entries(entity.metrics).forEach(([name, value]) => {
      const formattedValue = typeof value === 'number' ? value.toFixed(2) : value;
      console.log(chalk.gray(`     ${name}: ${formattedValue}`));
    });
  }
  
  if (entity.tags) {
    console.log(chalk.yellow('   Tags:'));
    Object.entries(entity.tags).forEach(([name, value]) => {
      console.log(chalk.gray(`     ${name}: ${value}`));
    });
  }
  
  if (entity.relationships && entity.relationships.length > 0) {
    console.log(chalk.yellow('   Relationships:'));
    entity.relationships.forEach(rel => {
      console.log(chalk.gray(`     ${rel.type} -> ${rel.targetEntityGuid}`));
    });
  }
}

function displayMetricsAsEvents(entities) {
  console.log(chalk.cyan('\n📊 Sample Events (for New Relic Events API):'));
  
  entities.slice(0, 2).forEach((entity, index) => {
    const event = {
      eventType: entity.entityType,
      timestamp: Date.now(),
      entityGuid: entity.entityGuid,
      entityName: entity.entityName || entity.displayName,
      provider: entity.provider,
      ...entity.metrics,
      ...entity.tags
    };
    
    console.log(chalk.gray(`\n${index + 1}. ${entity.entityType} Event:`));
    console.log(chalk.gray(JSON.stringify(event, null, 2)));
  });
}

function displayMetricsAsTimeseries(entities) {
  console.log(chalk.cyan('\n📈 Sample Metrics (for New Relic Metrics API):'));
  
  const metrics = [];
  const timestamp = Date.now();
  
  entities.forEach(entity => {
    Object.entries(entity.metrics || {}).forEach(([name, value]) => {
      metrics.push({
        name: `${entity.entityType.toLowerCase().replace(/_/g, '.')}.${name}`,
        type: 'gauge',
        value,
        timestamp,
        attributes: {
          entityGuid: entity.entityGuid,
          entityName: entity.entityName || entity.displayName,
          entityType: entity.entityType,
          provider: entity.provider
        }
      });
    });
  });
  
  // Show first few metrics
  metrics.slice(0, 5).forEach((metric, index) => {
    console.log(chalk.gray(`\n${index + 1}. ${metric.name}:`));
    console.log(chalk.gray(JSON.stringify(metric, null, 2)));
  });
  
  console.log(chalk.gray(`\n... and ${metrics.length - 5} more metrics`));
}

async function runIntegrationTest() {
  console.log(chalk.bold.magenta('\n🧪 nri-kafka to MESSAGE_QUEUE Entity Integration Test\n'));
  
  // Initialize transformer
  const accountId = '123456789'; // Mock account ID
  const transformer = new NriKafkaTransformer(accountId);
  
  console.log(chalk.cyan('🔧 Configuration:'));
  console.log(chalk.gray(`   Account ID: ${accountId}`));
  console.log(chalk.gray(`   Sample Data: ${mockNriKafkaData.length} nri-kafka samples`));
  
  // Show input data summary
  console.log(chalk.cyan('\n📥 Input Data (nri-kafka samples):'));
  const sampleTypes = mockNriKafkaData.reduce((acc, sample) => {
    acc[sample.eventType] = (acc[sample.eventType] || 0) + 1;
    return acc;
  }, {});
  
  Object.entries(sampleTypes).forEach(([type, count]) => {
    console.log(chalk.gray(`   - ${type}: ${count} samples`));
  });
  
  // Show sample nri-kafka data
  console.log(chalk.cyan('\n📝 Sample nri-kafka Data:'));
  console.log(chalk.gray(JSON.stringify(mockNriKafkaData[0], null, 2)));
  
  // Transform data
  console.log(chalk.cyan('\n🔄 Transforming to MESSAGE_QUEUE entities...\n'));
  
  try {
    const result = transformer.transformSamples(mockNriKafkaData);
    const entities = result.entities;
    
    console.log(chalk.green(`✅ Successfully created ${entities.length} MESSAGE_QUEUE entities\n`));
    
    // Show transformation stats
    console.log(chalk.cyan('📈 Transformation Statistics:'));
    Object.entries(result.stats).forEach(([key, value]) => {
      console.log(chalk.gray(`   ${key}: ${value}`));
    });
    console.log('');
    
    // Show entity breakdown
    const entityTypes = entities.reduce((acc, entity) => {
      acc[entity.entityType] = (acc[entity.entityType] || 0) + 1;
      return acc;
    }, {});
    
    console.log(chalk.cyan('📊 Entity Breakdown:'));
    Object.entries(entityTypes).forEach(([type, count]) => {
      console.log(chalk.gray(`   - ${type}: ${count} entities`));
    });
    
    // Display each entity
    console.log(chalk.cyan('\n📋 Generated Entities:'));
    entities.forEach(displayEntity);
    
    // Show how they would be sent to New Relic
    displayMetricsAsEvents(entities);
    displayMetricsAsTimeseries(entities);
    
    // Validate entity structure
    console.log(chalk.cyan('\n✅ Validation Results:'));
    
    let validationPassed = true;
    
    entities.forEach((entity, index) => {
      const issues = [];
      
      if (!entity.entityType || !entity.entityType.startsWith('MESSAGE_QUEUE_')) {
        issues.push('Missing or invalid entityType');
      }
      
      if (!entity.entityGuid || !entity.entityGuid.includes('INFRA')) {
        issues.push('Missing or invalid entityGuid');
      }
      
      if (!entity.displayName) {
        issues.push('Missing displayName');
      }
      
      if (!entity.provider) {
        issues.push('Missing provider');
      }
      
      if (!entity.metrics || Object.keys(entity.metrics).length === 0) {
        issues.push('No metrics defined');
      }
      
      if (issues.length > 0) {
        console.log(chalk.red(`   ❌ Entity ${index + 1} (${entity.entityType}): ${issues.join(', ')}`));
        validationPassed = false;
      } else {
        console.log(chalk.green(`   ✅ Entity ${index + 1} (${entity.entityType}): Valid`));
      }
    });
    
    if (validationPassed) {
      console.log(chalk.green('\n🎉 All entities passed validation!'));
    } else {
      console.log(chalk.yellow('\n⚠️  Some entities have validation issues.'));
    }
    
    // Show next steps
    console.log(chalk.cyan('\n📚 Next Steps:'));
    console.log(chalk.gray('1. Deploy the minikube Kafka setup:'));
    console.log(chalk.gray('   cd minikube-consolidated && ./scripts/deploy-all.sh'));
    console.log(chalk.gray(''));
    console.log(chalk.gray('2. Test with real data:'));
    console.log(chalk.gray('   node test-infrastructure-mode.js'));
    console.log(chalk.gray(''));
    console.log(chalk.gray('3. Run in infrastructure mode:'));
    console.log(chalk.gray('   node platform.js --mode infrastructure --account-id YOUR_ACCOUNT_ID'));
    console.log(chalk.gray(''));
    console.log(chalk.gray('4. Verify entities in New Relic:'));
    console.log(chalk.gray('   Look for MESSAGE_QUEUE_* entities in your account'));
    
    console.log(chalk.green('\n✅ Integration test completed successfully!\n'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Transformation failed:'), error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
runIntegrationTest().catch(error => {
  console.error(chalk.red('Test error:'), error.message);
  process.exit(1);
});