const NerdGraphSuperClient = require('./nerdgraph/super-client');
const fs = require('fs');
const path = require('path');

// Load configuration from kafka-monitoring directory
const configPath = path.join(__dirname, '../kafka-monitoring/.env');
require('dotenv').config({ path: configPath });

const client = new NerdGraphSuperClient({
  apiKey: process.env.UKEY,
  accountId: process.env.ACC
});

async function checkKafkaMonitoring() {
  console.log('Checking Kafka monitoring status...\n');

  try {
    // Check what Kafka events we have
    console.log('1. Available Kafka event types:');
    const query1 = `FROM KafkaBrokerSample, KafkaTopicSample, KafkaProducerSample, KafkaConsumerSample, KafkaOffsetSample SELECT count(*) FACET eventType() SINCE 1 hour ago`;
    const result1 = await client.nrql(query1);
    const events = result1?.data?.actor?.account?.nrql?.results || [];
    console.log('Event types:', events);
    console.log('\n');

    // Check KafkaBrokerSample metrics
    console.log('2. KafkaBrokerSample metrics available:');
    const query2 = `FROM KafkaBrokerSample SELECT uniques(metricName) SINCE 10 minutes ago LIMIT 50`;
    const result2 = await client.nrql(query2);
    const brokerMetrics = result2?.data?.actor?.account?.nrql?.results || [];
    console.log('Broker metrics count:', brokerMetrics[0]?.['uniques.metricName']?.length || 0);
    if (brokerMetrics[0]?.['uniques.metricName']) {
      console.log('Sample metrics:', brokerMetrics[0]['uniques.metricName'].slice(0, 10));
    }
    console.log('\n');

    // Check KafkaTopicSample metrics
    console.log('3. KafkaTopicSample metrics available:');
    const query3 = `FROM KafkaTopicSample SELECT uniques(metricName) SINCE 10 minutes ago LIMIT 50`;
    const result3 = await client.nrql(query3);
    const topicMetrics = result3?.data?.actor?.account?.nrql?.results || [];
    console.log('Topic metrics count:', topicMetrics[0]?.['uniques.metricName']?.length || 0);
    if (topicMetrics[0]?.['uniques.metricName']) {
      console.log('Sample metrics:', topicMetrics[0]['uniques.metricName'].slice(0, 10));
    }
    console.log('\n');

    // Check for any BytesOut or MessagesIn metrics
    console.log('4. Checking for BytesOut/MessagesIn metrics in any form:');
    const query4 = `FROM KafkaBrokerSample, KafkaTopicSample SELECT * WHERE metricName LIKE '%bytes%' OR metricName LIKE '%messages%' OR metricName LIKE '%BytesOut%' OR metricName LIKE '%MessagesIn%' LIMIT 5`;
    const result4 = await client.nrql(query4);
    const byteMessageMetrics = result4?.data?.actor?.account?.nrql?.results || [];
    console.log('Found metrics:', byteMessageMetrics.length);
    if (byteMessageMetrics.length > 0) {
      console.log('Sample:', JSON.stringify(byteMessageMetrics[0], null, 2));
    }
    console.log('\n');

    // Check for custom attributes
    console.log('5. Checking for custom attributes that might indicate V2 configuration:');
    const query5 = `FROM KafkaBrokerSample SELECT keyset() WHERE pipeline = 'custom' OR customAttribute.ENABLE_BROKER_TOPIC_METRICS_V2 IS NOT NULL SINCE 1 hour ago LIMIT 1`;
    const result5 = await client.nrql(query5);
    const customAttrs = result5?.data?.actor?.account?.nrql?.results || [];
    console.log('Custom attributes:', customAttrs);
    console.log('\n');

    // Check all pipelines
    console.log('6. Checking all available pipelines:');
    const query6 = `FROM KafkaBrokerSample SELECT count(*) FACET pipeline SINCE 1 hour ago`;
    const result6 = await client.nrql(query6);
    const pipelines = result6?.data?.actor?.account?.nrql?.results || [];
    console.log('Pipelines:', pipelines);
    console.log('\n');

    // Check for topic-specific metrics
    console.log('7. Checking for topic-specific metrics:');
    const query7 = `FROM KafkaTopicSample SELECT * WHERE topic IS NOT NULL LIMIT 3`;
    const result7 = await client.nrql(query7);
    const topicSamples = result7?.data?.actor?.account?.nrql?.results || [];
    console.log('Topic samples found:', topicSamples.length);
    if (topicSamples.length > 0) {
      console.log('Available metrics in topic sample:', Object.keys(topicSamples[0]).filter(k => k !== 'timestamp' && k !== 'entityGuid'));
    }

  } catch (error) {
    console.error('Error executing queries:', error);
  }
}

// Run the check
checkKafkaMonitoring();