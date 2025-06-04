# Kafka Metrics Discovery Summary

## Overview
This document provides a comprehensive summary of all discovered Kafka metrics and attributes from the New Relic monitoring setup.

## Discovered Event Types

### 1. KafkaBrokerSample
**Total Attributes:** 65 (29 metrics, 36 string attributes)

#### Available Metrics:
- `broker.IOInPerSecond` - I/O bytes in per second
- `broker.IOOutPerSecond` - I/O bytes out per second  
- `broker.logFlushPerSecond` - Log flush rate
- `broker.messagesInPerSecond` - Messages in per second
- `consumer.requestsExpiredPerSecond` - Expired consumer requests
- `follower.requestExpirationPerSecond` - Follower request expiration rate
- `net.bytesRejectedPerSecond` - Network bytes rejected
- `replication.isrExpandsPerSecond` - ISR expansion rate
- `replication.isrShrinksPerSecond` - ISR shrink rate
- `replication.leaderElectionPerSecond` - Leader election rate
- `replication.uncleanLeaderElectionPerSecond` - Unclean leader elections
- `replication.unreplicatedPartitions` - Count of unreplicated partitions
- `request.avgTimeFetch` - Average fetch request time
- `request.avgTimeMetadata` - Average metadata request time
- `request.avgTimeMetadata99Percentile` - 99th percentile metadata time
- `request.avgTimeProduceRequest` - Average produce request time
- `request.avgTimeUpdateMetadata` - Average update metadata time
- `request.avgTimeUpdateMetadata99Percentile` - 99th percentile update metadata time
- `request.clientFetchesFailedPerSecond` - Failed client fetch rate
- `request.fetchConsumerRequestsPerSecond` - Consumer fetch request rate
- `request.fetchTime99Percentile` - 99th percentile fetch time
- `request.handlerIdle` - Handler idle percentage
- `request.listGroupsRequestsPerSecond` - List groups request rate
- `request.metadataRequestsPerSecond` - Metadata request rate
- `request.offsetCommitRequestsPerSecond` - Offset commit request rate
- `request.produceRequestsFailedPerSecond` - Failed produce request rate
- `request.produceRequestsPerSecond` - Produce request rate
- `request.produceTime99Percentile` - 99th percentile produce time
- `timestamp`

### 2. KafkaTopicSample
**Total Attributes:** 37 (4 metrics, 33 string attributes)

#### Available Metrics:
- `timestamp`
- `topic.partitionsWithNonPreferredLeader` - Partitions with non-preferred leader
- `topic.respondsToMetadataRequests` - Topic responds to metadata requests
- `topic.underReplicatedPartitions` - Under-replicated partitions count

### 3. KafkaOffsetSample
**Total Attributes:** 36 (7 metrics, 29 string attributes)

#### Available Metrics:
- `consumer.hwm` - High water mark
- `consumer.lag` - Consumer lag
- `consumer.offset` - Current consumer offset
- `consumer.totalLag` - Total consumer lag
- `consumerGroup.maxLag` - Maximum lag in consumer group
- `consumerGroup.totalLag` - Total lag across consumer group
- `timestamp`

### 4. KafkaProducerSample
**Total Attributes:** 1 (1 metric, 0 string attributes)

#### Available Metrics:
- `timestamp`

### 5. KafkaConsumerSample
**Total Attributes:** 1 (1 metric, 0 string attributes)

#### Available Metrics:
- `timestamp`

## V2 Enhanced Metrics Status

The following V2 metrics were checked but are **NOT currently available**:
- ❌ `broker.bytesOutPerSec` - Bytes out per second by topic
- ❌ `broker.messagesInPerSec` - Messages in per second by topic  
- ❌ `broker.activeControllerCount` - Active controller count
- ❌ `broker.globalPartitionCount` - Global partition count
- ❌ `topic.bytesOutPerSec` - Topic-level bytes out
- ❌ `topic.messagesInPerSec` - Topic-level messages in

## Key Observations

1. **Broker Metrics**: KafkaBrokerSample has the most comprehensive set of metrics (29 total) covering:
   - I/O performance (`broker.IOInPerSecond`, `broker.IOOutPerSecond`)
   - Message throughput (`broker.messagesInPerSecond`)
   - Replication health (`replication.*` metrics)
   - Request performance (`request.*` metrics)

2. **Topic Metrics**: Limited to 4 metrics, primarily focused on partition health:
   - Partition leadership status
   - Replication status
   - Metadata responsiveness

3. **Consumer/Producer Samples**: Currently only provide timestamp data, no operational metrics

4. **Offset Tracking**: Good coverage for consumer lag monitoring with 6 relevant metrics

5. **Missing V2 Metrics**: None of the enhanced V2 metrics for topic-level throughput or controller metrics are available

## Recommendations for Dashboard

Based on available metrics, a comprehensive Kafka dashboard should include:

1. **Broker Performance**
   - I/O throughput charts (IOIn/IOOut per second)
   - Message rate (messagesInPerSecond)
   - Request latency percentiles

2. **Replication Health**
   - Unreplicated partitions count
   - ISR expansion/shrink rates
   - Leader election frequency

3. **Consumer Performance**
   - Consumer lag trends
   - Max lag by consumer group
   - Offset progression

4. **Topic Health**
   - Under-replicated partitions by topic
   - Partitions with non-preferred leaders

5. **Request Performance**
   - Average request times by type (fetch, produce, metadata)
   - Failed request rates
   - 99th percentile latencies

## Integration Details
- **nri-kafka version**: 2.19.0
- **Total discovered metrics**: 42 numeric metrics across all event types
- **Total attributes**: 140 (including string attributes)