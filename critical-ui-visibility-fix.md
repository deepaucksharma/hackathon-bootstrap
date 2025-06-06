# Critical UI Visibility Fix

## Root Cause Analysis

After deep investigation, the issue is:

1. **Dimensional Metrics are REQUIRED** for AWS MSK entities to appear in the Message Queues UI
2. The 403 error suggests we're using the wrong API key type or endpoint
3. Event samples (AwsMskClusterSample) alone are NOT sufficient for UI visibility

## The Working Pattern (from reference accounts)

Reference accounts that work in the UI use:
- **Dimensional metrics** with kafka.* prefixes
- **Entity synthesis** through dimensional metrics API
- **Proper AWS account mapping** via dimensional metrics

## Critical Fix Required

1. **Use the Ingest License Key** for dimensional metrics (not User API key)
2. **Ensure dimensional metrics are sent** with proper entity attributes
3. **Use the correct metric endpoint**

## Implementation Steps

1. Update the configuration to use the ingest license key for dimensional metrics
2. Ensure the dimensional transformer sends metrics with:
   - entity.type = "AWS_KAFKA_BROKER" / "AWS_KAFKA_CLUSTER" / "AWS_KAFKA_TOPIC"
   - entity.name with proper format
   - entity.guid with proper encoding
   - All AWS fields (awsAccountId, awsRegion, provider, etc.)

3. The dimensional metrics MUST be sent to create entities in the UI

## Key Insight

The New Relic Message Queues UI specifically looks for:
- Entities created via dimensional metrics API
- Metrics with kafka.* namespace
- Proper AWS provider attributes for account mapping

Event samples alone (even with all the right fields) won't appear in the UI without dimensional metrics.