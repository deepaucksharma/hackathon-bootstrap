#!/usr/bin/env node

/**
 * Send Cloud Integration Format - Based on working accounts analysis
 * 
 * This sends events in the EXACT format used by working MSK accounts,
 * which use cloud-integrations (polling) NOT cloudwatch-metric-streams.
 */

const https = require('https');
const fs = require('fs');

// Load environment variables
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
}

const LICENSE_KEY = process.env.IKEY || process.env.NEW_RELIC_LICENSE_KEY;
const ACCOUNT_ID = process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID || '3630072';
const AWS_ACCOUNT_ID = '123456789012'; // Your AWS account ID

if (!LICENSE_KEY) {
  console.error('❌ ERROR: License key not found!');
  console.error('Set IKEY or NEW_RELIC_LICENSE_KEY environment variable');
  process.exit(1);
}

class CloudIntegrationSender {
  constructor() {
    this.clusterName = `msk-cluster-${Date.now()}`;
    this.timestamp = Date.now();
    this.sentEvents = [];
  }

  async send() {
    console.log('🚀 Sending MSK Events in Cloud Integration Format\n');
    console.log('Based on analysis of working accounts, this uses the EXACT format');
    console.log('that makes entities appear in the UI.\n');
    
    console.log(`Cluster Name: ${this.clusterName}`);
    console.log(`Account ID: ${ACCOUNT_ID}`);
    console.log(`AWS Account ID: ${AWS_ACCOUNT_ID}`);
    console.log('');

    // Send all event types
    await this.sendClusterEvents();
    await this.sendBrokerEvents();
    await this.sendTopicEvents();

    console.log('\n✅ All events sent!');
    console.log('\n🔍 Next Steps:');
    console.log('1. Wait 2-5 minutes for entity synthesis');
    console.log('2. Check for events:');
    console.log(`   FROM AwsMskClusterSample, AwsMskBrokerSample WHERE entityName LIKE '%${this.clusterName}%' SINCE 10 minutes ago`);
    console.log('3. Check Message Queues UI:');
    console.log('   https://one.newrelic.com/nr1-core/apm-services/message-queues');
    
    this.saveEvents();
  }

  async sendClusterEvents() {
    console.log('📊 Sending Cluster Events...');
    
    const events = [];
    
    // Create 3 events with slightly different timestamps (like polling)
    for (let i = 0; i < 3; i++) {
      const event = {
        eventType: 'AwsMskClusterSample',
        timestamp: this.timestamp - (i * 60000), // 1 minute apart
        
        // Entity identification
        entityName: this.clusterName,
        entityGuid: this.generateGUID('cluster', this.clusterName),
        entityId: this.generateEntityId('cluster'),
        displayName: this.clusterName,
        
        // Provider fields - CRITICAL!
        provider: 'AwsMskCluster',
        providerAccountId: ACCOUNT_ID,
        providerAccountName: 'Test Account',
        providerExternalId: AWS_ACCOUNT_ID,
        
        // Collector info - CRITICAL!
        'collector.name': 'cloud-integrations',
        'collector.version': 'release-1973',
        'instrumentation.provider': 'aws',
        
        // AWS fields
        awsAccountId: AWS_ACCOUNT_ID,
        awsRegion: 'us-east-1',
        
        // Data source (optional but present in working accounts)
        dataSourceId: '999999',
        dataSourceName: 'Managed Kafka',
        
        // Cluster-specific fields
        'provider.clusterName': this.clusterName,
        'provider.awsRegion': 'us-east-1',
        
        // Metrics with aggregations (like cloud integrations)
        'provider.activeControllerCount.Sum': 1,
        'provider.activeControllerCount.Average': 0.5,
        'provider.activeControllerCount.Maximum': 1,
        'provider.activeControllerCount.Minimum': 0,
        'provider.activeControllerCount.SampleCount': 2,
        
        'provider.offlinePartitionsCount.Sum': 0,
        'provider.offlinePartitionsCount.Average': 0,
        'provider.offlinePartitionsCount.Maximum': 0,
        'provider.offlinePartitionsCount.Minimum': 0,
        'provider.offlinePartitionsCount.SampleCount': 2,
        
        'provider.globalPartitionCount.Sum': 30,
        'provider.globalPartitionCount.Average': 15,
        'provider.globalPartitionCount.Maximum': 30,
        'provider.globalPartitionCount.Minimum': 0,
        'provider.globalPartitionCount.SampleCount': 2,
        
        'provider.globalTopicCount.Sum': 6,
        'provider.globalTopicCount.Average': 3,
        'provider.globalTopicCount.Maximum': 6,
        'provider.globalTopicCount.Minimum': 0,
        'provider.globalTopicCount.SampleCount': 2
      };
      
      events.push(event);
    }
    
    await this.sendEvents(events);
    console.log(`  ✅ Sent ${events.length} cluster events`);
  }

  async sendBrokerEvents() {
    console.log('\n📊 Sending Broker Events...');
    
    const events = [];
    
    // 3 brokers
    for (let brokerId = 1; brokerId <= 3; brokerId++) {
      // 3 events per broker (polling intervals)
      for (let i = 0; i < 3; i++) {
        const event = {
          eventType: 'AwsMskBrokerSample',
          timestamp: this.timestamp - (i * 60000),
          
          // Entity identification
          entityName: `${brokerId}:${this.clusterName}`,
          entityGuid: this.generateGUID('broker', `${brokerId}:${this.clusterName}`),
          entityId: this.generateEntityId(`broker-${brokerId}`),
          
          // Provider fields - CRITICAL!
          provider: 'AwsMskBroker', // NOT AwsMsk!
          providerAccountId: ACCOUNT_ID,
          providerAccountName: 'Test Account',
          providerExternalId: AWS_ACCOUNT_ID,
          
          // Collector info
          'collector.name': 'cloud-integrations',
          'collector.version': 'release-1973',
          'instrumentation.provider': 'aws',
          
          // AWS fields
          awsAccountId: AWS_ACCOUNT_ID,
          awsRegion: 'us-east-1',
          
          // Broker identification
          'provider.brokerId': brokerId.toString(),
          'provider.clusterName': this.clusterName,
          'provider.awsRegion': 'us-east-1',
          
          // Metrics with all aggregations
          'provider.bytesInPerSec.Sum': 1000000 * brokerId,
          'provider.bytesInPerSec.Average': 500000 * brokerId,
          'provider.bytesInPerSec.Maximum': 1000000 * brokerId,
          'provider.bytesInPerSec.Minimum': 0,
          'provider.bytesInPerSec.SampleCount': 2,
          
          'provider.bytesOutPerSec.Sum': 800000 * brokerId,
          'provider.bytesOutPerSec.Average': 400000 * brokerId,
          'provider.bytesOutPerSec.Maximum': 800000 * brokerId,
          'provider.bytesOutPerSec.Minimum': 0,
          'provider.bytesOutPerSec.SampleCount': 2,
          
          'provider.messagesInPerSec.Sum': 2000,
          'provider.messagesInPerSec.Average': 1000,
          'provider.messagesInPerSec.Maximum': 2000,
          'provider.messagesInPerSec.Minimum': 0,
          'provider.messagesInPerSec.SampleCount': 2,
          
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
          
          'provider.leaderCount.Sum': 10,
          'provider.leaderCount.Average': 5,
          'provider.leaderCount.Maximum': 10,
          'provider.leaderCount.Minimum': 0,
          'provider.leaderCount.SampleCount': 2
        };
        
        events.push(event);
      }
    }
    
    await this.sendEvents(events);
    console.log(`  ✅ Sent ${events.length} broker events`);
  }

  async sendTopicEvents() {
    console.log('\n📊 Sending Topic Events...');
    
    const events = [];
    const topics = ['orders', 'payments', 'users'];
    
    for (const topicName of topics) {
      // 3 events per topic
      for (let i = 0; i < 3; i++) {
        const event = {
          eventType: 'AwsMskTopicSample',
          timestamp: this.timestamp - (i * 60000),
          
          // Entity identification
          entityName: `${this.clusterName}:${topicName}`,
          entityGuid: this.generateGUID('topic', `${this.clusterName}:${topicName}`),
          entityId: this.generateEntityId(`topic-${topicName}`),
          
          // Provider fields
          provider: 'AwsMskTopic',
          providerAccountId: ACCOUNT_ID,
          providerAccountName: 'Test Account',
          providerExternalId: AWS_ACCOUNT_ID,
          
          // Collector info
          'collector.name': 'cloud-integrations',
          'collector.version': 'release-1973',
          'instrumentation.provider': 'aws',
          
          // AWS fields
          awsAccountId: AWS_ACCOUNT_ID,
          awsRegion: 'us-east-1',
          
          // Topic identification
          'provider.topicName': topicName,
          'provider.clusterName': this.clusterName,
          'provider.awsRegion': 'us-east-1',
          
          // Topic metrics
          'provider.messagesInPerSec.Sum': 200,
          'provider.messagesInPerSec.Average': 100,
          'provider.messagesInPerSec.Maximum': 200,
          'provider.messagesInPerSec.Minimum': 0,
          'provider.messagesInPerSec.SampleCount': 2,
          
          'provider.bytesInPerSec.Sum': 20000,
          'provider.bytesInPerSec.Average': 10000,
          'provider.bytesInPerSec.Maximum': 20000,
          'provider.bytesInPerSec.Minimum': 0,
          'provider.bytesInPerSec.SampleCount': 2,
          
          'provider.bytesOutPerSec.Sum': 16000,
          'provider.bytesOutPerSec.Average': 8000,
          'provider.bytesOutPerSec.Maximum': 16000,
          'provider.bytesOutPerSec.Minimum': 0,
          'provider.bytesOutPerSec.SampleCount': 2
        };
        
        events.push(event);
      }
    }
    
    await this.sendEvents(events);
    console.log(`  ✅ Sent ${events.length} topic events`);
  }

  generateGUID(type, name) {
    const hash = this.hashCode(`${type}:${name}`);
    return Buffer.from(`${ACCOUNT_ID}|INFRA|NA|${hash}`).toString('base64');
  }

  generateEntityId(suffix) {
    return Math.abs(this.hashCode(`${this.clusterName}:${suffix}`)).toString();
  }

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  async sendEvents(events) {
    this.sentEvents.push(...events);
    
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(events);
      
      const options = {
        hostname: 'insights-collector.newrelic.com',
        path: `/v1/accounts/${ACCOUNT_ID}/events`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Insert-Key': LICENSE_KEY,
          'Content-Length': data.length
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          if (res.statusCode !== 200) {
            console.error(`    ❌ Failed: ${res.statusCode} - ${responseData}`);
          }
          resolve({ status: res.statusCode, body: responseData });
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  saveEvents() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `results/cloud-integration-format-${timestamp}.json`;
    
    if (!fs.existsSync('results')) {
      fs.mkdirSync('results', { recursive: true });
    }
    
    const summary = {
      timestamp: new Date().toISOString(),
      clusterName: this.clusterName,
      accountId: ACCOUNT_ID,
      awsAccountId: AWS_ACCOUNT_ID,
      totalEvents: this.sentEvents.length,
      eventTypes: {
        AwsMskClusterSample: this.sentEvents.filter(e => e.eventType === 'AwsMskClusterSample').length,
        AwsMskBrokerSample: this.sentEvents.filter(e => e.eventType === 'AwsMskBrokerSample').length,
        AwsMskTopicSample: this.sentEvents.filter(e => e.eventType === 'AwsMskTopicSample').length
      },
      sampleEvent: this.sentEvents[0],
      nrqlQueries: {
        checkEvents: `FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample SELECT * WHERE entityName LIKE '%${this.clusterName}%' SINCE 30 minutes ago`,
        checkProvider: `FROM AwsMskBrokerSample SELECT uniques(provider), uniques(collector.name) WHERE entityName LIKE '%${this.clusterName}%' SINCE 30 minutes ago`,
        checkUI: `FROM AwsMskClusterSample SELECT latest(provider.activeControllerCount.Sum) FACET entityName WHERE entityName = '${this.clusterName}' SINCE 30 minutes ago`
      }
    };
    
    fs.writeFileSync(filename, JSON.stringify(summary, null, 2));
    console.log(`\n📁 Events saved to: ${filename}`);
  }
}

// Run if called directly
if (require.main === module) {
  const sender = new CloudIntegrationSender();
  sender.send().catch(console.error);
}

module.exports = CloudIntegrationSender;