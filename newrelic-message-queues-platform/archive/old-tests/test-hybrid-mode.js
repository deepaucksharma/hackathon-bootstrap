#!/usr/bin/env node

/**
 * Test Hybrid Mode Gap Detection
 * 
 * Tests the hybrid mode manager's gap detection and filling capabilities
 */

const chalk = require('chalk');
const HybridModeManager = require('./core/hybrid-mode-manager');
const { EntityFactory } = require('./core/entities');
const DataSimulator = require('./simulation/engines/data-simulator');

// Mock infrastructure entities (what we get from nri-kafka)
function createMockInfrastructureEntities(entityFactory) {
  return [
    // Only 2 out of 3 expected brokers
    entityFactory.createBroker({
      brokerId: 1,
      name: 'kafka-1',
      clusterName: 'prod-kafka',
      hostname: 'kafka-1.prod.com',
      accountId: '12345',
      provider: 'kafka'
    }),
    entityFactory.createBroker({
      brokerId: 2,
      name: 'kafka-2',
      clusterName: 'prod-kafka',
      hostname: 'kafka-2.prod.com',
      accountId: '12345',
      provider: 'kafka'
    }),
    
    // Only 3 out of 5 expected topics
    entityFactory.createTopic({
      name: 'user-events',
      topicName: 'user-events',
      clusterName: 'prod-kafka',
      partitionCount: 6,
      accountId: '12345',
      provider: 'kafka'
    }),
    entityFactory.createTopic({
      name: 'order-events',
      topicName: 'order-events',
      clusterName: 'prod-kafka',
      partitionCount: 3,
      accountId: '12345',
      provider: 'kafka'
    }),
    entityFactory.createTopic({
      name: 'system-logs',
      topicName: 'system-logs',
      clusterName: 'prod-kafka',
      partitionCount: 1,
      accountId: '12345',
      provider: 'kafka'
    }),
    
    // Only 1 out of 3 expected consumer groups
    entityFactory.createConsumerGroup({
      name: 'analytics-processor',
      consumerGroupId: 'analytics-processor',
      clusterName: 'prod-kafka',
      state: 'STABLE',
      accountId: '12345',
      provider: 'kafka'
    }),
    
    // Cluster is created automatically by infrastructure
    entityFactory.createCluster({
      name: 'prod-kafka',
      clusterName: 'prod-kafka',
      provider: 'kafka',
      accountId: '12345'
    })
  ];
}

// Desired topology (what we expect to have)
function createDesiredTopology() {
  return {
    clusters: [
      { name: 'prod-kafka', provider: 'kafka' }
    ],
    brokers: [
      { id: 1, clusterName: 'prod-kafka', hostname: 'kafka-1.prod.com' },
      { id: 2, clusterName: 'prod-kafka', hostname: 'kafka-2.prod.com' },
      { id: 3, clusterName: 'prod-kafka', hostname: 'kafka-3.prod.com' }  // Missing
    ],
    topics: [
      { name: 'user-events', clusterName: 'prod-kafka', partitionCount: 6 },
      { name: 'order-events', clusterName: 'prod-kafka', partitionCount: 3 },
      { name: 'system-logs', clusterName: 'prod-kafka', partitionCount: 1 },
      { name: 'payment-events', clusterName: 'prod-kafka', partitionCount: 12 },  // Missing
      { name: 'notification-events', clusterName: 'prod-kafka', partitionCount: 3 }  // Missing
    ],
    consumerGroups: [
      { id: 'analytics-processor', clusterName: 'prod-kafka' },
      { id: 'order-processor', clusterName: 'prod-kafka' },  // Missing
      { id: 'notification-sender', clusterName: 'prod-kafka' }  // Missing
    ]
  };
}

async function testHybridMode() {
  console.log(chalk.bold.cyan('\n🧪 Testing Hybrid Mode Gap Detection\n'));
  
  try {
    // 1. Setup components
    const entityFactory = new EntityFactory({
      defaultProvider: 'kafka',
      defaultAccountId: '12345'
    });
    
    const simulator = new DataSimulator({
      anomalyRate: 0.05,
      businessHoursEnabled: true
    });
    
    const hybridManager = new HybridModeManager({
      accountId: '12345',
      debug: true,
      fillGaps: true
    });
    
    // 2. Simulate infrastructure data (partial coverage)
    console.log(chalk.yellow('Step 1: Simulating infrastructure entities...'));
    const infrastructureEntities = createMockInfrastructureEntities(entityFactory);
    console.log(chalk.green(`✓ Created ${infrastructureEntities.length} infrastructure entities`));
    
    // Show what infrastructure provides
    const infraTypes = {};
    infrastructureEntities.forEach(e => {
      infraTypes[e.entityType] = (infraTypes[e.entityType] || 0) + 1;
    });
    
    console.log(chalk.gray('Infrastructure entities:'));
    Object.entries(infraTypes).forEach(([type, count]) => {
      console.log(chalk.gray(`  - ${type}: ${count}`));
    });
    
    // 3. Update hybrid manager with infrastructure entities
    console.log(chalk.yellow('\nStep 2: Updating hybrid manager...'));
    hybridManager.updateInfrastructureEntities(infrastructureEntities);
    
    // 4. Define desired topology
    console.log(chalk.yellow('\nStep 3: Analyzing gaps against desired topology...'));
    const desiredTopology = createDesiredTopology();
    
    // 5. Analyze and fill gaps
    const gaps = await hybridManager.analyzeAndFillGaps(desiredTopology, entityFactory, simulator);
    
    // 6. Get all entities (infrastructure + gap-filled)
    console.log(chalk.yellow('\nStep 4: Getting complete entity set...'));
    const allEntities = hybridManager.getAllEntities();
    
    // 7. Show results
    console.log(chalk.yellow('\nStep 5: Results analysis...'));
    
    // Entity breakdown by source
    const realEntities = allEntities.filter(e => e.source === 'infrastructure');
    const simulatedEntities = allEntities.filter(e => e.source === 'simulation');
    
    console.log(chalk.green(`✓ Total entities: ${allEntities.length}`));
    console.log(chalk.blue(`  - Real (infrastructure): ${realEntities.length}`));
    console.log(chalk.blue(`  - Simulated (gap-filled): ${simulatedEntities.length}`));
    
    // Entity type breakdown
    console.log(chalk.yellow('\n📊 Entity Type Breakdown:'));
    const typeBreakdown = {};
    allEntities.forEach(e => {
      if (!typeBreakdown[e.entityType]) {
        typeBreakdown[e.entityType] = { real: 0, simulated: 0 };
      }
      typeBreakdown[e.entityType][e.source === 'infrastructure' ? 'real' : 'simulated']++;
    });
    
    Object.entries(typeBreakdown).forEach(([type, counts]) => {
      const total = counts.real + counts.simulated;
      console.log(`  ${type}: ${total} total (${counts.real} real, ${counts.simulated} simulated)`);
    });
    
    // Gap analysis summary
    console.log(chalk.yellow('\n🔍 Gap Analysis Summary:'));
    console.log(`  Missing clusters: ${gaps.summary.totalMissingClusters}`);
    console.log(`  Missing brokers: ${gaps.summary.totalMissingBrokers}`);
    console.log(`  Missing topics: ${gaps.summary.totalMissingTopics}`);
    console.log(`  Missing consumer groups: ${gaps.summary.totalMissingConsumerGroups}`);
    
    if (gaps.partialClusters.length > 0) {
      console.log(`  Partial clusters: ${gaps.partialClusters.join(', ')}`);
    }
    
    // Show hybrid manager statistics
    hybridManager.printStatus();
    
    // Sample entities
    console.log(chalk.yellow('\n📋 Sample Entities:'));
    
    const sampleReal = realEntities.find(e => e.entityType === 'MESSAGE_QUEUE_BROKER');
    if (sampleReal) {
      console.log(chalk.cyan('\nReal Broker Entity:'));
      console.log(JSON.stringify({
        entityGuid: sampleReal.entityGuid,
        source: sampleReal.source,
        brokerId: sampleReal.brokerId,
        hostname: sampleReal.hostname
      }, null, 2));
    }
    
    const sampleSimulated = simulatedEntities.find(e => e.entityType === 'MESSAGE_QUEUE_BROKER');
    if (sampleSimulated) {
      console.log(chalk.cyan('\nSimulated Broker Entity:'));
      console.log(JSON.stringify({
        entityGuid: sampleSimulated.entityGuid,
        source: sampleSimulated.source,
        brokerId: sampleSimulated.brokerId,
        hostname: sampleSimulated.hostname
      }, null, 2));
    }
    
    console.log(chalk.green('\n✅ Hybrid Mode Gap Detection Test Completed Successfully!\n'));
    
    // Validation
    const expectedTotal = desiredTopology.clusters.length + 
                         desiredTopology.brokers.length + 
                         desiredTopology.topics.length + 
                         desiredTopology.consumerGroups.length;
    
    console.log(chalk.yellow('Validation:'));
    console.log(`Expected total entities: ${expectedTotal}`);
    console.log(`Actual total entities: ${allEntities.length}`);
    
    if (allEntities.length >= expectedTotal) {
      console.log(chalk.green('✅ Gap detection and filling working correctly!'));
    } else {
      console.log(chalk.red('❌ Missing entities - gap detection may have issues'));
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Test failed:'), error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testHybridMode();
}

module.exports = { testHybridMode };