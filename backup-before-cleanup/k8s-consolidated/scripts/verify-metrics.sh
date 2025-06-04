#!/bin/bash

# Script to verify Kafka metrics in New Relic
# Uses the Node.js verification script with credentials from .env

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Load environment variables
if [ -f ../../.env ]; then
    export $(grep -v '^#' ../../.env | xargs)
fi

echo -e "${GREEN}=== Verifying Kafka Metrics in NRDB ===${NC}"
echo "Account ID: $ACC"
echo "Cluster Name: kafka-k8s-monitoring"
echo ""

# Change to project root
cd ../..

# Run verification
echo -e "${BLUE}Running verification script...${NC}"
node verify-metrics-nodejs.js \
    --apiKey=$UKEY \
    --accountId=$ACC \
    --clusterName=kafka-k8s-monitoring

# Also check without cluster filter to see all data
echo -e "\n${BLUE}Checking all Kafka data...${NC}"
node check-all-kafka-data.js

echo -e "\n${YELLOW}Note: If no data is found for 'kafka-k8s-monitoring', check the actual cluster name being reported${NC}"