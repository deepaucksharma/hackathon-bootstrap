# Kafka Metrics Verification Report

**Generated:** 2025-06-05T09:11:16.266Z

**Account ID:** 3026020

**Time Range:** 1 hour ago

## Summary

- Total Queries: 55
- Successful: 55
- With Data: 49
- Failed: 0

## Health Scores

- **dataAvailability:** 100.0% ✅
- **metricCompleteness:** 89.1% ⚠️
- **dataFreshness:** 50.0% ❌
- **entityRelationships:** 100.0% ✅
- **overall:** 86.7% ⚠️

## Recommendations

### 🟡 Data Freshness

Some data sources have stale data (>5 minutes old).

- Check polling intervals and network connectivity


## Category Results

### MSK Polling Data (9/9)

| Query | Status | Result Count |
|-------|--------|-------------|
| Cluster Sample Data Exists | ✅ | 112 |
| All Cluster Metrics Present | ✅ | 1 |
| Broker Sample Data Exists | ✅ | 559 |
| All Broker Metrics Present | ✅ | 1 |
| Topic Sample Data Exists | ✅ | 336 |
| Topic Metrics Present | ✅ | 1 |
| Cluster Attributes Present | ✅ | 1 |
| Broker Attributes Present | ✅ | 1 |
| Topic Attributes Present | ✅ | 1 |

### Metric Streams Data (5/5)

| Query | Status | Result Count |
|-------|--------|-------------|
| Metric Events Exist | ✅ | 34460 |
| Cluster-Level Metrics | ✅ | 1 |
| Broker-Level Metrics | ✅ | 1 |
| Topic-Level Metrics | ✅ | 1 |
| Metric Streams Attributes | ✅ | 1 |

### Standard Kafka Integration (0/5)

| Query | Status | Result Count |
|-------|--------|-------------|
| Broker Sample Data | ⚪ | - |
| Topic Sample Data | ⚪ | - |
| Offset Sample Data | ⚪ | - |
| Producer Sample Data | ⚪ | - |
| Consumer Sample Data | ⚪ | - |

### Data Quality (4/5)

| Query | Status | Result Count |
|-------|--------|-------------|
| Check for Null Values | ✅ | 1 |
| Data Freshness (Polling) | ✅ | 2 |
| Data Freshness (Metric Streams) | ⚪ | - |
| Tag Completeness | ✅ | 2 |
| Data Consistency Check | ✅ | 2 |

### Throughput Calculations (4/4)

| Query | Status | Result Count |
|-------|--------|-------------|
| Cluster Throughput Summary | ✅ | 2 |
| Throughput Aggregation | ✅ | 1 |
| Topic Throughput | ✅ | 6 |
| Message Rates | ✅ | 9.763771164200293 |

### Entity Relationships (3/3)

| Query | Status | Result Count |
|-------|--------|-------------|
| Brokers per Cluster | ✅ | 2 |
| Topics per Cluster | ✅ | 2 |
| Entity GUIDs Present | ✅ | 1 |

### Health Metrics (3/3)

| Query | Status | Result Count |
|-------|--------|-------------|
| Cluster Health Status | ✅ | 2 |
| Broker Health Status | ✅ | 4 |
| Unhealthy Cluster Count | ✅ | 1 |

### Time Series Data (3/3)

| Query | Status | Result Count |
|-------|--------|-------------|
| Throughput Time Series | ✅ | 24 |
| Message Rate Time Series | ✅ | 12 |
| Partition Count Trend | ✅ | 6 |

### Account Aggregation (2/2)

| Query | Status | Result Count |
|-------|--------|-------------|
| Account Summary | ✅ | 1 |
| Account Health Summary | ✅ | 1 |

### Performance Metrics (2/2)

| Query | Status | Result Count |
|-------|--------|-------------|
| Data Volume Check | ✅ | 1 |
| Large Dataset Check | ✅ | 2 |

### Edge Cases (3/3)

| Query | Status | Result Count |
|-------|--------|-------------|
| Idle Topics | ✅ | 1 |
| Stale Data Detection | ✅ | 2 |
| Partial Data Check | ✅ | 1 |

### Top N Analysis (2/2)

| Query | Status | Result Count |
|-------|--------|-------------|
| Top 10 Topics by Throughput | ✅ | 6 |
| Top 5 Clusters by Size | ✅ | 2 |

### Confluent Cloud Compatibility (2/2)

| Query | Status | Result Count |
|-------|--------|-------------|
| Common Throughput Pattern | ✅ | 1 |
| Common Message Pattern | ✅ | 1 |

### Filter Validation (2/2)

| Query | Status | Result Count |
|-------|--------|-------------|
| Available Clusters | ✅ | 112 |
| Available Topics | ✅ | 336 |

### Metric Calculations (2/2)

| Query | Status | Result Count |
|-------|--------|-------------|
| Throughput Range | ✅ | 2 |
| Percentage Calculations | ✅ | 1 |

### Summary Verification (1/1)

| Query | Status | Result Count |
|-------|--------|-------------|
| Complete Data Check | ✅ | 1 |

### Standard vs MSK Comparison (2/2)

| Query | Status | Result Count |
|-------|--------|-------------|
| Entity Count Comparison | ✅ | 1 |
| Metric Coverage Comparison | ✅ | 1 |

