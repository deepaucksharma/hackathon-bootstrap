/**
 * MESSAGE_QUEUE_BROKER Entity
 * 
 * Represents a message queue broker with CPU, memory, network, and latency metrics.
 * Based on docs/README.md specification.
 */

const BaseEntity = require('./base-entity');

class MessageQueueBroker extends BaseEntity {
  static ENTITY_TYPE = 'MESSAGE_QUEUE_BROKER';

  constructor(config = {}) {
    super({
      ...config,
      entityType: MessageQueueBroker.ENTITY_TYPE
    });

    // Broker-specific properties
    this.brokerId = config.brokerId;
    this.hostname = config.hostname;
    this.port = config.port || 9092;
    this.clusterName = config.clusterName;
    this.isController = config.isController || false;
    this.rack = config.rack;
    this.partitionCount = config.partitionCount || 0;
    this.leaderPartitions = config.leaderPartitions || 0;
    
    // Update metadata with broker-specific info
    this.updateMetadata('brokerId', this.brokerId);
    this.updateMetadata('hostname', this.hostname);
    this.updateMetadata('port', this.port);
    this.updateMetadata('clusterName', this.clusterName);
    this.updateMetadata('isController', this.isController);
    this.updateMetadata('rack', this.rack);
  }

  /**
   * Generate composite key for GUID
   */
  generateCompositeKey() {
    return `${this.clusterName}:${this.brokerId}:${this.hostname}`;
  }

  /**
   * Initialize golden metrics for broker
   */
  initializeGoldenMetrics() {
    return [
      {
        name: 'broker.cpu.usage',
        value: 0.0,
        unit: 'percentage',
        timestamp: new Date().toISOString()
      },
      {
        name: 'broker.memory.usage',
        value: 0.0,
        unit: 'percentage',
        timestamp: new Date().toISOString()
      },
      {
        name: 'broker.network.throughput',
        value: 0,
        unit: 'bytes/second',
        timestamp: new Date().toISOString()
      },
      {
        name: 'broker.request.latency',
        value: 0.0,
        unit: 'milliseconds',
        timestamp: new Date().toISOString()
      }
    ];
  }

  /**
   * Update CPU usage
   */
  updateCpuUsage(cpuPercentage) {
    this.updateGoldenMetric('broker.cpu.usage', cpuPercentage, 'percentage');
  }

  /**
   * Update memory usage
   */
  updateMemoryUsage(memoryPercentage) {
    this.updateGoldenMetric('broker.memory.usage', memoryPercentage, 'percentage');
  }

  /**
   * Update network throughput
   */
  updateNetworkThroughput(bytesPerSecond) {
    this.updateGoldenMetric('broker.network.throughput', bytesPerSecond, 'bytes/second');
  }

  /**
   * Update request latency
   */
  updateRequestLatency(latencyMs) {
    this.updateGoldenMetric('broker.request.latency', latencyMs, 'milliseconds');
  }

  /**
   * Set as cluster controller
   */
  setAsController(isController = true) {
    this.isController = isController;
    this.updateMetadata('isController', this.isController);
  }

  /**
   * Update partition counts
   */
  updatePartitionCounts(total, leader) {
    this.partitionCount = total;
    this.leaderPartitions = leader;
    this.updateMetadata('partitionCount', this.partitionCount);
    this.updateMetadata('leaderPartitions', this.leaderPartitions);
  }

  /**
   * Add relationship to cluster
   */
  setCluster(clusterGuid) {
    this.addRelationship('MANAGED_BY', clusterGuid, { 
      entityType: 'MESSAGE_QUEUE_CLUSTER',
      relationshipType: 'cluster'
    });
  }

  /**
   * Add partition hosted by this broker
   */
  addPartition(partitionGuid, topicName, partitionId) {
    this.addRelationship('HOSTS', partitionGuid, { 
      entityType: 'PARTITION',
      topicName: topicName,
      partitionId: partitionId,
      relationshipType: 'partitions'
    });
  }

  /**
   * Check if broker is healthy
   */
  isHealthy() {
    const cpuUsage = this.goldenMetrics.find(m => m.name === 'broker.cpu.usage')?.value || 0;
    const memoryUsage = this.goldenMetrics.find(m => m.name === 'broker.memory.usage')?.value || 0;
    const latency = this.goldenMetrics.find(m => m.name === 'broker.request.latency')?.value || 0;
    
    return cpuUsage < 80 && memoryUsage < 80 && latency < 100;
  }

  /**
   * Get broker status
   */
  getStatus() {
    const cpuUsage = this.goldenMetrics.find(m => m.name === 'broker.cpu.usage')?.value || 0;
    const memoryUsage = this.goldenMetrics.find(m => m.name === 'broker.memory.usage')?.value || 0;
    const latency = this.goldenMetrics.find(m => m.name === 'broker.request.latency')?.value || 0;
    
    const highCpu = cpuUsage > 80;
    const highMemory = memoryUsage > 80;
    const highLatency = latency > 100;
    
    if (highCpu || highMemory || highLatency) {
      if (cpuUsage > 95 || memoryUsage > 95 || latency > 1000) {
        return 'CRITICAL';
      }
      return 'WARNING';
    }
    
    return 'HEALTHY';
  }

  /**
   * Calculate broker load score
   */
  calculateLoadScore() {
    const cpuUsage = this.goldenMetrics.find(m => m.name === 'broker.cpu.usage')?.value || 0;
    const memoryUsage = this.goldenMetrics.find(m => m.name === 'broker.memory.usage')?.value || 0;
    
    // Weighted average: CPU 60%, Memory 40%
    return (cpuUsage * 0.6) + (memoryUsage * 0.4);
  }

  /**
   * Generate provider-specific event payload
   */
  toEventPayload() {
    const basePayload = super.toEventPayload();
    
    return {
      ...basePayload,
      brokerId: this.brokerId,
      hostname: this.hostname,
      port: this.port,
      clusterName: this.clusterName,
      isController: this.isController,
      rack: this.rack,
      partitionCount: this.partitionCount,
      leaderPartitions: this.leaderPartitions,
      status: this.getStatus(),
      loadScore: this.calculateLoadScore(),
      
      // Provider-specific fields
      ...(this.provider === 'kafka' && {
        'kafka.broker.id': this.brokerId,
        'kafka.log.dirs': this.metadata.logDirs,
        'kafka.listeners': this.metadata.listeners
      }),
      
      ...(this.provider === 'rabbitmq' && {
        'rabbitmq.node.name': this.hostname,
        'rabbitmq.node.type': this.metadata.nodeType || 'disc',
        'rabbitmq.cluster.nodes': this.metadata.clusterNodes
      }),
      
      ...(this.provider === 'sqs' && {
        'aws.region': this.metadata.region,
        'aws.availability.zone': this.rack
      })
    };
  }

  /**
   * Validate broker-specific requirements
   */
  validate() {
    const errors = super.validate();
    
    if (this.brokerId === undefined || this.brokerId === null) {
      errors.push('brokerId is required');
    }
    
    if (!this.hostname) {
      errors.push('hostname is required');
    }
    
    if (!this.clusterName) {
      errors.push('clusterName is required');
    }
    
    if (this.port && (this.port < 1 || this.port > 65535)) {
      errors.push('port must be between 1 and 65535');
    }
    
    return errors;
  }

  /**
   * Get broker summary with performance metrics
   */
  getSummary() {
    const baseSummary = super.getSummary();
    const cpuUsage = this.goldenMetrics.find(m => m.name === 'broker.cpu.usage')?.value || 0;
    const memoryUsage = this.goldenMetrics.find(m => m.name === 'broker.memory.usage')?.value || 0;
    const throughput = this.goldenMetrics.find(m => m.name === 'broker.network.throughput')?.value || 0;
    const latency = this.goldenMetrics.find(m => m.name === 'broker.request.latency')?.value || 0;
    
    return {
      ...baseSummary,
      brokerId: this.brokerId,
      hostname: this.hostname,
      clusterName: this.clusterName,
      isController: this.isController,
      status: this.getStatus(),
      loadScore: this.calculateLoadScore(),
      performance: {
        cpu: cpuUsage,
        memory: memoryUsage,
        throughput: throughput,
        latency: latency
      }
    };
  }
}

module.exports = MessageQueueBroker;