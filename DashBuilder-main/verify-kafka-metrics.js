#!/usr/bin/env node

/**
 * Verify Kafka Metrics Collection
 */

require('dotenv').config();
const { createDashboardBuilder } = require('./src');
const ora = require('ora');
const chalk = require('chalk');

async function verifyMetrics() {
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
  const spinner = ora('Verifying Kafka metrics collection...').start();
  
  try {
    // Check standard pipeline metrics
    spinner.text = 'Checking standard pipeline metrics...';
    const standardQuery = `
      FROM KafkaBrokerSample 
      SELECT count(*) AS samples, 
             uniques(metricName) AS uniqueMetrics,
             latest(broker.messagesInPerSecond) AS latestMessagesInPerSec
      WHERE pipeline IS NULL 
      SINCE 5 minutes ago
    `;
    
    const standardResult = await builder.nerdgraphQuery(`
      query($accountId: Int!, $nrql: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrql) {
              results
            }
          }
        }
      }
    `, { accountId: config.accountId, nrql: standardQuery });
    
    // Check custom pipeline metrics
    spinner.text = 'Checking custom pipeline metrics...';
    const customQuery = `
      FROM KafkaBrokerSample 
      SELECT count(*) AS samples, 
             uniques(metricName) AS uniqueMetrics,
             latest(broker.messagesInPerSecond) AS latestMessagesInPerSec
      WHERE pipeline = 'custom' 
      SINCE 5 minutes ago
    `;
    
    const customResult = await builder.nerdgraphQuery(`
      query($accountId: Int!, $nrql: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrql) {
              results
            }
          }
        }
      }
    `, { accountId: config.accountId, nrql: customQuery });
    
    // Check V2 metrics
    spinner.text = 'Checking V2 enhanced metrics...';
    const v2Query = `
      FROM KafkaBrokerSample 
      SELECT count(*) AS v2Metrics
      WHERE pipeline = 'custom' 
        AND (metricName LIKE '%BytesOutPerSec%' 
             OR metricName LIKE '%MessagesInPerSec%' 
             OR metricName LIKE '%Controller%')
      SINCE 5 minutes ago
    `;
    
    const v2Result = await builder.nerdgraphQuery(`
      query($accountId: Int!, $nrql: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrql) {
              results
            }
          }
        }
      }
    `, { accountId: config.accountId, nrql: v2Query });
    
    // Check topic metrics
    spinner.text = 'Checking topic metrics...';
    const topicQuery = `
      FROM KafkaTopicSample 
      SELECT count(*) AS samples, 
             uniques(topic.name) AS uniqueTopics
      WHERE pipeline = 'custom' 
      SINCE 5 minutes ago
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
    
    spinner.succeed('Metrics verification complete!');
    
    // Display results
    console.log('\n' + chalk.bold('📊 Kafka Metrics Collection Status:'));
    console.log(chalk.gray('─'.repeat(60)));
    
    const standard = standardResult.actor.account.nrql.results[0] || {};
    const custom = customResult.actor.account.nrql.results[0] || {};
    const v2 = v2Result.actor.account.nrql.results[0] || {};
    const topic = topicResult.actor.account.nrql.results[0] || {};
    
    console.log('\n' + chalk.yellow('Standard Pipeline:'));
    console.log(`  Samples (5 min): ${chalk.cyan(standard.samples || 0)}`);
    console.log(`  Unique Metrics: ${chalk.cyan(standard.uniqueMetrics || 0)}`);
    console.log(`  Latest Messages/sec: ${chalk.cyan(standard.latestMessagesInPerSec || 'N/A')}`);
    
    console.log('\n' + chalk.green('Custom Pipeline:'));
    console.log(`  Samples (5 min): ${chalk.cyan(custom.samples || 0)}`);
    console.log(`  Unique Metrics: ${chalk.cyan(custom.uniqueMetrics || 0)}`);
    console.log(`  Latest Messages/sec: ${chalk.cyan(custom.latestMessagesInPerSec || 'N/A')}`);
    
    console.log('\n' + chalk.blue('V2 Enhanced Metrics:'));
    console.log(`  V2 Metrics Count: ${chalk.cyan(v2.v2Metrics || 0)}`);
    
    console.log('\n' + chalk.magenta('Topic Metrics:'));
    console.log(`  Topic Samples: ${chalk.cyan(topic.samples || 0)}`);
    console.log(`  Unique Topics: ${chalk.cyan(topic.uniqueTopics || 0)}`);
    
    // Status summary
    console.log('\n' + chalk.bold('Status Summary:'));
    console.log(chalk.gray('─'.repeat(60)));
    
    if ((standard.samples || 0) > 0) {
      console.log(chalk.green('✓ Standard pipeline is collecting data'));
    } else {
      console.log(chalk.red('✗ Standard pipeline is NOT collecting data'));
    }
    
    if ((custom.samples || 0) > 0) {
      console.log(chalk.green('✓ Custom pipeline is collecting data'));
    } else {
      console.log(chalk.red('✗ Custom pipeline is NOT collecting data'));
    }
    
    if ((v2.v2Metrics || 0) > 0) {
      console.log(chalk.green('✓ V2 enhanced metrics are available'));
    } else {
      console.log(chalk.yellow('⚠ V2 enhanced metrics not detected'));
    }
    
    if ((topic.samples || 0) > 0) {
      console.log(chalk.green('✓ Topic metrics are being collected'));
    } else {
      console.log(chalk.yellow('⚠ Topic metrics not detected'));
    }
    
    console.log('\n' + chalk.blue('Dashboard URL:'));
    console.log(`https://one.newrelic.com/dashboards/detail/MzYzMDA3MnxWSVp8REFTSEJPQVJEfGRhOjEwMTIyMjE1?account=${config.accountId}`);
    
  } catch (error) {
    spinner.fail('Verification failed');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

verifyMetrics();