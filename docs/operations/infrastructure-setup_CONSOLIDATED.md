# Infrastructure Setup Guide

> **Purpose**: Connect the Message Queues Platform to real Kafka infrastructure  
> **Audience**: Platform operators and SREs  
> **Prerequisites**: Active Kafka cluster with nri-kafka integration

This guide shows how to set up infrastructure mode to monitor real Kafka clusters using the nri-kafka integration.

## Overview

Infrastructure mode transforms real Kafka metrics from the New Relic Infrastructure agent into MESSAGE_QUEUE entities. This enables production monitoring with actual cluster data.

### Architecture Flow
```
Kafka Cluster → nri-kafka → Infrastructure Agent → NRDB → Platform → MESSAGE_QUEUE Entities
```

### Benefits of Infrastructure Mode
- ✅ Real-time production data
- ✅ Automatic discovery of brokers and topics  
- ✅ Historical trend analysis
- ✅ Integration with existing New Relic monitoring

## Prerequisites

### 1. Kafka Cluster Requirements
- Kafka version 0.10.2+ (for JMX metrics)
- JMX enabled on all brokers
- Network access from Infrastructure agent to Kafka brokers

### 2. New Relic Infrastructure Agent
- Infrastructure agent 1.7.0+ installed on Kafka hosts
- nri-kafka integration installed and configured
- Data flowing to New Relic (verify with NRQL)

### 3. Platform Requirements
- Node.js 14+
- New Relic User API Key (for NerdGraph access)
- Account ID where Kafka data is reporting

## Step 1: Verify nri-kafka Integration

Before setting up the platform, ensure nri-kafka is working correctly.

### Check Data Flow
```bash
# Verify broker data is flowing
# Replace 1234567 with your account ID
curl -H "Api-Key: $NEW_RELIC_USER_API_KEY" \
     -H "Content-Type: application/json" \
     https://api.newrelic.com/graphql \
     -d '{
       "query": "{ actor { account(id: 1234567) { nrql(query: \"FROM KafkaBrokerSample SELECT count(*) SINCE 1 hour ago\") { results } } } }"
     }'
```

**Expected result**: Non-zero count of KafkaBrokerSample events

### Check Topic Data
```bash
# Verify topic data is flowing
curl -H "Api-Key: $NEW_RELIC_USER_API_KEY" \
     -H "Content-Type: application/json" \
     https://api.newrelic.com/graphql \
     -d '{
       "query": "{ actor { account(id: 1234567) { nrql(query: \"FROM KafkaTopicSample SELECT count(*) SINCE 1 hour ago\") { results } } } }"
     }'
```

### Troubleshoot nri-kafka Issues

**No broker data?**
```bash
# Check nri-kafka logs
sudo journalctl -u newrelic-infra -f | grep kafka

# Verify JMX connectivity
telnet your-kafka-broker 9999

# Check nri-kafka config
cat /etc/newrelic-infra/integrations.d/kafka-config.yml
```

**Partial data?**
- Ensure all brokers have JMX enabled
- Check firewall rules between agent and brokers
- Verify cluster discovery configuration

## Step 2: Platform Configuration

### Environment Variables
```bash
# Required for infrastructure mode
export NEW_RELIC_USER_API_KEY="nrak-..."    # User API Key (for NerdGraph)
export NEW_RELIC_ACCOUNT_ID="1234567"       # Account where Kafka data reports
export PLATFORM_MODE="infrastructure"       # Enable infrastructure mode

# Optional but recommended
export NEW_RELIC_REGION="US"                # US or EU
export KAFKA_CLUSTER_NAME="production"      # Cluster identifier
export DEBUG="platform:*,transform:*"       # Debug logging
```

### Configuration Validation
The platform validates configuration on startup:

```bash
# Test configuration
node test-config-validation.js
```

**Common validation errors:**
- Missing User API Key
- Invalid account ID
- No Kafka data in specified account
- Incorrect region setting

## Step 3: Start Infrastructure Mode

### Basic Startup
```bash
# Start infrastructure mode with default settings
node platform.js --mode=infrastructure
```

### Production Startup
```bash
# Production configuration with specific settings
NEW_RELIC_USER_API_KEY="nrak-..." \
NEW_RELIC_ACCOUNT_ID="1234567" \
KAFKA_CLUSTER_NAME="production" \
node platform.js --mode=infrastructure --interval=30
```

### Expected Output
```
🔧 Platform starting in infrastructure mode
🔍 Checking for nri-kafka integration...
✅ Found 42 Kafka samples in the last hour
📊 Collecting Kafka metrics from Infrastructure agent...
✅ Collected 5 broker samples
✅ Collected 23 topic samples
🔄 Transformation: 5 brokers → 5 MESSAGE_QUEUE_BROKER entities
🔄 Transformation: 23 topics → 23 MESSAGE_QUEUE_TOPIC entities
🚀 Streaming MESSAGE_QUEUE entities to New Relic...
✅ Sent 28 entity events successfully
```

## Step 4: Verify Entity Creation

### Check in New Relic UI
1. Go to [Entity Explorer](https://one.newrelic.com/launcher/nr1-core.explorer)
2. Filter by "MESSAGE_QUEUE"
3. Look for entities matching your cluster name

### Verify with NRQL
```sql
-- Check for cluster entities
FROM MessageQueue SELECT count(*) 
WHERE entityType = 'MESSAGE_QUEUE_CLUSTER'
SINCE 10 minutes ago

-- Check for broker entities  
FROM MessageQueue SELECT count(*) 
WHERE entityType = 'MESSAGE_QUEUE_BROKER'
SINCE 10 minutes ago

-- Verify entity relationships
FROM MessageQueue SELECT entityName, clusterName, brokerId
WHERE entityType = 'MESSAGE_QUEUE_BROKER'
SINCE 10 minutes ago
```

## Advanced Configuration

### Custom Transformation Settings
```bash
# Adjust collection intervals
export COLLECTION_INTERVAL=30              # Seconds between collections
export BATCH_SIZE=100                      # Entities per batch

# Customize entity attributes
export ENVIRONMENT="production"            # Environment tag
export TEAM="platform"                     # Team ownership tag
```

### Multiple Cluster Support
```bash
# Monitor multiple clusters (comma-separated)
export KAFKA_CLUSTER_NAMES="prod-east,prod-west,staging"

# Cluster-specific settings
export PROD_EAST_BOOTSTRAP_SERVERS="kafka1:9092,kafka2:9092"
export PROD_WEST_BOOTSTRAP_SERVERS="kafka3:9092,kafka4:9092"
```

### Performance Tuning
```bash
# High-throughput clusters
export COLLECTION_INTERVAL=15              # More frequent collection
export BATCH_SIZE=500                      # Larger batches
export CONCURRENT_TRANSFORMERS=4           # Parallel processing

# Resource-constrained environments  
export COLLECTION_INTERVAL=60              # Less frequent collection
export BATCH_SIZE=50                       # Smaller batches
export MEMORY_LIMIT="512m"                 # Memory constraint
```

## Docker Deployment

### Using Docker Compose
```yaml
# docker-compose.yml
version: '3.8'
services:
  message-queues-platform:
    build: .
    environment:
      - NEW_RELIC_USER_API_KEY=${NEW_RELIC_USER_API_KEY}
      - NEW_RELIC_ACCOUNT_ID=${NEW_RELIC_ACCOUNT_ID}
      - PLATFORM_MODE=infrastructure
      - KAFKA_CLUSTER_NAME=production
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Deployment Commands
```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f message-queues-platform

# Scale for high availability
docker-compose up -d --scale message-queues-platform=2
```

### Kubernetes Deployment
```yaml
# k8s-deployment.yml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: message-queues-platform
spec:
  replicas: 2
  selector:
    matchLabels:
      app: message-queues-platform
  template:
    metadata:
      labels:
        app: message-queues-platform
    spec:
      containers:
      - name: platform
        image: newrelic/message-queues-platform:latest
        env:
        - name: NEW_RELIC_USER_API_KEY
          valueFrom:
            secretKeyRef:
              name: newrelic-secret
              key: user-api-key
        - name: NEW_RELIC_ACCOUNT_ID
          value: "1234567"
        - name: PLATFORM_MODE
          value: "infrastructure"
        command: ["node", "platform.js", "--mode=infrastructure", "--interval=30"]
```

## Monitoring the Platform

### Health Checks
```bash
# Platform health endpoint
curl http://localhost:3000/health

# Detailed status
curl http://localhost:3000/status
```

### Platform Metrics
The platform reports its own metrics:

```sql
-- Platform performance
FROM MessageQueuePlatform SELECT 
  average(transformationDuration),
  count(entitiesCreated),
  count(transformationErrors)
SINCE 1 hour ago TIMESERIES

-- Data quality metrics
FROM MessageQueuePlatform SELECT
  percentage(count(*), WHERE transformationSuccess = true)
SINCE 1 hour ago
```

### Alerting on Platform Issues
```sql
-- Alert if platform stops sending data
FROM MessageQueue SELECT count(*) 
WHERE entityType LIKE 'MESSAGE_QUEUE_%'
SINCE 5 minutes ago
HAVING count(*) < 10

-- Alert on transformation errors
FROM MessageQueuePlatform SELECT count(*)
WHERE transformationError IS NOT NULL
SINCE 5 minutes ago
HAVING count(*) > 5
```

## Troubleshooting

### No Entities Being Created

**Check 1**: nri-kafka data availability
```sql
FROM KafkaBrokerSample, KafkaTopicSample 
SELECT count(*) 
SINCE 1 hour ago
```

**Check 2**: API permissions
```bash
# Test NerdGraph access
curl -H "Api-Key: $NEW_RELIC_USER_API_KEY" \
     https://api.newrelic.com/graphql \
     -d '{"query": "{ actor { user { email } } }"}'
```

**Check 3**: Platform logs
```bash
DEBUG=* node platform.js --mode=infrastructure
```

### Partial Entity Creation

**Missing brokers**: Check JMX connectivity and firewall rules
**Missing topics**: Verify topic-level metrics are enabled in nri-kafka  
**Inconsistent data**: Check for clock skew between Kafka hosts

### Performance Issues

**Slow transformation**: Increase `CONCURRENT_TRANSFORMERS`
**High memory usage**: Reduce `BATCH_SIZE` 
**API rate limits**: Increase `COLLECTION_INTERVAL`

### Entity Synthesis Failures

**GUID conflicts**: Check for duplicate cluster names
**Missing attributes**: Verify entity has required fields
**Relationship errors**: Ensure proper entity hierarchy

## Production Best Practices

### High Availability
- Run multiple platform instances
- Use different collection intervals to spread load
- Monitor platform health and restart on failures

### Security
- Store API keys in secrets management
- Use least-privilege API keys
- Enable audit logging for compliance

### Performance
- Monitor platform resource usage
- Tune collection intervals based on cluster size
- Use caching for repeated transformations

### Monitoring
- Alert on platform health metrics
- Track entity creation rates
- Monitor transformation error rates

## Integration with Existing Monitoring

### Grafana Integration
```javascript
// Query MESSAGE_QUEUE entities in Grafana
const query = `
  FROM MessageQueue 
  SELECT average(throughput) 
  WHERE entityType = 'MESSAGE_QUEUE_BROKER'
  TIMESERIES
`;
```

### Prometheus Export
```bash
# Export metrics to Prometheus format
node tools/prometheus-exporter.js --port=9090
```

### Custom Dashboards
```javascript
// Create custom dashboard with MESSAGE_QUEUE data
const dashboard = {
  name: "Custom Kafka Monitoring",
  widgets: [
    {
      title: "Cluster Throughput",
      nrql: "FROM MessageQueue SELECT sum(throughput) WHERE entityType = 'MESSAGE_QUEUE_CLUSTER' TIMESERIES"
    }
  ]
};
```

## Migration from Simulation Mode

### Step-by-Step Migration
1. **Prepare infrastructure**: Ensure nri-kafka is working
2. **Test in parallel**: Run both modes simultaneously
3. **Validate data**: Compare simulation vs infrastructure metrics
4. **Switch dashboards**: Update dashboard queries to use infrastructure data
5. **Decommission simulation**: Stop simulation mode

### Data Validation
```sql
-- Compare entity counts
FROM MessageQueue SELECT count(*) 
WHERE entityType = 'MESSAGE_QUEUE_BROKER'
FACET source
SINCE 1 hour ago

-- Validate metric values
FROM MessageQueue SELECT 
  average(throughput) as avgThroughput,
  max(errorRate) as maxErrorRate
WHERE entityType = 'MESSAGE_QUEUE_TOPIC'
FACET source
```

---

**Next**: [Production Deployment](production-deployment.md) | [Performance Tuning](performance-tuning.md) | [Monitoring the Platform](monitoring-platform.md)