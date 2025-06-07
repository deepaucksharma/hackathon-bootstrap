# MSK Entity Creation - Final Solution

## Executive Summary

After comprehensive testing and analysis, we have confirmed that **direct event submission via the New Relic API cannot create MSK entities that appear in the UI**. Entity synthesis rules for MSK are only available through official integrations.

## Key Findings

### ✅ What Works

1. **Event Submission**: We can successfully submit events using the Ingest API
   - Events are stored in NRDB
   - Events are queryable via NRQL
   - API Key: Use the IKEY (Ingest Key) for event submission

2. **Existing Entities**: The account has 56 working MSK entities
   - All are in "reporting" state
   - Created via infrastructure agent integration
   - Follow specific naming patterns

### ❌ What Doesn't Work

1. **Direct Entity Creation**: 
   - Submitting `AwsMskClusterSample` events does NOT create entities
   - Submitting `MessageQueueSample` events does NOT create entities
   - No combination of event fields triggers entity synthesis

2. **Entity Synthesis**:
   - Entity synthesis rules are NOT available for direct MSK event submission
   - Entities MUST be created through official integrations

## The Solution

### Option 1: Infrastructure Agent with nri-kafka (RECOMMENDED)

This is what's currently working in the account.

```yaml
# kafka-config.yml
integrations:
  - name: nri-kafka
    env:
      CLUSTER_NAME: "your-msk-cluster"
      KAFKA_VERSION: "2.8.0"
      AUTODISCOVER_STRATEGY: bootstrap
      BOOTSTRAP_BROKER_HOST: "your-msk-cluster.kafka.region.amazonaws.com"
      BOOTSTRAP_BROKER_KAFKA_PORT: 9092
      MSK_MODE: true  # Critical for MSK entities
```

### Option 2: AWS CloudWatch Metric Streams

1. Set up AWS integration in New Relic
2. Configure CloudWatch Metric Streams
3. Include `AWS/Kafka` namespace
4. MSK entities will be created automatically

### Option 3: Custom nri-kafka Binary

Based on the codebase analysis:

```bash
# Build nri-kafka with MSK shim
go build -o nri-kafka ./src

# Run with MSK configuration
./nri-kafka --msk_mode=true --cluster_name="your-cluster"
```

## Implementation Guide

### For Infrastructure Agent Approach:

1. **Deploy Infrastructure Agent**:
   ```bash
   curl -Ls https://download.newrelic.com/install/newrelic-cli/scripts/install.sh | bash
   ```

2. **Install nri-kafka Integration**:
   ```bash
   sudo apt-get install nri-kafka
   ```

3. **Configure for MSK**:
   ```yaml
   # /etc/newrelic-infra/integrations.d/kafka-config.yml
   integrations:
     - name: nri-kafka
       env:
         CLUSTER_NAME: "production-msk"
         MSK_MODE: true
         BOOTSTRAP_BROKER_HOST: "b-1.msk-cluster.xyz.kafka.us-east-1.amazonaws.com"
         BOOTSTRAP_BROKER_KAFKA_PORT: 9092
   ```

4. **Restart Agent**:
   ```bash
   sudo systemctl restart newrelic-infra
   ```

### Verification

Entities will appear in:
- Message Queues UI: https://one.newrelic.com/nr1-core/message-queues
- Entity Explorer: Infrastructure → Third-party services → AWS MSK

## Why Direct Submission Doesn't Work

1. **Entity Synthesis**: New Relic requires specific metadata and patterns that are only provided by official integrations
2. **Missing Context**: Direct API submission lacks the infrastructure context needed for entity creation
3. **Platform Rules**: Entity synthesis rules for MSK are internal to New Relic and not exposed via public APIs

## Credentials Reference

From testing, these are the working credentials:
- **Account ID**: 3630072
- **Ingest Key (IKEY)**: For event submission
- **Query Key (QKey)**: For NRQL queries
- **User Key (UKEY)**: For GraphQL API

## Conclusion

To get MSK entities in the New Relic UI, you MUST use one of the official integration methods. Direct event submission is not a viable approach for entity creation, only for custom event storage.