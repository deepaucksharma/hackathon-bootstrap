# Recommended Approach for Kafka Visibility in Message Queues UI

## Option 1: Use Standard Kafka Integration (Most Reliable)

Instead of trying to fake AWS MSK, use the standard Kafka integration which is **known to work** in the Message Queues UI:

1. **Disable MSK Shim**
   ```yaml
   MSK_SHIM_ENABLED: "false"
   MSK_USE_DIMENSIONAL: "false"
   ```

2. **Focus on Standard Kafka Entities**
   - KafkaBrokerSample
   - KafkaTopicSample
   - KafkaOffsetSample

3. **These DO appear in Message Queues UI** as regular Kafka (not AWS MSK)

## Option 2: Continue with Dimensional Metrics (Experimental)

If you want to continue trying the MSK approach:

1. **Re-enable dimensional metrics**
   ```yaml
   MSK_USE_DIMENSIONAL: "true"
   ```

2. **Remove event sample creation** entirely
   - Only send dimensional metrics
   - Don't create AwsMskBrokerSample events

3. **Focus on pure dimensional metrics** with proper entity attributes

## Option 3: Use Real AWS MSK

The only guaranteed way to see AWS MSK in the UI:

1. **Create actual MSK clusters** in AWS
2. **Set up New Relic AWS integration**
3. **Let it discover MSK clusters** via AWS APIs
4. **Metrics flow through proper channels**

## Why The Current Approach Has Limitations

1. **Entity Synthesis Mismatch**
   - Events API creates events, not entities
   - Dimensional metrics can create entities, but...
   - Message Queues UI might validate AWS resources

2. **AWS Validation**
   - UI might check if AWS account is real
   - UI might validate ARNs against AWS
   - UI might require cloud integration setup

3. **Mixed Signals**
   - Creating both events AND dimensional metrics
   - UI doesn't know which to trust
   - Not following standard patterns

## Recommendation

For immediate results, use **Option 1** - standard Kafka integration. It's proven to work and will show your Kafka cluster in the Message Queues UI, just not as AWS MSK.