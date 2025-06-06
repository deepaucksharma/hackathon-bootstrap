# Next Steps for Kafka Entity Synthesis

Based on our comprehensive investigation, here are the recommended next steps:

## Option 1: Infrastructure Integration Path (Recommended)

Since the Event API alone cannot populate MessageQueueSample, use the actual nri-kafka integration:

1. **Deploy nri-kafka with MSK shim enabled**
   ```yaml
   env:
     - name: CONSUMER_OFFSET
       value: "false"
     - name: TOPIC_MODE
       value: "all"
     - name: COLLECT_TOPIC_SIZE
       value: "false"
     - name: MSK_SHIM_ENABLED
       value: "true"
   ```

2. **Configure proper collector name**
   - Ensure the integration sets collector.name appropriately
   - May need to modify the shim code to set this field

3. **Test with actual Kafka cluster**
   - The integration needs real JMX connections
   - MSK shim will transform the metrics

## Option 2: CloudWatch Metric Streams

Use the official AWS integration path:

1. **Enable CloudWatch Metric Streams** in AWS account
2. **Configure Kinesis Firehose** to send to New Relic
3. **Metrics will appear** with proper entity synthesis

## Option 3: Custom Solution

Since we have the events in NRDB:

1. **Build custom dashboards** using AwsMsk* events
2. **Create alerts** based on the metric data
3. **Use NRQL** to analyze the data

## Option 4: Further Investigation

1. **Test in different account** with working MSK integration
2. **Analyze working integration** to understand requirements
3. **Reverse engineer** MessageQueueSample population

## Technical Learnings

### What Works ✅
- Event submission via Event API
- Entity GUID generation
- Proper event structure
- All required fields identified

### What Doesn't Work ❌
- MessageQueueSample population via Event API
- Entity visibility in Message Queues UI
- Standard Kafka event type workaround

### Key Discovery
The Message Queues UI requires more than just properly formatted events. It needs either:
- A proper New Relic integration running
- CloudWatch Metric Streams configuration
- Specific account features enabled

## Recommendation

**Use Option 1**: Deploy the actual nri-kafka integration with MSK shim enabled. This is the most reliable path to get entities appearing in the Message Queues UI.

The Event API approach is valuable for:
- Custom metrics and events
- Testing and validation
- Understanding the data format

But for full UI integration, use the official integration path.