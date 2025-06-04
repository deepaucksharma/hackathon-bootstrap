# Complete Strimzi Kafka Setup with New Relic Integration

This directory contains a production-ready Kafka deployment using Strimzi operator with full JMX monitoring via New Relic.

## Directory Structure

```
strimzi-kafka-setup/
├── strimzi-operator-install.sh      # Installs Strimzi operator
├── kafka-cluster-strimzi.yaml       # Main Kafka cluster configuration
├── kafka-topics.yaml                # Topic definitions
├── kafka-users.yaml                 # User authentication/authorization
├── nri-kafka-strimzi-config.yaml   # New Relic integration config
├── kafka-test-clients-strimzi.yaml # Test producer/consumer deployments
├── deploy-strimzi-kafka.sh         # Complete deployment script
├── verify-strimzi-deployment.sh    # Verification script
└── README.md                        # This file
```

## Quick Start

1. **Deploy everything:**
   ```bash
   chmod +x deploy-strimzi-kafka.sh
   ./deploy-strimzi-kafka.sh
   ```

2. **Verify deployment:**
   ```bash
   chmod +x verify-strimzi-deployment.sh
   ./verify-strimzi-deployment.sh
   ```

## Features

- **Strimzi Operator**: Latest version (0.38.0) for Kubernetes-native Kafka management
- **3-node Kafka cluster**: High availability with anti-affinity rules
- **3-node Zookeeper ensemble**: Reliable coordination service
- **JMX Monitoring**: Full JMX metrics exposed for New Relic
- **Security**: SCRAM-SHA-512 authentication with ACL authorization
- **Topics**: Pre-configured topics with different retention policies
- **Test Clients**: Producer and consumer deployments for testing
- **Resource Management**: Proper CPU/memory limits and requests
- **Storage**: Persistent volumes for data durability

## Configuration Details

### Kafka Cluster
- Version: 3.5.1
- Replicas: 3
- Storage: 100Gi per broker (JBOD)
- JVM: 1.5GB heap
- Listeners: Plain (9092) and TLS (9093)

### Topics
1. **events**: 10 partitions, 7-day retention, snappy compression
2. **logs**: 20 partitions, 3-day retention, gzip compression
3. **metrics**: 15 partitions, 2-day retention, lz4 compression

### Users
1. **producer-user**: Write access to all topics
2. **consumer-user**: Read access to all topics
3. **admin-user**: Full cluster admin access

### New Relic Integration
- Uses Zookeeper discovery
- JMX authentication with Strimzi certificates
- Collects metrics, inventory, and events
- 30-second collection interval

## Endpoints

- **Kafka Bootstrap**: `production-kafka-kafka-bootstrap.strimzi-kafka.svc.cluster.local:9092`
- **Zookeeper**: `production-kafka-zookeeper-client.strimzi-kafka.svc.cluster.local:2181`
- **JMX Port**: `9999` (with TLS and authentication)

## Monitoring

Check New Relic with this NRQL query:
```sql
FROM KafkaBrokerSample 
SELECT * 
WHERE clusterName = 'strimzi-production-kafka' 
SINCE 5 minutes ago
```

## Troubleshooting

1. **Check operator logs:**
   ```bash
   kubectl -n strimzi-kafka logs deployment/strimzi-cluster-operator
   ```

2. **Check Kafka status:**
   ```bash
   kubectl -n strimzi-kafka describe kafka production-kafka
   ```

3. **Check New Relic integration:**
   ```bash
   kubectl -n newrelic logs deployment/nri-kafka-strimzi -f
   ```

4. **List topics:**
   ```bash
   kubectl -n strimzi-kafka exec -it production-kafka-kafka-0 -- \
     bin/kafka-topics.sh --bootstrap-server localhost:9092 --list
   ```

## Verification and Troubleshooting Tools

### Available Scripts

1. **comprehensive-health-check.sh** - Complete health assessment
   ```bash
   ./comprehensive-health-check.sh
   ```

2. **automated-troubleshooter.sh** - Diagnose and fix common issues
   ```bash
   ./automated-troubleshooter.sh
   ```

3. **realtime-monitor.sh** - Live monitoring dashboard
   ```bash
   ./realtime-monitor.sh
   ```

4. **end-to-end-test.sh** - Full functionality test suite
   ```bash
   ./end-to-end-test.sh
   ```

### Additional Resources

- **manual-verification-guide.md** - Step-by-step manual verification procedures
- **quick-debug-commands.md** - Copy-paste commands for common issues

## Clean Up

To remove the entire deployment:
```bash
kubectl delete namespace strimzi-kafka
kubectl delete deployment nri-kafka-strimzi -n newrelic
kubectl delete configmap nri-kafka-strimzi-config -n newrelic
kubectl delete secret kafka-jmx-secret -n newrelic
```