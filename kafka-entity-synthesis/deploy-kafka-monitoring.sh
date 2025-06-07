#!/bin/bash

# Deploy Kafka Monitoring for Production
# This script sets up complete monitoring for a Kafka cluster

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default values
CLUSTER_NAME=""
CONTINUOUS=false
CREATE_ALERTS=false
CREATE_APM=false
BACKGROUND=false

# Usage function
usage() {
    echo "Usage: $0 -c <cluster-name> [options]"
    echo ""
    echo "Options:"
    echo "  -c, --cluster     Kafka cluster name (required)"
    echo "  -s, --stream      Enable continuous streaming"
    echo "  -a, --alerts      Create alert conditions"
    echo "  -p, --apm         Create APM service bridge"
    echo "  -b, --background  Run streamer in background"
    echo "  -h, --help        Show this help message"
    echo ""
    echo "Example:"
    echo "  $0 -c production-kafka -s -a -b"
    exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--cluster)
            CLUSTER_NAME="$2"
            shift 2
            ;;
        -s|--stream)
            CONTINUOUS=true
            shift
            ;;
        -a|--alerts)
            CREATE_ALERTS=true
            shift
            ;;
        -p|--apm)
            CREATE_APM=true
            shift
            ;;
        -b|--background)
            BACKGROUND=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            ;;
    esac
done

# Validate cluster name
if [ -z "$CLUSTER_NAME" ]; then
    echo -e "${RED}Error: Cluster name is required${NC}"
    usage
fi

# Check if environment is set up
if [ ! -f "../.env" ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Please create .env file with:"
    echo "  IKEY=your_insert_key"
    echo "  ACC=your_account_id"
    echo "  UKEY=your_user_key"
    exit 1
fi

echo -e "${GREEN}🚀 Deploying Kafka Monitoring for: ${CLUSTER_NAME}${NC}"
echo "================================================"
echo ""

# Step 1: Test initial data ingestion
echo -e "${YELLOW}Step 1: Testing data ingestion...${NC}"
if node exact-working-format-replicator.js "$CLUSTER_NAME"; then
    echo -e "${GREEN}✅ Data ingestion successful${NC}"
else
    echo -e "${RED}❌ Data ingestion failed${NC}"
    exit 1
fi

echo ""
sleep 2

# Step 2: Create alerts if requested
if [ "$CREATE_ALERTS" = true ]; then
    echo -e "${YELLOW}Step 2: Creating alert conditions...${NC}"
    if node kafka-alerts-config.js "$CLUSTER_NAME"; then
        echo -e "${GREEN}✅ Alerts created successfully${NC}"
    else
        echo -e "${RED}❌ Alert creation failed${NC}"
    fi
    echo ""
    sleep 2
fi

# Step 3: Create APM services if requested
if [ "$CREATE_APM" = true ]; then
    echo -e "${YELLOW}Step 3: Creating APM service bridge...${NC}"
    if node apm-service-bridge.js "$CLUSTER_NAME"; then
        echo -e "${GREEN}✅ APM services created${NC}"
    else
        echo -e "${RED}❌ APM service creation failed${NC}"
    fi
    echo ""
    sleep 2
fi

# Step 4: Start continuous streaming if requested
if [ "$CONTINUOUS" = true ]; then
    echo -e "${YELLOW}Step 4: Starting continuous streaming...${NC}"
    
    LOG_FILE="kafka-streamer-${CLUSTER_NAME}-$(date +%Y%m%d-%H%M%S).log"
    
    if [ "$BACKGROUND" = true ]; then
        nohup node continuous-exact-format-streamer.js "$CLUSTER_NAME" > "$LOG_FILE" 2>&1 &
        PID=$!
        echo -e "${GREEN}✅ Continuous streaming started in background (PID: $PID)${NC}"
        echo "   Log file: $LOG_FILE"
        
        # Save PID for later management
        echo "$PID" > ".kafka-streamer-${CLUSTER_NAME}.pid"
    else
        echo "Starting continuous streaming in foreground..."
        echo "Press Ctrl+C to stop"
        node continuous-exact-format-streamer.js "$CLUSTER_NAME"
    fi
fi

echo ""
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Import custom-kafka-dashboard.json to New Relic"
echo "2. Configure notification channels for alerts"
echo "3. Monitor the dashboard and alerts"
echo ""
echo "Useful commands:"
echo "  # Check data in NRDB"
echo "  FROM AwsMskClusterSample SELECT count(*) WHERE provider.clusterName = '${CLUSTER_NAME}' SINCE 5 minutes ago"
echo ""
if [ "$CONTINUOUS" = true ] && [ "$BACKGROUND" = true ]; then
    echo "  # Check streamer status"
    echo "  tail -f $LOG_FILE"
    echo ""
    echo "  # Stop streamer"
    echo "  kill \$(cat .kafka-streamer-${CLUSTER_NAME}.pid)"
fi
echo ""
echo "Dashboard URL: https://one.newrelic.com/dashboards"
echo "Alerts URL: https://one.newrelic.com/alerts-ai/policies"