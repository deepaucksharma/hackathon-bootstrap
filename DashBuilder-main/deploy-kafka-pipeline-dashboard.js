#!/usr/bin/env node

/**
 * Deploy Kafka Pipeline Comparison Dashboard using DashBuilder
 */

require('dotenv').config();
const { createDashboardBuilder } = require('./src');
const ora = require('ora');
const chalk = require('chalk');

async function deployDashboard() {
  const config = {
    accountId: parseInt(process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID || '3630072'),
    apiKey: process.env.UKEY || process.env.NEW_RELIC_API_KEY,
    region: process.env.NEW_RELIC_REGION || 'US'
  };
  
  if (!config.apiKey) {
    console.error(chalk.red('Missing API key. Please set UKEY or NEW_RELIC_API_KEY environment variable'));
    process.exit(1);
  }
  
  const spinner = ora('Deploying Kafka Pipeline Comparison dashboard...').start();
  
  try {
    // Create the dashboard structure
    const dashboard = {
      name: 'Kafka Monitoring: Standard vs Custom Pipeline Comparison',
      description: 'Side-by-side comparison of standard and custom nri-kafka pipelines with hackathon-bootstrap enhancements',
      permissions: 'PUBLIC_READ_WRITE',
      pages: [{
        name: 'Pipeline Comparison',
        widgets: [
          // Pipeline Metrics Collection Status
          {
            title: 'Pipeline Metrics Collection Status',
            layout: { column: 1, row: 1, width: 12, height: 3 },
            visualization: { id: 'viz.billboard' },
            rawConfiguration: {
              nrqlQueries: [
                {
                  accountIds: [config.accountId],
                  query: "FROM KafkaBrokerSample SELECT count(*) AS 'Standard Pipeline' WHERE clusterName = 'kafka-k8s-cluster' AND pipeline IS NULL SINCE 30 minutes ago"
                },
                {
                  accountIds: [config.accountId],
                  query: "FROM KafkaBrokerSample SELECT count(*) AS 'Custom Pipeline' WHERE pipeline = 'custom' SINCE 30 minutes ago"
                },
                {
                  accountIds: [config.accountId],
                  query: "FROM KafkaTopicSample SELECT count(*) AS 'Topic Samples' WHERE pipeline = 'custom' SINCE 30 minutes ago"
                }
              ],
              platformOptions: { ignoreTimeRange: false }
            }
          },
          
          // Broker Metrics Over Time
          {
            title: 'Broker Metrics Over Time',
            layout: { column: 1, row: 4, width: 6, height: 3 },
            visualization: { id: 'viz.line' },
            rawConfiguration: {
              nrqlQueries: [{
                accountIds: [config.accountId],
                query: "FROM KafkaBrokerSample SELECT count(*) WHERE clusterName = 'kafka-k8s-cluster' FACET cases(WHERE pipeline IS NOT NULL AS pipeline, WHERE pipeline IS NULL AS 'standard') TIMESERIES AUTO"
              }],
              platformOptions: { ignoreTimeRange: false }
            }
          },
          
          // Messages In Per Second
          {
            title: 'Messages In Per Second',
            layout: { column: 7, row: 4, width: 6, height: 3 },
            visualization: { id: 'viz.line' },
            rawConfiguration: {
              nrqlQueries: [{
                accountIds: [config.accountId],
                query: "FROM KafkaBrokerSample SELECT average(broker.messagesInPerSecond) FACET cases(WHERE pipeline IS NOT NULL AS pipeline, WHERE pipeline IS NULL AS 'standard') TIMESERIES AUTO"
              }],
              platformOptions: { ignoreTimeRange: false }
            }
          },
          
          // Available Metrics by Pipeline
          {
            title: 'Available Metrics by Pipeline',
            layout: { column: 1, row: 7, width: 12, height: 4 },
            visualization: { id: 'viz.table' },
            rawConfiguration: {
              nrqlQueries: [{
                accountIds: [config.accountId],
                query: "FROM KafkaBrokerSample SELECT uniques(metricName) AS 'Available Metrics', count(*) AS 'Sample Count' FACET cases(WHERE pipeline IS NOT NULL AS pipeline, WHERE pipeline IS NULL AS 'standard') SINCE 30 minutes ago"
              }],
              platformOptions: { ignoreTimeRange: false }
            }
          },
          
          // IO Throughput Comparison
          {
            title: 'IO Throughput Comparison',
            layout: { column: 1, row: 11, width: 6, height: 3 },
            visualization: { id: 'viz.line' },
            rawConfiguration: {
              nrqlQueries: [{
                accountIds: [config.accountId],
                query: "FROM KafkaBrokerSample SELECT average(broker.IOInPerSecond) AS 'Bytes In', average(broker.IOOutPerSecond) AS 'Bytes Out' WHERE pipeline = 'custom' TIMESERIES AUTO"
              }],
              platformOptions: { ignoreTimeRange: false }
            }
          },
          
          // Replication Health
          {
            title: 'Replication Health',
            layout: { column: 7, row: 11, width: 6, height: 3 },
            visualization: { id: 'viz.billboard' },
            rawConfiguration: {
              nrqlQueries: [{
                accountIds: [config.accountId],
                query: "FROM KafkaBrokerSample SELECT latest(replication.unreplicatedPartitions) AS 'Unreplicated Partitions', latest(replication.isrExpandsPerSecond) AS 'ISR Expands/sec' WHERE pipeline = 'custom' SINCE 5 minutes ago"
              }],
              platformOptions: { ignoreTimeRange: false }
            }
          },
          
          // Enhanced V2 Metrics Status
          {
            title: 'Enhanced V2 Metrics Status',
            layout: { column: 1, row: 14, width: 12, height: 3 },
            visualization: { id: 'viz.billboard' },
            rawConfiguration: {
              nrqlQueries: [
                {
                  accountIds: [config.accountId],
                  query: "FROM KafkaBrokerSample SELECT count(*) AS 'BytesOutPerSec by Topic' WHERE metricName LIKE '%BytesOutPerSec%' AND pipeline = 'custom' SINCE 30 minutes ago"
                },
                {
                  accountIds: [config.accountId],
                  query: "FROM KafkaBrokerSample SELECT count(*) AS 'MessagesInPerSec by Topic' WHERE metricName LIKE '%MessagesInPerSec%' AND pipeline = 'custom' SINCE 30 minutes ago"
                },
                {
                  accountIds: [config.accountId],
                  query: "FROM KafkaBrokerSample SELECT count(*) AS 'Controller Metrics' WHERE metricName LIKE '%Controller%' AND pipeline = 'custom' SINCE 30 minutes ago"
                }
              ],
              platformOptions: { ignoreTimeRange: false }
            }
          },
          
          // Topic Metrics Collection
          {
            title: 'Topic Metrics Collection',
            layout: { column: 1, row: 17, width: 12, height: 4 },
            visualization: { id: 'viz.table' },
            rawConfiguration: {
              nrqlQueries: [{
                accountIds: [config.accountId],
                query: "FROM KafkaTopicSample SELECT count(*) AS 'Samples', latest(topic.partitionsWithNonPreferredLeader) AS 'Non-Preferred Leaders', latest(topic.underReplicatedPartitions) AS 'Under Replicated' FACET topic.name WHERE pipeline = 'custom' SINCE 30 minutes ago LIMIT 20"
              }],
              platformOptions: { ignoreTimeRange: false }
            }
          }
        ]
      }]
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
      'kafka-pipeline-deployment-info.json',
      JSON.stringify({
        guid: result.guid,
        deployedAt: new Date().toISOString(),
        accountId: config.accountId,
        dashboardUrl: `https://one.newrelic.com/dashboards/detail/${result.guid}?account=${config.accountId}`
      }, null, 2)
    );
    
    console.log('\n✅ Deployment info saved to: kafka-pipeline-deployment-info.json');
    
  } catch (error) {
    spinner.fail('Deployment failed');
    console.error(chalk.red('Error:'), error.message);
    if (error.response?.data) {
      console.error(chalk.red('Details:'), JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

deployDashboard();