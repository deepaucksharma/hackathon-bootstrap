#!/usr/bin/env node

const https = require('https');
require('dotenv').config({ path: '../.env' });

const config = {
  accountId: parseInt(process.env.ACC || '3630072'),
  apiKey: process.env.UKEY || process.env.QKey
};

async function makeGraphQLRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.newrelic.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': config.apiKey
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.errors && result.errors.some(e => !e.message.includes('Variable') && !e.message.includes('never used'))) {
            console.error('GraphQL errors:', JSON.stringify(result.errors, null, 2));
          }
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({ query, variables }));
    req.end();
  });
}

async function analyzeWorkingEvents() {
  console.log('🔍 Analyzing working AWS MSK events...\n');
  
  // Get multiple broker samples to understand the pattern
  const brokerQuery = `
    query($accountId: Int!) {
      actor {
        account(id: $accountId) {
          nrql(query: "SELECT * FROM AwsMskBrokerSample WHERE aws.msk.cluster.name IS NOT NULL SINCE 1 hour ago LIMIT 5") {
            results
          }
        }
      }
    }
  `;

  const brokerResult = await makeGraphQLRequest(brokerQuery, { accountId: config.accountId });
  const brokerSamples = brokerResult.data?.actor?.account?.nrql?.results || [];
  
  if (brokerSamples.length > 0) {
    console.log(`✅ Found ${brokerSamples.length} AwsMskBrokerSample events\n`);
    
    // Analyze the first sample in detail
    const sample = brokerSamples[0];
    console.log('📊 Analyzing event structure:\n');
    
    // Group fields by category
    const awsFields = {};
    const providerFields = {};
    const metricFields = {};
    const entityFields = {};
    const otherFields = {};
    
    Object.entries(sample).forEach(([key, value]) => {
      if (key.startsWith('aws.')) {
        awsFields[key] = value;
      } else if (key.startsWith('provider.')) {
        providerFields[key] = value;
      } else if (key.includes('entity')) {
        entityFields[key] = value;
      } else if (typeof value === 'number' && !key.includes('timestamp') && !key.includes('Id')) {
        metricFields[key] = value;
      } else {
        otherFields[key] = value;
      }
    });
    
    console.log('🔸 AWS Fields:');
    Object.entries(awsFields).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
    
    console.log('\n🔸 Provider Fields:');
    Object.entries(providerFields).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
    
    console.log('\n🔸 Entity Fields:');
    Object.entries(entityFields).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
    
    console.log('\n🔸 Other Fields:');
    Object.entries(otherFields).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
    
    // Check how these events were created
    console.log('\n\n📍 Event Source Analysis:');
    console.log(`  collector.name: ${sample['collector.name']}`);
    console.log(`  instrumentation.provider: ${sample['instrumentation.provider']}`);
    console.log(`  instrumentation.name: ${sample['instrumentation.name']}`);
    
    // Get unique cluster names
    const clusterQuery = `
      query($accountId: Int!) {
        actor {
          account(id: $accountId) {
            nrql(query: "SELECT uniques(aws.msk.cluster.name), uniques(collector.name) FROM AwsMskBrokerSample SINCE 1 day ago") {
              results
            }
          }
        }
      }
    `;

    const clusterResult = await makeGraphQLRequest(clusterQuery, { accountId: config.accountId });
    const clusterData = clusterResult.data?.actor?.account?.nrql?.results?.[0] || {};
    
    console.log('\n\n📊 Unique Values (last 24h):');
    console.log('  Cluster names:', clusterData['uniques.aws.msk.cluster.name'] || []);
    console.log('  Collectors:', clusterData['uniques.collector.name'] || []);
  }
  
  // Check cluster samples
  console.log('\n\n🔍 Checking AwsMskClusterSample structure...\n');
  
  const clusterSampleQuery = `
    query($accountId: Int!) {
      actor {
        account(id: $accountId) {
          nrql(query: "SELECT * FROM AwsMskClusterSample WHERE aws.msk.cluster.name IS NOT NULL SINCE 1 hour ago LIMIT 1") {
            results
          }
        }
      }
    }
  `;

  const clusterSampleResult = await makeGraphQLRequest(clusterSampleQuery, { accountId: config.accountId });
  const clusterSample = clusterSampleResult.data?.actor?.account?.nrql?.results?.[0];
  
  if (clusterSample) {
    console.log('✅ Found AwsMskClusterSample event');
    console.log('\nKey fields:');
    Object.entries(clusterSample).forEach(([key, value]) => {
      if (key.includes('cluster') || key.includes('entity') || key === 'collector.name') {
        console.log(`  ${key}: ${value}`);
      }
    });
  }
  
  // Check how entities link to these events
  console.log('\n\n🔍 Checking entity linkage...\n');
  
  const entityQuery = `
    query {
      actor {
        entity(guid: "${brokerSamples[0]?.entityGuid || 'invalid'}") {
          name
          type
          tags {
            key
            values
          }
          goldenMetrics {
            metrics {
              name
              query
            }
          }
        }
      }
    }
  `;

  if (brokerSamples[0]?.entityGuid) {
    const entityResult = await makeGraphQLRequest(entityQuery);
    const entity = entityResult.data?.actor?.entity;
    
    if (entity) {
      console.log('✅ Found linked entity:');
      console.log(`  Name: ${entity.name}`);
      console.log(`  Type: ${entity.type}`);
      
      if (entity.goldenMetrics?.metrics?.length > 0) {
        console.log('\n  Golden Metrics:');
        entity.goldenMetrics.metrics.forEach(m => {
          console.log(`    - ${m.name}`);
        });
      }
    }
  }
}

analyzeWorkingEvents().catch(console.error);