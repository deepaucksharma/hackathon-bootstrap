# Complete Manual Verification and Troubleshooting Guide for Strimzi Kafka

## Pre-Deployment Checks

### 1. Verify Kubernetes Cluster
```bash
# Check cluster info
kubectl cluster-info

# Check available nodes
kubectl get nodes

# Check storage classes for persistent volumes
kubectl get storageclass

# Check if you have enough resources
kubectl top nodes
```

### 2. Check for Existing Deployments
```bash
# Check if namespaces already exist
kubectl get namespace | grep -E "strimzi-kafka|newrelic"

# Check for existing Kafka deployments
kubectl get pods --all-namespaces | grep kafka

# Check for port conflicts
kubectl get svc --all-namespaces | grep -E "9092|2181|9999"
```

## Step-by-Step Verification During Deployment

### Step 1: Strimzi Operator Installation

```bash
# Watch operator deployment in real-time
kubectl get pods -n strimzi-kafka -w

# Check operator logs as it starts
kubectl logs -n strimzi-kafka deployment/strimzi-cluster-operator -f

# Verify CRDs are installed
kubectl get crd | grep strimzi

# Expected CRDs:
# kafkas.kafka.strimzi.io
# kafkatopics.kafka.strimzi.io
# kafkausers.kafka.strimzi.io
# kafkaconnects.kafka.strimzi.io
# kafkaconnectors.kafka.strimzi.io
# kafkamirrormakers.kafka.strimzi.io
# kafkabridges.kafka.strimzi.io
# kafkarebalances.kafka.strimzi.io

# Check operator permissions
kubectl get clusterrole | grep strimzi
kubectl get clusterrolebinding | grep strimzi
```

### Step 2: Kafka Cluster Deployment

```bash
# Watch Kafka resource status
kubectl get kafka -n strimzi-kafka production-kafka -w

# Monitor pod creation (in separate terminals)
kubectl get pods -n strimzi-kafka -w
kubectl get pvc -n strimzi-kafka -w

# Check events for issues
kubectl get events -n strimzi-kafka --sort-by='.lastTimestamp'

# Detailed Kafka status
kubectl describe kafka -n strimzi-kafka production-kafka

# Check each Kafka broker startup
for i in 0 1 2; do
  echo "=== Kafka Broker $i ==="
  kubectl logs -n strimzi-kafka production-kafka-kafka-$i -c kafka
done

# Check Zookeeper nodes
for i in 0 1 2; do
  echo "=== Zookeeper Node $i ==="
  kubectl logs -n strimzi-kafka production-kafka-zookeeper-$i
done
```

### Step 3: Verify JMX Configuration

```bash
# Check if JMX ports are exposed
for i in 0 1 2; do
  kubectl get pod production-kafka-kafka-$i -n strimzi-kafka -o jsonpath='{.spec.containers[0].ports[?(@.name=="jmx")].containerPort}'
  echo ""
done

# Check JMX secrets
kubectl get secret -n strimzi-kafka | grep jmx

# Verify JMX authentication
kubectl get secret production-kafka-cluster-operator-certs -n strimzi-kafka -o yaml

# Test JMX connectivity from inside the cluster
kubectl run jmx-test --rm -i --restart=Never \
  --image=openjdk:11-jre-slim \
  -n strimzi-kafka -- /bin/bash -c "
    apt-get update && apt-get install -y netcat
    for i in 0 1 2; do
      echo -n \"Broker \$i JMX: \"
      nc -zv production-kafka-kafka-\$i.production-kafka-kafka-brokers 9999
    done
"
```

### Step 4: Topic and User Creation

```bash
# Watch topic creation
kubectl get kafkatopic -n strimzi-kafka -w

# Verify topic details
kubectl describe kafkatopic events -n strimzi-kafka
kubectl describe kafkatopic logs -n strimzi-kafka
kubectl describe kafkatopic metrics -n strimzi-kafka

# Check user creation and secrets
kubectl get kafkauser -n strimzi-kafka
kubectl get secret -n strimzi-kafka | grep user

# Verify user credentials
for user in producer-user consumer-user admin-user; do
  echo "=== $user ==="
  kubectl get secret $user -n strimzi-kafka -o jsonpath='{.data.password}' | base64 -d
  echo ""
done
```

### Step 5: Test Kafka Functionality

```bash
# List topics from inside a broker
kubectl exec -it production-kafka-kafka-0 -n strimzi-kafka -- \
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list

# Describe a topic
kubectl exec -it production-kafka-kafka-0 -n strimzi-kafka -- \
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --topic events

# Check consumer groups
kubectl exec -it production-kafka-kafka-0 -n strimzi-kafka -- \
  /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list

# Test produce/consume without authentication (should fail)
kubectl run kafka-test --rm -i --restart=Never \
  --image=quay.io/strimzi/kafka:0.38.0-kafka-3.5.1 \
  -n strimzi-kafka -- /bin/bash -c "
    echo 'test' | /opt/kafka/bin/kafka-console-producer.sh \
      --bootstrap-server production-kafka-kafka-bootstrap:9092 \
      --topic events
"
```

### Step 6: Verify Test Clients

```bash
# Check producer logs
kubectl logs -n strimzi-kafka deployment/kafka-producer -f

# Check consumer logs
kubectl logs -n strimzi-kafka deployment/kafka-consumer -f

# Verify messages are flowing
kubectl exec -it production-kafka-kafka-0 -n strimzi-kafka -- \
  /opt/kafka/bin/kafka-run-class.sh kafka.tools.GetOffsetShell \
  --broker-list localhost:9092 --topic events

# Check consumer group lag
kubectl exec -it production-kafka-kafka-0 -n strimzi-kafka -- \
  /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe --group test-consumer-group
```

### Step 7: New Relic Integration Verification

```bash
# Check New Relic deployment
kubectl get deployment -n newrelic nri-kafka-strimzi
kubectl get pods -n newrelic -l app=nri-kafka-strimzi

# Watch New Relic logs
kubectl logs -n newrelic deployment/nri-kafka-strimzi -f

# Check if integration can reach Zookeeper
kubectl exec -n newrelic deployment/nri-kafka-strimzi -- \
  nc -zv production-kafka-zookeeper-client.strimzi-kafka.svc.cluster.local 2181

# Verify JMX connection from New Relic pod
kubectl exec -n newrelic deployment/nri-kafka-strimzi -- \
  nc -zv production-kafka-kafka-0.production-kafka-kafka-brokers.strimzi-kafka.svc.cluster.local 9999

# Check integration configuration
kubectl get configmap -n newrelic nri-kafka-strimzi-config -o yaml
```

## Common Issues and Troubleshooting

### 1. Operator Issues

```bash
# Operator not starting
kubectl describe pod -n strimzi-kafka -l name=strimzi-cluster-operator

# Check operator service account permissions
kubectl auth can-i --list --as=system:serviceaccount:strimzi-kafka:strimzi-cluster-operator

# Operator can't watch resources
kubectl logs -n strimzi-kafka deployment/strimzi-cluster-operator | grep -i error
```

### 2. Kafka Broker Issues

```bash
# Broker stuck in pending
kubectl describe pod production-kafka-kafka-0 -n strimzi-kafka

# PVC issues
kubectl get pvc -n strimzi-kafka
kubectl describe pvc data-0-production-kafka-kafka-0 -n strimzi-kafka

# Memory/CPU issues
kubectl top pod -n strimzi-kafka

# Broker crash loops
kubectl logs -n strimzi-kafka production-kafka-kafka-0 --previous

# Check broker configuration
kubectl get configmap -n strimzi-kafka production-kafka-kafka-config -o yaml
```

### 3. Zookeeper Issues

```bash
# Zookeeper not forming quorum
for i in 0 1 2; do
  kubectl exec production-kafka-zookeeper-$i -n strimzi-kafka -- \
    echo stat | nc localhost 2181
done

# Check Zookeeper logs for election issues
kubectl logs -n strimzi-kafka production-kafka-zookeeper-0 | grep -i "LEADING\|FOLLOWING"
```

### 4. JMX Connection Issues

```bash
# Test JMX with authentication
kubectl run jmx-client --rm -i --restart=Never \
  --image=cvertes/jmxterm:latest \
  -n strimzi-kafka -- java -jar /jmxterm.jar \
  --url production-kafka-kafka-0.production-kafka-kafka-brokers:9999 \
  --user cluster-operator \
  --password $(kubectl get secret production-kafka-cluster-operator-certs -n strimzi-kafka -o jsonpath='{.data.cluster-operator\.password}' | base64 -d)

# Check JMX SSL certificates
kubectl get secret production-kafka-cluster-ca-cert -n strimzi-kafka -o yaml
```

### 5. New Relic Integration Issues

```bash
# Debug nri-kafka discovery
kubectl exec -n newrelic deployment/nri-kafka-strimzi -- \
  /var/db/newrelic-infra/nri-discovery-kubernetes --verbose

# Test Zookeeper connectivity from NR pod
kubectl exec -n newrelic deployment/nri-kafka-strimzi -- \
  /bin/sh -c "echo stat | nc production-kafka-zookeeper-client.strimzi-kafka.svc.cluster.local 2181"

# Check if NR can resolve Kafka brokers
kubectl exec -n newrelic deployment/nri-kafka-strimzi -- \
  nslookup production-kafka-kafka-brokers.strimzi-kafka.svc.cluster.local

# Manual integration test
kubectl exec -n newrelic deployment/nri-kafka-strimzi -- \
  /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
  -cluster_name test \
  -zookeeper_hosts '[{"host":"production-kafka-zookeeper-client.strimzi-kafka.svc.cluster.local","port":2181}]' \
  -verbose
```

## Performance and Health Checks

### 1. Kafka Performance Metrics

```bash
# Check broker JVM memory usage
for i in 0 1 2; do
  kubectl exec production-kafka-kafka-$i -n strimzi-kafka -- \
    jcmd 1 VM.native_memory summary
done

# Monitor Kafka metrics via JMX
kubectl port-forward -n strimzi-kafka production-kafka-kafka-0 9999:9999

# In another terminal, use JConsole or JMXTerm to connect to localhost:9999
```

### 2. Topic Performance

```bash
# Producer performance test
kubectl run perf-test-producer --rm -i --restart=Never \
  --image=quay.io/strimzi/kafka:0.38.0-kafka-3.5.1 \
  -n strimzi-kafka -- /opt/kafka/bin/kafka-producer-perf-test.sh \
  --topic events \
  --num-records 10000 \
  --record-size 1024 \
  --throughput 1000 \
  --producer-props bootstrap.servers=production-kafka-kafka-bootstrap:9092

# Consumer performance test
kubectl run perf-test-consumer --rm -i --restart=Never \
  --image=quay.io/strimzi/kafka:0.38.0-kafka-3.5.1 \
  -n strimzi-kafka -- /opt/kafka/bin/kafka-consumer-perf-test.sh \
  --topic events \
  --bootstrap-server production-kafka-kafka-bootstrap:9092 \
  --messages 10000 \
  --threads 1
```

### 3. Cluster Health

```bash
# Check under-replicated partitions
kubectl exec -it production-kafka-kafka-0 -n strimzi-kafka -- \
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --under-replicated-partitions

# Check offline partitions
kubectl exec -it production-kafka-kafka-0 -n strimzi-kafka -- \
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --unavailable-partitions

# Broker status
for i in 0 1 2; do
  echo "=== Broker $i ==="
  kubectl exec production-kafka-kafka-$i -n strimzi-kafka -- \
    cat /tmp/kafka-ready
done
```

## Monitoring Commands Summary

```bash
# Quick health check
kubectl get kafka,kafkatopic,kafkauser -n strimzi-kafka

# Watch all resources
watch -n 2 'kubectl get all -n strimzi-kafka'

# Continuous log monitoring (run in separate terminals)
kubectl logs -n strimzi-kafka -f deployment/strimzi-cluster-operator
kubectl logs -n strimzi-kafka -f -l strimzi.io/name=production-kafka-kafka
kubectl logs -n strimzi-kafka -f -l strimzi.io/name=production-kafka-zookeeper
kubectl logs -n newrelic -f deployment/nri-kafka-strimzi

# Event monitoring
kubectl get events -n strimzi-kafka -w
```

## Clean Verification

```bash
# Verify complete deletion
kubectl get all -n strimzi-kafka
kubectl get pvc -n strimzi-kafka
kubectl get secrets -n strimzi-kafka
kubectl get configmaps -n strimzi-kafka
```