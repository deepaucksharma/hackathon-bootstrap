#!/bin/bash

# Quick Diagnosis Script
# Run this to get immediate insights into what's working and what's not

echo "🔍 Quick MSK Entity Diagnosis"
echo "============================"
echo ""

# Check if environment is set up
if [ ! -f "../.env" ]; then
    echo "❌ Error: ../.env file not found"
    exit 1
fi

echo "1️⃣ Running working MSK entity analysis..."
echo "----------------------------------------"
node analyze-working-msk-data.js
echo ""

echo "2️⃣ Testing MessageQueueSample creation..."
echo "----------------------------------------"
node message-queue-focused-test.js
echo ""

echo "3️⃣ Checking UI visibility debug..."
echo "--------------------------------"
node debug-ui-visibility.js
echo ""

echo "📊 Quick NRQL Checks to Run:"
echo "============================"
echo ""
echo "1. Check if ANY MSK entities have MessageQueueSample:"
echo "   FROM MessageQueueSample SELECT count(*), uniques(entity.name) WHERE entity.type = 'AWSMSKCLUSTER' SINCE 1 week ago"
echo ""
echo "2. Check what event types the 56 entities use:"
echo "   FROM AwsMskClusterSample, KafkaClusterSample SELECT count(*) FACET eventType SINCE 1 day ago"
echo ""
echo "3. Check if our synthetic events exist:"
echo "   FROM AwsMskClusterSample, MessageQueueSample SELECT * WHERE entity.name LIKE '%test%' OR entity.name LIKE '%exp%' SINCE 1 hour ago"
echo ""
echo "4. Check all Message Queue providers:"
echo "   FROM MessageQueueSample SELECT count(*) FACET provider SINCE 1 day ago"
echo ""

echo "🔗 Quick Links:"
echo "=============="
echo "Message Queues UI: https://one.newrelic.com/nr1-core/message-queues"
echo "Query Builder: https://one.newrelic.com/data-exploration"
echo ""

echo "✅ Diagnosis Complete!"
echo ""
echo "Next Steps:"
echo "1. Check the Message Queues UI - do you see ANY Kafka/MSK data?"
echo "2. Run the NRQL queries above in Query Builder"
echo "3. Based on findings, run: node advanced-payload-iterator.js"