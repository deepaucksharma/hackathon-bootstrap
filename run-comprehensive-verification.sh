#!/bin/bash

# Comprehensive Verification Runner
# This script orchestrates the complete verification process comparing
# the current account with reference accounts

set -e

echo "🔧 Comprehensive Kafka/MSK Verification System"
echo "=============================================="
echo ""

# Configuration
CURRENT_ACCOUNT="${CURRENT_ACCOUNT:-3630072}"
REFERENCE_ACCOUNTS="${REFERENCE_ACCOUNTS:-3001033,1,3026020}"
OUTPUT_DIR="./verification-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_DIR="${OUTPUT_DIR}/${TIMESTAMP}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Ensure output directory exists
mkdir -p "${REPORT_DIR}"

echo -e "${BLUE}📋 Verification Configuration:${NC}"
echo "   Current Account: ${CURRENT_ACCOUNT}"
echo "   Reference Accounts: ${REFERENCE_ACCOUNTS}"
echo "   Output Directory: ${REPORT_DIR}"
echo ""

# Function to check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}🔍 Checking prerequisites...${NC}"
    
    # Check for Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js is required but not installed${NC}"
        exit 1
    fi
    
    # Check for API key
    if [ -z "${NEW_RELIC_API_KEY}" ]; then
        echo -e "${RED}❌ NEW_RELIC_API_KEY environment variable not set${NC}"
        echo "   Please set: export NEW_RELIC_API_KEY=your_api_key"
        exit 1
    fi
    
    # Check for required scripts
    if [ ! -f "./comprehensive-account-comparison.js" ]; then
        echo -e "${RED}❌ comprehensive-account-comparison.js not found${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ All prerequisites met${NC}"
    echo ""
}

# Function to run comprehensive comparison
run_comprehensive_comparison() {
    echo -e "${BLUE}🚀 Running comprehensive account comparison...${NC}"
    
    node comprehensive-account-comparison.js > "${REPORT_DIR}/comprehensive-comparison.log" 2>&1
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Comprehensive comparison completed${NC}"
    else
        echo -e "${RED}❌ Comprehensive comparison failed${NC}"
        cat "${REPORT_DIR}/comprehensive-comparison.log"
        exit 1
    fi
}

# Function to run existing verification scripts
run_ultimate_verification() {
    echo -e "${BLUE}🔬 Running ultimate verification system...${NC}"
    
    if [ -f "./ultimate-verification-system/verification/test-runners/ultimate-verification-runner.js" ]; then
        node ./ultimate-verification-system/verification/test-runners/ultimate-verification-runner.js \
            --account "${CURRENT_ACCOUNT}" \
            --output "${REPORT_DIR}/ultimate-verification.json" \
            > "${REPORT_DIR}/ultimate-verification.log" 2>&1
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Ultimate verification completed${NC}"
        else
            echo -e "${YELLOW}⚠️  Ultimate verification had issues (see log)${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Ultimate verification runner not found${NC}"
    fi
}

# Function to check current deployment status
check_deployment_status() {
    echo -e "${BLUE}🔍 Checking current deployment status...${NC}"
    
    cat > "${REPORT_DIR}/deployment-check.sh" << 'EOF'
#!/bin/bash

echo "Kafka/MSK Deployment Status Check"
echo "================================="
echo ""

# Check Kubernetes deployments
if command -v kubectl &> /dev/null; then
    echo "📦 Kubernetes Deployments:"
    kubectl get pods -n kafka 2>/dev/null | grep -E "(kafka|zookeeper)" || echo "   No Kafka pods found in 'kafka' namespace"
    kubectl get pods -n newrelic 2>/dev/null | grep -E "(nri-kafka|infrastructure)" || echo "   No New Relic pods found"
    echo ""
fi

# Check Docker containers
if command -v docker &> /dev/null; then
    echo "🐳 Docker Containers:"
    docker ps | grep -E "(kafka|nri-kafka)" || echo "   No Kafka-related containers running"
    echo ""
fi

# Check environment configuration
echo "🔧 Environment Configuration:"
echo "   MSK_SHIM_ENABLED: ${MSK_SHIM_ENABLED:-not set}"
echo "   AWS_ACCOUNT_ID: ${AWS_ACCOUNT_ID:-not set}"
echo "   AWS_REGION: ${AWS_REGION:-not set}"
echo "   KAFKA_CLUSTER_NAME: ${KAFKA_CLUSTER_NAME:-not set}"
echo "   MSK_USE_DIMENSIONAL: ${MSK_USE_DIMENSIONAL:-not set}"
echo ""

# Check nri-kafka binary
if [ -f "./nri-kafka" ]; then
    echo "📦 nri-kafka Binary:"
    echo -n "   Version: "
    ./nri-kafka -show_version 2>&1 | head -1
    echo -n "   Build Date: "
    stat -f %Sm -t "%Y-%m-%d %H:%M:%S" ./nri-kafka 2>/dev/null || stat -c %y ./nri-kafka 2>/dev/null | cut -d' ' -f1-2
fi
EOF

    chmod +x "${REPORT_DIR}/deployment-check.sh"
    bash "${REPORT_DIR}/deployment-check.sh" > "${REPORT_DIR}/deployment-status.log" 2>&1
    
    echo -e "${GREEN}✅ Deployment status check completed${NC}"
}

# Function to generate verification queries
generate_verification_queries() {
    echo -e "${BLUE}📝 Generating verification queries...${NC}"
    
    cat > "${REPORT_DIR}/verification-queries.nrql" << EOF
-- Comprehensive Verification Queries for Account ${CURRENT_ACCOUNT}
-- Generated: $(date)

-- 1. Check UI Visibility Fields
FROM AwsMskBrokerSample, AwsMskClusterSample, AwsMskTopicSample 
SELECT 
  latest(provider) as provider,
  latest(awsAccountId) as awsAccountId,
  latest(providerExternalId) as providerExternalId,
  latest(instrumentation.provider) as instrumentationProvider,
  latest(entity.type) as entityType
FACET eventType()
SINCE 1 hour ago

-- 2. Check Entity Synthesis
FROM NrIntegrationError 
SELECT count(*) 
WHERE newRelicFeature = 'Event Pipeline' 
FACET category, message 
SINCE 1 hour ago

-- 3. Check Dimensional Metrics
FROM Metric 
SELECT count(*) 
WHERE metricName LIKE 'kafka.%'
FACET metricName, dimensions()
SINCE 1 hour ago
LIMIT MAX

-- 4. Check Message Queue UI Data
FROM MessageQueueSample 
SELECT count(*) 
WHERE entity.type IN ('AWS_KAFKA_CLUSTER', 'AWS_KAFKA_BROKER', 'AWS_KAFKA_TOPIC')
FACET entity.type, entity.name
SINCE 1 hour ago

-- 5. Compare with Reference Accounts
-- Run these queries for accounts: ${REFERENCE_ACCOUNTS}
EOF

    echo -e "${GREEN}✅ Verification queries generated${NC}"
}

# Function to generate fix recommendations
generate_fix_script() {
    echo -e "${BLUE}🔧 Generating fix recommendations...${NC}"
    
    cat > "${REPORT_DIR}/apply-fixes.sh" << 'EOF'
#!/bin/bash

echo "🔧 Applying recommended fixes for UI visibility"
echo "=============================================="

# 1. Update environment variables
echo "1. Updating environment variables..."
export MSK_SHIM_ENABLED=true
export AWS_ACCOUNT_ID=123456789012  # Use real AWS account format
export AWS_REGION=us-east-1
export MSK_USE_DIMENSIONAL=true
export NRI_KAFKA_USE_DIMENSIONAL=true

# 2. Rebuild nri-kafka with fixes
echo "2. Rebuilding nri-kafka binary..."
if [ -f "./src/kafka.go" ]; then
    go build -o nri-kafka ./src/
    echo "   ✅ Binary rebuilt"
else
    echo "   ❌ Source code not found"
fi

# 3. Update Kubernetes configurations
echo "3. Updating Kubernetes configurations..."
if command -v kubectl &> /dev/null; then
    # Update ConfigMap with new AWS settings
    kubectl apply -f minikube-consolidated/monitoring/04-daemonset-bundle.yaml
    
    # Restart pods to pick up changes
    kubectl rollout restart daemonset/nri-kafka-bundle -n newrelic
    echo "   ✅ Kubernetes configurations updated"
else
    echo "   ⚠️  kubectl not available"
fi

# 4. Verify changes
echo "4. Verifying changes..."
sleep 30  # Wait for pods to restart

# Check if new data has providerExternalId
./nri-kafka \
  -cluster_name test-cluster \
  -autodiscover_strategy bootstrap \
  -bootstrap_broker_host localhost \
  -metrics \
  -pretty 2>&1 | grep -E "(providerExternalId|awsAccountId)" || echo "   ⚠️  Fields not found in output"

echo ""
echo "✅ Fix application complete!"
echo "   Please wait 5-10 minutes for data to appear in New Relic UI"
EOF

    chmod +x "${REPORT_DIR}/apply-fixes.sh"
    echo -e "${GREEN}✅ Fix script generated${NC}"
}

# Function to generate summary report
generate_summary() {
    echo -e "${BLUE}📊 Generating summary report...${NC}"
    
    cat > "${REPORT_DIR}/VERIFICATION_SUMMARY.md" << EOF
# Comprehensive Kafka/MSK Verification Summary

**Generated**: $(date)  
**Current Account**: ${CURRENT_ACCOUNT}  
**Reference Accounts**: ${REFERENCE_ACCOUNTS}

## 🔍 Verification Results

### Files Generated:
- \`comprehensive-comparison.log\` - Main comparison output
- \`deployment-status.log\` - Current deployment status
- \`verification-queries.nrql\` - NRQL queries for manual verification
- \`apply-fixes.sh\` - Script to apply recommended fixes

### Key Findings:
1. **UI Visibility**: Check comprehensive-comparison.json for missing fields
2. **Entity Synthesis**: Review integration errors in the log
3. **Metric Completeness**: Compare completeness scores across accounts
4. **Data Freshness**: Check timestamp differences

### 🚨 Critical Actions Required:
1. Add \`providerExternalId\` field to all MSK samples
2. Use real AWS account ID format (12 digits)
3. Enable dimensional metrics (MSK_USE_DIMENSIONAL=true)
4. Rebuild and redeploy nri-kafka binary

### 📝 Next Steps:
1. Review the comprehensive comparison results
2. Run \`apply-fixes.sh\` to implement recommendations
3. Wait 5-10 minutes for data to propagate
4. Verify data appears in Message Queues UI
5. Re-run this verification to confirm fixes

## 🔗 Useful Links:
- [New Relic Message Queues UI](https://one.newrelic.com/nr1-core/message-queues)
- [MSK Integration Docs](https://docs.newrelic.com/docs/infrastructure/host-integrations/host-integrations-list/kafka-monitoring-integration/)

---
*Report generated by comprehensive verification system*
EOF

    echo -e "${GREEN}✅ Summary report generated${NC}"
}

# Main execution
main() {
    echo -e "${GREEN}Starting comprehensive verification process...${NC}"
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Run all verification steps
    run_comprehensive_comparison
    run_ultimate_verification
    check_deployment_status
    generate_verification_queries
    generate_fix_script
    generate_summary
    
    # Display results
    echo ""
    echo -e "${GREEN}🎉 Verification Complete!${NC}"
    echo ""
    echo "📁 Results saved to: ${REPORT_DIR}"
    echo ""
    echo "Key files:"
    echo "  - ${REPORT_DIR}/VERIFICATION_SUMMARY.md - Overview and next steps"
    echo "  - ${REPORT_DIR}/comprehensive-comparison.log - Detailed comparison"
    echo "  - ${REPORT_DIR}/apply-fixes.sh - Script to apply fixes"
    echo ""
    echo -e "${YELLOW}👉 Next step: Review VERIFICATION_SUMMARY.md for findings and recommendations${NC}"
}

# Run main function
main