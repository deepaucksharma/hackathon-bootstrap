/**
 * Stream Data Model Documentation
 * 
 * This file documents the exact data structure that gets streamed to New Relic
 * when platform.js runs. It shows the unified data model across all modes.
 */

class StreamDataModel {
  constructor() {
    this.description = "New Relic Message Queues Platform - Stream Data Model";
    this.version = "1.0.0";
  }

  /**
   * Base Event Structure
   * This is the core structure sent to New Relic for every entity
   */
  getBaseEventStructure() {
    return {
      // New Relic event metadata
      eventType: "MessageQueue", // Always "MessageQueue" for our events
      timestamp: 1704067200000, // Unix timestamp in milliseconds
      
      // Entity identification (New Relic Entity Synthesis)
      "entity.guid": "MESSAGE_QUEUE_BROKER|123456|kafka|cluster-prod|broker-1",
      "entity.name": "broker-1", 
      "entity.type": "MESSAGE_QUEUE_BROKER", // Entity type for synthesis
      entityType: "MESSAGE_QUEUE_BROKER", // Duplicate for backwards compatibility
      entityGuid: "MESSAGE_QUEUE_BROKER|123456|kafka|cluster-prod|broker-1", // Duplicate for backwards compatibility
      
      // Provider and environment metadata
      provider: "kafka",
      accountId: "123456",
      environment: "production",
      region: "us-east-1",
      
      // Entity-specific metadata (varies by entity type)
      clusterName: "cluster-prod",
      
      // Golden metrics (varies by entity type - see specific entity models below)
      throughputPerSecond: 1500.75,
      errorRate: 0.02,
      
      // Additional tags and metadata
      "tag.environment": "production",
      "tag.team": "platform",
      "tag.cost-center": "engineering"
    };
  }

  /**
   * MESSAGE_QUEUE_BROKER Events
   * Streamed for each Kafka broker in the cluster
   */
  getBrokerEventModel() {
    return {
      eventType: "MessageQueue",
      timestamp: 1704067200000,
      
      // Entity identification
      "entity.guid": "MESSAGE_QUEUE_BROKER|123456|kafka|cluster-prod|broker-1",
      "entity.name": "broker-1",
      "entity.type": "MESSAGE_QUEUE_BROKER",
      entityType: "MESSAGE_QUEUE_BROKER",
      entityGuid: "MESSAGE_QUEUE_BROKER|123456|kafka|cluster-prod|broker-1",
      
      // Provider metadata
      provider: "kafka",
      accountId: "123456",
      environment: "production",
      
      // Broker-specific metadata
      clusterName: "cluster-prod",
      brokerId: "1",
      brokerHost: "kafka-broker-1.cluster-prod.kafka.svc.cluster.local",
      brokerPort: 9092,
      isController: false,
      
      // Golden Metrics for Brokers
      throughputPerSecond: 1500.75,        // Messages/second through this broker
      diskUsagePercent: 65.2,              // Disk utilization percentage  
      networkBytesInPerSecond: 52428800,   // Network bytes in/second
      networkBytesOutPerSecond: 41943040,  // Network bytes out/second
      partitionCount: 45,                  // Total partitions on this broker
      leaderPartitionCount: 23,            // Partitions where this broker is leader
      requestRate: 890.5,                  // Requests/second
      errorRate: 0.02,                     // Error rate (0.0-1.0)
      
      // Additional broker metrics
      jvmMemoryUsed: 2147483648,           // JVM memory used in bytes
      jvmMemoryMax: 4294967296,            // JVM max memory in bytes
      gcTime: 125.5,                       // GC time in milliseconds
      
      // Tags
      "tag.environment": "production",
      "tag.datacenter": "us-east-1a",
      "tag.cluster": "cluster-prod"
    };
  }

  /**
   * MESSAGE_QUEUE_TOPIC Events  
   * Streamed for each Kafka topic
   */
  getTopicEventModel() {
    return {
      eventType: "MessageQueue",
      timestamp: 1704067200000,
      
      // Entity identification
      "entity.guid": "MESSAGE_QUEUE_TOPIC|123456|kafka|cluster-prod|user-events",
      "entity.name": "user-events",
      "entity.type": "MESSAGE_QUEUE_TOPIC",
      entityType: "MESSAGE_QUEUE_TOPIC", 
      entityGuid: "MESSAGE_QUEUE_TOPIC|123456|kafka|cluster-prod|user-events",
      
      // Provider metadata
      provider: "kafka",
      accountId: "123456",
      environment: "production",
      
      // Topic-specific metadata
      clusterName: "cluster-prod",
      topicName: "user-events",
      partitionCount: 12,
      replicationFactor: 3,
      retentionMs: 604800000, // 7 days
      
      // Golden Metrics for Topics
      throughputPerSecond: 425.3,          // Messages/second for this topic
      bytesInPerSecond: 1048576,           // Bytes in/second
      bytesOutPerSecond: 2097152,          // Bytes out/second
      partitionCount: 12,                  // Number of partitions
      retentionBytes: 1073741824000,       // Retention in bytes (1TB)
      offsetLag: 1250,                     // Consumer lag (messages behind)
      errorRate: 0.001,                    // Topic-level error rate
      
      // Topic configuration
      compressionType: "gzip",
      cleanupPolicy: "delete",
      segmentMs: 86400000, // 1 day
      
      // Tags
      "tag.environment": "production", 
      "tag.topic-type": "events",
      "tag.business-unit": "user-analytics"
    };
  }

  /**
   * MESSAGE_QUEUE_CONSUMER Events
   * Streamed for each consumer group
   */
  getConsumerEventModel() {
    return {
      eventType: "MessageQueue",
      timestamp: 1704067200000,
      
      // Entity identification
      "entity.guid": "MESSAGE_QUEUE_CONSUMER|123456|kafka|cluster-prod|analytics-consumer",
      "entity.name": "analytics-consumer",
      "entity.type": "MESSAGE_QUEUE_CONSUMER",
      entityType: "MESSAGE_QUEUE_CONSUMER",
      entityGuid: "MESSAGE_QUEUE_CONSUMER|123456|kafka|cluster-prod|analytics-consumer",
      
      // Provider metadata
      provider: "kafka",
      accountId: "123456", 
      environment: "production",
      
      // Consumer-specific metadata
      clusterName: "cluster-prod",
      consumerGroupId: "analytics-consumer",
      topicName: "user-events", // Primary topic (for multi-topic consumers, this is the largest)
      memberCount: 3,
      state: "Stable", // Kafka consumer group state
      
      // Golden Metrics for Consumers
      lagTotal: 1250,                      // Total lag across all partitions
      lagMax: 450,                         // Maximum lag on any partition
      throughputPerSecond: 380.7,          // Messages consumed/second
      commitRate: 5.2,                     // Commits/second
      errorRate: 0.005,                    // Consumer error rate
      rebalanceRate: 0.1,                  // Rebalances/hour
      
      // Consumer performance metrics
      fetchLatencyAvg: 12.5,               // Average fetch latency (ms)
      processTimeAvg: 45.2,                // Average processing time (ms)
      
      // Partition assignment details
      assignedPartitions: 4,               // Partitions assigned to this group
      
      // Tags
      "tag.environment": "production",
      "tag.service": "analytics-service", 
      "tag.consumer-type": "real-time"
    };
  }

  /**
   * MESSAGE_QUEUE_CLUSTER Events
   * Streamed for each Kafka cluster (aggregated metrics)
   */
  getClusterEventModel() {
    return {
      eventType: "MessageQueue", 
      timestamp: 1704067200000,
      
      // Entity identification
      "entity.guid": "MESSAGE_QUEUE_CLUSTER|123456|kafka|cluster-prod",
      "entity.name": "cluster-prod",
      "entity.type": "MESSAGE_QUEUE_CLUSTER",
      entityType: "MESSAGE_QUEUE_CLUSTER",
      entityGuid: "MESSAGE_QUEUE_CLUSTER|123456|kafka|cluster-prod",
      
      // Provider metadata
      provider: "kafka",
      accountId: "123456",
      environment: "production",
      
      // Cluster-specific metadata  
      clusterName: "cluster-prod",
      brokerCount: 3,
      topicCount: 25,
      partitionCount: 150,
      replicaCount: 450, // partitionCount * replicationFactor
      
      // Golden Metrics for Clusters (aggregated)
      throughputPerSecond: 2350.8,         // Total cluster throughput
      totalBytesInPerSecond: 157286400,    // Total bytes in/second
      totalBytesOutPerSecond: 125829120,   // Total bytes out/second
      brokerCount: 3,                      // Number of brokers
      topicCount: 25,                      // Number of topics
      consumerGroupCount: 8,               // Number of consumer groups
      healthScore: 0.95,                   // Cluster health (0.0-1.0)
      errorRate: 0.02,                     // Cluster-wide error rate
      
      // Cluster resource metrics
      totalDiskUsageBytes: 2199023255552,  // Total disk usage (2TB)
      totalDiskCapacityBytes: 10995116277760, // Total disk capacity (10TB)
      avgCpuUsagePercent: 45.2,            // Average CPU across brokers
      
      // Cluster configuration
      kafkaVersion: "2.8.1",
      zookeeperVersion: "3.6.3",
      
      // Tags
      "tag.environment": "production",
      "tag.region": "us-east-1", 
      "tag.cluster-type": "primary"
    };
  }

  /**
   * Get complete event batch structure
   * This shows how multiple events are batched together for streaming
   */
  getStreamBatchStructure() {
    return {
      batchSize: 15,
      timestamp: 1704067200000,
      events: [
        // 1 cluster event
        this.getClusterEventModel(),
        
        // 3 broker events (one per broker)
        this.getBrokerEventModel(),
        // ... 2 more broker events
        
        // 8 topic events  
        this.getTopicEventModel(),
        // ... 7 more topic events
        
        // 3 consumer events
        this.getConsumerEventModel()
        // ... 2 more consumer events
      ]
    };
  }

  /**
   * Entity GUID Format Documentation
   * Shows the standardized GUID format for each entity type
   */
  getGuidFormats() {
    return {
      broker: "MESSAGE_QUEUE_BROKER|{accountId}|{provider}|{clusterName}|{brokerId}",
      topic: "MESSAGE_QUEUE_TOPIC|{accountId}|{provider}|{clusterName}|{topicName}", 
      consumer: "MESSAGE_QUEUE_CONSUMER|{accountId}|{provider}|{clusterName}|{consumerGroupId}",
      cluster: "MESSAGE_QUEUE_CLUSTER|{accountId}|{provider}|{clusterName}",
      
      examples: {
        broker: "MESSAGE_QUEUE_BROKER|123456|kafka|cluster-prod|broker-1",
        topic: "MESSAGE_QUEUE_TOPIC|123456|kafka|cluster-prod|user-events",
        consumer: "MESSAGE_QUEUE_CONSUMER|123456|kafka|cluster-prod|analytics-consumer", 
        cluster: "MESSAGE_QUEUE_CLUSTER|123456|kafka|cluster-prod"
      }
    };
  }

  /**
   * Golden Metrics Reference
   * Documents the golden metrics for each entity type
   */
  getGoldenMetricsReference() {
    return {
      MESSAGE_QUEUE_BROKER: [
        { name: "throughputPerSecond", unit: "messages/second", description: "Message throughput" },
        { name: "diskUsagePercent", unit: "percentage", description: "Disk utilization" },
        { name: "networkBytesInPerSecond", unit: "bytes/second", description: "Network bytes in" },
        { name: "networkBytesOutPerSecond", unit: "bytes/second", description: "Network bytes out" },
        { name: "errorRate", unit: "percentage", description: "Error rate" }
      ],
      
      MESSAGE_QUEUE_TOPIC: [
        { name: "throughputPerSecond", unit: "messages/second", description: "Topic throughput" },
        { name: "bytesInPerSecond", unit: "bytes/second", description: "Data ingestion rate" },
        { name: "bytesOutPerSecond", unit: "bytes/second", description: "Data consumption rate" }, 
        { name: "partitionCount", unit: "count", description: "Number of partitions" },
        { name: "offsetLag", unit: "messages", description: "Consumer lag" }
      ],
      
      MESSAGE_QUEUE_CONSUMER: [
        { name: "lagTotal", unit: "messages", description: "Total consumer lag" },
        { name: "lagMax", unit: "messages", description: "Maximum partition lag" },
        { name: "throughputPerSecond", unit: "messages/second", description: "Consumption rate" },
        { name: "commitRate", unit: "commits/second", description: "Offset commit rate" },
        { name: "errorRate", unit: "percentage", description: "Consumer error rate" }
      ],
      
      MESSAGE_QUEUE_CLUSTER: [
        { name: "throughputPerSecond", unit: "messages/second", description: "Cluster throughput" },
        { name: "brokerCount", unit: "count", description: "Number of brokers" },
        { name: "topicCount", unit: "count", description: "Number of topics" },
        { name: "healthScore", unit: "percentage", description: "Overall health" },
        { name: "errorRate", unit: "percentage", description: "Cluster error rate" }
      ]
    };
  }

  /**
   * Streaming Patterns by Mode
   * Documents what gets streamed in each platform mode
   */
  getStreamingPatterns() {
    return {
      simulation: {
        description: "Simulated data for testing and demos",
        entities: ["MESSAGE_QUEUE_CLUSTER", "MESSAGE_QUEUE_BROKER", "MESSAGE_QUEUE_TOPIC"],
        frequency: "Every 60 seconds (configurable)",
        dataSource: "Generated with realistic patterns",
        eventCount: "9 events per cycle (1 cluster + 3 brokers + 5 topics)"
      },
      
      infrastructure: {
        description: "Real Kafka data from nri-kafka integration", 
        entities: ["MESSAGE_QUEUE_BROKER", "MESSAGE_QUEUE_TOPIC", "MESSAGE_QUEUE_CONSUMER"],
        frequency: "Every 60 seconds (configurable)",
        dataSource: "nri-kafka via New Relic Infrastructure agent",
        eventCount: "Variable based on actual topology"
      },
      
      hybrid: {
        description: "Combination of real and simulated data",
        entities: ["MESSAGE_QUEUE_CLUSTER", "MESSAGE_QUEUE_BROKER", "MESSAGE_QUEUE_TOPIC", "MESSAGE_QUEUE_CONSUMER"],
        frequency: "Every 60 seconds (configurable)", 
        dataSource: "Real data where available, simulated to fill gaps",
        eventCount: "Variable, ensures complete topology coverage"
      }
    };
  }

  /**
   * Generate sample payload for debugging
   */
  generateSamplePayload() {
    return {
      metadata: {
        platformVersion: "1.0.0",
        mode: "simulation",
        timestamp: Date.now(),
        batchId: `batch-${Date.now()}`,
        eventCount: 9
      },
      events: [
        this.getClusterEventModel(),
        this.getBrokerEventModel(), 
        this.getTopicEventModel(),
        this.getConsumerEventModel()
      ]
    };
  }
}

module.exports = StreamDataModel;