# New Relic Message Queues - Ultra Detailed Product Specification
## Screen-by-Screen and Control-by-Control Documentation

---

## Table of Contents

1. [Application Overview](#application-overview)
2. [Home Dashboard Screen](#home-dashboard-screen)
3. [Summary/Account Dashboard Screen](#summaryaccount-dashboard-screen)
4. [Kafka Navigator Visualization](#kafka-navigator-visualization)
5. [Entity Detail Panel](#entity-detail-panel)
6. [MQ Detail Screen](#mq-detail-screen)
7. [Component Specifications](#component-specifications)
8. [Technical Implementation](#technical-implementation)
9. [Data Models & API Specifications](#data-models--api-specifications)

---

## Application Overview

### Application Architecture
- **Type**: New Relic One (NR1) Nerdpack Application
- **Framework**: React 17+ with TypeScript
- **UI Library**: New Relic One SDK Components
- **State Management**: React Hooks + NR1 Nerdlet State
- **Routing**: NR1 Navigation System
- **Data Layer**: NerdGraph GraphQL + NRQL Queries

### Supported Providers
1. **AWS Managed Streaming for Kafka (MSK)**
   - Polling Integration (CloudWatch metrics every 5 minutes)
   - Metric Streams Integration (Real-time streaming)
2. **Confluent Cloud**
   - API-based integration with Confluent Cloud Metrics

### Entity Hierarchy
```
Account (1:N) → Provider (AWS MSK | Confluent Cloud)
Provider (1:N) → Clusters
Cluster (1:N) → Brokers
Cluster (1:N) → Topics
Topic (1:N) → Partitions
Topic ↔ APM Applications (PRODUCES/CONSUMES relationships)
```

---

## Home Dashboard Screen

### Screen Overview
**Nerdlet ID**: `message-queues.home`  
**File Location**: `/nerdlets/home/home.tsx`  
**Purpose**: Primary landing page displaying all Kafka clusters across accounts with comprehensive filtering and search capabilities.

### Layout Structure

#### 1. Top Action Bar
**Component**: Stack Container with Primary Action
**Location**: Top of screen, full width
**Height**: 48px

##### Add New Account Button
- **Component**: `Button` (NR1)
- **Variant**: `PRIMARY`
- **Icon**: `INTERFACE__SIGN__PLUS`
- **Text**: "Add new account"
- **Position**: Top-left corner
- **Behavior**: 
  - Click opens New Relic Instant Observability marketplace
  - Searches for "Kafka" integrations
  - Tracks `add_account` custom event
- **CSS Class**: `.Add-Account-Stack`

#### 2. Advanced Filter Bar Section
**Component**: `CustomFilterBar`
**Location**: Below action bar
**Height**: Variable (56px base + expanded sections)

##### 2.1 Predefined Filters Row
**Layout**: Horizontal filter chips
**Height**: 56px

###### Provider Filter
- **Type**: Multi-select dropdown
- **Options**: 
  - "AWS MSK" (value: `AWS_MSK`)
  - "Confluent Cloud" (value: `CONFLUENT_CLOUD`)
- **Default**: All selected
- **Behavior**: Filters table data by provider type
- **State Management**: Stored in `homeFilters` nerdlet state

###### Message Queue Type Filter  
- **Type**: Single-select dropdown
- **Options**: "Kafka" (extensible for future message queue types)
- **Default**: "Kafka" selected
- **Behavior**: Currently single option, prepared for expansion

###### Account Filter
- **Type**: Multi-select dropdown with search
- **Options**: Dynamically populated from available accounts
- **Display**: Account Name (Account ID)
- **Behavior**: Filters by New Relic account
- **Search**: Real-time filtering of account list

###### Status Filter (Health)
- **Type**: Single-select dropdown
- **Options**: 
  - "All" (default)
  - "Healthy" 
  - "Unhealthy"
- **Behavior**: Filters clusters by health status
- **Logic**: 
  - Healthy: Active Controllers = 1 AND Offline Partitions = 0
  - Unhealthy: Active Controllers ≠ 1 OR Offline Partitions > 0

##### 2.2 Search Bar Section
**Component**: `HomeSearchBar`
**Layout**: Right-aligned in filter bar
**Width**: 300px

###### Global Search Input
- **Component**: `TextField` with search icon
- **Placeholder**: "Search clusters, accounts, or providers..."
- **Behavior**: 
  - Real-time filtering across all table columns
  - Case-insensitive substring matching
  - Debounced input (300ms delay)
  - Tracks `search_updated` event
- **State**: `searchString` state variable

##### 2.3 Custom Add Filter Section
**Component**: `HomeAddFilter`
**Toggle**: Expandable section triggered by "Add Filter" button

###### Cluster Filter Controls
- **Label**: "Filter by clusters" 
- **Input Type**: Multi-select searchable dropdown
- **Data Source**: Real-time GraphQL query for cluster names
- **Behavior**:
  - Autocomplete with fuzzy search
  - Multiple cluster selection
  - Shows cluster count in parentheses
  - Updates topic filter options dynamically
- **State**: `clusterFilter` (comma-separated cluster names)

###### Topic Filter Controls  
- **Label**: "Filter by topics"
- **Input Type**: Multi-select searchable dropdown
- **Data Source**: Real-time GraphQL query for topic names
- **Dependencies**: Updates based on cluster filter selection
- **Behavior**: 
  - Autocomplete with fuzzy search
  - Multiple topic selection
  - Shows topic count in parentheses
  - Automatically filters clusters containing selected topics
- **State**: `topicFilter` (comma-separated topic names)

###### Apply/Reset Controls
- **Apply Button**: 
  - Text: "Apply Filters"
  - Variant: Primary
  - Behavior: Saves filters to nerdlet state, triggers data refresh
- **Reset Button**:
  - Text: "Reset"
  - Variant: Secondary  
  - Behavior: Clears all custom filters, resets to default state

##### 2.4 Additional Filters Display
**Component**: `HomeAdditionalFilters`
**Purpose**: Shows active custom filters with remove capability

###### Active Filter Pills
- **Display**: Pill-style filter indicators
- **Format**: "{Filter Type}: {Selected Values}"
- **Actions**: 
  - "X" button to remove individual filters
  - Hover shows full filter details
- **Examples**:
  - "Clusters: prod-kafka-01, staging-kafka"
  - "Topics: user-events, payment-processing"

#### 3. Main Data Table Section
**Component**: `HomeTable`
**Location**: Below filter bar
**Height**: Remaining viewport height (scrollable)

##### 3.1 Table Header
**Layout**: Fixed header with sortable columns
**Height**: 40px
**Background**: Light gray (`#f7f7f8`)

###### Column Specifications

**Name Column**
- **Header**: "Name" 
- **Width**: 25% (min 200px)
- **Sortable**: Yes (alphabetical, array string type)
- **Content**: Account name + Provider badge
- **Sub-content**: Account ID in smaller text

**Clusters Column**
- **Header**: "Clusters"
- **Width**: 15% (min 100px) 
- **Sortable**: Yes (numerical)
- **Content**: Total cluster count per account
- **Alignment**: Center

**Health Column**
- **Header**: "Health"
- **Width**: 20% (min 120px)
- **Sortable**: Yes (array numerical: [healthy_count, total_count])
- **Content**: Health status visualization
- **Format**: "X of Y healthy" with visual indicators

**Incoming Throughput Column**
- **Header**: "Incoming Throughput"
- **Width**: 20% (min 140px)
- **Sortable**: Yes (numerical)
- **Content**: Bytes per second with humanized units
- **Format**: "XX.X MB/s" or "XX.X GB/s"

**Outgoing Throughput Column** 
- **Header**: "Outgoing Throughput"
- **Width**: 20% (min 140px)
- **Sortable**: Yes (numerical) 
- **Content**: Bytes per second with humanized units
- **Format**: "XX.X MB/s" or "XX.X GB/s"

##### 3.2 Table Rows
**Height**: 64px each
**Hover State**: Light blue background (`#f0f7ff`)
**Click Behavior**: Navigate to Summary dashboard

###### Name Cell Content
**Component**: `NameColumn`
**Layout**: Horizontal flex with icon + text

**Provider Icon**
- **AWS MSK**: AWS logo (orange/gray)
- **Confluent**: Confluent logo (blue)
- **Size**: 24x24px
- **Position**: Left-aligned

**Account Information**
- **Primary Text**: Account Name (bold, 14px)
- **Secondary Text**: Account ID (gray, 12px)
- **Layout**: Vertical stack

**Integration Badge**
- **Polling**: "Polling" badge (gray)
- **Metric Stream**: "Metric Stream" badge (green)
- **Position**: Right-aligned

###### Clusters Cell Content
- **Display**: Large number (18px, bold)
- **Alignment**: Center
- **Color**: Dark gray (`#2a2a2a`)

###### Health Cell Content
**Component**: Health status indicator with breakdown

**Healthy Clusters Visual**
- **Format**: Fraction display "X / Y"
- **X**: Healthy cluster count (green text)
- **Y**: Total cluster count (gray text)
- **Visual**: Progress bar showing health ratio
  - Green portion: Healthy percentage
  - Red portion: Unhealthy percentage
  - Gray portion: Unknown/not configured

**Health Status Indicators**
- **All Healthy**: Green checkmark icon + "All healthy"
- **Some Unhealthy**: Orange warning icon + "X of Y healthy"  
- **All Unhealthy**: Red error icon + "All unhealthy"
- **No Data**: Gray icon + "No health data"

###### Throughput Cell Content
**Format**: Humanized byte values
**Examples**: 
- "125.4 MB/s"
- "2.3 GB/s" 
- "856.2 KB/s"
- "0 B/s" (for inactive clusters)

**Visual Enhancement**: Small trending indicator
- ↗ Green arrow: Increasing trend
- ↘ Red arrow: Decreasing trend  
- → Gray arrow: Stable
- — Gray line: No trend data

##### 3.3 Table Interactions

###### Sorting Behavior
- **Default Sort**: No sorting (display order from API)
- **Sort States**: None → Ascending → Descending → None
- **Visual Indicator**: Arrow icons in column headers
- **Multi-Column**: Not supported (single column sort only)
- **Persistence**: Sort state reset on page reload

###### Row Click Behavior
- **Action**: Navigate to Summary dashboard
- **Navigation**: 
  ```javascript
  navigation.openStackedNerdlet({
    id: 'message-queues.summary',
    urlState: {
      provider: row.Provider,
      account: row['Account Id'],
      accountName: row['Account Name'],
      // ... additional filters
    }
  })
  ```
- **Event Tracking**: `row_click` event with row details

###### Loading States
- **Initial Load**: Skeleton rows (3 rows, animated shimmer)
- **Filter Update**: Overlay spinner on table
- **Row Count**: Shows "Loading..." text
- **Duration**: Typically < 2 seconds

###### Empty States
- **No Data**: ProductEmptyState component
  - **Title**: "Get set up and start seeing Queues & Streams data in minutes"
  - **Description**: Feature overview text
  - **Primary CTA**: "Set up the integration" button
  - **Secondary CTA**: "See our docs" link
- **No Results**: Custom empty state
  - **Title**: "No clusters match your filters"
  - **Suggestion**: "Try adjusting your filters or search terms"
  - **Action**: "Reset filters" button

###### Error States
- **Query Error**: EmptyState with error type
  - **Icon**: Service error icon
  - **Title**: "We couldn't get the data"
  - **Description**: "Refresh the page to try again..."
  - **Action**: Automatic error reporting to New Relic

#### 4. Table Footer/Pagination
**Note**: Currently not implemented - loads all data
**Future Enhancement**: Pagination with configurable page sizes

---

## Summary/Account Dashboard Screen

### Screen Overview
**Nerdlet ID**: `message-queues.summary`  
**File Location**: `/nerdlets/summary/`  
**Purpose**: Detailed account-level analytics with time-series metrics, Kafka Navigator, and entity drill-down capabilities.

### URL State Parameters
```javascript
{
  provider: 'AWS_MSK' | 'CONFLUENT_CLOUD',
  account: string, // Account ID
  accountName: string, // Display name
  timeRange: TimeRange, // Optional time range override
  filters: FilterSet[], // Inherited filters from home
  selectedEntity?: string // Pre-selected entity GUID
}
```

### Layout Structure

#### 1. Page Header Section
**Height**: 80px
**Background**: White with bottom border

##### Breadcrumb Navigation
- **Component**: Custom breadcrumb
- **Format**: "Message Queues > {Account Name}"
- **Interaction**: "Message Queues" link returns to home
- **Styling**: Standard NR1 breadcrumb styling

##### Account Information Display
- **Account Name**: Large title (24px, bold)
- **Account ID**: Subtitle (14px, gray)
- **Provider Badge**: AWS MSK or Confluent Cloud indicator
- **Integration Type**: Polling/Metric Stream badge

##### Time Range Selector
- **Component**: NR1 TimePicker
- **Position**: Top-right corner
- **Default**: Last 60 minutes
- **Options**:
  - Last 30 minutes
  - Last 60 minutes  
  - Last 3 hours
  - Last 6 hours
  - Last 12 hours
  - Last 24 hours
  - Last 3 days
  - Last 7 days
  - Custom range picker
- **Behavior**: Updates all time-series queries globally

#### 2. Summary Metrics Dashboard
**Component**: Mosaic Dashboard Grid
**Layout**: Responsive grid (12 columns)
**Height**: Variable based on content

##### 2.1 Billboard Metrics Row
**Layout**: 5 equal-width columns
**Height**: 120px each

###### Total Clusters Billboard
- **Title**: "Total Clusters"
- **Value**: Large number display
- **Comparison**: vs previous time period
- **Click Action**: Filter Navigator to show all clusters
- **NRQL**: 
  ```sql
  SELECT uniqueCount(entity.guid) AS 'value'
  FROM AwsMskClusterSample  
  WHERE provider.accountId = '{accountId}'
  ```

###### Unhealthy Clusters Billboard
- **Title**: "Unhealthy Clusters"
- **Value**: Number with status color
- **Status Colors**:
  - 0: Green background
  - >0: Red background with count
- **Click Action**: Filter Navigator to unhealthy clusters only
- **NRQL**: Complex health calculation query

###### Total Topics Billboard
- **Title**: "Total Topics"  
- **Value**: Large number display
- **Subtitle**: Across all clusters
- **Click Action**: Show topics in Navigator

###### Total Partitions Billboard
- **Title**: "Total Partitions"
- **Value**: Aggregated partition count
- **Subtitle**: Distribution shown in tooltip

###### Total Brokers Billboard
- **Title**: "Total Brokers"
- **Value**: Unique broker count across clusters
- **Subtitle**: Average per cluster shown

##### 2.2 Time Series Charts Section
**Layout**: 2x2 grid
**Height**: 300px each chart

###### Throughput by Cluster Chart
- **Type**: Line chart (viz.line)
- **Title**: "Incoming Throughput by Cluster"
- **Y-Axis**: Bytes per second (auto-scaled units)
- **X-Axis**: Time (based on selected time range)
- **Lines**: One per cluster (up to 10, then grouped)
- **Interaction**: Click line to filter Navigator to specific cluster
- **Legend**: Cluster names with current values

###### Message Rate Trends Chart
- **Type**: Area chart (viz.area)
- **Title**: "Message Rate by Cluster"  
- **Y-Axis**: Messages per second
- **Stacking**: Stacked areas showing contribution per cluster
- **Colors**: Consistent with Navigator color scheme

###### Top Topics by Activity Chart
- **Type**: Bar chart (viz.bar)
- **Title**: "Top 20 Topics by Throughput"
- **Y-Axis**: Topic names
- **X-Axis**: Bytes per second
- **Bars**: Horizontal bars, descending order
- **Interaction**: Click bar to select topic in Navigator

###### Broker Distribution Chart
- **Type**: Column chart (viz.bar)
- **Title**: "Broker Count by Cluster"
- **X-Axis**: Cluster names
- **Y-Axis**: Broker count
- **Interaction**: Click column to focus cluster in Navigator

#### 3. Kafka Navigator Section
**Component**: `EntityNavigator` with `HoneyCombView`
**Height**: 600px (expandable to full-screen)

##### 3.1 Navigator Control Bar
**Height**: 48px
**Background**: Light gray

###### View Controls
**Layout**: Button group (radio-style selection)

**Show Options**
- **Cluster**: Shows cluster-level entities
- **Broker**: Shows individual brokers within clusters  
- **Topic**: Shows topics across clusters
- **Default**: Cluster view

**Metric Display Options**
- **Health**: Color-coded by health status
- **Alert Status**: Color-coded by alert severity
- **Throughput**: Color intensity by throughput volume
- **Default**: Health view

**Group By Options**
- **Type**: Groups by entity type
- **Cluster**: Groups brokers/topics by parent cluster
- **Provider**: Groups by integration type
- **Default**: Type grouping

##### 3.2 HoneyComb Visualization
**Component**: Interactive hexagonal grid
**Layout**: Responsive hexagonal packing algorithm

###### Hexagon Specifications
- **Base Size**: 40px diameter
- **Size Scaling**: Based on entity importance/metrics
- **Border**: 2px solid, color varies by status
- **Fill**: Semi-transparent color indicating status

###### Color Coding Scheme

**Health Status Colors**
- **Healthy**: `#11A968` (Green)
- **Warning**: `#F5A623` (Orange) 
- **Critical**: `#D0021B` (Red)
- **Unknown/Not Configured**: `#9B9B9B` (Gray)

**Alert Status Colors**  
- **No Alerts**: `#11A968` (Green)
- **Warning Alerts**: `#F5A623` (Orange)
- **Critical Alerts**: `#D0021B` (Red)
- **Not Alerting**: `#9B9B9B` (Gray)

###### Entity Interactions

**Hover Behavior**
- **Visual**: Hexagon enlarges by 10%, border becomes thicker
- **Tooltip**: Rich tooltip with key metrics
- **Delay**: 500ms hover delay to prevent flicker

**Click Behavior**  
- **Action**: Opens Entity Detail Panel
- **Animation**: Selected hexagon gets persistent highlight
- **Multi-select**: Ctrl+click for multiple selection

**Tooltip Content Structure**
```
Entity Name
Entity Type: Cluster/Broker/Topic
Status: Healthy/Warning/Critical
Key Metrics:
- Throughput: X MB/s
- Message Rate: X msg/s  
- Health Indicators: [Status details]
```

##### 3.3 Legend Panel
**Component**: `LegendsViewComponent`
**Position**: Right side of Navigator
**Width**: 200px

###### Status Legend
- **Color swatches** with status descriptions
- **Count indicators** for each status
- **Filter toggles** to show/hide status types

###### Entity Count Summary
- **Total entities** in current view
- **Breakdown by type** (Cluster/Broker/Topic)
- **Filtered count** vs total available

#### 4. Topics Table Section
**Component**: `TopicsTableSection`
**Height**: 400px (scrollable)
**Toggle**: Collapsible section

##### Table Columns
- **Topic Name**: Sortable, searchable
- **Cluster**: Parent cluster name
- **Bytes In/sec**: Incoming throughput
- **Bytes Out/sec**: Outgoing throughput  
- **Messages/sec**: Message rate
- **Partition Count**: Number of partitions
- **Health Status**: Visual indicator

##### Table Interactions
- **Sorting**: Multi-column sorting support
- **Filtering**: Built-in column filters
- **Row Selection**: Multiple row selection
- **Export**: CSV export functionality

---

## Kafka Navigator Visualization

### Component Overview
**Component**: `EntityNavigator` → `HoneyCombView`
**File Location**: `/common/components/EntityNavigator/`
**Purpose**: Interactive visualization of Kafka infrastructure topology using hexagonal grid layout.

### Visualization Engine

#### Hexagonal Grid Algorithm
- **Library**: Custom implementation using D3.js force simulation
- **Layout**: Hexagonal close packing for optimal space usage
- **Responsive**: Adapts to container size with zoom/pan controls
- **Performance**: Virtualizes rendering for 1000+ entities

#### Data Processing Pipeline
1. **Entity Aggregation**: Groups entities by selected criteria
2. **Metric Calculation**: Computes health/status for each entity
3. **Position Calculation**: Determines hexagon positions using force simulation
4. **Rendering**: SVG-based rendering with React integration

### View Modes

#### 1. Cluster View Mode
**Purpose**: High-level cluster overview
**Entity Type**: Kafka Clusters
**Grouping**: By provider and account

##### Visual Properties
- **Hexagon Size**: Based on broker count (larger = more brokers)
- **Color**: Health status of cluster
- **Border Thickness**: Alert severity level
- **Label**: Cluster name (truncated if needed)

##### Interaction Behaviors
- **Single Click**: Select cluster, show details in sidebar
- **Double Click**: Drill down to Broker view for selected cluster
- **Right Click**: Context menu with actions
  - View cluster details
  - Navigate to cluster dashboard
  - Set up alerts
  - Export cluster data

##### Health Calculation Logic
```javascript
// AWS MSK Cluster Health
if (activeControllers !== 1) return 'CRITICAL';
if (offlinePartitions > 0) return 'CRITICAL';  
if (underReplicatedPartitions > 0) return 'WARNING';
return 'HEALTHY';

// Confluent Cloud Cluster Health
if (clusterLoadPercent > 90) return 'CRITICAL';
if (clusterLoadPercent > 70) return 'WARNING';
if (hotPartitionIngress > 0 || hotPartitionEgress > 0) return 'WARNING';
return 'HEALTHY';
```

#### 2. Broker View Mode  
**Purpose**: Individual broker monitoring within clusters
**Entity Type**: Kafka Brokers
**Grouping**: By parent cluster

##### Visual Properties
- **Hexagon Size**: Based on partition load or throughput
- **Color**: Health status based on broker-specific metrics
- **Cluster Grouping**: Visual clustering with group boundaries
- **Label**: Broker ID within cluster context

##### Broker-Specific Metrics
- **Under Min ISR Partitions**: Critical if > 0
- **Under Replicated Partitions**: Warning if > 0  
- **CPU Utilization**: Warning if > 80%, Critical if > 95%
- **Disk Usage**: Warning if > 85%, Critical if > 95%
- **Network Throughput**: Relative to broker capacity

##### Group Layout
- **Cluster Boundaries**: Subtle background shapes grouping brokers
- **Cluster Labels**: Cluster name displayed above each group
- **Inter-Cluster Spacing**: Visual separation between clusters

#### 3. Topic View Mode
**Purpose**: Topic-level throughput and activity monitoring  
**Entity Type**: Kafka Topics
**Grouping**: By cluster or activity level

##### Visual Properties
- **Hexagon Size**: Based on message throughput volume
- **Color**: Activity level or health status
- **Sparkline**: Mini trend line showing recent activity
- **Label**: Topic name with truncation for long names

##### Topic Health Indicators
- **High Activity**: Green (active message flow)
- **Moderate Activity**: Yellow (some message flow)
- **Low Activity**: Orange (minimal message flow)
- **Inactive**: Red (no recent messages)
- **Error State**: Dark red (topic errors or issues)

##### Activity Thresholds
```javascript
// Message throughput classification
if (messagesPerSec > 1000) return 'HIGH_ACTIVITY';
if (messagesPerSec > 100) return 'MODERATE_ACTIVITY';  
if (messagesPerSec > 10) return 'LOW_ACTIVITY';
if (messagesPerSec > 0) return 'MINIMAL_ACTIVITY';
return 'INACTIVE';
```

### Control Interface

#### Navigator Control Bar
**Component**: `NavigatorControlBar`
**Height**: 48px
**Position**: Above visualization

##### View Selection Controls
**Component**: Button group with radio-style selection

**Show Dropdown**
- **Options**: "Cluster", "Broker", "Topic"
- **Default**: "Cluster"
- **Behavior**: Changes visualization mode instantly
- **State**: Persisted in URL state

**Metric Dropdown**
- **Options**: "Health", "Alert Status", "Throughput"
- **Default**: "Health"  
- **Behavior**: Changes color coding scheme
- **Dependencies**: Available options vary by view mode

**Group By Dropdown**
- **Options**: "Type", "Cluster", "Provider"
- **Default**: "Type"
- **Behavior**: Changes entity grouping and layout
- **Visual Impact**: Affects hexagon clustering

##### Filter Controls
**Component**: Filter chip collection

**Status Filters**
- **All Entities**: Shows all (default)
- **Healthy Only**: Shows only healthy entities
- **Unhealthy Only**: Shows only problematic entities
- **Critical Only**: Shows only critical status entities

**Provider Filters**
- **All Providers**: Shows all (default)
- **AWS MSK Only**: Filters to AWS MSK entities
- **Confluent Only**: Filters to Confluent Cloud entities

##### Display Options
**Component**: Icon button group

**Zoom Controls**
- **Zoom In**: Increases hexagon size and detail level
- **Zoom Out**: Decreases size, fits more entities
- **Zoom to Fit**: Auto-scales to show all entities
- **Reset View**: Returns to default zoom and pan

**Layout Controls**
- **Auto Layout**: Automatic force-directed positioning
- **Grid Layout**: Structured grid arrangement
- **Cluster Layout**: Grouped by cluster affinity

##### Search and Selection
**Component**: Search input with selection tools

**Search Input**
- **Placeholder**: "Search entities..."
- **Behavior**: Highlights matching entities
- **Matching**: Fuzzy search on entity names and properties
- **Clear**: X button to clear search

**Selection Tools**
- **Select All**: Selects all visible entities
- **Clear Selection**: Deselects all entities
- **Invert Selection**: Inverts current selection
- **Selection Count**: Shows "X of Y selected"

### Advanced Interactions

#### Multi-Entity Selection
**Trigger**: Ctrl+Click or drag selection
**Visual**: Selected entities get persistent highlight border
**Actions**: Bulk operations on selected entities

##### Selection Behaviors
- **Single Click**: Select/deselect individual entity
- **Ctrl+Click**: Add/remove from selection
- **Shift+Click**: Range selection (if applicable)
- **Drag Selection**: Rectangle selection tool
- **Escape Key**: Clear all selections

##### Bulk Actions Menu
**Trigger**: Right-click on selection or bulk actions button
**Options**:
- **View Details**: Show aggregated metrics for selection
- **Set Up Alerts**: Bulk alert configuration
- **Export Data**: Export metrics for selected entities
- **Add to Dashboard**: Create custom dashboard widget

#### Zoom and Pan Controls
**Implementation**: D3.js zoom behavior with custom constraints

##### Zoom Behaviors
- **Mouse Wheel**: Zoom in/out at cursor position
- **Pinch Gesture**: Touch device zoom support
- **Zoom Limits**: Min 0.5x, Max 5x scale
- **Smooth Transitions**: Animated zoom with easing

##### Pan Behaviors  
- **Mouse Drag**: Click and drag to pan view
- **Touch Drag**: Touch device pan support
- **Edge Boundaries**: Prevents panning beyond entity bounds
- **Momentum**: Continued movement after drag release

#### Context Menus
**Trigger**: Right-click on entity or background
**Positioning**: Smart positioning to stay within viewport

##### Entity Context Menu
**Options** (vary by entity type):
- **View Details**: Open entity detail panel
- **Navigate to Dashboard**: Entity-specific dashboard
- **View Related Entities**: Show connections
- **Set Up Alerts**: Alert configuration wizard
- **Export Entity Data**: CSV/JSON export
- **Copy Entity Link**: Shareable deep link

##### Background Context Menu
**Options**:
- **Reset View**: Return to default position/zoom
- **Fit All Entities**: Auto-scale to show all
- **Change Layout**: Switch layout algorithms
- **Export View**: Screenshot or data export

### Legend and Information Panel

#### Dynamic Legend
**Component**: `LegendsViewComponent`
**Position**: Right sidebar or overlay
**Width**: 200-250px

##### Status Legend Section
**Content**: Color swatches with explanations
**Layout**: Vertical list with color indicators

**Health Status Legend**
- **Green Swatch**: "Healthy" with count
- **Yellow Swatch**: "Warning" with count  
- **Red Swatch**: "Critical" with count
- **Gray Swatch**: "Unknown/Not Configured" with count

**Alert Status Legend**
- **Green Swatch**: "No Active Alerts" with count
- **Yellow Swatch**: "Warning Alerts" with count
- **Red Swatch**: "Critical Alerts" with count
- **Gray Swatch**: "Not Monitored" with count

##### Entity Count Information
**Total Entities**: Current view entity count
**Filtered Entities**: Count after filters applied
**Selected Entities**: Current selection count
**Hidden Entities**: Count of entities outside current view

##### Metric Scale Information
**Hexagon Size Scale**: Shows size meaning
- **Small**: Low throughput/few brokers
- **Medium**: Moderate activity  
- **Large**: High throughput/many brokers

### Performance Optimizations

#### Rendering Optimizations
- **Canvas Rendering**: Option for high entity counts (>500)
- **Level of Detail**: Reduced detail at lower zoom levels
- **Viewport Culling**: Only render visible entities
- **Debounced Updates**: Batch updates during rapid interactions

#### Data Management
- **Incremental Loading**: Load entities as needed
- **Smart Refresh**: Update only changed entities
- **Memory Management**: Cleanup unused entity data
- **Caching Strategy**: Cache computed positions and metrics

---

## Entity Detail Panel

### Panel Overview
**Component**: `EntityDetail`
**File Location**: `/common/components/entity-detail/`
**Purpose**: Comprehensive entity information display with real-time metrics and relationship mapping.

### Panel Behavior

#### Activation Triggers
- **Navigator Selection**: Click entity in HoneyComb view
- **Table Row Click**: Click entity in tables throughout app
- **Deep Link**: URL parameter with entity GUID
- **Search Result**: Click entity in search results

#### Panel States
- **Closed**: Panel hidden, full Navigator view
- **Open**: Panel visible, Navigator width reduced
- **Expanded**: Panel takes more space, Navigator minimized
- **Full Screen**: Panel overlay mode (mobile/small screens)

#### Animation and Transitions
- **Slide In**: 300ms ease-out transition from right
- **Resize Navigator**: Smooth width adjustment of main content
- **Content Fade**: 200ms fade-in for panel content
- **Close Animation**: 250ms slide-out to right

### Panel Layout Structure

#### 1. Panel Header
**Height**: 60px
**Background**: White with bottom border
**Layout**: Horizontal flex with space-between

##### Entity Title Section
**Layout**: Vertical stack, left-aligned

**Primary Title**
- **Content**: Entity name
- **Typography**: 18px, bold, dark gray
- **Truncation**: Ellipsis for long names
- **Max Width**: 300px

**Secondary Title**
- **Content**: Entity type + ID
- **Typography**: 14px, medium, gray
- **Format**: "Kafka Cluster • cluster-id"

##### Header Controls
**Layout**: Horizontal button group, right-aligned

**Expand/Collapse Button**
- **Icon**: Expand/collapse arrows
- **Behavior**: Toggle panel width (normal ↔ expanded)
- **Tooltip**: "Expand details" / "Collapse details"

**Close Button**
- **Icon**: X close icon
- **Behavior**: Close panel, return focus to Navigator
- **Tooltip**: "Close details"
- **Keyboard**: Escape key support

#### 2. Entity Metadata Section
**Height**: Variable (collapsed: 80px, expanded: full)
**Background**: Light blue (`#f8fafb`)

##### Entity Information Grid
**Layout**: 2-column responsive grid

**Entity Properties**
- **GUID**: Full entity identifier (copy on click)
- **Account**: Account name and ID
- **Provider**: AWS MSK / Confluent Cloud badge
- **Region**: Geographic region (if applicable)
- **Integration Type**: Polling / Metric Stream
- **Created**: Entity creation timestamp
- **Last Seen**: Most recent data timestamp

**Entity Tags**
- **Layout**: Tag chips with key:value format
- **Scrolling**: Horizontal scroll if many tags
- **Interaction**: Click tag to filter Navigator
- **Examples**: "environment:production", "team:platform"

##### Quick Actions Bar
**Layout**: Horizontal button group

**View Dashboard Button**
- **Action**: Navigate to entity-specific dashboard
- **Icon**: Dashboard icon
- **Text**: "View Dashboard"

**Set Up Alerts Button**
- **Action**: Open alerts configuration modal
- **Icon**: Bell icon  
- **Text**: "Configure Alerts"

**Export Data Button**
- **Action**: Export entity metrics to CSV
- **Icon**: Download icon
- **Text**: "Export Data"

#### 3. Real-Time Metrics Section
**Height**: Variable (min 200px)
**Update Frequency**: 30-60 seconds

##### Metrics Display Layout
**Component**: Grid of metric cards
**Responsive**: 1-3 columns based on panel width

##### Universal Metrics (All Entity Types)

**Health Status Card**
- **Title**: "Health Status"
- **Display**: Large status indicator with description
- **Colors**: Green (Healthy), Yellow (Warning), Red (Critical)
- **Details**: Specific health factors listed below
- **Trend**: 24-hour health history sparkline

**Alert Status Card**
- **Title**: "Active Alerts"
- **Display**: Alert count with severity breakdown
- **Interaction**: Click to view alert details
- **Status Indicator**: Color-coded by highest severity
- **History**: Recent alert activity timeline

##### Cluster-Specific Metrics

**Active Controllers Card**
- **Title**: "Active Controllers"
- **Value**: Should always be 1
- **Status**: Critical if not 1
- **Description**: Controller election status
- **Trend**: Historical controller changes

**Offline Partitions Card**
- **Title**: "Offline Partitions"
- **Value**: Should always be 0
- **Status**: Critical if > 0
- **Details**: List of affected topics (if any)
- **Trend**: Partition offline events over time

**Broker Count Card**
- **Title**: "Total Brokers"
- **Value**: Number of active brokers
- **Details**: Broker health breakdown
- **Interaction**: Click to switch to Broker view
- **Trend**: Broker availability over time

**Topic Count Card**
- **Title**: "Total Topics"
- **Value**: Number of topics in cluster
- **Details**: Topic activity summary
- **Interaction**: Click to switch to Topic view
- **Trend**: Topic creation/deletion activity

##### Broker-Specific Metrics

**Under Replicated Partitions Card**
- **Title**: "Under Replicated Partitions"
- **Value**: Should be 0
- **Status**: Warning if > 0
- **Details**: Affected partition list
- **Trend**: Replication lag history

**Under Min ISR Partitions Card**
- **Title**: "Under Min ISR Partitions"  
- **Value**: Should be 0
- **Status**: Critical if > 0
- **Impact**: Data availability risk
- **Trend**: ISR health over time

**CPU Utilization Card**
- **Title**: "CPU Usage"
- **Value**: Percentage with visual gauge
- **Thresholds**: Warning >80%, Critical >95%
- **Trend**: 24-hour CPU utilization graph
- **Peak**: Highest recent usage highlighted

**Disk Usage Card**
- **Title**: "Disk Usage"
- **Value**: Percentage with visual gauge
- **Details**: Used/Total space breakdown
- **Thresholds**: Warning >85%, Critical >95%
- **Trend**: Disk usage growth trend

##### Topic-Specific Metrics

**Incoming Throughput Card**
- **Title**: "Bytes In per Second"
- **Value**: Humanized byte rate (MB/s, GB/s)
- **Trend**: Real-time throughput graph
- **Peak**: Highest recent throughput
- **Average**: Recent average rate

**Outgoing Throughput Card**
- **Title**: "Bytes Out per Second"
- **Value**: Humanized byte rate
- **Comparison**: vs incoming (consumer lag indicator)
- **Trend**: Real-time consumption graph
- **Efficiency**: Producer vs consumer ratio

**Message Rate Card**
- **Title**: "Messages per Second"
- **Value**: Message count rate
- **Details**: Average message size calculated
- **Trend**: Message volume over time
- **Peak**: Maximum message rate observed

**Partition Count Card**
- **Title**: "Partitions"
- **Value**: Total partition count
- **Details**: Partition distribution across brokers
- **Health**: Partition replication status
- **Load**: Partition size distribution

#### 4. Related Entities Section
**Height**: Variable (expandable)
**Purpose**: Show entity relationships and dependencies

##### Relationship Types

**Cluster → Brokers**
- **Display**: List of brokers in cluster
- **Health**: Broker health indicators
- **Interaction**: Click to switch to broker detail
- **Sorting**: By health status, then by ID

**Cluster → Topics**
- **Display**: List of topics in cluster
- **Metrics**: Topic activity indicators
- **Filtering**: Search topics by name
- **Sorting**: By activity, alphabetical, or health

**Topic → Applications (APM)**
- **Producers**: Applications producing to topic
- **Consumers**: Applications consuming from topic
- **Relationship**: PRODUCES/CONSUMES entity relationships
- **Health**: Application health status
- **Navigation**: Click to open APM entity view

##### Related Entities Display
**Component**: Expandable list with entity cards

**Entity Card Layout**
- **Icon**: Entity type icon (cluster/broker/topic/application)
- **Name**: Entity name with truncation
- **Status**: Health/alert status indicator
- **Key Metric**: Most relevant metric for entity type
- **Last Updated**: Data freshness indicator
- **Action**: Click to view entity details

#### 5. Historical Trends Section
**Height**: Variable (expandable)
**Purpose**: Time-series data visualization for key metrics

##### Time Range Controls
- **Quick Ranges**: 1h, 6h, 24h, 7d buttons
- **Custom Range**: Date/time picker
- **Default**: Last 24 hours
- **Refresh**: Auto-refresh toggle

##### Trend Charts
**Layout**: Stacked charts with shared time axis

**Primary Metric Chart**
- **Content**: Main metric for entity type (throughput, health, etc.)
- **Type**: Line chart with area fill
- **Interaction**: Hover for precise values
- **Zoom**: Mouse wheel zoom on time axis

**Secondary Metrics Chart**  
- **Content**: Supporting metrics (CPU, memory, etc.)
- **Type**: Multi-line chart
- **Legend**: Interactive legend to show/hide series
- **Scale**: Dual Y-axis for different metric types

#### 6. Footer Action Bar
**Height**: 48px
**Background**: Light gray border top
**Layout**: Horizontal button group

##### Primary Actions
**Navigate to Dashboard**
- **Button**: Primary button
- **Action**: Open dedicated entity dashboard
- **Icon**: External link icon

**Configure Monitoring**
- **Button**: Secondary button  
- **Action**: Open monitoring setup wizard
- **Icon**: Settings icon

##### Secondary Actions
**Share Entity**
- **Button**: Icon button
- **Action**: Copy shareable link to clipboard
- **Icon**: Share icon
- **Feedback**: "Link copied!" toast

**Export Entity Data**
- **Button**: Icon button
- **Action**: Download entity data as CSV
- **Icon**: Download icon
- **Options**: Time range selection in dropdown

### Panel Responsiveness

#### Width Breakpoints
- **Normal**: 400px (default state)
- **Expanded**: 600px (expanded state)
- **Mobile**: 100vw (full screen overlay)

#### Content Adaptation
- **Narrow**: Single column metric cards
- **Medium**: Two column metric cards
- **Wide**: Three column metric cards with expanded charts

#### Mobile Optimizations
- **Full Screen**: Panel becomes modal overlay
- **Touch Interactions**: Larger touch targets
- **Swipe Gestures**: Swipe down to close
- **Scroll**: Momentum scrolling for content

### Data Refresh Strategy

#### Real-Time Updates
- **Frequency**: 30-60 second intervals
- **Incremental**: Only update changed metrics
- **Visual Indicator**: Subtle flash on updated values
- **Loading States**: Skeleton loading for new data

#### Error Handling
- **Connection Errors**: Show "Last updated" timestamp
- **Data Errors**: Show error state with retry option
- **Partial Failures**: Show available data with warnings
- **Timeout Handling**: Graceful degradation with cached data

---

## MQ Detail Screen

### Screen Overview
**Nerdlet ID**: `message-queues.message-queue-detail`  
**File Location**: `/nerdlets/mq-detail/`
**Purpose**: Entry point and router for detailed message queue analysis with state management and filter coordination.

### Screen Responsibilities

#### 1. URL State Management
**Purpose**: Centralized state management for deep linking and navigation
**Implementation**: NR1 nerdlet state with URL synchronization

##### URL Parameters Structure
```javascript
{
  // Core identification
  provider: 'AWS_MSK' | 'CONFLUENT_CLOUD',
  account: string,           // New Relic account ID
  accountName?: string,      // Display name for account
  
  // Entity filtering
  clusterId?: string,        // Specific cluster GUID
  clusterName?: string,      // Cluster display name
  brokerId?: string,         // Specific broker GUID
  topicName?: string,        // Specific topic name
  
  // View configuration
  view: 'summary' | 'navigator' | 'topics',
  navigatorView: 'cluster' | 'broker' | 'topic',
  navigatorMetric: 'health' | 'alerts' | 'throughput',
  
  // Time and filters
  timeRange?: TimeRange,     // Time window for metrics
  filters?: FilterSet[],     // Applied filter collection
  
  // UI state
  entityDetailOpen?: boolean,
  selectedEntityGuid?: string,
  panelWidth?: 'normal' | 'expanded'
}
```

#### 2. Provider Configuration Management
**Purpose**: Handle provider-specific settings and integration types

##### AWS MSK Configuration
```javascript
{
  provider: 'AWS_MSK',
  integrationType: 'polling' | 'metric_streams',
  region: string,
  clusterArn?: string,
  metricNamespace: 'AWS/Kafka',
  sampleTypes: [
    'AwsMskClusterSample',
    'AwsMskBrokerSample', 
    'AwsMskTopicSample'
  ]
}
```

##### Confluent Cloud Configuration
```javascript
{
  provider: 'CONFLUENT_CLOUD',
  integrationType: 'api',
  clusterId: string,
  environment: string,
  metricNamespace: 'confluent.kafka.*',
  sampleTypes: ['Metric']
}
```

#### 3. Filter State Coordination
**Purpose**: Synchronize filters between Home screen and Detail views

##### Filter Types and Sources
- **Inherited Filters**: Passed from Home screen navigation
- **Detail Filters**: Applied within detail views
- **Persistent Filters**: Saved in user preferences
- **Temporary Filters**: Session-only filters

##### Filter Application Logic
```javascript
// Priority order for filter resolution
const resolveFilters = (urlFilters, inheritedFilters, detailFilters) => {
  return {
    ...inheritedFilters,  // Base filters from home
    ...urlFilters,        // URL-specified filters (highest priority)
    ...detailFilters      // View-specific filters
  };
};
```

### Component Architecture

#### 1. MQ Detail Container Component
**File**: `mq-detail.tsx`
**Purpose**: Main container with state management and routing logic

##### State Management
```javascript
const [detailState, setDetailState] = useState({
  // Provider and account
  provider: urlState.provider,
  account: urlState.account,
  accountName: urlState.accountName,
  
  // Current view configuration
  activeView: urlState.view || 'summary',
  navigatorConfig: {
    show: urlState.navigatorView || 'cluster',
    metric: urlState.navigatorMetric || 'health',
    groupBy: urlState.groupBy || 'type'
  },
  
  // Entity selection
  selectedEntity: urlState.selectedEntityGuid,
  entityDetailOpen: urlState.entityDetailOpen || false,
  
  // Filters and time
  appliedFilters: resolveFilters(urlState.filters),
  timeRange: urlState.timeRange || { duration: 3600000 }, // 1 hour
  
  // UI state
  loading: false,
  error: null
});
```

##### Validation Logic
```javascript
const validateDetailState = (state) => {
  const errors = [];
  
  // Required fields validation
  if (!state.provider) errors.push('Provider is required');
  if (!state.account) errors.push('Account is required');
  
  // Provider-specific validation
  if (state.provider === 'AWS_MSK' && !state.region) {
    errors.push('AWS region is required for MSK');
  }
  
  // View compatibility validation
  if (state.navigatorConfig.show === 'broker' && !state.clusterId) {
    errors.push('Cluster selection required for broker view');
  }
  
  return errors;
};
```

#### 2. Summary View Renderer
**Purpose**: Renders the comprehensive Summary nerdlet with proper configuration

##### Summary Component Props
```javascript
<Summary
  // Core configuration
  provider={detailState.provider}
  account={detailState.account}
  accountName={detailState.accountName}
  
  // Filter configuration
  appliedFilters={detailState.appliedFilters}
  timeRange={detailState.timeRange}
  
  // Navigator configuration
  navigatorConfig={detailState.navigatorConfig}
  
  // Entity detail configuration
  selectedEntity={detailState.selectedEntity}
  entityDetailOpen={detailState.entityDetailOpen}
  
  // Event handlers
  onFilterChange={handleFilterChange}
  onNavigatorConfigChange={handleNavigatorConfigChange}
  onEntitySelect={handleEntitySelection}
  onTimeRangeChange={handleTimeRangeChange}
/>
```

##### Event Handler Implementations
```javascript
const handleFilterChange = useCallback((newFilters) => {
  setDetailState(prev => ({
    ...prev,
    appliedFilters: newFilters
  }));
  
  // Update URL state
  setNerdletState(prev => ({
    ...prev,
    filters: newFilters
  }));
}, [setNerdletState]);

const handleNavigatorConfigChange = useCallback((config) => {
  setDetailState(prev => ({
    ...prev,
    navigatorConfig: { ...prev.navigatorConfig, ...config }
  }));
  
  // Update URL for deep linking
  setNerdletState(prev => ({
    ...prev,
    navigatorView: config.show,
    navigatorMetric: config.metric,
    groupBy: config.groupBy
  }));
}, [setNerdletState]);

const handleEntitySelection = useCallback((entityGuid, open = true) => {
  setDetailState(prev => ({
    ...prev,
    selectedEntity: entityGuid,
    entityDetailOpen: open
  }));
  
  // Update URL for direct entity access
  setNerdletState(prev => ({
    ...prev,
    selectedEntityGuid: entityGuid,
    entityDetailOpen: open
  }));
}, [setNerdletState]);
```

### Integration Points

#### 1. Home Screen Navigation
**Trigger**: Row click in Home table
**Data Flow**: Home → MQ Detail with initial state

##### Navigation Handler (from Home)
```javascript
const navigateToDetail = (rowData) => {
  navigation.openStackedNerdlet({
    id: 'message-queues.message-queue-detail',
    urlState: {
      provider: rowData.Provider,
      account: rowData['Account Id'],
      accountName: rowData['Account Name'],
      
      // Default view configuration
      view: 'summary',
      navigatorView: 'cluster',
      navigatorMetric: 'health',
      
      // Time range (inherit from home if available)
      timeRange: currentTimeRange,
      
      // Filters (inherit from home)
      filters: currentFilters.filter(f => 
        f.scope === 'account' || f.scope === 'global'
      )
    }
  });
};
```

#### 2. Deep Linking Support
**Purpose**: Enable direct navigation to specific views and entities
**Implementation**: URL state parsing with fallback handling

##### Deep Link Examples
```
// Direct to account summary
/mq-detail?provider=AWS_MSK&account=123456&view=summary

// Direct to cluster navigator view
/mq-detail?provider=AWS_MSK&account=123456&view=navigator&navigatorView=cluster

// Direct to specific entity
/mq-detail?provider=AWS_MSK&account=123456&selectedEntityGuid=abc123&entityDetailOpen=true

// With filters and time range
/mq-detail?provider=AWS_MSK&account=123456&filters=[...]&timeRange={...}
```

##### URL State Parsing
```javascript
const parseUrlState = (urlState) => {
  try {
    return {
      provider: urlState.provider || 'AWS_MSK',
      account: urlState.account,
      accountName: urlState.accountName || 'Unknown Account',
      view: urlState.view || 'summary',
      navigatorView: urlState.navigatorView || 'cluster',
      navigatorMetric: urlState.navigatorMetric || 'health',
      timeRange: urlState.timeRange ? JSON.parse(urlState.timeRange) : null,
      filters: urlState.filters ? JSON.parse(urlState.filters) : [],
      selectedEntityGuid: urlState.selectedEntityGuid,
      entityDetailOpen: urlState.entityDetailOpen === 'true'
    };
  } catch (error) {
    console.error('Error parsing URL state:', error);
    return getDefaultState();
  }
};
```

### Error Handling and Loading States

#### 1. Loading State Management
**Purpose**: Coordinate loading states across multiple data sources

##### Loading State Types
```javascript
const [loadingState, setLoadingState] = useState({
  initialLoad: true,      // First page load
  filterUpdate: false,    // Filter changes
  entitySelection: false, // Entity detail loading
  timeRangeUpdate: false, // Time range changes
  dataRefresh: false      // Periodic refresh
});
```

##### Loading UI Components
- **Initial Load**: Full-screen loading spinner with progress
- **Filter Update**: Overlay spinner on affected components
- **Entity Selection**: Skeleton in entity detail panel
- **Time Range Update**: Shimmer on time-series charts
- **Data Refresh**: Subtle indicator in header

#### 2. Error State Handling
**Purpose**: Graceful error handling with recovery options

##### Error Types and Responses
```javascript
const errorHandlers = {
  INVALID_PROVIDER: () => ({
    title: 'Invalid Provider',
    description: 'The specified provider is not supported.',
    action: 'Return to Home',
    handler: () => navigation.openNerdlet({ id: 'message-queues.home' })
  }),
  
  MISSING_ACCOUNT: () => ({
    title: 'Account Not Found',
    description: 'The specified account could not be found.',
    action: 'Choose Different Account',
    handler: () => showAccountSelector()
  }),
  
  DATA_FETCH_ERROR: (error) => ({
    title: 'Data Unavailable',
    description: `Unable to fetch data: ${error.message}`,
    action: 'Retry',
    handler: () => refetchData()
  }),
  
  PERMISSION_ERROR: () => ({
    title: 'Access Denied',
    description: 'You do not have permission to view this account.',
    action: 'Request Access',
    handler: () => openPermissionRequest()
  })
};
```

### Performance Optimizations

#### 1. Data Caching Strategy
**Purpose**: Minimize redundant API calls and improve responsiveness

##### Cache Implementation
```javascript
const dataCache = {
  // Entity data cache (5 minute TTL)
  entities: new Map(),
  
  // Metrics cache (1 minute TTL for real-time data)
  metrics: new Map(),
  
  // Static data cache (15 minute TTL)
  metadata: new Map(),
  
  // Cache management
  set(key, data, ttl = 300000) {
    this.entities.set(key, {
      data,
      expires: Date.now() + ttl
    });
  },
  
  get(key) {
    const entry = this.entities.get(key);
    if (!entry || Date.now() > entry.expires) {
      this.entities.delete(key);
      return null;
    }
    return entry.data;
  }
};
```

#### 2. Component Optimization
**Purpose**: Prevent unnecessary re-renders and improve UI responsiveness

##### Memoization Strategy
```javascript
// Memoize expensive state calculations
const memoizedFilteredData = useMemo(() => {
  return applyFiltersToData(rawData, detailState.appliedFilters);
}, [rawData, detailState.appliedFilters]);

// Memoize stable callback functions
const stableHandlers = useMemo(() => ({
  onFilterChange: handleFilterChange,
  onEntitySelect: handleEntitySelection,
  onTimeRangeChange: handleTimeRangeChange
}), [handleFilterChange, handleEntitySelection, handleTimeRangeChange]);

// Memoize complex component props
const summaryProps = useMemo(() => ({
  provider: detailState.provider,
  account: detailState.account,
  appliedFilters: detailState.appliedFilters,
  timeRange: detailState.timeRange,
  navigatorConfig: detailState.navigatorConfig
}), [detailState]);
```

---

## Component Specifications

### Filter Bar Components

#### CustomFilterBar Component
**File**: `/common/components/filter-bar/index.tsx`
**Purpose**: Advanced filtering interface with predefined and custom filter support

##### Props Interface
```typescript
interface CustomFilterBarProps {
  predefinedFilters: FilterDefinition[];
  accountIds: string[];
  attributeListType: string;
  onFilterChange: (filters: Filter[]) => void;
  filterBarFilters?: Filter[];
  AdditionalSearchComponent?: React.ReactNode;
  customAddFilter?: React.ReactNode;
  additionalFilters?: React.ReactNode;
  homeFilterData?: HomeFilterData;
}
```

##### Filter Types Support
- **Predefined Filters**: Provider, Account, Message Queue Type, Status
- **Custom Filters**: Cluster names, Topic names, Custom attributes
- **Search Filter**: Free-text search across all data
- **Time-based Filters**: Future enhancement for time-scoped filtering

##### State Management
```typescript
const [activeFilters, setActiveFilters] = useState<Filter[]>([]);
const [expandedSections, setExpandedSections] = useState({
  predefined: true,
  custom: false,
  additional: false
});
```

##### Filter Application Logic
```typescript
const applyFilters = useCallback((filters: Filter[]) => {
  // Validate filter compatibility
  const validatedFilters = filters.filter(isValidFilter);
  
  // Apply filter precedence rules
  const prioritizedFilters = resolvePrecedence(validatedFilters);
  
  // Update state and trigger callback
  setActiveFilters(prioritizedFilters);
  onFilterChange(prioritizedFilters);
}, [onFilterChange]);
```

#### EditableValueFilter Component
**File**: `/common/components/filter-bar/EditableValueFilter.tsx`
**Purpose**: Status dropdown filter for health/alert status filtering

##### Component Structure
```typescript
interface EditableValueFilterProps {
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

interface FilterOption {
  label: string;
  value: string;
  count?: number;
  icon?: string;
}
```

##### Status Options Configuration
```typescript
const statusOptions: FilterOption[] = [
  {
    label: 'All Entities',
    value: 'all',
    count: totalCount,
    icon: 'list'
  },
  {
    label: 'Healthy Only', 
    value: 'healthy',
    count: healthyCount,
    icon: 'check-circle',
    color: 'green'
  },
  {
    label: 'Unhealthy Only',
    value: 'unhealthy', 
    count: unhealthyCount,
    icon: 'warning-circle',
    color: 'red'
  }
];
```

### Home Screen Components

#### HomeTable Component
**File**: `/common/components/home-table/index.tsx`
**Purpose**: Main data table with sorting, filtering, and navigation

##### Props Interface
```typescript
interface HomeTableProps {
  tableData: React.MutableRefObject<TableData>;
  loading: boolean;
  topicsLoading: boolean;
  sortedItems: MessageQueueMetaRowItem[];
  sorting: DataTableSortingState;
  totalClusterItems: MessageQueueMetaRowItem[];
  setSortedItems: (items: MessageQueueMetaRowItem[]) => void;
  setSorting: (sorting: DataTableSortingState) => void;
  setTotalClusterItems: (items: MessageQueueMetaRowItem[]) => void;
  finalClusterFilters: string;
  nr1: NewRelicOneApi;
}
```

##### Table Column Definitions
```typescript
const tableColumns: TableColumn[] = [
  {
    key: 'Name',
    header: 'Name',
    width: '25%',
    sortable: true,
    sortType: 'array(string)',
    renderer: NameColumnRenderer
  },
  {
    key: 'Clusters', 
    header: 'Clusters',
    width: '15%',
    sortable: true,
    sortType: 'number',
    align: 'center',
    renderer: ClusterCountRenderer
  },
  {
    key: 'Health',
    header: 'Health',
    width: '20%', 
    sortable: true,
    sortType: 'array(number)',
    renderer: HealthStatusRenderer
  },
  {
    key: 'Incoming Throughput',
    header: 'Incoming Throughput',
    width: '20%',
    sortable: true,
    sortType: 'number',
    renderer: ThroughputRenderer
  },
  {
    key: 'Outgoing Throughput',
    header: 'Outgoing Throughput', 
    width: '20%',
    sortable: true,
    sortType: 'number',
    renderer: ThroughputRenderer
  }
];
```

##### Row Click Handler
```typescript
const handleRowClick = useCallback((row: MessageQueueMetaRowItem) => {
  // Track navigation event
  trackCustomEvents('navigate_to_summary', {
    provider: row.Provider,
    account: row['Account Id'],
    clusters: row.Clusters
  });
  
  // Navigate to summary view
  navigation.openStackedNerdlet({
    id: 'message-queues.summary',
    urlState: {
      provider: row.Provider,
      account: row['Account Id'],
      accountName: row['Account Name'],
      isMetricStream: row['Is Metric Stream'],
      timeRange: getDefaultTimeRange()
    }
  });
}, []);
```

#### HomeSearchBar Component
**File**: `/common/components/home-search-bar/index.tsx`
**Purpose**: Global search functionality across all table data

##### Component Implementation
```typescript
interface HomeSearchBarProps {
  handleSearchChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  value?: string;
}

const HomeSearchBar: React.FC<HomeSearchBarProps> = ({
  handleSearchChange,
  placeholder = "Search clusters, accounts, or providers...",
  value = ""
}) => {
  const [searchTerm, setSearchTerm] = useState(value);
  const debouncedSearch = useDebounce(searchTerm, 300);
  
  useEffect(() => {
    if (debouncedSearch !== value) {
      handleSearchChange({
        target: { value: debouncedSearch }
      } as React.ChangeEvent<HTMLInputElement>);
    }
  }, [debouncedSearch, handleSearchChange, value]);
  
  return (
    <TextField
      type={TextField.TYPE.SEARCH}
      placeholder={placeholder}
      value={searchTerm}
      onChange={(event) => setSearchTerm(event.target.value)}
      className="home-search-bar"
    />
  );
};
```

#### HomeAddFilter Component
**File**: `/common/components/home-add-filter/index.tsx`
**Purpose**: Custom cluster and topic filter configuration

##### Component Structure
```typescript
interface HomeAddFilterProps {
  onSubmit: (type: string, values: string) => void;
  counts: {
    totalClusters: number;
    totalTopics: number;
  };
  accountIds: string;
  addedFilters: {
    [HOME_CLUSTER_FILTER_TEXT]: string;
    [HOME_TOPIC_FILTER_TEXT]: string;
  };
  filterClusterData: {
    topicClusters: string;
    clusterFilterClusters: string;
  };
}
```

##### Filter Configuration UI
```typescript
const AddFilterModal = ({ isOpen, onClose, onSubmit, ...props }) => {
  const [filterType, setFilterType] = useState<'cluster' | 'topic'>('cluster');
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  
  return (
    <Modal hidden={!isOpen} onClose={onClose}>
      <ModalHeader title="Add Custom Filter" />
      <ModalBody>
        {/* Filter type selection */}
        <FormGroup>
          <Label>Filter Type</Label>
          <RadioGroup
            value={filterType}
            onChange={setFilterType}
            options={[
              { label: `Clusters (${props.counts.totalClusters})`, value: 'cluster' },
              { label: `Topics (${props.counts.totalTopics})`, value: 'topic' }
            ]}
          />
        </FormGroup>
        
        {/* Value selection */}
        <FormGroup>
          <Label>{filterType === 'cluster' ? 'Select Clusters' : 'Select Topics'}</Label>
          <MultiSelect
            value={selectedValues}
            onChange={setSelectedValues}
            options={getFilterOptions(filterType, props)}
            searchable
            placeholder={`Search ${filterType}s...`}
          />
        </FormGroup>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => handleSubmit()}>Apply Filter</Button>
      </ModalFooter>
    </Modal>
  );
};
```

### Visualization Components

#### HoneyCombView Component
**File**: `/common/components/honey-comb-view/index.tsx`
**Purpose**: Hexagonal grid visualization for entity topology

##### Props Interface
```typescript
interface HoneyCombViewProps {
  entities: EntityData[];
  viewMode: 'cluster' | 'broker' | 'topic';
  metricMode: 'health' | 'alerts' | 'throughput';
  groupBy: 'type' | 'cluster' | 'provider';
  onEntitySelect: (entity: EntityData) => void;
  onEntityHover: (entity: EntityData | null) => void;
  selectedEntities: string[];
  width: number;
  height: number;
}
```

##### Hexagon Calculation Logic
```typescript
const calculateHexagonLayout = useCallback((entities: EntityData[], containerSize: Size) => {
  const hexRadius = Math.min(
    containerSize.width / Math.sqrt(entities.length * 3),
    containerSize.height / Math.sqrt(entities.length * 3),
    MAX_HEX_SIZE
  );
  
  // Use force simulation for positioning
  const simulation = d3.forceSimulation(entities)
    .force('collision', d3.forceCollide(hexRadius * 1.1))
    .force('center', d3.forceCenter(containerSize.width / 2, containerSize.height / 2))
    .force('cluster', d3.forceCluster().centers(clusterCenters))
    .stop();
    
  // Run simulation
  for (let i = 0; i < 300; ++i) simulation.tick();
  
  return entities.map(entity => ({
    ...entity,
    x: entity.x,
    y: entity.y,
    radius: calculateEntityRadius(entity, hexRadius)
  }));
}, []);
```

##### Hexagon Rendering
```typescript
const HexagonEntity = ({ entity, selected, onSelect, onHover }) => {
  const hexPath = useMemo(() => {
    const points = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = entity.x + entity.radius * Math.cos(angle);
      const y = entity.y + entity.radius * Math.sin(angle);
      points.push(`${x},${y}`);
    }
    return `M${points.join('L')}Z`;
  }, [entity]);
  
  return (
    <g className={`hexagon-entity ${selected ? 'selected' : ''}`}>
      <path
        d={hexPath}
        fill={getEntityColor(entity)}
        stroke={getEntityBorder(entity)}
        strokeWidth={selected ? 3 : 1}
        onClick={() => onSelect(entity)}
        onMouseEnter={() => onHover(entity)}
        onMouseLeave={() => onHover(null)}
      />
      <text
        x={entity.x}
        y={entity.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={Math.min(entity.radius * 0.3, 12)}
        fill="white"
      >
        {entity.name}
      </text>
    </g>
  );
};
```

#### SummaryChart Component
**File**: `/common/components/summary-chart/SummaryChart.tsx`
**Purpose**: Billboard-style metric display with time-series data

##### Component Interface
```typescript
interface SummaryChartProps {
  title: string;
  value: number | string;
  subtitle?: string;
  trend?: TrendData;
  comparison?: ComparisonData;
  status?: 'healthy' | 'warning' | 'critical';
  onClick?: () => void;
  loading?: boolean;
  error?: Error;
}

interface TrendData {
  data: { timestamp: number; value: number }[];
  direction: 'up' | 'down' | 'stable';
  percentage: number;
}
```

##### Billboard Layout
```typescript
const SummaryChart: React.FC<SummaryChartProps> = ({
  title,
  value,
  subtitle,
  trend,
  comparison,
  status,
  onClick,
  loading,
  error
}) => {
  if (loading) return <SummaryChartSkeleton />;
  if (error) return <SummaryChartError error={error} />;
  
  return (
    <div className={`summary-chart ${status || ''}`} onClick={onClick}>
      <div className="summary-chart__header">
        <h3 className="summary-chart__title">{title}</h3>
        {trend && <TrendIndicator trend={trend} />}
      </div>
      
      <div className="summary-chart__body">
        <div className="summary-chart__value">{formatValue(value)}</div>
        {subtitle && <div className="summary-chart__subtitle">{subtitle}</div>}
      </div>
      
      {comparison && (
        <div className="summary-chart__footer">
          <ComparisonIndicator comparison={comparison} />
        </div>
      )}
      
      {trend && trend.data.length > 0 && (
        <div className="summary-chart__sparkline">
          <Sparkline data={trend.data} width={100} height={30} />
        </div>
      )}
    </div>
  );
};
```

### Utility Components

#### NameColumn Component
**File**: `/common/components/name-column/index.tsx`
**Purpose**: Entity name display with provider logos and integration badges

##### Component Implementation
```typescript
interface NameColumnProps {
  accountName: string;
  accountId: string;
  provider: 'AWS_MSK' | 'CONFLUENT_CLOUD';
  isMetricStream?: boolean;
  onClick?: () => void;
}

const NameColumn: React.FC<NameColumnProps> = ({
  accountName,
  accountId, 
  provider,
  isMetricStream,
  onClick
}) => {
  const providerConfig = getProviderConfig(provider);
  
  return (
    <div className="name-column" onClick={onClick}>
      <div className="name-column__icon">
        <img 
          src={providerConfig.logo} 
          alt={providerConfig.name}
          width={24}
          height={24}
        />
      </div>
      
      <div className="name-column__content">
        <div className="name-column__primary">{accountName}</div>
        <div className="name-column__secondary">{accountId}</div>
      </div>
      
      <div className="name-column__badges">
        {isMetricStream ? (
          <Badge variant="success">Metric Stream</Badge>
        ) : (
          <Badge variant="default">Polling</Badge>
        )}
      </div>
    </div>
  );
};
```

#### CustomTooltip Component
**File**: `/common/components/custom-tooltip/index.tsx`
**Purpose**: Rich tooltips for data visualization elements

##### Tooltip Configuration
```typescript
interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  entity?: EntityData;
  position?: { x: number; y: number };
  variant?: 'chart' | 'entity' | 'metric';
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  label,
  entity,
  position,
  variant = 'chart'
}) => {
  if (!active || !payload?.length) return null;
  
  const renderTooltipContent = () => {
    switch (variant) {
      case 'entity':
        return <EntityTooltipContent entity={entity} />;
      case 'metric':
        return <MetricTooltipContent payload={payload} label={label} />;
      default:
        return <ChartTooltipContent payload={payload} label={label} />;
    }
  };
  
  return (
    <div 
      className="custom-tooltip"
      style={{
        position: 'absolute',
        left: position?.x || 0,
        top: position?.y || 0,
        transform: 'translate(-50%, -100%)'
      }}
    >
      <div className="custom-tooltip__content">
        {renderTooltipContent()}
      </div>
    </div>
  );
};
```

---

## Technical Implementation

### Data Architecture

#### NRQL Query System
**Purpose**: Centralized query management with provider-specific optimizations

##### Query Builder Architecture
```typescript
interface QueryBuilder {
  provider: ProviderType;
  integrationType: IntegrationType;
  metricId: string;
  filters: FilterSet[];
  timeRange: TimeRange;
  facets?: string[];
}

class NRQLQueryBuilder {
  private static queries = {
    aws_polling: DIM_QUERIES,
    aws_metric_streams: MTS_QUERIES, 
    confluent_cloud_polling: CONFLUENT_CLOUD_DIM_QUERIES
  };
  
  static buildQuery(config: QueryBuilder): string {
    const providerKey = `${config.provider}_${config.integrationType}`;
    const queryTemplate = this.queries[providerKey][config.metricId];
    
    if (!queryTemplate) {
      throw new Error(`Query not found: ${providerKey}.${config.metricId}`);
    }
    
    return getQueryString(
      queryTemplate,
      config.provider,
      false,
      config.filters
    );
  }
}
```

##### Query Optimization Strategies
```typescript
const queryOptimizations = {
  // Use nested queries for complex aggregations
  nestedAggregation: (baseQuery, aggregation) => ({
    select: aggregation,
    from: `(${baseQuery})`,
    isNested: true
  }),
  
  // Apply filter conditions strategically
  filterOptimization: (filters, queryType) => {
    if (queryType === 'metric_stream') {
      return getClusterGroupWhereCond(filters);
    }
    return filters.map(getAwsStreamWhere).join(' AND ');
  },
  
  // Limit data points for performance
  limitOptimization: (entityCount) => {
    if (entityCount > 1000) return MAX_LIMIT;
    if (entityCount > 100) return 500;
    return 100;
  }
};
```

#### State Management Strategy
**Purpose**: Consistent state management across all components

##### Global State Structure
```typescript
interface ApplicationState {
  // User session
  user: {
    accounts: Account[];
    permissions: Permission[];
    preferences: UserPreferences;
  };
  
  // Current context
  context: {
    currentAccount?: string;
    currentProvider?: ProviderType;
    timeRange: TimeRange;
    appliedFilters: FilterSet[];
  };
  
  // UI state
  ui: {
    loading: LoadingState;
    errors: ErrorState;
    navigation: NavigationState;
    panels: PanelState;
  };
  
  // Data cache
  cache: {
    entities: Map<string, EntityData>;
    metrics: Map<string, MetricData>;
    metadata: Map<string, any>;
  };
}
```

##### State Management Hooks
```typescript
// Global state management
const useApplicationState = () => {
  const [state, setState] = useNerdletState();
  
  const updateContext = useCallback((updates: Partial<ApplicationState['context']>) => {
    setState(prev => ({
      ...prev,
      context: { ...prev.context, ...updates }
    }));
  }, [setState]);
  
  const updateFilters = useCallback((filters: FilterSet[]) => {
    updateContext({ appliedFilters: filters });
  }, [updateContext]);
  
  return { state, updateContext, updateFilters };
};

// Entity selection management
const useEntitySelection = () => {
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [entityDetailOpen, setEntityDetailOpen] = useState(false);
  
  const selectEntity = useCallback((guid: string, exclusive = true) => {
    if (exclusive) {
      setSelectedEntities([guid]);
    } else {
      setSelectedEntities(prev => 
        prev.includes(guid) 
          ? prev.filter(id => id !== guid)
          : [...prev, guid]
      );
    }
    setEntityDetailOpen(true);
  }, []);
  
  return { selectedEntities, entityDetailOpen, selectEntity, setEntityDetailOpen };
};
```

### Performance Optimization

#### Component Optimization
**Purpose**: Minimize re-renders and improve responsiveness

##### Memoization Strategy
```typescript
// Expensive calculations
const MemoizedComponent = React.memo(({ data, filters, timeRange }) => {
  const processedData = useMemo(() => {
    return expensiveDataProcessing(data, filters, timeRange);
  }, [data, filters, timeRange]);
  
  const stableCallbacks = useMemo(() => ({
    onSelect: (entity) => handleEntitySelect(entity),
    onFilter: (filter) => handleFilterChange(filter)
  }), [handleEntitySelect, handleFilterChange]);
  
  return <ExpensiveVisualization data={processedData} {...stableCallbacks} />;
});

// Large list optimization
const VirtualizedEntityList = ({ entities, onSelect }) => {
  const listRef = useRef();
  
  const rowRenderer = useCallback(({ index, key, style }) => {
    const entity = entities[index];
    return (
      <div key={key} style={style}>
        <EntityCard entity={entity} onSelect={onSelect} />
      </div>
    );
  }, [entities, onSelect]);
  
  return (
    <AutoSizer>
      {({ height, width }) => (
        <List
          ref={listRef}
          height={height}
          width={width}
          rowCount={entities.length}
          rowHeight={64}
          rowRenderer={rowRenderer}
        />
      )}
    </AutoSizer>
  );
};
```

#### Data Loading Optimization
**Purpose**: Efficient data fetching and caching

##### Progressive Loading Strategy
```typescript
const useProgressiveDataLoading = (config: LoadingConfig) => {
  const [loadingStages, setLoadingStages] = useState({
    essential: true,    // Critical data first
    secondary: true,    // Supporting data
    detailed: true,     // Detailed metrics
    historical: true    // Time-series data
  });
  
  // Load essential data first
  const { data: essentialData } = useNerdGraphQuery({
    query: buildEssentialQuery(config),
    skip: !loadingStages.essential
  });
  
  // Load secondary data after essential is complete
  const { data: secondaryData } = useNerdGraphQuery({
    query: buildSecondaryQuery(config),
    skip: loadingStages.essential || !loadingStages.secondary
  });
  
  // Progressive loading management
  useEffect(() => {
    if (essentialData && loadingStages.essential) {
      setLoadingStages(prev => ({ ...prev, essential: false }));
    }
  }, [essentialData, loadingStages.essential]);
  
  return {
    data: { essential: essentialData, secondary: secondaryData },
    loading: Object.values(loadingStages).some(Boolean),
    loadingStages
  };
};
```

##### Intelligent Caching
```typescript
class DataCacheManager {
  private cache = new Map<string, CacheEntry>();
  private subscribers = new Map<string, Set<Function>>();
  
  // Cache with TTL and dependency tracking
  set(key: string, data: any, ttl: number = 300000, dependencies: string[] = []) {
    const entry: CacheEntry = {
      data,
      expires: Date.now() + ttl,
      dependencies,
      lastAccessed: Date.now()
    };
    
    this.cache.set(key, entry);
    this.notifySubscribers(key, data);
  }
  
  // Smart cache invalidation
  invalidate(key: string) {
    const entry = this.cache.get(key);
    if (entry) {
      // Invalidate dependent entries
      entry.dependencies.forEach(depKey => {
        this.cache.delete(depKey);
      });
      
      // Find entries that depend on this key
      this.cache.forEach((value, cacheKey) => {
        if (value.dependencies.includes(key)) {
          this.cache.delete(cacheKey);
        }
      });
    }
    
    this.cache.delete(key);
  }
  
  // Subscribe to cache changes
  subscribe(key: string, callback: Function) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(callback);
    
    return () => {
      this.subscribers.get(key)?.delete(callback);
    };
  }
}
```

### Error Handling Framework

#### Error Boundary Implementation
**Purpose**: Graceful error handling with recovery options

##### Application Error Boundary
```typescript
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  errorId?: string;
}

class ApplicationErrorBoundary extends React.Component<any, ErrorBoundaryState> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      errorId: generateErrorId()
    };
  }
  
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to New Relic
    instrumentation.noticeError(error, {
      errorInfo,
      errorId: this.state.errorId,
      userAgent: navigator.userAgent,
      url: window.location.href
    });
    
    this.setState({ errorInfo });
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          errorId={this.state.errorId}
          onRetry={() => this.setState({ hasError: false })}
          onReport={() => this.reportError()}
        />
      );
    }
    
    return this.props.children;
  }
}
```

##### Error Classification and Recovery
```typescript
const errorClassification = {
  NETWORK_ERROR: {
    retryable: true,
    maxRetries: 3,
    backoffStrategy: 'exponential',
    fallback: 'cached_data'
  },
  
  PERMISSION_ERROR: {
    retryable: false,
    action: 'redirect_to_home',
    message: 'You do not have permission to view this data.'
  },
  
  DATA_VALIDATION_ERROR: {
    retryable: false,
    action: 'show_error_detail',
    recovery: 'reset_filters'
  },
  
  COMPONENT_ERROR: {
    retryable: true,
    maxRetries: 1,
    fallback: 'error_component'
  }
};

const useErrorRecovery = () => {
  const [retryCount, setRetryCount] = useState(0);
  
  const handleError = useCallback((error: Error, context: string) => {
    const errorType = classifyError(error);
    const config = errorClassification[errorType];
    
    if (config.retryable && retryCount < config.maxRetries) {
      setTimeout(() => {
        setRetryCount(prev => prev + 1);
        // Trigger retry logic
      }, calculateBackoff(retryCount, config.backoffStrategy));
    } else {
      // Execute fallback strategy
      executeFallback(config.fallback || config.action);
    }
  }, [retryCount]);
  
  return { handleError, retryCount };
};
```

### Security Implementation

#### Data Sanitization
**Purpose**: Prevent XSS and ensure data integrity

##### Input Sanitization
```typescript
const sanitizeFilters = (filters: any[]): FilterSet[] => {
  return filters.map(filter => ({
    id: DOMPurify.sanitize(filter.id),
    value: Array.isArray(filter.value) 
      ? filter.value.map(v => DOMPurify.sanitize(String(v)))
      : DOMPurify.sanitize(String(filter.value)),
    operator: validateOperator(filter.operator)
  }));
};

const validateNRQLQuery = (query: string): boolean => {
  // Whitelist allowed NRQL keywords and patterns
  const allowedPatterns = [
    /^SELECT\s+/i,
    /\s+FROM\s+/i,
    /\s+WHERE\s+/i,
    /\s+FACET\s+/i,
    /\s+LIMIT\s+\d+/i
  ];
  
  const forbiddenPatterns = [
    /DROP\s+/i,
    /DELETE\s+/i,
    /INSERT\s+/i,
    /UPDATE\s+/i,
    /<script/i,
    /javascript:/i
  ];
  
  return allowedPatterns.every(pattern => pattern.test(query)) &&
         !forbiddenPatterns.some(pattern => pattern.test(query));
};
```

#### Access Control
**Purpose**: Ensure users only access authorized data

##### Permission Validation
```typescript
const usePermissionValidation = () => {
  const checkAccountAccess = useCallback(async (accountId: string) => {
    try {
      const permissions = await NerdGraphQuery.query({
        query: `{
          actor {
            accounts(filter: {id: "${accountId}"}) {
              id
              name
            }
          }
        }`
      });
      
      return permissions.data.actor.accounts.length > 0;
    } catch (error) {
      console.error('Permission check failed:', error);
      return false;
    }
  }, []);
  
  return { checkAccountAccess };
};
```

---

This ultra-detailed specification covers every screen, component, control, and interaction in the Message Queues application. The document provides comprehensive implementation details, technical specifications, and user interaction patterns needed for development, testing, and maintenance of the application.