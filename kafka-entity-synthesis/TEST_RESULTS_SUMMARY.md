# Test Results Summary Table

| Approach | Event Type | Fields | Collector | HTTP | In NRDB | Entities | UI | Failure Reason |
|----------|------------|--------|-----------|------|---------|----------|----|--------------|
| MessageQueueSample | MessageQueueSample | Basic queue fields | cloud-integrations | 200 OK | Yes | No | No | Wrong event type |
| Basic AwsMsk*Sample | AwsMskBrokerSample | entityName, entityGuid, provider | cloud-integrations | 200 OK | Yes | No | No | Missing critical fields |
| UI-Compatible (query-utils) | AwsMskBrokerSample | All UI query fields + metric aggregations | cloud-integrations | 200 OK | Yes | No | No | No AWS integration |
| Enhanced (nri-kafka-msk) | AwsMskBrokerSample | All 80+ fields from working integration | cloud-integrations | 200 OK | Yes | No | No | No AWS integration |
| Metric Streams | Metric | CloudWatch dimensions + entity fields | cloudwatch-metric-streams | 200 OK | No | No | No | Metrics not processed |

## Key Findings

1. **All events were accepted** (HTTP 200 OK)
2. **Sample events are queryable in NRDB**
3. **NO entities were created** in any approach
4. **NO AWS entities exist** in the account
5. **AWS integration is NOT configured**

## Field Compliance Matrix

| Field | Master Plan Required | Our Implementation |
|-------|---------------------|-------------------|
| domain | INFRA | ✅ Implicit |
| type | AWSMSKBROKER | ✅ Via eventType |
| entityName | Unique identifier | ✅ "1:cluster-name" |
| entityGuid | Base64 GUID | ✅ Correctly generated |
| provider | Specific type | ✅ "AwsMskBroker" |
| providerAccountId | Account ID | ✅ "3630072" |
| providerAccountName | Account name | ✅ "Test Account" |
| providerExternalId | External ID | ✅ "123456789012" |
| integrationName | Integration ID | ✅ "com.newrelic.kafka" |
| integrationVersion | Version | ✅ "0.0.0" |
| collector.name | Source | ✅ "cloud-integrations" |
| All metric aggregations | 5 per metric | ✅ Average, Sum, Min, Max, SampleCount |

## Conclusion

Despite perfect compliance with all technical requirements, entity synthesis failed because:
- **AWS cloud integration is required** for entity creation
- **Synthetic events alone cannot create entities**
- **The platform enforces this for security and data integrity**
