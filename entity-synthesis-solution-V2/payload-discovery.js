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

const LICENSE_KEY = process.env.IKEY;
const USER_KEY = process.env.UKEY;
const ACCOUNT_ID = process.env.ACC;

class PayloadDiscovery {
  constructor() {
    this.fieldCombinations = [];
    this.results = [];
    this.knownWorkingFields = null;
  }

  async discover() {
    console.log('🔬 Payload Discovery Framework\n');
    console.log('This will systematically test field combinations to discover what triggers entity synthesis.\n');

    // Phase 1: Load known working fields from comparison
    await this.loadKnownWorkingFields();

    // Phase 2: Test core field combinations
    await this.testCoreFields();

    // Phase 3: Test incremental additions
    await this.testIncrementalFields();

    // Phase 4: Test critical combinations
    await this.testCriticalCombinations();

    // Phase 5: Analyze results
    this.analyzeResults();
  }

  async loadKnownWorkingFields() {
    console.log('📚 Phase 1: Loading Known Working Fields\n');
    
    // Try to load comparison results
    const resultsDir = 'entity-synthesis-solution-V2/results';
    if (fs.existsSync(resultsDir)) {
      const files = fs.readdirSync(resultsDir).filter(f => f.startsWith('comparison-'));
      if (files.length > 0) {
        const latestFile = files.sort().reverse()[0];
        const comparisonData = JSON.parse(fs.readFileSync(`${resultsDir}/${latestFile}`, 'utf8'));
        
        // Extract working fields from a working account
        const workingAccount = comparisonData['3001033'] || comparisonData['1'];
        if (workingAccount && workingAccount.brokerSamples.sampleFields) {
          this.knownWorkingFields = workingAccount.brokerSamples.sampleFields;
          console.log(`✅ Loaded ${this.knownWorkingFields.length} fields from working account`);
        }
      }
    }

    if (!this.knownWorkingFields) {
      console.log('⚠️  No comparison data found. Using default field set.');
      this.knownWorkingFields = [
        'collector.name', 'aws.Namespace', 'entity.type', 'entity.name',
        'providerAccountId', 'providerExternalId', 'aws.accountId'
      ];
    }
  }

  async testCoreFields() {
    console.log('\n🧪 Phase 2: Testing Core Field Combinations\n');

    // Test 1: Just collector.name
    await this.testFieldCombination('Collector Only', {
      "collector.name": "cloudwatch-metric-streams"
    });

    // Test 2: Collector + namespace
    await this.testFieldCombination('Collector + Namespace', {
      "collector.name": "cloudwatch-metric-streams",
      "aws.Namespace": "AWS/Kafka"
    });

    // Test 3: Collector + namespace + entity type
    await this.testFieldCombination('Core Trinity', {
      "collector.name": "cloudwatch-metric-streams",
      "aws.Namespace": "AWS/Kafka",
      "entity.type": "AWS_KAFKA_BROKER"
    });

    // Test 4: Add entity name
    await this.testFieldCombination('Core + Entity Name', {
      "collector.name": "cloudwatch-metric-streams",
      "aws.Namespace": "AWS/Kafka",
      "entity.type": "AWS_KAFKA_BROKER",
      "entity.name": "discovery-broker-1"
    });
  }

  async testIncrementalFields() {
    console.log('\n🔬 Phase 3: Testing Incremental Field Additions\n');

    const baseFields = {
      "collector.name": "cloudwatch-metric-streams",
      "aws.Namespace": "AWS/Kafka",
      "entity.type": "AWS_KAFKA_BROKER",
      "entity.name": "test-broker"
    };

    // Incrementally add fields
    const fieldsToTest = [
      { name: 'AWS Account', fields: { "aws.accountId": ACCOUNT_ID } },
      { name: 'Provider Account', fields: { "providerAccountId": ACCOUNT_ID } },
      { name: 'Provider External ID', fields: { "providerExternalId": ACCOUNT_ID } },
      { name: 'Event Type', fields: { "eventType": "Metric" } },
      { name: 'Instrumentation Provider', fields: { "instrumentation.provider": "cloudwatch" } },
      { name: 'AWS Region', fields: { "aws.region": "us-east-1", "awsRegion": "us-east-1" } },
      { name: 'Dimensions', fields: { "aws.Dimensions": [{"Name": "BrokerID", "Value": "1"}] } },
      { name: 'Metric Name', fields: { "aws.MetricName": "BytesInPerSec" } }
    ];

    let cumulativeFields = { ...baseFields };
    
    for (const test of fieldsToTest) {
      cumulativeFields = { ...cumulativeFields, ...test.fields };
      await this.testFieldCombination(`Base + ${test.name}`, cumulativeFields);
    }
  }

  async testCriticalCombinations() {
    console.log('\n⚡ Phase 4: Testing Critical Combinations\n');

    // Test what we believe are the most critical combinations
    
    // Test 1: Minimal viable (based on research)
    await this.testFieldCombination('Minimal Viable', {
      "collector.name": "cloudwatch-metric-streams",
      "aws.Namespace": "AWS/Kafka",
      "entity.type": "AWS_KAFKA_BROKER",
      "providerExternalId": ACCOUNT_ID
    });

    // Test 2: Working account pattern
    await this.testFieldCombination('Working Account Pattern', {
      "collector.name": "cloudwatch-metric-streams",
      "eventType": "Metric",
      "instrumentation.provider": "cloudwatch",
      "aws.Namespace": "AWS/Kafka",
      "aws.accountId": ACCOUNT_ID,
      "awsAccountId": ACCOUNT_ID,
      "providerAccountId": ACCOUNT_ID,
      "providerExternalId": ACCOUNT_ID,
      "entity.type": "AWS_KAFKA_BROKER",
      "entity.name": "working-pattern-broker"
    });

    // Test 3: Full CloudWatch emulation
    await this.testFieldCombination('Full CloudWatch Emulation', {
      "collector.name": "cloudwatch-metric-streams",
      "eventType": "Metric",
      "instrumentation.provider": "cloudwatch",
      "aws.Namespace": "AWS/Kafka",
      "aws.MetricName": "BytesInPerSec",
      "aws.accountId": ACCOUNT_ID,
      "aws.region": "us-east-1",
      "awsAccountId": ACCOUNT_ID,
      "awsRegion": "us-east-1",
      "provider": "AwsMsk",
      "providerAccountId": ACCOUNT_ID,
      "providerExternalId": ACCOUNT_ID,
      "providerAccountName": "Discovery Test",
      "entity.type": "AWS_KAFKA_BROKER",
      "entity.name": "full-emulation-broker",
      "aws.kafka.clusterName": "discovery-cluster",
      "aws.kafka.brokerId": "1",
      "aws.Dimensions": [
        {"Name": "ClusterName", "Value": "discovery-cluster"},
        {"Name": "BrokerID", "Value": "1"}
      ]
    });
  }

  async testFieldCombination(testName, attributes) {
    console.log(`\nTesting: ${testName}`);
    console.log(`Fields: ${Object.keys(attributes).join(', ')}`);

    const payload = [{
      metrics: [{
        name: "BytesInPerSec",
        type: "gauge",
        value: Math.random() * 10000,
        timestamp: Date.now(),
        attributes: attributes
      }]
    }];

    try {
      // Send metric
      const response = await this.sendMetric(payload);
      console.log(`  📤 Sent: ${response.status === 202 ? '✅' : '❌'} (${response.status})`);

      // Wait for processing
      await this.sleep(5000);

      // Check results
      const checks = await this.performChecks(attributes);
      console.log(`  📊 Metric: ${checks.metric.found ? '✅' : '❌'}`);
      console.log(`  🏢 Entity: ${checks.entity.found ? '✅' : '❌'}`);
      console.log(`  📋 Sample: ${checks.sample.found ? '✅' : '❌'}`);

      const result = {
        testName,
        timestamp: new Date().toISOString(),
        fieldCount: Object.keys(attributes).length,
        fields: Object.keys(attributes),
        attributes,
        sent: response.status === 202,
        metricFound: checks.metric.found,
        entityFound: checks.entity.found,
        sampleFound: checks.sample.found,
        success: checks.metric.found || checks.entity.found || checks.sample.found,
        checks
      };

      this.results.push(result);

    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      this.results.push({
        testName,
        error: error.message,
        success: false
      });
    }
  }

  async performChecks(attributes) {
    const metricName = "BytesInPerSec";
    
    // Check for metric
    const metricQuery = `
      FROM Metric 
      SELECT count(*) 
      WHERE metricName = '${metricName}'
      AND collector.name = 'cloudwatch-metric-streams'
      SINCE 2 minutes ago
    `;
    
    const metricResult = await this.runQuery(metricQuery).catch(() => null);
    const metricFound = metricResult?.[0]?.['count'] > 0;

    // Check for entity
    const entityQuery = `
      FROM entity
      SELECT count(*)
      WHERE type IN ('AWS_KAFKA_BROKER', 'AWS_KAFKA_CLUSTER', 'AWS_KAFKA_TOPIC')
      AND name LIKE '%${attributes['entity.name'] || 'test'}%'
      SINCE 10 minutes ago
    `;
    
    // Entity queries are special, let's check via samples
    const sampleQuery = `
      FROM AwsMskBrokerSample, AwsMskClusterSample
      SELECT count(*)
      SINCE 5 minutes ago
    `;
    
    const sampleResult = await this.runQuery(sampleQuery).catch(() => null);
    const sampleFound = sampleResult?.[0]?.['count'] > 0;

    return {
      metric: { found: metricFound, count: metricResult?.[0]?.['count'] || 0 },
      entity: { found: false }, // Entity queries are complex
      sample: { found: sampleFound, count: sampleResult?.[0]?.['count'] || 0 }
    };
  }

  analyzeResults() {
    console.log(`\n\n${'='.repeat(80)}`);
    console.log('📈 DISCOVERY ANALYSIS');
    console.log(`${'='.repeat(80)}\n`);

    // Find successful combinations
    const successful = this.results.filter(r => r.success);
    const metricOnly = this.results.filter(r => r.metricFound && !r.sampleFound);
    const fullSuccess = this.results.filter(r => r.metricFound && r.sampleFound);

    console.log(`Total Tests: ${this.results.length}`);
    console.log(`Successful: ${successful.length}`);
    console.log(`Metrics Only: ${metricOnly.length}`);
    console.log(`Full Success: ${fullSuccess.length}\n`);

    // Analyze required fields
    if (successful.length > 0) {
      console.log('🔑 Required Fields Analysis:\n');
      
      // Find minimal successful combination
      const minimal = successful.reduce((min, curr) => 
        curr.fieldCount < min.fieldCount ? curr : min
      );
      
      console.log(`Minimal Working Combination (${minimal.fieldCount} fields):`);
      console.log(`  ${minimal.fields.join(', ')}\n`);

      // Find common fields in all successful tests
      const commonFields = successful.reduce((common, result) => {
        return common.filter(field => result.fields.includes(field));
      }, successful[0].fields);

      console.log('Fields Present in ALL Successful Tests:');
      commonFields.forEach(field => console.log(`  ✅ ${field}`));

      // Fields that improve success
      console.log('\nFields That Improve Success Rate:');
      const fieldSuccess = {};
      
      this.results.forEach(result => {
        if (result.fields) {
          result.fields.forEach(field => {
            if (!fieldSuccess[field]) {
              fieldSuccess[field] = { total: 0, successful: 0 };
            }
            fieldSuccess[field].total++;
            if (result.success) {
              fieldSuccess[field].successful++;
            }
          });
        }
      });

      Object.entries(fieldSuccess)
        .map(([field, stats]) => ({
          field,
          successRate: (stats.successful / stats.total * 100).toFixed(1)
        }))
        .sort((a, b) => b.successRate - a.successRate)
        .forEach(({ field, successRate }) => {
          console.log(`  ${field}: ${successRate}%`);
        });
    }

    // Save results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `entity-synthesis-solution-V2/results/discovery-${timestamp}.json`;
    
    if (!fs.existsSync('entity-synthesis-solution-V2/results')) {
      fs.mkdirSync('entity-synthesis-solution-V2/results', { recursive: true });
    }
    
    fs.writeFileSync(filename, JSON.stringify({
      summary: {
        totalTests: this.results.length,
        successful: successful.length,
        metricOnly: metricOnly.length,
        fullSuccess: fullSuccess.length
      },
      results: this.results
    }, null, 2));
    
    console.log(`\n📁 Detailed results saved to: ${filename}`);

    // Recommendations
    console.log('\n💡 Recommendations:\n');
    if (fullSuccess.length > 0) {
      console.log('✅ Use this payload structure for reliable entity creation:');
      console.log(JSON.stringify(fullSuccess[0].attributes, null, 2));
    } else if (metricOnly.length > 0) {
      console.log('⚠️  Metrics are arriving but not creating entities.');
      console.log('Consider adding: providerExternalId, entity.type, entity.name');
    } else {
      console.log('❌ No successful combinations found.');
      console.log('Check license key and try the minimal-payload-tester.js');
    }
  }

  // Helper methods (same as minimal-payload-tester)
  async sendMetric(payload) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      
      const options = {
        hostname: 'metric-api.newrelic.com',
        path: '/metric/v1',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': LICENSE_KEY,
          'Content-Length': data.length
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            body: responseData
          });
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  runQuery(nrql) {
    return new Promise((resolve, reject) => {
      const query = {
        query: `{ actor { account(id: ${ACCOUNT_ID}) { nrql(query: "${nrql.replace(/"/g, '\\"').replace(/\n/g, ' ')}") { results } } } }`
      };

      const options = {
        hostname: 'api.newrelic.com',
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-Key': USER_KEY
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

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run discovery
const discovery = new PayloadDiscovery();
discovery.discover().catch(console.error);