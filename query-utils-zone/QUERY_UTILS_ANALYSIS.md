# Query Utils Analysis and Documentation

## Overview

The `query-utils.ts` file is a comprehensive utility module for building and managing NRQL (New Relic Query Language) queries for Kafka message queue monitoring. It provides a sophisticated abstraction layer for constructing complex nested queries, handling multiple provider types (AWS MSK and Confluent Cloud), and managing different data collection methods (polling vs metric streams).

## Architecture and Design Patterns

### Core Design Philosophy

The module follows several key design patterns:

1. **Provider Abstraction**: Abstracts differences between AWS MSK and Confluent Cloud
2. **Collection Method Abstraction**: Handles both polling-based and metric stream-based data collection
3. **Query Builder Pattern**: Uses fluent interfaces for building complex NRQL queries
4. **Configuration-Driven Queries**: Leverages large configuration objects for query definitions
5. **Nested Query Support**: Supports complex nested NRQL queries with sub-queries

### Key Components

```typescript
// Core dependencies
import NRQLModel from '@datanerd/nrql-model';  // Query building library
import { ngql } from 'nr1';                    // GraphQL template literals
```

## File Structure and Exports

### 1. Query Filter Constants

These constants define base filters for different entity types:

```typescript
export const AWS_CLUSTER_QUERY_FILTER = "domain IN ('INFRA') AND type='AWSMSKCLUSTER'";
export const AWS_TOPIC_QUERY_FILTER = "domain IN ('INFRA') AND type='AWSMSKTOPIC'";
export const AWS_BROKER_QUERY_FILTER = "domain IN ('INFRA') AND type='AWSMSKBROKER'";
export const CONFLUENT_CLOUD_QUERY_FILTER_CLUSTER = "domain IN ('INFRA') AND type='CONFLUENTCLOUDCLUSTER'";
export const CONFLUENT_CLOUD_QUERY_FILTER_TOPIC = "domain IN ('INFRA') AND type='CONFLUENTCLOUDKAFKATOPIC'";
```

**Purpose**: These provide base filtering conditions for entity searches in New Relic's infrastructure domain.

### 2. Dynamic Filter Functions

```typescript
export const AWS_CLUSTER_QUERY_FILTER_FUNC = (searchName: string) => {
  return `${AWS_CLUSTER_QUERY_FILTER} ${searchName ? `AND name IN (${searchName})` : ''}`;
};
```

**Purpose**: Dynamic filter builders that conditionally add search criteria based on provided parameters.

### 3. GraphQL Query Definitions

#### ALL_KAFKA_TABLE_QUERY
```typescript
export const ALL_KAFKA_TABLE_QUERY = ngql`query ALL_KAFKA_TABLE_QUERY($awsQuery: String!, $confluentCloudQuery: String!, $facet: EntitySearchCountsFacet!,$orderBy: EntitySearchOrderBy!) {
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
      // Similar structure for Confluent Cloud
    }
  }
}`;
```

**Purpose**: Primary GraphQL query for fetching Kafka infrastructure data from both AWS and Confluent Cloud providers.

#### GET_CLUSTERS_FROM_TOPIC_FILTER_QUERY
```typescript
export const GET_CLUSTERS_FROM_TOPIC_FILTER_QUERY = ngql`query GET_CLUSTERS_FROM_TOPIC_FILTER_QUERY($awsTopicQuery: String!, $confluentTopicQuery: String!) {
  actor {
    awsTopicEntitySearch: entitySearch(query: $awsTopicQuery) {
      polling: groupedResults(by: {tag: "aws.clusterName"}) {
        group
      }
      metrics: groupedResults(by: {tag: "aws.kafka.ClusterName"}) {
        group
      }
    }
    // Confluent Cloud section
  }
}`;
```

**Purpose**: Retrieves cluster information based on topic filters, handling both polling and metric stream data sources.

#### GET_RELATED_APM_ENTITIES_FOR_TOPIC
```typescript
export const GET_RELATED_APM_ENTITIES_FOR_TOPIC = ngql`query GetRelatedAPMEntitiesForTopic($entityGuids: [EntityGuid!]) {
  actor {
    entities(guids: $entityGuids) {
      consumsedBy: relatedEntities(
        filter: {direction: BOTH, relationshipTypes: {include: CONSUMES}, entityDomainTypes: {include: {domain: "APM", type: "APPLICATION"}}}
      ) {
        // APM entity relationships
      }
      producedBy: relatedEntities(
        filter: {direction: BOTH, relationshipTypes: {include: PRODUCES}, entityDomainTypes: {include: {domain: "APM", type: "APPLICATION"}}}
      ) {
        // APM entity relationships
      }
    }
  }
}`;
```

**Purpose**: Fetches APM (Application Performance Monitoring) entities related to Kafka topics, showing consumer and producer relationships.

## 4. Core Query Building Functions

### getTopicsTableQuery Function

This function is one of the most complex in the module, supporting three different query types:

```typescript
export const getTopicsTableQuery: any = (
  queryKey: string,           // 'aws_polling' | 'aws_metric_streams' | 'confluent_cloud_polling'
  orderBy: string,           // Field to order results by
  where: any[],              // Additional WHERE conditions
  attributeSortMapping: { [key: string]: string },  // Mapping for sort attributes
) => {
  const queries: { [key: string]: any } = {
    aws_polling: {
      // AWS MSK polling-based query configuration
    },
    aws_metric_streams: {
      // AWS MSK metric streams-based query configuration  
    },
    confluent_cloud_polling: {
      // Confluent Cloud polling-based query configuration
    },
  };
  return queries[queryKey];
};
```

**Key Features**:
- **Provider-specific logic**: Different query structures for AWS vs Confluent Cloud
- **Data source flexibility**: Supports both polling samples and metric streams
- **Nested query support**: Inner queries for aggregation, outer queries for final selection
- **Dynamic ordering**: Configurable sorting based on different metrics

### Example Query Structure (AWS Polling):
```typescript
aws_polling: {
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

## 5. Query Configuration Objects

### DIM_QUERIES (Polling-based queries)
Large configuration object containing predefined query structures for various metrics:

```typescript
export const DIM_QUERIES: QueryOptions = {
  CLUSTER_INCOMING_THROUGHPUT: {
    select: `sum(bytesInPerSec)`,
    from: {
      select: `average(provider.bytesInPerSec.Average) as 'bytesInPerSec'`,
      from: 'AwsMskBrokerSample',
      facet: ['provider.clusterName as cluster', 'provider.brokerId'],
      limit: MAX_LIMIT,
    },
    isNested: true,
  },
  // ... many more query definitions
};
```

### MTS_QUERIES (Metric Stream-based queries)
Similar structure but uses the 'Metric' event type instead of specific sample types:

```typescript
export const MTS_QUERIES: QueryOptions = {
  CLUSTER_INCOMING_THROUGHPUT: {
    select: `sum(BytesInPerSec)`,
    from: {
      select: `filter(average(aws.kafka.BytesInPerSec.byBroker),where metricName='aws.kafka.BytesInPerSec.byBroker') as 'BytesInPerSec'`,
      from: 'Metric',
      facet: [
        "aws.kafka.ClusterName OR aws.msk.clusterName as 'cluster'",
        'aws.kafka.BrokerID OR aws.msk.brokerId',
      ],
      limit: MAX_LIMIT,
    },
    isNested: true,
  },
  // ... more configurations
};
```

### CONFLUENT_CLOUD_DIM_QUERIES
Confluent Cloud-specific query configurations:

```typescript
export const CONFLUENT_CLOUD_DIM_QUERIES: QueryOptions = {
  CLUSTER_INCOMING_THROUGHPUT: {
    select: `sum(bytesInPerSec)`,
    from: {
      select: `average(confluent_kafka_server_received_bytes or confluent.kafka.server.received_bytes) as 'bytesInPerSec'`,
      from: 'Metric',
      where: ["metricName like '%confluent%'"],
      facet: 'kafka.cluster_name or kafka.clusterName or confluent.clusterName as cluster',
      limit: MAX_LIMIT,
    },
    isNested: true,
  },
  // ... more configurations
};
```

## 6. Advanced Query Functions

### TOTAL_CLUSTERS_QUERY Function
```typescript
export const TOTAL_CLUSTERS_QUERY = (
  provider: string,
  isMetricStream: boolean,
) => {
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
};
```

**Purpose**: Dynamic query generation based on provider type and data collection method.

### SUMMARY_QUERIES Function
The most complex function in the module - generates comprehensive query configurations:

```typescript
const SUMMARY_QUERIES: any = (staticInfo: StaticInfo) => {
  return {
    aws_polling: {
      [METRIC_IDS.TOTAL_CLUSTERS]: {
        select: `uniqueCount(provider.clusterName) as  'Total clusters'`,
        from: 'AwsMskClusterSample',
      },
      [METRIC_IDS.UNHEALTHY_CLUSTERS]: {
        from: 'AwsMskTopicSample',
        select: `${staticInfo.unhealthyClusters} as 'Unhealthy clusters'`,
      },
      // ... hundreds of lines of query configurations
    },
    aws_metric_streams: {
      // Metric stream configurations
    },
    confluent_cloud_polling: {
      // Confluent Cloud configurations
    },
  };
};
```

**Features**:
- **Static info injection**: Uses pre-calculated values for certain metrics
- **Comprehensive metric coverage**: Defines queries for all major Kafka metrics
- **Time series support**: Includes configurations for time-based charts
- **Nested query support**: Complex multi-level aggregations

## 7. Filter and Condition Management

### getClusterGroupWhereCond Function
```typescript
export const getClusterGroupWhereCond = (filterSet: any) => {
  const filtersApplied: any = {
    broker: '',
    cluster: '',
    topic: '',
  };

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

  const clusterGroupApplied =
    (filtersApplied.broker || filtersApplied.topic) && filtersApplied.cluster;

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
};
```

**Purpose**: Constructs complex WHERE clauses with nested subqueries for cluster-based filtering.

## 8. Main Query String Builder

### getQueryString Function
The core function that converts query definitions into NRQL strings:

```typescript
export const getQueryString: any = (
  queryDefinition: any,
  provider: string,
  isNavigator?: boolean,
  filterSet?: any[],
) => {
  // Handle nested queries
  const from: string = queryDefinition?.isNested
    ? `(${getQueryString({ ...queryDefinition.from, where: queryDefinition.where }, provider, isNavigator, filterSet)})`
    : queryDefinition?.from;

  // Handle nested selects
  const select: string = queryDefinition?.isSelectNested
    ? queryDefinition.select
        .map((val: any) =>
          val.from
            ? `(${getQueryString({ ...val, where: queryDefinition.where }, provider, isNavigator, filterSet)}) ${val.alias ? `AS '${val.alias}'` : ''}`
            : val.select,
        )
        .join(', ')
    : queryDefinition?.select;

  // Build NRQL using NRQLModel
  let nrql: any = new NRQLModel(from)
    .select(select)
    .since(queryDefinition?.timeRange);

  // Complex WHERE clause handling
  if (queryDefinition?.where && !queryDefinition?.isNested && 
      (!queryDefinition.isSelectNested || queryDefinition.includeSelectNestedWhere)) {
    
    let mappedWhere = '';
    
    if (queryDefinition?.metricType === 'Cluster' && provider === MSK_PROVIDER) {
      mappedWhere = getClusterGroupWhereCond(filterSet);
    } else {
      // Process each WHERE condition
      queryDefinition.where.forEach((whereVal: string) => {
        // Complex condition mapping logic
      });
    }
    nrql = nrql.where(mappedWhere);
  }

  // Add optional clauses
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

  return nrql.toString();
};
```

**Key Features**:
- **Recursive nested query handling**: Supports multiple levels of nesting
- **Provider-specific logic**: Different handling for AWS vs Confluent Cloud
- **Complex filtering**: Advanced WHERE clause construction
- **Fluent interface**: Uses NRQLModel's fluent API

## 9. Utility Functions

### getQueryByProviderAndPreference
The main entry point for building queries:

```typescript
export const getQueryByProviderAndPreference = (
  isPreferMetrics: boolean,
  provider: string,
  metricId: string,
  filterSet: any[],
  facet: string[],
  timeRange: TimeRanges,
  staticInfo: StaticInfo,
): string => {
  const prodiverInfo: { key: string; value: string } = PROVIDERS_ID_MAP[provider];

  // Filter categorization
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

  // Build filter conditions
  const clusterFilterWhere = getAwsStreamWhere('Cluster', keyName, clustersCond.join(' AND '));
  const brokerFilterWhere = (filterSet || []).map(/* broker filter logic */).join(' AND');
  const topicFilterWhere = (filterSet || []).map(/* topic filter logic */).join(' AND');

  // Get query definition
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

  // Apply additional filters and facets
  const modifiedFilterSet = getModifiedFilterSetForTags(filterSet);
  if (filterSet && filterSet.length > 0) {
    queryDefinition.where = [...modifiedFilterSet, ...(queryDefinition?.where || [])];
  }
  if (facet.length > 0) {
    queryDefinition.facet?.push(...facet);
  }

  // Determine provider type
  const providerType = isPreferMetrics
    ? MSK_PROVIDER
    : provider === CONFLUENT_CLOUD_PROVIDER
      ? CONFLUENT_CLOUD_PROVIDER
      : MSK_PROVIDER_POLLING;

  return getQueryString(queryDefinition, providerType, false, filterSet);
};
```

**Purpose**: Main orchestrating function that:
1. Categorizes filters by type
2. Builds provider-specific filter conditions  
3. Retrieves appropriate query definition
4. Applies dynamic filters and facets
5. Generates final NRQL string

## 10. Cursor-based Pagination

### clustersWithCursorQuery & topicsWithCursorQuery
```typescript
export const clustersWithCursorQuery = (cursor: string | null) => {
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
};
```

**Purpose**: Handles pagination for large result sets using cursor-based pagination.

## Data Flow and Integration Points

### 1. Query Execution Flow
```
User Request → getQueryByProviderAndPreference() → SUMMARY_QUERIES() → getQueryString() → NRQL String → New Relic API
```

### 2. Provider Detection Flow
```
Data Source → getIntegrationType() → Provider Type → Query Configuration Selection
```

### 3. Filter Processing Flow
```
UI Filters → getModifiedFilterSetForTags() → Provider-specific Mapping → WHERE Clause Construction
```

## Performance Considerations

### 1. Query Optimization
- **Nested queries**: Used to pre-aggregate data and reduce result set size
- **Limit clauses**: Applied at multiple levels to prevent excessive data retrieval
- **Indexed filtering**: Leverages New Relic's indexed fields for efficient filtering

### 2. Caching Strategy
- **Static configurations**: Large query objects are defined once and reused
- **Provider detection**: Results cached to avoid repeated calculations

### 3. Resource Management
- **MAX_LIMIT**: Used for aggregation queries where all data is needed
- **LIMIT_20**: Used for display queries where pagination is handled by UI

## Error Handling and Edge Cases

### 1. Provider Fallbacks
```typescript
if (provider === MSK_PROVIDER) {
  // AWS MSK logic
} else if (provider === CONFLUENT_CLOUD_PROVIDER) {
  // Confluent Cloud logic  
} else {
  return {}; // Fallback for unknown providers
}
```

### 2. Null Safety
- Extensive use of optional chaining and null checks
- Default values for missing configuration properties
- Graceful degradation when filters are not provided

### 3. Metric Stream vs Polling
- Automatic detection and appropriate query generation
- Fallback logic when preferred method is not available

## Dependencies and External Integrations

### 1. New Relic One Platform
- **nr1**: Provides GraphQL template literals and TypeScript types
- **@datanerd/nrql-model**: NRQL query builder library

### 2. Constants Module Dependencies
- **Provider mappings**: Maps UI provider names to internal identifiers
- **Metric IDs**: Enumeration of all supported metrics
- **Helper functions**: Tag processing and condition mapping utilities

### 3. Type System Integration
- **QueryModel**: Defines structure for query definitions
- **StaticInfo**: Interface for pre-calculated metric values
- **TimeRanges**: Time range types from New Relic platform

## Testing Strategy

The module includes comprehensive test coverage:

### 1. Unit Tests (query-utils.spec.js)
- Function input/output validation
- Provider-specific logic testing
- Edge case handling

### 2. Integration Tests
- End-to-end query generation
- Cross-provider compatibility
- Filter application accuracy

### 3. Performance Tests
- Query execution time benchmarks
- Memory usage optimization
- Large dataset handling

## Future Extensibility

The architecture supports easy extension for:

### 1. New Providers
- Add provider constants to `constants.ts`
- Implement provider-specific query configurations
- Add condition mapping logic

### 2. New Metrics
- Add metric ID to `METRIC_IDS` enum
- Define query configurations in appropriate provider sections
- Update summary query definitions

### 3. New Data Sources
- Extend query type discrimination logic
- Add new configuration objects
- Implement source-specific optimizations

This comprehensive analysis demonstrates that `query-utils.ts` is a sophisticated, well-architected module that provides robust abstraction for New Relic Kafka monitoring queries while maintaining flexibility for multiple providers and data collection methods.