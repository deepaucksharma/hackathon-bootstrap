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

async function checkV2MetricsDetailed() {
  console.log('Performing detailed V2 metrics check...\n');

  try {
    // Check for v2_metrics label
    console.log('1. Checking for v2_metrics label:');
    const query1 = `FROM KafkaBrokerSample SELECT count(*), latest(label.v2_metrics) WHERE label.v2_metrics IS NOT NULL SINCE 1 hour ago`;
    const result1 = await client.nrql(query1);
    console.log('V2 metrics label:', result1?.data?.actor?.account?.nrql?.results || []);
    console.log('\n');

    // Check for topic-level metrics in broker samples
    console.log('2. Checking for topic attribute in KafkaBrokerSample:');
    const query2 = `FROM KafkaBrokerSample SELECT count(*) WHERE topic IS NOT NULL FACET topic SINCE 1 hour ago LIMIT 10`;
    const result2 = await client.nrql(query2);
    const topicFacets = result2?.data?.actor?.account?.nrql?.results || [];
    console.log('Topics found in broker samples:', topicFacets);
    console.log('\n');

    // Look for specific V2 metric patterns
    console.log('3. Checking for V2 metric patterns:');
    const metricPatterns = [
      'kafka.server:type=BrokerTopicMetrics,name=BytesOutPerSec',
      'kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec',
      'kafka.controller:type=KafkaController,name=ActiveControllerCount',
      'kafka.controller:type=KafkaController,name=GlobalPartitionCount'
    ];
    
    for (const pattern of metricPatterns) {
      const query = `FROM Metric SELECT count(*) WHERE metricName LIKE '%${pattern.split(':')[1]}%' SINCE 1 hour ago`;
      const result = await client.nrql(query);
      console.log(`Pattern "${pattern}":`, result?.data?.actor?.account?.nrql?.results || []);
    }
    console.log('\n');

    // Check nri-kafka configuration
    console.log('4. Checking nri-kafka integration configuration:');
    const query4 = `FROM KafkaBrokerSample SELECT latest(integrationVersion), count(*) FACET integrationVersion, pipeline SINCE 1 hour ago`;
    const result4 = await client.nrql(query4);
    console.log('Integration versions:', result4?.data?.actor?.account?.nrql?.results || []);
    console.log('\n');

    // Check for BytesOut and MessagesIn in any numeric field
    console.log('5. Checking numeric fields for BytesOut/MessagesIn patterns:');
    const query5 = `FROM KafkaBrokerSample SELECT keyset() WHERE topic IS NOT NULL LIMIT 1`;
    const result5 = await client.nrql(query5);
    const keys = result5?.data?.actor?.account?.nrql?.results || [];
    const numericKeys = keys.filter(k => k.type === 'numeric' && (k.key.toLowerCase().includes('bytes') || k.key.toLowerCase().includes('messages')));
    console.log('Relevant numeric fields:', numericKeys.map(k => k.key));
    console.log('\n');

    // Check for controller metrics
    console.log('6. Checking for controller-related metrics:');
    const query6 = `FROM KafkaBrokerSample SELECT keyset() WHERE pipeline = 'custom' LIMIT 1`;
    const result6 = await client.nrql(query6);
    const allKeys = result6?.data?.actor?.account?.nrql?.results || [];
    const controllerKeys = allKeys.filter(k => k.key.toLowerCase().includes('controller'));
    console.log('Controller-related fields:', controllerKeys.map(k => ({ key: k.key, type: k.type })));
    console.log('\n');

    // Check actual metric values
    console.log('7. Sample of actual metrics with topic:');
    const query7 = `FROM KafkaBrokerSample SELECT topic, broker.messagesInPerSecond, broker.IOInPerSecond, broker.IOOutPerSecond WHERE topic IS NOT NULL LIMIT 5`;
    const result7 = await client.nrql(query7);
    const samples = result7?.data?.actor?.account?.nrql?.results || [];
    console.log('Sample data:', samples);

  } catch (error) {
    console.error('Error executing queries:', error);
  }
}

// Run the check
checkV2MetricsDetailed();