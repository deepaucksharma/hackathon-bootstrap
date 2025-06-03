Summary of Changes
1. New Configuration Flag

EnableBrokerTopicMetricsV2 (default: false) - Enables collection of new essential broker and topic metrics

2. New Broker-Level Metrics (V2)
Metric NameJMX SourceDescriptionbroker.ActiveControllerCountkafka.controller:type=KafkaController,name=ActiveControllerCountIndicates if this broker is the active controller (1) or not (0)broker.GlobalPartitionCountkafka.controller:type=KafkaController,name=GlobalPartitionCountTotal number of partitions across all topics in the cluster
3. New Broker Topic-Level Metrics (V2)
Metric NameJMX SourceDescriptionbroker.bytesReadFromTopicPerSecondkafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec,topic={topic}Rate of bytes read from a specific topic (consumer fetch activity)broker.messagesProducedToTopicPerSecondkafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec,topic={topic}Rate of messages produced to a specific topic
4. Topic Inventory Enhancement

Added topic.name to topic inventory - stores the actual topic name as an inventory item

5. Key Implementation Details
go// New function to conditionally append V2 metrics
func GetFinalMetricSets(metricSets []*JMXMetricSet, v2MetricSets []*JMXMetricSet) []*JMXMetricSet {
    finalMetricSets := append(metricSets...)
    if args.GlobalArgs.EnableBrokerTopicMetricsV2 {
        finalMetricSets = append(finalMetricSets, v2MetricSets...)
    }
    return finalMetricSets
}
Important Notes

Backward Compatibility: These metrics are opt-in only - existing deployments are unaffected unless the flag is explicitly enabled
Metric Naming Clarification:

broker.bytesReadFromTopicPerSecond comes from BytesOutPerSec JMX metric (bytes OUT from broker = bytes READ by consumers)
broker.messagesProducedToTopicPerSecond comes from MessagesInPerSec JMX metric


Why "V2" Metrics?

These appear to be essential metrics for specific New Relic capabilities
Separated to avoid breaking existing metric collection patterns
Allows gradual rollout and testing



Updated Metrics Table Addition
To add to our comprehensive metrics table:
New Broker V2 Metrics
Metric NameEntity TypeSample TypeSourceJMX MBeanDescriptionConfiguration Requiredbroker.ActiveControllerCountka-brokerKafkaBrokerSampleJMXkafka.controller:type=KafkaController,name=ActiveControllerCount,attr=Value1 if broker is active controller, 0 otherwiseENABLE_BROKER_TOPIC_METRICS_V2: truebroker.GlobalPartitionCountka-brokerKafkaBrokerSampleJMXkafka.controller:type=KafkaController,name=GlobalPartitionCount,attr=ValueTotal partition count in clusterENABLE_BROKER_TOPIC_METRICS_V2: true
New Broker Topic V2 Metrics
Metric NameEntity TypeSample TypeSourceJMX MBeanDescriptionConfiguration Requiredbroker.bytesReadFromTopicPerSecondka-brokerKafkaBrokerSampleJMXkafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec,topic={topic},attr=CountBytes read from topic per secondENABLE_BROKER_TOPIC_METRICS_V2: truebroker.messagesProducedToTopicPerSecondka-brokerKafkaBrokerSampleJMXkafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec,topic={topic},attr=CountMessages produced to topic per secondENABLE_BROKER_TOPIC_METRICS_V2: true
Configuration Example
yamlintegrations:
  - name: nri-kafka
    env:
      CLUSTER_NAME: "production-kafka"
      METRICS: true
      # Enable new V2 metrics
      ENABLE_BROKER_TOPIC_METRICS_V2: true
These V2 metrics provide critical controller status and more granular topic-level throughput metrics that complement the existing metric set.

# New Relic Queues and Streams feature requirements analysis

## Core metrics required for UI functionality

New Relic's Queues and Streams UI requires a comprehensive set of metrics that go beyond traditional Kafka JMX monitoring to provide queue-oriented visibility. The essential metrics fall into four categories:

**Cluster overview metrics** form the foundation, including broker count, topic count, partition count, and critically, the active controller status. These metrics power the Summary section and enable the Kafka Navigator's honeycomb visualization that displays cluster health at a glance.

**Throughput metrics** are collected at multiple granularities. At the cluster and broker level, the UI needs bytes.in.rate and bytes.out.rate for overall throughput visualization. More importantly, **topic-level metrics** like bytesReadFromTopicPerSecond and messagesProducedToTopicPerSecond enable the detailed Topics section that shows the top 20 topics with their individual throughput characteristics. This granular visibility is what distinguishes queue monitoring from traditional Kafka monitoring.

**Performance indicators** include consumer lag metrics (critical for queue depth understanding), latency measurements across the pipeline, throttling rates, retry counts, and offline partition counts. These metrics enable the UI to identify bottlenecks and potential issues in message flow rather than just reporting raw performance numbers.

**Resource utilization metrics**, while optional for basic functionality, become essential for managed service integrations. These include CPU, memory, disk usage, network processor utilization, and active connection counts.

## Why specific metrics were added to nri-kafka

The four metrics specifically mentioned—broker.ActiveControllerCount, broker.GlobalPartitionCount, broker.bytesReadFromTopicPerSecond, and broker.messagesProducedToTopicPerSecond—were added to address fundamental gaps in traditional Kafka monitoring:

**broker.ActiveControllerCount** ensures cluster leadership health monitoring. The Queues and Streams UI uses this to verify exactly one controller is active, a critical indicator for cluster stability that directly feeds into the health status visualization.

**broker.GlobalPartitionCount** provides cluster-wide partition visibility rather than per-broker counts. This metric is essential for the UI's summary section and enables operators to understand partition distribution across the entire cluster, supporting capacity planning and rebalancing decisions.

**broker.bytesReadFromTopicPerSecond** and **broker.messagesProducedToTopicPerSecond** enable topic-level throughput monitoring from both producer and consumer perspectives. These metrics are fundamental to the queue-oriented approach, allowing the UI to show bi-directional message flow and identify topics with asymmetric production/consumption patterns—a key indicator of potential queue buildup.

## Gaps between nri-kafka and managed service integrations

MSK and Confluent Cloud integrations provide several categories of metrics that traditional nri-kafka lacks:

**Detailed timing breakdowns** are a major advantage of MSK. The integration provides granular metrics like fetchConsumerLocalTimeMsMean, fetchConsumerRequestQueueTimeMsMean, and fetchConsumerResponseSendTimeMsMean. These timing metrics enable deep performance analysis by showing exactly where latency occurs in the request pipeline—information not available through standard JMX.

**Managed infrastructure metrics** include system-level CPU, memory, and disk utilization that MSK provides through CloudWatch. The separation of application and data log disk usage (kafkaAppLogsDiskUsed vs kafkaDataLogsDiskUsed) offers operational insights impossible to obtain from JMX alone.

**Enhanced throttling metrics** from MSK include fetchThrottleByteRate and fetchThrottleQueueSize, providing visibility into rate limiting behavior that affects queue performance but isn't exposed through traditional Kafka metrics.

**Cloud-native abstractions** from Confluent include retained_bytes at the cluster level and active_connection_count, metrics that reflect the managed service's handling of retention and connection management.

## Additional metrics needed for feature parity

To achieve parity with MSK and Confluent integrations, nri-kafka would need several categories of enhancements:

**Consumer group details** represent the most critical gap. Full consumer group metrics including per-group lag, state, membership, and partition assignments would enable the queue-oriented monitoring that Queues and Streams promises. Currently, the UI can show aggregate lag but lacks the granularity needed for debugging specific consumer issues.

**Request timing breakdowns** similar to MSK's implementation would provide essential performance debugging capabilities. Breaking down request latency into queue time, processing time, and response time enables identification of specific bottlenecks.

**Enhanced resource metrics** including JVM memory patterns, thread pool utilization, and file descriptor usage would provide the operational visibility that managed services include by default. These metrics become critical at scale when resource exhaustion can cause queue backup.

**Topic-level operational metrics** such as retention sizes, compression ratios, and message conversion rates would complete the topic-centric view that the Queues and Streams UI emphasizes.

## Queue-oriented versus traditional monitoring paradigm

The research reveals a fundamental philosophical difference between traditional Kafka monitoring and New Relic's queue-oriented approach:

Traditional Kafka monitoring treats the system as a **distributed log**, emphasizing broker health, replication status, and raw throughput. It answers questions like "Is my Kafka cluster healthy?" and "What's my peak throughput?"

Queue-oriented monitoring treats Kafka as a **message queue system**, emphasizing message flow, consumer lag, and service relationships. It answers questions like "Where are messages backing up?" and "Which services are falling behind?"

This paradigm shift manifests in several ways:

**Bi-directional visibility** shows both producer and consumer perspectives simultaneously, treating them as equal participants in message flow rather than independent operations.

**Flow-based visualization** through features like the Kafka Navigator presents the system as interconnected components rather than isolated brokers, making bottlenecks immediately apparent.

**Queue depth focus** prioritizes metrics like consumer lag and partition backlog over raw throughput numbers, reflecting that in a queue system, unconsumed messages represent the primary operational concern.

**Service integration** through APM correlation treats Kafka as part of the application architecture rather than standalone infrastructure, enabling tracing of messages from producer service through Kafka to consumer service.

The addition of global and topic-level metrics to nri-kafka represents an evolution toward this queue-oriented model, providing the cluster-wide and flow-based visibility that makes Kafka monitoring accessible to application teams, not just infrastructure operators.

