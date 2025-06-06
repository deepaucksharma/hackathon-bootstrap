#!/usr/bin/env node

/**
 * Complete entity synthesis test following all requirements
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

// Load environment
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+?)[=:](.*)/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        process.env[key] = value;
      }
    });
  }
  
  process.env.NEW_RELIC_ACCOUNT_ID = process.env.NR_ACCOUNT_ID || process.env.ACC;
  process.env.NEW_RELIC_INSERT_KEY = process.env.NR_INSERT_KEY || process.env.IKEY;
}

// Generate proper entity GUID using MurmurHash3
function generateEntityGuid(accountId, domain, type, identifier) {
  // Simplified hash for demo - in production use proper MurmurHash3
  const hash = crypto.createHash('sha256').update(identifier).digest('hex').substring(0, 16);
  const guidString = `${accountId}|${domain}|${type}|${hash}`;
  return Buffer.from(guidString).toString('base64');
}

// Create comprehensive payload set
function createComprehensivePayload() {
  const timestamp = Date.now();
  const clusterName = `synthesis-test-${timestamp}`;
  const brokerId = "1";
  const topicName = "test-topic";
  
  const accountId = process.env.NEW_RELIC_ACCOUNT_ID;
  const awsAccountId = "123456789012";
  
  // Generate GUIDs
  const clusterGuid = generateEntityGuid(accountId, 'INFRA', 'AWS_KAFKA_CLUSTER', clusterName);
  const brokerGuid = generateEntityGuid(accountId, 'INFRA', 'AWS_KAFKA_BROKER', `${clusterName}:${brokerId}`);
  const topicGuid = generateEntityGuid(accountId, 'INFRA', 'AWS_KAFKA_TOPIC', `${clusterName}:${topicName}`);
  
  const events = [];
  
  // 1. Cluster event
  events.push({
    eventType: "AwsMskClusterSample",
    timestamp: timestamp,
    entityName: clusterName,
    entityGuid: clusterGuid,
    entityId: crypto.createHash('sha256').update(clusterName).digest().readUInt32BE(0),
    
    // Critical fields
    "collector.name": "cloudwatch-metric-streams",
    "instrumentation.provider": "aws",
    provider: "AwsMskCluster",
    
    // Account mapping
    providerAccountId: accountId,
    providerAccountName: "Synthesis Test Account",
    providerExternalId: awsAccountId,
    
    // AWS context
    awsAccountId: awsAccountId,
    awsRegion: "us-east-1",
    "aws.Namespace": "AWS/Kafka",
    
    // Cluster specifics
    "provider.clusterName": clusterName,
    "provider.clusterSize": 3,
    "provider.kafkaVersion": "2.8.1",
    
    // Cluster metrics
    "provider.activeControllerCount.Average": 1,
    "provider.activeControllerCount.Sum": 1,
    "provider.activeControllerCount.Maximum": 1,
    "provider.activeControllerCount.Minimum": 1,
    "provider.activeControllerCount.SampleCount": 1,
    
    "provider.globalPartitionCount.Average": 10,
    "provider.globalPartitionCount.Sum": 10,
    "provider.globalPartitionCount.Maximum": 10,
    "provider.globalPartitionCount.Minimum": 10,
    "provider.globalPartitionCount.SampleCount": 1,
    
    "provider.offlinePartitionsCount.Average": 0,
    "provider.offlinePartitionsCount.Sum": 0,
    "provider.offlinePartitionsCount.Maximum": 0,
    "provider.offlinePartitionsCount.Minimum": 0,
    "provider.offlinePartitionsCount.SampleCount": 1
  });
  
  // 2. Broker event
  events.push({
    eventType: "AwsMskBrokerSample",
    timestamp: timestamp,
    entityName: `${brokerId}:${clusterName}`,
    entityGuid: brokerGuid,
    entityId: crypto.createHash('sha256').update(`${clusterName}:${brokerId}`).digest().readUInt32BE(0),
    
    // Critical fields
    "collector.name": "cloudwatch-metric-streams",
    "instrumentation.provider": "aws",
    provider: "AwsMskBroker",
    
    // Account mapping - same as cluster
    providerAccountId: accountId,
    providerAccountName: "Synthesis Test Account",
    providerExternalId: awsAccountId,
    
    // AWS context - same as cluster
    awsAccountId: awsAccountId,
    awsRegion: "us-east-1",
    "aws.Namespace": "AWS/Kafka",
    
    // Broker specifics - CRITICAL for relationships
    "provider.brokerId": brokerId,
    "provider.clusterName": clusterName,
    "broker.id": brokerId,
    clusterName: clusterName,
    
    // Broker metrics with all aggregations
    "provider.bytesInPerSec.Average": 2500000,
    "provider.bytesInPerSec.Sum": 150000000,
    "provider.bytesInPerSec.Maximum": 5000000,
    "provider.bytesInPerSec.Minimum": 1000000,
    "provider.bytesInPerSec.SampleCount": 60,
    
    "provider.bytesOutPerSec.Average": 2000000,
    "provider.bytesOutPerSec.Sum": 120000000,
    "provider.bytesOutPerSec.Maximum": 4000000,
    "provider.bytesOutPerSec.Minimum": 800000,
    "provider.bytesOutPerSec.SampleCount": 60,
    
    "provider.messagesInPerSec.Average": 1000,
    "provider.messagesInPerSec.Sum": 60000,
    "provider.messagesInPerSec.Maximum": 2000,
    "provider.messagesInPerSec.Minimum": 400,
    "provider.messagesInPerSec.SampleCount": 60,
    
    "provider.cpuUser.Average": 45.5,
    "provider.cpuUser.Sum": 2730.0,
    "provider.cpuUser.Maximum": 68.0,
    "provider.cpuUser.Minimum": 22.0,
    "provider.cpuUser.SampleCount": 60
  });
  
  // 3. Topic event
  events.push({
    eventType: "AwsMskTopicSample",
    timestamp: timestamp,
    entityName: topicName,
    entityGuid: topicGuid,
    entityId: crypto.createHash('sha256').update(`${clusterName}:${topicName}`).digest().readUInt32BE(0),
    
    // Critical fields
    "collector.name": "cloudwatch-metric-streams",
    "instrumentation.provider": "aws",
    provider: "AwsMskTopic",
    
    // Account mapping - same as cluster
    providerAccountId: accountId,
    providerAccountName: "Synthesis Test Account",
    providerExternalId: awsAccountId,
    
    // AWS context - same as cluster
    awsAccountId: awsAccountId,
    awsRegion: "us-east-1",
    "aws.Namespace": "AWS/Kafka",
    
    // Topic specifics - CRITICAL for relationships
    "provider.topicName": topicName,
    "provider.clusterName": clusterName,
    topic: topicName,
    clusterName: clusterName,
    
    // Topic metrics
    "provider.messagesInPerSec.Average": 500,
    "provider.messagesInPerSec.Sum": 30000,
    "provider.messagesInPerSec.Maximum": 1000,
    "provider.messagesInPerSec.Minimum": 200,
    "provider.messagesInPerSec.SampleCount": 60,
    
    "provider.bytesInPerSec.Average": 125000,
    "provider.bytesInPerSec.Sum": 7500000,
    "provider.bytesInPerSec.Maximum": 250000,
    "provider.bytesInPerSec.Minimum": 50000,
    "provider.bytesInPerSec.SampleCount": 60,
    
    "provider.underReplicatedPartitions.Average": 0,
    "provider.underReplicatedPartitions.Sum": 0,
    "provider.underReplicatedPartitions.Maximum": 0,
    "provider.underReplicatedPartitions.Minimum": 0,
    "provider.underReplicatedPartitions.SampleCount": 60
  });
  
  return events;
}

// Submit to New Relic
async function submitPayload(events) {
  const url = `https://insights-collector.newrelic.com/v1/accounts/${process.env.NEW_RELIC_ACCOUNT_ID}/events`;
  
  try {
    const response = await axios.post(url, events, {
      headers: {
        'Content-Type': 'application/json',
        'X-Insert-Key': process.env.NEW_RELIC_INSERT_KEY
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
      status: error.response?.status,
      details: error.response?.data
    };
  }
}

// Main execution
async function main() {
  console.log('🚀 Comprehensive Entity Synthesis Test');
  console.log('======================================\n');
  
  loadEnv();
  
  console.log('✅ Environment configured');
  console.log(`   Account: ${process.env.NEW_RELIC_ACCOUNT_ID}`);
  
  // Create payloads
  console.log('\n📦 Creating comprehensive payload set...');
  const events = createComprehensivePayload();
  console.log(`   Created ${events.length} events:`);
  events.forEach(e => {
    console.log(`   - ${e.eventType}: ${e.entityName}`);
  });
  
  // Submit
  console.log('\n📤 Submitting to New Relic...');
  const result = await submitPayload(events);
  
  if (result.success) {
    console.log(`   ✅ Success: ${result.status} ${result.statusText}`);
    
    console.log('\n🎉 All events submitted successfully!');
    console.log('\n📊 Verification steps:');
    console.log('1. Wait 60 seconds for entity synthesis');
    console.log('2. Run: node check-all-msk.js');
    console.log('3. Check Entity Explorer in New Relic UI');
    console.log('4. Check Queues & Streams UI for visibility');
    
    console.log('\n🔍 Entity names to search:');
    events.forEach(e => {
      console.log(`   - ${e.entityName} (${e.eventType})`);
    });
  } else {
    console.log(`   ❌ Failed: ${result.error}`);
    console.log(`   Status: ${result.status}`);
    if (result.details) {
      console.log(`   Details:`, result.details);
    }
  }
}

// Run the test
main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});