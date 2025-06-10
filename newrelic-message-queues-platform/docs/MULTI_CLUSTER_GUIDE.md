# Multi-Cluster Monitoring Guide

The New Relic Message Queues Platform now supports monitoring multiple Kafka clusters efficiently with advanced filtering and discovery capabilities.

## Overview

Multi-cluster monitoring allows you to:
- Monitor dozens or hundreds of Kafka clusters from a single platform instance
- Automatically discover all Kafka clusters in your New Relic account
- Filter and focus on specific clusters
- Efficiently batch queries for optimal performance
- Get consolidated health metrics across all clusters

## Quick Start

### Monitor All Clusters

```bash
# Using Docker
docker run -d \
  -e MODE="infrastructure" \
  -e MULTI_CLUSTER="true" \
  -e NEW_RELIC_ACCOUNT_ID="your_account_id" \
  -e NEW_RELIC_API_KEY="your_api_key" \
  newrelic/message-queues-platform:latest

# Using Helm
helm install message-queues-platform ./helm/message-queues-platform \
  --set platform.mode=infrastructure \
  --set platform.multiCluster=true \
  --set platform.enableClusterDiscovery=true
```

### Monitor Specific Clusters

```bash
# Using Docker
docker run -d \
  -e MODE="infrastructure" \
  -e MULTI_CLUSTER="true" \
  -e CLUSTER_FILTER="prod-kafka-us-east,prod-kafka-eu-west" \
  newrelic/message-queues-platform:latest

# Using Node.js
node platform.js \
  --mode infrastructure \
  --multi-cluster \
  --cluster-filter "prod-kafka-us-east,prod-kafka-eu-west"
```

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MULTI_CLUSTER` | Enable multi-cluster mode | `false` |
| `CLUSTER_FILTER` | Comma-separated list of cluster names | All clusters |
| `ENABLE_CLUSTER_DISCOVERY` | Auto-discover clusters | `true` |
| `MAX_CLUSTERS_PER_QUERY` | Batch size for queries | `10` |
| `CLUSTER_DISCOVERY_INTERVAL` | Discovery cache duration (ms) | `300000` (5 min) |

### Helm Values

```yaml
platform:
  mode: infrastructure
  multiCluster: true
  clusterFilter:
    - prod-kafka-us-east
    - prod-kafka-eu-west
    - staging-kafka
  enableClusterDiscovery: true
  maxClustersPerQuery: 20
```

## Cluster Discovery

The platform can automatically discover all Kafka clusters reporting to your New Relic account.

### How Discovery Works

1. **Initial Discovery**: On startup, the platform queries for all unique cluster names
2. **Caching**: Discovered clusters are cached for 5 minutes (configurable)
3. **Filtering**: Optional filter is applied to discovered clusters
4. **Batching**: Clusters are grouped for efficient querying

### Discovery Query

The platform uses this NRQL query to discover clusters:

```sql
FROM KafkaBrokerSample 
SELECT 
  uniqueCount(broker.id) as brokerCount,
  latest(provider) as provider,
  count(*) as sampleCount
FACET clusterName 
SINCE 24 hours ago
LIMIT 100
```

### Manual Cluster Configuration

If you prefer explicit configuration over discovery:

```bash
docker run -d \
  -e MODE="infrastructure" \
  -e MULTI_CLUSTER="true" \
  -e ENABLE_CLUSTER_DISCOVERY="false" \
  -e CLUSTER_FILTER="cluster1,cluster2,cluster3" \
  newrelic/message-queues-platform:latest
```

## Performance Optimization

### Query Batching

The platform automatically batches cluster queries for optimal performance:

```yaml
# Example: 50 clusters with batch size 10
# Results in 5 parallel queries instead of 50
maxClustersPerQuery: 10
```

### Recommended Settings by Scale

#### Small Scale (< 10 clusters)
```yaml
maxClustersPerQuery: 10
interval: 60  # 1 minute
```

#### Medium Scale (10-50 clusters)
```yaml
maxClustersPerQuery: 15
interval: 120  # 2 minutes
```

#### Large Scale (> 50 clusters)
```yaml
maxClustersPerQuery: 20
interval: 300  # 5 minutes
```

## Multi-Cluster Health Dashboard

### Get Cluster Health Summary

The platform provides a consolidated health view across all clusters:

```bash
# Health endpoint returns multi-cluster summary
curl http://localhost:3000/status | jq '.multiClusterHealth'
```

Response:
```json
{
  "clusters": [
    {
      "clusterName": "prod-kafka-us-east",
      "health": {
        "activeBrokers": 6,
        "underReplicatedPartitions": 0,
        "offlinePartitions": 0,
        "avgCpuUsage": 45.2,
        "avgMemoryUsage": 62.8,
        "healthScore": 100
      }
    },
    {
      "clusterName": "prod-kafka-eu-west",
      "health": {
        "activeBrokers": 3,
        "underReplicatedPartitions": 2,
        "offlinePartitions": 0,
        "avgCpuUsage": 78.5,
        "avgMemoryUsage": 71.2,
        "healthScore": 86
      }
    }
  ],
  "summary": {
    "totalClusters": 2,
    "healthyClusters": 1,
    "degradedClusters": 1,
    "unhealthyClusters": 0
  }
}
```

### Health Score Calculation

The health score (0-100) is calculated based on:
- **Offline Partitions**: -10 points per partition (max -50)
- **Under-replicated Partitions**: -2 points per partition (max -30)
- **CPU Usage > 80%**: -1 point per 2% over 80 (max -20)
- **Memory Usage > 85%**: -1 point per 2% over 85 (max -15)

## Use Cases

### 1. Multi-Region Monitoring

Monitor Kafka clusters across different regions:

```yaml
clusterFilter:
  - prod-kafka-us-east-1
  - prod-kafka-us-west-2
  - prod-kafka-eu-west-1
  - prod-kafka-ap-southeast-1
```

### 2. Environment Segregation

Monitor specific environments:

```yaml
# Production only
clusterFilter:
  - prod-kafka-payments
  - prod-kafka-orders
  - prod-kafka-analytics

# Or use pattern matching in cluster names
# All clusters with "prod-" prefix
```

### 3. Business Unit Isolation

Monitor clusters by business unit:

```yaml
clusterFilter:
  - payments-kafka-prod
  - payments-kafka-staging
  - payments-kafka-dev
```

### 4. Gradual Rollout

Test multi-cluster monitoring with a subset:

```yaml
# Start with a few clusters
clusterFilter:
  - test-cluster-1
  - test-cluster-2

# Then expand to all
multiCluster: true
enableClusterDiscovery: true
```

## Monitoring Multi-Cluster Metrics

### Prometheus Metrics

New multi-cluster specific metrics:

```text
# Total clusters being monitored
platform_clusters_monitored{provider="kafka"} 15

# Cluster health scores
message_queue_cluster_health_score{cluster_name="prod-kafka-us-east"} 100
message_queue_cluster_health_score{cluster_name="prod-kafka-eu-west"} 86

# Discovery metrics
platform_cluster_discovery_duration_seconds 2.5
platform_cluster_discovery_count 15
```

### New Relic Dashboards

Create dashboards that aggregate across clusters:

```sql
-- Cluster Health Overview
FROM MessageQueue 
SELECT average(cluster.health.score) 
FACET clusterName 
WHERE multiCluster = true

-- Total Infrastructure Scale
FROM MessageQueue 
SELECT 
  uniqueCount(clusterName) as 'Total Clusters',
  sum(cluster.brokers.count) as 'Total Brokers',
  sum(cluster.topics.count) as 'Total Topics'
WHERE multiCluster = true

-- Problematic Clusters
FROM MessageQueue 
SELECT latest(cluster.health.score) as healthScore
WHERE multiCluster = true 
  AND cluster.health.score < 80
FACET clusterName
```

## Troubleshooting

### No Clusters Discovered

```bash
# Check if there's Kafka data in your account
curl -X POST https://api.newrelic.com/graphql \
  -H "API-Key: YOUR_API_KEY" \
  -d '{
    "query": "{ actor { account(id: YOUR_ACCOUNT_ID) { nrql(query: \"SELECT count(*) FROM KafkaBrokerSample SINCE 1 hour ago\") { results } } } }"
  }'
```

### Specific Cluster Not Found

```bash
# Verify cluster name
curl -X POST https://api.newrelic.com/graphql \
  -H "API-Key: YOUR_API_KEY" \
  -d '{
    "query": "{ actor { account(id: YOUR_ACCOUNT_ID) { nrql(query: \"FROM KafkaBrokerSample SELECT uniqueCount(broker.id) FACET clusterName SINCE 1 day ago\") { results } } } }"
  }'
```

### Performance Issues

1. **Increase batch size**: `MAX_CLUSTERS_PER_QUERY=25`
2. **Increase collection interval**: `INTERVAL=300`
3. **Use cluster filtering**: Only monitor critical clusters
4. **Check API rate limits**: Monitor `429` errors in logs

### Debugging

Enable debug mode to see detailed cluster information:

```bash
docker run -d \
  -e MODE="infrastructure" \
  -e MULTI_CLUSTER="true" \
  -e DEBUG="*" \
  newrelic/message-queues-platform:latest
```

## Best Practices

### 1. Start Small
Begin with a few clusters and gradually expand:
```bash
# Week 1: Critical production clusters
CLUSTER_FILTER="prod-payments,prod-orders"

# Week 2: All production
CLUSTER_FILTER="prod-*"

# Week 3: All clusters
ENABLE_CLUSTER_DISCOVERY="true"
```

### 2. Use Appropriate Intervals
Adjust collection intervals based on cluster count:
- 1-10 clusters: 60 seconds
- 10-50 clusters: 2-3 minutes
- 50+ clusters: 5 minutes

### 3. Monitor Platform Performance
Watch for:
- Collection duration in logs
- API rate limit warnings
- Memory usage of platform pod
- Circuit breaker state

### 4. Implement Alerting
Set up alerts for:
- Cluster health score < 70
- Clusters with offline partitions
- Failed cluster discovery
- Platform errors

## Migration Guide

### From Single to Multi-Cluster

1. **Current Single Cluster Setup**:
```bash
docker run -d \
  -e MODE="infrastructure" \
  -e KAFKA_CLUSTER_NAME="prod-kafka" \
  newrelic/message-queues-platform:latest
```

2. **Enable Multi-Cluster**:
```bash
docker run -d \
  -e MODE="infrastructure" \
  -e MULTI_CLUSTER="true" \
  -e CLUSTER_FILTER="prod-kafka" \  # Start with same cluster
  newrelic/message-queues-platform:latest
```

3. **Expand to More Clusters**:
```bash
docker run -d \
  -e MODE="infrastructure" \
  -e MULTI_CLUSTER="true" \
  -e ENABLE_CLUSTER_DISCOVERY="true" \
  newrelic/message-queues-platform:latest
```

### Rollback Plan

If issues occur, revert to single cluster:
```bash
# Remove multi-cluster flags
docker run -d \
  -e MODE="infrastructure" \
  -e KAFKA_CLUSTER_NAME="prod-kafka" \
  newrelic/message-queues-platform:latest
```

## Conclusion

Multi-cluster monitoring enables comprehensive Kafka infrastructure observability at scale. Start with a subset of clusters, validate the setup, then expand to monitor your entire Kafka fleet efficiently.