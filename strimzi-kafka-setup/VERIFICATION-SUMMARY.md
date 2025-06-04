# Strimzi Kafka Verification and Troubleshooting Summary

## Manual Verification Approaches

### 1. Pre-Deployment Verification
- **Cluster readiness**: Check nodes, storage classes, and available resources
- **Namespace conflicts**: Ensure no existing Kafka deployments
- **Port availability**: Verify ports 9092, 2181, 9999 are not in use

### 2. During Deployment Verification
- **Watch operator logs**: Monitor Strimzi operator startup
- **Track pod creation**: Watch Kafka and Zookeeper pods come online
- **Monitor events**: Check for warnings or errors during deployment
- **Verify PVC binding**: Ensure storage is properly allocated

### 3. Post-Deployment Verification
- **Cluster health**: Verify all components are running
- **Topic operations**: Test topic creation and deletion
- **Authentication**: Verify user credentials work
- **Message flow**: Test producer and consumer functionality
- **JMX connectivity**: Ensure monitoring ports are accessible
- **New Relic integration**: Verify metrics are being collected

## Automated Tools

### Health Checking
```bash
# Quick health assessment
./comprehensive-health-check.sh

# Real-time monitoring
./realtime-monitor.sh

# Full functionality test
./end-to-end-test.sh
```

### Troubleshooting
```bash
# Automated diagnosis and fixes
./automated-troubleshooter.sh

# Collect diagnostic information
./automated-troubleshooter.sh  # Creates diagnostic archive
```

## Common Issues and Solutions

### 1. Operator Not Starting
- **Symptom**: Strimzi operator pod not running
- **Check**: RBAC permissions, CRDs installation
- **Fix**: Reinstall operator, check cluster permissions

### 2. Kafka Brokers Failing
- **Symptom**: Broker pods in CrashLoopBackOff
- **Check**: Resource limits, storage availability, JVM settings
- **Fix**: Increase resources, check PVC status, review logs

### 3. JMX Connection Issues
- **Symptom**: New Relic can't collect metrics
- **Check**: JMX port accessibility, authentication secrets
- **Fix**: Verify JMX configuration, check network policies

### 4. Authentication Failures
- **Symptom**: Producers/consumers can't connect
- **Check**: User secrets, SASL configuration
- **Fix**: Recreate users, verify credentials

### 5. Storage Problems
- **Symptom**: PVCs pending, pods can't start
- **Check**: Storage class, available PVs
- **Fix**: Ensure storage provisioner is running

## Quick Commands Reference

### Status Checks
```bash
# Overall status
kubectl get kafka,kafkatopic,kafkauser -n strimzi-kafka

# Pod status
kubectl get pods -n strimzi-kafka -o wide

# Recent events
kubectl get events -n strimzi-kafka --sort-by='.lastTimestamp'
```

### Log Analysis
```bash
# Operator logs
kubectl logs -n strimzi-kafka deployment/strimzi-cluster-operator -f

# Broker logs
kubectl logs -n strimzi-kafka production-kafka-kafka-0 -f

# New Relic logs
kubectl logs -n newrelic deployment/nri-kafka-strimzi -f
```

### Performance Monitoring
```bash
# Resource usage
kubectl top pods -n strimzi-kafka

# Under-replicated partitions
kubectl exec -n strimzi-kafka production-kafka-kafka-0 -- \
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --under-replicated-partitions

# Consumer lag
kubectl exec -n strimzi-kafka production-kafka-kafka-0 -- \
  /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --all-groups
```

## New Relic Verification

### Check Integration
```bash
# Verify pod is running
kubectl get pods -n newrelic -l app=nri-kafka-strimzi

# Check for errors
kubectl logs -n newrelic deployment/nri-kafka-strimzi | grep -i error

# Test connectivity
kubectl exec -n newrelic deployment/nri-kafka-strimzi -- \
  nc -zv production-kafka-zookeeper-client.strimzi-kafka.svc.cluster.local 2181
```

### NRQL Queries
```sql
-- Check if metrics are arriving
FROM KafkaBrokerSample 
SELECT count(*) 
WHERE clusterName = 'strimzi-production-kafka' 
SINCE 5 minutes ago

-- Monitor broker health
FROM KafkaBrokerSample 
SELECT average(broker.IOWaitPercent), average(broker.LogFlushRateTime) 
WHERE clusterName = 'strimzi-production-kafka' 
FACET entityName 
TIMESERIES

-- Check consumer lag
FROM KafkaConsumerSample 
SELECT max(consumer.totalLag) 
WHERE clusterName = 'strimzi-production-kafka' 
FACET consumerGroup 
TIMESERIES
```

## Best Practices

1. **Regular Health Checks**: Run `comprehensive-health-check.sh` daily
2. **Monitor Continuously**: Keep `realtime-monitor.sh` running during critical operations
3. **Test After Changes**: Run `end-to-end-test.sh` after any configuration changes
4. **Collect Diagnostics Early**: Use `automated-troubleshooter.sh` at first sign of issues
5. **Document Issues**: Keep logs from troubleshooting for future reference

## Emergency Procedures

### Complete Reset
```bash
# Scale down
kubectl scale kafka production-kafka -n strimzi-kafka --replicas=0

# Delete stuck resources
kubectl delete pods -n strimzi-kafka -l strimzi.io/cluster=production-kafka --force

# Scale back up
kubectl scale kafka production-kafka -n strimzi-kafka --replicas=3
```

### Operator Recovery
```bash
# Delete and recreate operator
kubectl delete deployment strimzi-cluster-operator -n strimzi-kafka
kubectl create -f https://strimzi.io/install/latest?namespace=strimzi-kafka -n strimzi-kafka
```

## Support Resources

- **Strimzi Documentation**: https://strimzi.io/docs/
- **Strimzi GitHub**: https://github.com/strimzi/strimzi-kafka-operator
- **New Relic Kafka Integration**: https://docs.newrelic.com/docs/integrations/host-integrations/host-integrations-list/kafka-monitoring-integration/
- **Diagnostic Archive**: Run `./automated-troubleshooter.sh` to collect all logs