#!/usr/bin/env node

const https = require('https');
require('dotenv').config({ path: '../.env' });

const config = {
  accountId: parseInt(process.env.ACC),
  apiKey: process.env.UKEY || process.env.QKey
};

async function makeNRQLRequest(query) {
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

    const graphqlQuery = {
      query: `
        query($accountId: Int!, $nrqlQuery: Nrql!) {
          actor {
            account(id: $accountId) {
              nrql(query: $nrqlQuery) {
                results
              }
            }
          }
        }
      `,
      variables: {
        accountId: config.accountId,
        nrqlQuery: query
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.data?.actor?.account?.nrql?.results || []);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(graphqlQuery));
    req.end();
  });
}

async function checkRecentData() {
  console.log('🔍 Checking recent AWS MSK data...\n');
  
  // Check most recent broker sample
  console.log('📊 Most recent AwsMskBrokerSample:');
  const brokerResults = await makeNRQLRequest(
    "SELECT * FROM AwsMskBrokerSample SINCE 24 hours ago LIMIT 1"
  );
  
  if (brokerResults.length > 0) {
    const sample = brokerResults[0];
    console.log(JSON.stringify(sample, null, 2));
    
    // Extract key information
    console.log('\n🔑 Key Information:');
    console.log(`  Cluster: ${sample['aws.msk.cluster.name'] || sample['awsMskClusterName']}`);
    console.log(`  Broker ID: ${sample['aws.kafka.brokerId'] || sample['awsMskBrokerId']}`);
    console.log(`  Collector: ${sample['collector.name']}`);
    console.log(`  Entity GUID: ${sample['entityGuid']}`);
    console.log(`  Timestamp: ${new Date(sample.timestamp).toISOString()}`);
  } else {
    console.log('  No recent data found');
  }
  
  // Check what created these events
  console.log('\n\n📊 Event sources (last hour):');
  const sourceResults = await makeNRQLRequest(
    "SELECT uniques(collector.name), uniques(instrumentation.provider), uniques(instrumentation.name) FROM AwsMskBrokerSample SINCE 24 hours ago"
  );
  
  if (sourceResults.length > 0) {
    const sources = sourceResults[0];
    console.log('  Collectors:', sources['uniques.collector.name'] || []);
    console.log('  Instrumentation providers:', sources['uniques.instrumentation.provider'] || []);
    console.log('  Instrumentation names:', sources['uniques.instrumentation.name'] || []);
  }
  
  // Check if there are any Metric events that might be related
  console.log('\n\n📊 Related Metric events:');
  const metricResults = await makeNRQLRequest(
    "SELECT * FROM Metric WHERE collector.name = 'cloudwatch-metric-streams' AND (metricName LIKE '%kafka%' OR metricName LIKE '%msk%') SINCE 24 hours ago LIMIT 5"
  );
  
  if (metricResults.length > 0) {
    console.log(`  Found ${metricResults.length} related Metric events`);
    metricResults.forEach((m, i) => {
      console.log(`\n  Metric ${i + 1}:`);
      console.log(`    Name: ${m.metricName}`);
      console.log(`    Namespace: ${m['aws.Namespace'] || m.namespace}`);
      console.log(`    Dimensions:`, Object.keys(m).filter(k => k.includes('dimension')).map(k => `${k}=${m[k]}`).join(', '));
    });
  } else {
    console.log('  No related Metric events found');
  }
  
  // Check for our test cluster specifically
  console.log('\n\n📊 Checking for our test cluster (working-cluster-1749192314301):');
  const testClusterResults = await makeNRQLRequest(
    "SELECT count(*) FROM AwsMskBrokerSample WHERE aws.msk.cluster.name = 'working-cluster-1749192314301' OR awsMskClusterName = 'working-cluster-1749192314301' SINCE 24 hours ago"
  );
  
  if (testClusterResults.length > 0 && testClusterResults[0].count > 0) {
    console.log(`  ✅ Found ${testClusterResults[0].count} events for our test cluster`);
  } else {
    console.log('  ❌ No events found for our test cluster');
    
    // Check if any Metric events were sent
    const testMetricResults = await makeNRQLRequest(
      "SELECT count(*) FROM Metric WHERE aws.msk.cluster.name = 'working-cluster-1749192314301' SINCE 24 hours ago"
    );
    
    if (testMetricResults.length > 0 && testMetricResults[0].count > 0) {
      console.log(`  ⚠️  Found ${testMetricResults[0].count} Metric events but no AwsMskBrokerSample events`);
      console.log('  This suggests the Metric API approach may not automatically create sample events');
    }
  }
}

checkRecentData().catch(console.error);