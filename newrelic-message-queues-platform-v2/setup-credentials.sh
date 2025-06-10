#!/bin/bash

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║          New Relic Credentials Setup Helper                  ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${YELLOW}This script will help you set up your New Relic credentials.${NC}"
echo ""
echo "You'll need:"
echo "1. Your New Relic Account ID"
echo "2. A User API Key (for creating dashboards)"
echo "3. An Ingest API Key (for sending data)"
echo ""
echo -e "${BLUE}Where to find these:${NC}"
echo ""
echo "1. Account ID:"
echo "   - Log in to New Relic"
echo "   - Look at the URL: https://one.newrelic.com/nr1-core?account=XXXXXX"
echo "   - Or go to: User menu (bottom left) → Administration → Access management"
echo ""
echo "2. User API Key (for dashboards):"
echo "   - Go to: User menu → API keys"
echo "   - Create a new User key with 'NerdGraph' permissions"
echo ""
echo "3. Ingest API Key:"
echo "   - Go to: User menu → API keys"
echo "   - Look for an existing Ingest key or create one"
echo "   - Should start with 'NRAK-'"
echo ""

read -p "Do you have these credentials ready? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Please gather your credentials and run this script again."
    echo ""
    echo -e "${BLUE}Quick links:${NC}"
    echo "- API Keys: https://one.newrelic.com/api-keys"
    echo "- Documentation: https://docs.newrelic.com/docs/apis/intro-apis/new-relic-api-keys/"
    exit 0
fi

echo ""

# Get Account ID
echo -e "${BLUE}1. Enter your New Relic Account ID:${NC}"
read -p "   Account ID: " ACCOUNT_ID

# Get User API Key
echo ""
echo -e "${BLUE}2. Enter your User API Key (for dashboards):${NC}"
echo "   (starts with 'NRAK-')"
read -p "   User API Key: " USER_API_KEY

# Get Ingest API Key
echo ""
echo -e "${BLUE}3. Enter your Ingest API Key (for sending data):${NC}"
echo "   (starts with 'NRAK-')"
read -p "   Ingest API Key: " INGEST_API_KEY

# Confirm
echo ""
echo -e "${YELLOW}Please confirm these values:${NC}"
echo "   Account ID: $ACCOUNT_ID"
echo "   User API Key: ${USER_API_KEY:0:20}..."
echo "   Ingest API Key: ${INGEST_API_KEY:0:20}..."
echo ""

read -p "Are these correct? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Setup cancelled."
    exit 0
fi

# Create .env file
echo ""
echo -e "${BLUE}Creating .env file...${NC}"

cat > .env << EOF
# New Relic Configuration
NEW_RELIC_ACCOUNT_ID=$ACCOUNT_ID
NEW_RELIC_API_KEY=$INGEST_API_KEY
NEW_RELIC_INGEST_KEY=$INGEST_API_KEY
NEW_RELIC_USER_API_KEY=$USER_API_KEY
NEW_RELIC_REGION=US

# Platform Configuration
PLATFORM_MODE=infrastructure
PLATFORM_INTERVAL=30
NODE_ENV=production

# Kafka Configuration
KAFKA_CLUSTER_NAME=kafka-cluster
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
LOOKBACK_MINUTES=5

# Dashboard Configuration
DASHBOARD_ENABLED=true
DASHBOARD_NAME=Kafka Infrastructure Monitoring
DASHBOARD_AUTO_UPDATE=true
DASHBOARD_CREATE_AFTER_CYCLES=2
EOF

echo -e "${GREEN}✅ .env file created successfully!${NC}"
echo ""

# Test the credentials
echo -e "${BLUE}Testing credentials...${NC}"
node check-nri-kafka-data.js

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "You can now run:"
echo "  ./run-infrastructure-mode.sh"
echo ""