# NRQL Validation Queries for AWS MSK in Message Queues UI

## Table of Contents
1. [Basic Validation](#basic-validation)
2. [Cluster Monitoring](#cluster-monitoring)
3. [Broker Performance](#broker-performance)
4. [Topic Analysis](#topic-analysis)
5. [Consumer Lag Monitoring](#consumer-lag-monitoring)
6. [Alert Conditions](#alert-conditions)
7. [Dashboards](#dashboards)
8. [Troubleshooting Queries](#troubleshooting-queries)

## Basic Validation

### 1. Verify Events Are Arriving
```sql
FROM MessageQueueSample 
SELECT count(*) 
WHERE provider = 'AwsMsk' 
SINCE 1 hour ago
```

### 2. Check Entity Types Distribution
```sql
FROM MessageQueueSample 
SELECT count(*) 
WHERE provider = 'AwsMsk' 
FACET entity.type 
SINCE 1 hour ago
```

### 3. List All MSK Clusters
```sql
FROM MessageQueueSample 
SELECT uniques(entity.name) 
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKCLUSTER' 
SINCE 1 day ago
```

### 4. Verify Queue Types
```sql
FROM MessageQueueSample 
SELECT count(*) 
WHERE provider = 'AwsMsk' 
FACET queue.type 
SINCE 1 hour ago
```

## Cluster Monitoring

### 1. Cluster Health Overview
```sql
FROM MessageQueueSample 
SELECT 
  latest(queue.activeControllers) as 'Active Controllers',
  latest(queue.offlinePartitions) as 'Offline Partitions',
  latest(queue.globalPartitions) as 'Total Partitions',
  latest(queue.brokerCount) as 'Broker Count'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKCLUSTER'
FACET entity.name 
SINCE 30 minutes ago
```

### 2. Cluster Partition Status
```sql
FROM MessageQueueSample 
SELECT 
  latest(queue.globalPartitions) as 'Total',
  latest(queue.offlinePartitions) as 'Offline',
  latest(queue.underReplicatedPartitions) as 'Under Replicated'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKCLUSTER'
FACET entity.name 
SINCE 1 hour ago
TIMESERIES
```

### 3. Multi-Region Cluster View
```sql
FROM MessageQueueSample 
SELECT uniqueCount(entity.name) as 'Clusters'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKCLUSTER'
FACET awsRegion 
SINCE 1 day ago
```

### 4. Cluster State Changes
```sql
FROM MessageQueueSample 
SELECT 
  latest(clusterState) as 'State',
  latest(queue.activeControllers) as 'Controllers'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKCLUSTER'
AND clusterState != 'ACTIVE'
FACET entity.name 
SINCE 1 hour ago
```

## Broker Performance

### 1. Broker CPU and Memory
```sql
FROM MessageQueueSample 
SELECT 
  average(queue.cpuPercent) as 'CPU %',
  average(queue.memoryPercent) as 'Memory %',
  average(queue.diskUsedPercent) as 'Disk %'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKBROKER'
FACET entity.name 
SINCE 1 hour ago
```

### 2. Broker Throughput
```sql
FROM MessageQueueSample 
SELECT 
  average(queue.bytesInPerSecond)/1000000 as 'MB/s In',
  average(queue.bytesOutPerSecond)/1000000 as 'MB/s Out',
  average(queue.messagesPerSecond) as 'Messages/s'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKBROKER'
FACET entity.name 
SINCE 1 hour ago
TIMESERIES
```

### 3. Network Errors
```sql
FROM MessageQueueSample 
SELECT 
  sum(queue.networkRxDropped) as 'RX Dropped',
  sum(queue.networkTxDropped) as 'TX Dropped',
  sum(queue.networkRxErrors) as 'RX Errors',
  sum(queue.networkTxErrors) as 'TX Errors'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKBROKER'
AND (queue.networkRxDropped > 0 OR queue.networkTxDropped > 0)
FACET entity.name 
SINCE 1 hour ago
```

### 4. Broker Performance by Cluster
```sql
FROM MessageQueueSample 
SELECT 
  average(queue.cpuPercent) as 'Avg CPU %',
  max(queue.cpuPercent) as 'Max CPU %',
  average(queue.bytesInPerSecond)/1000000 as 'Avg MB/s'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKBROKER'
FACET awsMskClusterName 
SINCE 1 hour ago
```

### 5. Top Brokers by Load
```sql
FROM MessageQueueSample 
SELECT 
  average(queue.cpuPercent) as 'CPU %',
  average(queue.bytesInPerSecond + queue.bytesOutPerSecond)/1000000 as 'Total MB/s'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKBROKER'
FACET entity.name 
SINCE 1 hour ago
LIMIT 10
```

## Topic Analysis

### 1. Topic Throughput Overview
```sql
FROM MessageQueueSample 
SELECT 
  sum(queue.messagesPerSecond) as 'Total Messages/s',
  sum(queue.bytesInPerSecond)/1000000 as 'Total MB/s In',
  sum(queue.bytesOutPerSecond)/1000000 as 'Total MB/s Out'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKTOPIC'
FACET awsMskClusterName 
SINCE 1 hour ago
```

### 2. Top Topics by Message Rate
```sql
FROM MessageQueueSample 
SELECT 
  average(queue.messagesPerSecond) as 'Messages/s',
  average(queue.bytesInPerSecond)/1000 as 'KB/s In'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKTOPIC'
FACET entity.name 
SINCE 1 hour ago
LIMIT 20
```

### 3. Topic Partition Distribution
```sql
FROM MessageQueueSample 
SELECT 
  latest(queue.partitionCount) as 'Partitions',
  latest(queue.replicationFactor) as 'Replication',
  latest(queue.underReplicatedPartitions) as 'Under Replicated'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKTOPIC'
FACET entity.name 
SINCE 1 hour ago
```

### 4. Topic Retention Analysis
```sql
FROM MessageQueueSample 
SELECT 
  latest(retentionHours) as 'Retention Hours',
  latest(queue.messagesPerSecond) as 'Messages/s'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKTOPIC'
AND retentionHours IS NOT NULL
FACET entity.name 
SINCE 1 hour ago
```

## Consumer Lag Monitoring

### 1. Consumer Lag Overview
```sql
FROM MessageQueueSample 
SELECT 
  sum(queue.consumerLag) as 'Total Lag',
  average(queue.consumerLag) as 'Avg Lag',
  max(queue.consumerLag) as 'Max Lag'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKTOPIC'
AND queue.consumerLag > 0
SINCE 1 hour ago
TIMESERIES
```

### 2. Topics with High Consumer Lag
```sql
FROM MessageQueueSample 
SELECT 
  latest(queue.consumerLag) as 'Consumer Lag',
  latest(queue.messagesPerSecond) as 'Messages/s',
  latest(consumerGroupCount) as 'Consumer Groups'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKTOPIC'
AND queue.consumerLag > 10000
FACET entity.name 
SINCE 30 minutes ago
LIMIT 20
```

### 3. Consumer Lag Trend
```sql
FROM MessageQueueSample 
SELECT 
  average(queue.consumerLag) as 'Lag'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKTOPIC'
AND queue.consumerLag > 0
FACET entity.name 
SINCE 24 hours ago
TIMESERIES 1 hour
```

### 4. Consumer Group Analysis
```sql
FROM MessageQueueSample 
SELECT 
  latest(consumerGroups) as 'Consumer Groups',
  latest(queue.consumerLag) as 'Lag',
  latest(queue.messagesPerSecond) as 'Messages/s'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKTOPIC'
AND consumerGroupCount > 0
FACET entity.name 
SINCE 1 hour ago
```

## Alert Conditions

### 1. Critical: Offline Partitions
```sql
FROM MessageQueueSample 
SELECT latest(queue.offlinePartitions) 
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKCLUSTER'
AND queue.offlinePartitions > 0
```

### 2. Warning: High CPU Usage
```sql
FROM MessageQueueSample 
SELECT average(queue.cpuPercent) 
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKBROKER'
AND queue.cpuPercent > 80
FACET entity.name
```

### 3. Critical: High Consumer Lag
```sql
FROM MessageQueueSample 
SELECT latest(queue.consumerLag) 
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKTOPIC'
AND queue.consumerLag > 100000
```

### 4. Warning: Disk Usage
```sql
FROM MessageQueueSample 
SELECT average(queue.diskUsedPercent) 
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKBROKER'
AND queue.diskUsedPercent > 85
```

### 5. Critical: No Active Controllers
```sql
FROM MessageQueueSample 
SELECT latest(queue.activeControllers) 
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKCLUSTER'
AND queue.activeControllers < 1
```

## Dashboards

### 1. Cluster Overview Dashboard
```sql
-- Widget 1: Cluster Health
FROM MessageQueueSample 
SELECT 
  latest(queue.activeControllers),
  latest(queue.offlinePartitions),
  latest(queue.brokerCount)
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKCLUSTER'
FACET entity.name

-- Widget 2: Cluster Throughput
FROM MessageQueueSample 
SELECT sum(queue.bytesInPerSecond)/1000000 as 'MB/s'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKBROKER'
FACET awsMskClusterName
TIMESERIES

-- Widget 3: Partition Distribution
FROM MessageQueueSample 
SELECT 
  latest(queue.globalPartitions) as 'Total',
  latest(queue.offlinePartitions) as 'Offline'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKCLUSTER'
FACET entity.name
```

### 2. Broker Performance Dashboard
```sql
-- Widget 1: CPU Usage Heatmap
FROM MessageQueueSample 
SELECT average(queue.cpuPercent) 
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKBROKER'
FACET entity.name
TIMESERIES

-- Widget 2: Memory and Disk
FROM MessageQueueSample 
SELECT 
  average(queue.memoryPercent) as 'Memory %',
  average(queue.diskUsedPercent) as 'Disk %'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKBROKER'
FACET entity.name

-- Widget 3: Network Performance
FROM MessageQueueSample 
SELECT 
  sum(queue.bytesInPerSecond + queue.bytesOutPerSecond)/1000000 as 'Total MB/s'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKBROKER'
FACET entity.name
TIMESERIES
```

### 3. Topic Analysis Dashboard
```sql
-- Widget 1: Top Topics by Volume
FROM MessageQueueSample 
SELECT average(queue.messagesPerSecond) 
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKTOPIC'
FACET entity.name
LIMIT 10

-- Widget 2: Consumer Lag Tracking
FROM MessageQueueSample 
SELECT max(queue.consumerLag) 
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKTOPIC'
FACET entity.name
TIMESERIES

-- Widget 3: Topic Throughput Trends
FROM MessageQueueSample 
SELECT 
  sum(queue.bytesInPerSecond)/1000000 as 'In MB/s',
  sum(queue.bytesOutPerSecond)/1000000 as 'Out MB/s'
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKTOPIC'
TIMESERIES
```

## Troubleshooting Queries

### 1. Find Missing Data
```sql
-- Check for gaps in data
FROM MessageQueueSample 
SELECT count(*) 
WHERE provider = 'AwsMsk'
TIMESERIES 1 minute 
SINCE 1 hour ago

-- Find entities with no recent data
FROM MessageQueueSample 
SELECT latest(timestamp) 
WHERE provider = 'AwsMsk'
FACET entity.name 
SINCE 1 day ago
```

### 2. Verify Field Presence
```sql
-- Check which fields are present
FROM MessageQueueSample 
SELECT keyset() 
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKBROKER'
LIMIT 1

-- Find events missing required fields
FROM MessageQueueSample 
SELECT count(*) 
WHERE provider = 'AwsMsk' 
AND (queue.name IS NULL OR entity.type IS NULL)
SINCE 1 hour ago
```

### 3. Data Quality Checks
```sql
-- Check for duplicate events
FROM MessageQueueSample 
SELECT count(*), uniqueCount(timestamp) 
WHERE provider = 'AwsMsk'
FACET entity.name 
SINCE 1 hour ago

-- Find anomalous metric values
FROM MessageQueueSample 
SELECT * 
WHERE provider = 'AwsMsk' 
AND (queue.cpuPercent > 100 OR queue.cpuPercent < 0)
SINCE 1 hour ago
```

### 4. Relationship Validation
```sql
-- Verify cluster-broker relationships
FROM MessageQueueSample 
SELECT uniqueCount(entity.name) 
WHERE provider = 'AwsMsk' 
AND entity.type = 'AWSMSKBROKER'
FACET awsMskClusterName 
SINCE 1 hour ago

-- Find orphaned entities
FROM MessageQueueSample 
SELECT entity.name, entity.type 
WHERE provider = 'AwsMsk' 
AND awsMskClusterName IS NULL
SINCE 1 hour ago
```

## Usage Tips

1. **Time Windows**: Adjust `SINCE` clauses based on your data retention and query needs
2. **FACET Limits**: Add `LIMIT` to FACET queries to control result size
3. **Performance**: Use `TIMESERIES` with appropriate buckets for large time ranges
4. **Filtering**: Add additional WHERE clauses to filter by region, environment, or tags
5. **Aggregation**: Use appropriate aggregation functions (average, sum, max) based on metric type

## Custom Query Templates

### Filter by Environment
```sql
FROM MessageQueueSample 
SELECT ... 
WHERE provider = 'AwsMsk' 
AND tags.environment = 'production'
```

### Filter by Region
```sql
FROM MessageQueueSample 
SELECT ... 
WHERE provider = 'AwsMsk' 
AND awsRegion = 'us-east-1'
```

### Filter by Cluster
```sql
FROM MessageQueueSample 
SELECT ... 
WHERE provider = 'AwsMsk' 
AND awsMskClusterName = 'production-msk-cluster'
```