# Deploy nri-kafka OHI in Kubernetes

This directory contains all the necessary files to deploy the New Relic Kafka On-Host Integration (nri-kafka) in a Kubernetes cluster.

## Documentation Structure

- **[JMX-CONFIGURATION-GUIDE.md](JMX-CONFIGURATION-GUIDE.md)** - Complete guide for configuring JMX monitoring with Kafka
- **[TROUBLESHOOTING-GUIDE.md](TROUBLESHOOTING-GUIDE.md)** - Comprehensive troubleshooting procedures and solutions
- **[QUICK-REFERENCE-COMMANDS.md](QUICK-REFERENCE-COMMANDS.md)** - Essential commands for debugging and monitoring
- **[NRI-KAFKA-TROUBLESHOOTING-RUNBOOK.md](NRI-KAFKA-TROUBLESHOOTING-RUNBOOK.md)** - Specific runbook for nri-kafka issues
- **[WORKING-NRI-KAFKA-SETUP.md](WORKING-NRI-KAFKA-SETUP.md)** - Documentation of the working configuration
- **[VERIFICATION-SUMMARY.md](VERIFICATION-SUMMARY.md)** - Verification steps and results

## Prerequisites

- Kubernetes cluster (1.19+)
- kubectl configured to access your cluster
- Helm 3.x installed
- New Relic Infrastructure License Key (IKEY)

## Files Overview

- **values-nri-bundle.yaml**: Helm values for New Relic Infrastructure Bundle with nri-kafka configuration
- **kafka-deployment.yaml**: Kubernetes manifests for Kafka cluster with JMX enabled
- **kafka-producer-consumer.yaml**: Sample Kafka producers and consumers for testing
- **nri-kafka-config.yaml**: ConfigMap with additional nri-kafka configurations
- **deploy-nri-kafka.sh**: Automated deployment script

## Quick Start

1. Ensure your New Relic license key is set in the `.env` file (parent directory) or as an environment variable:
   ```bash
   # In ../.env file:
   IKEY=your-new-relic-license-key
   
   # OR as environment variable:
   export NEW_RELIC_LICENSE_KEY=your-license-key
   ```

2. Run the deployment script:
   ```bash
   cd k8s-deploy
   ./deploy-nri-kafka.sh
   ```

## Manual Deployment

If you prefer to deploy manually:

1. Create namespaces:
   ```bash
   kubectl create namespace kafka
   kubectl create namespace newrelic
   ```

2. Deploy Kafka:
   ```bash
   kubectl apply -f kafka-deployment.yaml
   kubectl apply -f kafka-producer-consumer.yaml
   ```

3. Create ConfigMap:
   ```bash
   kubectl apply -f nri-kafka-config.yaml
   ```

4. Install New Relic Infrastructure Bundle:
   ```bash
   helm repo add newrelic https://helm-charts.newrelic.com
   helm repo update
   
   # Replace placeholders in values file
   sed "s/YOUR_NEW_RELIC_LICENSE_KEY/$YOUR_LICENSE_KEY/g" values-nri-bundle.yaml | \
   helm upgrade --install newrelic-bundle newrelic/nri-bundle \
     --namespace newrelic \
     --values -
   ```

## Configuration Details

### Kafka Deployment
- 3 Kafka brokers in KRaft mode (no Zookeeper dependency)
- JMX enabled on port 9999
- Headless service for stable network identities
- StatefulSet for persistent storage

### nri-kafka Integration
The integration is configured to monitor:
- **Brokers**: Metrics and inventory from all Kafka brokers
- **Consumer Offsets**: Lag monitoring for all consumer groups
- **Producers**: JMX metrics from producer applications
- **Consumers**: JMX metrics from consumer applications

### Discovery Configuration
The integration uses Kubernetes service discovery to find:
- Kafka brokers: `label.app=kafka, label.component=broker`
- Producers: `label.app=kafka-producer`
- Consumers: `label.app=kafka-consumer`

## Verification

1. Check Kafka pods:
   ```bash
   kubectl get pods -n kafka
   ```

2. Check New Relic Infrastructure pods:
   ```bash
   kubectl get pods -n newrelic
   ```

3. View nri-kafka logs:
   ```bash
   kubectl logs -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure -c newrelic-infrastructure | grep -i kafka
   ```

4. Test Kafka:
   ```bash
   # Create topic
   kubectl exec -n kafka kafka-0 -- kafka-topics.sh --bootstrap-server kafka-0.kafka-headless:9092 --create --topic test --partitions 3 --replication-factor 2
   
   # Send message
   kubectl exec -n kafka kafka-0 -- bash -c 'echo "test message" | kafka-console-producer.sh --broker-list kafka-0.kafka-headless:9092 --topic test'
   
   # Consume message
   kubectl exec -n kafka kafka-0 -- kafka-console-consumer.sh --bootstrap-server kafka-0.kafka-headless:9092 --topic test --from-beginning --max-messages 1
   ```

## Monitoring in New Relic

After deployment, Kafka metrics will appear in New Relic:
1. Go to **Infrastructure > Third-party services**
2. Select **Apache Kafka**
3. View dashboards for:
   - Broker metrics (throughput, partitions, etc.)
   - Consumer lag
   - Producer/Consumer performance
   - Topic statistics

## Troubleshooting

### No Kafka metrics in New Relic
1. Check if pods can resolve Kafka DNS names:
   ```bash
   kubectl exec -n newrelic deploy/newrelic-bundle-nri-metadata-injection -- nslookup kafka-0.kafka-headless.kafka.svc.cluster.local
   ```

2. Verify JMX connectivity:
   ```bash
   kubectl exec -n newrelic -it deploy/newrelic-bundle-newrelic-infrastructure -- bash
   # Inside the container:
   nc -zv kafka-0.kafka-headless.kafka.svc.cluster.local 9999
   ```

3. Check integration configuration:
   ```bash
   kubectl describe configmap -n newrelic newrelic-bundle-newrelic-infrastructure
   ```

### Consumer lag not showing
Ensure consumer groups are actively consuming messages. The integration only reports lag for active consumer groups.

## Cleanup

To remove all resources:
```bash
kubectl delete namespace kafka
helm uninstall newrelic-bundle -n newrelic
kubectl delete namespace newrelic
```