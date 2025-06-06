# Correct Solution for AWS MSK in Message Queues UI

## Key Discovery

After extensive testing and analysis of existing working MSK entities in the account, we've discovered:

**MessageQueueSample is NOT the correct approach for AWS MSK in the Message Queues UI**

## The Correct Approach

### 1. AWS MSK Uses Entity-Based Display

The Message Queues UI for AWS MSK displays **entities**, not MessageQueueSample events:
- Entity types: `AWSMSKCLUSTER`, `AWSMSKBROKER`, `AWSMSKTOPIC`
- These entities must be created via proper integration
- Direct Event API submission is insufficient

### 2. Working Integration Methods

#### Option A: CloudWatch Metric Streams (Official AWS Integration)
```
AWS MSK → CloudWatch → Metric Streams → Kinesis Firehose → New Relic
```
- Automatically creates entities
- Uses official AWS integration
- Entities appear in Message Queues UI

#### Option B: nri-kafka with MSK Support
```
Kafka JMX → nri-kafka → Infrastructure Agent → New Relic
```
- Requires nri-kafka integration
- Must be configured for MSK
- Creates entities via Integration SDK

### 3. Why Our MessageQueueSample Approach Didn't Work

1. **No Synthesis Rules**: AWS MSK entities have no automatic synthesis rules
2. **UI Requirements**: The Message Queues UI requires actual entities, not just events
3. **Integration Required**: Entities must be created through official integrations

## Proof from Existing Entities

The account has 55 working MSK entities:
- Clusters: `autodiscover-msk-cluster-auth-bob`, `pchawla-test`
- These do NOT use MessageQueueSample
- They were created via proper AWS integration
- They appear correctly in the Message Queues UI

## Correct Event Structure (via Integration)

When using the proper integration, events should use:

```javascript
{
  "eventType": "AwsMskBrokerSample",  // NOT MessageQueueSample
  "entityName": "cluster-name-broker-1",
  "clusterName": "cluster-name",
  "provider.brokerId": "1",
  // ... metrics with provider.* prefix
}
```

## Implementation Steps

### 1. CloudWatch Metric Streams Setup

```bash
# 1. Enable CloudWatch metrics for MSK cluster
aws kafka update-monitoring \
  --cluster-arn $CLUSTER_ARN \
  --enhanced-monitoring PER_TOPIC_PER_BROKER

# 2. Create Metric Stream
aws cloudwatch put-metric-stream \
  --name msk-to-newrelic \
  --firehose-arn $FIREHOSE_ARN \
  --role-arn $ROLE_ARN \
  --include-filters Namespace=AWS/Kafka

# 3. Configure Firehose to New Relic endpoint
# See AWS documentation for details
```

### 2. nri-kafka Integration Setup

```yaml
# kafka-config.yml
integration_name: com.newrelic.kafka
instances:
  - name: msk-cluster
    command: all
    arguments:
      cluster_name: my-msk-cluster
      bootstrap_broker_host: broker1.kafka.amazonaws.com
      bootstrap_broker_kafka_port: 9094
      # MSK-specific settings
      consumer_offset: false
      topic_mode: all
```

## Why MessageQueueSample Seemed to Work

We successfully stored events in MessageQueueSample, but:
- These events are NOT used by the Message Queues UI for MSK
- MessageQueueSample might be for other queue types (RabbitMQ, SQS, etc.)
- AWS MSK requires proper entity creation

## Validation

To verify MSK entities are working:

```sql
-- Check for MSK entities (not MessageQueueSample)
FROM AwsMskBrokerSample 
SELECT count(*) 
FACET clusterName 
SINCE 1 hour ago

-- Verify entities exist
query {
  actor {
    entitySearch(query: "type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC')") {
      results {
        entities {
          name
          type
          reporting
        }
      }
    }
  }
}
```

## Summary

1. **MessageQueueSample is the wrong approach** for AWS MSK
2. **Use proper integrations** (CloudWatch or nri-kafka)
3. **Entities must be created**, not just events
4. **The UI displays entities**, not MessageQueueSample data

The existing working MSK entities in the account confirm this is the correct approach.