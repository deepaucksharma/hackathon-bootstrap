#!/usr/bin/env node

/**
 * Deploy Strimzi Kafka Dashboard with MSK-compatible metrics
 */

require('dotenv').config();
const { createDashboardBuilder } = require('./src');
const ora = require('ora');
const chalk = require('chalk');

async function deployStrimziKafkaDashboard() {
  const config = {
    accountId: parseInt(process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID || '3630072'),
    apiKey: process.env.UKEY || process.env.NEW_RELIC_API_KEY,
    region: process.env.NEW_RELIC_REGION || 'US'
  };
  
  if (!config.apiKey) {
    console.error(chalk.red('Missing API key. Please set UKEY or NEW_RELIC_API_KEY environment variable'));
    process.exit(1);
  }
  
  const spinner = ora('Deploying Strimzi Kafka Dashboard...').start();
  
  try {
    // Create the dashboard structure
    const dashboard = {
      name: 'Strimzi Kafka Production Dashboard',
      description: 'Comprehensive monitoring for Strimzi Kafka deployment with MSK-compatible metrics',
      permissions: 'PUBLIC_READ_WRITE',
      pages: [
        {
          name: 'Cluster Overview',
          description: 'Strimzi Kafka cluster health and performance overview',
          widgets: [
            // Cluster Health Overview
            {
              title: 'Strimzi Cluster Health',
              layout: { column: 1, row: 1, width: 12, height: 3 },
              visualization: { id: 'viz.billboard' },
              rawConfiguration: {
                nrqlQueries: [
                  {
                    accountIds: [config.accountId],
                    query: "SELECT uniqueCount(displayName) AS 'Active Brokers' FROM KafkaBrokerSample WHERE clusterName LIKE '%strimzi%' SINCE 10 minutes ago"
                  },
                  {
                    accountIds: [config.accountId],
                    query: "SELECT uniqueCount(topic) AS 'Active Topics' FROM KafkaTopicSample WHERE clusterName LIKE '%strimzi%' SINCE 10 minutes ago"
                  },
                  {
                    accountIds: [config.accountId],
                    query: "SELECT sum(topic.underReplicatedPartitions) AS 'Under Replicated' FROM KafkaTopicSample WHERE clusterName LIKE '%strimzi%' SINCE 10 minutes ago"
                  },
                  {
                    accountIds: [config.accountId],
                    query: "SELECT average(consumer.totalLag) AS 'Avg Consumer Lag' FROM KafkaOffsetSample WHERE clusterName LIKE '%strimzi%' SINCE 10 minutes ago"
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
              title: 'Strimzi Broker Throughput',
              layout: { column: 1, row: 4, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(broker.messagesInPerSecond) AS 'Messages/sec', average(broker.IOInPerSecond)/1024/1024 AS 'MB In/sec', average(broker.IOOutPerSecond)/1024/1024 AS 'MB Out/sec' FROM KafkaBrokerSample WHERE clusterName LIKE '%strimzi%' TIMESERIES AUTO"
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
                  query: "SELECT average(request.avgTimeFetch) AS 'Fetch', average(request.avgTimeProduceRequest) AS 'Produce', average(request.avgTimeMetadata) AS 'Metadata' FROM KafkaBrokerSample WHERE clusterName LIKE '%strimzi%' TIMESERIES AUTO"
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
            
            // Replication Status
            {
              title: 'Replication Health',
              layout: { column: 1, row: 7, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT sum(replication.unreplicatedPartitions) AS 'Unreplicated Partitions', average(replication.isrExpandsPerSecond) AS 'ISR Expands/sec', average(replication.isrShrinksPerSecond) AS 'ISR Shrinks/sec' FROM KafkaBrokerSample WHERE clusterName LIKE '%strimzi%' TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            },
            
            // Failed Requests
            {
              title: 'Failed Request Rate',
              layout: { column: 7, row: 7, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT sum(request.clientFetchesFailedPerSecond) AS 'Failed Fetches/sec', sum(request.produceRequestsFailedPerSecond) AS 'Failed Produces/sec' FROM KafkaBrokerSample WHERE clusterName LIKE '%strimzi%' TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            },
            
            // Log Flush Rate
            {
              title: 'Log Flush Performance',
              layout: { column: 1, row: 10, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(broker.logFlushPerSecond) AS 'Log Flushes/sec' FROM KafkaBrokerSample WHERE clusterName LIKE '%strimzi%' TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            },
            
            // Network Rejection Rate
            {
              title: 'Network Bytes Rejected',
              layout: { column: 7, row: 10, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(net.bytesRejectedPerSecond)/1024/1024 AS 'MB Rejected/sec' FROM KafkaBrokerSample WHERE clusterName LIKE '%strimzi%' TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            }
          ]
        },
        {
          name: 'Broker Details',
          description: 'Individual broker performance in Strimzi cluster',
          widgets: [
            // Broker Status Table
            {
              title: 'Strimzi Broker Status',
              layout: { column: 1, row: 1, width: 12, height: 4 },
              visualization: { id: 'viz.table' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT latest(displayName) AS 'Broker', latest(broker.messagesInPerSecond) AS 'Messages/sec', latest(broker.IOInPerSecond)/1024/1024 AS 'MB In/sec', latest(broker.IOOutPerSecond)/1024/1024 AS 'MB Out/sec', latest(replication.unreplicatedPartitions) AS 'Unreplicated', latest(request.handlerIdle) AS 'Handler Idle %' FROM KafkaBrokerSample WHERE clusterName LIKE '%strimzi%' FACET displayName SINCE 10 minutes ago"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            },
            
            // Per-Broker Message Rate
            {
              title: 'Messages per Second by Broker',
              layout: { column: 1, row: 5, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(broker.messagesInPerSecond) FROM KafkaBrokerSample WHERE clusterName LIKE '%strimzi%' FACET displayName TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            },
            
            // Per-Broker Request Latency
            {
              title: 'Request Latency by Broker',
              layout: { column: 7, row: 5, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(request.avgTimeMetadata) FROM KafkaBrokerSample WHERE clusterName LIKE '%strimzi%' FACET displayName TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                },
                units: {
                  unit: 'MS'
                }
              }
            },
            
            // Leader Elections by Broker
            {
              title: 'Leader Elections by Broker',
              layout: { column: 1, row: 8, width: 12, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(replication.leaderElectionPerSecond) AS 'Leader Elections/sec', average(replication.uncleanLeaderElectionPerSecond) AS 'Unclean Elections/sec' FROM KafkaBrokerSample WHERE clusterName LIKE '%strimzi%' FACET displayName TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            }
          ]
        },
        {
          name: 'Topics & Partitions',
          description: 'Topic health and partition status',
          widgets: [
            // Topic Health Summary
            {
              title: 'Topic Health Status',
              layout: { column: 1, row: 1, width: 12, height: 4 },
              visualization: { id: 'viz.table' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT latest(topic) AS 'Topic', latest(topic.underReplicatedPartitions) AS 'Under Replicated', latest(topic.partitionsWithNonPreferredLeader) AS 'Non-Preferred Leaders', latest(topic.respondsToMetadataRequests) AS 'Metadata OK' FROM KafkaTopicSample WHERE clusterName LIKE '%strimzi%' FACET topic SINCE 10 minutes ago LIMIT 100"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            },
            
            // Topics with Issues
            {
              title: 'Topics with Replication Issues',
              layout: { column: 1, row: 5, width: 6, height: 3 },
              visualization: { id: 'viz.billboard' },
              rawConfiguration: {
                nrqlQueries: [
                  {
                    accountIds: [config.accountId],
                    query: "SELECT uniqueCount(topic) AS 'Topics with Under-Replicated Partitions' FROM KafkaTopicSample WHERE clusterName LIKE '%strimzi%' AND topic.underReplicatedPartitions > 0 SINCE 10 minutes ago"
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
                    },
                    {
                      value: 5,
                      alertSeverity: 'CRITICAL'
                    }
                  ]
                }
              }
            },
            
            // Topics with Non-Preferred Leaders
            {
              title: 'Topics with Non-Preferred Leaders',
              layout: { column: 7, row: 5, width: 6, height: 3 },
              visualization: { id: 'viz.billboard' },
              rawConfiguration: {
                nrqlQueries: [
                  {
                    accountIds: [config.accountId],
                    query: "SELECT uniqueCount(topic) AS 'Topics with Non-Preferred Leaders' FROM KafkaTopicSample WHERE clusterName LIKE '%strimzi%' AND topic.partitionsWithNonPreferredLeader > 0 SINCE 10 minutes ago"
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
            },
            
            // Under-Replicated Partitions Trend
            {
              title: 'Under-Replicated Partitions Trend',
              layout: { column: 1, row: 8, width: 12, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT sum(topic.underReplicatedPartitions) FROM KafkaTopicSample WHERE clusterName LIKE '%strimzi%' FACET topic TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            }
          ]
        },
        {
          name: 'Consumer Lag',
          description: 'Consumer group performance and lag monitoring',
          widgets: [
            // Consumer Group Summary
            {
              title: 'Consumer Group Lag Summary',
              layout: { column: 1, row: 1, width: 12, height: 4 },
              visualization: { id: 'viz.table' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT latest(consumerGroup) AS 'Consumer Group', latest(topic) AS 'Topic', max(consumer.lag) AS 'Max Partition Lag', sum(consumer.lag) AS 'Total Lag', latest(consumer.offset) AS 'Current Offset', latest(consumer.hwm) AS 'High Water Mark' FROM KafkaOffsetSample WHERE clusterName LIKE '%strimzi%' FACET consumerGroup, topic SINCE 10 minutes ago LIMIT 100"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            },
            
            // Consumer Lag Trend
            {
              title: 'Consumer Lag Trend by Group',
              layout: { column: 1, row: 5, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(consumer.lag) FROM KafkaOffsetSample WHERE clusterName LIKE '%strimzi%' FACET consumerGroup TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            },
            
            // Max Lag by Consumer Group
            {
              title: 'Maximum Lag by Consumer Group',
              layout: { column: 7, row: 5, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT max(consumerGroup.maxLag) FROM KafkaOffsetSample WHERE clusterName LIKE '%strimzi%' FACET consumerGroup TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            },
            
            // Total Lag Across All Groups
            {
              title: 'Total Consumer Lag',
              layout: { column: 1, row: 8, width: 12, height: 3 },
              visualization: { id: 'viz.area' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT sum(consumer.totalLag) FROM KafkaOffsetSample WHERE clusterName LIKE '%strimzi%' FACET consumerGroup TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            }
          ]
        },
        {
          name: 'Performance Analysis',
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
                  query: "SELECT average(request.avgTimeMetadata) AS 'Metadata Avg', average(request.avgTimeMetadata99Percentile) AS 'Metadata p99', average(request.fetchTime99Percentile) AS 'Fetch p99', average(request.produceTime99Percentile) AS 'Produce p99' FROM KafkaBrokerSample WHERE clusterName LIKE '%strimzi%' TIMESERIES AUTO"
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
              title: 'Broker Handler Utilization',
              layout: { column: 7, row: 1, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(request.handlerIdle) AS 'Handler Idle %', 100 - average(request.handlerIdle) AS 'Handler Busy %' FROM KafkaBrokerSample WHERE clusterName LIKE '%strimzi%' TIMESERIES AUTO"
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
            
            // Request Queue Performance
            {
              title: 'Request Queue Performance',
              layout: { column: 1, row: 4, width: 12, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(request.avgTimeUpdateMetadata) AS 'Update Metadata', average(request.avgTimeUpdateMetadata99Percentile) AS 'Update Metadata p99', average(request.avgTimeMetadata) AS 'Metadata', average(request.avgTimeFetch) AS 'Fetch', average(request.avgTimeProduceRequest) AS 'Produce' FROM KafkaBrokerSample WHERE clusterName LIKE '%strimzi%' TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                },
                units: {
                  unit: 'MS'
                }
              }
            },
            
            // Request Rates
            {
              title: 'Request Rates by Type',
              layout: { column: 1, row: 7, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(request.fetchConsumerRequestsPerSecond) AS 'Fetch Requests/sec', average(request.produceRequestsPerSecond) AS 'Produce Requests/sec', average(request.metadataRequestsPerSecond) AS 'Metadata Requests/sec', average(request.offsetCommitRequestsPerSecond) AS 'Offset Commits/sec' FROM KafkaBrokerSample WHERE clusterName LIKE '%strimzi%' TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            },
            
            // Expired Requests
            {
              title: 'Expired Requests',
              layout: { column: 7, row: 7, width: 6, height: 3 },
              visualization: { id: 'viz.line' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT average(consumer.requestsExpiredPerSecond) AS 'Consumer Requests Expired/sec', average(follower.requestExpirationPerSecond) AS 'Follower Requests Expired/sec' FROM KafkaBrokerSample WHERE clusterName LIKE '%strimzi%' TIMESERIES AUTO"
                }],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            }
          ]
        },
        {
          name: 'MSK Compatibility',
          description: 'MSK-compatible metrics if available',
          widgets: [
            // MSK Entity Check
            {
              title: 'MSK Entity Availability',
              layout: { column: 1, row: 1, width: 12, height: 3 },
              visualization: { id: 'viz.billboard' },
              rawConfiguration: {
                nrqlQueries: [
                  {
                    accountIds: [config.accountId],
                    query: "SELECT count(*) AS 'AwsMskClusterSample' FROM AwsMskClusterSample SINCE 1 hour ago"
                  },
                  {
                    accountIds: [config.accountId],
                    query: "SELECT count(*) AS 'AwsMskBrokerSample' FROM AwsMskBrokerSample SINCE 1 hour ago"
                  },
                  {
                    accountIds: [config.accountId],
                    query: "SELECT count(*) AS 'AwsMskTopicSample' FROM AwsMskTopicSample SINCE 1 hour ago"
                  }
                ],
                platformOptions: {
                  ignoreTimeRange: false
                }
              }
            },
            
            // MSK-Style Metrics from KafkaBrokerSample
            {
              title: 'MSK-Compatible Broker Metrics',
              layout: { column: 1, row: 4, width: 12, height: 3 },
              visualization: { id: 'viz.table' },
              rawConfiguration: {
                nrqlQueries: [{
                  accountIds: [config.accountId],
                  query: "SELECT latest(clusterName) AS 'Cluster', latest(displayName) AS 'Broker', latest(broker.messagesInPerSecond) AS 'Messages/sec', latest(broker.IOInPerSecond)/1024/1024 AS 'MB In/sec', latest(broker.IOOutPerSecond)/1024/1024 AS 'MB Out/sec' FROM KafkaBrokerSample WHERE clusterName LIKE '%strimzi%' FACET entityGuid SINCE 10 minutes ago"
                }],
                platformOptions: {
                  ignoreTimeRange: false
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
    
    spinner.succeed('Strimzi Kafka Dashboard deployed successfully!');
    console.log(`\n🎉 Dashboard GUID: ${chalk.cyan(result.guid)}`);
    console.log(`📊 View at: ${chalk.blue(`https://one.newrelic.com/dashboards/detail/${result.guid}?account=${config.accountId}`)}`);
    
    // Save deployment info
    const fs = require('fs').promises;
    await fs.writeFile(
      'strimzi-kafka-dashboard-info.json',
      JSON.stringify({
        guid: result.guid,
        name: dashboard.name,
        deployedAt: new Date().toISOString(),
        accountId: config.accountId,
        dashboardUrl: `https://one.newrelic.com/dashboards/detail/${result.guid}?account=${config.accountId}`,
        pages: dashboard.pages.length,
        widgets: dashboard.pages.reduce((sum, page) => sum + page.widgets.length, 0),
        description: 'Comprehensive Strimzi Kafka monitoring with broker health, topics, consumer lag, and performance metrics'
      }, null, 2)
    );
    
    console.log('\n✅ Deployment info saved to: strimzi-kafka-dashboard-info.json');
    console.log(`📈 Dashboard contains ${dashboard.pages.length} pages with ${dashboard.pages.reduce((sum, page) => sum + page.widgets.length, 0)} widgets total`);
    
    // Provide summary
    console.log(chalk.blue('\n=== Dashboard Pages ==='));
    dashboard.pages.forEach(page => {
      console.log(`- ${page.name}: ${page.widgets.length} widgets`);
    });
    
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
deployStrimziKafkaDashboard();