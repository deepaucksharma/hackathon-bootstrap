/**
 * RabbitMQ SHIM Adapter
 * 
 * Transforms RabbitMQ infrastructure discovery data into MESSAGE_QUEUE entities.
 * Handles RabbitMQ-specific data structures, vhosts, and exchanges.
 */

const BaseShimAdapter = require('../base-shim-adapter');

class RabbitMQShimAdapter extends BaseShimAdapter {
  constructor(config = {}) {
    super({
      provider: 'rabbitmq',
      ...config
    });
    
    this.rabbitmqConfig = {
      defaultVhost: '/',
      managementPort: 15672,
      amqpPort: 5672,
      metricsMapping: {
        'rabbitmq.queue.messages': 'messages',
        'rabbitmq.queue.messages.ready': 'messagesReady',
        'rabbitmq.queue.messages.unacknowledged': 'messagesUnacked',
        'rabbitmq.queue.message_stats.publish': 'publishRate',
        'rabbitmq.queue.message_stats.deliver': 'deliverRate',
        'rabbitmq.queue.message_stats.ack': 'ackRate',
        'rabbitmq.node.mem_used': 'memoryUsed',
        'rabbitmq.node.disk_free': 'diskFree',
        'rabbitmq.node.fd_used': 'fileDescriptorsUsed',
        'rabbitmq.node.sockets_used': 'socketsUsed'
      },
      ...config.rabbitmqConfig
    };
  }
  
  /**
   * Initialize RabbitMQ-specific components
   * @protected
   */
  async _initializeProvider() {
    // Initialize RabbitMQ-specific configurations
    this.emit('rabbitmq:initialized', {
      defaultVhost: this.rabbitmqConfig.defaultVhost,
      metricsCount: Object.keys(this.rabbitmqConfig.metricsMapping).length
    });
  }
  
  /**
   * Extract RabbitMQ components from infrastructure data
   * @protected
   */
  async _extractComponents(infrastructureData) {
    const components = {
      clusters: [],
      nodes: [],
      vhosts: [],
      queues: [],
      exchanges: [],
      bindings: []
    };
    
    // Handle different infrastructure data formats
    if (infrastructureData.kubernetes) {
      Object.assign(components, this._extractFromKubernetes(infrastructureData.kubernetes));
    }
    
    if (infrastructureData.docker) {
      Object.assign(components, this._extractFromDocker(infrastructureData.docker));
    }
    
    if (infrastructureData.rabbitmq) {
      Object.assign(components, this._extractFromRabbitMQAPI(infrastructureData.rabbitmq));
    }
    
    if (infrastructureData.prometheus) {
      Object.assign(components, this._extractFromPrometheus(infrastructureData.prometheus));
    }
    
    return components;
  }
  
  /**
   * Map RabbitMQ components to MESSAGE_QUEUE entities
   * @protected
   */
  async _mapToEntities(components) {
    const entities = [];
    
    // Ensure at least one cluster exists
    if (components.clusters.length === 0 && (components.nodes.length > 0 || components.queues.length > 0)) {
      components.clusters.push({
        name: 'rabbitmq-cluster',
        nodeCount: components.nodes.length
      });
    }
    
    // Map clusters
    for (const cluster of components.clusters) {
      const clusterEntity = this._createClusterEntity({
        name: cluster.name || 'rabbitmq-cluster',
        region: cluster.region || this._inferRegion(cluster),
        environment: cluster.environment || this._inferEnvironment(cluster),
        metadata: {
          version: cluster.version,
          erlangVersion: cluster.erlangVersion,
          managementVersion: cluster.managementVersion,
          clusterName: cluster.clusterName,
          nodeCount: cluster.nodeCount || components.nodes.length,
          ...cluster.metadata
        }
      });
      entities.push(clusterEntity);
    }
    
    // Map nodes as brokers
    for (const node of components.nodes) {
      const brokerEntity = this._createBrokerEntity({
        name: node.name,
        host: node.host || node.name.split('@')[1] || node.name,
        port: node.port || this.rabbitmqConfig.amqpPort,
        clusterId: node.clusterId || entities[0]?.guid,
        metadata: {
          nodeType: node.type || 'disc',
          running: node.running !== false,
          memoryLimit: node.memLimit,
          diskFreeLimit: node.diskFreeLimit,
          erlangProcesses: node.procUsed,
          uptime: node.uptime,
          managementPort: node.managementPort || this.rabbitmqConfig.managementPort,
          ...node.metadata
        }
      });
      entities.push(brokerEntity);
    }
    
    // Map queues
    for (const queue of components.queues) {
      const queueEntity = this._createQueueEntity({
        name: queue.name,
        vhost: queue.vhost || this.rabbitmqConfig.defaultVhost,
        clusterId: queue.clusterId || entities[0]?.guid,
        metadata: {
          durable: queue.durable !== false,
          autoDelete: queue.auto_delete === true,
          exclusive: queue.exclusive === true,
          arguments: queue.arguments || {},
          node: queue.node,
          state: queue.state || 'running',
          consumers: queue.consumers || 0,
          consumerUtilisation: queue.consumer_utilisation,
          idleSince: queue.idle_since,
          policy: queue.policy,
          ...queue.metadata
        }
      });
      entities.push(queueEntity);
    }
    
    // Note: Exchanges could be mapped as topics if needed
    // This depends on the use case and how exchanges are used
    
    return entities;
  }
  
  /**
   * Extract metrics from RabbitMQ components
   * @protected
   */
  async _extractMetrics(components) {
    const metrics = [];
    const timestamp = Date.now();
    
    // Node metrics
    for (const node of components.nodes) {
      if (node.metrics) {
        const nodeMetrics = this._transformNodeMetrics(node.metrics, node.name, timestamp);
        metrics.push(...nodeMetrics);
      }
    }
    
    // Queue metrics
    for (const queue of components.queues) {
      if (queue.metrics || queue.message_stats) {
        const queueMetrics = this._transformQueueMetrics(
          { ...queue.metrics, ...queue.message_stats },
          queue.name,
          queue.vhost,
          timestamp
        );
        metrics.push(...queueMetrics);
      }
    }
    
    // Vhost metrics
    for (const vhost of components.vhosts) {
      if (vhost.metrics) {
        const vhostMetrics = this._transformVhostMetrics(vhost.metrics, vhost.name, timestamp);
        metrics.push(...vhostMetrics);
      }
    }
    
    return metrics;
  }
  
  /**
   * Build relationships between RabbitMQ entities
   * @protected
   */
  async _buildRelationships(entities) {
    const relationships = [];
    
    const clusterEntities = entities.filter(e => e.entityType === 'MESSAGE_QUEUE_CLUSTER');
    const brokerEntities = entities.filter(e => e.entityType === 'MESSAGE_QUEUE_BROKER');
    const queueEntities = entities.filter(e => e.entityType === 'MESSAGE_QUEUE_QUEUE');
    
    // Cluster -> Broker (Node) relationships
    for (const cluster of clusterEntities) {
      for (const broker of brokerEntities) {
        if (broker.clusterId === cluster.guid) {
          relationships.push({
            source: cluster.guid,
            target: broker.guid,
            type: 'CONTAINS',
            metadata: { relationship: 'cluster-node' }
          });
        }
      }
    }
    
    // Cluster -> Queue relationships
    for (const cluster of clusterEntities) {
      for (const queue of queueEntities) {
        if (queue.clusterId === cluster.guid) {
          relationships.push({
            source: cluster.guid,
            target: queue.guid,
            type: 'CONTAINS',
            metadata: { relationship: 'cluster-queue' }
          });
        }
      }
    }
    
    // Queue -> Node relationships (queue hosted on node)
    for (const queue of queueEntities) {
      const nodeName = queue.metadata?.node;
      if (nodeName) {
        const broker = brokerEntities.find(b => b.name === nodeName);
        if (broker) {
          relationships.push({
            source: queue.guid,
            target: broker.guid,
            type: 'HOSTED_ON',
            metadata: { relationship: 'queue-node' }
          });
        }
      }
    }
    
    return relationships;
  }
  
  /**
   * Validate RabbitMQ infrastructure data
   * @protected
   */
  _validateInfrastructureData(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Infrastructure data must be an object');
    }
    
    // At least one data source must be present
    const validSources = ['kubernetes', 'docker', 'rabbitmq', 'prometheus'];
    const hasSources = validSources.some(source => data[source]);
    
    if (!hasSources) {
      throw new Error(`Infrastructure data must contain at least one of: ${validSources.join(', ')}`);
    }
  }
  
  // RabbitMQ-specific extraction methods
  
  /**
   * Extract from Kubernetes data
   * @private
   */
  _extractFromKubernetes(k8sData) {
    const components = {
      clusters: [],
      nodes: [],
      queues: []
    };
    
    // Extract from StatefulSets
    if (k8sData.statefulsets) {
      for (const sts of k8sData.statefulsets) {
        if (this._isRabbitMQStatefulSet(sts)) {
          // Extract cluster info
          const cluster = {
            name: this._extractClusterName(sts),
            id: sts.metadata.uid,
            nodeCount: sts.spec.replicas,
            metadata: {
              namespace: sts.metadata.namespace,
              labels: sts.metadata.labels,
              annotations: sts.metadata.annotations
            }
          };
          components.clusters.push(cluster);
          
          // Extract node info from pods
          if (sts.pods) {
            for (let i = 0; i < sts.pods.length; i++) {
              const pod = sts.pods[i];
              const node = {
                name: `${pod.metadata.name}@${pod.spec.nodeName || pod.metadata.name}`,
                host: pod.status.podIP || pod.metadata.name,
                clusterId: cluster.id,
                metadata: {
                  podName: pod.metadata.name,
                  nodeName: pod.spec.nodeName,
                  status: pod.status.phase
                }
              };
              components.nodes.push(node);
            }
          }
        }
      }
    }
    
    // Extract from Services (might expose management API)
    if (k8sData.services) {
      for (const svc of k8sData.services) {
        if (this._isRabbitMQService(svc)) {
          // Update cluster/node info with service details
          const clusterName = this._extractClusterNameFromService(svc);
          const cluster = components.clusters.find(c => c.name === clusterName);
          if (cluster) {
            cluster.metadata.serviceName = svc.metadata.name;
            cluster.metadata.serviceType = svc.spec.type;
            cluster.metadata.clusterIP = svc.spec.clusterIP;
          }
        }
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
      nodes: [],
      queues: []
    };
    
    if (dockerData.containers) {
      const rabbitmqContainers = dockerData.containers.filter(c => 
        this._isRabbitMQContainer(c)
      );
      
      // Group containers by cluster
      const clusterGroups = this._groupContainersByCluster(rabbitmqContainers);
      
      for (const [clusterName, containers] of Object.entries(clusterGroups)) {
        const cluster = {
          name: clusterName,
          id: this._generateClusterId(clusterName),
          nodeCount: containers.length,
          metadata: {
            containerRuntime: 'docker'
          }
        };
        components.clusters.push(cluster);
        
        // Extract nodes from containers
        containers.forEach((container, index) => {
          const nodeName = this._extractNodeName(container) || container.name;
          const node = {
            name: nodeName,
            host: container.networkSettings?.ipAddress || container.name,
            port: this._extractAMQPPort(container) || this.rabbitmqConfig.amqpPort,
            managementPort: this._extractManagementPort(container) || this.rabbitmqConfig.managementPort,
            clusterId: cluster.id,
            metadata: {
              containerId: container.id,
              image: container.image,
              status: container.state
            }
          };
          components.nodes.push(node);
        });
      }
    }
    
    return components;
  }
  
  /**
   * Extract from RabbitMQ Management API data
   * @private
   */
  _extractFromRabbitMQAPI(rabbitmqData) {
    const components = {
      clusters: [],
      nodes: [],
      vhosts: [],
      queues: [],
      exchanges: [],
      bindings: []
    };
    
    // Extract cluster overview
    if (rabbitmqData.overview) {
      const overview = rabbitmqData.overview;
      components.clusters.push({
        name: overview.cluster_name || 'rabbitmq-cluster',
        version: overview.rabbitmq_version,
        erlangVersion: overview.erlang_version,
        managementVersion: overview.management_version,
        metadata: {
          rates_mode: overview.rates_mode,
          exchange_types: overview.exchange_types,
          message_stats: overview.message_stats
        }
      });
    }
    
    // Extract nodes
    if (rabbitmqData.nodes) {
      components.nodes = rabbitmqData.nodes.map(node => ({
        name: node.name,
        type: node.type,
        running: node.running,
        memLimit: node.mem_limit,
        memUsed: node.mem_used,
        diskFreeLimit: node.disk_free_limit,
        diskFree: node.disk_free,
        procUsed: node.proc_used,
        procTotal: node.proc_total,
        uptime: node.uptime,
        metrics: {
          mem_used: node.mem_used,
          disk_free: node.disk_free,
          fd_used: node.fd_used,
          fd_total: node.fd_total,
          sockets_used: node.sockets_used,
          sockets_total: node.sockets_total
        },
        metadata: node.metadata || {}
      }));
    }
    
    // Extract vhosts
    if (rabbitmqData.vhosts) {
      components.vhosts = rabbitmqData.vhosts.map(vhost => ({
        name: vhost.name,
        tracing: vhost.tracing,
        metadata: vhost.metadata || {},
        metrics: vhost.message_stats || {}
      }));
    }
    
    // Extract queues
    if (rabbitmqData.queues) {
      components.queues = rabbitmqData.queues.map(queue => ({
        name: queue.name,
        vhost: queue.vhost,
        durable: queue.durable,
        auto_delete: queue.auto_delete,
        exclusive: queue.exclusive,
        arguments: queue.arguments,
        node: queue.node,
        state: queue.state,
        consumers: queue.consumers,
        consumer_utilisation: queue.consumer_utilisation,
        idle_since: queue.idle_since,
        policy: queue.policy,
        messages: queue.messages,
        messages_ready: queue.messages_ready,
        messages_unacknowledged: queue.messages_unacknowledged,
        message_stats: queue.message_stats,
        metrics: {
          messages: queue.messages,
          messages_ready: queue.messages_ready,
          messages_unacknowledged: queue.messages_unacknowledged,
          ...queue.message_stats
        },
        metadata: queue.metadata || {}
      }));
    }
    
    // Extract exchanges
    if (rabbitmqData.exchanges) {
      components.exchanges = rabbitmqData.exchanges.map(exchange => ({
        name: exchange.name,
        vhost: exchange.vhost,
        type: exchange.type,
        durable: exchange.durable,
        auto_delete: exchange.auto_delete,
        internal: exchange.internal,
        arguments: exchange.arguments,
        message_stats: exchange.message_stats,
        metadata: exchange.metadata || {}
      }));
    }
    
    // Extract bindings
    if (rabbitmqData.bindings) {
      components.bindings = rabbitmqData.bindings;
    }
    
    return components;
  }
  
  /**
   * Extract from Prometheus metrics
   * @private
   */
  _extractFromPrometheus(prometheusData) {
    const components = {
      clusters: [],
      nodes: [],
      queues: []
    };
    
    if (prometheusData.metrics) {
      // Parse Prometheus metrics
      const parsedMetrics = this._parsePrometheusMetrics(prometheusData.metrics);
      
      // Extract node information from metrics
      const nodeMetrics = parsedMetrics.filter(m => m.name.startsWith('rabbitmq_node_'));
      const nodeNames = new Set();
      
      nodeMetrics.forEach(metric => {
        if (metric.labels?.node) {
          nodeNames.add(metric.labels.node);
        }
      });
      
      nodeNames.forEach(nodeName => {
        const node = {
          name: nodeName,
          metrics: {}
        };
        
        // Collect metrics for this node
        nodeMetrics.forEach(metric => {
          if (metric.labels?.node === nodeName) {
            node.metrics[metric.name] = metric.value;
          }
        });
        
        components.nodes.push(node);
      });
      
      // Extract queue information from metrics
      const queueMetrics = parsedMetrics.filter(m => m.name.startsWith('rabbitmq_queue_'));
      const queueMap = new Map();
      
      queueMetrics.forEach(metric => {
        const queueKey = `${metric.labels?.vhost || '/'}:${metric.labels?.queue}`;
        if (metric.labels?.queue) {
          if (!queueMap.has(queueKey)) {
            queueMap.set(queueKey, {
              name: metric.labels.queue,
              vhost: metric.labels.vhost || '/',
              node: metric.labels.node,
              metrics: {}
            });
          }
          queueMap.get(queueKey).metrics[metric.name] = metric.value;
        }
      });
      
      components.queues = Array.from(queueMap.values());
    }
    
    return components;
  }
  
  // Metric transformation methods
  
  /**
   * Transform node metrics
   * @private
   */
  _transformNodeMetrics(metrics, nodeName, timestamp) {
    const transformed = [];
    
    for (const [rabbitmqMetric, standardMetric] of Object.entries(this.rabbitmqConfig.metricsMapping)) {
      if (rabbitmqMetric.startsWith('rabbitmq.node.') && metrics[rabbitmqMetric.replace('rabbitmq.node.', '')] !== undefined) {
        const metricName = rabbitmqMetric.replace('rabbitmq.node.', '');
        transformed.push({
          name: `rabbitmq.node.${standardMetric}`,
          type: 'gauge',
          value: metrics[metricName],
          timestamp,
          attributes: {
            node: nodeName,
            provider: 'rabbitmq'
          }
        });
      }
    }
    
    return transformed;
  }
  
  /**
   * Transform queue metrics
   * @private
   */
  _transformQueueMetrics(metrics, queueName, vhost, timestamp) {
    const transformed = [];
    
    // Basic queue metrics
    const queueMetrics = {
      'messages': 'messageCount',
      'messages_ready': 'messagesReady',
      'messages_unacknowledged': 'messagesUnacked',
      'consumers': 'consumerCount'
    };
    
    for (const [metric, standardName] of Object.entries(queueMetrics)) {
      if (metrics[metric] !== undefined) {
        transformed.push({
          name: `rabbitmq.queue.${standardName}`,
          type: 'gauge',
          value: metrics[metric],
          timestamp,
          attributes: {
            queue: queueName,
            vhost: vhost,
            provider: 'rabbitmq'
          }
        });
      }
    }
    
    // Message stats (rates)
    const rateMetrics = {
      'publish': 'publishRate',
      'publish_details.rate': 'publishRate',
      'deliver': 'deliverRate',
      'deliver_details.rate': 'deliverRate',
      'deliver_get': 'deliverGetRate',
      'deliver_get_details.rate': 'deliverGetRate',
      'ack': 'ackRate',
      'ack_details.rate': 'ackRate'
    };
    
    for (const [metric, standardName] of Object.entries(rateMetrics)) {
      const value = this._getNestedValue(metrics, metric);
      if (value !== undefined) {
        transformed.push({
          name: `rabbitmq.queue.${standardName}`,
          type: 'gauge',
          value: value,
          timestamp,
          attributes: {
            queue: queueName,
            vhost: vhost,
            provider: 'rabbitmq'
          }
        });
      }
    }
    
    return transformed;
  }
  
  /**
   * Transform vhost metrics
   * @private
   */
  _transformVhostMetrics(metrics, vhostName, timestamp) {
    const transformed = [];
    
    const vhostMetrics = {
      'messages': 'totalMessages',
      'messages_ready': 'totalMessagesReady',
      'messages_unacknowledged': 'totalMessagesUnacked',
      'publish': 'publishRate',
      'deliver': 'deliverRate',
      'confirm': 'confirmRate'
    };
    
    for (const [metric, standardName] of Object.entries(vhostMetrics)) {
      if (metrics[metric] !== undefined) {
        transformed.push({
          name: `rabbitmq.vhost.${standardName}`,
          type: 'gauge',
          value: metrics[metric],
          timestamp,
          attributes: {
            vhost: vhostName,
            provider: 'rabbitmq'
          }
        });
      }
    }
    
    return transformed;
  }
  
  // Helper methods
  
  _isRabbitMQStatefulSet(sts) {
    const labels = sts.metadata?.labels || {};
    const name = sts.metadata?.name || '';
    
    return labels.app === 'rabbitmq' || 
           labels['app.kubernetes.io/name'] === 'rabbitmq' ||
           name.includes('rabbitmq');
  }
  
  _isRabbitMQContainer(container) {
    const image = container.image || '';
    const name = container.name || '';
    const env = container.env || [];
    
    return image.includes('rabbitmq') ||
           name.includes('rabbitmq') ||
           env.some(e => e.name === 'RABBITMQ_NODENAME');
  }
  
  _isRabbitMQService(svc) {
    const labels = svc.metadata?.labels || {};
    const name = svc.metadata?.name || '';
    
    return labels.app === 'rabbitmq' || 
           labels['app.kubernetes.io/name'] === 'rabbitmq' ||
           name.includes('rabbitmq');
  }
  
  _extractClusterName(sts) {
    const labels = sts.metadata?.labels || {};
    return labels['rabbitmq-cluster'] || 
           labels.cluster || 
           sts.metadata.name.replace(/-\d+$/, '');
  }
  
  _extractClusterNameFromService(svc) {
    const labels = svc.metadata?.labels || {};
    return labels['rabbitmq-cluster'] || 
           labels.cluster || 
           svc.metadata.name.replace(/-svc$/, '');
  }
  
  _extractNodeName(container) {
    const env = container.env || [];
    const nodeNameEnv = env.find(e => e.name === 'RABBITMQ_NODENAME');
    if (nodeNameEnv) return nodeNameEnv.value;
    
    const hostname = container.hostname || container.name;
    return `rabbit@${hostname}`;
  }
  
  _extractAMQPPort(container) {
    const ports = container.ports || [];
    const amqpPort = ports.find(p => p.containerPort === 5672 || p.name === 'amqp');
    return amqpPort ? amqpPort.containerPort : null;
  }
  
  _extractManagementPort(container) {
    const ports = container.ports || [];
    const mgmtPort = ports.find(p => p.containerPort === 15672 || p.name === 'management');
    return mgmtPort ? mgmtPort.containerPort : null;
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
    if (labels['rabbitmq.cluster']) return labels['rabbitmq.cluster'];
    if (labels.cluster) return labels.cluster;
    
    // Try environment variables
    const clusterEnv = env.find(e => e.name === 'RABBITMQ_CLUSTER_NAME');
    if (clusterEnv) return clusterEnv.value;
    
    // Default to extracting from container name
    return container.name.replace(/-\d+$/, '') || 'default';
  }
  
  _generateClusterId(clusterName) {
    // Generate a deterministic ID from cluster name
    let hash = 0;
    for (let i = 0; i < clusterName.length; i++) {
      const char = clusterName.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `rabbitmq-cluster-${Math.abs(hash)}`;
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
  
  _parsePrometheusMetrics(metrics) {
    const parsed = [];
    
    // Handle both raw text and parsed formats
    if (typeof metrics === 'string') {
      // Parse Prometheus text format
      const lines = metrics.split('\n');
      for (const line of lines) {
        if (line.startsWith('#') || !line.trim()) continue;
        
        const match = line.match(/^([^\s{]+)(?:{([^}]+)})?\s+(.+)$/);
        if (match) {
          const [, name, labelStr, value] = match;
          const labels = {};
          
          if (labelStr) {
            const labelPairs = labelStr.match(/(\w+)="([^"]+)"/g) || [];
            for (const pair of labelPairs) {
              const [key, val] = pair.split('=');
              labels[key] = val.replace(/"/g, '');
            }
          }
          
          parsed.push({
            name,
            labels,
            value: parseFloat(value)
          });
        }
      }
    } else if (Array.isArray(metrics)) {
      // Already parsed format
      return metrics;
    }
    
    return parsed;
  }
  
  _getNestedValue(obj, path) {
    const keys = path.split('.');
    let value = obj;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }
    
    return value;
  }
}

module.exports = RabbitMQShimAdapter;