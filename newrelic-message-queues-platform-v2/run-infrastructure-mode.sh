#!/bin/bash

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║        Running Platform in Infrastructure Mode                ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check .env file
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    echo "Please create .env with your New Relic credentials:"
    echo ""
    echo "NEW_RELIC_ACCOUNT_ID=your-account-id"
    echo "NEW_RELIC_API_KEY=NRAK-your-api-key"
    echo "NEW_RELIC_USER_API_KEY=your-user-api-key"
    echo ""
    exit 1
fi

# Source environment
set -a
source .env
set +a

# Validate credentials
if [ -z "$NEW_RELIC_ACCOUNT_ID" ] || [ "$NEW_RELIC_ACCOUNT_ID" == "123456" ]; then
    echo -e "${RED}❌ Please set a valid NEW_RELIC_ACCOUNT_ID in .env${NC}"
    exit 1
fi

if [ -z "$NEW_RELIC_API_KEY" ] || [ "$NEW_RELIC_API_KEY" == "test-key" ]; then
    echo -e "${RED}❌ Please set a valid NEW_RELIC_API_KEY in .env${NC}"
    exit 1
fi

# Configure for infrastructure mode
export PLATFORM_MODE="infrastructure"
export PLATFORM_INTERVAL="${PLATFORM_INTERVAL:-30}"
export KAFKA_CLUSTER_NAME="${KAFKA_CLUSTER_NAME:-kafka-cluster}"
export LOOKBACK_MINUTES="${LOOKBACK_MINUTES:-5}"
export DASHBOARD_ENABLED="${DASHBOARD_ENABLED:-true}"
export DASHBOARD_NAME="${DASHBOARD_NAME:-Kafka Infrastructure Monitoring}"

echo -e "${BLUE}📋 Configuration:${NC}"
echo "   Mode: infrastructure"
echo "   Account ID: $NEW_RELIC_ACCOUNT_ID"
echo "   Cluster Name: $KAFKA_CLUSTER_NAME"
echo "   Lookback: ${LOOKBACK_MINUTES} minutes"
echo "   Interval: ${PLATFORM_INTERVAL}s"
echo "   Dashboard: ${DASHBOARD_ENABLED}"
echo ""

# First, check for nri-kafka data
echo -e "${BLUE}🔍 Checking for nri-kafka data...${NC}"
node check-nri-kafka-data.js

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Ask user to confirm
read -p "Do you want to start the platform in infrastructure mode? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Exiting..."
    exit 0
fi

echo ""
echo -e "${GREEN}🚀 Starting platform in infrastructure mode...${NC}"
echo ""

# Run the unified platform
node run-platform-unified.js

# Alternative: Run TypeScript directly
# npx tsx src/platform.ts --mode infrastructure --interval $PLATFORM_INTERVAL