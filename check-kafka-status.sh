#!/bin/bash

# Quick status check for Kafka metrics

if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

echo "======================================"
echo "Kafka Metrics Quick Status Check"
echo "======================================"
echo ""

# Check for any Kafka data
echo "Checking for Kafka data types..."
echo ""

# Standard Kafka metrics
echo "1. Standard Kafka Integration:"
node -e "
const https = require('https');
const apiKey = '$UKEY';
const accountId = '$ACC';

const queries = [
  { name: 'KafkaBrokerSample', query: 'SELECT count(*) FROM KafkaBrokerSample SINCE 5 minutes ago' },
  { name: 'KafkaTopicSample', query: 'SELECT count(*) FROM KafkaTopicSample SINCE 5 minutes ago' },
  { name: 'KafkaOffsetSample', query: 'SELECT count(*) FROM KafkaOffsetSample SINCE 5 minutes ago' }
];

async function checkMetric(name, nrql) {
  const body = JSON.stringify({
    query: \`query { actor { account(id: \${accountId}) { nrql(query: \"\${nrql}\") { results } } } }\`,
  });
  
  return new Promise((resolve) => {
    const req = https.request('https://api.newrelic.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'API-Key': apiKey }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          const count = result.data?.actor?.account?.nrql?.results?.[0]?.count || 0;
          console.log(\`   \${name}: \${count}\`);
        } catch (e) {
          console.log(\`   \${name}: ERROR\`);
        }
        resolve();
      });
    });
    req.write(body);
    req.end();
  });
}

(async () => {
  for (const q of queries) {
    await checkMetric(q.name, q.query);
  }
})();
"

echo ""
echo "2. MSK Shim Metrics:"
node -e "
const https = require('https');
const apiKey = '$UKEY';
const accountId = '$ACC';

const queries = [
  { name: 'AwsMskClusterSample', query: 'SELECT count(*) FROM AwsMskClusterSample SINCE 5 minutes ago' },
  { name: 'AwsMskBrokerSample', query: 'SELECT count(*) FROM AwsMskBrokerSample SINCE 5 minutes ago' },
  { name: 'AwsMskTopicSample', query: 'SELECT count(*) FROM AwsMskTopicSample SINCE 5 minutes ago' }
];

async function checkMetric(name, nrql) {
  const body = JSON.stringify({
    query: \`query { actor { account(id: \${accountId}) { nrql(query: \"\${nrql}\") { results } } } }\`,
  });
  
  return new Promise((resolve) => {
    const req = https.request('https://api.newrelic.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'API-Key': apiKey }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          const count = result.data?.actor?.account?.nrql?.results?.[0]?.count || 0;
          console.log(\`   \${name}: \${count}\`);
        } catch (e) {
          console.log(\`   \${name}: ERROR\`);
        }
        resolve();
      });
    });
    req.write(body);
    req.end();
  });
}

(async () => {
  for (const q of queries) {
    await checkMetric(q.name, q.query);
  }
  console.log('');
  console.log('Run ./run-verification.sh for detailed analysis');
})();
"