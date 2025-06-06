# Deep Analysis: AWS MSK Entity Synthesis in New Relic

## 🔍 Key Discovery from Entity Definitions

After analyzing the official New Relic entity definitions, here's the critical insight:

### AWS MSK Entities are Synthesized from CloudWatch Metrics!

From the synthesis rules in `INFRA-AWSMSKBROKER-to-INFRA-AWSMSKTOPIC.yml`:
```yaml
conditions:
  - EventType = 'Metric'
  - EntityType IN ('AWSMSKTOPIC', 'AWS_MSK_TOPIC')
  - CollectorName = 'cloudwatch-metric-streams'
```

## What This Means

1. **AWS MSK entities are NOT created from Infrastructure Agent events**
   - AwsMskBrokerSample events won't create entities
   - AwsMskClusterSample events won't create entities

2. **They are created from CloudWatch Metric Streams**
   - Collector must be `cloudwatch-metric-streams`
   - Event type must be `Metric`
   - This is why our approach isn't working!

## Entity Synthesis Requirements

### AWSMSKCLUSTER
- **Domain**: INFRA
- **Type**: AWSMSKCLUSTER
- **Golden Tags**:
  - `aws.accountId`
  - `aws.availabilityZone`
- **Matching Attributes**:
  - `aws.accountId` → `awsAccountId`
  - `aws.region` → `awsRegion`
  - `displayName` → `awsMskClusterName`

### AWSMSKBROKER
- **Domain**: INFRA
- **Type**: AWSMSKBROKER
- **Golden Tags**:
  - `aws.accountId`
  - `aws.availabilityZone`
- **Matching Attributes**:
  - AWS Account ID
  - AWS Region
  - MSK Cluster Name
  - Broker ID

### AWSMSKTOPIC
- **Domain**: INFRA
- **Type**: AWSMSKTOPIC
- **Relationship**: MANAGED by AWSMSKBROKER
- **Synthesis**: Via CloudWatch metrics

## Why Our Approach Can't Work

1. **Wrong Collector**:
   - We're using: `nri-kafka` / `infrastructure-agent`
   - Required: `cloudwatch-metric-streams`

2. **Wrong Event Type**:
   - We're sending: Event samples (AwsMskBrokerSample)
   - Required: Metrics from CloudWatch

3. **Missing AWS Integration**:
   - Entities expect real AWS CloudWatch data
   - They validate against actual AWS resources

## The Reality

AWS MSK entities in New Relic are created through:

1. **AWS Integration Setup**
   - Connect AWS account to New Relic
   - Enable CloudWatch Metric Streams
   - Grant necessary IAM permissions

2. **CloudWatch Metrics Flow**
   - AWS MSK → CloudWatch → Metric Streams → New Relic
   - Entities are synthesized from these metrics

3. **Entity Creation**
   - New Relic creates INFRA-AWSMSKCLUSTER entities
   - New Relic creates INFRA-AWSMSKBROKER entities
   - New Relic creates INFRA-AWSMSKTOPIC entities
   - All from CloudWatch data, not agent data

## What We Can Actually Do

### Option 1: Standard Kafka Integration (Recommended)
```yaml
MSK_SHIM_ENABLED: "false"
```
- Will create standard Kafka entities
- Will appear in Message Queues UI
- Won't pretend to be AWS MSK

### Option 2: Custom Entity Creation (Advanced)
If you really need AWS MSK-like entities:
1. Use the Entity API to create custom entities
2. Send metrics via Metric API with proper entity GUIDs
3. But they still won't be "real" AWS MSK entities

### Option 3: Real AWS MSK
The only way to get proper AWS MSK entities:
1. Create real MSK clusters in AWS
2. Set up New Relic AWS integration
3. Enable CloudWatch Metric Streams
4. Let the official integration do its work

## Conclusion

Our infrastructure agent approach cannot create AWS MSK entities because:
- They require CloudWatch Metric Streams as the collector
- They expect metrics, not event samples
- They are part of the AWS cloud integration framework

The Message Queues UI is likely filtering for entities created through the proper AWS integration path.