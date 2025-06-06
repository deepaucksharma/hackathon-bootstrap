#!/bin/bash

echo "Checking all fields in AwsMskBrokerSample..."
echo

# Get all fields from a recent sample
curl -s -H "Accept: application/json" \
     -H "X-Query-Key: ${NEW_RELIC_API_KEY}" \
     "https://insights-api.newrelic.com/v1/accounts/3630072/query?nrql=FROM%20AwsMskBrokerSample%20SELECT%20*%20SINCE%2030%20minutes%20ago%20LIMIT%201" | \
     jq -r '.results[0] | to_entries[] | .key' | sort

echo
echo "Checking specific provider fields..."
curl -s -H "Accept: application/json" \
     -H "X-Query-Key: ${NEW_RELIC_API_KEY}" \
     "https://insights-api.newrelic.com/v1/accounts/3630072/query?nrql=FROM%20AwsMskBrokerSample%20SELECT%20provider.accountId%2C%20provider.region%2C%20provider.clusterName%20SINCE%2030%20minutes%20ago%20LIMIT%201" | \
     jq '.results[0]'