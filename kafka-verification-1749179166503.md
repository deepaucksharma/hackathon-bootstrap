# Kafka Metrics Verification Report

**Generated:** 2025-06-06T03:06:06.498Z

**Account ID:** 3630072

**Time Range:** 1 hour ago

## Summary

- Total Queries: 55
- Successful: 55
- With Data: 51
- Failed: 0

## Health Scores

- **dataAvailability:** 90.0% ✅
- **metricCompleteness:** 92.7% ✅
- **dataFreshness:** 0.0% ❌
- **entityRelationships:** 100.0% ✅
- **overall:** 73.8% ⚠️

## Recommendations

### 🔴 Data Availability

Critical data sources are missing. Check MSK integration configuration.

- - Data Freshness (Polling): No data found

### 🟡 Data Freshness

Some data sources have stale data (>5 minutes old).

- Check polling intervals and network connectivity


## Category Results

### MSK Polling Data (9/9)

| Query | Status | Result Count |
|-------|--------|-------------|
| Cluster Sample Data Exists | ✅ | 33 |
| All Cluster Metrics Present | ✅ | 1 |
| Broker Sample Data Exists | ✅ | 33 |
| All Broker Metrics Present | ✅ | 1 |
| Topic Sample Data Exists | ✅ | 264 |
| Topic Metrics Present | ✅ | 1 |
| Cluster Attributes Present | ✅ | 1 |
| Broker Attributes Present | ✅ | 1 |
| Topic Attributes Present | ✅ | 1 |

### Metric Streams Data (5/5)

| Query | Status | Result Count |
|-------|--------|-------------|
| Metric Events Exist | ✅ | 947 |
| Cluster-Level Metrics | ✅ | 1 |
| Broker-Level Metrics | ✅ | 1 |
| Topic-Level Metrics | ✅ | 1 |
| Metric Streams Attributes | ✅ | 1 |

### Standard Kafka Integration (3/5)

| Query | Status | Result Count |
|-------|--------|-------------|
| Broker Sample Data | ✅ | 198 |
| Topic Sample Data | ✅ | 264 |
| Offset Sample Data | ✅ | 495 |
| Producer Sample Data | ⚪ | - |
| Consumer Sample Data | ⚪ | - |

### Data Quality (3/5)

| Query | Status | Result Count |
|-------|--------|-------------|
| Check for Null Values | ✅ | 1 |
| Data Freshness (Polling) | ⚪ | - |
| Data Freshness (Metric Streams) | ⚪ | - |
| Tag Completeness | ✅ | 1 |
| Data Consistency Check | ✅ | 1 |

### Throughput Calculations (4/4)

| Query | Status | Result Count |
|-------|--------|-------------|
| Cluster Throughput Summary | ✅ | 1 |
| Throughput Aggregation | ✅ | 1 |
| Topic Throughput | ✅ | 4 |
| Message Rates | ✅ | 356.78044673960403 |

### Entity Relationships (3/3)

| Query | Status | Result Count |
|-------|--------|-------------|
| Brokers per Cluster | ✅ | 1 |
| Topics per Cluster | ✅ | 1 |
| Entity GUIDs Present | ✅ | 1 |

### Health Metrics (3/3)

| Query | Status | Result Count |
|-------|--------|-------------|
| Cluster Health Status | ✅ | 1 |
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
| Stale Data Detection | ✅ | 1 |
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
| Available Clusters | ✅ | 33 |
| Available Topics | ✅ | 264 |

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

