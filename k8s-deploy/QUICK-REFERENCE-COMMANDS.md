# Quick Reference Commands for Kafka Monitoring

Essential commands for debugging and monitoring Kafka with New Relic Infrastructure.

## Pod Status Commands

```bash
# Check all Kafka pods
kubectl get pods -l app=kafka -o wide

# Check NRI Kafka pods
kubectl get pods -l app.kubernetes.io/name=nri-kafka

# Get pod details
kubectl describe pod kafka-0
kubectl describe pod -l app.kubernetes.io/name=nri-kafka
```

## JMX Verification

```bash
# Test JMX port connectivity
kubectl exec -it kafka-0 -- nc -zv localhost 9999

# Check JMX configuration
kubectl exec kafka-0 -- env | grep JMX

# View JMX process arguments
kubectl exec kafka-0 -- ps aux | grep jmxremote
```

## Log Analysis

```bash
# Kafka broker logs
kubectl logs kafka-0 --tail=50

# NRI Kafka integration logs
kubectl logs -l app.kubernetes.io/name=nri-kafka --tail=50

# Follow logs in real-time
kubectl logs -l app.kubernetes.io/name=nri-kafka -f

# Filter for errors
kubectl logs -l app.kubernetes.io/name=nri-kafka | grep -i error
```

## Network Connectivity

```bash
# Test from integration to Kafka
kubectl exec -it $(kubectl get pod -l app.kubernetes.io/name=nri-kafka -o name | head -1) -- \
  nc -zv kafka-0.kafka-headless 9092

# Check all Kafka ports
for port in 9092 9093 9999; do
  echo "Testing port $port..."
  kubectl exec -it kafka-0 -- nc -zv localhost $port
done

# DNS resolution test
kubectl exec -it $(kubectl get pod -l app.kubernetes.io/name=nri-kafka -o name | head -1) -- \
  nslookup kafka-0.kafka-headless
```

## Kafka Admin Commands

```bash
# List topics
kubectl exec kafka-0 -- kafka-topics.sh --bootstrap-server localhost:9092 --list

# Describe topics
kubectl exec kafka-0 -- kafka-topics.sh --bootstrap-server localhost:9092 --describe

# List consumer groups
kubectl exec kafka-0 -- kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list

# Check consumer group lag
kubectl exec kafka-0 -- kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group <group-name> --describe
```

## Configuration Verification

```bash
# View NRI Kafka config
kubectl get configmap nri-kafka-config -o yaml

# Check environment variables
kubectl exec $(kubectl get pod -l app.kubernetes.io/name=nri-kafka -o name | head -1) -- env | sort

# Get full deployment spec
kubectl get deployment nri-kafka -o yaml
```

## Port Forwarding for Local Testing

```bash
# Forward JMX port
kubectl port-forward kafka-0 9999:9999

# Forward Kafka port
kubectl port-forward kafka-0 9092:9092

# Test with local tools
jconsole localhost:9999
kafka-topics.sh --bootstrap-server localhost:9092 --list
```

## Metrics Verification

```bash
# Check if metrics are being sent
kubectl exec $(kubectl get pod -l app.kubernetes.io/name=nri-kafka -o name | head -1) -- \
  cat /var/db/newrelic-infra/custom-integrations/nri-kafka.json | jq .

# Count metrics collected
kubectl logs -l app.kubernetes.io/name=nri-kafka --tail=1000 | \
  grep -c "Sending metrics"
```

## NRQL Queries

```sql
-- Check if any metrics are arriving
FROM KafkaBrokerSample SELECT count(*) SINCE 5 minutes ago

-- View all broker metrics
FROM KafkaBrokerSample SELECT * WHERE clusterName = 'kafka-cluster' SINCE 5 minutes ago

-- Check consumer lag
FROM KafkaConsumerSample SELECT max(consumerLag) FACET consumerGroup, topic SINCE 10 minutes ago

-- Topic metrics
FROM KafkaTopicSample SELECT * WHERE clusterName = 'kafka-cluster' SINCE 5 minutes ago

-- Check for errors
FROM Log SELECT message WHERE message LIKE '%kafka%' AND message LIKE '%error%' SINCE 1 hour ago
```

## Resource Usage

```bash
# Check pod resource usage
kubectl top pods -l app=kafka
kubectl top pods -l app.kubernetes.io/name=nri-kafka

# Get resource limits
kubectl describe pod kafka-0 | grep -A 5 "Limits:"
```

## Cleanup Commands

```bash
# Delete and recreate integration
kubectl delete deployment nri-kafka
kubectl apply -f nri-kafka-deployment.yaml

# Restart pods
kubectl rollout restart deployment nri-kafka
kubectl delete pod kafka-0  # Will be recreated by StatefulSet

# Clear old logs
kubectl logs kafka-0 --previous
```

## Emergency Debug

```bash
# Get shell access to Kafka broker
kubectl exec -it kafka-0 -- bash

# Get shell access to integration pod
kubectl exec -it $(kubectl get pod -l app.kubernetes.io/name=nri-kafka -o name | head -1) -- sh

# Run integration manually with debug
kubectl exec -it $(kubectl get pod -l app.kubernetes.io/name=nri-kafka -o name | head -1) -- \
  /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka -verbose

# Check all events
kubectl get events --sort-by='.lastTimestamp' | grep -E "(kafka|nri)"
```

## Quick Diagnostic Script

Save as `diagnose-kafka.sh`:

```bash
#!/bin/bash
echo "=== Kafka Monitoring Diagnostic ==="
echo "1. Pod Status:"
kubectl get pods -l app=kafka
kubectl get pods -l app.kubernetes.io/name=nri-kafka

echo -e "\n2. JMX Connectivity:"
kubectl exec kafka-0 -- nc -zv localhost 9999

echo -e "\n3. Recent Errors:"
kubectl logs -l app.kubernetes.io/name=nri-kafka --tail=20 | grep -i error || echo "No errors found"

echo -e "\n4. Metrics Collection:"
kubectl logs -l app.kubernetes.io/name=nri-kafka --tail=50 | grep "Sending metrics" | tail -5

echo -e "\nDiagnostic complete!"
```