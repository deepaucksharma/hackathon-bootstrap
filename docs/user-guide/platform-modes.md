# Platform Modes

> **Purpose**: Understand the three operating modes of the Message Queues Platform  
> **Audience**: Platform operators and developers  
> **Prerequisites**: [Platform installed](../getting-started/installation.md)

## Overview

The New Relic Message Queues Platform operates in three distinct modes, each designed for specific use cases and deployment scenarios. Understanding when and how to use each mode is crucial for successful implementation.

## Mode Comparison

| Feature | Simulation | Infrastructure | Hybrid |
|---------|------------|----------------|--------|
| **Data Source** | Synthetic | Real nri-kafka | Both |
| **Use Case** | Testing/Demos | Production | Gap filling |
| **Requirements** | None | Active Kafka + nri-kafka | Both |
| **Entity Coverage** | Complete | Depends on infrastructure | Complete |
| **Data Quality** | Realistic patterns | Real metrics | Real + synthetic |
| **Setup Time** | < 1 minute | 30+ minutes | 15+ minutes |
| **Best For** | Development, POCs | Production monitoring | Partial deployments |

## Simulation Mode

### When to Use Simulation Mode

**✅ Perfect for:**
- **Development and testing** - No infrastructure required
- **Demos and POCs** - Show platform capabilities instantly
- **Training environments** - Learn without affecting production
- **Load testing dashboards** - Test with high-volume scenarios
- **Feature development** - Build new features without dependencies

**❌ Not suitable for:**
- Production monitoring (no real data)
- Compliance/audit scenarios (synthetic data)
- Actual performance troubleshooting

### How to Enable

```bash
# Basic simulation
node platform.js --mode=simulation

# With specific parameters
NEW_RELIC_API_KEY=your_key \
NEW_RELIC_ACCOUNT_ID=your_account \
SIMULATION_CLUSTERS=3 \
SIMULATION_DURATION=600 \
node platform.js --mode=simulation --interval=30
```

### Configuration Options

```bash
# Topology Configuration
SIMULATION_CLUSTERS=2                    # Number of clusters to simulate
SIMULATION_BROKERS_PER_CLUSTER=3        # Brokers per cluster
SIMULATION_TOPICS=15                     # Topics per cluster
SIMULATION_CONSUMER_GROUPS=8             # Consumer groups per cluster

# Behavior Configuration
SIMULATION_DURATION=300                  # Total runtime in seconds
SIMULATION_INTERVAL=30                   # Data generation interval
SIMULATION_PATTERNS=normal,peak,degraded # Operational patterns to simulate

# Data Quality
SIMULATION_ANOMALY_RATE=0.05            # 5% anomaly injection
SIMULATION_SEASONAL_PATTERNS=true       # Include daily/weekly patterns
```

### Generated Entities

Simulation mode creates a complete MESSAGE_QUEUE topology:

```
MESSAGE_QUEUE_CLUSTER
├── prod-east-1 (cluster)
│   ├── prod-east-1-broker-1 (MESSAGE_QUEUE_BROKER)
│   ├── prod-east-1-broker-2 (MESSAGE_QUEUE_BROKER)
│   ├── prod-east-1-broker-3 (MESSAGE_QUEUE_BROKER)
│   ├── orders-topic (MESSAGE_QUEUE_TOPIC)
│   ├── payments-topic (MESSAGE_QUEUE_TOPIC)
│   └── notifications-topic (MESSAGE_QUEUE_TOPIC)
└── staging-west-1 (cluster)
    └── [similar structure]
```

### Simulation Patterns

**Normal Operations:**
- Steady throughput with minor variations
- 99.9% availability
- Balanced partition usage
- Low consumer lag

**Peak Traffic:**
- 3-5x normal throughput
- Increased latency
- Higher CPU/memory usage
- Temporary consumer lag spikes

**Degraded Performance:**
- Broker failures (temporary)
- Network partitions
- Under-replicated partitions
- Consumer group rebalancing

**Example Output:**
```
🚀 Simulation starting...
✅ Created cluster: prod-east-1 (3 brokers, 15 topics)
✅ Created cluster: staging-west-1 (3 brokers, 15 topics)
📊 Generated 42 MESSAGE_QUEUE entities
🔄 Pattern: normal → peak → degraded → recovery
✅ Streaming realistic operational data...
```

## Infrastructure Mode

### When to Use Infrastructure Mode

**✅ Perfect for:**
- **Production monitoring** - Real cluster visibility
- **Operational dashboards** - Actual performance metrics
- **Alerting and SLI tracking** - Based on real data
- **Capacity planning** - Historical trend analysis
- **Troubleshooting** - Root cause analysis with real metrics

**❌ Not suitable for:**
- Development without Kafka infrastructure
- Demos where infrastructure setup is impractical
- Testing disaster scenarios (might affect production)

### Prerequisites

**Infrastructure Requirements:**
- Active Kafka cluster (0.10.2+)
- JMX enabled on all brokers
- New Relic Infrastructure agent installed
- nri-kafka integration configured and reporting data

**Verification Steps:**
```bash
# 1. Check nri-kafka data availability
# Replace 1234567 with your account ID
curl -H "Api-Key: $NEW_RELIC_USER_API_KEY" \
     https://api.newrelic.com/graphql \
     -d '{
       "query": "{ actor { account(id: 1234567) { nrql(query: \"FROM KafkaBrokerSample SELECT count(*) SINCE 1 hour ago\") { results } } } }"
     }'

# 2. Test platform connectivity
node test-infra-connection.js

# 3. Validate configuration
node test-config-validation.js
```

### How to Enable

```bash
# Basic infrastructure mode
NEW_RELIC_USER_API_KEY=your_key \
NEW_RELIC_ACCOUNT_ID=your_account \
node platform.js --mode=infrastructure

# Production configuration
NEW_RELIC_USER_API_KEY=your_key \
NEW_RELIC_ACCOUNT_ID=your_account \
KAFKA_CLUSTER_NAME=production \
DEBUG=platform:* \
node platform.js --mode=infrastructure --interval=30
```

### Configuration Options

```bash
# Required
NEW_RELIC_USER_API_KEY=nrak-...         # User API Key (for NerdGraph)
NEW_RELIC_ACCOUNT_ID=1234567            # Account where Kafka data reports

# Infrastructure Settings  
KAFKA_CLUSTER_NAME=production           # Cluster identifier
COLLECTION_INTERVAL=30                  # Seconds between collections
COLLECTION_WINDOW="5 minutes ago"      # NRQL time window

# Data Processing
BATCH_SIZE=100                          # Entities per batch
TRANSFORMATION_TIMEOUT=30000            # Milliseconds
CONCURRENT_TRANSFORMERS=2               # Parallel processing
```

### Data Transformation Flow

```
1. Query NRDB → KafkaBrokerSample, KafkaTopicSample
2. Transform → MESSAGE_QUEUE_BROKER, MESSAGE_QUEUE_TOPIC entities  
3. Validate → Ensure proper GUID format and required attributes
4. Stream → Send to New Relic Event API
5. Synthesize → New Relic creates queryable entities
```

### Entity Mapping

**From nri-kafka to MESSAGE_QUEUE:**

| nri-kafka Sample | MESSAGE_QUEUE Entity | Key Attributes |
|------------------|---------------------|----------------|
| `KafkaBrokerSample` | `MESSAGE_QUEUE_BROKER` | `broker.id`, `clusterName` |
| `KafkaTopicSample` | `MESSAGE_QUEUE_TOPIC` | `topic.name`, `clusterName` |
| `KafkaConsumerSample` | `MESSAGE_QUEUE_CONSUMER_GROUP` | `consumerGroup`, `topic` |

**GUID Generation:**
```
MESSAGE_QUEUE_BROKER|{accountId}|kafka|{clusterName}:{brokerId}
MESSAGE_QUEUE_TOPIC|{accountId}|kafka|{clusterName}:{topicName}
```

### Example Output

```
🔧 Platform starting in infrastructure mode
🔍 Checking for nri-kafka integration...
✅ Found 156 Kafka samples in the last hour
📊 Collecting Kafka metrics from Infrastructure agent...
✅ Collected 5 broker samples
✅ Collected 23 topic samples
🔄 Transformation: 5 brokers → 5 MESSAGE_QUEUE_BROKER entities
🔄 Transformation: 23 topics → 23 MESSAGE_QUEUE_TOPIC entities  
✅ Entity validation passed (28/28 entities)
🚀 Streaming MESSAGE_QUEUE entities to New Relic...
✅ Sent 28 entity events successfully
```

## Hybrid Mode

### When to Use Hybrid Mode

**✅ Perfect for:**
- **Partial Kafka deployments** - Some brokers not monitored
- **Mixed environments** - Development + production clusters
- **Gap filling** - Complete entity coverage for dashboards
- **Gradual rollouts** - Supplement during nri-kafka deployment
- **Testing scenarios** - Combine real data with test cases

**❌ Avoid when:**
- Complete infrastructure coverage exists
- Pure simulation or pure infrastructure meets needs
- Complexity isn't justified by use case

### How Hybrid Mode Works

1. **Infrastructure Collection**: Gather real metrics from nri-kafka
2. **Gap Detection**: Identify missing entities and stale metrics
3. **Simulation Fill**: Generate synthetic data for gaps
4. **Entity Combination**: Merge real and simulated entities
5. **Unified Streaming**: Send complete topology to New Relic

### Gap Detection Logic

```javascript
// Example gap detection
const gaps = {
  missingBrokers: ['broker-4', 'broker-5'],      // In config but no data
  staleTopics: ['old-topic-1'],                  // Data > 10 minutes old
  missingConsumerGroups: ['test-consumers'],     // Expected but absent
  incompleteMetrics: ['broker-2']                // Missing key metrics
};
```

### How to Enable

```bash
# Basic hybrid mode
NEW_RELIC_USER_API_KEY=your_key \
NEW_RELIC_ACCOUNT_ID=your_account \
KAFKA_CLUSTER_NAME=production \
node platform.js --mode=hybrid

# Advanced configuration
NEW_RELIC_USER_API_KEY=your_key \
NEW_RELIC_ACCOUNT_ID=your_account \
KAFKA_CLUSTER_NAME=production \
HYBRID_GAP_TOLERANCE=300 \
HYBRID_SIMULATION_RATIO=0.3 \
node platform.js --mode=hybrid --interval=30
```

### Configuration Options

```bash
# Hybrid Behavior
HYBRID_GAP_TOLERANCE=300               # Seconds before metric considered stale
HYBRID_SIMULATION_RATIO=0.2            # Max % of entities that can be simulated
HYBRID_FILL_MISSING_BROKERS=true       # Generate missing brokers
HYBRID_FILL_MISSING_TOPICS=true        # Generate missing topics

# Gap Detection
HYBRID_EXPECTED_BROKERS=5              # Expected broker count
HYBRID_EXPECTED_TOPICS=20              # Expected topic count
HYBRID_REQUIRED_METRICS=bytes_in,bytes_out,messages_in  # Required metrics

# Quality Control
HYBRID_MAX_SIMULATION_ENTITIES=10      # Limit simulated entities
HYBRID_VALIDATION_STRICT=true          # Strict entity validation
```

### Example Output

```
🔧 Platform starting in hybrid mode
🔍 Analyzing infrastructure coverage...
✅ Found 3/5 expected brokers in infrastructure data
✅ Found 18/20 expected topics in infrastructure data
🔍 Gap detection results:
   - Missing brokers: broker-4, broker-5
   - Stale topics: legacy-orders (last seen: 12 minutes ago)
🔄 Filling gaps with simulation...
✅ Generated 2 missing MESSAGE_QUEUE_BROKER entities
✅ Generated 1 missing MESSAGE_QUEUE_TOPIC entity
📊 Final topology: 5 brokers (3 real + 2 simulated), 20 topics (19 real + 1 simulated)
🚀 Streaming complete MESSAGE_QUEUE topology to New Relic...
✅ Sent 25 entity events successfully (20 real + 5 simulated)
```

## Mode Selection Guide

### Decision Matrix

**Start here:** What's your primary goal?

#### For Development/Testing
```
Do you have Kafka infrastructure available?
├── No  → Use Simulation Mode
└── Yes → Do you need to test failure scenarios?
    ├── Yes → Use Simulation Mode (safer)
    └── No  → Use Infrastructure Mode
```

#### For Production Monitoring
```
Is nri-kafka fully deployed and working?
├── Yes → Use Infrastructure Mode
└── No  → Is partial deployment acceptable?
    ├── Yes → Use Hybrid Mode (fill gaps)
    └── No  → Deploy nri-kafka first, then Infrastructure Mode
```

#### For Demos/POCs
```
How much setup time do you have?
├── < 5 minutes   → Use Simulation Mode
├── < 30 minutes  → Use Hybrid Mode (if some infrastructure exists)
└── > 30 minutes  → Use Infrastructure Mode (full setup)
```

### Common Patterns

**Development Workflow:**
1. Start with **Simulation Mode** for feature development
2. Test with **Infrastructure Mode** using local Kafka
3. Deploy with **Infrastructure Mode** in production

**Gradual Production Rollout:**
1. Begin with **Simulation Mode** for dashboard development
2. Switch to **Hybrid Mode** during nri-kafka deployment
3. Transition to **Infrastructure Mode** when fully deployed

**Multi-Environment Setup:**
- **Production**: Infrastructure Mode (real metrics)
- **Staging**: Hybrid Mode (partial infrastructure)
- **Development**: Simulation Mode (no dependencies)

## Troubleshooting Mode Issues

### Simulation Mode Issues

**Problem**: Entities not appearing
```bash
# Check API credentials and permissions
curl -H "Api-Key: $NEW_RELIC_API_KEY" \
     "https://api.newrelic.com/graphql" \
     -d '{"query": "{ actor { user { email } } }"}'
```

**Problem**: Unrealistic patterns
```bash
# Adjust simulation parameters
export SIMULATION_PATTERNS=normal,peak
export SIMULATION_ANOMALY_RATE=0.1
```

### Infrastructure Mode Issues

**Problem**: No entities being created
```bash
# 1. Verify nri-kafka data
FROM KafkaBrokerSample SELECT count(*) SINCE 1 hour ago

# 2. Check User API Key permissions
# Must be User Key, not Insert Key

# 3. Test infrastructure connection
node test-infra-connection.js
```

**Problem**: Partial entity creation
```bash
# Check for missing JMX metrics
FROM KafkaBrokerSample SELECT 
  latest(broker.id),
  latest(broker.bytesInPerSecond),
  latest(broker.bytesOutPerSecond)
FACET broker.id
SINCE 1 hour ago
```

### Hybrid Mode Issues

**Problem**: Too much simulation, not enough real data
```bash
# Adjust simulation limits
export HYBRID_SIMULATION_RATIO=0.1        # Max 10% simulated
export HYBRID_MAX_SIMULATION_ENTITIES=5   # Limit simulated entities
```

**Problem**: Gap detection not working
```bash
# Check expected vs actual counts
export DEBUG=platform:*,gap:*,hybrid:*
node platform.js --mode=hybrid
```

## Advanced Mode Configurations

### Multi-Cluster Infrastructure Mode

```bash
# Monitor multiple clusters
export KAFKA_CLUSTER_NAMES="prod-east,prod-west,staging"

# Cluster-specific collection windows
export PROD_EAST_COLLECTION_WINDOW="2 minutes ago"
export PROD_WEST_COLLECTION_WINDOW="5 minutes ago"
export STAGING_COLLECTION_WINDOW="10 minutes ago"
```

### High-Frequency Simulation

```bash
# Real-time simulation for demos
export SIMULATION_INTERVAL=5              # Every 5 seconds
export SIMULATION_FAST_MODE=true          # Accelerated patterns
export SIMULATION_REAL_TIME=true          # Continuous streaming
```

### Production Hybrid Mode

```bash
# Conservative hybrid configuration
export HYBRID_SIMULATION_RATIO=0.05       # Max 5% simulated
export HYBRID_GAP_TOLERANCE=600           # 10-minute tolerance
export HYBRID_VALIDATION_STRICT=true     # Strict validation
export HYBRID_AUDIT_LOG=true             # Log all gap fills
```

## Performance Considerations

### Mode Performance Comparison

| Mode | CPU Usage | Memory Usage | Network Usage | Startup Time |
|------|-----------|--------------|---------------|--------------|
| Simulation | Low | Low | Medium | < 10s |
| Infrastructure | Medium | Medium | High | 30-60s |
| Hybrid | High | High | High | 60-120s |

### Optimization Tips

**Simulation Mode:**
- Use shorter durations for demos
- Reduce entity counts for resource-constrained environments
- Cache patterns for repeated runs

**Infrastructure Mode:**
- Adjust collection intervals based on cluster size
- Use batch processing for large clusters
- Monitor API rate limits

**Hybrid Mode:**
- Minimize simulation ratio
- Use efficient gap detection algorithms
- Cache infrastructure data between runs

---

**Next Steps:**
- [Working with Dashboards](working-with-dashboards.md) - Create monitoring dashboards
- [CLI Reference](cli-reference.md) - Complete command reference
- [Infrastructure Setup](../operations/infrastructure-setup.md) - Detailed infrastructure setup
- [Troubleshooting](troubleshooting.md) - Common issues and solutions