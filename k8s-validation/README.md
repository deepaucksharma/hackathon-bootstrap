# Kubernetes Validation for New Relic Kafka Integration

This directory contains Kubernetes manifests and scripts to validate the New Relic Kafka integration in a Kubernetes environment.

## Prerequisites

1. A running Kubernetes cluster (minikube, kind, k3s, or any other)
2. `kubectl` configured to access your cluster
3. `make` and Go installed (for building the nri-kafka binary)
4. New Relic license key (for metrics collection)

## Quick Start

1. **Set your New Relic license key** (optional but recommended):
   ```bash
   export NEW_RELIC_LICENSE_KEY=your_license_key_here
   ```

2. **Run the setup script**:
   ```bash
   ./k8s-validation/setup-k8s-cluster.sh
   ```

3. **Validate the deployment**:
   ```bash
   ./k8s-validation/validate-metrics.sh
   ```

## What Gets Deployed

### Kafka Stack
- **Namespace**: `kafka-validation`
- **Zookeeper**: 1 instance
- **Kafka Brokers**: 3 instances (StatefulSet)
- **Test Producer**: Continuously sends messages to `test-topic`
- **Test Consumers**: 2 instances consuming from `test-topic`

### New Relic Integration
- **Infrastructure Agent**: DaemonSet with Kafka integration
- **Discovery**: Kubernetes-based service discovery
- **Configurations**:
  - Broker metrics collection
  - Consumer offset monitoring
  - Producer/Consumer JMX metrics

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                        │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              kafka-validation namespace              │    │
│  │                                                      │    │
│  │  ┌────────────┐  ┌─────────────────────────────┐   │    │
│  │  │ Zookeeper  │  │    Kafka StatefulSet (3)    │   │    │
│  │  └────────────┘  │  - kafka-0                  │   │    │
│  │                  │  - kafka-1                  │   │    │
│  │                  │  - kafka-2                  │   │    │
│  │                  └─────────────────────────────┘   │    │
│  │                                                      │    │
│  │  ┌────────────┐  ┌────────────┐                   │    │
│  │  │  Producer  │  │ Consumers  │                   │    │
│  │  └────────────┘  └────────────┘                   │    │
│  │                                                      │    │
│  │  ┌─────────────────────────────────────────────┐   │    │
│  │  │   New Relic Infrastructure (DaemonSet)      │   │    │
│  │  │   - nri-kafka integration                   │   │    │
│  │  │   - Service discovery                       │   │    │
│  │  └─────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Manifest Files

1. **01-namespace.yaml**: Creates the `kafka-validation` namespace
2. **02-zookeeper.yaml**: Deploys Zookeeper (required for Kafka)
3. **03-kafka.yaml**: Deploys Kafka brokers with JMX enabled
4. **04-test-producer-consumer.yaml**: Test workloads for generating traffic
5. **05-newrelic-kafka-config.yaml**: New Relic agent with Kafka integration config

## Configuration Details

### Kafka Configuration
- **JMX Port**: 1099 (exposed on NodePort 30099)
- **Kafka Port**: 9092 (exposed on NodePort 30092)
- **Topics**: `test-topic`, `metrics-topic` (auto-created)
- **Replication Factor**: 3
- **Partitions**: 3

### New Relic Integration
The integration is configured to:
- Auto-discover Kafka brokers using Kubernetes labels
- Collect broker metrics via JMX
- Monitor consumer group offsets
- Track producer/consumer metrics

## Validation

The `validate-metrics.sh` script checks:
- Pod status for all components
- Kafka topic creation
- Consumer group registration
- Producer/Consumer activity
- New Relic agent logs for Kafka metrics

## Accessing Kafka

From outside the cluster:
```bash
# Kafka bootstrap server
localhost:30092

# JMX access
localhost:30099
```

## Troubleshooting

### Check pod status
```bash
kubectl get pods -n kafka-validation
```

### View logs
```bash
# Kafka broker logs
kubectl logs -n kafka-validation kafka-0

# New Relic agent logs
kubectl logs -n kafka-validation -l name=newrelic-infrastructure

# Producer logs
kubectl logs -n kafka-validation -l app=kafka-producer

# Consumer logs
kubectl logs -n kafka-validation -l app=kafka-consumer
```

### Common Issues

1. **Pods not starting**: Check resource availability and pod events
   ```bash
   kubectl describe pod <pod-name> -n kafka-validation
   ```

2. **JMX connection failures**: Verify JMX configuration and credentials
   ```bash
   kubectl exec -n kafka-validation kafka-0 -- cat /etc/jmxremote/jmxremote.access
   ```

3. **No metrics in New Relic**: Check agent logs and ensure license key is set
   ```bash
   kubectl logs -n kafka-validation -l name=newrelic-infrastructure | grep -i error
   ```

## Cleanup

To remove all resources:
```bash
kubectl delete namespace kafka-validation
```

## Customization

### Modify Kafka Configuration
Edit `03-kafka.yaml` to change:
- Number of brokers (replicas)
- JMX settings
- Topic configuration

### Adjust New Relic Integration
Edit `05-newrelic-kafka-config.yaml` to:
- Change cluster name
- Modify discovery rules
- Add custom environment variables

### Scale Test Workloads
```bash
# Scale consumers
kubectl scale deployment kafka-consumer -n kafka-validation --replicas=5

# Scale producers
kubectl scale deployment kafka-producer -n kafka-validation --replicas=2
```