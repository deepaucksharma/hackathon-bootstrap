#!/bin/bash

# Test JMX connectivity from New Relic pod to Kafka brokers

echo "Testing JMX connectivity to Kafka brokers..."

NRI_POD=$(kubectl get pods -n newrelic -l app.kubernetes.io/component=kubelet -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -z "$NRI_POD" ]; then
    NRI_POD=$(kubectl get pods -n newrelic -l app=nri-kafka-monitor -o jsonpath='{.items[0].metadata.name}')
fi

echo "Using New Relic pod: $NRI_POD"

# Test each Kafka broker
for i in 0 1 2; do
    BROKER_HOST="kafka-$i.kafka-headless.kafka.svc.cluster.local"
    echo ""
    echo "Testing broker: $BROKER_HOST"
    
    # Test network connectivity
    echo "1. Testing network connectivity to $BROKER_HOST:9999..."
    kubectl exec -n newrelic $NRI_POD -c agent -- nc -zv $BROKER_HOST 9999 2>&1 || kubectl exec -n newrelic $NRI_POD -- nc -zv $BROKER_HOST 9999 2>&1
    
    # Test JMX with nrjmx
    echo "2. Testing JMX connection with nrjmx..."
    kubectl exec -n newrelic $NRI_POD -c agent -- bash -c "echo '' | /usr/bin/nrjmx -H $BROKER_HOST -P 9999 -v" 2>&1 | head -20 || kubectl exec -n newrelic $NRI_POD -- bash -c "echo '' | /usr/bin/nrjmx -H $BROKER_HOST -P 9999 -v" 2>&1 | head -20
    
    # Test with nri-kafka
    echo "3. Testing with nri-kafka integration..."
    kubectl exec -n newrelic $NRI_POD -c agent -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
        --cluster_name test \
        --bootstrap_broker_host $BROKER_HOST \
        --bootstrap_broker_jmx_port 9999 \
        --bootstrap_broker_kafka_port 9092 \
        --metrics --pretty 2>&1 | head -50 || \
    kubectl exec -n newrelic $NRI_POD -- /var/db/newrelic-infra/newrelic-integrations/bin/nri-kafka \
        --cluster_name test \
        --bootstrap_broker_host $BROKER_HOST \
        --bootstrap_broker_jmx_port 9999 \
        --bootstrap_broker_kafka_port 9092 \
        --metrics --pretty 2>&1 | head -50
done