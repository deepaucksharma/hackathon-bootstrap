# Message Queues App - Component Data Dependencies Map

## Overview
This document provides a comprehensive map of all React components in the Message Queues application and their data dependencies. It details what data each component expects, how it handles missing data, and any transformations or calculations performed.

## Core Data Types

### MessageQueueMetaRowItem
- **Name**: string[] - [Account Name, Queue Type]
- **Clusters**: string/number - Total cluster count
- **Health**: string[]/number[] - [unhealthy count, healthy count]
- **Incoming Throughput**: number - bytes per second
- **Outgoing Throughput**: number - bytes per second
- **Provider**: string - "AWS MSK" or "Confluent Cloud"
- **Account Name**: string
- **Account Id**: number
- **Is Healthy**: boolean
- **Is Metric Stream**: boolean
- **Unhealthy Clusters**: number
- **hasError**: boolean

### TopicRowItem
- **Name**: string - Topic name
- **APM entity**: number - Count of related APM entities
- **apmGuids**: string[] - GUIDs of related APM entities
- **Topic Name**: string
- **guid**: string - Entity GUID
- **Incoming Throughput**: string - Formatted throughput
- **Outgoing Throughput**: string - Formatted throughput
- **Message rate**: string - Formatted message rate
- **alertSeverity**: string - Alert status
- **reporting**: boolean
- **permalink**: string

### EntityMetrics
- **metrics**: Metric[] - Array of metric objects
- **[key: string]**: string | Metric[] - Dynamic properties for entity type (cluster/broker/topic)

## Component Data Dependencies

### 1. Home Page (home.tsx)
**Purpose**: Main landing page showing all Kafka accounts and clusters

**Data Dependencies**:
- **Queries**:
  - `ALL_KAFKA_TABLE_QUERY` - Fetches AWS and Confluent Cloud clusters
  - `topicsQuery` - Counts total topics across accounts
  - Topic filter query (optional)
  
**Expected Data**:
```javascript
{
  actor: {
    awsEntitySearch: {
      results: { accounts: [...] },
      facetedCounts: { counts: [...] }
    },
    confluentEntitySearch: {
      results: { accounts: [...] },
      facetedCounts: { counts: [...] }
    },
    awsTopicEntitySearch: { count: number }
  }
}
```

**Data Transformations**:
- Combines AWS and Confluent Cloud data into unified table structure
- Calculates total clusters per account
- Initializes health metrics to [0, 0]
- Sets throughput values to 0 (updated later by child components)

**Error Handling**:
- Shows error state if query fails
- Shows empty state if no data found
- Gracefully handles missing optional fields

**Missing Data Behavior**:
- No clusters: Shows product empty state with setup instructions
- Query errors: Shows error empty state
- Filtered results empty: Shows "No items match" message

### 2. Summary Page (summary/index.tsx)
**Purpose**: Detailed view of a single account with visualizations

**Data Dependencies**:
- **Props**: 
  - `item` - MessageQueueMetaRowItem from nerdlet state
  - `filter` - Applied filter array
  
- **Hooks**:
  - `useUnhealthyClusterCount` - Calculates unhealthy clusters
  - `useSummaryChartData` - Fetches summary metrics
  
**Expected Data**:
- Summary chart data: [clusters, unhealthy, topics, active topics, partitions, brokers?]
- Mosaic templates based on provider and metric stream status
- Entity selection from honeycomb view

**Error Handling**:
- Loading states for each data section
- Error boundaries for mosaic templates
- Fallback to empty arrays for missing data

### 3. MQ Detail Page (mq-detail.tsx)
**Purpose**: Wrapper for summary page with additional filtering

**Data Dependencies**:
- **Nerdlet State**:
  - `item` - Required, redirects to home if missing
  - `cluster`, `topic`, `brokerId` - Optional filter values
  - `summaryFilters` - Applied filters
  - `kafkaNavigator` - Navigation state
  
**Special Behavior**:
- Redirects to home if no item in state
- Manages cluster health filter state
- Shows warning if cluster count mismatch detected

### 4. EntityNavigator Component
**Purpose**: Honeycomb visualization of clusters/brokers/topics

**Data Dependencies**:
- **Props**:
  - `filterSet` - Applied filters
  
- **State**:
  - `filters` - { show: 'cluster'|'broker'|'topic', metric: 'health'|'alert-status', groupBy?: string }
  
- **Queries**:
  - Entity metrics query based on show/groupBy selection
  - Entity group query for additional metadata
  
**Data Transformations**:
- Groups entities by health status
- Sorts by alert severity
- Maps alert statuses to display values

**Error Handling**:
- Shows spinner during loading
- Error state with retry message
- Falls back to empty entity groups

### 5. HoneyCombView Component
**Purpose**: Renders hexagonal grid visualization

**Data Dependencies**:
- **Props**:
  - `entityGroups` - Grouped entity data
  - `EntityMetrics` - Raw metrics data
  - `filters` - Display filters
  
**Expected Structure**:
```javascript
entityGroups: [{
  name: string,
  counts: [{
    [entityType]: string,
    type: 'SUCCESS' | 'WARNING' | 'CRITICAL' | 'NOT_CONFIGURED'
  }]
}]
```

**Special Features**:
- Custom tooltip rendering with entity details
- Dynamic health status legends
- Alert severity adaptation

### 6. Home Table Component
**Purpose**: Main data table on home page

**Data Dependencies**:
- **Props**:
  - `tableData` - Ref with headers and items
  - `sortedItems` - Filtered/sorted items
  - `finalClusterFilters` - Cluster filter string
  
**Child Components**:
- `ClusterCount` - Updates health metrics
- `SummaryMetricCell` - Updates throughput metrics
- `NameColumn` - Renders account/provider info

**Update Mechanism**:
- Child components call `updateItems` to modify table data
- Updates propagate to parent through refs
- Triggers re-renders when data changes

### 7. Topics Table Components
**Purpose**: Display top 20 topics with metrics

**Data Dependencies**:
- **TopicsTableSection**:
  - Queries based on sort metric (bytesInPerSec, bytesOutPerSec, messagesInPerSec)
  - Handles provider-specific query differences
  
- **TopicsTable**:
  - Additional APM entity query if relationships present
  - Maps topic entities to APM GUIDs
  
**Data Flow**:
1. Section queries for topic metrics
2. Table enriches with APM relationships
3. Content component renders final table

### 8. Summary Chart Component
**Purpose**: Dashboard-style metric display

**Data Dependencies**:
- **Props**:
  - `values` - Array of { data: string|number, label: string }
  - `timeRanges` - Begin/end timestamps
  - `queries` - Original queries for reference
  
**Display Logic**:
- Shows spinner if data missing
- Special styling for unhealthy clusters (red if > 0)
- Formats time range in header

### 9. Filter Bar Component
**Purpose**: Dynamic filtering interface

**Data Dependencies**:
- **Props**:
  - `accountIds` - Available accounts
  - `predefinedFilters` - Initial filter state
  - `eventTypes` - Queryable event types
  
**Filter Types**:
- Standard filters (account, provider, etc.)
- Status filter (Healthy/Unhealthy/All)
- Custom cluster/topic filters

### 10. Data Fetching Hooks

#### useFetchEntityMetrics
**Purpose**: Fetches health metrics for entities

**Query Selection**:
- Provider-based (AWS MSK vs Confluent Cloud)
- Metric stream vs polling
- Entity type (cluster/broker/topic)
- Optional groupBy parameter

**Error Handling**:
- Deleted account detection
- Metric unavailability
- Network errors

#### useUnhealthyClusterCount
**Purpose**: Calculates unhealthy cluster statistics

**Returns**:
- `unhealthyClusterCount` - Total count
- `unhealthyClusters` - Array of cluster names
- `healthyClusters` - Array of healthy cluster names

#### useSummaryChartData
**Purpose**: Aggregates summary metrics

**Queries**:
- Total clusters
- Unhealthy clusters
- Topics (total and active)
- Partitions
- Brokers (MSK only)

## Data Flow Patterns

### 1. Home Page Load
1. Query for all Kafka accounts and clusters
2. Transform data into table format
3. Child components fetch additional metrics
4. Update table data via callbacks
5. Apply filters and sorting

### 2. Navigation to Summary
1. Pass selected item via nerdlet state
2. Load provider-specific configurations
3. Fetch detailed metrics
4. Render visualizations

### 3. Real-time Updates
- 60-second poll interval for most queries
- Immediate updates via child component callbacks
- State management through nerdlet state

## Common Data Issues and Handling

### Missing Data Scenarios
1. **No Account ID**: Component won't render queries
2. **No Provider**: Falls back to default queries
3. **Empty Metrics**: Shows 0 or "--"
4. **Failed Queries**: Shows error state with retry option

### Data Validation
- Account ID required for all queries
- Provider determines query selection
- Metric stream status affects query structure
- Filter validation before query execution

### Performance Considerations
- Lazy loading for heavy components
- Query result caching
- Pagination for large datasets (topics limited to 20)
- Virtualized rendering for honeycomb view

## Constants and Configuration

### Key Constants
- `MSK_PROVIDER` = "AWS MSK"
- `CONFLUENT_CLOUD_PROVIDER` = "Confluent Cloud"
- `MESSAGE_QUEUE_TYPE` = "Kafka"
- `POLL_INTERVAL` = 60000ms

### Alert Severities
- `CRITICAL` - Alerting/Critical issues
- `WARNING` - Unhealthy state
- `SUCCESS` / `NOT_ALERTING` - Healthy state
- `NOT_CONFIGURED` - No alerts configured

### Metric Types
- Health metrics (cluster/broker health status)
- Throughput metrics (bytes in/out per second)
- Message rate metrics
- Count metrics (topics, partitions, brokers)