# Complete Infrastructure Setup Guide

This guide walks through setting up Kafka with nri-kafka and the New Relic infrastructure agent to use the Message Queues Platform in infrastructure mode.

## Prerequisites

- Docker and Docker Compose installed
- New Relic account with API access
- Kafka cluster (local or production)

## Quick Start - Local Testing

### 1. Start Local Kafka Cluster

```bash
cd infrastructure
docker-compose up -d
```

Wait about 30 seconds for initialization. Verify Kafka is running:

```bash
docker-compose ps
# Should show kafka, zookeeper, and kafka-ui containers running
```

Access Kafka UI at http://localhost:8080 to monitor your cluster.

### 2. Test Infrastructure Mode with Simulated Data

First, test with simulated nri-kafka data:

```bash
# Test with dry-run (no data sent to New Relic)
DRY_RUN=true node test-infrastructure-pipeline.js

# Test local Kafka simulation
NEW_RELIC_ACCOUNT_ID=your_account_id \
NEW_RELIC_API_KEY=your_api_key \
DRY_RUN=true \
node infrastructure/test-local-kafka.js
```

### 3. Run Platform in Infrastructure Mode

```bash
# With real credentials (sends data to New Relic)
NEW_RELIC_ACCOUNT_ID=your_account_id \
NEW_RELIC_API_KEY=your_api_key \
node platform.js --mode infrastructure --interval 30

# Test mode with simulated data
node platform.js --mode infrastructure --interval 30 --debug
```

## Production Setup with nri-kafka

### 1. Install New Relic Infrastructure Agent

On your Kafka servers:

```bash
# Ubuntu/Debian
curl -Ls https://download.newrelic.com/install/newrelic-cli/scripts/install.sh | bash
sudo NEW_RELIC_API_KEY=your_key NEW_RELIC_ACCOUNT_ID=your_account /usr/local/bin/newrelic install

# CentOS/RHEL
sudo yum install newrelic-infra
```

### 2. Install nri-kafka Integration

```bash
# Install the Kafka integration
sudo apt-get install nri-kafka # Debian/Ubuntu
sudo yum install nri-kafka     # CentOS/RHEL
```

### 3. Configure nri-kafka

Edit `/etc/newrelic-infra/integrations.d/kafka-config.yml`:

```yaml
integrations:
  - name: nri-kafka
    env:
      CLUSTER_NAME: production-kafka
      KAFKA_VERSION: "2.8.0"
      AUTODISCOVER_STRATEGY: zookeeper
      ZOOKEEPER_HOSTS: '[{"host": "localhost", "port": 2181}]'
      COLLECT_BROKER_TOPIC_DATA: true
      TOPIC_MODE: all
      COLLECT_TOPIC_SIZE: true
    interval: 30s
```

For JMX-based collection:

```yaml
integrations:
  - name: nri-kafka
    env:
      CLUSTER_NAME: production-kafka
      KAFKA_VERSION: "2.8.0"
      BOOTSTRAP_BROKER_HOST: localhost
      BOOTSTRAP_BROKER_KAFKA_PORT: 9092
      BOOTSTRAP_BROKER_JMX_PORT: 9999
      COLLECT_BROKER_TOPIC_DATA: true
      TOPIC_MODE: all
    interval: 30s
```

### 4. Verify Data Collection

Check that nri-kafka is sending data:

```sql
-- In New Relic Query Builder
FROM KafkaBrokerSample SELECT * SINCE 5 minutes ago
FROM KafkaTopicSample SELECT * SINCE 5 minutes ago
```

### 5. Run Platform in Infrastructure Mode

Once nri-kafka data is flowing:

```bash
NEW_RELIC_ACCOUNT_ID=your_account_id \
NEW_RELIC_API_KEY=your_api_key \
node platform.js --mode infrastructure --interval 60
```

## Entity Synthesis and Verification

### Wait for Entity Synthesis

After running the platform, wait 2-3 minutes for New Relic to synthesize the MESSAGE_QUEUE entities.

### Verify Entities

Run these NRQL queries:

```sql
-- Count all MESSAGE_QUEUE entities
FROM MessageQueue 
SELECT count(*) 
WHERE entityType LIKE 'MESSAGE_QUEUE_%' 
SINCE 5 minutes ago

-- View clusters
FROM MessageQueue 
SELECT latest(cluster.health.score), latest(cluster.brokerCount) 
WHERE entityType = 'MESSAGE_QUEUE_CLUSTER' 
FACET clusterName

-- View consumer groups and lag
FROM MessageQueue 
SELECT latest(consumerGroup.totalLag), latest(consumerGroup.state) 
WHERE entityType = 'MESSAGE_QUEUE_CONSUMER_GROUP' 
FACET consumerGroupId

-- Check entity relationships
FROM Relationship 
SELECT * 
WHERE sourceEntityType = 'MESSAGE_QUEUE_CLUSTER' 
OR targetEntityType LIKE 'MESSAGE_QUEUE_%'
```

## Hybrid Mode - Best of Both Worlds

Hybrid mode combines real infrastructure data with simulated data to fill gaps:

```bash
# Hybrid mode - fills missing entities with simulation
NEW_RELIC_ACCOUNT_ID=your_account_id \
NEW_RELIC_API_KEY=your_api_key \
node platform.js --mode hybrid --interval 60
```

Hybrid mode will:
1. Query real nri-kafka data
2. Transform to MESSAGE_QUEUE entities
3. Detect missing entities (topics, consumer groups)
4. Simulate missing entities to provide complete coverage

## Troubleshooting

### No Data Appearing

1. Check nri-kafka is installed and running:
   ```bash
   sudo systemctl status newrelic-infra
   sudo cat /var/log/newrelic-infra/newrelic-infra.log | grep kafka
   ```

2. Verify Kafka JMX is enabled:
   ```bash
   # Test JMX connection
   jconsole localhost:9999
   ```

3. Check entity GUIDs are correct:
   ```bash
   # Enable debug mode
   DEBUG=platform:*,transform:* node platform.js --mode infrastructure
   ```

### Entity Synthesis Issues

1. Ensure GUID format is exact:
   - Pattern: `MESSAGE_QUEUE_{TYPE}|{accountId}|kafka|{cluster}|{identifier}`
   - Example: `MESSAGE_QUEUE_BROKER|12345|kafka|prod-cluster|broker-1`

2. Check required fields are present:
   - eventType: must be "MessageQueue"
   - entityType: must be MESSAGE_QUEUE_*
   - entityGuid: must follow pattern
   - All required tags must be present

### Performance Issues

1. Adjust collection interval:
   ```bash
   # Collect every 2 minutes instead of 1
   node platform.js --mode infrastructure --interval 120
   ```

2. Use infrastructure mode caching (when implemented):
   ```bash
   # Future: Enable caching
   node platform.js --mode infrastructure --cache
   ```

## Dashboard Creation

Once entities are synthesized, create dashboards:

```bash
# List available templates
node dashboards/cli.js list-templates

# Create infrastructure dashboards
node dashboards/cli.js create \
  --template kafka-cluster-health \
  --name "Production Kafka Health"

node dashboards/cli.js create \
  --template kafka-consumer-groups \
  --name "Consumer Group Monitoring"
```

## Next Steps

1. **Set up alerts** on consumer lag and broker health
2. **Create custom dashboards** for your specific use cases
3. **Enable additional nri-kafka features** like consumer group monitoring
4. **Scale to multiple clusters** by deploying on each cluster
5. **Use hybrid mode** for complete visibility

## Support

- Check infrastructure/README.md for detailed configuration
- Run tests with `test-infrastructure-pipeline.js`
- Enable debug mode with `--debug` flag
- See CLAUDE.md for development guidelines