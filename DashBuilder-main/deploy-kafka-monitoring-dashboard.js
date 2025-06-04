#!/usr/bin/env node

/**
 * Deploy Comprehensive Kafka Monitoring Dashboard
 */

require('dotenv').config();
const { createDashboardBuilder } = require('./src');
const ora = require('ora');
const chalk = require('chalk');

async function deployKafkaMonitoringDashboard() {
  const config = {
    accountId: parseInt(process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID || '3630072'),
    apiKey: process.env.UKEY || process.env.NEW_RELIC_API_KEY,
    region: process.env.NEW_RELIC_REGION || 'US'
  };
  
  if (!config.apiKey) {
    console.error(chalk.red('Missing API key. Please set UKEY or NEW_RELIC_API_KEY environment variable'));
    process.exit(1);
  }
  
  const spinner = ora('Deploying Kafka Monitoring Dashboard...').start();
  
  try {
    // Create the dashboard structure with proper rawConfiguration format
    const dashboard = {
      name: 'Kafka Monitoring Dashboard - Complete',
      description: 'Comprehensive Kafka monitoring with broker, topic, consumer lag, and performance metrics',
      permissions: 'PUBLIC_READ_WRITE',
      pages: [
        {
          name: 'Overview',
          description: 'Kafka cluster health and performance overview',
          widgets: [
            // Cluster Health Summary
            {
              title: 'Cluster Health Summary',
              layout: { column: 1, row: 1, width: 12, height: 3 },
              visualization: { id: 'viz.billboard' },
              rawConfiguration: {
                nrqlQueries: [
                  {
                    accountIds: [config.accountId],
                    query: "SELECT uniqueCount(displayName) AS 'Active Brokers' FROM KafkaBrokerSample SINCE 10 minutes ago"
                  },
                  {
                    accountIds: [config.accountId],
                    query: "SELECT uniqueCount(topic) AS 'Active Topics' FROM KafkaTopicSample SINCE 10 minutes ago"
                  },
                  {
                    accountIds: [config.accountId],
                    query: "SELECT sum(topic.underReplicatedPartitions) AS 'Under Replicated Partitions' FROM KafkaTopicSample SINCE 10 minutes ago"
                  },
                  {
                    accountIds: [config.accountId],
                    query: "SELECT average(consumer.totalLag) AS 'Avg Consumer Lag' FROM KafkaOffsetSample SINCE 10 minutes ago"
                  }
                ],
                platformOptions: {
                  ignoreTimeRange: false
                },
                thresholds: {
                  isLabelVisible: true,
                  thresholds: [
                    {
                      value: 10,
                      alertSeverity: 'CRITICAL'
                    }
                  ]
                }
              }
            },
            
            // Broker Throughput
            {
              title: 'Broker Throughput',
              layout: { column: 1, row: 4, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(broker.messagesInPerSecond) AS 'Messages In/sec', average(broker.IOInPerSecond) AS 'MB In/sec', average(broker.IOOutPerSecond) AS 'MB Out/sec' FROM KafkaBrokerSample TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                },
                yAxisLeft: {
                  zero: true
                }
              }
            },
            
            // Request Performance
            {
              title: 'Request Performance',
              layout: { column: 7, row: 4, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(request.avgTimeFetch) AS 'Fetch', average(request.avgTimeProduceRequest) AS 'Produce', average(request.avgTimeMetadata) AS 'Metadata' FROM KafkaBrokerSample TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                },
                yAxisLeft: {
                  zero: true
                },
                units: {
                  unit: 'MS'
                }
              }
            },
            
            // Replication Health
            {
              title: 'Replication Health',
              layout: { column: 1, row: 7, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT sum(replication.unreplicatedPartitions) AS 'Unreplicated Partitions', average(replication.isrExpandsPerSecond) AS 'ISR Expands/sec', average(replication.isrShrinksPerSecond) AS 'ISR Shrinks/sec' FROM KafkaBrokerSample TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            },
            
            // Failed Requests
            {
              title: 'Failed Requests',
              layout: { column: 7, row: 7, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT sum(request.clientFetchesFailedPerSecond) AS 'Failed Fetches', sum(request.produceRequestsFailedPerSecond) AS 'Failed Produces' FROM KafkaBrokerSample TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            }
          ]
        },
        {
          name: 'Brokers',
          description: 'Individual broker performance and health',
          widgets: [
            // Broker Status Table
            {
              title: 'Broker Status Table',
              layout: { column: 1, row: 1, width: 12, height: 4 },
              visualization: { id: 'viz.table' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT latest(displayName) AS 'Broker', latest(broker.messagesInPerSecond) AS 'Messages/sec', latest(broker.IOInPerSecond) AS 'MB In/sec', latest(broker.IOOutPerSecond) AS 'MB Out/sec', latest(replication.unreplicatedPartitions) AS 'Unreplicated', latest(request.handlerIdle) AS 'Handler Idle %' FROM KafkaBrokerSample FACET displayName SINCE 10 minutes ago"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            },
            
            // Per-Broker Throughput
            {
              title: 'Per-Broker Throughput',
              layout: { column: 1, row: 5, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(broker.messagesInPerSecond) FROM KafkaBrokerSample FACET displayName TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            },
            
            // Per-Broker Request Latency
            {
              title: 'Per-Broker Request Latency',
              layout: { column: 7, row: 5, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(request.avgTimeMetadata) FROM KafkaBrokerSample FACET displayName TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                },
                units: {
                  unit: 'MS'
                }
              }
            }
          ]
        },
        {
          name: 'Topics',
          description: 'Topic health and partition status',
          widgets: [
            // Topic Health Status
            {
              title: 'Topic Health Status',
              layout: { column: 1, row: 1, width: 12, height: 4 },
              visualization: { id: 'viz.table' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT latest(topic) AS 'Topic', latest(topic.underReplicatedPartitions) AS 'Under Replicated', latest(topic.partitionsWithNonPreferredLeader) AS 'Non-Preferred Leaders', latest(topic.respondsToMetadataRequests) AS 'Responds to Metadata' FROM KafkaTopicSample FACET topic SINCE 10 minutes ago LIMIT 50"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            },
            
            // Topics with Issues
            {
              title: 'Topics with Issues',
              layout: { column: 1, row: 5, width: 12, height: 3 },
              visualization: { id: 'viz.billboard' },
              rawConfiguration: {
                nrqlQueries: [
                  {
                    accountIds: [config.accountId],
                    query: "SELECT uniqueCount(topic) AS 'Topics with Under Replicated Partitions' FROM KafkaTopicSample WHERE topic.underReplicatedPartitions > 0 SINCE 10 minutes ago"
                  },
                  {
                    accountIds: [config.accountId],
                    query: "SELECT uniqueCount(topic) AS 'Topics with Non-Preferred Leaders' FROM KafkaTopicSample WHERE topic.partitionsWithNonPreferredLeader > 0 SINCE 10 minutes ago"
                  }
                ],
                platformOptions: {
                  ignoreTimeRange: false
                },
                thresholds: {
                  isLabelVisible: true,
                  thresholds: [
                    {
                      value: 1,
                      alertSeverity: 'WARNING'
                    }
                  ]
                }
              }
            }
          ]
        },
        {
          name: 'Consumer Lag',
          description: 'Consumer group lag monitoring',
          widgets: [
            // Consumer Group Lag Summary
            {
              title: 'Consumer Group Lag Summary',
              layout: { column: 1, row: 1, width: 12, height: 4 },
              visualization: { id: 'viz.table' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT latest(consumerGroup) AS 'Consumer Group', latest(topic) AS 'Topic', max(consumer.lag) AS 'Max Partition Lag', sum(consumer.lag) AS 'Total Lag', latest(consumer.offset) AS 'Current Offset' FROM KafkaOffsetSample FACET consumerGroup, topic SINCE 10 minutes ago LIMIT 100"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            },
            
            // Consumer Lag Trend
            {
              title: 'Consumer Lag Trend',
              layout: { column: 1, row: 5, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(consumer.lag) FROM KafkaOffsetSample FACET consumerGroup TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            },
            
            // Max Consumer Group Lag
            {
              title: 'Max Consumer Group Lag',
              layout: { column: 7, row: 5, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT max(consumerGroup.maxLag) FROM KafkaOffsetSample FACET consumerGroup TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            }
          ]
        },
        {
          name: 'Performance',
          description: 'Detailed performance metrics and latency analysis',
          widgets: [
            // Request Latency Percentiles
            {
              title: 'Request Latency Percentiles',
              layout: { column: 1, row: 1, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(request.avgTimeMetadata) AS 'Avg', average(request.avgTimeMetadata99Percentile) AS 'p99' FROM KafkaBrokerSample TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                },
                units: {
                  unit: 'MS'
                }
              }
            },
            
            // Handler Utilization
            {
              title: 'Handler Utilization',
              layout: { column: 7, row: 1, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(request.handlerIdle) AS 'Handler Idle %', 100 - average(request.handlerIdle) AS 'Handler Busy %' FROM KafkaBrokerSample TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                },
                yAxisLeft: {
                  max: 100,
                  min: 0
                }
              }
            },
            
            // Request Queue Time
            {
              title: 'Request Queue Time',
              layout: { column: 1, row: 4, width: 12, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(request.avgTimeUpdateMetadata) AS 'Update Metadata', average(request.avgTimeMetadata) AS 'Metadata', average(request.avgTimeFetch) AS 'Fetch', average(request.avgTimeProduceRequest) AS 'Produce' FROM KafkaBrokerSample TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                },
                units: {
                  unit: 'MS'
                }
              }
            }
          ]
        }
      ]
    };
    
    // Deploy the dashboard
    const builder = createDashboardBuilder(config);
    const result = await builder.deploy(dashboard);
    
    spinner.succeed('Dashboard deployed successfully!');
    console.log(`\n🎉 Dashboard GUID: ${chalk.cyan(result.guid)}`);
    console.log(`📊 View at: ${chalk.blue(`https://one.newrelic.com/dashboards/detail/${result.guid}?account=${config.accountId}`)}`);
    
    // Save deployment info
    const fs = require('fs').promises;
    await fs.writeFile(
      'kafka-monitoring-dashboard-info.json',
      JSON.stringify({
        guid: result.guid,
        name: dashboard.name,
        deployedAt: new Date().toISOString(),
        accountId: config.accountId,
        dashboardUrl: `https://one.newrelic.com/dashboards/detail/${result.guid}?account=${config.accountId}`,
        pages: dashboard.pages.length,
        widgets: dashboard.pages.reduce((sum, page) => sum + page.widgets.length, 0)
      }, null, 2)
    );
    
    console.log('\n✅ Deployment info saved to: kafka-monitoring-dashboard-info.json');
    console.log(`📈 Dashboard contains ${dashboard.pages.length} pages with ${dashboard.pages.reduce((sum, page) => sum + page.widgets.length, 0)} widgets total`);
    
  } catch (error) {
    spinner.fail('Deployment failed');
    console.error(chalk.red('Error:'), error.message);
    if (error.response?.data) {
      console.error(chalk.red('Details:'), JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run the deployment
deployKafkaMonitoringDashboard();