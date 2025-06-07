#!/bin/bash

# Production-Ready MSK Entity Deployment Script
# Deploy and validate MSK entities in New Relic UI

set -e

# Configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DEPLOYMENT_MODE="production"
CLUSTER_PREFIX="prod-msk"
VERIFY_TIMEOUT=300 # 5 minutes
LOG_DIR="deployment-logs-$(date +%Y%m%d-%H%M%S)"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dev)
            DEPLOYMENT_MODE="development"
            CLUSTER_PREFIX="dev-msk"
            shift
            ;;
        --staging)
            DEPLOYMENT_MODE="staging"
            CLUSTER_PREFIX="stage-msk"
            shift
            ;;
        --cluster-name)
            CUSTOM_CLUSTER_NAME="$2"
            shift 2
            ;;
        --account-id)
            NEW_RELIC_ACCOUNT_ID="$2"
            shift 2
            ;;
        --api-key)
            NEW_RELIC_API_KEY="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dev                Deploy in development mode"
            echo "  --staging            Deploy in staging mode"
            echo "  --cluster-name NAME  Use custom cluster name"
            echo "  --account-id ID      New Relic account ID"
            echo "  --api-key KEY        New Relic API key"
            echo "  --help               Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  NEW_RELIC_ACCOUNT_ID - New Relic account ID"
            echo "  NEW_RELIC_API_KEY    - New Relic ingest API key"
            echo "  NEW_RELIC_USER_KEY   - New Relic user API key (optional)"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Header
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}   MSK Entity Deployment for New Relic UI${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo ""

# Validate environment
echo -e "${YELLOW}🔍 Validating environment...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js is not installed${NC}"
    echo "   Please install Node.js: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2)
echo -e "✅ Node.js version: v${NODE_VERSION}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ Error: npm is not installed${NC}"
    exit 1
fi

# Check/Install dependencies
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install axios > /dev/null 2>&1
fi

# Validate credentials
if [[ -z "$NEW_RELIC_ACCOUNT_ID" ]] || [[ -z "$NEW_RELIC_API_KEY" ]]; then
    # Try loading from .env
    if [ -f "../.env" ]; then
        echo -e "${YELLOW}📝 Loading credentials from ../.env${NC}"
        export $(cat ../.env | grep -E '^NEW_RELIC_' | xargs)
    elif [ -f ".env" ]; then
        echo -e "${YELLOW}📝 Loading credentials from .env${NC}"
        export $(cat .env | grep -E '^NEW_RELIC_' | xargs)
    fi
fi

if [[ -z "$NEW_RELIC_ACCOUNT_ID" ]] || [[ -z "$NEW_RELIC_API_KEY" ]]; then
    echo -e "${RED}❌ Error: Missing credentials${NC}"
    echo "   Please set NEW_RELIC_ACCOUNT_ID and NEW_RELIC_API_KEY"
    echo "   Or use --account-id and --api-key options"
    exit 1
fi

echo -e "✅ Account ID: ${NEW_RELIC_ACCOUNT_ID}"
echo -e "✅ API Key: ****$(echo $NEW_RELIC_API_KEY | tail -c 5)"

# Create log directory
mkdir -p "$LOG_DIR"
echo -e "✅ Log directory: ${LOG_DIR}"

# Set cluster name
if [ -n "$CUSTOM_CLUSTER_NAME" ]; then
    CLUSTER_NAME="$CUSTOM_CLUSTER_NAME"
else
    CLUSTER_NAME="${CLUSTER_PREFIX}-$(date +%s)"
fi

echo ""
echo -e "${GREEN}📋 Deployment Configuration${NC}"
echo -e "   Mode: ${DEPLOYMENT_MODE}"
echo -e "   Cluster: ${CLUSTER_NAME}"
echo ""

# Function to log with timestamp
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_DIR/deployment.log"
}

# Function to run with logging
run_with_log() {
    local cmd=$1
    local log_file=$2
    local description=$3
    
    echo -e "${YELLOW}⚙️  ${description}...${NC}"
    log "Running: $cmd"
    
    if eval "$cmd" > "$LOG_DIR/$log_file" 2>&1; then
        echo -e "${GREEN}✅ ${description} completed${NC}"
        log "Success: $description"
        return 0
    else
        echo -e "${RED}❌ ${description} failed${NC}"
        echo -e "   Check logs: $LOG_DIR/$log_file"
        log "Failed: $description"
        return 1
    fi
}

# Phase 1: Entity Creation
echo ""
echo -e "${BLUE}Phase 1: Entity Creation${NC}"
echo -e "${BLUE}========================${NC}"

# Create strategy based on deployment mode
case $DEPLOYMENT_MODE in
    development)
        STRATEGY="simple"
        ;;
    staging)
        STRATEGY="complete"
        ;;
    production)
        STRATEGY="complete"
        ;;
esac

# Run orchestrator
run_with_log "node unified-msk-orchestrator.js $STRATEGY $CLUSTER_NAME" \
    "orchestration.log" \
    "Creating MSK entities with $STRATEGY strategy"

# Phase 2: Verification
echo ""
echo -e "${BLUE}Phase 2: Initial Verification${NC}"
echo -e "${BLUE}=============================${NC}"

# Wait for entity synthesis
echo -e "${YELLOW}⏳ Waiting for entity synthesis (30 seconds)...${NC}"
sleep 30

# Run initial verification
run_with_log "node entity-verifier.js $CLUSTER_NAME" \
    "initial-verification.log" \
    "Verifying entity creation"

# Phase 3: Continuous Monitoring
echo ""
echo -e "${BLUE}Phase 3: Continuous Monitoring${NC}"
echo -e "${BLUE}==============================${NC}"

# Start continuous verification in background
echo -e "${YELLOW}🔄 Starting continuous verification...${NC}"
nohup node entity-verifier.js "$CLUSTER_NAME" --continuous > "$LOG_DIR/continuous-verification.log" 2>&1 &
VERIFIER_PID=$!
echo -e "✅ Verification running (PID: $VERIFIER_PID)"

# Start metric streaming
if [ "$DEPLOYMENT_MODE" != "development" ]; then
    echo -e "${YELLOW}📊 Starting metric streaming...${NC}"
    
    # Create streaming script
    cat > "$LOG_DIR/start-streaming.js" << EOF
const { ContinuousMetricStreamer } = require('./continuous-metric-streamer');
const streamer = new ContinuousMetricStreamer({
    accountId: '$NEW_RELIC_ACCOUNT_ID',
    apiKey: '$NEW_RELIC_API_KEY'
});
streamer.startStreaming({
    clusterName: '$CLUSTER_NAME',
    brokerCount: 3,
    topicCount: 5,
    updateInterval: 60000
});
// Keep running
setInterval(() => {
    console.log('Streaming active:', new Date().toISOString());
}, 60000);
EOF
    
    nohup node "$LOG_DIR/start-streaming.js" > "$LOG_DIR/streaming.log" 2>&1 &
    STREAMER_PID=$!
    echo -e "✅ Metric streaming running (PID: $STREAMER_PID)"
fi

# Phase 4: UI Validation
echo ""
echo -e "${BLUE}Phase 4: UI Validation${NC}"
echo -e "${BLUE}======================${NC}"

# Wait a bit more for UI propagation
echo -e "${YELLOW}⏳ Waiting for UI propagation (60 seconds)...${NC}"
sleep 60

# Run UI validation checks
echo -e "${YELLOW}🔍 Running UI validation checks...${NC}"

# Create validation script
cat > "$LOG_DIR/ui-validation.js" << 'EOF'
const axios = require('axios');

async function validateUI(clusterName, accountId, apiKey) {
    console.log(`Validating UI visibility for: ${clusterName}`);
    
    // Check for entities via GraphQL
    const graphqlQuery = `{
        actor {
            entitySearch(query: "domain='INFRA' AND type IN ('AWSMSKCLUSTER','AWSMSKBROKER','AWSMSKTOPIC') AND name LIKE '%${clusterName}%'") {
                count
                results {
                    entities {
                        guid
                        name
                        type
                        reporting
                    }
                }
            }
        }
    }`;
    
    try {
        const response = await axios.post(
            'https://api.newrelic.com/graphql',
            { query: graphqlQuery },
            { headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' } }
        );
        
        const entityCount = response.data?.data?.actor?.entitySearch?.count || 0;
        const entities = response.data?.data?.actor?.entitySearch?.results?.entities || [];
        
        console.log(`\nFound ${entityCount} entities`);
        entities.forEach(e => {
            console.log(`  - ${e.type}: ${e.name} (${e.reporting ? 'reporting' : 'not reporting'})`);
        });
        
        return entityCount > 0;
    } catch (error) {
        console.error('Validation error:', error.message);
        return false;
    }
}

// Run validation
validateUI(process.argv[2], process.argv[3], process.argv[4])
    .then(success => process.exit(success ? 0 : 1));
EOF

if node "$LOG_DIR/ui-validation.js" "$CLUSTER_NAME" "$NEW_RELIC_ACCOUNT_ID" "$NEW_RELIC_API_KEY" > "$LOG_DIR/ui-validation.log" 2>&1; then
    echo -e "${GREEN}✅ UI validation passed${NC}"
    UI_VALIDATED=true
else
    echo -e "${YELLOW}⚠️  UI validation pending${NC}"
    UI_VALIDATED=false
fi

# Phase 5: Generate Report
echo ""
echo -e "${BLUE}Phase 5: Deployment Report${NC}"
echo -e "${BLUE}==========================${NC}"

# Generate deployment report
cat > "$LOG_DIR/deployment-report.md" << EOF
# MSK Entity Deployment Report

**Deployment Date**: $(date)
**Deployment Mode**: $DEPLOYMENT_MODE
**Cluster Name**: $CLUSTER_NAME
**Account ID**: $NEW_RELIC_ACCOUNT_ID

## Deployment Status

| Phase | Status | Details |
|-------|--------|---------|
| Environment Validation | ✅ | Node.js $(node --version) |
| Entity Creation | ✅ | Strategy: $STRATEGY |
| Initial Verification | ✅ | Entities created |
| Continuous Monitoring | ✅ | PID: $VERIFIER_PID |
| Metric Streaming | $([ -n "$STREAMER_PID" ] && echo "✅" || echo "N/A") | $([ -n "$STREAMER_PID" ] && echo "PID: $STREAMER_PID" || echo "Dev mode") |
| UI Validation | $([ "$UI_VALIDATED" = true ] && echo "✅" || echo "⏳") | $([ "$UI_VALIDATED" = true ] && echo "Visible" || echo "Pending") |

## Access URLs

### Entity Explorer
https://one.newrelic.com/redirect/entity/$NEW_RELIC_ACCOUNT_ID

### Message Queues UI
https://one.newrelic.com/nr1-core/message-queues

### NRQL Console
https://one.newrelic.com/data-exploration

## Verification Queries

\`\`\`sql
-- Check cluster
FROM AwsMskClusterSample 
SELECT * 
WHERE provider.clusterName = '$CLUSTER_NAME' 
SINCE 10 minutes ago

-- Check all entities
FROM NrIntegrationEntity
SELECT count(*) 
WHERE name LIKE '%$CLUSTER_NAME%'
SINCE 10 minutes ago
\`\`\`

## Process Management

Stop verification:
\`\`\`bash
kill $VERIFIER_PID
\`\`\`

$([ -n "$STREAMER_PID" ] && echo "Stop streaming:
\`\`\`bash
kill $STREAMER_PID
\`\`\`")

## Logs

- Deployment: $LOG_DIR/deployment.log
- Orchestration: $LOG_DIR/orchestration.log
- Verification: $LOG_DIR/continuous-verification.log
$([ -n "$STREAMER_PID" ] && echo "- Streaming: $LOG_DIR/streaming.log")

EOF

echo -e "${GREEN}✅ Deployment report saved${NC}"
echo -e "   Location: $LOG_DIR/deployment-report.md"

# Final summary
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}   Deployment Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo ""
echo -e "Cluster: ${CLUSTER_NAME}"
echo -e "Status: $([ "$UI_VALIDATED" = true ] && echo "✅ Validated" || echo "⏳ Pending UI visibility")"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo -e "1. Check Entity Explorer:"
echo -e "   ${BLUE}https://one.newrelic.com/redirect/entity/$NEW_RELIC_ACCOUNT_ID${NC}"
echo ""
echo -e "2. Check Message Queues UI:"
echo -e "   ${BLUE}https://one.newrelic.com/nr1-core/message-queues${NC}"
echo ""
echo -e "3. Monitor verification:"
echo -e "   tail -f $LOG_DIR/continuous-verification.log"
echo ""
echo -e "4. View full report:"
echo -e "   cat $LOG_DIR/deployment-report.md"
echo ""

# Save summary for other scripts
cat > "$LOG_DIR/deployment-summary.json" << EOF
{
    "deploymentMode": "$DEPLOYMENT_MODE",
    "clusterName": "$CLUSTER_NAME",
    "accountId": "$NEW_RELIC_ACCOUNT_ID",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "verifierPid": $VERIFIER_PID,
    "streamerPid": ${STREAMER_PID:-null},
    "uiValidated": $([[ "$UI_VALIDATED" = true ]] && echo "true" || echo "false"),
    "logDir": "$LOG_DIR"
}
EOF

echo -e "${GREEN}✨ Deployment successful!${NC}"