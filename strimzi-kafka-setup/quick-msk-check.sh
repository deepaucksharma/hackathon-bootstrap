#!/bin/bash

echo "=========================================="
echo "Quick MSK Data Check for Strimzi Kafka"
echo "=========================================="
echo

# Check environment
if [ -z "$UKEY" ]; then
    echo "❌ ERROR: UKEY environment variable not set"
    echo "   Please set: export UKEY=NRAK-XXXXXXXXXXXXXXXXXXXXXXXXX"
    exit 1
fi

ACC=${ACC:-3630072}
echo "Account ID: $ACC"
echo "Cluster Name: strimzi-production-kafka"
echo

# Function to run NRQL query
run_query() {
    local query="$1"
    local description="$2"
    
    echo "📊 $description"
    echo "   Query: $query"
    
    # Use curl to query NRDB
    response=$(curl -s -X POST https://api.newrelic.com/graphql \
        -H "Content-Type: application/json" \
        -H "API-Key: $UKEY" \
        -d "{
            \"query\": \"{ actor { account(id: $ACC) { nrql(query: \\\"$query\\\") { results } } } }\"
        }")
    
    # Extract and display results
    echo "$response" | grep -o '"results":\[[^]]*\]' | sed 's/"results"://g' || echo "   No data"
    echo
}

echo "1. ENTITY COUNTS (Last Hour)"
echo "============================="
run_query "FROM AwsMskClusterSample SELECT count(*) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 1 hour ago" "Cluster Samples"
run_query "FROM AwsMskBrokerSample SELECT count(*) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 1 hour ago" "Broker Samples"
run_query "FROM AwsMskTopicSample SELECT count(*) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 1 hour ago" "Topic Samples"

echo
echo "2. RECENT DATA (Last 5 Minutes)"
echo "==============================="
run_query "FROM AwsMskBrokerSample SELECT count(*), uniqueCount(provider.brokerId) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 5 minutes ago" "Recent Broker Data"

echo
echo "3. CLUSTER HEALTH"
echo "================="
run_query "FROM AwsMskClusterSample SELECT latest(provider.activeControllerCount.Sum), latest(provider.offlinePartitionsCount.Sum), latest(provider.underReplicatedPartitions.Sum) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 30 minutes ago" "Cluster Health Metrics"

echo
echo "4. SAMPLE ENTITY GUID"
echo "===================="
run_query "FROM AwsMskBrokerSample SELECT uniques(entity.guid) WHERE provider.clusterName = 'strimzi-production-kafka' SINCE 1 hour ago LIMIT 1" "Entity GUID Format"

echo
echo "=========================================="
echo "Quick Check Complete"
echo "=========================================="