# NRI-Kafka Metrics Comparison: Current vs Proposed

This document provides a comprehensive comparison between the metrics currently collected by nri-kafka and the new metrics proposed in the Extended Technical Specification for Kafka Share Groups and Enhanced Queue Monitoring.

## Table of Contents
- [Current Implementation Metrics](#current-implementation-metrics)
- [Proposed New Metrics](#proposed-new-metrics)
- [Metric Mapping Summary](#metric-mapping-summary)

## Current Implementation Metrics

### Broker Metrics (JMX Source)

#### Request Metrics
| Metric Name | Source | Type | Description |
|------------|--------|------|-------------|
| `request.produceRequestsPerSecond` | `kafka.network:type=RequestMetrics,name=RequestsPerSec,request=Produce` | GAUGE | Produce requests per second |
| `request.fetchConsumerRequestsPerSecond` | `kafka.network:type=RequestMetrics,name=RequestsPerSec,request=FetchConsumer` | GAUGE | Consumer fetch requests per second |
| `request.fetchFollowerRequestsPerSecond` | `kafka.network:type=RequestMetrics,name=RequestsPerSec,request=FetchFollower` | GAUGE | Follower fetch requests per second |
| `request.metadataRequestsPerSecond` | `kafka.network:type=RequestMetrics,name=RequestsPerSec,request=Metadata` | GAUGE | Metadata requests per second |
| `request.offsetCommitRequestsPerSecond` | `kafka.network:type=RequestMetrics,name=RequestsPerSec,request=OffsetCommit` | GAUGE | Offset commit requests per second |
| `request.listGroupsRequestsPerSecond` | `kafka.network:type=RequestMetrics,name=RequestsPerSec,request=ListGroups` | GAUGE | List groups requests per second |

#### Request Time Metrics
| Metric Name | Source | Type | Description |
|------------|--------|------|-------------|
| `request.avgTimeMetadata` | `kafka.network:type=RequestMetrics,name=TotalTimeMs,request=Metadata,attr=Mean` | GAUGE | Average metadata request time |
| `request.avgTimeMetadata99Percentile` | `kafka.network:type=RequestMetrics,name=TotalTimeMs,request=Metadata,attr=99thPercentile` | GAUGE | 99th percentile metadata request time |
| `request.avgTimeFetch` | `kafka.network:type=RequestMetrics,name=TotalTimeMs,request=Fetch,attr=Mean` | GAUGE | Average fetch request time |
| `request.fetchTime99Percentile` | `kafka.network:type=RequestMetrics,name=TotalTimeMs,request=Fetch,attr=99thPercentile` | GAUGE | 99th percentile fetch request time |
| `request.avgTimeOffset` | `kafka.network:type=RequestMetrics,name=TotalTimeMs,request=Offsets,attr=Mean` | GAUGE | Average offset request time |
| `request.avgTimeOffset99Percentile` | `kafka.network:type=RequestMetrics,name=TotalTimeMs,request=Offsets,attr=99thPercentile` | GAUGE | 99th percentile offset request time |
| `request.avgTimeUpdateMetadata` | `kafka.network:type=RequestMetrics,name=TotalTimeMs,request=UpdateMetadata,attr=Mean` | GAUGE | Average update metadata time |
| `request.avgTimeUpdateMetadata99Percentile` | `kafka.network:type=RequestMetrics,name=TotalTimeMs,request=UpdateMetadata,attr=99thPercentile` | GAUGE | 99th percentile update metadata time |
| `request.avgTimeProduceRequest` | `kafka.network:type=RequestMetrics,name=TotalTimeMs,request=Produce,attr=Mean` | GAUGE | Average produce request time |
| `request.produceTime99Percentile` | `kafka.network:type=RequestMetrics,name=TotalTimeMs,request=Produce,attr=99thPercentile` | GAUGE | 99th percentile produce request time |

#### Replication Metrics
| Metric Name | Source | Type | Description |
|------------|--------|------|-------------|
| `replication.isrExpandsPerSecond` | `kafka.server:type=ReplicaManager,name=IsrExpandsPerSec,attr=Count` | RATE | ISR expansions per second |
| `replication.isrShrinksPerSecond` | `kafka.server:type=ReplicaManager,name=IsrShrinksPerSec,attr=Count` | RATE | ISR shrinks per second |
| `replication.unreplicatedPartitions` | `kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions,attr=Value` | GAUGE | Number of under-replicated partitions |
| `replication.leaderElectionPerSecond` | `kafka.controller:type=ControllerStats,name=LeaderElectionRateAndTimeMs,attr=Count` | RATE | Leader elections per second |
| `replication.uncleanLeaderElectionPerSecond` | `kafka.controller:type=ControllerStats,name=UncleanLeaderElectionsPerSec,attr=Count` | RATE | Unclean leader elections per second |

#### Broker Topic Metrics
| Metric Name | Source | Type | Description |
|------------|--------|------|-------------|
| `broker.IOInPerSecond` | `kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec,attr=Count` | RATE | Bytes in per second |
| `broker.IOOutPerSecond` | `kafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec,attr=Count` | RATE | Bytes out per second |
| `broker.messagesInPerSecond` | `kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec,attr=Count` | RATE | Messages in per second |
| `net.bytesRejectedPerSecond` | `kafka.server:type=BrokerTopicMetrics,name=BytesRejectedPerSec,attr=Count` | RATE | Bytes rejected per second |
| `request.clientFetchesFailedPerSecond` | `kafka.server:type=BrokerTopicMetrics,name=FailedFetchRequestsPerSec,attr=Count` | RATE | Failed fetch requests per second |
| `request.produceRequestsFailedPerSecond` | `kafka.server:type=BrokerTopicMetrics,name=FailedProduceRequestsPerSec,attr=Count` | RATE | Failed produce requests per second |

#### Other Broker Metrics
| Metric Name | Source | Type | Description |
|------------|--------|------|-------------|
| `broker.logFlushPerSecond` | `kafka.log:type=LogFlushStats,name=LogFlushRateAndTimeMs,attr=Count` | RATE | Log flushes per second |
| `request.handlerIdle` | `kafka.server:type=KafkaRequestHandlerPool,name=RequestHandlerAvgIdlePercent,attr=OneMinuteRate` | GAUGE | Request handler idle percentage |
| `consumer.requestsExpiredPerSecond` | `kafka.server:type=DelayedFetchMetrics,name=ExpiresPerSec,fetcherType=consumer,attr=Count` | RATE | Consumer requests expired per second |
| `follower.requestExpirationPerSecond` | `kafka.server:type=DelayedFetchMetrics,name=ExpiresPerSec,fetcherType=follower,attr=Count` | RATE | Follower requests expired per second |

#### Broker-Topic Specific Metrics
| Metric Name | Source | Type | Description |
|------------|--------|------|-------------|
| `broker.bytesWrittenToTopicPerSecond` | `kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec,topic={topicName},attr=Count` | RATE | Bytes written to specific topic |
| `topic.diskSize` | `kafka.log:type=Log,name=Size,topic={topicName},partition=*` | GAUGE | Topic disk size (aggregated) |
| `topic.offset` | `kafka.log:type=Log,name=LogEndOffset,topic={topicName},partition=*` | GAUGE | Topic offset (aggregated) |

### Producer Metrics (JMX Source)

| Metric Name | Source | Type | Description |
|------------|--------|------|-------------|
| `producer.ageMetadataUsedInMilliseconds` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=metadata-age` | GAUGE | Age of metadata |
| `producer.availableBufferInBytes` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=buffer-available-bytes` | GAUGE | Available buffer bytes |
| `producer.avgBytesSentPerRequestInBytes` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=incoming-byte-rate` | GAUGE | Average bytes per request |
| `producer.avgRecordSizeInBytes` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=record-size-avg` | GAUGE | Average record size |
| `producer.avgRecordsSentPerSecond` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=record-send-rate` | GAUGE | Average records sent per second |
| `producer.avgRequestLatencyPerSecond` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=request-latency-avg` | GAUGE | Average request latency |
| `producer.avgThrottleTime` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=produce-throttle-time-avg` | GAUGE | Average throttle time |
| `producer.bufferpoolWaitTime` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=bufferpool-wait-time-total` | GAUGE | Buffer pool wait time |
| `producer.bytesOutPerSecond` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=outgoing-byte-rate` | GAUGE | Bytes out per second |
| `producer.compressionRateRecordBatches` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=compression-rate-avg` | GAUGE | Compression rate |
| `producer.ioWaitTime` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=io-wait-time-ns-avg` | GAUGE | IO wait time |
| `producer.maxRecordSizeInBytes` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=record-size-max` | GAUGE | Maximum record size |
| `producer.maxRequestLatencyInMilliseconds` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=request-latency-max` | GAUGE | Maximum request latency |
| `producer.maxThrottleTime` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=produce-throttle-time-max` | GAUGE | Maximum throttle time |
| `producer.requestPerSecond` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=request-rate` | GAUGE | Requests per second |
| `producer.requestsWaitingResponse` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=requests-in-flight` | GAUGE | Requests in flight |
| `producer.responsePerSecond` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=response-rate` | GAUGE | Responses per second |
| `producer.threadsWaiting` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=waiting-threads` | GAUGE | Waiting threads |
| `producer.bufferMemoryAvailableInBytes` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=buffer-total-bytes` | GAUGE | Total buffer memory |
| `producer.maxBytesSentPerRequestInBytes` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=request-size-max` | GAUGE | Maximum request size |
| `producer.avgRecordAccumulatorsInMilliseconds` | `kafka.producer:type=producer-metrics,client-id={producerName},attr=record-queue-time-avg` | GAUGE | Average record queue time |
| `producer.messageRatePerSecond` | `kafka.producer:type=ProducerTopicMetrics,name=MessagesPerSec,clientId={producerName},attr=Count` | RATE | Message rate |

#### Producer-Topic Specific Metrics
| Metric Name | Source | Type | Description |
|------------|--------|------|-------------|
| `producer.avgRecordsSentPerTopicPerSecond` | `kafka.producer:type=producer-topic-metrics,client-id={producerName},topic={topicName},attr=record-send-rate` | GAUGE | Records sent per topic |
| `producer.avgCompressionRateRecordBatches` | `kafka.producer:type=producer-topic-metrics,client-id={producerName},topic={topicName},attr=compression-rate` | GAUGE | Compression rate per topic |

### Consumer Metrics (JMX Source)

| Metric Name | Source | Type | Description |
|------------|--------|------|-------------|
| `consumer.bytesInPerSecond` | `kafka.consumer:type=consumer-fetch-manager-metrics,client-id={consumerName},attr=bytes-consumed-rate` | GAUGE | Bytes consumed per second |
| `consumer.fetchPerSecond` | `kafka.consumer:type=consumer-fetch-manager-metrics,client-id={consumerName},attr=fetch-rate` | GAUGE | Fetches per second |
| `consumer.maxLag` | `kafka.consumer:type=consumer-fetch-manager-metrics,client-id={consumerName},attr=records-lag-max` | GAUGE | Maximum lag |
| `consumer.messageConsumptionPerSecond` | `kafka.consumer:type=consumer-fetch-manager-metrics,client-id={consumerName},attr=records-consumed-rate` | GAUGE | Messages consumed per second |
| `consumer.offsetKafkaCommitsPerSecond` | `kafka.consumer:type=ZookeeperConsumerConnector,name=KafkaCommitsPerSec,clientId={consumerName},attr=Count` | RATE | Kafka offset commits per second |
| `consumer.offsetZooKeeperCommitsPerSecond` | `kafka.consumer:type=ZookeeperConsumerConnector,name=ZooKeeperCommitsPerSec,clientId={consumerName},attr=Count` | RATE | ZooKeeper offset commits per second |

#### Consumer-Topic Specific Metrics
| Metric Name | Source | Type | Description |
|------------|--------|------|-------------|
| `consumer.avgFetchSizeInBytes` | `kafka.consumer:type=consumer-fetch-manager-metrics,client-id={consumerName},topic={topicName},attr=fetch-size-avg` | GAUGE | Average fetch size |
| `consumer.maxFetchSizeInBytes` | `kafka.consumer:type=consumer-fetch-manager-metrics,client-id={consumerName},topic={topicName},attr=fetch-size-max` | GAUGE | Maximum fetch size |
| `consumer.avgRecordConsumedPerTopicPerSecond` | `kafka.consumer:type=consumer-fetch-manager-metrics,client-id={consumerName},topic={topicName},attr=records-consumed-rate` | GAUGE | Records consumed per topic |
| `consumer.avgRecordConsumedPerTopic` | `kafka.consumer:type=consumer-fetch-manager-metrics,client-id={consumerName},topic={topicName},attr=records-per-request-avg` | GAUGE | Average records per request |

### Topic Metrics (Kafka API Source)

| Metric Name | Source | Type | Description |
|------------|--------|------|-------------|
| `topic.partitionsWithNonPreferredLeader` | Partition metadata | GAUGE | Partitions with non-preferred leader |
| `topic.underReplicatedPartitions` | Partition metadata | GAUGE | Under-replicated partitions |
| `topic.respondsToMetadataRequests` | Metadata request test | GAUGE | Topic metadata responsiveness |

### Consumer Group Offset Metrics (Kafka API Source)

#### Partition-Level Metrics
| Metric Name | Type | Description |
|------------|------|-------------|
| `consumer.offset` | GAUGE | Current offset of consumer for partition |
| `consumer.lag` | GAUGE | Lag between consumer offset and high water mark |
| `consumer.hwm` | GAUGE | High water mark (latest offset) for partition |

#### Consumer-Level Metrics
| Metric Name | Type | Description |
|------------|------|-------------|
| `consumer.totalLag` | GAUGE | Total lag across all partitions for a consumer |

#### Consumer Group-Level Metrics
| Metric Name | Type | Description |
|------------|------|-------------|
| `consumerGroup.totalLag` | GAUGE | Total lag across all partitions in consumer group |
| `consumerGroup.maxLag` | GAUGE | Maximum lag across all partitions in consumer group |
| `consumerGroup.activeConsumers` | GAUGE | Number of active consumers in group |

#### Consumer Group-Topic Level Metrics
| Metric Name | Type | Description |
|------------|------|-------------|
| `consumerGroup.totalLag` | GAUGE | Total lag for specific topic in consumer group |
| `consumerGroup.maxLag` | GAUGE | Maximum lag for specific topic in consumer group |
| `consumerGroup.activeConsumers` | GAUGE | Number of active consumers for specific topic |

## Proposed New Metrics

### Share Group Metrics (Kafka API Source - NEW)

#### Partition-Level Share Group Metrics
| Metric Name | Type | Description | Queue Alias |
|------------|------|-------------|-------------|
| `share.offset` | GAUGE | Current offset for share group partition | `queue.position` |
| `share.lag` | GAUGE | Lag for share group partition | `queue.depth` |
| `share.hwm` | GAUGE | High water mark for partition | `queue.size` |

#### Share Member-Level Metrics
| Metric Name | Type | Description | Queue Alias |
|------------|------|-------------|-------------|
| `shareMember.totalLag` | GAUGE | Total lag for share group member | `queue.totalDepth` |

#### Share Group-Level Metrics
| Metric Name | Type | Description | Queue Alias |
|------------|------|-------------|-------------|
| `shareGroup.totalLag` | GAUGE | Total lag across all partitions in share group | `queue.totalDepth` |
| `shareGroup.maxLag` | GAUGE | Maximum lag across all partitions in share group | `queue.maxDepth` |
| `shareGroup.activeMembers` | GAUGE | Number of active members in share group | `queue.consumers` |

#### Share Group-Topic Level Metrics
| Metric Name | Type | Description | Queue Alias |
|------------|------|-------------|-------------|
| `shareGroup.totalLag` | GAUGE | Total lag for specific topic in share group | `queue.totalDepth` |
| `shareGroup.maxLag` | GAUGE | Maximum lag for specific topic in share group | `queue.maxDepth` |
| `shareGroup.activeMembers` | GAUGE | Number of active members for specific topic | - |

### Enhanced Broker Topic Metrics (JMX Source - NEW)

| Metric Name | Source | Type | Description | Queue Alias |
|------------|--------|------|-------------|-------------|
| `broker.topic.bytesInPerSec` | `kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec,topic={topic}` | RATE | Bytes in per second for topic | `queue.incomingBytes` |
| `broker.topic.bytesOutPerSec` | `kafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec,topic={topic}` | RATE | Bytes out per second for topic | `queue.outgoingBytes` |
| `broker.topic.messagesInPerSec` | `kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec,topic={topic}` | RATE | Messages in per second for topic | `queue.incomingRate` |
| `broker.topic.produceRequestsPerSec` | `kafka.server:type=BrokerTopicMetrics,name=TotalProduceRequestsPerSec,topic={topic}` | RATE | Produce requests per second for topic | `queue.producerRate` |
| `broker.topic.fetchRequestsPerSec` | `kafka.server:type=BrokerTopicMetrics,name=TotalFetchRequestsPerSec,topic={topic}` | RATE | Fetch requests per second for topic | `queue.consumerRate` |
| `broker.topic.failedProduceRequestsPerSec` | `kafka.server:type=BrokerTopicMetrics,name=FailedProduceRequestsPerSec,topic={topic}` | RATE | Failed produce requests per second for topic | - |
| `broker.topic.failedFetchRequestsPerSec` | `kafka.server:type=BrokerTopicMetrics,name=FailedFetchRequestsPerSec,topic={topic}` | RATE | Failed fetch requests per second for topic | - |

### Collection Statistics Events (NEW)

| Event Type | Attributes | Description |
|------------|------------|-------------|
| `ShareGroupCollectionStats` | shareGroupsFound, shareGroupsCollected, metricsGenerated, errorCount, skippedDueToLimit, collectionDurationMs | Statistics about share group collection performance |

## Metric Mapping Summary

### Queue Alias Mappings

The specification proposes adding queue-oriented aliases to make Kafka metrics more intuitive for queue-based monitoring:

| Kafka Metric | Queue Alias | Purpose |
|--------------|-------------|---------|
| `share.lag` | `queue.depth` | Queue depth (messages waiting) |
| `shareGroup.totalLag` | `queue.totalDepth` | Total queue depth |
| `shareGroup.maxLag` | `queue.maxDepth` | Maximum queue depth |
| `share.offset` | `queue.position` | Current position in queue |
| `share.hwm` | `queue.size` | Total queue size |
| `shareGroup.activeMembers` | `queue.consumers` | Number of consumers |
| `broker.topic.messagesInPerSec` | `queue.incomingRate` | Incoming message rate |
| `broker.topic.bytesInPerSec` | `queue.incomingBytes` | Incoming byte rate |
| `broker.topic.bytesOutPerSec` | `queue.outgoingBytes` | Outgoing byte rate |
| `broker.topic.produceRequestsPerSec` | `queue.producerRate` | Producer request rate |
| `broker.topic.fetchRequestsPerSec` | `queue.consumerRate` | Consumer request rate |
| `partition.offsetLag` | `queue.partition.depth` | Partition queue depth |
| `partition.preferredLeader` | `queue.partition.healthy` | Partition health status |

### New Configuration Parameters

The specification introduces several new configuration parameters:

#### Share Group Configuration
- `SHARE_GROUP_SUPPORT` (bool): Enable share group metrics collection
- `SHARE_GROUP_MODE` (string): Collection mode (All, None, List, Regex)
- `SHARE_GROUP_LIST` (JSON array): Specific share groups to collect
- `SHARE_GROUP_REGEX` (string): Regex pattern for share groups
- `EMIT_QUEUE_ALIASES` (bool): Add queue.* alias fields
- `QUEUE_METRIC_PREFIX` (string): Prefix for queue aliases

#### Cardinality Control
- `MAX_SHARE_GROUPS` (int): Maximum share groups to collect
- `MAX_SHARE_GROUP_METRICS` (int): Maximum metrics per interval
- `SHARE_GROUP_PRIORITY` (string): Priority for selection (lag, members, alphabetical)

#### Enhanced Topic Metrics
- `ENABLE_BROKER_TOPIC_METRICS` (bool): Enable per-topic broker metrics
- `TOPIC_METRIC_FILTER` (string): Regex to filter topics
- `MAX_TOPIC_METRICS` (int): Maximum topic metrics per broker

## Summary

The Extended Technical Specification proposes significant enhancements to nri-kafka:

1. **Share Group Support**: Adds comprehensive monitoring for Kafka Share Groups (KIP-932) using Kafka protocol APIs
2. **Queue Semantics**: Introduces queue-oriented aliases for better integration with queue monitoring UIs
3. **Enhanced Topic Metrics**: Adds detailed per-topic broker metrics with cardinality controls
4. **Cardinality Management**: Implements sophisticated limits and prioritization to prevent metric explosion
5. **Collection Statistics**: Adds performance monitoring for the collection process itself

These enhancements would provide:
- Better support for Kafka as a queue system
- Native monitoring for the new Share Groups feature
- More granular topic-level insights
- Improved operational visibility with collection statistics
- Better integration with queue-oriented monitoring dashboards