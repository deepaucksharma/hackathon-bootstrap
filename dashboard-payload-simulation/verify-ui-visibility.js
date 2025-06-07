#!/usr/bin/env node

/**
 * Simple UI Visibility Verification Tool
 * 
 * Checks if MessageQueueSample events are being created and visible
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load environment variables
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

// Run NRQL query
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

// Format results for display
function formatResults(results, format = 'table') {
  if (!results || results.length === 0) {
    return 'No results found';
  }
  
  if (format === 'json') {
    return JSON.stringify(results, null, 2);
  }
  
  // Table format
  const keys = Object.keys(results[0]);
  const maxLengths = {};
  
  // Calculate column widths
  keys.forEach(key => {
    maxLengths[key] = Math.max(
      key.length,
      ...results.map(r => String(r[key] || '').length)
    );
  });
  
  // Header
  let table = '\n' + keys.map(k => k.padEnd(maxLengths[k])).join(' | ') + '\n';
  table += keys.map(k => '-'.repeat(maxLengths[k])).join('-|-') + '\n';
  
  // Rows
  results.forEach(row => {
    table += keys.map(k => String(row[k] || '').padEnd(maxLengths[k])).join(' | ') + '\n';
  });
  
  return table;
}

// Main verification function
async function verify() {
  loadEnv();
  
  const accountId = process.env.ACC || process.env.NR_ACCOUNT_ID || process.env.NEW_RELIC_ACCOUNT_ID;
  const apiKey = process.env.UKEY || process.env.NR_USER_KEY;
  
  if (!accountId || !apiKey) {
    console.error('❌ Missing required environment variables: ACC/NR_ACCOUNT_ID and UKEY/NR_USER_KEY');
    process.exit(1);
  }
  
  console.log('🔍 Kafka/MSK UI Visibility Verification');
  console.log('=' .repeat(60));
  console.log(`Account: ${accountId}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('=' .repeat(60));
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const timeRange = args.find(a => a.includes('min')) || '10 minutes ago';
  const provider = args.find(a => !a.includes('min')) || 'AwsMsk';
  
  console.log(`\n📊 Checking MessageQueueSample events for provider: ${provider}`);
  console.log(`   Time range: Since ${timeRange}\n`);
  
  // Check 1: Count of MessageQueueSample events
  console.log('1️⃣ MessageQueueSample Event Count');
  console.log('-'.repeat(40));
  const countQuery = `FROM MessageQueueSample SELECT count(*) WHERE provider = '${provider}' SINCE ${timeRange}`;
  const countResults = await runQuery(countQuery, accountId, apiKey);
  
  if (countResults.length > 0 && countResults[0].count > 0) {
    console.log(`✅ Found ${countResults[0].count} MessageQueueSample events`);
  } else {
    console.log('❌ No MessageQueueSample events found');
    console.log('   This is why entities are not appearing in the UI!');
  }
  
  // Check 2: List of queues
  console.log('\n2️⃣ Queue Details');
  console.log('-'.repeat(40));
  const queueQuery = `FROM MessageQueueSample SELECT queue.name, queue.type, entity.type, latest(timestamp) as 'Last Seen' WHERE provider = '${provider}' SINCE ${timeRange} FACET queue.name LIMIT 20`;
  const queueResults = await runQuery(queueQuery, accountId, apiKey);
  
  if (queueResults.length > 0) {
    console.log('✅ Active Queues:');
    console.log(formatResults(queueResults));
  } else {
    console.log('❌ No queue details found');
  }
  
  // Check 3: Metrics summary
  console.log('\n3️⃣ Queue Metrics Summary');
  console.log('-'.repeat(40));
  const metricsQuery = `FROM MessageQueueSample SELECT average(queue.messagesPerSecond) as 'Avg Msg/s', average(queue.bytesPerSecond) as 'Avg Bytes/s', average(queue.consumerLag) as 'Avg Lag' WHERE provider = '${provider}' SINCE ${timeRange} FACET queue.type`;
  const metricsResults = await runQuery(metricsQuery, accountId, apiKey);
  
  if (metricsResults.length > 0) {
    console.log('✅ Metrics by Queue Type:');
    console.log(formatResults(metricsResults));
  } else {
    console.log('❌ No metrics found');
  }
  
  // Check 4: Entity GUIDs
  console.log('\n4️⃣ Entity Synthesis Check');
  console.log('-'.repeat(40));
  const guidQuery = `FROM MessageQueueSample SELECT uniques(entity.guid) WHERE provider = '${provider}' AND entity.guid IS NOT NULL SINCE ${timeRange}`;
  const guidResults = await runQuery(guidQuery, accountId, apiKey);
  
  if (guidResults.length > 0 && guidResults[0]['uniques.entity.guid']) {
    const guidCount = guidResults[0]['uniques.entity.guid'].length;
    console.log(`✅ Found ${guidCount} unique entity GUIDs`);
    console.log('   First 5 GUIDs:');
    guidResults[0]['uniques.entity.guid'].slice(0, 5).forEach(guid => {
      console.log(`   - ${guid}`);
    });
  } else {
    console.log('❌ No entity GUIDs found');
  }
  
  // Check 5: Recent activity
  console.log('\n5️⃣ Recent Activity (Last 5 Events)');
  console.log('-'.repeat(40));
  const recentQuery = `FROM MessageQueueSample SELECT queue.name, queue.type, timestamp WHERE provider = '${provider}' SINCE ${timeRange} ORDER BY timestamp DESC LIMIT 5`;
  const recentResults = await runQuery(recentQuery, accountId, apiKey);
  
  if (recentResults.length > 0) {
    console.log('✅ Recent Events:');
    recentResults.forEach(event => {
      const time = new Date(event.timestamp).toISOString();
      console.log(`   ${time} - ${event['queue.type']}: ${event['queue.name']}`);
    });
  } else {
    console.log('❌ No recent activity');
  }
  
  // Summary and recommendations
  console.log('\n' + '=' .repeat(60));
  console.log('📌 Summary & Recommendations');
  console.log('=' .repeat(60));
  
  if (countResults.length > 0 && countResults[0].count > 0) {
    console.log('✅ MessageQueueSample events are being created');
    console.log('✅ This is the correct approach for UI visibility');
    console.log('\n🎯 Next Steps:');
    console.log('1. Check New Relic > Message Queues UI');
    console.log(`2. Filter by provider "${provider}"`);
    console.log('3. Your Kafka/MSK entities should be visible');
    console.log('\n💡 If entities are still not visible in UI:');
    console.log('- Ensure collector.name is "cloudwatch-metric-streams"');
    console.log('- Verify queue.name field is populated');
    console.log('- Check that entity.type matches expected values');
  } else {
    console.log('❌ No MessageQueueSample events found');
    console.log('\n🚨 This is why entities are not visible in the UI!');
    console.log('\n🔧 To fix this:');
    console.log('1. Use eventType: "MessageQueueSample" (not AwsMskBrokerSample)');
    console.log('2. Include required fields: queue.name, provider, collector.name');
    console.log('3. Run: node messagequeue-payload-generator.js');
  }
  
  console.log('\n📊 Useful NRQL Queries:');
  console.log(`- Check all events: FROM MessageQueueSample SELECT * WHERE provider = '${provider}' SINCE 1 hour ago`);
  console.log(`- Queue metrics: FROM MessageQueueSample SELECT average(queue.messagesPerSecond), average(queue.consumerLag) WHERE provider = '${provider}' SINCE 1 hour ago FACET queue.name`);
  console.log(`- Entity check: FROM MessageQueueSample SELECT count(*) WHERE provider = '${provider}' SINCE 1 day ago FACET entity.type, queue.type`);
}

// Run verification
verify().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});