/**
 * Entity Synthesis Engine
 * 
 * Implements proper entity synthesis for New Relic Entity Platform
 * with v3.0 compliant GUID generation and relationship management
 */

const crypto = require('crypto');
const debug = require('debug')('platform:entity-synthesis');
const chalk = require('chalk');
const { EventEmitter } = require('events');

class EntitySynthesisEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      accountId: config.accountId || '123456',
      provider: config.provider || 'kafka',
      environment: config.environment || 'production',
      ...config
    };
    
    // Entity type definitions
    this.entityTypes = {
      CLUSTER: 'MESSAGE_QUEUE_CLUSTER',
      BROKER: 'MESSAGE_QUEUE_BROKER',
      TOPIC: 'MESSAGE_QUEUE_TOPIC',
      CONSUMER_GROUP: 'MESSAGE_QUEUE_CONSUMER_GROUP',
      QUEUE: 'MESSAGE_QUEUE_QUEUE'
    };
    
    // Relationship types
    this.relationshipTypes = {
      CONTAINS: 'CONTAINS',
      CONTAINED_IN: 'CONTAINED_IN',
      MANAGES: 'MANAGES',
      MANAGED_BY: 'MANAGED_BY',
      CONSUMES_FROM: 'CONSUMES_FROM',
      PRODUCES_TO: 'PRODUCES_TO',
      BELONGS_TO: 'BELONGS_TO',
      COORDINATED_BY: 'COORDINATED_BY'
    };
    
    // Track entities and relationships
    this.entities = new Map();
    this.relationships = new Map();
    
    debug('Entity Synthesis Engine initialized');
  }

  /**
   * Main synthesis method - converts raw data to entities
   */
  async synthesize(rawData) {
    console.log(chalk.blue('🧬 Starting entity synthesis...'));
    
    try {
      // Clear previous state
      this.entities.clear();
      this.relationships.clear();
      
      // Phase 1: Create base entities
      await this.createBaseEntities(rawData);
      
      // Phase 2: Build relationships
      await this.buildRelationships();
      
      // Phase 3: Calculate derived metrics
      await this.calculateDerivedMetrics();
      
      // Phase 4: Apply business rules
      await this.applyBusinessRules();
      
      // Phase 5: Validate entities
      await this.validateEntities();
      
      // Convert to array for output
      const entities = Array.from(this.entities.values());
      const relationships = Array.from(this.relationships.values());
      
      console.log(chalk.green(`✅ Synthesized ${entities.length} entities with ${relationships.length} relationships`));
      
      // Emit synthesis complete event
      this.emit('synthesis.complete', {
        entities,
        relationships,
        stats: this.getStats()
      });
      
      return { entities, relationships };
      
    } catch (error) {
      console.error(chalk.red('❌ Entity synthesis failed:'), error);
      this.emit('synthesis.error', error);
      throw error;
    }
  }

  /**
   * Phase 1: Create base entities from raw data
   */
  async createBaseEntities(rawData) {
    debug('Creating base entities from raw data');
    
    // Create clusters first (they're parent entities)
    if (rawData.clusters) {
      for (const clusterData of rawData.clusters) {
        this.createClusterEntity(clusterData);
      }
    }
    
    // Create brokers
    if (rawData.brokers) {
      for (const brokerData of rawData.brokers) {
        this.createBrokerEntity(brokerData);
      }
    }
    
    // Create topics
    if (rawData.topics) {
      for (const topicData of rawData.topics) {
        this.createTopicEntity(topicData);
      }
    }
    
    // Create consumer groups
    if (rawData.consumerGroups) {
      const groupedConsumers = this.groupConsumersByGroupId(rawData.consumerGroups);
      for (const [groupId, consumers] of Object.entries(groupedConsumers)) {
        this.createConsumerGroupEntity(groupId, consumers);
      }
    }
    
    // Create queues (if applicable)
    if (rawData.queues) {
      for (const queueData of rawData.queues) {
        this.createQueueEntity(queueData);
      }
    }
    
    debug(`Created ${this.entities.size} base entities`);
  }

  /**
   * Create cluster entity
   */
  createClusterEntity(clusterData) {
    const clusterName = clusterData.clusterName;
    const guid = this.generateGuid(this.entityTypes.CLUSTER, clusterName);
    
    const entity = {
      // Core entity fields
      eventType: 'MessageQueue',
      timestamp: Date.now(),
      'entity.guid': guid,
      'entity.name': clusterName,
      'entity.type': this.entityTypes.CLUSTER,
      entityGuid: guid,
      entityType: this.entityTypes.CLUSTER,
      
      // Identifiers
      provider: this.config.provider,
      clusterName: clusterName,
      environment: this.config.environment,
      
      // Golden metrics
      brokerCount: clusterData['cluster.brokersCount'] || 0,
      topicCount: clusterData['cluster.topicsCount'] || 0,
      partitionCount: clusterData['cluster.partitionsCount'] || 0,
      'cluster.health.score': 100, // Will be calculated
      'cluster.throughput.total': 0, // Will be calculated
      'cluster.error.rate': 0, // Will be calculated
      'cluster.availability': 100, // Will be calculated
      
      // Additional metadata
      underReplicatedPartitions: clusterData['cluster.underReplicatedPartitions'] || 0,
      offlinePartitionsCount: clusterData['cluster.offlinePartitionsCount'] || 0,
      activeControllers: clusterData['cluster.activeControllers'] || 0,
      
      // Tags
      tags: {
        provider: this.config.provider,
        environment: this.config.environment,
        clusterName: clusterName,
        region: this.config.region || 'unknown'
      }
    };
    
    this.entities.set(guid, entity);
    return entity;
  }

  /**
   * Create broker entity
   */
  createBrokerEntity(brokerData) {
    const brokerId = brokerData['broker.id'];
    const hostname = brokerData.hostname;
    const clusterName = brokerData.clusterName || this.inferClusterName(hostname);
    
    const compositeKey = `${clusterName}:${brokerId}:${hostname}`;
    const guid = this.generateGuid(this.entityTypes.BROKER, compositeKey);
    
    const entity = {
      // Core entity fields
      eventType: 'MessageQueue',
      timestamp: Date.now(),
      'entity.guid': guid,
      'entity.name': `${clusterName}-broker-${brokerId}`,
      'entity.type': this.entityTypes.BROKER,
      entityGuid: guid,
      entityType: this.entityTypes.BROKER,
      
      // Identifiers
      provider: this.config.provider,
      clusterName: clusterName,
      brokerId: brokerId,
      hostname: hostname,
      port: 9092,
      
      // Golden metrics
      'broker.cpu.usage': this.calculateBrokerCpu(brokerData),
      'broker.memory.usage': this.calculateBrokerMemory(brokerData),
      'broker.network.throughput': this.calculateBrokerThroughput(brokerData),
      'broker.request.latency': this.calculateBrokerLatency(brokerData),
      
      // Additional metrics
      'broker.bytesInPerSecond': brokerData['broker.bytesInPerSecond'] || 0,
      'broker.bytesOutPerSecond': brokerData['broker.bytesOutPerSecond'] || 0,
      'broker.messagesInPerSecond': brokerData['broker.messagesInPerSecond'] || 0,
      partitionCount: brokerData['broker.partitionCount'] || 0,
      leaderPartitions: brokerData['broker.leaderCount'] || 0,
      underReplicatedPartitions: brokerData.underReplicatedPartitions || 0,
      
      // Operational metrics
      'jvm.heapUsed': brokerData['jvm.heapUsed'] || 0,
      'jvm.heapMax': brokerData['jvm.heapMax'] || 0,
      'request.handlerIdle': brokerData['request.handlerIdle'] || 100,
      activeControllerCount: brokerData.activeControllerCount || 0,
      
      // Tags
      tags: {
        provider: this.config.provider,
        clusterName: clusterName,
        brokerId: String(brokerId),
        hostname: hostname
      },
      
      // Status
      status: this.calculateBrokerStatus(brokerData)
    };
    
    this.entities.set(guid, entity);
    return entity;
  }

  /**
   * Create topic entity
   */
  createTopicEntity(topicData) {
    const topicName = topicData.topic;
    const clusterName = topicData.clusterName;
    
    const compositeKey = `${clusterName}:${topicName}`;
    const guid = this.generateGuid(this.entityTypes.TOPIC, compositeKey);
    
    const entity = {
      // Core entity fields
      eventType: 'MessageQueue',
      timestamp: Date.now(),
      'entity.guid': guid,
      'entity.name': topicName,
      'entity.type': this.entityTypes.TOPIC,
      entityGuid: guid,
      entityType: this.entityTypes.TOPIC,
      
      // Identifiers
      provider: this.config.provider,
      clusterName: clusterName,
      topicName: topicName,
      
      // Golden metrics
      partitionCount: topicData['topic.partitionsCount'] || 0,
      replicationFactor: topicData['topic.replicationFactor'] || 1,
      'topic.throughput.in': topicData['topic.messagesInPerSecond'] || 0,
      'topic.throughput.out': this.calculateTopicThroughputOut(topicData),
      'topic.consumer.lag': 0, // Will be calculated from consumer groups
      'topic.error.rate': 0, // Will be calculated
      
      // Additional metrics
      'topic.bytesInPerSecond': topicData['topic.bytesInPerSecond'] || 0,
      'topic.bytesOutPerSecond': topicData['topic.bytesOutPerSecond'] || 0,
      retentionSizeBytes: topicData['topic.retentionSizeBytes'] || 0,
      underReplicatedPartitions: topicData['topic.underReplicatedPartitions'] || 0,
      
      // Configuration
      cleanupPolicy: 'delete',
      compressionType: 'producer',
      retentionMs: 604800000, // 7 days default
      
      // Tags
      tags: {
        provider: this.config.provider,
        clusterName: clusterName,
        topicName: topicName
      },
      
      // Status
      status: this.calculateTopicStatus(topicData)
    };
    
    this.entities.set(guid, entity);
    return entity;
  }

  /**
   * Create consumer group entity
   */
  createConsumerGroupEntity(groupId, consumers) {
    const clusterName = consumers[0].clusterName || this.config.clusterName;
    const topics = [...new Set(consumers.map(c => c.topic))];
    
    const compositeKey = `${clusterName}:${groupId}`;
    const guid = this.generateGuid(this.entityTypes.CONSUMER_GROUP, compositeKey);
    
    // Aggregate metrics
    const totalLag = consumers.reduce((sum, c) => sum + (c['consumer.lag'] || 0), 0);
    const messageRate = consumers.reduce((sum, c) => sum + (c['consumer.messageRate'] || 0), 0);
    const bytesConsumedRate = consumers.reduce((sum, c) => sum + (c['consumer.bytesConsumedRate'] || 0), 0);
    
    const entity = {
      // Core entity fields
      eventType: 'MessageQueue',
      timestamp: Date.now(),
      'entity.guid': guid,
      'entity.name': groupId,
      'entity.type': this.entityTypes.CONSUMER_GROUP,
      entityGuid: guid,
      entityType: this.entityTypes.CONSUMER_GROUP,
      
      // Identifiers
      provider: this.config.provider,
      clusterName: clusterName,
      consumerGroupId: groupId,
      
      // Golden metrics
      'consumerGroup.lag': totalLag,
      'consumerGroup.messageRate': messageRate,
      'consumerGroup.bytesConsumedRate': bytesConsumedRate,
      'consumerGroup.memberCount': new Set(consumers.map(c => c['consumer.clientId'])).size,
      
      // Additional metrics
      topicCount: topics.length,
      topics: topics.join(','),
      state: this.determineConsumerGroupState(consumers),
      
      // Tags
      tags: {
        provider: this.config.provider,
        clusterName: clusterName,
        consumerGroupId: groupId
      },
      
      // Status
      status: totalLag > 10000 ? 'LAGGING' : 'STABLE'
    };
    
    this.entities.set(guid, entity);
    return entity;
  }

  /**
   * Create queue entity (for non-Kafka providers)
   */
  createQueueEntity(queueData) {
    const queueName = queueData.queueName;
    const clusterName = queueData.clusterName;
    
    const compositeKey = `${clusterName}:${queueName}`;
    const guid = this.generateGuid(this.entityTypes.QUEUE, compositeKey);
    
    const entity = {
      // Core entity fields
      eventType: 'MessageQueue',
      timestamp: Date.now(),
      'entity.guid': guid,
      'entity.name': queueName,
      'entity.type': this.entityTypes.QUEUE,
      entityGuid: guid,
      entityType: this.entityTypes.QUEUE,
      
      // Identifiers
      provider: this.config.provider,
      clusterName: clusterName,
      queueName: queueName,
      
      // Golden metrics
      'queue.depth': queueData.depth || 0,
      'queue.messageRate.in': queueData.messageRateIn || 0,
      'queue.messageRate.out': queueData.messageRateOut || 0,
      'queue.consumerCount': queueData.consumerCount || 0,
      
      // Tags
      tags: {
        provider: this.config.provider,
        clusterName: clusterName,
        queueName: queueName
      },
      
      // Status
      status: 'ACTIVE'
    };
    
    this.entities.set(guid, entity);
    return entity;
  }

  /**
   * Phase 2: Build entity relationships
   */
  async buildRelationships() {
    debug('Building entity relationships');
    
    const clusters = Array.from(this.entities.values()).filter(e => 
      e.entityType === this.entityTypes.CLUSTER
    );
    
    const brokers = Array.from(this.entities.values()).filter(e => 
      e.entityType === this.entityTypes.BROKER
    );
    
    const topics = Array.from(this.entities.values()).filter(e => 
      e.entityType === this.entityTypes.TOPIC
    );
    
    const consumerGroups = Array.from(this.entities.values()).filter(e => 
      e.entityType === this.entityTypes.CONSUMER_GROUP
    );
    
    // Cluster -> Broker relationships
    clusters.forEach(cluster => {
      const clusterBrokers = brokers.filter(b => b.clusterName === cluster.clusterName);
      clusterBrokers.forEach(broker => {
        this.addRelationship(
          cluster.entityGuid,
          this.relationshipTypes.CONTAINS,
          broker.entityGuid
        );
        this.addRelationship(
          broker.entityGuid,
          this.relationshipTypes.CONTAINED_IN,
          cluster.entityGuid
        );
      });
    });
    
    // Cluster -> Topic relationships
    clusters.forEach(cluster => {
      const clusterTopics = topics.filter(t => t.clusterName === cluster.clusterName);
      clusterTopics.forEach(topic => {
        this.addRelationship(
          cluster.entityGuid,
          this.relationshipTypes.CONTAINS,
          topic.entityGuid
        );
        this.addRelationship(
          topic.entityGuid,
          this.relationshipTypes.CONTAINED_IN,
          cluster.entityGuid
        );
      });
    });
    
    // Topic -> Broker relationships (topics are managed by brokers)
    topics.forEach(topic => {
      const topicBrokers = brokers.filter(b => b.clusterName === topic.clusterName);
      if (topicBrokers.length > 0) {
        // Assign to leader broker (simplified - would use partition data in production)
        const leaderBroker = topicBrokers.reduce((prev, curr) => 
          curr.leaderPartitions > prev.leaderPartitions ? curr : prev
        );
        
        this.addRelationship(
          topic.entityGuid,
          this.relationshipTypes.MANAGED_BY,
          leaderBroker.entityGuid
        );
      }
    });
    
    // Consumer Group -> Topic relationships
    consumerGroups.forEach(group => {
      if (group.topics) {
        const groupTopics = typeof group.topics === 'string' 
          ? group.topics.split(',') 
          : [];
        groupTopics.forEach(topicName => {
          const topic = topics.find(t => t.topicName === topicName.trim());
          if (topic) {
            this.addRelationship(
              group.entityGuid,
              this.relationshipTypes.CONSUMES_FROM,
              topic.entityGuid
            );
          }
        });
      }
    });
    
    debug(`Built ${this.relationships.size} relationships`);
  }

  /**
   * Phase 3: Calculate derived metrics
   */
  async calculateDerivedMetrics() {
    debug('Calculating derived metrics');
    
    // Calculate cluster-level aggregated metrics
    const clusters = Array.from(this.entities.values()).filter(e => 
      e.entityType === this.entityTypes.CLUSTER
    );
    
    clusters.forEach(cluster => {
      const clusterBrokers = Array.from(this.entities.values()).filter(e => 
        e.entityType === this.entityTypes.BROKER && e.clusterName === cluster.clusterName
      );
      
      // Calculate total throughput
      const totalBytesIn = clusterBrokers.reduce((sum, b) => 
        sum + (b['broker.bytesInPerSecond'] || 0), 0
      );
      const totalBytesOut = clusterBrokers.reduce((sum, b) => 
        sum + (b['broker.bytesOutPerSecond'] || 0), 0
      );
      
      cluster['cluster.throughput.total'] = totalBytesIn + totalBytesOut;
      cluster['cluster.throughput.in'] = totalBytesIn;
      cluster['cluster.throughput.out'] = totalBytesOut;
      
      // Calculate average CPU and memory
      const avgCpu = clusterBrokers.reduce((sum, b) => 
        sum + (b['broker.cpu.usage'] || 0), 0
      ) / (clusterBrokers.length || 1);
      
      const avgMemory = clusterBrokers.reduce((sum, b) => 
        sum + (b['broker.memory.usage'] || 0), 0
      ) / (clusterBrokers.length || 1);
      
      cluster['cluster.cpu.average'] = avgCpu;
      cluster['cluster.memory.average'] = avgMemory;
      
      // Calculate health score
      cluster['cluster.health.score'] = this.calculateClusterHealthScore(cluster, clusterBrokers);
      
      // Calculate availability
      const totalBrokers = cluster.brokerCount || clusterBrokers.length;
      const healthyBrokers = clusterBrokers.filter(b => b.status === 'HEALTHY').length;
      cluster['cluster.availability'] = totalBrokers > 0 
        ? (healthyBrokers / totalBrokers) * 100 
        : 0;
      
      // Calculate error rate
      const totalUnderReplicated = clusterBrokers.reduce((sum, b) => 
        sum + (b.underReplicatedPartitions || 0), 0
      );
      const totalPartitions = clusterBrokers.reduce((sum, b) => 
        sum + (b.partitionCount || 0), 0
      );
      
      cluster['cluster.error.rate'] = totalPartitions > 0
        ? (totalUnderReplicated / totalPartitions) * 100
        : 0;
    });
    
    // Calculate topic consumer lag from consumer groups
    const topics = Array.from(this.entities.values()).filter(e => 
      e.entityType === this.entityTypes.TOPIC
    );
    
    const consumerGroups = Array.from(this.entities.values()).filter(e => 
      e.entityType === this.entityTypes.CONSUMER_GROUP
    );
    
    topics.forEach(topic => {
      const topicConsumers = consumerGroups.filter(g => 
        g.topics && g.topics.includes(topic.topicName)
      );
      
      const totalLag = topicConsumers.reduce((sum, g) => 
        sum + (g['consumerGroup.lag'] || 0), 0
      );
      
      topic['topic.consumer.lag'] = totalLag;
    });
  }

  /**
   * Phase 4: Apply business rules
   */
  async applyBusinessRules() {
    debug('Applying business rules');
    
    // Apply SLO/SLA rules
    Array.from(this.entities.values()).forEach(entity => {
      switch (entity.entityType) {
        case this.entityTypes.CLUSTER:
          // Cluster SLOs
          if (entity['cluster.health.score'] < 80) {
            entity.alertLevel = 'WARNING';
          }
          if (entity['cluster.health.score'] < 60) {
            entity.alertLevel = 'CRITICAL';
          }
          break;
          
        case this.entityTypes.BROKER:
          // Broker SLOs
          if (entity['broker.cpu.usage'] > 80) {
            entity.alertLevel = 'WARNING';
          }
          if (entity['broker.cpu.usage'] > 90) {
            entity.alertLevel = 'CRITICAL';
          }
          break;
          
        case this.entityTypes.TOPIC:
          // Topic SLOs
          if (entity['topic.consumer.lag'] > 10000) {
            entity.alertLevel = 'WARNING';
          }
          if (entity['topic.consumer.lag'] > 100000) {
            entity.alertLevel = 'CRITICAL';
          }
          break;
          
        case this.entityTypes.CONSUMER_GROUP:
          // Consumer Group SLOs
          if (entity['consumerGroup.lag'] > 50000) {
            entity.alertLevel = 'WARNING';
          }
          if (entity['consumerGroup.lag'] > 500000) {
            entity.alertLevel = 'CRITICAL';
          }
          break;
      }
    });
  }

  /**
   * Phase 5: Validate entities
   */
  async validateEntities() {
    debug('Validating entities');
    
    let validCount = 0;
    let invalidCount = 0;
    
    Array.from(this.entities.values()).forEach(entity => {
      const validation = this.validateEntity(entity);
      if (validation.valid) {
        validCount++;
      } else {
        invalidCount++;
        console.warn(chalk.yellow(`⚠️  Invalid entity ${entity.entityGuid}:`), validation.errors);
      }
    });
    
    console.log(chalk.green(`✅ Validated ${validCount} entities, ${invalidCount} invalid`));
  }

  /**
   * Generate v3.0 compliant GUID
   */
  generateGuid(entityType, compositeKey) {
    const hash = crypto.createHash('sha256')
      .update(compositeKey)
      .digest('hex')
      .substring(0, 32);
    
    return `${this.config.accountId}|INFRA|${entityType}|${hash}`;
  }

  /**
   * Add a relationship between entities
   */
  addRelationship(sourceGuid, type, targetGuid) {
    const relationshipId = `${sourceGuid}-${type}-${targetGuid}`;
    
    this.relationships.set(relationshipId, {
      source: sourceGuid,
      type: type,
      target: targetGuid,
      metadata: {
        createdAt: new Date().toISOString()
      }
    });
  }

  /**
   * Validate an entity
   */
  validateEntity(entity) {
    const errors = [];
    
    // Required fields
    if (!entity.entityGuid) errors.push('Missing entityGuid');
    if (!entity.entityType) errors.push('Missing entityType');
    if (!entity['entity.name']) errors.push('Missing entity.name');
    if (!entity.provider) errors.push('Missing provider');
    
    // GUID format validation
    const guidPattern = /^\d+\|INFRA\|MESSAGE_QUEUE_[A-Z_]+\|[a-f0-9]{32}$/;
    if (entity.entityGuid && !guidPattern.test(entity.entityGuid)) {
      errors.push(`Invalid GUID format: ${entity.entityGuid}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get synthesis statistics
   */
  getStats() {
    const entities = Array.from(this.entities.values());
    const relationships = Array.from(this.relationships.values());
    
    const stats = {
      totalEntities: entities.length,
      totalRelationships: relationships.length,
      entitiesByType: {},
      relationshipsByType: {},
      healthSummary: {
        healthy: 0,
        warning: 0,
        critical: 0
      }
    };
    
    // Count entities by type
    Object.values(this.entityTypes).forEach(type => {
      stats.entitiesByType[type] = entities.filter(e => e.entityType === type).length;
    });
    
    // Count relationships by type
    Object.values(this.relationshipTypes).forEach(type => {
      stats.relationshipsByType[type] = relationships.filter(r => r.type === type).length;
    });
    
    // Health summary
    entities.forEach(entity => {
      if (entity.alertLevel === 'CRITICAL') {
        stats.healthSummary.critical++;
      } else if (entity.alertLevel === 'WARNING') {
        stats.healthSummary.warning++;
      } else {
        stats.healthSummary.healthy++;
      }
    });
    
    return stats;
  }

  // Helper methods
  inferClusterName(hostname) {
    // Extract cluster name from hostname patterns
    if (hostname.includes('.kafka.')) {
      return hostname.split('.kafka.')[0];
    }
    if (hostname.includes('-kafka-')) {
      return hostname.split('-kafka-')[0] + '-kafka';
    }
    return 'default-cluster';
  }

  calculateBrokerCpu(brokerData) {
    const idlePercent = brokerData['request.handlerIdle'] || 100;
    return Math.max(0, 100 - idlePercent);
  }

  calculateBrokerMemory(brokerData) {
    const heapUsed = brokerData['jvm.heapUsed'] || 0;
    const heapMax = brokerData['jvm.heapMax'] || 1;
    return heapMax > 0 ? (heapUsed / heapMax) * 100 : 0;
  }

  calculateBrokerThroughput(brokerData) {
    const bytesIn = brokerData['broker.bytesInPerSecond'] || 0;
    const bytesOut = brokerData['broker.bytesOutPerSecond'] || 0;
    return bytesIn + bytesOut;
  }

  calculateBrokerLatency(brokerData) {
    const fetchLatency = brokerData['request.avgTimeFetch'] || 0;
    const produceLatency = brokerData['request.avgTimeProduce'] || 0;
    return (fetchLatency + produceLatency) / 2;
  }

  calculateBrokerStatus(brokerData) {
    if (brokerData.underReplicatedPartitions > 0) return 'DEGRADED';
    if (brokerData.offlinePartitionsCount > 0) return 'CRITICAL';
    if (this.calculateBrokerCpu(brokerData) > 90) return 'WARNING';
    return 'HEALTHY';
  }

  calculateTopicThroughputOut(topicData) {
    // Estimate based on bytes out and average message size
    const bytesOut = topicData['topic.bytesOutPerSecond'] || 0;
    const avgMessageSize = 1024; // 1KB average
    return Math.floor(bytesOut / avgMessageSize);
  }

  calculateTopicStatus(topicData) {
    if (topicData['topic.underReplicatedPartitions'] > 0) return 'DEGRADED';
    return 'HEALTHY';
  }

  calculateClusterHealthScore(cluster, brokers) {
    let score = 100;
    
    // Deduct for under-replicated partitions
    if (cluster.underReplicatedPartitions > 0) {
      score -= Math.min(30, cluster.underReplicatedPartitions * 2);
    }
    
    // Deduct for offline partitions
    if (cluster.offlinePartitionsCount > 0) {
      score -= Math.min(50, cluster.offlinePartitionsCount * 10);
    }
    
    // Deduct for unhealthy brokers
    const unhealthyBrokers = brokers.filter(b => b.status !== 'HEALTHY').length;
    if (unhealthyBrokers > 0) {
      score -= Math.min(20, unhealthyBrokers * 5);
    }
    
    // Deduct for high resource usage
    const avgCpu = cluster['cluster.cpu.average'] || 0;
    if (avgCpu > 80) score -= 10;
    if (avgCpu > 90) score -= 10;
    
    return Math.max(0, score);
  }

  groupConsumersByGroupId(consumers) {
    const grouped = {};
    consumers.forEach(consumer => {
      const groupId = consumer['consumer.group.id'];
      if (!grouped[groupId]) {
        grouped[groupId] = [];
      }
      grouped[groupId].push(consumer);
    });
    return grouped;
  }

  determineConsumerGroupState(consumers) {
    const totalLag = consumers.reduce((sum, c) => sum + (c['consumer.lag'] || 0), 0);
    const avgMessageRate = consumers.reduce((sum, c) => 
      sum + (c['consumer.messageRate'] || 0), 0
    ) / consumers.length;
    
    if (totalLag === 0) return 'STABLE';
    if (totalLag > 10000) return 'LAGGING';
    if (avgMessageRate === 0) return 'IDLE';
    return 'ACTIVE';
  }
}

module.exports = EntitySynthesisEngine;