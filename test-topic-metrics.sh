#!/bin/bash

# Test script to verify MSK topic metrics collection

echo "Testing MSK Topic Metrics Collection..."

# Set up environment for MSK mode
export NEW_RELIC_MSK_MODE=true
export NEW_RELIC_MSK_CLUSTER_NAME="test-cluster"
export NEW_RELIC_MSK_AWS_REGION="us-east-1"
export NEW_RELIC_MSK_AWS_ACCOUNT_ID="123456789012"
export NEW_RELIC_MSK_CLUSTER_ARN="arn:aws:kafka:us-east-1:123456789012:cluster/test-cluster/550e8400-e29b-41d4-a716-446655440000"

# Create a test config file
cat > test-kafka-config.yml <<EOF
integration_name: com.newrelic.kafka

instances:
  - name: kafka-metrics
    command: metrics
    arguments:
      cluster_name: test-cluster
      jmx_host: localhost
      jmx_port: 9999
      topic_mode: all
      collect_topic_size: true
      bootstrap_broker_host: localhost
      bootstrap_broker_kafka_port: 9092
      producers:
        - name: producer1
      consumers:
        - name: consumer1
    labels:
      env: test
      role: kafka
EOF

# Run nri-kafka in dry-run mode
echo "Running nri-kafka with MSK mode enabled..."
./nri-kafka --config_path test-kafka-config.yml --verbose | tee nri-kafka-output.json

# Check for AwsMskTopicSample entities
echo ""
echo "Checking for AwsMskTopicSample entities..."
if grep -q "AwsMskTopicSample" nri-kafka-output.json; then
    echo "✓ Found AwsMskTopicSample entities!"
    echo "Topic metrics count:"
    grep -c "AwsMskTopicSample" nri-kafka-output.json
else
    echo "✗ No AwsMskTopicSample entities found"
fi

# Clean up
rm -f test-kafka-config.yml nri-kafka-output.json

echo "Test complete."