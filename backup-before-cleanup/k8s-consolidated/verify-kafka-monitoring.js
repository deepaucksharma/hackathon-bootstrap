#!/usr/bin/env node

/**
 * Comprehensive Kafka Monitoring Verification Script
 * Combines all verification logic into a single, powerful tool
 */

const https = require('https');

// Configuration
const config = {
  apiKey: process.env.NEW_RELIC_API_KEY || process.argv.find(arg => arg.startsWith('--apiKey='))?.split('=')[1],
  accountId: process.env.NEW_RELIC_ACCOUNT_ID || process.argv.find(arg => arg.startsWith('--accountId='))?.split('=')[1] || '3630072',
  clusterName: process.argv.find(arg => arg.startsWith('--clusterName='))?.split('=')[1],
  region: 'US',
  verbose: process.argv.includes('--verbose'),
  format: process.argv.find(arg => arg.startsWith('--format='))?.split('=')[1] || 'table'
};

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

// Check required parameters
if (!config.apiKey) {
  console.error(`${colors.red}Error: API key required${colors.reset}`);
  console.log('Usage: node verify-kafka-monitoring.js --apiKey=<NRAK-KEY> --accountId=<ID> [--clusterName=<name>] [--verbose] [--format=json|table]');
  process.exit(1);
}

// NRQL queries for comprehensive verification
const queries = {
  // Overview queries
  overview: {
    allClusters: `FROM KafkaBrokerSample SELECT uniqueCount(clusterName) as 'clusters', count(*) as 'samples' SINCE 1 hour ago`,
    clusterHealth: `FROM KafkaBrokerSample SELECT latest(clusterName), count(*) as 'samples', uniqueCount(entityName) as 'brokers' FACET clusterName SINCE 30 minutes ago`
  },
  
  // Standard Kafka metrics
  standard: {
    brokers: `FROM KafkaBrokerSample SELECT count(*), uniqueCount(broker_host), uniqueCount(entityName) WHERE clusterName = $CLUSTER SINCE 10 minutes ago`,
    topics: `FROM KafkaTopicSample SELECT count(*), uniqueCount(topic), uniqueCount(entityName) WHERE clusterName = $CLUSTER SINCE 10 minutes ago`,
    consumerOffsets: `FROM KafkaOffsetSample SELECT count(*), uniqueCount(consumerGroup), uniqueCount(topic) WHERE clusterName = $CLUSTER SINCE 10 minutes ago`,
    producers: `FROM KafkaProducerSample SELECT count(*), uniqueCount(entityName) WHERE clusterName = $CLUSTER SINCE 10 minutes ago`,
    consumers: `FROM KafkaConsumerSample SELECT count(*), uniqueCount(entityName) WHERE clusterName = $CLUSTER SINCE 10 minutes ago`
  },
  
  // MSK shim metrics
  msk: {
    cluster: `FROM AwsMskClusterSample SELECT count(*), latest(provider.activeControllerCount.Sum), latest(provider.offlinePartitionsCount.Sum) WHERE clusterName = $CLUSTER SINCE 10 minutes ago`,
    brokers: `FROM AwsMskBrokerSample SELECT count(*), uniqueCount(provider.brokerId), average(provider.bytesInPerSec.Average) WHERE clusterName = $CLUSTER SINCE 10 minutes ago`,
    topics: `FROM AwsMskTopicSample SELECT count(*), uniqueCount(provider.topic), sum(provider.bytesInPerSec.Sum) WHERE clusterName = $CLUSTER SINCE 10 minutes ago`
  },
  
  // Key performance metrics
  performance: {
    throughput: `FROM KafkaBrokerSample SELECT average(broker.IOInPerSecond) as 'bytesIn', average(broker.IOOutPerSecond) as 'bytesOut', average(broker.messagesInPerSecond) as 'messagesIn' WHERE clusterName = $CLUSTER SINCE 5 minutes ago`,
    latency: `FROM KafkaBrokerSample SELECT average(request.avgTimeFetch) as 'fetchLatency', average(request.avgTimeProduceRequest) as 'produceLatency', average(request.avgTimeMetadata) as 'metadataLatency' WHERE clusterName = $CLUSTER SINCE 5 minutes ago`,
    errors: `FROM KafkaBrokerSample SELECT sum(request.clientFetchesFailedPerSecond) as 'fetchFailures', sum(request.produceRequestsFailedPerSecond) as 'produceFailures' WHERE clusterName = $CLUSTER SINCE 5 minutes ago`
  },
  
  // Consumer lag analysis
  consumerLag: {
    summary: `FROM KafkaOffsetSample SELECT average(consumer.lag) as 'avgLag', max(consumer.lag) as 'maxLag', uniqueCount(consumerGroup) as 'consumerGroups' WHERE clusterName = $CLUSTER SINCE 5 minutes ago`,
    byGroup: `FROM KafkaOffsetSample SELECT latest(consumer.lag) as 'lag', latest(consumer.offset) as 'offset' WHERE clusterName = $CLUSTER FACET consumerGroup, topic SINCE 5 minutes ago LIMIT 20`
  },
  
  // Entity verification
  entities: {
    brokerEntities: `FROM KafkaBrokerSample SELECT latest(entityGuid), latest(entityName), latest(broker_host) WHERE clusterName = $CLUSTER FACET entityName SINCE 10 minutes ago`,
    mskEntities: `FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample SELECT uniqueCount(entity.guid) FACET eventType() WHERE clusterName = $CLUSTER SINCE 10 minutes ago`
  },
  
  // Metric discovery
  discovery: {
    availableMetrics: `FROM KafkaBrokerSample SELECT keyset() WHERE clusterName = $CLUSTER SINCE 5 minutes ago LIMIT 1`,
    mskMetrics: `FROM AwsMskBrokerSample SELECT keyset() WHERE clusterName = $CLUSTER SINCE 5 minutes ago LIMIT 1`
  }
};

// Execute NRQL query
async function executeQuery(query, description) {
  return new Promise((resolve, reject) => {
    // Replace cluster placeholder
    if (config.clusterName) {
      query = query.replace(/\$CLUSTER/g, `'${config.clusterName}'`);
    } else {
      query = query.replace(/WHERE clusterName = \$CLUSTER/g, '');
    }
    
    const encodedQuery = encodeURIComponent(query);
    
    const options = {
      hostname: 'api.newrelic.com',
      path: `/graphql`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': config.apiKey
      }
    };
    
    const graphqlQuery = {
      query: `{
        actor {
          account(id: ${config.accountId}) {
            nrql(query: "${query}") {
              results
            }
          }
        }
      }`
    };
    
    if (config.verbose) {
      console.log(`${colors.cyan}Query: ${query}${colors.reset}`);
    }
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.errors) {
            reject(new Error(parsed.errors[0].message));
          } else {
            const results = parsed.data?.actor?.account?.nrql?.results || [];
            resolve({ description, query, results });
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify(graphqlQuery));
    req.end();
  });
}

// Format bytes to human readable
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format number with commas
function formatNumber(num) {
  if (typeof num !== 'number') return num;
  return num.toLocaleString();
}

// Print results in table format
function printTable(title, results, columns) {
  console.log(`\n${colors.bright}${title}${colors.reset}`);
  console.log('─'.repeat(80));
  
  if (!results || results.length === 0) {
    console.log(`${colors.yellow}No data found${colors.reset}`);
    return;
  }
  
  // Convert results to table rows
  const rows = results.map(row => {
    return columns.map(col => {
      const value = row[col.key];
      if (col.format === 'bytes') return formatBytes(value);
      if (col.format === 'number') return formatNumber(value);
      if (col.format === 'ms' && value) return `${value.toFixed(2)}ms`;
      return value || '-';
    });
  });
  
  // Calculate column widths
  const widths = columns.map((col, i) => {
    const values = [col.label, ...rows.map(row => String(row[i]))];
    return Math.max(...values.map(v => v.length));
  });
  
  // Print header
  console.log(columns.map((col, i) => col.label.padEnd(widths[i])).join(' │ '));
  console.log(widths.map(w => '─'.repeat(w)).join('─┼─'));
  
  // Print rows
  rows.forEach(row => {
    console.log(row.map((cell, i) => String(cell).padEnd(widths[i])).join(' │ '));
  });
}

// Main verification flow
async function verifyKafkaMonitoring() {
  console.log(`${colors.bright}${colors.green}=== Kafka Monitoring Verification ===${colors.reset}`);
  console.log(`Account ID: ${config.accountId}`);
  console.log(`Cluster: ${config.clusterName || 'All clusters'}`);
  console.log(`Time: ${new Date().toISOString()}\n`);
  
  const results = {
    overview: {},
    standard: {},
    msk: {},
    performance: {},
    issues: [],
    recommendations: []
  };
  
  try {
    // 1. Overview
    console.log(`${colors.cyan}Checking cluster overview...${colors.reset}`);
    if (!config.clusterName) {
      const overview = await executeQuery(queries.overview.allClusters, 'All Clusters');
      printTable('All Kafka Clusters', overview.results, [
        { key: 'clusters', label: 'Total Clusters', format: 'number' },
        { key: 'samples', label: 'Total Samples', format: 'number' }
      ]);
      
      const health = await executeQuery(queries.overview.clusterHealth, 'Cluster Health');
      printTable('Cluster Status', health.results, [
        { key: 'clusterName', label: 'Cluster Name' },
        { key: 'samples', label: 'Samples (30m)', format: 'number' },
        { key: 'brokers', label: 'Active Brokers', format: 'number' }
      ]);
    }
    
    // 2. Standard Kafka Metrics
    console.log(`\n${colors.cyan}Checking standard Kafka metrics...${colors.reset}`);
    
    const brokers = await executeQuery(queries.standard.brokers, 'Broker Metrics');
    results.standard.brokers = brokers.results[0];
    
    const topics = await executeQuery(queries.standard.topics, 'Topic Metrics');
    results.standard.topics = topics.results[0];
    
    const offsets = await executeQuery(queries.standard.consumerOffsets, 'Consumer Offsets');
    results.standard.offsets = offsets.results[0];
    
    printTable('Standard Kafka Metrics', [
      { 
        metric: 'Broker Samples', 
        count: results.standard.brokers?.count || 0,
        entities: results.standard.brokers?.['uniqueCount.entityName'] || 0,
        status: results.standard.brokers?.count > 0 ? '✓' : '✗'
      },
      { 
        metric: 'Topic Samples', 
        count: results.standard.topics?.count || 0,
        entities: results.standard.topics?.['uniqueCount.topic'] || 0,
        status: results.standard.topics?.count > 0 ? '✓' : '✗'
      },
      { 
        metric: 'Consumer Offsets', 
        count: results.standard.offsets?.count || 0,
        entities: results.standard.offsets?.['uniqueCount.consumerGroup'] || 0,
        status: results.standard.offsets?.count > 0 ? '✓' : '✗'
      }
    ], [
      { key: 'metric', label: 'Metric Type' },
      { key: 'count', label: 'Sample Count', format: 'number' },
      { key: 'entities', label: 'Unique Entities', format: 'number' },
      { key: 'status', label: 'Status' }
    ]);
    
    // 3. MSK Shim Metrics
    console.log(`\n${colors.cyan}Checking MSK shim metrics...${colors.reset}`);
    
    const mskCluster = await executeQuery(queries.msk.cluster, 'MSK Cluster');
    results.msk.cluster = mskCluster.results[0];
    
    const mskBrokers = await executeQuery(queries.msk.brokers, 'MSK Brokers');
    results.msk.brokers = mskBrokers.results[0];
    
    const mskTopics = await executeQuery(queries.msk.topics, 'MSK Topics');
    results.msk.topics = mskTopics.results[0];
    
    printTable('MSK Shim Metrics', [
      { 
        metric: 'MSK Cluster', 
        count: results.msk.cluster?.count || 0,
        activeController: results.msk.cluster?.['latest.provider.activeControllerCount.Sum'] || 0,
        offlinePartitions: results.msk.cluster?.['latest.provider.offlinePartitionsCount.Sum'] || 0,
        status: results.msk.cluster?.count > 0 ? '✓' : '✗'
      },
      { 
        metric: 'MSK Brokers', 
        count: results.msk.brokers?.count || 0,
        brokers: results.msk.brokers?.['uniqueCount.provider.brokerId'] || 0,
        throughput: formatBytes(results.msk.brokers?.['average.provider.bytesInPerSec.Average'] || 0) + '/s',
        status: results.msk.brokers?.count > 0 ? '✓' : '✗'
      },
      { 
        metric: 'MSK Topics', 
        count: results.msk.topics?.count || 0,
        topics: results.msk.topics?.['uniqueCount.provider.topic'] || 0,
        throughput: formatBytes(results.msk.topics?.['sum.provider.bytesInPerSec.Sum'] || 0) + '/s',
        status: results.msk.topics?.count > 0 ? '✓' : '✗'
      }
    ], [
      { key: 'metric', label: 'Metric Type' },
      { key: 'count', label: 'Samples' },
      { key: 'brokers', label: 'Brokers' },
      { key: 'topics', label: 'Topics' },
      { key: 'activeController', label: 'Controller' },
      { key: 'offlinePartitions', label: 'Offline' },
      { key: 'throughput', label: 'Throughput' },
      { key: 'status', label: 'Status' }
    ]);
    
    // 4. Performance Metrics
    console.log(`\n${colors.cyan}Checking performance metrics...${colors.reset}`);
    
    const throughput = await executeQuery(queries.performance.throughput, 'Throughput');
    const latency = await executeQuery(queries.performance.latency, 'Latency');
    const errors = await executeQuery(queries.performance.errors, 'Errors');
    
    results.performance = {
      throughput: throughput.results[0],
      latency: latency.results[0],
      errors: errors.results[0]
    };
    
    if (throughput.results[0]) {
      printTable('Performance Metrics', [
        {
          metric: 'Throughput',
          bytesIn: formatBytes(throughput.results[0].bytesIn) + '/s',
          bytesOut: formatBytes(throughput.results[0].bytesOut) + '/s',
          messagesIn: formatNumber(throughput.results[0].messagesIn) + '/s'
        },
        {
          metric: 'Latency',
          fetch: latency.results[0]?.fetchLatency?.toFixed(2) + 'ms' || '-',
          produce: latency.results[0]?.produceLatency?.toFixed(2) + 'ms' || '-',
          metadata: latency.results[0]?.metadataLatency?.toFixed(2) + 'ms' || '-'
        },
        {
          metric: 'Errors',
          fetchFailures: errors.results[0]?.fetchFailures || 0,
          produceFailures: errors.results[0]?.produceFailures || 0
        }
      ], [
        { key: 'metric', label: 'Metric' },
        { key: 'bytesIn', label: 'Bytes In' },
        { key: 'bytesOut', label: 'Bytes Out' },
        { key: 'messagesIn', label: 'Messages In' },
        { key: 'fetch', label: 'Fetch' },
        { key: 'produce', label: 'Produce' },
        { key: 'metadata', label: 'Metadata' },
        { key: 'fetchFailures', label: 'Fetch Errors' },
        { key: 'produceFailures', label: 'Produce Errors' }
      ]);
    }
    
    // 5. Consumer Lag
    console.log(`\n${colors.cyan}Checking consumer lag...${colors.reset}`);
    
    const lagSummary = await executeQuery(queries.consumerLag.summary, 'Consumer Lag Summary');
    if (lagSummary.results[0]?.consumerGroups > 0) {
      printTable('Consumer Lag Summary', lagSummary.results, [
        { key: 'avgLag', label: 'Average Lag', format: 'number' },
        { key: 'maxLag', label: 'Max Lag', format: 'number' },
        { key: 'consumerGroups', label: 'Consumer Groups', format: 'number' }
      ]);
      
      if (config.verbose) {
        const lagDetail = await executeQuery(queries.consumerLag.byGroup, 'Consumer Lag by Group');
        printTable('Consumer Lag Details', lagDetail.results.slice(0, 10), [
          { key: 'consumerGroup', label: 'Consumer Group' },
          { key: 'topic', label: 'Topic' },
          { key: 'lag', label: 'Lag', format: 'number' },
          { key: 'offset', label: 'Offset', format: 'number' }
        ]);
      }
    }
    
    // 6. Analysis and Recommendations
    console.log(`\n${colors.bright}${colors.magenta}=== Analysis ===${colors.reset}`);
    
    // Check for issues
    if (!results.standard.brokers?.count) {
      results.issues.push('❌ No broker metrics found - Check JMX configuration');
    }
    if (!results.standard.topics?.count) {
      results.issues.push('❌ No topic metrics found - Enable TOPIC_MODE=all');
    }
    if (!results.standard.offsets?.count) {
      results.issues.push('❌ No consumer offset data - Enable CONSUMER_OFFSET=true');
    }
    if (!results.msk.cluster?.count) {
      results.issues.push('⚠️  No MSK cluster data - MSK shim may not be enabled');
    }
    if (results.performance.throughput?.bytesIn === 0) {
      results.issues.push('⚠️  Zero throughput detected - No active producers/consumers');
    }
    
    // Generate recommendations
    if (results.issues.length > 0) {
      console.log(`${colors.red}Issues Found:${colors.reset}`);
      results.issues.forEach(issue => console.log(`  ${issue}`));
      
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      
      if (!results.standard.topics?.count) {
        console.log('  1. Enable topic collection:');
        console.log('     TOPIC_MODE: all');
        console.log('     COLLECT_TOPIC_SIZE: "true"');
      }
      
      if (!results.standard.offsets?.count) {
        console.log('  2. Enable consumer offset monitoring:');
        console.log('     CONSUMER_OFFSET: "true"');
        console.log('     CONSUMER_GROUP_OFFSET_BY_TOPIC: "true"');
      }
      
      if (!results.msk.cluster?.count) {
        console.log('  3. Enable MSK shim:');
        console.log('     MSK_SHIM_ENABLED: "true"');
        console.log('     AWS_ACCOUNT_ID: "123456789012"');
        console.log('     KAFKA_CLUSTER_NAME: "' + (config.clusterName || 'your-cluster') + '"');
      }
      
      if (results.performance.throughput?.bytesIn === 0) {
        console.log('  4. Generate test traffic or enable enhanced mode:');
        console.log('     MSK_ENHANCED_MODE: "true"');
      }
    } else {
      console.log(`${colors.green}✅ All checks passed! Kafka monitoring is working correctly.${colors.reset}`);
    }
    
    // 7. Save detailed results if requested
    if (config.format === 'json') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `kafka-verification-${timestamp}.json`;
      require('fs').writeFileSync(filename, JSON.stringify(results, null, 2));
      console.log(`\n${colors.green}Detailed results saved to: ${filename}${colors.reset}`);
    }
    
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    if (config.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run verification
verifyKafkaMonitoring().catch(console.error);