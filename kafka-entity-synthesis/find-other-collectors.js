const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load environment
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+?)[=:](.*)/)
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        process.env[key] = value;
      }
    });
  }
}

async function runQuery(query, accountId, apiKey) {
  const graphqlQuery = {
    query: `
      {
        actor {
          account(id: ${accountId}) {
            nrql(query: "${query.replace(/"/g, '\\"')}") {
              results
            }
          }
        }
      }
    `
  };
  
  try {
    const response = await axios.post(
      'https://api.newrelic.com/graphql',
      graphqlQuery,
      {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': apiKey
        }
      }
    );
    
    return response.data?.data?.actor?.account?.nrql?.results || [];
  } catch (error) {
    console.error('Query error:', error.message);
    return [];
  }
}

async function findOtherCollectors() {
  loadEnv();
  
  const accountId = process.env.ACC || process.env.NR_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NR_USER_KEY;
  
  console.log('🔍 Finding Events from Different Collectors');
  console.log('==========================================\n');
  
  // Find nri-kafka-msk events
  console.log('1️⃣ Checking nri-kafka-msk collector...');
  const nriKafkaQuery = `FROM AwsMskBrokerSample SELECT * WHERE collector.name = 'nri-kafka-msk' LIMIT 1 SINCE 7 days ago`;
  const nriKafkaEvents = await runQuery(nriKafkaQuery, accountId, apiKey);
  
  if (nriKafkaEvents.length > 0) {
    const event = nriKafkaEvents[0];
    console.log('✅ Found nri-kafka-msk event');
    console.log(`   Entity Name: ${event.entityName}`);
    console.log(`   Entity GUID: ${event.entityGuid}`);
    console.log(`   Provider: ${event.provider}`);
    
    // Check critical fields
    const criticalFields = [
      'providerAccountId',
      'providerAccountName', 
      'providerExternalId',
      'integrationName',
      'integrationVersion'
    ];
    
    console.log('\n   Critical fields:');
    criticalFields.forEach(field => {
      console.log(`   ${field}: ${event[field] !== undefined ? JSON.stringify(event[field]) : '❌ MISSING'}`);
    });
    
    // Check entity
    const entityCheck = await runQuery(`FROM Entity SELECT count(*) WHERE guid = '${event.entityGuid}' SINCE 7 days ago`, accountId, apiKey);
    console.log(`\n   Entity exists: ${entityCheck[0]?.count > 0 ? '✅ YES' : '❌ NO'}`);
    
    fs.writeFileSync('nri-kafka-msk-sample.json', JSON.stringify(event, null, 2));
    console.log('   📁 Saved to: nri-kafka-msk-sample.json');
  } else {
    console.log('❌ No nri-kafka-msk events found');
  }
  
  // Find cloudwatch-metric-streams events
  console.log('\n\n2️⃣ Checking cloudwatch-metric-streams collector...');
  const metricsQuery = `FROM Metric SELECT * WHERE metricName LIKE 'aws.kafka%' AND collector.name = 'cloudwatch-metric-streams' LIMIT 1 SINCE 7 days ago`;
  const metricsEvents = await runQuery(metricsQuery, accountId, apiKey);
  
  if (metricsEvents.length > 0) {
    const event = metricsEvents[0];
    console.log('✅ Found metric stream event');
    console.log(`   Metric Name: ${event.metricName}`);
    console.log(`   Entity Name: ${event['entity.name'] || event.entityName}`);
    console.log(`   Entity GUID: ${event['entity.guid'] || event.entityGuid}`);
    
    // Check entity fields
    const entityFields = Object.keys(event).filter(k => k.startsWith('entity.'));
    console.log(`\n   Entity fields (${entityFields.length}):`);
    entityFields.forEach(field => {
      console.log(`   ${field}: ${JSON.stringify(event[field])}`);
    });
    
    fs.writeFileSync('metric-stream-sample.json', JSON.stringify(event, null, 2));
    console.log('\n   📁 Saved to: metric-stream-sample.json');
  } else {
    console.log('❌ No metric stream events found');
  }
  
  // Summary of all collectors
  console.log('\n\n3️⃣ Summary of all MSK collectors...');
  const summaryQuery = `FROM AwsMskBrokerSample, AwsMskClusterSample, AwsMskTopicSample SELECT count(*), uniques(collector.name), uniques(provider) SINCE 7 days ago`;
  const summary = await runQuery(summaryQuery, accountId, apiKey);
  
  if (summary.length > 0) {
    const result = summary[0];
    console.log(`\n📊 Total events: ${result.count}`);
    console.log('   Collectors:', result['uniques.collector.name'].join(', '));
    console.log('   Providers:', result['uniques.provider'].join(', '));
  }
  
  // Check if ANY MSK events have created entities
  console.log('\n\n4️⃣ Checking if ANY MSK events created entities...');
  const entityExistsQuery = `FROM AwsMskBrokerSample SELECT count(*) WHERE entityGuid IN (SELECT guid FROM Entity WHERE type IN ('AWSMSKCLUSTER', 'AWSMSKBROKER', 'AWSMSKTOPIC') LIMIT 1000) SINCE 7 days ago`;
  const entityExists = await runQuery(entityExistsQuery, accountId, apiKey);
  
  if (entityExists.length > 0 && entityExists[0].count > 0) {
    console.log(`✅ Found ${entityExists[0].count} events with entities\!`);
    
    // Get one example
    const exampleQuery = `FROM AwsMskBrokerSample SELECT * WHERE entityGuid IN (SELECT guid FROM Entity WHERE type = 'AWSMSKBROKER' LIMIT 1) LIMIT 1 SINCE 7 days ago`;
    const example = await runQuery(exampleQuery, accountId, apiKey);
    if (example.length > 0) {
      console.log('\n   Example of working event:');
      console.log(`   Entity Name: ${example[0].entityName}`);
      console.log(`   Provider: ${example[0].provider}`);
      console.log(`   Collector: ${example[0]['collector.name']}`);
    }
  } else {
    console.log('❌ NO MSK events have created entities in this account\!');
  }
}

findOtherCollectors();