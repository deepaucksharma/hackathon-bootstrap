# Minikube Kafka Setup Status

## Current Status (as of 2025-06-05)

### Infrastructure
- **Minikube**: Running
- **Kubernetes**: Active and configured
- **Kafka Cluster**: minikube-kafka operational in `kafka` namespace
- **New Relic Integration**: Active with custom nri-kafka binary

### Key Components

#### Kafka Deployment
- **Broker**: kafka-0 (Running)
- **JMX Port**: 9999
- **Kafka Port**: 9092
- **Topics**: 4 active topics (events, metrics, test-events, test-metrics)

#### New Relic Integration
- **Pod**: nri-kafka-bundle-wpc8n (Running in `newrelic` namespace)
- **Image**: infrastructure-bundle-msk:latest
- **Binary**: Custom nri-kafka with MSK shim enabled
- **Binary Location**: /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka

### MSK Shim Configuration
- **Status**: Enabled and operational
- **AWS Account ID**: 3630072
- **AWS Region**: us-east-1
- **Cluster Name**: minikube-kafka
- **Dimensional Metrics**: Enabled
- **Entity Type**: AWS_KAFKA_BROKER

### Monitoring Performance
- **Metric Collection Interval**: 30 seconds
- **Metrics per Batch**: ~17 metrics
- **Health Score**: 98.9%
- **Data Availability**: 100%
- **Metric Completeness**: 96.4%
- **Data Freshness**: 100%
- **Entity Relationships**: 100%

### Latest Activity
- MSK shim successfully creating AWS_KAFKA_BROKER entities
- Sending dimensional metrics to New Relic Metric API
- Processing consumer groups: test-consumer-group-1, minikube-consumer-group, metrics-consumer-group

### How to Monitor

Check pod status:
```bash
kubectl get pods -n newrelic | grep kafka
```

View real-time logs:
```bash
kubectl logs -n newrelic nri-kafka-bundle-wpc8n -f | grep MSK
```

Run verification:
```bash
node verify-kafka-metrics.js
```

### Configuration Files
- ConfigMap: `/minikube-consolidated/monitoring/02-configmap.yaml`
- DaemonSet: `/minikube-consolidated/monitoring/04-daemonset-bundle.yaml`
- Secrets: Loaded from `.env` file via `newrelic-credentials` secret