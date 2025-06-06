#!/bin/bash

echo "================================================================================"
echo "KUBERNETES DEPLOYMENT VERIFICATION"
echo "================================================================================"
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "================================================================================"
echo

echo "📦 KAFKA DEPLOYMENT STATUS"
echo "--------------------------------------------------------------------------------"
echo "Namespace: kafka"
kubectl get pods -n kafka -o wide

echo
echo "📊 KAFKA SERVICES"
echo "--------------------------------------------------------------------------------"
kubectl get services -n kafka

echo
echo "🔍 NEWRELIC DEPLOYMENT STATUS"
echo "--------------------------------------------------------------------------------"
echo "Namespace: newrelic"
kubectl get pods -n newrelic -o wide | grep -E "(NAME|nri-kafka)"

echo
echo "📋 CONFIGMAP STATUS"
echo "--------------------------------------------------------------------------------"
kubectl get configmap -n newrelic | grep nri-kafka

echo
echo "🔐 SECRETS STATUS"
echo "--------------------------------------------------------------------------------"
kubectl get secrets -n newrelic | grep newrelic

echo
echo "💾 RESOURCE USAGE"
echo "--------------------------------------------------------------------------------"
kubectl top nodes 2>/dev/null || echo "Metrics server not available"

echo
echo "🏃 RUNNING PODS SUMMARY"
echo "--------------------------------------------------------------------------------"
echo "Total pods in kafka namespace: $(kubectl get pods -n kafka --no-headers | wc -l)"
echo "Running pods in kafka namespace: $(kubectl get pods -n kafka --no-headers | grep Running | wc -l)"
echo "Total pods in newrelic namespace: $(kubectl get pods -n newrelic --no-headers | wc -l)"
echo "Running pods in newrelic namespace: $(kubectl get pods -n newrelic --no-headers | grep Running | wc -l)"

echo
echo "🔄 RECENT EVENTS"
echo "--------------------------------------------------------------------------------"
kubectl get events -n newrelic --sort-by='.lastTimestamp' | grep -E "(nri-kafka|Warning|Error)" | tail -10

echo
echo "✅ DEPLOYMENT VERIFICATION COMPLETE"
echo "================================================================================"