/**
 * Message Queues Content Provider
 * 
 * Provides MESSAGE_QUEUE_* specific templates, widgets, and domain knowledge
 * for the dashboard framework.
 */

const { BaseContentProvider } = require('../../framework/interfaces/content-provider');

class MessageQueuesContentProvider extends BaseContentProvider {
  constructor(config = {}) {
    super(config);
    this.domain = 'message-queues';
    this.version = '1.0.0';
    
    this.initializeMessageQueuesContent();
  }

  /**
   * Initialize MESSAGE_QUEUE_* specific content
   */
  initializeMessageQueuesContent() {
    // Register entity variables
    this.entityVariables = {
      'MESSAGE_QUEUE_CLUSTER': [
        { name: 'provider', type: 'ENUM', title: 'Provider', 
          possibleValues: ['kafka', 'rabbitmq', 'sqs', 'azure-servicebus', 'google-pubsub'] },
        { name: 'environment', type: 'ENUM', title: 'Environment',
          possibleValues: ['production', 'staging', 'development', 'test'] },
        { name: 'clusterName', type: 'STRING', title: 'Cluster Name' }
      ],
      'MESSAGE_QUEUE_BROKER': [
        { name: 'provider', type: 'ENUM', title: 'Provider',
          possibleValues: ['kafka', 'rabbitmq'] },
        { name: 'clusterName', type: 'STRING', title: 'Cluster Name' },
        { name: 'hostname', type: 'STRING', title: 'Hostname' }
      ],
      'MESSAGE_QUEUE_TOPIC': [
        { name: 'provider', type: 'ENUM', title: 'Provider',
          possibleValues: ['kafka', 'rabbitmq'] },
        { name: 'clusterName', type: 'STRING', title: 'Cluster Name' },
        { name: 'topic', type: 'STRING', title: 'Topic Name' }
      ],
      'MESSAGE_QUEUE_QUEUE': [
        { name: 'provider', type: 'ENUM', title: 'Provider',
          possibleValues: ['rabbitmq', 'sqs', 'azure-servicebus', 'google-pubsub'] },
        { name: 'queueName', type: 'STRING', title: 'Queue Name' },
        { name: 'region', type: 'STRING', title: 'Region' }
      ]
    };

    // Register templates
    this.registerTemplates();
    
    // Register entity schemas
    this.registerEntitySchemas();
    
    // Register widget definitions
    this.registerWidgetDefinitions();
    
    // Register visualization configs
    this.registerVisualizationConfigs();
  }

  /**
   * Register MESSAGE_QUEUE_* templates
   */
  registerTemplates() {
    // Cluster Overview Template
    this.registerTemplate('cluster-overview', this.buildTemplate({
      name: 'Message Queue Cluster Overview',
      description: 'Comprehensive overview of message queue cluster health and performance',
      entityType: 'MESSAGE_QUEUE_CLUSTER',
      variables: [
        { name: 'provider', type: 'ENUM', title: 'Provider', 
          possibleValues: ['kafka', 'rabbitmq', 'sqs', 'azure-servicebus'] },
        { name: 'environment', type: 'ENUM', title: 'Environment',
          possibleValues: ['production', 'staging', 'development'] }
      ],
      sections: [
        {
          title: 'Health Overview',
          widgets: [
            this.buildWidget({
              type: 'billboard',
              title: 'Cluster Health Score',
              query: this.buildQuery({
                from: 'MESSAGE_QUEUE_CLUSTER_SAMPLE',
                select: 'latest(cluster.health.score)',
                where: ['provider = {{provider}}', 'environment = {{environment}}'],
                since: '{{timeRange}}'
              }),
              position: { column: 1, row: 1, width: 3, height: 3 },
              thresholds: [
                { alertSeverity: 'CRITICAL', value: 60 },
                { alertSeverity: 'WARNING', value: 80 }
              ]
            }),
            this.buildWidget({
              type: 'billboard',
              title: 'Total Clusters',
              query: this.buildQuery({
                from: 'MESSAGE_QUEUE_CLUSTER_SAMPLE',
                select: 'uniqueCount(entity.guid)',
                where: ['provider = {{provider}}', 'environment = {{environment}}'],
                since: '{{timeRange}}'
              }),
              position: { column: 4, row: 1, width: 3, height: 3 }
            }),
            this.buildWidget({
              type: 'billboard',
              title: 'Healthy Clusters',
              query: this.buildQuery({
                from: 'MESSAGE_QUEUE_CLUSTER_SAMPLE',
                select: 'percentage(uniqueCount(entity.guid), WHERE cluster.health.score >= 80)',
                where: ['provider = {{provider}}', 'environment = {{environment}}'],
                since: '{{timeRange}}'
              }),
              position: { column: 7, row: 1, width: 3, height: 3 }
            }),
            this.buildWidget({
              type: 'billboard',
              title: 'Total Throughput',
              query: this.buildQuery({
                from: 'MESSAGE_QUEUE_CLUSTER_SAMPLE',
                select: 'sum(cluster.throughput.total)',
                where: ['provider = {{provider}}', 'environment = {{environment}}'],
                since: '{{timeRange}}'
              }),
              position: { column: 10, row: 1, width: 3, height: 3 }
            })
          ]
        },
        {
          title: 'Performance Trends',
          widgets: [
            this.buildWidget({
              type: 'line',
              title: 'Cluster Health Trends',
              query: this.buildQuery({
                from: 'MESSAGE_QUEUE_CLUSTER_SAMPLE',
                select: 'average(cluster.health.score)',
                where: ['provider = {{provider}}', 'environment = {{environment}}'],
                facet: 'clusterName',
                timeseries: true,
                since: '{{timeRange}}'
              }),
              position: { column: 1, row: 1, width: 6, height: 4 }
            }),
            this.buildWidget({
              type: 'area',
              title: 'Throughput by Cluster',
              query: this.buildQuery({
                from: 'MESSAGE_QUEUE_CLUSTER_SAMPLE',
                select: 'sum(cluster.throughput.total)',
                where: ['provider = {{provider}}', 'environment = {{environment}}'],
                facet: 'clusterName',
                timeseries: true,
                since: '{{timeRange}}'
              }),
              position: { column: 7, row: 1, width: 6, height: 4 }
            }),
            this.buildWidget({
              type: 'table',
              title: 'Cluster Status Summary',
              query: this.buildQuery({
                from: 'MESSAGE_QUEUE_CLUSTER_SAMPLE',
                select: 'clusterName, latest(cluster.health.score) as "Health Score", latest(cluster.throughput.total) as "Throughput", latest(cluster.availability) as "Availability", latest(cluster.error.rate) as "Error Rate"',
                where: ['provider = {{provider}}', 'environment = {{environment}}'],
                facet: 'clusterName',
                since: '{{timeRange}}'
              }),
              position: { column: 1, row: 5, width: 12, height: 4 }
            })
          ]
        }
      ],
      tags: ['message-queues', 'cluster', 'overview']
    }));

    // Topic Analysis Template
    this.registerTemplate('topic-analysis', this.buildTemplate({
      name: 'Topic Performance Analysis',
      description: 'Detailed analysis of topic throughput, lag, and performance metrics',
      entityType: 'MESSAGE_QUEUE_TOPIC',
      variables: [
        { name: 'provider', type: 'ENUM', title: 'Provider',
          possibleValues: ['kafka', 'rabbitmq'] },
        { name: 'clusterName', type: 'STRING', title: 'Cluster Name' }
      ],
      sections: [
        {
          title: 'Topic Performance',
          widgets: [
            this.buildWidget({
              type: 'area',
              title: 'Topic Throughput',
              query: this.buildQuery({
                from: 'MESSAGE_QUEUE_TOPIC_SAMPLE',
                select: 'sum(topic.throughput.in) as "Inbound", sum(topic.throughput.out) as "Outbound"',
                where: ['provider = {{provider}}', 'clusterName = {{clusterName}}'],
                timeseries: true,
                since: '{{timeRange}}'
              }),
              position: { column: 1, row: 1, width: 8, height: 4 }
            }),
            this.buildWidget({
              type: 'line',
              title: 'Consumer Lag',
              query: this.buildQuery({
                from: 'MESSAGE_QUEUE_TOPIC_SAMPLE',
                select: 'max(topic.consumer.lag)',
                where: ['provider = {{provider}}', 'clusterName = {{clusterName}}'],
                facet: 'topic',
                timeseries: true,
                since: '{{timeRange}}',
                limit: 10
              }),
              position: { column: 9, row: 1, width: 4, height: 4 }
            }),
            this.buildWidget({
              type: 'table',
              title: 'Topic Performance Summary',
              query: this.buildQuery({
                from: 'MESSAGE_QUEUE_TOPIC_SAMPLE',
                select: 'topic, latest(topic.throughput.in) as "Inbound Rate", latest(topic.throughput.out) as "Outbound Rate", latest(topic.consumer.lag) as "Consumer Lag", latest(topic.error.rate) as "Error Rate"',
                where: ['provider = {{provider}}', 'clusterName = {{clusterName}}'],
                facet: 'topic',
                since: '{{timeRange}}'
              }),
              position: { column: 1, row: 5, width: 12, height: 4 }
            })
          ]
        }
      ],
      tags: ['message-queues', 'topics', 'performance']
    }));

    // Broker Health Template
    this.registerTemplate('broker-health', this.buildTemplate({
      name: 'Broker Health Monitoring',
      description: 'Monitor broker CPU, memory, and network performance',
      entityType: 'MESSAGE_QUEUE_BROKER',
      variables: [
        { name: 'clusterName', type: 'STRING', title: 'Cluster Name' }
      ],
      sections: [
        {
          title: 'Resource Utilization',
          widgets: [
            this.buildWidget({
              type: 'line',
              title: 'CPU Usage by Broker',
              query: this.buildQuery({
                from: 'MESSAGE_QUEUE_BROKER_SAMPLE',
                select: 'average(broker.cpu.usage)',
                where: ['clusterName = {{clusterName}}'],
                facet: 'hostname',
                timeseries: true,
                since: '{{timeRange}}'
              }),
              position: { column: 1, row: 1, width: 6, height: 4 }
            }),
            this.buildWidget({
              type: 'line',
              title: 'Memory Usage by Broker',
              query: this.buildQuery({
                from: 'MESSAGE_QUEUE_BROKER_SAMPLE',
                select: 'average(broker.memory.usage)',
                where: ['clusterName = {{clusterName}}'],
                facet: 'hostname',
                timeseries: true,
                since: '{{timeRange}}'
              }),
              position: { column: 7, row: 1, width: 6, height: 4 }
            }),
            this.buildWidget({
              type: 'table',
              title: 'Broker Status',
              query: this.buildQuery({
                from: 'MESSAGE_QUEUE_BROKER_SAMPLE',
                select: 'hostname, latest(broker.cpu.usage) as "CPU %", latest(broker.memory.usage) as "Memory %", latest(broker.request.latency) as "Latency", latest(status) as "Status"',
                where: ['clusterName = {{clusterName}}'],
                facet: 'hostname',
                since: '{{timeRange}}'
              }),
              position: { column: 1, row: 5, width: 12, height: 4 }
            })
          ]
        }
      ],
      tags: ['message-queues', 'brokers', 'health']
    }));

    // Queue Monitoring Template  
    this.registerTemplate('queue-monitoring', this.buildTemplate({
      name: 'Queue Monitoring Dashboard',
      description: 'Monitor queue depth, processing time, and throughput',
      entityType: 'MESSAGE_QUEUE_QUEUE',
      variables: [
        { name: 'provider', type: 'ENUM', title: 'Provider',
          possibleValues: ['rabbitmq', 'sqs', 'azure-servicebus'] },
        { name: 'region', type: 'STRING', title: 'Region' }
      ],
      sections: [
        {
          title: 'Queue Performance',
          widgets: [
            this.buildWidget({
              type: 'line',
              title: 'Queue Depth',
              query: this.buildQuery({
                from: 'MESSAGE_QUEUE_QUEUE_SAMPLE',
                select: 'average(queue.depth)',
                where: ['provider = {{provider}}', 'region = {{region}}'],
                facet: 'queueName',
                timeseries: true,
                since: '{{timeRange}}'
              }),
              position: { column: 1, row: 1, width: 6, height: 4 }
            }),
            this.buildWidget({
              type: 'histogram',
              title: 'Processing Time Distribution',
              query: this.buildQuery({
                from: 'MESSAGE_QUEUE_QUEUE_SAMPLE',
                select: 'histogram(queue.processing.time, 50, 20)',
                where: ['provider = {{provider}}', 'region = {{region}}'],
                since: '{{timeRange}}'
              }),
              position: { column: 7, row: 1, width: 6, height: 4 }
            }),
            this.buildWidget({
              type: 'area',
              title: 'Queue Throughput',
              query: this.buildQuery({
                from: 'MESSAGE_QUEUE_QUEUE_SAMPLE',
                select: 'sum(queue.throughput.in) as "Messages In", sum(queue.throughput.out) as "Messages Out"',
                where: ['provider = {{provider}}', 'region = {{region}}'],
                timeseries: true,
                since: '{{timeRange}}'
              }),
              position: { column: 1, row: 5, width: 8, height: 4 }
            })
          ]
        }
      ],
      tags: ['message-queues', 'queues', 'monitoring']
    }));
  }

  /**
   * Register entity schemas
   */
  registerEntitySchemas() {
    this.registerEntitySchema('MESSAGE_QUEUE_CLUSTER', {
      type: 'MESSAGE_QUEUE_CLUSTER',
      domain: 'INFRA',
      guidPattern: '{accountId}|INFRA|MESSAGE_QUEUE_CLUSTER|{hash(clusterName)}',
      goldenMetrics: [
        { name: 'cluster.health.score', type: 'gauge', unit: 'percentage' },
        { name: 'cluster.throughput.total', type: 'gauge', unit: 'messages/second' },
        { name: 'cluster.error.rate', type: 'gauge', unit: 'percentage' },
        { name: 'cluster.availability', type: 'gauge', unit: 'percentage' }
      ],
      relationships: ['CONTAINS → brokers', 'CONTAINS → topics']
    });

    this.registerEntitySchema('MESSAGE_QUEUE_BROKER', {
      type: 'MESSAGE_QUEUE_BROKER',
      domain: 'INFRA',
      guidPattern: '{accountId}|INFRA|MESSAGE_QUEUE_BROKER|{hash(clusterId:brokerId)}',
      goldenMetrics: [
        { name: 'broker.cpu.usage', type: 'gauge', unit: 'percentage' },
        { name: 'broker.memory.usage', type: 'gauge', unit: 'percentage' },
        { name: 'broker.network.throughput', type: 'gauge', unit: 'bytes/second' },
        { name: 'broker.request.latency', type: 'gauge', unit: 'milliseconds' }
      ],
      relationships: ['HOSTS → partitions', 'SERVES → clients']
    });

    this.registerEntitySchema('MESSAGE_QUEUE_TOPIC', {
      type: 'MESSAGE_QUEUE_TOPIC',
      domain: 'INFRA',
      guidPattern: '{accountId}|INFRA|MESSAGE_QUEUE_TOPIC|{hash(clusterId:topicName)}',
      goldenMetrics: [
        { name: 'topic.throughput.in', type: 'gauge', unit: 'messages/second' },
        { name: 'topic.throughput.out', type: 'gauge', unit: 'messages/second' },
        { name: 'topic.consumer.lag', type: 'gauge', unit: 'messages' },
        { name: 'topic.error.rate', type: 'gauge', unit: 'percentage' }
      ],
      relationships: ['PARTITIONED_INTO → partitions']
    });

    this.registerEntitySchema('MESSAGE_QUEUE_QUEUE', {
      type: 'MESSAGE_QUEUE_QUEUE',
      domain: 'INFRA',
      guidPattern: '{accountId}|INFRA|MESSAGE_QUEUE_QUEUE|{hash(provider:region:queueName)}',
      goldenMetrics: [
        { name: 'queue.depth', type: 'gauge', unit: 'messages' },
        { name: 'queue.throughput.in', type: 'gauge', unit: 'messages/second' },
        { name: 'queue.throughput.out', type: 'gauge', unit: 'messages/second' },
        { name: 'queue.processing.time', type: 'gauge', unit: 'milliseconds' }
      ],
      relationships: ['PROCESSED_BY → consumers']
    });
  }

  /**
   * Register widget definitions
   */
  registerWidgetDefinitions() {
    // Message Queue specific widget types could go here
    // For now, we use standard New Relic visualizations
  }

  /**
   * Register visualization configurations
   */
  registerVisualizationConfigs() {
    // Override default configurations for message queue specific needs
    this.registerVisualizationConfig('billboard', {
      thresholds: [
        { alertSeverity: 'CRITICAL', value: 60 },
        { alertSeverity: 'WARNING', value: 80 }
      ]
    });

    this.registerVisualizationConfig('line', {
      legend: { enabled: true },
      yAxisLeft: { zero: true },
      colors: ['#00C9A7', '#3CA8FF', '#7F58C9', '#FF6384']
    });

    this.registerVisualizationConfig('area', {
      legend: { enabled: true },
      yAxisLeft: { zero: true },
      facet: { showOtherSeries: false },
      colors: ['#00C9A7', '#3CA8FF']
    });
  }

  // Interface implementations

  getEntityVariables(entityType) {
    return this.entityVariables[entityType] || [];
  }

  getMetadata() {
    return {
      domain: this.domain,
      version: this.version,
      name: 'Message Queues Content Provider',
      description: 'Provides MESSAGE_QUEUE_* entity templates and domain knowledge',
      supportedEntityTypes: [
        'MESSAGE_QUEUE_CLUSTER',
        'MESSAGE_QUEUE_BROKER', 
        'MESSAGE_QUEUE_TOPIC',
        'MESSAGE_QUEUE_QUEUE'
      ],
      supportedProviders: ['kafka', 'rabbitmq', 'sqs', 'azure-servicebus', 'google-pubsub'],
      templateCount: this.templates.size,
      createdAt: new Date().toISOString()
    };
  }
}

module.exports = MessageQueuesContentProvider;