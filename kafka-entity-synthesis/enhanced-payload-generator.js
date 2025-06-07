require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Generate entity GUID as per New Relic format
function generateEntityGuid(accountId, entityType, identifier) {
  const hash = crypto.createHash('sha256').update(identifier).digest('hex').substring(0, 16);
  const guidString = `${accountId}|INFRA|${entityType}|${hash}`;
  return Buffer.from(guidString).toString('base64');
}

class EnhancedPayloadGenerator {
  constructor() {
    this.accountId = process.env.ACC;
    this.insertKey = process.env.IKEY;
    this.apiUrl = `https://insights-collector.newrelic.com/v1/accounts/${this.accountId}/events`;
    this.timestamp = Date.now();
    this.clusterName = `enhanced-cluster-${this.timestamp}`;
  }

  // Generate AwsMskBrokerSample with ALL fields from nri-kafka-msk
  generateBrokerEvent(brokerId) {
    const brokerIdStr = brokerId.toString();
    const entityName = `${brokerIdStr}:${this.clusterName}`;
    const guid = generateEntityGuid(this.accountId, "AWSMSKBROKER", `${this.clusterName}:${brokerIdStr}`);
    
    return {
      eventType: "AwsMskBrokerSample",
      timestamp: this.timestamp,
      
      // Entity identification (matching nri-kafka-msk)
      entityName: entityName,
      entityGuid: guid,
      "entity.guid": guid, // Additional field from nri-kafka-msk
      displayName: `KAFKA_BROKER:${entityName}`,
      
      // Provider identification
      provider: "AwsMskBroker",
      providerAccountId: this.accountId,
      providerAccountName: "Enhanced Test Account", // NEW
      providerExternalId: "123456789012", // NEW
      
      // Integration metadata (matching nri-kafka-msk)
      integrationName: "com.newrelic.kafka", // NEW
      integrationVersion: "0.0.0", // NEW
      "instrumentation.provider": "aws", // NEW
      
      // Collection metadata
      "collector.name": "cloud-integrations",
      "collector.version": "1.0.0", // NEW
      
      // Cluster relationship
      "provider.clusterName": this.clusterName,
      "provider.brokerId": brokerIdStr,
      "provider.clusterArn": `arn:aws:kafka:us-east-1:123456789012:cluster/${this.clusterName}/12345678-1234-1234-1234-123456789012-${brokerId}`,
      "provider.accountId": "123456789012",
      "provider.region": "us-east-1",
      
      // AWS context
      awsAccountId: "123456789012",
      awsRegion: "us-east-1",
      
      // Infrastructure agent fields (from nri-kafka-msk)
      agentName: "Infrastructure",
      agentVersion: "1.57.0",
      hostname: "enhanced-host",
      host: "enhanced-host",
      fullHostname: "enhanced-host",
      reportingAgent: "enhanced-host",
      hostStatus: "running",
      
      // System information
      operatingSystem: "linux",
      linuxDistribution: "Amazon Linux 2",
      kernelVersion: "5.10.0",
      instanceType: "kafka.m5.large",
      coreCount: "2",
      processorCount: "2",
      systemMemoryBytes: "8589934592",
      environment: "production",
      
      // Throughput metrics with ALL aggregations
      "provider.bytesInPerSec.Average": 1000000 * brokerId,
      "provider.bytesInPerSec.Sum": 60000000 * brokerId,
      "provider.bytesInPerSec.Maximum": 1500000 * brokerId,
      "provider.bytesInPerSec.Minimum": 500000 * brokerId,
      "provider.bytesInPerSec.SampleCount": 60,
      
      "provider.bytesOutPerSec.Average": 800000 * brokerId,
      "provider.bytesOutPerSec.Sum": 48000000 * brokerId,
      "provider.bytesOutPerSec.Maximum": 1200000 * brokerId,
      "provider.bytesOutPerSec.Minimum": 400000 * brokerId,
      "provider.bytesOutPerSec.SampleCount": 60,
      
      // Message rate metrics
      "provider.messagesInPerSec.Average": 1000 * brokerId,
      "provider.messagesInPerSec.Sum": 60000 * brokerId,
      "provider.messagesInPerSec.Maximum": 1500 * brokerId,
      "provider.messagesInPerSec.Minimum": 500 * brokerId,
      "provider.messagesInPerSec.SampleCount": 60,
      
      // Health metrics
      "provider.underReplicatedPartitions": 0,
      "provider.underReplicatedPartitions.Sum": 0,
      "provider.underMinIsrPartitionCount.Sum": 0,
      "provider.offlinePartitionsCount": 0,
      "provider.leaderCount": 5 * brokerId,
      
      // Performance metrics
      "provider.cpuUser": 20 + (brokerId * 5),
      "provider.cpuSystem": 10 + (brokerId * 2),
      "provider.cpuIdle": 70 - (brokerId * 7),
      "provider.memoryUsed": 40 + (brokerId * 5),
      "provider.memoryFree": 60 - (brokerId * 5),
      "provider.memoryHeapUsed": 35 + (brokerId * 5),
      "provider.rootDiskUsed": 20 + (brokerId * 5),
      
      // Network metrics
      "provider.networkRxPackets": 1000 * brokerId,
      "provider.networkTxPackets": 900 * brokerId,
      "provider.networkRxDropped": 0,
      "provider.networkTxDropped": 0,
      "provider.networkRxErrors": 0,
      "provider.networkTxErrors": 0,
      
      // Request metrics
      "provider.produceRequestsPerSec.Average": 100 * brokerId,
      "provider.produceTotalTimeMs.Average": 0.5 * brokerId,
      "provider.fetchConsumerRequestsPerSec.Average": 200 * brokerId,
      "provider.fetchConsumerTotalTimeMs.Average": 1.5 * brokerId,
      "provider.requestHandlerAvgIdlePercent.Average": 95 - (brokerId * 5),
      
      // ZooKeeper metrics
      "provider.zooKeeperRequestLatencyMsMean": 5 + brokerId,
      "provider.zooKeeperSessionState": 1,
      
      // Additional fields for entity synthesis
      entityKey: `KAFKA_BROKER:${entityName}`,
      entityId: crypto.randomBytes(8).readBigInt64BE().toString(),
      externalKey: `KAFKA_BROKER:${entityName}`,
      event_type: "AwsMskBrokerSample"
    };
  }

  // Generate complete cluster with broker events
  generateCompleteCluster() {
    const events = [];
    
    // Generate 3 broker events
    for (let i = 1; i <= 3; i++) {
      events.push(this.generateBrokerEvent(i));
    }
    
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
  console.log('🚀 Enhanced Payload Generator');
  console.log('=============================\n');
  console.log('Generating payloads with ALL fields from nri-kafka-msk sample.\n');
  
  const generator = new EnhancedPayloadGenerator();
  
  console.log(`📦 Generating events for cluster: ${generator.clusterName}`);
  const events = generator.generateCompleteCluster();
  
  console.log(`✅ Generated ${events.length} broker events with enhanced fields:`);
  console.log('   - All fields from nri-kafka-msk sample');
  console.log('   - providerAccountName and providerExternalId');
  console.log('   - integrationName and integrationVersion');
  console.log('   - Infrastructure agent metadata');
  console.log('   - entity.guid field\n');
  
  console.log('📤 Submitting to New Relic...');
  const result = await generator.submitEvents(events);
  
  if (result.success) {
    console.log(`✅ Success: ${result.status} ${result.statusText}\n`);
    
    console.log('🔍 Verification Queries:');
    console.log('========================');
    console.log(`\n1. Check events:`);
    console.log(`   FROM AwsMskBrokerSample SELECT * WHERE provider.clusterName = '${generator.clusterName}' SINCE 10 minutes ago`);
    
    console.log(`\n2. Check entities:`);
    console.log(`   FROM Entity WHERE name LIKE '%${generator.clusterName}%' SINCE 10 minutes ago`);
    
    console.log('\n📊 To verify in UI:');
    console.log('1. Wait 2-5 minutes for entity synthesis');
    console.log('2. Go to New Relic > Message Queues');
    console.log('3. Look for AWS MSK provider');
    console.log(`4. Find cluster: ${generator.clusterName}`);
    
    console.log('\n💡 What\'s different:');
    console.log('- Added ALL fields from working nri-kafka-msk sample');
    console.log('- Includes infrastructure agent metadata');
    console.log('- Has providerAccountName and providerExternalId');
    console.log('- Includes integrationName and integrationVersion');
    console.log('- Has both entityGuid and entity.guid fields');
  } else {
    console.log(`❌ Failed: ${result.error}`);
    if (result.status) {
      console.log(`   Status: ${result.status}`);
    }
  }
  
  // Save events for reference
  const filename = `enhanced-events-${generator.timestamp}.json`;
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

module.exports = { EnhancedPayloadGenerator };