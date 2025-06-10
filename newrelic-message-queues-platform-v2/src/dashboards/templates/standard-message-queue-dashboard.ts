/**
 * Standard Message Queue Dashboard Template
 * 
 * Comprehensive dashboard template for monitoring message queue infrastructure
 * Includes all pages as per product specifications:
 * - Overview page with cluster health and key metrics
 * - Broker performance page with CPU, memory, network metrics
 * - Topic analytics page with throughput, lag, and error rates
 * - Consumer group monitoring page
 * - Alerts and anomalies page
 */

export interface DashboardPage {
  name: string;
  description: string;
  widgets: DashboardWidget[];
}

export interface DashboardWidget {
  title: string;
  layout: {
    column: number;
    row: number;
    width: number;
    height: number;
  };
  visualization: {
    id: string;
  };
  rawConfiguration: any;
}

export interface DashboardTemplate {
  name: string;
  description: string;
  permissions: string;
  pages: DashboardPage[];
}

export class StandardMessageQueueDashboard {
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  /**
   * Generate the complete dashboard template
   */
  public generateTemplate(dashboardName: string = 'Message Queues Platform'): DashboardTemplate {
    return {
      name: dashboardName,
      description: 'Comprehensive monitoring dashboard for message queue infrastructure with cluster health, broker performance, topic analytics, consumer monitoring, and alerts',
      permissions: 'PUBLIC_READ_WRITE',
      pages: [
        this.createOverviewPage(),
        this.createBrokerPerformancePage(),
        this.createTopicAnalyticsPage(),
        this.createConsumerGroupMonitoringPage(),
        this.createAlertsAndAnomaliesPage()
      ]
    };
  }

  /**
   * Overview page with cluster health and key metrics
   */
  private createOverviewPage(): DashboardPage {
    return {
      name: 'Overview',
      description: 'Cluster health and key platform metrics',
      widgets: [
        // Cluster Health Score
        {
          title: 'Overall Cluster Health',
          layout: { column: 1, row: 1, width: 3, height: 3 },
          visualization: { id: 'viz.billboard' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT average(cluster.health.score) AS 'Health Score' WHERE entityType = 'MESSAGE_QUEUE_CLUSTER' SINCE 30 minutes ago`
            }],
            thresholds: [
              { alertSeverity: 'CRITICAL', value: 60 },
              { alertSeverity: 'WARNING', value: 80 }
            ]
          }
        },
        // Cluster Availability
        {
          title: 'Cluster Availability',
          layout: { column: 4, row: 1, width: 3, height: 3 },
          visualization: { id: 'viz.billboard' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT average(cluster.availability) AS 'Availability %' WHERE entityType = 'MESSAGE_QUEUE_CLUSTER' SINCE 30 minutes ago`
            }],
            thresholds: [
              { alertSeverity: 'CRITICAL', value: 95 },
              { alertSeverity: 'WARNING', value: 99 }
            ]
          }
        },
        // Total Throughput
        {
          title: 'Total Message Throughput',
          layout: { column: 7, row: 1, width: 3, height: 3 },
          visualization: { id: 'viz.billboard' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT sum(cluster.throughput.total) AS 'Messages/sec' WHERE entityType = 'MESSAGE_QUEUE_CLUSTER' SINCE 5 minutes ago`
            }]
          }
        },
        // Error Rate
        {
          title: 'Platform Error Rate',
          layout: { column: 10, row: 1, width: 3, height: 3 },
          visualization: { id: 'viz.billboard' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT average(cluster.error.rate) AS 'Error %' WHERE entityType = 'MESSAGE_QUEUE_CLUSTER' SINCE 5 minutes ago`
            }],
            thresholds: [
              { alertSeverity: 'WARNING', value: 1 },
              { alertSeverity: 'CRITICAL', value: 5 }
            ]
          }
        },
        // Cluster Status Matrix
        {
          title: 'Cluster Status',
          layout: { column: 1, row: 4, width: 6, height: 4 },
          visualization: { id: 'viz.table' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT latest(displayName) AS 'Cluster', latest(cluster.health.score) AS 'Health Score', latest(brokerCount) AS 'Brokers', latest(topicCount) AS 'Topics', latest(cluster.throughput.total) AS 'Throughput', latest(cluster.error.rate) AS 'Error Rate' WHERE entityType = 'MESSAGE_QUEUE_CLUSTER' SINCE 10 minutes ago FACET entityGuid`
            }]
          }
        },
        // Throughput Trend
        {
          title: 'Message Throughput Trend',
          layout: { column: 7, row: 4, width: 6, height: 4 },
          visualization: { id: 'viz.area' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT sum(cluster.throughput.total) AS 'Total Throughput' WHERE entityType = 'MESSAGE_QUEUE_CLUSTER' SINCE 2 hours ago TIMESERIES AUTO`
            }]
          }
        },
        // Entity Count Overview
        {
          title: 'Entity Distribution',
          layout: { column: 1, row: 8, width: 4, height: 3 },
          visualization: { id: 'viz.pie' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT uniqueCount(entityGuid) WHERE entityType LIKE 'MESSAGE_QUEUE_%' SINCE 30 minutes ago FACET entityType`
            }]
          }
        },
        // Top Issues
        {
          title: 'Critical Issues',
          layout: { column: 5, row: 8, width: 8, height: 3 },
          visualization: { id: 'viz.table' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT latest(displayName) AS 'Entity', latest(entityType) AS 'Type', latest(cluster.health.score) AS 'Health Score' WHERE entityType LIKE 'MESSAGE_QUEUE_%' AND cluster.health.score < 80 SINCE 30 minutes ago FACET entityGuid LIMIT 10`
            }]
          }
        }
      ]
    };
  }

  /**
   * Broker performance page with CPU, memory, network metrics
   */
  private createBrokerPerformancePage(): DashboardPage {
    return {
      name: 'Broker Performance',
      description: 'Detailed broker resource utilization and performance metrics',
      widgets: [
        // Average CPU Usage
        {
          title: 'Average CPU Usage',
          layout: { column: 1, row: 1, width: 4, height: 3 },
          visualization: { id: 'viz.line' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT average(broker.cpu.usage) AS 'CPU %' WHERE entityType = 'MESSAGE_QUEUE_BROKER' SINCE 1 hour ago TIMESERIES AUTO`
            }],
            yAxisLeft: { max: 100, min: 0 }
          }
        },
        // Average Memory Usage
        {
          title: 'Average Memory Usage',
          layout: { column: 5, row: 1, width: 4, height: 3 },
          visualization: { id: 'viz.line' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT average(broker.memory.usage) AS 'Memory %' WHERE entityType = 'MESSAGE_QUEUE_BROKER' SINCE 1 hour ago TIMESERIES AUTO`
            }],
            yAxisLeft: { max: 100, min: 0 }
          }
        },
        // Network Throughput
        {
          title: 'Network Throughput',
          layout: { column: 9, row: 1, width: 4, height: 3 },
          visualization: { id: 'viz.line' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT average(broker.network.throughput) / 1048576 AS 'MB/sec' WHERE entityType = 'MESSAGE_QUEUE_BROKER' SINCE 1 hour ago TIMESERIES AUTO`
            }]
          }
        },
        // Broker Status Table
        {
          title: 'Broker Status Details',
          layout: { column: 1, row: 4, width: 12, height: 4 },
          visualization: { id: 'viz.table' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT latest(displayName) AS 'Broker', latest(broker.cpu.usage) AS 'CPU %', latest(broker.memory.usage) AS 'Memory %', latest(broker.disk.usage) AS 'Disk %', latest(broker.network.throughput) / 1048576 AS 'Network MB/s', latest(partitionCount) AS 'Partitions', latest(leaderPartitions) AS 'Leader Partitions' WHERE entityType = 'MESSAGE_QUEUE_BROKER' SINCE 10 minutes ago FACET entityGuid LIMIT 50`
            }]
          }
        },
        // Request Latency Distribution
        {
          title: 'Request Latency Distribution',
          layout: { column: 1, row: 8, width: 6, height: 3 },
          visualization: { id: 'viz.histogram' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT histogram(broker.request.latency, 20, 10) WHERE entityType = 'MESSAGE_QUEUE_BROKER' SINCE 30 minutes ago`
            }]
          }
        },
        // Broker Load Score
        {
          title: 'Broker Load Distribution',
          layout: { column: 7, row: 8, width: 6, height: 3 },
          visualization: { id: 'viz.bar' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT latest(loadScore) AS 'Load Score' WHERE entityType = 'MESSAGE_QUEUE_BROKER' SINCE 10 minutes ago FACET displayName`
            }]
          }
        }
      ]
    };
  }

  /**
   * Topic analytics page with throughput, lag, and error rates
   */
  private createTopicAnalyticsPage(): DashboardPage {
    return {
      name: 'Topic Analytics',
      description: 'Topic performance, throughput patterns, and data flow analysis',
      widgets: [
        // Top Topics by Throughput
        {
          title: 'Top Topics by Message Throughput',
          layout: { column: 1, row: 1, width: 6, height: 4 },
          visualization: { id: 'viz.bar' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT sum(topic.throughput.in.messagesPerSecond) AS 'In Messages/sec', sum(topic.throughput.out.messagesPerSecond) AS 'Out Messages/sec' WHERE entityType = 'MESSAGE_QUEUE_TOPIC' SINCE 30 minutes ago FACET displayName LIMIT 15`
            }]
          }
        },
        // Topic Lag Analysis
        {
          title: 'Topic Consumer Lag',
          layout: { column: 7, row: 1, width: 6, height: 4 },
          visualization: { id: 'viz.bar' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT max(topic.lag) AS 'Max Lag' WHERE entityType = 'MESSAGE_QUEUE_TOPIC' AND topic.lag > 0 SINCE 30 minutes ago FACET displayName LIMIT 15`
            }]
          }
        },
        // Topic Error Rates
        {
          title: 'Topic Error Rates',
          layout: { column: 1, row: 5, width: 4, height: 3 },
          visualization: { id: 'viz.line' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT average(topic.error.rate) AS 'Error Rate %' WHERE entityType = 'MESSAGE_QUEUE_TOPIC' SINCE 2 hours ago TIMESERIES AUTO`
            }]
          }
        },
        // Topic Efficiency Score
        {
          title: 'Topic Efficiency Distribution',
          layout: { column: 5, row: 5, width: 4, height: 3 },
          visualization: { id: 'viz.pie' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT uniqueCount(entityGuid) WHERE entityType = 'MESSAGE_QUEUE_TOPIC' SINCE 30 minutes ago FACET CASES(WHERE efficiencyScore >= 90 AS 'Excellent', WHERE efficiencyScore >= 70 AS 'Good', WHERE efficiencyScore >= 50 AS 'Fair', WHERE efficiencyScore < 50 AS 'Poor')`
            }]
          }
        },
        // Topic Size Distribution
        {
          title: 'Topic Storage Distribution',
          layout: { column: 9, row: 5, width: 4, height: 3 },
          visualization: { id: 'viz.pie' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT latest(topic.sizeOnDisk.mb) / 1024 AS 'Size GB' WHERE entityType = 'MESSAGE_QUEUE_TOPIC' AND topic.sizeOnDisk.mb > 0 SINCE 30 minutes ago FACET displayName LIMIT 10`
            }]
          }
        },
        // Topic Details Table
        {
          title: 'Topic Configuration and Performance',
          layout: { column: 1, row: 8, width: 12, height: 4 },
          visualization: { id: 'viz.table' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT latest(displayName) AS 'Topic', latest(kafka.partition.count) AS 'Partitions', latest(kafka.replication.factor) AS 'Rep Factor', latest(topic.throughput.in.messagesPerSecond) AS 'In Msg/s', latest(topic.throughput.out.messagesPerSecond) AS 'Out Msg/s', latest(topic.error.rate) AS 'Error %', latest(efficiencyScore) AS 'Efficiency' WHERE entityType = 'MESSAGE_QUEUE_TOPIC' SINCE 30 minutes ago FACET entityGuid LIMIT 100`
            }]
          }
        }
      ]
    };
  }

  /**
   * Consumer group monitoring page
   */
  private createConsumerGroupMonitoringPage(): DashboardPage {
    return {
      name: 'Consumer Groups',
      description: 'Consumer group health, lag monitoring, and performance analysis',
      widgets: [
        // Total Consumer Lag
        {
          title: 'Total Platform Consumer Lag',
          layout: { column: 1, row: 1, width: 3, height: 3 },
          visualization: { id: 'viz.billboard' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT sum(consumerGroup.lag.total) AS 'Total Lag' WHERE entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP' SINCE 5 minutes ago`
            }],
            thresholds: [
              { alertSeverity: 'WARNING', value: 10000 },
              { alertSeverity: 'CRITICAL', value: 50000 }
            ]
          }
        },
        // Active Consumer Groups
        {
          title: 'Active Consumer Groups',
          layout: { column: 4, row: 1, width: 3, height: 3 },
          visualization: { id: 'viz.billboard' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT uniqueCount(entityGuid) AS 'Active Groups' WHERE entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP' SINCE 5 minutes ago`
            }]
          }
        },
        // Average Lag per Consumer
        {
          title: 'Average Lag per Consumer',
          layout: { column: 7, row: 1, width: 3, height: 3 },
          visualization: { id: 'viz.billboard' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT average(consumerGroup.lag.total) AS 'Avg Lag' WHERE entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP' SINCE 5 minutes ago`
            }]
          }
        },
        // Consumer Health Distribution
        {
          title: 'Consumer Group Health',
          layout: { column: 10, row: 1, width: 3, height: 3 },
          visualization: { id: 'viz.pie' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT uniqueCount(entityGuid) WHERE entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP' SINCE 30 minutes ago FACET CASES(WHERE consumerGroup.health.score >= 80 AS 'Healthy', WHERE consumerGroup.health.score >= 60 AS 'Warning', WHERE consumerGroup.health.score < 60 AS 'Critical')`
            }]
          }
        },
        // Consumer Lag Trend
        {
          title: 'Consumer Lag Trend',
          layout: { column: 1, row: 4, width: 6, height: 4 },
          visualization: { id: 'viz.area' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT sum(consumerGroup.lag.total) AS 'Total Lag' WHERE entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP' SINCE 2 hours ago TIMESERIES AUTO`
            }]
          }
        },
        // Top Lagging Consumer Groups
        {
          title: 'Top Consumer Groups by Lag',
          layout: { column: 7, row: 4, width: 6, height: 4 },
          visualization: { id: 'viz.bar' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT latest(consumerGroup.lag.total) AS 'Total Lag' WHERE entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP' AND consumerGroup.lag.total > 0 SINCE 10 minutes ago FACET displayName LIMIT 15`
            }]
          }
        },
        // Consumer Group Details
        {
          title: 'Consumer Group Performance Details',
          layout: { column: 1, row: 8, width: 12, height: 4 },
          visualization: { id: 'viz.table' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT latest(displayName) AS 'Consumer Group', latest(consumerGroup.lag.total) AS 'Total Lag', latest(consumerGroup.throughput.messagesPerSecond) AS 'Throughput Msg/s', latest(consumerGroup.members.active) AS 'Active Members', latest(consumerGroup.lastCommit.age.seconds) AS 'Last Commit Age (s)', latest(consumerGroup.health.score) AS 'Health Score' WHERE entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP' SINCE 10 minutes ago FACET entityGuid LIMIT 100`
            }]
          }
        }
      ]
    };
  }

  /**
   * Alerts and anomalies page
   */
  private createAlertsAndAnomaliesPage(): DashboardPage {
    return {
      name: 'Alerts & Anomalies',
      description: 'Critical alerts, anomaly detection, and issue tracking',
      widgets: [
        // Critical Alerts Count
        {
          title: 'Active Critical Alerts',
          layout: { column: 1, row: 1, width: 3, height: 2 },
          visualization: { id: 'viz.billboard' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT uniqueCount(entityGuid) AS 'Critical Issues' WHERE entityType LIKE 'MESSAGE_QUEUE_%' AND (cluster.health.score < 60 OR broker.cpu.usage > 90 OR topic.error.rate > 5) SINCE 30 minutes ago`
            }],
            thresholds: [
              { alertSeverity: 'CRITICAL', value: 1 }
            ]
          }
        },
        // Warning Alerts Count
        {
          title: 'Active Warning Alerts',
          layout: { column: 4, row: 1, width: 3, height: 2 },
          visualization: { id: 'viz.billboard' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT uniqueCount(entityGuid) AS 'Warnings' WHERE entityType LIKE 'MESSAGE_QUEUE_%' AND (cluster.health.score BETWEEN 60 AND 80 OR broker.cpu.usage BETWEEN 80 AND 90 OR topic.error.rate BETWEEN 1 AND 5) SINCE 30 minutes ago`
            }],
            thresholds: [
              { alertSeverity: 'WARNING', value: 5 }
            ]
          }
        },
        // Anomaly Score
        {
          title: 'Platform Anomaly Score',
          layout: { column: 7, row: 1, width: 3, height: 2 },
          visualization: { id: 'viz.billboard' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT average(100 - cluster.health.score) AS 'Anomaly Score' WHERE entityType = 'MESSAGE_QUEUE_CLUSTER' SINCE 30 minutes ago`
            }]
          }
        },
        // Incident Trend
        {
          title: 'Incident Count Trend',
          layout: { column: 10, row: 1, width: 3, height: 2 },
          visualization: { id: 'viz.billboard' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT uniqueCount(entityGuid) AS 'Total Issues' WHERE entityType LIKE 'MESSAGE_QUEUE_%' AND (cluster.health.score < 80 OR broker.cpu.usage > 80 OR topic.error.rate > 1) SINCE 30 minutes ago COMPARE WITH 1 hour ago`
            }]
          }
        },
        // Alert Timeline
        {
          title: 'Alert Timeline',
          layout: { column: 1, row: 3, width: 12, height: 3 },
          visualization: { id: 'viz.line' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT uniqueCount(entityGuid) AS 'Critical', uniqueCount(entityGuid) AS 'Warning' WHERE entityType LIKE 'MESSAGE_QUEUE_%' AND (cluster.health.score < 80 OR broker.cpu.usage > 80 OR topic.error.rate > 1) SINCE 4 hours ago TIMESERIES 10 minutes`
            }]
          }
        },
        // Top Issues by Entity Type
        {
          title: 'Issues by Entity Type',
          layout: { column: 1, row: 6, width: 4, height: 3 },
          visualization: { id: 'viz.pie' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT uniqueCount(entityGuid) WHERE entityType LIKE 'MESSAGE_QUEUE_%' AND (cluster.health.score < 80 OR broker.cpu.usage > 80 OR topic.error.rate > 1 OR consumerGroup.lag.total > 10000) SINCE 30 minutes ago FACET entityType`
            }]
          }
        },
        // Resource Exhaustion Alerts
        {
          title: 'Resource Exhaustion Risk',
          layout: { column: 5, row: 6, width: 4, height: 3 },
          visualization: { id: 'viz.bar' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT latest(broker.cpu.usage) AS 'CPU', latest(broker.memory.usage) AS 'Memory', latest(broker.disk.usage) AS 'Disk' WHERE entityType = 'MESSAGE_QUEUE_BROKER' AND (broker.cpu.usage > 80 OR broker.memory.usage > 80 OR broker.disk.usage > 80) SINCE 10 minutes ago FACET displayName LIMIT 10`
            }]
          }
        },
        // Lag Anomalies
        {
          title: 'Consumer Lag Anomalies',
          layout: { column: 9, row: 6, width: 4, height: 3 },
          visualization: { id: 'viz.bar' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT latest(consumerGroup.lag.total) AS 'Lag' WHERE entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP' AND consumerGroup.lag.total > 10000 SINCE 10 minutes ago FACET displayName LIMIT 10`
            }]
          }
        },
        // Critical Issues Detail
        {
          title: 'Critical Issues Detail',
          layout: { column: 1, row: 9, width: 12, height: 4 },
          visualization: { id: 'viz.table' },
          rawConfiguration: {
            nrqlQueries: [{
              accountId: this.accountId,
              query: `FROM MessageQueue SELECT latest(displayName) AS 'Entity', latest(entityType) AS 'Type', latest(cluster.health.score) AS 'Health', latest(broker.cpu.usage) AS 'CPU %', latest(broker.memory.usage) AS 'Memory %', latest(topic.error.rate) AS 'Error %', latest(consumerGroup.lag.total) AS 'Lag' WHERE entityType LIKE 'MESSAGE_QUEUE_%' AND (cluster.health.score < 70 OR broker.cpu.usage > 85 OR broker.memory.usage > 85 OR topic.error.rate > 3 OR consumerGroup.lag.total > 20000) SINCE 10 minutes ago FACET entityGuid LIMIT 50`
            }]
          }
        }
      ]
    };
  }
}