#!/usr/bin/env node

/**
 * Discover all Kafka-related metrics
 */

require('dotenv').config();
const { createDashboardBuilder } = require('./src');
const ora = require('ora');
const chalk = require('chalk');

async function discoverKafkaMetrics() {
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
  const spinner = ora('Discovering Kafka metrics...').start();
  
  const results = {
    discoveryTime: new Date().toISOString(),
    eventTypes: {},
    totalMetrics: 0,
    summary: {}
  };
  
  try {
    // Discover KafkaBrokerSample metrics
    spinner.text = 'Discovering KafkaBrokerSample metrics...';
    const brokerQuery = `
      SELECT keyset() 
      FROM KafkaBrokerSample 
      SINCE 1 hour ago 
      LIMIT 1
    `;
    
    const brokerResult = await builder.nerdgraphQuery(`
      query($accountId: Int!, $nrql: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrql) {
              results
            }
          }
        }
      }
    `, { accountId: config.accountId, nrql: brokerQuery });
    
    const brokerMetrics = brokerResult.actor.account.nrql.results
      .filter(r => r.key && r.type === 'numeric')
      .map(r => ({ name: r.key, type: r.type }));
    
    results.eventTypes.KafkaBrokerSample = {
      metrics: brokerMetrics,
      count: brokerMetrics.length
    };
    
    // Discover KafkaTopicSample metrics
    spinner.text = 'Discovering KafkaTopicSample metrics...';
    const topicQuery = `
      SELECT keyset() 
      FROM KafkaTopicSample 
      SINCE 1 hour ago 
      LIMIT 1
    `;
    
    const topicResult = await builder.nerdgraphQuery(`
      query($accountId: Int!, $nrql: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrql) {
              results
            }
          }
        }
      }
    `, { accountId: config.accountId, nrql: topicQuery });
    
    const topicMetrics = topicResult.actor.account.nrql.results
      .filter(r => r.key && r.type === 'numeric')
      .map(r => ({ name: r.key, type: r.type }));
    
    results.eventTypes.KafkaTopicSample = {
      metrics: topicMetrics,
      count: topicMetrics.length
    };
    
    // Discover KafkaOffsetSample metrics
    spinner.text = 'Discovering KafkaOffsetSample metrics...';
    const offsetQuery = `
      SELECT keyset() 
      FROM KafkaOffsetSample 
      SINCE 1 hour ago 
      LIMIT 1
    `;
    
    const offsetResult = await builder.nerdgraphQuery(`
      query($accountId: Int!, $nrql: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrql) {
              results
            }
          }
        }
      }
    `, { accountId: config.accountId, nrql: offsetQuery });
    
    const offsetMetrics = offsetResult.actor.account.nrql.results
      .filter(r => r.key && r.type === 'numeric')
      .map(r => ({ name: r.key, type: r.type }));
    
    results.eventTypes.KafkaOffsetSample = {
      metrics: offsetMetrics,
      count: offsetMetrics.length
    };
    
    // Discover KafkaProducerSample metrics
    spinner.text = 'Discovering KafkaProducerSample metrics...';
    const producerQuery = `
      SELECT keyset() 
      FROM KafkaProducerSample 
      SINCE 1 hour ago 
      LIMIT 1
    `;
    
    const producerResult = await builder.nerdgraphQuery(`
      query($accountId: Int!, $nrql: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrql) {
              results
            }
          }
        }
      }
    `, { accountId: config.accountId, nrql: producerQuery });
    
    const producerMetrics = producerResult.actor.account.nrql.results
      .filter(r => r.key && r.type === 'numeric')
      .map(r => ({ name: r.key, type: r.type }));
    
    results.eventTypes.KafkaProducerSample = {
      metrics: producerMetrics,
      count: producerMetrics.length
    };
    
    // Discover KafkaConsumerSample metrics
    spinner.text = 'Discovering KafkaConsumerSample metrics...';
    const consumerQuery = `
      SELECT keyset() 
      FROM KafkaConsumerSample 
      SINCE 1 hour ago 
      LIMIT 1
    `;
    
    const consumerResult = await builder.nerdgraphQuery(`
      query($accountId: Int!, $nrql: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrql) {
              results
            }
          }
        }
      }
    `, { accountId: config.accountId, nrql: consumerQuery });
    
    const consumerMetrics = consumerResult.actor.account.nrql.results
      .filter(r => r.key && r.type === 'numeric')
      .map(r => ({ name: r.key, type: r.type }));
    
    results.eventTypes.KafkaConsumerSample = {
      metrics: consumerMetrics,
      count: consumerMetrics.length
    };
    
    // Check for MSK metrics
    spinner.text = 'Checking for AWS MSK metrics...';
    const mskQuery = `
      SELECT keyset() 
      FROM AwsMskBrokerSample 
      SINCE 1 hour ago 
      LIMIT 1
    `;
    
    try {
      const mskResult = await builder.nerdgraphQuery(`
        query($accountId: Int!, $nrql: Nrql!) {
          actor {
            account(id: $accountId) {
              nrql(query: $nrql) {
                results
              }
            }
          }
        }
      `, { accountId: config.accountId, nrql: mskQuery });
      
      const mskMetrics = mskResult.actor.account.nrql.results
        .filter(r => r.key && r.type === 'numeric')
        .map(r => ({ name: r.key, type: r.type }));
      
      if (mskMetrics.length > 0) {
        results.eventTypes.AwsMskBrokerSample = {
          metrics: mskMetrics,
          count: mskMetrics.length
        };
      }
    } catch (error) {
      // MSK might not be available
    }
    
    // Check for Metric event type with Kafka metrics
    spinner.text = 'Checking for Kafka metrics in Metric event type...';
    const metricQuery = `
      SELECT keyset() 
      FROM Metric 
      WHERE metricName LIKE '%kafka%' 
      SINCE 1 hour ago 
      LIMIT 1
    `;
    
    try {
      const metricResult = await builder.nerdgraphQuery(`
        query($accountId: Int!, $nrql: Nrql!) {
          actor {
            account(id: $accountId) {
              nrql(query: $nrql) {
                results
              }
            }
          }
        }
      `, { accountId: config.accountId, nrql: metricQuery });
      
      const kafkaMetrics = metricResult.actor.account.nrql.results
        .filter(r => r.key && r.type === 'numeric')
        .map(r => ({ name: r.key, type: r.type }));
      
      if (kafkaMetrics.length > 0) {
        results.eventTypes['Metric (Kafka)'] = {
          metrics: kafkaMetrics,
          count: kafkaMetrics.length
        };
      }
    } catch (error) {
      // Metric event type might not have Kafka metrics
    }
    
    // Calculate totals
    results.totalMetrics = Object.values(results.eventTypes)
      .reduce((sum, et) => sum + et.count, 0);
    
    // Create summary
    results.summary = {
      eventTypesFound: Object.keys(results.eventTypes).length,
      brokerMetrics: results.eventTypes.KafkaBrokerSample?.count || 0,
      topicMetrics: results.eventTypes.KafkaTopicSample?.count || 0,
      offsetMetrics: results.eventTypes.KafkaOffsetSample?.count || 0,
      producerMetrics: results.eventTypes.KafkaProducerSample?.count || 0,
      consumerMetrics: results.eventTypes.KafkaConsumerSample?.count || 0,
      mskMetrics: results.eventTypes.AwsMskBrokerSample?.count || 0
    };
    
    spinner.succeed('Kafka metrics discovery complete!');
    
    // Display results
    console.log('\n' + chalk.bold('📊 Kafka Metrics Discovery Results:'));
    console.log(chalk.gray('─'.repeat(80)));
    
    for (const [eventType, data] of Object.entries(results.eventTypes)) {
      console.log('\n' + chalk.yellow(`${eventType}:`));
      console.log(`  Total metrics: ${chalk.cyan(data.count)}`);
      
      if (data.count > 0) {
        console.log('  Sample metrics:');
        const sampleMetrics = data.metrics.slice(0, 10);
        for (const metric of sampleMetrics) {
          console.log(`    - ${chalk.green(metric.name)} (${metric.type})`);
        }
        if (data.metrics.length > 10) {
          console.log(`    ... and ${data.metrics.length - 10} more`);
        }
      }
    }
    
    console.log('\n' + chalk.bold('Summary:'));
    console.log(chalk.gray('─'.repeat(80)));
    console.log(`Total Event Types: ${chalk.cyan(results.summary.eventTypesFound)}`);
    console.log(`Total Metrics: ${chalk.cyan(results.totalMetrics)}`);
    console.log('\nBreakdown:');
    console.log(`  KafkaBrokerSample: ${chalk.cyan(results.summary.brokerMetrics)} metrics`);
    console.log(`  KafkaTopicSample: ${chalk.cyan(results.summary.topicMetrics)} metrics`);
    console.log(`  KafkaOffsetSample: ${chalk.cyan(results.summary.offsetMetrics)} metrics`);
    console.log(`  KafkaProducerSample: ${chalk.cyan(results.summary.producerMetrics)} metrics`);
    console.log(`  KafkaConsumerSample: ${chalk.cyan(results.summary.consumerMetrics)} metrics`);
    if (results.summary.mskMetrics > 0) {
      console.log(`  AwsMskBrokerSample: ${chalk.cyan(results.summary.mskMetrics)} metrics`);
    }
    
    // Save results to file
    const fs = require('fs').promises;
    const filename = `kafka-metrics-discovery-${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(results, null, 2));
    console.log(`\n✅ Full results saved to: ${chalk.blue(filename)}`);
    
  } catch (error) {
    spinner.fail('Discovery failed');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

discoverKafkaMetrics();