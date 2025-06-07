# Knowledge Base: Monitoring Self-Managed Kafka with New Relic Message Queues UI

## Article ID: KB-KAFKA-001
## Last Updated: January 2025
## Category: Infrastructure Monitoring / Kafka

---

## Problem Statement

Self-managed Kafka clusters cannot appear in New Relic's Message Queues UI, even when sending events in the exact AWS MSK format. This affects organizations running Kafka on-premises or in self-managed cloud deployments.

## Root Cause

New Relic's entity synthesis engine requires active AWS cloud integration for creating AWS resource entities (AWSMSKCLUSTER, AWSMSKBROKER, AWSMSKTOPIC). This security measure prevents unauthorized creation of AWS resources but also blocks legitimate monitoring of self-managed Kafka clusters using the MSK format.

## Affected Versions

- nri-kafka: All versions (as of v2.13.0)
- New Relic Infrastructure Agent: All versions
- Message Queues UI: Current implementation

## Symptoms

1. Events successfully ingest into NRDB
2. Data queryable via NRQL
3. No entities visible in Message Queues UI
4. Entity search returns empty results
5. No cluster/broker/topic entities created

## Diagnosis

Run this NRQL query to verify data ingestion:

```sql
FROM AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample 
SELECT count(*) 
WHERE provider.clusterName = 'your-cluster-name' 
FACET eventType() 
SINCE 1 hour ago
```

If this returns data but Message Queues UI is empty, you're affected by this limitation.

## Workaround Solution

### Overview

Create a comprehensive monitoring solution using custom event ingestion, dashboards, and alerts.

### Implementation Steps

#### 1. Set Up Environment

Create `.env` file with:
```bash
IKEY=your_insert_key
ACC=your_account_id  
UKEY=your_user_key
```

#### 2. Deploy Event Streamer

Use the continuous streamer to send MSK-formatted events:

```bash
# Run in background
nohup node continuous-exact-format-streamer.js your-cluster-name > kafka-streamer.log 2>&1 &

# Or use systemd service (recommended for production)
```

#### 3. Create Custom Dashboard

Import the provided dashboard JSON:
1. Navigate to https://one.newrelic.com/dashboards
2. Click "Import dashboard"
3. Paste the dashboard JSON
4. Update accountId to match your account
5. Save dashboard

#### 4. Configure Alerts

Run the alert configuration script:
```bash
node kafka-alerts-config.js your-cluster-name
```

This creates alerts for:
- Offline partitions
- Missing active controller
- High resource usage
- Under-replicated partitions
- Consumer lag
- Data freshness

#### 5. Monitor Health

Use the health monitoring script:
```bash
# One-time check
node monitor-kafka-health.js your-cluster-name

# Continuous monitoring
node monitor-kafka-health.js your-cluster-name continuous
```

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│ Kafka Cluster   │────▶│ Event Streamer   │────▶│ New Relic   │
│ (Self-Managed)  │     │ (MSK Format)     │     │ Event API   │
└─────────────────┘     └──────────────────┘     └─────────────┘
                                                          │
                                                          ▼
                                                  ┌───────────────┐
                                                  │     NRDB      │
                                                  └───────────────┘
                                                          │
                                ┌─────────────────────────┴──────┐
                                │                                │
                          ┌─────▼──────┐                 ┌──────▼─────┐
                          │ Dashboard  │                 │   Alerts   │
                          └────────────┘                 └────────────┘
```

## Alternative Approaches

### 1. APM Service Bridge
Create APM services for visibility:
```bash
node apm-service-bridge.js your-cluster-name
```

### 2. System Sample Injection
Inject Kafka metrics into SystemSample events:
```bash
node system-sample-kafka-injector.js your-cluster-name
```

### 3. Standard Kafka Integration
Use regular nri-kafka without MSK format (different UI experience).

## Limitations

1. **No Entity Relationships**: Cannot create entity relationships without synthesis
2. **No Native UI Features**: Missing Message Queues UI functionality
3. **Manual Dashboard Management**: Must maintain custom dashboards
4. **No Auto-Discovery**: Must manually configure each cluster

## Best Practices

1. **Use Consistent Naming**: Keep cluster names consistent across all scripts
2. **Monitor Data Freshness**: Ensure streamer is always running
3. **Regular Health Checks**: Schedule monitoring script via cron
4. **Document Configuration**: Maintain documentation of your setup
5. **Version Control**: Keep dashboard and alert configurations in git

## Troubleshooting

### Issue: No Data in Dashboard

1. Verify environment variables are set
2. Check streamer logs for errors
3. Confirm cluster name matches exactly
4. Verify time range in dashboard

### Issue: Alerts Not Firing

1. Check data freshness (< 10 minutes old)
2. Verify alert thresholds match your environment
3. Ensure notification channels are configured
4. Review alert policy conditions

### Issue: High Data Usage

1. Adjust streaming interval (default 5 minutes)
2. Reduce number of topics monitored
3. Implement sampling for high-volume clusters

## Future Solutions

### Requested Enhancement

Add MSK format option to nri-kafka:
```yaml
integrations:
  - name: nri-kafka
    config:
      msk_format_enabled: true
      msk_cluster_name: "production-kafka"
```

### Long-term Vision

Generic Kafka entity types independent of cloud provider:
- KAFKA_CLUSTER (not AWSMSKCLUSTER)
- KAFKA_BROKER (not AWSMSKBROKER)  
- KAFKA_TOPIC (not AWSMSKTOPIC)

## References

- [Kafka Integration Documentation](https://docs.newrelic.com/docs/infrastructure/host-integrations/host-integrations-list/kafka-monitoring-integration/)
- [AWS MSK Integration](https://docs.newrelic.com/docs/infrastructure/amazon-integrations/aws-integrations-list/aws-msk-monitoring-integration/)
- [NRQL Query Language](https://docs.newrelic.com/docs/query-your-data/nrql-new-relic-query-language/get-started/introduction-nrql-new-relics-query-language/)
- [Entity Synthesis Documentation](https://docs.newrelic.com/docs/new-relic-one/use-new-relic-one/core-concepts/what-entity-new-relic/)

## Support

For questions or issues with this workaround:
1. Check the troubleshooting section above
2. Review logs for error messages
3. Contact New Relic support with reference to this KB article
4. Post in New Relic community forums

## Change Log

- **v1.0** (Jan 2025): Initial workaround documentation
- **v1.1** (Jan 2025): Added health monitoring script
- **v1.2** (Jan 2025): Added systemd service example

---

**Keywords**: kafka, msk, message queues, entity synthesis, self-managed, monitoring, infrastructure

**Related Articles**: 
- KB-MSK-001: AWS MSK Integration Setup
- KB-INFRA-005: Custom Event Ingestion
- KB-DASH-003: Building Custom Dashboards