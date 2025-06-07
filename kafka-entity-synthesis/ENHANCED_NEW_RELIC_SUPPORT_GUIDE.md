# Enhanced New Relic Support Guide: Kafka/MSK Entity Synthesis

## Executive Summary for Support Team

This guide consolidates validated findings from extensive testing of Kafka/MSK entity synthesis. It provides **proven solutions** based on working implementations, not theoretical approaches.

### Critical Discovery

**MessageQueueSample does NOT create entities**. This is the #1 misconception causing customer issues. MessageQueueSample only provides UI metrics for existing entities.

## Quick Diagnosis Flowchart

```
Customer Issue: "MSK/Kafka not showing in Message Queues UI"
                            ↓
                 Are entities visible in GraphQL?
                    /                    \
                  NO                      YES
                  ↓                        ↓
         Check Event Format          Check MessageQueueSample
                  ↓                        ↓
    Verify collector.name="cloud-integrations"    ↓
    Verify providerExternalId exists              ↓
    Verify provider="AwsMskCluster"         Add entity.guid reference
```

## Common Support Tickets and Solutions

### Ticket Type 1: "AWS MSK not appearing in UI"

**Root Cause**: Using MessageQueueSample to create entities

**Solution**:
```javascript
// WRONG - Customer's approach
{
  eventType: "MessageQueueSample",
  provider: "AwsMsk",
  entityName: "my-cluster"  // This won't create an entity!
}

// CORRECT - What they need
{
  eventType: "AwsMskClusterSample",
  collector: { name: "cloud-integrations" },
  provider: "AwsMskCluster",  // Type-specific
  providerExternalId: "123456789012",  // AWS Account ID
  entityGuid: "generated-guid",
  entityName: "my-cluster"
}
```

### Ticket Type 2: "Entities exist but no UI visibility"

**Root Cause**: Missing MessageQueueSample events for existing entities

**Diagnosis Query**:
```sql
-- Check if entities exist
FROM AwsMskClusterSample 
SELECT uniques(entityGuid), uniques(entityName) 
SINCE 1 day ago

-- Check MessageQueueSample
FROM MessageQueueSample 
SELECT count(*) 
WHERE provider = 'AwsMsk' 
AND entity.guid IS NOT NULL 
SINCE 1 hour ago
```

**Solution**: Create MessageQueueSample events with entity.guid references

### Ticket Type 3: "CloudWatch integration not creating entities"

**Root Cause**: Using Metric Streams instead of polling integration

**Key Differences**:
- Polling: `collector.name: "cloud-integrations"` ✓ (includes providerExternalId)
- Streams: `collector.name: "cloudwatch-metric-streams"` ⚠️ (missing key fields)

**Solution**: Enable polling-based CloudWatch integration for MSK

## Validation Queries for Support

### 1. Entity Existence Check

```graphql
query CheckMSKEntities($accountId: Int!) {
  actor {
    account(id: $accountId) {
      entitySearch(query: "domain='INFRA' AND type LIKE 'AWSMSK%'") {
        count
        results {
          entities {
            guid
            name
            type
            reporting
            tags {
              key
              values
            }
          }
        }
      }
    }
  }
}
```

### 2. Event Format Validation

```sql
-- Check event format
FROM AwsMskClusterSample 
SELECT 
  latest(collector.name) as 'Collector',
  latest(provider) as 'Provider',
  latest(providerExternalId) as 'External ID',
  latest(entityGuid) as 'Has GUID'
WHERE entityName = 'customer-cluster-name'
SINCE 1 week ago
```

### 3. MessageQueueSample Validation

```sql
-- Verify MessageQueueSample structure
FROM MessageQueueSample 
SELECT 
  count(*) as 'Events',
  uniqueCount(entity.guid) as 'Unique GUIDs',
  uniqueCount(entity.name) as 'Unique Names'
WHERE provider = 'AwsMsk'
FACET collector.name
SINCE 1 day ago
```

## Field Requirements Reference

### MSK Entity Creation (MANDATORY Fields)

| Field | Required Value | Common Mistakes |
|-------|---------------|------------------|
| eventType | `AwsMskClusterSample` | Using `MessageQueueSample` |
| collector.name | `"cloud-integrations"` | Missing or wrong value |
| provider | `"AwsMskCluster"` | Using generic `"AwsMsk"` |
| providerExternalId | AWS Account ID | Missing entirely |
| entityGuid | Valid GUID | Using entity.guid |
| entityName | Cluster name | Incorrect format |

### Self-Managed Kafka (MANDATORY Fields)

| Field | Required Value | Common Mistakes |
|-------|---------------|------------------|
| eventType | `KafkaBrokerSample` | Using MessageQueueSample |
| collector.name | `"infrastructure-agent"` | Wrong collector |
| clusterName | Cluster identifier | Missing field |
| displayName | UI name | Using entityName |

## Troubleshooting Scripts

### Script 1: Validate Customer's Event Format

```javascript
// validate-customer-events.js
const requiredFields = {
  'AwsMskClusterSample': [
    'collector.name',
    'provider',
    'providerExternalId',
    'entityGuid',
    'entityName'
  ],
  'MessageQueueSample': [
    'entity.guid',  // Must reference existing entity
    'provider',
    'queue.name'
  ]
};

function validateEvent(event) {
  const eventType = event.eventType;
  const required = requiredFields[eventType] || [];
  const missing = required.filter(field => !getNestedValue(event, field));
  
  if (missing.length > 0) {
    console.error(`Missing required fields for ${eventType}:`, missing);
    return false;
  }
  
  // Special validations
  if (eventType === 'AwsMskClusterSample') {
    if (event.collector?.name !== 'cloud-integrations') {
      console.error('collector.name must be "cloud-integrations"');
      return false;
    }
    if (!event.provider.match(/^AwsMsk(Cluster|Broker|Topic)$/)) {
      console.error('provider must be type-specific');
      return false;
    }
  }
  
  return true;
}
```

### Script 2: Fix Customer's Implementation

```javascript
// fix-customer-implementation.js
class MSKEntityFixer {
  
  async diagnoseAndFix(accountId, clusterName) {
    console.log('🔍 Diagnosing MSK visibility issues...');
    
    // Step 1: Check for entities
    const entities = await this.checkEntities(accountId, clusterName);
    
    if (entities.length === 0) {
      console.log('❌ No entities found. Creating proper events...');
      await this.createProperMSKEvents(accountId, clusterName);
    } else {
      console.log('✅ Entities exist. Checking MessageQueueSample...');
      const hasMessageQueue = await this.checkMessageQueueSample(accountId, entities[0].guid);
      
      if (!hasMessageQueue) {
        console.log('❌ Missing MessageQueueSample. Creating...');
        await this.createMessageQueueSample(entities[0]);
      }
    }
    
    console.log('\n🎯 Next steps:');
    console.log('1. Wait 2-5 minutes for UI cache');
    console.log('2. Check https://one.newrelic.com/nr1-core/message-queues');
  }
  
  async createProperMSKEvents(accountId, clusterName) {
    const event = {
      eventType: "AwsMskClusterSample",
      collector: { name: "cloud-integrations" },
      provider: "AwsMskCluster",
      providerExternalId: "123456789012",  // Customer's AWS account
      entityGuid: `${accountId}|INFRA|AWSMSKCLUSTER|${Buffer.from(clusterName).toString('base64')}`,
      entityName: clusterName,
      // ... additional fields
    };
    
    await this.sendEvents([event]);
  }
}
```

## Response Templates

### Template 1: MessageQueueSample Misconception

```
Hi [Customer],

I see you're trying to create MSK entities using MessageQueueSample events. This is a common misconception - MessageQueueSample events do NOT create entities, they only provide metrics for existing entities.

To fix this:

1. Use AwsMskClusterSample events instead:
   - eventType: "AwsMskClusterSample"
   - collector.name: "cloud-integrations"
   - provider: "AwsMskCluster" (not just "AwsMsk")
   - providerExternalId: "your-aws-account-id"

2. After entities are created (wait 30-60 seconds), then add MessageQueueSample events that reference the entity.guid.

I've attached a working example script. Let me know if you need help implementing this.

Best,
[Support]
```

### Template 2: CloudWatch Integration Issues

```
Hi [Customer],

The issue appears to be with your CloudWatch integration method. You're currently using Metric Streams, which doesn't include all required fields for entity synthesis.

For MSK entity creation, you need the polling-based CloudWatch integration:
- This provides collector.name: "cloud-integrations"
- Includes the critical providerExternalId field

To enable polling:
1. Go to Infrastructure > AWS
2. Edit your AWS account integration
3. Enable "Kafka" service with polling interval
4. Disable Metric Streams for the Kafka namespace

Entities should appear within 5-10 minutes after this change.

Best,
[Support]
```

## Escalation Criteria

Escalate to Engineering if:

1. **Entity Synthesis Failure** despite correct event format
   - All required fields present
   - collector.name = "cloud-integrations"
   - No entities created after 1 hour

2. **GraphQL Inconsistency**
   - Entities visible in NRQL but not GraphQL
   - Entity relationships not forming

3. **Platform-Level Issues**
   - Message Queues UI not available for account
   - Entity synthesis rules appear disabled

## Knowledge Base Articles to Reference

1. **"Understanding Entity Synthesis for Kafka/MSK"**
   - Explains the entity creation process
   - Clarifies MessageQueueSample role

2. **"CloudWatch Integration Methods Comparison"**
   - Polling vs Metric Streams
   - When to use each method

3. **"Troubleshooting Message Queues UI Visibility"**
   - Step-by-step diagnosis
   - Common fixes

## Summary Checklist for Support

- [ ] Confirm customer is NOT using MessageQueueSample for entity creation
- [ ] Verify correct eventType (AwsMsk*Sample, not MessageQueueSample)
- [ ] Check collector.name = "cloud-integrations" for AWS
- [ ] Ensure providerExternalId is present for AWS entities
- [ ] Validate provider field is type-specific (AwsMskCluster, not AwsMsk)
- [ ] Query GraphQL to confirm entity existence
- [ ] If entities exist, check for MessageQueueSample events
- [ ] Verify customer has Message Queues UI capability

## Contact Engineering

If standard troubleshooting fails:

**Team**: Entity Platform Engineering
**Slack**: #entity-synthesis-help
**Key Contacts**: 
- Entity Synthesis: @entity-team
- Message Queues UI: @ui-platform-team

**Information to Provide**:
1. Account ID
2. Sample event (sanitized)
3. GraphQL entity search results
4. Time range of attempts
5. Integration method (polling/streams)