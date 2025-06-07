#\!/bin/bash

ACCOUNT_ID="3630072"
API_KEY="dfb79449d23acce4df582f2f5550abe4FFFFNRAL"

echo "🔍 Checking experiment results..."
echo ""

experiments=("exp1-1749260093720" "exp2-1749260093720" "exp3-1749260093720" "exp4-1749260093720" "exp5-1749260093720")

for cluster in "${experiments[@]}"; do
    echo "Checking $cluster:"
    
    # Check AwsMskClusterSample
    query="FROM AwsMskClusterSample SELECT count(*) WHERE provider.clusterName = '$cluster' OR entityName = '$cluster' SINCE 10 minutes ago"
    result=$(curl -s -X GET "https://insights-api.newrelic.com/v1/accounts/$ACCOUNT_ID/query" \
        -H "X-Query-Key: $API_KEY" \
        -H "Accept: application/json" \
        -G --data-urlencode "nrql=$query" | jq -r '.results[0].count // 0')
    
    if [ "$result" -gt 0 ]; then
        echo "  ✅ Found $result AwsMskClusterSample events"
    else
        echo "  ❌ No AwsMskClusterSample events"
    fi
    
    # Check Metric events
    query="FROM Metric SELECT count(*) WHERE entity.name = '$cluster' OR aws.kafka.ClusterName = '$cluster' SINCE 10 minutes ago"
    result=$(curl -s -X GET "https://insights-api.newrelic.com/v1/accounts/$ACCOUNT_ID/query" \
        -H "X-Query-Key: $API_KEY" \
        -H "Accept: application/json" \
        -G --data-urlencode "nrql=$query" | jq -r '.results[0].count // 0')
    
    if [ "$result" -gt 0 ]; then
        echo "  ✅ Found $result Metric events"
    else
        echo "  ❌ No Metric events"
    fi
    
    echo ""
done
