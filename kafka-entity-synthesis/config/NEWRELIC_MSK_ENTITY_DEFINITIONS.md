# New Relic MSK Entity Definitions

This document contains the official MSK entity definitions from the New Relic entity-definitions repository.

## Entity Types

### AWSMSKCLUSTER

```yaml
domain: INFRA
type: AWSMSKCLUSTER
goldenTags:
- aws.availabilityZone
- aws.accountId
configuration:
  entityExpirationTime: DAILY
  alertable: true
```

**Golden Metrics:**
- activeControllers
- globalPartitions
- offlinePartitions

### AWSMSKBROKER

```yaml
domain: INFRA
type: AWSMSKBROKER
goldenTags:
- aws.availabilityZone
- aws.accountId
configuration:
  entityExpirationTime: DAILY
  alertable: true
```

**Golden Metrics:**
- incomingMessagesPerSecond
- networkRxDropped
- networkTxDropped

### AWSMSKTOPIC

```yaml
domain: INFRA
type: AWSMSKTOPIC
configuration:
  entityExpirationTime: DAILY
  alertable: true
```

**Golden Metrics:** None defined

## Relationships

### INFRA-AWSMSKCLUSTER-to-INFRA-AWSMSKBROKER

- **Type:** CONTAINS
- **Source:** INFRA-AWSMSKCLUSTER
- **Target:** INFRA-AWSMSKBROKER
- **Fields Used:**
  - awsAccountId
  - awsRegion
  - awsMskClusterName

### INFRA-AWSMSKBROKER-to-INFRA-AWSMSKTOPIC

- **Type:** MANAGES
- **Source:** INFRA-AWSMSKBROKER
- **Target:** INFRA-AWSMSKTOPIC
- **Collector:** cloudwatch-metric-streams (specific)
- **Fields Used:**
  - awsAccountId
  - awsRegion
  - awsMskClusterName
  - awsMskBrokerId

### INFRA-AWSMSKCLUSTER-to-INFRA-AWSS3BUCKET

- **Type:** CONSUMES
- **Source:** INFRA-AWSMSKCLUSTER
- **Target:** INFRA-AWSS3BUCKET
- **Field:** bucketName (from aws.msk.loggingBucket)

## Key Observations

1. All MSK entities are in the INFRA domain
2. All entities have daily expiration and are alertable
3. Cluster and Broker entities have golden tags for AWS availability zone and account ID
4. Topic entities don't have golden tags defined
5. Relationships use AWS-specific fields for correlation
6. The broker-to-topic relationship is specific to cloudwatch-metric-streams collector

## Additional Entity Types Found

### Standard Kafka Entities (for comparison)

#### KAFKABROKER
- **Domain:** INFRA
- **Type:** KAFKABROKER
- **Golden Tags:** kafka.clusterName, kafka.brokerId
- Has dashboard and summary metrics defined

#### KAFKATOPIC
- **Domain:** INFRA
- **Type:** KAFKATOPIC
- Basic configuration only

## Event Types

The MSK entities use the following event types for data:
- **AwsMskClusterSample** - for cluster metrics
- **AwsMskBrokerSample** - for broker metrics
- **AwsMskTopicSample** - for topic metrics

## Important Notes

1. **No Synthesis Rules:** Unlike some entities, MSK entities don't have automatic synthesis rules
2. **No Dashboards:** No pre-built dashboards found in entity-definitions repo for MSK
3. **Collector Specificity:** The broker-to-topic relationship specifically requires "cloudwatch-metric-streams" collector
4. **Standard vs MSK:** Clear separation between standard Kafka entities (KAFKABROKER, KAFKATOPIC) and MSK entities (AWSMSKBROKER, AWSMSKTOPIC)

## Implementation Notes

When implementing the MSK shim in nri-kafka, ensure:

1. **Entity Type:** Use exact entity types (AWSMSKCLUSTER, AWSMSKBROKER, AWSMSKTOPIC)
2. **Domain:** Always use "INFRA" domain
3. **Event Types:** Use AwsMsk*Sample event types
4. **Golden Tags:** Include aws.availabilityZone and aws.accountId for clusters and brokers
5. **Relationships:** Include necessary fields for entity correlation
6. **Metrics:** Prioritize golden metrics for visibility and health scores
7. **Collector Name:** Consider using appropriate collector name for relationship formation