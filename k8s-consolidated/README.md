# Consolidated Kafka Monitoring Setup

This directory contains the complete, production-ready configuration for monitoring Kafka with New Relic on Kubernetes, including full AWS MSK compatibility.

## Overview

This setup provides:
- ✅ **Standard Kafka metrics** via nri-kafka integration (KafkaBrokerSample, KafkaTopicSample, etc.)
- ✅ **AWS MSK-compatible metrics** via comprehensive MSK shim (AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample)
- ✅ **Cluster-level aggregation** for health and performance monitoring
- ✅ **Consumer lag tracking** with MSK-compatible formatting
- ✅ **Automated deployment** with validation scripts
- ✅ **Optimized configuration** with all features enabled

## Architecture

The deployment uses the comprehensive MSK shim implementation:

```
Kafka Cluster (JMX) → nri-kafka → ComprehensiveMSKShim → New Relic
                           ↓                    ↓
                    Standard Metrics      MSK-Compatible Metrics
                           ↓                    ↓
                    KafkaBrokerSample    AwsMskBrokerSample
                    KafkaTopicSample     AwsMskTopicSample
                    KafkaOffsetSample    AwsMskClusterSample
```

## Directory Structure

```
k8s-consolidated/
├── kafka/                    # Kafka cluster configurations
│   └── 01-kafka-cluster.yaml # Strimzi Kafka with JMX enabled
├── nri-kafka/               # New Relic monitoring configurations
│   ├── 01-configmap.yaml    # Integration configuration
│   ├── 02-standard-deployment.yaml  # Standard metrics collection
│   └── 03-msk-shim-deployment.yaml  # MSK shim with comprehensive transformer
├── scripts/                 # Automation scripts
│   ├── deploy.sh           # Full deployment script
│   ├── verify-metrics.sh   # Verify metrics in NRDB
│   ├── cleanup.sh          # Remove old duplicate files
│   └── generate-test-traffic.sh  # Generate test data
├── configs/                 # Additional configurations
│   ├── msk-shim-enhanced.yaml    # Enhanced MSK shim config
│   ├── nri-kafka-complete.yaml   # Complete integration config
│   └── test-workloads.yaml       # Test producers/consumers
└── README.md               # This file
```

## Quick Start

### Prerequisites

- Kubernetes cluster (1.19+)
- kubectl configured
- New Relic license key (already configured in files)

### Deploy Everything

```bash
cd k8s-consolidated/scripts
./deploy.sh
```

This script will:
1. Create namespace (default: strimzi-kafka)
2. Install Strimzi operator
3. Deploy Kafka cluster with JMX enabled
4. Deploy nri-kafka monitoring
5. Deploy MSK shim
6. Create test topics
7. Verify deployment

### Verify Metrics

After deployment, wait 3-5 minutes, then:

```bash
./verify-metrics.sh
```

This uses the API keys from `.env` file to query NRDB and verify both standard and MSK metrics.

## Configuration Details

### Kafka Cluster
- **Version**: 3.9.0
- **Replicas**: 3 brokers
- **JMX Port**: 9999 (no authentication)
- **Storage**: 100Gi per broker
- **Topics**: Auto-created test topics

### NRI-Kafka Integration
- **Cluster Name**: kafka-k8s-monitoring
- **Discovery**: Bootstrap strategy
- **Collections**: All enabled (topics, offsets, sizes, consumer groups)
- **Interval**: 30 seconds

### MSK Shim
- **AWS Account**: 123456789012 (dummy)
- **Region**: us-east-1
- **Creates**: AwsMskClusterSample, AwsMskBrokerSample, AwsMskTopicSample

## Monitoring

### Check Logs

```bash
# Standard integration logs
kubectl logs -l app=nri-kafka -n strimzi-kafka --tail=50

# MSK shim logs
kubectl logs -l app=nri-kafka-msk-shim -n strimzi-kafka --tail=50

# Kafka broker logs
kubectl logs production-kafka-0 -n strimzi-kafka
```

### Expected Metrics in NRDB

**Standard Metrics:**
- `KafkaBrokerSample` - Broker performance metrics
- `KafkaTopicSample` - Topic-level metrics
- `KafkaOffsetSample` - Consumer lag metrics
- `KafkaProducerSample` - Producer metrics (if JMX enabled on producers)
- `KafkaConsumerSample` - Consumer metrics (if JMX enabled on consumers)

**MSK Shim Metrics:**
- `AwsMskClusterSample` - Cluster-level MSK metrics
- `AwsMskBrokerSample` - Broker-level MSK metrics
- `AwsMskTopicSample` - Topic-level MSK metrics

### NRQL Queries

```sql
-- Check standard metrics
FROM KafkaBrokerSample 
SELECT count(*) 
WHERE clusterName = 'kafka-k8s-monitoring' 
SINCE 5 minutes ago

-- Check MSK metrics
FROM AwsMskBrokerSample 
SELECT count(*) 
WHERE clusterName = 'kafka-k8s-monitoring' 
SINCE 5 minutes ago

-- View throughput
FROM KafkaBrokerSample 
SELECT average(broker.messagesInPerSecond) 
WHERE clusterName = 'kafka-k8s-monitoring' 
TIMESERIES SINCE 1 hour ago
```

## Troubleshooting

### No Metrics Appearing

1. **Check pod status:**
   ```bash
   kubectl get pods -n strimzi-kafka | grep -E "(kafka|nri)"
   ```

2. **Verify JMX connectivity:**
   ```bash
   kubectl exec production-kafka-0 -n strimzi-kafka -- \
     netstat -tlnp | grep 9999
   ```

3. **Check integration config:**
   ```bash
   kubectl describe configmap nri-kafka-config -n strimzi-kafka
   ```

### Wrong Cluster Name

Edit the ConfigMap and restart pods:
```bash
kubectl edit configmap nri-kafka-config -n strimzi-kafka
kubectl rollout restart daemonset/nri-kafka -n strimzi-kafka
kubectl rollout restart deployment/nri-kafka-msk-shim -n strimzi-kafka
```

### JMX Connection Issues

Ensure Kafka brokers have JMX enabled:
```bash
kubectl exec production-kafka-0 -n strimzi-kafka -- env | grep JMX
```

## Cleanup

To remove old duplicate files from the repository:

```bash
# Dry run to see what would be deleted
./cleanup.sh --dry-run

# Actually remove files
./cleanup.sh
```

## Maintenance

### Update Kafka Version

Edit `kafka/01-kafka-cluster.yaml` and change the version:
```yaml
spec:
  kafka:
    version: 3.9.0  # Change this
```

Then apply:
```bash
kubectl apply -f ../kafka/01-kafka-cluster.yaml
```

### Scale Kafka Cluster

```bash
kubectl scale kafka production-kafka --replicas=5 -n strimzi-kafka
```

### Update Integration Config

Edit ConfigMap and restart:
```bash
kubectl edit configmap nri-kafka-config -n strimzi-kafka
kubectl rollout restart daemonset/nri-kafka -n strimzi-kafka
```

## Support

For issues:
1. Check logs with verbose mode enabled
2. Run verification script
3. Review troubleshooting section
4. Check New Relic documentation