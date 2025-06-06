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

class MinimalPayloadTester {
  constructor() {
    this.testResults = [];
    this.successfulPayloads = [];
  }

  async runAllTests() {
    console.log('🚀 Starting Minimal Payload Testing\n');
    console.log(`Account ID: ${ACCOUNT_ID}`);
    console.log(`License Key: ${LICENSE_KEY ? LICENSE_KEY.substring(0, 4) + '...' : 'NOT SET'}\n`);

    if (!LICENSE_KEY) {
      console.error('❌ ERROR: IKEY (License Key) not set!');
      return;
    }

    // Test 1: Absolute minimal CloudWatch metric
    await this.test('Minimal CloudWatch Metric', this.minimalCloudWatchMetric());

    // Test 2: Minimal with entity type
    await this.test('CloudWatch + Entity Type', this.cloudWatchWithEntityType());

    // Test 3: Full CloudWatch broker metric
    await this.test('Full CloudWatch Broker', this.fullCloudWatchBroker());

    // Test 4: CloudWatch with all critical fields
    await this.test('CloudWatch + All Critical Fields', this.cloudWatchAllFields());

    // Test 5: Multiple metrics in one payload
    await this.test('Multiple Metrics Bundle', this.multipleMetricsBundle());

    // Summary
    this.printSummary();
  }

  async test(testName, payload) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Test: ${testName}`);
    console.log(`${'='.repeat(60)}`);

    const startTime = Date.now();
    
    try {
      // Send the metric
      console.log('📤 Sending payload...');
      const response = await this.sendMetric(payload);
      console.log(`✅ Metric API Response: ${response.status}`);

      // Wait a bit for processing
      console.log('⏳ Waiting 10 seconds for processing...');
      await this.sleep(10000);

      // Check if metric arrived
      const metricCheck = await this.checkMetric(payload[0].metrics[0].name);
      console.log(`📊 Metric in NRDB: ${metricCheck.found ? '✅ Found' : '❌ Not Found'}`);

      // Check for entity creation
      const entityCheck = await this.checkEntity();
      console.log(`🏢 Entity Created: ${entityCheck.found ? '✅ Found' : '❌ Not Found'}`);

      // Check sample events
      const sampleCheck = await this.checkSampleEvents();
      console.log(`📋 Sample Events: ${sampleCheck.found ? '✅ Found' : '❌ Not Found'}`);

      const result = {
        testName,
        success: metricCheck.found,
        entityCreated: entityCheck.found,
        sampleEvents: sampleCheck.found,
        duration: Date.now() - startTime,
        details: {
          metric: metricCheck,
          entity: entityCheck,
          samples: sampleCheck
        }
      };

      this.testResults.push(result);

      if (metricCheck.found || entityCheck.found || sampleCheck.found) {
        this.successfulPayloads.push({ testName, payload });
      }

    } catch (error) {
      console.error(`❌ Test failed: ${error.message}`);
      this.testResults.push({
        testName,
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      });
    }
  }

  // Test Payload Generators
  
  minimalCloudWatchMetric() {
    return [{
      metrics: [{
        name: "BytesInPerSec",
        type: "gauge",
        value: 1000.0,
        timestamp: Date.now(),
        attributes: {
          "collector.name": "cloudwatch-metric-streams",
          "aws.Namespace": "AWS/Kafka"
        }
      }]
    }];
  }

  cloudWatchWithEntityType() {
    return [{
      metrics: [{
        name: "BytesInPerSec",
        type: "gauge",
        value: 2000.0,
        timestamp: Date.now(),
        attributes: {
          "collector.name": "cloudwatch-metric-streams",
          "aws.Namespace": "AWS/Kafka",
          "entity.type": "AWS_KAFKA_BROKER",
          "entity.name": "test-broker-1"
        }
      }]
    }];
  }

  fullCloudWatchBroker() {
    const timestamp = Date.now();
    return [{
      metrics: [{
        name: "BytesInPerSec",
        type: "gauge",
        value: 3000.0,
        timestamp: timestamp,
        attributes: {
          // CloudWatch identifiers
          "collector.name": "cloudwatch-metric-streams",
          "eventType": "Metric",
          "instrumentation.provider": "cloudwatch",
          
          // AWS namespace and metric
          "aws.Namespace": "AWS/Kafka",
          "aws.MetricName": "BytesInPerSec",
          
          // Entity identification
          "entity.type": "AWS_KAFKA_BROKER",
          "entity.name": "test-cluster:broker-1",
          
          // AWS account info
          "aws.accountId": ACCOUNT_ID,
          "aws.region": "us-east-1",
          "awsAccountId": ACCOUNT_ID,
          "awsRegion": "us-east-1",
          
          // MSK specific
          "aws.kafka.clusterName": "test-cluster",
          "aws.kafka.brokerId": "1",
          
          // Dimensions
          "aws.Dimensions": [
            {"Name": "ClusterName", "Value": "test-cluster"},
            {"Name": "BrokerID", "Value": "1"}
          ]
        }
      }]
    }];
  }

  cloudWatchAllFields() {
    const timestamp = Date.now();
    const clusterName = "test-msk-cluster";
    const brokerId = "1";
    
    return [{
      metrics: [{
        name: "BytesInPerSec",
        type: "gauge",
        value: 4000.0,
        timestamp: timestamp,
        attributes: {
          // CloudWatch identifiers
          "collector.name": "cloudwatch-metric-streams",
          "eventType": "Metric",
          "instrumentation.provider": "cloudwatch",
          
          // AWS namespace and metric
          "aws.Namespace": "AWS/Kafka",
          "aws.MetricName": "BytesInPerSec",
          
          // Entity identification
          "entity.type": "AWS_KAFKA_BROKER",
          "entity.name": `${clusterName}:broker-${brokerId}`,
          "entity.guid": this.generateEntityGUID("AWS_KAFKA_BROKER", clusterName, brokerId),
          
          // CRITICAL AWS fields
          "aws.accountId": ACCOUNT_ID,
          "aws.region": "us-east-1",
          "awsAccountId": ACCOUNT_ID,
          "awsRegion": "us-east-1",
          "provider": "AwsMsk",
          "providerAccountId": ACCOUNT_ID,
          "providerExternalId": ACCOUNT_ID, // CRITICAL!
          "providerAccountName": "Test Account",
          
          // MSK specific
          "aws.kafka.clusterName": clusterName,
          "aws.kafka.brokerId": brokerId,
          "clusterName": clusterName,
          
          // Dimensions
          "aws.Dimensions": [
            {"Name": "ClusterName", "Value": clusterName},
            {"Name": "BrokerID", "Value": brokerId}
          ],
          
          // Additional metadata
          "collector.version": "1.0.0",
          "newrelic.source": "cloudwatch",
          "aws.MetricDatapoints": 1
        }
      }]
    }];
  }

  multipleMetricsBundle() {
    const timestamp = Date.now();
    const clusterName = "test-cluster-bundle";
    const metrics = [];

    // Cluster metric
    metrics.push({
      name: "ActiveControllerCount",
      type: "gauge",
      value: 1,
      timestamp: timestamp,
      attributes: {
        "collector.name": "cloudwatch-metric-streams",
        "eventType": "Metric",
        "instrumentation.provider": "cloudwatch",
        "aws.Namespace": "AWS/Kafka",
        "aws.MetricName": "ActiveControllerCount",
        "entity.type": "AWS_KAFKA_CLUSTER",
        "entity.name": clusterName,
        "aws.accountId": ACCOUNT_ID,
        "awsAccountId": ACCOUNT_ID,
        "providerAccountId": ACCOUNT_ID,
        "providerExternalId": ACCOUNT_ID,
        "aws.kafka.clusterName": clusterName,
        "aws.Dimensions": [{"Name": "ClusterName", "Value": clusterName}]
      }
    });

    // Broker metrics
    for (let i = 1; i <= 3; i++) {
      metrics.push({
        name: "BytesInPerSec",
        type: "gauge",
        value: 1000 * i,
        timestamp: timestamp,
        attributes: {
          "collector.name": "cloudwatch-metric-streams",
          "eventType": "Metric",
          "instrumentation.provider": "cloudwatch",
          "aws.Namespace": "AWS/Kafka",
          "aws.MetricName": "BytesInPerSec",
          "entity.type": "AWS_KAFKA_BROKER",
          "entity.name": `${clusterName}:broker-${i}`,
          "aws.accountId": ACCOUNT_ID,
          "awsAccountId": ACCOUNT_ID,
          "providerAccountId": ACCOUNT_ID,
          "providerExternalId": ACCOUNT_ID,
          "aws.kafka.clusterName": clusterName,
          "aws.kafka.brokerId": i.toString(),
          "aws.Dimensions": [
            {"Name": "ClusterName", "Value": clusterName},
            {"Name": "BrokerID", "Value": i.toString()}
          ]
        }
      });
    }

    return [{ metrics }];
  }

  // Helper Methods

  generateEntityGUID(entityType, clusterName, resourceId) {
    const entityIdentifier = `${entityType}:${clusterName}:${resourceId || ''}`;
    const hash = this.hashCode(entityIdentifier);
    return Buffer.from(`${ACCOUNT_ID}|INFRA|NA|${hash}`).toString('base64');
  }

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
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

  async checkMetric(metricName) {
    const query = `
      FROM Metric 
      SELECT count(*), latest(value), latest(collector.name)
      WHERE metricName = '${metricName}'
      AND collector.name = 'cloudwatch-metric-streams'
      SINCE 5 minutes ago
    `;

    try {
      const results = await this.runQuery(query);
      const found = results[0] && results[0]['count'] > 0;
      return {
        found,
        count: results[0]?.['count'] || 0,
        latestValue: results[0]?.['latest.value'],
        collectorName: results[0]?.['latest.collector.name']
      };
    } catch (err) {
      return { found: false, error: err.message };
    }
  }

  async checkEntity() {
    const query = `
      FROM AwsMskBrokerSample, AwsMskClusterSample, AwsMskTopicSample 
      SELECT count(*), uniques(eventType), uniques(entity.type)
      SINCE 5 minutes ago
    `;

    try {
      const results = await this.runQuery(query);
      const found = results[0] && results[0]['count'] > 0;
      return {
        found,
        count: results[0]?.['count'] || 0,
        eventTypes: results[0]?.['uniques.eventType'] || [],
        entityTypes: results[0]?.['uniques.entity.type'] || []
      };
    } catch (err) {
      return { found: false, error: err.message };
    }
  }

  async checkSampleEvents() {
    const query = `
      FROM AwsMskBrokerSample 
      SELECT count(*), latest(provider), latest(entity.type), latest(providerExternalId)
      SINCE 5 minutes ago
    `;

    try {
      const results = await this.runQuery(query);
      const found = results[0] && results[0]['count'] > 0;
      return {
        found,
        count: results[0]?.['count'] || 0,
        provider: results[0]?.['latest.provider'],
        entityType: results[0]?.['latest.entity.type'],
        providerExternalId: results[0]?.['latest.providerExternalId']
      };
    } catch (err) {
      return { found: false, error: err.message };
    }
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

  printSummary() {
    console.log(`\n\n${'='.repeat(80)}`);
    console.log('📊 TEST SUMMARY');
    console.log(`${'='.repeat(80)}\n`);

    console.log('Test Results:');
    this.testResults.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${index + 1}. ${status} ${result.testName}`);
      console.log(`   - Metric Found: ${result.details?.metric?.found ? 'Yes' : 'No'}`);
      console.log(`   - Entity Created: ${result.entityCreated ? 'Yes' : 'No'}`);
      console.log(`   - Sample Events: ${result.sampleEvents ? 'Yes' : 'No'}`);
    });

    if (this.successfulPayloads.length > 0) {
      console.log('\n✅ Successful Payloads:');
      this.successfulPayloads.forEach(({ testName, payload }) => {
        console.log(`\n${testName}:`);
        console.log(JSON.stringify(payload[0].metrics[0].attributes, null, 2));
      });

      // Save successful payloads
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `entity-synthesis-solution-V2/results/successful-payloads-${timestamp}.json`;
      fs.writeFileSync(filename, JSON.stringify(this.successfulPayloads, null, 2));
      console.log(`\n📁 Successful payloads saved to: ${filename}`);
    }

    console.log('\n🔍 Next Steps:');
    console.log('1. Wait 2-5 minutes for entity synthesis');
    console.log('2. Check Message Queues UI: https://one.newrelic.com/nr1-core/apm-services/message-queues');
    console.log('3. Run ui-visibility-validator.js to verify');
  }
}

// Run the tests
const tester = new MinimalPayloadTester();
tester.runAllTests().catch(console.error);