# New Relic Message Queues & Streaming - Ultimate Data Model Specification v3.0
## Aligned with New Relic UI/UX Standards

---

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [UI Architecture & Design System](#ui-architecture--design-system)
3. [Dashboard Organization](#dashboard-organization)
4. [Executive Overview Dashboard](#executive-overview-dashboard)
5. [Consumer Groups Dashboard](#consumer-groups-dashboard)
6. [Infrastructure & Cost Dashboard](#infrastructure--cost-dashboard)
7. [Topics & Partitions Dashboard](#topics--partitions-dashboard)
8. [Anomaly Detection & Alerts Dashboard](#anomaly-detection--alerts-dashboard)
9. [SLA & Compliance Dashboard](#sla--compliance-dashboard)
10. [Data Model & Entity Specifications](#data-model--entity-specifications)
11. [API & Integration Specifications](#api--integration-specifications)

---

## Platform Overview

### Vision
The New Relic Message Queues & Streaming Platform provides enterprise-grade observability for Kafka and other streaming platforms, following New Relic's established UI/UX patterns for infrastructure monitoring.

### Key Principles
- **Entity-Centric Design**: All monitoring revolves around MESSAGE_QUEUE entities
- **Golden Signals Focus**: Throughput, Latency, Errors, Saturation
- **Business Value Metrics**: Cost per message, efficiency ratios, SLA tracking
- **Predictive Intelligence**: ML-powered anomaly detection and capacity planning
- **Multi-Provider Support**: Unified experience across AWS MSK, Confluent Cloud, and self-managed Kafka

### Supported Entity Types
```
MESSAGE_QUEUE_CLUSTER
MESSAGE_QUEUE_BROKER  
MESSAGE_QUEUE_TOPIC
MESSAGE_QUEUE_QUEUE
MESSAGE_QUEUE_CONSUMER_GROUP
```

---

## UI Architecture & Design System

### Design Patterns
Following New Relic's standard infrastructure monitoring patterns:

#### 1. Layout Structure
- **Navigation**: Left sidebar with dashboard sections
- **Header**: Account selector, time range picker, refresh controls
- **Content Area**: Responsive grid layout (12-column system)
- **Entity Inspector**: Right sidebar for drill-downs

#### 2. Color Scheme
```css
/* Health Status Colors */
--health-excellent: #00C781;  /* 90-100 score */
--health-good: #3CA8FF;       /* 70-89 score */
--health-fair: #F5A623;       /* 50-69 score */
--health-poor: #FF6384;       /* 30-49 score */
--health-critical: #D0011B;   /* 0-29 score */

/* Metric Type Colors */
--metric-throughput: #00C9A7;
--metric-latency: #7F58C9;
--metric-errors: #FF6384;
--metric-saturation: #F5A623;
```

#### 3. Widget Types
- **Billboard**: Key metrics with thresholds
- **Line Chart**: Time-series trends
- **Area Chart**: Stacked metrics
- **Heatmap**: Multi-dimensional analysis
- **Table**: Detailed entity listings
- **Pie Chart**: Distribution analysis
- **Bar Chart**: Comparative metrics
- **Histogram**: Distribution patterns

#### 4. Interaction Patterns
- **Hover**: Show detailed tooltips
- **Click**: Open entity details
- **Drag**: Select time ranges
- **Filter**: Apply dimension filters
- **Export**: Download data/images

---

## Dashboard Organization

### Dashboard Hierarchy
```
Message Queues & Streaming Platform/
├── Executive Overview
├── Consumer Groups
├── Infrastructure & Cost
├── Topics & Partitions
├── Anomaly Detection & Alerts
└── SLA & Compliance
```

### Navigation Structure
- **Breadcrumbs**: Platform > Dashboard > Entity
- **Tab Navigation**: Switch between dashboard pages
- **Entity Links**: Deep-link to specific entities
- **Time Sync**: All widgets share time range

---

## Executive Overview Dashboard

### Purpose
High-level business metrics and platform health for executives and platform owners.

### Layout (12-column grid)

#### Row 1: Business KPIs (Height: 2 units)
```
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│  Platform   │  Message    │   Active    │   Total     │Infrastructure│    SLA      │
│   Health    │ Throughput  │ Consumer    │  Consumer   │ Cost/Hour   │ Compliance  │
│   Score     │             │  Groups     │    Lag      │             │             │
│ (2 cols)    │ (2 cols)    │ (2 cols)    │ (2 cols)    │ (2 cols)    │ (2 cols)    │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
```

##### Platform Health Score
- **Widget Type**: Billboard
- **Metrics**: `average(cluster.health.score)`
- **Thresholds**: Critical < 60, Warning < 80
- **Color Coding**: Health status colors

##### Message Throughput
- **Widget Type**: Billboard
- **Metrics**: `rate(sum(cluster.messagesInPerSecond + cluster.messagesOutPerSecond), 1 second)`
- **Format**: Human-readable (K/M/B messages/sec)

##### Active Consumer Groups
- **Widget Type**: Billboard
- **Metrics**: `uniqueCount(entityGuid) WHERE entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP'`

##### Total Consumer Lag
- **Widget Type**: Billboard
- **Metrics**: `sum(consumerGroup.totalLag)`
- **Thresholds**: Warning > 10K, Critical > 50K

##### Infrastructure Cost/Hour
- **Widget Type**: Billboard
- **Metrics**: Calculated based on broker count and cloud pricing
- **Format**: Currency with 2 decimals

##### SLA Compliance
- **Widget Type**: Billboard
- **Metrics**: `percentage(count(*), WHERE consumerGroup.totalLag < 5000)`
- **Thresholds**: Critical < 95%, Warning < 98%

#### Row 2: Trend Analysis (Height: 3 units)
```
┌────────────────────┬────────────────────┬────────────────────┐
│ Message Throughput │  Consumer Lag      │  Infrastructure    │
│      Trend         │ Trend by Group     │   Utilization      │
│    (4 cols)        │    (4 cols)        │    (4 cols)        │
└────────────────────┴────────────────────┴────────────────────┘
```

##### Message Throughput Trend
- **Widget Type**: Area Chart
- **Series**: Messages In, Messages Out
- **Time Range**: 2 hours
- **Aggregation**: 5-minute average

##### Consumer Lag Trend by Group
- **Widget Type**: Line Chart
- **Series**: Top 5 consumer groups by lag
- **Legend**: Enabled
- **Interactive**: Click to filter

##### Infrastructure Utilization
- **Widget Type**: Line Chart
- **Series**: CPU %, Memory %, Disk %
- **Y-Axis**: 0-100%
- **Baseline**: Show capacity thresholds

#### Row 3: Status Tables (Height: 3 units)
```
┌──────────────────────────────┬──────────────────────────────┐
│      Cluster Status          │  Top Consumer Groups by Lag │
│        (6 cols)              │         (6 cols)             │
└──────────────────────────────┴──────────────────────────────┘
```

---

## Consumer Groups Dashboard

### Purpose
Detailed monitoring of consumer group health, lag analysis, and performance optimization.

### Layout

#### Row 1: Consumer Overview (Height: 3 units)
```
┌──────────┬─────────────────────────┬────────────────────┐
│Consumer  │  Total Consumer Lag     │  Consumer Group    │
│ States   │    Distribution         │   Health Score     │
│(3 cols)  │      (5 cols)           │    (4 cols)        │
└──────────┴─────────────────────────┴────────────────────┘
```

##### Consumer Group States
- **Widget Type**: Pie Chart
- **Dimensions**: STABLE, REBALANCING, DEAD, EMPTY
- **Colors**: Status-specific colors

##### Total Consumer Lag Distribution
- **Widget Type**: Histogram
- **Buckets**: 20 buckets, logarithmic scale
- **X-Axis**: Lag (messages)
- **Y-Axis**: Count of consumer groups

##### Consumer Group Health Score
- **Widget Type**: Billboard
- **Metrics**: 
  - Lag Stability Score
  - Percentage of Healthy Groups
- **Thresholds**: Based on lag and stability

#### Row 2: Lag Analysis (Height: 4 units)
```
┌────────────────────────────────────┬────────────────────┐
│      Consumer Lag Heatmap          │  Lag Trend         │
│         (8 cols)                   │   Analysis         │
│                                    │   (4 cols)         │
└────────────────────────────────────┴────────────────────┘
```

##### Consumer Lag Heatmap
- **Widget Type**: Heatmap
- **X-Axis**: Consumer Groups
- **Y-Axis**: Topics
- **Color Scale**: Green (0) to Red (high lag)
- **Interactive**: Click to drill down

##### Lag Trend Analysis
- **Widget Type**: Line Chart
- **Series**: Average Lag, Max Lag
- **Time Range**: 4 hours
- **Annotations**: Show rebalancing events

#### Row 3: Performance Details (Height: 4 units)
```
┌────────────────────────────────────────────────────────┐
│         Consumer Group Performance Details             │
│                    (12 cols)                           │
└────────────────────────────────────────────────────────┘
```

##### Consumer Group Performance Table
- **Widget Type**: Table
- **Columns**:
  - Group Name
  - Members
  - Total Lag
  - Max Lag
  - Messages/sec
  - State
  - Lag Trend (↑↓→)
- **Sorting**: By Total Lag (descending)
- **Row Actions**: Click to open detail panel

---

## Infrastructure & Cost Dashboard

### Purpose
Resource utilization, cost analytics, and optimization opportunities.

### Layout

#### Row 1: Cost Overview (Height: 3 units)
```
┌────────────────┬────────────────┬────────────────────┐
│Infrastructure  │Cost Efficiency │Resource Utilization│
│Cost Breakdown  │   Metrics      │   Efficiency       │
│   (4 cols)     │   (4 cols)     │    (4 cols)        │
└────────────────┴────────────────┴────────────────────┘
```

##### Infrastructure Cost Breakdown
- **Widget Type**: Pie Chart
- **Segments**: Compute, Storage, Network
- **Calculation**: Based on cloud provider pricing

##### Cost Efficiency Metrics
- **Widget Type**: Billboard
- **Metrics**:
  - Messages per Dollar
  - MB per Dollar
- **Trend**: Show 24h comparison

##### Resource Utilization Efficiency
- **Widget Type**: Billboard
- **Metrics**: Avg CPU %, Memory %, Disk %
- **Thresholds**: Warning > 80%, Critical > 90%

#### Row 2: Broker Health Matrix (Height: 4 units)
```
┌────────────────────────────────────┬────────────────────┐
│      Broker Health Matrix          │ Capacity Planning  │
│         (8 cols)                   │    Insights        │
│                                    │   (4 cols)         │
└────────────────────────────────────┴────────────────────┘
```

##### Broker Health Matrix
- **Widget Type**: Table
- **Real-time Updates**: Every 30 seconds
- **Color Coding**: Based on resource usage
- **Columns**: Broker, CPU%, Memory%, Disk%, Partitions

##### Capacity Planning Insights
- **Widget Type**: Bar Chart
- **Metrics**: Peak usage by resource type
- **Grouping**: By broker
- **Highlight**: Resources > 80%

---

## Topics & Partitions Dashboard

### Purpose
Topic-level performance analysis and partition distribution monitoring.

### Key Metrics
- **Topic Throughput**: Messages and bytes in/out
- **Partition Distribution**: Balance across brokers
- **Replication Health**: Under-replicated partitions
- **Topic Growth**: Size and message rate trends

---

## Anomaly Detection & Alerts Dashboard

### Purpose
ML-powered anomaly detection and intelligent alerting.

### Key Features
- **Anomaly Score**: Real-time anomaly detection
- **Predictive Analytics**: Capacity predictions
- **Alert Correlation**: Group related alerts
- **Root Cause Analysis**: Automated RCA

---

## SLA & Compliance Dashboard

### Purpose
Service level agreement tracking and compliance monitoring.

### Key Metrics
- **Uptime SLA**: Cluster availability percentage
- **Performance SLA**: Latency and throughput targets
- **Lag SLA**: Consumer lag thresholds
- **Compliance Status**: Policy adherence

---

## Data Model & Entity Specifications

### Entity Hierarchy
```
MESSAGE_QUEUE_CLUSTER
├── MESSAGE_QUEUE_BROKER
├── MESSAGE_QUEUE_TOPIC
│   └── Partitions (embedded)
└── MESSAGE_QUEUE_CONSUMER_GROUP
```

### Entity GUID Format
```
{accountId}|INFRA|{entityType}|{uniqueHash}
```

### Common Entity Attributes
```typescript
interface MessageQueueEntity {
  // Identity
  entityGuid: string;
  entityType: 'MESSAGE_QUEUE_CLUSTER' | 'MESSAGE_QUEUE_BROKER' | 'MESSAGE_QUEUE_TOPIC' | 'MESSAGE_QUEUE_CONSUMER_GROUP';
  entityName: string;
  displayName: string;
  
  // Metadata
  provider: 'kafka' | 'rabbitmq' | 'sqs';
  environment: 'production' | 'staging' | 'development';
  region: string;
  tags: Record<string, string>;
  
  // Timestamps
  createdAt: string;
  lastSeenAt: string;
  
  // Relationships
  relationships: EntityRelationship[];
}
```

### Event Types
- **KafkaClusterSample**: Cluster-level metrics
- **KafkaBrokerSample**: Broker-level metrics
- **KafkaTopicSample**: Topic-level metrics
- **KafkaConsumerSample**: Consumer group metrics

### Metric Categories

#### Golden Signals
1. **Throughput**: Messages/bytes per second
2. **Latency**: Request processing time
3. **Errors**: Failed requests, offline partitions
4. **Saturation**: Resource utilization

#### Business Metrics
1. **Cost**: Infrastructure spend
2. **Efficiency**: Messages per dollar
3. **SLA**: Compliance percentage
4. **Growth**: Capacity trends

---

## API & Integration Specifications

### Data Collection Methods

#### 1. Infrastructure Agent (nri-kafka)
- **Frequency**: 30 seconds
- **Protocol**: JMX
- **Metrics**: Broker and topic metrics

#### 2. Event API
- **Endpoint**: `https://insights-collector.newrelic.com/v1/accounts/{accountId}/events`
- **Authentication**: API Key
- **Batch Size**: 1000 events

#### 3. NerdGraph API
- **Endpoint**: `https://api.newrelic.com/graphql`
- **Operations**: Entity queries, metric queries
- **Rate Limit**: 2000 requests/minute

### Integration Patterns

#### Producer Integration
```typescript
// APM agent integration
newrelic.recordMetric('Custom/Kafka/Producer/MessagesProduced', messageCount);
newrelic.recordMetric('Custom/Kafka/Producer/BytesProduced', byteCount);
```

#### Consumer Integration
```typescript
// APM agent integration
newrelic.recordMetric('Custom/Kafka/Consumer/MessagesConsumed', messageCount);
newrelic.recordMetric('Custom/Kafka/Consumer/ConsumerLag', currentLag);
```

### Alerting Integration
- **Alert Policies**: Threshold and anomaly-based
- **Notification Channels**: Email, Slack, PagerDuty
- **Incident Correlation**: Automatic grouping

---

## Implementation Guidelines

### Performance Requirements
- **Dashboard Load Time**: < 3 seconds
- **Widget Refresh**: Real-time (30s) or near real-time (1m)
- **Data Retention**: 13 months
- **Query Performance**: < 500ms for standard queries

### Scalability Targets
- **Clusters**: Up to 1000 per account
- **Brokers**: Up to 10,000 total
- **Topics**: Up to 100,000 total
- **Metrics**: 1M+ data points/minute

### Security & Compliance
- **Data Encryption**: In transit and at rest
- **Access Control**: Role-based permissions
- **Audit Logging**: All configuration changes
- **Compliance**: SOC2, GDPR, HIPAA ready

---

This specification aligns with New Relic's established UI/UX patterns while implementing the comprehensive monitoring capabilities outlined in the product vision.