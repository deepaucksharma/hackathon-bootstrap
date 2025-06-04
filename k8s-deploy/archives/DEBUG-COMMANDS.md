# nri-kafka Debug Commands Quick Reference

## Essential Variables
```bash
# Set these first for easier command execution
export KAFKA_NS=kafka
export NR_NS=newrelic
export NR_POD=$(kubectl get pods -n $NR_NS -l app.kubernetes.io/name=newrelic-infrastructure -o jsonpath='{.items[0].metadata.name}')
```

## 🔍 Quick Status Checks

### Overall Health
```bash
# All pods status at a glance
kubectl get pods -n $KAFKA_NS
kubectl get pods -n $NR_NS

# Check recent events
kubectl get events -n $KAFKA_NS --sort-by='.lastTimestamp' | tail -10
kubectl get events -n $NR_NS --sort-by='.lastTimestamp' | tail -10
```

### Kafka Cluster Status
```bash
# Broker health
kubectl exec -n $KAFKA_NS kafka-0 -- kafka-metadata.sh --snapshot /bitnami/kafka/data/__cluster_metadata-0/00000000000000000000.log

# Topics list
kubectl exec -n $KAFKA_NS kafka-0 -- kafka-topics.sh --bootstrap-server localhost:9092 --list

# Consumer groups
kubectl exec -n $KAFKA_NS kafka-0 -- kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list

# Consumer lag
kubectl exec -n $KAFKA_NS kafka-0 -- kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --all-groups
```

## 📊 JMX Verification

### Check JMX Port
```bash
# From Kafka pod
kubectl exec -n $KAFKA_NS kafka-0 -- netstat -tlnp | grep 9999

# From New Relic pod
kubectl exec -n $NR_NS $NR_POD -- nc -zv kafka-0.kafka-headless.kafka.svc.cluster.local 9999
```

### Test JMX Connection
```bash
# List JMX beans
kubectl exec -n $KAFKA_NS kafka-0 -- bash -c "echo 'beans' | java -jar /opt/bitnami/kafka/bin/jmxterm.jar -l localhost:9999 -n" | grep kafka | head -10

# Get specific metric
kubectl exec -n $KAFKA_NS kafka-0 -- bash -c "echo 'get -b kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec OneMinuteRate' | java -jar /opt/bitnami/kafka/bin/jmxterm.jar -l localhost:9999 -n"
```

## 🔌 Network Connectivity

### DNS Resolution
```bash
# Test from New Relic pod
kubectl exec -n $NR_NS $NR_POD -- nslookup kafka-0.kafka-headless.kafka.svc.cluster.local

# Test from debug pod
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup kafka-0.kafka-headless.kafka.svc.cluster.local
```

### Port Connectivity
```bash
# Test all Kafka brokers
for i in 0 1 2; do
  echo "Testing kafka-$i..."
  kubectl exec -n $NR_NS $NR_POD -- nc -zv kafka-$i.kafka-headless.kafka.svc.cluster.local 9092
  kubectl exec -n $NR_NS $NR_POD -- nc -zv kafka-$i.kafka-headless.kafka.svc.cluster.local 9999
done
```

## 📝 Integration Logs

### View Integration Logs
```bash
# Last 50 Kafka-related logs
kubectl logs -n $NR_NS $NR_POD -c newrelic-infrastructure | grep -i kafka | tail -50

# Errors only
kubectl logs -n $NR_NS $NR_POD -c newrelic-infrastructure | grep -i kafka | grep -iE "(error|failed|refused)"

# Integration execution logs
kubectl logs -n $NR_NS $NR_POD -c newrelic-infrastructure | grep "Executing integration" | grep kafka
```

### Follow Logs in Real-time
```bash
# Watch for Kafka integration logs
kubectl logs -n $NR_NS $NR_POD -c newrelic-infrastructure -f | grep -i kafka

# Watch for errors
kubectl logs -n $NR_NS $NR_POD -c newrelic-infrastructure -f | grep -iE "(error|ERROR|failed)"
```

## 🧪 Test Integration Manually

### Run nri-kafka Test
```bash
# Basic test
kubectl exec -n $NR_NS $NR_POD -c newrelic-infrastructure -- \
  /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
  -cluster_name test \
  -autodiscover_strategy bootstrap \
  -bootstrap_broker_host kafka-0.kafka-headless.kafka.svc.cluster.local \
  -bootstrap_broker_jmx_port 9999 \
  -metrics true \
  -pretty

# Test with inventory
kubectl exec -n $NR_NS $NR_POD -c newrelic-infrastructure -- \
  /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
  -cluster_name test \
  -bootstrap_broker_host kafka-0.kafka-headless.kafka.svc.cluster.local \
  -bootstrap_broker_jmx_port 9999 \
  -inventory true \
  -pretty
```

### Test Discovery
```bash
# See what pods are discovered
kubectl exec -n $NR_NS $NR_POD -c newrelic-infrastructure -- \
  /var/db/newrelic-infra/nri-discovery-kubernetes --port 10250 --tls | \
  jq '.[] | select(.labels."app" == "kafka")'
```

## 🔧 Configuration Checks

### View Integration Config
```bash
# Show Kafka integration config
kubectl get configmap -n $NR_NS -o yaml | grep -A 50 "kafka.*yaml:" | head -100

# Check if config is mounted
kubectl exec -n $NR_NS $NR_POD -c newrelic-infrastructure -- ls -la /etc/newrelic-infra/integrations.d/
```

### Verify License Key
```bash
# Check if license key is set (shows masked value)
kubectl get secret -n $NR_NS newrelic-bundle-newrelic-infrastructure-license -o jsonpath='{.data.license}' | base64 -d | sed 's/./*/g'
```

## 📈 Kafka Performance

### Topic Statistics
```bash
# Topic details
kubectl exec -n $KAFKA_NS kafka-0 -- kafka-topics.sh --bootstrap-server localhost:9092 --describe

# Log dirs size
kubectl exec -n $KAFKA_NS kafka-0 -- kafka-log-dirs.sh --bootstrap-server localhost:9092 --describe

# Producer performance test
kubectl exec -n $KAFKA_NS kafka-0 -- kafka-producer-perf-test.sh \
  --topic test-perf \
  --num-records 1000 \
  --record-size 100 \
  --throughput 100 \
  --producer-props bootstrap.servers=localhost:9092
```

### Consumer Performance
```bash
# Consumer performance test
kubectl exec -n $KAFKA_NS kafka-0 -- kafka-consumer-perf-test.sh \
  --bootstrap-server localhost:9092 \
  --topic test-perf \
  --messages 1000
```

## 🐛 Advanced Debugging

### Enable Debug Logging
```bash
# Edit ConfigMap to add debug logging
kubectl edit configmap -n $NR_NS newrelic-bundle-newrelic-infrastructure

# Add under data:
# newrelic-infra.yml: |
#   log:
#     level: debug
```

### Packet Capture
```bash
# Capture JMX traffic (if tcpdump available)
kubectl exec -n $NR_NS $NR_POD -c newrelic-infrastructure -- \
  timeout 30 tcpdump -i any -w /tmp/jmx.pcap host kafka-0.kafka-headless.kafka.svc.cluster.local and port 9999

# Copy capture
kubectl cp $NR_NS/$NR_POD:/tmp/jmx.pcap ./jmx.pcap -c newrelic-infrastructure
```

### Resource Usage
```bash
# Pod resource usage
kubectl top pods -n $KAFKA_NS
kubectl top pods -n $NR_NS

# Detailed pod description
kubectl describe pod -n $KAFKA_NS kafka-0
kubectl describe pod -n $NR_NS $NR_POD
```

## 🔄 Quick Fixes

### Restart Integration
```bash
# Restart New Relic pods
kubectl rollout restart deployment -n $NR_NS

# Restart specific Kafka broker
kubectl delete pod -n $KAFKA_NS kafka-0
```

### Force Topic Creation
```bash
# Create test topics
for topic in events transactions logs; do
  kubectl exec -n $KAFKA_NS kafka-0 -- kafka-topics.sh \
    --bootstrap-server localhost:9092 \
    --create --topic $topic \
    --partitions 3 \
    --replication-factor 2 \
    --if-not-exists
done
```

### Test Message Flow
```bash
# Send test message
kubectl exec -n $KAFKA_NS kafka-0 -- bash -c \
  'echo "Test message $(date)" | kafka-console-producer.sh --broker-list localhost:9092 --topic test'

# Consume test message
kubectl exec -n $KAFKA_NS kafka-0 -- \
  kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic test --from-beginning --max-messages 1
```

## 📊 New Relic Queries

Use these NRQL queries in New Relic Query Builder:

```sql
-- Check if data is arriving
SELECT count(*) FROM KafkaBrokerSample SINCE 30 minutes ago

-- Broker metrics
SELECT average(broker.IOWaitPercent), average(broker.IdlePercent) 
FROM KafkaBrokerSample 
FACET entityName 
SINCE 30 minutes ago TIMESERIES

-- Topic metrics
SELECT sum(topic.messagesInPerSecond) 
FROM KafkaTopicSample 
FACET topic 
SINCE 1 hour ago TIMESERIES

-- Consumer lag
SELECT max(consumer.lag) 
FROM KafkaConsumerSample 
FACET consumerGroup, topic 
SINCE 30 minutes ago

-- Check for errors
SELECT * FROM InfrastructureEvent 
WHERE category = 'kafka' 
SINCE 1 hour ago
```

## 🚨 Emergency Commands

### If Nothing Works
```bash
# Complete cleanup and restart
kubectl delete namespace $KAFKA_NS
kubectl delete namespace $NR_NS

# Recreate from scratch
cd /path/to/k8s-deploy
./deploy-nri-kafka.sh

# Full debug output
./verify-deployment.sh > debug-output.txt 2>&1
```