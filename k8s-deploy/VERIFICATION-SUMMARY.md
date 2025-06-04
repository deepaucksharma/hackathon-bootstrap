# nri-kafka Verification & Troubleshooting Summary

## 🚀 Quick Verification Steps

### 1. Run Automated Verification
```bash
cd k8s-deploy
./verify-deployment.sh
```
This script performs comprehensive checks and provides a pass/fail summary.

### 2. Generate Test Traffic
```bash
./test-kafka-metrics.sh
```
Creates test topics, producers, and consumers to generate metrics.

### 3. Check New Relic UI
- Navigate to: **Infrastructure > Third-party services > Apache Kafka**
- Wait 2-5 minutes for initial metrics
- Look for your cluster name in the dashboard

### 4. Run NRQL Verification
```sql
-- In New Relic Query Builder
SELECT count(*) FROM KafkaBrokerSample WHERE clusterName = 'my-k8s-cluster' SINCE 30 minutes ago
```

## 🔍 Manual Verification Checklist

### Infrastructure Layer
- [ ] All Kafka pods running (3 brokers)
- [ ] Zookeeper pod running
- [ ] Producer/Consumer pods running
- [ ] New Relic Infrastructure pods running
- [ ] No pods in CrashLoopBackOff state

### Network Layer
- [ ] DNS resolution working (kafka-*.kafka-headless)
- [ ] Kafka port 9092 accessible
- [ ] JMX port 9999 accessible
- [ ] No network policies blocking traffic

### Kafka Layer
- [ ] Brokers forming cluster successfully
- [ ] Topics can be created
- [ ] Messages can be produced/consumed
- [ ] Consumer groups visible
- [ ] JMX metrics exposed

### Integration Layer
- [ ] nri-kafka configuration in ConfigMap
- [ ] nri-kafka binary exists
- [ ] Integration executing (check logs)
- [ ] No authentication errors
- [ ] Metrics being collected

### New Relic Layer
- [ ] License key valid
- [ ] Metrics POST requests successful (200 status)
- [ ] Data visible in UI
- [ ] No rate limiting errors

## 🛠️ Troubleshooting Tools

### Available Scripts
1. **deploy-nri-kafka.sh** - Main deployment script
2. **verify-deployment.sh** - Automated verification
3. **test-kafka-metrics.sh** - Generate test data

### Documentation
1. **README.md** - Deployment instructions
2. **TROUBLESHOOTING.md** - Detailed troubleshooting guide
3. **DEBUG-COMMANDS.md** - Quick command reference
4. **VERIFICATION-SUMMARY.md** - This file

### Key Commands
```bash
# Quick status
kubectl get pods -n kafka
kubectl get pods -n newrelic

# Integration logs
kubectl logs -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure -c newrelic-infrastructure | grep -i kafka

# Test JMX
kubectl exec -n newrelic $(kubectl get pods -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure -o jsonpath='{.items[0].metadata.name}') -- nc -zv kafka-0.kafka-headless.kafka.svc.cluster.local 9999

# Manual integration test
kubectl exec -n newrelic $(kubectl get pods -n newrelic -l app.kubernetes.io/name=newrelic-infrastructure -o jsonpath='{.items[0].metadata.name}') -c newrelic-infrastructure -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka -cluster_name test -bootstrap_broker_host kafka-0.kafka-headless.kafka.svc.cluster.local -bootstrap_broker_jmx_port 9999 -metrics true -pretty
```

## 🚨 Common Issues & Quick Fixes

### No Metrics in New Relic
1. Check license key: `kubectl get secret -n newrelic -o yaml | grep license`
2. Verify JMX connectivity: `nc -zv kafka-0.kafka-headless.kafka.svc.cluster.local 9999`
3. Check integration logs for errors
4. Ensure cluster name matches in all configs

### JMX Connection Failed
1. Verify JMX port in Kafka env: `kubectl exec -n kafka kafka-0 -- env | grep JMX`
2. Check if port is listening: `kubectl exec -n kafka kafka-0 -- netstat -tlnp | grep 9999`
3. Test from New Relic pod
4. Check JMX authentication settings

### DNS Resolution Issues
1. Check CoreDNS: `kubectl get pods -n kube-system -l k8s-app=kube-dns`
2. Test with busybox: `kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup kafka-0.kafka-headless.kafka.svc.cluster.local`
3. Verify service exists: `kubectl get svc -n kafka`

### Consumer Lag Not Visible
1. Ensure consumers are active: `kubectl exec -n kafka kafka-0 -- kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list`
2. Check consumer group state: `kubectl exec -n kafka kafka-0 -- kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --all-groups`
3. Generate test traffic: `./test-kafka-metrics.sh`

## 📊 Expected Metrics

Once working correctly, you should see:

### In New Relic UI
- **Brokers**: 3 brokers with status, throughput, and partition metrics
- **Topics**: List of topics with message rates and sizes
- **Consumer Groups**: Groups with lag metrics
- **JVM Metrics**: Memory, GC, and thread metrics from JMX

### Key Metrics Available
- `broker.messagesInPerSecond`
- `broker.bytesInPerSecond`
- `broker.bytesOutPerSecond`
- `topic.partitionCount`
- `consumer.lag`
- `consumer.messageRate`

## 🔄 Maintenance Tasks

### Regular Checks
- Monitor pod restarts: High restart count indicates issues
- Check disk usage: Kafka can fill disks quickly
- Review consumer lag: High lag indicates processing issues
- Validate metrics accuracy: Compare with Kafka's own tools

### Updates
- Keep nri-bundle Helm chart updated
- Monitor New Relic integration updates
- Update Kafka version as needed
- Review and update resource limits

## 📞 Getting Help

1. Check all logs thoroughly
2. Run verification script for diagnostic info
3. Review New Relic documentation
4. Check Kafka broker logs: `kubectl logs -n kafka kafka-0`
5. Enable debug logging if needed

Remember: Most issues are related to networking, DNS, or JMX configuration!