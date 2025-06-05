#!/bin/bash

# Quick verification script for a single Kafka cluster
# Usage: ./verify-single-cluster.sh API_KEY NR_ACCOUNT_ID CLUSTER_NAME [AWS_ACCOUNT_ID]

API_KEY=$1
NR_ACCOUNT_ID=$2
CLUSTER_NAME=$3
AWS_ACCOUNT_ID=$4

if [ -z "$API_KEY" ] || [ -z "$NR_ACCOUNT_ID" ] || [ -z "$CLUSTER_NAME" ]; then
    echo "Usage: ./verify-single-cluster.sh API_KEY NR_ACCOUNT_ID CLUSTER_NAME [AWS_ACCOUNT_ID]"
    exit 1
fi

echo "🔍 Verifying Kafka Cluster: $CLUSTER_NAME"
echo "================================================"

# Function to run NRQL query
run_query() {
    local query=$1
    local description=$2
    
    echo -e "\n📊 $description"
    echo "---"
    
    # Escape quotes in query
    query=$(echo "$query" | sed 's/"/\\"/g')
    
    # GraphQL query
    graphql_query="{
        \"query\": \"query(\$accountId: Int!, \$nrqlQuery: Nrql!) { actor { account(id: \$accountId) { nrql(query: \$nrqlQuery) { results } } } }\",
        \"variables\": {
            \"accountId\": $NR_ACCOUNT_ID,
            \"nrqlQuery\": \"$query\"
        }
    }"
    
    # Execute query
    result=$(curl -s -X POST https://api.newrelic.com/graphql \
        -H "API-Key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d "$graphql_query")
    
    # Parse and display result
    echo "$result" | jq -r '.data.actor.account.nrql.results' 2>/dev/null || echo "❌ Query failed"
}

# 1. Check if cluster exists and has required fields
run_query "SELECT count(*) as 'samples', percentage(count(provider), count(*)) as 'hasProvider', percentage(count(awsAccountId), count(*)) as 'hasAwsAccount', percentage(count(entity.guid), count(*)) as 'hasGuid' FROM AwsMskClusterSample WHERE entityName = '$CLUSTER_NAME' SINCE 1 hour ago" \
"Checking cluster existence and UI fields"

# 2. Check cluster health metrics
run_query "SELECT latest(provider.activeControllerCount.Sum) as 'activeControllers', latest(provider.offlinePartitionsCount.Sum) as 'offlinePartitions', latest(provider.underReplicatedPartitions.Sum) as 'underReplicated', latest(provider.globalPartitionCount.Average) as 'totalPartitions' FROM AwsMskClusterSample WHERE entityName = '$CLUSTER_NAME' SINCE 1 hour ago" \
"Cluster health metrics"

# 3. Check broker data
run_query "SELECT uniqueCount(provider.brokerId) as 'brokerCount', sum(provider.bytesInPerSec.Average) as 'totalBytesIn', sum(provider.bytesOutPerSec.Average) as 'totalBytesOut' FROM AwsMskBrokerSample WHERE provider.clusterName = '$CLUSTER_NAME' SINCE 1 hour ago" \
"Broker metrics"

# 4. Check topic data
run_query "SELECT uniqueCount(displayName) as 'topicCount', count(*) as 'topicSamples' FROM AwsMskTopicSample WHERE provider.clusterName = '$CLUSTER_NAME' SINCE 1 hour ago LIMIT 10" \
"Topic information"

# 5. Check dimensional metrics
run_query "FROM Metric SELECT count(*) as 'metricCount', uniques(metricName) as 'metricTypes' WHERE entity.name LIKE '%$CLUSTER_NAME%' AND metricName LIKE 'kafka.%' SINCE 5 minutes ago" \
"Dimensional metrics"

# 6. Check data freshness
run_query "SELECT (now() - max(timestamp))/1000/60 as 'minutesSinceUpdate' FROM AwsMskClusterSample WHERE entityName = '$CLUSTER_NAME' SINCE 1 hour ago" \
"Data freshness"

# 7. Master check for this cluster
echo -e "\n🎯 Final Verdict for $CLUSTER_NAME"
echo "=================================="

FINAL_QUERY="WITH cluster AS (SELECT count(*) as samples, percentage(count(provider), count(*)) as providerPct, percentage(count(awsAccountId), count(*)) as awsAccountPct FROM AwsMskClusterSample WHERE entityName = '$CLUSTER_NAME' SINCE 1 hour ago), metrics AS (SELECT count(*) as metricCount FROM Metric WHERE entity.name LIKE '%$CLUSTER_NAME%' AND metricName LIKE 'kafka.%' SINCE 5 minutes ago), freshness AS (SELECT (now() - max(timestamp))/1000/60 as age FROM AwsMskClusterSample WHERE entityName = '$CLUSTER_NAME' SINCE 1 hour ago) SELECT CASE WHEN cluster.samples > 0 AND cluster.providerPct = 100 AND cluster.awsAccountPct = 100 AND metrics.metricCount > 0 AND freshness.age < 10 THEN 'READY' ELSE 'NOT_READY' END as 'status', cluster.samples as 'samples', cluster.providerPct as 'uiFields', metrics.metricCount as 'metrics', freshness.age as 'dataAge' FROM cluster, metrics, freshness"

result=$(run_query "$FINAL_QUERY" "System check")

# Parse result for final status
status=$(echo "$result" | jq -r '.[0].status' 2>/dev/null)

if [ "$status" = "READY" ]; then
    echo -e "\n✅ CLUSTER IS READY! The UI will work correctly for this cluster."
else
    echo -e "\n❌ CLUSTER NOT READY! Check the issues above."
    echo -e "\nCommon fixes:"
    echo "  - Ensure integration is running and can reach this cluster"
    echo "  - Verify MSK_USE_DIMENSIONAL=true is set"
    echo "  - Check that all required AWS fields are being set"
    echo "  - Ensure JMX is enabled on Kafka brokers"
fi

echo -e "\n================================================"
echo "Verification complete for: $CLUSTER_NAME"