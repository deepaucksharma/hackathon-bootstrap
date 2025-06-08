/**
 * Kafka SHIM Adapter
 * 
 * Transforms Kafka infrastructure discovery data into MESSAGE_QUEUE entities.
 * Handles Kafka-specific data structures and metrics.
 */

const BaseShimAdapter = require('../base-shim-adapter');

class KafkaShimAdapter extends BaseShimAdapter {
  constructor(config = {}) {
    super({
      provider: 'kafka',
      ...config
    });
    
    this.kafkaConfig = {
      defaultPartitions: 3,
      defaultReplicas: 2,
      metricsMapping: {
        'kafka.broker.BrokerTopicMetrics.MessagesInPerSec': 'messagesIn',
        'kafka.broker.BrokerTopicMetrics.BytesInPerSec': 'bytesIn',
        'kafka.broker.BrokerTopicMetrics.BytesOutPerSec': 'bytesOut',
        'kafka.broker.OffsetManager.NumOffsets': 'offsetCount',
        'kafka.broker.ReplicaManager.UnderReplicatedPartitions': 'underReplicatedPartitions',
        'kafka.broker.ReplicaManager.LeaderCount': 'leaderCount',
        'kafka.broker.RequestMetrics.RequestsPerSec': 'requestRate',
        'kafka.broker.RequestMetrics.TotalTimeMs': 'requestLatency'
      },
      ...config.kafkaConfig
    };
  }
  
  /**
   * Initialize Kafka-specific components
   * @protected
   */
  async _initializeProvider() {
    // Initialize any Kafka-specific connections or configurations
    this.emit('kafka:initialized', {
      metricsCount: Object.keys(this.kafkaConfig.metricsMapping).length
    });
  }
  
  /**
   * Extract Kafka components from infrastructure data
   * @protected
   */
  async _extractComponents(infrastructureData) {
    const components = {
      clusters: [],
      brokers: [],
      topics: [],
      consumerGroups: [],
      partitions: []
    };
    
    // Handle different infrastructure data formats
    if (infrastructureData.kubernetes) {
      Object.assign(components, this._extractFromKubernetes(infrastructureData.kubernetes));
    }
    
    if (infrastructureData.docker) {
      Object.assign(components, this._extractFromDocker(infrastructureData.docker));
    }
    
    if (infrastructureData.kafka) {
      Object.assign(components, this._extractFromKafkaMetrics(infrastructureData.kafka));
    }
    
    if (infrastructureData.jmx) {
      Object.assign(components, this._extractFromJMX(infrastructureData.jmx));
    }
    
    return components;
  }
  
  /**
   * Map Kafka components to MESSAGE_QUEUE entities
   * @protected
   */
  async _mapToEntities(components) {
    const entities = [];
    
    // Ensure at least one cluster exists
    if (components.clusters.length === 0 && (components.brokers.length > 0 || components.topics.length > 0)) {
      components.clusters.push({
        id: 'default',
        name: 'kafka-cluster',
        brokerCount: components.brokers.length
      });
    }
    
    // Map clusters
    for (const cluster of components.clusters) {
      const clusterEntity = this._createClusterEntity({
        name: cluster.name || `kafka-cluster-${cluster.id}`,
        region: cluster.region || this._inferRegion(cluster),
        environment: cluster.environment || this._inferEnvironment(cluster),
        metadata: {
          version: cluster.version,
          controllerId: cluster.controllerId,
          clusterSize: cluster.brokerCount || components.brokers.length,
          zookeeperConnect: cluster.zookeeperConnect,
          ...cluster.metadata
        }
      });
      entities.push(clusterEntity);
    }
    
    // Map brokers
    for (const broker of components.brokers) {
      const brokerEntity = this._createBrokerEntity({
        name: broker.name || broker.hostname || `broker-${broker.id}`,
        host: broker.host || broker.hostname || 'unknown',
        port: broker.port || 9092,
        clusterId: broker.clusterId || entities[0]?.guid,
        metadata: {
          brokerId: broker.id,
          rack: broker.rack,
          listeners: broker.listeners,
          logDirs: broker.logDirs,
          jmxPort: broker.jmxPort || 9999,
          ...broker.metadata
        }
      });
      entities.push(brokerEntity);
    }
    
    // Map topics
    for (const topic of components.topics) {
      const topicEntity = this._createTopicEntity({
        name: topic.name,
        clusterId: topic.clusterId || entities[0]?.guid,
        partitions: topic.partitionCount || this.kafkaConfig.defaultPartitions,
        replicas: topic.replicationFactor || this.kafkaConfig.defaultReplicas,
        metadata: {
          config: topic.config || {},
          retentionMs: topic.retentionMs,
          segmentMs: topic.segmentMs,
          compressionType: topic.compressionType || 'none',
          cleanupPolicy: topic.cleanupPolicy || 'delete',
          minInSyncReplicas: topic.minInSyncReplicas || 1,
          ...topic.metadata
        }
      });
      entities.push(topicEntity);
    }
    
    return entities;
  }
  
  /**
   * Extract metrics from Kafka components
   * @protected
   */
  async _extractMetrics(components) {
    const metrics = [];
    const timestamp = Date.now();
    
    // Broker metrics
    for (const broker of components.brokers) {
      if (broker.metrics) {
        const brokerMetrics = this._transformBrokerMetrics(broker.metrics, broker.id, timestamp);
        metrics.push(...brokerMetrics);
      }
    }
    
    // Topic metrics
    for (const topic of components.topics) {
      if (topic.metrics) {
        const topicMetrics = this._transformTopicMetrics(topic.metrics, topic.name, timestamp);
        metrics.push(...topicMetrics);
      }
    }
    
    // Partition metrics
    for (const partition of components.partitions || []) {
      if (partition.metrics) {
        const partitionMetrics = this._transformPartitionMetrics(partition.metrics, partition, timestamp);
        metrics.push(...partitionMetrics);
      }
    }
    
    return metrics;
  }
  
  /**
   * Build relationships between Kafka entities
   * @protected
   */
  async _buildRelationships(entities) {
    const relationships = [];
    
    const clusterEntities = entities.filter(e => e.entityType === 'MESSAGE_QUEUE_CLUSTER');
    const brokerEntities = entities.filter(e => e.entityType === 'MESSAGE_QUEUE_BROKER');
    const topicEntities = entities.filter(e => e.entityType === 'MESSAGE_QUEUE_TOPIC');
    
    // Cluster -> Broker relationships
    for (const cluster of clusterEntities) {
      for (const broker of brokerEntities) {
        if (broker.clusterId === cluster.guid) {
          relationships.push({
            source: cluster.guid,
            target: broker.guid,
            type: 'CONTAINS',
            metadata: { relationship: 'cluster-broker' }
          });
        }
      }
    }
    
    // Cluster -> Topic relationships
    for (const cluster of clusterEntities) {
      for (const topic of topicEntities) {
        if (topic.clusterId === cluster.guid) {
          relationships.push({
            source: cluster.guid,
            target: topic.guid,
            type: 'CONTAINS',
            metadata: { relationship: 'cluster-topic' }
          });
        }
      }
    }
    
    // Topic -> Broker relationships (for replicas)
    for (const topic of topicEntities) {
      const replicaBrokers = topic.metadata?.replicas || [];
      for (const brokerId of replicaBrokers) {
        const broker = brokerEntities.find(b => b.metadata?.brokerId === brokerId);
        if (broker) {
          relationships.push({
            source: topic.guid,
            target: broker.guid,
            type: 'REPLICATED_TO',
            metadata: { relationship: 'topic-replica' }
          });
        }
      }
    }
    
    return relationships;
  }
  
  /**
   * Validate Kafka infrastructure data
   * @protected
   */
  _validateInfrastructureData(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Infrastructure data must be an object');
    }
    
    // At least one data source must be present
    const validSources = ['kubernetes', 'docker', 'kafka', 'jmx'];
    const hasSources = validSources.some(source => data[source]);
    
    if (!hasSources) {
      throw new Error(`Infrastructure data must contain at least one of: ${validSources.join(', ')}`);
    }
  }
  
  // Kafka-specific extraction methods
  
  /**
   * Extract from Kubernetes data
   * @private
   */
  _extractFromKubernetes(k8sData) {
    const components = {
      clusters: [],
      brokers: [],
      topics: []
    };
    
    // Extract from StatefulSets (common for Kafka deployments)
    if (k8sData.statefulsets) {
      for (const sts of k8sData.statefulsets) {
        if (this._isKafkaStatefulSet(sts)) {
          // Extract cluster info
          const cluster = {
            name: this._extractClusterName(sts),
            id: sts.metadata.uid,
            brokerCount: sts.spec.replicas,
            metadata: {
              namespace: sts.metadata.namespace,
              labels: sts.metadata.labels,
              annotations: sts.metadata.annotations
            }
          };
          components.clusters.push(cluster);
          
          // Extract broker info from pods
          if (sts.pods) {
            for (let i = 0; i < sts.pods.length; i++) {
              const pod = sts.pods[i];
              const broker = {
                id: i,
                name: pod.metadata.name,
                host: pod.status.podIP || pod.metadata.name,
                clusterId: cluster.id,
                metadata: {
                  podName: pod.metadata.name,
                  nodeName: pod.spec.nodeName,
                  status: pod.status.phase
                }
              };
              components.brokers.push(broker);
            }
          }
        }
      }
    }
    
    // Extract from ConfigMaps (may contain topic configurations)
    if (k8sData.configmaps) {
      for (const cm of k8sData.configmaps) {
        const topics = this._extractTopicsFromConfigMap(cm);
        components.topics.push(...topics);
      }
    }
    
    return components;
  }
  
  /**
   * Extract from Docker data
   * @private
   */
  _extractFromDocker(dockerData) {
    const components = {
      clusters: [],
      brokers: [],
      topics: []
    };
    
    if (dockerData.containers) {
      const kafkaContainers = dockerData.containers.filter(c => 
        this._isKafkaContainer(c)
      );
      
      // Group containers by cluster
      const clusterGroups = this._groupContainersByCluster(kafkaContainers);
      
      for (const [clusterName, containers] of Object.entries(clusterGroups)) {
        const cluster = {
          name: clusterName,
          id: this._generateClusterId(clusterName),
          brokerCount: containers.length,
          metadata: {
            containerRuntime: 'docker'
          }
        };
        components.clusters.push(cluster);
        
        // Extract brokers from containers
        containers.forEach((container, index) => {
          const broker = {
            id: this._extractBrokerId(container) || index,
            name: container.name,
            host: container.networkSettings?.ipAddress || container.name,
            port: this._extractKafkaPort(container) || 9092,
            clusterId: cluster.id,
            metadata: {
              containerId: container.id,
              image: container.image,
              status: container.state
            }
          };
          components.brokers.push(broker);
        });
      }
    }
    
    return components;
  }
  
  /**
   * Extract from Kafka metrics data
   * @private
   */
  _extractFromKafkaMetrics(kafkaData) {
    const components = {
      clusters: [],
      brokers: [],
      topics: [],
      partitions: []
    };
    
    if (kafkaData.clusters) {
      components.clusters = kafkaData.clusters.map(c => ({
        id: c.clusterId,
        name: c.clusterName || `cluster-${c.clusterId}`,
        controllerId: c.controllerId,
        version: c.kafkaVersion,
        metadata: c.metadata || {}
      }));
    }
    
    if (kafkaData.brokers) {
      components.brokers = kafkaData.brokers.map(b => ({
        id: b.brokerId,
        host: b.host,
        port: b.port,
        clusterId: b.clusterId,
        rack: b.rack,
        listeners: b.listeners,
        logDirs: b.logDirs,
        metrics: b.metrics || {},
        metadata: b.metadata || {}
      }));
    }
    
    if (kafkaData.topics) {
      components.topics = kafkaData.topics.map(t => ({
        name: t.topic,
        partitionCount: t.partitionCount,
        replicationFactor: t.replicationFactor,
        config: t.config || {},
        metrics: t.metrics || {},
        metadata: t.metadata || {}
      }));
    }
    
    if (kafkaData.partitions) {
      components.partitions = kafkaData.partitions;
    }
    
    return components;
  }
  
  /**
   * Extract from JMX data
   * @private
   */
  _extractFromJMX(jmxData) {
    const components = {
      clusters: [],
      brokers: [],
      topics: []
    };
    
    // JMX metrics are typically per-broker
    if (jmxData.mbeans) {
      const brokerMetrics = this._parseBrokerJMXMetrics(jmxData.mbeans);
      const topicMetrics = this._parseTopicJMXMetrics(jmxData.mbeans);
      
      // Infer broker information from metrics
      const brokerIds = new Set();
      brokerMetrics.forEach(m => {
        if (m.brokerId) brokerIds.add(m.brokerId);
      });
      
      brokerIds.forEach(id => {
        components.brokers.push({
          id,
          metrics: brokerMetrics.filter(m => m.brokerId === id)
        });
      });
      
      // Extract unique topics
      const topicNames = new Set();
      topicMetrics.forEach(m => {
        if (m.topic) topicNames.add(m.topic);
      });
      
      topicNames.forEach(name => {
        components.topics.push({
          name,
          metrics: topicMetrics.filter(m => m.topic === name)
        });
      });
    }
    
    return components;
  }
  
  // Metric transformation methods
  
  /**
   * Transform broker metrics
   * @private
   */
  _transformBrokerMetrics(metrics, brokerId, timestamp) {
    const transformed = [];
    
    for (const [kafkaMetric, standardMetric] of Object.entries(this.kafkaConfig.metricsMapping)) {
      if (metrics[kafkaMetric] !== undefined) {
        transformed.push({
          name: `kafka.broker.${standardMetric}`,
          type: 'gauge',
          value: metrics[kafkaMetric],
          timestamp,
          attributes: {
            brokerId: String(brokerId),
            provider: 'kafka'
          }
        });
      }
    }
    
    return transformed;
  }
  
  /**
   * Transform topic metrics
   * @private
   */
  _transformTopicMetrics(metrics, topicName, timestamp) {
    const transformed = [];
    
    const topicMetricsMapping = {
      'MessagesInPerSec': 'messageRate',
      'BytesInPerSec': 'bytesInRate',
      'BytesOutPerSec': 'bytesOutRate',
      'FailedFetchRequestsPerSec': 'failedFetchRate',
      'FailedProduceRequestsPerSec': 'failedProduceRate'
    };
    
    for (const [metric, standardName] of Object.entries(topicMetricsMapping)) {
      if (metrics[metric] !== undefined) {
        transformed.push({
          name: `kafka.topic.${standardName}`,
          type: 'gauge',
          value: metrics[metric],
          timestamp,
          attributes: {
            topic: topicName,
            provider: 'kafka'
          }
        });
      }
    }
    
    return transformed;
  }
  
  /**
   * Transform partition metrics
   * @private
   */
  _transformPartitionMetrics(metrics, partition, timestamp) {
    const transformed = [];
    
    const partitionMetrics = {
      'Size': 'size',
      'LogEndOffset': 'endOffset',
      'LogStartOffset': 'startOffset',
      'NumLogSegments': 'segmentCount'
    };
    
    for (const [metric, standardName] of Object.entries(partitionMetrics)) {
      if (metrics[metric] !== undefined) {
        transformed.push({
          name: `kafka.partition.${standardName}`,
          type: 'gauge',
          value: metrics[metric],
          timestamp,
          attributes: {
            topic: partition.topic,
            partition: String(partition.id),
            provider: 'kafka'
          }
        });
      }
    }
    
    return transformed;
  }
  
  // Helper methods
  
  _isKafkaStatefulSet(sts) {
    const labels = sts.metadata?.labels || {};
    const name = sts.metadata?.name || '';
    
    return labels.app === 'kafka' || 
           labels['app.kubernetes.io/name'] === 'kafka' ||
           name.includes('kafka');
  }
  
  _isKafkaContainer(container) {
    const image = container.image || '';
    const name = container.name || '';
    const env = container.env || [];
    
    return image.includes('kafka') ||
           name.includes('kafka') ||
           env.some(e => e.name === 'KAFKA_BROKER_ID');
  }
  
  _extractClusterName(sts) {
    const labels = sts.metadata?.labels || {};
    return labels['kafka-cluster'] || 
           labels.cluster || 
           sts.metadata.name.replace(/-\d+$/, '');
  }
  
  _extractBrokerId(container) {
    const env = container.env || [];
    const brokerIdEnv = env.find(e => e.name === 'KAFKA_BROKER_ID');
    return brokerIdEnv ? parseInt(brokerIdEnv.value) : null;
  }
  
  _extractKafkaPort(container) {
    const ports = container.ports || [];
    const kafkaPort = ports.find(p => p.containerPort === 9092 || p.name === 'kafka');
    return kafkaPort ? kafkaPort.containerPort : null;
  }
  
  _groupContainersByCluster(containers) {
    const groups = {};
    
    containers.forEach(container => {
      const clusterName = this._extractClusterNameFromContainer(container);
      if (!groups[clusterName]) {
        groups[clusterName] = [];
      }
      groups[clusterName].push(container);
    });
    
    return groups;
  }
  
  _extractClusterNameFromContainer(container) {
    const labels = container.labels || {};
    const env = container.env || [];
    
    // Try labels first
    if (labels['kafka.cluster']) return labels['kafka.cluster'];
    if (labels.cluster) return labels.cluster;
    
    // Try environment variables
    const clusterEnv = env.find(e => e.name === 'KAFKA_CLUSTER_ID' || e.name === 'CLUSTER_NAME');
    if (clusterEnv) return clusterEnv.value;
    
    // Default to extracting from container name
    return container.name.replace(/-broker-\d+$/, '') || 'default';
  }
  
  _generateClusterId(clusterName) {
    // Generate a deterministic ID from cluster name
    let hash = 0;
    for (let i = 0; i < clusterName.length; i++) {
      const char = clusterName.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `kafka-cluster-${Math.abs(hash)}`;
  }
  
  _inferRegion(cluster) {
    // Try to infer region from metadata
    const metadata = cluster.metadata || {};
    
    if (metadata.region) return metadata.region;
    if (metadata.labels?.region) return metadata.labels.region;
    if (metadata.labels?.['topology.kubernetes.io/region']) {
      return metadata.labels['topology.kubernetes.io/region'];
    }
    
    // Try to infer from cluster name
    const regionPatterns = {
      'us-east': ['use1', 'useast', 'us-east'],
      'us-west': ['usw1', 'uswest', 'us-west'],
      'eu-west': ['euw1', 'euwest', 'eu-west'],
      'ap-south': ['aps1', 'apsouth', 'ap-south']
    };
    
    const lowerName = (cluster.name || '').toLowerCase();
    for (const [region, patterns] of Object.entries(regionPatterns)) {
      if (patterns.some(p => lowerName.includes(p))) {
        return region;
      }
    }
    
    return 'unknown';
  }
  
  _inferEnvironment(cluster) {
    const metadata = cluster.metadata || {};
    
    if (metadata.environment) return metadata.environment;
    if (metadata.labels?.environment) return metadata.labels.environment;
    if (metadata.labels?.env) return metadata.labels.env;
    
    // Try to infer from cluster name or namespace
    const envPatterns = {
      'production': ['prod', 'prd', 'production'],
      'staging': ['stage', 'stg', 'staging'],
      'development': ['dev', 'development'],
      'qa': ['qa', 'test', 'testing']
    };
    
    const searchText = `${cluster.name || ''} ${metadata.namespace || ''}`.toLowerCase();
    
    for (const [env, patterns] of Object.entries(envPatterns)) {
      if (patterns.some(p => searchText.includes(p))) {
        return env;
      }
    }
    
    return 'production'; // Default to production
  }
  
  _parseBrokerJMXMetrics(mbeans) {
    const metrics = [];
    
    for (const mbean of mbeans) {
      if (mbean.objectName && mbean.objectName.includes('kafka.server')) {
        const brokerId = this._extractBrokerIdFromMBean(mbean);
        if (brokerId !== null) {
          metrics.push({
            brokerId,
            ...mbean.attributes
          });
        }
      }
    }
    
    return metrics;
  }
  
  _parseTopicJMXMetrics(mbeans) {
    const metrics = [];
    
    for (const mbean of mbeans) {
      if (mbean.objectName && mbean.objectName.includes('topic=')) {
        const topic = this._extractTopicFromMBean(mbean);
        if (topic) {
          metrics.push({
            topic,
            ...mbean.attributes
          });
        }
      }
    }
    
    return metrics;
  }
  
  _extractBrokerIdFromMBean(mbean) {
    const match = mbean.objectName.match(/BrokerId=(\d+)/);
    return match ? parseInt(match[1]) : null;
  }
  
  _extractTopicFromMBean(mbean) {
    const match = mbean.objectName.match(/topic=([^,]+)/);
    return match ? match[1] : null;
  }
}

module.exports = KafkaShimAdapter;