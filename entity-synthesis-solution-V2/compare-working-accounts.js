#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

// Load environment variables
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
}

const API_KEY = process.env.UKEY;
const MY_ACCOUNT = process.env.ACC;
const WORKING_ACCOUNTS = ['3001033', '1', '3026020'];

class AccountComparer {
  constructor() {
    this.results = {};
  }

  async compareAll() {
    console.log('🔍 Comparing Working MSK Accounts with Our Implementation\n');
    console.log(`Our Account: ${MY_ACCOUNT}`);
    console.log(`Working Accounts: ${WORKING_ACCOUNTS.join(', ')}\n`);

    // First, check what's in our account
    console.log('📊 Checking Our Account First...\n');
    await this.analyzeAccount(MY_ACCOUNT, 'Our Implementation');

    // Then check working accounts
    for (const accountId of WORKING_ACCOUNTS) {
      await this.analyzeAccount(accountId, `Working Account ${accountId}`);
    }

    // Compare results
    this.compareResults();
  }

  async analyzeAccount(accountId, label) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Analyzing: ${label} (${accountId})`);
    console.log('='.repeat(60) + '\n');

    const results = {
      accountId,
      label,
      brokerSamples: {},
      clusterSamples: {},
      topicSamples: {},
      metrics: {},
      entities: {},
      criticalFields: {}
    };

    // 1. Check AwsMskBrokerSample
    console.log('1️⃣ Checking AwsMskBrokerSample...');
    const brokerQuery = `
      FROM AwsMskBrokerSample 
      SELECT 
        uniques(provider) as providers,
        uniques(eventType) as eventTypes,
        uniques(entityGuid) as entityGuids,
        uniques(entity.type) as entityTypes,
        uniques(collector.name) as collectors,
        uniques(instrumentation.provider) as instrumentationProviders,
        count(*) as totalEvents,
        latest(timestamp) as lastSeen
      WHERE providerAccountId IS NOT NULL
      SINCE 1 hour ago
    `;
    
    try {
      const brokerResults = await this.runQuery(brokerQuery, accountId);
      results.brokerSamples = brokerResults[0] || {};
      console.log(`   ✅ Found ${results.brokerSamples.totalEvents || 0} broker events`);
      
      // Get sample broker event for field analysis
      if (results.brokerSamples.totalEvents > 0) {
        const sampleQuery = `FROM AwsMskBrokerSample SELECT * SINCE 1 hour ago LIMIT 1`;
        const sampleEvent = await this.runQuery(sampleQuery, accountId);
        if (sampleEvent[0]) {
          results.brokerSamples.sampleFields = Object.keys(sampleEvent[0]).sort();
          console.log(`   📋 Found ${results.brokerSamples.sampleFields.length} fields in broker events`);
        }
      }
    } catch (err) {
      console.log(`   ❌ No broker samples found`);
    }

    // 2. Check CloudWatch Metrics
    console.log('\n2️⃣ Checking CloudWatch Metrics...');
    const metricsQuery = `
      FROM Metric 
      SELECT 
        count(*) as total,
        uniques(aws.Namespace) as namespaces,
        uniques(collector.name) as collectors,
        uniques(entity.type) as entityTypes,
        filter(count(*), WHERE aws.Namespace = 'AWS/Kafka') as kafkaMetrics
      WHERE collector.name = 'cloudwatch-metric-streams'
      SINCE 1 hour ago
    `;
    
    try {
      const metricsResults = await this.runQuery(metricsQuery, accountId);
      results.metrics = metricsResults[0] || {};
      console.log(`   ✅ Found ${results.metrics.kafkaMetrics || 0} Kafka CloudWatch metrics`);
      
      // Get sample metric for AWS/Kafka
      if (results.metrics.kafkaMetrics > 0) {
        const sampleMetricQuery = `
          FROM Metric 
          SELECT * 
          WHERE collector.name = 'cloudwatch-metric-streams' 
          AND aws.Namespace = 'AWS/Kafka' 
          SINCE 1 hour ago 
          LIMIT 1
        `;
        const sampleMetric = await this.runQuery(sampleMetricQuery, accountId);
        if (sampleMetric[0]) {
          results.metrics.sampleFields = Object.keys(sampleMetric[0]).sort();
          console.log(`   📋 Found ${results.metrics.sampleFields.length} fields in CloudWatch metrics`);
        }
      }
    } catch (err) {
      console.log(`   ❌ No CloudWatch metrics found`);
    }

    // 3. Check Entities
    console.log('\n3️⃣ Checking AWS Kafka Entities...');
    const entityQuery = `
      SELECT 
        count(*) as total,
        uniques(type) as types,
        uniques(domain) as domains,
        filter(count(*), WHERE type = 'AWS_KAFKA_BROKER') as brokers,
        filter(count(*), WHERE type = 'AWS_KAFKA_CLUSTER') as clusters,
        filter(count(*), WHERE type = 'AWS_KAFKA_TOPIC') as topics
      FROM (
        FROM NrdbQuery SELECT * WHERE query = 'entity'
      )
      WHERE type IN ('AWS_KAFKA_BROKER', 'AWS_KAFKA_CLUSTER', 'AWS_KAFKA_TOPIC')
      SINCE 1 day ago
    `;
    
    // Note: Entity queries are tricky, let's use a different approach
    const entitySearchQuery = `
      FROM AwsMskBrokerSample 
      SELECT 
        uniques(entityGuid) as brokerGuids,
        uniques(entity.name) as brokerNames,
        uniques(entity.type) as brokerTypes
      SINCE 1 hour ago
    `;
    
    try {
      const entityResults = await this.runQuery(entitySearchQuery, accountId);
      results.entities = entityResults[0] || {};
      console.log(`   ✅ Found ${(results.entities.brokerGuids || []).length} broker entities`);
    } catch (err) {
      console.log(`   ❌ No entities found`);
    }

    // 4. Critical Field Analysis
    console.log('\n4️⃣ Analyzing Critical Fields...');
    const criticalFieldsQuery = `
      FROM AwsMskBrokerSample 
      SELECT 
        percentage(count(*), WHERE provider IS NOT NULL) as hasProvider,
        percentage(count(*), WHERE providerAccountId IS NOT NULL) as hasProviderAccountId,
        percentage(count(*), WHERE providerExternalId IS NOT NULL) as hasProviderExternalId,
        percentage(count(*), WHERE entity.type IS NOT NULL) as hasEntityType,
        percentage(count(*), WHERE entityGuid IS NOT NULL) as hasEntityGuid,
        percentage(count(*), WHERE awsAccountId IS NOT NULL) as hasAwsAccountId,
        percentage(count(*), WHERE collector.name IS NOT NULL) as hasCollectorName,
        uniques(provider) as providerValues,
        uniques(entity.type) as entityTypeValues,
        uniques(collector.name) as collectorValues
      SINCE 1 hour ago
    `;
    
    try {
      const criticalResults = await this.runQuery(criticalFieldsQuery, accountId);
      results.criticalFields = criticalResults[0] || {};
      console.log('   ✅ Critical field analysis complete');
    } catch (err) {
      console.log('   ❌ Could not analyze critical fields');
    }

    this.results[accountId] = results;
    return results;
  }

  compareResults() {
    console.log(`\n\n${'='.repeat(80)}`);
    console.log('📊 COMPARISON RESULTS');
    console.log('='.repeat(80) + '\n');

    // Compare our account with working accounts
    const ourAccount = this.results[MY_ACCOUNT];
    const workingAccount = this.results[WORKING_ACCOUNTS[0]]; // Use first working account as reference

    if (!ourAccount || !workingAccount) {
      console.log('❌ Could not compare - missing data');
      return;
    }

    console.log('🔍 Key Differences:\n');

    // 1. Provider field comparison
    console.log('1️⃣ Provider Field:');
    console.log(`   Our Account: ${JSON.stringify(ourAccount.criticalFields.providerValues || [])}`);
    console.log(`   Working Account: ${JSON.stringify(workingAccount.criticalFields.providerValues || [])}`);
    if (JSON.stringify(ourAccount.criticalFields.providerValues) !== JSON.stringify(workingAccount.criticalFields.providerValues)) {
      console.log('   ⚠️  DIFFERENCE DETECTED!');
    }

    // 2. Entity Type comparison
    console.log('\n2️⃣ Entity Type Field:');
    console.log(`   Our Account: ${JSON.stringify(ourAccount.criticalFields.entityTypeValues || [])}`);
    console.log(`   Working Account: ${JSON.stringify(workingAccount.criticalFields.entityTypeValues || [])}`);
    if (JSON.stringify(ourAccount.criticalFields.entityTypeValues) !== JSON.stringify(workingAccount.criticalFields.entityTypeValues)) {
      console.log('   ⚠️  DIFFERENCE DETECTED!');
    }

    // 3. Collector Name comparison
    console.log('\n3️⃣ Collector Name:');
    console.log(`   Our Account: ${JSON.stringify(ourAccount.criticalFields.collectorValues || [])}`);
    console.log(`   Working Account: ${JSON.stringify(workingAccount.criticalFields.collectorValues || [])}`);

    // 4. CloudWatch Metrics comparison
    console.log('\n4️⃣ CloudWatch Metrics:');
    console.log(`   Our Account: ${ourAccount.metrics.kafkaMetrics || 0} Kafka metrics`);
    console.log(`   Working Account: ${workingAccount.metrics.kafkaMetrics || 0} Kafka metrics`);

    // 5. Field count comparison
    if (ourAccount.brokerSamples.sampleFields && workingAccount.brokerSamples.sampleFields) {
      console.log('\n5️⃣ Field Differences in AwsMskBrokerSample:');
      const ourFields = new Set(ourAccount.brokerSamples.sampleFields);
      const workingFields = new Set(workingAccount.brokerSamples.sampleFields);
      
      const missingFields = [...workingFields].filter(f => !ourFields.has(f));
      const extraFields = [...ourFields].filter(f => !workingFields.has(f));
      
      if (missingFields.length > 0) {
        console.log(`   ❌ Missing fields: ${missingFields.join(', ')}`);
      }
      if (extraFields.length > 0) {
        console.log(`   ➕ Extra fields: ${extraFields.join(', ')}`);
      }
      if (missingFields.length === 0 && extraFields.length === 0) {
        console.log(`   ✅ Field sets match!`);
      }
    }

    // 6. Critical field presence
    console.log('\n6️⃣ Critical Field Presence:');
    const criticalFieldChecks = [
      'hasProvider', 'hasProviderAccountId', 'hasProviderExternalId', 
      'hasEntityType', 'hasEntityGuid', 'hasAwsAccountId'
    ];
    
    for (const field of criticalFieldChecks) {
      const ourValue = ourAccount.criticalFields[field] || 0;
      const workingValue = workingAccount.criticalFields[field] || 0;
      const status = ourValue >= 90 ? '✅' : '❌';
      console.log(`   ${status} ${field}: Our=${ourValue.toFixed(1)}%, Working=${workingValue.toFixed(1)}%`);
    }

    // Save detailed results
    this.saveResults();
  }

  saveResults() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `entity-synthesis-solution-V2/results/comparison-${timestamp}.json`;
    
    // Create results directory if it doesn't exist
    if (!fs.existsSync('entity-synthesis-solution-V2/results')) {
      fs.mkdirSync('entity-synthesis-solution-V2/results', { recursive: true });
    }
    
    fs.writeFileSync(filename, JSON.stringify(this.results, null, 2));
    console.log(`\n📁 Detailed results saved to: ${filename}`);
  }

  runQuery(nrql, accountId = MY_ACCOUNT) {
    return new Promise((resolve, reject) => {
      const query = {
        query: `{ actor { account(id: ${accountId}) { nrql(query: "${nrql.replace(/"/g, '\\"').replace(/\n/g, ' ')}") { results } } } }`
      };

      const options = {
        hostname: 'api.newrelic.com',
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-Key': API_KEY
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.data?.actor?.account?.nrql?.results) {
              resolve(response.data.actor.account.nrql.results);
            } else {
              console.error('Query error:', response.errors);
              reject(new Error('Query failed'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(query));
      req.end();
    });
  }
}

// Run the comparison
const comparer = new AccountComparer();
comparer.compareAll().catch(console.error);