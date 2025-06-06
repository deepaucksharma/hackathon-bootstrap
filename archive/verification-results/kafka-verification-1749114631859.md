# Kafka Metrics Verification Report

**Generated:** 2025-06-05T09:10:31.854Z

**Account ID:** 3001033

**Time Range:** 1 hour ago

## Summary

- Total Queries: 55
- Successful: 55
- With Data: 29
- Failed: 0

## Health Scores

- **dataAvailability:** 60.0% ❌
- **metricCompleteness:** 52.7% ❌
- **dataFreshness:** 0.0% ❌
- **entityRelationships:** 33.3% ❌
- **overall:** 43.2% ❌

## Recommendations

### 🔴 Data Availability

Critical data sources are missing. Check MSK integration configuration.

- - Cluster Sample Data Exists: No data found
- - Broker Sample Data Exists: No data found
- - Data Freshness (Polling): No data found
- - Cluster Health Status: No data found

### 🟡 Metric Completeness

Only 52.7% of metrics are available.

- - Cluster Sample Data Exists
- - Broker Sample Data Exists
- - Topic Sample Data Exists
- - Broker Sample Data
- - Topic Sample Data
- - Offset Sample Data
- - Producer Sample Data
- - Consumer Sample Data
- - Data Freshness (Polling)
- - Data Freshness (Metric Streams)

### 🟡 Data Freshness

Some data sources have stale data (>5 minutes old).

- Check polling intervals and network connectivity


## Category Results

### MSK Polling Data (6/9)

| Query | Status | Result Count |
|-------|--------|-------------|
| Cluster Sample Data Exists | ⚪ | - |
| All Cluster Metrics Present | ✅ | 1 |
| Broker Sample Data Exists | ⚪ | - |
| All Broker Metrics Present | ✅ | 1 |
| Topic Sample Data Exists | ⚪ | - |
| Topic Metrics Present | ✅ | 1 |
| Cluster Attributes Present | ✅ | 1 |
| Broker Attributes Present | ✅ | 1 |
| Topic Attributes Present | ✅ | 1 |

### Metric Streams Data (5/5)

| Query | Status | Result Count |
|-------|--------|-------------|
| Metric Events Exist | ✅ | 133028 |
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

### Data Quality (1/5)

| Query | Status | Result Count |
|-------|--------|-------------|
| Check for Null Values | ✅ | 1 |
| Data Freshness (Polling) | ⚪ | - |
| Data Freshness (Metric Streams) | ⚪ | - |
| Tag Completeness | ⚪ | - |
| Data Consistency Check | ⚪ | - |

### Throughput Calculations (2/4)

| Query | Status | Result Count |
|-------|--------|-------------|
| Cluster Throughput Summary | ⚪ | - |
| Throughput Aggregation | ✅ | 1 |
| Topic Throughput | ⚪ | - |
| Message Rates | ✅ | 9.852468481938294 |

### Entity Relationships (1/3)

| Query | Status | Result Count |
|-------|--------|-------------|
| Brokers per Cluster | ⚪ | - |
| Topics per Cluster | ⚪ | - |
| Entity GUIDs Present | ✅ | 1 |

### Health Metrics (1/3)

| Query | Status | Result Count |
|-------|--------|-------------|
| Cluster Health Status | ⚪ | - |
| Broker Health Status | ⚪ | - |
| Unhealthy Cluster Count | ✅ | 1 |

### Time Series Data (2/3)

| Query | Status | Result Count |
|-------|--------|-------------|
| Throughput Time Series | ⚪ | - |
| Message Rate Time Series | ✅ | 12 |
| Partition Count Trend | ✅ | 6 |

### Account Aggregation (2/2)

| Query | Status | Result Count |
|-------|--------|-------------|
| Account Summary | ✅ | 1 |
| Account Health Summary | ✅ | 1 |

### Performance Metrics (1/2)

| Query | Status | Result Count |
|-------|--------|-------------|
| Data Volume Check | ✅ | 1 |
| Large Dataset Check | ⚪ | - |

### Edge Cases (2/3)

| Query | Status | Result Count |
|-------|--------|-------------|
| Idle Topics | ✅ | 1 |
| Stale Data Detection | ⚪ | - |
| Partial Data Check | ✅ | 1 |

### Top N Analysis (0/2)

| Query | Status | Result Count |
|-------|--------|-------------|
| Top 10 Topics by Throughput | ⚪ | - |
| Top 5 Clusters by Size | ⚪ | - |

### Confluent Cloud Compatibility (2/2)

| Query | Status | Result Count |
|-------|--------|-------------|
| Common Throughput Pattern | ✅ | 1 |
| Common Message Pattern | ✅ | 1 |

### Filter Validation (0/2)

| Query | Status | Result Count |
|-------|--------|-------------|
| Available Clusters | ⚪ | - |
| Available Topics | ⚪ | - |

### Metric Calculations (1/2)

| Query | Status | Result Count |
|-------|--------|-------------|
| Throughput Range | ⚪ | - |
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

