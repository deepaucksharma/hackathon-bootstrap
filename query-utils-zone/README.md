# Query Utils Zone - Complete Documentation

## Overview

This directory contains a comprehensive analysis and documentation of the `query-utils.ts` file and all its related dependencies from the message-queues project. The query-utils module is a sophisticated utility system for building and managing NRQL (New Relic Query Language) queries for Kafka message queue monitoring.

## What is query-utils.ts?

`query-utils.ts` is the central query building utility for the message queues monitoring application. It provides:

- **Multi-provider support**: Handles both AWS MSK and Confluent Cloud Kafka providers
- **Dual data collection methods**: Supports both polling-based samples and metric streams
- **Complex query building**: Constructs nested NRQL queries with advanced filtering
- **GraphQL integration**: Provides pre-built GraphQL queries for entity searches
- **Performance optimization**: Implements efficient query patterns and caching strategies

## Directory Contents

### Core Files
- **`query-utils.ts`** - The main utility file (1,639 lines)
- **`constants.ts`** - Constants, enums, and helper functions used by query-utils
- **`types.ts`** - TypeScript interfaces and type definitions
- **`vendor.d.ts`** - External module type declarations

### Test Files
- **`query-utils.spec.js`** - Main test file for query-utils functions
- **`constants.spec.js`** - Tests for constants and helper functions

### Related Implementation Files
- **`use-fetch-entity-metrics.ts`** - Hook that uses query-utils for metric fetching
- **`use-summary-chart.ts`** - Hook that uses query configurations
- **`data-utils.ts`** - Utility functions that depend on query-utils
- **`mosaic.ts`** - Mosaic chart utilities using query string builder

### Documentation Files

#### 📋 Core Documentation
- **`QUERY_UTILS_ANALYSIS.md`** - Comprehensive analysis of the entire module
- **`FUNCTIONS_DETAILED_DOCUMENTATION.md`** - Detailed documentation of every function
- **`DEPENDENCY_MAP.md`** - Complete dependency and relationship mapping
- **`USAGE_EXAMPLES.md`** - Practical examples and usage patterns

## Quick Start Guide

### Understanding the Architecture

```typescript
// Basic flow: Configuration → Query Building → NRQL Execution
import { getQueryByProviderAndPreference } from './query-utils';

const nrqlQuery = getQueryByProviderAndPreference(
  true,                    // prefer metric streams
  'AWS MSK',              // provider
  'TOTAL_CLUSTERS',       // metric ID
  filterSet,              // filters
  facet,                  // additional facets
  timeRange,              // time range
  staticInfo              // pre-calculated values
);
```

### Key Components

1. **Query Filter Functions** - Dynamic filter builders
2. **GraphQL Queries** - Pre-built queries for entity searches
3. **Configuration Objects** - Large predefined query configurations
4. **Query Builder** - Core NRQL string generation
5. **Utility Functions** - Helper functions for various use cases

### Provider Support

#### AWS MSK
- **Polling**: Uses `AwsMskClusterSample`, `AwsMskBrokerSample`, `AwsMskTopicSample`
- **Metric Streams**: Uses `Metric` event type with `aws.kafka.*` attributes

#### Confluent Cloud  
- **Metric-based**: Uses `Metric` event type with `confluent.*` attributes
- **Different naming**: Confluent-specific metric naming conventions

## File Relationships

### Import Dependencies
```
query-utils.ts
├── @datanerd/nrql-model (external)
├── nr1 (external)
├── ../config/constants.ts
└── ../types/types.ts
```

### Usage Dependencies (files that import from query-utils)
- **20 component files** use various query-utils functions
- **4 hook files** implement query-utils for data fetching
- **2 utility files** extend query-utils functionality
- **2 page components** use GraphQL queries from query-utils

## Key Functions Overview

### Primary Functions

#### `getQueryByProviderAndPreference()`
Main orchestrating function that builds complete queries
- **Purpose**: Primary entry point for dynamic query building
- **Parameters**: Provider preferences, filters, metric IDs, time ranges
- **Returns**: Complete NRQL query string

#### `getTopicsTableQuery()`
Builds topic table queries for different providers and data sources
- **Purpose**: Constructs complex nested queries for topic data
- **Supports**: AWS polling, AWS metric streams, Confluent Cloud
- **Features**: Dynamic ordering, filtering, and aggregation

#### `getQueryString()`
Core function that converts query definitions to NRQL strings
- **Purpose**: Recursive query string builder
- **Features**: Nested query support, provider abstraction, filter processing

### Configuration Objects

#### `DIM_QUERIES`
Predefined query configurations for AWS MSK polling data
- **Contains**: 12+ predefined metric queries
- **Usage**: Dashboard charts, summary metrics, health monitoring

#### `MTS_QUERIES`  
Equivalent configurations for AWS MSK metric stream data
- **Contains**: Same metrics as DIM_QUERIES but for metric streams
- **Optimization**: Leverages metric stream performance benefits

#### `CONFLUENT_CLOUD_DIM_QUERIES`
Confluent Cloud-specific query configurations
- **Contains**: Confluent-compatible metric queries
- **Features**: Confluent naming conventions, cluster identification

### GraphQL Queries

#### `ALL_KAFKA_TABLE_QUERY`
Primary GraphQL query for entity searches
- **Purpose**: Fetches comprehensive Kafka infrastructure data
- **Supports**: Both AWS and Confluent Cloud providers
- **Returns**: Entity counts, faceted data, account information

#### `GET_CLUSTERS_FROM_TOPIC_FILTER_QUERY`
Cross-reference query for cluster discovery
- **Purpose**: Find clusters based on topic filters
- **Features**: Handles both polling and metric stream data sources

#### `GET_RELATED_APM_ENTITIES_FOR_TOPIC`
APM relationship query for service dependencies
- **Purpose**: Shows applications that consume/produce to topics
- **Returns**: Consumer and producer relationship data

## Performance Considerations

### Query Optimization
- **Nested queries**: Pre-aggregate data to reduce result set size
- **Limit strategies**: MAX_LIMIT for aggregation, LIMIT_20 for display
- **Index utilization**: Leverages New Relic's indexed fields

### Caching Patterns
- **Static configurations**: Large query objects defined once and reused
- **Dynamic generation**: Real-time query building for user-driven filters

### Resource Management
- **Memory efficiency**: Cursor-based pagination for large datasets
- **Network optimization**: Reduces payload size through targeted queries

## Common Usage Patterns

### 1. Dashboard Metrics
```typescript
// Get predefined query configuration
const queryConfig = DIM_QUERIES.CLUSTER_INCOMING_THROUGHPUT;
const nrqlString = getQueryString(queryConfig, provider, false, filters);
```

### 2. Dynamic Filtering
```typescript
// Build query with user-provided filters
const query = getQueryByProviderAndPreference(
  isPreferMetrics, provider, metricId, userFilters, facets, timeRange, staticInfo
);
```

### 3. Entity Discovery
```typescript
// Use GraphQL for entity searches
const { data } = useQuery(ALL_KAFKA_TABLE_QUERY, { variables: { awsQuery, confluentCloudQuery } });
```

### 4. Cross-Entity Relationships
```typescript
// Find clusters containing specific topics
const { data } = useQuery(GET_CLUSTERS_FROM_TOPIC_FILTER_QUERY, { variables: { awsTopicQuery, confluentTopicQuery } });
```

## Error Handling and Edge Cases

### Provider Fallbacks
- Graceful handling of unsupported providers
- Default configurations for unknown data sources
- Fallback queries when preferred method unavailable

### Data Validation
- Input sanitization for filter parameters
- Null safety throughout the query building process
- Type checking for query definitions

### Performance Safeguards
- Query complexity limits to prevent excessive resource usage
- Timeout handling for long-running queries
- Memory management for large result sets

## Extension Guidelines

### Adding New Providers
1. Add provider constants to `constants.ts`
2. Implement provider-specific query configurations
3. Add condition mapping logic in helper functions
4. Update provider detection and discrimination logic

### Adding New Metrics
1. Add metric ID to `METRIC_IDS` enum
2. Define query configurations in appropriate provider sections
3. Update summary query definitions
4. Add any required helper functions

### Adding New Data Sources
1. Extend query type discrimination logic
2. Add new configuration objects for the data source
3. Implement source-specific optimizations
4. Update provider type detection

## Testing Strategy

### Unit Tests
- Function input/output validation
- Provider-specific logic testing
- Edge case handling verification

### Integration Tests  
- End-to-end query generation
- Cross-provider compatibility
- Filter application accuracy

### Performance Tests
- Query execution time benchmarks
- Memory usage optimization
- Large dataset handling

## Security Considerations

### Query Safety
- Parameter validation prevents injection attacks
- Limit enforcement prevents excessive resource usage
- Input sanitization for user-provided filters

### Data Access
- Scoped to accessible New Relic accounts
- Respects entity permissions and access controls
- Metric visibility based on integration configuration

## Troubleshooting Guide

### Common Issues

#### Query Building Failures
- **Cause**: Invalid provider or metric ID
- **Solution**: Validate inputs against supported values
- **Prevention**: Use TypeScript enums and constants

#### Performance Problems
- **Cause**: Excessive query complexity or large result sets
- **Solution**: Apply appropriate limits and use nested queries
- **Prevention**: Follow established query patterns

#### Provider Detection Issues
- **Cause**: Inconsistent data source identification
- **Solution**: Use `getIntegrationType()` helper function
- **Prevention**: Standardize data source metadata

### Debugging Tips

1. **Enable query logging**: Log generated NRQL strings for inspection
2. **Validate query definitions**: Check configuration objects before string generation
3. **Test with simple cases**: Start with basic queries and add complexity gradually
4. **Use provider-specific test data**: Ensure realistic test scenarios

## Future Roadmap

### Planned Enhancements
- Additional provider support (Azure Event Hubs, etc.)
- Enhanced query optimization algorithms
- Real-time query performance monitoring
- Advanced caching strategies

### Technical Debt
- Consolidation of similar query patterns
- Improved TypeScript type safety
- Enhanced error handling and reporting
- Performance monitoring and alerting

## Contributing

When making changes to query-utils.ts:

1. **Read the documentation**: Understand the existing architecture
2. **Follow patterns**: Use established patterns for consistency
3. **Test thoroughly**: Include unit and integration tests
4. **Update documentation**: Keep documentation in sync with changes
5. **Consider performance**: Evaluate impact on query performance
6. **Validate compatibility**: Ensure changes work across all providers

## Conclusion

The query-utils module represents a sophisticated abstraction layer that enables the message queues application to efficiently query Kafka monitoring data across multiple providers and data collection methods. Its comprehensive design supports both current requirements and future extensibility while maintaining high performance and reliability.

This documentation provides the foundation for understanding, maintaining, and extending the query-utils functionality. The modular design and comprehensive test coverage ensure that the system can evolve to meet changing requirements while maintaining backward compatibility and performance standards.