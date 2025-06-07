# Query Utils Usage Examples

## Overview
This document provides practical examples of how `query-utils.ts` functions are used throughout the message queues application.

## Table of Contents
1. [Basic Query Building](#basic-query-building)
2. [Provider-Specific Queries](#provider-specific-queries)
3. [Filter Application](#filter-application)
4. [GraphQL Query Usage](#graphql-query-usage)
5. [Configuration-Driven Queries](#configuration-driven-queries)
6. [Advanced Use Cases](#advanced-use-cases)
7. [Error Handling Patterns](#error-handling-patterns)
8. [Performance Optimization Examples](#performance-optimization-examples)

---

## Basic Query Building

### Example 1: Simple Cluster Count Query
```typescript
import { TOTAL_CLUSTERS_QUERY } from '../utils/query-utils';

// Get query definition for AWS MSK polling
const queryDef = TOTAL_CLUSTERS_QUERY('AWS MSK', false);

console.log(queryDef);
// Output:
// {
//   select: "uniqueCount(provider.clusterName) as 'Total clusters'",
//   from: 'AwsMskClusterSample'
// }

// Get query definition for AWS MSK metric streams
const metricStreamQueryDef = TOTAL_CLUSTERS_QUERY('AWS MSK', true);

console.log(metricStreamQueryDef);
// Output:
// {
//   select: "uniqueCount(aws.kafka.ClusterName OR aws.msk.clusterName) as 'Total clusters'",
//   from: 'Metric',
//   where: ["(metricName like 'aws.kafka%byTopic')"]
// }
```

### Example 2: Basic Filter Application
```typescript
import { AWS_CLUSTER_QUERY_FILTER_FUNC } from '../utils/query-utils';

// Without search filter
const baseFilter = AWS_CLUSTER_QUERY_FILTER_FUNC('');
console.log(baseFilter);
// Output: "domain IN ('INFRA') AND type='AWSMSKCLUSTER' "

// With search filter
const searchFilter = AWS_CLUSTER_QUERY_FILTER_FUNC("('my-cluster', 'test-cluster')");
console.log(searchFilter);
// Output: "domain IN ('INFRA') AND type='AWSMSKCLUSTER' AND name IN (('my-cluster', 'test-cluster'))"
```

---

## Provider-Specific Queries

### Example 3: Topic Table Query for Different Providers
```typescript
import { getTopicsTableQuery } from '../utils/query-utils';

// AWS MSK Polling Query
const awsPollingQuery = getTopicsTableQuery(
  'aws_polling',
  'bytesInPerSec',
  ["provider.clusterName IN ('my-cluster')"],
  {
    'bytesInPerSec': 'provider.bytesInPerSec.Average',
    'bytesOutPerSec': 'provider.bytesOutPerSec.Average'
  }
);

console.log(awsPollingQuery);
// Output:
// {
//   select: ['guid', 'Name', 'Topic', 'bytesInPerSec', 'bytesOutPerSec', 'messagesInPerSec'],
//   from: {
//     select: [
//       "average(provider.bytesInPerSec.Average) or 0 AS 'bytesInPerSec'",
//       "average(provider.bytesOutPerSec.Average) or 0 AS 'bytesOutPerSec'",
//       "average(provider.messagesInPerSec.Average) or 0 AS 'messagesInPerSec'"
//     ],
//     from: 'AwsMskTopicSample',
//     facet: [
//       "entityGuid as 'guid'",
//       "entityName as 'Name'",
//       "`provider.topic` AS 'Topic'"
//     ],
//     orderBy: "average(provider.bytesInPerSec.Average or 0)",
//     limit: 'MAX'
//   },
//   where: [
//     "(`provider.topic` IS NOT NULL)",
//     "provider.clusterName IN ('my-cluster')"
//   ],
//   orderBy: "bytesInPerSec DESC",
//   limit: '20',
//   isNested: true
// }

// AWS MSK Metric Streams Query
const awsMetricQuery = getTopicsTableQuery(
  'aws_metric_streams',
  'bytesInPerSec',
  ["aws.kafka.ClusterName IN ('my-cluster')"],
  {
    'bytesInPerSec': 'aws.kafka.BytesInPerSec.byTopic',
    'bytesOutPerSec': 'aws.kafka.BytesOutPerSec.byTopic'
  }
);

// Confluent Cloud Query
const confluentQuery = getTopicsTableQuery(
  'confluent_cloud_polling',
  'bytesInPerSec',
  ["kafka.cluster_name IN ('confluent-cluster')"],
  {
    'bytesInPerSec': 'confluent_kafka_server_received_bytes',
    'bytesOutPerSec': 'confluent_kafka_server_sent_bytes'
  }
);
```

### Example 4: Provider Detection and Query Selection
```typescript
import { getIntegrationType, getQueryByProviderAndPreference } from '../utils/query-utils';

// Sample data item
const dataItem = {
  'Provider': 'AWS MSK',
  'Is Metric Stream': true,
  'Name': 'my-cluster',
  'Account Id': 123456789
};

// Detect integration type
const integrationType = getIntegrationType(dataItem);
console.log(integrationType); // Output: 'AWS MSK'

// Build query based on detection
const query = getQueryByProviderAndPreference(
  true, // prefer metrics
  integrationType,
  'TOTAL_CLUSTERS',
  [], // no filters
  [], // no additional facets
  'SINCE 1 hour ago',
  { unhealthyClusters: 0 }
);

console.log(query);
// Output: Full NRQL query string for AWS MSK metric streams
```

---

## Filter Application

### Example 5: Complex Filter Processing
```typescript
import { getQueryByProviderAndPreference } from '../utils/query-utils';

// Complex filter set
const filterSet = [
  "`aws.kafka.ClusterName` IN ('cluster1', 'cluster2')",
  "`aws.kafka.Topic` IN ('topic1', 'topic2')",
  "`tags.environment` IN ('production')",
  "`aws.kafka.BrokerID` IN ('1', '2')"
];

const query = getQueryByProviderAndPreference(
  true, // prefer metrics
  'AWS MSK',
  'THROUGHPUT_BY_CLUSTER',
  filterSet,
  ['region'], // additional facet
  'SINCE 24 hours ago',
  { 
    unhealthyClusters: 2,
    filterClusterMetric: "tags.environment = 'production'",
    filterBrokerMetric: "aws.kafka.BrokerID IN ('1', '2')",
    filterTopicMetric: "aws.kafka.Topic IN ('topic1', 'topic2')"
  }
);

console.log(query);
// Output: Complex NRQL with nested subqueries for cross-entity filtering
```

### Example 6: Tag-Based Filtering
```typescript
import { getModifiedFilterSetForTags } from '../utils/query-utils';

const originalFilters = [
  "`aws.kafka.ClusterName` IN ('cluster1')",
  "`tags.environment` IN ('production')",
  "`tags.department` IN ('engineering')",
  "`aws.kafka.Topic` IN ('user-events')"
];

const modifiedFilters = getModifiedFilterSetForTags(originalFilters);

console.log(modifiedFilters);
// Output: Array where tag filters are converted to cluster-based subqueries
// [
//   "`aws.kafka.ClusterName` IN ('cluster1')",
//   "(`aws.msk.clusterName` OR `aws.kafka.ClusterName`) IN (SELECT (`aws.msk.clusterName` OR `aws.kafka.ClusterName`) FROM Metric where `tags.environment` IN ('production'))",
//   "(`aws.msk.clusterName` OR `aws.kafka.ClusterName`) IN (SELECT (`aws.msk.clusterName` OR `aws.kafka.ClusterName`) FROM Metric where `tags.department` IN ('engineering'))",
//   "`aws.kafka.Topic` IN ('user-events')"
// ]
```

---

## GraphQL Query Usage

### Example 7: Entity Search with ALL_KAFKA_TABLE_QUERY
```typescript
import { useQuery } from '@apollo/client';
import { ALL_KAFKA_TABLE_QUERY } from '../utils/query-utils';

// React component using the GraphQL query
function KafkaOverview() {
  const { data, loading, error } = useQuery(ALL_KAFKA_TABLE_QUERY, {
    variables: {
      awsQuery: "domain IN ('INFRA') AND type='AWSMSKCLUSTER'",
      confluentCloudQuery: "domain IN ('INFRA') AND type='CONFLUENTCLOUDCLUSTER'",
      facet: 'ACCOUNT_NAME',
      orderBy: 'COUNT_DESC'
    },
    pollInterval: 30000 // Poll every 30 seconds
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  // Process results
  const awsClusters = data?.actor?.awsEntitySearch?.results || [];
  const confluentClusters = data?.actor?.confluentCloudEntitySearch?.results || [];
  
  return (
    <div>
      <h2>AWS MSK Clusters: {awsClusters.length}</h2>
      <h2>Confluent Clusters: {confluentClusters.length}</h2>
    </div>
  );
}
```

### Example 8: Cluster Discovery from Topic Filters
```typescript
import { useQuery } from '@apollo/client';
import { GET_CLUSTERS_FROM_TOPIC_FILTER_QUERY } from '../utils/query-utils';

function ClusterDiscovery({ topicFilters }) {
  const { data } = useQuery(GET_CLUSTERS_FROM_TOPIC_FILTER_QUERY, {
    variables: {
      awsTopicQuery: `domain IN ('INFRA') AND type='AWSMSKTOPIC' AND name IN (${topicFilters.aws})`,
      confluentTopicQuery: `domain IN ('INFRA') AND type='CONFLUENTCLOUDKAFKATOPIC' AND name IN (${topicFilters.confluent})`
    }
  });

  // Extract cluster names from different data sources
  const awsPollingClusters = data?.actor?.awsTopicEntitySearch?.polling?.group || [];
  const awsMetricClusters = data?.actor?.awsTopicEntitySearch?.metrics?.group || [];
  const confluentClusters = data?.actor?.confluentTopicEntitySearch?.groupedResults?.group || [];

  // Combine and deduplicate
  const allClusters = [...new Set([
    ...awsPollingClusters,
    ...awsMetricClusters,
    ...confluentClusters
  ])];

  return (
    <div>
      <h3>Clusters containing filtered topics:</h3>
      <ul>
        {allClusters.map(cluster => <li key={cluster}>{cluster}</li>)}
      </ul>
    </div>
  );
}
```

### Example 9: APM Entity Relationships
```typescript
import { useQuery } from '@apollo/client';
import { GET_RELATED_APM_ENTITIES_FOR_TOPIC } from '../utils/query-utils';

function TopicAPMRelationships({ topicGuids }) {
  const { data, loading } = useQuery(GET_RELATED_APM_ENTITIES_FOR_TOPIC, {
    variables: {
      entityGuids: topicGuids
    },
    skip: !topicGuids || topicGuids.length === 0
  });

  if (loading) return <div>Loading APM relationships...</div>;

  const entities = data?.actor?.entities || [];

  return (
    <div>
      {entities.map(entity => (
        <div key={entity.guid}>
          <h4>{entity.name}</h4>
          <p>Alert Severity: {entity.alertSeverity}</p>
          <p>Consumers: {entity.consumsedBy?.count || 0}</p>
          <p>Producers: {entity.producedBy?.count || 0}</p>
          
          {entity.consumsedBy?.results?.map(consumer => (
            <div key={consumer.source.guid}>
              Consumer: {consumer.source.guid}
            </div>
          ))}
          
          {entity.producedBy?.results?.map(producer => (
            <div key={producer.source.guid}>
              Producer: {producer.source.guid}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

---

## Configuration-Driven Queries

### Example 10: Using DIM_QUERIES Configuration
```typescript
import { DIM_QUERIES, MTS_QUERIES, getQueryString } from '../utils/query-utils';

// Get predefined query configuration
const clusterThroughputQuery = DIM_QUERIES.CLUSTER_INCOMING_THROUGHPUT;

console.log(clusterThroughputQuery);
// Output:
// {
//   select: "sum(bytesInPerSec)",
//   from: {
//     select: "average(provider.bytesInPerSec.Average) as 'bytesInPerSec'",
//     from: 'AwsMskBrokerSample',
//     facet: ['provider.clusterName as cluster', 'provider.brokerId'],
//     limit: 'MAX'
//   },
//   isNested: true
// }

// Convert to NRQL string
const nrqlQuery = getQueryString(
  clusterThroughputQuery,
  'AWS MSK SAMPLE', // provider type
  false, // not navigator
  ["`provider.clusterName` IN ('my-cluster')"] // filters
);

console.log(nrqlQuery);
// Output: "SELECT sum(bytesInPerSec) FROM (SELECT average(provider.bytesInPerSec.Average) as 'bytesInPerSec' FROM AwsMskBrokerSample FACET provider.clusterName as cluster, provider.brokerId WHERE `provider.clusterName` IN ('my-cluster') LIMIT MAX)"

// Use metric streams version instead
const metricStreamQuery = MTS_QUERIES.CLUSTER_INCOMING_THROUGHPUT;
const metricNrql = getQueryString(
  metricStreamQuery,
  'AWS MSK',
  false,
  ["`aws.kafka.ClusterName` IN ('my-cluster')"]
);
```

### Example 11: Dynamic Metric Selection
```typescript
import { DIM_QUERIES, MTS_QUERIES, CONFLUENT_CLOUD_DIM_QUERIES } from '../utils/query-utils';

function getQueryForMetric(metricId, provider, isMetricStream) {
  let queryConfig;
  
  if (provider === 'AWS MSK') {
    queryConfig = isMetricStream ? MTS_QUERIES : DIM_QUERIES;
  } else if (provider === 'Confluent Cloud') {
    queryConfig = CONFLUENT_CLOUD_DIM_QUERIES;
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  
  const metricQuery = queryConfig[metricId];
  if (!metricQuery) {
    throw new Error(`Metric ${metricId} not supported for provider ${provider}`);
  }
  
  return metricQuery;
}

// Usage examples
const awsPollingHealth = getQueryForMetric('CLUSTER_HEALTH_QUERY', 'AWS MSK', false);
const awsMetricHealth = getQueryForMetric('CLUSTER_HEALTH_QUERY', 'AWS MSK', true);
const confluentHealth = getQueryForMetric('CLUSTER_HEALTH_QUERY', 'Confluent Cloud', false);

console.log('AWS Polling Health Query:', awsPollingHealth);
console.log('AWS Metric Health Query:', awsMetricHealth);
console.log('Confluent Health Query:', confluentHealth);
```

---

## Advanced Use Cases

### Example 12: Pagination with Cursors
```typescript
import { clustersWithCursorQuery, topicsWithCursorQuery } from '../utils/query-utils';

async function fetchAllClusters(apolloClient) {
  const allClusters = [];
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    const query = clustersWithCursorQuery(cursor);
    
    const { data } = await apolloClient.query({
      query: gql(query),
      variables: {
        clusterQuery: "domain IN ('INFRA') AND type IN ('AWSMSKCLUSTER', 'CONFLUENTCLOUDCLUSTER')"
      }
    });

    const results = data?.actor?.clusterEntitySearch?.results;
    if (results?.entities) {
      allClusters.push(...results.entities);
    }

    cursor = results?.nextCursor;
    hasMore = !!cursor;
  }

  return allClusters;
}

// Usage
fetchAllClusters(apolloClient).then(clusters => {
  console.log(`Fetched ${clusters.length} clusters total`);
  clusters.forEach(cluster => console.log(cluster.name));
});
```

### Example 13: Complex Filter Composition
```typescript
import { getClusterGroupWhereCond, getConditionFilters } from '../utils/query-utils';

// Complex filter scenario: Find clusters that have specific brokers AND specific topics
const complexFilterSet = [
  "`aws.msk.brokerId or aws.kafka.BrokerID` IN ('1', '2', '3')",
  "`aws.kafka.Topic OR aws.msk.topic` IN ('user-events', 'order-events')",
  "`aws.kafka.ClusterName OR aws.msk.clusterName` IN ('prod-cluster')",
  "`tags.environment` IN ('production')"
];

const whereCondition = getClusterGroupWhereCond(complexFilterSet);

console.log(whereCondition);
// Output: Complex WHERE clause with nested subqueries to find clusters
// that match broker AND topic criteria while also matching direct cluster filters
```

### Example 14: Custom Query Building
```typescript
import { getQueryString } from '../utils/query-utils';

// Build a custom query definition
const customQueryDef = {
  select: [
    "latest(bytesInPerSec) as 'Incoming'",
    "latest(bytesOutPerSec) as 'Outgoing'",
    "latest(messagesInPerSec) as 'Messages'"
  ],
  from: {
    select: [
      "average(aws.kafka.BytesInPerSec.byTopic) as 'bytesInPerSec'",
      "average(aws.kafka.BytesOutPerSec.byTopic) as 'bytesOutPerSec'",
      "average(aws.kafka.MessagesInPerSec.byTopic) as 'messagesInPerSec'"
    ],
    from: 'Metric',
    facet: [
      "aws.kafka.Topic as 'topic'",
      "aws.kafka.ClusterName as 'cluster'"
    ],
    where: ["metricName like 'aws.kafka%byTopic'"],
    limit: 'MAX',
    isTimeseries: true
  },
  facet: ['topic', 'cluster'],
  where: [
    "`aws.kafka.ClusterName` IN ('my-cluster')",
    "`aws.kafka.Topic` IN ('important-topic')"
  ],
  limit: 50,
  isNested: true,
  isTimeseries: true
};

const nrqlString = getQueryString(
  customQueryDef,
  'AWS MSK',
  false,
  ["`tags.environment` IN ('production')"]
);

console.log(nrqlString);
// Output: Complete NRQL query with nested structure and time series
```

---

## Error Handling Patterns

### Example 15: Graceful Fallbacks
```typescript
import { TOTAL_CLUSTERS_QUERY, getIntegrationType } from '../utils/query-utils';

function safeGetClusterQuery(provider, isMetricStream) {
  try {
    const queryDef = TOTAL_CLUSTERS_QUERY(provider, isMetricStream);
    
    // Check if query definition is valid
    if (!queryDef || Object.keys(queryDef).length === 0) {
      console.warn(`No query definition available for provider: ${provider}`);
      return {
        select: "0 as 'Total clusters'",
        from: 'Metric',
        where: ["1 = 0"] // This will return no results
      };
    }
    
    return queryDef;
  } catch (error) {
    console.error('Error getting cluster query:', error);
    return null;
  }
}

function safeGetIntegrationType(item) {
  try {
    return getIntegrationType(item);
  } catch (error) {
    console.error('Error determining integration type:', error);
    return 'AWS MSK'; // Default fallback
  }
}

// Usage with error handling
const item = { /* some data */ };
const integrationType = safeGetIntegrationType(item);
const queryDef = safeGetClusterQuery(integrationType, item['Is Metric Stream']);

if (queryDef) {
  // Proceed with query execution
} else {
  // Handle error case
  console.log('Unable to build query, showing cached data');
}
```

### Example 16: Validation and Sanitization
```typescript
function validateAndBuildQuery(provider, metricId, filterSet, facet, timeRange, staticInfo) {
  // Validate provider
  const validProviders = ['AWS MSK', 'Confluent Cloud'];
  if (!validProviders.includes(provider)) {
    throw new Error(`Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}`);
  }

  // Validate metric ID
  const validMetrics = Object.values(METRIC_IDS);
  if (!validMetrics.includes(metricId)) {
    throw new Error(`Invalid metric ID: ${metricId}`);
  }

  // Sanitize filter set
  const sanitizedFilters = (filterSet || []).filter(filter => {
    // Basic validation - ensure filter has proper structure
    return typeof filter === 'string' && filter.includes(' IN ');
  });

  // Sanitize facet array
  const sanitizedFacet = (facet || []).filter(f => 
    typeof f === 'string' && f.length > 0
  );

  // Build query with sanitized inputs
  try {
    return getQueryByProviderAndPreference(
      true, // prefer metrics
      provider,
      metricId,
      sanitizedFilters,
      sanitizedFacet,
      timeRange || 'SINCE 1 hour ago',
      staticInfo || {}
    );
  } catch (error) {
    console.error('Query building failed:', error);
    throw new Error(`Failed to build query: ${error.message}`);
  }
}
```

---

## Performance Optimization Examples

### Example 17: Efficient Query Selection
```typescript
import { getTopicsTableQuery } from '../utils/query-utils';

// Optimize query selection based on data volume expectations
function getOptimalTopicQuery(expectedResultCount, provider, hasMetricStreams) {
  const queryKey = (() => {
    if (provider === 'Confluent Cloud') {
      return 'confluent_cloud_polling';
    }
    
    if (provider === 'AWS MSK') {
      // For large result sets, prefer metric streams for better performance
      if (expectedResultCount > 1000 && hasMetricStreams) {
        return 'aws_metric_streams';
      } else {
        return 'aws_polling';
      }
    }
    
    throw new Error(`Unsupported provider: ${provider}`);
  })();

  return getTopicsTableQuery(
    queryKey,
    'bytesInPerSec', // Order by most commonly used metric
    [], // No additional filters for base query
    {
      'bytesInPerSec': provider === 'AWS MSK' 
        ? hasMetricStreams 
          ? 'aws.kafka.BytesInPerSec.byTopic'
          : 'provider.bytesInPerSec.Average'
        : 'confluent_kafka_server_received_bytes'
    }
  );
}
```

### Example 18: Query Caching Strategy
```typescript
import { getQueryString, DIM_QUERIES, MTS_QUERIES } from '../utils/query-utils';

class QueryCache {
  constructor() {
    this.cache = new Map();
    this.ttl = 5 * 60 * 1000; // 5 minutes TTL
  }

  getCacheKey(queryDef, provider, filters) {
    return JSON.stringify({ queryDef, provider, filters });
  }

  get(queryDef, provider, filters) {
    const key = this.getCacheKey(queryDef, provider, filters);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.query;
    }
    
    return null;
  }

  set(queryDef, provider, filters, query) {
    const key = this.getCacheKey(queryDef, provider, filters);
    this.cache.set(key, {
      query,
      timestamp: Date.now()
    });
  }

  buildQuery(queryDef, provider, filters) {
    const cached = this.get(queryDef, provider, filters);
    if (cached) {
      return cached;
    }

    const query = getQueryString(queryDef, provider, false, filters);
    this.set(queryDef, provider, filters, query);
    return query;
  }
}

// Usage
const queryCache = new QueryCache();

// These calls will hit cache on subsequent requests
const query1 = queryCache.buildQuery(DIM_QUERIES.CLUSTER_HEALTH_QUERY, 'AWS MSK SAMPLE', []);
const query2 = queryCache.buildQuery(DIM_QUERIES.CLUSTER_HEALTH_QUERY, 'AWS MSK SAMPLE', []); // From cache
```

### Example 19: Batch Query Processing
```typescript
import { getQueryByProviderAndPreference } from '../utils/query-utils';

async function fetchMultipleMetrics(metrics, provider, commonFilters, staticInfo) {
  // Build all queries first
  const queries = metrics.map(metricId => ({
    metricId,
    query: getQueryByProviderAndPreference(
      true, // prefer metrics
      provider,
      metricId,
      commonFilters,
      [], // no additional facets
      'SINCE 1 hour ago',
      staticInfo
    )
  }));

  // Execute queries in parallel
  const results = await Promise.all(
    queries.map(async ({ metricId, query }) => {
      try {
        const result = await executeNRQLQuery(query);
        return { metricId, data: result, error: null };
      } catch (error) {
        return { metricId, data: null, error: error.message };
      }
    })
  );

  // Process results
  const successfulResults = results.filter(r => !r.error);
  const failedResults = results.filter(r => r.error);

  if (failedResults.length > 0) {
    console.warn(`Failed to fetch ${failedResults.length} metrics:`, failedResults);
  }

  return successfulResults.reduce((acc, { metricId, data }) => {
    acc[metricId] = data;
    return acc;
  }, {});
}

// Usage
const metricsToFetch = [
  'TOTAL_CLUSTERS',
  'UNHEALTHY_CLUSTERS',
  'TOPICS',
  'BROKERS'
];

fetchMultipleMetrics(
  metricsToFetch,
  'AWS MSK',
  ["`tags.environment` IN ('production')"],
  { unhealthyClusters: 0 }
).then(results => {
  console.log('Fetched metrics:', Object.keys(results));
});
```

These examples demonstrate the versatility and power of the `query-utils.ts` module, showing how it can be used in various scenarios from simple queries to complex, performance-optimized data fetching strategies.