#!/bin/bash

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           Testing Simulation Mode                             ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Source .env
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Test with minimal configuration
export NEW_RELIC_ACCOUNT_ID="${NEW_RELIC_ACCOUNT_ID:-123456}"
export NEW_RELIC_API_KEY="${NEW_RELIC_API_KEY:-test-key}"
export PLATFORM_MODE="simulation"
export PLATFORM_INTERVAL="10"
export DASHBOARD_ENABLED="false"

echo "Configuration:"
echo "  Account ID: $NEW_RELIC_ACCOUNT_ID"
echo "  Mode: $PLATFORM_MODE"
echo "  Interval: ${PLATFORM_INTERVAL}s"
echo ""

# Run using tsx
echo "Starting platform in simulation mode..."
echo ""

# Run for 30 seconds then stop
npx tsx src/platform.ts --mode simulation --interval 10 &
PID=$!

# Let it run for 30 seconds
sleep 30

# Stop the process
echo ""
echo "Stopping platform..."
kill -INT $PID 2>/dev/null
wait $PID 2>/dev/null

echo ""
echo "✅ Test completed!"