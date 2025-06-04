# Minikube Consolidated Kafka MSK Monitoring Setup

This directory contains the complete, production-ready configuration for monitoring Kafka with New Relic on Minikube, including full AWS MSK compatibility through the MSK shim.

## Overview

This setup provides:
- ✅ **Kafka deployment** optimized for Minikube resources
- ✅ **New Relic monitoring** with nri-kafka integration
- ✅ **MSK shim enabled** for AWS MSK-compatible metrics
- ✅ **Automated deployment** scripts
- ✅ **Verification tools** for troubleshooting

## Architecture

```
Minikube Cluster
├── kafka namespace
│   ├── Kafka StatefulSet (1 broker, KRaft mode)
│   ├── Kafka Services (headless + regular)
│   ├── Test Producer (generates messages)
│   └── Test Consumer (consumes messages)
├── strimzi-kafka namespace
│   ├── Strimzi Operator
│   ├── Kafka Cluster (managed by Strimzi)
│   └── Kafka Topics (auto-created)
└── newrelic namespace
    ├── nri-kafka DaemonSet
    └── ConfigMap (MSK shim enabled)
```

## Quick Start

```bash
# 1. Ensure prerequisites
minikube status
docker ps

# 2. Deploy everything
cd scripts
./deploy-all.sh

# 3. Verify deployment
./verify-deployment.sh

# 4. Check metrics in New Relic
./check-nrdb-metrics.sh
```

## Directory Structure

```
minikube-consolidated/
├── README.md                    # This file
├── kafka/                       # Kafka deployment files
│   ├── 01-namespace.yaml       # Namespace creation
│   ├── 02-kafka-statefulset.yaml # Kafka broker
│   ├── 03-kafka-services.yaml  # Kafka services
│   └── 04-test-workloads.yaml  # Producer/Consumer
├── strimzi/                     # Strimzi-managed Kafka
│   ├── 01-operator.yaml        # Strimzi operator
│   └── 02-kafka-cluster.yaml   # Kafka cluster CRD
├── monitoring/                  # New Relic monitoring
│   ├── 01-namespace.yaml       # Monitoring namespace
│   ├── 02-configmap.yaml       # nri-kafka config
│   ├── 03-rbac.yaml           # Permissions
│   └── 04-daemonset.yaml      # nri-kafka deployment
├── scripts/                     # Automation scripts
│   ├── deploy-all.sh          # One-click deployment
│   ├── verify-deployment.sh   # Health checks
│   ├── check-nrdb-metrics.sh  # Metric verification
│   ├── troubleshoot.sh        # Debug helper
│   └── cleanup.sh             # Remove everything
└── all-in-one/                 # Single-file deployments
    ├── kafka-complete.yaml     # All Kafka resources
    └── monitoring-complete.yaml # All monitoring resources
```

## Configuration Details

### Kafka Configuration
- **Mode**: KRaft (no Zookeeper)
- **Brokers**: 1 (optimized for Minikube)
- **Storage**: 5Gi per broker
- **Memory**: 1-2Gi per broker
- **JMX Port**: 9999 (no authentication)

### MSK Shim Configuration
```yaml
MSK_SHIM_ENABLED: "true"
AWS_ACCOUNT_ID: "123456789012"
AWS_REGION: "us-east-1"
KAFKA_CLUSTER_NAME: "minikube-kafka"
```

### Resource Limits
Optimized for Minikube with 4 CPUs and 8GB RAM:
- Kafka: 1Gi memory, 500m CPU
- nri-kafka: 512Mi memory, 200m CPU
- Test workloads: 256Mi memory, 100m CPU

## Deployment Instructions

### Prerequisites
1. Minikube running with adequate resources:
   ```bash
   minikube start --cpus=4 --memory=8192 --disk-size=30g
   ```

2. Docker running (required for Minikube)

3. kubectl configured for Minikube context

### Step-by-Step Deployment

1. **Deploy Kafka**
   ```bash
   kubectl apply -f kafka/
   ```

2. **Deploy Strimzi (Optional)**
   ```bash
   kubectl apply -f strimzi/
   ```

3. **Deploy Monitoring**
   ```bash
   kubectl apply -f monitoring/
   ```

### Or use the automated script:
```bash
./scripts/deploy-all.sh
```

## Verification

### 1. Check Pod Status
```bash
kubectl get pods --all-namespaces | grep -E "(kafka|newrelic)"
```

### 2. Verify JMX Connectivity
```bash
kubectl exec -n kafka kafka-0 -- nc -zv localhost 9999
```

### 3. Check nri-kafka Logs
```bash
kubectl logs -l app=nri-kafka -n newrelic --tail=50
```

### 4. Verify Metrics in NRDB
```bash
export UKEY=<your-api-key>
export ACC=<your-account-id>
./scripts/check-nrdb-metrics.sh
```

## Expected Metrics

### Standard Kafka Metrics
- `KafkaBrokerSample` - Broker performance
- `KafkaTopicSample` - Topic metrics
- `KafkaOffsetSample` - Consumer lag

### MSK Shim Metrics
- `AwsMskClusterSample` - Cluster aggregation
- `AwsMskBrokerSample` - MSK broker format
- `AwsMskTopicSample` - MSK topic format

## Troubleshooting

### Common Issues

1. **Pods not starting**
   - Check: `kubectl describe pod <pod-name> -n <namespace>`
   - Common cause: Insufficient resources

2. **No JMX connectivity**
   - Verify: JMX port 9999 is exposed
   - Check: Kafka environment variables

3. **No metrics in New Relic**
   - Verify: License key is correct
   - Check: Network connectivity from Minikube
   - Review: nri-kafka logs for errors

4. **MSK metrics not appearing**
   - Ensure: MSK_SHIM_ENABLED=true
   - Check: AWS_ACCOUNT_ID is set
   - Verify: Cluster name matches

### Debug Commands
```bash
# All-in-one troubleshooting
./scripts/troubleshoot.sh

# Manual checks
kubectl logs kafka-0 -n kafka
kubectl logs -l app=nri-kafka -n newrelic
kubectl exec -n kafka kafka-0 -- kafka-topics.sh --list --bootstrap-server localhost:9092
```

## Cleanup

To remove all resources:
```bash
./scripts/cleanup.sh
```

Or manually:
```bash
kubectl delete namespace kafka strimzi-kafka newrelic
```

## Advanced Usage

### Scale Kafka Brokers
Not recommended for Minikube, but possible:
```bash
kubectl scale statefulset kafka --replicas=3 -n kafka
```

### Add Custom Topics
```bash
kubectl exec -n kafka kafka-0 -- kafka-topics.sh \
  --create --topic my-topic \
  --partitions 10 \
  --replication-factor 1 \
  --bootstrap-server localhost:9092
```

### Enable Kafka UI
```bash
kubectl apply -f optional/kafka-ui.yaml
kubectl port-forward -n kafka svc/kafka-ui 8080:80
```

## Notes

- Default license key is a placeholder - update in `monitoring/02-configmap.yaml`
- MSK shim creates AWS-compatible entities even for local Kafka
- Resource limits are optimized for Minikube - adjust for production
- JMX authentication is disabled for simplicity

## Support

For issues:
1. Run `./scripts/troubleshoot.sh`
2. Check the logs of failing components
3. Verify Minikube has sufficient resources
4. Ensure Docker is running properly