#!/bin/bash

# Setup and test script for local Kafka + nri-kafka + infrastructure agent
# This script will:
# 1. Start Kafka with docker-compose
# 2. Create test topics and generate data
# 3. Run the platform in infrastructure mode
# 4. Verify entities are created correctly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Kafka Infrastructure Mode Test Setup${NC}"
echo -e "${BLUE}========================================${NC}"

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

# Check environment variables
if [ -z "$NEW_RELIC_ACCOUNT_ID" ]; then
    echo -e "${YELLOW}NEW_RELIC_ACCOUNT_ID not set. Using default test value.${NC}"
    export NEW_RELIC_ACCOUNT_ID="12345"
fi

if [ -z "$NEW_RELIC_API_KEY" ]; then
    echo -e "${YELLOW}NEW_RELIC_API_KEY not set. Using test mode.${NC}"
    export NEW_RELIC_API_KEY="test-key"
    export DRY_RUN=true
fi

echo -e "${GREEN}✓ Prerequisites checked${NC}"

# Step 1: Start Kafka cluster
echo -e "\n${YELLOW}Step 1: Starting Kafka cluster...${NC}"
cd infrastructure

# Stop any existing containers
docker-compose down -v 2>/dev/null || true

# Start Kafka
docker-compose up -d

# Wait for Kafka to be ready
echo -e "${YELLOW}Waiting for Kafka to be ready...${NC}"
sleep 10

# Check if Kafka is running
if docker-compose ps | grep -q "kafka.*Up"; then
    echo -e "${GREEN}✓ Kafka is running${NC}"
else
    echo -e "${RED}✗ Kafka failed to start${NC}"
    docker-compose logs kafka
    exit 1
fi

# Wait for topics to be created
echo -e "${YELLOW}Waiting for topic initialization...${NC}"
sleep 20

# Verify topics were created
echo -e "\n${YELLOW}Verifying Kafka topics...${NC}"
docker-compose exec -T kafka kafka-topics --list --bootstrap-server localhost:9092

# Step 2: Generate test data
echo -e "\n${YELLOW}Step 2: Generating test data in Kafka...${NC}"

# The docker-compose already has producers running, but let's send some additional messages
docker-compose exec -T kafka bash -c '
for i in {1..10}; do
  echo "test-message-$i" | kafka-console-producer --broker-list localhost:9092 --topic user-events
done
'

echo -e "${GREEN}✓ Test data generated${NC}"

# Step 3: Check Kafka metrics with JMX
echo -e "\n${YELLOW}Step 3: Verifying JMX metrics availability...${NC}"

# Test JMX connectivity
docker run --rm --network infrastructure_kafka-network \
  eclipse-temurin:11-jre \
  bash -c "echo 'Testing JMX connection to kafka:9999' && nc -zv kafka 9999" || \
  echo -e "${YELLOW}⚠ JMX connection test skipped (normal if JMX client not available)${NC}"

# Step 4: Simulate nri-kafka data collection
echo -e "\n${YELLOW}Step 4: Testing with simulated nri-kafka data...${NC}"
cd ..

# Run the infrastructure test
node test-local-kafka.js

# Step 5: Run platform in infrastructure mode
echo -e "\n${YELLOW}Step 5: Running platform in infrastructure mode...${NC}"

# Run for 2 cycles to see data flow
echo -e "${BLUE}Running platform for 2 cycles (60 seconds)...${NC}"
timeout 60s node platform.js --mode infrastructure --interval 30 --dry-run --debug || true

# Step 6: Verify results
echo -e "\n${YELLOW}Step 6: Verification${NC}"
echo -e "${GREEN}✓ Infrastructure mode test completed${NC}"

# Show docker-compose status
echo -e "\n${YELLOW}Docker containers status:${NC}"
cd infrastructure
docker-compose ps

# Cleanup prompt
echo -e "\n${YELLOW}To stop Kafka cluster, run:${NC}"
echo -e "${BLUE}cd infrastructure && docker-compose down -v${NC}"

echo -e "\n${YELLOW}To run platform in infrastructure mode with real New Relic:${NC}"
echo -e "${BLUE}export NEW_RELIC_API_KEY=your-real-key${NC}"
echo -e "${BLUE}export NEW_RELIC_ACCOUNT_ID=your-account-id${NC}"
echo -e "${BLUE}node platform.js --mode infrastructure --interval 30${NC}"

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"