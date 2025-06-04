#!/bin/bash

# Test script for MSK integration

echo "Testing MSK integration..."

# Set up test environment variables
export KAFKA_CLUSTER_NAME="test-kafka-cluster"
export MSK_CLUSTER_ARN="arn:aws:kafka:us-east-1:123456789012:cluster/test-kafka-cluster/12345678-1234-1234-1234-123456789012-1"
export AWS_ACCOUNT_ID="123456789012"
export AWS_REGION="us-east-1"
export ENVIRONMENT="test"

# Additional Kafka settings
export CLUSTER_NAME="test-kafka-cluster"
export AUTODISCOVER_STRATEGY="bootstrap"
export BOOTSTRAP_BROKER_HOST="localhost"
export BOOTSTRAP_BROKER_KAFKA_PORT="9092"
export BOOTSTRAP_BROKER_JMX_PORT="9999"

# Run the integration in dry-run mode to see what happens
echo "Running nri-kafka with MSK shim enabled..."
./nri-kafka --verbose --pretty 2>&1 | head -50

echo ""
echo "MSK environment variables set:"
echo "MSK_SHIM_ENABLED=true (set by integration)"
echo "KAFKA_CLUSTER_NAME=$KAFKA_CLUSTER_NAME"
echo "MSK_CLUSTER_ARN=$MSK_CLUSTER_ARN"
echo "AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID"
echo "AWS_REGION=$AWS_REGION"
echo "ENVIRONMENT=$ENVIRONMENT"