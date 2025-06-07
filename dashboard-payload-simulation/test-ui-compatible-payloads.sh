#!/bin/bash

# Test UI-Compatible AWS MSK Payloads
# This script runs the UI-compatible payload solution and verifies results

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "🚀 Testing UI-Compatible AWS MSK Payloads"
echo "========================================"
echo ""

# Check for config file
if [ ! -f "config.json" ]; then
    echo "❌ Error: config.json not found!"
    echo "Please create config.json with your New Relic credentials:"
    echo ""
    echo '{
  "newrelic": {
    "accountId": "YOUR_ACCOUNT_ID",
    "apiKey": "YOUR_INGEST_KEY"
  }
}'
    exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install axios
fi

# Run the UI-compatible payload solution
echo "🔄 Generating and submitting UI-compatible payloads..."
echo ""

CLUSTER_NAME=$(node ui-compatible-payload-solution.js | grep "Cluster Name:" | cut -d' ' -f3)

if [ -z "$CLUSTER_NAME" ]; then
    echo "❌ Failed to generate cluster name"
    exit 1
fi

echo ""
echo "✅ Payloads submitted successfully!"
echo ""
echo "⏳ Waiting 30 seconds for entity creation..."
sleep 30

# Extract account ID from config
ACCOUNT_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('config.json')).newrelic.accountId)")

echo ""
echo "🔍 Verification Steps:"
echo "====================="
echo ""
echo "1. Check Entity Explorer:"
echo "   https://one.newrelic.com/redirect/entity/$ACCOUNT_ID"
echo "   - Navigate to Infrastructure > Third-party services > AWS MSK"
echo "   - Look for cluster: $CLUSTER_NAME"
echo ""
echo "2. Check Message Queues UI:"
echo "   https://one.newrelic.com/nr1-core/message-queues"
echo "   - Should see the new cluster in the list"
echo ""
echo "3. Run NRQL Query:"
echo "   FROM AwsMskClusterSample SELECT count(*) WHERE provider.clusterName = '$CLUSTER_NAME' SINCE 10 minutes ago"
echo ""
echo "4. Check for all entity types:"
echo "   - AWSMSKCLUSTER entities"
echo "   - AWSMSKBROKER entities (3)"
echo "   - AWSMSKTOPIC entities (5)"
echo ""
echo "📋 Payload files saved in: test-payloads/"
echo ""
echo "🎯 If entities don't appear:"
echo "   1. Wait a few more minutes for entity synthesis"
echo "   2. Check that your API key has entity creation permissions"
echo "   3. Verify no errors in the submission output above"
echo ""
echo "✨ Done!"