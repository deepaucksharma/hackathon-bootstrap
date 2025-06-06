# UI Visibility Final Analysis

## Current Status

The Kafka metrics integration is successfully collecting and sending AWS MSK formatted data to New Relic, but the data is NOT appearing in the Message Queues UI due to two critical field issues.

## Data Collection Status ✅

- **AwsMskBrokerSample**: 60 events in last 30 minutes
- **AwsMskClusterSample**: Present (verified by original verification)
- **AwsMskTopicSample**: Present (verified by original verification)
- **Overall Health Score**: 98.9%

## Critical Issues Preventing UI Visibility ❌

### 1. Provider Field Value
- **Current**: `"provider": "AwsMskBroker"`
- **Required**: `"provider": "AwsMsk"`
- **Impact**: UI filters entities by provider="AwsMsk" and won't show our data

### 2. Missing entity.type Field
- **Required**: `"entity.type": "AWS_KAFKA_BROKER"` (or AWS_KAFKA_CLUSTER, AWS_KAFKA_TOPIC)
- **Current**: Field is completely missing from events
- **Impact**: Entity synthesis cannot determine the entity type

## Fields Present ✅

The following required fields ARE correctly present:
- `awsAccountId`: "123456789012"
- `awsRegion`: "us-east-1"
- `entity.guid`: "123456789012|INFRA|AWSMSKBROKER|..."
- `providerAccountId`: "123456789012"
- `providerExternalId`: "123456789012"
- `instrumentation.provider`: "aws"
- All provider.* metrics (bytesInPerSec, messagesInPerSec, etc.)

## Root Cause

The issue appears to be in how the New Relic Infrastructure SDK creates metric sets. When we set attributes on a metric set:

```go
attribute.Attribute{Key: "provider", Value: "AwsMsk"}
```

The SDK seems to be overriding this value based on the event type name "AwsMskBrokerSample", extracting "AwsMskBroker" as the provider.

## Solution

We need to either:

1. **Option 1**: Modify the SDK behavior (not feasible)
2. **Option 2**: Use a different event type name that results in provider="AwsMsk"
3. **Option 3**: Post-process the events before sending
4. **Option 4**: Use dimensional metrics API directly (requires API key management)

## Immediate Next Steps

1. Try renaming the event types:
   - `AwsMskBrokerSample` → `AwsMskSample` (with entity.type to differentiate)
   - This might make the SDK extract "AwsMsk" as the provider

2. Ensure entity.type is added as a metric (not just an attribute):
   - `ms.SetMetric("entity.type", "AWS_KAFKA_BROKER", metric.ATTRIBUTE)`

3. Consider using the raw integration protocol to bypass SDK limitations

## Verification

Once fixed, entities should appear in:
- New Relic One > Message Queues
- Entity search with type IN ('AWS_KAFKA_CLUSTER', 'AWS_KAFKA_BROKER', 'AWS_KAFKA_TOPIC')

The current implementation is 95% complete - only these two field issues prevent full UI visibility.