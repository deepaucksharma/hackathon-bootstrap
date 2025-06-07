#!/usr/bin/env node

/**
 * MSK Shim MessageQueue Adapter
 * 
 * This script demonstrates how to transform AWS MSK metrics
 * into MessageQueueSample events for UI visibility
 */

const https = require('https');

// Transform AwsMskBrokerSample to MessageQueueSample
function transformBrokerToQueue(mskEvent) {
  return {
    "eventType": "MessageQueueSample",
    "timestamp": mskEvent.timestamp || Date.now(),
    "provider": "AwsMsk",
    "collector.name": mskEvent["collector.name"] || "cloudwatch-metric-streams",
    
    // Queue identification
    "queue.name": `${mskEvent.clusterName}-broker-${mskEvent["broker.id"] || mskEvent["provider.brokerId"]}`,
    "queue.type": "kafka_broker",
    
    // Entity fields
    "entity.name": mskEvent.entityName || `${mskEvent.clusterName}-broker-${mskEvent["broker.id"]}`,
    "entity.type": "AWS_KAFKA_BROKER",
    "entity.guid": mskEvent.entityGuid || generateGuid("KAFKA_BROKER", mskEvent.clusterName, mskEvent["broker.id"]),
    
    // Queue metrics from MSK metrics
    "queue.messagesPerSecond": mskEvent["provider.messagesInPerSec.Average"] || 0,
    "queue.bytesPerSecond": mskEvent["provider.bytesInPerSec.Average"] || 0,
    "queue.bytesOutPerSecond": mskEvent["provider.bytesOutPerSec.Average"] || 0,
    "queue.cpuPercent": mskEvent["provider.cpuUser.Average"] || 0,
    "queue.memoryPercent": mskEvent["provider.memoryUsed.Average"] || 0,
    "queue.diskUsedPercent": mskEvent["provider.diskUsed.Average"] || 0,
    
    // Preserve relationships
    "clusterName": mskEvent.clusterName,
    "brokerId": mskEvent["broker.id"] || mskEvent["provider.brokerId"],
    
    // AWS context
    "awsRegion": mskEvent.awsRegion || mskEvent["provider.region"],
    "awsAccountId": mskEvent.awsAccountId || mskEvent["provider.accountId"],
    "providerAccountId": mskEvent.providerAccountId,
    
    // Include all original metrics as custom attributes
    ...Object.keys(mskEvent).reduce((acc, key) => {
      if (key.startsWith('provider.') && !key.includes('password')) {
        acc[`msk.${key.replace('provider.', '')}`] = mskEvent[key];
      }
      return acc;
    }, {})
  };
}

// Transform AwsMskTopicSample to MessageQueueSample
function transformTopicToQueue(mskEvent) {
  const topicName = mskEvent["topic.name"] || mskEvent["provider.topicName"] || mskEvent.entityName;
  
  return {
    "eventType": "MessageQueueSample",
    "timestamp": mskEvent.timestamp || Date.now(),
    "provider": "AwsMsk",
    "collector.name": mskEvent["collector.name"] || "cloudwatch-metric-streams",
    
    // Queue identification
    "queue.name": topicName,
    "queue.type": "kafka_topic",
    
    // Entity fields
    "entity.name": topicName,
    "entity.type": "AWS_KAFKA_TOPIC",
    "entity.guid": mskEvent.entityGuid || generateGuid("KAFKA_TOPIC", mskEvent.clusterName, topicName),
    
    // Queue metrics
    "queue.messagesPerSecond": mskEvent["provider.messagesInPerSec.Average"] || 0,
    "queue.bytesPerSecond": mskEvent["provider.bytesInPerSec.Average"] || 0,
    "queue.bytesOutPerSecond": mskEvent["provider.bytesOutPerSec.Average"] || 0,
    "queue.consumerLag": mskEvent["provider.sumOffsetLag.Average"] || 0,
    "queue.partitionCount": mskEvent["provider.partitionCount"] || 0,
    "queue.replicationFactor": mskEvent["provider.replicationFactor"] || 0,
    
    // Preserve relationships
    "clusterName": mskEvent.clusterName,
    "topicName": topicName,
    
    // AWS context
    "awsRegion": mskEvent.awsRegion || mskEvent["provider.region"],
    "awsAccountId": mskEvent.awsAccountId || mskEvent["provider.accountId"],
    "providerAccountId": mskEvent.providerAccountId,
    
    // Include all original metrics
    ...Object.keys(mskEvent).reduce((acc, key) => {
      if (key.startsWith('provider.') && !key.includes('password')) {
        acc[`msk.${key.replace('provider.', '')}`] = mskEvent[key];
      }
      return acc;
    }, {})
  };
}

// Transform AwsMskClusterSample to MessageQueueSample
function transformClusterToQueue(mskEvent) {
  return {
    "eventType": "MessageQueueSample",
    "timestamp": mskEvent.timestamp || Date.now(),
    "provider": "AwsMsk",
    "collector.name": mskEvent["collector.name"] || "cloudwatch-metric-streams",
    
    // Queue identification
    "queue.name": mskEvent.clusterName,
    "queue.type": "kafka_cluster",
    
    // Entity fields
    "entity.name": mskEvent.clusterName,
    "entity.type": "AWS_KAFKA_CLUSTER",
    "entity.guid": mskEvent.entityGuid || generateGuid("KAFKA_CLUSTER", mskEvent.clusterName),
    
    // Cluster-level queue metrics
    "queue.messagesPerSecond": mskEvent["provider.globalMessagesInPerSec.Average"] || 0,
    "queue.bytesPerSecond": mskEvent["provider.globalBytesInPerSec.Average"] || 0,
    "queue.brokerCount": mskEvent["provider.brokerCount"] || 0,
    "queue.activeConnections": mskEvent["provider.connectionCount.Average"] || 0,
    "queue.partitionCount": mskEvent["provider.globalPartitionCount.Average"] || 0,
    "queue.topicCount": mskEvent["provider.globalTopicCount.Average"] || 0,
    
    // Preserve cluster identity
    "clusterName": mskEvent.clusterName,
    
    // AWS context
    "awsRegion": mskEvent.awsRegion || mskEvent["provider.region"],
    "awsAccountId": mskEvent.awsAccountId || mskEvent["provider.accountId"],
    "providerAccountId": mskEvent.providerAccountId,
    "clusterArn": mskEvent["provider.clusterArn"],
    
    // Include all original metrics
    ...Object.keys(mskEvent).reduce((acc, key) => {
      if (key.startsWith('provider.') && !key.includes('password')) {
        acc[`msk.${key.replace('provider.', '')}`] = mskEvent[key];
      }
      return acc;
    }, {})
  };
}

// Helper function to generate entity GUID
function generateGuid(entityType, ...parts) {
  // This is a simplified version - in production, use the actual account ID
  const accountId = process.env.ACC || "YOUR_ACCOUNT_ID";
  const identifier = parts.filter(p => p).join(":");
  return Buffer.from(`${accountId}|INFRA|${entityType}|${identifier}`).toString('base64');
}

// Main transformation function
function transformMskToMessageQueue(mskEvent) {
  switch (mskEvent.eventType) {
    case "AwsMskBrokerSample":
      return transformBrokerToQueue(mskEvent);
    case "AwsMskTopicSample":
      return transformTopicToQueue(mskEvent);
    case "AwsMskClusterSample":
      return transformClusterToQueue(mskEvent);
    default:
      console.warn(`Unknown event type: ${mskEvent.eventType}`);
      return null;
  }
}

// Example usage
if (require.main === module) {
  // Example MSK broker event
  const mskBrokerEvent = {
    "eventType": "AwsMskBrokerSample",
    "timestamp": Date.now(),
    "entityName": "production-cluster-broker-1",
    "clusterName": "production-cluster",
    "broker.id": "1",
    "provider.brokerId": "1",
    "provider.bytesInPerSec.Average": 1000000,
    "provider.bytesOutPerSec.Average": 800000,
    "provider.cpuUser.Average": 35.5,
    "awsRegion": "us-east-1",
    "awsAccountId": "123456789012"
  };
  
  const messageQueueEvent = transformMskToMessageQueue(mskBrokerEvent);
  console.log('Transformed Event:');
  console.log(JSON.stringify(messageQueueEvent, null, 2));
}

module.exports = {
  transformMskToMessageQueue,
  transformBrokerToQueue,
  transformTopicToQueue,
  transformClusterToQueue
};