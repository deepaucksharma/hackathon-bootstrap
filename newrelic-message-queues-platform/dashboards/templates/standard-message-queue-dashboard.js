/**
 * Standard Message Queue Dashboard Template
 * 
 * Comprehensive dashboard for monitoring Message Queue entities including:
 * - Executive Overview with business metrics
 * - Broker Performance monitoring
 * - Topic Analytics and throughput
 * - Consumer Group lag tracking
 * - Alert and anomaly detection
 */

const standardMessageQueueDashboard = {
  name: "Message Queues Platform Overview",
  description: "Comprehensive monitoring for Kafka and other message queue systems",
  permissions: "PUBLIC_READ_WRITE",
  pages: [
    {
      name: "Executive Overview",
      description: "High-level platform health and business metrics",
      widgets: [
        // Row 1: Health Score Cards
        {
          title: "Platform Health Score",
          row: 1,
          column: 1,
          width: 3,
          height: 3,
          configuration: {
            type: "billboard",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT average(cluster.health.score) AS 'Health Score' WHERE entity.type = 'MESSAGE_QUEUE_CLUSTER' SINCE 5 minutes ago`
            }],
            thresholds: [
              { value: 95, severity: "success" },
              { value: 80, severity: "warning" },
              { value: 0, severity: "critical" }
            ]
          }
        },
        {
          title: "Active Clusters",
          row: 1,
          column: 4,
          width: 3,
          height: 3,
          configuration: {
            type: "billboard",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT uniqueCount(entity.name) AS 'Active Clusters' WHERE entity.type = 'MESSAGE_QUEUE_CLUSTER' SINCE 5 minutes ago`
            }]
          }
        },
        {
          title: "Total Throughput",
          row: 1,
          column: 7,
          width: 3,
          height: 3,
          configuration: {
            type: "billboard",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT rate(sum(topic.throughput.in + topic.throughput.out), 1 minute) AS 'Messages/sec' WHERE entity.type = 'MESSAGE_QUEUE_TOPIC' SINCE 5 minutes ago`
            }]
          }
        },
        {
          title: "Consumer Lag",
          row: 1,
          column: 10,
          width: 3,
          height: 3,
          configuration: {
            type: "billboard",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT sum(topic.consumer.lag) AS 'Total Lag' WHERE entity.type = 'MESSAGE_QUEUE_TOPIC' SINCE 5 minutes ago`
            }],
            thresholds: [
              { value: 1000, severity: "warning" },
              { value: 10000, severity: "critical" }
            ]
          }
        },
        
        // Row 2: Trend Charts
        {
          title: "Throughput Trend",
          row: 4,
          column: 1,
          width: 6,
          height: 3,
          configuration: {
            type: "line",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT rate(sum(topic.throughput.in), 1 minute) AS 'Inbound', rate(sum(topic.throughput.out), 1 minute) AS 'Outbound' WHERE entity.type = 'MESSAGE_QUEUE_TOPIC' SINCE 1 hour ago TIMESERIES`
            }]
          }
        },
        {
          title: "Error Rate by Cluster",
          row: 4,
          column: 7,
          width: 6,
          height: 3,
          configuration: {
            type: "line",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT average(cluster.error.rate) WHERE entity.type = 'MESSAGE_QUEUE_CLUSTER' FACET clusterName SINCE 1 hour ago TIMESERIES`
            }]
          }
        },
        
        // Row 3: Distribution Charts
        {
          title: "Topic Distribution",
          row: 7,
          column: 1,
          width: 4,
          height: 3,
          configuration: {
            type: "pie",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT count(*) WHERE entity.type = 'MESSAGE_QUEUE_TOPIC' FACET clusterName SINCE 5 minutes ago`
            }]
          }
        },
        {
          title: "Broker Load Distribution",
          row: 7,
          column: 5,
          width: 4,
          height: 3,
          configuration: {
            type: "bar",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT average(broker.cpu.usage) AS 'CPU %', average(broker.memory.usage) AS 'Memory %' WHERE entity.type = 'MESSAGE_QUEUE_BROKER' FACET entity.name SINCE 5 minutes ago`
            }]
          }
        },
        {
          title: "Environment Overview",
          row: 7,
          column: 9,
          width: 4,
          height: 3,
          configuration: {
            type: "table",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT uniqueCount(entity.name) AS 'Brokers', sum(partitionCount) AS 'Partitions', average(broker.cpu.usage) AS 'Avg CPU %' WHERE entity.type = 'MESSAGE_QUEUE_BROKER' FACET environment OR 'production' SINCE 5 minutes ago`
            }]
          }
        }
      ]
    },
    
    {
      name: "Broker Performance",
      description: "Detailed broker metrics and performance indicators",
      widgets: [
        // Row 1: Broker Health
        {
          title: "Broker Status",
          row: 1,
          column: 1,
          width: 12,
          height: 3,
          configuration: {
            type: "table",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT latest(status) AS 'Status', latest(broker.cpu.usage) AS 'CPU %', latest(broker.memory.usage) AS 'Memory %', latest(partitionCount) AS 'Partitions', latest(leaderPartitions) AS 'Leader Partitions' WHERE entity.type = 'MESSAGE_QUEUE_BROKER' FACET entity.name, clusterName SINCE 5 minutes ago LIMIT 100`
            }]
          }
        },
        
        // Row 2: Resource Utilization
        {
          title: "CPU Usage by Broker",
          row: 4,
          column: 1,
          width: 6,
          height: 3,
          configuration: {
            type: "line",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT average(broker.cpu.usage) WHERE entity.type = 'MESSAGE_QUEUE_BROKER' FACET entity.name SINCE 1 hour ago TIMESERIES`
            }]
          }
        },
        {
          title: "Memory Usage by Broker",
          row: 4,
          column: 7,
          width: 6,
          height: 3,
          configuration: {
            type: "line",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT average(broker.memory.usage) WHERE entity.type = 'MESSAGE_QUEUE_BROKER' FACET entity.name SINCE 1 hour ago TIMESERIES`
            }]
          }
        },
        
        // Row 3: Network and Load
        {
          title: "Network Throughput",
          row: 7,
          column: 1,
          width: 6,
          height: 3,
          configuration: {
            type: "area",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT average(broker.network.throughput) WHERE entity.type = 'MESSAGE_QUEUE_BROKER' FACET entity.name SINCE 1 hour ago TIMESERIES`
            }]
          }
        },
        {
          title: "Request Latency",
          row: 7,
          column: 7,
          width: 6,
          height: 3,
          configuration: {
            type: "histogram",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT histogram(broker.request.latency, 10, 20) WHERE entity.type = 'MESSAGE_QUEUE_BROKER' SINCE 1 hour ago`
            }]
          }
        },
        
        // Row 4: Load Scores
        {
          title: "Broker Load Scores",
          row: 10,
          column: 1,
          width: 12,
          height: 3,
          configuration: {
            type: "bar",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT average(loadScore) WHERE entity.type = 'MESSAGE_QUEUE_BROKER' FACET entity.name SINCE 5 minutes ago`
            }]
          }
        }
      ]
    },
    
    {
      name: "Topic Analytics",
      description: "Topic performance and throughput analysis",
      widgets: [
        // Row 1: Topic Overview
        {
          title: "Top Topics by Throughput",
          row: 1,
          column: 1,
          width: 6,
          height: 3,
          configuration: {
            type: "table",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT sum(topic.throughput.in) AS 'In Rate', sum(topic.throughput.out) AS 'Out Rate', average(efficiencyScore) AS 'Efficiency %' WHERE entity.type = 'MESSAGE_QUEUE_TOPIC' FACET entity.name SINCE 5 minutes ago LIMIT 20`
            }]
          }
        },
        {
          title: "Topic Efficiency Distribution",
          row: 1,
          column: 7,
          width: 6,
          height: 3,
          configuration: {
            type: "histogram",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT histogram(efficiencyScore, 10, 10) WHERE entity.type = 'MESSAGE_QUEUE_TOPIC' SINCE 5 minutes ago`
            }]
          }
        },
        
        // Row 2: Throughput Analysis
        {
          title: "Topic Throughput Trend",
          row: 4,
          column: 1,
          width: 12,
          height: 3,
          configuration: {
            type: "area",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT rate(sum(topic.throughput.in), 1 minute) AS 'Inbound', rate(sum(topic.throughput.out), 1 minute) AS 'Outbound' WHERE entity.type = 'MESSAGE_QUEUE_TOPIC' SINCE 6 hours ago TIMESERIES`
            }]
          }
        },
        
        // Row 3: Partition Analysis
        {
          title: "Partition Distribution",
          row: 7,
          column: 1,
          width: 6,
          height: 3,
          configuration: {
            type: "bar",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT sum(partitionCount) WHERE entity.type = 'MESSAGE_QUEUE_TOPIC' FACET clusterName SINCE 5 minutes ago`
            }]
          }
        },
        {
          title: "Replication Factor",
          row: 7,
          column: 7,
          width: 6,
          height: 3,
          configuration: {
            type: "pie",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT count(*) WHERE entity.type = 'MESSAGE_QUEUE_TOPIC' FACET replicationFactor SINCE 5 minutes ago`
            }]
          }
        },
        
        // Row 4: Error Analysis
        {
          title: "Topic Error Rates",
          row: 10,
          column: 1,
          width: 12,
          height: 3,
          configuration: {
            type: "line",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT average(topic.error.rate) WHERE entity.type = 'MESSAGE_QUEUE_TOPIC' AND topic.error.rate > 0 FACET entity.name SINCE 1 hour ago TIMESERIES`
            }]
          }
        }
      ]
    },
    
    {
      name: "Consumer Groups",
      description: "Consumer group lag and performance monitoring",
      widgets: [
        // Row 1: Lag Overview
        {
          title: "Consumer Lag by Topic",
          row: 1,
          column: 1,
          width: 8,
          height: 3,
          configuration: {
            type: "table",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT sum(topic.consumer.lag) AS 'Total Lag', max(topic.consumer.lag) AS 'Max Lag' WHERE entity.type = 'MESSAGE_QUEUE_TOPIC' AND topic.consumer.lag > 0 FACET entity.name, clusterName SINCE 5 minutes ago LIMIT 50`
            }]
          }
        },
        {
          title: "Total Consumer Lag",
          row: 1,
          column: 9,
          width: 4,
          height: 3,
          configuration: {
            type: "billboard",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT sum(topic.consumer.lag) AS 'Total Lag' WHERE entity.type = 'MESSAGE_QUEUE_TOPIC' SINCE 5 minutes ago`
            }],
            thresholds: [
              { value: 10000, severity: "warning" },
              { value: 100000, severity: "critical" }
            ]
          }
        },
        
        // Row 2: Lag Trend
        {
          title: "Consumer Lag Trend",
          row: 4,
          column: 1,
          width: 12,
          height: 3,
          configuration: {
            type: "area",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT sum(topic.consumer.lag) WHERE entity.type = 'MESSAGE_QUEUE_TOPIC' FACET clusterName SINCE 24 hours ago TIMESERIES`
            }]
          }
        },
        
        // Row 3: Consumer Performance
        {
          title: "Consumption vs Production Rate",
          row: 7,
          column: 1,
          width: 12,
          height: 3,
          configuration: {
            type: "line",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT rate(sum(topic.throughput.in), 1 minute) AS 'Production Rate', rate(sum(topic.throughput.out), 1 minute) AS 'Consumption Rate' WHERE entity.type = 'MESSAGE_QUEUE_TOPIC' SINCE 1 hour ago TIMESERIES`
            }]
          }
        },
        
        // Row 4: Topic Lag Distribution
        {
          title: "Lag Distribution by Topic",
          row: 10,
          column: 1,
          width: 12,
          height: 3,
          configuration: {
            type: "bar",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT average(topic.consumer.lag) WHERE entity.type = 'MESSAGE_QUEUE_TOPIC' AND topic.consumer.lag > 0 FACET entity.name SINCE 5 minutes ago LIMIT 20`
            }]
          }
        }
      ]
    },
    
    {
      name: "Alerts & Anomalies",
      description: "Alert conditions and anomaly detection",
      widgets: [
        // Row 1: Alert Summary
        {
          title: "Alert Summary",
          row: 1,
          column: 1,
          width: 12,
          height: 2,
          configuration: {
            type: "markdown",
            text: `# Alert Conditions\n\n### Critical Alerts\n- **High Consumer Lag**: > 100,000 messages\n- **Broker CPU**: > 90%\n- **Cluster Health Score**: < 70\n- **Error Rate**: > 5%\n\n### Warning Alerts\n- **Consumer Lag**: > 10,000 messages\n- **Broker CPU**: > 80%\n- **Memory Usage**: > 85%\n- **Network Saturation**: > 80%`
          }
        },
        
        // Row 2: Critical Metrics
        {
          title: "Critical Metrics",
          row: 3,
          column: 1,
          width: 6,
          height: 3,
          configuration: {
            type: "table",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT average(broker.cpu.usage) AS 'CPU %', average(broker.memory.usage) AS 'Memory %', average(cluster.error.rate) AS 'Error Rate' WHERE entity.type IN ('MESSAGE_QUEUE_BROKER', 'MESSAGE_QUEUE_CLUSTER') AND (broker.cpu.usage > 80 OR broker.memory.usage > 85 OR cluster.error.rate > 1) FACET entity.name SINCE 5 minutes ago`
            }]
          }
        },
        {
          title: "Error Rate Trend",
          row: 3,
          column: 7,
          width: 6,
          height: 3,
          configuration: {
            type: "line",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT average(cluster.error.rate) AS 'Cluster Errors', average(topic.error.rate) AS 'Topic Errors' WHERE entity.type IN ('MESSAGE_QUEUE_CLUSTER', 'MESSAGE_QUEUE_TOPIC') SINCE 1 hour ago TIMESERIES`
            }]
          }
        },
        
        // Row 3: Anomaly Detection
        {
          title: "Throughput Anomalies",
          row: 6,
          column: 1,
          width: 12,
          height: 3,
          configuration: {
            type: "line",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT rate(sum(topic.throughput.in + topic.throughput.out), 1 minute) AS 'Total Throughput' WHERE entity.type = 'MESSAGE_QUEUE_TOPIC' SINCE 6 hours ago TIMESERIES`
            }]
          }
        },
        
        // Row 4: Resource Alerts
        {
          title: "Resource Alert Status",
          row: 9,
          column: 1,
          width: 12,
          height: 3,
          configuration: {
            type: "table",
            nrqlQueries: [{
              query: `FROM MessageQueue SELECT latest(broker.cpu.usage) AS 'CPU %', latest(broker.memory.usage) AS 'Memory %', latest(broker.network.throughput) AS 'Network Bytes/s', latest(loadScore) AS 'Load Score' WHERE entity.type = 'MESSAGE_QUEUE_BROKER' FACET entity.name SINCE 5 minutes ago`
            }]
          }
        }
      ]
    }
  ],
  
  variables: []
};

/**
 * Apply filters to dashboard based on options
 */
function applyFilters(dashboard, filters = {}) {
  const filtered = JSON.parse(JSON.stringify(dashboard));
  
  if (filters.cluster) {
    // Add cluster filter to all queries
    filtered.pages.forEach(page => {
      page.widgets.forEach(widget => {
        if (widget.configuration.nrqlQueries) {
          widget.configuration.nrqlQueries.forEach(query => {
            if (!query.query.includes('clusterName')) {
              query.query = query.query.replace(
                'WHERE',
                `WHERE clusterName = '${filters.cluster}' AND`
              );
            }
          });
        }
      });
    });
  }
  
  if (filters.environment) {
    // Add environment filter
    filtered.pages.forEach(page => {
      page.widgets.forEach(widget => {
        if (widget.configuration.nrqlQueries) {
          widget.configuration.nrqlQueries.forEach(query => {
            query.query = query.query.replace(
              'WHERE',
              `WHERE environment = '${filters.environment}' AND`
            );
          });
        }
      });
    });
  }
  
  return filtered;
}

module.exports = {
  standardMessageQueueDashboard,
  applyFilters
};