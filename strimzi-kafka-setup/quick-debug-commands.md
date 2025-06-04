# Quick Debug Commands for Strimzi Kafka

## Copy-Paste Commands for Common Issues

### 1. Operator Not Starting
```bash
# Check operator logs
kubectl logs -n strimzi-kafka deployment/strimzi-cluster-operator --tail=100

# Check operator permissions
kubectl auth can-i --list --as=system:serviceaccount:strimzi-kafka:strimzi-cluster-operator -n strimzi-kafka

# Restart operator
kubectl rollout restart deployment/strimzi-cluster-operator -n strimzi-kafka

# Check operator events
kubectl get events -n strimzi-kafka --field-selector involvedObject.name=strimzi-cluster-operator
```

### 2. Kafka Brokers Not Starting
```bash
# Check all broker statuses at once
for i in 0 1 2; do echo "=== Broker $i ==="; kubectl get pod production-kafka-kafka-$i -n strimzi-kafka -o wide; done

# Check broker logs
kubectl logs -n strimzi-kafka production-kafka-kafka-0 --tail=50

# Check previous logs if crashing
kubectl logs -n strimzi-kafka production-kafka-kafka-0 --previous

# Describe problematic broker
kubectl describe pod production-kafka-kafka-0 -n strimzi-kafka | grep -A 10 Events

# Check PVC status
kubectl get pvc -n strimzi-kafka | grep kafka

# Force restart a broker
kubectl delete pod production-kafka-kafka-0 -n strimzi-kafka
```

### 3. JMX Connection Issues
```bash
# Test JMX port from another pod
kubectl run jmx-test --rm -i --restart=Never --image=busybox -n strimzi-kafka -- sh -c 'for i in 0 1 2; do echo -n "Broker $i: "; nc -zv production-kafka-kafka-$i.production-kafka-kafka-brokers 9999; done'

# Get JMX credentials
kubectl get secret production-kafka-cluster-operator-certs -n strimzi-kafka -o jsonpath='{.data.cluster-operator\.password}' | base64 -d

# Check JMX configuration in Kafka resource
kubectl get kafka production-kafka -n strimzi-kafka -o jsonpath='{.spec.kafka.jmxOptions}'
```

### 4. Topic Issues
```bash
# List all topics
kubectl exec -n strimzi-kafka production-kafka-kafka-0 -- /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list

# Describe specific topic
kubectl exec -n strimzi-kafka production-kafka-kafka-0 -- /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic events

# Check under-replicated partitions
kubectl exec -n strimzi-kafka production-kafka-kafka-0 -- /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --describe --under-replicated-partitions

# Force topic recreation
kubectl delete kafkatopic events -n strimzi-kafka
kubectl apply -f kafka-topics.yaml
```

### 5. Authentication Issues
```bash
# Check user secrets
kubectl get secret -n strimzi-kafka | grep user

# Get user password
kubectl get secret producer-user -n strimzi-kafka -o jsonpath='{.data.password}' | base64 -d

# Test authentication
kubectl run kafka-auth-test --rm -i --restart=Never --image=quay.io/strimzi/kafka:0.38.0-kafka-3.5.1 -n strimzi-kafka -- bash -c '
echo "security.protocol=SASL_PLAINTEXT
sasl.mechanism=SCRAM-SHA-512
sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required username=\"producer-user\" password=\"'$(kubectl get secret producer-user -n strimzi-kafka -o jsonpath='{.data.password}' | base64 -d)'\";
" > /tmp/client.properties
echo "test" | /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server production-kafka-kafka-bootstrap:9092 --topic events --producer.config /tmp/client.properties
'
```

### 6. Storage Issues
```bash
# Check PVC status
kubectl get pvc -n strimzi-kafka -o wide

# Check available storage
kubectl get pv | grep strimzi-kafka

# Check node disk space
df -h $(kubectl get pods -n strimzi-kafka production-kafka-kafka-0 -o jsonpath='{.spec.nodeName}')

# Describe PVC issues
kubectl describe pvc data-0-production-kafka-kafka-0 -n strimzi-kafka
```

### 7. Performance Issues
```bash
# Check broker heap usage
kubectl exec -n strimzi-kafka production-kafka-kafka-0 -- jcmd 1 GC.heap_info

# Check consumer lag
kubectl exec -n strimzi-kafka production-kafka-kafka-0 -- /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --all-groups

# Monitor broker threads
kubectl exec -n strimzi-kafka production-kafka-kafka-0 -- jstack 1 | grep -A 5 "kafka-request-handler"

# Check topic metrics
kubectl exec -n strimzi-kafka production-kafka-kafka-0 -- /opt/kafka/bin/kafka-run-class.sh kafka.admin.TopicCommand --bootstrap-server localhost:9092 --describe --topics-with-overrides
```

### 8. New Relic Integration Issues
```bash
# Check NR pod logs
kubectl logs -n newrelic deployment/nri-kafka-strimzi --tail=100

# Test Zookeeper connectivity from NR
kubectl exec -n newrelic deployment/nri-kafka-strimzi -- nc -zv production-kafka-zookeeper-client.strimzi-kafka.svc.cluster.local 2181

# Run manual discovery
kubectl exec -n newrelic deployment/nri-kafka-strimzi -- /var/db/newrelic-infra/nri-discovery-kubernetes --verbose

# Check integration config
kubectl describe configmap nri-kafka-strimzi-config -n newrelic
```

### 9. Networking Issues
```bash
# Test DNS resolution
kubectl run dns-test --rm -i --restart=Never --image=busybox -n strimzi-kafka -- nslookup production-kafka-kafka-bootstrap

# Check service endpoints
kubectl get endpoints -n strimzi-kafka

# Test broker connectivity
for i in 0 1 2; do kubectl run test-$i --rm -i --restart=Never --image=busybox -n strimzi-kafka -- timeout 5 nc -zv production-kafka-kafka-$i.production-kafka-kafka-brokers 9092; done

# Check network policies
kubectl get networkpolicy -n strimzi-kafka
```

### 10. Emergency Recovery
```bash
# Scale down Kafka (use with caution!)
kubectl scale kafka production-kafka -n strimzi-kafka --replicas=0

# Delete stuck pods
kubectl delete pods -n strimzi-kafka -l strimzi.io/cluster=production-kafka --force --grace-period=0

# Restart all components
kubectl rollout restart deployment/strimzi-cluster-operator -n strimzi-kafka
kubectl delete pods -n strimzi-kafka -l strimzi.io/cluster=production-kafka

# Check recovery status
watch -n 2 'kubectl get pods -n strimzi-kafka'
```

### 11. Collect Full Diagnostics
```bash
# One-liner to collect all logs
mkdir -p /tmp/kafka-debug && \
kubectl logs -n strimzi-kafka deployment/strimzi-cluster-operator --tail=1000 > /tmp/kafka-debug/operator.log && \
for i in 0 1 2; do kubectl logs -n strimzi-kafka production-kafka-kafka-$i --all-containers > /tmp/kafka-debug/broker-$i.log 2>&1; done && \
kubectl get events -n strimzi-kafka --sort-by='.lastTimestamp' > /tmp/kafka-debug/events.log && \
kubectl describe kafka production-kafka -n strimzi-kafka > /tmp/kafka-debug/kafka-describe.log && \
tar -czf kafka-debug-$(date +%Y%m%d-%H%M%S).tar.gz -C /tmp kafka-debug && \
echo "Debug archive created: kafka-debug-$(date +%Y%m%d-%H%M%S).tar.gz"
```

### 12. Monitor in Real-Time
```bash
# Watch all pods
watch -n 2 'kubectl get pods -n strimzi-kafka -o wide'

# Follow operator logs
kubectl logs -n strimzi-kafka deployment/strimzi-cluster-operator -f

# Monitor events
kubectl get events -n strimzi-kafka -w

# Watch kafka resource status
watch -n 5 'kubectl get kafka production-kafka -n strimzi-kafka -o jsonpath="{.status.conditions[*]}" | jq'
```