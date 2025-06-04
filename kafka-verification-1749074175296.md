# Kafka Metrics Verification Report

**Generated:** 2025-06-04T21:56:15.290Z

**Account ID:** 3630072

**Time Range:** 1 hour ago

## Summary

- Total Queries: 55
- Successful: 55
- With Data: 55
- Failed: 0

## Health Scores

- **dataAvailability:** 100.0% ✅
- **metricCompleteness:** 100.0% ✅
- **dataFreshness:** 0.0% ❌
- **entityRelationships:** 100.0% ✅
- **overall:** 80.0% ⚠️

## Recommendations

### 🟡 Data Freshness

Some data sources have stale data (>5 minutes old).

- Check polling intervals and network connectivity


## Category Results

### MSK Polling Data (9/9)

| Query | Status | Result Count |
|-------|--------|-------------|
| Cluster Sample Data Exists | ✅ | 402 |
| All Cluster Metrics Present | ✅ | 1 |
| Broker Sample Data Exists | ✅ | 319 |
| All Broker Metrics Present | ✅ | 1 |
| Topic Sample Data Exists | ✅ | 1577 |
| Topic Metrics Present | ✅ | 1 |
| Cluster Attributes Present | ✅ | 1 |
| Broker Attributes Present | ✅ | 1 |
| Topic Attributes Present | ✅ | 1 |

### Metric Streams Data (5/5)

| Query | Status | Result Count |
|-------|--------|-------------|
| Metric Events Exist | ✅ | 7158 |
| Cluster-Level Metrics | ✅ | 1 |
| Broker-Level Metrics | ✅ | 1 |
| Topic-Level Metrics | ✅ | 1 |
| Metric Streams Attributes | ✅ | 1 |

### Standard Kafka Integration (5/5)

| Query | Status | Result Count |
|-------|--------|-------------|
| Broker Sample Data | ✅ | 1595 |
| Topic Sample Data | ✅ | 484 |
| Offset Sample Data | ✅ | 3912 |
| Producer Sample Data | ✅ | 29 |
| Consumer Sample Data | ✅ | 108 |

### Data Quality (5/5)

| Query | Status | Result Count |
|-------|--------|-------------|
| Check for Null Values | ✅ | 1 |
| Data Freshness (Polling) | ✅ | 2 |
| Data Freshness (Metric Streams) | ✅ | 1 |
| Tag Completeness | ✅ | 2 |
| Data Consistency Check | ✅ | 2 |

### Throughput Calculations (4/4)

| Query | Status | Result Count |
|-------|--------|-------------|
| Cluster Throughput Summary | ✅ | 1 |
| Throughput Aggregation | ✅ | 1 |
| Topic Throughput | ✅ | 4 |
| Message Rates | ✅ | 2217.3772925273606 |

### Entity Relationships (3/3)

| Query | Status | Result Count |
|-------|--------|-------------|
| Brokers per Cluster | ✅ | 1 |
| Topics per Cluster | ✅ | 1 |
| Entity GUIDs Present | ✅ | 1 |

### Health Metrics (3/3)

| Query | Status | Result Count |
|-------|--------|-------------|
| Cluster Health Status | ✅ | 2 |
| Broker Health Status | ✅ | 1 |
| Unhealthy Cluster Count | ✅ | 1 |

### Time Series Data (3/3)

| Query | Status | Result Count |
|-------|--------|-------------|
| Throughput Time Series | ✅ | 12 |
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
| Large Dataset Check | ✅ | 1 |

### Edge Cases (3/3)

| Query | Status | Result Count |
|-------|--------|-------------|
| Idle Topics | ✅ | 1 |
| Stale Data Detection | ✅ | 2 |
| Partial Data Check | ✅ | 1 |

### Top N Analysis (2/2)

| Query | Status | Result Count |
|-------|--------|-------------|
| Top 10 Topics by Throughput | ✅ | 4 |
| Top 5 Clusters by Size | ✅ | 1 |

### Confluent Cloud Compatibility (2/2)

| Query | Status | Result Count |
|-------|--------|-------------|
| Common Throughput Pattern | ✅ | 1 |
| Common Message Pattern | ✅ | 1 |

### Filter Validation (2/2)

| Query | Status | Result Count |
|-------|--------|-------------|
| Available Clusters | ✅ | 401 |
| Available Topics | ✅ | 1577 |

### Metric Calculations (2/2)

| Query | Status | Result Count |
|-------|--------|-------------|
| Throughput Range | ✅ | 1 |
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

