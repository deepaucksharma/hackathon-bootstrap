#!/bin/bash
echo "🔍 Testing Entity Synthesis and UI Visibility"
echo "=============================================="

# Check if we're generating the right entity types
echo -e "\n📊 Checking Entity Types in Logs:"
kubectl logs -n newrelic -l app=nri-kafka-bundle --tail=500 | grep -E "entity\.(type|name|guid)" | tail -20

# Check the actual integration output
echo -e "\n📋 Direct Integration Output:"
kubectl exec -n newrelic $(kubectl get pods -n newrelic -l app=nri-kafka-bundle -o jsonpath='{.items[0].metadata.name}') -- \
  /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
  -cluster_name minikube-kafka \
  -pretty 2>&1 | grep -A5 -B5 "AwsMsk" | head -50

# Check what's being sent
echo -e "\n🔗 Sample Metrics Being Sent:"
kubectl logs -n newrelic -l app=nri-kafka-bundle --tail=300 | grep -i "sample metric payload" | tail -5

# Check event types
echo -e "\n📦 Event Types Generated:"
kubectl exec -n newrelic $(kubectl get pods -n newrelic -l app=nri-kafka-bundle -o jsonpath='{.items[0].metadata.name}') -- \
  /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
  -cluster_name minikube-kafka 2>&1 | grep -E "event_type|eventType" | sort | uniq

# Check if standard Kafka entities are also being created
echo -e "\n🎯 Standard Kafka Entities:"
kubectl logs -n newrelic -l app=nri-kafka-bundle --tail=200 | grep -E "KafkaBrokerSample|KafkaTopicSample|KafkaOffsetSample" | tail -10