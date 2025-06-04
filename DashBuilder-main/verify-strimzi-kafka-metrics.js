#!/usr/bin/env node

/**
 * Verify Kafka metrics from Strimzi deployment
 * This script checks for available Kafka metrics and MSK entity types
 */

require('dotenv').config();
const { createDashboardBuilder } = require('./src');
const ora = require('ora');
const chalk = require('chalk');

async function verifyStrimziMetrics() {
  const config = {
    accountId: parseInt(process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID || '3630072'),
    apiKey: process.env.UKEY || process.env.NEW_RELIC_API_KEY,
    region: process.env.NEW_RELIC_REGION || 'US'
  };
  
  if (!config.apiKey) {
    console.error(chalk.red('Missing API key. Please set UKEY or NEW_RELIC_API_KEY environment variable'));
    process.exit(1);
  }
  
  const builder = createDashboardBuilder(config);
  const client = builder.nerdgraph;
  
  console.log(chalk.blue('\n=== Verifying Strimzi Kafka Metrics ===\n'));
  
  // Define queries
  const queries = [
    {
      name: 'Check KafkaBrokerSample for strimzi-production-kafka',
      query: `SELECT count(*) FROM KafkaBrokerSample WHERE clusterName = 'strimzi-production-kafka' SINCE 1 hour ago`
    },
    {
      name: 'List all clusterNames in KafkaBrokerSample',
      query: `SELECT uniqueCount(clusterName) FROM KafkaBrokerSample FACET clusterName SINCE 1 hour ago LIMIT 50`
    },
    {
      name: 'Available metrics in KafkaBrokerSample',
      query: `SELECT keyset() FROM KafkaBrokerSample WHERE clusterName LIKE '%strimzi%' SINCE 1 hour ago LIMIT 1`
    },
    {
      name: 'Check for consumer metrics',
      query: `SELECT count(*) FROM KafkaConsumerSample WHERE clusterName LIKE '%strimzi%' SINCE 1 hour ago`
    },
    {
      name: 'Check for producer metrics',
      query: `SELECT count(*) FROM KafkaProducerSample WHERE clusterName LIKE '%strimzi%' SINCE 1 hour ago`
    },
    {
      name: 'Check for topic metrics',
      query: `SELECT count(*), uniqueCount(topic) FROM KafkaTopicSample WHERE clusterName LIKE '%strimzi%' SINCE 1 hour ago`
    },
    {
      name: 'Check for consumer offset/lag metrics',
      query: `SELECT count(*), uniqueCount(consumerGroup), average(consumer.lag) FROM KafkaOffsetSample WHERE clusterName LIKE '%strimzi%' SINCE 1 hour ago`
    },
    {
      name: 'Check MSK entity types - AwsMskClusterSample',
      query: `SELECT count(*) FROM AwsMskClusterSample SINCE 1 hour ago`
    },
    {
      name: 'Check MSK entity types - AwsMskBrokerSample',
      query: `SELECT count(*) FROM AwsMskBrokerSample SINCE 1 hour ago`
    },
    {
      name: 'Check MSK entity types - AwsMskTopicSample',
      query: `SELECT count(*) FROM AwsMskTopicSample SINCE 1 hour ago`
    },
    {
      name: 'Broker health metrics',
      query: `SELECT 
        average(broker.messagesInPerSecond) AS 'Messages/sec',
        average(broker.IOInPerSecond) AS 'IO In/sec',
        average(broker.IOOutPerSecond) AS 'IO Out/sec',
        average(replication.unreplicatedPartitions) AS 'Unreplicated Partitions',
        average(request.handlerIdle) AS 'Handler Idle %'
      FROM KafkaBrokerSample 
      WHERE clusterName LIKE '%strimzi%' 
      SINCE 30 minutes ago`
    },
    {
      name: 'Request performance metrics',
      query: `SELECT 
        average(request.avgTimeFetch) AS 'Avg Fetch Time',
        average(request.avgTimeProduceRequest) AS 'Avg Produce Time',
        average(request.avgTimeMetadata) AS 'Avg Metadata Time',
        average(request.fetchTime99Percentile) AS 'Fetch p99',
        average(request.produceTime99Percentile) AS 'Produce p99'
      FROM KafkaBrokerSample 
      WHERE clusterName LIKE '%strimzi%' 
      SINCE 30 minutes ago`
    },
    {
      name: 'Replication metrics',
      query: `SELECT 
        average(replication.isrExpandsPerSecond) AS 'ISR Expands/sec',
        average(replication.isrShrinksPerSecond) AS 'ISR Shrinks/sec',
        average(replication.leaderElectionPerSecond) AS 'Leader Elections/sec',
        sum(replication.unreplicatedPartitions) AS 'Total Unreplicated'
      FROM KafkaBrokerSample 
      WHERE clusterName LIKE '%strimzi%' 
      SINCE 30 minutes ago`
    }
  ];
  
  // Execute queries
  const results = {};
  for (const queryDef of queries) {
    const spinner = ora(`Executing: ${queryDef.name}`).start();
    try {
      const result = await client.query(`
        {
          actor {
            account(id: ${config.accountId}) {
              nrql(query: "${queryDef.query.replace(/"/g, '\\"')}") {
                results
              }
            }
          }
        }
      `);
      
      results[queryDef.name] = result.data.actor.account.nrql.results;
      spinner.succeed(`${queryDef.name}`);
      
      // Display results
      if (result.data.actor.account.nrql.results.length > 0) {
        console.log(chalk.green('  Results:'));
        result.data.actor.account.nrql.results.forEach(row => {
          console.log('  ', JSON.stringify(row, null, 2));
        });
      } else {
        console.log(chalk.yellow('  No data found'));
      }
      console.log('');
      
    } catch (error) {
      spinner.fail(`${queryDef.name}`);
      console.error(chalk.red('  Error:'), error.message);
      results[queryDef.name] = { error: error.message };
    }
  }
  
  // Save results
  const fs = require('fs').promises;
  const timestamp = new Date().toISOString();
  const filename = `strimzi-kafka-metrics-verification-${Date.now()}.json`;
  
  await fs.writeFile(
    filename,
    JSON.stringify({
      timestamp,
      accountId: config.accountId,
      queries: queries.map(q => ({
        name: q.name,
        query: q.query,
        results: results[q.name]
      }))
    }, null, 2)
  );
  
  console.log(chalk.green(`\n✅ Results saved to: ${filename}`));
  
  // Summary
  console.log(chalk.blue('\n=== Summary ==='));
  console.log('\nData availability:');
  
  const hasData = (name) => {
    const result = results[name];
    return result && !result.error && result.length > 0 && 
           Object.values(result[0]).some(v => v && v !== 0);
  };
  
  console.log(`KafkaBrokerSample (strimzi-production-kafka): ${hasData('Check KafkaBrokerSample for strimzi-production-kafka') ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`KafkaConsumerSample: ${hasData('Check for consumer metrics') ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`KafkaProducerSample: ${hasData('Check for producer metrics') ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`KafkaTopicSample: ${hasData('Check for topic metrics') ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`KafkaOffsetSample: ${hasData('Check for consumer offset/lag metrics') ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`AwsMskClusterSample: ${hasData('Check MSK entity types - AwsMskClusterSample') ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`AwsMskBrokerSample: ${hasData('Check MSK entity types - AwsMskBrokerSample') ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`AwsMskTopicSample: ${hasData('Check MSK entity types - AwsMskTopicSample') ? chalk.green('✓') : chalk.red('✗')}`);
  
  return results;
}

// Run verification
if (require.main === module) {
  verifyStrimziMetrics().catch(console.error);
}

module.exports = { verifyStrimziMetrics };