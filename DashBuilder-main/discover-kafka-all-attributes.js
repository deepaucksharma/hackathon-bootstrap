#!/usr/bin/env node

/**
 * Discover all Kafka attributes and metrics (including V2 metrics)
 */

require('dotenv').config();
const { createDashboardBuilder } = require('./src');
const ora = require('ora');
const chalk = require('chalk');

async function discoverAllKafkaAttributes() {
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
  const spinner = ora('Discovering all Kafka attributes and metrics...').start();
  
  const results = {
    discoveryTime: new Date().toISOString(),
    eventTypes: {},
    v2Metrics: {},
    totalAttributes: 0,
    totalMetrics: 0,
    summary: {}
  };
  
  try {
    // List of Kafka event types to check
    const kafkaEventTypes = [
      'KafkaBrokerSample',
      'KafkaTopicSample',
      'KafkaOffsetSample',
      'KafkaProducerSample',
      'KafkaConsumerSample',
      'AwsMskBrokerSample',
      'AwsMskTopicSample',
      'AwsMskClusterSample'
    ];
    
    for (const eventType of kafkaEventTypes) {
      spinner.text = `Discovering ${eventType} attributes...`;
      
      try {
        // Get all attributes (not just numeric)
        const keysetQuery = `
          SELECT keyset() 
          FROM ${eventType} 
          SINCE 1 day ago 
          LIMIT MAX
        `;
        
        const keysetResult = await builder.nerdgraphQuery(`
          query($accountId: Int!, $nrql: Nrql!) {
            actor {
              account(id: $accountId) {
                nrql(query: $nrql) {
                  results
                }
              }
            }
          }
        `, { accountId: config.accountId, nrql: keysetQuery });
        
        if (keysetResult.actor.account.nrql.results.length > 0) {
          const attributes = keysetResult.actor.account.nrql.results
            .map(r => ({ 
              name: r.key, 
              type: r.type,
              isMetric: r.type === 'numeric'
            }));
          
          results.eventTypes[eventType] = {
            attributes: attributes,
            totalCount: attributes.length,
            metricCount: attributes.filter(a => a.isMetric).length,
            attributeCount: attributes.filter(a => !a.isMetric).length
          };
          
          // Check for specific metrics in different pipelines
          const pipelineQuery = `
            SELECT count(*) 
            FROM ${eventType} 
            FACET pipeline 
            SINCE 1 hour ago
          `;
          
          const pipelineResult = await builder.nerdgraphQuery(`
            query($accountId: Int!, $nrql: Nrql!) {
              actor {
                account(id: $accountId) {
                  nrql(query: $nrql) {
                    results
                  }
                }
              }
            }
          `, { accountId: config.accountId, nrql: pipelineQuery });
          
          results.eventTypes[eventType].pipelines = pipelineResult.actor.account.nrql.results
            .map(r => ({ pipeline: r.pipeline || 'standard', count: r.count }));
        }
      } catch (error) {
        // Event type might not exist
        spinner.text = `${eventType} not found or no data`;
      }
    }
    
    // Check for V2 metrics specifically
    spinner.text = 'Checking for V2 enhanced metrics...';
    const v2MetricsToCheck = [
      'broker.bytesOutPerSec',
      'broker.messagesInPerSec',
      'broker.activeControllerCount',
      'broker.globalPartitionCount',
      'topic.bytesOutPerSec',
      'topic.messagesInPerSec'
    ];
    
    for (const metric of v2MetricsToCheck) {
      const v2Query = `
        SELECT count(*), latest(${metric}) as value
        FROM KafkaBrokerSample, KafkaTopicSample 
        WHERE ${metric} IS NOT NULL
        SINCE 1 hour ago
      `;
      
      try {
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
        
        if (v2Result.actor.account.nrql.results[0]?.count > 0) {
          results.v2Metrics[metric] = {
            available: true,
            sampleCount: v2Result.actor.account.nrql.results[0].count,
            latestValue: v2Result.actor.account.nrql.results[0].value
          };
        } else {
          results.v2Metrics[metric] = { available: false };
        }
      } catch (error) {
        results.v2Metrics[metric] = { available: false };
      }
    }
    
    // Check for topic-specific metrics
    spinner.text = 'Checking for topic-specific metrics...';
    const topicMetricsQuery = `
      SELECT 
        uniques(topic.name) as topics,
        uniques(metricName) as metrics
      FROM KafkaTopicSample, KafkaBrokerSample
      WHERE topic.name IS NOT NULL
      SINCE 1 hour ago
    `;
    
    try {
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
      `, { accountId: config.accountId, nrql: topicMetricsQuery });
      
      results.topicAnalysis = {
        uniqueTopics: topicResult.actor.account.nrql.results[0]?.topics || [],
        topicMetrics: topicResult.actor.account.nrql.results[0]?.metrics || []
      };
    } catch (error) {
      results.topicAnalysis = { uniqueTopics: [], topicMetrics: [] };
    }
    
    // Calculate totals
    results.totalAttributes = Object.values(results.eventTypes)
      .reduce((sum, et) => sum + (et.totalCount || 0), 0);
    results.totalMetrics = Object.values(results.eventTypes)
      .reduce((sum, et) => sum + (et.metricCount || 0), 0);
    
    // Create summary
    results.summary = {
      eventTypesFound: Object.keys(results.eventTypes).length,
      totalAttributes: results.totalAttributes,
      totalMetrics: results.totalMetrics,
      v2MetricsAvailable: Object.values(results.v2Metrics).filter(m => m.available).length,
      topicsFound: results.topicAnalysis?.uniqueTopics?.length || 0
    };
    
    spinner.succeed('Kafka attribute and metric discovery complete!');
    
    // Display results
    console.log('\n' + chalk.bold('📊 Kafka Attributes and Metrics Discovery Results:'));
    console.log(chalk.gray('─'.repeat(80)));
    
    for (const [eventType, data] of Object.entries(results.eventTypes)) {
      console.log('\n' + chalk.yellow(`${eventType}:`));
      console.log(`  Total attributes: ${chalk.cyan(data.totalCount)}`);
      console.log(`  Numeric metrics: ${chalk.green(data.metricCount)}`);
      console.log(`  String attributes: ${chalk.blue(data.attributeCount)}`);
      
      if (data.pipelines && data.pipelines.length > 0) {
        console.log('  Pipelines:');
        for (const pipeline of data.pipelines) {
          console.log(`    - ${pipeline.pipeline}: ${chalk.cyan(pipeline.count)} samples`);
        }
      }
      
      if (data.metricCount > 0) {
        console.log('  Sample metrics:');
        const metrics = data.attributes.filter(a => a.isMetric).slice(0, 10);
        for (const metric of metrics) {
          console.log(`    - ${chalk.green(metric.name)}`);
        }
        if (data.metricCount > 10) {
          console.log(`    ... and ${data.metricCount - 10} more metrics`);
        }
      }
      
      if (data.attributeCount > 0) {
        console.log('  Sample attributes:');
        const attrs = data.attributes.filter(a => !a.isMetric).slice(0, 5);
        for (const attr of attrs) {
          console.log(`    - ${chalk.blue(attr.name)} (${attr.type})`);
        }
        if (data.attributeCount > 5) {
          console.log(`    ... and ${data.attributeCount - 5} more attributes`);
        }
      }
    }
    
    console.log('\n' + chalk.bold('V2 Enhanced Metrics Status:'));
    console.log(chalk.gray('─'.repeat(80)));
    for (const [metric, status] of Object.entries(results.v2Metrics)) {
      if (status.available) {
        console.log(chalk.green(`✓ ${metric}: Available (${status.sampleCount} samples)`));
      } else {
        console.log(chalk.red(`✗ ${metric}: Not available`));
      }
    }
    
    if (results.topicAnalysis && results.topicAnalysis.uniqueTopics.length > 0) {
      console.log('\n' + chalk.bold('Topic Analysis:'));
      console.log(chalk.gray('─'.repeat(80)));
      console.log(`Unique topics found: ${chalk.cyan(results.topicAnalysis.uniqueTopics.length)}`);
      console.log('Sample topics:');
      const sampleTopics = results.topicAnalysis.uniqueTopics.slice(0, 5);
      for (const topic of sampleTopics) {
        console.log(`  - ${chalk.magenta(topic)}`);
      }
      if (results.topicAnalysis.uniqueTopics.length > 5) {
        console.log(`  ... and ${results.topicAnalysis.uniqueTopics.length - 5} more topics`);
      }
    }
    
    console.log('\n' + chalk.bold('Summary:'));
    console.log(chalk.gray('─'.repeat(80)));
    console.log(`Event Types Found: ${chalk.cyan(results.summary.eventTypesFound)}`);
    console.log(`Total Attributes: ${chalk.cyan(results.summary.totalAttributes)}`);
    console.log(`Total Metrics: ${chalk.cyan(results.summary.totalMetrics)}`);
    console.log(`V2 Metrics Available: ${chalk.cyan(results.summary.v2MetricsAvailable)}`);
    console.log(`Topics Found: ${chalk.cyan(results.summary.topicsFound)}`);
    
    // Save results to file
    const fs = require('fs').promises;
    const filename = `kafka-full-discovery-${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(results, null, 2));
    console.log(`\n✅ Full results saved to: ${chalk.blue(filename)}`);
    
  } catch (error) {
    spinner.fail('Discovery failed');
    console.error(chalk.red('Error:'), error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

discoverAllKafkaAttributes();