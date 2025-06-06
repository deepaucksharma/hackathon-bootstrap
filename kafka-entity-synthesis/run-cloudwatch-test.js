#!/usr/bin/env node

/**
 * Test with cloudwatch-metric-streams collector
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

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
  
  // Map to expected names
  process.env.NEW_RELIC_ACCOUNT_ID = process.env.NR_ACCOUNT_ID || process.env.ACC;
  process.env.NEW_RELIC_INSERT_KEY = process.env.NR_INSERT_KEY || process.env.IKEY;
}

// Create payload with cloudwatch-metric-streams
function createTestPayload() {
  const timestamp = Date.now();
  const clusterName = `cw-test-cluster-${timestamp}`;
  const uniqueId = `00000000-0000-0000-0000-${timestamp.toString().padStart(12, '0')}`;
  
  return {
    eventType: "AwsMskBrokerSample",
    timestamp: timestamp,
    entityName: `${clusterName}-broker-1`,
    entityGuid: Buffer.from(`${process.env.NEW_RELIC_ACCOUNT_ID}|INFRA|AWS_KAFKA_BROKER|${timestamp}`).toString('base64'),
    entityId: timestamp,
    
    // Use cloudwatch-metric-streams
    "collector.name": "cloudwatch-metric-streams",
    "collector.version": "1.0.0",
    "instrumentation.provider": "aws",
    provider: "AwsMsk",  // Generic provider as per README
    
    // Account mapping
    providerAccountId: process.env.NEW_RELIC_ACCOUNT_ID,
    providerAccountName: "Test AWS Account",
    providerExternalId: `arn:aws:kafka:us-east-1:123456789012:broker/${clusterName}/${uniqueId}/1`,
    
    // AWS context
    awsAccountId: "123456789012",
    awsRegion: "us-east-1",
    "aws.Namespace": "AWS/Kafka",
    dataSourceName: "Managed Kafka",
    
    // Cluster and broker info
    clusterName: clusterName,
    "broker.id": "1",
    
    // Critical broker identifier
    "provider.brokerId": "1",
    "provider.clusterName": clusterName,
    
    // Metrics with all 5 aggregations - using AWS CloudWatch naming
    "provider.bytesInPerSec.Average": 2500.0,
    "provider.bytesInPerSec.Sum": 150000.0,
    "provider.bytesInPerSec.Maximum": 5000.0,
    "provider.bytesInPerSec.Minimum": 1000.0,
    "provider.bytesInPerSec.SampleCount": 60,
    
    "provider.messagesInPerSec.Average": 16.67,
    "provider.messagesInPerSec.Sum": 1000.0,
    "provider.messagesInPerSec.Maximum": 30.0,
    "provider.messagesInPerSec.Minimum": 5.0,
    "provider.messagesInPerSec.SampleCount": 60,
    
    "provider.cpuUser.Average": 45.5,
    "provider.cpuUser.Sum": 2730.0,
    "provider.cpuUser.Maximum": 68.0,
    "provider.cpuUser.Minimum": 22.0,
    "provider.cpuUser.SampleCount": 60,
    
    // Health metrics
    "provider.offlinePartitionsCount.Sum": 0,
    "provider.offlinePartitionsCount.Average": 0,
    "provider.offlinePartitionsCount.Maximum": 0,
    "provider.offlinePartitionsCount.Minimum": 0,
    "provider.offlinePartitionsCount.SampleCount": 60
  };
}

// Submit to New Relic
async function submitPayload(payload) {
  const url = `https://insights-collector.newrelic.com/v1/accounts/${process.env.NEW_RELIC_ACCOUNT_ID}/events`;
  
  try {
    const response = await axios.post(url, [payload], {
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
      status: error.response?.status
    };
  }
}

// Main execution
async function main() {
  console.log('🚀 CloudWatch Metric Streams Test');
  console.log('==================================\n');
  
  // Load environment
  loadEnv();
  
  console.log('✅ Environment configured');
  console.log(`   Account: ${process.env.NEW_RELIC_ACCOUNT_ID}`);
  
  // Create payload
  console.log('\n📦 Creating CloudWatch-style payload...');
  const payload = createTestPayload();
  console.log(`   Entity: ${payload.entityName}`);
  console.log(`   Collector: ${payload["collector.name"]}`);
  console.log(`   Provider: ${payload.provider}`);
  
  // Submit
  console.log('\n📤 Submitting to New Relic...');
  const result = await submitPayload(payload);
  
  if (result.success) {
    console.log(`   ✅ Success: ${result.status} ${result.statusText}`);
    
    console.log('\n✅ Event submitted successfully!');
    console.log('\n📊 To verify:');
    console.log(`   node verify-entity.js "${payload.entityName}"`);
    console.log('\n⏳ Wait 30-60 seconds for entity synthesis');
  } else {
    console.log(`   ❌ Failed: ${result.error}`);
    console.log(`   Status: ${result.status}`);
  }
}

// Run the test
main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});