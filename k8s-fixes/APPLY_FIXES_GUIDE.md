# Kafka Monitoring Fix Guide

This guide will help you fix the Kafka monitoring issues identified during verification.

## Issues to Fix

1. ❌ **Cluster name mismatch**: Currently reporting as "strimzi-production-kafka" instead of "kafka-k8s-monitoring"
2. ❌ **No metric values**: JMX metrics showing 0 or null values
3. ❌ **No topics collected**: Topic collection appears disabled
4. ❌ **MSK shim configuration**: Missing or incorrect environment variables

## Fix Steps

### 1. Identify Your Namespace

First, find the namespace where Kafka and nri-kafka are deployed:

```bash
# Find Kafka namespace
kubectl get ns | grep -E "(kafka|strimzi)"

# Or find by looking for nri-kafka pods
kubectl get pods --all-namespaces | grep -i nri-kafka
```

Update the namespace in all YAML files (replace `strimzi-kafka` with your actual namespace).

### 2. Apply Fixed Configuration

Apply the fixes in order:

```bash
# Navigate to fixes directory
cd k8s-fixes/

# 1. Delete old configmap and apply new one
kubectl delete configmap nri-kafka-config -n <your-namespace> --ignore-not-found
kubectl apply -f 01-fixed-configmap.yaml

# 2. Apply MSK shim deployment (creates separate deployment for MSK)
kubectl apply -f 02-msk-shim-deployment.yaml

# 3. Optional: Apply DaemonSet if you prefer that over Deployment
kubectl apply -f 03-daemonset-with-fixes.yaml

# 4. Test JMX connectivity
kubectl apply -f 04-jmx-connectivity-test.yaml
```

### 3. Restart Existing Pods

Force pods to pick up new configuration:

```bash
# Delete existing nri-kafka pods (they will auto-recreate)
kubectl delete pods -l app=nri-kafka -n <your-namespace>
kubectl delete pods -l app=nri-kafka-msk-shim -n <your-namespace>

# If using deployment name directly
kubectl rollout restart deployment/nri-kafka -n <your-namespace>
```

### 4. Verify JMX Connectivity

Check the test job results:

```bash
# Watch the test job
kubectl logs job/test-kafka-jmx -n <your-namespace> -f

# Check individual Kafka broker JMX settings
for i in 0 1 2; do
  echo "Checking broker $i JMX..."
  kubectl exec production-kafka-$i -n <your-namespace> -- \
    sh -c "netstat -tlnp | grep 9999 || echo 'JMX not listening on 9999'"
done
```

### 5. Monitor Logs

Check for errors:

```bash
# NRI-Kafka logs
kubectl logs -l app=nri-kafka -n <your-namespace> --tail=50 -f

# MSK shim logs
kubectl logs -l app=nri-kafka-msk-shim -n <your-namespace> --tail=50 -f

# Look for successful metric collection
kubectl logs -l app=nri-kafka -n <your-namespace> | grep -i "metric\|jmx\|collected"
```

### 6. Common Issues and Solutions

#### JMX Connection Refused
If you see "connection refused" for JMX:

```bash
# Check if JMX is enabled on Kafka pods
kubectl exec production-kafka-0 -n <your-namespace> -- env | grep JMX

# Expected output should include:
# KAFKA_JMX_OPTS=-Dcom.sun.management.jmxremote...
# KAFKA_JMX_PORT=9999
```

#### No Metrics Values
If entities exist but metrics are null/0:

1. Check JMX authentication is disabled (as per monitoring status)
2. Verify network policies aren't blocking port 9999
3. Ensure Kafka brokers have JMX exporters configured

#### Wrong Cluster Name
The ConfigMap now sets `CLUSTER_NAME: kafka-k8s-monitoring`. If it's still wrong:

1. Check if there's another ConfigMap overriding it
2. Look for environment variables in the deployment
3. Check if the integration is reading from a different config file

### 7. Wait and Verify

After applying fixes:

1. Wait 3-5 minutes for metrics to start flowing
2. Run the verification script:

```bash
cd /home/deepak/src/nri-kafka
node verify-metrics-nodejs.js \
  --apiKey=YOUR_NEW_RELIC_API_KEY \
  --accountId=YOUR_ACCOUNT_ID \
  --clusterName=kafka-k8s-monitoring
```

### 8. Expected Results

After fixes, you should see:
- ✅ Cluster name: "kafka-k8s-monitoring"
- ✅ Broker metrics with actual values (not 0)
- ✅ Topic collection working
- ✅ MSK shim creating entities with proper metrics
- ✅ Consumer lag data (if consumers are running)

### 9. Rollback

If something goes wrong:

```bash
# Save current state
kubectl get all -n <your-namespace> -o yaml > current-state-backup.yaml

# To rollback, delete new resources
kubectl delete -f 02-msk-shim-deployment.yaml
kubectl delete -f 01-fixed-configmap.yaml

# Restore previous configmap from backup
kubectl apply -f ../backup-configmaps-*.yaml
```

## Next Steps

Once metrics are flowing correctly:
1. Create dashboards for both standard and MSK metrics
2. Set up alerts for critical metrics
3. Monitor consumer lag trends
4. Document the working configuration