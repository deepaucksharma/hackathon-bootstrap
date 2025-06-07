# Kafka Entity Synthesis - Implementation Status

## Overview

Based on comprehensive analysis and testing, we've developed a solution that successfully lights up the Message Queues UI for existing Kafka/MSK entities without creating new entities.

## Key Findings

### What Works ✅

1. **Event Submission**: Successfully submitting events to NRDB using the Ingest API (IKEY)
2. **Event Querying**: Events are queryable via NRQL and appear in data exploration
3. **Existing Entities**: Account has 56 working MSK entities that we can target

### What Doesn't Work ❌

1. **Entity Creation**: Direct event submission cannot create new entities
2. **Entity Synthesis**: Synthesis rules are not available for direct API submission
3. **UI Activation**: Events alone don't activate UI without proper entity association

## Current Implementation

### 1. Infrastructure Agent Simulator (`infrastructure-agent-simulator.js`)

Enhanced implementation that mimics the complete infrastructure agent flow:

```javascript
// Key phases implemented:
1. Establish host entity
2. Register Kafka integration  
3. Create Kafka entities
4. Submit dual events (MessageQueue + AwsMsk)
5. Stream continuous metrics
```

**Key Improvements:**
- Added proper session management
- Implemented phased approach for entity establishment
- Added dual event strategy for maximum compatibility
- Included continuous metric streaming

### 2. MSK Entity Creator (`msk-entity-creator.js`)

Streamlined tool for creating MSK entities with proper formatting:

```javascript
// Features:
- Dynamic cluster/broker/topic creation
- Proper GUID generation following AWS MSK patterns
- Metric value randomization for realism
- Automatic verification after creation
```

### 3. Verification Tools

- `verify-msk-entities.js`: Comprehensive verification of events and entities
- `final-analysis.js`: Analysis of what works and what doesn't
- `test-with-correct-key.js`: API key permission testing

## Identity Field Alignment

### Critical Fields Implemented:

| Field | Implementation | Status |
|-------|---------------|---------|
| `entity.guid` | Proper format: `ACCOUNT\|INFRA\|TYPE\|BASE64` | ✅ |
| `provider.clusterName` | Exact match across all samples | ✅ |
| `provider.accountId` | Real AWS account ID | ✅ |
| `provider.awsRegion` | Actual region (e.g., us-east-1) | ✅ |
| `provider.externalId` | AWS ARN format | ✅ |
| `provider.brokerId` | Sequential IDs (1,2,3...) | ✅ |

### GUID Generation Pattern:

```javascript
// Cluster: ACCOUNT|INFRA|AWSMSKCLUSTER|base64(clusterName)
// Broker: ACCOUNT|INFRA|AWSMSKBROKER|base64(clusterName-broker-N)
// Topic: ACCOUNT|INFRA|AWSMSKTOPIC|base64(clusterName-topicName)
```

## Metric Completeness

All required MSK metrics are included with proper aggregation types:

### Cluster Metrics:
- `provider.activeControllerCount.Sum`
- `provider.offlinePartitionsCount.Sum`
- `provider.globalPartitionCount.Average`
- `provider.globalTopicCount.Average`

### Broker Metrics:
- `provider.bytesInPerSec.Average/Sum/SampleCount`
- `provider.bytesOutPerSec.Average/Sum/SampleCount`
- `provider.cpuUser.Average/Maximum/Minimum`
- `provider.networkRxPackets.Average`

## Current Gaps & Limitations

1. **Entity Creation**: Still cannot create new entities - must target existing ones
2. **Collector Name**: Cannot directly set `collector.name` via API
3. **Real Integration**: This is a workaround, not a permanent solution

## Next Steps

1. **For Immediate Use**:
   - Use existing entity GUIDs from the 56 working MSK entities
   - Run continuous metric submission to keep UI active
   - Monitor with verification scripts

2. **For Production**:
   - Deploy Infrastructure Agent with nri-kafka
   - Configure MSK_MODE=true
   - Use official integration for sustainable solution

## Usage Instructions

### To Light Up Existing Entity:

```bash
# 1. Find existing entity GUID
node verify-msk-entities.js <existing-cluster-name>

# 2. Run infrastructure simulator
node infrastructure-agent-simulator.js <cluster-name>

# 3. Verify results
node verify-msk-entities.js <cluster-name>
```

### Environment Setup:

Create `.env` file:
```
ACC=3630072
IKEY=your_ingest_key
QKey=your_query_key
UKEY=your_user_key
```

## Conclusion

The solution successfully demonstrates that:
1. We can light up the Message Queues UI for existing entities
2. The approach requires proper identity field alignment
3. Direct API submission has fundamental limitations

For production use, the official integration approach is strongly recommended.