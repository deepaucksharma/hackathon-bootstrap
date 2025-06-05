# MSK Implementation Action Plan

## Immediate Actions for Account 3001033

### 1. Verify Infrastructure Agent Deployment
```bash
# Check if infrastructure agent is running
kubectl get pods -n newrelic | grep infrastructure

# Check logs for MSK/Kafka errors
kubectl logs -n newrelic <infrastructure-pod> | grep -E "kafka|msk|error|warn"

# Verify nri-kafka is included
kubectl exec -n newrelic <infrastructure-pod> -- ls -la /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka
```

### 2. Verify MSK Configuration
```bash
# Check configmap for MSK configuration
kubectl get configmap -n newrelic infrastructure-config -o yaml | grep -A 20 "kafka"

# Verify environment variables
kubectl describe deployment -n newrelic newrelic-infrastructure | grep -A 20 "Environment"
```

### 3. Test JMX Connectivity
```bash
# From within the infrastructure pod
kubectl exec -it -n newrelic <infrastructure-pod> -- /bin/sh

# Test JMX connection to Kafka broker
nc -zv <kafka-broker-host> 9990

# Check if JMX is accessible
curl -v telnet://<kafka-broker-host>:9990
```

### 4. Enable Debug Logging
Update the infrastructure deployment:
```yaml
env:
  - name: NRIA_VERBOSE
    value: "1"
  - name: NRIA_LOG_LEVEL
    value: "debug"
```

### 5. Verify Binary Has MSK Shim
```bash
# Check nri-kafka version and features
kubectl exec -n newrelic <infrastructure-pod> -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka --version

# Run dry-run to test MSK shim
kubectl exec -n newrelic <infrastructure-pod> -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka --dry_run --pretty
```

## Configuration Checklist

### ✅ Account 3630072 (Working)
- [x] Infrastructure agent running
- [x] Custom nri-kafka with MSK shim
- [x] MSK_USE_DIMENSIONAL=true
- [x] Proper JMX connectivity
- [x] Data freshness < 5 minutes

### ❌ Account 3001033 (Not Working)
- [ ] Infrastructure agent running?
- [ ] Custom nri-kafka with MSK shim?
- [ ] MSK_USE_DIMENSIONAL=true?
- [ ] JMX connectivity established?
- [ ] Firewall rules configured?

## Deployment Verification Script

Create and run this script in each environment:

```bash
#!/bin/bash
# verify-msk-deployment.sh

echo "=== MSK Deployment Verification ==="

# 1. Check pods
echo -e "\n1. Infrastructure Pods:"
kubectl get pods -n newrelic | grep -E "infrastructure|kafka"

# 2. Check nri-kafka binary
echo -e "\n2. NRI-Kafka Binary:"
POD=$(kubectl get pods -n newrelic -o name | grep infrastructure | head -1 | cut -d'/' -f2)
kubectl exec -n newrelic $POD -- ls -la /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka

# 3. Check environment variables
echo -e "\n3. Environment Variables:"
kubectl exec -n newrelic $POD -- env | grep -E "MSK|KAFKA|DIMENSIONAL"

# 4. Test connectivity
echo -e "\n4. Kafka Broker Connectivity:"
KAFKA_HOST=$(kubectl get svc -n kafka | grep kafka | head -1 | awk '{print $1}')
kubectl exec -n newrelic $POD -- nc -zv $KAFKA_HOST.kafka.svc.cluster.local 9092

# 5. Run dry-run test
echo -e "\n5. MSK Shim Dry Run:"
kubectl exec -n newrelic $POD -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
  --cluster_name="test-cluster" \
  --bootstrap_broker_host="$KAFKA_HOST.kafka.svc.cluster.local" \
  --bootstrap_broker_port="9092" \
  --dry_run \
  --pretty | head -20
```

## Expected Output Comparison

### Good (Account 3630072):
```json
{
  "name": "com.newrelic.kafka",
  "integration_version": "3.7.0",
  "protocol_version": "4",
  "data": [
    {
      "entity": {
        "name": "my-kafka-cluster",
        "type": "AWS_KAFKA_CLUSTER"
      },
      "metrics": [
        {
          "event_type": "AwsMskClusterSample",
          "provider.activeControllerCount.Sum": 1,
          "provider.offlinePartitionsCount.Sum": 0
        }
      ]
    }
  ]
}
```

### Bad (Account 3001033):
- Empty data array
- Connection errors
- Missing entity types
- No AwsMsk* event types

## Root Cause Analysis

Based on the verification results:

1. **If no pods found**: Infrastructure agent not deployed
2. **If binary missing**: Using standard infrastructure bundle without custom nri-kafka
3. **If env vars missing**: ConfigMap not properly configured
4. **If connectivity fails**: Network/firewall issues
5. **If dry-run fails**: MSK shim not enabled in binary

## Fix Implementation

Once root cause identified:

1. **Deploy correct binary**:
   ```bash
   # Copy custom nri-kafka to infrastructure bundle
   kubectl cp ./nri-kafka newrelic/<pod>:/var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka
   kubectl exec -n newrelic <pod> -- chmod +x /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka
   ```

2. **Update ConfigMap**:
   ```yaml
   integrations:
     - name: nri-kafka
       env:
         MSK_USE_DIMENSIONAL: "true"
         NRI_KAFKA_USE_DIMENSIONAL: "true"
         CLUSTER_NAME: "msk-cluster-account-3001033"
   ```

3. **Restart pods**:
   ```bash
   kubectl rollout restart deployment/newrelic-infrastructure -n newrelic
   ```

4. **Verify fix**:
   ```bash
   # Wait 5 minutes for data collection
   sleep 300
   
   # Re-run verification
   ACC=3001033 ./verify-kafka-metrics.js
   ```