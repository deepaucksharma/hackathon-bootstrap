#!/bin/bash

# Quick apply script for Kafka monitoring fixes
# Usage: ./quick-apply.sh [namespace]

NAMESPACE=${1:-strimzi-kafka}

echo "Applying Kafka monitoring fixes to namespace: $NAMESPACE"
echo "=============================================="

# Update namespace in all files
echo "Updating namespace in YAML files..."
sed -i "s/namespace: strimzi-kafka/namespace: $NAMESPACE/g" *.yaml

# Apply configurations
echo -e "\n1. Applying fixed ConfigMap..."
kubectl apply -f 01-fixed-configmap.yaml

echo -e "\n2. Applying MSK shim deployment..."
kubectl apply -f 02-msk-shim-deployment.yaml

echo -e "\n3. Restarting pods..."
kubectl delete pods -l app=nri-kafka -n $NAMESPACE --ignore-not-found=true
kubectl delete pods -l app=nri-kafka-msk-shim -n $NAMESPACE --ignore-not-found=true

echo -e "\n4. Waiting for pods to be ready..."
sleep 10
kubectl get pods -n $NAMESPACE | grep -i nri

echo -e "\n5. Testing JMX connectivity..."
kubectl apply -f 04-jmx-connectivity-test.yaml

echo -e "\nDone! Check the logs:"
echo "kubectl logs job/test-kafka-jmx -n $NAMESPACE"
echo "kubectl logs -l app=nri-kafka-msk-shim -n $NAMESPACE --tail=20"