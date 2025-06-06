#!/bin/bash

echo "================================================================================"
echo "INTEGRATION HEALTH CHECK"
echo "================================================================================"
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "================================================================================"
echo

echo "🔌 NRI-KAFKA INTEGRATION STATUS"
echo "--------------------------------------------------------------------------------"
POD=$(kubectl get pods -n newrelic | grep nri-kafka | awk '{print $1}')
echo "Active Pod: $POD"
echo

echo "📝 LAST 20 LOG ENTRIES"
echo "--------------------------------------------------------------------------------"
kubectl logs -n newrelic $POD | tail -20

echo
echo "🔍 MSK SHIM STATUS"
echo "--------------------------------------------------------------------------------"
kubectl logs -n newrelic $POD | grep -E "(MSK shim|Transformed|Flushing)" | tail -10

echo
echo "📊 METRICS COLLECTION SUMMARY"
echo "--------------------------------------------------------------------------------"
kubectl logs -n newrelic $POD | grep -E "(Transformed MSK|Created MSK|metrics)" | tail -10

echo
echo "🌡️ ENVIRONMENT VARIABLES"
echo "--------------------------------------------------------------------------------"
kubectl exec -n newrelic $POD -- printenv | grep -E "(MSK|AWS|KAFKA|NEW_RELIC)" | sort

echo
echo "🚦 KAFKA CONNECTIVITY TEST"
echo "--------------------------------------------------------------------------------"
kubectl exec -n kafka kafka-0 -- kafka-topics.sh --bootstrap-server kafka-0.kafka-headless.kafka.svc.cluster.local:9092 --list 2>/dev/null || echo "Unable to list topics"

echo
echo "📈 PRODUCER/CONSUMER STATUS"
echo "--------------------------------------------------------------------------------"
echo "Active Producers:"
kubectl get pods -n kafka | grep producer | grep Running | wc -l
echo "Active Consumers:"
kubectl get pods -n kafka | grep consumer | grep Running | wc -l

echo
echo "✅ INTEGRATION HEALTH CHECK COMPLETE"
echo "================================================================================"