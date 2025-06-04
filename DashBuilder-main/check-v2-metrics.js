const NerdGraphSuperClient = require('./nerdgraph/super-client');
const fs = require('fs');
const path = require('path');

// Load configuration from kafka-monitoring directory
const configPath = path.join(__dirname, '../kafka-monitoring/.env');
if (!fs.existsSync(configPath)) {
  console.error('Error: .env file not found in kafka-monitoring directory.');
  process.exit(1);
}

require('dotenv').config({ path: configPath });

// Use UKEY as API key and ACC as account ID from the .env file
const client = new NerdGraphSuperClient({
  apiKey: process.env.UKEY,
  accountId: process.env.ACC
});

async function checkV2Metrics() {
  console.log('Checking for Kafka V2 metrics...\n');

  try {
    // Query 1: Check for BytesOutPerSec and MessagesInPerSec metrics
    console.log('1. Checking for BytesOutPerSec and MessagesInPerSec metrics:');
    const query1 = `FROM Metric SELECT uniques(metricName) WHERE metricName LIKE '%BytesOutPerSec%' OR metricName LIKE '%MessagesInPerSec%' SINCE 10 minutes ago`;
    const result1 = await client.nrql(query1);
    const metrics1 = result1?.data?.actor?.account?.nrql?.results || [];
    console.log('Found metrics:', metrics1.length > 0 ? metrics1 : 'No metrics found');
    console.log('\n');

    // Query 2: Check KafkaBrokerSample for topic-level metrics
    console.log('2. Checking KafkaBrokerSample for topic-level metrics:');
    const query2 = `FROM KafkaBrokerSample SELECT * WHERE pipeline = 'custom' AND dimensions.topic IS NOT NULL LIMIT 5`;
    const result2 = await client.nrql(query2);
    const samples2 = result2?.data?.actor?.account?.nrql?.results || [];
    console.log('Topic-level samples found:', samples2.length);
    if (samples2.length > 0) {
      console.log('Sample data:', JSON.stringify(samples2[0], null, 2));
    }
    console.log('\n');

    // Query 3: Check for controller metrics
    console.log('3. Checking for controller metrics:');
    const query3 = `FROM KafkaBrokerSample SELECT * WHERE pipeline = 'custom' AND (metricName LIKE '%Controller%' OR dimensions.controller IS NOT NULL) LIMIT 5`;
    const result3 = await client.nrql(query3);
    const samples3 = result3?.data?.actor?.account?.nrql?.results || [];
    console.log('Controller metrics found:', samples3.length);
    if (samples3.length > 0) {
      console.log('Sample data:', JSON.stringify(samples3[0], null, 2));
    }
    console.log('\n');

    // Query 4: List all available metrics from custom pipeline
    console.log('4. Listing all available metrics from custom pipeline:');
    const query4 = `FROM KafkaBrokerSample SELECT uniques(metricName) WHERE pipeline = 'custom' SINCE 5 minutes ago`;
    const result4 = await client.nrql(query4);
    const metrics4 = result4?.data?.actor?.account?.nrql?.results || [];
    console.log('All custom pipeline metrics:', metrics4.length > 0 ? metrics4 : 'No metrics found');
    console.log('\n');

    // Additional queries to check for V2 metrics in different ways
    console.log('5. Additional checks for V2 metrics:');
    
    // Check in KafkaTopicSample
    const query5a = `FROM KafkaTopicSample SELECT uniques(metricName) WHERE metricName LIKE '%BytesOut%' OR metricName LIKE '%MessagesIn%' SINCE 10 minutes ago`;
    const result5a = await client.nrql(query5a);
    const metrics5a = result5a?.data?.actor?.account?.nrql?.results || [];
    console.log('Topic metrics with BytesOut/MessagesIn:', metrics5a);

    // Check for any custom metrics
    const query5b = `FROM Metric SELECT uniques(metricName) WHERE metricName LIKE 'kafka.%' AND (metricName LIKE '%bytes%' OR metricName LIKE '%messages%') SINCE 10 minutes ago LIMIT 20`;
    const result5b = await client.nrql(query5b);
    const metrics5b = result5b?.data?.actor?.account?.nrql?.results || [];
    console.log('Kafka metrics with bytes/messages:', metrics5b);

    // Check if V2 config is enabled
    const query5c = `FROM KafkaBrokerSample SELECT count(*) WHERE customAttribute.ENABLE_BROKER_TOPIC_METRICS_V2 = 'true' SINCE 1 hour ago`;
    const result5c = await client.nrql(query5c);
    const v2Enabled = result5c?.data?.actor?.account?.nrql?.results || [];
    console.log('V2 metrics enabled check:', v2Enabled);

  } catch (error) {
    console.error('Error executing queries:', error);
  }
}

// Run the check
checkV2Metrics();