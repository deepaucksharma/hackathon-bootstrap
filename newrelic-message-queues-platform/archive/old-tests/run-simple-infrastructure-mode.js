#!/usr/bin/env node

/**
 * Simple Infrastructure Mode Runner
 * Collects nri-kafka data directly and transforms to MESSAGE_QUEUE entities
 */

const https = require('https');
const NriKafkaTransformer = require('./infrastructure/transformers/nri-kafka-transformer');
const NewRelicStreamer = require('./simulation/streaming/new-relic-streamer');

const config = {
  accountId: process.env.NEW_RELIC_ACCOUNT_ID || 'YOUR_ACCOUNT_ID', // Replace with your account ID
  apiKey: process.env.NEW_RELIC_API_KEY || process.env.NEW_RELIC_USER_API_KEY || 'YOUR_API_KEY_HERE', // Replace with your API key
  interval: 30000, // 30 seconds
  duration: parseInt(process.argv[2]) || 300 // 5 minutes default
};

function makeNRQLQuery(query) {
  const nrqlQuery = `{ 
    actor { 
      account(id: ${config.accountId}) { 
        nrql(query: "${query}") { 
          results 
        } 
      } 
    } 
  }`;

  const payload = { query: nrqlQuery };
  const postData = JSON.stringify(payload);
  
  const options = {
    hostname: 'api.newrelic.com',
    port: 443,
    path: '/graphql',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'API-Key': config.apiKey,
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.errors) {
            reject(new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`));
          } else {
            resolve(response.data.actor.account.nrql.results);
          }
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function collectAndTransform() {
  console.log('📊 Collecting nri-kafka data...');
  
  try {
    // Collect broker samples
    const brokerQuery = `FROM KafkaBrokerSample SELECT * SINCE 5 minutes ago LIMIT 10`;
    const brokerSamples = await makeNRQLQuery(brokerQuery);
    console.log(`✅ Found ${brokerSamples.length} broker samples`);

    // Collect topic samples
    const topicQuery = `FROM KafkaTopicSample SELECT * SINCE 5 minutes ago LIMIT 20`;
    const topicSamples = await makeNRQLQuery(topicQuery);
    console.log(`✅ Found ${topicSamples.length} topic samples`);

    // Transform to MESSAGE_QUEUE entities
    const transformer = new NriKafkaTransformer(config.accountId);
    const allEntities = [];

    // Transform brokers
    for (const sample of brokerSamples) {
      try {
        const entity = transformer.transformBrokerSample(sample);
        if (entity) {
          allEntities.push(entity);
        }
      } catch (error) {
        console.warn(`⚠️  Failed to transform broker: ${error.message}`);
      }
    }

    // Transform topics  
    for (const sample of topicSamples) {
      try {
        const entity = transformer.transformTopicSample(sample);
        if (entity) {
          allEntities.push(entity);
        }
      } catch (error) {
        console.warn(`⚠️  Failed to transform topic: ${error.message}`);
      }
    }

    // Create cluster entity if we have broker data
    if (brokerSamples.length > 0) {
      try {
        const clusterEntity = transformer.createClusterEntity(brokerSamples, topicSamples);
        if (clusterEntity) {
          allEntities.push(clusterEntity);
        }
      } catch (error) {
        console.warn(`⚠️  Failed to create cluster entity: ${error.message}`);
      }
    }

    console.log(`🔧 Transformed ${allEntities.length} MESSAGE_QUEUE entities`);

    // Stream entities to New Relic
    if (allEntities.length > 0) {
      const streamer = new NewRelicStreamer(config);
      try {
        await streamer.streamEvents(allEntities);
        console.log(`📤 Successfully streamed ${allEntities.length} entities to New Relic`);
        
        // Show entity breakdown
        const breakdown = allEntities.reduce((acc, entity) => {
          acc[entity.entityType] = (acc[entity.entityType] || 0) + 1;
          return acc;
        }, {});
        
        console.log('📊 Entity breakdown:', breakdown);
        
      } catch (error) {
        console.error(`❌ Failed to stream entities: ${error.message}`);
      }
    }

    return allEntities.length;
    
  } catch (error) {
    console.error('❌ Collection and transformation failed:', error.message);
    return 0;
  }
}

async function runInfrastructureMode() {
  console.log('🚀 Starting Simple Infrastructure Mode');
  console.log('=====================================');
  console.log(`Account ID: ${config.accountId}`);
  console.log(`Interval: ${config.interval / 1000}s`);
  console.log(`Duration: ${config.duration}s`);
  console.log('');

  const startTime = Date.now();
  let cycles = 0;
  let totalEntities = 0;

  const runCycle = async () => {
    cycles++;
    console.log(`\n🔄 Cycle ${cycles} - ${new Date().toLocaleTimeString()}`);
    
    const entitiesProcessed = await collectAndTransform();
    totalEntities += entitiesProcessed;
    
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`⏱️  Cycle completed in ${elapsed}s - ${entitiesProcessed} entities processed`);
    
    if (elapsed < config.duration) {
      setTimeout(runCycle, config.interval);
    } else {
      console.log('\n🎉 Infrastructure mode completed!');
      console.log(`📊 Summary: ${cycles} cycles, ${totalEntities} total entities processed`);
      console.log('\n🔗 Check your dashboard:');
      console.log('https://one.newrelic.com/redirect/entity/MzYzMDA3MnxWSVp8REFTSEJPQVJEfGRhOjEwMTU1Njk3');
      process.exit(0);
    }
  };

  // Start first cycle
  runCycle();
}

if (require.main === module) {
  runInfrastructureMode().catch(console.error);
}

module.exports = { runInfrastructureMode };