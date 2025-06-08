const BaseTransformer = require('../base/base-transformer');

/**
 * RabbitMQTransformer - Transforms RabbitMQ infrastructure data to MESSAGE_QUEUE entities
 * 
 * Handles RabbitMQ-specific concepts like vhosts, exchanges, and bindings,
 * converting them to the standardized MESSAGE_QUEUE entity format.
 */
class RabbitMQTransformer extends BaseTransformer {
  constructor(config = {}) {
    super(config);

    this.config = {
      ...this.config,
      includeSystemQueues: false,
      includeSystemExchanges: false,
      defaultVhost: '/',
      mapExchangesToTopics: true,
      enrichWithNodeDetails: true,
      ...config
    };

    // RabbitMQ-specific metric mappings
    this.metricMappings = {
      // Cluster/Node metrics
      'rabbitmq.node.mem.used': 'node.memoryUsed',
      'rabbitmq.node.disk.free': 'node.diskFree',
      'rabbitmq.node.fd.used': 'node.fileDescriptorsUsed',
      'rabbitmq.node.sockets.used': 'node.socketsUsed',
      'rabbitmq.node.erlang.processes': 'node.erlangProcesses',
      
      // Queue metrics
      'rabbitmq.queue.messages.ready': 'queue.messagesReady',
      'rabbitmq.queue.messages.unacked': 'queue.messagesUnacknowledged',
      'rabbitmq.queue.messages.total': 'queue.totalMessages',
      'rabbitmq.queue.message.stats.publish': 'queue.publishRate',
      'rabbitmq.queue.message.stats.deliver': 'queue.deliverRate',
      'rabbitmq.queue.message.stats.ack': 'queue.ackRate',
      
      // Exchange metrics
      'rabbitmq.exchange.message.stats.publish_in': 'exchange.publishInRate',
      'rabbitmq.exchange.message.stats.publish_out': 'exchange.publishOutRate',
      
      // Connection metrics
      'rabbitmq.connections.count': 'cluster.connectionCount',
      'rabbitmq.channels.count': 'cluster.channelCount',
      'rabbitmq.consumers.count': 'cluster.consumerCount'
    };

    // System queues and exchanges to filter
    this.systemEntities = {
      queues: ['amq.gen-', 'amq.q-'],
      exchanges: ['', 'amq.', 'amq.direct', 'amq.fanout', 'amq.headers', 'amq.match', 'amq.topic']
    };
  }

  /**
   * Validate RabbitMQ-specific data
   * @param {Object} data - Raw RabbitMQ data
   * @returns {Promise<Object>} Validated data
   */
  async validate(data) {
    await super.validate(data);

    // RabbitMQ data should have nodes or overview
    if (!data.nodes && !data.overview && !data.queues) {
      throw new Error('RabbitMQ data must contain nodes, overview, or queues');
    }

    // Validate node structure if present
    if (data.nodes) {
      for (const node of data.nodes) {
        if (!node.name) {
          throw new Error('RabbitMQ node must have a name');
        }
      }
    }

    return data;
  }

  /**
   * Transform RabbitMQ data to MESSAGE_QUEUE format
   * @param {Object} data - Validated RabbitMQ data
   * @returns {Promise<Object>} Transformed data
   */
  async performTransformation(data) {
    const transformed = {
      clusters: [],
      brokers: [], // RabbitMQ nodes map to brokers
      topics: [],  // RabbitMQ exchanges can map to topics
      queues: []   // RabbitMQ queues map directly
    };

    // Transform cluster data (from overview or aggregated node data)
    if (data.overview || data.nodes) {
      transformed.clusters.push(this.transformCluster(data));
    }

    // Transform nodes to brokers
    if (data.nodes) {
      transformed.brokers = data.nodes.map(node => this.transformNode(node, data));
    }

    // Transform exchanges to topics if configured
    if (this.config.mapExchangesToTopics && data.exchanges) {
      transformed.topics = data.exchanges
        .filter(exchange => this.shouldIncludeExchange(exchange))
        .map(exchange => this.transformExchange(exchange, data));
    }

    // Transform queues
    if (data.queues) {
      transformed.queues = data.queues
        .filter(queue => this.shouldIncludeQueue(queue))
        .map(queue => this.transformQueue(queue, data));
    }

    // Add vhost information if available
    if (data.vhosts) {
      this.enrichWithVhostInfo(transformed, data.vhosts);
    }

    return transformed;
  }

  /**
   * Transform RabbitMQ cluster data
   * @param {Object} data - Cluster/overview data
   * @returns {Object} Transformed cluster
   */
  transformCluster(data) {
    const overview = data.overview || {};
    const cluster = {
      name: overview.cluster_name || data.clusterName || 'rabbitmq-cluster',
      provider: 'rabbitmq',
      clusterId: overview.node || data.clusterId || 'default',
      region: data.region || 'unknown',
      environment: data.environment || 'production',
      metrics: {},
      metadata: {}
    };

    // Add version information
    if (overview.rabbitmq_version) {
      cluster.version = overview.rabbitmq_version;
      cluster.metadata.erlangVersion = overview.erlang_version;
    }

    // Transform cluster-level metrics
    if (overview.message_stats || data.clusterStats) {
      cluster.metrics = this.transformClusterMetrics(overview.message_stats || data.clusterStats);
    }

    // Add queue totals
    if (overview.queue_totals) {
      cluster.metrics.totalMessages = overview.queue_totals.messages || 0;
      cluster.metrics.totalMessagesReady = overview.queue_totals.messages_ready || 0;
      cluster.metrics.totalMessagesUnacked = overview.queue_totals.messages_unacknowledged || 0;
    }

    // Add object totals
    if (overview.object_totals) {
      cluster.metadata.totalQueues = overview.object_totals.queues || 0;
      cluster.metadata.totalExchanges = overview.object_totals.exchanges || 0;
      cluster.metadata.totalConnections = overview.object_totals.connections || 0;
      cluster.metadata.totalChannels = overview.object_totals.channels || 0;
      cluster.metadata.totalConsumers = overview.object_totals.consumers || 0;
    }

    return cluster;
  }

  /**
   * Transform RabbitMQ node to broker
   * @param {Object} node - Node data
   * @param {Object} clusterData - Parent cluster data
   * @returns {Object} Transformed broker
   */
  transformNode(node, clusterData) {
    const broker = {
      name: node.name,
      provider: 'rabbitmq',
      brokerId: node.name,
      host: this.extractHostFromNodeName(node.name),
      port: 5672, // Default AMQP port
      clusterId: clusterData.overview?.node || clusterData.clusterId || 'default',
      status: this.determineNodeStatus(node),
      metrics: {},
      metadata: {}
    };

    // Add node type and status
    broker.metadata.type = node.type || 'disc';
    broker.metadata.running = node.running || false;

    // Transform node metrics
    if (node.metrics || node) {
      broker.metrics = this.transformNodeMetrics(node.metrics || node);
    }

    // Add memory and disk details
    if (node.mem_used !== undefined) {
      broker.metrics.memoryUsed = node.mem_used;
      broker.metrics.memoryLimit = node.mem_limit;
      broker.metrics.memoryAlarm = node.mem_alarm || false;
    }

    if (node.disk_free !== undefined) {
      broker.metrics.diskFree = node.disk_free;
      broker.metrics.diskFreeLimit = node.disk_free_limit;
      broker.metrics.diskFreeAlarm = node.disk_free_alarm || false;
    }

    // Add process and connection limits
    if (node.proc_used !== undefined) {
      broker.metrics.erlangProcessesUsed = node.proc_used;
      broker.metrics.erlangProcessesTotal = node.proc_total;
    }

    if (node.fd_used !== undefined) {
      broker.metrics.fileDescriptorsUsed = node.fd_used;
      broker.metrics.fileDescriptorsTotal = node.fd_total;
    }

    if (node.sockets_used !== undefined) {
      broker.metrics.socketsUsed = node.sockets_used;
      broker.metrics.socketsTotal = node.sockets_total;
    }

    return broker;
  }

  /**
   * Transform RabbitMQ exchange to topic
   * @param {Object} exchange - Exchange data
   * @param {Object} clusterData - Parent cluster data
   * @returns {Object} Transformed topic
   */
  transformExchange(exchange, clusterData) {
    const topic = {
      name: exchange.name || 'amq.default',
      provider: 'rabbitmq',
      topicId: exchange.name || 'amq.default',
      clusterId: clusterData.overview?.node || clusterData.clusterId || 'default',
      type: exchange.type || 'direct',
      vhost: exchange.vhost || this.config.defaultVhost,
      config: {
        durable: exchange.durable || false,
        autoDelete: exchange.auto_delete || false,
        internal: exchange.internal || false
      },
      metrics: {}
    };

    // Transform exchange metrics
    if (exchange.message_stats) {
      topic.metrics = this.transformExchangeMetrics(exchange.message_stats);
    }

    // Add exchange-specific metadata
    topic.metadata = {
      exchangeType: exchange.type,
      arguments: exchange.arguments || {}
    };

    return topic;
  }

  /**
   * Transform RabbitMQ queue
   * @param {Object} queue - Queue data
   * @param {Object} clusterData - Parent cluster data
   * @returns {Object} Transformed queue
   */
  transformQueue(queue, clusterData) {
    const transformed = {
      name: queue.name,
      provider: 'rabbitmq',
      queueId: queue.name,
      clusterId: clusterData.overview?.node || clusterData.clusterId || 'default',
      vhost: queue.vhost || this.config.defaultVhost,
      node: queue.node,
      state: queue.state || 'running',
      config: {
        durable: queue.durable || false,
        autoDelete: queue.auto_delete || false,
        exclusive: queue.exclusive || false
      },
      metrics: {}
    };

    // Add basic queue metrics
    transformed.metrics.messages = queue.messages || 0;
    transformed.metrics.messagesReady = queue.messages_ready || 0;
    transformed.metrics.messagesUnacknowledged = queue.messages_unacknowledged || 0;
    transformed.metrics.consumers = queue.consumers || 0;

    // Transform message stats
    if (queue.message_stats) {
      const stats = this.transformQueueMetrics(queue.message_stats);
      transformed.metrics = { ...transformed.metrics, ...stats };
    }

    // Add memory usage
    if (queue.memory !== undefined) {
      transformed.metrics.memoryUsage = queue.memory;
    }

    // Add backing queue status
    if (queue.backing_queue_status) {
      transformed.metadata = {
        backingQueueMode: queue.backing_queue_status.mode,
        targetRamCount: queue.backing_queue_status.target_ram_count
      };
    }

    // Map node to broker
    if (queue.node) {
      transformed.brokerName = queue.node;
    }

    return transformed;
  }

  /**
   * Transform cluster-level metrics
   * @param {Object} stats - Message statistics
   * @returns {Object} Transformed metrics
   */
  transformClusterMetrics(stats) {
    const metrics = {};

    if (stats.publish) metrics.publishRate = stats.publish;
    if (stats.confirm) metrics.confirmRate = stats.confirm;
    if (stats.deliver) metrics.deliverRate = stats.deliver;
    if (stats.deliver_no_ack) metrics.deliverNoAckRate = stats.deliver_no_ack;
    if (stats.get) metrics.getRate = stats.get;
    if (stats.get_no_ack) metrics.getNoAckRate = stats.get_no_ack;
    if (stats.ack) metrics.ackRate = stats.ack;
    if (stats.redeliver) metrics.redeliverRate = stats.redeliver;

    // Calculate total message rate
    metrics.totalMessageRate = (metrics.publishRate || 0) + 
                               (metrics.deliverRate || 0) + 
                               (metrics.getRate || 0);

    return metrics;
  }

  /**
   * Transform node-level metrics
   * @param {Object} node - Node data
   * @returns {Object} Transformed metrics
   */
  transformNodeMetrics(node) {
    const metrics = {};

    // Memory metrics
    if (node.mem_used !== undefined) {
      metrics.memoryUsed = node.mem_used;
      metrics.memoryUsedPercent = node.mem_limit ? 
        Math.round((node.mem_used / node.mem_limit) * 100) : 0;
    }

    // Disk metrics
    if (node.disk_free !== undefined) {
      metrics.diskFree = node.disk_free;
      metrics.diskUsedPercent = node.disk_free_limit ? 
        Math.round((1 - (node.disk_free / node.disk_free_limit)) * 100) : 0;
    }

    // Process metrics
    if (node.proc_used !== undefined && node.proc_total) {
      metrics.erlangProcessUsedPercent = 
        Math.round((node.proc_used / node.proc_total) * 100);
    }

    // File descriptor metrics
    if (node.fd_used !== undefined && node.fd_total) {
      metrics.fileDescriptorUsedPercent = 
        Math.round((node.fd_used / node.fd_total) * 100);
    }

    // Socket metrics
    if (node.sockets_used !== undefined && node.sockets_total) {
      metrics.socketUsedPercent = 
        Math.round((node.sockets_used / node.sockets_total) * 100);
    }

    // I/O metrics
    if (node.io_read_count !== undefined) {
      metrics.ioReadCount = node.io_read_count;
      metrics.ioReadBytes = node.io_read_bytes || 0;
    }

    if (node.io_write_count !== undefined) {
      metrics.ioWriteCount = node.io_write_count;
      metrics.ioWriteBytes = node.io_write_bytes || 0;
    }

    return metrics;
  }

  /**
   * Transform exchange metrics
   * @param {Object} stats - Exchange message statistics
   * @returns {Object} Transformed metrics
   */
  transformExchangeMetrics(stats) {
    const metrics = {};

    if (stats.publish_in) metrics.publishInRate = stats.publish_in;
    if (stats.publish_out) metrics.publishOutRate = stats.publish_out;

    metrics.totalRate = (metrics.publishInRate || 0) + (metrics.publishOutRate || 0);

    return metrics;
  }

  /**
   * Transform queue metrics
   * @param {Object} stats - Queue message statistics
   * @returns {Object} Transformed metrics
   */
  transformQueueMetrics(stats) {
    const metrics = {};

    if (stats.publish) metrics.publishRate = stats.publish;
    if (stats.deliver) metrics.deliverRate = stats.deliver;
    if (stats.deliver_get) metrics.deliverGetRate = stats.deliver_get;
    if (stats.ack) metrics.ackRate = stats.ack;
    if (stats.redeliver) metrics.redeliverRate = stats.redeliver;
    if (stats.get) metrics.getRate = stats.get;
    if (stats.get_no_ack) metrics.getNoAckRate = stats.get_no_ack;

    // Calculate consumer utilization
    if (stats.deliver && stats.publish && stats.publish > 0) {
      metrics.consumerUtilization = Math.round((stats.deliver / stats.publish) * 100);
    }

    return metrics;
  }

  /**
   * Extract hostname from RabbitMQ node name
   * @param {string} nodeName - Node name (e.g., rabbit@hostname)
   * @returns {string} Hostname
   */
  extractHostFromNodeName(nodeName) {
    if (!nodeName) return 'unknown';
    const parts = nodeName.split('@');
    return parts.length > 1 ? parts[1] : nodeName;
  }

  /**
   * Determine node status based on available data
   * @param {Object} node - Node data
   * @returns {string} Node status
   */
  determineNodeStatus(node) {
    if (!node.running) return 'offline';
    if (node.mem_alarm || node.disk_free_alarm) return 'alarmed';
    
    // Check resource usage
    const warnings = [];
    if (node.mem_used && node.mem_limit) {
      const memPercent = (node.mem_used / node.mem_limit) * 100;
      if (memPercent > 80) warnings.push('high-memory');
    }
    
    if (node.disk_free && node.disk_free_limit) {
      if (node.disk_free < node.disk_free_limit * 1.5) warnings.push('low-disk');
    }

    if (warnings.length > 0) return 'warning';
    
    return 'online';
  }

  /**
   * Determine if a queue should be included
   * @param {Object} queue - Queue data
   * @returns {boolean} Whether to include the queue
   */
  shouldIncludeQueue(queue) {
    if (!this.config.includeSystemQueues) {
      // Filter system queues
      const isSystem = this.systemEntities.queues.some(prefix => 
        queue.name && queue.name.startsWith(prefix)
      );
      if (isSystem) return false;
    }

    return true;
  }

  /**
   * Determine if an exchange should be included
   * @param {Object} exchange - Exchange data
   * @returns {boolean} Whether to include the exchange
   */
  shouldIncludeExchange(exchange) {
    if (!this.config.includeSystemExchanges) {
      // Filter system exchanges
      const isSystem = this.systemEntities.exchanges.includes(exchange.name) ||
                      (exchange.name && exchange.name.startsWith('amq.'));
      if (isSystem) return false;
    }

    return true;
  }

  /**
   * Enrich entities with vhost information
   * @param {Object} transformed - Transformed data
   * @param {Array} vhosts - Vhost data
   */
  enrichWithVhostInfo(transformed, vhosts) {
    const vhostMap = new Map();
    
    // Build vhost map
    vhosts.forEach(vhost => {
      vhostMap.set(vhost.name, {
        description: vhost.description,
        tags: vhost.tags || [],
        metadata: vhost.metadata || {}
      });
    });

    // Enrich queues with vhost info
    transformed.queues.forEach(queue => {
      const vhostInfo = vhostMap.get(queue.vhost);
      if (vhostInfo) {
        queue.vhostInfo = vhostInfo;
      }
    });

    // Enrich topics (exchanges) with vhost info
    transformed.topics.forEach(topic => {
      const vhostInfo = vhostMap.get(topic.vhost);
      if (vhostInfo) {
        topic.vhostInfo = vhostInfo;
      }
    });
  }

  /**
   * Enrich transformed data with RabbitMQ-specific information
   * @param {Object} data - Transformed data
   * @returns {Promise<Object>} Enriched data
   */
  async enrich(data) {
    await super.enrich(data);

    // Add RabbitMQ-specific enrichments
    if (data.clusters && data.clusters.length > 0) {
      const cluster = data.clusters[0];
      
      // Calculate cluster health
      cluster.healthScore = this.calculateClusterHealth(data);
      
      // Add queue distribution
      cluster.queueDistribution = this.calculateQueueDistribution(data.queues, data.brokers);
      
      // Add resource utilization summary
      cluster.resourceUtilization = this.calculateResourceUtilization(data.brokers);
    }

    return data;
  }

  /**
   * Calculate cluster health score
   * @param {Object} data - Cluster data
   * @returns {number} Health score (0-100)
   */
  calculateClusterHealth(data) {
    let score = 100;

    // Check node health
    const totalNodes = data.brokers.length;
    const healthyNodes = data.brokers.filter(b => 
      b.status === 'online' || b.status === 'warning'
    ).length;
    const nodeAvailability = totalNodes > 0 ? (healthyNodes / totalNodes) : 0;
    score -= (1 - nodeAvailability) * 40;

    // Check for alarms
    const alarmedNodes = data.brokers.filter(b => b.status === 'alarmed').length;
    if (alarmedNodes > 0) {
      score -= Math.min(30, alarmedNodes * 10);
    }

    // Check queue depth
    const deepQueues = data.queues.filter(q => 
      q.metrics.messages > 10000 || q.metrics.messagesReady > 5000
    );
    if (deepQueues.length > 0) {
      score -= Math.min(20, deepQueues.length * 2);
    }

    // Check consumer coverage
    const queuesWithoutConsumers = data.queues.filter(q => 
      q.metrics.consumers === 0 && q.metrics.messages > 0
    );
    if (queuesWithoutConsumers.length > 0) {
      score -= Math.min(10, queuesWithoutConsumers.length);
    }

    return Math.max(0, Math.round(score));
  }

  /**
   * Calculate queue distribution across nodes
   * @param {Array} queues - Queue array
   * @param {Array} brokers - Broker (node) array
   * @returns {Object} Distribution statistics
   */
  calculateQueueDistribution(queues, brokers) {
    const distribution = {
      totalQueues: queues.length,
      avgQueuesPerNode: 0,
      maxQueuesOnNode: 0,
      minQueuesOnNode: Number.MAX_SAFE_INTEGER,
      nodeDistribution: {}
    };

    // Count queues per node
    const nodeQueueCount = {};
    queues.forEach(queue => {
      const node = queue.brokerName || queue.node || 'unknown';
      nodeQueueCount[node] = (nodeQueueCount[node] || 0) + 1;
    });

    // Calculate statistics
    Object.values(nodeQueueCount).forEach(count => {
      distribution.maxQueuesOnNode = Math.max(distribution.maxQueuesOnNode, count);
      distribution.minQueuesOnNode = Math.min(distribution.minQueuesOnNode, count);
    });

    if (distribution.minQueuesOnNode === Number.MAX_SAFE_INTEGER) {
      distribution.minQueuesOnNode = 0;
    }

    if (brokers.length > 0) {
      distribution.avgQueuesPerNode = Math.round(queues.length / brokers.length);
    }

    distribution.nodeDistribution = nodeQueueCount;

    return distribution;
  }

  /**
   * Calculate resource utilization across nodes
   * @param {Array} brokers - Broker (node) array
   * @returns {Object} Resource utilization summary
   */
  calculateResourceUtilization(brokers) {
    const utilization = {
      avgMemoryPercent: 0,
      maxMemoryPercent: 0,
      avgDiskPercent: 0,
      maxDiskPercent: 0,
      avgErlangProcessPercent: 0,
      maxErlangProcessPercent: 0
    };

    if (brokers.length === 0) return utilization;

    let memSum = 0, diskSum = 0, procSum = 0;
    let memCount = 0, diskCount = 0, procCount = 0;

    brokers.forEach(broker => {
      const metrics = broker.metrics || {};
      
      if (metrics.memoryUsedPercent !== undefined) {
        memSum += metrics.memoryUsedPercent;
        memCount++;
        utilization.maxMemoryPercent = Math.max(
          utilization.maxMemoryPercent, 
          metrics.memoryUsedPercent
        );
      }

      if (metrics.diskUsedPercent !== undefined) {
        diskSum += metrics.diskUsedPercent;
        diskCount++;
        utilization.maxDiskPercent = Math.max(
          utilization.maxDiskPercent, 
          metrics.diskUsedPercent
        );
      }

      if (metrics.erlangProcessUsedPercent !== undefined) {
        procSum += metrics.erlangProcessUsedPercent;
        procCount++;
        utilization.maxErlangProcessPercent = Math.max(
          utilization.maxErlangProcessPercent, 
          metrics.erlangProcessUsedPercent
        );
      }
    });

    if (memCount > 0) utilization.avgMemoryPercent = Math.round(memSum / memCount);
    if (diskCount > 0) utilization.avgDiskPercent = Math.round(diskSum / diskCount);
    if (procCount > 0) utilization.avgErlangProcessPercent = Math.round(procSum / procCount);

    return utilization;
  }
}

module.exports = RabbitMQTransformer;