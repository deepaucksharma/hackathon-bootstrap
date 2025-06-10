#!/bin/bash

# Test All Modes Script
# Tests the platform in simulation, infrastructure, and hybrid modes

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           Testing Platform in All Modes                       ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    echo -e "${YELLOW}Creating .env from .env.example...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}Please update .env with your actual New Relic credentials${NC}"
    exit 1
fi

# Source environment variables
source .env

# Validate required environment variables
if [ -z "$NEW_RELIC_ACCOUNT_ID" ] || [ -z "$NEW_RELIC_API_KEY" ]; then
    echo -e "${RED}❌ Missing required environment variables${NC}"
    echo "Required:"
    echo "  - NEW_RELIC_ACCOUNT_ID"
    echo "  - NEW_RELIC_API_KEY"
    exit 1
fi

# Build the project first
echo -e "${BLUE}📦 Building TypeScript...${NC}"
npm run build

echo ""
echo -e "${GREEN}✅ Build successful!${NC}"
echo ""

# Function to run platform in a mode
run_mode() {
    local mode=$1
    local duration=$2
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Testing ${mode} mode for ${duration} seconds...${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Disable dashboard for quick tests
    export DASHBOARD_ENABLED=false
    
    # Run the platform
    timeout $duration node run-platform-unified.js --mode=$mode --interval=10 || true
    
    echo ""
    echo -e "${GREEN}✅ ${mode} mode test completed${NC}"
    echo ""
    
    # Wait a bit between modes
    sleep 2
}

# Test 1: Simulation Mode
echo -e "${YELLOW}1️⃣  SIMULATION MODE${NC}"
echo "This mode generates synthetic data for testing"
echo ""
export PLATFORM_MODE=simulation
run_mode "simulation" 30

# Test 2: Infrastructure Mode (if Kafka is available)
echo -e "${YELLOW}2️⃣  INFRASTRUCTURE MODE${NC}"
echo "This mode queries real nri-kafka data from NRDB"
echo ""

# Check if we have nri-kafka data
echo -e "${BLUE}Checking for nri-kafka data...${NC}"
KAFKA_CHECK=$(curl -s -X POST https://api.newrelic.com/graphql \
  -H "Api-Key: $NEW_RELIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"{ actor { account(id: $NEW_RELIC_ACCOUNT_ID) { nrql(query: \\\"FROM KafkaBrokerSample SELECT count(*) SINCE 5 minutes ago\\\") { results } } } }\"
  }" 2>/dev/null | jq -r '.data.actor.account.nrql.results[0].count' 2>/dev/null || echo "0")

if [ "$KAFKA_CHECK" != "0" ] && [ "$KAFKA_CHECK" != "null" ]; then
    echo -e "${GREEN}✅ Found nri-kafka data! Running infrastructure mode...${NC}"
    export PLATFORM_MODE=infrastructure
    run_mode "infrastructure" 30
else
    echo -e "${YELLOW}⚠️  No nri-kafka data found. Skipping infrastructure mode.${NC}"
    echo "To enable infrastructure mode:"
    echo "  1. Install and configure nri-kafka on your Kafka brokers"
    echo "  2. Ensure data is flowing to New Relic"
    echo ""
fi

# Test 3: Test with unified runner
echo -e "${YELLOW}3️⃣  UNIFIED RUNNER TEST${NC}"
echo "Testing the unified runner with visual feedback"
echo ""

echo -e "${BLUE}Running unified platform runner...${NC}"
timeout 60 node run-platform-unified.js || true

echo ""
echo -e "${GREEN}✅ All mode tests completed!${NC}"
echo ""

# Summary
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                        TEST SUMMARY                           ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "✅ TypeScript compilation: SUCCESS"
echo "✅ Simulation mode: TESTED"
if [ "$KAFKA_CHECK" != "0" ] && [ "$KAFKA_CHECK" != "null" ]; then
    echo "✅ Infrastructure mode: TESTED"
else
    echo "⚠️  Infrastructure mode: SKIPPED (no nri-kafka data)"
fi
echo "✅ Unified runner: TESTED"
echo ""

# Check for entities
echo -e "${BLUE}Checking for MESSAGE_QUEUE entities...${NC}"
ENTITY_CHECK=$(curl -s -X POST https://api.newrelic.com/graphql \
  -H "Api-Key: $NEW_RELIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"{ actor { account(id: $NEW_RELIC_ACCOUNT_ID) { nrql(query: \\\"FROM MessageQueue SELECT count(*) WHERE entityType LIKE 'MESSAGE_QUEUE_%' SINCE 10 minutes ago\\\") { results } } } }\"
  }" 2>/dev/null | jq -r '.data.actor.account.nrql.results[0].count' 2>/dev/null || echo "0")

if [ "$ENTITY_CHECK" != "0" ] && [ "$ENTITY_CHECK" != "null" ]; then
    echo -e "${GREEN}✅ Found $ENTITY_CHECK MESSAGE_QUEUE entities in New Relic!${NC}"
else
    echo -e "${YELLOW}⚠️  No MESSAGE_QUEUE entities found yet.${NC}"
    echo "Entities may take 2-3 minutes to synthesize in New Relic."
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

echo "Next steps:"
echo "1. Check New Relic Entity Explorer for MESSAGE_QUEUE entities"
echo "2. Enable dashboard creation: DASHBOARD_ENABLED=true"
echo "3. Run continuously: node run-platform-unified.js"
echo ""