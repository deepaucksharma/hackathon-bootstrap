require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class MetricStreamsPayloadGenerator {
  constructor() {
    this.accountId = process.env.ACC;
    this.insertKey = process.env.IKEY;
    this.apiUrl = `https://insights-collector.newrelic.com/v1/accounts/${this.accountId}/events`;
    this.timestamp = Date.now();
    this.clusterName = `metric-streams-cluster-${this.timestamp}`;
  }

  // Generate Metric event in CloudWatch Metric Streams format
  generateMetricEvent(metricName, dimensions, value) {
    return {
      eventType: "Metric",
      timestamp: this.timestamp,
      
      // Metric identification
      metricName: metricName,
      metricType: "gauge",
      unit: "Count",
      
      // CloudWatch metadata
      "collector.name": "cloudwatch-metric-streams",
      "collector.version": "1.0.0",
      "instrumentation.name": "cloudwatch",
      "instrumentation.provider": "aws",
      
      // Metric value
      value: value,
      
      // AWS context
      awsAccountId: "123456789012",
      awsRegion: "us-east-1",
      
      // Dimensions
      ...dimensions,
      
      // Entity linking
      "entity.type": dimensions.entityType,
      "entity.name": dimensions.entityName,
      "entity.guid": dimensions.entityGuid
    };
  }

  // Generate MSK cluster metrics
  generateClusterMetrics() {
    const clusterArn = `arn:aws:kafka:us-east-1:123456789012:cluster/${this.clusterName}/12345678-1234-1234-1234-123456789012`;
    const entityGuid = Buffer.from(`${this.accountId}|INFRA|AWSMSKCLUSTER|${crypto.createHash('sha256').update(this.clusterName).digest('hex').substring(0, 16)}`).toString('base64');
    
    const dimensions = {
      // CloudWatch dimensions
      "aws.kafka.ClusterName": this.clusterName,
      "aws.msk.clusterName": this.clusterName,
      "aws.Namespace": "AWS/Kafka",
      
      // Entity dimensions
      entityType: "AWSMSKCLUSTER",
      entityName: this.clusterName,
      entityGuid: entityGuid,
      
      // Provider info
      provider: "AwsMskCluster",
      providerAccountId: this.accountId,
      providerAccountName: "Metric Streams Test Account",
      providerExternalId: clusterArn
    };
    
    return [
      this.generateMetricEvent("aws.kafka.ActiveControllerCount", dimensions, 1),
      this.generateMetricEvent("aws.kafka.OfflinePartitionsCount", dimensions, 0),
      this.generateMetricEvent("aws.kafka.GlobalPartitionCount", dimensions, 50),
      this.generateMetricEvent("aws.kafka.GlobalTopicCount", dimensions, 10)
    ];
  }

  // Generate MSK broker metrics
  generateBrokerMetrics(brokerId) {
    const brokerName = `${brokerId}:${this.clusterName}`;
    const entityGuid = Buffer.from(`${this.accountId}|INFRA|AWSMSKBROKER|${crypto.createHash('sha256').update(brokerName).digest('hex').substring(0, 16)}`).toString('base64');
    
    const dimensions = {
      // CloudWatch dimensions
      "aws.kafka.ClusterName": this.clusterName,
      "aws.msk.clusterName": this.clusterName,
      "aws.kafka.BrokerID": brokerId.toString(),
      "aws.msk.brokerId": brokerId.toString(),
      "aws.Namespace": "AWS/Kafka",
      
      // Entity dimensions
      entityType: "AWSMSKBROKER",
      entityName: brokerName,
      entityGuid: entityGuid,
      
      // Provider info
      provider: "AwsMskBroker",
      providerAccountId: this.accountId,
      providerAccountName: "Metric Streams Test Account",
      providerExternalId: `${this.clusterName}-broker-${brokerId}`
    };
    
    return [
      this.generateMetricEvent("aws.kafka.BytesInPerSec.byBroker", dimensions, 1000000 * brokerId),
      this.generateMetricEvent("aws.kafka.BytesOutPerSec.byBroker", dimensions, 800000 * brokerId),
      this.generateMetricEvent("aws.kafka.MessagesInPerSec.byBroker", dimensions, 1000 * brokerId),
      this.generateMetricEvent("aws.kafka.UnderReplicatedPartitions", dimensions, 0),
      this.generateMetricEvent("aws.kafka.UnderMinIsrPartitionCount.byBroker", dimensions, 0)
    ];
  }

  // Generate MSK topic metrics
  generateTopicMetrics(topicName) {
    const entityName = `${this.clusterName}:${topicName}`;
    const entityGuid = Buffer.from(`${this.accountId}|INFRA|AWSMSKTOPIC|${crypto.createHash('sha256').update(entityName).digest('hex').substring(0, 16)}`).toString('base64');
    
    const dimensions = {
      // CloudWatch dimensions
      "aws.kafka.ClusterName": this.clusterName,
      "aws.msk.clusterName": this.clusterName,
      "aws.kafka.Topic": topicName,
      "aws.msk.topic": topicName,
      "aws.Namespace": "AWS/Kafka",
      
      // Entity dimensions
      entityType: "AWSMSKTOPIC",
      entityName: entityName,
      entityGuid: entityGuid,
      displayName: topicName,
      
      // Provider info
      provider: "AwsMskTopic",
      providerAccountId: this.accountId,
      providerAccountName: "Metric Streams Test Account",
      providerExternalId: `${this.clusterName}-topic-${topicName}`
    };
    
    return [
      this.generateMetricEvent("aws.kafka.BytesInPerSec.byTopic", dimensions, 1000000),
      this.generateMetricEvent("aws.kafka.BytesOutPerSec.byTopic", dimensions, 800000),
      this.generateMetricEvent("aws.kafka.MessagesInPerSec.byTopic", dimensions, 1000)
    ];
  }

  // Generate complete set of metrics
  generateAllMetrics() {
    const events = [];
    
    // Cluster metrics
    events.push(...this.generateClusterMetrics());
    
    // Broker metrics (3 brokers)
    for (let i = 1; i <= 3; i++) {
      events.push(...this.generateBrokerMetrics(i));
    }
    
    // Topic metrics
    const topics = ['orders', 'payments', 'inventory'];
    topics.forEach(topic => {
      events.push(...this.generateTopicMetrics(topic));
    });
    
    return events;
  }

  // Submit events to New Relic
  async submitEvents(events) {
    if (!this.insertKey) {
      console.error('❌ Missing insert key. Set IKEY environment variable.');
      return;
    }

    try {
      const response = await axios.post(this.apiUrl, events, {
        headers: {
          'Content-Type': 'application/json',
          'X-Insert-Key': this.insertKey
        }
      });
      
      return {
        success: true,
        status: response.status,
        statusText: response.statusText
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }
}

// Main execution
async function main() {
  console.log('🚀 Metric Streams Payload Generator');
  console.log('===================================\n');
  console.log('Generating payloads in CloudWatch Metric Streams format\n');
  console.log('Based on Master Plan MTS_QUERIES patterns from query-utils\n');
  
  const generator = new MetricStreamsPayloadGenerator();
  
  console.log(`📦 Generating metrics for cluster: ${generator.clusterName}`);
  const events = generator.generateAllMetrics();
  
  console.log(`✅ Generated ${events.length} metric events:`);
  console.log('   - 4 cluster metrics (ActiveControllerCount, etc)');
  console.log('   - 15 broker metrics (5 per broker x 3 brokers)');
  console.log('   - 9 topic metrics (3 per topic x 3 topics)\n');
  
  console.log('📤 Submitting to New Relic...');
  const result = await generator.submitEvents(events);
  
  if (result.success) {
    console.log(`✅ Success: ${result.status} ${result.statusText}\n`);
    
    console.log('🔍 Verification Queries (from MTS_QUERIES):');
    console.log('============================================');
    
    console.log('\n1. Cluster metrics:');
    console.log(`   FROM Metric SELECT latest(aws.kafka.ActiveControllerCount), latest(aws.kafka.OfflinePartitionsCount) WHERE aws.kafka.ClusterName = '${generator.clusterName}' SINCE 10 minutes ago`);
    
    console.log('\n2. Broker throughput:');
    console.log(`   FROM Metric SELECT sum(aws.kafka.BytesInPerSec.byBroker) WHERE aws.kafka.ClusterName = '${generator.clusterName}' SINCE 10 minutes ago FACET aws.kafka.BrokerID`);
    
    console.log('\n3. Topic metrics:');
    console.log(`   FROM Metric SELECT latest(aws.kafka.BytesInPerSec.byTopic) WHERE aws.kafka.ClusterName = '${generator.clusterName}' SINCE 10 minutes ago FACET aws.kafka.Topic`);
    
    console.log('\n4. Entity check:');
    console.log(`   FROM Entity WHERE name LIKE '%${generator.clusterName}%' SINCE 10 minutes ago`);
    
    console.log('\n📊 Key differences from Sample events:');
    console.log('- Uses Metric event type (not AwsMsk*Sample)');
    console.log('- Includes aws.kafka.* metric names');
    console.log('- Has CloudWatch dimensions structure');
    console.log('- Includes entity.* fields for linking');
    console.log('- Uses cloudwatch-metric-streams collector');
  } else {
    console.log(`❌ Failed: ${result.error}`);
    if (result.status) {
      console.log(`   Status: ${result.status}`);
    }
  }
  
  // Save events for reference
  const filename = `metric-streams-events-${generator.timestamp}.json`;
  fs.writeFileSync(filename, JSON.stringify(events, null, 2));
  console.log(`\n📁 Events saved to: ${filename}`);
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { MetricStreamsPayloadGenerator };