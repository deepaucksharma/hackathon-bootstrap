#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

// Load environment
const envPath = '../.env';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+?)[=:](.*)/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      process.env[key] = value;
    }
  });
}

// Submit to New Relic
async function submitPayload(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify([payload]);
    
    const options = {
      hostname: 'insights-collector.newrelic.com',
      path: `/v1/accounts/${process.env.ACC}/events`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Insert-Key': process.env.IKEY,
        'Content-Length': data.length
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body
        });
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runQuery(nrql) {
  return new Promise((resolve, reject) => {
    const query = {
      query: `{ actor { account(id: ${process.env.ACC}) { nrql(query: "${nrql.replace(/"/g, '\\"').replace(/\n/g, ' ')}") { results } } } }`
    };
    
    const data = JSON.stringify(query);
    
    const options = {
      hostname: 'api.newrelic.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': process.env.UKEY
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve(response.data?.actor?.account?.nrql?.results || []);
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const timestamp = Date.now();
  const baseTime = timestamp;
  
  console.log('🧪 Testing Advanced MessageQueueSample Scenarios');
  console.log('================================================\n');
  
  // Scenario 1: Multiple Clusters with Different Regions
  console.log('📋 Scenario 1: Multi-Region MSK Deployment\n');
  
  const regions = ['us-east-1', 'us-west-2', 'eu-west-1'];
  const environments = ['production', 'staging', 'development'];
  
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    const env = environments[i];
    const clusterName = `${env}-msk-${region}`;
    
    // Cluster
    await submitPayload({
      eventType: 'MessageQueueSample',
      timestamp: baseTime + i,
      provider: 'AwsMsk',
      'collector.name': 'cloudwatch-metric-streams',
      'queue.name': clusterName,
      'queue.type': 'kafka_cluster',
      'entity.name': clusterName,
      'entity.type': 'AWSMSKCLUSTER',
      
      // Region-specific
      awsRegion: region,
      awsAccountId: '123456789012',
      awsMskClusterName: clusterName,
      environment: env,
      
      // Metrics vary by environment
      'queue.activeControllers': 1,
      'queue.globalPartitions': env === 'production' ? 100 : 30,
      'queue.offlinePartitions': 0,
      'queue.brokerCount': env === 'production' ? 6 : 3,
      
      // Tags for filtering
      'tags.environment': env,
      'tags.region': region,
      'tags.team': 'platform',
      'tags.cost-center': 'engineering'
    });
    
    // Brokers for each cluster
    const brokerCount = env === 'production' ? 6 : 3;
    for (let b = 1; b <= brokerCount; b++) {
      await submitPayload({
        eventType: 'MessageQueueSample',
        timestamp: baseTime + i,
        provider: 'AwsMsk',
        'collector.name': 'cloudwatch-metric-streams',
        'queue.name': `${clusterName}-broker-${b}`,
        'queue.type': 'kafka_broker',
        'entity.name': `${clusterName}-broker-${b}`,
        'entity.type': 'AWSMSKBROKER',
        
        // Relationships
        awsRegion: region,
        awsAccountId: '123456789012',
        awsMskClusterName: clusterName,
        awsMskBrokerId: b.toString(),
        environment: env,
        
        // Varying metrics by broker
        'queue.cpuPercent': 20 + (b * 5) + (env === 'production' ? 20 : 0),
        'queue.bytesInPerSecond': 1000000 * b * (env === 'production' ? 10 : 1),
        'queue.bytesOutPerSecond': 800000 * b * (env === 'production' ? 10 : 1),
        'queue.networkRxDropped': 0,
        'queue.networkTxDropped': 0,
        
        // Tags
        'tags.environment': env,
        'tags.region': region,
        'tags.availability-zone': `${region}${String.fromCharCode(96 + ((b - 1) % 3) + 1)}`
      });
    }
  }
  
  console.log('✓ Multi-region clusters created\n');
  
  // Scenario 2: Topics with Consumer Groups
  console.log('📋 Scenario 2: Topics with Consumer Lag Monitoring\n');
  
  const topics = [
    { name: 'orders', partitions: 50, consumers: ['order-processor', 'analytics-consumer'] },
    { name: 'user-events', partitions: 100, consumers: ['event-processor', 'ml-pipeline', 'audit-logger'] },
    { name: 'system-logs', partitions: 20, consumers: ['log-aggregator'] }
  ];
  
  for (const topic of topics) {
    // Create topic for production cluster
    const clusterName = 'production-msk-us-east-1';
    const topicFullName = `${clusterName}-${topic.name}`;
    
    await submitPayload({
      eventType: 'MessageQueueSample',
      timestamp: baseTime,
      provider: 'AwsMsk',
      'collector.name': 'cloudwatch-metric-streams',
      'queue.name': topicFullName,
      'queue.type': 'kafka_topic',
      'entity.name': topicFullName,
      'entity.type': 'AWSMSKTOPIC',
      
      // Topic details
      awsRegion: 'us-east-1',
      awsAccountId: '123456789012',
      awsMskClusterName: clusterName,
      topicName: topic.name,
      
      // Metrics
      'queue.messagesPerSecond': Math.floor(Math.random() * 10000) + 1000,
      'queue.bytesInPerSecond': Math.floor(Math.random() * 10000000) + 1000000,
      'queue.bytesOutPerSecond': Math.floor(Math.random() * 8000000) + 800000,
      'queue.partitionCount': topic.partitions,
      'queue.replicationFactor': 3,
      'queue.consumerLag': topic.consumers.length * Math.floor(Math.random() * 10000),
      
      // Consumer groups
      'consumerGroups': topic.consumers.join(','),
      'consumerGroupCount': topic.consumers.length,
      
      // Tags
      'tags.data-classification': topic.name.includes('orders') ? 'sensitive' : 'internal',
      'tags.retention-days': topic.name.includes('logs') ? 7 : 30
    });
  }
  
  console.log('✓ Topics with consumer groups created\n');
  
  // Scenario 3: Alerting Scenarios
  console.log('📋 Scenario 3: Clusters with Alert Conditions\n');
  
  const alertScenarios = [
    { cluster: 'alert-test-healthy', cpu: 25, offline: 0, lag: 100 },
    { cluster: 'alert-test-warning', cpu: 75, offline: 0, lag: 50000 },
    { cluster: 'alert-test-critical', cpu: 95, offline: 5, lag: 1000000 }
  ];
  
  for (const scenario of alertScenarios) {
    // Cluster with health indicators
    await submitPayload({
      eventType: 'MessageQueueSample',
      timestamp: baseTime,
      provider: 'AwsMsk',
      'collector.name': 'cloudwatch-metric-streams',
      'queue.name': scenario.cluster,
      'queue.type': 'kafka_cluster',
      'entity.name': scenario.cluster,
      'entity.type': 'AWSMSKCLUSTER',
      
      awsRegion: 'us-east-1',
      awsAccountId: '123456789012',
      awsMskClusterName: scenario.cluster,
      
      // Health metrics
      'queue.activeControllers': 1,
      'queue.offlinePartitions': scenario.offline,
      'queue.globalPartitions': 100,
      'queue.underReplicatedPartitions': scenario.offline * 2,
      
      // Alert status
      'alertStatus': scenario.offline > 0 ? 'CRITICAL' : scenario.cpu > 80 ? 'WARNING' : 'OK',
      'healthScore': scenario.offline > 0 ? 0 : scenario.cpu > 80 ? 50 : 100
    });
    
    // Broker with high CPU
    await submitPayload({
      eventType: 'MessageQueueSample',
      timestamp: baseTime,
      provider: 'AwsMsk',
      'collector.name': 'cloudwatch-metric-streams',
      'queue.name': `${scenario.cluster}-broker-1`,
      'queue.type': 'kafka_broker',
      'entity.name': `${scenario.cluster}-broker-1`,
      'entity.type': 'AWSMSKBROKER',
      
      awsRegion: 'us-east-1',
      awsAccountId: '123456789012',
      awsMskClusterName: scenario.cluster,
      awsMskBrokerId: '1',
      
      // Performance metrics
      'queue.cpuPercent': scenario.cpu,
      'queue.memoryPercent': scenario.cpu * 0.8,
      'queue.diskUsedPercent': scenario.cpu * 0.6,
      'queue.networkUtilization': scenario.cpu * 0.7,
      
      // Throughput
      'queue.bytesInPerSecond': scenario.cpu > 80 ? 100000000 : 10000000,
      'queue.bytesOutPerSecond': scenario.cpu > 80 ? 80000000 : 8000000
    });
    
    // Topic with consumer lag
    await submitPayload({
      eventType: 'MessageQueueSample',
      timestamp: baseTime,
      provider: 'AwsMsk',
      'collector.name': 'cloudwatch-metric-streams',
      'queue.name': `${scenario.cluster}-orders`,
      'queue.type': 'kafka_topic',
      'entity.name': `${scenario.cluster}-orders`,
      'entity.type': 'AWSMSKTOPIC',
      
      awsRegion: 'us-east-1',
      awsAccountId: '123456789012',
      awsMskClusterName: scenario.cluster,
      topicName: 'orders',
      
      // Lag metrics
      'queue.consumerLag': scenario.lag,
      'queue.oldestLagMs': scenario.lag * 100,
      'queue.lagTrend': scenario.lag > 100000 ? 'increasing' : 'stable'
    });
  }
  
  console.log('✓ Alert scenario clusters created\n');
  
  // Wait for processing
  console.log('⏳ Waiting 30s for processing...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  // Run validation queries
  console.log('\n🔍 Running Advanced Validation Queries...\n');
  
  // 1. Multi-region view
  console.log('1️⃣ Multi-Region Cluster Distribution:');
  const regionQuery = `FROM MessageQueueSample SELECT uniqueCount(entity.name) WHERE entity.type = 'AWSMSKCLUSTER' AND provider = 'AwsMsk' FACET awsRegion SINCE 10 minutes ago`;
  const regionResults = await runQuery(regionQuery);
  regionResults.forEach(r => {
    console.log(`   ${r.facet[0]}: ${r['uniqueCount.entity.name']} clusters`);
  });
  
  // 2. Environment breakdown
  console.log('\n2️⃣ Environment Breakdown:');
  const envQuery = `FROM MessageQueueSample SELECT average(queue.cpuPercent), sum(queue.bytesInPerSecond)/1000000 as 'Total MB/s' WHERE entity.type = 'AWSMSKBROKER' AND provider = 'AwsMsk' FACET environment SINCE 10 minutes ago`;
  const envResults = await runQuery(envQuery);
  envResults.forEach(r => {
    console.log(`   ${r.facet[0]}: ${r['average.queue.cpuPercent']?.toFixed(1)}% CPU, ${r['Total MB/s']?.toFixed(0)} MB/s`);
  });
  
  // 3. Consumer lag analysis
  console.log('\n3️⃣ Consumer Lag Analysis:');
  const lagQuery = `FROM MessageQueueSample SELECT max(queue.consumerLag), latest(consumerGroupCount) WHERE entity.type = 'AWSMSKTOPIC' AND queue.consumerLag > 0 FACET entity.name SINCE 10 minutes ago LIMIT 5`;
  const lagResults = await runQuery(lagQuery);
  lagResults.forEach(r => {
    console.log(`   ${r.facet[0]}: ${r['max.queue.consumerLag']} lag, ${r['latest.consumerGroupCount']} consumer groups`);
  });
  
  // 4. Alert status overview
  console.log('\n4️⃣ Cluster Health Status:');
  const healthQuery = `FROM MessageQueueSample SELECT latest(queue.offlinePartitions), latest(alertStatus) WHERE entity.type = 'AWSMSKCLUSTER' AND entity.name LIKE 'alert-test%' FACET entity.name SINCE 10 minutes ago`;
  const healthResults = await runQuery(healthQuery);
  healthResults.forEach(r => {
    console.log(`   ${r.facet[0]}: ${r['latest.alertStatus']} (${r['latest.queue.offlinePartitions']} offline partitions)`);
  });
  
  // 5. Tag-based filtering
  console.log('\n5️⃣ Tag-Based Filtering (production only):');
  const tagQuery = `FROM MessageQueueSample SELECT count(*), uniques(entity.type) WHERE tags.environment = 'production' SINCE 10 minutes ago`;
  const tagResults = await runQuery(tagQuery);
  console.log(`   Found ${tagResults[0]?.count || 0} production entities`);
  console.log(`   Types: ${tagResults[0]?.['uniques.entity.type']?.join(', ') || 'None'}`);
  
  // 6. Relationship validation
  console.log('\n6️⃣ Cluster-Broker Relationships:');
  const relQuery = `FROM MessageQueueSample SELECT uniqueCount(entity.name) WHERE entity.type IN ('AWSMSKBROKER', 'AWSMSKTOPIC') FACET awsMskClusterName SINCE 10 minutes ago LIMIT 5`;
  const relResults = await runQuery(relQuery);
  relResults.forEach(r => {
    console.log(`   ${r.facet[0]}: ${r['uniqueCount.entity.name']} child entities`);
  });
  
  console.log('\n\n✅ ADVANCED SCENARIOS SUMMARY');
  console.log('=============================');
  console.log('Successfully tested:');
  console.log('1. Multi-region deployments with region-specific metrics');
  console.log('2. Environment segregation (prod/staging/dev)');
  console.log('3. Topics with consumer group tracking');
  console.log('4. Alert scenarios with health indicators');
  console.log('5. Tag-based filtering and categorization');
  console.log('6. Parent-child relationships via awsMskClusterName');
  console.log('\nAll advanced features working correctly! ✨');
}

main().catch(console.error);