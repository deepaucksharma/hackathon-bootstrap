#!/bin/bash

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if required variables are set
if [ -z "$UKEY" ]; then
    echo "Error: UKEY not set. Please check your .env file."
    exit 1
fi

echo "================================================"
echo "FINAL UI VISIBILITY CHECK"
echo "================================================"
echo

# Direct NRQL query to see what's in AwsMskBrokerSample
echo "1. Checking AwsMskBrokerSample existence..."
curl -s "https://api.newrelic.com/graphql" \
  -H "API-Key: ${UKEY}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<EOF | jq -r '.data.actor.account.nrql.results[]'
{
  "query": "{ actor { account(id: 3630072) { nrql(query: \"FROM AwsMskBrokerSample SELECT count(*) SINCE 30 minutes ago\") { results } } } }"
}
EOF

echo
echo "2. Checking provider field values..."
curl -s "https://api.newrelic.com/graphql" \
  -H "API-Key: ${UKEY}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<EOF | jq -r '.data.actor.account.nrql.results[]'
{
  "query": "{ actor { account(id: 3630072) { nrql(query: \"FROM AwsMskBrokerSample SELECT uniques(provider) SINCE 30 minutes ago\") { results } } } }"
}
EOF

echo
echo "3. Checking all entity-related fields..."
curl -s "https://api.newrelic.com/graphql" \
  -H "API-Key: ${UKEY}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<EOF | jq -r '.data.actor.account.nrql.results[]'
{
  "query": "{ actor { account(id: 3630072) { nrql(query: \"FROM AwsMskBrokerSample SELECT keyset() WHERE awsAccountId IS NOT NULL SINCE 30 minutes ago LIMIT 1\") { results } } } }"
}
EOF

echo
echo "4. Checking entity.guid values..."
curl -s "https://api.newrelic.com/graphql" \
  -H "API-Key: ${UKEY}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<EOF | jq -r '.data.actor.account.nrql.results[]'
{
  "query": "{ actor { account(id: 3630072) { nrql(query: \"SELECT latest(entity.guid) FROM AwsMskBrokerSample SINCE 30 minutes ago\") { results } } } }"
}
EOF

echo
echo "5. Checking Message Queues UI entities..."
curl -s "https://api.newrelic.com/graphql" \
  -H "API-Key: ${UKEY}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<EOF | jq -r '.data.actor.entitySearch.results.entities[] | {name: .name, type: .type, tags: .tags}'
{
  "query": "{ actor { entitySearch(query: \"type IN ('AWS_KAFKA_CLUSTER', 'AWS_KAFKA_BROKER', 'AWS_KAFKA_TOPIC') AND domain = 'INFRA'\") { results { entities { name type tags { key values } } } } } }"
}
EOF

echo
echo "================================================"