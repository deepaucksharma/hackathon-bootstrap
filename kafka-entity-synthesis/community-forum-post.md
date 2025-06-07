# New Relic Community Forum Post

## Title: How to Monitor Self-Managed Kafka in Message Queues UI - Workaround & Feature Request

### Category: Feature Ideas / Infrastructure Monitoring

**TL;DR**: Self-managed Kafka clusters can't appear in Message Queues UI due to AWS integration requirements. Here's a workaround and why we need native support.

---

## The Challenge

If you're trying to get your self-managed Kafka clusters to show up in New Relic's beautiful Message Queues UI, you've probably discovered what we did - it doesn't work, even if you send perfectly formatted AWS MSK events.

## Why It Doesn't Work

After extensive investigation, we found that New Relic's entity synthesis requires AWS cloud integration for any AWS resource types (like AWSMSKCLUSTER). This is a security feature to prevent spoofing AWS resources, but it also prevents legitimate monitoring of self-managed Kafka clusters.

## Our Workaround Solution

Since we can successfully ingest the events (just not create entities), we built a complete monitoring solution:

### 1. Send MSK-Formatted Events
```javascript
// Send events that would normally come from AWS
const event = {
  eventType: "AwsMskClusterSample",
  entityGuid: `${accountId}|INFRA|AWSMSKCLUSTER|${base64(clusterName)}`,
  provider: "AwsMskCluster",
  "provider.clusterName": clusterName,
  // ... all the metrics with aggregations
};
```

### 2. Create Custom Dashboards
Query the successfully ingested events:
```sql
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample 
SELECT average(provider.bytesInPerSec.Average) as 'Throughput'
WHERE provider.clusterName = 'your-cluster'
FACET provider.clusterName
```

### 3. Set Up Alerts
Create alert conditions based on the AwsMsk*Sample events for:
- Offline partitions
- Under-replicated partitions  
- High consumer lag
- Broker health

## What We Need from New Relic

### Option 1: MSK Format in nri-kafka
```yaml
integrations:
  - name: nri-kafka
    config:
      msk_format_enabled: true
      msk_cluster_name: "my-kafka"
```

### Option 2: Generic Kafka Entities
Create cloud-agnostic entity types:
- KAFKA_CLUSTER (not AWSMSKCLUSTER)
- KAFKA_BROKER (not AWSMSKBROKER)
- KAFKA_TOPIC (not AWSMSKTOPIC)

## Files You'll Need

1. **Event Streamer**: Continuously sends MSK-formatted events
2. **Dashboard JSON**: Import-ready dashboard for Kafka metrics
3. **Alert Config**: Scripted alert creation
4. **Verification Tools**: Ensure data is flowing correctly

*Note: I can share the complete codebase if there's interest*

## Current Status

- ✅ Events ingesting successfully
- ✅ Custom dashboards working
- ✅ Alerts functioning
- ❌ Message Queues UI visibility
- ❌ Entity relationships
- ❌ Native UI features

## Call to Action

If you're facing this issue too:
1. 👍 Upvote this post
2. 💬 Share your use case in comments
3. 🎫 Reference this in support tickets

The more demand we show, the more likely this gets prioritized!

## Questions for the Community

1. Anyone found other workarounds?
2. Is there a New Relic PM we should connect with?
3. Would you prefer MSK format in nri-kafka or new entity types?

---

**Tags**: #kafka #msk #infrastructure #monitoring #feature-request #workaround

**Related Links**:
- [Kafka Integration Docs](https://docs.newrelic.com/docs/infrastructure/host-integrations/host-integrations-list/kafka-monitoring-integration/)
- [AWS MSK Integration](https://docs.newrelic.com/docs/infrastructure/amazon-integrations/aws-integrations-list/aws-msk-monitoring-integration/)