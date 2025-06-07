# Query Utils Functions - Detailed Documentation

## Table of Contents
1. [Query Filter Functions](#query-filter-functions)
2. [GraphQL Query Definitions](#graphql-query-definitions)
3. [Core Query Building Functions](#core-query-building-functions)
4. [Query Configuration Objects](#query-configuration-objects)
5. [Filter and Condition Management](#filter-and-condition-management)
6. [Main Query Builder](#main-query-builder)
7. [Utility Functions](#utility-functions)
8. [Pagination Functions](#pagination-functions)

---

## Query Filter Functions

### AWS_CLUSTER_QUERY_FILTER_FUNC
**Location**: query-utils.ts:37-39
```typescript
export const AWS_CLUSTER_QUERY_FILTER_FUNC = (searchName: string) => {
  return `${AWS_CLUSTER_QUERY_FILTER} ${searchName ? `AND name IN (${searchName})` : ''}`;
};
```

**Purpose**: Creates dynamic filter queries for AWS MSK clusters with optional name filtering.

**Parameters**:
- `searchName` (string): Optional cluster name filter

**Returns**: String - NRQL filter condition

**Usage Example**:
```typescript
const filter = AWS_CLUSTER_QUERY_FILTER_FUNC("('cluster1', 'cluster2')");
// Result: "domain IN ('INFRA') AND type='AWSMSKCLUSTER' AND name IN (('cluster1', 'cluster2'))"
```

### CONFLUENT_CLOUD_QUERY_FILTER_CLUSTER_FUNC
**Location**: query-utils.ts:43-47
```typescript
export const CONFLUENT_CLOUD_QUERY_FILTER_CLUSTER_FUNC = (searchName: string) => {
  return `${CONFLUENT_CLOUD_QUERY_FILTER_CLUSTER} ${searchName ? `AND name IN (${searchName})` : ''}`;
};
```

**Purpose**: Creates dynamic filter queries for Confluent Cloud clusters.

**Parameters**:
- `searchName` (string): Optional cluster name filter

**Returns**: String - NRQL filter condition

### CONFLUENT_CLOUD_QUERY_FILTER_TOPIC_FUNC
**Location**: query-utils.ts:49-51
```typescript
export const CONFLUENT_CLOUD_QUERY_FILTER_TOPIC_FUNC = (searchName: string) => {
  return `${CONFLUENT_CLOUD_QUERY_FILTER_TOPIC} AND name IN (${searchName})`;
};
```

**Purpose**: Creates filter queries for Confluent Cloud topics (requires searchName).

**Parameters**:
- `searchName` (string): Required topic name filter

**Returns**: String - NRQL filter condition

### AWS_TOPIC_QUERY_FILTER_FUNC
**Location**: query-utils.ts:53-55
```typescript
export const AWS_TOPIC_QUERY_FILTER_FUNC = (searchName: string) => {
  return `${AWS_TOPIC_QUERY_FILTER} AND type='AWSMSKTOPIC' AND name IN (${searchName})`;
};
```

**Purpose**: Creates filter queries for AWS MSK topics (requires searchName).

**Parameters**:
- `searchName` (string): Required topic name filter

**Returns**: String - NRQL filter condition

---

## GraphQL Query Definitions

### ALL_KAFKA_TABLE_QUERY
**Location**: query-utils.ts:57-91

**Purpose**: Primary GraphQL query for fetching comprehensive Kafka infrastructure data from both AWS MSK and Confluent Cloud providers.

**Query Variables**:
- `$awsQuery`: String! - AWS entity search query
- `$confluentCloudQuery`: String! - Confluent Cloud entity search query  
- `$facet`: EntitySearchCountsFacet! - Faceting criteria
- `$orderBy`: EntitySearchOrderBy! - Ordering criteria

**Response Structure**:
```typescript
{
  actor: {
    awsEntitySearch: {
      count: number,
      facetedCounts: Array<{count: number, facet: string}>,
      results: {
        accounts: Array<{
          id: string,
          name: string,
          reportingEventTypes: string[]
        }>
      }
    },
    confluentCloudEntitySearch: {
      // Similar structure without reportingEventTypes
    }
  }
}
```

**Usage Scenarios**:
- Home page cluster and topic overview
- Provider-specific data aggregation
- Account-level entity counting

### GET_CLUSTERS_FROM_TOPIC_FILTER_QUERY
**Location**: query-utils.ts:93-111

**Purpose**: Retrieves cluster information derived from topic filters, supporting both polling and metric stream data sources.

**Query Variables**:
- `$awsTopicQuery`: String! - AWS topic filter query
- `$confluentTopicQuery`: String! - Confluent Cloud topic filter query

**Response Structure**:
```typescript
{
  actor: {
    awsTopicEntitySearch: {
      polling: {
        group: string[] // Cluster names from polling data
      },
      metrics: {
        group: string[] // Cluster names from metric streams
      }
    },
    confluentTopicEntitySearch: {
      groupedResults: {
        group: string[] // Confluent cluster names
      }
    }
  }
}
```

**Key Features**:
- **Dual data source support**: Handles both `aws.clusterName` (polling) and `aws.kafka.ClusterName` (metrics)
- **Cross-reference capability**: Allows finding clusters based on topic filters
- **Provider separation**: Separate handling for AWS and Confluent Cloud

### GET_RELATED_APM_ENTITIES_FOR_TOPIC
**Location**: query-utils.ts:113-144

**Purpose**: Fetches APM (Application Performance Monitoring) entities that have relationships with Kafka topics.

**Query Variables**:
- `$entityGuids`: [EntityGuid!] - Array of topic entity GUIDs

**Response Structure**:
```typescript
{
  actor: {
    entities: Array<{
      alertSeverity: string,
      permalink: string,
      guid: string,
      name: string,
      reporting: boolean,
      consumsedBy: {
        count: number,
        results: Array<{source: {guid: string}}>
      },
      producedBy: {
        count: number,
        results: Array<{source: {guid: string}}>
      }
    }>
  }
}
```

**Relationship Types**:
- **CONSUMES**: Applications that consume from the topic
- **PRODUCES**: Applications that produce to the topic
- **Direction BOTH**: Bidirectional relationship search

**Usage Scenarios**:
- Topic detail pages showing related applications
- Service dependency mapping
- APM integration for Kafka monitoring

---

## Core Query Building Functions

### getTopicsTableQuery
**Location**: query-utils.ts:146-250

**Purpose**: Generates comprehensive topic table queries supporting multiple providers and data collection methods.

**Function Signature**:
```typescript
export const getTopicsTableQuery: any = (
  queryKey: string,
  orderBy: string,
  where: any[],
  attributeSortMapping: { [key: string]: string },
) => QueryDefinition
```

**Parameters**:
- `queryKey`: 'aws_polling' | 'aws_metric_streams' | 'confluent_cloud_polling'
- `orderBy`: Field name to sort results by
- `where`: Array of additional WHERE clause conditions
- `attributeSortMapping`: Maps UI field names to database field names

**Query Key Configurations**:

#### 1. aws_polling
**Data Source**: AwsMskTopicSample (New Relic Infrastructure polling)
**Structure**: Nested query with inner aggregation and outer selection
```typescript
{
  select: [`guid`, `Name`, `Topic`, `bytesInPerSec`, `bytesOutPerSec`, `messagesInPerSec`],
  from: {
    select: [
      "average(provider.bytesInPerSec.Average) or 0 AS 'bytesInPerSec'",
      "average(provider.bytesOutPerSec.Average) or 0 AS 'bytesOutPerSec'",
      "average(provider.messagesInPerSec.Average) or 0 AS 'messagesInPerSec'",
    ],
    from: 'AwsMskTopicSample',
    facet: [
      "entityGuid as 'guid'",
      "entityName as 'Name'",
      "`provider.topic` AS 'Topic'",
    ],
    orderBy: `average(${attributeSortMapping[orderBy]} or 0)`,
    limit: MAX_LIMIT,
  },
  where: ['(`provider.topic` IS NOT NULL)', ...where],
  orderBy: `${orderBy} DESC`,
  limit: LIMIT_20,
  isNested: true,
}
```

**Key Features**:
- **Null safety**: Uses `or 0` to handle missing values
- **Entity focus**: Groups by entityGuid for topic-level aggregation
- **Provider-specific fields**: Uses `provider.*` attribute hierarchy

#### 2. aws_metric_streams
**Data Source**: Metric (New Relic Metric Streams)
**Structure**: Similar nested approach but with metric stream attributes
```typescript
{
  select: [`guid`, `Name`, `Topic`, `bytesInPerSec`, `bytesOutPerSec`, `messagesInPerSec`],
  from: {
    select: [
      "average(aws.kafka.BytesInPerSec.byTopic) or 0 AS 'bytesInPerSec'",
      "average(aws.kafka.BytesOutPerSec.byTopic) or 0 AS 'bytesOutPerSec'",
      "average(aws.kafka.MessagesInPerSec.byTopic) or 0 AS 'messagesInPerSec'",
    ],
    from: 'Metric',
    facet: [
      "entity.guid as 'guid'",
      "entity.name OR entityName as 'Name'",
      "`aws.kafka.Topic` OR `aws.msk.topic` AS 'Topic'",
    ],
    orderBy: `average(${attributeSortMapping[orderBy]} or 0)`,
    limit: MAX_LIMIT,
    metricType: 'Topic',
  },
  where: [
    "metricName like '%aws.kafka%' AND ((`aws.kafka.Topic` OR `aws.msk.topic`) IS NOT NULL)",
    ...where,
  ],
  orderBy: `${orderBy} DESC`,
  limit: LIMIT_20,
  isNested: true,
}
```

**Key Features**:
- **Metric name filtering**: Ensures only Kafka metrics are included
- **Dual attribute support**: Handles both `aws.kafka.*` and `aws.msk.*` namespaces
- **Entity reference**: Uses `entity.guid` instead of `entityGuid`

#### 3. confluent_cloud_polling
**Data Source**: Metric (Confluent Cloud metrics)
**Structure**: Confluent-specific metric attributes
```typescript
{
  select: [`guid`, `name`, `Topic`, `bytesInPerSec`, `bytesOutPerSec`, `messagesInPerSec`],
  from: {
    select: [
      "average(confluent_kafka_server_received_bytes or confluent.kafka.server.received_bytes) or 0 AS 'bytesInPerSec'",
      "average(confluent_kafka_server_sent_bytes or confluent.kafka.server.sent_bytes) or 0 AS 'bytesOutPerSec'",
      "average(confluent_kafka_server_received_records or confluent.kafka.server.received_records) or 0 AS 'messagesInPerSec'",
    ],
    from: 'Metric',
    facet: [
      `entity.guid as 'guid'`,
      `entity.name OR entityName as 'name'`,
      "`topic` OR `confluent.kafka.server.metric.topic` AS 'Topic'",
    ],
    orderBy: `average(${attributeSortMapping[orderBy]} or 0)`,
    limit: MAX_LIMIT,
    metricType: 'Topic',
  },
  where: [
    "metricName like '%confluent%' AND ((`topic` OR `confluent.kafka.server.metric.topic`) IS NOT NULL)",
    ...where,
  ],
  orderBy: `${orderBy} DESC`,
  limit: LIMIT_20,
  isNested: true,
}
```

**Key Features**:
- **Confluent metric naming**: Uses Confluent's metric naming conventions
- **Dual metric support**: Handles both old (`confluent_*`) and new (`confluent.kafka.*`) naming
- **Simplified topic reference**: Uses `topic` attribute directly

**Performance Optimizations**:
- **Inner query aggregation**: Reduces data volume before final selection
- **Limit application**: MAX_LIMIT for aggregation, LIMIT_20 for display
- **Index utilization**: Leverages New Relic's indexed fields for efficient filtering

---

## Query Configuration Objects

### DIM_QUERIES (Dimensional Queries)
**Location**: query-utils.ts:252-338

**Purpose**: Predefined query configurations for AWS MSK polling-based metrics.

**Structure**: Key-value mapping where keys are metric identifiers and values are query definitions.

#### Key Configurations:

##### CLUSTER_INCOMING_THROUGHPUT
```typescript
CLUSTER_INCOMING_THROUGHPUT: {
  select: `sum(bytesInPerSec)`,
  from: {
    select: `average(provider.bytesInPerSec.Average) as 'bytesInPerSec'`,
    from: 'AwsMskBrokerSample',
    facet: ['provider.clusterName as cluster', 'provider.brokerId'],
    limit: MAX_LIMIT,
  },
  isNested: true,
}
```

**Logic Flow**:
1. **Inner query**: Aggregates broker-level throughput by cluster and broker ID
2. **Outer query**: Sums all broker throughput for total cluster throughput
3. **Faceting**: Groups by cluster and broker for proper aggregation

##### CLUSTER_HEALTH_QUERY_BY_BROKER
```typescript
CLUSTER_HEALTH_QUERY_BY_BROKER: {
  select: "filter(datapointCount(),WHERE `Under Min ISR Partitions` > 0) as 'Under Min ISR Partitions',filter(datapointCount(),WHERE `Under Replicated Partitions` > 0) as 'Under Replicated Partitions'",
  from: {
    select: "latest(`provider.underReplicatedPartitions.Sum`) AS 'Under Replicated Partitions',latest(`provider.underMinIsrPartitionCount.Sum`) AS 'Under Min ISR Partitions'",
    from: 'AwsMskBrokerSample',
    facet: ["provider.clusterName as 'cluster'", 'provider.brokerId'],
    limit: MAX_LIMIT,
  },
  facet: "'cluster'",
  limit: MAX_LIMIT,
  isNested: true,
}
```

**Logic Flow**:
1. **Inner query**: Gets latest partition counts per broker
2. **Outer query**: Counts brokers with problematic partitions per cluster
3. **Health indication**: Non-zero counts indicate cluster health issues

### MTS_QUERIES (Metric Stream Queries)
**Location**: query-utils.ts:340-475

**Purpose**: Equivalent query configurations for AWS MSK metric stream-based data.

**Key Differences from DIM_QUERIES**:
- **Data Source**: Uses 'Metric' event type instead of specific samples
- **Attribute Naming**: Uses `aws.kafka.*` instead of `provider.*`
- **Filtering**: Includes `metricName` filters to isolate relevant metrics

#### Example: CLUSTER_HEALTH_QUERY
```typescript
CLUSTER_HEALTH_QUERY: {
  select: `latest(\`Active Controllers\`) as 'Active Controllers',latest(\`Offline Partitions\`) as 'Offline Partitions'`,
  from: {
    select: `filter(sum(aws.kafka.ActiveControllerCount)/datapointCount(),where metricName='aws.kafka.ActiveControllerCount') as 'Active Controllers',filter(sum(aws.kafka.OfflinePartitionsCount),where metricName='aws.kafka.OfflinePartitionsCount') as 'Offline Partitions'`,
    from: 'Metric',
    facet: ["aws.kafka.ClusterName OR aws.msk.clusterName AS 'cluster'"],
    limit: MAX_LIMIT,
    metricType: 'Cluster',
  },
  facet: 'cluster',
  limit: MAX_LIMIT,
  isNested: true,
  metricType: 'Cluster',
}
```

**Advanced Features**:
- **Metric name filtering**: Uses `filter()` functions to isolate specific metrics
- **Statistical functions**: Employs `datapointCount()` for rate calculations
- **Dual namespace support**: Handles both `aws.kafka.*` and `aws.msk.*` attributes

### CONFLUENT_CLOUD_DIM_QUERIES
**Location**: query-utils.ts:477-541

**Purpose**: Query configurations specific to Confluent Cloud metrics.

**Key Characteristics**:
- **Confluent metric naming**: Uses Confluent's specific metric names
- **Cluster identification**: Uses `kafka.cluster_name`, `kafka.clusterName`, or `confluent.clusterName`
- **Limited metric set**: Fewer available metrics compared to AWS MSK

#### Example: CLUSTER_HEALTH_QUERY
```typescript
CLUSTER_HEALTH_QUERY: {
  select: `(average(confluent_kafka_server_cluster_load_percent or confluent.kafka.server.cluster_load_percent)*100 or ${DEFAULT_METRIC_VALUE}) as 'Cluster load percent', filter(average(confluent_kafka_server_hot_partition_ingress or confluent.kafka.server.hot_partition_ingress), WHERE (confluent_kafka_server_hot_partition_ingress or confluent.kafka.server.hot_partition_ingress)=1 AND metricName=('confluent_kafka_server_hot_partition_ingress' or 'confluent.kafka.server.hot_partition_ingress'))  as 'Hot partition Ingress', filter(average(confluent_kafka_server_hot_partition_egress or confluent.kafka.server.hot_partition_egress), WHERE (confluent_kafka_server_hot_partition_egress or confluent.kafka.server.hot_partition_egress)=1 AND metricName=('confluent_kafka_server_hot_partition_egress' or 'confluent.kafka.server.hot_partition_egress'))  as 'Hot partition Egress'`,
  from: 'Metric',
  where: ["metricName like '%confluent%'"],
  facet: 'kafka.cluster_name or kafka.clusterName or confluent.clusterName',
  limit: MAX_LIMIT,
  metricType: 'Cluster',
}
```

**Confluent-Specific Health Metrics**:
- **Cluster load percent**: Overall cluster utilization
- **Hot partition ingress/egress**: Identifies unbalanced partitions
- **Default value handling**: Uses `DEFAULT_METRIC_VALUE` for missing data

---

## Filter and Condition Management

### getConditionFilters
**Location**: query-utils.ts:1296-1298
```typescript
export const getConditionFilters: any = (filtersApplied: any, key: string) => {
  return filtersApplied[key] ? `(${filtersApplied[key]})` : '';
};
```

**Purpose**: Helper function that wraps filter conditions in parentheses if they exist.

**Parameters**:
- `filtersApplied`: Object containing categorized filter conditions
- `key`: Filter category key ('broker', 'cluster', 'topic')

**Returns**: String - Wrapped condition or empty string

### getClusterGroupWhereCond
**Location**: query-utils.ts:1300-1340

**Purpose**: Constructs complex WHERE clauses for cluster-based filtering with nested subqueries.

**Function Signature**:
```typescript
export const getClusterGroupWhereCond = (filterSet: any) => string
```

**Algorithm**:
1. **Filter Categorization**: Separates filters into broker, topic, and cluster categories
2. **Condition Building**: Constructs appropriate WHERE conditions based on filter types
3. **Nested Query Generation**: Creates subqueries when cross-entity filtering is needed

**Logic Flow**:
```typescript
const filtersApplied: any = {
  broker: '',
  cluster: '',
  topic: '',
};

// Categorize filters by type
(filterSet || []).forEach((filter: string) => {
  if (filter.includes('aws.msk.brokerId or aws.kafka.BrokerID')) {
    filtersApplied.broker = filtersApplied.broker.length
      ? filtersApplied.broker + ' AND ' + filter
      : filter;
  } else if (filter.includes('aws.kafka.Topic OR aws.msk.topic')) {
    filtersApplied.topic = filtersApplied.topic.length
      ? filtersApplied.topic + ' AND ' + filter
      : filter;
  } else {
    filtersApplied.cluster = filtersApplied.cluster.length
      ? filtersApplied.cluster + ' AND ' + filter
      : filter;
  }
});
```

**Complex WHERE Construction**:
```typescript
const clusterGroupApplied = (filtersApplied.broker || filtersApplied.topic) && filtersApplied.cluster;

return filterSet.length
  ? `WHERE ${
      filtersApplied.broker || filtersApplied.topic
        ? `((\`aws.kafka.ClusterName\` OR \`aws.msk.clusterName\`) in (SELECT (\`aws.kafka.ClusterName\` OR \`aws.msk.clusterName\`) from Metric where 
  ${getConditionFilters(filtersApplied, 'broker')} 
  ${filtersApplied.topic && filtersApplied.broker ? ' AND ' : ''} 
  ${getConditionFilters(filtersApplied, 'topic')}`
        : ''
    } 
  ${filtersApplied.cluster ? '' : 'LIMIT MAX))'}
  ${clusterGroupApplied ? ' AND ' : ''}
  ${getConditionFilters(filtersApplied, 'cluster')}
  ${clusterGroupApplied ? 'LIMIT MAX))' : ''}`
  : '';
```

**Key Features**:
- **Cross-entity filtering**: Allows filtering clusters based on broker or topic criteria
- **Subquery optimization**: Uses SELECT subqueries to pre-filter cluster names
- **Conditional logic**: Applies different strategies based on filter combinations
- **Performance optimization**: Uses LIMIT MAX to prevent excessive subquery results

### getModifiedFilterSetForTags
**Location**: query-utils.ts:1476-1487

**Purpose**: Processes filter sets to handle metric tag attributes specially.

**Function Signature**:
```typescript
export const getModifiedFilterSetForTags = (filterSet: any[]) => string[]
```

**Logic**:
```typescript
return (filterSet || []).map((whereVal: string) => {
  const parts = whereVal.split(' IN ');
  const firstPart = parts?.[0];
  const keyName = firstPart.substring(1, firstPart.length - 1);
  
  if (METRIC_TAG_ATTRIBUTES.includes(keyName)) {
    const whereCond = getAwsStreamWhere('Topic', keyName, whereVal);
    return whereCond;
  }
  return whereVal;
});
```

**Tag Attributes Handled**:
- `tags.component`
- `tags.department`
- `tags.environment`
- `tags.Name`
- `tags.owning_team`
- `tags.product`
- `tags.cell_type`
- `tags.tls_mode`
- `tags.service_name`
- `tags.cell_name`

**Purpose**: Tag-based filters require special handling because they need to be transformed into cluster-based filters through subqueries.

---

## Main Query Builder

### getQueryString
**Location**: query-utils.ts:1342-1474

**Purpose**: The core function that converts query definition objects into executable NRQL strings.

**Function Signature**:
```typescript
export const getQueryString: any = (
  queryDefinition: any,
  provider: string,
  isNavigator?: boolean,
  filterSet?: any[],
) => string
```

**Parameters**:
- `queryDefinition`: Query configuration object
- `provider`: Provider type (MSK_PROVIDER, CONFLUENT_CLOUD_PROVIDER, etc.)
- `isNavigator`: Boolean indicating if query is for navigator component
- `filterSet`: Array of filter conditions to apply

**Algorithm Overview**:

#### 1. Nested Query Handling
```typescript
const from: string = queryDefinition?.isNested
  ? `(${getQueryString({ ...queryDefinition.from, where: queryDefinition.where }, provider, isNavigator, filterSet)})`
  : queryDefinition?.from;
```

**Purpose**: Recursively processes nested queries by calling itself with the nested query definition.

#### 2. Nested Select Handling
```typescript
const select: string = queryDefinition?.isSelectNested
  ? queryDefinition.select
      .map((val: any) =>
        val.from
          ? `(${getQueryString({ ...val, where: queryDefinition.where }, provider, isNavigator, filterSet)}) ${val.alias ? `AS '${val.alias}'` : ''}`
          : val.select,
      )
      .join(', ')
  : queryDefinition?.select;
```

**Purpose**: Handles cases where SELECT clauses contain subqueries (less common but supported).

#### 3. NRQL Model Construction
```typescript
let nrql: any = new NRQLModel(from)
  .select(select)
  .since(queryDefinition?.timeRange);
```

**Purpose**: Uses the NRQLModel fluent interface to start building the query.

#### 4. Complex WHERE Clause Processing
```typescript
if (
  queryDefinition?.where &&
  !queryDefinition?.isNested &&
  (!queryDefinition.isSelectNested || queryDefinition.includeSelectNestedWhere)
) {
  let mappedWhere = '';

  if (queryDefinition?.metricType === 'Cluster' && provider === MSK_PROVIDER) {
    mappedWhere = getClusterGroupWhereCond(filterSet);
  } else {
    queryDefinition.where.forEach((whereVal: string) => {
      // Process each WHERE condition
      const parts = whereVal.split(' IN ');
      const firstPart = parts?.[0];
      const keyName = firstPart.substring(1, firstPart.length - 1);
      
      let whereCond;
      if (queryDefinition.metricType) {
        // Provider and metric type specific processing
        if (provider === CONFLUENT_CLOUD_PROVIDER && queryDefinition.metricType === 'Cluster') {
          whereCond = confluentCloudTopicWhereCond(whereVal, isNavigator, queryDefinition);
        } else if (provider === MSK_PROVIDER) {
          whereCond = getAwsStreamWhere(queryDefinition.metricType, keyName, whereVal, isNavigator);
        } else {
          whereCond = whereVal;
        }
      } else {
        // Legacy polling-based processing
        if (provider === MSK_PROVIDER_POLLING) {
          // Complex polling-specific logic
        } else {
          whereCond = whereVal;
        }
      }
      
      mappedWhere = mappedWhere === '' || provider === MSK_PROVIDER_POLLING
        ? whereCond
        : `${mappedWhere} AND ${whereCond}`;
    });
  }
  nrql = nrql.where(mappedWhere);
}
```

**Key Processing Logic**:
- **Provider-specific handling**: Different logic for AWS MSK vs Confluent Cloud
- **Metric type awareness**: Cluster, Broker, Topic metrics handled differently
- **Legacy support**: Special handling for polling-based queries
- **Filter combination**: Properly combines multiple WHERE conditions with AND

#### 5. Additional Clause Application
```typescript
if (queryDefinition.facet) {
  nrql = nrql.facet(queryDefinition.facet);
}
if (queryDefinition.orderBy) {
  nrql = nrql.orderBy(queryDefinition.orderBy);
}
if (queryDefinition.limit) {
  nrql = nrql.limit(queryDefinition.limit);
}
if (queryDefinition.isTimeseries) {
  nrql = nrql.timeseries();
}
```

**Purpose**: Applies optional NRQL clauses based on query definition properties.

#### 6. Final Query Generation
```typescript
return nrql.toString();
```

**Purpose**: Converts the NRQLModel object to an executable NRQL string.

**Advanced Features**:
- **Recursive nesting**: Supports unlimited levels of query nesting
- **Provider abstraction**: Handles differences between data sources transparently
- **Performance optimization**: Applies appropriate limits and filters at each level
- **Error resilience**: Gracefully handles missing or invalid configuration properties

---

## Utility Functions

### TOTAL_CLUSTERS_QUERY
**Location**: query-utils.ts:543-568

**Purpose**: Generates dynamic queries for counting total clusters based on provider and data collection method.

**Function Signature**:
```typescript
export const TOTAL_CLUSTERS_QUERY = (
  provider: string,
  isMetricStream: boolean,
) => QueryDefinition | {}
```

**Logic Flow**:
```typescript
if (provider === MSK_PROVIDER) {
  if (!isMetricStream) {
    return {
      select: `uniqueCount(provider.clusterName) as 'Total clusters'`,
      from: 'AwsMskClusterSample',
    };
  }
  return {
    select: `uniqueCount(aws.kafka.ClusterName OR aws.msk.clusterName) as 'Total clusters'`,
    from: 'Metric',
    where: ["(metricName like 'aws.kafka%byTopic')"],
  };
} else if (provider === CONFLUENT_CLOUD_PROVIDER) {
  return {
    select: `uniqueCount(kafka.cluster_name or kafka.clusterName or confluent.clusterName) as 'Total clusters'`,
    from: 'Metric',
    where: ["metricName like '%confluent%'"],
    metricType: 'Cluster',
  };
}
return {};
```

**Provider-Specific Behavior**:
- **AWS MSK Polling**: Uses AwsMskClusterSample with provider.clusterName
- **AWS MSK Metric Streams**: Uses Metric with aws.kafka.ClusterName/aws.msk.clusterName
- **Confluent Cloud**: Uses Metric with confluent-specific cluster name attributes
- **Unknown Provider**: Returns empty object (graceful fallback)

### getQueryByProviderAndPreference
**Location**: query-utils.ts:1489-1595

**Purpose**: Main orchestrating function that builds complete queries based on provider preferences and filters.

**Function Signature**:
```typescript
export const getQueryByProviderAndPreference = (
  isPreferMetrics: boolean,
  provider: string,
  metricId: string,
  filterSet: any[],
  facet: string[],
  timeRange: TimeRanges,
  staticInfo: StaticInfo,
): string
```

**Parameters**:
- `isPreferMetrics`: Whether to use metric streams over polling
- `provider`: Provider type (AWS MSK, Confluent Cloud)
- `metricId`: Specific metric to query (from METRIC_IDS enum)
- `filterSet`: Array of filter conditions
- `facet`: Additional facet fields
- `timeRange`: Time range for the query
- `staticInfo`: Pre-calculated static values

**Algorithm**:

#### 1. Provider Mapping
```typescript
const prodiverInfo: { key: string; value: string } = PROVIDERS_ID_MAP[provider];
```

#### 2. Filter Categorization
```typescript
const clusterOtherFilter: string[] = [];
const custerFilterCond: string[] = [];

(filterSet || []).forEach((whereVal: string) => {
  const parts = whereVal.split(' IN ');
  const firstPart = parts?.[0];
  const keyName = firstPart.substring(1, firstPart.length - 1);

  if (['aws.msk.brokerId or aws.kafka.BrokerID', 'aws.kafka.Topic OR aws.msk.topic', 'provider.brokerId', 'provider.topic'].includes(keyName)) {
    clusterOtherFilter.push(whereVal);
  } else {
    custerFilterCond.push(whereVal);
  }
});
```

#### 3. Filter Condition Building
```typescript
const clusterFilterWhere = getAwsStreamWhere('Cluster', keyName, clustersCond.join(' AND '));
const brokerFilterWhere = (filterSet || []).map((whereVal: string) => {
  const whereCond = getAwsStreamWhere('Broker', keyName, whereVal);
  return whereCond;
}).join(' AND');
const topicFilterWhere = (filterSet || []).map((whereVal: string) => {
  const whereCond = getAwsStreamWhere('Topic', keyName, whereVal);
  return whereCond;
}).join(' AND');
```

#### 4. Query Definition Retrieval
```typescript
const queryDefinition: QueryModel = SUMMARY_QUERIES({
  ...staticInfo,
  filterClusterMetric: clusterFilterWhere,
  filterBrokerMetric: brokerFilterWhere,
  filterTopicMetric: topicFilterWhere,
})[
  isPreferMetrics
    ? [prodiverInfo, 'metric_streams'].join('_')
    : [prodiverInfo, 'polling'].join('_')
][metricId];
```

#### 5. Dynamic Filter Application
```typescript
const modifiedFilterSet = getModifiedFilterSetForTags(filterSet);

if (filterSet && filterSet.length > 0) {
  queryDefinition.where = [...modifiedFilterSet, ...(queryDefinition?.where || [])];
}

if (facet.length > 0) {
  queryDefinition.facet?.push(...facet);
}
```

#### 6. Provider Type Determination
```typescript
const providerType = isPreferMetrics
  ? MSK_PROVIDER
  : provider === CONFLUENT_CLOUD_PROVIDER
    ? CONFLUENT_CLOUD_PROVIDER
    : MSK_PROVIDER_POLLING;
```

#### 7. Final Query Generation
```typescript
return getQueryString(queryDefinition, providerType, false, filterSet);
```

**Key Features**:
- **Preference handling**: Chooses between metric streams and polling based on preference
- **Filter processing**: Categorizes and processes filters appropriately
- **Static info injection**: Incorporates pre-calculated values into queries
- **Dynamic faceting**: Allows additional facet fields to be added
- **Provider abstraction**: Handles provider differences transparently

### getIntegrationType
**Location**: query-utils.ts:1597-1604

**Purpose**: Determines the integration type based on item properties.

**Function Signature**:
```typescript
export const getIntegrationType = (item: any) => string
```

**Logic**:
```typescript
const isMetricStream = item['Is Metric Stream'];
return isMetricStream
  ? MSK_PROVIDER
  : item.Provider === CONFLUENT_CLOUD_PROVIDER
    ? CONFLUENT_CLOUD_PROVIDER
    : MSK_PROVIDER_POLLING;
```

**Return Values**:
- `MSK_PROVIDER`: For metric stream-based AWS MSK integrations
- `CONFLUENT_CLOUD_PROVIDER`: For Confluent Cloud integrations
- `MSK_PROVIDER_POLLING`: For polling-based AWS MSK integrations

---

## Pagination Functions

### clustersWithCursorQuery
**Location**: query-utils.ts:1606-1621

**Purpose**: Generates GraphQL queries with cursor-based pagination for cluster entities.

**Function Signature**:
```typescript
export const clustersWithCursorQuery = (cursor: string | null) => string
```

**Generated Query**:
```typescript
return `query ALL_CLUSTERS_QUERY($clusterQuery: String!) {
  actor {
      clusterEntitySearch: entitySearch(query: $clusterQuery) {
        results(cursor: ${cursor ? `"${cursor}"` : null}) {
          __typename
          entities {
            name
          }
          nextCursor
      }
      __typename
    }
}
}`;
```

**Features**:
- **Cursor handling**: Accepts null for first page or cursor string for subsequent pages
- **Entity focus**: Returns only entity names for efficiency
- **Next cursor**: Provides cursor for next page of results

### topicsWithCursorQuery
**Location**: query-utils.ts:1623-1639

**Purpose**: Generates GraphQL queries with cursor-based pagination for topic entities.

**Function Signature**:
```typescript
export const topicsWithCursorQuery = (cursor: string | null) => string
```

**Generated Query**:
```typescript
return `query ALL_TOPICS_QUERY($topicQuery: String!) {
  actor {
      topicEntitySearch: entitySearch(query: $topicQuery) {
        results(cursor: ${cursor ? `"${cursor}"` : null}) {
          __typename
          entities {
            name
          }
          nextCursor
      }
      __typename
    }
}
}`;
```

**Identical Structure**: Same pattern as clustersWithCursorQuery but for topic entities.

**Usage Pattern**:
1. First call with `cursor: null` to get initial page
2. Subsequent calls with returned `nextCursor` value
3. Continue until `nextCursor` is null (end of results)

**Performance Benefits**:
- **Memory efficiency**: Only loads one page at a time
- **Network optimization**: Reduces payload size for large result sets
- **User experience**: Enables progressive loading and infinite scroll patterns

---

## Integration Patterns and Best Practices

### Function Composition
Many functions in the module are designed to work together:

```typescript
// Typical usage pattern
const provider = getIntegrationType(item);
const queryString = getQueryByProviderAndPreference(
  isPreferMetrics,
  provider,
  metricId,
  filterSet,
  facet,
  timeRange,
  staticInfo
);
```

### Error Handling
Functions include defensive programming patterns:
- Null/undefined checks: `(filterSet || []).forEach(...)`
- Graceful fallbacks: `return {};` for unsupported providers
- Default values: `or 0` in NRQL for missing metrics

### Performance Optimization
- **Limit usage**: Appropriate limits at each query level
- **Index utilization**: Leverages New Relic's indexed fields
- **Aggregation strategy**: Pre-aggregates data in nested queries

### Extensibility
The module structure supports easy extension:
- **New providers**: Add to provider constants and implement query configs
- **New metrics**: Add to METRIC_IDS enum and define query configurations
- **New data sources**: Extend discrimination logic and add configurations

This detailed documentation demonstrates the sophisticated design and implementation of the query-utils module, showcasing how it provides a robust abstraction layer for complex Kafka monitoring queries while maintaining performance and extensibility.