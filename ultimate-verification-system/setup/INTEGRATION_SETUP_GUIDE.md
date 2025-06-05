# New Relic Kafka Integration Setup Guide - Implementation Details

This guide provides comprehensive setup instructions based on the codebase requirements and discovered nuances.

## Prerequisites

### For AWS MSK
- AWS Account with appropriate IAM permissions
- MSK cluster(s) with Enhanced Monitoring enabled (required for full metrics)
- Network connectivity from integration host to MSK brokers (port 9092/9094)
- JMX enabled on MSK brokers (port 9999)

### For Confluent Cloud
- Confluent Cloud account with API Key
- Cluster ID and Environment ID
- Metrics API access enabled

### For New Relic
- New Relic account with Infrastructure Pro
- Valid New Relic License Key
- API Key for verification queries

## Integration Installation

### 1. Infrastructure Agent Installation

```bash
# Ubuntu/Debian
curl -Ls https://download.newrelic.com/install/newrelic-cli/scripts/install.sh | bash
sudo NEW_RELIC_API_KEY=YOUR_API_KEY NEW_RELIC_ACCOUNT_ID=YOUR_ACCOUNT_ID /usr/local/bin/newrelic install

# RHEL/CentOS
sudo yum install newrelic-infra -y

# Docker
docker run \
  -d \
  --name newrelic-infra \
  --network=host \
  --cap-add=SYS_PTRACE \
  --privileged \
  --pid=host \
  -v "/:/host:ro" \
  -v "/var/run/docker.sock:/var/run/docker.sock" \
  -e NRIA_LICENSE_KEY=YOUR_LICENSE_KEY \
  newrelic/infrastructure:latest
```

### 2. Kafka Integration Installation

```bash
# Download and install the integration
sudo apt-get update
sudo apt-get install nri-kafka

# Or via tarball
wget https://download.newrelic.com/infrastructure_agent/binaries/linux/amd64/nri-kafka_linux_amd64.tar.gz
sudo tar -xzvf nri-kafka_linux_amd64.tar.gz -C /
```

### 3. Critical Environment Variables

Based on codebase analysis, these environment variables are CRITICAL:

```bash
# MOST CRITICAL - Without this, dimensional metrics won't work!
export NRI_KAFKA_USE_DIMENSIONAL=true
export MSK_USE_DIMENSIONAL=true

# Required for AWS MSK UI visibility
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=us-east-1
export KAFKA_CLUSTER_NAME=my-msk-cluster

# Integration behavior
export KAFKA_BOOTSTRAP_SERVERS=b-1.cluster.kafka.region.amazonaws.com:9092
export KAFKA_VERSION=2.8.0
export JMX_HOST=localhost
export JMX_PORT=9999

# Performance tuning
export KAFKA_REQUEST_TIMEOUT_MS=30000
export CONSUMER_GROUP_REGEX=".*"
export TOPIC_REGEX=".*"
export TOPIC_BUCKET_SIZE=10000
```

## Configuration Files

### 4. AWS MSK Configuration (/etc/newrelic-infra/integrations.d/kafka-config.yml)

```yaml
integrations:
  - name: nri-kafka
    env:
      # CRITICAL: These fields MUST be set for UI visibility
      NRI_KAFKA_USE_DIMENSIONAL: true
      MSK_USE_DIMENSIONAL: true
      
      # Cluster identification
      CLUSTER_NAME: ${KAFKA_CLUSTER_NAME}
      AWS_ACCOUNT_ID: ${AWS_ACCOUNT_ID}
      AWS_REGION: ${AWS_REGION}
      
      # Connection settings
      BOOTSTRAP_BROKER_KAFKA_VERSION: ${KAFKA_VERSION}
      BOOTSTRAP_BROKER_HOST: ${KAFKA_BOOTSTRAP_SERVERS}
      
      # JMX settings for each broker
      BROKERS: >-
        [
          {
            "host": "b-1.cluster.kafka.region.amazonaws.com",
            "port": 9999,
            "jmx_user": "",
            "jmx_pass": ""
          },
          {
            "host": "b-2.cluster.kafka.region.amazonaws.com", 
            "port": 9999,
            "jmx_user": "",
            "jmx_pass": ""
          },
          {
            "host": "b-3.cluster.kafka.region.amazonaws.com",
            "port": 9999,
            "jmx_user": "",
            "jmx_pass": ""
          }
        ]
      
      # Topic configuration
      COLLECT_TOPICS: true
      TOPIC_MODE: ALL
      TOPIC_BUCKET_SIZE: 10000
      
      # Consumer group configuration  
      COLLECT_CONSUMER_GROUPS: true
      CONSUMER_GROUP_REGEX: ".*"
      
      # Performance settings
      REQUEST_TIMEOUT_MS: 30000
      METADATA_TIMEOUT_MS: 10000
      
    interval: 60s
    inventory_source: config/kafka
    
    # CRITICAL: Labels for entity synthesis
    labels:
      provider: AwsMskCluster
      instrumentation.provider: aws
      providerAccountId: ${AWS_ACCOUNT_ID}
      providerAccountName: ${AWS_ACCOUNT_NAME}
```

### 5. Confluent Cloud Configuration

```yaml
integrations:
  - name: nri-kafka
    env:
      NRI_KAFKA_USE_DIMENSIONAL: true
      
      # Cluster identification
      CLUSTER_NAME: ${CONFLUENT_CLUSTER_NAME}
      CONFLUENT_CLOUD_CLUSTER_ID: ${CLUSTER_ID}
      CONFLUENT_CLOUD_ENV_ID: ${ENV_ID}
      
      # API Configuration
      CONFLUENT_CLOUD_API_KEY: ${API_KEY}
      CONFLUENT_CLOUD_API_SECRET: ${API_SECRET}
      
      # Metrics endpoint
      METRICS_ENDPOINT: https://api.telemetry.confluent.cloud/v2/metrics/cloud/query
      
    interval: 60s
    
    labels:
      provider: ConfluentCloudCluster
      account: ${CONFLUENT_ACCOUNT_NAME}
      environment: ${CONFLUENT_ENV_NAME}
      kafka_env_id: ${ENV_ID}
```

### 6. Kubernetes Deployment

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nri-kafka-config
  namespace: newrelic
data:
  kafka-config.yml: |
    integrations:
      - name: nri-kafka
        env:
          NRI_KAFKA_USE_DIMENSIONAL: "true"
          MSK_USE_DIMENSIONAL: "true"
          CLUSTER_NAME: "production-msk"
          AWS_ACCOUNT_ID: "123456789012"
          AWS_REGION: "us-east-1"
          # ... rest of config
---
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: newrelic-kafka
  namespace: newrelic
spec:
  selector:
    matchLabels:
      app: newrelic-kafka
  template:
    metadata:
      labels:
        app: newrelic-kafka
    spec:
      containers:
      - name: newrelic-kafka
        image: newrelic/infrastructure:latest
        env:
        - name: NRIA_LICENSE_KEY
          valueFrom:
            secretKeyRef:
              name: newrelic-license
              key: license-key
        - name: NRI_KAFKA_USE_DIMENSIONAL
          value: "true"
        - name: MSK_USE_DIMENSIONAL
          value: "true"
        volumeMounts:
        - name: config
          mountPath: /etc/newrelic-infra/integrations.d/
        resources:
          limits:
            memory: 512Mi
          requests:
            memory: 256Mi
            cpu: 100m
      volumes:
      - name: config
        configMap:
          name: nri-kafka-config
```

## Critical Field Mappings

Based on codebase analysis, these fields MUST be present:

### AWS MSK Required Fields
```
Event Fields (AwsMskClusterSample):
- provider: "AwsMskCluster" (CRITICAL)
- awsAccountId: AWS account ID (CRITICAL)
- awsRegion: AWS region (CRITICAL)
- instrumentation.provider: "aws" (CRITICAL)
- providerAccountId: Same as awsAccountId
- providerAccountName: Human-readable name
- entityName: Cluster name
- entity.guid: Unique identifier

Metrics (provider.* prefix):
- provider.activeControllerCount.Sum
- provider.offlinePartitionsCount.Sum
- provider.underReplicatedPartitions.Sum
- provider.globalPartitionCount.Average
- provider.bytesInPerSec.Average
- provider.messagesInPerSec.Average
```

### Confluent Cloud Required Fields
```
Event Fields:
- tags.account: Account name
- tags.kafka_env_id: Environment ID
- tags.environment: Environment name
- id: Cluster ID
- cluster_name: Cluster name
- timestamp: Unix timestamp

Metrics (direct names):
- cluster_received_bytes (divide by 60 for UI)
- cluster_sent_bytes (divide by 60 for UI)
- cluster_received_records (divide by 60 for UI)
- current_controller_id
- offline_partition_count
```

## Network Requirements

### AWS MSK
```bash
# Test connectivity to brokers
for broker in b-1.cluster.kafka.region.amazonaws.com b-2.cluster.kafka.region.amazonaws.com; do
  echo "Testing $broker"
  nc -zv $broker 9092  # Kafka port
  nc -zv $broker 9999  # JMX port
done

# Security group rules needed:
# - Ingress: TCP 9092 (Kafka)
# - Ingress: TCP 9999 (JMX)
# - Egress: TCP 443 (New Relic API)
```

### IAM Permissions for AWS MSK
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "kafka:DescribeCluster",
        "kafka:DescribeClusterOperation",
        "kafka:ListClusters",
        "kafka:ListNodes",
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:ListMetrics"
      ],
      "Resource": "*"
    }
  ]
}
```

## Verification Steps

After installation, verify the integration is working:

### 1. Check Integration Status
```bash
# Check if integration is running
sudo systemctl status newrelic-infra

# Check integration logs
sudo journalctl -u newrelic-infra | grep -i kafka

# Look for dimensional metric messages
sudo grep -i "dimensional" /var/log/newrelic-infra/newrelic-infra.log
```

### 2. Run Quick Verification
```bash
# Use the provided verification script
cd ultimate-verification-system
./verify-single-cluster.sh YOUR_API_KEY YOUR_NR_ACCOUNT "your-cluster-name"
```

### 3. Check New Relic UI
1. Navigate to Infrastructure > Third-party services
2. Look for Kafka/AWS MSK
3. If clusters don't appear, check UI visibility fields using verification queries

## Common Setup Issues

### Issue: "Clusters not appearing in UI"
**Root Cause**: Missing UI visibility fields
**Solution**: 
1. Ensure `NRI_KAFKA_USE_DIMENSIONAL=true` is set
2. Verify all provider fields are configured
3. Check labels section includes instrumentation.provider

### Issue: "No metrics data"
**Root Cause**: JMX connectivity issues
**Solution**:
1. Test JMX port connectivity
2. Verify JMX is enabled on brokers
3. Check firewall/security group rules

### Issue: "Incomplete metrics"
**Root Cause**: MSK Enhanced Monitoring not enabled
**Solution**:
1. Enable Enhanced Monitoring in MSK console
2. Set monitoring level to PER_BROKER or PER_TOPIC_PER_BROKER
3. Wait 5-10 minutes for metrics to appear

### Issue: "High memory usage"
**Root Cause**: Too many topics/consumer groups
**Solution**:
1. Use TOPIC_REGEX to filter topics
2. Increase TOPIC_BUCKET_SIZE
3. Set TOPIC_MODE to LIST with specific topics

## Performance Tuning

Based on codebase patterns:

```yaml
env:
  # Optimize for large clusters
  TOPIC_BUCKET_SIZE: 20000  # Increase for >10k topics
  REQUEST_TIMEOUT_MS: 60000  # Increase for slow networks
  
  # Reduce collection scope
  TOPIC_REGEX: "^(?!__consumer_offsets).*"  # Exclude internal topics
  CONSUMER_GROUP_REGEX: "^app-.*"  # Only app consumer groups
  
  # Memory optimization
  JVM_OPTS: "-Xmx512m -Xms256m"
```

## Monitoring the Integration

Create alerts for integration health:

```sql
-- Alert if integration stops reporting
SELECT count(*)
FROM SystemSample
WHERE processDisplayName LIKE '%kafka%'
FACET hostname
SINCE 5 minutes ago
```

```sql
-- Alert if dimensional metrics stop
FROM Metric
SELECT count(*)
WHERE metricName LIKE 'kafka.%'
SINCE 5 minutes ago
```

## Next Steps

1. Run the complete verification suite: `node ultimate-verification-runner.js`
2. Set up automated monitoring using the verification queries
3. Configure alerts for critical metrics
4. Review the troubleshooting guide for common issues