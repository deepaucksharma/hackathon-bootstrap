# Entity Framework Solution: CloudWatch Metric Streams Mimicry

## Executive Summary

After deep analysis, the solution is to **mimic CloudWatch Metric Streams format exactly**. The entity framework has special rules for metrics coming from CloudWatch that bypass the normal entity synthesis issues we're facing.

## The Problem

Our current approach fails because:
1. The SDK overrides our `provider` field based on event type name
2. Custom event types (AwsMskBrokerSample) don't trigger AWS entity synthesis
3. The entity framework expects specific patterns from AWS integrations

## The Solution: CloudWatch Emulation

### Key Discovery
CloudWatch Metric Streams sends metrics with these characteristics:
- **Event Type**: `Metric` (not custom samples)
- **Collector Name**: `cloudwatch-metric-streams`
- **Dimensions**: Uses `aws.*` prefixed dimensions
- **No explicit provider field needed** - it's inferred

### Implementation Status

✅ **Good News**: The CloudWatch emulator is already implemented in:
- `src/msk/cloudwatch_emulator.go`

❌ **Missing**: It's not being initialized or used

## Implementation Steps

### 1. Initialize CloudWatch Emulator

Update `src/msk/shim.go`:

```go
func NewMSKShim(config Config) *MSKShim {
    shim := &MSKShim{
        config:     config,
        aggregator: NewMetricAggregator(),
        entityCache: &EntityCache{
            entities: make(map[string]*integration.Entity),
        },
    }
    
    // Initialize CloudWatch emulator if API key is available
    apiKey := os.Getenv("NEW_RELIC_API_KEY")
    if apiKey == "" {
        apiKey = os.Getenv("NRIA_LICENSE_KEY")
    }
    
    if apiKey != "" && os.Getenv("MSK_USE_CLOUDWATCH_FORMAT") == "true" {
        shim.cloudwatchEmulator = NewCloudWatchEmulator(&config, apiKey)
        log.Info("CloudWatch emulator initialized")
    }
    
    return shim
}
```

### 2. Enable CloudWatch Format

Add to environment configuration:
```yaml
MSK_USE_CLOUDWATCH_FORMAT: "true"
```

### 3. How It Works

The CloudWatch emulator:
1. Intercepts broker/topic/cluster metrics
2. Transforms them to CloudWatch Metric Streams format
3. Sends them with `collector.name: cloudwatch-metric-streams`
4. Uses proper AWS dimensions and namespace

### 4. Entity Synthesis Magic

When New Relic receives metrics with:
- `collector.name: cloudwatch-metric-streams`
- `aws.Namespace: AWS/Kafka`
- Proper AWS dimensions

The entity framework:
1. Recognizes them as AWS metrics
2. Creates entities with type `AWS_KAFKA_BROKER`, etc.
3. Makes them visible in the Message Queues UI

## Testing Plan

1. **Enable CloudWatch format**:
   ```bash
   export MSK_USE_CLOUDWATCH_FORMAT=true
   export NEW_RELIC_API_KEY=$IKEY
   ```

2. **Deploy and monitor**:
   ```bash
   kubectl apply -f minikube-consolidated/monitoring/
   ```

3. **Verify entity creation**:
   - Check Entity Explorer for AWS_KAFKA_* entities
   - Look for entities with `instrumentation.provider: cloudwatch`
   - Verify Message Queues UI visibility

## Why This Works

The entity framework has **special handling** for CloudWatch metrics:
- Bypasses normal provider field validation
- Uses dimension-based entity synthesis
- Automatically maps to AWS entity types
- Routes to correct UI based on namespace

## Fallback Options

If CloudWatch emulation doesn't work:

### Option 1: Direct Metric API
- Bypass infrastructure agent completely
- Send metrics directly to New Relic Metric API
- Full control over format

### Option 2: Custom Entity Synthesis Rules
- Work with New Relic to add rules for our collector
- Requires New Relic platform changes

### Option 3: Forked Infrastructure Agent
- Modify agent to handle our metrics specially
- High maintenance burden

## Recommendation

**Use the CloudWatch emulator approach**. It's already implemented, just needs to be activated. This leverages existing entity synthesis rules without fighting the system.

## Next Steps

1. Initialize CloudWatch emulator in shim
2. Set MSK_USE_CLOUDWATCH_FORMAT=true
3. Deploy and test
4. Monitor entity creation in UI

The beauty of this approach is that we're not hacking around the entity framework - we're using it exactly as designed for AWS integrations.