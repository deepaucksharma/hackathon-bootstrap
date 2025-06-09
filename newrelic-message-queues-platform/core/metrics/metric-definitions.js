/**
 * Structured Metric Definitions for Kafka Infrastructure
 * 
 * This module defines metric collection specifications similar to JMX MBeans
 * for comprehensive Kafka monitoring. Each metric definition includes:
 * - Collection strategy (per-broker, per-topic, aggregated)
 * - Data source (JMX object name or calculation)
 * - Processing rules and units
 * - Validation criteria
 */

const chalk = require('chalk');

/**
 * Base metric definition structure
 */
class MetricDefinition {
  constructor(options = {}) {
    this.name = options.name;
    this.description = options.description;
    this.unit = options.unit || 'count';
    this.type = options.type || 'gauge'; // gauge, counter, histogram
    this.source = options.source; // JMX ObjectName or calculation
    this.attributes = options.attributes || [];
    this.aggregation = options.aggregation || 'latest';
    this.validation = options.validation || {};
    this.dimensions = options.dimensions || [];
    this.collection = options.collection || {};
  }

  /**
   * Validate metric value
   */
  validate(value) {
    if (this.validation.min !== undefined && value < this.validation.min) {
      return { valid: false, reason: `Value ${value} below minimum ${this.validation.min}` };
    }
    if (this.validation.max !== undefined && value > this.validation.max) {
      return { valid: false, reason: `Value ${value} above maximum ${this.validation.max}` };
    }
    if (this.validation.required && (value === null || value === undefined)) {
      return { valid: false, reason: 'Required metric value is missing' };
    }
    return { valid: true };
  }

  /**
   * Process raw metric value
   */
  process(rawValue, context = {}) {
    let value = rawValue;

    // Apply unit conversions
    if (this.unit === 'bytes' && context.convertToMB) {
      value = value / (1024 * 1024);
    } else if (this.unit === 'ms' && context.convertToSeconds) {
      value = value / 1000;
    }

    // Apply aggregation
    if (Array.isArray(value) && this.aggregation !== 'none') {
      switch (this.aggregation) {
        case 'sum':
          value = value.reduce((sum, v) => sum + v, 0);
          break;
        case 'average':
          value = value.reduce((sum, v) => sum + v, 0) / value.length;
          break;
        case 'max':
          value = Math.max(...value);
          break;
        case 'min':
          value = Math.min(...value);
          break;
        case 'latest':
        default:
          value = value[value.length - 1];
      }
    }

    return value;
  }
}

/**
 * Broker-level metrics (per Kafka broker)
 */
const BROKER_METRICS = {
  // Throughput Metrics
  'broker.messagesInPerSecond': new MetricDefinition({
    name: 'broker.messagesInPerSecond',
    description: 'Messages received per second by broker',
    unit: 'messages/sec',
    type: 'gauge',
    source: 'kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec',
    attributes: ['OneMinuteRate'],
    aggregation: 'latest',
    validation: { min: 0 },
    collection: { interval: 30, strategy: 'per-broker' }
  }),

  'broker.messagesOutPerSecond': new MetricDefinition({
    name: 'broker.messagesOutPerSecond', 
    description: 'Messages sent per second by broker',
    unit: 'messages/sec',
    type: 'gauge',
    source: 'kafka.server:type=BrokerTopicMetrics,name=MessagesOutPerSec',
    attributes: ['OneMinuteRate'],
    aggregation: 'latest',
    validation: { min: 0 },
    collection: { interval: 30, strategy: 'per-broker' }
  }),

  'broker.bytesInPerSecond': new MetricDefinition({
    name: 'broker.bytesInPerSecond',
    description: 'Bytes received per second by broker',
    unit: 'bytes/sec',
    type: 'gauge',
    source: 'kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec',
    attributes: ['OneMinuteRate'],
    aggregation: 'latest',
    validation: { min: 0 },
    collection: { interval: 30, strategy: 'per-broker' }
  }),

  'broker.bytesOutPerSecond': new MetricDefinition({
    name: 'broker.bytesOutPerSecond',
    description: 'Bytes sent per second by broker',
    unit: 'bytes/sec',
    type: 'gauge',
    source: 'kafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec',
    attributes: ['OneMinuteRate'],
    aggregation: 'latest',
    validation: { min: 0 },
    collection: { interval: 30, strategy: 'per-broker' }
  }),

  // Network and Request Metrics
  'broker.requestsPerSecond': new MetricDefinition({
    name: 'broker.requestsPerSecond',
    description: 'Total requests per second to broker',
    unit: 'requests/sec',
    type: 'gauge',
    source: 'kafka.network:type=RequestMetrics,name=RequestsPerSec',
    attributes: ['OneMinuteRate'],
    aggregation: 'latest',
    validation: { min: 0 },
    collection: { interval: 30, strategy: 'per-broker' }
  }),

  'broker.networkProcessorIdlePercent': new MetricDefinition({
    name: 'broker.networkProcessorIdlePercent',
    description: 'Network processor thread idle percentage',
    unit: 'percent',
    type: 'gauge',
    source: 'kafka.network:type=SocketServer,name=NetworkProcessorAvgIdlePercent',
    attributes: ['Value'],
    aggregation: 'average',
    validation: { min: 0, max: 100 },
    collection: { interval: 30, strategy: 'per-broker' }
  }),

  'broker.requestHandlerIdlePercent': new MetricDefinition({
    name: 'broker.requestHandlerIdlePercent',
    description: 'Request handler thread idle percentage',
    unit: 'percent',
    type: 'gauge',
    source: 'kafka.server:type=KafkaRequestHandlerPool,name=RequestHandlerAvgIdlePercent',
    attributes: ['OneMinuteRate'],
    aggregation: 'average',
    validation: { min: 0, max: 100 },
    collection: { interval: 30, strategy: 'per-broker' }
  }),

  // Partition and Replication Health
  'broker.underReplicatedPartitions': new MetricDefinition({
    name: 'broker.underReplicatedPartitions',
    description: 'Number of under-replicated partitions',
    unit: 'count',
    type: 'gauge',
    source: 'kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions',
    attributes: ['Value'],
    aggregation: 'latest',
    validation: { min: 0, required: true },
    collection: { interval: 30, strategy: 'per-broker' }
  }),

  'broker.offlinePartitions': new MetricDefinition({
    name: 'broker.offlinePartitions',
    description: 'Number of offline partitions',
    unit: 'count',
    type: 'gauge',
    source: 'kafka.controller:type=KafkaController,name=OfflinePartitionsCount',
    attributes: ['Value'],
    aggregation: 'latest',
    validation: { min: 0, required: true },
    collection: { interval: 30, strategy: 'per-broker' }
  }),

  'broker.leaderElectionRate': new MetricDefinition({
    name: 'broker.leaderElectionRate',
    description: 'Leader election rate',
    unit: 'elections/sec',
    type: 'gauge',
    source: 'kafka.controller:type=ControllerStats,name=LeaderElectionRateAndTimeMs',
    attributes: ['OneMinuteRate'],
    aggregation: 'latest',
    validation: { min: 0 },
    collection: { interval: 30, strategy: 'per-broker' }
  }),

  // Resource Utilization
  'broker.cpu.usage': new MetricDefinition({
    name: 'broker.cpu.usage',
    description: 'CPU usage percentage',
    unit: 'percent',
    type: 'gauge',
    source: 'java.lang:type=OperatingSystem',
    attributes: ['ProcessCpuLoad'],
    aggregation: 'average',
    validation: { min: 0, max: 100 },
    collection: { interval: 30, strategy: 'per-broker' }
  }),

  'broker.memory.usage': new MetricDefinition({
    name: 'broker.memory.usage',
    description: 'JVM memory usage percentage',
    unit: 'percent',
    type: 'gauge',
    source: 'java.lang:type=Memory',
    attributes: ['HeapMemoryUsage.used', 'HeapMemoryUsage.max'],
    aggregation: 'calculated',
    validation: { min: 0, max: 100 },
    collection: { interval: 30, strategy: 'per-broker' }
  }),

  'broker.disk.usage': new MetricDefinition({
    name: 'broker.disk.usage',
    description: 'Disk usage percentage for log directories',
    unit: 'percent',
    type: 'gauge',
    source: 'kafka.log:type=LogManager,name=Size',
    attributes: ['Value'],
    aggregation: 'calculated',
    validation: { min: 0, max: 100 },
    collection: { interval: 60, strategy: 'per-broker' }
  })
};

/**
 * Topic-level metrics (per topic per broker)
 */
const TOPIC_METRICS = {
  // Topic Throughput (per topic)
  'topic.messagesInPerSecond': new MetricDefinition({
    name: 'topic.messagesInPerSecond',
    description: 'Messages received per second for topic',
    unit: 'messages/sec',
    type: 'gauge',
    source: 'kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec,topic={topic}',
    attributes: ['OneMinuteRate'],
    dimensions: ['topic'],
    aggregation: 'latest',
    validation: { min: 0 },
    collection: { interval: 30, strategy: 'per-topic-per-broker' }
  }),

  'topic.bytesInPerSecond': new MetricDefinition({
    name: 'topic.bytesInPerSecond',
    description: 'Bytes received per second for topic',
    unit: 'bytes/sec',
    type: 'gauge',
    source: 'kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec,topic={topic}',
    attributes: ['OneMinuteRate'],
    dimensions: ['topic'],
    aggregation: 'latest',
    validation: { min: 0 },
    collection: { interval: 30, strategy: 'per-topic-per-broker' }
  }),

  'topic.bytesOutPerSecond': new MetricDefinition({
    name: 'topic.bytesOutPerSecond',
    description: 'Bytes sent per second for topic',
    unit: 'bytes/sec',
    type: 'gauge',
    source: 'kafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec,topic={topic}',
    attributes: ['OneMinuteRate'],
    dimensions: ['topic'],
    aggregation: 'latest',
    validation: { min: 0 },
    collection: { interval: 30, strategy: 'per-topic-per-broker' }
  }),

  // Topic Configuration
  'topic.partitions.count': new MetricDefinition({
    name: 'topic.partitions.count',
    description: 'Number of partitions for topic',
    unit: 'count',
    type: 'gauge',
    source: 'kafka.server:type=ReplicaManager,name=PartitionCount,topic={topic}',
    attributes: ['Value'],
    dimensions: ['topic'],
    aggregation: 'latest',
    validation: { min: 1, required: true },
    collection: { interval: 300, strategy: 'per-topic' }
  }),

  'topic.replicationFactor': new MetricDefinition({
    name: 'topic.replicationFactor',
    description: 'Replication factor for topic',
    unit: 'count',
    type: 'gauge',
    source: 'kafka.server:type=ReplicaManager,name=ReplicationFactor,topic={topic}',
    attributes: ['Value'],
    dimensions: ['topic'],
    aggregation: 'latest',
    validation: { min: 1, required: true },
    collection: { interval: 300, strategy: 'per-topic' }
  }),

  'topic.sizeBytes': new MetricDefinition({
    name: 'topic.sizeBytes',
    description: 'Total size of topic in bytes',
    unit: 'bytes',
    type: 'gauge',
    source: 'kafka.log:type=Log,name=Size,topic={topic}',
    attributes: ['Value'],
    dimensions: ['topic'],
    aggregation: 'sum',
    validation: { min: 0 },
    collection: { interval: 60, strategy: 'per-topic-per-broker' }
  })
};

/**
 * Consumer group metrics (per consumer group)
 */
const CONSUMER_GROUP_METRICS = {
  'consumerGroup.lag': new MetricDefinition({
    name: 'consumerGroup.lag',
    description: 'Consumer group lag for specific topic partition',
    unit: 'messages',
    type: 'gauge',
    source: 'kafka.consumer:type=consumer-fetch-manager-metrics,client-id={client-id}',
    attributes: ['records-lag'],
    dimensions: ['consumerGroup', 'topic', 'partition'],
    aggregation: 'latest',
    validation: { min: 0 },
    collection: { interval: 30, strategy: 'per-consumer-group' }
  }),

  'consumerGroup.totalLag': new MetricDefinition({
    name: 'consumerGroup.totalLag',
    description: 'Total lag across all partitions for consumer group',
    unit: 'messages',
    type: 'gauge',
    source: 'calculated',
    attributes: ['sum of partition lags'],
    dimensions: ['consumerGroup', 'topic'],
    aggregation: 'sum',
    validation: { min: 0 },
    collection: { interval: 30, strategy: 'per-consumer-group' }
  }),

  'consumerGroup.memberCount': new MetricDefinition({
    name: 'consumerGroup.memberCount',
    description: 'Number of active members in consumer group',
    unit: 'count',
    type: 'gauge',
    source: 'kafka.coordinator.group:type=GroupMetadataManager,name=NumGroups',
    attributes: ['Value'],
    dimensions: ['consumerGroup'],
    aggregation: 'latest',
    validation: { min: 0 },
    collection: { interval: 60, strategy: 'per-consumer-group' }
  })
};

/**
 * Cluster-level aggregated metrics
 */
const CLUSTER_METRICS = {
  'cluster.brokerCount': new MetricDefinition({
    name: 'cluster.brokerCount',
    description: 'Number of active brokers in cluster',
    unit: 'count',
    type: 'gauge',
    source: 'calculated',
    aggregation: 'count',
    validation: { min: 1, required: true },
    collection: { interval: 60, strategy: 'cluster-aggregate' }
  }),

  'cluster.topicCount': new MetricDefinition({
    name: 'cluster.topicCount',
    description: 'Number of topics in cluster',
    unit: 'count',
    type: 'gauge',
    source: 'calculated',
    aggregation: 'count',
    validation: { min: 0 },
    collection: { interval: 60, strategy: 'cluster-aggregate' }
  }),

  'cluster.totalPartitions': new MetricDefinition({
    name: 'cluster.totalPartitions',
    description: 'Total number of partitions across all topics',
    unit: 'count',
    type: 'gauge',
    source: 'calculated',
    aggregation: 'sum',
    validation: { min: 0 },
    collection: { interval: 60, strategy: 'cluster-aggregate' }
  }),

  'cluster.throughput.messagesPerSecond': new MetricDefinition({
    name: 'cluster.throughput.messagesPerSecond',
    description: 'Total cluster message throughput',
    unit: 'messages/sec',
    type: 'gauge',
    source: 'calculated',
    aggregation: 'sum',
    validation: { min: 0 },
    collection: { interval: 30, strategy: 'cluster-aggregate' }
  }),

  'cluster.throughput.bytesPerSecond': new MetricDefinition({
    name: 'cluster.throughput.bytesPerSecond',
    description: 'Total cluster byte throughput',
    unit: 'bytes/sec',
    type: 'gauge',
    source: 'calculated',
    aggregation: 'sum',
    validation: { min: 0 },
    collection: { interval: 30, strategy: 'cluster-aggregate' }
  }),

  'cluster.health.score': new MetricDefinition({
    name: 'cluster.health.score',
    description: 'Overall cluster health score (0-100)',
    unit: 'score',
    type: 'gauge',
    source: 'calculated',
    aggregation: 'calculated',
    validation: { min: 0, max: 100 },
    collection: { interval: 60, strategy: 'cluster-aggregate' }
  })
};

/**
 * Metric collection strategies
 */
const COLLECTION_STRATEGIES = {
  'per-broker': {
    description: 'Collect metrics for each broker individually',
    parallelism: 'broker-level',
    batchSize: 1
  },
  'per-topic': {
    description: 'Collect metrics for each topic (cluster-wide)',
    parallelism: 'topic-level',
    batchSize: 10
  },
  'per-topic-per-broker': {
    description: 'Collect metrics for each topic on each broker',
    parallelism: 'topic-broker-level',
    batchSize: 5
  },
  'per-consumer-group': {
    description: 'Collect metrics for each consumer group',
    parallelism: 'consumer-group-level',
    batchSize: 20
  },
  'cluster-aggregate': {
    description: 'Calculate cluster-level aggregations',
    parallelism: 'sequential',
    batchSize: 1
  }
};

/**
 * Get all metric definitions organized by entity type
 */
function getAllMetricDefinitions() {
  return {
    broker: BROKER_METRICS,
    topic: TOPIC_METRICS,
    consumerGroup: CONSUMER_GROUP_METRICS,
    cluster: CLUSTER_METRICS
  };
}

/**
 * Get metrics for specific entity type
 */
function getMetricsForEntityType(entityType) {
  const metrics = getAllMetricDefinitions();
  return metrics[entityType] || {};
}

/**
 * Get metrics by collection strategy
 */
function getMetricsByStrategy(strategy) {
  const allMetrics = getAllMetricDefinitions();
  const result = {};
  
  Object.entries(allMetrics).forEach(([entityType, metrics]) => {
    Object.entries(metrics).forEach(([metricName, definition]) => {
      if (definition.collection.strategy === strategy) {
        if (!result[entityType]) result[entityType] = {};
        result[entityType][metricName] = definition;
      }
    });
  });
  
  return result;
}

/**
 * Validate metric definitions on module load
 */
function validateDefinitions() {
  const allMetrics = getAllMetricDefinitions();
  const errors = [];
  
  Object.entries(allMetrics).forEach(([entityType, metrics]) => {
    Object.entries(metrics).forEach(([metricName, definition]) => {
      if (!definition.name) {
        errors.push(`${entityType}.${metricName}: Missing name`);
      }
      if (!definition.description) {
        errors.push(`${entityType}.${metricName}: Missing description`);
      }
      if (!definition.collection.strategy) {
        errors.push(`${entityType}.${metricName}: Missing collection strategy`);
      }
      if (!COLLECTION_STRATEGIES[definition.collection.strategy]) {
        errors.push(`${entityType}.${metricName}: Invalid collection strategy`);
      }
    });
  });
  
  if (errors.length > 0) {
    console.error(chalk.red('❌ Metric definition validation errors:'));
    errors.forEach(error => console.error(chalk.red(`   ${error}`)));
    throw new Error(`${errors.length} metric definition validation errors`);
  }
  
  console.log(chalk.green('✅ All metric definitions validated successfully'));
}

// Validate on module load
validateDefinitions();

module.exports = {
  MetricDefinition,
  BROKER_METRICS,
  TOPIC_METRICS,
  CONSUMER_GROUP_METRICS,
  CLUSTER_METRICS,
  COLLECTION_STRATEGIES,
  getAllMetricDefinitions,
  getMetricsForEntityType,
  getMetricsByStrategy,
  validateDefinitions
};