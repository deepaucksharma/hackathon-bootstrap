#!/usr/bin/env node

/**
 * Working Payload Sender
 * 
 * Based on our research and the MINIMAL_PAYLOAD_UI_STRATEGY, this sends
 * the exact payload format that should make entities appear in the UI.
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
const ACCOUNT_ID = process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID || '123456789012';

class WorkingPayloadSender {
  constructor() {
    this.clusterName = `working-cluster-${Date.now()}`;
    this.sentMetrics = [];
  }

  async send() {
    console.log('🚀 Sending Working Payload Pattern\n');
    console.log('This uses the exact format that should trigger entity synthesis.\n');
    
    if (!LICENSE_KEY) {
      console.error('❌ ERROR: License key not found!');
      console.error('Set IKEY or NEW_RELIC_LICENSE_KEY environment variable');
      return;
    }

    console.log(`Account ID: ${ACCOUNT_ID}`);
    console.log(`Cluster Name: ${this.clusterName}`);
    console.log(`License Key: ${LICENSE_KEY.substring(0, 4)}...`);
    console.log('');

    // Send complete cluster setup
    await this.sendClusterMetrics();
    await this.sendBrokerMetrics();
    await this.sendTopicMetrics();

    console.log('\n✅ All metrics sent!');
    console.log('\n🔍 Next Steps:');
    console.log('1. Wait 2-5 minutes for entity synthesis');
    console.log('2. Check NRDB for metrics:');
    console.log(`   FROM Metric WHERE collector.name = 'cloudwatch-metric-streams' AND aws.kafka.clusterName = '${this.clusterName}'`);
    console.log('3. Check for entities:');
    console.log(`   FROM AwsMskBrokerSample, AwsMskClusterSample WHERE clusterName = '${this.clusterName}'`);
    console.log('4. Check Message Queues UI:');
    console.log('   https://one.newrelic.com/nr1-core/apm-services/message-queues');

    // Save sent metrics for reference
    this.saveMetrics();
  }

  async sendClusterMetrics() {
    console.log('📊 Sending Cluster Metrics...');
    
    const metrics = [
      {
        name: 'ActiveControllerCount',
        value: 1
      },
      {
        name: 'OfflinePartitionsCount',
        value: 0
      },
      {
        name: 'GlobalPartitionCount',
        value: 50
      },
      {
        name: 'GlobalTopicCount',
        value: 10
      }
    ];

    for (const metric of metrics) {
      const payload = this.createClusterPayload(metric.name, metric.value);
      await this.sendMetric(payload);
      console.log(`  ✅ ${metric.name}`);
    }
  }

  async sendBrokerMetrics() {
    console.log('\n📊 Sending Broker Metrics...');
    
    const brokerMetrics = [
      { name: 'BytesInPerSec', value: 1000000 },
      { name: 'BytesOutPerSec', value: 800000 },
      { name: 'MessagesInPerSec', value: 1000 },
      { name: 'RequestHandlerAvgIdlePercent', value: 0.7 },
      { name: 'NetworkProcessorAvgIdlePercent', value: 0.8 },
      { name: 'CpuUser', value: 25 },
      { name: 'CpuSystem', value: 15 },
      { name: 'CpuIdle', value: 60 }
    ];

    // Send metrics for 3 brokers
    for (let brokerId = 1; brokerId <= 3; brokerId++) {
      console.log(`  Broker ${brokerId}:`);
      for (const metric of brokerMetrics) {
        const payload = this.createBrokerPayload(metric.name, metric.value * brokerId, brokerId);
        await this.sendMetric(payload);
        console.log(`    ✅ ${metric.name}`);
      }
    }
  }

  async sendTopicMetrics() {
    console.log('\n📊 Sending Topic Metrics...');
    
    const topics = ['orders', 'payments', 'users', 'events', 'logs'];
    const topicMetrics = [
      { name: 'MessagesInPerSec', value: 100 },
      { name: 'BytesInPerSec', value: 10000 },
      { name: 'BytesOutPerSec', value: 8000 }
    ];

    for (const topic of topics) {
      console.log(`  Topic ${topic}:`);
      for (const metric of topicMetrics) {
        const payload = this.createTopicPayload(metric.name, metric.value, topic);
        await this.sendMetric(payload);
        console.log(`    ✅ ${metric.name}`);
      }
    }
  }

  createClusterPayload(metricName, value) {
    const timestamp = Date.now();
    const attributes = this.getBaseAttributes('AWS_KAFKA_CLUSTER', this.clusterName);
    
    attributes['aws.MetricName'] = metricName;
    attributes['aws.Dimensions'] = [
      { Name: 'ClusterName', Value: this.clusterName }
    ];

    return [{
      metrics: [{
        name: metricName,
        type: 'gauge',
        value: value,
        timestamp: timestamp,
        attributes: attributes
      }]
    }];
  }

  createBrokerPayload(metricName, value, brokerId) {
    const timestamp = Date.now();
    const entityName = `${this.clusterName}:broker-${brokerId}`;
    const attributes = this.getBaseAttributes('AWS_KAFKA_BROKER', entityName);
    
    attributes['aws.MetricName'] = metricName;
    attributes['aws.kafka.brokerId'] = brokerId.toString();
    attributes['aws.Dimensions'] = [
      { Name: 'ClusterName', Value: this.clusterName },
      { Name: 'BrokerID', Value: brokerId.toString() }
    ];

    return [{
      metrics: [{
        name: metricName,
        type: 'gauge',
        value: value,
        timestamp: timestamp,
        attributes: attributes
      }]
    }];
  }

  createTopicPayload(metricName, value, topicName) {
    const timestamp = Date.now();
    const entityName = `${this.clusterName}:topic:${topicName}`;
    const attributes = this.getBaseAttributes('AWS_KAFKA_TOPIC', entityName);
    
    attributes['aws.MetricName'] = metricName;
    attributes['aws.kafka.topicName'] = topicName;
    attributes['aws.Dimensions'] = [
      { Name: 'ClusterName', Value: this.clusterName },
      { Name: 'TopicName', Value: topicName }
    ];

    return [{
      metrics: [{
        name: metricName,
        type: 'gauge',
        value: value,
        timestamp: timestamp,
        attributes: attributes
      }]
    }];
  }

  getBaseAttributes(entityType, entityName) {
    return {
      // CRITICAL: CloudWatch identification
      'collector.name': 'cloudwatch-metric-streams',
      'eventType': 'Metric',
      'instrumentation.provider': 'cloudwatch',
      'newrelic.source': 'cloudwatch',
      
      // AWS namespace
      'aws.Namespace': 'AWS/Kafka',
      
      // Entity identification
      'entity.type': entityType,
      'entity.name': entityName,
      'entity.guid': this.generateEntityGUID(entityType, entityName),
      
      // AWS account information - ALL OF THESE ARE CRITICAL!
      'aws.accountId': ACCOUNT_ID,
      'aws.region': 'us-east-1',
      'awsAccountId': ACCOUNT_ID,
      'awsRegion': 'us-east-1',
      
      // Provider information - CRITICAL FOR UI!
      'provider': 'AwsMsk',
      'providerAccountId': ACCOUNT_ID,
      'providerExternalId': ACCOUNT_ID, // THIS IS THE MOST CRITICAL FIELD!
      'providerAccountName': 'Working Pattern Test',
      
      // MSK specific
      'aws.kafka.clusterName': this.clusterName,
      'clusterName': this.clusterName,
      
      // Additional metadata
      'collector.version': '1.0.0',
      'aws.MetricDatapoints': 1
    };
  }

  generateEntityGUID(entityType, entityName) {
    const entityIdentifier = `${entityType}:${entityName}`;
    const hash = this.hashCode(entityIdentifier);
    return Buffer.from(`${ACCOUNT_ID}|INFRA|NA|${hash}`).toString('base64');
  }

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  async sendMetric(payload) {
    this.sentMetrics.push(payload[0].metrics[0]);
    
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      
      const options = {
        hostname: 'metric-api.newrelic.com',
        path: '/metric/v1',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': LICENSE_KEY,
          'Content-Length': data.length
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          if (res.statusCode !== 202) {
            console.error(`    ❌ Failed: ${res.statusCode} - ${responseData}`);
          }
          resolve({
            status: res.statusCode,
            body: responseData
          });
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  saveMetrics() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `entity-synthesis-solution-V2/results/working-payload-${timestamp}.json`;
    
    if (!fs.existsSync('entity-synthesis-solution-V2/results')) {
      fs.mkdirSync('entity-synthesis-solution-V2/results', { recursive: true });
    }
    
    const summary = {
      timestamp: new Date().toISOString(),
      clusterName: this.clusterName,
      accountId: ACCOUNT_ID,
      totalMetrics: this.sentMetrics.length,
      metrics: this.sentMetrics
    };
    
    fs.writeFileSync(filename, JSON.stringify(summary, null, 2));
    console.log(`\n📁 Sent metrics saved to: ${filename}`);
  }
}

// Check if running directly
if (require.main === module) {
  const sender = new WorkingPayloadSender();
  sender.send().catch(console.error);
}

module.exports = WorkingPayloadSender;