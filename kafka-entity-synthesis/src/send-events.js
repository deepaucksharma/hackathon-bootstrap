#!/usr/bin/env node

/**
 * Send MSK Events - Main script to create Kafka/MSK entities in New Relic
 * 
 * Uses the cloud-integrations format that makes entities appear in the UI.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { loadEnv, parseArgs, generateGUID, hashCode } = require('./lib/common');

// Load environment
const env = loadEnv();

class MSKEventSender {
  constructor(options = {}) {
    this.config = {
      clusterName: options.clusterName || `${env.CLUSTER_PREFIX || 'msk-cluster'}-${Date.now()}`,
      brokerCount: options.brokers || 3,
      topicCount: options.topics || 3,
      awsAccountId: env.AWS_ACCOUNT_ID || '123456789012',
      awsRegion: env.AWS_REGION || 'us-east-1',
      accountId: env.NEW_RELIC_ACCOUNT_ID,
      licenseKey: env.NEW_RELIC_LICENSE_KEY,
      dryRun: options.dryRun || false
    };

    this.timestamp = Date.now();
    this.sentEvents = [];
    this.topicNames = this.generateTopicNames();
  }

  generateTopicNames() {
    const defaultTopics = ['orders', 'payments', 'inventory', 'users', 'events', 'logs', 'metrics', 'notifications'];
    return defaultTopics.slice(0, this.config.topicCount);
  }

  async send() {
    console.log('🚀 Sending MSK Events to New Relic\n');
    console.log(`Cluster: ${this.config.clusterName}`);
    console.log(`Brokers: ${this.config.brokerCount}`);
    console.log(`Topics: ${this.config.topicCount}`);
    console.log(`Account: ${this.config.accountId}`);
    
    if (this.config.dryRun) {
      console.log('\n⚠️  DRY RUN MODE - No events will be sent\n');
    }

    try {
      // Send all event types
      await this.sendClusterEvents();
      await this.sendBrokerEvents();
      await this.sendTopicEvents();

      console.log(`\n✅ Successfully sent ${this.sentEvents.length} events!`);
      
      if (!this.config.dryRun) {
        this.printNextSteps();
        this.saveResults();
      }
    } catch (error) {
      console.error('\n❌ Error sending events:', error.message);
      process.exit(1);
    }
  }

  async sendClusterEvents() {
    console.log('\n📊 Sending Cluster Events...');
    
    const events = [];
    
    // Create multiple events to simulate polling intervals
    for (let i = 0; i < 3; i++) {
      const event = this.createClusterEvent(i);
      events.push(event);
    }
    
    await this.sendEventBatch(events);
    console.log(`  ✅ Sent ${events.length} cluster events`);
  }

  async sendBrokerEvents() {
    console.log('\n📊 Sending Broker Events...');
    
    const events = [];
    
    for (let brokerId = 1; brokerId <= this.config.brokerCount; brokerId++) {
      // Multiple events per broker (simulating polling)
      for (let i = 0; i < 3; i++) {
        const event = this.createBrokerEvent(brokerId, i);
        events.push(event);
      }
    }
    
    await this.sendEventBatch(events);
    console.log(`  ✅ Sent ${events.length} broker events`);
  }

  async sendTopicEvents() {
    console.log('\n📊 Sending Topic Events...');
    
    const events = [];
    
    for (const topicName of this.topicNames) {
      // Multiple events per topic
      for (let i = 0; i < 3; i++) {
        const event = this.createTopicEvent(topicName, i);
        events.push(event);
      }
    }
    
    await this.sendEventBatch(events);
    console.log(`  ✅ Sent ${events.length} topic events`);
  }

  createClusterEvent(offset) {
    return {
      eventType: 'AwsMskClusterSample',
      timestamp: this.timestamp - (offset * 60000),
      
      // Entity identification
      entityName: this.config.clusterName,
      entityGuid: generateGUID('cluster', this.config.clusterName, this.config.accountId),
      entityId: Math.abs(hashCode(`cluster:${this.config.clusterName}`)).toString(),
      displayName: this.config.clusterName,
      
      // Provider fields - CRITICAL!
      provider: 'AwsMskCluster',
      providerAccountId: this.config.accountId,
      providerAccountName: 'Kafka Cluster',
      providerExternalId: this.config.awsAccountId,
      
      // Collector info - CRITICAL!
      'collector.name': 'cloud-integrations',
      'collector.version': 'release-1973',
      'instrumentation.provider': 'aws',
      
      // AWS fields
      awsAccountId: this.config.awsAccountId,
      awsRegion: this.config.awsRegion,
      
      // Data source
      dataSourceId: '999999',
      dataSourceName: 'Managed Kafka',
      
      // Cluster fields
      'provider.clusterName': this.config.clusterName,
      'provider.awsRegion': this.config.awsRegion,
      
      // Metrics with aggregations
      'provider.activeControllerCount.Sum': 1,
      'provider.activeControllerCount.Average': 1,
      'provider.activeControllerCount.Maximum': 1,
      'provider.activeControllerCount.Minimum': 1,
      'provider.activeControllerCount.SampleCount': 1,
      
      'provider.offlinePartitionsCount.Sum': 0,
      'provider.offlinePartitionsCount.Average': 0,
      'provider.offlinePartitionsCount.Maximum': 0,
      'provider.offlinePartitionsCount.Minimum': 0,
      'provider.offlinePartitionsCount.SampleCount': 1,
      
      'provider.globalPartitionCount.Sum': this.config.topicCount * 3,
      'provider.globalPartitionCount.Average': this.config.topicCount * 3,
      'provider.globalPartitionCount.Maximum': this.config.topicCount * 3,
      'provider.globalPartitionCount.Minimum': this.config.topicCount * 3,
      'provider.globalPartitionCount.SampleCount': 1,
      
      'provider.globalTopicCount.Sum': this.config.topicCount,
      'provider.globalTopicCount.Average': this.config.topicCount,
      'provider.globalTopicCount.Maximum': this.config.topicCount,
      'provider.globalTopicCount.Minimum': this.config.topicCount,
      'provider.globalTopicCount.SampleCount': 1
    };
  }

  createBrokerEvent(brokerId, offset) {
    const bytesIn = 1000000 * brokerId;
    const bytesOut = 800000 * brokerId;
    const messagesIn = 1000 * brokerId;
    
    return {
      eventType: 'AwsMskBrokerSample',
      timestamp: this.timestamp - (offset * 60000),
      
      // Entity identification
      entityName: `${brokerId}:${this.config.clusterName}`,
      entityGuid: generateGUID('broker', `${brokerId}:${this.config.clusterName}`, this.config.accountId),
      entityId: Math.abs(hashCode(`broker:${brokerId}:${this.config.clusterName}`)).toString(),
      
      // Provider fields
      provider: 'AwsMskBroker',
      providerAccountId: this.config.accountId,
      providerAccountName: 'Kafka Cluster',
      providerExternalId: this.config.awsAccountId,
      
      // Collector info
      'collector.name': 'cloud-integrations',
      'collector.version': 'release-1973',
      'instrumentation.provider': 'aws',
      
      // AWS fields
      awsAccountId: this.config.awsAccountId,
      awsRegion: this.config.awsRegion,
      
      // Broker identification
      'provider.brokerId': brokerId.toString(),
      'provider.clusterName': this.config.clusterName,
      'provider.awsRegion': this.config.awsRegion,
      
      // Performance metrics
      'provider.bytesInPerSec.Sum': bytesIn * 2,
      'provider.bytesInPerSec.Average': bytesIn,
      'provider.bytesInPerSec.Maximum': bytesIn * 1.5,
      'provider.bytesInPerSec.Minimum': bytesIn * 0.5,
      'provider.bytesInPerSec.SampleCount': 2,
      
      'provider.bytesOutPerSec.Sum': bytesOut * 2,
      'provider.bytesOutPerSec.Average': bytesOut,
      'provider.bytesOutPerSec.Maximum': bytesOut * 1.5,
      'provider.bytesOutPerSec.Minimum': bytesOut * 0.5,
      'provider.bytesOutPerSec.SampleCount': 2,
      
      'provider.messagesInPerSec.Sum': messagesIn * 2,
      'provider.messagesInPerSec.Average': messagesIn,
      'provider.messagesInPerSec.Maximum': messagesIn * 1.5,
      'provider.messagesInPerSec.Minimum': messagesIn * 0.5,
      'provider.messagesInPerSec.SampleCount': 2,
      
      // CPU metrics
      'provider.cpuUser.Sum': 50,
      'provider.cpuUser.Average': 25,
      'provider.cpuUser.Maximum': 30,
      'provider.cpuUser.Minimum': 20,
      'provider.cpuUser.SampleCount': 2,
      
      'provider.cpuSystem.Sum': 30,
      'provider.cpuSystem.Average': 15,
      'provider.cpuSystem.Maximum': 20,
      'provider.cpuSystem.Minimum': 10,
      'provider.cpuSystem.SampleCount': 2,
      
      'provider.cpuIdle.Sum': 120,
      'provider.cpuIdle.Average': 60,
      'provider.cpuIdle.Maximum': 70,
      'provider.cpuIdle.Minimum': 50,
      'provider.cpuIdle.SampleCount': 2,
      
      // Leadership
      'provider.leaderCount.Sum': Math.ceil(this.config.topicCount / this.config.brokerCount) * 3,
      'provider.leaderCount.Average': Math.ceil(this.config.topicCount / this.config.brokerCount) * 3,
      'provider.leaderCount.Maximum': Math.ceil(this.config.topicCount / this.config.brokerCount) * 3,
      'provider.leaderCount.Minimum': 0,
      'provider.leaderCount.SampleCount': 2
    };
  }

  createTopicEvent(topicName, offset) {
    return {
      eventType: 'AwsMskTopicSample',
      timestamp: this.timestamp - (offset * 60000),
      
      // Entity identification
      entityName: `${this.config.clusterName}:${topicName}`,
      entityGuid: generateGUID('topic', `${this.config.clusterName}:${topicName}`, this.config.accountId),
      entityId: Math.abs(hashCode(`topic:${this.config.clusterName}:${topicName}`)).toString(),
      
      // Provider fields
      provider: 'AwsMskTopic',
      providerAccountId: this.config.accountId,
      providerAccountName: 'Kafka Cluster',
      providerExternalId: this.config.awsAccountId,
      
      // Collector info
      'collector.name': 'cloud-integrations',
      'collector.version': 'release-1973',
      'instrumentation.provider': 'aws',
      
      // AWS fields
      awsAccountId: this.config.awsAccountId,
      awsRegion: this.config.awsRegion,
      
      // Topic identification
      'provider.topicName': topicName,
      'provider.clusterName': this.config.clusterName,
      'provider.awsRegion': this.config.awsRegion,
      
      // Topic metrics
      'provider.messagesInPerSec.Sum': 200,
      'provider.messagesInPerSec.Average': 100,
      'provider.messagesInPerSec.Maximum': 150,
      'provider.messagesInPerSec.Minimum': 50,
      'provider.messagesInPerSec.SampleCount': 2,
      
      'provider.bytesInPerSec.Sum': 20000,
      'provider.bytesInPerSec.Average': 10000,
      'provider.bytesInPerSec.Maximum': 15000,
      'provider.bytesInPerSec.Minimum': 5000,
      'provider.bytesInPerSec.SampleCount': 2,
      
      'provider.bytesOutPerSec.Sum': 16000,
      'provider.bytesOutPerSec.Average': 8000,
      'provider.bytesOutPerSec.Maximum': 12000,
      'provider.bytesOutPerSec.Minimum': 4000,
      'provider.bytesOutPerSec.SampleCount': 2
    };
  }

  async sendEventBatch(events) {
    if (this.config.dryRun) {
      console.log(`  🔍 Would send ${events.length} events`);
      this.sentEvents.push(...events);
      return;
    }

    return new Promise((resolve, reject) => {
      const data = JSON.stringify(events);
      
      const options = {
        hostname: 'insights-collector.newrelic.com',
        path: `/v1/accounts/${this.config.accountId}/events`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Insert-Key': this.config.licenseKey,
          'Content-Length': data.length
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            this.sentEvents.push(...events);
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  printNextSteps() {
    console.log('\n📋 Next Steps:');
    console.log('1. Wait 2-5 minutes for entity synthesis');
    console.log('2. Validate entities appeared:');
    console.log(`   node src/validate-ui.js --cluster-name ${this.config.clusterName}`);
    console.log('3. View in Message Queues UI:');
    console.log('   https://one.newrelic.com/nr1-core/apm-services/message-queues');
    console.log('\n📊 Query to check events:');
    console.log(`   FROM AwsMskClusterSample SELECT * WHERE entityName = '${this.config.clusterName}' SINCE 10 minutes ago`);
  }

  saveResults() {
    const resultsDir = path.join(__dirname, '..', 'results');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(resultsDir, `events-sent-${timestamp}.json`);
    
    const summary = {
      timestamp: new Date().toISOString(),
      config: this.config,
      eventsSent: {
        total: this.sentEvents.length,
        byType: {
          AwsMskClusterSample: this.sentEvents.filter(e => e.eventType === 'AwsMskClusterSample').length,
          AwsMskBrokerSample: this.sentEvents.filter(e => e.eventType === 'AwsMskBrokerSample').length,
          AwsMskTopicSample: this.sentEvents.filter(e => e.eventType === 'AwsMskTopicSample').length
        }
      },
      sampleEvent: this.sentEvents[0],
      queries: {
        checkCluster: `FROM AwsMskClusterSample SELECT * WHERE entityName = '${this.config.clusterName}' SINCE 30 minutes ago`,
        checkBrokers: `FROM AwsMskBrokerSample SELECT * WHERE provider.clusterName = '${this.config.clusterName}' SINCE 30 minutes ago`,
        checkTopics: `FROM AwsMskTopicSample SELECT * WHERE provider.clusterName = '${this.config.clusterName}' SINCE 30 minutes ago`
      }
    };
    
    fs.writeFileSync(filename, JSON.stringify(summary, null, 2));
    console.log(`\n📁 Results saved to: ${path.relative(process.cwd(), filename)}`);
  }
}

// Command line interface
async function main() {
  const args = parseArgs(process.argv.slice(2), {
    'cluster-name': { type: 'string', description: 'Custom cluster name' },
    'brokers': { type: 'number', description: 'Number of brokers', default: 3 },
    'topics': { type: 'number', description: 'Number of topics', default: 3 },
    'dry-run': { type: 'boolean', description: 'Show what would be sent', default: false },
    'help': { type: 'boolean', description: 'Show help', default: false }
  });

  if (args.help) {
    console.log(`
Usage: node src/send-events.js [options]

Options:
  --cluster-name <name>    Custom cluster name
  --brokers <count>        Number of brokers (default: 3)  
  --topics <count>         Number of topics (default: 3)
  --dry-run               Show what would be sent without sending
  --help                  Show this help message

Environment Variables:
  NEW_RELIC_LICENSE_KEY   Your ingest license key (required)
  NEW_RELIC_ACCOUNT_ID    Your account ID (required)
  AWS_ACCOUNT_ID          AWS account ID (default: 123456789012)
  AWS_REGION              AWS region (default: us-east-1)
`);
    process.exit(0);
  }

  const sender = new MSKEventSender({
    clusterName: args['cluster-name'],
    brokers: args.brokers,
    topics: args.topics,
    dryRun: args['dry-run']
  });

  await sender.send();
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

module.exports = MSKEventSender;