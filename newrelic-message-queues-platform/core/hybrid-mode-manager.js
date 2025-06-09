/**
 * Hybrid Mode Manager
 * 
 * Manages the combination of real infrastructure data and simulated data
 * to provide complete coverage of message queue topology
 */

const { EventEmitter } = require('events');
const debug = require('debug')('platform:hybrid');
const chalk = require('chalk');

class HybridModeManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.accountId = options.accountId;
    this.debug = options.debug || false;
    this.fillGaps = options.fillGaps !== false;
    
    // Track entities from different sources
    this.infrastructureEntities = new Map();
    this.simulatedEntities = new Map();
    this.gapFilledEntities = new Map();
    
    // Track what we've seen from infrastructure
    this.seenClusters = new Set();
    this.seenBrokers = new Set();
    this.seenTopics = new Set();
    this.seenConsumerGroups = new Set();
  }
  
  /**
   * Update entities from infrastructure source
   */
  updateInfrastructureEntities(entities) {
    this.infrastructureEntities.clear();
    this.seenClusters.clear();
    this.seenBrokers.clear();
    this.seenTopics.clear();
    this.seenConsumerGroups.clear();
    
    entities.forEach(entity => {
      this.infrastructureEntities.set(entity.entityGuid, entity);
      
      // Track what we've seen
      switch (entity.entityType) {
        case 'MESSAGE_QUEUE_CLUSTER':
          this.seenClusters.add(entity.clusterName);
          break;
        case 'MESSAGE_QUEUE_BROKER':
          this.seenBrokers.add(`${entity.clusterName}:${entity.brokerId}`);
          break;
        case 'MESSAGE_QUEUE_TOPIC':
          this.seenTopics.add(`${entity.clusterName}:${entity.topicName}`);
          break;
        case 'MESSAGE_QUEUE_CONSUMER_GROUP':
          this.seenConsumerGroups.add(`${entity.clusterName}:${entity.consumerGroupId}`);
          break;
      }
    });
    
    debug(`Updated infrastructure entities: ${entities.length} entities`);
  }
  
  /**
   * Analyze gaps between desired topology and actual infrastructure
   */
  analyzeGaps(desiredTopology) {
    const gaps = {
      missingClusters: [],
      missingBrokers: [],
      missingTopics: [],
      missingConsumerGroups: [],
      partialClusters: [],
      summary: {}
    };
    
    // Check for missing clusters
    desiredTopology.clusters?.forEach(cluster => {
      if (!this.seenClusters.has(cluster.name)) {
        gaps.missingClusters.push(cluster);
      }
    });
    
    // Check for missing brokers
    desiredTopology.brokers?.forEach(broker => {
      const brokerKey = `${broker.clusterName}:${broker.id}`;
      if (!this.seenBrokers.has(brokerKey)) {
        gaps.missingBrokers.push(broker);
        
        // Mark cluster as partial if we have some but not all brokers
        if (this.seenClusters.has(broker.clusterName) && 
            !gaps.partialClusters.includes(broker.clusterName)) {
          gaps.partialClusters.push(broker.clusterName);
        }
      }
    });
    
    // Check for missing topics
    desiredTopology.topics?.forEach(topic => {
      const topicKey = `${topic.clusterName}:${topic.name}`;
      if (!this.seenTopics.has(topicKey)) {
        gaps.missingTopics.push(topic);
      }
    });
    
    // Check for missing consumer groups
    desiredTopology.consumerGroups?.forEach(group => {
      const groupKey = `${group.clusterName}:${group.id}`;
      if (!this.seenConsumerGroups.has(groupKey)) {
        gaps.missingConsumerGroups.push(group);
      }
    });
    
    // Calculate summary
    gaps.summary = {
      totalMissingClusters: gaps.missingClusters.length,
      totalMissingBrokers: gaps.missingBrokers.length,
      totalMissingTopics: gaps.missingTopics.length,
      totalMissingConsumerGroups: gaps.missingConsumerGroups.length,
      partialClusters: gaps.partialClusters.length,
      hasGaps: gaps.missingClusters.length > 0 || 
               gaps.missingBrokers.length > 0 || 
               gaps.missingTopics.length > 0 ||
               gaps.missingConsumerGroups.length > 0
    };
    
    return gaps;
  }
  
  /**
   * Fill gaps with simulated entities
   */
  async fillGapsWithSimulation(gaps, entityFactory, simulator) {
    if (!this.fillGaps || !gaps.summary.hasGaps) {
      return gaps;
    }
    
    this.gapFilledEntities.clear();
    
    console.log(chalk.yellow('\n🔍 Gap Analysis:'));
    console.log(chalk.gray(`  Missing clusters: ${gaps.summary.totalMissingClusters}`));
    console.log(chalk.gray(`  Missing brokers: ${gaps.summary.totalMissingBrokers}`));
    console.log(chalk.gray(`  Missing topics: ${gaps.summary.totalMissingTopics}`));
    console.log(chalk.gray(`  Missing consumer groups: ${gaps.summary.totalMissingConsumerGroups}`));
    
    if (gaps.partialClusters.length > 0) {
      console.log(chalk.gray(`  Partial clusters: ${gaps.partialClusters.join(', ')}`));
    }
    
    console.log(chalk.blue('\n🔧 Filling gaps with simulation...'));
    
    // Fill missing clusters
    gaps.missingClusters.forEach(cluster => {
      const clusterEntity = entityFactory.createCluster({
        name: cluster.name,
        clusterName: cluster.name,
        provider: cluster.provider || 'kafka',
        accountId: this.accountId,
        environment: 'hybrid-simulated',
        source: 'simulation'
      });
      
      // Initialize with default metrics
      clusterEntity['cluster.brokerCount'] = 0;
      clusterEntity['cluster.topicCount'] = 0;
      clusterEntity['cluster.health.score'] = 100;
      
      this.gapFilledEntities.set(clusterEntity.entityGuid, clusterEntity);
      debug(`Created simulated cluster: ${cluster.name}`);
    });
    
    // Fill missing brokers
    gaps.missingBrokers.forEach(broker => {
      const brokerEntity = entityFactory.createBroker({
        name: `simulated-broker-${broker.id}`,
        brokerId: broker.id,
        clusterName: broker.clusterName,
        hostname: broker.hostname || `simulated-broker-${broker.id}`,
        provider: 'kafka',
        accountId: this.accountId,
        source: 'simulation'
      });
      
      // Initialize with realistic metrics
      simulator.updateBrokerMetrics(brokerEntity);
      
      this.gapFilledEntities.set(brokerEntity.entityGuid, brokerEntity);
      debug(`Created simulated broker: ${broker.clusterName}:${broker.id}`);
    });
    
    // Fill missing topics
    gaps.missingTopics.forEach(topic => {
      const topicEntity = entityFactory.createTopic({
        name: topic.name,
        topicName: topic.name,
        clusterName: topic.clusterName,
        partitionCount: topic.partitionCount || 3,
        replicationFactor: topic.replicationFactor || 1,
        provider: 'kafka',
        accountId: this.accountId,
        source: 'simulation'
      });
      
      // Initialize with realistic metrics
      simulator.updateTopicMetrics(topicEntity);
      
      this.gapFilledEntities.set(topicEntity.entityGuid, topicEntity);
      debug(`Created simulated topic: ${topic.clusterName}:${topic.name}`);
    });
    
    // Fill missing consumer groups
    gaps.missingConsumerGroups.forEach(group => {
      const groupEntity = entityFactory.createConsumerGroup({
        name: group.id,
        consumerGroupId: group.id,
        clusterName: group.clusterName,
        state: 'STABLE',
        memberCount: group.memberCount || 1,
        provider: 'kafka',
        accountId: this.accountId,
        source: 'simulation'
      });
      
      // Initialize with realistic metrics
      groupEntity['consumerGroup.totalLag'] = Math.floor(Math.random() * 1000);
      groupEntity['consumerGroup.avgLag'] = groupEntity['consumerGroup.totalLag'] / groupEntity.memberCount;
      
      this.gapFilledEntities.set(groupEntity.entityGuid, groupEntity);
      debug(`Created simulated consumer group: ${group.clusterName}:${group.id}`);
    });
    
    console.log(chalk.green(`✓ Filled ${this.gapFilledEntities.size} gaps with simulated entities`));
    
    return gaps;
  }
  
  /**
   * Analyze and fill gaps in one operation
   */
  async analyzeAndFillGaps(desiredTopology, entityFactory, simulator) {
    const gaps = this.analyzeGaps(desiredTopology);
    
    if (this.fillGaps && gaps.summary.hasGaps) {
      await this.fillGapsWithSimulation(gaps, entityFactory, simulator);
    }
    
    return gaps;
  }
  
  /**
   * Get all entities (infrastructure + gap-filled)
   */
  getAllEntities() {
    const allEntities = [];
    
    // Add infrastructure entities (mark as real)
    this.infrastructureEntities.forEach(entity => {
      allEntities.push({
        ...entity,
        source: entity.source || 'infrastructure'
      });
    });
    
    // Add gap-filled entities (mark as simulated)
    this.gapFilledEntities.forEach(entity => {
      allEntities.push({
        ...entity,
        source: 'simulation'
      });
    });
    
    return allEntities;
  }
  
  /**
   * Get statistics about the hybrid state
   */
  getStats() {
    return {
      infrastructureEntities: this.infrastructureEntities.size,
      gapFilledEntities: this.gapFilledEntities.size,
      totalEntities: this.infrastructureEntities.size + this.gapFilledEntities.size,
      clusters: {
        infrastructure: Array.from(this.seenClusters).length,
        simulated: Array.from(this.gapFilledEntities.values())
          .filter(e => e.entityType === 'MESSAGE_QUEUE_CLUSTER').length
      },
      brokers: {
        infrastructure: Array.from(this.seenBrokers).length,
        simulated: Array.from(this.gapFilledEntities.values())
          .filter(e => e.entityType === 'MESSAGE_QUEUE_BROKER').length
      },
      topics: {
        infrastructure: Array.from(this.seenTopics).length,
        simulated: Array.from(this.gapFilledEntities.values())
          .filter(e => e.entityType === 'MESSAGE_QUEUE_TOPIC').length
      },
      consumerGroups: {
        infrastructure: Array.from(this.seenConsumerGroups).length,
        simulated: Array.from(this.gapFilledEntities.values())
          .filter(e => e.entityType === 'MESSAGE_QUEUE_CONSUMER_GROUP').length
      }
    };
  }
  
  /**
   * Print current hybrid state status
   */
  printStatus() {
    const stats = this.getStats();
    
    console.log(chalk.bold.cyan('\n📊 Hybrid Mode Status:'));
    console.log(chalk.gray('─'.repeat(50)));
    
    console.log(chalk.yellow('Infrastructure Entities:'), stats.infrastructureEntities);
    console.log(chalk.yellow('Gap-Filled Entities:'), stats.gapFilledEntities);
    console.log(chalk.yellow('Total Entities:'), stats.totalEntities);
    
    console.log(chalk.gray('\nEntity Breakdown:'));
    console.log(`  Clusters: ${stats.clusters.infrastructure} real, ${stats.clusters.simulated} simulated`);
    console.log(`  Brokers: ${stats.brokers.infrastructure} real, ${stats.brokers.simulated} simulated`);
    console.log(`  Topics: ${stats.topics.infrastructure} real, ${stats.topics.simulated} simulated`);
    console.log(`  Consumer Groups: ${stats.consumerGroups.infrastructure} real, ${stats.consumerGroups.simulated} simulated`);
    
    console.log(chalk.gray('─'.repeat(50)));
  }
}

module.exports = HybridModeManager;