/**
 * MESSAGE_QUEUE_CLUSTER Entity
 * 
 * Represents a message queue cluster with health, throughput, and availability metrics.
 * Based on docs/README.md specification.
 */

const BaseEntity = require('./base-entity');

class MessageQueueCluster extends BaseEntity {
  static ENTITY_TYPE = 'MESSAGE_QUEUE_CLUSTER';

  constructor(config = {}) {
    super({
      ...config,
      entityType: MessageQueueCluster.ENTITY_TYPE
    });

    // Cluster-specific properties
    this.clusterName = config.clusterName || config.name;
    this.region = config.region;
    this.environment = config.environment || 'production';
    this.version = config.version;
    this.brokerCount = config.brokerCount || 3;
    this.topicCount = config.topicCount || 0;
    this.totalPartitions = config.totalPartitions || 0;
    
    // Update metadata with cluster-specific info
    this.updateMetadata('clusterName', this.clusterName);
    this.updateMetadata('region', this.region);
    this.updateMetadata('environment', this.environment);
    this.updateMetadata('version', this.version);
    this.updateMetadata('brokerCount', this.brokerCount);
  }

  /**
   * Generate composite key for GUID
   */
  generateCompositeKey() {
    return `${this.clusterName}:${this.provider}:${this.region || 'default'}`;
  }

  /**
   * Initialize golden metrics for cluster
   */
  initializeGoldenMetrics() {
    return [
      {
        name: 'cluster.health.score',
        value: 100.0,
        unit: 'percentage',
        timestamp: new Date().toISOString()
      },
      {
        name: 'cluster.throughput.total',
        value: 0,
        unit: 'messages/second',
        timestamp: new Date().toISOString()
      },
      {
        name: 'cluster.error.rate',
        value: 0.0,
        unit: 'percentage',
        timestamp: new Date().toISOString()
      },
      {
        name: 'cluster.availability',
        value: 100.0,
        unit: 'percentage',
        timestamp: new Date().toISOString()
      }
    ];
  }

  /**
   * Add broker to cluster
   */
  addBroker(brokerGuid) {
    this.addRelationship('CONTAINS', brokerGuid, { 
      entityType: 'MESSAGE_QUEUE_BROKER',
      relationshipType: 'brokers'
    });
    this.brokerCount = this.relationships.filter(r => 
      r.type === 'CONTAINS' && r.metadata.entityType === 'MESSAGE_QUEUE_BROKER'
    ).length;
    this.updateMetadata('brokerCount', this.brokerCount);
  }

  /**
   * Add topic to cluster
   */
  addTopic(topicGuid) {
    this.addRelationship('CONTAINS', topicGuid, { 
      entityType: 'MESSAGE_QUEUE_TOPIC',
      relationshipType: 'topics'
    });
    this.topicCount = this.relationships.filter(r => 
      r.type === 'CONTAINS' && r.metadata.entityType === 'MESSAGE_QUEUE_TOPIC'
    ).length;
    this.updateMetadata('topicCount', this.topicCount);
  }

  /**
   * Calculate cluster health score
   */
  calculateHealthScore() {
    const healthMetric = this.goldenMetrics.find(m => m.name === 'cluster.health.score');
    const errorRate = this.goldenMetrics.find(m => m.name === 'cluster.error.rate')?.value || 0;
    const availability = this.goldenMetrics.find(m => m.name === 'cluster.availability')?.value || 100;
    
    // Health score based on error rate and availability
    const baseHealth = Math.max(0, 100 - (errorRate * 10));
    const availabilityImpact = availability * 0.8; // Availability has 80% weight
    const healthScore = Math.min(100, (baseHealth * 0.2) + availabilityImpact);
    
    this.updateGoldenMetric('cluster.health.score', Math.round(healthScore * 10) / 10, 'percentage');
    return healthScore;
  }

  /**
   * Update cluster throughput
   */
  updateThroughput(messagesPerSecond) {
    this.updateGoldenMetric('cluster.throughput.total', messagesPerSecond, 'messages/second');
  }

  /**
   * Update error rate
   */
  updateErrorRate(errorRate) {
    this.updateGoldenMetric('cluster.error.rate', errorRate, 'percentage');
    this.calculateHealthScore();
  }

  /**
   * Update availability
   */
  updateAvailability(availability) {
    this.updateGoldenMetric('cluster.availability', availability, 'percentage');
    this.calculateHealthScore();
  }

  /**
   * Check if cluster is healthy
   */
  isHealthy() {
    const healthScore = this.goldenMetrics.find(m => m.name === 'cluster.health.score')?.value || 0;
    const errorRate = this.goldenMetrics.find(m => m.name === 'cluster.error.rate')?.value || 0;
    const availability = this.goldenMetrics.find(m => m.name === 'cluster.availability')?.value || 0;
    
    return healthScore >= 80 && errorRate < 5 && availability >= 95;
  }

  /**
   * Get cluster status
   */
  getStatus() {
    const healthScore = this.goldenMetrics.find(m => m.name === 'cluster.health.score')?.value || 0;
    
    if (healthScore >= 90) return 'HEALTHY';
    if (healthScore >= 70) return 'WARNING';
    if (healthScore >= 50) return 'DEGRADED';
    return 'CRITICAL';
  }

  /**
   * Generate provider-specific event payload
   */
  toEventPayload() {
    const basePayload = super.toEventPayload();
    
    return {
      ...basePayload,
      clusterName: this.clusterName,
      region: this.region,
      environment: this.environment,
      version: this.version,
      brokerCount: this.brokerCount,
      topicCount: this.topicCount,
      totalPartitions: this.totalPartitions,
      status: this.getStatus(),
      
      // Provider-specific fields based on provider type
      ...(this.provider === 'kafka' && {
        'kafka.cluster.id': this.metadata.clusterId,
        'bootstrap.servers': this.metadata.bootstrapServers
      }),
      
      ...(this.provider === 'rabbitmq' && {
        'rabbitmq.cluster.name': this.clusterName,
        'management.plugin.enabled': true
      }),
      
      ...(this.provider === 'sqs' && {
        'aws.region': this.region,
        'aws.account.id': this.metadata.awsAccountId
      })
    };
  }

  /**
   * Validate cluster-specific requirements
   */
  validate() {
    const errors = super.validate();
    
    if (!this.clusterName) {
      errors.push('clusterName is required');
    }
    
    if (this.clusterName && !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(this.clusterName)) {
      errors.push('clusterName must be lowercase alphanumeric with hyphens');
    }
    
    if (this.clusterName && this.clusterName.length > 63) {
      errors.push('clusterName must be 63 characters or less');
    }
    
    return errors;
  }

  /**
   * Get cluster summary with metrics
   */
  getSummary() {
    const baseSummary = super.getSummary();
    const healthScore = this.goldenMetrics.find(m => m.name === 'cluster.health.score')?.value || 0;
    const throughput = this.goldenMetrics.find(m => m.name === 'cluster.throughput.total')?.value || 0;
    
    return {
      ...baseSummary,
      clusterName: this.clusterName,
      region: this.region,
      environment: this.environment,
      brokerCount: this.brokerCount,
      topicCount: this.topicCount,
      status: this.getStatus(),
      healthScore: healthScore,
      throughput: throughput
    };
  }
}

module.exports = MessageQueueCluster;