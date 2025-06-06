#!/usr/bin/env node

/**
 * Entity Synthesis Tester - Unified testing framework for MSK entity synthesis
 * 
 * This script consolidates all testing functionality into a single tool with multiple modes.
 */

const { 
  loadEnvironment, 
  runQuery, 
  sendMetric, 
  saveResults, 
  generateEntityGUID,
  sleep,
  formatTimestamp,
  buildCommonAttributes
} = require('./lib/common');

// Load environment
const env = loadEnvironment();

class EntitySynthesisTester {
  constructor() {
    this.env = env;
    this.results = [];
  }

  async run(mode) {
    if (!this.env.LICENSE_KEY) {
      console.error('❌ ERROR: License key not found!');
      console.error('Set IKEY or NEW_RELIC_LICENSE_KEY environment variable');
      return;
    }

    console.log(`🚀 Entity Synthesis Tester - ${mode.toUpperCase()} Mode\n`);
    console.log(`Account ID: ${this.env.ACCOUNT_ID}`);
    console.log(`License Key: ${this.env.LICENSE_KEY.substring(0, 4)}...`);
    console.log('');

    switch (mode) {
      case 'send':
        await this.sendWorkingPayload();
        break;
      case 'validate':
        await this.validateUIVisibility();
        break;
      case 'compare':
        await this.compareAccounts();
        break;
      case 'discover':
        await this.discoverPayloadFormat();
        break;
      case 'test':
        await this.runComprehensiveTest();
        break;
      default:
        this.showHelp();
    }
  }

  // Send known working payload pattern
  async sendWorkingPayload() {
    console.log('📤 Sending Working Payload Pattern\n');
    
    const clusterName = `test-cluster-${Date.now()}`;
    const timestamp = Date.now();
    const metrics = [];

    // Build cluster metrics
    const clusterMetrics = ['ActiveControllerCount', 'OfflinePartitionsCount', 'GlobalPartitionCount', 'GlobalTopicCount'];
    for (const metricName of clusterMetrics) {
      metrics.push({
        name: metricName,
        type: 'gauge',
        value: Math.random() * 100,
        timestamp,
        attributes: {
          ...buildCommonAttributes(this.env.ACCOUNT_ID),
          'entity.type': 'AWS_KAFKA_CLUSTER',
          'entity.name': clusterName,
          'entity.guid': generateEntityGUID('AWS_KAFKA_CLUSTER', this.env.ACCOUNT_ID, clusterName),
          'aws.kafka.clusterName': clusterName,
          'clusterName': clusterName
        }
      });
    }

    // Build broker metrics
    for (let brokerId = 1; brokerId <= 3; brokerId++) {
      const brokerMetrics = ['BytesInPerSec', 'BytesOutPerSec', 'MessagesInPerSec', 'CpuUser', 'CpuSystem'];
      for (const metricName of brokerMetrics) {
        metrics.push({
          name: metricName,
          type: 'gauge',
          value: Math.random() * 1000,
          timestamp,
          attributes: {
            ...buildCommonAttributes(this.env.ACCOUNT_ID),
            'entity.type': 'AWS_KAFKA_BROKER',
            'entity.name': `${clusterName}:broker-${brokerId}`,
            'entity.guid': generateEntityGUID('AWS_KAFKA_BROKER', this.env.ACCOUNT_ID, clusterName, brokerId),
            'aws.kafka.clusterName': clusterName,
            'aws.kafka.brokerId': String(brokerId),
            'clusterName': clusterName,
            'brokerId': String(brokerId)
          }
        });
      }
    }

    // Send metrics
    const payload = [{ metrics }];
    console.log(`Sending ${metrics.length} metrics...`);
    
    const response = await sendMetric(payload, this.env.LICENSE_KEY);
    console.log(`✅ Response: ${response.status}`);

    // Save results
    const resultsFile = saveResults(`working-payload-${formatTimestamp()}.json`, {
      timestamp: new Date().toISOString(),
      clusterName,
      accountId: this.env.ACCOUNT_ID,
      totalMetrics: metrics.length,
      response: response.status,
      metrics
    });

    console.log(`\n📁 Results saved to: ${resultsFile}`);
    console.log(`\n🔍 Next Steps:`);
    console.log(`1. Wait 2-3 minutes for entity synthesis`);
    console.log(`2. Run validation: node entity-synthesis-tester.js validate`);
    console.log(`3. Check Message Queues UI: https://one.newrelic.com/nr1-core/apm-services/message-queues`);
  }

  // Validate UI visibility
  async validateUIVisibility() {
    console.log('🔍 Validating UI Visibility\n');

    const results = {
      timestamp: new Date().toISOString(),
      accountId: this.env.ACCOUNT_ID,
      checks: {}
    };

    // Check 1: Cluster List Query (used by Message Queues UI)
    console.log('📋 Checking Cluster List Query...');
    const clusterQuery = `FROM AwsMskClusterSample, AwsMskBrokerSample 
      SELECT uniqueCount(clusterName) as 'clusters', 
             uniqueCount(entityGuid) as 'entities',
             latest(timestamp) as 'lastSeen'
      WHERE providerAccountId = '${this.env.ACCOUNT_ID}'
      SINCE 30 minutes ago`;
    
    const clusterResults = await runQuery(clusterQuery, this.env.USER_KEY, this.env.ACCOUNT_ID);
    results.checks.clusterList = {
      success: clusterResults.length > 0 && clusterResults[0].clusters > 0,
      data: clusterResults
    };
    console.log(clusterResults.length > 0 ? '✅ Found clusters' : '❌ No clusters found');

    // Check 2: Entity Synthesis
    console.log('\n📋 Checking Entity Synthesis...');
    const entityQuery = `FROM NrdbQuery 
      SELECT uniqueCount(entityGuid) as 'count' 
      WHERE entityType IN ('AWS_KAFKA_CLUSTER', 'AWS_KAFKA_BROKER', 'AWS_KAFKA_TOPIC')
      SINCE 1 hour ago`;
    
    const entityResults = await runQuery(entityQuery, this.env.USER_KEY, this.env.ACCOUNT_ID);
    results.checks.entitySynthesis = {
      success: entityResults.length > 0 && entityResults[0].count > 0,
      data: entityResults
    };
    console.log(entityResults.length > 0 ? '✅ Entities synthesized' : '❌ No entities found');

    // Check 3: Critical Fields
    console.log('\n📋 Checking Critical Fields...');
    const fieldsQuery = `FROM Metric 
      WHERE collector.name = 'cloudwatch-metric-streams'
      SELECT uniqueCount(provider) as providers,
             uniqueCount(entity.type) as entityTypes,
             count(*) as totalMetrics
      SINCE 30 minutes ago`;
    
    const fieldsResults = await runQuery(fieldsQuery, this.env.USER_KEY, this.env.ACCOUNT_ID);
    results.checks.criticalFields = {
      success: fieldsResults.length > 0 && fieldsResults[0].totalMetrics > 0,
      data: fieldsResults
    };
    console.log(fieldsResults.length > 0 ? '✅ Metrics with critical fields' : '❌ No metrics found');

    // Save results
    const resultsFile = saveResults(`ui-validation-${formatTimestamp()}.json`, results);
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 UI VISIBILITY SUMMARY');
    console.log('='.repeat(80));
    
    const allChecks = Object.values(results.checks);
    const successCount = allChecks.filter(c => c.success).length;
    
    if (successCount === allChecks.length) {
      console.log('\n✅ All checks passed! Your entities should appear in the UI.');
    } else {
      console.log(`\n⚠️  ${successCount}/${allChecks.length} checks passed.`);
      console.log('Your entities may not appear correctly in the UI.');
    }
    
    console.log(`\n📁 Full report saved to: ${resultsFile}`);
  }

  // Compare with working accounts
  async compareAccounts() {
    console.log('🔍 Comparing with Working Accounts\n');
    
    const WORKING_ACCOUNTS = ['3001033', '1', '3026020'];
    const results = {
      timestamp: new Date().toISOString(),
      ourAccount: this.env.ACCOUNT_ID,
      comparisons: {}
    };

    // Analyze our account
    console.log(`Analyzing our account (${this.env.ACCOUNT_ID})...`);
    results.comparisons[this.env.ACCOUNT_ID] = await this.analyzeAccount(this.env.ACCOUNT_ID);

    // Analyze working accounts
    for (const accountId of WORKING_ACCOUNTS) {
      console.log(`\nAnalyzing working account ${accountId}...`);
      results.comparisons[accountId] = await this.analyzeAccount(accountId);
    }

    // Compare and find differences
    console.log('\n' + '='.repeat(80));
    console.log('📊 KEY DIFFERENCES');
    console.log('='.repeat(80));

    const ourData = results.comparisons[this.env.ACCOUNT_ID];
    const workingData = results.comparisons[WORKING_ACCOUNTS[0]];

    // Compare providers
    console.log('\n🔍 Provider Differences:');
    console.log(`Our: ${JSON.stringify(ourData.providers)}`);
    console.log(`Working: ${JSON.stringify(workingData.providers)}`);

    // Compare collectors
    console.log('\n🔍 Collector Differences:');
    console.log(`Our: ${JSON.stringify(ourData.collectors)}`);
    console.log(`Working: ${JSON.stringify(workingData.collectors)}`);

    // Save results
    const resultsFile = saveResults(`account-comparison-${formatTimestamp()}.json`, results);
    console.log(`\n📁 Full comparison saved to: ${resultsFile}`);
  }

  // Analyze a single account
  async analyzeAccount(accountId) {
    const analysis = {
      brokerSamples: 0,
      clusterSamples: 0,
      metrics: 0,
      providers: [],
      collectors: [],
      entityTypes: []
    };

    // Check AwsMskBrokerSample
    const brokerQuery = `FROM AwsMskBrokerSample SELECT count(*), uniques(provider), uniques(collector.name) SINCE 1 hour ago`;
    const brokerResults = await runQuery(brokerQuery, this.env.USER_KEY, accountId);
    if (brokerResults.length > 0) {
      analysis.brokerSamples = brokerResults[0]['count'] || 0;
      analysis.providers = brokerResults[0]['uniques.provider'] || [];
      analysis.collectors = brokerResults[0]['uniques.collector.name'] || [];
    }

    // Check Metrics
    const metricsQuery = `FROM Metric WHERE aws.Namespace = 'AWS/Kafka' SELECT count(*), uniques(entity.type) SINCE 1 hour ago`;
    const metricsResults = await runQuery(metricsQuery, this.env.USER_KEY, accountId);
    if (metricsResults.length > 0) {
      analysis.metrics = metricsResults[0]['count'] || 0;
      analysis.entityTypes = metricsResults[0]['uniques.entity.type'] || [];
    }

    return analysis;
  }

  // Discover payload format through testing
  async discoverPayloadFormat() {
    console.log('🔬 Discovering Optimal Payload Format\n');
    
    const testResults = [];
    const timestamp = Date.now();

    // Test different field combinations
    const fieldCombinations = [
      {
        name: 'Minimal CloudWatch',
        fields: {
          'collector.name': 'cloudwatch-metric-streams',
          'aws.Namespace': 'AWS/Kafka'
        }
      },
      {
        name: 'CloudWatch + Entity Type',
        fields: {
          'collector.name': 'cloudwatch-metric-streams',
          'aws.Namespace': 'AWS/Kafka',
          'entity.type': 'AWS_KAFKA_BROKER'
        }
      },
      {
        name: 'CloudWatch + Provider',
        fields: {
          'collector.name': 'cloudwatch-metric-streams',
          'aws.Namespace': 'AWS/Kafka',
          'provider': 'AwsMsk'
        }
      },
      {
        name: 'Full Critical Fields',
        fields: {
          'collector.name': 'cloudwatch-metric-streams',
          'aws.Namespace': 'AWS/Kafka',
          'entity.type': 'AWS_KAFKA_BROKER',
          'provider': 'AwsMsk',
          'providerAccountId': this.env.ACCOUNT_ID,
          'providerExternalId': this.env.ACCOUNT_ID
        }
      }
    ];

    // Test each combination
    for (const combo of fieldCombinations) {
      console.log(`\nTesting: ${combo.name}`);
      
      const metric = {
        name: 'TestMetric',
        type: 'gauge',
        value: 100,
        timestamp,
        attributes: {
          ...combo.fields,
          'testId': `discovery-${Date.now()}`
        }
      };

      const response = await sendMetric([{ metrics: [metric] }], this.env.LICENSE_KEY);
      console.log(`  Response: ${response.status}`);
      
      await sleep(5000); // Wait for processing
      
      // Check if metric arrived
      const checkQuery = `FROM Metric WHERE testId = '${metric.attributes.testId}' SELECT count(*) SINCE 5 minutes ago`;
      const results = await runQuery(checkQuery, this.env.USER_KEY, this.env.ACCOUNT_ID);
      const found = results.length > 0 && results[0]['count'] > 0;
      
      console.log(`  Found in NRDB: ${found ? '✅' : '❌'}`);
      
      testResults.push({
        name: combo.name,
        fields: combo.fields,
        responseStatus: response.status,
        foundInNRDB: found
      });
    }

    // Save results
    const resultsFile = saveResults(`payload-discovery-${formatTimestamp()}.json`, {
      timestamp: new Date().toISOString(),
      accountId: this.env.ACCOUNT_ID,
      testResults
    });

    console.log(`\n📁 Discovery results saved to: ${resultsFile}`);
  }

  // Run comprehensive test suite
  async runComprehensiveTest() {
    console.log('🧪 Running Comprehensive Test Suite\n');
    
    console.log('Step 1: Sending working payload...');
    await this.sendWorkingPayload();
    
    console.log('\nStep 2: Waiting for entity synthesis (2 minutes)...');
    await sleep(120000);
    
    console.log('\nStep 3: Validating UI visibility...');
    await this.validateUIVisibility();
    
    console.log('\nStep 4: Comparing with working accounts...');
    await this.compareAccounts();
    
    console.log('\n✅ Comprehensive test complete!');
  }

  // Show help
  showHelp() {
    console.log('Entity Synthesis Tester - Unified testing framework\n');
    console.log('Usage: node entity-synthesis-tester.js <mode>\n');
    console.log('Available modes:');
    console.log('  send      - Send a working payload pattern');
    console.log('  validate  - Validate if entities appear in UI');
    console.log('  compare   - Compare with working accounts');
    console.log('  discover  - Discover optimal payload format');
    console.log('  test      - Run comprehensive test suite');
    console.log('\nExample:');
    console.log('  node entity-synthesis-tester.js send');
  }
}

// Main execution
const mode = process.argv[2] || 'help';
const tester = new EntitySynthesisTester();
tester.run(mode).catch(console.error);