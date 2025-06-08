#!/bin/bash

# New Relic Message Queues Platform - CLI Examples
# 
# This script demonstrates various CLI commands available in the platform

echo "================================================="
echo "New Relic Message Queues Platform - CLI Examples"
echo "================================================="
echo ""

# Make sure we're in the right directory
cd "$(dirname "$0")/.." || exit

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}1. Show CLI Help${NC}"
echo "Command: npx mq-platform --help"
echo "---"
npx mq-platform --help
echo ""

echo -e "${BLUE}2. Check Platform Version${NC}"
echo "Command: npx mq-platform --version"
echo "---"
npx mq-platform --version
echo ""

echo -e "${BLUE}3. Simulate Entity Data (Dry Run)${NC}"
echo "Command: npx mq-platform simulate stream --clusters 2 --topics 10 --duration 1 --dry-run"
echo "---"
npx mq-platform simulate stream --clusters 2 --topics 10 --duration 1 --dry-run
echo ""

echo -e "${BLUE}4. Create Entities${NC}"
echo "Command: npx mq-platform entity create --type cluster --provider kafka --name demo-cluster"
echo "---"
npx mq-platform entity create --type cluster --provider kafka --name demo-cluster
echo ""

echo -e "${BLUE}5. List Entity Templates${NC}"
echo "Command: npx mq-platform entity list-templates"
echo "---"
npx mq-platform entity list-templates
echo ""

echo -e "${BLUE}6. Generate Dashboard (Dry Run)${NC}"
echo "Command: npx mq-platform dashboard create --template cluster-overview --dry-run"
echo "---"
npx mq-platform dashboard create --template cluster-overview --dry-run
echo ""

echo -e "${BLUE}7. List Available Dashboard Templates${NC}"
echo "Command: npx mq-platform dashboard list-templates"
echo "---"
npx mq-platform dashboard list-templates
echo ""

echo -e "${BLUE}8. Verify Entity Synthesis${NC}"
echo "Command: npx mq-platform verify entities --provider kafka"
echo "---"
npx mq-platform verify entities --provider kafka
echo ""

echo -e "${BLUE}9. Import Entity Definitions${NC}"
echo "Command: npx mq-platform entity import --source github --type MESSAGE_QUEUE_CLUSTER"
echo "---"
npx mq-platform entity import --source github --type MESSAGE_QUEUE_CLUSTER
echo ""

echo -e "${BLUE}10. Generate Provider Comparison Dashboard${NC}"
echo "Command: npx mq-platform dashboard compare --providers kafka,rabbitmq --dry-run"
echo "---"
npx mq-platform dashboard compare --providers kafka,rabbitmq --dry-run
echo ""

echo -e "${GREEN}=================================================${NC}"
echo -e "${GREEN}CLI Examples Complete!${NC}"
echo ""
echo "For more information:"
echo "  • Documentation: docs/"
echo "  • Examples: examples/"
echo "  • API Reference: docs/API_REFERENCE.md"
echo ""