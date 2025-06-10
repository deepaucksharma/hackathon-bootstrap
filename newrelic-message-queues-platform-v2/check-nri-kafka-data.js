#!/usr/bin/env node

/**
 * Check nri-kafka Data
 * 
 * Verifies that nri-kafka is sending data to New Relic
 * and shows sample data structure
 */

import 'dotenv/config';
import chalk from 'chalk';
import https from 'https';

console.log(chalk.blue.bold(`
╔═══════════════════════════════════════════════════════════════╗
║            nri-kafka Data Verification                        ║
╚═══════════════════════════════════════════════════════════════╝
`));

const config = {
  accountId: process.env.NEW_RELIC_ACCOUNT_ID,
  apiKey: process.env.NEW_RELIC_API_KEY,
  region: process.env.NEW_RELIC_REGION || 'US'
};

// Validate config
if (!config.accountId || !config.apiKey) {
  console.log(chalk.red('❌ Missing required environment variables'));
  console.log(chalk.yellow('Required: NEW_RELIC_ACCOUNT_ID, NEW_RELIC_API_KEY'));
  process.exit(1);
}

console.log(chalk.cyan('📋 Configuration:'));
console.log(chalk.gray(`   Account ID: ${config.accountId}`));
console.log(chalk.gray(`   Region: ${config.region}`));
console.log('');

async function runNRQL(query) {
  const endpoint = config.region === 'EU' ? 'api.eu.newrelic.com' : 'api.newrelic.com';
  
  return new Promise((resolve, reject) => {
    const graphqlQuery = {
      query: `
        query($accountId: Int!, $nrqlQuery: Nrql!) {
          actor {
            account(id: $accountId) {
              nrql(query: $nrqlQuery) {
                results
              }
            }
          }
        }
      `,
      variables: {
        accountId: parseInt(config.accountId),
        nrqlQuery: query
      }
    };

    const postData = JSON.stringify(graphqlQuery);
    
    const options = {
      hostname: endpoint,
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': config.apiKey,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.errors) {
            reject(new Error(JSON.stringify(response.errors)));
          } else {
            resolve(response.data?.actor?.account?.nrql?.results || []);
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function checkKafkaData() {
  try {
    // 1. Check for KafkaBrokerSample data
    console.log(chalk.blue('1️⃣  Checking for KafkaBrokerSample data...'));
    const brokerCountQuery = `FROM KafkaBrokerSample SELECT count(*) SINCE 5 minutes ago`;
    const brokerCount = await runNRQL(brokerCountQuery);
    
    if (brokerCount[0]?.count > 0) {
      console.log(chalk.green(`   ✅ Found ${brokerCount[0].count} broker samples`));
      
      // Get sample broker data
      const brokerSampleQuery = `FROM KafkaBrokerSample SELECT * LIMIT 1 SINCE 5 minutes ago`;
      const brokerSample = await runNRQL(brokerSampleQuery);
      
      if (brokerSample[0]) {
        console.log(chalk.gray('   Sample broker data:'));
        console.log(chalk.gray(`   - Cluster: ${brokerSample[0].clusterName || 'N/A'}`));
        console.log(chalk.gray(`   - Broker ID: ${brokerSample[0]['broker.id'] || brokerSample[0].brokerId || 'N/A'}`));
        console.log(chalk.gray(`   - Hostname: ${brokerSample[0].hostname || 'N/A'}`));
        console.log(chalk.gray(`   - Messages/sec: ${brokerSample[0]['broker.messagesInPerSecond'] || 'N/A'}`));
      }
    } else {
      console.log(chalk.yellow('   ⚠️  No KafkaBrokerSample data found'));
    }
    
    // 2. Check for KafkaTopicSample data
    console.log(chalk.blue('\n2️⃣  Checking for KafkaTopicSample data...'));
    const topicCountQuery = `FROM KafkaTopicSample SELECT count(*) SINCE 5 minutes ago`;
    const topicCount = await runNRQL(topicCountQuery);
    
    if (topicCount[0]?.count > 0) {
      console.log(chalk.green(`   ✅ Found ${topicCount[0].count} topic samples`));
      
      // Get unique topics
      const uniqueTopicsQuery = `FROM KafkaTopicSample SELECT uniqueCount(topicName) SINCE 5 minutes ago`;
      const uniqueTopics = await runNRQL(uniqueTopicsQuery);
      console.log(chalk.gray(`   Unique topics: ${uniqueTopics[0]['uniqueCount.topicName'] || 'N/A'}`));
    } else {
      console.log(chalk.yellow('   ⚠️  No KafkaTopicSample data found'));
    }
    
    // 3. Check for KafkaConsumerSample data
    console.log(chalk.blue('\n3️⃣  Checking for KafkaConsumerSample data...'));
    const consumerCountQuery = `FROM KafkaConsumerSample SELECT count(*) SINCE 5 minutes ago`;
    const consumerCount = await runNRQL(consumerCountQuery);
    
    if (consumerCount[0]?.count > 0) {
      console.log(chalk.green(`   ✅ Found ${consumerCount[0].count} consumer samples`));
    } else {
      console.log(chalk.yellow('   ⚠️  No KafkaConsumerSample data found'));
    }
    
    // 4. Check existing MESSAGE_QUEUE entities
    console.log(chalk.blue('\n4️⃣  Checking for existing MESSAGE_QUEUE entities...'));
    const entityQuery = `FROM MessageQueue SELECT count(*) WHERE entityType LIKE 'MESSAGE_QUEUE_%' SINCE 1 hour ago`;
    const entityCount = await runNRQL(entityQuery);
    
    if (entityCount[0]?.count > 0) {
      console.log(chalk.green(`   ✅ Found ${entityCount[0].count} MESSAGE_QUEUE entities`));
      
      // Get entity breakdown
      const entityBreakdownQuery = `FROM MessageQueue SELECT count(*) FACET entityType WHERE entityType LIKE 'MESSAGE_QUEUE_%' SINCE 1 hour ago`;
      const breakdown = await runNRQL(entityBreakdownQuery);
      
      breakdown.forEach(item => {
        if (item.facet) {
          console.log(chalk.gray(`   - ${item.facet}: ${item.count}`));
        }
      });
    } else {
      console.log(chalk.yellow('   ⚠️  No MESSAGE_QUEUE entities found yet'));
    }
    
    // 5. Get cluster names
    console.log(chalk.blue('\n5️⃣  Detecting Kafka clusters...'));
    const clusterQuery = `FROM KafkaBrokerSample SELECT uniqueCount(broker.id) FACET clusterName SINCE 5 minutes ago LIMIT 10`;
    const clusters = await runNRQL(clusterQuery);
    
    if (clusters.length > 0) {
      console.log(chalk.green(`   ✅ Found ${clusters.length} Kafka cluster(s):`));
      clusters.forEach(cluster => {
        if (cluster.facet) {
          console.log(chalk.gray(`   - ${cluster.facet}: ${cluster['uniqueCount.broker.id']} brokers`));
        }
      });
    }
    
    // Summary
    console.log(chalk.blue('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    
    const hasData = brokerCount[0]?.count > 0;
    if (hasData) {
      console.log(chalk.green('\n✅ nri-kafka is sending data successfully!'));
      console.log(chalk.cyan('\nYou can now run the platform in infrastructure mode:'));
      console.log(chalk.white('   PLATFORM_MODE=infrastructure node run-platform-unified.js'));
      
      if (clusters.length > 0 && clusters[0].facet) {
        console.log(chalk.cyan('\nOr specify a cluster:'));
        console.log(chalk.white(`   KAFKA_CLUSTER_NAME="${clusters[0].facet}" PLATFORM_MODE=infrastructure node run-platform-unified.js`));
      }
    } else {
      console.log(chalk.red('\n❌ No nri-kafka data found'));
      console.log(chalk.yellow('\nTroubleshooting steps:'));
      console.log('1. Verify nri-kafka is installed on your Kafka brokers');
      console.log('2. Check nri-kafka configuration file');
      console.log('3. Ensure Kafka brokers are running');
      console.log('4. Check New Relic infrastructure agent logs');
    }
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error checking data:'), error.message);
    
    if (error.message.includes('403')) {
      console.log(chalk.yellow('\n⚠️  API key may be invalid or lack necessary permissions'));
    }
  }
}

// Run the check
checkKafkaData().catch(console.error);