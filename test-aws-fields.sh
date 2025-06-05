#!/bin/bash

echo "Testing AWS fields in MSK shim..."

# Set environment variables
export MSK_SHIM_ENABLED=true
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=us-east-1
export KAFKA_CLUSTER_NAME=test-kafka-cluster
export NEW_RELIC_API_KEY=NRAK-YOURKEY123

# Test with a simple broker connection
echo "Running nri-kafka with MSK shim enabled..."
./nri-kafka \
  -cluster_name test-kafka-cluster \
  -autodiscover_strategy bootstrap \
  -bootstrap_broker_host localhost \
  -bootstrap_broker_kafka_port 9092 \
  -bootstrap_broker_jmx_port 9999 \
  -metrics \
  -pretty 2>&1 | head -200

echo "Test completed"