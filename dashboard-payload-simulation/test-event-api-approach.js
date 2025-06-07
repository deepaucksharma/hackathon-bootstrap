#!/usr/bin/env node

const https = require('https');
require('dotenv').config({ path: '../.env' });

const config = {
  accountId: parseInt(process.env.ACC),
  insertKey: process.env.IKEY
};

class EventAPISender {
  constructor() {
    this.eventEndpoint = `https://insights-collector.newrelic.com/v1/accounts/${config.accountId}/events`;
    this.clusterName = 'event-api-test-' + Date.now();
  }

  async sendEvents(events) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'insights-collector.newrelic.com',
        path: `/v1/accounts/${config.accountId}/events`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Insert-Key': config.insertKey
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          console.log(`Response status: ${res.statusCode}`);
          console.log(`Response: ${data}`);
          resolve({ status: res.statusCode, data });
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(events));
      req.end();
    });
  }

  generateBrokerEvent(brokerId) {
    const now = Date.now();
    
    // Mimicking the exact structure of a working event
    return {
      eventType: 'AwsMskBrokerSample',
      timestamp: now,
      
      // AWS fields
      'aws.Namespace': 'AWS/Kafka',
      'aws.accountId': '123456789012',
      'aws.availabilityZone': `us-east-1${String.fromCharCode(97 + brokerId)}`,
      'aws.kafka.brokerId': String(brokerId),
      
      // Legacy fields for compatibility
      awsAccountId: '123456789012',
      awsMskBrokerId: String(brokerId),
      awsMskClusterName: this.clusterName,
      awsRegion: 'us-east-1',
      clusterName: this.clusterName,
      
      // Critical: collector name
      'collector.name': 'cloudwatch-metric-streams',
      
      // Entity fields
      entityGuid: Buffer.from(`${config.accountId}|INFRA|AWSMSKBROKER|${this.clusterName}:${brokerId}`).toString('base64'),
      entityName: `${this.clusterName}-broker-${brokerId}`,
      
      // Provider info
      provider: 'AwsMsk',
      'provider.accountId': '123456789012',
      'provider.brokerId': String(brokerId),
      'provider.clusterArn': `arn:aws:kafka:us-east-1:123456789012:cluster/${this.clusterName}/12345678`,
      'provider.region': 'us-east-1',
      
      // Metrics with statistical aggregations (like CloudWatch)
      'provider.bytesInPerSec.Average': 1000000 + Math.random() * 500000,
      'provider.bytesInPerSec.Maximum': 1500000 + Math.random() * 100000,
      'provider.bytesInPerSec.Minimum': 900000 + Math.random() * 100000,
      'provider.bytesInPerSec.SampleCount': 60,
      'provider.bytesInPerSec.Sum': 60000000 + Math.random() * 10000000,
      
      'provider.messagesInPerSec.Average': 1000 + Math.random() * 500,
      'provider.messagesInPerSec.Maximum': 1500 + Math.random() * 100,
      'provider.messagesInPerSec.Minimum': 900 + Math.random() * 100,
      'provider.messagesInPerSec.SampleCount': 60,
      'provider.messagesInPerSec.Sum': 60000 + Math.random() * 10000,
      
      'provider.cpuUser.Average': 30 + Math.random() * 20,
      
      // Additional metrics
      'provider.produceMessageConversionsPerSec.Average': 100 + Math.random() * 50,
      'provider.fetchMessageConversionsPerSec.Average': 200 + Math.random() * 100,
      'provider.networkRxPackets.Average': 50000 + Math.random() * 10000,
      'provider.networkTxPackets.Average': 45000 + Math.random() * 10000
    };
  }

  generateClusterEvent() {
    const now = Date.now();
    
    return {
      eventType: 'AwsMskClusterSample',
      timestamp: now,
      
      // AWS fields
      'aws.Namespace': 'AWS/Kafka',
      'aws.accountId': '123456789012',
      
      // Legacy fields
      awsAccountId: '123456789012',
      awsMskClusterName: this.clusterName,
      awsRegion: 'us-east-1',
      clusterName: this.clusterName,
      
      // Critical: collector name
      'collector.name': 'cloudwatch-metric-streams',
      
      // Entity fields
      entityGuid: Buffer.from(`${config.accountId}|INFRA|AWSMSKCLUSTER|${this.clusterName}`).toString('base64'),
      entityName: this.clusterName,
      
      // Provider info
      provider: 'AwsMsk',
      'provider.accountId': '123456789012',
      'provider.clusterArn': `arn:aws:kafka:us-east-1:123456789012:cluster/${this.clusterName}/12345678`,
      'provider.region': 'us-east-1',
      
      // Cluster-level metrics
      'provider.activeControllerCount.Average': 1,
      'provider.globalPartitionCount.Average': 100,
      'provider.globalTopicCount.Average': 10,
      'provider.offlinePartitionsCount.Average': 0,
      'provider.zookeeperSessionState.Average': 1
    };
  }

  generateTopicEvent(topicName, brokerId) {
    const now = Date.now();
    
    return {
      eventType: 'AwsMskTopicSample',
      timestamp: now,
      
      // AWS fields
      'aws.Namespace': 'AWS/Kafka',
      'aws.accountId': '123456789012',
      'aws.kafka.topic': topicName,
      'aws.kafka.brokerId': String(brokerId),
      
      // Legacy fields
      awsAccountId: '123456789012',
      awsMskClusterName: this.clusterName,
      awsMskTopicName: topicName,
      awsMskBrokerId: String(brokerId),
      awsRegion: 'us-east-1',
      clusterName: this.clusterName,
      topicName: topicName,
      
      // Critical: collector name
      'collector.name': 'cloudwatch-metric-streams',
      
      // Entity fields
      entityGuid: Buffer.from(`${config.accountId}|INFRA|AWSMSKTOPIC|${this.clusterName}:${topicName}`).toString('base64'),
      entityName: `${topicName} (${this.clusterName})`,
      
      // Provider info
      provider: 'AwsMsk',
      'provider.accountId': '123456789012',
      'provider.brokerId': String(brokerId),
      'provider.clusterArn': `arn:aws:kafka:us-east-1:123456789012:cluster/${this.clusterName}/12345678`,
      'provider.region': 'us-east-1',
      
      // Topic metrics
      'provider.bytesInPerSec.Average': 50000 + Math.random() * 10000,
      'provider.bytesOutPerSec.Average': 45000 + Math.random() * 10000,
      'provider.messagesInPerSec.Average': 100 + Math.random() * 50,
      'provider.fetchRequestsPerSec.Average': 10 + Math.random() * 5,
      'provider.produceRequestsPerSec.Average': 8 + Math.random() * 4
    };
  }

  async run() {
    console.log('='.repeat(80));
    console.log('Event API Test - Sending AWS MSK Events');
    console.log(`Cluster: ${this.clusterName}`);
    console.log('='.repeat(80));
    
    try {
      // Generate events
      const events = [];
      
      // Add cluster event
      events.push(this.generateClusterEvent());
      
      // Add broker events (3 brokers)
      for (let i = 1; i <= 3; i++) {
        events.push(this.generateBrokerEvent(i));
      }
      
      // Add topic events
      const topics = ['__consumer_offsets', 'test-topic', 'production-data'];
      topics.forEach(topic => {
        for (let i = 1; i <= 3; i++) {
          events.push(this.generateTopicEvent(topic, i));
        }
      });
      
      console.log(`\n📤 Sending ${events.length} events via Event API...`);
      
      const result = await this.sendEvents(events);
      
      if (result.status === 200) {
        console.log('\n✅ Events sent successfully!');
        console.log('\n📊 Verification URLs:');
        console.log(`\nNRQL Query to check events:`);
        console.log(`SELECT * FROM AwsMskBrokerSample WHERE awsMskClusterName = '${this.clusterName}' SINCE 5 minutes ago`);
        console.log(`\nDirect link: https://one.newrelic.com/launcher/logger.log-launcher?accountId=${config.accountId}&query=SELECT%20*%20FROM%20AwsMskBrokerSample%20WHERE%20awsMskClusterName%20%3D%20'${this.clusterName}'%20SINCE%205%20minutes%20ago`);
      } else {
        console.log(`\n❌ Failed to send events. Status: ${result.status}`);
      }
      
    } catch (error) {
      console.error('❌ Error:', error);
    }
  }
}

// Run the test
const sender = new EventAPISender();
sender.run();