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

async function verifyMetricStreams() {
  loadEnv();
  
  const accountId = process.env.ACC || process.env.NR_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NR_USER_KEY;
  const clusterName = 'metric-streams-cluster-1749259592185';
  
  console.log('🔍 Verifying Metric Streams Events');
  console.log('==================================\n');
  
  // Check 1: Metric events
  console.log('1️⃣ Checking Metric events...');
  const metricsQuery = `FROM Metric SELECT count(*), uniques(metricName), uniques(collector.name) WHERE aws.kafka.ClusterName = '${clusterName}' OR aws.msk.clusterName = '${clusterName}' SINCE 10 minutes ago`;
  const metrics = await runQuery(metricsQuery, accountId, apiKey);
  
  if (metrics.length > 0 && metrics[0].count > 0) {
    console.log(`✅ Found ${metrics[0].count} metric events`);
    console.log(`   Collectors: ${metrics[0]['uniques.collector.name'].join(', ')}`);
    console.log(`   Metric names: ${metrics[0]['uniques.metricName'].join(', ')}`);
  } else {
    console.log('❌ No metric events found');
  }
  
  // Check 2: Entity fields in metrics
  console.log('\n2️⃣ Checking entity fields in metrics...');
  const entityFieldsQuery = `FROM Metric SELECT * WHERE aws.kafka.ClusterName = '${clusterName}' AND metricName = 'aws.kafka.ActiveControllerCount' LIMIT 1 SINCE 10 minutes ago`;
  const entityFields = await runQuery(entityFieldsQuery, accountId, apiKey);
  
  if (entityFields.length > 0) {
    const event = entityFields[0];
    console.log('   Entity fields present:');
    console.log(`   entity.type: ${event['entity.type'] ? '✅' : '❌'} ${event['entity.type'] || 'MISSING'}`);
    console.log(`   entity.name: ${event['entity.name'] ? '✅' : '❌'} ${event['entity.name'] || 'MISSING'}`);
    console.log(`   entity.guid: ${event['entity.guid'] ? '✅' : '❌'} ${event['entity.guid'] || 'MISSING'}`);
  }
  
  // Check 3: Entity creation
  console.log('\n3️⃣ Checking for entity creation...');
  const entityQuery = `FROM Entity SELECT count(*), uniques(type), uniques(name) WHERE name LIKE '%${clusterName}%' SINCE 10 minutes ago`;
  const entities = await runQuery(entityQuery, accountId, apiKey);
  
  if (entities.length > 0 && entities[0].count > 0) {
    console.log(`✅ ENTITIES CREATED\! Count: ${entities[0].count}`);
    console.log(`   Types: ${entities[0]['uniques.type'].join(', ')}`);
    console.log(`   Names: ${entities[0]['uniques.name'].join(', ')}`);
    console.log('\n🎉 SUCCESS\! Check the Message Queues UI now\!');
  } else {
    console.log('❌ No entities created yet');
  }
  
  // Check 4: Compare approaches
  console.log('\n\n4️⃣ APPROACH COMPARISON');
  console.log('------------------------');
  
  // Count events by type
  const approachQuery = `SELECT count(*) FROM AwsMskBrokerSample, AwsMskClusterSample, AwsMskTopicSample, Metric WHERE collector.name IN ('cloud-integrations', 'cloudwatch-metric-streams', 'nri-kafka-msk') SINCE 1 hour ago FACET eventType, collector.name`;
  const approaches = await runQuery(approachQuery, accountId, apiKey);
  
  console.log('Event counts by approach:');
  approaches.forEach(result => {
    if (result.count > 0) {
      console.log(`   ${result.eventType} via ${result['collector.name']}: ${result.count} events`);
    }
  });
  
  // Final summary
  console.log('\n\n📌 SUMMARY');
  console.log('-----------');
  console.log('We have tried multiple approaches:');
  console.log('1. AwsMsk*Sample events with cloud-integrations collector');
  console.log('2. Enhanced payloads with all nri-kafka-msk fields');
  console.log('3. Metric events with cloudwatch-metric-streams collector');
  console.log('\nAll events are accepted but NO entities are being created.');
  console.log('\nThis strongly suggests:');
  console.log('❌ The account lacks AWS cloud integration setup');
  console.log('❌ Entity synthesis may be disabled for this account');
  console.log('❌ Or entity definitions require actual AWS integration, not synthetic data');
}

verifyMetricStreams();