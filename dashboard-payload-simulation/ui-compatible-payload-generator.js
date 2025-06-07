#!/usr/bin/env node

/**
 * UI-Compatible Payload Generator
 * 
 * Based on analysis of query-utils-zone, this generates payloads that exactly match
 * what the New Relic Message Queues UI expects to query.
 */

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

class UICompatiblePayloadGenerator {
  constructor() {
    this.accountId = process.env.ACC;
    this.insertKey = process.env.IKEY;
    this.apiUrl = `https://insights-collector.newrelic.com/v1/accounts/${this.accountId}/events`;
    this.timestamp = Date.now();
    this.clusterName = `ui-compatible-cluster-${this.timestamp}`;
  }

  // Generate AwsMskClusterSample matching query-utils expectations
  generateClusterEvent() {
    return {
      eventType: "AwsMskClusterSample",
      timestamp: this.timestamp,
      
      // CRITICAL: Specific provider type (from constants.ts)
      provider: "AwsMskCluster",
      
      // Entity identification
      entityName: this.clusterName,
      entityGuid: generateEntityGuid(this.accountId, "AWSMSKCLUSTER", this.clusterName),
      
      // Cluster identification (used in queries)
      "provider.clusterName": this.clusterName,
      
      // Metrics expected by DIM_QUERIES.CLUSTER_HEALTH_QUERY
      "provider.activeControllerCount.Sum": 1,
      "provider.offlinePartitionsCount.Sum": 0,
      
      // Additional metrics from query configurations
      "provider.globalPartitionCount.Average": 50,
      "provider.globalTopicCount.Average": 10,
      
      // Collection metadata
      "collector.name": "cloud-integrations",
      
      // AWS context
      awsAccountId: "123456789012",
      awsRegion: "us-east-1",
      providerAccountId: this.accountId
    };
  }

  // Generate AwsMskBrokerSample matching query-utils expectations
  generateBrokerEvent(brokerId) {
    const brokerIdStr = brokerId.toString();
    
    return {
      eventType: "AwsMskBrokerSample",
      timestamp: this.timestamp,
      
      // CRITICAL: Specific provider type
      provider: "AwsMskBroker",
      
      // Entity identification
      entityName: `${brokerIdStr}:${this.clusterName}`,
      entityGuid: generateEntityGuid(this.accountId, "AWSMSKBROKER", `${this.clusterName}:${brokerIdStr}`),
      
      // Cluster relationship (critical for faceting in queries)
      "provider.clusterName": this.clusterName,
      "provider.brokerId": brokerIdStr,
      
      // Throughput metrics with ALL aggregations (required by DIM_QUERIES)
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
      
      // Health metrics (from CLUSTER_HEALTH_QUERY_BY_BROKER)
      "provider.underReplicatedPartitions.Sum": 0,
      "provider.underMinIsrPartitionCount.Sum": 0,
      
      // CPU metrics
      "provider.cpuUser.Average": 25 + (brokerId * 5),
      "provider.cpuSystem.Average": 15 + (brokerId * 2),
      
      // Leader count
      "provider.leaderCount.Average": 5 * brokerId,
      
      // Collection metadata
      "collector.name": "cloud-integrations",
      
      // AWS context
      awsAccountId: "123456789012",
      awsRegion: "us-east-1",
      providerAccountId: this.accountId
    };
  }

  // Generate AwsMskTopicSample matching query-utils expectations
  generateTopicEvent(topicName) {
    return {
      eventType: "AwsMskTopicSample",
      timestamp: this.timestamp,
      
      // CRITICAL: Specific provider type
      provider: "AwsMskTopic",
      
      // Entity identification
      entityName: `${this.clusterName}:${topicName}`,
      entityGuid: generateEntityGuid(this.accountId, "AWSMSKTOPIC", `${this.clusterName}:${topicName}`),
      
      // Display name (used in queries)
      displayName: topicName,
      
      // Cluster relationship
      "provider.clusterName": this.clusterName,
      "provider.topicName": topicName,
      
      // Throughput metrics (from TOPIC_HEALTH_QUERY)
      "provider.bytesInPerSec.Sum": 1000000,
      "provider.bytesInPerSec.Average": 16666.67,
      "provider.bytesOutPerSec.Sum": 800000,
      "provider.bytesOutPerSec.Average": 13333.33,
      
      // Message rate metrics
      "provider.messagesInPerSec.Sum": 1000,
      "provider.messagesInPerSec.Average": 16.67,
      
      // Topic configuration
      "provider.partitionCount": 10,
      "provider.replicationFactor": 3,
      
      // Collection metadata
      "collector.name": "cloud-integrations",
      
      // AWS context
      awsAccountId: "123456789012",
      awsRegion: "us-east-1",
      providerAccountId: this.accountId
    };
  }

  // Generate complete cluster with all entity types
  generateCompleteCluster() {
    const events = [];
    
    // 1. Cluster event
    events.push(this.generateClusterEvent());
    
    // 2. Broker events (3 brokers)
    for (let i = 1; i <= 3; i++) {
      events.push(this.generateBrokerEvent(i));
    }
    
    // 3. Topic events
    const topics = ['orders', 'payments', 'inventory', 'users', 'events'];
    topics.forEach(topic => {
      events.push(this.generateTopicEvent(topic));
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

  // Verify with query-utils NRQL patterns
  generateVerificationQueries() {
    return {
      // From DIM_QUERIES.CLUSTER_HEALTH_QUERY
      clusterHealth: `FROM AwsMskClusterSample SELECT latest(provider.activeControllerCount.Sum), latest(provider.offlinePartitionsCount.Sum) WHERE provider.clusterName = '${this.clusterName}' SINCE 10 minutes ago`,
      
      // From getTopicsTableQuery pattern
      topics: `FROM AwsMskTopicSample SELECT displayName, latest(provider.bytesInPerSec.Sum), latest(provider.bytesOutPerSec.Sum) WHERE provider.clusterName = '${this.clusterName}' SINCE 10 minutes ago`,
      
      // From DIM_QUERIES.CLUSTER_INCOMING_THROUGHPUT
      throughput: `FROM AwsMskBrokerSample SELECT sum(provider.bytesInPerSec.Average) WHERE provider.clusterName = '${this.clusterName}' SINCE 10 minutes ago`,
      
      // Entity search pattern from GraphQL
      entitySearch: `FROM Entity WHERE type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC') AND name LIKE '%${this.clusterName}%' SINCE 10 minutes ago`
    };
  }
}

// Main execution
async function main() {
  console.log('🚀 UI-Compatible Payload Generator');
  console.log('==================================\n');
  console.log('Based on query-utils-zone analysis, generating payloads that match');
  console.log('exactly what the Message Queues UI expects.\n');
  
  const generator = new UICompatiblePayloadGenerator();
  
  console.log(`📦 Generating events for cluster: ${generator.clusterName}`);
  const events = generator.generateCompleteCluster();
  
  console.log(`✅ Generated ${events.length} events:`);
  console.log('   - 1 AwsMskClusterSample');
  console.log('   - 3 AwsMskBrokerSample');
  console.log('   - 5 AwsMskTopicSample\n');
  
  console.log('📤 Submitting to New Relic...');
  const result = await generator.submitEvents(events);
  
  if (result.success) {
    console.log(`✅ Success: ${result.status} ${result.statusText}\n`);
    
    console.log('🔍 Verification Queries (based on query-utils):');
    console.log('================================================');
    const queries = generator.generateVerificationQueries();
    
    Object.entries(queries).forEach(([name, query]) => {
      console.log(`\n${name}:`);
      console.log(query);
    });
    
    console.log('\n📊 To verify in UI:');
    console.log('1. Wait 2-5 minutes for entity synthesis');
    console.log('2. Go to New Relic > Message Queues');
    console.log('3. Look for AWS MSK provider');
    console.log(`4. Find cluster: ${generator.clusterName}`);
    
    console.log('\n💡 Key differences from previous attempts:');
    console.log('- Uses specific provider types (AwsMskCluster, not generic AwsMsk)');
    console.log('- Includes all metric aggregations (.Average, .Sum, etc.)');
    console.log('- Matches exact field names from query-utils NRQL patterns');
    console.log('- Uses provider.* namespace for all metrics');
  } else {
    console.log(`❌ Failed: ${result.error}`);
    if (result.status) {
      console.log(`   Status: ${result.status}`);
    }
  }
  
  // Save events for reference
  const filename = `ui-compatible-events-${generator.timestamp}.json`;
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

module.exports = { UICompatiblePayloadGenerator };