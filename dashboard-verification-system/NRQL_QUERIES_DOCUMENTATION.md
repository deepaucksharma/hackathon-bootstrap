# Message Queues NRQL Queries Documentation

This document contains all NRQL queries extracted from the Message Queues codebase, organized by their usage and component.

## Table of Contents
1. [Entity Types and Domains](#entity-types-and-domains)
2. [Query Structure Overview](#query-structure-overview)
3. [AWS MSK Queries](#aws-msk-queries)
4. [Confluent Cloud Queries](#confluent-cloud-queries)
5. [GraphQL Queries](#graphql-queries)
6. [Component-Specific Queries](#component-specific-queries)

## Entity Types and Domains

### AWS MSK Entity Types
- **Domain**: `INFRA`
- **Types**: 
  - `AWSMSKCLUSTER` - AWS MSK Cluster entities
  - `AWSMSKBROKER` - AWS MSK Broker entities
  - `AWSMSKTOPIC` - AWS MSK Topic entities

### Confluent Cloud Entity Types
- **Domain**: `INFRA`
- **Types**:
  - `CONFLUENTCLOUDCLUSTER` - Confluent Cloud Cluster entities
  - `CONFLUENTCLOUDKAFKATOPIC` - Confluent Cloud Kafka Topic entities

### Event Types
- `Metric` - For metric stream data
- `AwsMskBrokerSample` - AWS MSK broker polling data
- `AwsMskClusterSample` - AWS MSK cluster polling data
- `AwsMskTopicSample` - AWS MSK topic polling data

## Query Structure Overview

### Key Fields and Attributes

#### AWS MSK Fields
**Polling Integration:**
- `provider.clusterName` - Cluster name
- `provider.brokerId` - Broker ID
- `provider.topic` - Topic name
- `provider.bytesInPerSec.Average` - Incoming throughput
- `provider.bytesOutPerSec.Average` - Outgoing throughput
- `provider.messagesInPerSec.Average` - Message rate
- `provider.activeControllerCount.Sum` - Active controller count
- `provider.offlinePartitionsCount.Sum` - Offline partitions
- `provider.underReplicatedPartitions.Sum` - Under-replicated partitions
- `provider.underMinIsrPartitionCount.Sum` - Under min ISR partitions
- `provider.globalPartitionCount.Average` - Global partition count

**Metric Streams:**
- `aws.kafka.ClusterName` or `aws.msk.clusterName` - Cluster name
- `aws.kafka.BrokerID` or `aws.msk.brokerId` - Broker ID
- `aws.kafka.Topic` or `aws.msk.topic` - Topic name
- `aws.kafka.BytesInPerSec.byTopic` - Incoming throughput by topic
- `aws.kafka.BytesOutPerSec.byTopic` - Outgoing throughput by topic
- `aws.kafka.MessagesInPerSec.byTopic` - Message rate by topic
- `aws.kafka.BytesInPerSec.byBroker` - Incoming throughput by broker
- `aws.kafka.BytesOutPerSec.byBroker` - Outgoing throughput by broker
- `aws.kafka.ActiveControllerCount` - Active controllers
- `aws.kafka.OfflinePartitionsCount` - Offline partitions
- `aws.kafka.UnderReplicatedPartitions` - Under-replicated partitions
- `aws.kafka.UnderMinIsrPartitionCount.byBroker` - Under min ISR partitions
- `aws.kafka.GlobalPartitionCount` - Global partition count

#### Confluent Cloud Fields
- `kafka.cluster_name` or `kafka.clusterName` or `confluent.clusterName` - Cluster name
- `topic` or `confluent.kafka.server.metric.topic` - Topic name
- `confluent_kafka_server_received_bytes` or `confluent.kafka.server.received_bytes` - Incoming bytes
- `confluent_kafka_server_sent_bytes` or `confluent.kafka.server.sent_bytes` - Outgoing bytes
- `confluent_kafka_server_received_records` or `confluent.kafka.server.received_records` - Incoming records
- `confluent_kafka_server_sent_records` or `confluent.kafka.server.sent_records` - Outgoing records
- `confluent_kafka_server_cluster_load_percent` or `confluent.kafka.server.cluster_load_percent` - Cluster load percentage
- `confluent_kafka_server_hot_partition_ingress` or `confluent.kafka.server.hot_partition_ingress` - Hot partition ingress
- `confluent_kafka_server_hot_partition_egress` or `confluent.kafka.server.hot_partition_egress` - Hot partition egress
- `confluent_kafka_server_partition_count` or `confluent.kafka.server.partition_count` - Partition count

## AWS MSK Queries

### 1. Total Clusters Query

**Polling Integration:**
```nrql
SELECT uniqueCount(provider.clusterName) as 'Total clusters'
FROM AwsMskClusterSample
```

**Metric Streams:**
```nrql
SELECT filter(uniqueCount(`aws.kafka.ClusterName` OR `aws.msk.clusterName`), 
       where entity.type like '%CLUSTER%') as 'Total clusters'
FROM Metric
WHERE metricName like 'aws.kafka%byTopic'
```

### 2. Cluster Health Queries

**Polling Integration:**
```nrql
SELECT latest(`provider.activeControllerCount.Sum`) AS 'Active Controllers', 
       latest(`provider.offlinePartitionsCount.Sum`) AS 'Offline Partitions'
FROM AwsMskClusterSample
FACET provider.clusterName as cluster
LIMIT MAX
```

**Metric Streams:**
```nrql
SELECT latest(`Active Controllers`) as 'Active Controllers',
       latest(`Offline Partitions`) as 'Offline Partitions'
FROM (
  SELECT filter(sum(aws.kafka.ActiveControllerCount)/datapointCount(),
                where metricName='aws.kafka.ActiveControllerCount') as 'Active Controllers',
         filter(sum(aws.kafka.OfflinePartitionsCount),
                where metricName='aws.kafka.OfflinePartitionsCount') as 'Offline Partitions'
  FROM Metric
  FACET aws.kafka.ClusterName OR aws.msk.clusterName AS 'cluster'
  LIMIT MAX
)
FACET cluster
LIMIT MAX
```

### 3. Cluster Throughput Queries

**Incoming Throughput (Polling):**
```nrql
SELECT sum(bytesInPerSec)
FROM (
  SELECT average(provider.bytesInPerSec.Average) as 'bytesInPerSec'
  FROM AwsMskBrokerSample
  FACET provider.clusterName as cluster, provider.brokerId
  LIMIT MAX
)
```

**Incoming Throughput (Metric Streams):**
```nrql
SELECT sum(BytesInPerSec)
FROM (
  SELECT filter(average(aws.kafka.BytesInPerSec.byBroker),
                where metricName='aws.kafka.BytesInPerSec.byBroker') as 'BytesInPerSec'
  FROM Metric
  FACET aws.kafka.ClusterName OR aws.msk.clusterName as 'cluster',
        aws.kafka.BrokerID OR aws.msk.brokerId
  LIMIT MAX
)
```

### 4. Broker Queries

**Broker Count:**
```nrql
SELECT uniqueCount(tuple(provider.clusterName,provider.brokerId)) as 'Brokers'
FROM AwsMskBrokerSample
```

**Broker Health (Polling):**
```nrql
SELECT latest(`provider.underMinIsrPartitionCount.Sum`) AS 'Under Min ISR Partitions',
       latest(`provider.underReplicatedPartitions.Sum`) AS 'Under Replicated Partitions'
FROM AwsMskBrokerSample
FACET `displayName` AS 'broker'
LIMIT MAX
```

### 5. Topic Queries

**Topic Count:**
```nrql
SELECT uniqueCount(displayName) as 'Topics'
FROM AwsMskTopicSample
```

**Topic Metrics (Polling):**
```nrql
SELECT average(provider.bytesInPerSec.Average) or 0 AS 'bytesInPerSec',
       average(provider.bytesOutPerSec.Average) or 0 AS 'bytesOutPerSec',
       average(provider.messagesInPerSec.Average) or 0 AS 'messagesInPerSec'
FROM AwsMskTopicSample
FACET entityGuid as 'guid',
      entityName as 'Name',
      `provider.topic` AS 'Topic'
WHERE `provider.topic` IS NOT NULL
ORDER BY average(provider.bytesInPerSec.Average or 0) DESC
LIMIT 20
```

**Topic Metrics (Metric Streams):**
```nrql
SELECT average(aws.kafka.BytesInPerSec.byTopic) or 0 AS 'bytesInPerSec',
       average(aws.kafka.BytesOutPerSec.byTopic) or 0 AS 'bytesOutPerSec',
       average(aws.kafka.MessagesInPerSec.byTopic) or 0 AS 'messagesInPerSec'
FROM Metric
FACET entity.guid as 'guid',
      entity.name OR entityName as 'Name',
      `aws.kafka.Topic` OR `aws.msk.topic` AS 'Topic'
WHERE metricName like '%aws.kafka%' 
  AND ((`aws.kafka.Topic` OR `aws.msk.topic`) IS NOT NULL)
ORDER BY average(aws.kafka.BytesInPerSec.byTopic or 0) DESC
LIMIT 20
```

### 6. Partition Queries

**Partition Count by Cluster:**
```nrql
SELECT sum(`partitions`)
FROM (
  SELECT round(average(provider.globalPartitionCount.Average)) as 'partitions'
  FROM AwsMskClusterSample
  FACET provider.clusterName
  LIMIT MAX
)
```

## Confluent Cloud Queries

### 1. Total Clusters
```nrql
SELECT uniqueCount(kafka.cluster_name or kafka.clusterName or confluent.clusterName) as 'Total clusters'
FROM Metric
WHERE metricName like '%confluent%'
```

### 2. Cluster Health
```nrql
SELECT (average(confluent_kafka_server_cluster_load_percent or confluent.kafka.server.cluster_load_percent)*100 or -1) as 'Cluster load percent',
       filter(average(confluent_kafka_server_hot_partition_ingress or confluent.kafka.server.hot_partition_ingress), 
              WHERE (confluent_kafka_server_hot_partition_ingress or confluent.kafka.server.hot_partition_ingress)=1 
              AND metricName=('confluent_kafka_server_hot_partition_ingress' or 'confluent.kafka.server.hot_partition_ingress')) as 'Hot partition Ingress',
       filter(average(confluent_kafka_server_hot_partition_egress or confluent.kafka.server.hot_partition_egress), 
              WHERE (confluent_kafka_server_hot_partition_egress or confluent.kafka.server.hot_partition_egress)=1 
              AND metricName=('confluent_kafka_server_hot_partition_egress' or 'confluent.kafka.server.hot_partition_egress')) as 'Hot partition Egress'
FROM Metric
WHERE metricName like '%confluent%'
FACET kafka.cluster_name or kafka.clusterName or confluent.clusterName
LIMIT MAX
```

### 3. Cluster Throughput

**Incoming Throughput:**
```nrql
SELECT sum(bytesInPerSec)
FROM (
  SELECT average(confluent_kafka_server_received_bytes or confluent.kafka.server.received_bytes) as 'bytesInPerSec'
  FROM Metric
  WHERE metricName like '%confluent%'
  FACET kafka.cluster_name or kafka.clusterName or confluent.clusterName as cluster
  LIMIT MAX
)
```

### 4. Topic Queries

**Topic Count:**
```nrql
SELECT uniqueCount(displayName) as 'Topics'
FROM Metric
WHERE metricName like '%confluent%' 
  AND entity.type like '%CONFLUENTCLOUDKAFKATOPIC%'
```

**Topic Metrics:**
```nrql
SELECT average(confluent_kafka_server_received_bytes or confluent.kafka.server.received_bytes) or 0 AS 'bytesInPerSec',
       average(confluent_kafka_server_sent_bytes or confluent.kafka.server.sent_bytes) or 0 AS 'bytesOutPerSec',
       average(confluent_kafka_server_received_records or confluent.kafka.server.received_records) or 0 AS 'messagesInPerSec'
FROM Metric
FACET entity.guid as 'guid',
      entity.name OR entityName as 'name',
      `topic` OR `confluent.kafka.server.metric.topic` AS 'Topic'
WHERE metricName like '%confluent%' 
  AND ((`topic` OR `confluent.kafka.server.metric.topic`) IS NOT NULL)
ORDER BY average(confluent_kafka_server_received_bytes or confluent.kafka.server.received_bytes or 0) DESC
LIMIT 20
```

## GraphQL Queries

### 1. All Kafka Table Query
```graphql
query ALL_KAFKA_TABLE_QUERY($awsQuery: String!, $confluentCloudQuery: String!, $facet: EntitySearchCountsFacet!, $orderBy: EntitySearchOrderBy!) {
  actor {
    awsEntitySearch: entitySearch(query: $awsQuery) {
      count
      facetedCounts(facets: {facetCriterion: {facet: $facet}, orderBy: $orderBy}) {
        counts {
          count
          facet
        }
      }
      results {
        accounts {
          id
          name
          reportingEventTypes(filter: "AwsMskBrokerSample")
        }
      }
    }
    confluentCloudEntitySearch: entitySearch(query: $confluentCloudQuery) {
      count
      facetedCounts(facets: {facetCriterion: {facet: $facet}, orderBy: $orderBy}) {
        counts {
          count
          facet
        }
      }
      results {
        accounts {
          id
          name
        }
      }
    }
  }
}
```

### 2. Get Clusters from Topic Filter Query
```graphql
query GET_CLUSTERS_FROM_TOPIC_FILTER_QUERY($awsTopicQuery: String!, $confluentTopicQuery: String!) {
  actor {
    awsTopicEntitySearch: entitySearch(query: $awsTopicQuery) {
      __typename
      polling: groupedResults(by: {tag: "aws.clusterName"}) {
        group
      }
      metrics: groupedResults(by: {tag: "aws.kafka.ClusterName"}) {
        group
      }
    }
    confluentTopicEntitySearch: entitySearch(query: $confluentTopicQuery) {
      __typename
      groupedResults(by: {tag: "confluent.clusterName"}) {
        group
      }
    }
  }
}
```

### 3. Get Related APM Entities for Topic
```graphql
query GetRelatedAPMEntitiesForTopic($entityGuids: [EntityGuid!]) {
  actor {
    entities(guids: $entityGuids) {
      alertSeverity
      permalink
      guid
      name
      reporting
      consumsedBy: relatedEntities(
        filter: {direction: BOTH, relationshipTypes: {include: CONSUMES}, entityDomainTypes: {include: {domain: "APM", type: "APPLICATION"}}}
      ) {
        count
        results {
          source {
            guid
          }
        }
      }
      producedBy: relatedEntities(
        filter: {direction: BOTH, relationshipTypes: {include: PRODUCES}, entityDomainTypes: {include: {domain: "APM", type: "APPLICATION"}}}
      ) {
        count
        results {
          source {
            guid
          }
        }
      }
    }
    __typename
  }
}
```

### 4. Entity Group Query
```graphql
query EntityGroupQuery($filters: String, $sortBy: [EntitySearchSortCriteria], $caseSensitiveTagMatching: Boolean!, $cursor: String) {
  actor {
    entitySearch(query: $filters, sortBy: $sortBy, options: { caseSensitiveTagMatching: $caseSensitiveTagMatching }) {
      results(cursor: $cursor) {
        entities {
          name
          guid
          domain
          type
          alertSeverity
        }
        nextCursor
      }
    }
  }
}
```

## Component-Specific Queries

### Summary Chart Queries

The summary chart component uses multiple queries to fetch:
1. Total clusters count
2. Unhealthy clusters count
3. Total topics
4. Partition count
5. Broker count (AWS MSK only)

Each query is constructed using `getQueryByProviderAndPreference()` which:
- Determines whether to use polling or metric streams
- Applies appropriate filters
- Returns the formatted NRQL query

### Entity Navigator Queries

The Entity Navigator uses entity search queries with filters:
- AWS Clusters: `domain IN ('INFRA') AND type='AWSMSKCLUSTER'`
- AWS Topics: `domain IN ('INFRA') AND type='AWSMSKTOPIC'`
- AWS Brokers: `domain IN ('INFRA') AND type='AWSMSKBROKER'`
- Confluent Clusters: `domain IN ('INFRA') AND type='CONFLUENTCLOUDCLUSTER'`
- Confluent Topics: `domain IN ('INFRA') AND type='CONFLUENTCLOUDKAFKATOPIC'`

### Topics Table Queries

The topics table queries top 20 topics ordered by one of:
- Incoming throughput (bytesInPerSec)
- Outgoing throughput (bytesOutPerSec)
- Message rate (messagesInPerSec)

### Filter Conditions

Common filter patterns:
- Metric name filters: `metricName like '%aws.kafka%'` or `metricName like '%confluent%'`
- Provider filters: `provider IN ('AwsMskCluster', 'AwsMskBroker', 'AwsMskTopic')`
- Entity type filters: `entity.type like '%CLUSTER%'`
- Tag-based filters: Applied dynamically based on user selections

### Time Series Queries

Time series queries are used for charts showing:
- Throughput by cluster over time
- Total produced throughput
- Message production rate
- Topic-level metrics over time

These queries include:
- `TIMESERIES` clause
- Aggregation functions (sum, average)
- Faceting by relevant dimensions
- Ordering and limiting results

## Query Optimization Patterns

1. **Nested Queries**: Used to aggregate data across multiple dimensions
2. **Filter Functions**: Used to selectively aggregate specific metrics
3. **Conditional Attributes**: Handle different attribute names between polling and metric streams
4. **MAX Limit**: Used for sub-queries to ensure all data is captured
5. **Facet Limits**: Final results typically limited to 20 for performance

## Health Status Determination

Entity health is determined by:

**AWS MSK Clusters:**
- Unhealthy if: Active Controllers ≠ 1, Offline Partitions > 0, Under Min ISR Partitions > 0, Under Replicated Partitions > 0

**Confluent Cloud Clusters:**
- Unhealthy if: Cluster load percent > 70% or = 0, Hot partition ingress = 1, Hot partition egress = 1
- Not Configured if: Cluster load percent = -1 (default value)

**Topics (All Providers):**
- Unhealthy if: Bytes In = 0 AND Bytes Out = 0

## Notes

1. All queries support dynamic filtering based on user selections
2. Queries handle both polling and metric stream data sources
3. GraphQL queries are used for entity searches and relationships
4. NRQL queries are used for metric data retrieval
5. The system supports multiple Kafka providers (AWS MSK, Confluent Cloud)
6. Query construction is highly dynamic based on provider, data source, and filters