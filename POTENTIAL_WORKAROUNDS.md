# Potential Workarounds for MSK Visibility

## Understanding the Limitation

Since CloudWatch Metric Streams is not open source and we can't truly simulate it, here are some creative workarounds:

## Option 1: Metric API with Spoofed Collector (Experimental)

**Theory**: Send metrics directly to New Relic with the "right" attributes

```go
// In your dimensional transformer
attributes["collector.name"] = "cloudwatch-metric-streams"
attributes["instrumentation.source"] = "cloudwatch"
attributes["instrumentation.provider"] = "aws"
```

**Problems**:
- New Relic likely validates the source IP/authentication
- Entity synthesis might check account relationships
- Could violate terms of service

## Option 2: GraphQL API Entity Creation (Advanced)

New Relic has a GraphQL API for entity management:

```graphql
mutation {
  entityCreate(
    type: "AWSMSKCLUSTER",
    domain: "INFRA",
    name: "my-msk-cluster",
    guid: "...",
    tags: [
      {key: "account", value: "123456789012"},
      {key: "aws.accountId", value: "123456789012"},
      {key: "aws.region", value: "us-east-1"}
    ]
  )
}
```

**Problems**:
- Requires specific permissions
- Entities might not persist
- Still won't have CloudWatch metrics

## Option 3: Custom Kafka Dashboard (Recommended)

Since you have all the data in NRDB, create a comprehensive dashboard:

```sql
-- Cluster Overview
FROM AwsMskClusterSample SELECT * SINCE 1 hour ago

-- Broker Metrics
FROM AwsMskBrokerSample SELECT * SINCE 1 hour ago

-- Dimensional Metrics
FROM Metric SELECT * WHERE metricName LIKE 'kafka.%' SINCE 1 hour ago

-- Standard Kafka Metrics
FROM KafkaBrokerSample SELECT * SINCE 1 hour ago
```

## Option 4: Hybrid Approach

1. **Use standard Kafka integration** for UI visibility
2. **Keep MSK shim** for additional metrics
3. **Create custom dashboards** that combine both

```yaml
# Run both integrations
- name: nri-kafka
  env:
    MSK_SHIM_ENABLED: "true"  # For MSK-style metrics
    # Also collects standard Kafka metrics
```

## Option 5: Local Development Mock

For development/testing only:

```bash
# Create a local proxy that:
1. Intercepts your metrics
2. Transforms to CloudWatch format
3. Forwards to New Relic
```

**Note**: This would be complex and likely against ToS for production use.

## The Most Practical Solution

### Use Standard Kafka + Custom Dashboards

1. **Disable MSK shim** to get standard Kafka in UI:
   ```yaml
   MSK_SHIM_ENABLED: "false"
   ```

2. **Create a custom dashboard** titled "MSK Monitoring":
   - Use your AwsMsk* event data
   - Use dimensional metrics
   - Mimic AWS MSK dashboard layout

3. **Add alerts** based on your custom metrics

4. **Document** that this is simulated MSK, not real AWS MSK

## Why These Workarounds Have Limits

1. **Entity Synthesis** is server-side and proprietary
2. **UI Filters** check for legitimate AWS sources
3. **Account Validation** verifies AWS credentials
4. **Metric Source** validation is built into the platform

## Conclusion

The cleanest approach is to:
- Use standard Kafka integration for UI visibility
- Create custom dashboards for MSK-style monitoring
- Be transparent that it's not real AWS MSK
- Consider real AWS MSK if you need official support