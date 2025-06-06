#!/bin/bash

echo "🚀 Entity Synthesis Solution V2 - Quick Start"
echo "============================================"
echo ""

# Check for required environment variables
if [ -z "$IKEY" ] || [ -z "$UKEY" ] || [ -z "$ACC" ]; then
    echo "❌ Missing required environment variables!"
    echo "Please ensure these are set:"
    echo "  - IKEY (License key for sending metrics)"
    echo "  - UKEY (User key for queries)"
    echo "  - ACC (Account ID)"
    echo ""
    echo "You can source your .env file: source .env"
    exit 1
fi

echo "✅ Environment variables detected"
echo "  Account ID: $ACC"
echo "  License Key: ${IKEY:0:4}..."
echo "  User Key: ${UKEY:0:4}..."
echo ""

# Menu
echo "Choose an option:"
echo "1. Compare with working accounts"
echo "2. Run minimal payload test"
echo "3. Run payload discovery"
echo "4. Validate UI visibility"
echo "5. Run batch tests"
echo "6. Run full test suite"
echo ""
read -p "Enter your choice (1-6): " choice

case $choice in
    1)
        echo "🔍 Comparing with working accounts..."
        node compare-working-accounts.js
        ;;
    2)
        echo "🧪 Running minimal payload test..."
        node minimal-payload-tester.js
        ;;
    3)
        echo "🔬 Running payload discovery..."
        node payload-discovery.js
        ;;
    4)
        echo "✅ Validating UI visibility..."
        node ui-visibility-validator.js
        ;;
    5)
        echo "🚀 Running batch tests..."
        node batch-test-runner.js
        ;;
    6)
        echo "🎯 Running full test suite..."
        echo ""
        echo "Step 1: Comparing with working accounts"
        node compare-working-accounts.js
        echo ""
        echo "Press Enter to continue..."
        read
        
        echo "Step 2: Testing minimal payloads"
        node minimal-payload-tester.js
        echo ""
        echo "Waiting 2 minutes for entity synthesis..."
        sleep 120
        
        echo "Step 3: Validating UI visibility"
        node ui-visibility-validator.js
        ;;
    *)
        echo "Invalid choice. Please run again and select 1-6."
        exit 1
        ;;
esac

echo ""
echo "✅ Done! Check the results/ directory for detailed output."