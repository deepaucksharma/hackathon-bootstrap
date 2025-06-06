#!/bin/bash

echo "================================================================"
echo "🧪 Testing CloudWatch Format for Entity Synthesis"
echo "================================================================"
echo

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

echo "1️⃣ Setting CloudWatch format environment variables..."
export MSK_USE_CLOUDWATCH_FORMAT=true
export MSK_USE_DIMENSIONAL=true
export NEW_RELIC_API_KEY=$IKEY

echo "   MSK_USE_CLOUDWATCH_FORMAT=$MSK_USE_CLOUDWATCH_FORMAT"
echo "   MSK_USE_DIMENSIONAL=$MSK_USE_DIMENSIONAL"
echo "   API Key configured: $([ -n "$NEW_RELIC_API_KEY" ] && echo "✅" || echo "❌")"
echo

echo "2️⃣ Rebuilding nri-kafka with CloudWatch emulator..."
cd /Users/deepaksharma/syc/hackathon-bootstrap
GOOS=linux GOARCH=amd64 go build -o nri-kafka-amd64 ./src
cp nri-kafka-amd64 nri-kafka
chmod +x nri-kafka

echo "   Build complete ✅"
echo

echo "3️⃣ Building Docker image..."
docker build -f Dockerfile.bundle-fixed -t custom-nri-kafka:latest .
echo "   Docker image built ✅"
echo

echo "4️⃣ Updating ConfigMap with CloudWatch format..."
kubectl patch configmap nri-kafka-config -n newrelic --type merge -p '
{
  "data": {
    "nri-kafka-config.yml": "integrations:\n  - name: nri-kafka\n    env:\n      CLUSTER_NAME: minikube-kafka\n      AUTODISCOVER_STRATEGY: bootstrap\n      BOOTSTRAP_BROKER_HOST: kafka-0.kafka-headless.kafka.svc.cluster.local\n      BOOTSTRAP_BROKER_KAFKA_PORT: 9092\n      BOOTSTRAP_BROKER_JMX_PORT: 9999\n      DEFAULT_JMX_PORT: 9999\n      METRICS: \"true\"\n      INVENTORY: \"true\"\n      COLLECT_BROKER_TOPIC_DATA: \"true\"\n      COLLECT_TOPIC_SIZE: \"true\"\n      COLLECT_TOPIC_OFFSET: \"true\"\n      TOPIC_MODE: \"all\"\n      CONSUMER_OFFSET: \"true\"\n      CONSUMER_GROUP_REGEX: \".*\"\n      TIMEOUT: \"30000\"\n      \n      # MSK Shim Configuration\n      MSK_SHIM_ENABLED: \"true\"\n      AWS_ACCOUNT_ID: \"123456789012\"\n      AWS_REGION: \"us-east-1\"\n      KAFKA_CLUSTER_NAME: \"minikube-kafka\"\n      MSK_USE_DIMENSIONAL: \"true\"\n      MSK_USE_CLOUDWATCH_FORMAT: \"true\"\n    interval: 30s\n    timeout: 30s\n    inventory_source: config/kafka"
  }
}'

echo "   ConfigMap updated ✅"
echo

echo "5️⃣ Restarting nri-kafka pod..."
kubectl delete pod -n newrelic $(kubectl get pods -n newrelic | grep nri-kafka | awk '{print $1}')

echo "   Waiting for pod to restart..."
sleep 15

NEW_POD=$(kubectl get pods -n newrelic | grep nri-kafka | awk '{print $1}')
kubectl wait --for=condition=ready pod/$NEW_POD -n newrelic --timeout=60s

echo "   Pod restarted ✅"
echo

echo "6️⃣ Checking CloudWatch emulator logs..."
echo "================================================================"
kubectl logs -n newrelic $NEW_POD | grep -E "(CloudWatch emulator|collector.name.*cloudwatch|Emulating CloudWatch)" | tail -10
echo "================================================================"
echo

echo "7️⃣ Waiting 30 seconds for metrics to be sent..."
sleep 30

echo "8️⃣ Checking for CloudWatch-format metrics in NRDB..."
echo "================================================================"

# Check for metrics with CloudWatch collector name
node -e "
const https = require('https');

const query = \`
  FROM Metric 
  SELECT count(*) 
  WHERE collector.name = 'cloudwatch-metric-streams' 
  AND aws.Namespace = 'AWS/Kafka'
  SINCE 5 minutes ago
\`;

const options = {
  hostname: 'api.newrelic.com',
  path: '/graphql',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'API-Key': '$UKEY'
  }
};

const body = JSON.stringify({
  query: \`{ actor { account(id: $ACC) { nrql(query: \"\${query.replace(/\n/g, ' ')}\") { results } } } }\`
});

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const result = JSON.parse(data);
    if (result.data?.actor?.account?.nrql?.results?.[0]) {
      const count = result.data.actor.account.nrql.results[0].count;
      console.log('CloudWatch format metrics found:', count);
      if (count > 0) {
        console.log('✅ SUCCESS: CloudWatch emulator is working!');
      } else {
        console.log('❌ No CloudWatch format metrics found yet');
      }
    }
  });
});

req.on('error', console.error);
req.write(body);
req.end();
"

echo
echo "================================================================"
echo "9️⃣ Checking Entity Explorer for AWS entities..."
echo "   Visit: https://one.newrelic.com/$ACC/explorer"
echo "   Filter by: Type = AWS_KAFKA_BROKER"
echo "================================================================"
echo
echo "🏁 Test complete! Monitor the Message Queues UI for visibility."
echo "   https://one.newrelic.com/marketplace?state=8c7e81e3-2b7f-15d8-014b-456f0fc66dc6"
echo "================================================================"