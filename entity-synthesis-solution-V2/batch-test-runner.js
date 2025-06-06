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

class BatchTestRunner {
  constructor() {
    this.testQueue = [];
    this.results = [];
    this.startTime = Date.now();
  }

  async run() {
    console.log('🚀 Batch Test Runner\n');
    console.log('This will test multiple payload variations in parallel for faster discovery.\n');

    // Build test queue
    this.buildTestQueue();

    console.log(`📋 Test Queue: ${this.testQueue.length} tests prepared\n`);

    // Run tests in batches
    const batchSize = 5; // Run 5 tests in parallel
    for (let i = 0; i < this.testQueue.length; i += batchSize) {
      const batch = this.testQueue.slice(i, i + batchSize);
      console.log(`\n🔄 Running batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(this.testQueue.length/batchSize)}`);
      
      await Promise.all(batch.map(test => this.runTest(test)));
      
      // Wait between batches to avoid rate limiting
      if (i + batchSize < this.testQueue.length) {
        console.log('⏳ Waiting 10 seconds before next batch...');
        await this.sleep(10000);
      }
    }

    // Analyze results
    this.analyzeResults();
  }

  buildTestQueue() {
    const baseTimestamp = Date.now();
    const clusterName = `batch-test-${Date.now()}`;

    // Test 1: Variations of provider field
    ['AwsMsk', 'AwsMskBroker', 'AWS/Kafka', 'aws-msk'].forEach(provider => {
      this.testQueue.push({
        name: `Provider: ${provider}`,
        category: 'provider',
        payload: this.createPayload({
          provider,
          clusterName,
          timestamp: baseTimestamp
        })
      });
    });

    // Test 2: Variations of collector name
    ['cloudwatch-metric-streams', 'cloudwatch', 'infrastructure', 'nri-kafka'].forEach(collector => {
      this.testQueue.push({
        name: `Collector: ${collector}`,
        category: 'collector',
        payload: this.createPayload({
          'collector.name': collector,
          clusterName,
          timestamp: baseTimestamp
        })
      });
    });

    // Test 3: Event type variations
    ['Metric', 'AwsMskBrokerSample', 'Sample', null].forEach(eventType => {
      this.testQueue.push({
        name: `EventType: ${eventType || 'none'}`,
        category: 'eventType',
        payload: this.createPayload({
          eventType,
          clusterName,
          timestamp: baseTimestamp
        })
      });
    });

    // Test 4: Critical field combinations
    const criticalTests = [
      { name: 'With Entity GUID', fields: { 'entity.guid': this.generateGUID() } },
      { name: 'With Provider External ID', fields: { providerExternalId: ACCOUNT_ID } },
      { name: 'With Both IDs', fields: { providerAccountId: ACCOUNT_ID, providerExternalId: ACCOUNT_ID } },
      { name: 'With AWS Dimensions', fields: { 'aws.Dimensions': [{"Name": "ClusterName", "Value": clusterName}] } },
      { name: 'With Instrumentation Provider', fields: { 'instrumentation.provider': 'cloudwatch' } }
    ];

    criticalTests.forEach(test => {
      this.testQueue.push({
        name: test.name,
        category: 'critical',
        payload: this.createPayload({
          ...test.fields,
          clusterName,
          timestamp: baseTimestamp
        })
      });
    });

    // Test 5: Full combinations that should work
    this.testQueue.push({
      name: 'Working Account Pattern',
      category: 'full',
      payload: this.createFullPayload(clusterName, 'working-pattern')
    });

    this.testQueue.push({
      name: 'CloudWatch Exact Match',
      category: 'full',
      payload: this.createCloudWatchPayload(clusterName, 'cloudwatch-exact')
    });

    // Test 6: Entity type variations
    ['AWS_KAFKA_BROKER', 'AWS_KAFKA_CLUSTER', 'AWS_KAFKA_TOPIC'].forEach(entityType => {
      this.testQueue.push({
        name: `EntityType: ${entityType}`,
        category: 'entityType',
        payload: this.createPayload({
          'entity.type': entityType,
          'entity.name': `test-${entityType.toLowerCase()}`,
          clusterName,
          timestamp: baseTimestamp
        })
      });
    });
  }

  createPayload(overrides = {}) {
    const defaults = {
      'collector.name': 'cloudwatch-metric-streams',
      'aws.Namespace': 'AWS/Kafka',
      'entity.type': 'AWS_KAFKA_BROKER',
      'entity.name': 'batch-test-broker',
      'aws.accountId': ACCOUNT_ID
    };

    const attributes = { ...defaults, ...overrides };
    const timestamp = overrides.timestamp || Date.now();

    return [{
      metrics: [{
        name: 'BytesInPerSec',
        type: 'gauge',
        value: 1000 + Math.random() * 9000,
        timestamp,
        attributes
      }]
    }];
  }

  createFullPayload(clusterName, testId) {
    const timestamp = Date.now();
    return [{
      metrics: [{
        name: 'BytesInPerSec',
        type: 'gauge',
        value: 5000,
        timestamp,
        attributes: {
          // CloudWatch identifiers
          'collector.name': 'cloudwatch-metric-streams',
          'eventType': 'Metric',
          'instrumentation.provider': 'cloudwatch',
          
          // AWS namespace and metric
          'aws.Namespace': 'AWS/Kafka',
          'aws.MetricName': 'BytesInPerSec',
          
          // Entity identification
          'entity.type': 'AWS_KAFKA_BROKER',
          'entity.name': `${clusterName}:broker-${testId}`,
          'entity.guid': this.generateGUID(),
          
          // AWS account info
          'aws.accountId': ACCOUNT_ID,
          'aws.region': 'us-east-1',
          'awsAccountId': ACCOUNT_ID,
          'awsRegion': 'us-east-1',
          
          // Provider info
          'provider': 'AwsMsk',
          'providerAccountId': ACCOUNT_ID,
          'providerExternalId': ACCOUNT_ID,
          'providerAccountName': 'Batch Test Account',
          
          // MSK specific
          'aws.kafka.clusterName': clusterName,
          'aws.kafka.brokerId': '1',
          'clusterName': clusterName,
          
          // Dimensions
          'aws.Dimensions': [
            {'Name': 'ClusterName', 'Value': clusterName},
            {'Name': 'BrokerID', 'Value': '1'}
          ]
        }
      }]
    }];
  }

  createCloudWatchPayload(clusterName, testId) {
    // This mimics exactly what CloudWatch Metric Streams sends
    const timestamp = Date.now();
    return [{
      metrics: [{
        name: 'aws.kafka.BytesInPerSec',
        type: 'gauge',
        value: 7500,
        timestamp,
        attributes: {
          'collector.name': 'cloudwatch-metric-streams',
          'eventType': 'Metric',
          'instrumentation.provider': 'cloudwatch',
          'newrelic.source': 'cloudwatch',
          'aws.Namespace': 'AWS/Kafka',
          'aws.MetricName': 'BytesInPerSec',
          'aws.accountId': ACCOUNT_ID,
          'aws.region': 'us-east-1',
          'aws.MetricDatapoints': 1,
          'aws.kafka.ClusterName': clusterName,
          'aws.kafka.BrokerID': '1',
          'aws.Dimensions': [
            {'Name': 'ClusterName', 'Value': clusterName},
            {'Name': 'BrokerID', 'Value': '1'}
          ]
        }
      }]
    }];
  }

  async runTest(test) {
    const startTime = Date.now();
    console.log(`  ▶️  ${test.name}`);

    try {
      // Send metric
      const response = await this.sendMetric(test.payload);
      const success = response.status === 202;
      
      this.results.push({
        name: test.name,
        category: test.category,
        sent: success,
        statusCode: response.status,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });

      console.log(`  ${success ? '✅' : '❌'} ${test.name} (${response.status})`);
    } catch (error) {
      this.results.push({
        name: test.name,
        category: test.category,
        sent: false,
        error: error.message,
        duration: Date.now() - startTime
      });
      console.log(`  ❌ ${test.name} - Error: ${error.message}`);
    }
  }

  analyzeResults() {
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 BATCH TEST ANALYSIS');
    console.log('='.repeat(80) + '\n');

    // Group results by category
    const byCategory = {};
    this.results.forEach(result => {
      if (!byCategory[result.category]) {
        byCategory[result.category] = [];
      }
      byCategory[result.category].push(result);
    });

    // Analyze each category
    Object.entries(byCategory).forEach(([category, results]) => {
      const successful = results.filter(r => r.sent).length;
      const total = results.length;
      
      console.log(`\n${category.toUpperCase()} Tests: ${successful}/${total} successful`);
      results.forEach(r => {
        console.log(`  ${r.sent ? '✅' : '❌'} ${r.name}`);
      });
    });

    // Overall stats
    const totalTests = this.results.length;
    const successfulTests = this.results.filter(r => r.sent).length;
    const totalDuration = Date.now() - this.startTime;

    console.log('\n📈 Overall Statistics:');
    console.log(`  Total Tests: ${totalTests}`);
    console.log(`  Successful: ${successfulTests} (${(successfulTests/totalTests*100).toFixed(1)}%)`);
    console.log(`  Total Duration: ${(totalDuration/1000).toFixed(1)}s`);
    console.log(`  Average per test: ${(totalDuration/totalTests).toFixed(0)}ms`);

    // Save results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `entity-synthesis-solution-V2/results/batch-test-${timestamp}.json`;
    
    if (!fs.existsSync('entity-synthesis-solution-V2/results')) {
      fs.mkdirSync('entity-synthesis-solution-V2/results', { recursive: true });
    }
    
    fs.writeFileSync(filename, JSON.stringify({
      summary: {
        totalTests,
        successfulTests,
        successRate: (successfulTests/totalTests*100).toFixed(1),
        duration: totalDuration,
        timestamp: new Date().toISOString()
      },
      byCategory,
      results: this.results
    }, null, 2));
    
    console.log(`\n📁 Results saved to: ${filename}`);

    console.log('\n🔍 Next Steps:');
    console.log('1. Wait 5-10 minutes for metrics to process');
    console.log('2. Run: node ui-visibility-validator.js');
    console.log('3. Check which test patterns resulted in UI visibility');
  }

  generateGUID() {
    const hash = Math.random().toString(36).substring(2, 15);
    return Buffer.from(`${ACCOUNT_ID}|INFRA|NA|${hash}`).toString('base64');
  }

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

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run batch tests
const runner = new BatchTestRunner();
runner.run().catch(console.error);