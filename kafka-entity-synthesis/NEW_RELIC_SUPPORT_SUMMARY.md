# New Relic Support Summary: Kafka Entity Synthesis Issue

## Executive Summary

We have been working to get Kafka cluster metrics visible in New Relic's Message Queues UI. Despite successfully ingesting events in the exact AWS MSK format used by working accounts, entities are not being created and the UI remains empty. This document summarizes our findings for New Relic support.

## Environment Details

- **Account ID**: 3630072
- **Integration**: Attempting to monitor self-managed Kafka clusters
- **Goal**: Display Kafka metrics in Message Queues UI using MSK format
- **Current State**: Events successfully ingested but no entity synthesis

## What We've Accomplished

### 1. Perfect Event Format Replication ✅

We reverse-engineered the exact event format from working AWS MSK accounts and successfully replicate:

- **Event Types**: `AwsMskClusterSample`, `AwsMskBrokerSample`, `AwsMskTopicSample`
- **Provider Types**: `AwsMskCluster`, `AwsMskBroker`, `AwsMskTopic` (not generic)
- **Entity GUIDs**: Format `accountId|INFRA|AWSMSKCLUSTER|base64(identifier)`
- **All Required Fields**: Including ARNs, AWS context, metric aggregations
- **Collector Name**: `cloudwatch-metric-streams`

Example successfully ingested event:
```json
{
  "eventType": "AwsMskClusterSample",
  "entityGuid": "3630072|INFRA|AWSMSKCLUSTER|ZXhhY3QtbXNrLXRlc3Q=",
  "entityName": "exact-msk-test",
  "provider": "AwsMskCluster",
  "provider.clusterName": "exact-msk-test",
  "provider.accountId": "123456789012",
  "provider.externalId": "arn:aws:kafka:us-east-1:123456789012:cluster/exact-msk-test/...",
  "provider.activeControllerCount.Average": 1,
  "provider.activeControllerCount.Sum": 1,
  "provider.activeControllerCount.Maximum": 1,
  "provider.activeControllerCount.Minimum": 1,
  "provider.activeControllerCount.SampleCount": 60
}
```

### 2. Verification of Data Ingestion ✅

NRQL queries confirm all events are in NRDB:
```sql
FROM AwsMskClusterSample SELECT count(*) 
WHERE provider.clusterName = 'exact-msk-test' 
-- Returns: 1 event with all fields

FROM AwsMskBrokerSample SELECT uniques(entityGuid) 
WHERE provider.clusterName = 'exact-msk-test'
-- Returns: 3 unique GUIDs for brokers
```

### 3. Alternative Approaches Tested

1. **Infrastructure Agent Simulation**: Attempted to simulate full agent flow
2. **SystemSample Injection**: Successfully injected kafka.* attributes into SystemSample
3. **APM Service Bridge**: Created APM services as alternative visibility
4. **GraphQL Mutations**: Explored direct entity creation (not available)

## The Core Issue

**Entity synthesis for AWS resources requires active AWS cloud integration**. Even with perfect event data, New Relic's security model prevents entity creation without verified AWS credentials.

## Evidence

1. **Events without Entities**: All our events are in NRDB but entity searches return empty
2. **No UI Visibility**: Message Queues UI shows no Kafka clusters despite data presence
3. **Working Accounts**: Have actual AWS MSK clusters with cloud integration configured
4. **Security Model**: Platform enforces AWS resources must come from AWS

## What We Need from New Relic

### Option 1: MSK Shim in nri-kafka (Preferred)
Add official support for outputting MSK-formatted events from nri-kafka for self-managed clusters:
```yaml
msk_format_enabled: true
msk_cluster_name: "my-kafka-cluster"
```

### Option 2: Synthetic Entity Creation
Allow entity creation for testing/development without AWS integration:
- Special flag or API to create "synthetic" AWS entities
- Relaxed validation for specific accounts or use cases

### Option 3: Alternative Entity Type
Create a new entity type for self-managed Kafka that doesn't require AWS:
- `KAFKA_CLUSTER` instead of `AWSMSKCLUSTER`
- Would appear in Message Queues UI without AWS validation

## Current Workaround

We've built a complete monitoring solution using the ingested data:
1. Custom dashboards querying AwsMsk*Sample events
2. Alert conditions based on the metrics
3. APM services for alternative visibility
4. Continuous streaming to maintain data freshness

However, this doesn't provide the native Message Queues UI experience.

## Code and Documentation Provided

1. **exact-working-format-replicator.js** - Replicates exact MSK event format
2. **continuous-exact-format-streamer.js** - Maintains fresh data
3. **automated-verification-suite.js** - Verifies data ingestion
4. **Complete analysis** of entity synthesis requirements
5. **Deployment runbook** for the workaround solution

## Request for Support

We request New Relic to:
1. Acknowledge this limitation in documentation
2. Consider implementing one of the proposed solutions
3. Provide guidance on any undocumented approaches we may have missed

## Contact Information

This work was done as part of evaluating Kafka monitoring options. We're happy to provide additional details or test proposed solutions.

Thank you for your consideration.