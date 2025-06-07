# MSK Entity Synthesis Final Solution Documentation

## Executive Summary

This comprehensive solution enables AWS MSK entities to appear in the New Relic Message Queues UI through custom entity synthesis. After extensive research and testing, we've developed a complete toolkit that creates, validates, and maintains MSK entities in New Relic.

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Overview](#solution-overview)
3. [Architecture](#architecture)
4. [Tools and Components](#tools-and-components)
5. [Implementation Guide](#implementation-guide)
6. [Validation and Testing](#validation-and-testing)
7. [Production Deployment](#production-deployment)
8. [Troubleshooting](#troubleshooting)
9. [API Reference](#api-reference)
10. [Best Practices](#best-practices)

## Problem Statement

AWS MSK entities were not appearing in the New Relic Message Queues UI despite sending appropriate events. Investigation revealed:

1. **MessageQueueSample is not used for AWS MSK** - The UI displays entities, not MessageQueueSample events
2. **Entity synthesis rules are missing** - AWS MSK entities cannot be created via Event API alone
3. **Official integration required** - Entities must be created through proper integrations

## Solution Overview

Our solution provides multiple approaches to create MSK entities that appear in the UI:

### 1. Direct Entity Creation
- Uses AwsMsk*Sample event types
- Includes all required fields for entity synthesis
- Provides both polling and metric stream compatibility

### 2. Complete Hierarchy Building
- Creates cluster, broker, and topic entities
- Establishes proper relationships
- Includes consumer groups and applications

### 3. Continuous Metric Streaming
- Maintains entity visibility
- Provides realistic metric variations
- Ensures entities remain "reporting"

### 4. Automated Validation
- Verifies entity creation
- Checks UI visibility
- Provides continuous monitoring

## Architecture

```
┌─────────────────────┐
│   Event Submission  │
│  (Multiple Strategies)│
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│   New Relic Events  │
│  AwsMsk*Sample types│
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│  Entity Synthesis   │
│  (Platform Process) │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│  INFRA Domain       │
│  MSK Entity Types   │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│  Message Queues UI  │
│  Entity Display     │
└─────────────────────┘
```

## Tools and Components

### 1. Core Tools

#### unified-msk-orchestrator.js
Main orchestration tool that combines all approaches:
```bash
node unified-msk-orchestrator.js [strategy] [cluster-name]
# Strategies: simple, complete, advanced
```

#### entity-relationship-builder.js
Creates complete MSK hierarchy with relationships:
```bash
node entity-relationship-builder.js
```

#### continuous-metric-streamer.js
Maintains active metric flow:
```bash
node continuous-metric-streamer.js
# Interactive mode for managing multiple clusters
```

#### entity-verifier.js
Real-time entity verification:
```bash
node entity-verifier.js <cluster-name> [--continuous]
```

#### msk-entity-visualizer.js
Visualizes entity hierarchy:
```bash
node msk-entity-visualizer.js [pattern]
```

### 2. Deployment Scripts

#### deploy-msk-entities.sh
Production-ready deployment:
```bash
./deploy-msk-entities.sh [--dev|--staging|--prod]
```

#### test-all-strategies.sh
Tests all implementation strategies:
```bash
./test-all-strategies.sh
```

### 3. Validation Tools

#### ui-validation-automator.js
Automated UI validation with retries:
```bash
node ui-validation-automator.js <cluster-name> --max-retries 10
```

#### generate-test-report.js
Comprehensive test reporting:
```bash
node generate-test-report.js [test-dirs...] --html --verify
```

## Implementation Guide

### Quick Start

1. **Set Environment Variables**
```bash
export NEW_RELIC_ACCOUNT_ID=your_account_id
export NEW_RELIC_API_KEY=your_ingest_api_key
```

2. **Install Dependencies**
```bash
npm install axios
```

3. **Run Unified Orchestrator**
```bash
node unified-msk-orchestrator.js complete my-msk-cluster
```

4. **Verify in UI**
```bash
node ui-validation-automator.js my-msk-cluster
```

### Step-by-Step Implementation

#### Step 1: Create Basic Entities
```javascript
// Using simple strategy
const orchestrator = new UnifiedMSKOrchestrator();
await orchestrator.orchestrate({
    clusterName: 'my-cluster',
    strategy: 'simple',
    streaming: true,
    verify: true
});
```

#### Step 2: Build Complete Hierarchy
```javascript
// Using complete strategy
await orchestrator.orchestrate({
    clusterName: 'my-cluster',
    strategy: 'complete',
    streaming: true,
    verify: true,
    visualize: true
});
```

#### Step 3: Start Continuous Streaming
```javascript
const streamer = new ContinuousMetricStreamer(config);
streamer.startStreaming({
    clusterName: 'my-cluster',
    brokerCount: 3,
    topicCount: 5,
    updateInterval: 60000
});
```

#### Step 4: Validate UI Visibility
```javascript
const validator = new UIValidationAutomator(config);
const result = await validator.validateCluster('my-cluster', {
    maxRetries: 10,
    retryDelay: 30000
});
```

## Validation and Testing

### Validation Checklist

1. **Entity Creation**
   - [ ] Events submitted successfully
   - [ ] No API errors
   - [ ] Correct event types used

2. **Entity Synthesis**
   - [ ] Entities appear in NRDB
   - [ ] Entity GUIDs generated
   - [ ] Proper entity types assigned

3. **UI Visibility**
   - [ ] Visible in Entity Explorer
   - [ ] Appears in Message Queues UI
   - [ ] Shows in cluster list
   - [ ] Metrics displayed correctly

4. **Relationships**
   - [ ] Brokers linked to cluster
   - [ ] Topics linked to cluster
   - [ ] Consumer groups visible

### Verification Queries

```sql
-- Check cluster entity
FROM AwsMskClusterSample 
SELECT * 
WHERE provider.clusterName = 'your-cluster-name' 
SINCE 1 hour ago

-- Check all MSK entities
FROM NrIntegrationEntity
SELECT name, type, reporting 
WHERE type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC')
SINCE 1 hour ago

-- Check metrics
FROM Metric 
SELECT average(value) 
WHERE entity.type = 'AWSMSKCLUSTER' 
FACET metricName 
SINCE 1 hour ago
```

## Production Deployment

### Prerequisites

1. **New Relic Account Setup**
   - Valid account ID
   - Ingest API key with entity creation permissions
   - User API key for GraphQL queries (optional)

2. **Environment Setup**
   - Node.js 14+ installed
   - Network access to New Relic APIs
   - Sufficient API rate limits

### Deployment Steps

1. **Clone Repository**
```bash
git clone <repository>
cd kafka-entity-synthesis
```

2. **Configure Environment**
```bash
cat > .env << EOF
NEW_RELIC_ACCOUNT_ID=your_account_id
NEW_RELIC_API_KEY=your_api_key
NEW_RELIC_USER_KEY=your_user_key
EOF
```

3. **Run Production Deployment**
```bash
./deploy-msk-entities.sh --prod --cluster-name prod-msk-cluster
```

4. **Monitor Deployment**
```bash
tail -f deployment-logs-*/continuous-verification.log
```

### High Availability Setup

For production environments, consider:

1. **Multiple Clusters**
```javascript
const clusters = ['prod-cluster-1', 'prod-cluster-2', 'prod-cluster-3'];
for (const cluster of clusters) {
    await orchestrator.orchestrate({
        clusterName: cluster,
        strategy: 'complete'
    });
}
```

2. **Redundant Streaming**
```javascript
// Run on multiple instances
streamer.startStreaming({
    clusterName: 'prod-cluster',
    updateInterval: 60000
});
```

3. **Health Monitoring**
```bash
# Cron job for continuous validation
*/5 * * * * /path/to/entity-verifier.js prod-cluster >> /var/log/msk-validation.log
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Entities Not Appearing
**Symptoms**: Events submitted but no entities in UI

**Solutions**:
- Verify API key has entity creation permissions
- Check account ID is correct
- Ensure all required fields are present
- Wait 5-10 minutes for entity synthesis

#### 2. Entities Not Reporting
**Symptoms**: Entities exist but show as "not reporting"

**Solutions**:
- Start continuous metric streaming
- Verify metric events are being sent
- Check for recent data in NRQL

#### 3. Partial Visibility
**Symptoms**: Some entities visible, others missing

**Solutions**:
- Check entity relationships
- Verify broker and topic counts
- Run entity relationship builder

#### 4. API Rate Limits
**Symptoms**: 429 errors during submission

**Solutions**:
- Reduce batch sizes
- Increase delays between submissions
- Use multiple API keys

### Debug Commands

```bash
# Check specific cluster
node entity-verifier.js problem-cluster

# Visualize current state
node msk-entity-visualizer.js problem

# Generate detailed report
node generate-test-report.js --verify

# Run single strategy test
node advanced-ui-payload-runner.js
```

## API Reference

### Event Types

#### AwsMskClusterSample
```javascript
{
    eventType: "AwsMskClusterSample",
    entityGuid: "generated-guid",
    entityName: "cluster-name",
    entityType: "AWSMSKCLUSTER",
    domain: "INFRA",
    type: "AWSMSKCLUSTER",
    "provider.clusterName": "cluster-name",
    "provider.activeControllerCount.Sum": 1,
    "provider.offlinePartitionsCount.Sum": 0,
    timestamp: Date.now()
}
```

#### AwsMskBrokerSample
```javascript
{
    eventType: "AwsMskBrokerSample",
    entityGuid: "generated-guid",
    entityName: "broker-name",
    entityType: "AWSMSKBROKER",
    "provider.clusterName": "cluster-name",
    "provider.brokerId": "1",
    "provider.bytesInPerSec.Average": 100000,
    timestamp: Date.now()
}
```

#### AwsMskTopicSample
```javascript
{
    eventType: "AwsMskTopicSample",
    entityGuid: "generated-guid",
    entityName: "topic-name",
    entityType: "AWSMSKTOPIC",
    "provider.clusterName": "cluster-name",
    "provider.topic": "topic",
    "provider.bytesInPerSec.Average": 50000,
    timestamp: Date.now()
}
```

### GraphQL Queries

#### Entity Search
```graphql
{
    actor {
        entitySearch(query: "domain='INFRA' AND type='AWSMSKCLUSTER'") {
            count
            results {
                entities {
                    guid
                    name
                    type
                    reporting
                }
            }
        }
    }
}
```

## Best Practices

### 1. Entity Naming
- Use consistent naming patterns
- Include environment in names (prod, staging)
- Avoid special characters

### 2. Metric Streaming
- Update metrics at least every 60 seconds
- Include realistic variations (±10%)
- Monitor for streaming failures

### 3. Monitoring
- Set up alerts for entity health
- Monitor event submission success
- Track UI visibility metrics

### 4. Scaling
- Batch events appropriately (max 1000)
- Use connection pooling
- Implement retry logic

### 5. Security
- Store API keys securely
- Use environment variables
- Rotate keys regularly
- Audit entity creation

## Conclusion

This solution provides a comprehensive approach to creating AWS MSK entities that appear in the New Relic Message Queues UI. While the ideal approach is to use official integrations (CloudWatch Metric Streams or nri-kafka), this custom solution enables immediate visibility for testing, development, or scenarios where official integrations are not feasible.

Key takeaways:
1. Use proper event types (AwsMsk*Sample)
2. Include all required fields
3. Maintain continuous metrics
4. Validate UI visibility
5. Monitor entity health

For production use, consider migrating to official integrations when possible for better reliability and support.