#!/bin/bash

# Quick test script for Entity Synthesis & Verification Platform

echo "🚀 Entity Synthesis & Verification Platform - Quick Test"
echo "========================================================"

# Load environment from parent .env
if [ -f "../.env" ]; then
    export $(grep -v '^#' ../.env | xargs)
fi

# Check for required environment variables (using actual var names)
if [ -z "$ACC" ] || [ -z "$IKEY" ] || [ -z "$UKEY" ]; then
    echo "❌ Missing required environment variables!"
    echo "Please ensure ../.env contains:"
    echo "  ACC=your_account_id"
    echo "  IKEY=your_insert_key"
    echo "  UKEY=your_user_key"
    echo "  QKey=your_query_key"
    exit 1
fi

echo "✅ Environment configured"
echo "   Account ID: $ACC"
echo ""

# Create results directories if they don't exist
mkdir -p results/detailed-reports

# Run a simple baseline experiment
echo "🧪 Running baseline broker experiment..."
echo "----------------------------------------"
node 1-run-experiment.js experiment experiments/phase-1-baseline/01-golden-broker-comprehensive.yaml

echo ""
echo "📊 Test complete! Check the results in:"
echo "   - results/experiment-log.json"
echo "   - results/detailed-reports/"
echo ""
echo "To run more tests:"
echo "   - All baseline tests: node 1-run-experiment.js phase phase-1-baseline"
echo "   - Full simulation: node 2-run-simulation.js simulations/1-full-cluster-lifecycle.yaml"