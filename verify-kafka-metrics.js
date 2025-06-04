#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');

// Configuration
const CONFIG = {
  apiKey: process.env.NRAK_API_KEY || process.argv[2],
  accountId: process.env.ACC || process.argv[3],
  clusterName: process.env.CLUSTER_NAME || process.argv[4] || null,
  timeRange: process.env.TIME_RANGE || '1 hour ago',
  maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
  concurrency: parseInt(process.env.CONCURRENCY) || 5,
  outputFormat: process.env.OUTPUT_FORMAT || 'all', // console, json, html, markdown, all
  categories: process.env.CATEGORIES?.split(',') || 'all',
  verbose: process.env.VERBOSE === 'true',
  batchSize: parseInt(process.env.BATCH_SIZE) || 10
};

// Query Catalog - All queries from METRICS_VERIFICATION_GUIDE.md
const QUERY_CATALOG = {
  'MSK Polling Data': {
    description: 'Verify AWS MSK polling data is being collected',
    queries: [
      {
        id: '1.1',
        name: 'Cluster Sample Data Exists',
        query: 'SELECT count(*) FROM AwsMskClusterSample SINCE {timeRange}',
        critical: true
      },
      {
        id: '1.2',
        name: 'All Cluster Metrics Present',
        query: `SELECT 
          count(provider.activeControllerCount.Sum) as 'Has Active Controller Count',
          count(provider.offlinePartitionsCount.Sum) as 'Has Offline Partitions Count',
          count(provider.globalPartitionCount.Average) as 'Has Global Partition Count'
        FROM AwsMskClusterSample SINCE {timeRange}`,
        critical: true
      },
      {
        id: '1.3',
        name: 'Broker Sample Data Exists',
        query: 'SELECT count(*) FROM AwsMskBrokerSample SINCE {timeRange}',
        critical: true
      },
      {
        id: '1.4',
        name: 'All Broker Metrics Present',
        query: `SELECT 
          count(provider.bytesInPerSec.Average) as 'Has Bytes In',
          count(provider.bytesOutPerSec.Average) as 'Has Bytes Out',
          count(provider.messagesInPerSec.Average) as 'Has Messages In',
          count(provider.messagesOutPerSec.Average) as 'Has Messages Out'
        FROM AwsMskBrokerSample SINCE {timeRange}`,
        critical: true
      },
      {
        id: '1.5',
        name: 'Topic Sample Data Exists',
        query: 'SELECT count(*) FROM AwsMskTopicSample SINCE {timeRange}',
        critical: false
      },
      {
        id: '1.6',
        name: 'Topic Metrics Present',
        query: `SELECT 
          count(provider.bytesInPerSec.Sum) as 'Has Bytes In',
          count(provider.bytesOutPerSec.Sum) as 'Has Bytes Out'
        FROM AwsMskTopicSample SINCE {timeRange}`,
        critical: false
      },
      {
        id: '1.7',
        name: 'Cluster Attributes Present',
        query: `SELECT 
          count(provider.clusterName) as 'Has Cluster Name',
          count(entity.guid) as 'Has Entity GUID',
          count(entityName) as 'Has Entity Name'
        FROM AwsMskClusterSample SINCE {timeRange}`,
        critical: true
      },
      {
        id: '1.8',
        name: 'Broker Attributes Present',
        query: `SELECT 
          count(provider.clusterName) as 'Has Cluster Name',
          count(provider.brokerId) as 'Has Broker ID',
          count(entity.guid) as 'Has Entity GUID'
        FROM AwsMskBrokerSample SINCE {timeRange}`,
        critical: true
      },
      {
        id: '1.9',
        name: 'Topic Attributes Present',
        query: `SELECT 
          count(provider.topic) as 'Has Topic Name',
          count(displayName) as 'Has Display Name',
          count(entity.guid) as 'Has Entity GUID'
        FROM AwsMskTopicSample SINCE {timeRange}`,
        critical: false
      }
    ]
  },
  'Metric Streams Data': {
    description: 'Verify AWS Metric Streams data is flowing',
    queries: [
      {
        id: '2.1',
        name: 'Metric Events Exist',
        query: "SELECT count(*) FROM Metric WHERE metricName LIKE 'newrelic.goldenmetrics%' OR metricName LIKE 'kafka%' SINCE {timeRange}",
        critical: false
      },
      {
        id: '2.2',
        name: 'Cluster-Level Metrics',
        query: `SELECT 
          filter(count(*), WHERE metricName = 'aws.kafka.ActiveControllerCount') as 'Active Controller',
          filter(count(*), WHERE metricName = 'aws.kafka.OfflinePartitionsCount') as 'Offline Partitions',
          filter(count(*), WHERE metricName = 'aws.kafka.GlobalPartitionCount') as 'Global Partitions'
        FROM Metric WHERE metricName LIKE 'aws.kafka%' SINCE {timeRange}`,
        critical: false
      },
      {
        id: '2.3',
        name: 'Broker-Level Metrics',
        query: `SELECT 
          filter(count(*), WHERE metricName = 'aws.kafka.BytesInPerSec.byBroker') as 'Broker Bytes In',
          filter(count(*), WHERE metricName = 'aws.kafka.BytesOutPerSec.byBroker') as 'Broker Bytes Out',
          filter(count(*), WHERE metricName = 'aws.kafka.UnderReplicatedPartitions') as 'Under Replicated'
        FROM Metric WHERE metricName LIKE 'aws.kafka%' SINCE {timeRange}`,
        critical: false
      },
      {
        id: '2.4',
        name: 'Topic-Level Metrics',
        query: `SELECT 
          filter(count(*), WHERE metricName = 'aws.kafka.BytesInPerSec.byTopic') as 'Topic Bytes In',
          filter(count(*), WHERE metricName = 'aws.kafka.BytesOutPerSec.byTopic') as 'Topic Bytes Out'
        FROM Metric WHERE metricName LIKE 'aws.kafka%' SINCE {timeRange}`,
        critical: false
      },
      {
        id: '2.5',
        name: 'Metric Streams Attributes',
        query: `SELECT 
          count(aws.kafka.ClusterName OR aws.msk.clusterName) as 'Has Cluster Name',
          count(aws.kafka.BrokerID OR aws.msk.brokerId) as 'Has Broker ID',
          count(aws.kafka.Topic OR aws.msk.topic) as 'Has Topic Name'
        FROM Metric WHERE metricName LIKE 'aws.kafka%' SINCE {timeRange}`,
        critical: false
      }
    ]
  },
  'Standard Kafka Integration': {
    description: 'Verify standard Kafka integration metrics',
    queries: [
      {
        id: '3.1',
        name: 'Broker Sample Data',
        query: 'SELECT count(*) FROM KafkaBrokerSample SINCE {timeRange}',
        critical: false
      },
      {
        id: '3.2',
        name: 'Topic Sample Data',
        query: 'SELECT count(*) FROM KafkaTopicSample SINCE {timeRange}',
        critical: false
      },
      {
        id: '3.3',
        name: 'Offset Sample Data',
        query: 'SELECT count(*) FROM KafkaOffsetSample SINCE {timeRange}',
        critical: false
      },
      {
        id: '3.4',
        name: 'Producer Sample Data',
        query: 'SELECT count(*) FROM KafkaProducerSample SINCE {timeRange}',
        critical: false
      },
      {
        id: '3.5',
        name: 'Consumer Sample Data',
        query: 'SELECT count(*) FROM KafkaConsumerSample SINCE {timeRange}',
        critical: false
      }
    ]
  },
  'Data Quality': {
    description: 'Check data quality and completeness',
    queries: [
      {
        id: '4.1',
        name: 'Check for Null Values',
        query: `SELECT 
          count(*) as 'Total Records',
          filter(count(*), WHERE provider.activeControllerCount.Sum IS NULL) as 'Null Active Controllers',
          filter(count(*), WHERE provider.offlinePartitionsCount.Sum IS NULL) as 'Null Offline Partitions',
          filter(count(*), WHERE provider.clusterName IS NULL) as 'Null Cluster Names'
        FROM AwsMskClusterSample 
        SINCE {timeRange}`,
        critical: false
      },
      {
        id: '4.2',
        name: 'Data Freshness (Polling)',
        query: `SELECT 
          count(*) as 'Recent Samples',
          latest(timestamp) as 'Last Data Point',
          120 as 'Age in Seconds'
        FROM AwsMskClusterSample 
        SINCE 5 minutes ago
        FACET provider.clusterName`,
        critical: true
      },
      {
        id: '4.3',
        name: 'Data Freshness (Metric Streams)',
        query: `SELECT 
          count(*) as 'Recent Samples',
          latest(timestamp) as 'Last Data Point',
          180 as 'Age in Seconds'
        FROM Metric 
        WHERE metricName LIKE 'newrelic.goldenmetrics.infra.kafkabroker%'
        SINCE 5 minutes ago
        FACET entity.name`,
        critical: false
      },
      {
        id: '4.4',
        name: 'Tag Completeness',
        query: `SELECT 
          count(*) as 'Total Records',
          filter(count(*), WHERE environment IS NOT NULL) as 'Has Environment Tag',
          filter(count(*), WHERE label.env IS NOT NULL) as 'Has Environment Label',
          filter(count(*), WHERE label.cluster IS NOT NULL) as 'Has Cluster Label',
          filter(count(*), WHERE label.integration IS NOT NULL) as 'Has Integration Label'
        FROM AwsMskClusterSample 
        FACET provider.clusterName
        SINCE {timeRange}`,
        critical: false
      },
      {
        id: '4.5',
        name: 'Data Consistency Check',
        query: 'SELECT uniqueCount(provider.clusterName) as `Clusters in ClusterSample` FROM AwsMskClusterSample SINCE {timeRange}',
        critical: false
      }
    ]
  },
  'Throughput Calculations': {
    description: 'Verify throughput metric calculations',
    queries: [
      {
        id: '5.1',
        name: 'Cluster Throughput Summary',
        query: `SELECT 
          sum(provider.bytesInPerSec.Average) as 'Total Bytes In/Sec',
          sum(provider.bytesOutPerSec.Average) as 'Total Bytes Out/Sec',
          sum(provider.messagesInPerSec.Average) as 'Total Messages In/Sec'
        FROM AwsMskBrokerSample 
        FACET provider.clusterName
        SINCE {timeRange}`,
        critical: false
      },
      {
        id: '5.2',
        name: 'Throughput Aggregation',
        query: `SELECT sum(bytesInPerSec) as 'Total Incoming', sum(bytesOutPerSec) as 'Total Outgoing'
        FROM (
          SELECT average(provider.bytesInPerSec.Average) as 'bytesInPerSec',
                 average(provider.bytesOutPerSec.Average) as 'bytesOutPerSec'
          FROM AwsMskBrokerSample
          FACET provider.clusterName as cluster, provider.brokerId
          LIMIT MAX
        ) SINCE {timeRange}`,
        critical: false
      },
      {
        id: '5.3',
        name: 'Topic Throughput',
        query: `SELECT 
          latest(provider.bytesInPerSec.Sum) OR 0 AS 'Bytes In/Sec',
          latest(provider.bytesOutPerSec.Sum) OR 0 AS 'Bytes Out/Sec'
        FROM AwsMskTopicSample
        FACET displayName
        SINCE {timeRange}
        LIMIT 10`,
        critical: false
      },
      {
        id: '5.4',
        name: 'Message Rates',
        query: `SELECT sum(provider.messagesInPerSec.Average) as 'Total Messages In'
        FROM AwsMskBrokerSample SINCE {timeRange}`,
        critical: false
      }
    ]
  },
  'Entity Relationships': {
    description: 'Verify entity relationships are established',
    queries: [
      {
        id: '6.1',
        name: 'Brokers per Cluster',
        query: `SELECT uniqueCount(provider.brokerId) as 'Broker Count'
        FROM AwsMskBrokerSample 
        FACET provider.clusterName
        SINCE {timeRange}`,
        critical: false
      },
      {
        id: '6.2',
        name: 'Topics per Cluster',
        query: `SELECT uniqueCount(displayName) as 'Topic Count'
        FROM AwsMskTopicSample
        FACET provider.clusterName
        SINCE {timeRange}`,
        critical: false
      },
      {
        id: '6.3',
        name: 'Entity GUIDs Present',
        query: `SELECT 
          count(entity.guid) as 'Total Entity GUIDs',
          uniqueCount(entity.guid) as 'Unique Entity GUIDs'
        FROM AwsMskBrokerSample
        SINCE {timeRange}`,
        critical: false
      }
    ]
  },
  'Health Metrics': {
    description: 'Verify health status calculations',
    queries: [
      {
        id: '7.1',
        name: 'Cluster Health Status',
        query: `SELECT 
          latest(provider.activeControllerCount.Sum) as 'Active Controllers',
          latest(provider.offlinePartitionsCount.Sum) as 'Offline Partitions'
        FROM AwsMskClusterSample
        FACET provider.clusterName
        SINCE {timeRange}`,
        critical: true
      },
      {
        id: '7.2',
        name: 'Broker Health Status',
        query: `SELECT 
          latest(provider.bytesInPerSec.Average) as 'Bytes In Rate',
          latest(provider.bytesOutPerSec.Average) as 'Bytes Out Rate',
          latest(provider.messagesInPerSec.Average) as 'Message Rate'
        FROM AwsMskBrokerSample
        FACET provider.clusterName, provider.brokerId
        SINCE {timeRange}
        LIMIT 20`,
        critical: false
      },
      {
        id: '7.3',
        name: 'Unhealthy Cluster Count',
        query: `SELECT 
          uniqueCount(entity.guid) as 'Total',
          filter(uniqueCount(entity.guid), WHERE provider.offlinePartitionsCount.Sum > 0) as 'Unhealthy'
        FROM AwsMskClusterSample SINCE {timeRange}`,
        critical: true
      }
    ]
  },
  'Time Series Data': {
    description: 'Verify time series data for charting',
    queries: [
      {
        id: '8.1',
        name: 'Throughput Time Series',
        query: `SELECT sum(provider.bytesInPerSec.Average) as 'Incoming Throughput'
        FROM AwsMskBrokerSample
        FACET provider.clusterName
        TIMESERIES 5 minutes
        SINCE {timeRange}`,
        critical: false
      },
      {
        id: '8.2',
        name: 'Message Rate Time Series',
        query: `SELECT sum(provider.messagesInPerSec.Average) as 'Message Rate'
        FROM AwsMskBrokerSample
        TIMESERIES 5 minutes
        SINCE {timeRange}`,
        critical: false
      },
      {
        id: '8.3',
        name: 'Partition Count Trend',
        query: `SELECT average(provider.globalPartitionCount.Average) as 'Partitions'
        FROM AwsMskClusterSample
        TIMESERIES 10 minutes
        SINCE {timeRange}`,
        critical: false
      }
    ]
  },
  'Account Aggregation': {
    description: 'Verify account-level aggregations',
    queries: [
      {
        id: '9.1',
        name: 'Account Summary',
        query: `SELECT 
          uniqueCount(entity.guid) as 'Cluster Count',
          uniqueCount(provider.clusterName) as 'Named Cluster Count'
        FROM AwsMskClusterSample
        SINCE {timeRange}`,
        critical: false
      },
      {
        id: '9.2',
        name: 'Account Health Summary',
        query: `SELECT 
          uniqueCount(entity.guid) as 'Total Clusters',
          filter(uniqueCount(entity.guid), WHERE provider.offlinePartitionsCount.Sum > 0) as 'Unhealthy Clusters'
        FROM AwsMskClusterSample SINCE {timeRange}`,
        critical: false
      }
    ]
  },
  'Performance Metrics': {
    description: 'Check query performance and scale',
    queries: [
      {
        id: '10.1',
        name: 'Data Volume Check',
        query: `SELECT 
          filter(count(*), WHERE eventType() = 'AwsMskClusterSample') as 'Cluster Events',
          filter(count(*), WHERE eventType() = 'AwsMskBrokerSample') as 'Broker Events',
          filter(count(*), WHERE eventType() = 'AwsMskTopicSample') as 'Topic Events'
        FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
        SINCE {timeRange}`,
        critical: false
      },
      {
        id: '10.2',
        name: 'Large Dataset Check',
        query: `SELECT 
          uniqueCount(displayName) as 'Topic Count',
          count(*) as 'Total Events'
        FROM AwsMskTopicSample
        FACET provider.clusterName
        SINCE {timeRange}
        LIMIT 5`,
        critical: false
      }
    ]
  },
  'Edge Cases': {
    description: 'Check edge cases and error conditions',
    queries: [
      {
        id: '11.1',
        name: 'Idle Topics',
        query: `SELECT 
          count(*) as 'Total Topics',
          average(provider.bytesInPerSec.Sum) as 'Avg Bytes In',
          average(provider.bytesOutPerSec.Sum) as 'Avg Bytes Out'
        FROM AwsMskTopicSample
        SINCE {timeRange}`,
        critical: false
      },
      {
        id: '11.2',
        name: 'Stale Data Detection',
        query: `SELECT 
          count(*) as 'Total Samples',
          max(timestamp) as 'Latest Timestamp',
          min(timestamp) as 'Earliest Timestamp'
        FROM AwsMskClusterSample
        FACET provider.clusterName
        SINCE {timeRange}`,
        critical: false
      },
      {
        id: '11.3',
        name: 'Partial Data Check',
        query: `SELECT 
          count(*) as 'Total Topics',
          filter(count(*), WHERE provider.bytesInPerSec.Sum IS NULL) as 'Missing Bytes In',
          filter(count(*), WHERE provider.bytesOutPerSec.Sum IS NULL) as 'Missing Bytes Out'
        FROM AwsMskTopicSample
        SINCE {timeRange}`,
        critical: false
      }
    ]
  },
  'Top N Analysis': {
    description: 'Top N queries for dashboards',
    queries: [
      {
        id: '12.1',
        name: 'Top 10 Topics by Throughput',
        query: `SELECT 
          count(*) as 'Sample Count',
          average(provider.bytesInPerSec.Sum) as 'Avg Bytes In'
        FROM AwsMskTopicSample
        FACET displayName
        SINCE {timeRange}
        LIMIT 10`,
        critical: false
      },
      {
        id: '12.2',
        name: 'Top 5 Clusters by Size',
        query: `SELECT 
          uniqueCount(provider.brokerId) as 'Broker Count',
          uniqueCount(displayName) as 'Topic Count'
        FROM AwsMskBrokerSample, AwsMskTopicSample
        WHERE provider.clusterName IS NOT NULL
        FACET provider.clusterName
        SINCE {timeRange}
        LIMIT 5`,
        critical: false
      }
    ]
  },
  'Confluent Cloud Compatibility': {
    description: 'Check Confluent Cloud metric patterns',
    queries: [
      {
        id: '13.1',
        name: 'Common Throughput Pattern',
        query: `SELECT 
          count(provider.bytesInPerSec.Average) as 'Has Bytes In',
          count(provider.bytesOutPerSec.Average) as 'Has Bytes Out'
        FROM AwsMskBrokerSample SINCE {timeRange}`,
        critical: false
      },
      {
        id: '13.2',
        name: 'Common Message Pattern',
        query: `SELECT 
          count(provider.messagesInPerSec.Average) as 'Has Messages In',
          count(provider.messagesOutPerSec.Average) as 'Has Messages Out'
        FROM AwsMskBrokerSample SINCE {timeRange}`,
        critical: false
      }
    ]
  },
  'Filter Validation': {
    description: 'Verify filter options work correctly',
    queries: [
      {
        id: '14.1',
        name: 'Available Clusters',
        query: 'SELECT count(*) as `Total Samples` FROM AwsMskClusterSample SINCE {timeRange}',
        critical: false
      },
      {
        id: '14.2',
        name: 'Available Topics',
        query: 'SELECT count(*) as `Total Samples` FROM AwsMskTopicSample SINCE {timeRange}',
        critical: false
      }
    ]
  },
  'Metric Calculations': {
    description: 'Verify metric calculations and aggregations',
    queries: [
      {
        id: '15.1',
        name: 'Throughput Range',
        query: `SELECT 
          min(provider.bytesInPerSec.Average) as 'Min Throughput',
          max(provider.bytesInPerSec.Average) as 'Max Throughput',
          average(provider.bytesInPerSec.Average) as 'Avg Throughput'
        FROM AwsMskBrokerSample
        FACET provider.clusterName
        SINCE {timeRange}`,
        critical: false
      },
      {
        id: '15.2',
        name: 'Percentage Calculations',
        query: `SELECT 
          uniqueCount(entity.guid) as 'Total',
          filter(uniqueCount(entity.guid), WHERE provider.offlinePartitionsCount.Sum > 0) as 'Unhealthy',
          100.0 * filter(uniqueCount(entity.guid), WHERE provider.offlinePartitionsCount.Sum > 0) / uniqueCount(entity.guid) as 'Unhealthy %'
        FROM AwsMskClusterSample SINCE {timeRange}`,
        critical: false
      }
    ]
  },
  'Summary Verification': {
    description: 'Final comprehensive verification',
    queries: [
      {
        id: '16.1',
        name: 'Complete Data Check',
        query: `SELECT 
          filter(count(*), WHERE eventType() = 'AwsMskClusterSample') as 'Has Cluster Data',
          filter(count(*), WHERE eventType() = 'AwsMskBrokerSample') as 'Has Broker Data',
          filter(count(*), WHERE eventType() = 'AwsMskTopicSample') as 'Has Topic Data',
          min(timestamp) as 'Oldest Data',
          max(timestamp) as 'Newest Data',
          max(timestamp) as 'Newest Data'
        FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
        SINCE {timeRange}`,
        critical: true
      }
    ]
  },
  'Standard vs MSK Comparison': {
    description: 'Compare standard Kafka vs MSK shim metrics',
    queries: [
      {
        id: '17.1',
        name: 'Entity Count Comparison',
        query: `SELECT 
          filter(uniqueCount(entityName), WHERE eventType() = 'KafkaBrokerSample') as 'Standard Brokers',
          filter(uniqueCount(entityName), WHERE eventType() = 'AwsMskBrokerSample') as 'MSK Brokers'
        FROM KafkaBrokerSample, AwsMskBrokerSample SINCE {timeRange}`,
        critical: false
      },
      {
        id: '17.2',
        name: 'Metric Coverage Comparison',
        query: `SELECT 
          filter(count(*), WHERE eventType() = 'KafkaTopicSample') as 'Standard Topic Events',
          filter(count(*), WHERE eventType() = 'AwsMskTopicSample') as 'MSK Topic Events'
        FROM KafkaTopicSample, AwsMskTopicSample SINCE {timeRange}`,
        critical: false
      }
    ]
  }
};

// NerdGraph Client with batching support
class NerdGraphClient {
  constructor(apiKey, accountId) {
    this.apiKey = apiKey;
    this.accountId = accountId;
    this.endpoint = 'https://api.newrelic.com/graphql';
  }

  async executeQuery(nrql, variables = {}) {
    const graphqlQuery = `
      query($accountId: Int!, $nrqlQuery: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrqlQuery) {
              results
              metadata {
                timeWindow {
                  begin
                  end
                }
                eventTypes
              }
            }
          }
        }
      }
    `;

    const requestBody = JSON.stringify({
      query: graphqlQuery,
      variables: {
        accountId: parseInt(this.accountId),
        nrqlQuery: nrql
      }
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': this.apiKey
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(this.endpoint, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.errors) {
              const error = new Error(result.errors[0].message);
              error.statusCode = res.statusCode;
              error.isAuthError = res.statusCode === 401 || res.statusCode === 403 || 
                                 result.errors[0].message.toLowerCase().includes('unauthorized') ||
                                 result.errors[0].message.toLowerCase().includes('forbidden');
              reject(error);
            } else {
              resolve(result.data?.actor?.account?.nrql || null);
            }
          } catch (e) {
            e.statusCode = res.statusCode;
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });
  }

  async executeBatch(queries) {
    // Create a batch GraphQL query
    const batchQuery = queries.map((q, i) => `
      q${i}: account(id: $accountId) {
        nrql(query: "${q.query.replace(/"/g, '\\"')}") {
          results
        }
      }
    `).join('\n');

    const graphqlQuery = `
      query($accountId: Int!) {
        actor {
          ${batchQuery}
        }
      }
    `;

    const requestBody = JSON.stringify({
      query: graphqlQuery,
      variables: {
        accountId: parseInt(this.accountId)
      }
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': this.apiKey
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(this.endpoint, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.errors) {
              reject(new Error(result.errors[0].message));
            } else {
              const batchResults = [];
              for (let i = 0; i < queries.length; i++) {
                batchResults.push({
                  query: queries[i],
                  result: result.data?.actor?.[`q${i}`]?.nrql || null
                });
              }
              resolve(batchResults);
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });
  }
}

// Query Builder with parameter substitution
class QueryBuilder {
  constructor(config) {
    this.config = config;
  }

  build(template) {
    let query = template;
    
    // Replace time range
    query = query.replace(/{timeRange}/g, this.config.timeRange);
    
    // Add cluster filter if specified
    if (this.config.clusterName) {
      // Handle WHERE clause insertion
      if (query.includes('WHERE')) {
        query = query.replace(/WHERE/g, `WHERE provider.clusterName = '${this.config.clusterName}' AND`);
      } else if (query.includes('FROM')) {
        query = query.replace(/FROM (\w+)/g, `FROM $1 WHERE provider.clusterName = '${this.config.clusterName}'`);
      }
    }
    
    return query;
  }
}

// Progress tracking
class ProgressTracker {
  constructor(totalQueries) {
    this.totalQueries = totalQueries;
    this.completedQueries = 0;
    this.startTime = Date.now();
    this.categoryProgress = {};
  }

  update(category, query, status) {
    this.completedQueries++;
    if (!this.categoryProgress[category]) {
      this.categoryProgress[category] = { completed: 0, total: 0, failed: 0 };
    }
    this.categoryProgress[category].completed++;
    if (status === 'failed') {
      this.categoryProgress[category].failed++;
    }

    const percentage = (this.completedQueries / this.totalQueries * 100).toFixed(1);
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const rate = (this.completedQueries / elapsed).toFixed(1);
    
    if (CONFIG.verbose) {
      console.log(`[${percentage}%] ${category} > ${query.name} (${rate} q/s)`);
    } else {
      process.stdout.write(`\r[${percentage}%] Processing... (${this.completedQueries}/${this.totalQueries} queries, ${rate} q/s)`);
    }
  }

  finish() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`\n✓ Completed ${this.completedQueries} queries in ${elapsed}s`);
  }
}

// Health score calculator
class HealthScoreCalculator {
  calculate(results) {
    const scores = {
      dataAvailability: 0,
      metricCompleteness: 0,
      dataFreshness: 0,
      entityRelationships: 0,
      overall: 0
    };

    // Data availability (check critical queries)
    const criticalQueries = results.filter(r => r.query.critical);
    const criticalSuccess = criticalQueries.filter(r => r.success && r.hasData).length;
    scores.dataAvailability = (criticalSuccess / criticalQueries.length) * 100;

    // Metric completeness
    const totalQueries = results.length;
    const successfulQueries = results.filter(r => r.success && r.hasData).length;
    scores.metricCompleteness = (successfulQueries / totalQueries) * 100;

    // Data freshness (check age of data)
    const freshnessQueries = results.filter(r => r.query.name.includes('Freshness'));
    if (freshnessQueries.length > 0) {
      const freshData = freshnessQueries.filter(r => {
        if (r.result?.results?.[0]) {
          const ageInSeconds = r.result.results[0]['Age in Seconds'] || 999999;
          return ageInSeconds < 300; // Less than 5 minutes old
        }
        return false;
      }).length;
      scores.dataFreshness = (freshData / freshnessQueries.length) * 100;
    } else {
      scores.dataFreshness = 100; // Assume fresh if no freshness queries
    }

    // Entity relationships
    const relationshipQueries = results.filter(r => r.category === 'Entity Relationships');
    if (relationshipQueries.length > 0) {
      const validRelationships = relationshipQueries.filter(r => r.success && r.hasData).length;
      scores.entityRelationships = (validRelationships / relationshipQueries.length) * 100;
    } else {
      scores.entityRelationships = 100;
    }

    // Calculate overall score
    scores.overall = (
      scores.dataAvailability * 0.4 +
      scores.metricCompleteness * 0.3 +
      scores.dataFreshness * 0.2 +
      scores.entityRelationships * 0.1
    );

    return scores;
  }

  getRecommendations(scores, results) {
    const recommendations = [];

    if (scores.dataAvailability < 100) {
      recommendations.push({
        severity: 'critical',
        category: 'Data Availability',
        message: 'Critical data sources are missing. Check MSK integration configuration.',
        details: results.filter(r => r.query.critical && (!r.success || !r.hasData))
          .map(r => `- ${r.query.name}: ${r.error || 'No data found'}`)
      });
    }

    if (scores.metricCompleteness < 80) {
      recommendations.push({
        severity: 'warning',
        category: 'Metric Completeness',
        message: `Only ${scores.metricCompleteness.toFixed(1)}% of metrics are available.`,
        details: results.filter(r => !r.success || !r.hasData)
          .slice(0, 10)
          .map(r => `- ${r.query.name}`)
      });
    }

    if (scores.dataFreshness < 90) {
      recommendations.push({
        severity: 'warning',
        category: 'Data Freshness',
        message: 'Some data sources have stale data (>5 minutes old).',
        details: ['Check polling intervals and network connectivity']
      });
    }

    return recommendations;
  }
}

// Report generator
class ReportGenerator {
  constructor(results, config) {
    this.results = results;
    this.config = config;
    this.timestamp = new Date().toISOString();
  }

  generateConsoleReport() {
    console.log('\n' + '='.repeat(80));
    console.log('KAFKA METRICS VERIFICATION REPORT');
    console.log('='.repeat(80));
    console.log(`Timestamp: ${this.timestamp}`);
    console.log(`Account ID: ${this.config.accountId}`);
    console.log(`Time Range: ${this.config.timeRange}`);
    if (this.config.clusterName) {
      console.log(`Cluster: ${this.config.clusterName}`);
    }
    console.log('='.repeat(80));

    // Summary by category
    const categories = {};
    this.results.forEach(r => {
      if (!categories[r.category]) {
        categories[r.category] = { total: 0, success: 0, hasData: 0, failed: 0 };
      }
      categories[r.category].total++;
      if (r.success) {
        categories[r.category].success++;
        if (r.hasData) {
          categories[r.category].hasData++;
        }
      } else {
        categories[r.category].failed++;
      }
    });

    console.log('\nCATEGORY SUMMARY:');
    console.log('-'.repeat(80));
    Object.entries(categories).forEach(([category, stats]) => {
      const successRate = ((stats.hasData / stats.total) * 100).toFixed(1);
      const status = stats.failed > 0 ? '⚠️ ' : stats.hasData === stats.total ? '✅' : '⚪';
      console.log(`${status} ${category.padEnd(30)} ${stats.hasData}/${stats.total} queries with data (${successRate}%)`);
    });

    // Health scores
    const calculator = new HealthScoreCalculator();
    const scores = calculator.calculate(this.results);
    
    console.log('\nHEALTH SCORES:');
    console.log('-'.repeat(80));
    console.log(`Data Availability:    ${this.formatScore(scores.dataAvailability)}`);
    console.log(`Metric Completeness:  ${this.formatScore(scores.metricCompleteness)}`);
    console.log(`Data Freshness:       ${this.formatScore(scores.dataFreshness)}`);
    console.log(`Entity Relationships: ${this.formatScore(scores.entityRelationships)}`);
    console.log(`OVERALL SCORE:        ${this.formatScore(scores.overall)}`);

    // Recommendations
    const recommendations = calculator.getRecommendations(scores, this.results);
    if (recommendations.length > 0) {
      console.log('\nRECOMMENDATIONS:');
      console.log('-'.repeat(80));
      recommendations.forEach(rec => {
        const icon = rec.severity === 'critical' ? '🔴' : '🟡';
        console.log(`${icon} ${rec.category}: ${rec.message}`);
        if (rec.details && rec.details.length > 0) {
          rec.details.forEach(detail => console.log(`   ${detail}`));
        }
      });
    }

    // Failed queries
    const failedQueries = this.results.filter(r => !r.success || !r.hasData);
    if (failedQueries.length > 0 && CONFIG.verbose) {
      console.log('\nFAILED/EMPTY QUERIES:');
      console.log('-'.repeat(80));
      failedQueries.slice(0, 20).forEach(r => {
        console.log(`${r.category} > ${r.query.name}: ${r.error || 'No data found'}`);
      });
      if (failedQueries.length > 20) {
        console.log(`... and ${failedQueries.length - 20} more`);
      }
    }

    console.log('\n' + '='.repeat(80));
  }

  formatScore(score) {
    const formatted = score.toFixed(1) + '%';
    if (score >= 90) return `${formatted} ✅`;
    if (score >= 70) return `${formatted} ⚠️`;
    return `${formatted} ❌`;
  }

  generateJSON() {
    const calculator = new HealthScoreCalculator();
    const scores = calculator.calculate(this.results);
    const recommendations = calculator.getRecommendations(scores, this.results);

    const report = {
      timestamp: this.timestamp,
      config: {
        accountId: this.config.accountId,
        timeRange: this.config.timeRange,
        clusterName: this.config.clusterName
      },
      summary: {
        totalQueries: this.results.length,
        successful: this.results.filter(r => r.success).length,
        withData: this.results.filter(r => r.hasData).length,
        failed: this.results.filter(r => !r.success).length
      },
      scores,
      recommendations,
      categories: {},
      details: this.results
    };

    // Group by category
    this.results.forEach(r => {
      if (!report.categories[r.category]) {
        report.categories[r.category] = {
          queries: [],
          summary: { total: 0, success: 0, hasData: 0, failed: 0 }
        };
      }
      report.categories[r.category].queries.push(r);
      report.categories[r.category].summary.total++;
      if (r.success) {
        report.categories[r.category].summary.success++;
        if (r.hasData) {
          report.categories[r.category].summary.hasData++;
        }
      } else {
        report.categories[r.category].summary.failed++;
      }
    });

    return report;
  }

  generateHTML() {
    const jsonReport = this.generateJSON();
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Kafka Metrics Verification Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1, h2, h3 { color: #333; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric-card { background: #f8f9fa; padding: 15px; border-radius: 4px; text-align: center; }
        .metric-value { font-size: 2em; font-weight: bold; color: #0066cc; }
        .score { padding: 10px; margin: 5px 0; border-radius: 4px; }
        .score-good { background: #d4edda; color: #155724; }
        .score-warning { background: #fff3cd; color: #856404; }
        .score-bad { background: #f8d7da; color: #721c24; }
        .category { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 4px; }
        .query-result { margin: 10px 0; padding: 10px; background: white; border-left: 3px solid #0066cc; }
        .failed { border-left-color: #dc3545; }
        .no-data { border-left-color: #ffc107; }
        .recommendation { margin: 10px 0; padding: 10px; border-radius: 4px; }
        .rec-critical { background: #f8d7da; color: #721c24; }
        .rec-warning { background: #fff3cd; color: #856404; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Kafka Metrics Verification Report</h1>
        <p><strong>Generated:</strong> ${jsonReport.timestamp}</p>
        <p><strong>Account ID:</strong> ${jsonReport.config.accountId}</p>
        <p><strong>Time Range:</strong> ${jsonReport.config.timeRange}</p>
        ${jsonReport.config.clusterName ? `<p><strong>Cluster:</strong> ${jsonReport.config.clusterName}</p>` : ''}
        
        <h2>Summary</h2>
        <div class="summary">
            <div class="metric-card">
                <div class="metric-value">${jsonReport.summary.totalQueries}</div>
                <div>Total Queries</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${jsonReport.summary.withData}</div>
                <div>With Data</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${jsonReport.summary.failed}</div>
                <div>Failed</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${jsonReport.scores.overall.toFixed(1)}%</div>
                <div>Overall Score</div>
            </div>
        </div>

        <h2>Health Scores</h2>
        ${Object.entries(jsonReport.scores).filter(([k]) => k !== 'overall').map(([name, score]) => `
            <div class="score ${score >= 90 ? 'score-good' : score >= 70 ? 'score-warning' : 'score-bad'}">
                <strong>${name.replace(/([A-Z])/g, ' $1').trim()}:</strong> ${score.toFixed(1)}%
            </div>
        `).join('')}

        ${jsonReport.recommendations.length > 0 ? `
            <h2>Recommendations</h2>
            ${jsonReport.recommendations.map(rec => `
                <div class="recommendation rec-${rec.severity}">
                    <strong>${rec.category}:</strong> ${rec.message}
                    ${rec.details && rec.details.length > 0 ? `<ul>${rec.details.map(d => `<li>${d}</li>`).join('')}</ul>` : ''}
                </div>
            `).join('')}
        ` : ''}

        <h2>Category Details</h2>
        ${Object.entries(jsonReport.categories).map(([category, data]) => `
            <div class="category">
                <h3>${category} (${data.summary.hasData}/${data.summary.total})</h3>
                <table>
                    <tr>
                        <th>Query</th>
                        <th>Status</th>
                        <th>Result Count</th>
                    </tr>
                    ${data.queries.map(q => `
                        <tr class="${!q.success ? 'failed' : !q.hasData ? 'no-data' : ''}">
                            <td>${q.query.name}</td>
                            <td>${q.success ? (q.hasData ? '✅' : '⚪') : '❌'}</td>
                            <td>${q.resultCount || '-'}</td>
                        </tr>
                    `).join('')}
                </table>
            </div>
        `).join('')}
    </div>
</body>
</html>
    `;

    return html;
  }

  generateMarkdown() {
    const jsonReport = this.generateJSON();
    
    let md = `# Kafka Metrics Verification Report\n\n`;
    md += `**Generated:** ${jsonReport.timestamp}\n\n`;
    md += `**Account ID:** ${jsonReport.config.accountId}\n\n`;
    md += `**Time Range:** ${jsonReport.config.timeRange}\n\n`;
    if (jsonReport.config.clusterName) {
      md += `**Cluster:** ${jsonReport.config.clusterName}\n\n`;
    }

    md += `## Summary\n\n`;
    md += `- Total Queries: ${jsonReport.summary.totalQueries}\n`;
    md += `- Successful: ${jsonReport.summary.successful}\n`;
    md += `- With Data: ${jsonReport.summary.withData}\n`;
    md += `- Failed: ${jsonReport.summary.failed}\n\n`;

    md += `## Health Scores\n\n`;
    Object.entries(jsonReport.scores).forEach(([name, score]) => {
      const icon = score >= 90 ? '✅' : score >= 70 ? '⚠️' : '❌';
      md += `- **${name}:** ${score.toFixed(1)}% ${icon}\n`;
    });

    if (jsonReport.recommendations.length > 0) {
      md += `\n## Recommendations\n\n`;
      jsonReport.recommendations.forEach(rec => {
        md += `### ${rec.severity === 'critical' ? '🔴' : '🟡'} ${rec.category}\n\n`;
        md += `${rec.message}\n\n`;
        if (rec.details && rec.details.length > 0) {
          rec.details.forEach(d => md += `- ${d}\n`);
        }
        md += '\n';
      });
    }

    md += `\n## Category Results\n\n`;
    Object.entries(jsonReport.categories).forEach(([category, data]) => {
      md += `### ${category} (${data.summary.hasData}/${data.summary.total})\n\n`;
      md += `| Query | Status | Result Count |\n`;
      md += `|-------|--------|-------------|\n`;
      data.queries.forEach(q => {
        const status = q.success ? (q.hasData ? '✅' : '⚪') : '❌';
        md += `| ${q.query.name} | ${status} | ${q.resultCount || '-'} |\n`;
      });
      md += '\n';
    });

    return md;
  }
}

// Main execution function
async function main() {
  // Validate configuration
  if (!CONFIG.apiKey || !CONFIG.accountId) {
    console.error('Error: API Key and Account ID are required');
    console.error('Usage: node verify-kafka-metrics.js <API_KEY> <ACCOUNT_ID> [CLUSTER_NAME]');
    console.error('   or: NRAK_API_KEY=xxx ACC=xxx node verify-kafka-metrics.js');
    process.exit(1);
  }

  console.log('🚀 Starting Kafka Metrics Verification...\n');
  console.log(`Account ID: ${CONFIG.accountId}`);
  console.log(`Time Range: ${CONFIG.timeRange}`);
  if (CONFIG.clusterName) {
    console.log(`Cluster Filter: ${CONFIG.clusterName}`);
  }
  console.log(`Categories: ${CONFIG.categories === 'all' ? 'All' : CONFIG.categories.join(', ')}`);
  console.log(`Output Format: ${CONFIG.outputFormat}`);
  console.log(`Concurrency: ${CONFIG.concurrency}`);
  console.log(`Max Retries: ${CONFIG.maxRetries}\n`);

  // Initialize components
  const client = new NerdGraphClient(CONFIG.apiKey, CONFIG.accountId);
  const queryBuilder = new QueryBuilder(CONFIG);

  // Build query list
  const queries = [];
  const categoriesToRun = CONFIG.categories === 'all' 
    ? Object.keys(QUERY_CATALOG) 
    : CONFIG.categories;

  categoriesToRun.forEach(category => {
    if (QUERY_CATALOG[category]) {
      QUERY_CATALOG[category].queries.forEach(query => {
        queries.push({
          category,
          query,
          nrql: queryBuilder.build(query.query)
        });
      });
    }
  });

  console.log(`📊 Found ${queries.length} queries across ${categoriesToRun.length} categories\n`);

  // Initialize progress tracker
  const progress = new ProgressTracker(queries.length);

  // Execute queries with retry logic
  async function executeWithRetry(queryInfo, retries = CONFIG.maxRetries) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await client.executeQuery(queryInfo.nrql);
        return { ...queryInfo, result, success: true };
      } catch (error) {
        // Don't retry auth errors
        if (error.isAuthError || error.statusCode === 401 || error.statusCode === 403) {
          console.error('\n❌ Authentication failed:', error.message);
          console.error('Please check your API key and account ID');
          process.exit(1);
        }
        
        if (attempt === retries) {
          return { ...queryInfo, error: error.message, success: false };
        }
        if (CONFIG.verbose) {
          console.log(`\nRetry ${attempt}/${retries} for ${queryInfo.query.name}: ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  // Process queries in batches
  const results = [];
  for (let i = 0; i < queries.length; i += CONFIG.concurrency) {
    const batch = queries.slice(i, i + CONFIG.concurrency);
    const batchResults = await Promise.all(
      batch.map(q => executeWithRetry(q))
    );

    batchResults.forEach(result => {
      // Process result
      result.hasData = false;
      result.resultCount = 0;

      if (result.success && result.result?.results) {
        if (Array.isArray(result.result.results) && result.result.results.length > 0) {
          result.hasData = true;
          result.resultCount = result.result.results.length;
          
          // Check if it's a count query and the count is > 0
          const firstResult = result.result.results[0];
          if (firstResult && typeof firstResult === 'object') {
            const values = Object.values(firstResult);
            if (values.length === 1 && typeof values[0] === 'number') {
              result.hasData = values[0] > 0;
              result.resultCount = values[0];
            }
          }
        }
      }

      results.push(result);
      progress.update(result.category, result.query, result.success ? 'success' : 'failed');
    });
  }

  progress.finish();

  // Generate reports
  const reporter = new ReportGenerator(results, CONFIG);

  // Console output
  if (CONFIG.outputFormat === 'console' || CONFIG.outputFormat === 'all') {
    reporter.generateConsoleReport();
  }

  // JSON output
  if (CONFIG.outputFormat === 'json' || CONFIG.outputFormat === 'all') {
    const jsonReport = reporter.generateJSON();
    const jsonFilename = `kafka-verification-${Date.now()}.json`;
    fs.writeFileSync(jsonFilename, JSON.stringify(jsonReport, null, 2));
    console.log(`\n📄 JSON report saved to: ${jsonFilename}`);
  }

  // HTML output
  if (CONFIG.outputFormat === 'html' || CONFIG.outputFormat === 'all') {
    const htmlReport = reporter.generateHTML();
    const htmlFilename = `kafka-verification-${Date.now()}.html`;
    fs.writeFileSync(htmlFilename, htmlReport);
    console.log(`📄 HTML report saved to: ${htmlFilename}`);
  }

  // Markdown output
  if (CONFIG.outputFormat === 'markdown' || CONFIG.outputFormat === 'all') {
    const mdReport = reporter.generateMarkdown();
    const mdFilename = `kafka-verification-${Date.now()}.md`;
    fs.writeFileSync(mdFilename, mdReport);
    console.log(`📄 Markdown report saved to: ${mdFilename}`);
  }

  // Exit with appropriate code
  const calculator = new HealthScoreCalculator();
  const scores = calculator.calculate(results);
  process.exit(scores.overall >= 90 ? 0 : 1);
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('\n❌ Unhandled error:', error.message);
  process.exit(1);
});

// Run main function
main();