#!/bin/bash
echo "🔍 Verifying Kafka Metrics in Minikube"
echo "======================================"

# Check pod status
echo -e "\n📦 Pod Status:"
kubectl get pods -n newrelic -l app=nri-kafka-bundle

# Check recent logs
echo -e "\n📋 Recent MSK Shim Activity:"
kubectl logs -n newrelic -l app=nri-kafka-bundle --tail=50 | grep -E "(MSK|AwsMsk|entity\.type|providerExternalId|Created.*entity)" | tail -10

# Check if metrics are being collected
echo -e "\n📊 Metrics Collection Summary:"
kubectl logs -n newrelic -l app=nri-kafka-bundle --tail=100 | grep -E "(Created.*entity|metrics|Transformed)" | tail -10

# Show AWS configuration
echo -e "\n⚙️ AWS Configuration:"
kubectl logs -n newrelic -l app=nri-kafka-bundle --tail=200 | grep -E "(AWS_ACCOUNT_ID|AWS_REGION|awsAccountId)" | tail -5

# Check for errors
echo -e "\n❌ Recent Errors (if any):"
kubectl logs -n newrelic -l app=nri-kafka-bundle --tail=100 | grep -iE "(error|failed|exception)" | tail -5

echo -e "\n✅ Deployment Status:"
kubectl get deployment,daemonset -n newrelic | grep kafka

echo -e "\n🔗 Test Integration Output:"
kubectl exec -n newrelic $(kubectl get pods -n newrelic -l app=nri-kafka-bundle -o jsonpath='{.items[0].metadata.name}') -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka -pretty -cluster_name minikube-kafka 2>&1 | head -50 || echo "Direct execution failed"