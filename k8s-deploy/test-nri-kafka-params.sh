#!/bin/bash

# Test nri-kafka with various parameter combinations

NRI_POD=$(kubectl get pods -n newrelic -l app.kubernetes.io/component=kubelet -o jsonpath='{.items[0].metadata.name}')

echo "Testing nri-kafka with different parameter combinations..."
echo "Using pod: $NRI_POD"
echo ""

# Test 1: Basic test
echo "=== Test 1: Basic metrics collection ==="
kubectl exec -n newrelic $NRI_POD -c agent -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
    --cluster_name test \
    --bootstrap_broker_host kafka.kafka.svc.cluster.local \
    --bootstrap_broker_jmx_port 9999 \
    --bootstrap_broker_kafka_port 9092 \
    --metrics \
    --pretty

echo -e "\n=== Test 2: With JMX authentication disabled ==="
kubectl exec -n newrelic $NRI_POD -c agent -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
    --cluster_name test \
    --bootstrap_broker_host kafka.kafka.svc.cluster.local \
    --bootstrap_broker_jmx_port 9999 \
    --bootstrap_broker_kafka_port 9092 \
    --jmx_ssl_enable=false \
    --metrics \
    --pretty

echo -e "\n=== Test 3: Direct pod IP connection ==="
KAFKA_POD_IP=$(kubectl get pod -n kafka -l app=kafka -o jsonpath='{.items[0].status.podIP}')
kubectl exec -n newrelic $NRI_POD -c agent -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
    --cluster_name test \
    --bootstrap_broker_host $KAFKA_POD_IP \
    --bootstrap_broker_jmx_port 9999 \
    --bootstrap_broker_kafka_port 9092 \
    --metrics \
    --pretty

echo -e "\n=== Test 4: With local only collection ==="
kubectl exec -n newrelic $NRI_POD -c agent -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
    --cluster_name test \
    --bootstrap_broker_host kafka.kafka.svc.cluster.local \
    --bootstrap_broker_jmx_port 9999 \
    --bootstrap_broker_kafka_port 9092 \
    --local_only_collection \
    --metrics \
    --pretty

echo -e "\n=== Test 5: Consumer offset collection ==="
kubectl exec -n newrelic $NRI_POD -c agent -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
    --cluster_name test \
    --bootstrap_broker_host kafka.kafka.svc.cluster.local \
    --bootstrap_broker_kafka_port 9092 \
    --consumer_offset \
    --pretty

echo -e "\n=== Test 6: With all flags and verbose ==="
kubectl exec -n newrelic $NRI_POD -c agent -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
    --cluster_name test \
    --bootstrap_broker_host kafka.kafka.svc.cluster.local \
    --bootstrap_broker_jmx_port 9999 \
    --bootstrap_broker_kafka_port 9092 \
    --metrics \
    --inventory \
    --events \
    --consumer_offset \
    --topic_mode all \
    --verbose \
    --pretty

echo -e "\n=== Test 7: Check JMX connectivity with nc ==="
kubectl exec -n newrelic $NRI_POD -c agent -- timeout 5 bash -c "echo 'test' | nc kafka.kafka.svc.cluster.local 9999" || echo "JMX port test completed"

echo -e "\n=== Test 8: List available environment variables ==="
kubectl exec -n newrelic $NRI_POD -c agent -- env | grep -E "CLUSTER|KAFKA|JMX|NRI"