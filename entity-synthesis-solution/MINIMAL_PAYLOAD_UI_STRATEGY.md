# Minimal Payload Strategy for UI Visibility

## Goal

Send hardcoded payloads directly to New Relic APIs to make AWS MSK entities appear in the Message Queues UI without running any actual Kafka infrastructure.

## Core Discovery

To appear in the UI, we need:
1. Metrics that look like they come from CloudWatch Metric Streams
2. Specific attributes that trigger entity synthesis
3. Critical field: `providerExternalId` for AWS account mapping

## Minimal Payload Design

### 1. Single Broker Metric (Simplest Test)

```javascript
// minimal-broker-payload.js
const axios = require('axios');

async function sendMinimalBrokerMetric() {
  const metricPayload = [{
    "metrics": [{
      "name": "BytesInPerSec",
      "type": "gauge",
      "value": 1000.0,
      "timestamp": Date.now(),
      "attributes": {
        // CRITICAL: Must identify as CloudWatch
        "collector.name": "cloudwatch-metric-streams",
        "eventType": "Metric",
        "instrumentation.provider": "cloudwatch",
        
        // AWS namespace
        "aws.Namespace": "AWS/Kafka",
        "aws.MetricName": "BytesInPerSec",
        
        // Entity identification
        "entity.type": "AWS_KAFKA_BROKER",
        "entity.name": "test-cluster:broker-1",
        
        // CRITICAL AWS fields for UI
        "aws.accountId": "123456789012",
        "aws.region": "us-east-1",
        "awsAccountId": "123456789012",
        "awsRegion": "us-east-1",
        
        // CRITICAL: Account mapping
        "providerAccountId": "123456789012",
        "providerExternalId": "123456789012", // THIS IS CRITICAL!
        
        // MSK specific
        "aws.kafka.clusterName": "test-cluster",
        "aws.kafka.brokerId": "1",
        
        // Dimensions (CloudWatch format)
        "aws.Dimensions": [
          {"Name": "ClusterName", "Value": "test-cluster"},
          {"Name": "BrokerID", "Value": "1"}
        ]
      }
    }]
  }];
  
  const response = await axios.post(
    'https://metric-api.newrelic.com/metric/v1',
    metricPayload,
    {
      headers: {
        'Api-Key': process.env.NEW_RELIC_LICENSE_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
  
  console.log('Response:', response.status);
  return response;
}

// Send it
sendMinimalBrokerMetric()
  .then(() => console.log('✅ Metric sent'))
  .catch(err => console.error('❌ Error:', err.message));
```

### 2. Complete Cluster Setup (3 Entities)

```javascript
// complete-cluster-payload.js

// Helper to generate consistent entity GUIDs
function generateEntityGUID(entityType, clusterName, resourceId) {
  const accountId = "123456789012";
  const entityIdentifier = `${entityType}:${clusterName}:${resourceId || ''}`;
  const guid = Buffer.from(`${accountId}|INFRA|NA|${hashCode(entityIdentifier)}`).toString('base64');
  return guid;
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

async function sendCompleteCluster() {
  const timestamp = Date.now();
  const clusterName = "test-msk-cluster";
  const accountId = "123456789012";
  const region = "us-east-1";
  
  // Base attributes that all metrics need
  const baseAttributes = {
    "collector.name": "cloudwatch-metric-streams",
    "eventType": "Metric",
    "instrumentation.provider": "cloudwatch",
    "aws.Namespace": "AWS/Kafka",
    "aws.accountId": accountId,
    "aws.region": region,
    "awsAccountId": accountId,
    "awsRegion": region,
    "providerAccountId": accountId,
    "providerExternalId": accountId, // CRITICAL!
    "aws.kafka.clusterName": clusterName
  };
  
  const metrics = [];
  
  // 1. Cluster metrics
  metrics.push({
    "name": "ActiveControllerCount",
    "type": "gauge",
    "value": 1,
    "timestamp": timestamp,
    "attributes": {
      ...baseAttributes,
      "entity.type": "AWS_KAFKA_CLUSTER",
      "entity.name": clusterName,
      "entity.guid": generateEntityGUID("AWS_KAFKA_CLUSTER", clusterName, null),
      "aws.MetricName": "ActiveControllerCount",
      "aws.Dimensions": [
        {"Name": "ClusterName", "Value": clusterName}
      ]
    }
  });
  
  metrics.push({
    "name": "OfflinePartitionsCount",
    "type": "gauge",
    "value": 0,
    "timestamp": timestamp,
    "attributes": {
      ...baseAttributes,
      "entity.type": "AWS_KAFKA_CLUSTER",
      "entity.name": clusterName,
      "entity.guid": generateEntityGUID("AWS_KAFKA_CLUSTER", clusterName, null),
      "aws.MetricName": "OfflinePartitionsCount",
      "aws.Dimensions": [
        {"Name": "ClusterName", "Value": clusterName}
      ]
    }
  });
  
  // 2. Broker metrics (3 brokers)
  for (let brokerId = 1; brokerId <= 3; brokerId++) {
    metrics.push({
      "name": "BytesInPerSec",
      "type": "gauge",
      "value": 1000 * brokerId,
      "timestamp": timestamp,
      "attributes": {
        ...baseAttributes,
        "entity.type": "AWS_KAFKA_BROKER",
        "entity.name": `${clusterName}:broker-${brokerId}`,
        "entity.guid": generateEntityGUID("AWS_KAFKA_BROKER", clusterName, brokerId.toString()),
        "aws.MetricName": "BytesInPerSec",
        "aws.kafka.brokerId": brokerId.toString(),
        "aws.Dimensions": [
          {"Name": "ClusterName", "Value": clusterName},
          {"Name": "BrokerID", "Value": brokerId.toString()}
        ]
      }
    });
    
    metrics.push({
      "name": "BytesOutPerSec",
      "type": "gauge",
      "value": 800 * brokerId,
      "timestamp": timestamp,
      "attributes": {
        ...baseAttributes,
        "entity.type": "AWS_KAFKA_BROKER",
        "entity.name": `${clusterName}:broker-${brokerId}`,
        "entity.guid": generateEntityGUID("AWS_KAFKA_BROKER", clusterName, brokerId.toString()),
        "aws.MetricName": "BytesOutPerSec",
        "aws.kafka.brokerId": brokerId.toString(),
        "aws.Dimensions": [
          {"Name": "ClusterName", "Value": clusterName},
          {"Name": "BrokerID", "Value": brokerId.toString()}
        ]
      }
    });
  }
  
  // 3. Topic metrics
  const topics = ["orders", "payments", "users"];
  topics.forEach(topicName => {
    metrics.push({
      "name": "MessagesInPerSec",
      "type": "gauge",
      "value": 100,
      "timestamp": timestamp,
      "attributes": {
        ...baseAttributes,
        "entity.type": "AWS_KAFKA_TOPIC",
        "entity.name": `topic:${topicName}`,
        "entity.guid": generateEntityGUID("AWS_KAFKA_TOPIC", clusterName, topicName),
        "aws.MetricName": "MessagesInPerSec",
        "aws.kafka.topicName": topicName,
        "aws.Dimensions": [
          {"Name": "ClusterName", "Value": clusterName},
          {"Name": "TopicName", "Value": topicName}
        ]
      }
    });
  });
  
  // Send all metrics
  const payload = [{ metrics }];
  
  const response = await axios.post(
    'https://metric-api.newrelic.com/metric/v1',
    payload,
    {
      headers: {
        'Api-Key': process.env.NEW_RELIC_LICENSE_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
  
  console.log(`✅ Sent ${metrics.length} metrics:`, response.status);
}
```

### 3. Continuous Test Payload Sender

```javascript
// continuous-payload-sender.js

class PayloadSender {
  constructor(licenseKey, interval = 60000) {
    this.licenseKey = licenseKey;
    this.interval = interval;
    this.clusterName = "demo-msk-cluster";
    this.accountId = "123456789012";
    this.region = "us-east-1";
    this.running = false;
  }
  
  start() {
    console.log('🚀 Starting continuous payload sender...');
    this.running = true;
    this.sendLoop();
  }
  
  stop() {
    console.log('🛑 Stopping payload sender...');
    this.running = false;
  }
  
  async sendLoop() {
    while (this.running) {
      try {
        await this.sendPayload();
        console.log(`✅ Payload sent at ${new Date().toISOString()}`);
      } catch (error) {
        console.error(`❌ Error: ${error.message}`);
      }
      
      await this.sleep(this.interval);
    }
  }
  
  async sendPayload() {
    const metrics = this.generateRealisticMetrics();
    
    const response = await axios.post(
      'https://metric-api.newrelic.com/metric/v1',
      [{ metrics }],
      {
        headers: {
          'Api-Key': this.licenseKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response;
  }
  
  generateRealisticMetrics() {
    const timestamp = Date.now();
    const metrics = [];
    
    // Add some randomness to make it look real
    const bytesIn = 1000000 + Math.random() * 500000;
    const bytesOut = 800000 + Math.random() * 400000;
    const messagesIn = 1000 + Math.random() * 500;
    
    // Cluster health metrics
    metrics.push(this.createMetric(
      "ActiveControllerCount", 1, timestamp, "AWS_KAFKA_CLUSTER", 
      this.clusterName, null, [{"Name": "ClusterName", "Value": this.clusterName}]
    ));
    
    metrics.push(this.createMetric(
      "OfflinePartitionsCount", 0, timestamp, "AWS_KAFKA_CLUSTER",
      this.clusterName, null, [{"Name": "ClusterName", "Value": this.clusterName}]
    ));
    
    metrics.push(this.createMetric(
      "GlobalPartitionCount", 50, timestamp, "AWS_KAFKA_CLUSTER",
      this.clusterName, null, [{"Name": "ClusterName", "Value": this.clusterName}]
    ));
    
    // Broker metrics
    for (let i = 1; i <= 3; i++) {
      const brokerId = i.toString();
      const brokerDims = [
        {"Name": "ClusterName", "Value": this.clusterName},
        {"Name": "BrokerID", "Value": brokerId}
      ];
      
      metrics.push(this.createMetric(
        "BytesInPerSec", bytesIn / 3, timestamp, "AWS_KAFKA_BROKER",
        `${this.clusterName}:broker-${brokerId}`, brokerId, brokerDims
      ));
      
      metrics.push(this.createMetric(
        "BytesOutPerSec", bytesOut / 3, timestamp, "AWS_KAFKA_BROKER",
        `${this.clusterName}:broker-${brokerId}`, brokerId, brokerDims
      ));
      
      metrics.push(this.createMetric(
        "CpuUser", 20 + Math.random() * 30, timestamp, "AWS_KAFKA_BROKER",
        `${this.clusterName}:broker-${brokerId}`, brokerId, brokerDims
      ));
    }
    
    return metrics;
  }
  
  createMetric(name, value, timestamp, entityType, entityName, resourceId, dimensions) {
    const baseAttrs = {
      "collector.name": "cloudwatch-metric-streams",
      "eventType": "Metric",
      "instrumentation.provider": "cloudwatch",
      "aws.Namespace": "AWS/Kafka",
      "aws.MetricName": name,
      "aws.accountId": this.accountId,
      "aws.region": this.region,
      "awsAccountId": this.accountId,
      "awsRegion": this.region,
      "providerAccountId": this.accountId,
      "providerExternalId": this.accountId,
      "aws.kafka.clusterName": this.clusterName,
      "entity.type": entityType,
      "entity.name": entityName,
      "entity.guid": generateEntityGUID(entityType, this.clusterName, resourceId),
      "aws.Dimensions": dimensions
    };
    
    if (resourceId) {
      baseAttrs["aws.kafka.brokerId"] = resourceId;
    }
    
    return {
      name,
      type: "gauge",
      value,
      timestamp,
      attributes: baseAttrs
    };
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage
const sender = new PayloadSender(process.env.NEW_RELIC_LICENSE_KEY);
sender.start();

// Graceful shutdown
process.on('SIGINT', () => {
  sender.stop();
  process.exit(0);
});
```

### 4. Validation Script

```javascript
// validate-ui-visibility.js

async function validateUIVisibility() {
  console.log('🔍 Validating UI Visibility...\n');
  
  // Wait for entity synthesis (usually takes 1-2 minutes)
  console.log('⏳ Waiting 2 minutes for entity synthesis...');
  await sleep(120000);
  
  // Check 1: Metrics arrived
  const metricsQuery = `
    FROM Metric 
    SELECT count(*), uniqueCount(aws.MetricName)
    WHERE collector.name = 'cloudwatch-metric-streams'
    AND aws.Namespace = 'AWS/Kafka'
    SINCE 5 minutes ago
  `;
  
  const metrics = await runNRQL(metricsQuery);
  console.log(`✅ Metrics: ${metrics.count} received, ${metrics.uniqueCount} unique types`);
  
  // Check 2: Entities created
  const entitiesQuery = `
    FROM entity
    SELECT count(*), uniques(type)
    WHERE type IN ('AWS_KAFKA_CLUSTER', 'AWS_KAFKA_BROKER', 'AWS_KAFKA_TOPIC')
    AND providerAccountId = '123456789012'
    SINCE 10 minutes ago
  `;
  
  const entities = await runNRQL(entitiesQuery);
  console.log(`✅ Entities: ${entities.count} created`);
  console.log(`   Types: ${entities.uniques.join(', ')}`);
  
  // Check 3: UI Query (what the UI actually runs)
  const uiQuery = `
    FROM AwsMskClusterSample
    SELECT latest(provider.activeControllerCount.Sum),
           latest(provider.offlinePartitionsCount.Sum),
           latest(provider.globalPartitionCount)
    FACET clusterName
    WHERE providerAccountId IS NOT NULL
    SINCE 1 hour ago
  `;
  
  const uiResults = await runNRQL(uiQuery);
  if (uiResults.facets && uiResults.facets.length > 0) {
    console.log('✅ UI Query: Returns data for Message Queue UI');
    console.log(`   Clusters: ${uiResults.facets.map(f => f.name).join(', ')}`);
  } else {
    console.log('❌ UI Query: No results - check providerExternalId!');
  }
  
  // Final check
  console.log('\n📊 Final Verdict:');
  console.log('Navigate to: https://one.newrelic.com/nr1-core/apm-services/message-queues');
  console.log('You should see your test cluster in the list!');
}
```

## Step-by-Step Testing Guide

### 1. Send Single Test Metric
```bash
# Set your license key
export NEW_RELIC_LICENSE_KEY="YOUR_LICENSE_KEY_HERE"

# Send one metric
node minimal-broker-payload.js
```

### 2. Wait and Check NRDB
```sql
-- Check if metric arrived
FROM Metric 
SELECT * 
WHERE collector.name = 'cloudwatch-metric-streams'
AND aws.MetricName = 'BytesInPerSec'
SINCE 5 minutes ago
LIMIT 1
```

### 3. Check Entity Creation
```sql
-- See if entity was synthesized
FROM entity
SELECT *
WHERE type = 'AWS_KAFKA_BROKER'
AND name LIKE '%test-cluster%'
SINCE 10 minutes ago
```

### 4. Check UI Visibility
```sql
-- This is what the UI queries
FROM AwsMskBrokerSample
SELECT *
WHERE providerExternalId IS NOT NULL
SINCE 1 hour ago
```

### 5. If Not Visible, Debug
```javascript
// debug-payload.js
// Check what fields are missing

const debugQuery = `
  FROM Metric
  SELECT 
    count(*) as 'Total Metrics',
    percentage(count(*), WHERE entity.guid IS NOT NULL) as 'Has Entity GUID',
    percentage(count(*), WHERE aws.accountId IS NOT NULL) as 'Has AWS Account',
    percentage(count(*), WHERE providerExternalId IS NOT NULL) as 'Has Provider External ID'
  WHERE collector.name = 'cloudwatch-metric-streams'
  SINCE 10 minutes ago
`;
```

## Common Issues and Fixes

### Issue 1: Metrics arrive but no entities
**Fix**: Add `entity.type` and `entity.name` to attributes

### Issue 2: Entities exist but not in UI
**Fix**: Add `providerExternalId` - this is CRITICAL!

### Issue 3: Wrong entity type
**Fix**: Use exact values: `AWS_KAFKA_CLUSTER`, `AWS_KAFKA_BROKER`, `AWS_KAFKA_TOPIC`

### Issue 4: No account mapping
**Fix**: Ensure `providerAccountId` and `providerExternalId` match your AWS account ID

## Minimal Required Fields

For UI visibility, you MUST have:

```javascript
{
  // Identify as CloudWatch
  "collector.name": "cloudwatch-metric-streams",
  "eventType": "Metric",
  "instrumentation.provider": "cloudwatch",
  
  // AWS identification
  "aws.Namespace": "AWS/Kafka",
  "aws.accountId": "123456789012",
  "awsAccountId": "123456789012",
  
  // CRITICAL for UI
  "providerAccountId": "123456789012",
  "providerExternalId": "123456789012", // WITHOUT THIS, NO UI!
  
  // Entity info
  "entity.type": "AWS_KAFKA_BROKER",
  "entity.name": "your-entity-name",
  
  // Dimensions
  "aws.Dimensions": [/* array of name/value pairs */]
}
```

## Success Criteria

You know it's working when:
1. ✅ Metrics show up in NRDB with `collector.name = 'cloudwatch-metric-streams'`
2. ✅ Entities appear in entity search with correct types
3. ✅ `providerExternalId` is present in AwsMsk*Sample events
4. ✅ Cluster appears in Message Queues UI at https://one.newrelic.com/nr1-core/apm-services/message-queues

## Next Steps

1. Start with minimal payload
2. Verify in NRDB
3. Check entity synthesis
4. Navigate to Message Queues UI
5. If not visible, check `providerExternalId`!

Remember: This is just sending hardcoded test data - no real Kafka needed!