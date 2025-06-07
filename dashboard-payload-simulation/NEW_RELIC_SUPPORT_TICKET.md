# New Relic Support Ticket: Kafka Entity Synthesis for Self-Managed Clusters

## Ticket Summary

**Subject**: Request for MSK Entity Format Support in nri-kafka for Self-Managed Clusters

**Priority**: Medium

**Account ID**: 3630072

**Integration Version**: nri-kafka 2.13.0

## Issue Description

We are unable to get self-managed Kafka clusters to appear in New Relic's Message Queues UI, despite successfully ingesting events in the exact AWS MSK format. Our investigation reveals that entity synthesis requires AWS cloud integration, preventing self-managed clusters from creating entities even with perfectly formatted data.

## Technical Details

### What We've Verified Works:
1. **Event Ingestion**: Successfully sending AwsMskClusterSample, AwsMskBrokerSample, and AwsMskTopicSample events
2. **Data in NRDB**: All events are queryable via NRQL with complete metrics
3. **Event Format**: Exact replication of working MSK account formats including:
   - Correct entity GUIDs: `{accountId}|INFRA|AWSMSKCLUSTER|{base64(identifier)}`
   - Provider types: AwsMskCluster, AwsMskBroker, AwsMskTopic
   - All metric aggregations (Average, Sum, Maximum, Minimum, SampleCount)
   - Complete AWS context fields (ARNs, region, accountId)

### What Doesn't Work:
1. **Entity Creation**: No entities are synthesized despite valid events
2. **UI Visibility**: Message Queues UI remains empty
3. **Entity API**: No entities returned when querying by GUID

### Root Cause:
Entity synthesis for AWS resource types (AWSMSK*) requires active AWS cloud integration as a security measure. This prevents spoofing of AWS resources but also blocks legitimate use cases for self-managed Kafka monitoring.

## Business Impact

- Cannot leverage native Message Queues UI for self-managed Kafka clusters
- Forces creation of custom dashboards and alerts
- Inconsistent monitoring experience between AWS MSK and self-managed Kafka
- Additional operational overhead maintaining separate solutions

## Proposed Solutions

### 1. MSK Format Support in nri-kafka (Preferred)
Add configuration option to nri-kafka to output MSK-formatted events:

```yaml
integrations:
  - name: nri-kafka
    config:
      msk_format_enabled: true
      msk_cluster_name: "production-kafka"
      msk_simulate_arn: true
```

Benefits:
- Leverages existing MSK UI components
- No changes to entity platform required
- Backward compatible

### 2. Synthetic Entity Flag
Add account-level permission for creating synthetic AWS entities:

```graphql
mutation EnableSyntheticEntities($accountId: Int!) {
  enableSyntheticAWSEntities(accountId: $accountId) {
    success
    allowedEntityTypes
  }
}
```

Benefits:
- Useful for testing and development
- Could support other cloud resource simulations
- Controlled via permissions

### 3. Generic Kafka Entity Type
Create cloud-agnostic Kafka entity types:

- `KAFKA_CLUSTER` instead of `AWSMSKCLUSTER`
- `KAFKA_BROKER` instead of `AWSMSKBROKER`
- `KAFKA_TOPIC` instead of `AWSMSKTOPIC`

Benefits:
- True unification of Kafka monitoring
- No cloud provider dependency
- Future-proof for other Kafka distributions

## Current Workaround

We've implemented a production-ready workaround:
1. Continuous streaming of MSK-formatted events
2. Custom dashboards querying AwsMsk*Sample events
3. Alert policies based on ingested metrics
4. APM service bridge for alternative visibility

While functional, this doesn't provide the native UI experience.

## Supporting Evidence

### NRQL Query Showing Data Exists:
```sql
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample 
SELECT count(*) 
WHERE provider.clusterName = 'exact-msk-test' 
FACET eventType() 
SINCE 1 hour ago
-- Returns data for all event types
```

### Entity Query Showing No Results:
```graphql
{
  actor {
    entitySearch(query: "accountId = 3630072 AND type IN ('AWSMSKCLUSTER')") {
      results {
        entities {
          guid
          name
        }
      }
    }
  }
}
-- Returns empty results
```

## Files Attached

1. `exact-working-format-replicator.js` - Demonstrates successful event ingestion
2. `UNIFIED_KAFKA_DOMAIN_MODEL.md` - Proposed unified approach
3. `ENTITY_PLATFORM_TECHNICAL_SPEC.md` - Technical implementation details
4. `automated-verification-suite.js` - Verification tooling

## Request

1. **Immediate**: Acknowledge this limitation and provide any undocumented workarounds
2. **Short-term**: Consider implementing MSK format option in nri-kafka
3. **Long-term**: Develop unified Kafka entity types for all providers

## Expected Resolution

We understand this may require product changes. We're seeking:
1. Official acknowledgment of the limitation
2. Roadmap visibility for any planned solutions
3. Best practices for current workaround approach

## Contact Information

Available for follow-up discussions or to test proposed solutions. Happy to contribute to implementation if open-source contributions are accepted.

Thank you for your consideration of this enhancement request.

---

**Reference Documentation**:
- [Infrastructure Agent Kafka Integration](https://docs.newrelic.com/docs/infrastructure/host-integrations/host-integrations-list/kafka-monitoring-integration/)
- [AWS MSK Integration](https://docs.newrelic.com/docs/infrastructure/amazon-integrations/aws-integrations-list/aws-msk-monitoring-integration/)
- Entity Synthesis Investigation (attached)