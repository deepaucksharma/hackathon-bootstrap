# Query Utils Dependency Map

## Overview
This document provides a comprehensive mapping of all dependencies, relationships, and usage patterns related to `query-utils.ts`.

## Direct Dependencies (Imported by query-utils.ts)

### External Libraries
```typescript
import NRQLModel from '@datanerd/nrql-model';
import { ngql } from 'nr1';
```

**@datanerd/nrql-model**
- **Purpose**: Fluent interface for building NRQL queries
- **Usage**: Main query construction mechanism
- **Methods Used**: `select()`, `from()`, `where()`, `facet()`, `orderBy()`, `limit()`, `timeseries()`, `since()`, `toString()`

**nr1**
- **Purpose**: New Relic One platform SDK
- **Usage**: GraphQL template literals and type definitions
- **Components Used**: `ngql` template literal, `TimeRanges` type

### Internal Dependencies
```typescript
import {
  MSK_PROVIDER_POLLING,
  CONFLUENT_CLOUD_PROVIDER,
  confluentCloudTopicWhereCond,
  DEFAULT_METRIC_VALUE,
  getAwsStreamWhere,
  getConditionMapping,
  keyMapping,
  LIMIT_20,
  MAX_LIMIT,
  METRIC_IDS,
  MSK_PROVIDER,
  PROVIDERS_ID_MAP,
  METRIC_TAG_ATTRIBUTES,
} from '../config/constants';

import { QueryModel, QueryOptions, StaticInfo } from '../types/types';
```

## Constants.ts Dependencies

### Provider Constants
- `MSK_PROVIDER = 'AWS MSK'`
- `CONFLUENT_CLOUD_PROVIDER = 'Confluent Cloud'` 
- `MSK_PROVIDER_POLLING = 'AWS MSK SAMPLE'`
- `PROVIDERS_ID_MAP: { 'AWS MSK': 'aws', 'Confluent Cloud': 'confluent_cloud' }`

### Metric Enumerations
- `METRIC_IDS` enum: Defines all supported metric identifiers
- `METRIC_TAG_ATTRIBUTES[]`: Tag attributes requiring special handling
- `DEFAULT_METRIC_VALUE = -1`: Default value for missing metrics

### Limit Constants
- `LIMIT_20 = '20'`: Standard pagination limit
- `MAX_LIMIT = 'MAX'`: Maximum aggregation limit

### Helper Functions
- `confluentCloudTopicWhereCond(whereCond, isNavigator, queryDefinition)`: Confluent Cloud filter processing
- `getAwsStreamWhere(metricType, keyName, whereCond, isNavigator)`: AWS metric stream filter processing
- `getConditionMapping(keyName)`: Maps key names to conditional logic
- `keyMapping`: Maps sample types to key attributes

## Types.ts Dependencies

### Core Interfaces
```typescript
interface StaticInfo {
  unhealthyClusters?: number;
  filterClusterMetric?: string;
  filterBrokerMetric?: string;
  filterTopicMetric?: string;
}

interface QueryModel {
  from: string | QueryModel;
  select: string[];
  facet?: string[];
  where?: string[];
  timeRange?: TimeRanges;
  limit?: number | 'MAX';
  isNested?: boolean;
  isTimeseries?: boolean;
  metricType?: string;
}

type QueryOptions = {
  [key: string]: any;
};
```

### External Type Dependencies
- `TimeRanges`: From New Relic One platform
- `EntityGuid`: From New Relic GraphQL schema

## Files That Import query-utils.ts

### Component Files (20 files)

#### Core Components
1. **EntityNavigator/EntityNavigator.tsx** - Uses GraphQL queries and filter functions
2. **home-add-filter/add-filter.tsx** - Uses filter query functions
3. **honey-comb-view/index.tsx** - Uses cluster and topic queries
4. **summary-metric-cell/index.tsx** - Uses summary query configurations
5. **topic-table-section/index.tsx** - Uses getTopicsTableQuery
6. **topics-table/index.tsx** - Uses topic-related queries

#### Import Patterns
```typescript
// Common import patterns found in components
import { 
  ALL_KAFKA_TABLE_QUERY,
  AWS_CLUSTER_QUERY_FILTER_FUNC,
  CONFLUENT_CLOUD_QUERY_FILTER_CLUSTER_FUNC,
  getTopicsTableQuery,
  TOTAL_CLUSTERS_QUERY 
} from '../utils/query-utils';
```

### Hook Files (4 files)

#### Core Hooks
1. **use-fetch-entity-metrics/index.ts**
   ```typescript
   import { getQueryByProviderAndPreference } from '../utils/query-utils';
   ```

2. **use-summary-chart/index.ts**
   ```typescript
   import { DIM_QUERIES, MTS_QUERIES, CONFLUENT_CLOUD_DIM_QUERIES } from '../utils/query-utils';
   ```

3. **use-topic-filter-query/index.ts**
   ```typescript
   import { GET_CLUSTERS_FROM_TOPIC_FILTER_QUERY } from '../utils/query-utils';
   ```

4. **use-total-clusters/index.ts**
   ```typescript
   import { TOTAL_CLUSTERS_QUERY } from '../utils/query-utils';
   ```

### Utility Files (2 files)

1. **data-utils.ts**
   ```typescript
   import { getIntegrationType, clustersWithCursorQuery, topicsWithCursorQuery } from './query-utils';
   ```

2. **mosaic.ts**
   ```typescript
   import { getQueryString } from './query-utils';
   ```

### Page Components (2 files)

1. **nerdlets/home/home.tsx**
   ```typescript
   import { ALL_KAFKA_TABLE_QUERY, COUNT_TOPIC_QUERY_FILTER } from '../utils/query-utils';
   ```

2. **nerdlets/mq-detail/mq-detail.tsx**
   ```typescript
   import { GET_RELATED_APM_ENTITIES_FOR_TOPIC } from '../utils/query-utils';
   ```

## Function Usage Analysis

### Most Frequently Used Exports

#### 1. getQueryByProviderAndPreference
**Used by**: use-fetch-entity-metrics, summary-metric-cell
**Purpose**: Main query builder for dynamic metric queries
**Usage Pattern**:
```typescript
const query = getQueryByProviderAndPreference(
  isPreferMetrics,
  provider,
  metricId,
  filterSet,
  facet,
  timeRange,
  staticInfo
);
```

#### 2. ALL_KAFKA_TABLE_QUERY
**Used by**: EntityNavigator, home-add-filter, home.tsx
**Purpose**: Primary GraphQL query for entity searches
**Usage Pattern**:
```typescript
const { data, loading, error } = useQuery(ALL_KAFKA_TABLE_QUERY, {
  variables: { awsQuery, confluentCloudQuery, facet, orderBy }
});
```

#### 3. getTopicsTableQuery
**Used by**: topics-table, topic-table-section
**Purpose**: Builds topic table queries for different providers
**Usage Pattern**:
```typescript
const queryDefinition = getTopicsTableQuery(
  queryKey,
  orderBy,
  whereConditions,
  attributeSortMapping
);
```

#### 4. TOTAL_CLUSTERS_QUERY
**Used by**: use-total-clusters, summary components
**Purpose**: Dynamic cluster counting queries
**Usage Pattern**:
```typescript
const queryDef = TOTAL_CLUSTERS_QUERY(provider, isMetricStream);
```

### GraphQL Queries Usage

#### GET_CLUSTERS_FROM_TOPIC_FILTER_QUERY
**Used by**: use-topic-filter-query
**Purpose**: Cross-reference clusters from topic filters
**Context**: Filtering and navigation logic

#### GET_RELATED_APM_ENTITIES_FOR_TOPIC
**Used by**: mq-detail page
**Purpose**: Show APM entity relationships
**Context**: Topic detail pages

### Configuration Objects Usage

#### DIM_QUERIES, MTS_QUERIES, CONFLUENT_CLOUD_DIM_QUERIES
**Used by**: use-summary-chart, honey-comb-view
**Purpose**: Predefined query configurations
**Context**: Dashboard and summary chart rendering

### Filter Functions Usage

#### AWS_CLUSTER_QUERY_FILTER_FUNC, CONFLUENT_CLOUD_QUERY_FILTER_*
**Used by**: EntityNavigator, home-add-filter
**Purpose**: Dynamic filter generation
**Context**: User-driven filtering and search

### Utility Functions Usage

#### getIntegrationType
**Used by**: data-utils
**Purpose**: Determine integration type from data
**Context**: Data processing and provider detection

#### clustersWithCursorQuery, topicsWithCursorQuery
**Used by**: data-utils
**Purpose**: Pagination support
**Context**: Large dataset handling

## Test File Dependencies

### Direct Test Files
1. **query-utils.spec.js** - Main test file
2. **constants.spec.js** - Tests for constants and helper functions

### Indirect Test Files (Component tests that test query-utils usage)
1. **home-additional-filters.spec.js**
2. **topic-table-section.spec.js**
3. **topics-table.spec.js**
4. **use-summary-chart.spec.js**
5. **mosaic.spec.js**

## Data Flow Patterns

### 1. Query Generation Flow
```
UI Component → Hook → getQueryByProviderAndPreference → SUMMARY_QUERIES → getQueryString → NRQL
```

### 2. GraphQL Query Flow
```
UI Component → GraphQL Query (ALL_KAFKA_TABLE_QUERY) → New Relic API → Data Processing
```

### 3. Filter Processing Flow
```
User Input → Filter Functions → Provider-specific Processing → WHERE Clause Generation
```

### 4. Configuration-Driven Flow
```
Metric Selection → Configuration Lookup (DIM_QUERIES/MTS_QUERIES) → Query Definition → Execution
```

## Provider-Specific Dependencies

### AWS MSK Dependencies
- **Polling**: AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample
- **Metric Streams**: Metric event type with aws.kafka.* attributes
- **Constants**: MSK_PROVIDER, MSK_PROVIDER_POLLING
- **Helper Functions**: getAwsStreamWhere, getConditionMapping

### Confluent Cloud Dependencies
- **Data Source**: Metric event type with confluent.* attributes
- **Constants**: CONFLUENT_CLOUD_PROVIDER
- **Helper Functions**: confluentCloudTopicWhereCond
- **Special Handling**: Different metric naming conventions

## Configuration Dependencies

### Summary Configuration
- **summary-config.ts**: Uses constants from constants.ts
- **Relationship**: Indirect dependency through shared constants

### Environment Configuration
- **nr1.json files**: Define New Relic One application structure
- **package.json**: Defines external library dependencies

## External API Dependencies

### New Relic Platform APIs
1. **Entity Search API**: Used by GraphQL queries
2. **NRQL API**: Executes generated NRQL queries  
3. **Time Range API**: Provides time range functionality

### Data Source APIs
1. **AWS CloudWatch**: Source for AWS MSK metrics
2. **Confluent Cloud Metrics API**: Source for Confluent metrics
3. **New Relic Infrastructure**: Polling-based metric collection

## Performance Dependencies

### Query Optimization
- **Nested Queries**: Reduces data transfer and processing
- **Limit Strategies**: MAX_LIMIT for aggregation, LIMIT_20 for display
- **Index Usage**: Leverages New Relic's indexed fields

### Caching Implications
- **Static Configurations**: Query objects cached in memory
- **Dynamic Generation**: Real-time query building for filters

## Security Dependencies

### Data Access
- **Entity Permissions**: Requires appropriate New Relic permissions
- **Account Access**: Scoped to accessible accounts
- **Metric Visibility**: Based on integration configuration

### Query Safety
- **Parameter Validation**: Prevents injection attacks
- **Limit Enforcement**: Prevents excessive resource usage

## Maintenance Dependencies

### Version Compatibility
- **New Relic Platform**: Dependent on platform API versions
- **External Libraries**: @datanerd/nrql-model version compatibility
- **TypeScript**: Type definition compatibility

### Feature Dependencies
- **Provider Support**: New providers require code changes
- **Metric Support**: New metrics require configuration updates
- **Query Features**: New NRQL features may require library updates

This dependency map shows that `query-utils.ts` is a central, critical component with extensive integration throughout the message queues application, requiring careful consideration for any modifications or extensions.