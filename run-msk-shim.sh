#!/bin/bash

# Load environment from .env file
source .env

# Export required environment variables
export NRIA_LICENSE_KEY=$IKEY
export NEW_RELIC_API_KEY=$UKEY
export NRIA_PASSTHROUGH_ENVIRONMENT="MSK_SHIM_ENABLED,MSK_USE_DIMENSIONAL,AWS_ACCOUNT_ID,AWS_REGION,KAFKA_CLUSTER_NAME,ENVIRONMENT,NRIA_LICENSE_KEY,NEW_RELIC_API_KEY"

# MSK Configuration
export MSK_SHIM_ENABLED=true
export MSK_USE_DIMENSIONAL=true
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=us-east-1
export KAFKA_CLUSTER_NAME=local-kafka-cluster
export ENVIRONMENT=production

echo "Running nri-kafka with MSK shim enabled..."
echo "Configuration:"
echo "  MSK_SHIM_ENABLED=$MSK_SHIM_ENABLED"
echo "  MSK_USE_DIMENSIONAL=$MSK_USE_DIMENSIONAL"
echo "  AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID"
echo "  AWS_REGION=$AWS_REGION"
echo "  KAFKA_CLUSTER_NAME=$KAFKA_CLUSTER_NAME"
echo "  License Key: ${NRIA_LICENSE_KEY:0:10}..."

# Run nri-kafka directly
./nri-kafka -config_file kafka-config-msk.yml -verbose