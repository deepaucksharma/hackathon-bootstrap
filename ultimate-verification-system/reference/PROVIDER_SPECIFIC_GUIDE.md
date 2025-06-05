# Provider-Specific Implementation Guide

This guide details the differences between AWS MSK and Confluent Cloud implementations based on codebase analysis.

## Provider Detection

The UI automatically detects the provider based on entity type:

```javascript
// From common/utils/helper.ts
function getProviderFromEntityType(type: string): string {
  if (type === 'AWSMSKCLUSTER') return 'awsMsk';
  if (type === 'CONFLUENTCLOUDCLUSTER') return 'confluentCloud';
  if (type === 'KAFKACLUSTER' || type === 'KAFKA_CLUSTER') return 'kafka';
  return 'unknown';
}
```

## AWS MSK Implementation

### Entity Types
- `AWSMSKCLUSTER` - Cluster entity
- `AWSMSKBROKER` - Broker entity  
- `AWSMSKTOPIC` - Topic entity

### Required Fields

#### Cluster Sample (AwsMskClusterSample)
```yaml
Critical UI Fields:
  provider: "AwsMskCluster"  # MUST be exactly this
  awsAccountId: "123456789012"  # Your AWS account
  awsRegion: "us-east-1"  # AWS region
  instrumentation.provider: "aws"  # MUST be "aws"
  providerAccountId: "123456789012"  # Same as awsAccountId
  providerAccountName: "Production"  # Human-readable name
  entityName: "my-msk-cluster"  # Cluster name
  entity.guid: "unique-guid"  # Auto-generated

Metrics (provider.* prefix):
  provider.activeControllerCount.Sum: 1
  provider.offlinePartitionsCount.Sum: 0
  provider.underReplicatedPartitions.Sum: 0
  provider.underMinIsrPartitionCount.Sum: 0
  provider.globalPartitionCount.Average: 50
  provider.clusterState: "ACTIVE"
  provider.clusterArn: "arn:aws:kafka:..."
  provider.kafkaVersion: "2.8.0"
```

#### Broker Sample (AwsMskBrokerSample)
```yaml
Identification:
  provider.clusterName: "my-msk-cluster"
  provider.brokerId: "1"
  entityName: "my-msk-cluster:broker-1"  # Format: cluster:broker-N

Throughput Metrics:
  provider.bytesInPerSec.Average: 1048576  # bytes/sec
  provider.bytesOutPerSec.Average: 2097152
  provider.messagesInPerSec.Average: 1000  # messages/sec

Health Metrics:
  provider.underReplicatedPartitions.Sum: 0
  provider.underMinIsrPartitionCount.Sum: 0
  provider.cpuUser: 45.5  # CPU percentage
  provider.cpuSystem: 10.2
```

#### Topic Sample (AwsMskTopicSample)
```yaml
Identification:
  provider.clusterName: "my-msk-cluster"
  provider.topic: "orders"  # Actual topic name
  displayName: "orders"  # Display name (same as topic)
  entityName: "orders"  # Used for entity creation

Metrics:
  provider.bytesInPerSec.Sum: 524288  # Total across partitions
  provider.bytesOutPerSec.Sum: 1048576
  provider.partitionCount: 12
```

### Health Calculation (AWS MSK)

```javascript
// From common/config/constants.ts:197-202
const healthPredicates = [
  'activeControllerCount.Sum != 1',  // Must have exactly 1 controller
  'offlinePartitionsCount.Sum > 0',  // No offline partitions
  'globalPartitionCount.Sum == 0',   // Must have partitions
  'underReplicatedPartitions.Sum > 0',  // No under-replicated
  'underMinIsrPartitionCount.Sum > 0'   // No under min ISR
];

// Additional load check
if (cpuUser + cpuSystem > 70) {
  status = 'UNHEALTHY';  // High load threshold
}
```

### Query Patterns (AWS MSK)

#### Account Aggregation Query
```sql
FROM (
  FROM (
    SELECT 
      entity.guid,
      nr.linkedAccountId,
      sum(provider.bytesInPerSec.Average) as bytesIn
    FROM AwsMskBrokerSample
    FACET entity.guid, nr.linkedAccountId, provider.brokerId
    LIMIT MAX
  )
  SELECT 
    linkedAccountId,
    sum(bytesIn) as clusterBytesIn
  FACET linkedAccountId, entity.guid
)
SELECT 
  linkedAccountId,
  sum(clusterBytesIn) as totalBytesIn
FACET linkedAccountId
```

### Configuration Requirements

```yaml
# /etc/newrelic-infra/integrations.d/kafka-config.yml
integrations:
  - name: nri-kafka
    env:
      # CRITICAL FLAGS
      NRI_KAFKA_USE_DIMENSIONAL: true  # MUST be true
      MSK_USE_DIMENSIONAL: true  # MUST be true
      
      # Cluster identification
      CLUSTER_NAME: ${KAFKA_CLUSTER_NAME}
      AWS_ACCOUNT_ID: ${AWS_ACCOUNT_ID}
      AWS_REGION: ${AWS_REGION}
      
    labels:
      # CRITICAL LABELS
      provider: AwsMskCluster
      instrumentation.provider: aws
      providerAccountId: ${AWS_ACCOUNT_ID}
```

## Confluent Cloud Implementation

### Entity Types
- `CONFLUENTCLOUDCLUSTER` - Cluster entity
- `CONFLUENTCLOUDKAFKATOPIC` - Topic entity

### Required Fields

#### Cluster Sample (ConfluentCloudClusterSample)
```yaml
Identification:
  id: "lkc-abc123"  # Confluent cluster ID
  cluster_name: "production-cluster"
  timestamp: 1234567890  # Unix timestamp

Tags (Critical):
  tags.account: "My Company"  # Account name
  tags.kafka_env_id: "env-xyz789"  # Environment ID
  tags.environment: "production"  # Environment name

Metrics (Direct names, no provider prefix):
  cluster_received_bytes: 62914560  # Per MINUTE (divide by 60)
  cluster_sent_bytes: 125829120  # Per MINUTE (divide by 60)
  cluster_received_records: 60000  # Per MINUTE (divide by 60)
  current_controller_id: 1  # Current controller
  offline_partition_count: 0
  partition_count: 100
  cluster_status: "UP"
```

#### Topic Sample (ConfluentCloudKafkaTopicSample)
```yaml
Identification:
  topic_name: "orders"
  cluster_id: "lkc-abc123"

Metrics:
  received_bytes: 1048576  # Per MINUTE
  sent_bytes: 2097152  # Per MINUTE
  received_records: 1000  # Per MINUTE
  retained_bytes: 104857600  # Total retained
```

### Important: Metric Conversion

Confluent Cloud provides metrics **per minute**, but the UI expects **per second**:

```javascript
// From common/config/constants.ts:287-298
// Confluent metrics must be divided by 60
const confluentThroughputQuery = `
  cluster_received_bytes / 60 as bytesInPerSec,
  cluster_sent_bytes / 60 as bytesOutPerSec,
  cluster_received_records / 60 as messagesInPerSec
`;
```

### Health Calculation (Confluent Cloud)

```javascript
// From common/config/constants.ts:206-209
const healthPredicates = [
  'current_controller_id < 0',  // No active controller
  'offline_partition_count > 0'  // Offline partitions
];
```

### Query Patterns (Confluent Cloud)

#### Account Aggregation Query
```sql
SELECT 
  tags.account as accountName,
  uniqueCount(id) as clusterCount,
  filter(uniqueCount(id), WHERE current_controller_id < 0) as unhealthyCount,
  sum(cluster_received_bytes / 60) as bytesInPerSec,
  sum(cluster_sent_bytes / 60) as bytesOutPerSec
FROM ConfluentCloudClusterSample
FACET tags.account
```

### Configuration Requirements

```yaml
# Confluent Cloud configuration
integrations:
  - name: nri-kafka
    env:
      NRI_KAFKA_USE_DIMENSIONAL: true
      
      # Cluster identification
      CLUSTER_NAME: ${CONFLUENT_CLUSTER_NAME}
      CONFLUENT_CLOUD_CLUSTER_ID: ${CLUSTER_ID}
      CONFLUENT_CLOUD_ENV_ID: ${ENV_ID}
      
      # API credentials
      CONFLUENT_CLOUD_API_KEY: ${API_KEY}
      CONFLUENT_CLOUD_API_SECRET: ${API_SECRET}
      
    labels:
      provider: ConfluentCloudCluster
      account: ${ACCOUNT_NAME}
      environment: ${ENV_NAME}
      kafka_env_id: ${ENV_ID}
```

## Key Differences Summary

| Aspect | AWS MSK | Confluent Cloud |
|--------|---------|-----------------|
| **Entity Types** | AWSMSKCLUSTER, AWSMSKBROKER, AWSMSKTOPIC | CONFLUENTCLOUDCLUSTER, CONFLUENTCLOUDKAFKATOPIC |
| **Broker Entities** | Yes (separate entity) | No (metrics at cluster level) |
| **Metric Prefix** | provider.* | Direct field names |
| **Throughput Units** | Per second | Per minute (divide by 60) |
| **Health Checks** | 5 conditions + CPU load | 2 conditions |
| **Required UI Fields** | provider, awsAccountId, instrumentation.provider | tags.account, tags.kafka_env_id |
| **Metric Stream Support** | Yes | No |
| **Topic Limit** | 10,000 default | No hard limit |

## Verification Queries by Provider

### AWS MSK Complete Verification
```sql
-- Check all required components
WITH 
  ui_fields AS (
    SELECT percentage(count(provider), count(*)) = 100 as ready
    FROM AwsMskClusterSample WHERE awsAccountId = 'YOUR_ACCOUNT'
  ),
  metrics AS (
    SELECT count(*) > 0 as ready
    FROM Metric WHERE metricName LIKE 'kafka.%' AND entity.type LIKE 'AWS_KAFKA_%'
  ),
  brokers AS (
    SELECT count(*) > 0 as ready
    FROM AwsMskBrokerSample WHERE nr.linkedAccountId = 'YOUR_ACCOUNT'
  )
SELECT 
  CASE WHEN ui_fields.ready AND metrics.ready AND brokers.ready 
    THEN 'READY' ELSE 'NOT READY' END as status
FROM ui_fields, metrics, brokers
```

### Confluent Cloud Complete Verification
```sql
-- Check all required components
WITH 
  tags AS (
    SELECT percentage(count(tags.account), count(*)) = 100 
       AND percentage(count(tags.kafka_env_id), count(*)) = 100 as ready
    FROM ConfluentCloudClusterSample
  ),
  metrics AS (
    SELECT count(*) > 0 as ready
    FROM Metric WHERE metricName LIKE 'kafka.%' 
      AND entity.type LIKE 'CONFLUENT%'
  ),
  throughput AS (
    SELECT count(cluster_received_bytes) > 0 as ready
    FROM ConfluentCloudClusterSample
  )
SELECT 
  CASE WHEN tags.ready AND metrics.ready AND throughput.ready 
    THEN 'READY' ELSE 'NOT READY' END as status
FROM tags, metrics, throughput
```

## Migration Between Providers

### From Self-Managed to AWS MSK
1. Update entity type detection
2. Add AWS-specific fields (awsAccountId, awsRegion)
3. Update health predicates
4. Enable dimensional metrics

### From AWS MSK to Confluent Cloud
1. Remove broker-level configuration
2. Update metric names (remove provider.* prefix)
3. Add metric division by 60
4. Update health checks
5. Configure API credentials

## Provider-Specific Troubleshooting

### AWS MSK Issues

**Issue**: Brokers not appearing
```bash
# Check each broker JMX
for i in 1 2 3; do
  nc -zv broker-$i.cluster.region.amazonaws.com 9999
done
```

**Issue**: Missing Enhanced Monitoring metrics
```bash
# Verify in AWS Console
# Cluster > Monitoring > Enhanced monitoring level
# Should be: PER_BROKER or PER_TOPIC_PER_BROKER
```

### Confluent Cloud Issues

**Issue**: API authentication failing
```bash
# Test API access
curl -u "$API_KEY:$API_SECRET" \
  https://api.telemetry.confluent.cloud/v2/metrics/cloud/query
```

**Issue**: Metrics showing wrong values
```sql
-- Remember to divide by 60!
SELECT 
  cluster_received_bytes as 'Raw (per min)',
  cluster_received_bytes / 60 as 'Per second'
FROM ConfluentCloudClusterSample
```

## Best Practices by Provider

### AWS MSK
1. Always enable Enhanced Monitoring
2. Configure all brokers in integration
3. Use IAM roles for authentication
4. Monitor JMX connectivity
5. Set up CloudWatch Metric Streams for scale

### Confluent Cloud
1. Use dedicated API keys for monitoring
2. Monitor API rate limits
3. Cache API responses when possible
4. Use environment tags for organization
5. Monitor across all environments

This guide ensures correct implementation for each provider based on the actual codebase requirements.